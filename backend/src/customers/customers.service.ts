import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PERMISSIONS } from '../auth/permissions';
import { D, money } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddressDto, CreateCustomerDto, UpdateCustomerDto, UpdateRankDto } from './dto/customer.dto';
import { suggestRank } from './rank-suggestions';

const listInclude = {
  customerType: { select: { id: true, name: true } },
  rank: { select: { id: true, code: true, name: true, discountPercentage: true } },
  addresses: { where: { isActive: true, isPrimary: true }, take: 1 },
} satisfies Prisma.CustomerInclude;

/** Crédito disponible = límite − deuda actual (nunca negativo). */
const withCredit = <T extends { creditEnabled: boolean; creditLimit: Prisma.Decimal; currentDebt: Prisma.Decimal }>(c: T) => ({
  ...c,
  creditAvailable: c.creditEnabled ? money(Prisma.Decimal.max(0, D(c.creditLimit).minus(c.currentDebt))) : D(0),
});

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  listTypes() {
    return this.prisma.customerType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  listRanks() {
    return this.prisma.customerRank.findMany({ where: { isActive: true }, orderBy: [{ minMonthlyPurchase: 'asc' }, { creditLimit: 'asc' }] });
  }

  async updateRank(id: string, dto: UpdateRankDto, actor: AuthUser) {
    const before = await this.prisma.customerRank.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Rango no encontrado');
    const after = await this.prisma.customerRank.update({ where: { id }, data: dto });
    const pick = (r: typeof before) => ({ discountPercentage: r.discountPercentage, creditLimit: r.creditLimit, minMonthlyPurchase: r.minMonthlyPurchase, maxDaysOverdue: r.maxDaysOverdue });
    await this.audit.log({ userId: actor.id, action: 'customer_ranks.update', entityType: 'customer_rank', entityId: id, oldData: pick(before), newData: pick(after) });
    return after;
  }

  /**
   * Clientes que ya cumplen las condiciones de un rango superior: compra neta promedio de los últimos 90 días
   * y antigüedad de su deuda. Solo sugiere; el cambio lo aprueba quien tiene permiso, con motivo (queda auditado).
   */
  async rankSuggestions() {
    const DAYS = 90;
    const ranks = await this.prisma.customerRank.findMany({ where: { isActive: true } });
    const rows = await this.prisma.$queryRaw<
      {
        id: string; code: string; name: string; rank_id: string | null; current_debt: Prisma.Decimal; credit_limit: Prisma.Decimal;
        purchases: Prisma.Decimal | null; sales: bigint; oldest_charge: Date | null;
      }[]
    >`
      SELECT c.id, c.code, c.name, c.rank_id, c.current_debt, c.credit_limit,
        (SELECT SUM(s.total_amount - s.returned_amount) FROM sales s
          WHERE s.customer_id = c.id AND s.status IN ('CONFIRMED', 'RETURNED') AND s.created_at >= now() - make_interval(days => ${DAYS}::int)) AS purchases,
        (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'CONFIRMED' AND s.created_at >= now() - make_interval(days => ${DAYS}::int)) AS sales,
        CASE WHEN c.current_debt > 0 THEN (SELECT MIN(rm.created_at) FROM receivable_movements rm
          WHERE rm.customer_id = c.id AND rm.movement_type = 'CHARGE'
            AND rm.created_at > COALESCE((SELECT MAX(z.created_at) FROM receivable_movements z WHERE z.customer_id = c.id AND z.balance_after <= 0), '-infinity'::timestamp))
        END AS oldest_charge
      FROM customers c WHERE c.status = 'ACTIVE'`;
    const now = Date.now();
    const fmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const bob = (v: Prisma.Decimal.Value) => `Bs ${fmt.format(Number(v))}`;
    return rows
      .map((r) => {
        const monthlyAverage = money(D(r.purchases ?? 0).div(DAYS / 30));
        const oldestDebtDays = r.oldest_charge ? Math.floor((now - r.oldest_charge.getTime()) / 86_400_000) : null;
        const overLimit = D(r.credit_limit).gt(0) && D(r.current_debt).gt(r.credit_limit);
        const suggested = suggestRank(ranks, { monthlyAverage, oldestDebtDays, overLimit, currentRankId: r.rank_id });
        if (!suggested) return null;
        const current = ranks.find((x) => x.id === r.rank_id) ?? null;
        return {
          customer: { id: r.id, code: r.code, name: r.name },
          currentRank: current && { id: current.id, name: current.name },
          suggestedRank: { id: suggested.id, name: suggested.name, discountPercentage: suggested.discountPercentage, creditLimit: suggested.creditLimit, minMonthlyPurchase: suggested.minMonthlyPurchase },
          monthlyAverage,
          sales: Number(r.sales),
          oldestDebtDays,
          currentCreditLimit: r.credit_limit,
          reason:
            `Compra promedio de ${bob(monthlyAverage)} por mes en los últimos ${DAYS} días (mínimo de ${suggested.name}: ${bob(suggested.minMonthlyPurchase)})` +
            (oldestDebtDays === null ? ', sin deuda' : `, deuda más antigua de ${oldestDebtDays} días (máximo ${suggested.maxDaysOverdue})`),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.monthlyAverage.comparedTo(a.monthlyAverage));
  }

  async findAll(search?: string, withDebt?: boolean) {
    const where: Prisma.CustomerWhereInput = {};
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { documentId: { contains: q } },
        { phone: { contains: q } },
      ];
    }
    if (withDebt) where.currentDebt = { gt: 0 };
    const customers = await this.prisma.customer.findMany({ where, include: listInclude, orderBy: { name: 'asc' }, take: 300 });
    return customers.map(withCredit);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        customerType: true,
        rank: true,
        addresses: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        sales: {
          select: { id: true, saleNumber: true, createdAt: true, totalAmount: true, paymentStatus: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        receivableMovements: { orderBy: { createdAt: 'desc' }, take: 30, include: { createdBy: { select: { fullName: true } } } },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    const crates = await this.prisma.crateBalance.findUnique({ where: { holderType_holderId: { holderType: 'CUSTOMER', holderId: id } } });
    return { ...withCredit(customer), cratesHeld: crates?.quantity ?? 0 };
  }

  async create(dto: CreateCustomerDto, actor: AuthUser) {
    const rank = dto.rankId ? await this.prisma.customerRank.findUnique({ where: { id: dto.rankId } }) : null;
    if (dto.rankId && !rank) throw new BadRequestException('Rango inexistente');
    if (dto.rankId && !actor.permissions.includes(PERMISSIONS.CUSTOMER_RANK_CHANGE)) {
      throw new ForbiddenException('Asignar rango requiere autorización de Administración');
    }

    const { address, ...data } = dto;
    const customer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          ...data,
          code: await this.sequences.next(tx, 'customer', 5),
          creditLimit: dto.creditLimit ?? rank?.creditLimit ?? 0,
          createdById: actor.id,
          addresses: address
            ? { create: { ...address, isPrimary: true, source: 'ADMIN', capturedById: actor.id } }
            : undefined,
        },
      });
      await this.audit.log({ userId: actor.id, action: 'customers.create', entityType: 'customer', entityId: created.id, newData: data }, tx);
      return created;
    });
    return this.findOne(customer.id);
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuthUser) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Cliente no encontrado');

    const { rankChangeReason, ...data } = dto;
    const rankChanged = dto.rankId !== undefined && dto.rankId !== before.rankId;
    const creditChanged =
      (dto.creditLimit !== undefined && !D(dto.creditLimit).eq(before.creditLimit)) ||
      (dto.creditEnabled !== undefined && dto.creditEnabled !== before.creditEnabled);

    if ((rankChanged || creditChanged) && !actor.permissions.includes(PERMISSIONS.CUSTOMER_RANK_CHANGE)) {
      throw new ForbiddenException('Cambiar rango o crédito requiere autorización de Administración');
    }
    if (rankChanged && !rankChangeReason?.trim()) throw new BadRequestException('Indique el motivo del cambio de rango');

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data });
      await this.audit.log(
        {
          userId: actor.id,
          action: rankChanged ? 'customer.rank_change' : 'customers.update',
          entityType: 'customer',
          entityId: id,
          oldData: { rankId: before.rankId, creditLimit: before.creditLimit, creditEnabled: before.creditEnabled, status: before.status },
          newData: data,
          reason: rankChangeReason,
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  async addAddress(customerId: string, dto: AddressDto, actor: AuthUser, source = 'ADMIN') {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.$transaction(async (tx) => {
      const hasPrimary = await tx.customerAddress.count({ where: { customerId, isPrimary: true, isActive: true } });
      const isPrimary = dto.isPrimary ?? hasPrimary === 0;
      if (isPrimary) await tx.customerAddress.updateMany({ where: { customerId }, data: { isPrimary: false } });
      return tx.customerAddress.create({ data: { ...dto, customerId, isPrimary, source, capturedById: actor.id } });
    });
  }
}

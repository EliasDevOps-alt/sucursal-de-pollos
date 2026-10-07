import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerStatus,
  InventoryMovementType,
  PresaleStatus,
  PaymentStatus,
  Prisma,
  ReceivableMovementType,
  SaleMode,
  SaleStatus,
  WarehouseType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth-user';
import { PERMISSIONS } from '../auth/permissions';
import { D, kg, money, perKg, ZERO } from '../common/decimal';
import { ReceivablesService } from '../common/receivables.service';
import { SequenceService } from '../common/sequence.service';
import { InventoryService } from '../inventory/inventory.service';
import { availableLots } from '../inventory/lot-stock';
import { returnInclude } from './returns.service';
import { PrismaService } from '../prisma/prisma.service';
import { Allocation, AllocationError, allocateFefo, allocateManual, AvailableLot } from './allocation';
import { CreateSaleDto, SaleFiltersDto } from './dto/sale.dto';

type Db = Prisma.TransactionClient;

const TX_OPTIONS = { timeout: 20_000 };

export interface DeliveryContext {
  routeNumber: string;
  /** Excepción de crédito autorizada al planificar la ruta (el chofer no puede pedirla en la calle). */
  creditApprover?: { id: string; fullName: string; reason: string } | null;
}

export type IssueType = 'LOT_OVERRIDE' | 'PRICE_CHANGE' | 'CREDIT_LIMIT';

/** Excepción de negocio que se permite solo con autorización y motivo. */
export interface Issue {
  type: IssueType;
  lineIndex?: number;
  message: string;
  permission: string;
  reason?: string;
  /** Quién la autoriza (el propio vendedor si tiene el permiso, o el supervisor). */
  approver?: { id: string; fullName: string };
  needsReason: boolean;
}

interface PricedAllocation extends Allocation {
  suggestedPrice: Prisma.Decimal;
  price: Prisma.Decimal;
}

interface BuiltLine {
  productId: string;
  productName: string;
  weightKg: Prisma.Decimal;
  quantity: Prisma.Decimal;
  allocations: PricedAllocation[];
  originalUnitPrice: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  gross: Prisma.Decimal;
  discount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  cost: Prisma.Decimal;
  priceChangeReason?: string;
}


@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly receivables: ReceivablesService,
  ) {}

  // ── Consulta ────────────────────────────────────────────

  async findAll(f: SaleFiltersDto) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = new Date(f.from);
    if (f.to) createdAt.lte = new Date(f.to);
    return this.prisma.sale.findMany({
      where: {
        customerId: f.customerId,
        status: f.status,
        paymentStatus: f.paymentStatus,
        createdAt: f.from || f.to ? createdAt : undefined,
      },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        seller: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true, documentId: true, phone: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
        seller: { select: { id: true, fullName: true } },
        annulledBy: { select: { fullName: true } },
        creditAuthorizedBy: { select: { fullName: true } },
        payments: { include: { receivedBy: { select: { fullName: true } } } },
        returns: { include: returnInclude, orderBy: { createdAt: 'asc' } },
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            priceAuthorizedBy: { select: { fullName: true } },
            allocations: {
              include: { lot: { select: { id: true, lotCode: true, expiryDate: true } }, authorizedBy: { select: { fullName: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    // Rentabilidad con el costo real congelado en cada asignación de lote, neta de devoluciones:
    // lo devuelto deja de ser ingreso; su costo solo se recupera si volvió al stock (lo descartado es pérdida).
    const items = sale.items.map((item) => {
      const cost = money(item.allocations.reduce((s, a) => s.plus(D(a.weightKg).minus(a.restockedWeightKg).times(a.costPerKg)), ZERO));
      const margin = money(D(item.subtotal).minus(item.returnedAmount).minus(cost));
      return { ...item, cost, margin };
    });
    const revenue = money(D(sale.totalAmount).minus(sale.returnedAmount));
    const cost = money(items.reduce((s, i) => s.plus(i.cost), ZERO));
    const margin = money(revenue.minus(cost));
    const marginPercentage = revenue.gt(0) ? margin.div(revenue).times(100).toDecimalPlaces(2) : ZERO;
    return { ...sale, items, profitability: { revenue, cost, margin, marginPercentage } };
  }

  // ── Cotización y registro ───────────────────────────────

  /** Calcula la venta sin guardarla: lotes FEFO, precios, descuentos, crédito y autorizaciones necesarias. */
  async quote(dto: CreateSaleDto, actor: AuthUser) {
    const built = await this.build(this.prisma, dto, actor, false);
    const supervisor = await this.resolveSupervisor(dto, false);
    const issues = this.resolveIssues(built.issues, actor, supervisor, built.saleMode, built.branchPriceEdit);
    return { ...this.presentBuilt(built), issues, canConfirm: issues.every((i) => i.approver && !i.needsReason) };
  }

  async create(dto: CreateSaleDto, actor: AuthUser) {
    const supervisor = await this.resolveSupervisor(dto, true);
    const saleId = await this.prisma.$transaction((tx) => this.createInTx(tx, dto, actor, supervisor), TX_OPTIONS);
    return this.findOne(saleId);
  }

  /**
   * Registra la venta dentro de una transacción existente. Devuelve el id.
   * Con `delivery` es una entrega en ruta: la preventa está asignada a la ruta, el cobro lo recibe el chofer
   * y un exceso de crédito no bloquea (la mercadería ya se entregó): usa la autorización dada al planificar
   * o, si no la hay, queda marcado para revisión.
   */
  async createInTx(tx: Prisma.TransactionClient, dto: CreateSaleDto, actor: AuthUser, supervisor: AuthUser | null, delivery?: DeliveryContext): Promise<string> {
    // Con bloqueo de filas: el stock y la deuda leídos aquí no cambian hasta terminar la transacción.
    const built = await this.build(tx, dto, actor, true, !!delivery);
    const issues = this.resolveIssues(built.issues, actor, supervisor, built.saleMode, built.branchPriceEdit);
    let creditOverLimit: Issue | undefined;
    if (delivery) {
      const credit = issues.find((i) => i.type === 'CREDIT_LIMIT' && !i.approver);
      if (credit && delivery.creditApprover) {
        credit.approver = { id: delivery.creditApprover.id, fullName: delivery.creditApprover.fullName };
        credit.reason = delivery.creditApprover.reason;
        credit.needsReason = false;
      } else if (credit) {
        creditOverLimit = credit;
        issues.splice(issues.indexOf(credit), 1);
      }
    }
    const blocked = issues.find((i) => !i.approver);
    if (blocked) throw new ForbiddenException(`${blocked.message}: requiere autorización (${blocked.permission})`);
    const noReason = issues.find((i) => i.needsReason);
    if (noReason) throw new BadRequestException(`${noReason.message}: indique el motivo`);

    const lotIssue = issues.find((i) => i.type === 'LOT_OVERRIDE');
    const creditIssue = issues.find((i) => i.type === 'CREDIT_LIMIT');
    const priceIssue = (idx: number) => issues.find((i) => i.type === 'PRICE_CHANGE' && i.lineIndex === idx);

    // Atender una preventa: se bloquea y debe seguir pendiente y ser del mismo cliente.
    if (dto.presaleId) {
      const [presale] = await tx.$queryRaw<{ status: PresaleStatus; customer_id: string; presale_number: string }[]>`
        SELECT status, customer_id, presale_number FROM presales WHERE id = ${dto.presaleId}::uuid FOR UPDATE`;
      if (!presale) throw new BadRequestException('Preventa inexistente');
      const attendable: PresaleStatus[] = delivery ? [PresaleStatus.ASSIGNED] : [PresaleStatus.PENDING, PresaleStatus.CONFIRMED];
      if (!attendable.includes(presale.status)) {
        throw new ConflictException(`La preventa ${presale.presale_number} ya fue atendida o cancelada`);
      }
      if (presale.customer_id !== built.customer?.id) throw new BadRequestException('La venta debe ser para el cliente de la preventa');
    }

    const saleNumber = await this.sequences.next(tx, 'sale');
    const sale = await tx.sale.create({
      data: {
        saleNumber,
        customerId: built.customer?.id,
        warehouseId: built.warehouse.id,
        branchId: built.warehouse.branchId,
        sellerId: actor.id,
        saleMode: dto.presaleId ? SaleMode.PRESALE : built.saleMode,
        subtotal: built.subtotal,
        discountAmount: built.discount,
        totalAmount: built.total,
        paymentStatus: built.paymentStatus,
        paidAmount: built.paid,
        creditAmount: built.credit,
        creditAuthorizedById: creditIssue?.approver?.id,
        creditExceptionReason: creditIssue?.reason ?? (creditOverLimit ? `Entregado en ruta ${delivery!.routeNumber} sin autorización previa: ${creditOverLimit.message}` : undefined),
        notes: dto.notes,
      },
    });

    for (const [idx, line] of built.lines.entries()) {
      const pIssue = priceIssue(idx);
      const item = await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: line.productId,
          requestedWeightKg: line.weightKg,
          requestedQuantity: line.quantity,
          originalUnitPrice: line.originalUnitPrice,
          unitPrice: line.unitPrice,
          discountAmount: line.discount,
          subtotal: line.subtotal,
          priceChangeReason: pIssue?.reason,
          priceAuthorizedById: pIssue?.approver?.id,
        },
      });
      for (const a of line.allocations) {
        await tx.saleLotAllocation.create({
          data: {
            saleItemId: item.id,
            lotId: a.lot.lotId,
            weightKg: a.weightKg,
            costPerKg: a.lot.costPerKg,
            salePricePerKg: a.price,
            forcedLot: a.forced,
            authorizedById: a.forced ? lotIssue?.approver?.id : undefined,
            forceReason: a.forced ? lotIssue?.reason : undefined,
          },
        });
        await this.inventory.registerMovement(tx, {
          warehouseId: built.warehouse.id,
          productId: line.productId,
          lotId: a.lot.lotId,
          movementType: InventoryMovementType.SALE,
          weightKg: a.weightKg.negated(),
          unitCostPerKg: a.lot.costPerKg,
          referenceType: 'sale',
          referenceId: sale.id,
          createdById: actor.id,
        });
      }
    }

    if (built.paid.gt(0)) {
      await tx.payment.create({
        data: {
          customerId: built.customer?.id,
          saleId: sale.id,
          amount: built.paid,
          paymentMethod: dto.paymentMethod!,
          paymentSource: delivery ? 'DRIVER' : built.saleMode === SaleMode.BRANCH ? 'BRANCH' : 'CENTRAL',
          receivedById: actor.id,
        },
      });
    }
    if (built.credit.gt(0)) {
      await this.receivable(tx, built.customer!.id, ReceivableMovementType.CHARGE, built.credit, sale.id, actor.id);
    }
    if (built.overpaid.gt(0) && built.customer) {
      const receiptNumber = await this.sequences.next(tx, 'collection');
      const advance = await tx.payment.create({
        data: {
          customerId: built.customer.id,
          amount: built.overpaid,
          paymentMethod: dto.paymentMethod!,
          paymentSource: 'DRIVER',
          receivedById: actor.id,
          receiptNumber,
          isAdvance: true,
          notes: `Excedente cobrado al entregar la venta ${saleNumber}`,
        },
      });
      await this.receivables.apply(tx, {
        customerId: built.customer.id,
        type: ReceivableMovementType.PAYMENT,
        amount: built.overpaid.negated(),
        referenceType: 'collection',
        referenceId: advance.id,
        actorId: actor.id,
        reason: `Excedente cobrado al entregar ${saleNumber}`,
      });
    }

    if (dto.presaleId) {
      await tx.presale.update({ where: { id: dto.presaleId }, data: { status: PresaleStatus.DELIVERED, saleId: sale.id } });
    }

    await this.audit.log(
      { userId: actor.id, action: 'sales.create', entityType: 'sale', entityId: sale.id, newData: { saleNumber, total: built.total, paymentStatus: built.paymentStatus, presaleId: dto.presaleId } },
      tx,
    );
    if (creditOverLimit) {
      await this.audit.log(
        {
          userId: actor.id,
          action: 'credit.exceeded_on_delivery',
          entityType: 'sale',
          entityId: sale.id,
          newData: { message: creditOverLimit.message, route: delivery!.routeNumber },
          reason: 'La mercadería ya fue entregada; requiere revisión de Administración',
        },
        tx,
      );
    }
    for (const issue of issues) {
      await this.audit.log(
        {
          userId: issue.approver!.id,
          action: { LOT_OVERRIDE: 'lot.override', PRICE_CHANGE: 'price.modify', CREDIT_LIMIT: 'credit.exception_authorize' }[issue.type],
          entityType: 'sale',
          entityId: sale.id,
          newData: { message: issue.message, seller: actor.username },
          reason: issue.reason,
        },
        tx,
      );
    }
    return sale.id;
  }

  /** Anula la venta: devuelve el stock a los mismos lotes y revierte la deuda. No borra nada. */
  async annul(id: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: SaleStatus }[]>`SELECT status FROM sales WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked) throw new NotFoundException('Venta no encontrada');
      if (locked.status !== SaleStatus.CONFIRMED) throw new ConflictException('Solo se pueden anular ventas confirmadas');

      const sale = await tx.sale.findUniqueOrThrow({ where: { id }, include: { items: { include: { allocations: true } } } });
      if (D(sale.returnedAmount).gt(0)) {
        throw new ConflictException('La venta tiene devoluciones registradas: no se puede anular (registre una devolución por el resto)');
      }
      for (const item of sale.items) {
        for (const a of item.allocations) {
          await this.inventory.registerMovement(tx, {
            warehouseId: sale.warehouseId,
            productId: item.productId,
            lotId: a.lotId,
            movementType: InventoryMovementType.SALE_ANNUL,
            weightKg: D(a.weightKg),
            unitCostPerKg: D(a.costPerKg),
            referenceType: 'sale',
            referenceId: sale.id,
            reason,
            createdById: actor.id,
          });
        }
      }
      if (sale.customerId && D(sale.creditAmount).gt(0)) {
        await this.receivable(tx, sale.customerId, ReceivableMovementType.ANNUL, D(sale.creditAmount).negated(), sale.id, actor.id, reason);
      }
      await tx.sale.update({
        where: { id },
        data: { status: SaleStatus.ANNULLED, annulledAt: new Date(), annulledById: actor.id, annulReason: reason },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'sales.annul',
          entityType: 'sale',
          entityId: id,
          oldData: { status: SaleStatus.CONFIRMED },
          // El dinero cobrado se devuelve en caja; el módulo de caja queda fuera de la demo.
          newData: { status: SaleStatus.ANNULLED, paidAmountToRefund: sale.paidAmount },
          reason,
        },
        tx,
      );
    }, TX_OPTIONS);
    return this.findOne(id);
  }

  /** Lotes vendibles de un producto (para elegir lote a mano), con su precio vigente. */
  async availableLotsFor(warehouseId: string, productId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Almacén no encontrado');
    const lots = await availableLots(this.prisma, warehouseId, productId, false);
    const prices = await this.lotPrices(this.prisma, lots.map((l) => l.lotId), warehouse.branchId);
    return lots.map((l, i) => ({ ...l, pricePerKg: prices.get(l.lotId) ?? null, fefoOrder: i + 1 }));
  }

  // ── Internos ────────────────────────────────────────────

  private async build(db: Db, dto: CreateSaleDto, actor: AuthUser, lock: boolean, capPaid = false) {
    const warehouse = await db.warehouse.findFirst({ where: { id: dto.warehouseId, isActive: true }, include: { branch: true } });
    if (!warehouse) throw new BadRequestException('Almacén inexistente o inactivo');
    if (actor.branchId && warehouse.branchId !== actor.branchId) {
      throw new ForbiddenException('Solo puede vender desde el almacén de su sucursal');
    }
    const saleMode = warehouse.type === WarehouseType.CENTRAL ? SaleMode.CENTRAL : SaleMode.BRANCH;

    let customer: Prisma.CustomerGetPayload<{ include: { rank: true } }> | null = null;
    if (dto.customerId) {
      if (lock) await db.$queryRaw`SELECT id FROM customers WHERE id = ${dto.customerId}::uuid FOR UPDATE`;
      customer = await db.customer.findUnique({ where: { id: dto.customerId }, include: { rank: true } });
      if (!customer) throw new BadRequestException('Cliente inexistente');
      if (customer.status !== CustomerStatus.ACTIVE) throw new BadRequestException('El cliente está inactivo');
    }
    const discountPct = D(customer?.rank?.discountPercentage ?? 0);

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = new Map((await db.product.findMany({ where: { id: { in: productIds }, isActive: true } })).map((p) => [p.id, p]));

    const issues: Omit<Issue, 'approver' | 'needsReason'>[] = [];
    const lines: BuiltLine[] = [];
    // Si el mismo producto aparece en dos líneas, la segunda ve el stock que dejó la primera.
    const consumed = new Map<string, Prisma.Decimal>();

    for (const [idx, line] of dto.items.entries()) {
      const product = products.get(line.productId);
      if (!product) throw new BadRequestException(`Línea ${idx + 1}: producto inexistente o inactivo`);

      const lots = (await availableLots(db, warehouse.id, product.id, lock)).map((l) => ({
        ...l,
        availableKg: kg(l.availableKg.minus(consumed.get(l.lotId) ?? ZERO)),
      }));

      let allocations: Allocation[];
      try {
        allocations = line.lots?.length ? allocateManual(lots, line.weightKg, line.lots) : allocateFefo(lots, line.weightKg);
      } catch (e) {
        if (e instanceof AllocationError) throw new BadRequestException(`${product.name}: ${e.message}`);
        throw e;
      }
      for (const a of allocations) consumed.set(a.lot.lotId, (consumed.get(a.lot.lotId) ?? ZERO).plus(a.weightKg));

      const prices = await this.lotPrices(db, allocations.map((a) => a.lot.lotId), warehouse.branchId);
      const override = line.unitPrice !== undefined ? perKg(D(line.unitPrice)) : undefined;
      const priced: PricedAllocation[] = allocations.map((a) => {
        const suggested = prices.get(a.lot.lotId);
        if (!suggested) throw new BadRequestException(`El lote ${a.lot.lotCode} no tiene precio configurado`);
        return { ...a, suggestedPrice: suggested, price: override ?? suggested };
      });

      const weight = kg(D(line.weightKg));
      const originalGross = priced.reduce((s, a) => s.plus(a.weightKg.times(a.suggestedPrice)), ZERO);
      const gross = money(priced.reduce((s, a) => s.plus(a.weightKg.times(a.price)), ZERO));
      const discount = money(gross.times(discountPct).div(100));
      const originalUnitPrice = perKg(originalGross.div(weight));
      const unitPrice = perKg(gross.div(weight));

      if (override && !override.eq(originalUnitPrice)) {
        issues.push({
          type: 'PRICE_CHANGE',
          lineIndex: idx,
          permission: PERMISSIONS.PRICE_MODIFY,
          message: `${product.name}: precio modificado de ${originalUnitPrice.toFixed(2)} a ${override.toFixed(2)} Bs/kg`,
          reason: line.priceChangeReason?.trim() || undefined,
        });
      }
      if (priced.some((a) => a.forced)) {
        const codes = priced.filter((a) => a.forced).map((a) => a.lot.lotCode).join(', ');
        issues.push({
          type: 'LOT_OVERRIDE',
          lineIndex: idx,
          permission: PERMISSIONS.LOT_OVERRIDE,
          message: `${product.name}: se usa ${codes} antes que un lote que vence primero`,
          reason: dto.forceReason?.trim() || undefined,
        });
      }

      lines.push({
        productId: product.id,
        productName: product.name,
        weightKg: weight,
        quantity: D(line.quantity ?? 0),
        allocations: priced,
        originalUnitPrice,
        unitPrice,
        gross,
        discount,
        subtotal: money(gross.minus(discount)),
        cost: money(priced.reduce((s, a) => s.plus(a.weightKg.times(a.lot.costPerKg)), ZERO)),
        priceChangeReason: line.priceChangeReason,
      });
    }

    // Un solo motivo de forzado para toda la venta: se unifican las incidencias de lote.
    const lotIssues = issues.filter((i) => i.type === 'LOT_OVERRIDE');
    if (lotIssues.length > 1) {
      issues.splice(0, issues.length, ...issues.filter((i) => i.type !== 'LOT_OVERRIDE'), {
        ...lotIssues[0],
        lineIndex: undefined,
        message: lotIssues.map((i) => i.message).join('; '),
      });
    }

    const subtotal = money(lines.reduce((s, l) => s.plus(l.gross), ZERO));
    const discount = money(lines.reduce((s, l) => s.plus(l.discount), ZERO));
    const total = money(subtotal.minus(discount));

    // Si no se indica el pago, se asume contado.
    let paid = money(D(dto.paidAmount ?? total));
    // En una entrega el chofer cobra con un total estimado sin conexión: lo que exceda el total real
    // no se rechaza (el dinero ya se recibió) y queda como saldo a favor del cliente.
    let overpaid = ZERO;
    if (capPaid && paid.gt(total)) {
      overpaid = money(paid.minus(total));
      paid = total;
    }
    if (paid.gt(total)) throw new BadRequestException('El monto pagado no puede superar el total (el cambio se entrega en caja)');
    if (paid.gt(0) && !dto.paymentMethod) throw new BadRequestException('Indique el método de pago');
    const credit = money(total.minus(paid));

    if (credit.gt(0)) {
      if (!customer) throw new BadRequestException('Una venta rápida (sin cliente) debe pagarse completa');
      if (!customer.creditEnabled) throw new BadRequestException(`El cliente ${customer.name} no tiene crédito habilitado`);
      const available = D(customer.creditLimit).minus(customer.currentDebt);
      if (credit.gt(available)) {
        issues.push({
          type: 'CREDIT_LIMIT',
          permission: PERMISSIONS.CREDIT_EXCEPTION_AUTHORIZE,
          message: `Crédito de ${credit.toFixed(2)} Bs supera el disponible de ${Prisma.Decimal.max(0, available).toFixed(2)} Bs`,
          reason: dto.creditExceptionReason?.trim() || undefined,
        });
      }
    }

    const paymentStatus = credit.eq(0) ? PaymentStatus.PAID : paid.eq(0) ? PaymentStatus.CREDIT : PaymentStatus.PARTIAL;

    return {
      warehouse,
      saleMode,
      branchPriceEdit: warehouse.branch?.priceEditEnabled ?? false,
      customer,
      discountPct,
      lines,
      subtotal,
      discount,
      total,
      paid,
      overpaid,
      credit,
      paymentStatus,
      issues,
    };
  }

  /** Precio vigente por lote: el de la sucursal si existe, si no el central. */
  private async lotPrices(db: Db, lotIds: string[], branchId: string | null) {
    const prices = await db.lotPrice.findMany({
      where: { lotId: { in: lotIds }, isActive: true, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] },
    });
    const result = new Map<string, Prisma.Decimal>();
    for (const p of prices) {
      if (p.branchId || !result.has(p.lotId)) result.set(p.lotId, D(p.pricePerKg));
    }
    return result;
  }

  private async resolveSupervisor(dto: CreateSaleDto, strict: boolean) {
    if (!dto.authorization) return null;
    const user = await this.auth.verifyCredentials(dto.authorization.username, dto.authorization.password);
    if (!user && strict) throw new ForbiddenException('Credenciales de autorización incorrectas');
    return user;
  }

  /**
   * Asigna quién autoriza cada excepción: el propio vendedor si tiene el permiso
   * (para precio en sucursal, además debe estar habilitada la edición en esa sucursal), o el supervisor.
   */
  private resolveIssues(
    raw: Omit<Issue, 'approver' | 'needsReason'>[],
    actor: AuthUser,
    supervisor: AuthUser | null,
    saleMode: SaleMode,
    branchPriceEdit: boolean,
  ): Issue[] {
    return raw.map((issue) => {
      const actorCan =
        actor.permissions.includes(issue.permission) &&
        (issue.type !== 'PRICE_CHANGE' || saleMode !== SaleMode.BRANCH || branchPriceEdit);
      const approver = actorCan ? actor : supervisor?.permissions.includes(issue.permission) ? supervisor : null;
      return {
        ...issue,
        approver: approver ? { id: approver.id, fullName: approver.fullName } : undefined,
        needsReason: !issue.reason,
      };
    });
  }

  private receivable(
    tx: Db,
    customerId: string,
    type: ReceivableMovementType,
    amount: Prisma.Decimal,
    saleId: string,
    actorId: string,
    reason?: string,
  ) {
    return this.receivables.apply(tx, { customerId, type, amount, referenceType: 'sale', referenceId: saleId, actorId, reason });
  }

  private presentBuilt(b: Awaited<ReturnType<SalesService['build']>>) {
    return {
      warehouse: { id: b.warehouse.id, name: b.warehouse.name },
      saleMode: b.saleMode,
      customer: b.customer && {
        id: b.customer.id,
        name: b.customer.name,
        rank: b.customer.rank?.name ?? null,
        creditEnabled: b.customer.creditEnabled,
        creditAvailable: money(Prisma.Decimal.max(0, D(b.customer.creditLimit).minus(b.customer.currentDebt))),
      },
      discountPercentage: b.discountPct,
      lines: b.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        weightKg: l.weightKg,
        originalUnitPrice: l.originalUnitPrice,
        unitPrice: l.unitPrice,
        gross: l.gross,
        discount: l.discount,
        subtotal: l.subtotal,
        cost: l.cost,
        allocations: l.allocations.map((a) => ({
          lotId: a.lot.lotId,
          lotCode: a.lot.lotCode,
          expiryDate: a.lot.expiryDate,
          weightKg: a.weightKg,
          costPerKg: a.lot.costPerKg,
          price: a.price,
          forced: a.forced,
        })),
      })),
      subtotal: b.subtotal,
      discount: b.discount,
      total: b.total,
      cost: money(b.lines.reduce((s, l) => s.plus(l.cost), ZERO)),
      paid: b.paid,
      credit: b.credit,
      paymentStatus: b.paymentStatus,
    };
  }
}

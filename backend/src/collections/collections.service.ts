import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, PaymentRecordStatus, Prisma, ReceivableMovementType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, money } from '../common/decimal';
import { ReceivablesService } from '../common/receivables.service';
import { SequenceService } from '../common/sequence.service';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionFiltersDto, CreateCollectionDto } from './dto/collection.dto';

const include = {
  customer: { select: { id: true, code: true, name: true, currentDebt: true } },
  receivedBy: { select: { id: true, fullName: true } },
  annulledBy: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude;

/** Cobros de deuda: pagos sin venta asociada que reducen el saldo del cliente. */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly receivables: ReceivablesService,
    private readonly audit: AuditService,
  ) {}

  findAll(f: CollectionFiltersDto) {
    const paymentDate: Prisma.DateTimeFilter = {};
    if (f.from) paymentDate.gte = new Date(f.from);
    if (f.to) paymentDate.lte = new Date(f.to);
    return this.prisma.payment.findMany({
      where: { saleId: null, customerId: f.customerId, paymentDate: f.from || f.to ? paymentDate : undefined },
      include,
      orderBy: { paymentDate: 'desc' },
      take: 300,
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, saleId: null }, include });
    if (!p) throw new NotFoundException('Cobro no encontrado');
    return p;
  }

  async create(dto: CreateCollectionDto, actor: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      // Bloqueo del cliente: dos cobros simultáneos no pueden leer la misma deuda.
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE id = ${dto.customerId}::uuid FOR UPDATE`;
      if (!row) throw new NotFoundException('Cliente no encontrado');
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });
      if (customer.status !== CustomerStatus.ACTIVE) throw new BadRequestException('El cliente está inactivo');

      const amount = money(D(dto.amount));
      const debt = D(customer.currentDebt);
      const isAdvance = amount.gt(Prisma.Decimal.max(debt, 0));
      if (isAdvance && !dto.allowAdvance) {
        throw new BadRequestException(
          `El cobro (Bs ${amount.toFixed(2)}) supera la deuda (Bs ${Prisma.Decimal.max(debt, 0).toFixed(2)}). ` +
            'Márquelo como anticipo para dejar el excedente como saldo a favor.',
        );
      }

      const receiptNumber = await this.sequences.next(tx, 'collection');
      const payment = await tx.payment.create({
        data: {
          customerId: customer.id,
          amount,
          paymentMethod: dto.paymentMethod,
          paymentSource: actor.roleCode === 'COLLECTOR' ? 'COLLECTOR' : actor.branchId ? 'BRANCH' : 'CENTRAL',
          receivedById: actor.id,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          receiptNumber,
          isAdvance,
        },
      });
      await this.receivables.apply(tx, {
        customerId: customer.id,
        type: ReceivableMovementType.PAYMENT,
        amount: amount.negated(),
        referenceType: 'collection',
        referenceId: payment.id,
        actorId: actor.id,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'collections.create',
          entityType: 'payment',
          entityId: payment.id,
          oldData: { debt: debt.toFixed(2) },
          newData: { receiptNumber, amount: amount.toFixed(2), method: dto.paymentMethod, debt: debt.minus(amount).toFixed(2), isAdvance },
        },
        tx,
      );
      return payment.id;
    });
    return this.findOne(id);
  }

  /** Anula un cobro: la deuda vuelve a subir con un movimiento de reversión; el cobro queda registrado como anulado. */
  async annul(id: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ customer_id: string; status: PaymentRecordStatus; amount: Prisma.Decimal; sale_id: string | null; receipt_number: string }[]>`
        SELECT customer_id, status, amount, sale_id, receipt_number FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      if (!p || p.sale_id) throw new NotFoundException('Cobro no encontrado');
      if (p.status === PaymentRecordStatus.ANNULLED) throw new ConflictException('El cobro ya está anulado');
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${p.customer_id}::uuid FOR UPDATE`;

      await tx.payment.update({
        where: { id },
        data: { status: PaymentRecordStatus.ANNULLED, annulledAt: new Date(), annulledById: actor.id, annulReason: reason },
      });
      await this.receivables.apply(tx, {
        customerId: p.customer_id,
        type: ReceivableMovementType.ANNUL,
        amount: D(p.amount),
        referenceType: 'collection',
        referenceId: id,
        actorId: actor.id,
        reason,
      });
      await this.audit.log(
        { userId: actor.id, action: 'collections.annul', entityType: 'payment', entityId: id, newData: { receiptNumber: p.receipt_number }, reason },
        tx,
      );
    });
    return this.findOne(id);
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CrateHolderType, CrateMovementType, CustomerStatus, PaymentRecordStatus, Prisma, ReceivableMovementType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, money } from '../common/decimal';
import { ReceivablesService } from '../common/receivables.service';
import { SequenceService } from '../common/sequence.service';
import { CratesService } from '../crates/crates.service';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionFiltersDto, CreateCollectionDto } from './dto/collection.dto';

const include = {
  customer: { select: { id: true, code: true, name: true, currentDebt: true } },
  receivedBy: { select: { id: true, fullName: true } },
  annulledBy: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude;

export interface FieldCollection {
  id: string;
  operationId: string;
  at: Date;
  paidByName?: string;
  signature?: string;
  latitude?: number;
  longitude?: number;
  cratesPickedUp?: number;
}

/** Cobros de deuda: pagos sin venta asociada que reducen el saldo del cliente. */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly receivables: ReceivablesService,
    private readonly audit: AuditService,
    private readonly crates: CratesService,
  ) {}

  findAll(f: CollectionFiltersDto) {
    const paymentDate: Prisma.DateTimeFilter = {};
    if (f.from) paymentDate.gte = new Date(f.from);
    if (f.to) paymentDate.lte = new Date(f.to);
    return this.prisma.payment.findMany({
      where: { saleId: null, customerId: f.customerId, paymentDate: f.from || f.to ? paymentDate : undefined },
      include,
      omit: { signature: true }, // la firma viaja solo en el detalle del recibo
      orderBy: { paymentDate: 'desc' },
      take: 300,
    });
  }

  /**
   * Clientes por visitar: con deuda o con canastillos en su poder, con la ubicación de su dirección principal,
   * antigüedad de la deuda y su último cobro.
   */
  async pendingMap() {
    const rows = await this.prisma.$queryRaw<
      { id: string; code: string; name: string; phone: string | null; debt: Prisma.Decimal; credit_limit: Prisma.Decimal; crates: number | null;
        address: string | null; latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null; oldest_charge: Date | null; last_payment: Date | null }[]
    >`
      SELECT c.id, c.code, c.name, c.phone, c.current_debt AS debt, c.credit_limit,
        (SELECT cb.quantity FROM crate_balances cb WHERE cb.holder_type = 'CUSTOMER' AND cb.holder_id = c.id) AS crates,
        a.address, a.latitude, a.longitude,
        (SELECT MIN(rm.created_at) FROM receivable_movements rm
          WHERE rm.customer_id = c.id AND rm.movement_type = 'CHARGE'
            AND rm.created_at > COALESCE((SELECT MAX(z.created_at) FROM receivable_movements z WHERE z.customer_id = c.id AND z.balance_after <= 0), '-infinity'::timestamp)
        ) AS oldest_charge,
        (SELECT MAX(p.payment_date) FROM payments p WHERE p.customer_id = c.id AND p.status = 'VALID') AS last_payment
      FROM customers c
      LEFT JOIN LATERAL (SELECT * FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.is_active ORDER BY ca.is_primary DESC, ca.created_at LIMIT 1) a ON true
      WHERE c.status = 'ACTIVE'
        AND (c.current_debt > 0 OR COALESCE((SELECT cb.quantity FROM crate_balances cb WHERE cb.holder_type = 'CUSTOMER' AND cb.holder_id = c.id), 0) > 0)
      ORDER BY c.current_debt DESC`;
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      phone: r.phone,
      debt: money(D(r.debt)),
      creditLimit: D(r.credit_limit),
      crates: Number(r.crates ?? 0),
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      daysOutstanding: r.oldest_charge && D(r.debt).gt(0) ? Math.floor((now - r.oldest_charge.getTime()) / 86_400_000) : null,
      lastPayment: r.last_payment,
    }));
  }

  async findOne(id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, saleId: null }, include });
    if (!p) throw new NotFoundException('Cobro no encontrado');
    return p;
  }

  async create(dto: CreateCollectionDto, actor: AuthUser) {
    const id = await this.prisma.$transaction((tx) => this.createInTx(tx, dto, actor));
    return this.findOne(id);
  }

  /**
   * Registra el cobro dentro de una transacción existente. Con `field` es un cobro hecho en la calle por el cobrador:
   * el dinero ya se recibió, así que lo que exceda la deuda (que el teléfono pudo ver desactualizada) queda como
   * saldo a favor en lugar de rechazarse; se guardan quién pagó, la firma, el lugar y los canastillos recogidos.
   */
  async createInTx(tx: Prisma.TransactionClient, dto: CreateCollectionDto, actor: AuthUser, field?: FieldCollection): Promise<string> {
    // Bloqueo del cliente: dos cobros simultáneos no pueden leer la misma deuda.
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE id = ${dto.customerId}::uuid FOR UPDATE`;
    if (!row) throw new NotFoundException('Cliente no encontrado');
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });
    if (customer.status !== CustomerStatus.ACTIVE) throw new BadRequestException('El cliente está inactivo');

    const amount = money(D(dto.amount));
    const debt = D(customer.currentDebt);
    const isAdvance = amount.gt(Prisma.Decimal.max(debt, 0));
    if (isAdvance && !dto.allowAdvance && !field) {
      throw new BadRequestException(
        `El cobro (Bs ${amount.toFixed(2)}) supera la deuda (Bs ${Prisma.Decimal.max(debt, 0).toFixed(2)}). ` +
          'Márquelo como anticipo para dejar el excedente como saldo a favor.',
      );
    }

    const receiptNumber = await this.sequences.next(tx, 'collection');
    const payment = await tx.payment.create({
      data: {
        id: field?.id,
        paidByName: field?.paidByName,
        signature: field?.signature,
        latitude: field?.latitude,
        longitude: field?.longitude,
        collectedAtDevice: field?.at,
        deviceOperationId: field?.operationId,
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
    if (field?.cratesPickedUp) {
      await this.crates.move(tx, {
        type: CrateMovementType.PICKUP,
        quantity: field.cratesPickedUp,
        from: { type: CrateHolderType.CUSTOMER, id: customer.id },
        to: { type: CrateHolderType.USER, id: actor.id },
        referenceType: 'collection',
        referenceId: payment.id,
        actorId: actor.id,
      });
    }
    await this.audit.log(
      {
        userId: actor.id,
        action: 'collections.create',
        entityType: 'payment',
        entityId: payment.id,
        oldData: { debt: debt.toFixed(2) },
        newData: { receiptNumber, amount: amount.toFixed(2), method: dto.paymentMethod, debt: debt.minus(amount).toFixed(2), isAdvance, inField: !!field, cratesPickedUp: field?.cratesPickedUp },
      },
      tx,
    );
    return payment.id;
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

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CashAccountType, CashCategory, CashDirection, CashSessionStatus, Payment, PaymentRecordStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, money, ZERO } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { PrismaService } from '../prisma/prisma.service';
import { CashMovementDto, CashMovementFiltersDto, CloseSessionDto, CreateSettlementDto, OpenSessionDto, TransferDto } from './dto/finance.dto';

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 20_000 };

/** Pagos que el chofer o el cobrador tienen en su poder hasta rendirlos. */
const FIELD_SOURCES = ['DRIVER', 'COLLECTOR'];

export interface CashEntry {
  accountId: string;
  direction: CashDirection;
  category: CashCategory;
  amount: Prisma.Decimal;
  description: string;
  actorId: string;
  paymentMethod?: string | null;
  expenseType?: string | null;
  referenceType?: string;
  referenceId?: string;
  /** Los registros automáticos (ventas, compras, devoluciones) no se bloquean: la caja puede quedar en rojo y se ve. */
  allowNegative?: boolean;
}

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  // ── Núcleo ──────────────────────────────────────────────

  /**
   * Registra un movimiento y actualiza el saldo de la cuenta en la misma transacción (fila bloqueada).
   * Si la cuenta tiene una caja abierta, el movimiento queda dentro de esa sesión.
   */
  async record(tx: Tx, e: CashEntry) {
    const amount = money(D(e.amount));
    if (amount.lte(0)) throw new BadRequestException('El monto debe ser mayor a cero');
    const [acc] = await tx.$queryRaw<{ balance: Prisma.Decimal; name: string; is_active: boolean }[]>`
      SELECT balance, name, is_active FROM cash_accounts WHERE id = ${e.accountId}::uuid FOR UPDATE`;
    if (!acc) throw new BadRequestException('Cuenta de dinero inexistente');
    if (!acc.is_active) throw new BadRequestException(`La cuenta ${acc.name} está inactiva`);
    const balanceAfter = money(D(acc.balance).plus(e.direction === CashDirection.IN ? amount : amount.negated()));
    if (balanceAfter.isNegative() && !e.allowNegative) {
      throw new BadRequestException(`${acc.name} tiene ${fmt(D(acc.balance))}; no alcanza para ${fmt(amount)}`);
    }
    const session = await tx.cashSession.findFirst({ where: { cashAccountId: e.accountId, status: CashSessionStatus.OPEN }, select: { id: true } });
    const movement = await tx.cashMovement.create({
      data: {
        cashAccountId: e.accountId,
        sessionId: session?.id,
        direction: e.direction,
        category: e.category,
        expenseType: e.expenseType,
        amount,
        balanceAfter,
        paymentMethod: e.paymentMethod,
        description: e.description,
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        createdById: e.actorId,
      },
    });
    await tx.cashAccount.update({ where: { id: e.accountId }, data: { balance: balanceAfter } });
    return movement;
  }

  /** Cuenta que recibe un pago según su método: el efectivo va a la caja de la sucursal; QR y transferencias, al banco. */
  async accountFor(tx: Tx, method: string, branchId: string | null) {
    if (method !== 'EFECTIVO') {
      const bank = await tx.cashAccount.findFirst({ where: { type: CashAccountType.BANK, isActive: true }, orderBy: { createdAt: 'asc' } });
      if (!bank) throw new BadRequestException('No hay una cuenta bancaria activa');
      return bank;
    }
    const branch = branchId ?? (await tx.branch.findFirst({ where: { code: 'CEN' } }))?.id ?? null;
    const cash =
      (branch && (await tx.cashAccount.findFirst({ where: { type: CashAccountType.CASH, branchId: branch, isActive: true } }))) ||
      (await tx.cashAccount.findFirst({ where: { code: 'CAJA-CEN' } }));
    if (!cash) throw new BadRequestException('No hay una caja de efectivo activa');
    return cash;
  }

  /** Ingreso de un pago cobrado en mostrador u oficina. Lo cobrado por choferes y cobradores entra recién al rendirlo. */
  async recordPayment(tx: Tx, payment: Payment, branchId: string | null, actorId: string, description: string) {
    if (FIELD_SOURCES.includes(payment.paymentSource)) return null;
    const account = await this.accountFor(tx, payment.paymentMethod, branchId);
    return this.record(tx, {
      accountId: account.id,
      direction: CashDirection.IN,
      category: payment.saleId ? CashCategory.SALE : CashCategory.COLLECTION,
      amount: D(payment.amount),
      description,
      paymentMethod: payment.paymentMethod,
      referenceType: 'payment',
      referenceId: payment.id,
      actorId,
      allowNegative: true,
    });
  }

  /**
   * Devuelve el dinero de un pago anulado: revierte su ingreso en la cuenta donde entró (mostrador) o, si un chofer
   * o cobrador ya lo rindió, sale de la cuenta donde se rindió. Si aún no se rindió, no hay nada que revertir en caja.
   */
  async reversePayment(tx: Tx, payment: Payment, actorId: string, reason: string) {
    const original = await tx.cashMovement.findFirst({ where: { referenceType: 'payment', referenceId: payment.id, reversedById: null, category: { not: CashCategory.REVERSAL } } });
    if (original) return this.reverse(tx, original.id, actorId, reason);
    if (payment.settlementId) {
      const settlement = await tx.settlement.findUniqueOrThrow({ where: { id: payment.settlementId } });
      const account = payment.paymentMethod === 'EFECTIVO' ? settlement.cashAccountId : (await this.accountFor(tx, payment.paymentMethod, null)).id;
      return this.record(tx, {
        accountId: account,
        direction: CashDirection.OUT,
        category: CashCategory.REVERSAL,
        amount: D(payment.amount),
        description: `Anulación de un pago ya rendido (${settlement.settlementNumber}): ${reason}`,
        paymentMethod: payment.paymentMethod,
        referenceType: 'payment',
        referenceId: payment.id,
        actorId,
        allowNegative: true,
      });
    }
    return null;
  }

  /** Movimiento inverso de otro (no se borra nada). */
  async reverse(tx: Tx, movementId: string, actorId: string, reason: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cash_movements WHERE id = ${movementId}::uuid FOR UPDATE`;
    if (!row) throw new NotFoundException('Movimiento no encontrado');
    const m = await tx.cashMovement.findUniqueOrThrow({ where: { id: movementId } });
    if (m.reversedById) throw new ConflictException('El movimiento ya fue revertido');
    const rev = await this.record(tx, {
      accountId: m.cashAccountId,
      direction: m.direction === CashDirection.IN ? CashDirection.OUT : CashDirection.IN,
      category: CashCategory.REVERSAL,
      amount: D(m.amount),
      description: `Reversión: ${m.description} — ${reason}`,
      paymentMethod: m.paymentMethod,
      referenceType: m.referenceType ?? undefined,
      referenceId: m.referenceId ?? undefined,
      actorId,
      allowNegative: true,
    });
    await tx.cashMovement.update({ where: { id: m.id }, data: { reversedById: rev.id } });
    return rev;
  }

  // ── Consultas ───────────────────────────────────────────

  async accounts(actor: AuthUser) {
    const accounts = await this.prisma.cashAccount.findMany({
      where: { isActive: true, ...(actor.branchId ? { OR: [{ branchId: actor.branchId }, { type: CashAccountType.BANK }] } : {}) },
      include: {
        branch: { select: { id: true, name: true } },
        sessions: { where: { status: CashSessionStatus.OPEN }, include: { openedBy: { select: { fullName: true } } } },
      },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    return accounts.map(({ sessions, ...a }) => ({ ...a, openSession: sessions[0] ?? null }));
  }

  movements(f: CashMovementFiltersDto, actor: AuthUser) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = new Date(f.from);
    if (f.to) createdAt.lte = new Date(f.to);
    return this.prisma.cashMovement.findMany({
      where: {
        cashAccountId: f.accountId,
        sessionId: f.sessionId,
        category: f.category,
        direction: f.direction,
        createdAt: f.from || f.to ? createdAt : undefined,
        cashAccount: actor.branchId ? { OR: [{ branchId: actor.branchId }, { type: CashAccountType.BANK }] } : undefined,
      },
      include: { cashAccount: { select: { code: true, name: true, type: true } }, createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: f.limit ?? 300,
    });
  }

  sessions(accountId?: string) {
    return this.prisma.cashSession.findMany({
      where: { cashAccountId: accountId },
      include: { cashAccount: { select: { code: true, name: true } }, openedBy: { select: { fullName: true } }, closedBy: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }

  /** Resumen de una sesión: ingresos y egresos por categoría, esperado y contado. */
  async session(id: string) {
    const s = await this.prisma.cashSession.findUnique({
      where: { id },
      include: { cashAccount: true, openedBy: { select: { fullName: true } }, closedBy: { select: { fullName: true } } },
    });
    if (!s) throw new NotFoundException('Sesión de caja no encontrada');
    const movements = await this.prisma.cashMovement.findMany({ where: { sessionId: id }, include: { createdBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' } });
    const byCategory = new Map<string, { category: string; direction: CashDirection; amount: Prisma.Decimal; count: number }>();
    for (const m of movements) {
      const k = `${m.direction}:${m.category}`;
      const r = byCategory.get(k) ?? { category: m.category, direction: m.direction, amount: ZERO, count: 0 };
      r.amount = r.amount.plus(m.amount);
      r.count += 1;
      byCategory.set(k, r);
    }
    const sum = (d: CashDirection) => money(movements.filter((m) => m.direction === d).reduce((t, m) => t.plus(m.amount), ZERO));
    return {
      ...s,
      movements,
      byCategory: [...byCategory.values()].map((r) => ({ ...r, amount: money(r.amount) })),
      totals: { in: sum(CashDirection.IN), out: sum(CashDirection.OUT) },
    };
  }

  /** Lo que cada chofer y cobrador tiene por rendir: pagos vigentes cobrados por él y aún no entregados. */
  async pendingSettlements() {
    const payments = await this.prisma.payment.findMany({
      where: { paymentSource: { in: FIELD_SOURCES }, status: PaymentRecordStatus.VALID, settlementId: null },
      omit: { signature: true },
      include: {
        receivedBy: { select: { id: true, fullName: true, role: { select: { name: true } } } },
        customer: { select: { name: true } },
        sale: { select: { saleNumber: true } },
      },
      orderBy: { paymentDate: 'asc' },
    });
    type Row = { user: { id: string; fullName: string; role: string }; cash: Prisma.Decimal; digital: Prisma.Decimal; count: number; since: Date; payments: typeof payments };
    const byUser = new Map<string, Row>();
    for (const p of payments) {
      const r: Row = byUser.get(p.receivedById) ?? {
        user: { id: p.receivedBy.id, fullName: p.receivedBy.fullName, role: p.receivedBy.role.name },
        cash: ZERO,
        digital: ZERO,
        count: 0,
        since: p.paymentDate,
        payments: [],
      };
      if (p.paymentMethod === 'EFECTIVO') r.cash = r.cash.plus(p.amount);
      else r.digital = r.digital.plus(p.amount);
      r.count += 1;
      r.payments.push(p);
      byUser.set(p.receivedById, r);
    }
    return [...byUser.values()].map((r) => ({ ...r, cash: money(r.cash), digital: money(r.digital) }));
  }

  settlements(userId?: string) {
    return this.prisma.settlement.findMany({
      where: { userId },
      include: { user: { select: { fullName: true } }, receivedBy: { select: { fullName: true } }, cashAccount: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async settlement(id: string) {
    const s = await this.prisma.settlement.findUnique({
      where: { id },
      include: {
        user: { select: { fullName: true } },
        receivedBy: { select: { fullName: true } },
        cashAccount: { select: { name: true } },
        payments: { omit: { signature: true }, include: { customer: { select: { name: true } }, sale: { select: { saleNumber: true } } }, orderBy: { paymentDate: 'asc' } },
      },
    });
    if (!s) throw new NotFoundException('Rendición no encontrada');
    return s;
  }

  /** Tablero de dinero: saldos, cajas abiertas, por rendir, por pagar a proveedores y movimientos del período por categoría. */
  async summary(actor: AuthUser, from?: string, to?: string) {
    const accounts = await this.accounts(actor);
    const pending = await this.pendingSettlements();
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const end = to ? new Date(to) : new Date();
    const grouped = await this.prisma.cashMovement.groupBy({
      by: ['direction', 'category', 'expenseType'],
      where: { createdAt: { gte: start, lte: end }, category: { not: CashCategory.TRANSFER }, cashAccountId: { in: accounts.map((a) => a.id) } },
      _sum: { amount: true },
      _count: true,
    });
    const rows = grouped.map((g) => ({ direction: g.direction, category: g.category, expenseType: g.expenseType, amount: money(D(g._sum.amount ?? 0)), count: g._count }));
    const total = (d: CashDirection) => money(rows.filter((r) => r.direction === d).reduce((t, r) => t.plus(r.amount), ZERO));
    const payables = await this.prisma.purchase.aggregate({ where: { paidAt: null, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true }, _count: true });
    return {
      accounts,
      cashOnHand: money(accounts.filter((a) => a.type === CashAccountType.CASH).reduce((t, a) => t.plus(a.balance), ZERO)),
      inBank: money(accounts.filter((a) => a.type === CashAccountType.BANK).reduce((t, a) => t.plus(a.balance), ZERO)),
      pendingSettlement: {
        cash: money(pending.reduce((t, p) => t.plus(p.cash), ZERO)),
        digital: money(pending.reduce((t, p) => t.plus(p.digital), ZERO)),
        people: pending.length,
      },
      supplierPayables: { amount: money(D(payables._sum.totalAmount ?? 0)), count: payables._count },
      period: { from: start, to: end, income: total(CashDirection.IN), expense: total(CashDirection.OUT), rows },
    };
  }

  // ── Operaciones ─────────────────────────────────────────

  async open(dto: OpenSessionDto, actor: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, dto.accountId, actor);
      if (account.type !== CashAccountType.CASH) throw new BadRequestException('Solo las cajas de efectivo se abren y cierran');
      const open = await tx.cashSession.findFirst({ where: { cashAccountId: account.id, status: CashSessionStatus.OPEN } });
      if (open) throw new ConflictException(`${account.name} ya está abierta (${open.sessionNumber})`);
      const sessionNumber = await this.sequences.next(tx, 'cash_session');
      const counted = money(D(dto.countedAmount));
      const expected = money(D(account.balance));
      const session = await tx.cashSession.create({
        data: { sessionNumber, cashAccountId: account.id, openedById: actor.id, openingExpected: expected, openingCounted: counted, notes: dto.notes },
      });
      await this.adjustTo(tx, account.id, expected, counted, `Diferencia al abrir ${sessionNumber}`, actor.id);
      await this.audit.log({ userId: actor.id, action: 'cash.open', entityType: 'cash_session', entityId: session.id, newData: { sessionNumber, expected, counted } }, tx);
      return session.id;
    }, TX_OPTIONS);
    return this.session(id);
  }

  async close(id: string, dto: CloseSessionDto, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: CashSessionStatus; cash_account_id: string }[]>`
        SELECT status, cash_account_id FROM cash_sessions WHERE id = ${id}::uuid FOR UPDATE`;
      if (!row) throw new NotFoundException('Sesión de caja no encontrada');
      if (row.status !== CashSessionStatus.OPEN) throw new ConflictException('La caja ya está cerrada');
      const account = await this.lockAccount(tx, row.cash_account_id, actor);
      const session = await tx.cashSession.findUniqueOrThrow({ where: { id } });
      const counted = money(D(dto.countedAmount));
      const expected = money(D(account.balance));
      if (dto.denominations) {
        const total = money(Object.entries(dto.denominations).reduce((t, [value, qty]) => t.plus(D(value).times(qty)), ZERO));
        if (!total.eq(counted)) throw new BadRequestException(`El conteo por billetes (${fmt(total)}) no coincide con el total contado (${fmt(counted)})`);
      }
      const difference = money(counted.minus(expected));
      if (!difference.isZero() && !dto.notes?.trim()) throw new BadRequestException(`Hay una diferencia de ${fmt(difference)}: explique el motivo`);
      // El ajuste entra en la sesión (todavía abierta) y luego se cierra.
      await this.adjustTo(tx, account.id, expected, counted, `Diferencia de arqueo al cerrar ${session.sessionNumber}`, actor.id);
      await tx.cashSession.update({
        where: { id },
        data: {
          status: CashSessionStatus.CLOSED,
          closedById: actor.id,
          closedAt: new Date(),
          closingExpected: expected,
          closingCounted: counted,
          closingDifference: difference,
          denominations: dto.denominations ?? undefined,
          notes: [session.notes, dto.notes].filter(Boolean).join(' · ') || null,
        },
      });
      await this.audit.log(
        { userId: actor.id, action: 'cash.close', entityType: 'cash_session', entityId: id, newData: { expected, counted, difference }, reason: dto.notes },
        tx,
      );
    }, TX_OPTIONS);
    return this.session(id);
  }

  /** Ingreso o egreso manual (gastos operativos, aportes). */
  async manual(dto: CashMovementDto, actor: AuthUser) {
    const allowed: CashCategory[] = [CashCategory.EXPENSE, CashCategory.OTHER_INCOME];
    if (!allowed.includes(dto.category)) throw new BadRequestException('Solo se registran a mano gastos y otros ingresos');
    if (dto.category === CashCategory.EXPENSE && !dto.expenseType) throw new BadRequestException('Indique el tipo de gasto');
    const id = await this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, dto.accountId, actor);
      const m = await this.record(tx, {
        accountId: dto.accountId,
        direction: dto.category === CashCategory.EXPENSE ? CashDirection.OUT : CashDirection.IN,
        category: dto.category,
        expenseType: dto.category === CashCategory.EXPENSE ? dto.expenseType : null,
        amount: D(dto.amount),
        description: dto.description.trim(),
        actorId: actor.id,
      });
      await this.audit.log({ userId: actor.id, action: `cash.${dto.category.toLowerCase()}`, entityType: 'cash_movement', entityId: m.id, newData: dto }, tx);
      return m.id;
    }, TX_OPTIONS);
    return this.prisma.cashMovement.findUniqueOrThrow({ where: { id }, include: { cashAccount: { select: { name: true } } } });
  }

  /** Traspaso entre cuentas (p. ej. depositar el efectivo de la caja en el banco). */
  async transfer(dto: TransferDto, actor: AuthUser) {
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException('Elija dos cuentas distintas');
    await this.prisma.$transaction(async (tx) => {
      for (const id of [dto.fromAccountId, dto.toAccountId].sort()) await this.lockAccount(tx, id, actor);
      const from = await tx.cashAccount.findUniqueOrThrow({ where: { id: dto.fromAccountId } });
      const to = await tx.cashAccount.findUniqueOrThrow({ where: { id: dto.toAccountId } });
      const note = dto.description ? `: ${dto.description}` : '';
      const out = await this.record(tx, {
        accountId: from.id, direction: CashDirection.OUT, category: CashCategory.TRANSFER, amount: D(dto.amount),
        description: `Traspaso a ${to.name}${note}`, referenceType: 'cash_account', referenceId: to.id, actorId: actor.id,
      });
      await this.record(tx, {
        accountId: to.id, direction: CashDirection.IN, category: CashCategory.TRANSFER, amount: D(dto.amount),
        description: `Traspaso desde ${from.name}${note}`, referenceType: 'cash_movement', referenceId: out.id, actorId: actor.id,
      });
      await this.audit.log({ userId: actor.id, action: 'cash.transfer', entityType: 'cash_movement', entityId: out.id, newData: dto }, tx);
    }, TX_OPTIONS);
    return { ok: true };
  }

  async reverseManual(movementId: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const m = await tx.cashMovement.findUnique({ where: { id: movementId } });
      if (!m) throw new NotFoundException('Movimiento no encontrado');
      if (m.category !== CashCategory.EXPENSE && m.category !== CashCategory.OTHER_INCOME) {
        throw new BadRequestException('Este movimiento lo generó otra operación: anule esa operación (venta, cobro, compra)');
      }
      await this.lockAccount(tx, m.cashAccountId, actor);
      await this.reverse(tx, m.id, actor.id, reason);
      await this.audit.log({ userId: actor.id, action: 'cash.reverse', entityType: 'cash_movement', entityId: m.id, reason }, tx);
    }, TX_OPTIONS);
    return { ok: true };
  }

  /**
   * Rendición: el chofer o cobrador entrega el efectivo cobrado (se cuenta) y se confirman sus QR y transferencias.
   * Todos sus pagos pendientes quedan rendidos; el efectivo entra a la caja y lo digital al banco.
   */
  async settle(dto: CreateSettlementDto, actor: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      const cash = await this.lockAccount(tx, dto.cashAccountId, actor);
      if (cash.type !== CashAccountType.CASH) throw new BadRequestException('La rendición se recibe en una caja de efectivo');
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM payments WHERE received_by_id = ${dto.userId}::uuid AND settlement_id IS NULL AND status = 'VALID'
          AND payment_source IN ('DRIVER', 'COLLECTOR') FOR UPDATE`;
      if (!locked.length) throw new BadRequestException('No tiene cobros pendientes de rendir');
      const list = await tx.payment.findMany({ where: { id: { in: locked.map((p) => p.id) } } });
      const expectedCash = money(list.filter((p) => p.paymentMethod === 'EFECTIVO').reduce((t, p) => t.plus(p.amount), ZERO));
      const digital = money(list.filter((p) => p.paymentMethod !== 'EFECTIVO').reduce((t, p) => t.plus(p.amount), ZERO));
      const counted = money(D(dto.countedCash));
      const difference = money(counted.minus(expectedCash));
      if (!difference.isZero() && !dto.notes?.trim()) throw new BadRequestException(`Hay una diferencia de ${fmt(difference)}: explique el motivo`);
      const user = await tx.user.findUniqueOrThrow({ where: { id: dto.userId } });
      const settlementNumber = await this.sequences.next(tx, 'settlement');
      const settlement = await tx.settlement.create({
        data: {
          settlementNumber,
          userId: dto.userId,
          cashAccountId: cash.id,
          receivedById: actor.id,
          expectedCash,
          countedCash: counted,
          cashDifference: difference,
          digitalAmount: digital,
          paymentsCount: list.length,
          notes: dto.notes?.trim() || null,
        },
      });
      await tx.payment.updateMany({ where: { id: { in: list.map((p) => p.id) } }, data: { settlementId: settlement.id } });
      if (counted.gt(0)) {
        await this.record(tx, {
          accountId: cash.id, direction: CashDirection.IN, category: CashCategory.SETTLEMENT, amount: counted, paymentMethod: 'EFECTIVO',
          description: `Rendición ${settlementNumber} de ${user.fullName}`, referenceType: 'settlement', referenceId: settlement.id, actorId: actor.id,
        });
      }
      if (digital.gt(0)) {
        const bank = await this.accountFor(tx, 'QR', null);
        await this.record(tx, {
          accountId: bank.id, direction: CashDirection.IN, category: CashCategory.SETTLEMENT, amount: digital,
          description: `QR y transferencias de ${user.fullName} (${settlementNumber})`, referenceType: 'settlement', referenceId: settlement.id, actorId: actor.id,
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'settlements.create',
          entityType: 'settlement',
          entityId: settlement.id,
          newData: { settlementNumber, user: user.fullName, expectedCash, counted, difference, digital, payments: list.length },
          reason: dto.notes,
        },
        tx,
      );
      return settlement.id;
    }, TX_OPTIONS);
    return this.settlement(id);
  }

  // ── Internos ────────────────────────────────────────────

  /** Bloquea la cuenta y valida que el usuario de sucursal solo opere la caja de su sucursal (o el banco). */
  private async lockAccount(tx: Tx, id: string, actor: AuthUser) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cash_accounts WHERE id = ${id}::uuid FOR UPDATE`;
    if (!row) throw new NotFoundException('Cuenta de dinero no encontrada');
    const account = await tx.cashAccount.findUniqueOrThrow({ where: { id } });
    if (actor.branchId && account.type === CashAccountType.CASH && account.branchId !== actor.branchId) {
      throw new ForbiddenException('Solo puede operar la caja de su sucursal');
    }
    return account;
  }

  /** Lleva el saldo al monto contado con un movimiento de ajuste (si hay diferencia). */
  private async adjustTo(tx: Tx, accountId: string, expected: Prisma.Decimal, counted: Prisma.Decimal, description: string, actorId: string) {
    const diff = money(counted.minus(expected));
    if (diff.isZero()) return null;
    return this.record(tx, {
      accountId,
      direction: diff.gt(0) ? CashDirection.IN : CashDirection.OUT,
      category: CashCategory.ADJUSTMENT,
      amount: diff.abs(),
      description: `${description} (${diff.gt(0) ? 'sobrante' : 'faltante'})`,
      actorId,
      allowNegative: true,
    });
  }
}

const fmt = (v: Prisma.Decimal) => `Bs ${v.toFixed(2)}`;

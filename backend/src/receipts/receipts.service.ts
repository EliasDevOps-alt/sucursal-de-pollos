import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PERMISSIONS } from '../auth/permissions';
import { D } from '../common/decimal';
import { CashService } from '../finance/cash.service';
import { PrismaService } from '../prisma/prisma.service';

export const RECEIPT_TYPES = { venta: 'SALE', entrega: 'DELIVERY', cobro: 'COLLECTION', rendicion: 'SETTLEMENT', caja: 'CASH_SESSION' } as const;
export type ReceiptSlug = keyof typeof RECEIPT_TYPES;
type DocType = (typeof RECEIPT_TYPES)[ReceiptSlug];

export interface ReceiptLine {
  description: string;
  detail?: string;
  amount?: string;
}

/** Comprobante listo para imprimir: el mismo modelo lo dibujan la web (80 mm / PDF) y la app (ESC/POS por Bluetooth). */
export interface Receipt {
  type: DocType;
  documentId: string;
  number: string;
  title: string;
  issuedAt: string;
  company: CompanyInfo;
  meta: { label: string; value: string }[];
  items: ReceiptLine[];
  totals: { label: string; value: string; strong?: boolean }[];
  extra: { label: string; value: string }[];
  signature?: string | null;
  signatureLabel?: string;
  notice?: string; // p. ej. ANULADA
  footer: string;
  printCount: number;
}

export interface CompanyInfo {
  name: string;
  nit: string;
  address: string;
  phone: string;
  footer: string;
}

const COMPANY_KEYS = { name: 'company.name', nit: 'company.nit', address: 'company.address', phone: 'company.phone', footer: 'receipt.footer' } as const;
const TZ = 'America/La_Paz';
const bob = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmtBob = (v: Prisma.Decimal.Value) => `Bs ${bob.format(Number(v))}`;
const fmtKg = (v: Prisma.Decimal.Value) => `${kgFmt.format(Number(v))} kg`;
const fmtDateTime = (d: Date) =>
  d.toLocaleString('es-BO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const METHODS: Record<string, string> = { EFECTIVO: 'Efectivo', QR: 'QR', TRANSFERENCIA: 'Transferencia', CREDITO_PROVEEDOR: 'Crédito del proveedor' };
const PROBLEMS: Record<string, string> = {
  CLOSED: 'Local cerrado', NOT_FOUND: 'No se encontró al cliente', REJECTED: 'Rechazó el pedido', NO_PAYMENT: 'No tenía con qué pagar',
  WRONG_ADDRESS: 'Dirección incorrecta', DAMAGED: 'Producto dañado', NOT_VISITED: 'No se visitó', OTHER: 'Otro',
};
const CATEGORIES: Record<string, string> = {
  SALE: 'Ventas', COLLECTION: 'Cobros', SETTLEMENT: 'Rendiciones', PURCHASE: 'Compras', REFUND: 'Devoluciones', EXPENSE: 'Gastos',
  OTHER_INCOME: 'Otros ingresos', TRANSFER: 'Traspasos', ADJUSTMENT: 'Diferencias', REVERSAL: 'Reversiones',
};

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashService,
    private readonly audit: AuditService,
  ) {}

  // ── Datos del negocio ───────────────────────────────────

  async company(): Promise<CompanyInfo> {
    const rows = await this.prisma.appSetting.findMany({ where: { key: { in: Object.values(COMPANY_KEYS) } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? '';
    return { name: get(COMPANY_KEYS.name) || 'Distribuidora', nit: get(COMPANY_KEYS.nit), address: get(COMPANY_KEYS.address), phone: get(COMPANY_KEYS.phone), footer: get(COMPANY_KEYS.footer) };
  }

  async updateCompany(dto: Partial<CompanyInfo>, actor: AuthUser) {
    const before = await this.company();
    for (const [field, key] of Object.entries(COMPANY_KEYS)) {
      const value = dto[field as keyof CompanyInfo];
      if (value === undefined) continue;
      await this.prisma.appSetting.upsert({ where: { key }, update: { value: value.trim() }, create: { key, value: value.trim() } });
    }
    const after = await this.company();
    await this.audit.log({ userId: actor.id, action: 'settings.company', entityType: 'app_setting', oldData: before, newData: after });
    return after;
  }

  // ── Comprobantes ────────────────────────────────────────

  async build(slug: string, id: string, actor: AuthUser): Promise<Receipt> {
    const type = RECEIPT_TYPES[slug as ReceiptSlug];
    if (!type) throw new BadRequestException('Tipo de comprobante desconocido');
    const company = await this.company();
    const base = await this.byType(type, id, actor);
    const printCount = await this.prisma.receiptPrint.count({ where: { documentType: type, documentId: id } });
    return { ...base, type, documentId: id, company, footer: company.footer, printCount };
  }

  /** Registra la impresión (la primera es el original; las siguientes, copias) y devuelve el comprobante con su número de copia. */
  async print(slug: string, id: string, channel: string, actor: AuthUser, opts: { tx?: Prisma.TransactionClient; at?: Date } = {}) {
    const receipt = await this.build(slug, id, actor);
    const db = opts.tx ?? this.prisma;
    const copyNumber = await db.receiptPrint.count({ where: { documentType: receipt.type, documentId: id } });
    await db.receiptPrint.create({
      data: { documentType: receipt.type, documentId: id, documentNumber: receipt.number, copyNumber, channel, printedById: actor.id, printedAt: opts.at },
    });
    return { ...receipt, copyNumber, printCount: copyNumber + 1 };
  }

  prints(f: { type?: string; from?: string; to?: string }) {
    const printedAt: Prisma.DateTimeFilter = {};
    if (f.from) printedAt.gte = new Date(f.from);
    if (f.to) printedAt.lte = new Date(f.to);
    return this.prisma.receiptPrint.findMany({
      where: { documentType: f.type, printedAt: f.from || f.to ? printedAt : undefined },
      include: { printedBy: { select: { fullName: true } } },
      orderBy: { printedAt: 'desc' },
      take: 300,
    });
  }

  // ── Por tipo ────────────────────────────────────────────

  private async byType(type: DocType, id: string, actor: AuthUser): Promise<Omit<Receipt, 'type' | 'documentId' | 'company' | 'footer' | 'printCount'>> {
    switch (type) {
      case 'SALE':
        this.need(actor, PERMISSIONS.SALES_VIEW);
        return this.sale(id);
      case 'DELIVERY':
        return this.delivery(id, actor);
      case 'COLLECTION':
        return this.collection(id, actor);
      case 'SETTLEMENT':
        this.need(actor, PERMISSIONS.CASH_VIEW);
        return this.settlement(id);
      case 'CASH_SESSION':
        this.need(actor, PERMISSIONS.CASH_VIEW);
        return this.cashSession(id);
    }
  }

  private async sale(id: string) {
    const s = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        seller: { select: { fullName: true } },
        warehouse: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
        payments: { where: { status: 'VALID' } },
      },
    });
    if (!s) throw new NotFoundException('Venta no encontrada');
    const charge = await this.prisma.receivableMovement.findFirst({ where: { referenceType: 'sale', referenceId: s.id, movementType: 'CHARGE' } });
    const cratesOut = await this.prisma.crateMovement.aggregate({ where: { referenceType: 'sale', referenceId: s.id, type: 'DELIVERY' }, _sum: { quantity: true } });
    return {
      number: s.saleNumber,
      title: 'NOTA DE VENTA',
      issuedAt: fmtDateTime(s.createdAt),
      meta: [
        { label: 'Cliente', value: s.customer?.name ?? 'Venta al contado' },
        ...(s.customer?.documentId ? [{ label: 'CI/NIT', value: s.customer.documentId }] : []),
        { label: 'Atendió', value: s.seller.fullName },
        { label: 'Almacén', value: s.warehouse.name },
      ],
      items: s.items.map((i) => ({
        description: i.product.name,
        detail: `${i.crates ? `${i.crates} ${i.crates === 1 ? 'canastillo' : 'canastillos'} · ` : ''}${fmtKg(i.requestedWeightKg)} × ${fmtBob(i.unitPrice)}/kg${D(i.discountAmount).gt(0) ? ` − desc. ${fmtBob(i.discountAmount)}` : ''}${D(i.returnedWeightKg).gt(0) ? ` (devuelto ${fmtKg(i.returnedWeightKg)})` : ''}`,
        amount: fmtBob(i.subtotal),
      })),
      totals: [
        ...(D(s.discountAmount).gt(0) ? [{ label: 'Subtotal', value: fmtBob(s.subtotal) }, { label: 'Descuento', value: `− ${fmtBob(s.discountAmount)}` }] : []),
        { label: 'TOTAL', value: fmtBob(s.totalAmount), strong: true },
        ...(D(s.returnedAmount).gt(0) ? [{ label: 'Devuelto', value: `− ${fmtBob(s.returnedAmount)}` }] : []),
        { label: 'Pagado', value: fmtBob(s.paidAmount) },
        ...(D(s.creditAmount).gt(0) ? [{ label: 'A crédito', value: fmtBob(s.creditAmount) }] : []),
      ],
      extra: [
        ...s.payments.map((p) => ({ label: 'Forma de pago', value: `${METHODS[p.paymentMethod] ?? p.paymentMethod} ${fmtBob(p.amount)}` })),
        ...(charge ? [{ label: 'Saldo del cliente', value: fmtBob(charge.balanceAfter) }] : []),
        ...(cratesOut._sum.quantity ? [{ label: 'Canastillos que lleva', value: `${cratesOut._sum.quantity} (a devolver)` }] : []),
      ],
      notice: s.status === 'ANNULLED' ? `ANULADA: ${s.annulReason ?? ''}` : s.status === 'RETURNED' ? 'DEVUELTA' : undefined,
    };
  }

  private async delivery(stopId: string, actor: AuthUser) {
    const stop = await this.prisma.routeStop.findUnique({
      where: { id: stopId },
      include: {
        route: { include: { driver: { select: { fullName: true } }, vehicle: { select: { plate: true } } } },
        customer: true,
        address: true,
        presale: { select: { presaleNumber: true } },
        sale: { include: { items: { include: { product: { select: { name: true } } } } } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
    if (!stop) throw new NotFoundException('Entrega no encontrada');
    if (!actor.permissions.includes(PERMISSIONS.ROUTES_VIEW) && stop.route.driverId !== actor.id) throw new ForbiddenException('No puede ver esta entrega');
    if (stop.status === 'PENDING') throw new BadRequestException('La entrega todavía no se registró');
    const failed = stop.status === 'FAILED';
    const saleLine = (productId: string) => stop.sale?.items.find((i) => i.productId === productId);
    return {
      number: stop.sale?.saleNumber ?? `${stop.route.routeNumber}-${stop.sequence}`,
      title: failed ? 'CONSTANCIA DE VISITA' : 'COMPROBANTE DE ENTREGA',
      issuedAt: fmtDateTime(stop.resolvedAtDevice ?? stop.resolvedAt ?? new Date()),
      meta: [
        { label: 'Cliente', value: stop.customer.name },
        ...(stop.address ? [{ label: 'Dirección', value: stop.address.address }] : []),
        { label: 'Pedido', value: stop.presale.presaleNumber },
        { label: 'Ruta', value: `${stop.route.routeNumber} · ${stop.route.vehicle.plate}` },
        { label: 'Chofer', value: stop.route.driver.fullName },
      ],
      items: failed
        ? []
        : stop.items.map((i) => {
            const line = saleLine(i.productId);
            return {
              description: i.product.name,
              detail: `Pedido ${i.orderedCrates ? `${i.orderedCrates} canast. (${fmtKg(i.orderedWeightKg)})` : fmtKg(i.orderedWeightKg)} · entregado ${fmtKg(i.deliveredWeightKg ?? 0)}${line ? ` × ${fmtBob(line.unitPrice)}/kg` : ''}${i.differenceReason ? ` (${i.differenceReason})` : ''}`,
              amount: line ? fmtBob(line.subtotal) : undefined,
            };
          }),
      totals: failed || !stop.sale
        ? []
        : [
            { label: 'TOTAL', value: fmtBob(stop.sale.totalAmount), strong: true },
            { label: 'Cobrado', value: fmtBob(stop.paidAmount) },
            ...(D(stop.sale.creditAmount).gt(0) ? [{ label: 'A crédito', value: fmtBob(stop.sale.creditAmount) }] : []),
          ],
      extra: [
        ...(failed ? [{ label: 'No entregado', value: `${stop.problemType ? (PROBLEMS[stop.problemType] ?? stop.problemType) : ''}${stop.notes ? `: ${stop.notes}` : ''}` }] : []),
        ...(stop.paymentMethod ? [{ label: 'Forma de pago', value: METHODS[stop.paymentMethod] ?? stop.paymentMethod }] : []),
        ...(stop.cratesDelivered || stop.cratesPickedUp ? [{ label: 'Canastillos', value: `dejados ${stop.cratesDelivered} · recogidos ${stop.cratesPickedUp}` }] : []),
        ...(stop.receivedByName ? [{ label: 'Recibió', value: stop.receivedByName }] : []),
      ],
      signature: stop.signature,
      signatureLabel: stop.receivedByName ? `Firma de ${stop.receivedByName}` : undefined,
    };
  }

  private async collection(id: string, actor: AuthUser) {
    const p = await this.prisma.payment.findFirst({
      where: { id, saleId: null },
      include: { customer: true, receivedBy: { select: { fullName: true } } },
    });
    if (!p) throw new NotFoundException('Cobro no encontrado');
    if (!actor.permissions.includes(PERMISSIONS.COLLECTIONS_VIEW) && p.receivedById !== actor.id) throw new ForbiddenException('No puede ver este cobro');
    const mv = await this.prisma.receivableMovement.findFirst({ where: { referenceType: 'collection', referenceId: p.id, movementType: 'PAYMENT' } });
    const after = mv ? D(mv.balanceAfter) : null;
    return {
      number: p.receiptNumber ?? p.id.slice(0, 8),
      title: 'RECIBO DE COBRO',
      issuedAt: fmtDateTime(p.collectedAtDevice ?? p.paymentDate),
      meta: [
        { label: 'Cliente', value: p.customer?.name ?? '' },
        ...(p.customer?.documentId ? [{ label: 'CI/NIT', value: p.customer.documentId }] : []),
        { label: 'Cobró', value: p.receivedBy.fullName },
      ],
      items: [{ description: 'Pago a cuenta de deuda', detail: `${METHODS[p.paymentMethod] ?? p.paymentMethod}${p.referenceNumber ? ` · ${p.referenceNumber}` : ''}`, amount: fmtBob(p.amount) }],
      totals: [
        ...(after ? [{ label: 'Deuda anterior', value: fmtBob(after.plus(p.amount)) }] : []),
        { label: 'PAGADO', value: fmtBob(p.amount), strong: true },
        ...(after ? [{ label: after.isNegative() ? 'Saldo a favor' : 'Saldo pendiente', value: fmtBob(after.abs()) }] : []),
      ],
      extra: [...(p.paidByName ? [{ label: 'Pagó', value: p.paidByName }] : []), ...(p.notes ? [{ label: 'Nota', value: p.notes }] : [])],
      signature: p.signature,
      signatureLabel: p.paidByName ? `Firma de ${p.paidByName}` : undefined,
      notice: p.status === 'ANNULLED' ? `ANULADO: ${p.annulReason ?? ''}` : undefined,
    };
  }

  private async settlement(id: string) {
    const s = await this.cash.settlement(id);
    const diff = D(s.cashDifference);
    return {
      number: s.settlementNumber,
      title: 'RENDICIÓN DE COBROS',
      issuedAt: fmtDateTime(s.createdAt),
      meta: [
        { label: 'Rindió', value: s.user.fullName },
        { label: 'Recibió', value: s.receivedBy.fullName },
        { label: 'Caja', value: s.cashAccount.name },
      ],
      items: s.payments.map((p) => ({
        description: p.customer?.name ?? '—',
        detail: `${p.sale ? `Venta ${p.sale.saleNumber}` : p.receiptNumber ? `Recibo ${p.receiptNumber}` : ''} · ${METHODS[p.paymentMethod] ?? p.paymentMethod}`,
        amount: fmtBob(p.amount),
      })),
      totals: [
        { label: 'Efectivo esperado', value: fmtBob(s.expectedCash) },
        { label: 'EFECTIVO ENTREGADO', value: fmtBob(s.countedCash), strong: true },
        ...(!diff.isZero() ? [{ label: diff.isNegative() ? 'Faltante' : 'Sobrante', value: fmtBob(diff.abs()) }] : []),
        { label: 'QR y transferencias', value: fmtBob(s.digitalAmount) },
      ],
      extra: s.notes ? [{ label: 'Observaciones', value: s.notes }] : [],
      signatureLabel: `Firma de ${s.user.fullName}`,
    };
  }

  private async cashSession(id: string) {
    const s = await this.cash.session(id);
    const denominations = (s.denominations ?? {}) as Record<string, number>;
    const diff = s.closingDifference ? D(s.closingDifference) : null;
    return {
      number: s.sessionNumber,
      title: s.status === 'OPEN' ? 'ESTADO DE CAJA (ABIERTA)' : 'CIERRE DE CAJA',
      issuedAt: fmtDateTime(s.closedAt ?? new Date()),
      meta: [
        { label: 'Caja', value: s.cashAccount.name },
        { label: 'Apertura', value: `${fmtDateTime(s.openedAt)} · ${s.openedBy.fullName}` },
        ...(s.closedAt ? [{ label: 'Cierre', value: `${fmtDateTime(s.closedAt)} · ${s.closedBy?.fullName ?? ''}` }] : []),
      ],
      items: s.byCategory.map((c) => ({
        description: CATEGORIES[c.category] ?? c.category,
        detail: `${c.count} movimiento(s)`,
        amount: `${c.direction === 'IN' ? '+' : '−'} ${fmtBob(c.amount)}`,
      })),
      totals: [
        { label: 'Contado al abrir', value: fmtBob(s.openingCounted) },
        { label: 'Entradas', value: fmtBob(s.totals.in) },
        { label: 'Salidas', value: fmtBob(s.totals.out) },
        ...(s.closingExpected ? [{ label: 'Esperado', value: fmtBob(s.closingExpected) }] : []),
        ...(s.closingCounted ? [{ label: 'CONTADO', value: fmtBob(s.closingCounted), strong: true }] : []),
        ...(diff && !diff.isZero() ? [{ label: diff.isNegative() ? 'Faltante' : 'Sobrante', value: fmtBob(diff.abs()) }] : []),
      ],
      extra: [
        ...Object.entries(denominations)
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([v, q]) => ({ label: `Bs ${v.replace('.', ',')}`, value: `${q} = ${fmtBob(D(v).times(q))}` })),
        ...(s.notes ? [{ label: 'Observaciones', value: s.notes }] : []),
      ],
      signatureLabel: 'Firma del cajero',
    };
  }

  private need(actor: AuthUser, permission: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException(`Permiso insuficiente: ${permission}`);
  }
}

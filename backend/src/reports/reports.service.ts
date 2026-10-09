import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { D, kg, money, ZERO } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';

export type GroupBy = 'product' | 'lot' | 'customer' | 'seller';

export interface DateRange {
  from: string; // YYYY-MM-DD (fecha local)
  to: string;
}

/** Filtros de ventas: sucursal (o 'routes' = entregas del reparto, que salen de los vehículos), categoría, vendedor y cliente. */
export interface SalesFilters {
  branchId?: string;
  categoryId?: string;
  sellerId?: string;
  customerId?: string;
}

type Num = Prisma.Decimal | number | bigint | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pct = (part: Prisma.Decimal, whole: Prisma.Decimal) =>
  whole.gt(0) ? part.div(whole).times(100).toDecimalPlaces(2) : ZERO;
const dec = (v: Num) => D(typeof v === 'bigint' ? v.toString() : (v ?? 0));

@Injectable()
export class ReportsService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('REPORT_TZ', 'America/La_Paz');
  }

  // ── Fechas ──────────────────────────────────────────────

  /** Rango por defecto: últimos 30 días (incluido hoy), en fechas locales. */
  resolveRange(from?: string, to?: string): DateRange {
    for (const v of [from, to]) {
      if (v && !DATE_RE.test(v)) throw new BadRequestException(`Fecha inválida: ${v} (use AAAA-MM-DD)`);
    }
    const today = this.localToday();
    const end = to ?? today;
    const start = from ?? this.shiftDays(end, -29);
    if (start > end) throw new BadRequestException('La fecha inicial es posterior a la final');
    if (start < this.shiftDays(end, -366)) throw new BadRequestException('El rango no puede superar un año');
    return { from: start, to: end };
  }

  localToday() {
    // en-CA formatea como AAAA-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.tz }).format(new Date());
  }

  shiftDays(date: string, days: number) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** Condición SQL: la columna (timestamp guardado en UTC) cae dentro del rango de fechas locales. */
  inRange(column: string, r: DateRange) {
    const col = Prisma.raw(column);
    return Prisma.sql`${col} >= ((${r.from}::date)::timestamp AT TIME ZONE ${this.tz}) AT TIME ZONE 'UTC'
      AND ${col} < (((${r.to}::date + 1))::timestamp AT TIME ZONE ${this.tz}) AT TIME ZONE 'UTC'`;
  }

  /** Fecha local de un timestamp guardado en UTC. */
  localDate(column: string) {
    return Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${this.tz})::date`;
  }

  /** Condiciones extra sobre `s` (ventas) y `p` (productos) según los filtros. */
  private salesFilter(f: SalesFilters = {}) {
    const parts: Prisma.Sql[] = [];
    if (f.branchId === 'routes') parts.push(Prisma.sql`AND s.branch_id IS NULL`);
    else if (f.branchId) parts.push(Prisma.sql`AND s.branch_id = ${f.branchId}::uuid`);
    if (f.categoryId) parts.push(Prisma.sql`AND p.category_id = ${f.categoryId}::uuid`);
    if (f.sellerId) parts.push(Prisma.sql`AND s.seller_id = ${f.sellerId}::uuid`);
    if (f.customerId) parts.push(Prisma.sql`AND s.customer_id = ${f.customerId}::uuid`);
    return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
  }

  // ── Ventas ──────────────────────────────────────────────

  /** Serie diaria completa (los días sin ventas aparecen en cero). */
  async salesByDay(r: DateRange, f: SalesFilters = {}) {
    // Con filtro de categoría el ingreso es el de las líneas de esa categoría (no el total de la venta).
    const amount = f.categoryId ? Prisma.sql`SUM(si.subtotal - si.returned_amount)` : Prisma.sql`s.total_amount - s.returned_amount`;
    const rows = await this.prisma.$queryRaw<{ day: Date; revenue: Num; cost: Num; count: Num; kg: Num }[]>`
      WITH days AS (
        SELECT generate_series(${r.from}::date, ${r.to}::date, interval '1 day')::date AS day
      ),
      item_cost AS (
        SELECT a.sale_item_id, SUM((a.weight_kg - a.restocked_weight_kg) * a.cost_per_kg) AS cost FROM sale_lot_allocations a GROUP BY a.sale_item_id
      ),
      per_sale AS (
        SELECT s.id, s.status, ${this.localDate('s.created_at')} AS day, ${amount} AS total_amount,
               SUM(ic.cost) AS cost, SUM(si.requested_weight_kg - si.returned_weight_kg) AS kg
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        JOIN item_cost ic ON ic.sale_item_id = si.id
        JOIN products p ON p.id = si.product_id
        WHERE s.status IN ('CONFIRMED', 'RETURNED') AND ${this.inRange('s.created_at', r)} ${this.salesFilter(f)}
        GROUP BY s.id
      )
      SELECT d.day, COALESCE(SUM(p.total_amount), 0) AS revenue, COALESCE(SUM(p.cost), 0) AS cost,
             COUNT(p.id) FILTER (WHERE p.status = 'CONFIRMED') AS count, COALESCE(SUM(p.kg), 0) AS kg
      FROM days d LEFT JOIN per_sale p ON p.day = d.day
      GROUP BY d.day ORDER BY d.day`;

    return rows.map((row) => {
      const revenue = money(dec(row.revenue));
      const cost = money(dec(row.cost));
      return {
        day: row.day.toISOString().slice(0, 10),
        revenue,
        cost,
        margin: money(revenue.minus(cost)),
        count: Number(row.count),
        kg: kg(dec(row.kg)),
      };
    });
  }

  /** Rentabilidad agrupada usando el costo real congelado en cada asignación de lote. */
  async profitability(r: DateRange, groupBy: GroupBy, f: SalesFilters = {}) {
    type Row = { id: string | null; label: string; detail: string | null; kg: Num; revenue: Num; cost: Num; sales: Num };
    let rows: Row[];

    if (groupBy === 'lot') {
      // El ingreso de la línea se reparte entre sus lotes en proporción al peso tomado de cada uno.
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT l.id, l.lot_code AS label, p.name AS detail,
               SUM(a.weight_kg - a.returned_weight_kg) AS kg,
               SUM(si.subtotal * a.weight_kg / si.requested_weight_kg - COALESCE(ra.amount, 0)) AS revenue,
               SUM((a.weight_kg - a.restocked_weight_kg) * a.cost_per_kg) AS cost,
               COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'CONFIRMED') AS sales
        FROM sale_lot_allocations a
        JOIN sale_items si ON si.id = a.sale_item_id
        JOIN sales s ON s.id = si.sale_id
        JOIN lots l ON l.id = a.lot_id
        JOIN products p ON p.id = l.product_id
        LEFT JOIN (SELECT allocation_id, SUM(amount) AS amount FROM sale_return_items GROUP BY allocation_id) ra ON ra.allocation_id = a.id
        WHERE s.status IN ('CONFIRMED', 'RETURNED') AND ${this.inRange('s.created_at', r)} ${this.salesFilter(f)}
        GROUP BY l.id, l.lot_code, p.name`;
    } else {
      const key = {
        product: Prisma.sql`p.id, p.name AS label, p.code AS detail`,
        customer: Prisma.sql`c.id, COALESCE(c.name, 'Ventas rápidas') AS label, c.code AS detail`,
        seller: Prisma.sql`u.id, u.full_name AS label, u.username AS detail`,
      }[groupBy];
      const group = { product: Prisma.sql`p.id, p.name, p.code`, customer: Prisma.sql`c.id, c.name, c.code`, seller: Prisma.sql`u.id, u.full_name, u.username` }[groupBy];
      rows = await this.prisma.$queryRaw<Row[]>`
        WITH item_cost AS (
          SELECT a.sale_item_id, SUM((a.weight_kg - a.restocked_weight_kg) * a.cost_per_kg) AS cost FROM sale_lot_allocations a GROUP BY a.sale_item_id
        )
        SELECT ${key},
               SUM(si.requested_weight_kg - si.returned_weight_kg) AS kg, SUM(si.subtotal - si.returned_amount) AS revenue, SUM(ic.cost) AS cost,
               COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'CONFIRMED') AS sales
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN item_cost ic ON ic.sale_item_id = si.id
        JOIN products p ON p.id = si.product_id
        JOIN users u ON u.id = s.seller_id
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.status IN ('CONFIRMED', 'RETURNED') AND ${this.inRange('s.created_at', r)} ${this.salesFilter(f)}
        GROUP BY ${group}`;
    }

    const result = rows
      .map((row) => {
        const revenue = money(dec(row.revenue));
        const cost = money(dec(row.cost));
        const margin = money(revenue.minus(cost));
        return {
          id: row.id,
          label: row.label,
          detail: row.detail,
          kg: kg(dec(row.kg)),
          sales: Number(row.sales),
          revenue,
          cost,
          margin,
          marginPercentage: pct(margin, revenue),
        };
      })
      .sort((a, b) => b.revenue.comparedTo(a.revenue));

    const revenue = money(result.reduce((s, x) => s.plus(x.revenue), ZERO));
    const cost = money(result.reduce((s, x) => s.plus(x.cost), ZERO));
    const margin = money(revenue.minus(cost));
    return {
      range: r,
      groupBy,
      filters: f,
      totals: { revenue, cost, margin, marginPercentage: pct(margin, revenue), kg: kg(result.reduce((s, x) => s.plus(x.kg), ZERO)) },
      rows: result,
    };
  }

  // ── Merma ───────────────────────────────────────────────

  async shrinkage(r: DateRange) {
    const lots = await this.prisma.$queryRaw<
      {
        id: string; lot_code: string; product: string; supplier: string; supplier_id: string; received_at: Date;
        purchased_kg: Num; net_kg: Num; shrinkage_kg: Num; shrinkage_pct: Num; loss: Num; treatment: string;
      }[]
    >`
      SELECT l.id, l.lot_code, p.name AS product, sp.name AS supplier, sp.id AS supplier_id, r.received_at,
             pi.purchased_weight_kg AS purchased_kg, l.received_weight_kg AS net_kg,
             l.shrinkage_weight_kg AS shrinkage_kg, ri.shrinkage_percentage AS shrinkage_pct,
             l.shrinkage_loss_amount AS loss, l.shrinkage_treatment AS treatment
      FROM lots l
      JOIN receptions r ON r.id = l.reception_id
      JOIN reception_items ri ON ri.id = l.reception_item_id
      JOIN purchase_items pi ON pi.id = ri.purchase_item_id
      JOIN purchases pu ON pu.id = l.purchase_id
      JOIN suppliers sp ON sp.id = pu.supplier_id
      JOIN products p ON p.id = l.product_id
      WHERE ${this.inRange('r.received_at', r)}
      ORDER BY r.received_at DESC`;

    const bySupplier = new Map<string, { supplier: string; purchasedKg: Prisma.Decimal; shrinkageKg: Prisma.Decimal; loss: Prisma.Decimal; lots: number }>();
    for (const l of lots) {
      const row = bySupplier.get(l.supplier_id) ?? { supplier: l.supplier, purchasedKg: ZERO, shrinkageKg: ZERO, loss: ZERO, lots: 0 };
      row.purchasedKg = row.purchasedKg.plus(dec(l.purchased_kg));
      row.shrinkageKg = row.shrinkageKg.plus(dec(l.shrinkage_kg));
      row.loss = row.loss.plus(dec(l.loss));
      row.lots += 1;
      bySupplier.set(l.supplier_id, row);
    }

    const purchasedKg = lots.reduce((s, l) => s.plus(dec(l.purchased_kg)), ZERO);
    const shrinkageKg = lots.reduce((s, l) => s.plus(dec(l.shrinkage_kg)), ZERO);
    return {
      range: r,
      inventoryLosses: await this.inventoryLosses(r),
      totals: {
        purchasedKg: kg(purchasedKg),
        shrinkageKg: kg(shrinkageKg),
        shrinkagePercentage: pct(shrinkageKg, purchasedKg),
        loss: money(lots.reduce((s, l) => s.plus(dec(l.loss)), ZERO)),
      },
      bySupplier: [...bySupplier.entries()]
        .map(([id, s]) => ({
          supplierId: id,
          supplier: s.supplier,
          lots: s.lots,
          purchasedKg: kg(s.purchasedKg),
          shrinkageKg: kg(s.shrinkageKg),
          shrinkagePercentage: pct(s.shrinkageKg, s.purchasedKg),
          loss: money(s.loss),
        }))
        .sort((a, b) => b.shrinkagePercentage.comparedTo(a.shrinkagePercentage)),
      lots: lots.map((l) => ({
        id: l.id,
        lotCode: l.lot_code,
        product: l.product,
        supplier: l.supplier,
        receivedAt: l.received_at,
        purchasedKg: kg(dec(l.purchased_kg)),
        netKg: kg(dec(l.net_kg)),
        shrinkageKg: kg(dec(l.shrinkage_kg)),
        shrinkagePercentage: dec(l.shrinkage_pct),
        loss: money(dec(l.loss)),
        treatment: l.treatment,
      })),
    };
  }

  /**
   * Pérdidas de inventario posteriores a la recepción, por causa: bajas (vencido, dañado…), faltantes de conteo,
   * faltantes en transferencias y devoluciones descartadas. Los sobrantes de conteo se informan aparte.
   */
  private async inventoryLosses(r: DateRange) {
    const events = await this.prisma.$queryRaw<
      { id: string; at: Date; cause: string; document: string; reference_id: string; kind: string; product: string; lot_code: string; warehouse: string; kg: Num; amount: Num; notes: string | null }[]
    >`
      SELECT ia.id, ia.created_at AS at,
             CASE WHEN ia.kind = 'COUNT' THEN (CASE WHEN ia.weight_kg < 0 THEN 'COUNT_SHORTAGE' ELSE 'COUNT_SURPLUS' END) ELSE ia.reason_code::text END AS cause,
             ia.adjustment_number AS document, ia.id AS reference_id, 'adjustment' AS kind,
             p.name AS product, l.lot_code, w.name AS warehouse, -ia.weight_kg AS kg, -ia.amount AS amount, ia.notes
      FROM inventory_adjustments ia
      JOIN products p ON p.id = ia.product_id JOIN lots l ON l.id = ia.lot_id JOIN warehouses w ON w.id = ia.warehouse_id
      WHERE ia.status = 'VALID' AND ${this.inRange('ia.created_at', r)}
      UNION ALL
      SELECT ti.id, t.received_at, 'TRANSIT', t.transfer_number, t.id, 'transfer',
             p.name, l.lot_code, w.name, ti.difference_kg, ti.loss_amount, t.receive_notes
      FROM transfer_items ti
      JOIN transfers t ON t.id = ti.transfer_id
      JOIN products p ON p.id = ti.product_id JOIN lots l ON l.id = ti.lot_id JOIN warehouses w ON w.id = t.destination_warehouse_id
      WHERE t.status = 'RECEIVED' AND ti.difference_kg > 0 AND ${this.inRange('t.received_at', r)}
      UNION ALL
      SELECT sri.id, sr.created_at, 'RETURN_DISCARD', sr.return_number, sr.sale_id, 'return',
             p.name, l.lot_code, w.name, sri.weight_kg, ROUND(sri.weight_kg * sri.cost_per_kg, 2), sr.reason
      FROM sale_return_items sri
      JOIN sale_returns sr ON sr.id = sri.return_id
      JOIN products p ON p.id = sri.product_id JOIN lots l ON l.id = sri.lot_id JOIN warehouses w ON w.id = sr.warehouse_id
      WHERE sri.disposition = 'DISCARD' AND ${this.inRange('sr.created_at', r)}
      ORDER BY at DESC`;

    const byCause = new Map<string, { kg: Prisma.Decimal; amount: Prisma.Decimal; count: number }>();
    for (const e of events) {
      const row = byCause.get(e.cause) ?? { kg: ZERO, amount: ZERO, count: 0 };
      row.kg = row.kg.plus(dec(e.kg));
      row.amount = row.amount.plus(dec(e.amount));
      row.count += 1;
      byCause.set(e.cause, row);
    }
    const losses = events.filter((e) => e.cause !== 'COUNT_SURPLUS');
    const surplus = events.filter((e) => e.cause === 'COUNT_SURPLUS');
    // En los sobrantes kg y valor llegan negativos (son ganancia); se muestran en positivo.
    return {
      totals: {
        lossKg: kg(losses.reduce((s, e) => s.plus(dec(e.kg)), ZERO)),
        lossAmount: money(losses.reduce((s, e) => s.plus(dec(e.amount)), ZERO)),
        surplusKg: kg(surplus.reduce((s, e) => s.minus(dec(e.kg)), ZERO)),
        surplusAmount: money(surplus.reduce((s, e) => s.minus(dec(e.amount)), ZERO)),
      },
      byCause: [...byCause.entries()]
        .filter(([cause]) => cause !== 'COUNT_SURPLUS')
        .map(([cause, v]) => ({ cause, kg: kg(v.kg), amount: money(v.amount), count: v.count }))
        .sort((a, b) => b.amount.comparedTo(a.amount)),
      events: events.slice(0, 100).map((e) => ({
        id: e.id,
        at: e.at,
        cause: e.cause,
        document: e.document,
        kind: e.kind,
        referenceId: e.reference_id,
        product: e.product,
        lotCode: e.lot_code,
        warehouse: e.warehouse,
        kg: kg(dec(e.kg)),
        amount: money(dec(e.amount)),
        notes: e.notes,
      })),
    };
  }

  // ── Cuentas por cobrar ──────────────────────────────────

  /** Clientes con deuda y antigüedad: días desde el primer cargo aún no saldado. */
  async receivables() {
    const rows = await this.prisma.$queryRaw<
      { id: string; code: string; name: string; phone: string | null; current_debt: Num; credit_limit: Num; oldest_charge: Date | null }[]
    >`
      SELECT c.id, c.code, c.name, c.phone, c.current_debt, c.credit_limit,
        (SELECT MIN(rm.created_at) FROM receivable_movements rm
          WHERE rm.customer_id = c.id AND rm.movement_type = 'CHARGE'
            AND rm.created_at > COALESCE(
              (SELECT MAX(z.created_at) FROM receivable_movements z WHERE z.customer_id = c.id AND z.balance_after <= 0),
              '-infinity'::timestamp)
        ) AS oldest_charge
      FROM customers c
      WHERE c.current_debt > 0
      ORDER BY c.current_debt DESC`;

    const now = Date.now();
    const customers = rows.map((r) => {
      const debt = money(dec(r.current_debt));
      const limit = money(dec(r.credit_limit));
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        phone: r.phone,
        debt,
        creditLimit: limit,
        usagePercentage: pct(debt, limit),
        oldestCharge: r.oldest_charge,
        daysOutstanding: r.oldest_charge ? Math.floor((now - r.oldest_charge.getTime()) / 86_400_000) : null,
      };
    });
    const total = money(customers.reduce((s, c) => s.plus(c.debt), ZERO));
    const buckets = [
      { label: '0–7 días', min: 0, max: 7 },
      { label: '8–15 días', min: 8, max: 15 },
      { label: '16–30 días', min: 16, max: 30 },
      { label: 'Más de 30 días', min: 31, max: Infinity },
    ].map((b) => ({
      label: b.label,
      amount: money(
        customers.filter((c) => (c.daysOutstanding ?? 0) >= b.min && (c.daysOutstanding ?? 0) <= b.max).reduce((s, c) => s.plus(c.debt), ZERO),
      ),
    }));
    return { total, debtors: customers.length, buckets, customers };
  }

  // ── Alertas ─────────────────────────────────────────────

  async alerts(expiringWithinDays = 3) {
    const today = this.localToday();
    const limit = this.shiftDays(today, expiringWithinDays);

    const expiring = await this.prisma.$queryRaw<
      { id: string; lot_code: string; product: string; warehouse: string; expiry_date: Date; weight_kg: Num; cost: Num }[]
    >`
      SELECT l.id, l.lot_code, p.name AS product, w.name AS warehouse, l.expiry_date,
             ib.weight_kg, ib.weight_kg * l.actual_cost_per_kg AS cost
      FROM inventory_balances ib
      JOIN lots l ON l.id = ib.lot_id
      JOIN products p ON p.id = ib.product_id
      JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE ib.weight_kg > 0 AND l.expiry_date <= ${limit}::date
      ORDER BY l.expiry_date, l.lot_code`;

    const lowStock = await this.prisma.$queryRaw<{ id: string; code: string; name: string; min_stock_kg: Num; stock_kg: Num }[]>`
      SELECT p.id, p.code, p.name, p.min_stock_kg,
             COALESCE((SELECT SUM(ib.weight_kg) FROM inventory_balances ib
                       JOIN lots l ON l.id = ib.lot_id
                       WHERE ib.product_id = p.id AND l.expiry_date >= ${today}::date), 0) AS stock_kg
      FROM products p
      WHERE p.is_active AND p.min_stock_kg > 0`;

    const todayMs = Date.parse(`${today}T00:00:00Z`);
    return {
      today,
      expiringLots: expiring.map((l) => ({
        id: l.id,
        lotCode: l.lot_code,
        product: l.product,
        warehouse: l.warehouse,
        expiryDate: l.expiry_date,
        daysToExpiry: Math.round((l.expiry_date.getTime() - todayMs) / 86_400_000),
        weightKg: kg(dec(l.weight_kg)),
        costValue: money(dec(l.cost)),
      })),
      lowStock: lowStock
        .map((p) => ({ id: p.id, code: p.code, name: p.name, minStockKg: kg(dec(p.min_stock_kg)), stockKg: kg(dec(p.stock_kg)) }))
        .filter((p) => p.stockKg.lt(p.minStockKg))
        .sort((a, b) => a.stockKg.div(a.minStockKg).comparedTo(b.stockKg.div(b.minStockKg))),
    };
  }

  // ── Dashboard ───────────────────────────────────────────

  /** Resumen del período con comparación contra el período anterior de igual duración. */
  async dashboard(r: DateRange, includeFinancial: boolean, f: SalesFilters = {}) {
    const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
    const previous: DateRange = { from: this.shiftDays(r.from, -days), to: this.shiftDays(r.from, -1) };

    const [series, prevSeries, top, receivables, alerts, stock, purchases] = await Promise.all([
      this.salesByDay(r, f),
      this.salesByDay(previous, f),
      this.profitability(r, 'product', f),
      this.receivables(),
      this.alerts(),
      this.prisma.$queryRaw<{ kg: Num; value: Num }[]>`
        SELECT COALESCE(SUM(ib.weight_kg), 0) AS kg, COALESCE(SUM(ib.weight_kg * l.actual_cost_per_kg), 0) AS value
        FROM inventory_balances ib JOIN lots l ON l.id = ib.lot_id JOIN warehouses w ON w.id = ib.warehouse_id
        WHERE ib.weight_kg > 0
          ${f.branchId === 'routes' ? Prisma.sql`AND w.type = 'VEHICLE'` : f.branchId ? Prisma.sql`AND w.branch_id = ${f.branchId}::uuid` : Prisma.empty}
          ${f.categoryId ? Prisma.sql`AND l.product_id IN (SELECT id FROM products WHERE category_id = ${f.categoryId}::uuid)` : Prisma.empty}`,
      this.prisma.$queryRaw<{ total: Num; count: Num }[]>`
        SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count FROM purchases
        WHERE status <> 'CANCELLED' AND ${this.inRange('purchase_date', r)}`,
    ]);

    const sum = (rows: typeof series, f: 'revenue' | 'cost' | 'margin' | 'kg') => rows.reduce((s, x) => s.plus(x[f]), ZERO);
    const revenue = money(sum(series, 'revenue'));
    const prevRevenue = money(sum(prevSeries, 'revenue'));
    const count = series.reduce((s, x) => s + x.count, 0);
    const margin = money(sum(series, 'margin'));
    const prevMargin = money(sum(prevSeries, 'margin'));

    const financial = <T>(v: T) => (includeFinancial ? v : undefined);
    return {
      range: r,
      previousRange: previous,
      filters: f,
      kpis: {
        revenue,
        revenueDeltaPercentage: prevRevenue.gt(0) ? pct(revenue.minus(prevRevenue), prevRevenue) : null,
        salesCount: count,
        averageTicket: count ? money(revenue.div(count)) : ZERO,
        kgSold: kg(sum(series, 'kg')),
        cost: financial(money(sum(series, 'cost'))),
        margin: financial(margin),
        marginPercentage: financial(pct(margin, revenue)),
        marginDeltaPercentage: financial(prevMargin.gt(0) ? pct(margin.minus(prevMargin), prevMargin) : null),
        receivables: receivables.total,
        debtors: receivables.debtors,
        stockKg: kg(dec(stock[0].kg)),
        stockValue: financial(money(dec(stock[0].value))),
        purchasesTotal: money(dec(purchases[0].total)),
        purchasesCount: Number(purchases[0].count),
      },
      salesByDay: series.map((d) => ({ ...d, cost: financial(d.cost), margin: financial(d.margin) })),
      topProducts: top.rows.slice(0, 6).map((p) => ({
        id: p.id,
        label: p.label,
        kg: p.kg,
        revenue: p.revenue,
        margin: financial(p.margin),
        marginPercentage: financial(p.marginPercentage),
      })),
      alerts,
      topDebtors: receivables.customers.slice(0, 5),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { D, kg, money, ZERO } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { DateRange, ReportsService } from './reports.service';

type Num = Prisma.Decimal | number | bigint | null;
const dec = (v: Num) => D(typeof v === 'bigint' ? v.toString() : (v ?? 0));
const pct = (part: Prisma.Decimal, whole: Prisma.Decimal) => (whole.gt(0) ? part.div(whole).times(100).toDecimalPlaces(2) : ZERO);
const sumBy = <T>(xs: T[], f: (x: T) => Prisma.Decimal) => xs.reduce((s, x) => s.plus(f(x)), ZERO);

/** Reportes de la operación: logística, canastillos, sucursales, compras y clientes. */
@Injectable()
export class OperationsReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  // ── Logística ───────────────────────────────────────────

  /** Rutas del período (por fecha de entrega): cumplimiento, problemas, kilos y cobros, por chofer, vehículo y día. */
  async logistics(r: DateRange, f: { driverId?: string; vehicleId?: string } = {}) {
    const rows = await this.prisma.$queryRaw<
      {
        route_id: string; route_date: Date; driver_id: string; driver: string; vehicle_id: string; plate: string;
        stop_status: string; problem_type: string | null; paid: Num; ordered_kg: Num; delivered_kg: Num; sale_total: Num;
        crates_delivered: number; crates_picked_up: number;
      }[]
    >`
      SELECT dr.id AS route_id, dr.route_date, dr.driver_id, u.full_name AS driver, v.id AS vehicle_id, v.plate,
             st.status::text AS stop_status, st.problem_type::text AS problem_type, st.paid_amount AS paid,
             it.ordered_kg, it.delivered_kg, CASE WHEN sa.status <> 'ANNULLED' THEN sa.total_amount - sa.returned_amount END AS sale_total,
             st.crates_delivered, st.crates_picked_up
      FROM delivery_routes dr
      JOIN users u ON u.id = dr.driver_id
      JOIN vehicles v ON v.id = dr.vehicle_id
      JOIN route_stops st ON st.route_id = dr.id
      LEFT JOIN sales sa ON sa.id = st.sale_id
      LEFT JOIN LATERAL (
        SELECT SUM(i.ordered_weight_kg) AS ordered_kg, SUM(COALESCE(i.delivered_weight_kg, 0)) AS delivered_kg
        FROM route_stop_items i WHERE i.stop_id = st.id
      ) it ON true
      WHERE dr.status <> 'CANCELLED' AND dr.route_date BETWEEN ${r.from}::date AND ${r.to}::date
        ${f.driverId ? Prisma.sql`AND dr.driver_id = ${f.driverId}::uuid` : Prisma.empty}
        ${f.vehicleId ? Prisma.sql`AND dr.vehicle_id = ${f.vehicleId}::uuid` : Prisma.empty}`;

    type Acc = { routes: Set<string>; stops: number; delivered: number; partial: number; failed: number; pending: number; orderedKg: Prisma.Decimal; deliveredKg: Prisma.Decimal; sold: Prisma.Decimal; collected: Prisma.Decimal };
    const acc = (): Acc => ({ routes: new Set(), stops: 0, delivered: 0, partial: 0, failed: 0, pending: 0, orderedKg: ZERO, deliveredKg: ZERO, sold: ZERO, collected: ZERO });
    const add = (a: Acc, x: (typeof rows)[number]) => {
      a.routes.add(x.route_id);
      a.stops += 1;
      if (x.stop_status === 'DELIVERED') a.delivered += 1;
      else if (x.stop_status === 'PARTIAL') a.partial += 1;
      else if (x.stop_status === 'FAILED') a.failed += 1;
      else a.pending += 1;
      a.orderedKg = a.orderedKg.plus(dec(x.ordered_kg));
      if (x.stop_status === 'DELIVERED' || x.stop_status === 'PARTIAL') a.deliveredKg = a.deliveredKg.plus(dec(x.delivered_kg));
      a.sold = a.sold.plus(dec(x.sale_total));
      a.collected = a.collected.plus(dec(x.paid));
    };
    const out = (a: Acc) => {
      const resolved = a.delivered + a.partial + a.failed;
      return {
        routes: a.routes.size,
        stops: a.stops,
        delivered: a.delivered,
        partial: a.partial,
        failed: a.failed,
        pending: a.pending,
        // Cumplimiento: entregas (completas o con diferencia) sobre las paradas ya resueltas.
        deliveryRate: resolved ? pct(D(a.delivered + a.partial), D(resolved)) : null,
        orderedKg: kg(a.orderedKg),
        deliveredKg: kg(a.deliveredKg),
        soldAmount: money(a.sold),
        collected: money(a.collected),
        credit: money(Prisma.Decimal.max(ZERO, a.sold.minus(a.collected))),
      };
    };

    const total = acc();
    const drivers = new Map<string, { name: string; a: Acc }>();
    const vehicles = new Map<string, { name: string; a: Acc }>();
    const days = new Map<string, Acc>();
    const problems = new Map<string, number>();
    let cratesDelivered = 0;
    let cratesPickedUp = 0;
    for (const x of rows) {
      add(total, x);
      const d = drivers.get(x.driver_id) ?? { name: x.driver, a: acc() };
      add(d.a, x);
      drivers.set(x.driver_id, d);
      const v = vehicles.get(x.vehicle_id) ?? { name: x.plate, a: acc() };
      add(v.a, x);
      vehicles.set(x.vehicle_id, v);
      const day = x.route_date.toISOString().slice(0, 10);
      const dd = days.get(day) ?? acc();
      add(dd, x);
      days.set(day, dd);
      if (x.problem_type) problems.set(x.problem_type, (problems.get(x.problem_type) ?? 0) + 1);
      cratesDelivered += x.crates_delivered;
      cratesPickedUp += x.crates_picked_up;
    }
    return {
      range: r,
      totals: { ...out(total), cratesDelivered, cratesPickedUp },
      byDriver: [...drivers.entries()].map(([id, d]) => ({ id, name: d.name, ...out(d.a) })).sort((a, b) => b.stops - a.stops),
      byVehicle: [...vehicles.entries()].map(([id, v]) => ({ id, plate: v.name, ...out(v.a) })).sort((a, b) => b.deliveredKg.comparedTo(a.deliveredKg)),
      byDay: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, a]) => ({ day, ...out(a) })),
      problems: [...problems.entries()].map(([problemType, count]) => ({ problemType, count })).sort((a, b) => b.count - a.count),
    };
  }

  // ── Canastillos ─────────────────────────────────────────

  /** Dónde están hoy los canastillos y qué pasó con ellos en el período (entregas, recojos, bajas y sanciones). */
  async crates(r: DateRange) {
    const balances = await this.prisma.$queryRaw<{ holder: string; quantity: Num }[]>`
      SELECT CASE WHEN cb.holder_type = 'WAREHOUSE' THEN (CASE WHEN w.type = 'VEHICLE' THEN 'VEHICLE' ELSE 'WAREHOUSE' END)
                  ELSE cb.holder_type::text END AS holder,
             SUM(cb.quantity) AS quantity
      FROM crate_balances cb
      LEFT JOIN warehouses w ON cb.holder_type = 'WAREHOUSE' AND w.id = cb.holder_id
      GROUP BY 1`;
    const customers = await this.prisma.$queryRaw<{ id: string; code: string; name: string; quantity: number; last_movement: Date | null }[]>`
      SELECT c.id, c.code, c.name, cb.quantity,
             (SELECT MAX(m.created_at) FROM crate_movements m
               WHERE (m.from_type = 'CUSTOMER' AND m.from_id = c.id) OR (m.to_type = 'CUSTOMER' AND m.to_id = c.id)) AS last_movement
      FROM crate_balances cb JOIN customers c ON c.id = cb.holder_id
      WHERE cb.holder_type = 'CUSTOMER' AND cb.quantity > 0
      ORDER BY cb.quantity DESC, c.name`;
    const people = await this.prisma.$queryRaw<{ id: string; name: string; role: string; quantity: number }[]>`
      SELECT u.id, u.full_name AS name, ro.name AS role, cb.quantity
      FROM crate_balances cb JOIN users u ON u.id = cb.holder_id JOIN roles ro ON ro.id = u.role_id
      WHERE cb.holder_type = 'USER' AND cb.quantity <> 0
      ORDER BY cb.quantity DESC`;
    const movements = await this.prisma.$queryRaw<{ type: string; count: Num; quantity: Num; charged: Num }[]>`
      SELECT m.type::text AS type, COUNT(*) AS count, SUM(m.quantity) AS quantity, COALESCE(SUM(m.charge_amount), 0) AS charged
      FROM crate_movements m WHERE ${this.reports.inRange('m.created_at', r)}
      GROUP BY m.type`;

    const byHolder = Object.fromEntries(balances.map((b) => [b.holder, Number(dec(b.quantity))]));
    const total = balances.reduce((t, b) => t + Number(dec(b.quantity)), 0);
    const now = Date.now();
    const mv = (t: string) => movements.find((m) => m.type === t);
    return {
      range: r,
      totals: {
        total,
        inWarehouses: byHolder.WAREHOUSE ?? 0,
        inVehicles: byHolder.VEHICLE ?? 0,
        withCustomers: byHolder.CUSTOMER ?? 0,
        withPeople: byHolder.USER ?? 0,
        customersHolding: customers.length,
        writtenOff: Number(dec(mv('WRITE_OFF')?.quantity ?? 0)),
        charged: money(dec(mv('WRITE_OFF')?.charged ?? 0)),
        shortages: Number(dec(mv('SHORTAGE')?.quantity ?? 0)),
      },
      movements: movements
        .map((m) => ({ type: m.type, count: Number(m.count), quantity: Number(dec(m.quantity)), charged: money(dec(m.charged)) }))
        .sort((a, b) => b.quantity - a.quantity),
      customers: customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        quantity: c.quantity,
        lastMovement: c.last_movement,
        daysSinceMovement: c.last_movement ? Math.floor((now - c.last_movement.getTime()) / 86_400_000) : null,
      })),
      people,
    };
  }

  // ── Sucursales ──────────────────────────────────────────

  /** Cada sucursal (la central incluida) y el reparto en ruta: ventas, margen, kilos, transferencias recibidas, pérdidas y stock. */
  async branches(r: DateRange) {
    const branches = await this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    // Las ventas sin sucursal son las del reparto (salen del almacén del vehículo).
    const key = (id: string | null) => id ?? 'routes';
    const sales = await this.prisma.$queryRaw<{ branch_id: string | null; count: Num; revenue: Num; cost: Num; kg: Num; credit: Num }[]>`
      WITH item_cost AS (
        SELECT a.sale_item_id, SUM((a.weight_kg - a.restocked_weight_kg) * a.cost_per_kg) AS cost FROM sale_lot_allocations a GROUP BY a.sale_item_id
      ),
      per_sale AS (
        SELECT s.id, s.branch_id, s.status, s.total_amount - s.returned_amount AS revenue, s.credit_amount,
               SUM(ic.cost) AS cost, SUM(si.requested_weight_kg - si.returned_weight_kg) AS kg
        FROM sales s JOIN sale_items si ON si.sale_id = s.id JOIN item_cost ic ON ic.sale_item_id = si.id
        WHERE s.status IN ('CONFIRMED', 'RETURNED') AND ${this.reports.inRange('s.created_at', r)}
        GROUP BY s.id
      )
      SELECT branch_id, COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS count, SUM(revenue) AS revenue, SUM(cost) AS cost, SUM(kg) AS kg, SUM(credit_amount) AS credit
      FROM per_sale GROUP BY branch_id`;
    const transfers = await this.prisma.$queryRaw<{ branch_id: string | null; count: Num; sent_kg: Num; received_kg: Num; loss: Num }[]>`
      SELECT w.branch_id, COUNT(DISTINCT t.id) AS count, SUM(ti.sent_weight_kg) AS sent_kg, SUM(ti.received_weight_kg) AS received_kg, SUM(ti.loss_amount) AS loss
      FROM transfers t JOIN transfer_items ti ON ti.transfer_id = t.id JOIN warehouses w ON w.id = t.destination_warehouse_id
      WHERE t.status = 'RECEIVED' AND w.type <> 'VEHICLE' AND ${this.reports.inRange('t.received_at', r)}
      GROUP BY w.branch_id`;
    const losses = await this.prisma.$queryRaw<{ branch_id: string | null; amount: Num; kg: Num }[]>`
      SELECT w.branch_id, SUM(-ia.amount) AS amount, SUM(-ia.weight_kg) AS kg
      FROM inventory_adjustments ia JOIN warehouses w ON w.id = ia.warehouse_id
      WHERE ia.status = 'VALID' AND ia.weight_kg < 0 AND ${this.reports.inRange('ia.created_at', r)}
      GROUP BY w.branch_id`;
    const stock = await this.prisma.$queryRaw<{ branch_id: string | null; kg: Num; value: Num }[]>`
      SELECT w.branch_id, SUM(ib.weight_kg) AS kg, SUM(ib.weight_kg * l.actual_cost_per_kg) AS value
      FROM inventory_balances ib JOIN warehouses w ON w.id = ib.warehouse_id JOIN lots l ON l.id = ib.lot_id
      WHERE ib.weight_kg > 0 AND w.type <> 'VEHICLE'
      GROUP BY w.branch_id`;

    const units = [...branches.map((b) => ({ id: b.id, name: b.name })), { id: 'routes', name: 'Reparto en ruta' }];
    const rows = units.map((u) => {
      const s = sales.find((x) => key(x.branch_id) === u.id);
      const t = transfers.find((x) => key(x.branch_id) === u.id);
      const l = losses.find((x) => key(x.branch_id) === u.id);
      const st = stock.find((x) => key(x.branch_id) === u.id);
      const revenue = money(dec(s?.revenue ?? 0));
      const cost = money(dec(s?.cost ?? 0));
      const margin = money(revenue.minus(cost));
      const sent = dec(t?.sent_kg ?? 0);
      const received = dec(t?.received_kg ?? 0);
      return {
        id: u.id,
        name: u.name,
        salesCount: Number(s?.count ?? 0),
        revenue,
        cost,
        margin,
        marginPercentage: pct(margin, revenue),
        kgSold: kg(dec(s?.kg ?? 0)),
        credit: money(dec(s?.credit ?? 0)),
        transfersReceived: Number(t?.count ?? 0),
        transferredKg: kg(received),
        transitLossKg: kg(sent.minus(received)),
        transitLoss: money(dec(t?.loss ?? 0)),
        lossKg: kg(dec(l?.kg ?? 0)),
        lossAmount: money(dec(l?.amount ?? 0)),
        stockKg: kg(dec(st?.kg ?? 0)),
        stockValue: money(dec(st?.value ?? 0)),
      };
    });
    return {
      range: r,
      totals: {
        revenue: money(sumBy(rows, (x) => x.revenue)),
        margin: money(sumBy(rows, (x) => x.margin)),
        kgSold: kg(sumBy(rows, (x) => x.kgSold)),
        stockKg: kg(sumBy(rows, (x) => x.stockKg)),
      },
      rows,
    };
  }

  // ── Compras ─────────────────────────────────────────────

  /** Compras por proveedor y por producto: kilos, costo por kg, merma de recepción y lo que se debe. */
  async purchases(r: DateRange, f: { supplierId?: string } = {}) {
    const supplier = f.supplierId ? Prisma.sql`AND pu.supplier_id = ${f.supplierId}::uuid` : Prisma.empty;
    const bySupplier = await this.prisma.$queryRaw<{ id: string; name: string; count: Num; kg: Num; amount: Num; unpaid: Num; unpaid_count: Num }[]>`
      SELECT sp.id, sp.name, COUNT(DISTINCT pu.id) AS count, SUM(pi.purchased_weight_kg) AS kg, SUM(pi.subtotal) AS amount,
             (SELECT COALESCE(SUM(x.total_amount), 0) FROM purchases x WHERE x.supplier_id = sp.id AND x.status <> 'CANCELLED' AND x.paid_at IS NULL) AS unpaid,
             (SELECT COUNT(*) FROM purchases x WHERE x.supplier_id = sp.id AND x.status <> 'CANCELLED' AND x.paid_at IS NULL) AS unpaid_count
      FROM purchases pu JOIN purchase_items pi ON pi.purchase_id = pu.id JOIN suppliers sp ON sp.id = pu.supplier_id
      WHERE pu.status <> 'CANCELLED' AND ${this.reports.inRange('pu.purchase_date', r)} ${supplier}
      GROUP BY sp.id, sp.name`;
    const shrink = await this.prisma.$queryRaw<{ supplier_id: string; shrinkage_kg: Num; purchased_kg: Num }[]>`
      SELECT pu.supplier_id, SUM(l.shrinkage_weight_kg) AS shrinkage_kg, SUM(pi.purchased_weight_kg) AS purchased_kg
      FROM lots l JOIN purchases pu ON pu.id = l.purchase_id
      JOIN reception_items ri ON ri.id = l.reception_item_id JOIN purchase_items pi ON pi.id = ri.purchase_item_id
      WHERE pu.status <> 'CANCELLED' AND ${this.reports.inRange('pu.purchase_date', r)} ${supplier}
      GROUP BY pu.supplier_id`;
    const byProduct = await this.prisma.$queryRaw<{ id: string; name: string; kg: Num; amount: Num; min_cost: Num; max_cost: Num }[]>`
      SELECT p.id, p.name, SUM(pi.purchased_weight_kg) AS kg, SUM(pi.subtotal) AS amount,
             MIN(pi.subtotal / NULLIF(pi.purchased_weight_kg, 0)) AS min_cost, MAX(pi.subtotal / NULLIF(pi.purchased_weight_kg, 0)) AS max_cost
      FROM purchases pu JOIN purchase_items pi ON pi.purchase_id = pu.id JOIN products p ON p.id = pi.product_id
      WHERE pu.status <> 'CANCELLED' AND ${this.reports.inRange('pu.purchase_date', r)} ${supplier}
      GROUP BY p.id, p.name`;
    const byDay = await this.prisma.$queryRaw<{ day: Date; amount: Num; kg: Num }[]>`
      WITH days AS (SELECT generate_series(${r.from}::date, ${r.to}::date, interval '1 day')::date AS day)
      SELECT d.day, COALESCE(SUM(pi.subtotal), 0) AS amount, COALESCE(SUM(pi.purchased_weight_kg), 0) AS kg
      FROM days d
      LEFT JOIN purchases pu ON ${this.reports.localDate('pu.purchase_date')} = d.day AND pu.status <> 'CANCELLED' ${supplier}
      LEFT JOIN purchase_items pi ON pi.purchase_id = pu.id
      GROUP BY d.day ORDER BY d.day`;

    const suppliers = bySupplier
      .map((s) => {
        const kgs = dec(s.kg);
        const amount = money(dec(s.amount));
        const sh = shrink.find((x) => x.supplier_id === s.id);
        return {
          id: s.id,
          name: s.name,
          purchases: Number(s.count),
          kg: kg(kgs),
          amount,
          costPerKg: kgs.gt(0) ? money(amount.div(kgs)) : ZERO,
          shrinkagePercentage: sh ? pct(dec(sh.shrinkage_kg), dec(sh.purchased_kg)) : null,
          unpaid: money(dec(s.unpaid)),
          unpaidCount: Number(s.unpaid_count),
        };
      })
      .sort((a, b) => b.amount.comparedTo(a.amount));
    const totalKg = sumBy(suppliers, (x) => x.kg);
    const totalAmount = money(sumBy(suppliers, (x) => x.amount));
    return {
      range: r,
      totals: {
        purchases: suppliers.reduce((t, s) => t + s.purchases, 0),
        kg: kg(totalKg),
        amount: totalAmount,
        costPerKg: totalKg.gt(0) ? money(totalAmount.div(totalKg)) : ZERO,
        unpaid: money(sumBy(suppliers, (x) => x.unpaid)),
      },
      bySupplier: suppliers,
      byProduct: byProduct
        .map((p) => {
          const kgs = dec(p.kg);
          const amount = money(dec(p.amount));
          return { id: p.id, name: p.name, kg: kg(kgs), amount, costPerKg: kgs.gt(0) ? money(amount.div(kgs)) : ZERO, minCostPerKg: money(dec(p.min_cost)), maxCostPerKg: money(dec(p.max_cost)) };
        })
        .sort((a, b) => b.amount.comparedTo(a.amount)),
      byDay: byDay.map((d) => ({ day: d.day.toISOString().slice(0, 10), amount: money(dec(d.amount)), kg: kg(dec(d.kg)) })),
    };
  }

  // ── Clientes ────────────────────────────────────────────

  /** Clientes del período: quién compra más, nuevos, los que dejaron de comprar y ventas por tipo de cliente. */
  async customers(r: DateRange, f: { customerTypeId?: string } = {}) {
    const type = f.customerTypeId ? Prisma.sql`AND c.customer_type_id = ${f.customerTypeId}::uuid` : Prisma.empty;
    const top = await this.prisma.$queryRaw<
      { id: string; code: string; name: string; type: string; count: Num; revenue: Num; kg: Num; last_sale: Date | null; debt: Num; crates: number | null }[]
    >`
      SELECT c.id, c.code, c.name, ct.name AS type, COUNT(*) FILTER (WHERE s.status = 'CONFIRMED') AS count,
             SUM(s.total_amount - s.returned_amount) AS revenue,
             SUM((SELECT SUM(si.requested_weight_kg - si.returned_weight_kg) FROM sale_items si WHERE si.sale_id = s.id)) AS kg,
             (SELECT MAX(z.created_at) FROM sales z WHERE z.customer_id = c.id AND z.status <> 'ANNULLED') AS last_sale,
             c.current_debt AS debt,
             (SELECT cb.quantity FROM crate_balances cb WHERE cb.holder_type = 'CUSTOMER' AND cb.holder_id = c.id) AS crates
      FROM sales s JOIN customers c ON c.id = s.customer_id JOIN customer_types ct ON ct.id = c.customer_type_id
      WHERE s.status IN ('CONFIRMED', 'RETURNED') AND ${this.reports.inRange('s.created_at', r)} ${type}
      GROUP BY c.id, c.code, c.name, ct.name, c.current_debt
      ORDER BY revenue DESC`;
    const byType = await this.prisma.$queryRaw<{ id: string; name: string; customers: Num; revenue: Num }[]>`
      SELECT ct.id, ct.name, COUNT(DISTINCT c.id) AS customers, SUM(s.total_amount - s.returned_amount) AS revenue
      FROM sales s JOIN customers c ON c.id = s.customer_id JOIN customer_types ct ON ct.id = c.customer_type_id
      WHERE s.status IN ('CONFIRMED', 'RETURNED') AND ${this.reports.inRange('s.created_at', r)} ${type}
      GROUP BY ct.id, ct.name ORDER BY revenue DESC`;
    // Dejaron de comprar: compraron en los 60 días anteriores al período y no durante el período.
    const priorFrom = this.reports.shiftDays(r.from, -60);
    const priorTo = this.reports.shiftDays(r.from, -1);
    const lapsed = await this.prisma.$queryRaw<{ id: string; code: string; name: string; phone: string | null; last_sale: Date; revenue: Num }[]>`
      SELECT c.id, c.code, c.name, c.phone, MAX(s.created_at) AS last_sale, SUM(s.total_amount - s.returned_amount) AS revenue
      FROM sales s JOIN customers c ON c.id = s.customer_id
      WHERE s.status IN ('CONFIRMED', 'RETURNED') AND ${this.reports.inRange('s.created_at', { from: priorFrom, to: priorTo })} ${type}
        AND c.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM sales z WHERE z.customer_id = c.id AND z.status IN ('CONFIRMED', 'RETURNED') AND ${this.reports.inRange('z.created_at', r)})
      GROUP BY c.id, c.code, c.name, c.phone
      ORDER BY revenue DESC`;
    const created = await this.prisma.$queryRaw<{ count: Num }[]>`
      SELECT COUNT(*) AS count FROM customers c WHERE ${this.reports.inRange('c.created_at', r)} ${type}`;
    const walkIn = await this.prisma.$queryRaw<{ count: Num; revenue: Num }[]>`
      SELECT COUNT(*) FILTER (WHERE s.status = 'CONFIRMED') AS count, COALESCE(SUM(s.total_amount - s.returned_amount), 0) AS revenue
      FROM sales s WHERE s.customer_id IS NULL AND s.status IN ('CONFIRMED', 'RETURNED') AND ${this.reports.inRange('s.created_at', r)}`;

    const rows = top.map((c) => {
      const revenue = money(dec(c.revenue));
      const count = Number(c.count);
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        sales: count,
        revenue,
        kg: kg(dec(c.kg)),
        averageTicket: count ? money(revenue.div(count)) : ZERO,
        lastSale: c.last_sale,
        debt: money(dec(c.debt)),
        crates: c.crates ?? 0,
      };
    });
    const revenue = money(sumBy(rows, (x) => x.revenue));
    // Concentración: cuánto de la venta a clientes registrados hacen los 5 primeros.
    const top5 = money(sumBy(rows.slice(0, 5), (x) => x.revenue));
    return {
      range: r,
      totals: {
        active: rows.length,
        newCustomers: Number(created[0].count),
        lapsed: lapsed.length,
        revenue,
        top5Percentage: pct(top5, revenue),
        walkInSales: Number(walkIn[0].count),
        walkInRevenue: money(dec(walkIn[0].revenue)),
      },
      byType: byType.map((t) => ({ id: t.id, name: t.name, customers: Number(t.customers), revenue: money(dec(t.revenue)) })),
      customers: rows,
      lapsed: lapsed.map((c) => ({ id: c.id, code: c.code, name: c.name, phone: c.phone, lastSale: c.last_sale, previousRevenue: money(dec(c.revenue)) })),
    };
  }

  // ── Opciones de filtros ─────────────────────────────────

  /** Listas para los filtros de los reportes (sin exigir los permisos de cada catálogo). */
  async options() {
    const [branches, categories, sellers, drivers, vehicles, suppliers, customerTypes, customers] = await Promise.all([
      this.prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.productCategory.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      // Vendedores: quien registró alguna venta (incluye choferes, cuyas entregas son ventas).
      this.prisma.$queryRaw<{ id: string; name: string }[]>`
        SELECT u.id, u.full_name AS name FROM users u WHERE EXISTS (SELECT 1 FROM sales s WHERE s.seller_id = u.id) ORDER BY u.full_name`,
      this.prisma.$queryRaw<{ id: string; name: string }[]>`
        SELECT u.id, u.full_name AS name FROM users u WHERE EXISTS (SELECT 1 FROM delivery_routes dr WHERE dr.driver_id = u.id) ORDER BY u.full_name`,
      this.prisma.vehicle.findMany({ select: { id: true, plate: true, description: true }, orderBy: { plate: 'asc' } }),
      this.prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.customerType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.customer.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
    ]);
    return { branches, categories, sellers, drivers, vehicles, suppliers, customerTypes, customers };
  }

  // ── Operación del día (tablero) ─────────────────────────

  /** Rutas de hoy y canastillos fuera: lo que el tablero muestra a quien tiene permiso de logística o canastillos. */
  async today(include: { routes: boolean; crates: boolean }) {
    const today = this.reports.localToday();
    const routes = include.routes
      ? (
          await this.prisma.$queryRaw<{ routes: Num; in_progress: Num; planned: Num; stops: Num; delivered: Num; failed: Num; pending: Num; collected: Num }[]>`
            SELECT COUNT(DISTINCT dr.id) AS routes,
                   COUNT(DISTINCT dr.id) FILTER (WHERE dr.status = 'IN_PROGRESS') AS in_progress,
                   COUNT(DISTINCT dr.id) FILTER (WHERE dr.status = 'PLANNED') AS planned,
                   COUNT(st.id) AS stops,
                   COUNT(st.id) FILTER (WHERE st.status IN ('DELIVERED', 'PARTIAL')) AS delivered,
                   COUNT(st.id) FILTER (WHERE st.status = 'FAILED') AS failed,
                   COUNT(st.id) FILTER (WHERE st.status = 'PENDING') AS pending,
                   COALESCE(SUM(st.paid_amount), 0) AS collected
            FROM delivery_routes dr LEFT JOIN route_stops st ON st.route_id = dr.id
            WHERE dr.route_date = ${today}::date AND dr.status <> 'CANCELLED'`
        ).map((x) => ({
          routes: Number(x.routes),
          inProgress: Number(x.in_progress),
          planned: Number(x.planned),
          stops: Number(x.stops),
          delivered: Number(x.delivered),
          failed: Number(x.failed),
          pending: Number(x.pending),
          collected: money(dec(x.collected)),
        }))[0]
      : undefined;
    const crates = include.crates
      ? (
          await this.prisma.$queryRaw<{ customers: Num; holders: Num; people: Num }[]>`
            SELECT COALESCE(SUM(quantity) FILTER (WHERE holder_type = 'CUSTOMER'), 0) AS customers,
                   COUNT(*) FILTER (WHERE holder_type = 'CUSTOMER' AND quantity > 0) AS holders,
                   COALESCE(SUM(quantity) FILTER (WHERE holder_type = 'USER'), 0) AS people
            FROM crate_balances`
        ).map((x) => ({ withCustomers: Number(x.customers), customersHolding: Number(x.holders), withPeople: Number(x.people) }))[0]
      : undefined;
    return { date: today, routes, crates };
  }
}

/**
 * Genera ~30 días de operación realista para la demo, usando la API real (todas las reglas de negocio se aplican).
 *
 *   npm run demo:data -- --reset            (requiere la API en marcha en API_URL, por defecto http://localhost:3000/api)
 *
 * BORRA las operaciones existentes (compras, lotes, ventas, clientes, preventas...). Conserva usuarios, roles,
 * productos, proveedores, sucursales y almacenes. Haga un respaldo antes (pg_dump).
 *
 * Cada día simulado se ejecuta contra la API y luego sus registros se mueven a la fecha simulada (08:00–18:30, hora local).
 * Durante la simulación los lotes llevan vencimientos futuros (la API no vende lotes vencidos respecto de hoy);
 * al final se les asigna el vencimiento real: recepción + vida útil del producto.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const DAYS = Number(process.env.DEMO_DAYS ?? 30);
const TZ_OFFSET_HOURS = 4; // Bolivia: UTC−4, sin horario de verano
const prisma = new PrismaClient();

// ── Azar reproducible ───────────────────────────────────────
let seed = 20261006;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const weighted = <T>(xs: [T, number][]) => {
  let r = rand() * xs.reduce((s, [, w]) => s + w, 0);
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[xs.length - 1][0];
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── API ─────────────────────────────────────────────────────
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
async function api<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, Array.isArray(data?.message) ? data.message.join('. ') : (data?.message ?? res.statusText));
  return data as T;
}
const login = async (username: string, password: string, client?: string) =>
  (await api<{ accessToken: string }>('POST', '/auth/login', undefined, { username, password, client })).accessToken;

// ── Fechas ──────────────────────────────────────────────────
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Instante UTC de una hora local de Bolivia. */
const localTime = (iso: string, hour: number, minute = 0) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), hour + TZ_OFFSET_HOURS, minute));
/** Las columnas son timestamp sin zona con valores UTC: se pasan como texto para que la sesión no aplique su zona. */
const ts = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '');

// Columnas de fecha que se mueven al día simulado.
const TIME_COLUMNS: [string, string[]][] = [
  ['purchases', ['purchase_date', 'created_at', 'annulled_at']],
  ['receptions', ['received_at', 'created_at']],
  ['lots', ['created_at']],
  ['lot_prices', ['valid_from', 'created_at', 'valid_to']],
  ['inventory_movements', ['movement_date']],
  ['sales', ['created_at', 'annulled_at']],
  ['sale_lot_allocations', ['created_at']],
  ['payments', ['payment_date']],
  ['receivable_movements', ['created_at']],
  ['presales', ['created_at', 'created_at_device', 'updated_at', 'cancelled_at']],
  ['sync_operations', ['created_at_device', 'received_at_server']],
  ['gps_positions', ['captured_at_device', 'received_at_server']],
  ['devices', ['created_at', 'last_sync_at']],
  ['customers', ['created_at', 'updated_at']],
  ['customer_addresses', ['created_at']],
  ['audit_logs', ['created_at']],
  ['transfers', ['sent_at', 'received_at', 'cancelled_at']],
  ['inventory_adjustments', ['created_at', 'annulled_at']],
  ['sale_returns', ['created_at']],
  ['delivery_routes', ['created_at', 'dispatched_at', 'closed_at', 'cancelled_at']],
  ['route_stops', ['resolved_at_device', 'resolved_at']],
  ['vehicles', ['created_at', 'updated_at']],
  ['crate_movements', ['created_at']],
  ['cash_movements', ['created_at']],
  ['cash_sessions', ['opened_at', 'closed_at']],
  ['settlements', ['created_at']],
  ['receipt_prints', ['printed_at']],
];

/** Mueve lo creado desde `realStart` a la ventana [windowStart, windowEnd], conservando el orden relativo. */
async function backdate(realStart: Date, windowStart: Date, windowEnd: Date) {
  const realEnd = new Date();
  const factor = (windowEnd.getTime() - windowStart.getTime()) / Math.max(1000, realEnd.getTime() - realStart.getTime());
  for (const [table, cols] of TIME_COLUMNS) {
    for (const col of cols) {
      await prisma.$executeRawUnsafe(
        `UPDATE ${table} SET ${col} = $1::timestamp + (${col} - $2::timestamp) * $3::float8 WHERE ${col} >= $2::timestamp`,
        ts(windowStart),
        ts(realStart),
        factor,
      );
    }
  }
}

// ── Datos maestros de la demo ───────────────────────────────
const CUSTOMERS: { name: string; type: string; rank?: string; phone: string; doc?: string; label: string; address: string }[] = [
  { name: 'Pollería Doña Juana', type: 'Mercado', rank: 'ORO', phone: '70812345', doc: '4821563', label: 'Puesto', address: 'Mercado Los Pozos, pasillo 3, puesto 18' },
  { name: 'Distribuidora Hnos. Vaca', type: 'Mayorista', rank: 'ORO', phone: '33456712', doc: '1028456019', label: 'Depósito', address: 'Parque Industrial, manzano 7' },
  { name: 'Restaurante El Fogón Cruceño', type: 'Otro', rank: 'PLATA', phone: '77651234', doc: '1023987015', label: 'Local', address: 'Av. Monseñor Rivero #245' },
  { name: 'Mercado Mutualista · Puesto 45 (Carmen Rojas)', type: 'Mercado', rank: 'PLATA', phone: '76543987', label: 'Puesto', address: 'Mercado Mutualista, puesto 45' },
  { name: 'Minimarket La Esquina', type: 'Tienda', rank: 'PLATA', phone: '71234890', label: 'Tienda', address: 'Calle Warnes esq. Ingavi' },
  { name: 'Pollos a la Brasa Copacabana', type: 'Otro', rank: 'PLATA', phone: '72345678', doc: '1029876011', label: 'Local', address: 'Av. Busch, 2do anillo' },
  { name: 'Pensión Doña Lucha', type: 'Otro', rank: 'BRONCE', phone: '75678123', label: 'Pensión', address: 'Barrio Equipetrol, calle 9' },
  { name: 'Tienda Don Pedro', type: 'Tienda', rank: 'BRONCE', phone: '70987654', label: 'Tienda', address: 'Av. Banzer, 4to anillo' },
  { name: 'Mercado Abasto · Puesto 112 (Rosa Mamani)', type: 'Mercado', rank: 'BRONCE', phone: '78123456', label: 'Puesto', address: 'Mercado Abasto, nave 2, puesto 112' },
  { name: 'Comedor Estudiantil Central', type: 'Otro', rank: 'BRONCE', phone: '33567890', label: 'Comedor', address: 'Av. Busch, módulo central' },
  { name: 'Tienda Doña Elena', type: 'Tienda', phone: '76012345', label: 'Tienda', address: 'Barrio Plan 3000, calle 5' },
  { name: 'Snack El Paso', type: 'Otro', phone: '79876543', label: 'Local', address: 'Av. Santos Dumont, 3er anillo' },
  { name: 'Juan Pérez (feria Barrio Lindo)', type: 'Persona particular', phone: '73456789', label: 'Feria', address: 'Feria Barrio Lindo, domingo' },
];

interface ProductPlan {
  supplier: string;
  baseCost: number;
  minKg: number;
  maxKg: number;
  everyDays: number;
  shelfDays: number;
  demand: number; // peso relativo en las ventas
  unitsPerKg?: number;
}
const PLAN: Record<string, ProductPlan> = {
  'PE-SOF': { supplier: 'Avícola SOFIA Distribución', baseCost: 14.2, minKg: 105, maxKg: 145, everyDays: 1, shelfDays: 6, demand: 34, unitsPerKg: 0.5 },
  'PE-PIO': { supplier: 'Granja Avícola El Rosal', baseCost: 14.6, minKg: 120, maxKg: 160, everyDays: 2, shelfDays: 6, demand: 20, unitsPerKg: 0.5 },
  'PE-GRA': { supplier: 'Granja San Pedro', baseCost: 12.8, minKg: 60, maxKg: 85, everyDays: 1, shelfDays: 6, demand: 22, unitsPerKg: 0.45 },
  'DE-PEC': { supplier: 'Avícola SOFIA Distribución', baseCost: 20.5, minKg: 75, maxKg: 100, everyDays: 2, shelfDays: 4, demand: 11 },
  'DE-PIE': { supplier: 'Avícola SOFIA Distribución', baseCost: 15.6, minKg: 55, maxKg: 80, everyDays: 2, shelfDays: 4, demand: 8 },
  'DE-ALA': { supplier: 'Avícola SOFIA Distribución', baseCost: 13.4, minKg: 20, maxKg: 28, everyDays: 2, shelfDays: 4, demand: 3 },
  'ME-HIG': { supplier: 'Granja Avícola El Rosal', baseCost: 8.5, minKg: 10, maxKg: 14, everyDays: 2, shelfDays: 3, demand: 2 },
};

// Compras calibradas a una demanda de ~310 kg/día para que el stock rote como pollo fresco.
// Kg típicos por venta según el tipo de cliente.
const KG_BY_TYPE: Record<string, [number, number]> = {
  Mayorista: [50, 140],
  Mercado: [25, 70],
  Otro: [15, 45],
  Tienda: [10, 30],
  'Persona particular': [3, 10],
  quick: [2, 12],
};

const KG_PER_CRATE = new Map<string, number>();
/** Canastillos de una línea de pollo entero de 18 kg o más (los kilos siguen siendo el peso real). */
const cratesFor = (productId: string, weightKg: number) => {
  const per = KG_PER_CRATE.get(productId);
  return per && weightKg >= 18 ? Math.max(1, Math.round(weightKg / per)) : undefined;
};
const stats = { purchases: 0, sales: 0, presales: 0, attended: 0, credit: 0, skippedLines: 0, transfers: 0, branchSales: 0, routes: 0, failedStops: 0, collections: 0, events: [] as string[] };
// Las compras cubren también lo que se envía a la sucursal.
const BRANCH_SUPPLY = 1.06;

async function main() {
  if (!process.argv.includes('--reset')) {
    console.error('Este script BORRA las operaciones existentes. Ejecútelo con --reset para confirmar.');
    process.exit(1);
  }
  await api('GET', '/health');

  // ── 1. Limpieza ──────────────────────────────────────────
  console.log('Limpiando operaciones…');
  await prisma.$executeRawUnsafe(`TRUNCATE receipt_prints, cash_movements, cash_sessions, settlements, crate_movements, crate_balances, route_stop_items, route_stops, delivery_routes, vehicles,
    sale_return_items, sale_returns, transfer_items, transfers, inventory_adjustments,
    presale_items, presales, sale_lot_allocations, sale_items, payments, receivable_movements,
    sales, inventory_movements, inventory_balances, lot_prices, lots, reception_items, receptions, purchase_items, purchases,
    sync_operations, gps_positions, devices, customer_addresses, customers, audit_logs RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`UPDATE document_sequences SET last_value = 0`);
  await prisma.$executeRawUnsafe(`UPDATE cash_accounts SET balance = 0`);
  // Los almacenes móviles se recrean con los vehículos.
  await prisma.$executeRawUnsafe(`DELETE FROM warehouses WHERE type = 'VEHICLE'`);
  // Usuarios y tipos de cliente creados al probar (no los del seed) se retiran; ya no tienen operaciones asociadas.
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE username NOT IN ('admin', 'vcentral', 'vsucursal', 'preventista', 'contador', 'chofer', 'cobrador')`);
  await prisma.$executeRawUnsafe(`DELETE FROM customer_types WHERE name NOT IN ('Tienda', 'Mercado', 'Mayorista', 'Persona particular', 'Otro')`);
  await prisma.$executeRawUnsafe(`UPDATE customer_types SET is_active = true`);
  await prisma.$executeRawUnsafe(`UPDATE users SET is_active = true`);

  const admin = await login('admin', '1234');
  const seller = await login('vcentral', '1111');
  const branchSeller = await login('vsucursal', '2222');
  // La sucursal pesa lo que recibe: así las transferencias muestran diferencias reales.
  await prisma.branch.update({ where: { code: 'SUC1' }, data: { transferWeighingEnabled: true } });
  const preseller = await login('preventista', '3333', 'mobile');
  const driver = await login('chofer', '5555', 'mobile');
  const ADMIN_AUTH = { username: 'admin', password: '1234' };

  const products: any[] = await api('GET', '/products', admin);
  const suppliers: any[] = await api('GET', '/suppliers', admin);
  const warehouses: any[] = await api('GET', '/warehouses', admin);
  const types: any[] = await api('GET', '/customer-types', admin);
  const ranks: any[] = await api('GET', '/customer-ranks', admin);
  const central = warehouses.find((w) => w.code === 'ALM-CEN');
  const branchWh = warehouses.find((w) => w.code === 'ALM-SUC1');
  const byCode = Object.fromEntries(products.map((p) => [p.code, p]));
  // El pollo entero se vende también por canastillo (≈ peso de uno lleno); mayoristas y mercados lo piden así.
  for (const [code, kgPerCrate] of Object.entries({ 'PE-SOF': 22, 'PE-PIO': 22, 'PE-GRA': 20 })) {
    if (!byCode[code]) continue;
    await api('PATCH', `/products/${byCode[code].id}`, admin, { kgPerCrate });
    KG_PER_CRATE.set(byCode[code].id, kgPerCrate);
  }
  const supplierId = (name: string) => suppliers.find((s) => s.name === name)!.id;

  const today = localToday();
  const firstDay = addDays(today, -(DAYS - 1));

  // ── 2. Clientes (registrados antes del período) ──────────
  const realStart = new Date();
  const customers: any[] = [];
  for (const c of CUSTOMERS) {
    const rank = c.rank ? ranks.find((r) => r.code === c.rank) : undefined;
    customers.push(
      await api('POST', '/customers', admin, {
        name: c.name,
        customerTypeId: types.find((t) => t.name === c.type)!.id,
        rankId: rank?.id,
        creditEnabled: !!rank,
        phone: c.phone,
        documentId: c.doc,
        address: { label: c.label, address: c.address, latitude: r3(-17.78 + between(-0.04, 0.04)) , longitude: r3(-63.18 + between(-0.04, 0.04)) },
      }),
    );
  }
  const cashAccounts: any[] = await api('GET', '/cash/accounts', admin);
  const CAJA = cashAccounts.find((a) => a.code === 'CAJA-CEN')!.id;
  const CAJA_SUC = cashAccounts.find((a) => a.code === 'CAJA-SUC1')!.id;
  const BANCO = cashAccounts.find((a) => a.code === 'BANCO')!.id;
  await api('POST', '/cash/movements', admin, { accountId: CAJA, category: 'OTHER_INCOME', amount: 20000, description: 'Capital inicial en caja' });
  await api('POST', '/cash/movements', admin, { accountId: BANCO, category: 'OTHER_INCOME', amount: 150000, description: 'Capital inicial en el banco' });
  await api('POST', '/cash/movements', admin, { accountId: CAJA_SUC, category: 'OTHER_INCOME', amount: 1500, description: 'Fondo de cambio de la sucursal' });
  await backdate(realStart, localTime(addDays(firstDay, -20), 9), localTime(addDays(firstDay, -2), 17));
  const typeOf = (c: any) => c.customerType.name as string;

  // Flota: un vehículo propio y uno subcontratado.
  const fleet: any[] = [
    await api('POST', '/vehicles', admin, { plate: '3456-KTR', description: 'Toyota Hilux con furgón térmico', ownership: 'OWN', capacityKg: 1200, capacityCrates: 60 }),
    await api('POST', '/vehicles', admin, { plate: '2817-PLD', description: 'Camión Hino 3 t', ownership: 'SUBCONTRACTED', ownerName: 'Transportes Ríos', capacityKg: 2500, capacityCrates: 120 }),
  ];
  const drivers: any[] = await api('GET', '/routes/drivers', admin);
  const driverId = drivers.find((x) => x.username === 'chofer')!.id;
  const collector = await login('cobrador', '6666', 'mobile');

  // Canastillos del negocio: inventario inicial en el central y una parte en la sucursal.
  await api('POST', '/crates/movements', admin, { type: 'INITIAL', quantity: 220, to: { type: 'WAREHOUSE', id: central.id }, reason: 'Inventario inicial de canastillos' });
  await api('POST', '/crates/movements', admin, {
    type: 'TRANSFER', quantity: 30, from: { type: 'WAREHOUSE', id: central.id }, to: { type: 'WAREHOUSE', id: branchWh.id }, reason: 'Dotación de la sucursal',
  });

  // ── 3. Días ──────────────────────────────────────────────
  const costs = Object.fromEntries(Object.entries(PLAN).map(([code, p]) => [code, p.baseCost]));
  const pendingPresales: { id: string; customer: any; items: { productId: string; weightKg: number }[] }[] = [];

  for (let d = 0; d < DAYS; d++) {
    const day = addDays(firstDay, d);
    const isToday = day === today;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = domingo
    const stepStart = new Date();
    const daysAgo = DAYS - 1 - d;

    // Apertura de las cajas (a veces el conteo no coincide por unos bolivianos).
    await openCash(seller, CAJA);
    await openCash(branchSeller, CAJA_SUC);
    if (weekday !== 0) await payCreditPurchases(admin, day);

    // Compras y recepción (domingo sin compras).
    if (weekday !== 0) {
      const bySupplier = new Map<string, { productId: string; purchasedWeightKg: number; unitCost: number; purchasedQuantity?: number; code: string }[]>();
      for (const [code, plan] of Object.entries(PLAN)) {
        if (d % plan.everyDays !== 0) continue;
        costs[code] = r2(Math.min(plan.baseCost * 1.08, Math.max(plan.baseCost * 0.93, costs[code] + between(-0.25, 0.25))));
        const kg = r3(between(plan.minKg, plan.maxKg) * BRANCH_SUPPLY * (weekday === 6 ? 1.25 : 1)); // sábado: más demanda
        const list = bySupplier.get(plan.supplier) ?? [];
        list.push({ code, productId: byCode[code].id, purchasedWeightKg: kg, unitCost: costs[code], purchasedQuantity: plan.unitsPerKg ? Math.round(kg * plan.unitsPerKg) : undefined });
        bySupplier.set(plan.supplier, list);
      }
      for (const [supplierName, items] of bySupplier) {
        const purchase: any = await api('POST', '/purchases', admin, {
          supplierId: supplierId(supplierName),
          warehouseId: central.id,
          paymentMethod: weighted([['EFECTIVO', 2], ['TRANSFERENCIA', 5], ['QR', 1], ['CREDITO_PROVEEDOR', 2]]),
          items: items.map(({ code: _c, ...i }) => i),
        });
        stats.purchases++;
        await api('POST', `/purchases/${purchase.id}/reception`, admin, {
          items: purchase.items.map((pi: any) => {
            const code = items.find((i) => i.productId === pi.productId)!.code;
            const crates = Math.ceil(Number(pi.purchasedWeightKg) / 22);
            const shrink = Number(pi.purchasedWeightKg) * between(0.003, code.startsWith('PE') ? 0.025 : 0.015);
            return {
              purchaseItemId: pi.id,
              receivedWeightKg: r3(Number(pi.purchasedWeightKg) - shrink + crates * 1.8),
              canastilloWeightKg: r3(crates * 1.8),
              receivedQuantity: pi.purchasedQuantity ? Math.max(0, Number(pi.purchasedQuantity) - int(0, 2)) : undefined,
              // Vencimiento provisional futuro y creciente (mantiene el orden FEFO cronológico); se corrige al final.
              expiryDate: addDays(today, 60 + d),
              shrinkageTreatment: rand() < 0.25 ? 'INCORPORATE' : 'ABSORB',
            };
          }),
        });
      }
    }

    // Preventas pendientes de días anteriores: salen en una ruta por la mañana y el chofer las entrega.
    const toDeliver = pendingPresales.splice(0);
    if (toDeliver.length) {
      const retry = await runRoute({ admin, driver, driverId, vehicle: fleet[d % 2], day, presales: toDeliver, partial: isToday });
      if (!isToday) pendingPresales.push(...retry);
    }

    // Ventas del día.
    const salesToday = weekday === 0 ? int(4, 7) : weekday === 6 ? int(13, 18) : int(9, 14);
    const sellableCustomers = customers.filter((c) => typeOf(c) !== 'Persona particular' || rand() < 0.3);
    for (let s = 0; s < salesToday; s++) {
      const quick = rand() < 0.3;
      const customer = quick ? null : pick(sellableCustomers);
      const [lo, hi] = KG_BY_TYPE[quick ? 'quick' : typeOf(customer)];
      const lines = int(1, quick ? 1 : 3);
      const codes = new Set<string>();
      while (codes.size < lines) codes.add(weighted(Object.entries(PLAN).map(([c, p]) => [c, p.demand])));
      const items = [...codes].map((code) => ({ productId: byCode[code].id, weightKg: r3(between(lo, hi) / lines) }));
      try {
        await sell(rand() < 0.8 ? seller : admin, { customer, items });
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        stats.skippedLines++;
      }
    }

    // Sucursal: se abastece desde el central día por medio (lo recibe pesado) y vende al contado.
    if ((weekday !== 0 && d % 2 === 0) || isToday) await supplyBranch(seller, branchSeller, central.id, branchWh.id, byCode, isToday);
    if (d > 0) await branchSales(branchSeller, branchWh.id, weekday);

    // Inventario operativo: conteos semanales, una baja y devoluciones.
    if (daysAgo % 7 === 1) await physicalCount(admin, central.id);
    if (daysAgo === 5) await damagedLoss(admin, central.id);
    if (daysAgo === 3) await returnSale(seller, ADMIN_AUTH, 'RESTOCK');
    if (daysAgo === 1) await returnSale(seller, ADMIN_AUTH, 'DISCARD');

    // Cobrador: ronda de cobranza por la tarde (no los domingos).
    if (weekday !== 0 && d > 2) await collectorRound(collector, isToday, admin, central.id);
    if (daysAgo === 8) await crateSanction(admin);

    // Eventos para mostrar controles en la demo.
    if (daysAgo === 6) await annulOne(admin);
    if (daysAgo === 4) await forcedLotSale(admin, customers, byCode, central.id);
    if (daysAgo === 3) await priceChangeSale(admin, customers, byCode, central.id);
    if (daysAgo === 2) await creditException(seller, customers, byCode, central.id, ADMIN_AUTH);

    // Preventas del día desde la app (se atienden al día siguiente; las de hoy quedan pendientes para la demo).
    const bootstrap: any = await api('GET', '/mobile/bootstrap', preseller);
    const refPrice = Object.fromEntries(bootstrap.products.map((p: any) => [p.id, p.referencePrice ? Number(p.referencePrice) : null]));
    const targets = customers.filter((c) => ['Tienda', 'Mercado', 'Otro'].includes(typeOf(c)));
    const ops: any[] = [];
    const created: typeof pendingPresales = [];
    for (let i = 0, n = weekday === 0 ? 0 : int(3, 5); i < n; i++) {
      const customer = pick(targets);
      const codes = [...new Set([weighted<string>([['PE-SOF', 5], ['PE-PIO', 3], ['PE-GRA', 3], ['DE-PEC', 2]]), weighted<string>([['PE-SOF', 3], ['DE-PIE', 2], ['DE-PEC', 2]])])];
      const [lo, hi] = KG_BY_TYPE[typeOf(customer)];
      const items = codes
        .filter((c) => refPrice[byCode[c].id] !== null)
        .map((c) => {
          const weightKg = r3(between(lo, hi) / codes.length);
          return { productId: byCode[c].id, weightKg, crates: cratesFor(byCode[c].id, weightKg), unitPrice: refPrice[byCode[c].id]! };
        });
      if (!items.length) continue;
      const id = randomUUID();
      const address = customer.addresses[0];
      const lat = Number(address.latitude) + between(-0.0005, 0.0005);
      const lng = Number(address.longitude) + between(-0.0005, 0.0005);
      ops.push({
        deviceOperationId: randomUUID(),
        operationType: 'PRESALE_CREATE',
        createdAtDevice: new Date().toISOString(),
        payload: { id, customerId: customer.id, addressId: address.id, scheduledDeliveryDate: addDays(day, 1), latitude: r3(lat), longitude: r3(lng), items },
      });
      ops.push({
        deviceOperationId: randomUUID(),
        operationType: 'GPS_POSITION',
        createdAtDevice: new Date().toISOString(),
        payload: { latitude: lat, longitude: lng, accuracyMeters: r2(between(4, 15)), eventType: 'PRESALE', referenceId: id },
      });
      created.push({ id, customer, items: items.map(({ productId, weightKg }) => ({ productId, weightKg })) });
    }
    if (ops.length) {
      await api('POST', '/mobile/sync', preseller, { deviceUuid: 'demo-preventista-android', appVersion: '0.1.0', operations: ops });
      stats.presales += created.length;
      // Una de cada ~8 se cancela desde el teléfono (el cliente desistió).
      const keep: typeof created = [];
      for (const p of created) {
        if (!isToday && rand() < 0.12) {
          await api('POST', '/mobile/sync', preseller, {
            deviceUuid: 'demo-preventista-android',
            operations: [{ deviceOperationId: randomUUID(), operationType: 'PRESALE_CANCEL', createdAtDevice: new Date().toISOString(), payload: { presaleId: p.id, reason: 'El cliente ya compró en otro lado' } }],
          });
        } else keep.push(p);
      }
      if (!isToday) pendingPresales.push(...keep);
    }

    // Finanzas del día: gastos, rendición del chofer y del cobrador, depósito y cierre de cajas (hoy quedan abiertas).
    await dailyExpenses(admin, CAJA, BANCO, day, weekday, fleet);
    if (!isToday) {
      await settleAll(seller, CAJA);
      await depositSurplus(admin, CAJA, BANCO);
      await closeCash(seller, CAJA);
      await closeCash(branchSeller, CAJA_SUC);
    }

    // Ventana horaria del día simulado.
    const windowStart = localTime(day, 7, 30);
    let windowEnd = localTime(day, 18, 30);
    if (isToday) {
      const limit = new Date(Date.now() - 2 * 60_000);
      if (windowEnd > limit) windowEnd = limit;
    }
    if (windowEnd > windowStart) await backdate(stepStart, windowStart, windowEnd);
    process.stdout.write(`\r  ${day}  compras ${stats.purchases}  ventas ${stats.sales}  preventas ${stats.presales}   `);
  }
  console.log();

  // ── 4. Vencimientos reales: recepción (fecha local) + vida útil ──
  for (const [code, plan] of Object.entries(PLAN)) {
    await prisma.$executeRawUnsafe(
      `UPDATE lots l SET expiry_date = (((r.received_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date + $1::int)
         FROM receptions r, products p
        WHERE r.id = l.reception_id AND p.id = l.product_id AND p.code = $2`,
      plan.shelfDays,
      code,
    );
  }
  await prisma.$executeRawUnsafe(`UPDATE reception_items ri SET expiry_date = l.expiry_date FROM lots l WHERE l.reception_item_id = ri.id`);

  // ── 5. Resumen ───────────────────────────────────────────
  const [{ revenue, debt, stock }] = await prisma.$queryRawUnsafe<any[]>(`SELECT
    (SELECT COALESCE(SUM(total_amount),0) FROM sales WHERE status='CONFIRMED') AS revenue,
    (SELECT COALESCE(SUM(current_debt),0) FROM customers) AS debt,
    (SELECT COALESCE(SUM(weight_kg),0) FROM inventory_balances) AS stock`);
  const pendingNow = await prisma.presale.count({ where: { status: 'PENDING' } });
  console.log(`\nDatos de demo generados (${firstDay} → ${today}):`);
  console.log(`  ${stats.purchases} compras · ${stats.sales} ventas (${stats.credit} con crédito) · ${stats.presales} preventas (${stats.attended} atendidas, ${pendingNow} pendientes)`);
  console.log(`  Ventas confirmadas: Bs ${Number(revenue).toFixed(2)} · Por cobrar: Bs ${Number(debt).toFixed(2)} · Stock: ${Number(stock).toFixed(1)} kg`);
  console.log(`  ${stats.transfers} transferencias a la sucursal · ${stats.branchSales} ventas en sucursal`);
  const money: any = await api('GET', '/cash/summary', await login('admin', '1234'));
  console.log(`  Efectivo en cajas: Bs ${Number(money.cashOnHand).toFixed(2)} · Banco: Bs ${Number(money.inBank).toFixed(2)} · Por rendir: Bs ${(Number(money.pendingSettlement.cash) + Number(money.pendingSettlement.digital)).toFixed(2)} · Por pagar a proveedores: Bs ${Number(money.supplierPayables.amount).toFixed(2)}`);
  console.log(`  ${stats.routes} rutas de entrega · ${stats.failedStops} paradas no entregadas · ${stats.collections} cobros en la calle`);
  const prints = await prisma.receiptPrint.groupBy({ by: ['channel'], _count: true });
  console.log(`  Comprobantes impresos: ${prints.map((p) => `${p._count} por ${p.channel === 'WEB' ? 'el panel' : 'Bluetooth'}`).join(' · ')}`);
  console.log(`  Líneas omitidas por falta de stock: ${stats.skippedLines}`);
  for (const e of stats.events) console.log(`  · ${e}`);
}

// ── Venta con reglas de pago según el cliente ───────────────
async function sell(token: string, o: { customer: any | null; items: { productId: string; weightKg: number }[]; presaleId?: string }) {
  const base = {
    warehouseId: (await warehouseId()),
    customerId: o.customer?.id,
    presaleId: o.presaleId,
    // Clientes registrados con pedidos grandes de pollo entero: por canastillo (y a veces se llevan los canastillos).
    items: o.items.map((i) => ({ ...i, crates: o.customer ? cratesFor(i.productId, i.weightKg) : undefined })),
    cratesToCustomer: rand() < 0.6,
    paymentMethod: weighted([['EFECTIVO', 65], ['QR', 30], ['TRANSFERENCIA', 5]]),
  };
  const quote: any = await api('POST', '/sales/quote', token, base);
  const total = Number(quote.total);
  let paidAmount: number | undefined;
  if (o.customer?.creditEnabled) {
    const r = rand();
    if (r < 0.35) paidAmount = 0;
    else if (r < 0.5) paidAmount = r2(total * 0.5);
  }
  let sale: any;
  try {
    sale = await api('POST', '/sales', token, { ...base, paidAmount });
    if (paidAmount !== undefined) stats.credit++;
  } catch (e) {
    // Límite de crédito superado: se cobra al contado (sin autorización especial).
    if (e instanceof ApiError && e.status === 403 && paidAmount !== undefined) sale = await api('POST', '/sales', token, base);
    else throw e;
  }
  stats.sales++;
  await printReceipt(token, 'venta', sale.id, 0.6);
}

let _wh: string | undefined;
async function warehouseId() {
  if (!_wh) _wh = (await prisma.warehouse.findFirstOrThrow({ where: { code: 'ALM-CEN' } })).id;
  return _wh;
}

async function annulOne(admin: string) {
  const sale = await prisma.sale.findFirst({ where: { status: 'CONFIRMED', customerId: { not: null } }, orderBy: { createdAt: 'desc' } });
  if (!sale) return;
  await api('POST', `/sales/${sale.id}/annul`, admin, { reason: 'Venta registrada al cliente equivocado; se volvió a emitir' });
  stats.events.push(`Venta ${sale.saleNumber} anulada (stock devuelto a sus lotes)`);
}

/** Producto entero con más stock vendible en el almacén (con al menos `minLots` lotes), para los eventos de la demo. */
async function richestProduct(admin: string, byCode: any, wh: string, minLots = 1) {
  let best: { product: any; lots: any[]; kg: number } | null = null;
  // Primero pollo entero; si ninguno tiene suficientes lotes, cualquier producto.
  for (const code of minLots > 1 ? Object.keys(PLAN) : ['PE-SOF', 'PE-PIO', 'PE-GRA']) {
    const lots: any[] = await api('GET', `/sales/available-lots?warehouseId=${wh}&productId=${byCode[code].id}`, admin);
    const kg = lots.reduce((t, l) => t + Number(l.availableKg), 0);
    if (lots.length >= minLots && (!best || kg > best.kg)) best = { product: byCode[code], lots, kg };
  }
  return best;
}

async function forcedLotSale(admin: string, customers: any[], byCode: any, wh: string) {
  const best = await richestProduct(admin, byCode, wh, 2);
  if (!best) {
    stats.events.push('(sin generar) venta con lote forzado: ningún producto con dos lotes disponibles');
    return;
  }
  const lots = best.lots;
  const newest = lots[lots.length - 1];
  const kg = Math.min(25, Number(newest.availableKg));
  const customer = customers.find((c) => c.name.startsWith('Restaurante'));
  const sale: any = await api('POST', '/sales', admin, {
    warehouseId: wh,
    customerId: customer.id,
    items: [{ productId: best.product.id, weightKg: kg, lots: [{ lotId: newest.lotId, weightKg: kg }] }],
    paymentMethod: 'QR',
    forceReason: 'El restaurante pidió pollo del ingreso de hoy para un evento',
  });
  stats.sales++;
  stats.events.push(`Venta ${sale.saleNumber} con lote ${newest.lotCode} forzado fuera de FEFO (autorizado y auditado)`);
}

async function priceChangeSale(admin: string, customers: any[], byCode: any, wh: string) {
  const customer = customers.find((c) => c.name.startsWith('Distribuidora'));
  // Pedido grande por volumen: hasta 120 kg, según lo que haya de SOFIA.
  const best = await richestProduct(admin, byCode, wh);
  const weightKg = r3(Math.min(120, (best?.kg ?? 0) * 0.8));
  if (!best || weightKg < 20) {
    stats.events.push('(sin generar) venta con precio modificado: poco stock de pollo entero');
    return;
  }
  const base = { warehouseId: wh, customerId: customer.id, items: [{ productId: best.product.id, weightKg }], paymentMethod: 'TRANSFERENCIA' };
  try {
    const quote: any = await api('POST', '/sales/quote', admin, base);
    const agreed = r2(Number(quote.lines[0].originalUnitPrice) - 0.6);
    const sale: any = await api('POST', '/sales', admin, {
      ...base,
      items: [{ ...base.items[0], unitPrice: agreed, priceChangeReason: `Precio acordado por volumen (${weightKg} kg)` }],
    });
    stats.sales++;
    stats.events.push(`Venta ${sale.saleNumber} con precio modificado a Bs ${agreed}/kg (precio original conservado)`);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    stats.events.push(`(sin generar) venta con precio modificado: ${e.message}`);
  }
}

async function creditException(seller: string, customers: any[], byCode: any, wh: string, auth: { username: string; password: string }) {
  const ranked = customers.filter((c) => c.creditEnabled);
  const rows = await prisma.customer.findMany({ where: { id: { in: ranked.map((c) => c.id) } } });
  const target = rows.sort((a, b) => Number(b.currentDebt) / Number(b.creditLimit) - Number(a.currentDebt) / Number(a.creditLimit))[0];
  if (!target) return;
  const available = Number(target.creditLimit) - Number(target.currentDebt);
  const best = await richestProduct(seller, byCode, wh);
  const kg = r3(Math.min(Math.max(20, (available + 400) / 15), (best?.kg ?? 0) * 0.9));
  if (!best || kg < 5) {
    stats.events.push('(sin generar) excepción de crédito: poco stock de pollo entero');
    return;
  }
  const base = { warehouseId: wh, customerId: target.id, items: [{ productId: best.product.id, weightKg: kg }], paidAmount: 0, paymentMethod: 'EFECTIVO' };
  try {
    const quote: any = await api('POST', '/sales/quote', seller, base);
    if (!quote.issues.some((i: any) => i.type === 'CREDIT_LIMIT')) {
      stats.events.push(`(sin generar) excepción de crédito: ${target.name} no supera su límite`);
      return;
    }
    const sale: any = await api('POST', '/sales', seller, { ...base, authorization: auth, creditExceptionReason: 'Cliente frecuente; paga los viernes' });
    stats.sales++;
    stats.credit++;
    stats.events.push(`Venta ${sale.saleNumber} a ${target.name} superando el límite de crédito, autorizada por el administrador`);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    stats.events.push(`(sin generar) excepción de crédito: ${e.message}`);
  }
}

// ── Rutas de entrega ────────────────────────────────────────

/** Firma de demostración: un trazo a mano alzada dibujado en un PNG en escala de grises. */
function signaturePng(): string {
  const W = 240, H = 90;
  const px = new Uint8Array(W * H).fill(255);
  const dot = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const xi = Math.round(x + dx), yi = Math.round(y + dy);
      if (xi >= 0 && xi < W && yi >= 0 && yi < H) px[yi * W + xi] = 20;
    }
  };
  const a = between(8, 16), f1 = between(0.05, 0.09), f2 = between(0.15, 0.3), phase = between(0, 6);
  let prev: [number, number] | null = null;
  for (let x = 15; x < W - 15; x += 0.5) {
    const y = H / 2 + a * Math.sin(x * f1 + phase) + (a / 2) * Math.sin(x * f2) * Math.cos(x * 0.03);
    if (prev) for (let t = 0; t <= 1; t += 0.25) dot(prev[0] + (x - prev[0]) * t, prev[1] + (y - prev[1]) * t);
    prev = [x, y];
  }
  for (let x = 30; x < W - 40; x += 0.5) dot(x, H - 18 + Math.sin(x * 0.2)); // rúbrica
  const raw = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W + 1)] = 0;
    for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = px[y * W + x];
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 0; // escala de grises
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const RECEIVERS = ['Doña Juana', 'Carmen Rojas', 'Don Pedro', 'Rosa Mamani', 'Encargado de cocina', 'Lucía Vaca', 'Mario Suárez', 'Elena Flores'];
const op = (operationType: string, payload: unknown) => ({ deviceOperationId: randomUUID(), operationType, payload, createdAtDevice: new Date().toISOString() });

/**
 * Arma y despacha la ruta del día con las preventas pendientes; el chofer entrega desde el "teléfono"
 * (misma sincronización que la app), con su recorrido GPS. Devuelve las preventas que no se entregaron.
 * Con `partial` (hoy) entrega solo la primera mitad y deja la ruta en curso para la demo.
 */
async function runRoute(o: { admin: string; driver: string; driverId: string; vehicle: any; day: string; presales: { id: string; customer: any }[]; partial: boolean }) {
  // Solo salen los pedidos que el stock vendible del central puede cubrir; los demás se cancelan con aviso.
  const centralId = (await prisma.warehouse.findFirstOrThrow({ where: { code: 'ALM-CEN' } })).id;
  const lots: any[] = await api('GET', `/inventory/lots?warehouseId=${centralId}`, o.admin);
  const stock = new Map<string, number>();
  for (const l of lots.filter((x) => !x.expired)) stock.set(l.product.id, (stock.get(l.product.id) ?? 0) + Number(l.weightKg));
  const fits: typeof o.presales = [];
  for (const p of o.presales) {
    const detail: any = await api('GET', `/presales/${p.id}`, o.admin);
    if (detail.items.every((i: any) => Number(i.weightKg) <= (stock.get(i.productId) ?? 0))) {
      for (const i of detail.items) stock.set(i.productId, stock.get(i.productId)! - Number(i.weightKg));
      fits.push(p);
    } else {
      await api('POST', `/presales/${p.id}/cancel`, o.admin, { reason: 'Sin stock suficiente al despachar; se avisó al cliente' });
    }
  }
  if (!fits.length) return [];
  let route: any = await api('POST', '/routes', o.admin, { routeDate: o.day, vehicleId: o.vehicle.id, driverId: o.driverId, stops: fits.map((p) => ({ presaleId: p.id })) });
  // Un pequeño margen sobre lo pedido (los pollos se pesan al entregar), si hay stock.
  route = await api('POST', `/routes/${route.id}/dispatch`, o.admin, {
    cratesLoaded: Math.min(route.summary.estimatedCrates + 2, o.vehicle.capacityCrates, await centralCrates()),
    loads: route.loadSheet.map((l: any) => ({ productId: l.productId, weightKg: r3(Number(l.orderedKg) + Math.min(Number(l.orderedKg) * 0.03, Math.max(0, stock.get(l.productId) ?? 0))) })),
  });
  stats.routes++;
  const retry: { id: string; customer: any; items: any[] }[] = [];
  const stops: any[] = route.stops;
  const upto = o.partial ? Math.ceil(stops.length / 2) : stops.length;
  let pos: [number, number] = [-17.7833 + between(-0.004, 0.004), -63.1821 + between(-0.004, 0.004)]; // sale del almacén central
  for (const stop of stops.slice(0, upto)) {
    const target: [number, number] = [Number(stop.address?.latitude ?? pos[0]), Number(stop.address?.longitude ?? pos[1])];
    // Trayecto con algunas posiciones intermedias (el teléfono registra cada ~10 min).
    const gps = [] as any[];
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      gps.push(op('GPS_POSITION', { latitude: pos[0] + (target[0] - pos[0]) * t + between(-0.001, 0.001), longitude: pos[1] + (target[1] - pos[1]) * t + between(-0.001, 0.001), accuracyMeters: r2(between(5, 18)), eventType: 'PERIODIC' }));
    }
    pos = target;
    const at = { latitude: target[0] + between(-0.0003, 0.0003), longitude: target[1] + between(-0.0003, 0.0003) };
    gps.push(op('GPS_POSITION', { ...at, accuracyMeters: r2(between(4, 10)), eventType: 'DELIVERY', referenceId: stop.id }));

    let delivery: any;
    if (rand() < 0.08) {
      delivery = op('DELIVERY_FAIL', { stopId: stop.id, problemType: weighted([['CLOSED', 3], ['NOT_FOUND', 2], ['NO_PAYMENT', 1]]), notes: 'El cliente avisó que pase mañana', ...at });
      stats.failedStops++;
      retry.push({ id: stop.presaleId, customer: stop.customer, items: [] });
    } else {
      // Peso real al entregar: el pollo entero rara vez pesa exactamente lo pedido.
      const items = stop.items.map((i: any) => {
        const ordered = Number(i.orderedWeightKg);
        const differs = i.product.code.startsWith('PE') && rand() < 0.35;
        const delivered = differs ? r3(ordered * between(0.97, 1.02)) : ordered;
        return { productId: i.product.id, deliveredWeightKg: delivered, differenceReason: differs ? 'Peso real al entregar' : undefined };
      });
      const quote: any = await api('POST', '/sales/quote', o.admin, {
        warehouseId: o.vehicle.warehouseId, customerId: stop.customer.id, items: items.map((i: any) => ({ productId: i.productId, weightKg: i.deliveredWeightKg })), paymentMethod: 'EFECTIVO',
      });
      const total = Number(quote.total);
      const r = rand();
      const paid = stop.customer.creditEnabled ? (r < 0.4 ? 0 : r < 0.55 ? r2(total * 0.5) : total) : total;
      delivery = op('DELIVERY_COMPLETE', {
        stopId: stop.id, items, paidAmount: paid, paymentMethod: paid > 0 ? weighted([['EFECTIVO', 7], ['QR', 3]]) : undefined,
        receivedByName: pick(RECEIVERS), signature: signaturePng(), ...at,
        // Llenos según los kilos (≈ 20 kg por canastillo) y vacíos que el cliente tenía de antes.
        cratesDelivered: Math.ceil(items.reduce((t: number, i: any) => t + i.deliveredWeightKg, 0) / 20),
        cratesPickedUp: Math.min(customerCrates.get(stop.customer.id) ?? 0, int(0, 4)),
      });
    }
    // El chofer imprime el comprobante por Bluetooth casi siempre (a veces el cliente pide una copia).
    const prints = delivery.operationType === 'DELIVERY_COMPLETE' && rand() < 0.85
      ? Array.from({ length: rand() < 0.1 ? 2 : 1 }, () => op('RECEIPT_PRINT', { documentType: 'entrega', documentId: stop.id }))
      : [];
    const results: any[] = (await api<any>('POST', '/mobile/sync', o.driver, { deviceUuid: 'demo-chofer-android', appVersion: '0.4.0', operations: [...gps, delivery, ...prints] })).results;
    const last = results.find((r) => r.deviceOperationId === delivery.deviceOperationId);
    if (last.status !== 'SYNCED') {
      // Rechazada (p. ej. excede el crédito sin autorización): Administración la registra como no entregada.
      await api('POST', `/routes/stops/${stop.id}/fail`, o.admin, { problemType: 'NO_PAYMENT', notes: `No se pudo registrar: ${last.error}` });
      retry.push({ id: stop.presaleId, customer: stop.customer, items: [] });
      stats.failedStops++;
    } else if (delivery.operationType === 'DELIVERY_COMPLETE') {
      stats.attended++;
      stats.sales++;
      const held = customerCrates.get(stop.customer.id) ?? 0;
      customerCrates.set(stop.customer.id, held + delivery.payload.cratesDelivered - delivery.payload.cratesPickedUp);
    }
  }
  if (!o.partial) {
    // Liquidación: a veces falta un poco al pesar el sobrante.
    const veh: any[] = await api('GET', `/inventory/lots?warehouseId=${o.vehicle.warehouseId}`, o.admin);
    const now: any = await api('GET', `/routes/${route.id}`, o.admin);
    const expected = Math.max(0, now.summary.crates.expectedBack);
    await api('POST', `/routes/${route.id}/close`, o.admin, {
      // A veces falta un canastillo: queda a cargo del chofer.
      cratesReturned: expected > 0 && rand() < 0.15 ? expected - 1 : expected,
      returns: veh.map((l, idx) => ({ lotId: l.lotId, receivedWeightKg: idx === 0 && rand() < 0.3 ? r3(Math.max(0, Number(l.weightKg) - between(0.1, 0.4))) : Number(l.weightKg) })),
      notes: 'Sobrante pesado al volver',
    });
  } else {
    stats.events.push(`Ruta ${route.routeNumber} en curso: ${upto} de ${stops.length} paradas entregadas (el resto, pendiente para la demo)`);
  }
  return retry;
}

// ── Finanzas ────────────────────────────────────────────────

async function cashAccount(id: string) {
  return prisma.cashAccount.findUniqueOrThrow({ where: { id }, include: { sessions: { where: { status: 'OPEN' } } } });
}

async function openCash(token: string, accountId: string) {
  const a = await cashAccount(accountId);
  if (a.sessions.length) return;
  const balance = Number(a.balance);
  const counted = rand() < 0.1 ? r2(Math.max(0, balance - int(1, 10))) : balance;
  await api('POST', '/cash/sessions', token, { accountId, countedAmount: counted, notes: counted !== balance ? 'Faltó cambio al contar' : undefined });
}

async function closeCash(token: string, accountId: string) {
  const a = await cashAccount(accountId);
  if (!a.sessions.length) return;
  const balance = Number(a.balance);
  const short = rand() < 0.15;
  const counted = short ? r2(Math.max(0, balance - between(0.5, 15))) : balance;
  await api('POST', `/cash/sessions/${a.sessions[0].id}/close`, token, { countedAmount: counted, notes: short ? 'Faltante de cambio en el arqueo' : undefined });
  await printReceipt(token, 'caja', a.sessions[0].id, 0.8);
}

/** Combustible de los vehículos que salieron, servicios y sueldos (sábado), alquiler (primer día del mes). */
async function dailyExpenses(admin: string, caja: string, banco: string, day: string, weekday: number, fleet: any[]) {
  if (weekday === 0) return;
  const routesToday = await prisma.deliveryRoute.count({ where: { routeDate: new Date(`${day}T00:00:00Z`), status: { not: 'CANCELLED' } } });
  // Del efectivo si alcanza; si no, con la tarjeta del banco.
  const from = async (amount: number) => (Number((await cashAccount(caja)).balance) >= amount ? caja : banco);
  for (let i = 0; i < Math.max(1, routesToday); i++) {
    const amount = r2(between(140, 260));
    await api('POST', '/cash/movements', admin, { accountId: await from(amount), category: 'EXPENSE', expenseType: 'COMBUSTIBLE', amount, description: `Diésel ${fleet[i % fleet.length].plate}` });
  }
  if (rand() < 0.2) {
    const amount = r2(between(40, 120));
    await api('POST', '/cash/movements', admin, { accountId: await from(amount), category: 'EXPENSE', expenseType: 'INSUMOS', amount, description: 'Bolsas y hielo' });
  }
  if (weekday === 6) {
    await api('POST', '/cash/movements', admin, { accountId: banco, category: 'EXPENSE', expenseType: 'SUELDOS', amount: 3200, description: 'Sueldos de la semana (4 personas)' });
  }
  if (day.endsWith('-01') || day.endsWith('-15')) {
    await api('POST', '/cash/movements', admin, { accountId: banco, category: 'EXPENSE', expenseType: 'ALQUILER', amount: 1750, description: 'Alquiler del depósito (quincena)' });
    await api('POST', '/cash/movements', admin, { accountId: banco, category: 'EXPENSE', expenseType: 'SERVICIOS', amount: r2(between(380, 520)), description: 'Luz y agua de la cámara de frío' });
  }
}

/** Rendición de choferes y cobradores al terminar el día (a veces falta cambio). */
async function settleAll(token: string, caja: string) {
  const pending: any[] = await api('GET', '/cash/settlements/pending', token);
  for (const p of pending) {
    const expected = Number(p.cash);
    const short = expected > 50 && rand() < 0.12;
    const counted = short ? r2(expected - between(2, 20)) : expected;
    const st: any = await api('POST', '/cash/settlements', token, { userId: p.user.id, cashAccountId: caja, countedCash: counted, notes: short ? 'Faltó cambio; se descontará' : undefined });
    await printReceipt(token, 'rendicion', st.id, 0.9);
  }
}

/** Comprobante impreso desde el panel (térmica de mostrador); a veces se reimprime una copia. */
async function printReceipt(token: string, type: string, id: string, probability: number) {
  if (rand() >= probability) return;
  await api('POST', `/receipts/${type}/${id}/print`, token, { channel: 'WEB' });
  if (rand() < 0.05) await api('POST', `/receipts/${type}/${id}/print`, token, { channel: 'WEB' });
}

/** El efectivo que sobra se deposita en el banco (queda un fondo para el día siguiente). */
async function depositSurplus(admin: string, caja: string, banco: string) {
  const a = await cashAccount(caja);
  const surplus = Math.floor(Number(a.balance) - 12000);
  if (surplus > 3000) await api('POST', '/cash/transfers', admin, { fromAccountId: caja, toAccountId: banco, amount: surplus, description: 'Depósito del día' });
}

/** Las compras a crédito del proveedor se pagan por transferencia a los 3 días. */
async function payCreditPurchases(admin: string, day: string) {
  const due = await prisma.purchase.findMany({ where: { paidAt: null, status: { not: 'CANCELLED' }, purchaseDate: { lt: new Date(`${addDays(day, -2)}T00:00:00Z`) } } });
  for (const p of due) await api('POST', `/purchases/${p.id}/pay`, admin, { paymentMethod: 'TRANSFERENCIA' });
}

// ── Canastillos y cobranza ──────────────────────────────────

/** Canastillos que cada cliente tiene según el sistema (para que los recojos sean coherentes). */
const customerCrates = new Map<string, number>();

async function centralCrates() {
  const central = await prisma.warehouse.findFirstOrThrow({ where: { code: 'ALM-CEN' } });
  const b = await prisma.crateBalance.findUnique({ where: { holderType_holderId: { holderType: 'WAREHOUSE', holderId: central.id } } });
  return Math.max(0, b?.quantity ?? 0);
}

/** El cobrador visita a los que más deben: cobra una parte o todo, con firma, y recoge canastillos vacíos. */
async function collectorRound(collector: string, isToday: boolean, admin: string, centralId: string) {
  const debtors = await prisma.customer.findMany({ where: { currentDebt: { gt: 50 } }, include: { addresses: true }, orderBy: { currentDebt: 'desc' }, take: 8 });
  const visits = debtors.sort(() => rand() - 0.5).slice(0, isToday ? 2 : int(2, 3));
  const ops: any[] = [];
  for (const c of visits) {
    const debt = Number(c.currentDebt);
    const amount = r2(rand() < 0.15 ? debt : Math.max(20, Math.round(debt * between(0.2, 0.45))));
    const held = customerCrates.get(c.id) ?? 0;
    const crates = Math.min(held, int(0, 3));
    const a = c.addresses[0];
    const at = a?.latitude ? { latitude: Number(a.latitude) + between(-0.0003, 0.0003), longitude: Number(a.longitude) + between(-0.0003, 0.0003) } : {};
    const id = randomUUID();
    if ('latitude' in at) ops.push(op('GPS_POSITION', { ...at, accuracyMeters: r2(between(4, 12)), eventType: 'COLLECTION', referenceId: id }));
    ops.push(op('COLLECTION_CREATE', {
      id, customerId: c.id, amount, paymentMethod: weighted([['EFECTIVO', 6], ['QR', 3], ['TRANSFERENCIA', 1]]),
      ...(rand() < 0.4 ? { referenceNumber: `QR-${int(100000, 999999)}` } : {}),
      paidByName: pick(RECEIVERS), signature: signaturePng(), cratesPickedUp: crates || undefined, ...at,
    }));
    if (rand() < 0.9) ops.push(op('RECEIPT_PRINT', { documentType: 'cobro', documentId: id }));
    if (crates) customerCrates.set(c.id, held - crates);
  }
  // Los vacíos que el cobrador recoge los entrega en el central al terminar la ronda.
  if (ops.length) {
    const res: any = await api('POST', '/mobile/sync', collector, { deviceUuid: 'demo-cobrador-android', appVersion: '0.4.0', operations: ops });
    const collectionOps = new Set(ops.filter((o) => o.operationType === 'COLLECTION_CREATE').map((o) => o.deviceOperationId));
    stats.collections += res.results.filter((r: any) => r.status === 'SYNCED' && collectionOps.has(r.deviceOperationId)).length;
  }
  const picked = ops.filter((o) => o.operationType === 'COLLECTION_CREATE').reduce((t, o) => t + (o.payload.cratesPickedUp ?? 0), 0);
  if (picked > 0 && !isToday) {
    const me = await prisma.user.findUniqueOrThrow({ where: { username: 'cobrador' } });
    await api('POST', '/crates/movements', admin, {
      type: 'RETURN', quantity: picked, from: { type: 'USER', id: me.id }, to: { type: 'WAREHOUSE', id: centralId }, reason: 'Entrega del cobrador al terminar la ronda',
    });
  }
}

/** Un cliente perdió canastillos: se dan de baja y se le cobra una sanción. */
async function crateSanction(admin: string) {
  const holder = [...customerCrates.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!holder || holder[1] < 2) return;
  const mv: any = await api('POST', '/crates/movements', admin, {
    type: 'WRITE_OFF', quantity: 2, from: { type: 'CUSTOMER', id: holder[0] }, reason: 'El cliente informó que se le perdieron', chargePerCrate: 35,
  });
  customerCrates.set(holder[0], holder[1] - 2);
  stats.events.push(`Baja de 2 canastillos perdidos por ${mv.from.name}, con sanción de Bs 70`);
}

// ── Sucursal e inventario operativo ─────────────────────────

/** Envío central → sucursal; la sucursal lo recibe pesado (a veces llega algo menos). El de hoy queda en tránsito. */
async function supplyBranch(seller: string, branchSeller: string, from: string, to: string, byCode: any, inTransit: boolean) {
  // Lo que se pide se ajusta a lo vendible en el central (se deja un margen para el mostrador).
  const lots = (await api<any[]>('GET', `/inventory/lots?warehouseId=${from}`, seller)).filter((l) => !l.expired);
  const available = (productId: string) => lots.filter((l) => l.product.id === productId).reduce((t, l) => t + Number(l.weightKg), 0);
  const wanted = [
    { productId: byCode['PE-PIO'].id, weightKg: between(18, 28) },
    { productId: byCode['PE-GRA'].id, weightKg: between(12, 20) },
    { productId: byCode['PE-SOF'].id, weightKg: between(10, 16) },
    ...(rand() < 0.6 ? [{ productId: byCode['DE-PIE'].id, weightKg: between(5, 9) }] : []),
  ];
  const items = wanted
    .map((i) => ({ productId: i.productId, weightKg: r3(Math.min(i.weightKg, available(i.productId) * 0.5)) }))
    .filter((i) => i.weightKg >= 5)
    .slice(0, 3);
  if (!items.length) return;
  let transfer: any;
  try {
    transfer = await api('POST', '/transfers', seller, { originWarehouseId: from, destinationWarehouseId: to, items, notes: 'Reposición de la sucursal' });
  } catch (e) {
    if (e instanceof ApiError) return;
    throw e;
  }
  stats.transfers++;
  if (inTransit) {
    stats.events.push(`Transferencia ${transfer.transferNumber} en tránsito a la sucursal (lista para recibir en la demo)`);
    return;
  }
  const short = rand() < 0.35;
  await api('POST', `/transfers/${transfer.id}/receive`, branchSeller, {
    items: transfer.items.map((i: any, idx: number) => ({
      itemId: i.id,
      receivedWeightKg: short && idx === 0 ? r3(Math.max(0, Number(i.sentWeightKg) - between(0.2, 0.7))) : Number(i.sentWeightKg),
    })),
    notes: short ? 'Goteo en el viaje' : undefined,
  });
}

/** Ventas al contado en la sucursal con lo que tiene en stock. */
async function branchSales(branchSeller: string, wh: string, weekday: number) {
  const balances = await prisma.inventoryBalance.findMany({ where: { warehouseId: wh, weightKg: { gt: 1 } }, include: { lot: true } });
  const today = localToday();
  const sellable = balances.filter((b) => b.lot.expiryDate.toISOString().slice(0, 10) >= today).map((b) => ({ productId: b.productId, kg: Number(b.weightKg) }));
  for (let i = 0, n = weekday === 0 ? int(1, 2) : int(2, 4); i < n && sellable.length; i++) {
    const b = pick(sellable);
    const weightKg = r3(Math.min(b.kg - 0.5, between(2, 9)));
    if (weightKg <= 0.5) continue;
    const base = { warehouseId: wh, items: [{ productId: b.productId, weightKg }], paymentMethod: weighted([['EFECTIVO', 7], ['QR', 3]]) };
    try {
      const quote: any = await api('POST', '/sales/quote', branchSeller, base);
      await api('POST', '/sales', branchSeller, { ...base, paidAmount: Number(quote.total) });
      b.kg -= weightKg;
      stats.branchSales++;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
  }
}

/** Conteo físico semanal de dos lotes del central: suele faltar algo por goteo. */
async function physicalCount(admin: string, wh: string) {
  const lots: any[] = (await api<any[]>('GET', `/inventory/lots?warehouseId=${wh}`, admin)).filter((l) => !l.expired && Number(l.weightKg) > 15);
  for (const lot of lots.sort(() => rand() - 0.5).slice(0, 2)) {
    const counted = r3(Number(lot.weightKg) - between(0.3, 1.6));
    await api('POST', '/inventory/adjustments', admin, {
      kind: 'COUNT', reasonCode: 'PHYSICAL_COUNT', warehouseId: wh, lotId: lot.lotId, countedWeightKg: counted, notes: 'Conteo semanal de cámara (goteo)',
    });
  }
}

async function damagedLoss(admin: string, wh: string) {
  const lot = (await api<any[]>('GET', `/inventory/lots?warehouseId=${wh}`, admin)).find((l) => !l.expired && Number(l.weightKg) > 10);
  if (!lot) return;
  const adj: any = await api('POST', '/inventory/adjustments', admin, {
    kind: 'LOSS', reasonCode: 'DAMAGED', warehouseId: wh, lotId: lot.lotId, weightKg: 3.5, notes: 'Bolsas rotas al descargar el camión',
  });
  stats.events.push(`Baja ${adj.adjustmentNumber}: 3,5 kg de ${lot.product.name} dañados`);
}

/** Devolución de una venta reciente a crédito, autorizada por el administrador. */
async function returnSale(seller: string, auth: { username: string; password: string }, disposition: 'RESTOCK' | 'DISCARD') {
  const sale = await prisma.sale.findFirst({
    where: { status: 'CONFIRMED', customerId: { not: null }, creditAmount: { gt: 0 }, returnedAmount: 0 },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!sale) return;
  const item = sale.items[0];
  const weightKg = r3(Math.min(Number(item.requestedWeightKg), between(1.5, 4)));
  const reason = disposition === 'RESTOCK' ? 'El cliente pidió menos de lo que se le despachó' : 'Producto con mal olor al abrir la bolsa';
  const dv: any = await api('POST', `/sales/${sale.id}/returns`, seller, { reason, items: [{ saleItemId: item.id, weightKg, disposition }], authorization: auth });
  stats.events.push(`Devolución ${dv.returnNumber} de ${sale.saleNumber} (${disposition === 'RESTOCK' ? 'reingresó al stock' : 'descartada'})`);
}

main()
  .catch((e) => {
    console.error('\nError:', e instanceof ApiError ? `${e.status} ${e.message}` : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

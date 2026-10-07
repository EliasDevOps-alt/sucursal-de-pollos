import { Prisma, PrismaClient } from '@prisma/client';
import { D } from '../common/decimal';
import { AvailableLot } from '../sales/allocation';

type Db = Prisma.TransactionClient | PrismaClient;

/** Fecha local de hoy como 'YYYY-MM-DD' (los lotes vencidos no se venden ni se transfieren). */
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Lotes con saldo del producto en el almacén, activos y no vencidos, en orden FEFO.
 * Con `lock` bloquea las filas de saldo hasta el fin de la transacción.
 */
export async function availableLots(db: Db, warehouseId: string, productId: string, lock: boolean): Promise<AvailableLot[]> {
  const rows = await db.$queryRaw<
    { lot_id: string; lot_code: string; expiry_date: Date; weight_kg: Prisma.Decimal; actual_cost_per_kg: Prisma.Decimal }[]
  >`
    SELECT ib.lot_id, l.lot_code, l.expiry_date, ib.weight_kg, l.actual_cost_per_kg
    FROM inventory_balances ib
    JOIN lots l ON l.id = ib.lot_id
    WHERE ib.warehouse_id = ${warehouseId}::uuid
      AND ib.product_id = ${productId}::uuid
      AND ib.weight_kg > 0
      AND l.status = 'ACTIVE'
      AND l.expiry_date >= ${todayLocal()}::date
    ORDER BY l.expiry_date ASC, l.created_at ASC
    ${lock ? Prisma.sql`FOR UPDATE OF ib` : Prisma.empty}`;
  return rows.map((r) => ({
    lotId: r.lot_id,
    lotCode: r.lot_code,
    expiryDate: r.expiry_date,
    availableKg: D(r.weight_kg),
    costPerKg: D(r.actual_cost_per_kg),
  }));
}

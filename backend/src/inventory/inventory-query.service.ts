import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { D, kg, money, ZERO } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stock por producto: kg disponibles, valor a costo real, lotes y vencimiento más próximo. */
  async stockByProduct(warehouseId?: string) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { weightKg: { gt: 0 }, warehouseId },
      include: {
        product: { select: { id: true, code: true, name: true, category: { select: { name: true } } } },
        lot: { select: { lotCode: true, expiryDate: true, actualCostPerKg: true } },
      },
    });

    const byProduct = new Map<
      string,
      { product: (typeof balances)[number]['product']; weightKg: Prisma.Decimal; value: Prisma.Decimal; lots: number; nextExpiry: Date | null }
    >();
    for (const b of balances) {
      const row = byProduct.get(b.productId) ?? { product: b.product, weightKg: ZERO, value: ZERO, lots: 0, nextExpiry: null };
      row.weightKg = row.weightKg.plus(b.weightKg);
      row.value = row.value.plus(D(b.weightKg).times(b.lot.actualCostPerKg));
      row.lots += 1;
      if (!row.nextExpiry || b.lot.expiryDate < row.nextExpiry) row.nextExpiry = b.lot.expiryDate;
      byProduct.set(b.productId, row);
    }
    return [...byProduct.values()]
      .map((r) => ({ ...r, weightKg: kg(r.weightKg), value: money(r.value) }))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }

  /** Saldo por lote en un almacén (incluye vencidos, para poder darlos de baja), en orden FEFO. */
  async lotBalances(warehouseId: string, productId?: string) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());
    const rows = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId, productId, weightKg: { gt: 0 } },
      include: {
        product: { select: { id: true, code: true, name: true } },
        lot: { select: { id: true, lotCode: true, expiryDate: true, actualCostPerKg: true, status: true } },
      },
      orderBy: [{ lot: { expiryDate: 'asc' } }, { lot: { createdAt: 'asc' } }],
    });
    return rows.map((b) => ({
      lotId: b.lotId,
      lotCode: b.lot.lotCode,
      product: b.product,
      expiryDate: b.lot.expiryDate,
      expired: b.lot.expiryDate.toISOString().slice(0, 10) < today,
      weightKg: kg(D(b.weightKg)),
      costPerKg: b.lot.actualCostPerKg,
      value: money(D(b.weightKg).times(b.lot.actualCostPerKg)),
    }));
  }

  /** Kardex general (todos los lotes) con filtros. */
  movements(f: { productId?: string; warehouseId?: string; from?: string; to?: string }) {
    const movementDate: Prisma.DateTimeFilter = {};
    for (const [key, value] of [['gte', f.from], ['lte', f.to]] as const) {
      if (!value) continue;
      const date = new Date(value);
      if (isNaN(date.getTime())) throw new BadRequestException(`Fecha inválida: ${value}`);
      movementDate[key] = date;
    }
    return this.prisma.inventoryMovement.findMany({
      where: { productId: f.productId, warehouseId: f.warehouseId, movementDate: f.from || f.to ? movementDate : undefined },
      include: {
        product: { select: { code: true, name: true } },
        lot: { select: { id: true, lotCode: true } },
        warehouse: { select: { code: true, name: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { movementDate: 'desc' },
      take: 500,
    });
  }
}

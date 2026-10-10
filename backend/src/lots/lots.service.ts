import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LotStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { D, kg, perKg, ZERO } from '../common/decimal';
import { suggestedPrice } from '../purchases/reception-calc';
import { PrismaService } from '../prisma/prisma.service';
import { SetLotPriceDto } from './dto/lot.dto';

const DAY_MS = 86_400_000;

export interface LotFilters {
  productId?: string;
  warehouseId?: string;
  status?: LotStatus;
  onlyAvailable?: boolean;
  expiringWithinDays?: number;
}

/** Días hasta el vencimiento contados en fechas de calendario (negativo = vencido). */
function daysToExpiry(expiryDate: Date, today = new Date()) {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiryDate.getTime() - start) / DAY_MS);
}

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters: LotFilters) {
    const where: Prisma.LotWhereInput = {
      productId: filters.productId,
      status: filters.status,
    };
    if (filters.expiringWithinDays !== undefined) {
      where.expiryDate = { lte: new Date(Date.now() + filters.expiringWithinDays * DAY_MS) };
    }

    const lots = await this.prisma.lot.findMany({
      where,
      include: {
        product: { select: { id: true, code: true, name: true } },
        purchase: { select: { id: true, purchaseNumber: true, supplier: { select: { name: true } } } },
        inventoryBalances: {
          where: filters.warehouseId ? { warehouseId: filters.warehouseId } : {},
          include: { warehouse: { select: { id: true, code: true, name: true } } },
        },
        prices: { where: { isActive: true, branchId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      // FEFO: primero el que vence antes.
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    });

    return lots
      .map(({ inventoryBalances, prices, ...lot }) => {
        const availableWeightKg = kg(inventoryBalances.reduce((s, b) => s.plus(b.weightKg), ZERO));
        return {
          ...lot,
          availableWeightKg,
          availableQuantity: inventoryBalances.reduce((s, b) => s.plus(b.quantity), ZERO),
          balances: inventoryBalances,
          currentPrice: prices[0] ?? null,
          daysToExpiry: daysToExpiry(lot.expiryDate),
        };
      })
      .filter((l) => !filters.onlyAvailable || l.availableWeightKg.gt(0));
  }

  async findOne(id: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      include: {
        product: { include: { category: true } },
        purchase: { select: { id: true, purchaseNumber: true, purchaseDate: true, supplier: { select: { id: true, name: true } } } },
        reception: { select: { id: true, receivedAt: true, receivedBy: { select: { fullName: true } } } },
        receptionItem: true,
        warehouse: { select: { id: true, code: true, name: true } },
        inventoryBalances: { include: { warehouse: { select: { id: true, code: true, name: true } } } },
        inventoryMovements: {
          include: { warehouse: { select: { code: true, name: true } }, createdBy: { select: { fullName: true } } },
          orderBy: { movementDate: 'asc' },
        },
        prices: { include: { branch: { select: { code: true, name: true } }, createdBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');

    // Kardex con saldo acumulado: cada fila muestra cómo queda el lote después del movimiento.
    let running = ZERO;
    const kardex = lot.inventoryMovements.map((m) => {
      running = kg(running.plus(m.weightKg));
      return { ...m, balanceWeightKg: running };
    });

    return {
      ...lot,
      inventoryMovements: kardex,
      availableWeightKg: kg(lot.inventoryBalances.reduce((s, b) => s.plus(b.weightKg), ZERO)),
      daysToExpiry: daysToExpiry(lot.expiryDate),
    };
  }

  /**
   * Fija el precio por kg del lote (central o de una sucursal). Se puede indicar el precio
   * directamente o el margen sobre el costo real. Desactiva el precio anterior del mismo ámbito.
   */
  async clearBranchPrice(lotId: string, branchId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.lotPrice.findFirst({ where: { lotId, branchId, isActive: true }, include: { branch: { select: { name: true } } } });
      if (!current) throw new NotFoundException('La sucursal no tiene un precio propio para este lote');
      await tx.lotPrice.update({ where: { id: current.id }, data: { isActive: false, validTo: new Date() } });
      await this.audit.log(
        {
          userId: actorId,
          action: 'lot_prices.clear_branch',
          entityType: 'lot',
          entityId: lotId,
          oldData: { pricePerKg: current.pricePerKg.toFixed(4), branchId, branch: current.branch?.name },
          reason: 'Vuelve al precio central',
        },
        tx,
      );
      return { lotId, branchId, cleared: true };
    });
  }

  async setPrice(lotId: string, dto: SetLotPriceDto, actorId: string) {
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    if (dto.pricePerKg === undefined && dto.marginPercentage === undefined) {
      throw new BadRequestException('Indique el precio por kg o el margen');
    }

    const cost = D(lot.actualCostPerKg);
    const pricePerKg = dto.pricePerKg !== undefined ? perKg(D(dto.pricePerKg)) : suggestedPrice(cost, dto.marginPercentage!);
    const marginPercentage = pricePerKg.minus(cost).div(cost).times(100).toDecimalPlaces(2);
    const branchId = dto.branchId ?? null;
    if (branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, include: { warehouses: { select: { type: true } } } });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');
      // La sucursal del almacén central usa el precio central (sin sucursal): no se le fija uno propio.
      if (branch.warehouses.some((w) => w.type === 'CENTRAL')) throw new BadRequestException('Para la central use el precio central (sin sucursal)');
    }

    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.lotPrice.findFirst({ where: { lotId, branchId, isActive: true } });
      await tx.lotPrice.updateMany({
        where: { lotId, branchId, isActive: true },
        data: { isActive: false, validTo: new Date() },
      });
      const price = await tx.lotPrice.create({
        data: { lotId, branchId, pricePerKg, marginPercentage, createdById: actorId },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'lot_prices.set',
          entityType: 'lot',
          entityId: lotId,
          oldData: previous ? { pricePerKg: previous.pricePerKg.toFixed(4), branchId } : undefined,
          newData: { pricePerKg: pricePerKg.toFixed(4), marginPercentage: marginPercentage.toFixed(2), branchId },
        },
        tx,
      );
      return price;
    });
  }
}

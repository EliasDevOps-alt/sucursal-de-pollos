import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdjustmentKind, AdjustmentReason, InventoryMovementType, Prisma, RecordStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, kg, money } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustmentFiltersDto, CreateAdjustmentDto } from './dto/adjustment.dto';
import { InventoryService } from './inventory.service';

const TX_OPTIONS = { timeout: 20_000 };

const include = {
  warehouse: { select: { id: true, code: true, name: true, branchId: true } },
  product: { select: { id: true, code: true, name: true } },
  lot: { select: { id: true, lotCode: true, expiryDate: true } },
  createdBy: { select: { fullName: true } },
  annulledBy: { select: { fullName: true } },
} satisfies Prisma.InventoryAdjustmentInclude;

/**
 * Ajustes por conteo físico y bajas (vencido, dañado, descompuesto, robo…).
 * Cada uno deja un movimiento de kardex con su motivo y el valor de la diferencia a costo real del lote.
 * No se borran: se anulan con un movimiento inverso.
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  findAll(f: AdjustmentFiltersDto, actor: AuthUser) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = new Date(f.from);
    if (f.to) createdAt.lte = new Date(f.to);
    return this.prisma.inventoryAdjustment.findMany({
      where: {
        kind: f.kind,
        warehouseId: f.warehouseId,
        createdAt: f.from || f.to ? createdAt : undefined,
        warehouse: actor.branchId ? { branchId: actor.branchId } : undefined,
      },
      include,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async create(dto: CreateAdjustmentDto, actor: AuthUser) {
    if (dto.kind === AdjustmentKind.COUNT && dto.reasonCode !== AdjustmentReason.PHYSICAL_COUNT) {
      throw new BadRequestException('Un ajuste por conteo usa el motivo "conteo físico"');
    }
    if (dto.kind === AdjustmentKind.LOSS && dto.reasonCode === AdjustmentReason.PHYSICAL_COUNT) {
      throw new BadRequestException('Indique el motivo de la baja (vencido, dañado, descompuesto, robo u otro)');
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: dto.warehouseId, isActive: true } });
      if (!warehouse) throw new BadRequestException('Almacén inexistente o inactivo');
      if (actor.branchId && warehouse.branchId !== actor.branchId) throw new ForbiddenException('Solo puede ajustar el almacén de su sucursal');
      const lot = await tx.lot.findUnique({ where: { id: dto.lotId }, include: { product: { select: { name: true } } } });
      if (!lot) throw new BadRequestException('Lote inexistente');

      // Saldo actual bloqueado: nadie más puede mover este lote en este almacén hasta terminar.
      const [balance] = await tx.$queryRaw<{ weight_kg: Prisma.Decimal }[]>`
        SELECT weight_kg FROM inventory_balances
        WHERE warehouse_id = ${warehouse.id}::uuid AND lot_id = ${lot.id}::uuid FOR UPDATE`;
      const system = kg(D(balance?.weight_kg ?? 0));

      let delta: Prisma.Decimal;
      if (dto.kind === AdjustmentKind.COUNT) {
        delta = kg(D(dto.countedWeightKg!).minus(system));
        if (delta.isZero()) throw new BadRequestException(`El conteo coincide con el sistema (${system.toFixed(3)} kg): no hay nada que ajustar`);
      } else {
        const loss = kg(D(dto.weightKg!));
        if (loss.gt(system)) {
          throw new BadRequestException(`El lote ${lot.lotCode} solo tiene ${system.toFixed(3)} kg en ${warehouse.name}`);
        }
        delta = loss.negated();
      }
      const newWeight = kg(system.plus(delta));
      const costPerKg = D(lot.actualCostPerKg);

      const adjustmentNumber = await this.sequences.next(tx, 'adjustment');
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          adjustmentNumber,
          kind: dto.kind,
          reasonCode: dto.reasonCode,
          warehouseId: warehouse.id,
          productId: lot.productId,
          lotId: lot.id,
          systemWeightKg: system,
          newWeightKg: newWeight,
          weightKg: delta,
          costPerKg,
          amount: money(delta.times(costPerKg)),
          notes: dto.notes.trim(),
          createdById: actor.id,
        },
      });
      await this.inventory.registerMovement(tx, {
        warehouseId: warehouse.id,
        productId: lot.productId,
        lotId: lot.id,
        movementType: dto.kind === AdjustmentKind.COUNT ? InventoryMovementType.ADJUSTMENT : InventoryMovementType.LOSS,
        weightKg: delta,
        unitCostPerKg: costPerKg,
        referenceType: 'adjustment',
        referenceId: adjustment.id,
        reason: dto.notes.trim(),
        createdById: actor.id,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: dto.kind === AdjustmentKind.COUNT ? 'inventory.adjust' : 'inventory.loss',
          entityType: 'inventory_adjustment',
          entityId: adjustment.id,
          oldData: { lot: lot.lotCode, warehouse: warehouse.code, weightKg: system.toFixed(3) },
          newData: { adjustmentNumber, reasonCode: dto.reasonCode, weightKg: newWeight.toFixed(3), differenceKg: delta.toFixed(3) },
          reason: dto.notes.trim(),
        },
        tx,
      );
      return adjustment.id;
    }, TX_OPTIONS);
    return this.prisma.inventoryAdjustment.findUniqueOrThrow({ where: { id }, include });
  }

  /** Anula el ajuste con el movimiento inverso (falla si ese stock ya se vendió o se movió). */
  async annul(id: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: RecordStatus }[]>`SELECT status FROM inventory_adjustments WHERE id = ${id}::uuid FOR UPDATE`;
      if (!row) throw new NotFoundException('Ajuste no encontrado');
      if (row.status !== RecordStatus.VALID) throw new ConflictException('El ajuste ya está anulado');
      const adj = await tx.inventoryAdjustment.findUniqueOrThrow({ where: { id }, include });
      if (actor.branchId && adj.warehouse.branchId !== actor.branchId) {
        throw new ForbiddenException('Solo puede anular ajustes de su sucursal');
      }
      await this.inventory.registerMovement(tx, {
        warehouseId: adj.warehouseId,
        productId: adj.productId,
        lotId: adj.lotId,
        movementType: adj.kind === AdjustmentKind.COUNT ? InventoryMovementType.ADJUSTMENT : InventoryMovementType.LOSS,
        weightKg: D(adj.weightKg).negated(),
        unitCostPerKg: D(adj.costPerKg),
        referenceType: 'adjustment',
        referenceId: adj.id,
        reason: `Anulación de ${adj.adjustmentNumber}: ${reason}`,
        createdById: actor.id,
      });
      await tx.inventoryAdjustment.update({
        where: { id },
        data: { status: RecordStatus.ANNULLED, annulledById: actor.id, annulledAt: new Date(), annulReason: reason },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'inventory.adjust_annul',
          entityType: 'inventory_adjustment',
          entityId: id,
          oldData: { status: RecordStatus.VALID },
          newData: { status: RecordStatus.ANNULLED },
          reason,
        },
        tx,
      );
    }, TX_OPTIONS);
    return this.prisma.inventoryAdjustment.findUniqueOrThrow({ where: { id }, include });
  }
}

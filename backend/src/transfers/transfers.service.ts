import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma, TransferStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, kg, money, ZERO } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { InventoryService } from '../inventory/inventory.service';
import { availableLots } from '../inventory/lot-stock';
import { PrismaService } from '../prisma/prisma.service';
import { Allocation, AllocationError, allocateFefo, allocateManual } from '../sales/allocation';
import { CreateTransferDto, ReceiveTransferDto, TransferFiltersDto } from './dto/transfer.dto';

const TX_OPTIONS = { timeout: 20_000 };

const warehouseSelect = { select: { id: true, code: true, name: true, type: true, branchId: true } } as const;
const include = {
  origin: warehouseSelect,
  destination: { select: { ...warehouseSelect.select, branch: { select: { name: true, transferWeighingEnabled: true } } } },
  sentBy: { select: { fullName: true } },
  receivedBy: { select: { fullName: true } },
  cancelledBy: { select: { fullName: true } },
  items: {
    include: { product: { select: { id: true, code: true, name: true } }, lot: { select: { id: true, lotCode: true, expiryDate: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.TransferInclude;

/**
 * Transferencias entre almacenes (central ↔ sucursales).
 * Al enviar, el stock sale del origen (queda "en tránsito"); al recibir entra al destino con el peso
 * realmente recibido, y la diferencia queda como pérdida en tránsito. Cada lote conserva su identidad y costo.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  findAll(f: TransferFiltersDto, actor: AuthUser) {
    const scope = this.branchScope(actor);
    return this.prisma.transfer.findMany({
      where: {
        status: f.status,
        AND: [
          f.warehouseId ? { OR: [{ originWarehouseId: f.warehouseId }, { destinationWarehouseId: f.warehouseId }] } : {},
          scope ? { OR: [{ origin: { branchId: scope } }, { destination: { branchId: scope } }] } : {},
        ],
      },
      include,
      orderBy: { sentAt: 'desc' },
      take: 300,
    });
  }

  async findOne(id: string, actor: AuthUser) {
    const t = await this.prisma.transfer.findUnique({ where: { id }, include });
    if (!t) throw new NotFoundException('Transferencia no encontrada');
    const scope = this.branchScope(actor);
    if (scope && t.origin.branchId !== scope && t.destination.branchId !== scope) throw new NotFoundException('Transferencia no encontrada');
    return t;
  }

  async create(dto: CreateTransferDto, actor: AuthUser) {
    if (dto.originWarehouseId === dto.destinationWarehouseId) throw new BadRequestException('El origen y el destino deben ser distintos');
    const id = await this.prisma.$transaction(async (tx) => {
      const [origin, destination] = await Promise.all([
        tx.warehouse.findFirst({ where: { id: dto.originWarehouseId, isActive: true } }),
        tx.warehouse.findFirst({ where: { id: dto.destinationWarehouseId, isActive: true } }),
      ]);
      if (!origin) throw new BadRequestException('Almacén de origen inexistente o inactivo');
      if (!destination) throw new BadRequestException('Almacén de destino inexistente o inactivo');
      if (actor.branchId && origin.branchId !== actor.branchId) {
        throw new ForbiddenException('Solo puede enviar desde el almacén de su sucursal');
      }

      const transferNumber = await this.sequences.next(tx, 'transfer');
      const transfer = await tx.transfer.create({
        data: {
          transferNumber,
          originWarehouseId: origin.id,
          destinationWarehouseId: destination.id,
          notes: dto.notes,
          sentById: actor.id,
        },
      });

      // Cada línea lee los saldos ya descontados por las anteriores (misma transacción), así un producto repetido no se envía dos veces.
      for (const item of dto.items) {
        const product = await tx.product.findFirst({ where: { id: item.productId, isActive: true } });
        if (!product) throw new BadRequestException('Producto inexistente o inactivo');
        const lots = await availableLots(tx, origin.id, product.id, true);
        let allocations: Allocation[];
        try {
          allocations = item.lotId
            ? allocateManual(lots, item.weightKg, [{ lotId: item.lotId, weightKg: item.weightKg }])
            : allocateFefo(lots, item.weightKg);
        } catch (e) {
          if (e instanceof AllocationError) throw new BadRequestException(`${product.name}: ${e.message}`);
          throw e;
        }
        for (const a of allocations) {
          const share = allocations.length === 1 ? D(item.quantity ?? 0) : ZERO;
          await tx.transferItem.create({
            data: {
              transferId: transfer.id,
              productId: product.id,
              lotId: a.lot.lotId,
              sentWeightKg: a.weightKg,
              sentQuantity: share,
              costPerKg: a.lot.costPerKg,
            },
          });
          await this.inventory.registerMovement(tx, {
            warehouseId: origin.id,
            productId: product.id,
            lotId: a.lot.lotId,
            movementType: InventoryMovementType.TRANSFER_OUT,
            weightKg: a.weightKg.negated(),
            unitCostPerKg: a.lot.costPerKg,
            referenceType: 'transfer',
            referenceId: transfer.id,
            reason: `Envío a ${destination.name}`,
            createdById: actor.id,
          });
        }
      }

      await this.audit.log(
        {
          userId: actor.id,
          action: 'transfers.create',
          entityType: 'transfer',
          entityId: transfer.id,
          newData: { transferNumber, origin: origin.code, destination: destination.code, items: dto.items },
        },
        tx,
      );
      return transfer.id;
    }, TX_OPTIONS);
    return this.findOne(id, actor);
  }

  async receive(id: string, dto: ReceiveTransferDto, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockInTransit(tx, id);
      if (actor.branchId && transfer.destination.branchId !== actor.branchId) {
        throw new ForbiddenException('Solo puede recibir transferencias dirigidas a su sucursal');
      }
      const weighing = transfer.destination.branch?.transferWeighingEnabled ?? false;
      const given = new Map((dto.items ?? []).map((i) => [i.itemId, i]));
      for (const itemId of given.keys()) {
        if (!transfer.items.some((i) => i.id === itemId)) throw new BadRequestException('Una línea no pertenece a esta transferencia');
      }
      if (weighing && transfer.items.some((i) => !given.has(i.id))) {
        throw new BadRequestException(`${transfer.destination.branch?.name ?? 'El destino'} pesa las transferencias: ingrese el peso recibido de cada línea`);
      }

      const summary: { lot: string; sentKg: string; receivedKg: string; differenceKg: string }[] = [];
      for (const item of transfer.items) {
        const sent = D(item.sentWeightKg);
        const received = given.has(item.id) ? kg(D(given.get(item.id)!.receivedWeightKg)) : sent;
        if (received.gt(sent)) {
          throw new BadRequestException(
            `Lote ${item.lot.lotCode}: no se puede recibir más de lo enviado (${sent.toFixed(3)} kg). Un sobrante se registra con un ajuste de inventario.`,
          );
        }
        const difference = kg(sent.minus(received));
        await tx.transferItem.update({
          where: { id: item.id },
          data: {
            receivedWeightKg: received,
            receivedQuantity: given.get(item.id)?.receivedQuantity ?? item.sentQuantity,
            differenceKg: difference,
            lossAmount: money(difference.times(item.costPerKg)),
          },
        });
        if (received.gt(0)) {
          await this.inventory.registerMovement(tx, {
            warehouseId: transfer.destinationWarehouseId,
            productId: item.productId,
            lotId: item.lotId,
            movementType: InventoryMovementType.TRANSFER_IN,
            weightKg: received,
            unitCostPerKg: D(item.costPerKg),
            referenceType: 'transfer',
            referenceId: transfer.id,
            reason: difference.gt(0) ? `Recibido de ${transfer.origin.name}; faltaron ${difference.toFixed(3)} kg` : `Recibido de ${transfer.origin.name}`,
            createdById: actor.id,
          });
        }
        summary.push({ lot: item.lot.lotCode, sentKg: sent.toFixed(3), receivedKg: received.toFixed(3), differenceKg: difference.toFixed(3) });
      }

      await tx.transfer.update({
        where: { id },
        data: { status: TransferStatus.RECEIVED, receivedById: actor.id, receivedAt: new Date(), receiveNotes: dto.notes },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'transfers.receive',
          entityType: 'transfer',
          entityId: id,
          oldData: { status: TransferStatus.IN_TRANSIT },
          newData: { status: TransferStatus.RECEIVED, items: summary },
          reason: dto.notes,
        },
        tx,
      );
    }, TX_OPTIONS);
    return this.findOne(id, actor);
  }

  /** Cancela una transferencia en tránsito: el stock vuelve al almacén de origen, en los mismos lotes. */
  async cancel(id: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockInTransit(tx, id);
      if (actor.branchId && transfer.origin.branchId !== actor.branchId) {
        throw new ForbiddenException('Solo el almacén de origen puede cancelar la transferencia');
      }
      for (const item of transfer.items) {
        await this.inventory.registerMovement(tx, {
          warehouseId: transfer.originWarehouseId,
          productId: item.productId,
          lotId: item.lotId,
          movementType: InventoryMovementType.TRANSFER_IN,
          weightKg: D(item.sentWeightKg),
          unitCostPerKg: D(item.costPerKg),
          referenceType: 'transfer',
          referenceId: transfer.id,
          reason: `Transferencia cancelada: ${reason}`,
          createdById: actor.id,
        });
      }
      await tx.transfer.update({
        where: { id },
        data: { status: TransferStatus.CANCELLED, cancelledById: actor.id, cancelledAt: new Date(), cancelReason: reason },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'transfers.cancel',
          entityType: 'transfer',
          entityId: id,
          oldData: { status: TransferStatus.IN_TRANSIT },
          newData: { status: TransferStatus.CANCELLED },
          reason,
        },
        tx,
      );
    }, TX_OPTIONS);
    return this.findOne(id, actor);
  }

  private async lockInTransit(tx: Prisma.TransactionClient, id: string) {
    const [row] = await tx.$queryRaw<{ status: TransferStatus }[]>`SELECT status FROM transfers WHERE id = ${id}::uuid FOR UPDATE`;
    if (!row) throw new NotFoundException('Transferencia no encontrada');
    if (row.status !== TransferStatus.IN_TRANSIT) throw new ConflictException('La transferencia ya fue recibida o cancelada');
    return tx.transfer.findUniqueOrThrow({ where: { id }, include });
  }

  /** Un usuario de sucursal solo ve las transferencias que salen o llegan a su sucursal. */
  private branchScope(actor: AuthUser) {
    return actor.branchId;
  }
}

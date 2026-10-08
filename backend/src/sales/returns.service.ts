import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CashCategory, CashDirection, InventoryMovementType, Prisma, ReceivableMovementType, RefundMethod, ReturnDisposition, SaleStatus, WarehouseType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth-user';
import { PERMISSIONS } from '../auth/permissions';
import { D, kg, money, ZERO } from '../common/decimal';
import { ReceivablesService } from '../common/receivables.service';
import { SequenceService } from '../common/sequence.service';
import { CashService } from '../finance/cash.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReturnDto, ReturnFiltersDto } from './dto/return.dto';

const TX_OPTIONS = { timeout: 20_000 };

export const returnInclude = {
  sale: { select: { id: true, saleNumber: true } },
  customer: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  authorizedBy: { select: { fullName: true } },
  createdBy: { select: { fullName: true } },
  items: {
    include: { product: { select: { id: true, code: true, name: true } }, lot: { select: { id: true, lotCode: true } } },
  },
} satisfies Prisma.SaleReturnInclude;

/**
 * Devoluciones autorizadas de clientes, parciales o totales.
 * Lo que vuelve en buen estado reingresa al mismo lote y almacén con su costo original;
 * lo descartado queda como pérdida. El importe se descuenta de la deuda o se devuelve en efectivo.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly inventory: InventoryService,
    private readonly receivables: ReceivablesService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly cash: CashService,
  ) {}

  findAll(f: ReturnFiltersDto) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = new Date(f.from);
    if (f.to) createdAt.lte = new Date(f.to);
    return this.prisma.saleReturn.findMany({
      where: { customerId: f.customerId, createdAt: f.from || f.to ? createdAt : undefined },
      include: returnInclude,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async create(saleId: string, dto: CreateReturnDto, actor: AuthUser) {
    const approver = await this.resolveApprover(dto, actor);

    const id = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: SaleStatus }[]>`SELECT status FROM sales WHERE id = ${saleId}::uuid FOR UPDATE`;
      if (!locked) throw new NotFoundException('Venta no encontrada');
      if (locked.status === SaleStatus.ANNULLED) throw new ConflictException('La venta está anulada');
      if (locked.status === SaleStatus.RETURNED) throw new ConflictException('La venta ya fue devuelta por completo');

      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: {
          warehouse: { select: { branchId: true, type: true } },
          routeStop: { select: { route: { select: { originWarehouseId: true } } } },
          items: { include: { product: { select: { name: true } }, allocations: { orderBy: { createdAt: 'asc' } } } },
        },
      });
      // Lo entregado en ruta salió del almacén móvil del vehículo: lo devuelto reingresa al almacén de donde se cargó.
      const restockWarehouseId = sale.warehouse.type === WarehouseType.VEHICLE && sale.routeStop ? sale.routeStop.route.originWarehouseId : sale.warehouseId;
      if (actor.branchId && sale.warehouse.branchId !== actor.branchId) {
        throw new ForbiddenException('Solo puede registrar devoluciones de ventas de su sucursal');
      }

      const refundMethod = dto.refundMethod ?? (sale.customerId && D(sale.creditAmount).gt(0) ? RefundMethod.CREDIT : RefundMethod.CASH);
      if (refundMethod === RefundMethod.CREDIT && !sale.customerId) {
        throw new BadRequestException('Una venta rápida (sin cliente) solo puede devolverse en efectivo');
      }

      // Estado en memoria para aceptar varias líneas sobre el mismo ítem (p. ej. una parte reingresa y otra se descarta).
      const items = new Map(sale.items.map((i) => [i.id, { ...i, returnedWeightKg: D(i.returnedWeightKg), returnedAmount: D(i.returnedAmount) }]));
      const allocations = new Map(
        sale.items.flatMap((i) => i.allocations).map((a) => [a.id, { ...a, returnedWeightKg: D(a.returnedWeightKg), restockedWeightKg: D(a.restockedWeightKg) }]),
      );

      const returnNumber = await this.sequences.next(tx, 'return');
      const saleReturn = await tx.saleReturn.create({
        data: {
          returnNumber,
          saleId,
          customerId: sale.customerId,
          warehouseId: restockWarehouseId,
          reason: dto.reason.trim(),
          refundMethod,
          totalAmount: 0,
          authorizedById: approver.id,
          createdById: actor.id,
        },
      });

      let total = ZERO;
      let restocked = ZERO;
      let discarded = ZERO;
      let loss = ZERO;
      for (const line of dto.items) {
        const item = items.get(line.saleItemId);
        if (!item) throw new BadRequestException('Una línea no pertenece a esta venta');
        const weight = kg(D(line.weightKg));
        const remaining = kg(D(item.requestedWeightKg).minus(item.returnedWeightKg));
        if (weight.gt(remaining)) {
          throw new BadRequestException(`${item.product.name}: solo quedan ${remaining.toFixed(3)} kg por devolver`);
        }
        // Lo que falta devolver del importe cuando se devuelve todo; si no, la parte proporcional (neto de descuentos).
        const amount = weight.eq(remaining)
          ? money(D(item.subtotal).minus(item.returnedAmount))
          : money(D(item.subtotal).times(weight).div(item.requestedWeightKg));

        // Se reparte entre los lotes de la línea, en el orden en que se asignaron.
        let pendingKg = weight;
        let pendingAmount = amount;
        for (const a of item.allocations.map((x) => allocations.get(x.id)!)) {
          if (pendingKg.lte(0)) break;
          const free = kg(D(a.weightKg).minus(a.returnedWeightKg));
          const take = Prisma.Decimal.min(free, pendingKg);
          if (take.lte(0)) continue;
          const isLast = take.eq(pendingKg);
          const portionAmount = isLast ? pendingAmount : money(amount.times(take).div(weight));
          const restock = line.disposition === ReturnDisposition.RESTOCK;

          await tx.saleReturnItem.create({
            data: {
              returnId: saleReturn.id,
              saleItemId: item.id,
              allocationId: a.id,
              productId: item.productId,
              lotId: a.lotId,
              weightKg: take,
              amount: portionAmount,
              costPerKg: a.costPerKg,
              disposition: line.disposition,
            },
          });
          a.returnedWeightKg = kg(a.returnedWeightKg.plus(take));
          if (restock) {
            a.restockedWeightKg = kg(a.restockedWeightKg.plus(take));
            await this.inventory.registerMovement(tx, {
              warehouseId: restockWarehouseId,
              productId: item.productId,
              lotId: a.lotId,
              movementType: InventoryMovementType.RETURN,
              weightKg: take,
              unitCostPerKg: D(a.costPerKg),
              referenceType: 'sale_return',
              referenceId: saleReturn.id,
              reason: `Devolución ${returnNumber} de ${sale.saleNumber}: ${dto.reason.trim()}`,
              createdById: actor.id,
            });
            restocked = restocked.plus(take);
          } else {
            discarded = discarded.plus(take);
            loss = loss.plus(take.times(a.costPerKg));
          }
          await tx.saleLotAllocation.update({
            where: { id: a.id },
            data: { returnedWeightKg: a.returnedWeightKg, restockedWeightKg: a.restockedWeightKg },
          });
          pendingKg = kg(pendingKg.minus(take));
          pendingAmount = money(pendingAmount.minus(portionAmount));
        }

        item.returnedWeightKg = kg(item.returnedWeightKg.plus(weight));
        item.returnedAmount = money(item.returnedAmount.plus(amount));
        await tx.saleItem.update({
          where: { id: item.id },
          data: { returnedWeightKg: item.returnedWeightKg, returnedAmount: item.returnedAmount },
        });
        total = total.plus(amount);
      }

      total = money(total);
      const fullyReturned = [...items.values()].every((i) => isFullyReturned(i.requestedWeightKg, i.returnedWeightKg));
      await tx.saleReturn.update({
        where: { id: saleReturn.id },
        data: { totalAmount: total, restockedKg: kg(restocked), discardedKg: kg(discarded), lossAmount: money(loss) },
      });
      await tx.sale.update({
        where: { id: saleId },
        data: { returnedAmount: money(D(sale.returnedAmount).plus(total)), status: fullyReturned ? SaleStatus.RETURNED : undefined },
      });

      if (refundMethod === RefundMethod.CASH && total.gt(0)) {
        const branchId = (await tx.warehouse.findUniqueOrThrow({ where: { id: restockWarehouseId } })).branchId;
        const account = await this.cash.accountFor(tx, 'EFECTIVO', branchId);
        await this.cash.record(tx, {
          accountId: account.id,
          direction: CashDirection.OUT,
          category: CashCategory.REFUND,
          amount: total,
          paymentMethod: 'EFECTIVO',
          description: `Devolución ${returnNumber} de ${sale.saleNumber}`,
          referenceType: 'sale_return',
          referenceId: saleReturn.id,
          actorId: actor.id,
          allowNegative: true,
        });
      }

      if (refundMethod === RefundMethod.CREDIT && total.gt(0)) {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${sale.customerId}::uuid FOR UPDATE`;
        await this.receivables.apply(tx, {
          customerId: sale.customerId!,
          type: ReceivableMovementType.RETURN,
          amount: total.negated(),
          referenceType: 'sale_return',
          referenceId: saleReturn.id,
          actorId: actor.id,
          reason: `Devolución ${returnNumber} de ${sale.saleNumber}`,
        });
      }

      await this.audit.log(
        {
          userId: actor.id,
          action: 'sales.return',
          entityType: 'sale',
          entityId: saleId,
          newData: {
            returnNumber,
            refundMethod,
            totalAmount: total.toFixed(2),
            restockedKg: kg(restocked).toFixed(3),
            discardedKg: kg(discarded).toFixed(3),
            authorizedBy: approver.fullName,
            saleStatus: fullyReturned ? SaleStatus.RETURNED : locked.status,
          },
          reason: dto.reason.trim(),
        },
        tx,
      );
      return saleReturn.id;
    }, TX_OPTIONS);

    return this.prisma.saleReturn.findUniqueOrThrow({ where: { id }, include: returnInclude });
  }

  /** El propio usuario si puede autorizar devoluciones; si no, el supervisor cuyas credenciales se enviaron. */
  private async resolveApprover(dto: CreateReturnDto, actor: AuthUser) {
    if (actor.permissions.includes(PERMISSIONS.SALES_RETURN)) return actor;
    if (!dto.authorization) {
      throw new ForbiddenException('La devolución requiere la autorización de un supervisor');
    }
    const supervisor = await this.auth.verifyCredentials(dto.authorization.username, dto.authorization.password);
    if (!supervisor) throw new ForbiddenException('Credenciales de autorización incorrectas');
    if (!supervisor.permissions.includes(PERMISSIONS.SALES_RETURN)) {
      throw new ForbiddenException(`${supervisor.fullName} no tiene permiso para autorizar devoluciones`);
    }
    return supervisor;
  }
}

function isFullyReturned(requested: Prisma.Decimal.Value, returned: Prisma.Decimal) {
  return kg(D(requested).minus(returned)).lte(0);
}

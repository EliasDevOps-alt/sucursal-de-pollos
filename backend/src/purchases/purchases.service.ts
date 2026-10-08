import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InventoryMovementType, Prisma, PurchaseStatus, ShrinkageTreatment } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { D, money, ZERO } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { CashService } from '../finance/cash.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto, CreateReceptionDto } from './dto/purchase.dto';
import { computeReceptionLine, suggestedPrice } from './reception-calc';

const TX_OPTIONS = { timeout: 20_000 };

const purchaseDetail = {
  supplier: { select: { id: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  annulledBy: { select: { id: true, fullName: true } },
  items: { include: { product: { select: { id: true, code: true, name: true } }, receptionItem: true } },
  receptions: { include: { receivedBy: { select: { id: true, fullName: true } } } },
  lots: { select: { id: true, lotCode: true, productId: true, actualCostPerKg: true, receivedWeightKg: true, expiryDate: true } },
} satisfies Prisma.PurchaseInclude;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly cash: CashService,
  ) {}

  findAll(filters: { status?: PurchaseStatus; supplierId?: string }) {
    return this.prisma.purchase.findMany({
      where: { status: filters.status, supplierId: filters.supplierId },
      include: {
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { purchaseDate: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findUnique({ where: { id }, include: purchaseDetail });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return purchase;
  }

  async create(dto: CreatePurchaseDto, actorId: string) {
    const [supplier, warehouse] = await Promise.all([
      this.prisma.supplier.findFirst({ where: { id: dto.supplierId, isActive: true } }),
      this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, isActive: true } }),
    ]);
    if (!supplier) throw new BadRequestException('Proveedor inexistente o inactivo');
    if (!warehouse) throw new BadRequestException('Almacén inexistente o inactivo');

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.count({ where: { id: { in: productIds }, isActive: true } });
    if (products !== productIds.length) throw new BadRequestException('Hay productos inexistentes o inactivos');

    const items = dto.items.map((i) => ({
      productId: i.productId,
      purchasedQuantity: D(i.purchasedQuantity ?? 0),
      purchasedWeightKg: D(i.purchasedWeightKg),
      unitCost: D(i.unitCost),
      subtotal: money(D(i.purchasedWeightKg).times(i.unitCost)),
    }));
    const totalAmount = items.reduce((sum, i) => sum.plus(i.subtotal), ZERO);

    const purchase = await this.prisma.$transaction(async (tx) => {
      const purchaseNumber = await this.sequences.next(tx, 'purchase');
      const created = await tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          paymentMethod: dto.paymentMethod,
          totalAmount,
          notes: dto.notes,
          createdById: actorId,
          items: { create: items },
        },
      });
      // Pagada al contado: egreso de la caja o del banco. A crédito del proveedor queda por pagar.
      if (dto.paymentMethod !== 'CREDITO_PROVEEDOR') {
        await this.payInTx(tx, created.id, dto.paymentMethod, actorId);
      }
      await this.audit.log(
        { userId: actorId, action: 'purchases.create', entityType: 'purchase', entityId: created.id, newData: { purchaseNumber, totalAmount: totalAmount.toFixed(2) } },
        tx,
      );
      return created;
    }, TX_OPTIONS);

    return this.findOne(purchase.id);
  }

  /** Paga una compra a crédito del proveedor (egreso de la caja o del banco). */
  async pay(id: string, paymentMethod: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA', actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${id}::uuid FOR UPDATE`;
      await this.payInTx(tx, id, paymentMethod, actorId);
      await this.audit.log({ userId: actorId, action: 'purchases.pay', entityType: 'purchase', entityId: id, newData: { paymentMethod } }, tx);
    }, TX_OPTIONS);
    return this.findOne(id);
  }

  private async payInTx(tx: Prisma.TransactionClient, id: string, paymentMethod: string, actorId: string) {
    const purchase = await tx.purchase.findUnique({ where: { id }, include: { supplier: true, warehouse: true } });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status === PurchaseStatus.CANCELLED) throw new ConflictException('La compra está anulada');
    if (purchase.paidAt) throw new ConflictException('La compra ya está pagada');
    const account = await this.cash.accountFor(tx, paymentMethod, purchase.warehouse.branchId);
    await this.cash.record(tx, {
      accountId: account.id,
      direction: 'OUT',
      category: 'PURCHASE',
      amount: D(purchase.totalAmount),
      paymentMethod,
      description: `Compra ${purchase.purchaseNumber} a ${purchase.supplier.name}`,
      referenceType: 'purchase',
      referenceId: purchase.id,
      actorId,
      allowNegative: true,
    });
    await tx.purchase.update({ where: { id }, data: { paidAt: new Date(), paidById: actorId } });
  }

  async annul(id: string, reason: string, actorId: string) {
    const purchase = await this.prisma.purchase.findUnique({ where: { id } });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status !== PurchaseStatus.REGISTERED) {
      // Una compra recibida ya generó lotes y stock; revertirla exige una devolución/ajuste, no una anulación.
      throw new ConflictException('Solo se pueden anular compras aún no recibidas');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: { status: PurchaseStatus.CANCELLED, annulledAt: new Date(), annulledById: actorId, annulReason: reason },
      });
      // Si ya se había pagado, el dinero vuelve (el proveedor lo devuelve).
      const paid = await tx.cashMovement.findFirst({ where: { referenceType: 'purchase', referenceId: id, reversedById: null, category: 'PURCHASE' } });
      if (paid) await this.cash.reverse(tx, paid.id, actorId, `Anulación de la compra ${purchase.purchaseNumber}: ${reason}`);
      await this.audit.log(
        { userId: actorId, action: 'purchases.annul', entityType: 'purchase', entityId: id, oldData: { status: purchase.status }, newData: { status: PurchaseStatus.CANCELLED }, reason },
        tx,
      );
    });
    return this.findOne(id);
  }

  /**
   * Recepción real de la compra. En una sola transacción:
   * recepción + líneas con merma → un lote por línea → movimiento de kardex PURCHASE → saldo
   * → precio sugerido del lote → compra marcada como RECEIVED.
   */
  async receive(purchaseId: string, dto: CreateReceptionDto, actorId: string) {
    const purchase = await this.prisma.purchase.findUnique({ where: { id: purchaseId }, include: { items: true } });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status !== PurchaseStatus.REGISTERED) {
      throw new ConflictException(`La compra está en estado ${purchase.status} y no puede recibirse`);
    }

    // En la demo la recepción es total: cada línea de la compra se recibe exactamente una vez.
    const byId = new Map(purchase.items.map((i) => [i.id, i]));
    const received = new Set(dto.items.map((i) => i.purchaseItemId));
    if (received.size !== dto.items.length) throw new BadRequestException('Hay líneas repetidas en la recepción');
    for (const line of dto.items) {
      if (!byId.has(line.purchaseItemId)) throw new BadRequestException('Una línea no pertenece a esta compra');
    }
    if (received.size !== purchase.items.length) {
      throw new BadRequestException('Deben recibirse todas las líneas de la compra');
    }

    const defaultMargin = D(this.config.get<string>('DEFAULT_MARGIN_PERCENT', '20'));

    const receptionId = await this.prisma.$transaction(async (tx) => {
      const reception = await tx.reception.create({
        data: {
          purchaseId,
          warehouseId: purchase.warehouseId,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
          receivedById: actorId,
          notes: dto.notes,
        },
      });

      for (const line of dto.items) {
        const item = byId.get(line.purchaseItemId)!;
        const treatment = line.shrinkageTreatment ?? ShrinkageTreatment.ABSORB;

        let calc;
        try {
          calc = computeReceptionLine({
            purchasedWeightKg: item.purchasedWeightKg,
            unitCost: item.unitCost,
            subtotal: item.subtotal,
            grossWeightKg: line.receivedWeightKg,
            tareWeightKg: line.canastilloWeightKg ?? 0,
            treatment,
          });
        } catch (e) {
          throw new BadRequestException((e as Error).message);
        }

        const receivedQuantity = D(line.receivedQuantity ?? item.purchasedQuantity);
        const expiryDate = new Date(line.expiryDate);

        const receptionItem = await tx.receptionItem.create({
          data: {
            receptionId: reception.id,
            purchaseItemId: item.id,
            productId: item.productId,
            receivedWeightKg: D(line.receivedWeightKg),
            receivedQuantity,
            canastilloWeightKg: D(line.canastilloWeightKg ?? 0),
            netReceivedWeightKg: calc.netWeightKg,
            shrinkageWeightKg: calc.shrinkageWeightKg,
            shrinkagePercentage: calc.shrinkagePercentage,
            expiryDate,
            expirySource: line.expirySource,
            qualityNotes: line.qualityNotes,
          },
        });

        const lot = await tx.lot.create({
          data: {
            lotCode: await this.sequences.next(tx, 'lot'),
            productId: item.productId,
            purchaseId,
            receptionId: reception.id,
            receptionItemId: receptionItem.id,
            warehouseId: purchase.warehouseId,
            receivedWeightKg: calc.netWeightKg,
            receivedQuantity,
            originalCostTotal: item.subtotal,
            originalCostPerKg: calc.originalCostPerKg,
            actualCostPerKg: calc.actualCostPerKg,
            shrinkageWeightKg: calc.shrinkageWeightKg,
            shrinkageLossAmount: calc.shrinkageLossAmount,
            shrinkageTreatment: treatment,
            expiryDate,
          },
        });

        await this.inventory.registerMovement(tx, {
          warehouseId: purchase.warehouseId,
          productId: item.productId,
          lotId: lot.id,
          movementType: InventoryMovementType.PURCHASE,
          weightKg: calc.netWeightKg,
          quantity: receivedQuantity,
          unitCostPerKg: calc.actualCostPerKg,
          referenceType: 'reception',
          referenceId: reception.id,
          createdById: actorId,
        });

        await tx.lotPrice.create({
          data: {
            lotId: lot.id,
            pricePerKg: suggestedPrice(calc.actualCostPerKg, defaultMargin),
            marginPercentage: defaultMargin,
            createdById: actorId,
          },
        });
      }

      await tx.purchase.update({ where: { id: purchaseId }, data: { status: PurchaseStatus.RECEIVED } });
      await this.audit.log(
        { userId: actorId, action: 'receptions.create', entityType: 'reception', entityId: reception.id, newData: { purchaseId, lines: dto.items.length } },
        tx,
      );
      return reception.id;
    }, TX_OPTIONS);

    return this.prisma.reception.findUnique({
      where: { id: receptionId },
      include: {
        items: { include: { product: { select: { code: true, name: true } }, lot: true } },
        purchase: { select: { id: true, purchaseNumber: true, status: true } },
      },
    });
  }
}

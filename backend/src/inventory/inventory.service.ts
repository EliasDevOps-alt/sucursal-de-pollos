import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { D, kg } from '../common/decimal';

export interface MovementInput {
  warehouseId: string;
  productId: string;
  lotId: string;
  movementType: InventoryMovementType;
  /** Con signo: positivo entra, negativo sale. */
  weightKg: Prisma.Decimal;
  quantity?: Prisma.Decimal;
  unitCostPerKg: Prisma.Decimal;
  referenceType: string;
  referenceId: string;
  createdById: string;
  reason?: string;
}

@Injectable()
export class InventoryService {
  /**
   * Registra un movimiento de kardex y actualiza el saldo materializado del lote en el almacén.
   * Debe llamarse dentro de una transacción: movimiento y saldo cambian juntos o no cambian.
   * Para salidas bloquea la fila del saldo (FOR UPDATE) y rechaza dejarlo negativo.
   */
  async registerMovement(tx: Prisma.TransactionClient, input: MovementInput) {
    const quantity = input.quantity ?? D(0);

    const [current] = await tx.$queryRaw<{ id: string; weight_kg: Prisma.Decimal; quantity: Prisma.Decimal }[]>`
      SELECT id, weight_kg, quantity FROM inventory_balances
      WHERE warehouse_id = ${input.warehouseId}::uuid AND lot_id = ${input.lotId}::uuid
      FOR UPDATE`;

    const newWeight = kg(D(current?.weight_kg ?? 0).plus(input.weightKg));
    const newQuantity = kg(D(current?.quantity ?? 0).plus(quantity));
    if (newWeight.isNegative() || newQuantity.isNegative()) {
      throw new BadRequestException(
        `Stock insuficiente en el lote: disponible ${D(current?.weight_kg ?? 0).toFixed(3)} kg, ` +
          `solicitado ${input.weightKg.abs().toFixed(3)} kg`,
      );
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        warehouseId: input.warehouseId,
        productId: input.productId,
        lotId: input.lotId,
        movementType: input.movementType,
        weightKg: input.weightKg,
        quantity,
        unitCostPerKg: input.unitCostPerKg,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
        createdById: input.createdById,
      },
    });

    if (current) {
      await tx.inventoryBalance.update({ where: { id: current.id }, data: { weightKg: newWeight, quantity: newQuantity } });
    } else {
      await tx.inventoryBalance.create({
        data: {
          warehouseId: input.warehouseId,
          productId: input.productId,
          lotId: input.lotId,
          weightKg: newWeight,
          quantity: newQuantity,
        },
      });
    }
    return movement;
  }
}

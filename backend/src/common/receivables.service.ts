import { Injectable } from '@nestjs/common';
import { Prisma, ReceivableMovementType } from '@prisma/client';
import { D, money } from './decimal';

export interface ReceivableEntry {
  customerId: string;
  type: ReceivableMovementType;
  /** + aumenta la deuda, − la reduce. */
  amount: Prisma.Decimal;
  referenceType: string;
  referenceId: string;
  actorId: string;
  reason?: string;
}

/**
 * Única forma de cambiar la deuda de un cliente: registra el movimiento y actualiza el saldo materializado
 * (customers.current_debt) en la misma transacción. Un saldo negativo es saldo a favor (anticipo).
 * El llamador debe haber bloqueado la fila del cliente (SELECT … FOR UPDATE) si compite con otras operaciones.
 */
@Injectable()
export class ReceivablesService {
  async apply(tx: Prisma.TransactionClient, e: ReceivableEntry) {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: e.customerId } });
    const balanceAfter = money(D(customer.currentDebt).plus(e.amount));
    const movement = await tx.receivableMovement.create({
      data: {
        customerId: e.customerId,
        movementType: e.type,
        amount: e.amount,
        balanceAfter,
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        reason: e.reason,
        createdById: e.actorId,
      },
    });
    await tx.customer.update({ where: { id: e.customerId }, data: { currentDebt: balanceAfter } });
    return movement;
  }
}

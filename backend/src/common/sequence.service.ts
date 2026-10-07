import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type SequenceName = 'purchase' | 'sale' | 'presale' | 'lot' | 'customer' | 'collection' | 'transfer' | 'adjustment' | 'return' | 'route';

@Injectable()
export class SequenceService {
  /**
   * Devuelve el siguiente número visible (ej. C-000001).
   * El UPDATE bloquea la fila de la secuencia hasta que termina la transacción,
   * así dos operaciones simultáneas nunca reciben el mismo número.
   */
  async next(tx: Prisma.TransactionClient, name: SequenceName, width = 6): Promise<string> {
    const rows = await tx.$queryRaw<{ prefix: string; last_value: number }[]>`
      UPDATE document_sequences SET last_value = last_value + 1
      WHERE name = ${name}
      RETURNING prefix, last_value`;
    if (!rows.length) throw new InternalServerErrorException(`Secuencia '${name}' no configurada`);
    return `${rows[0].prefix}${String(rows[0].last_value).padStart(width, '0')}`;
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldData?: unknown;
  newData?: unknown;
  reason?: string;
  deviceId?: string;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra una acción. Pasar `tx` para que quede dentro de la misma transacción de la operación. */
  log(entry: AuditEntry, tx?: Tx) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        ...entry,
        oldData: entry.oldData as Prisma.InputJsonValue | undefined,
        newData: entry.newData as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SyncStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditFiltersDto, CustomerTypeDto, SyncFiltersDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Tipos de cliente (configurables por Administración) ──
  listCustomerTypes() {
    return this.prisma.customerType.findMany({ include: { _count: { select: { customers: true } } }, orderBy: { name: 'asc' } });
  }

  async createCustomerType(dto: CustomerTypeDto, actorId: string) {
    const type = await this.unique(() => this.prisma.customerType.create({ data: { name: dto.name.trim() } }));
    await this.audit.log({ userId: actorId, action: 'customer_types.create', entityType: 'customer_type', entityId: type.id, newData: { name: type.name } });
    return type;
  }

  async updateCustomerType(id: string, dto: CustomerTypeDto, actorId: string) {
    const before = await this.prisma.customerType.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tipo de cliente no encontrado');
    const type = await this.unique(() =>
      this.prisma.customerType.update({ where: { id }, data: { name: dto.name.trim(), isActive: dto.isActive } }),
    );
    await this.audit.log({ userId: actorId, action: 'customer_types.update', entityType: 'customer_type', entityId: id, oldData: before, newData: type });
    return type;
  }

  // ── Bitácora de auditoría ─────────────────────────────────
  async auditLogs(f: AuditFiltersDto) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = new Date(f.from);
    if (f.to) createdAt.lte = new Date(f.to);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        userId: f.userId,
        action: f.action ? { contains: f.action } : undefined,
        entityType: f.entityType,
        entityId: f.entityId,
        createdAt: f.from || f.to ? createdAt : undefined,
      },
      include: { user: { select: { id: true, fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: f.limit ?? 200,
    });
    const actions = await this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
    return { logs, actions: actions.map((a) => a.action) };
  }

  // ── Conflictos de sincronización ─────────────────────────
  /** Operaciones del móvil rechazadas (REVIEW/ERROR) que necesitan una decisión de Administración. */
  syncIssues(f: SyncFiltersDto) {
    const view = f.view ?? 'pending';
    return this.prisma.syncOperation.findMany({
      where: {
        status: { in: [SyncStatus.REVIEW, SyncStatus.ERROR] },
        resolvedAt: view === 'pending' ? null : view === 'resolved' ? { not: null } : undefined,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        device: { select: { deviceUuid: true, platform: true, appVersion: true } },
        resolvedBy: { select: { fullName: true } },
      },
      orderBy: { receivedAtServer: 'desc' },
      take: 300,
    });
  }

  async resolveSyncIssue(id: string, note: string, actorId: string) {
    const op = await this.prisma.syncOperation.findUnique({ where: { id } });
    if (!op) throw new NotFoundException('Operación no encontrada');
    if (op.status === SyncStatus.SYNCED) throw new ConflictException('La operación ya se sincronizó correctamente');
    if (op.resolvedAt) throw new ConflictException('La operación ya fue revisada');
    const updated = await this.prisma.syncOperation.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: actorId, resolutionNote: note },
    });
    await this.audit.log({
      userId: actorId,
      action: 'sync.resolve',
      entityType: 'sync_operation',
      entityId: id,
      newData: { operationType: op.operationType, error: op.errorMessage },
      reason: note,
    });
    return updated;
  }

  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Ya existe un tipo de cliente con ese nombre');
      throw e;
    }
  }
}

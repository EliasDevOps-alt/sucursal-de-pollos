import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PresaleStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PERMISSIONS } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PresalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(actor: AuthUser, status?: PresaleStatus) {
    // Quien solo tiene presales.view_own ve únicamente sus pedidos.
    const own = !actor.permissions.includes(PERMISSIONS.PRESALES_VIEW_ALL);
    const where: Prisma.PresaleWhereInput = { status, preventistaId: own ? actor.id : undefined };
    return this.prisma.presale.findMany({
      where,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        preventista: { select: { id: true, fullName: true } },
        sale: { select: { id: true, saleNumber: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async findOne(id: string, actor: AuthUser) {
    const presale = await this.prisma.presale.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true, phone: true, creditEnabled: true } },
        address: true,
        preventista: { select: { id: true, fullName: true } },
        sale: { select: { id: true, saleNumber: true, totalAmount: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!presale) throw new NotFoundException('Preventa no encontrada');
    if (!actor.permissions.includes(PERMISSIONS.PRESALES_VIEW_ALL) && presale.preventistaId !== actor.id) {
      throw new NotFoundException('Preventa no encontrada');
    }
    return presale;
  }

  async cancel(id: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ status: PresaleStatus }[]>`SELECT status FROM presales WHERE id = ${id}::uuid FOR UPDATE`;
      if (!p) throw new NotFoundException('Preventa no encontrada');
      if (p.status !== PresaleStatus.PENDING && p.status !== PresaleStatus.CONFIRMED) {
        throw new ConflictException('Solo se pueden cancelar preventas pendientes');
      }
      await tx.presale.update({ where: { id }, data: { status: PresaleStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason } });
      await this.audit.log({ userId: actor.id, action: 'presales.cancel', entityType: 'presale', entityId: id, reason }, tx);
    });
    return this.findOne(id, actor);
  }
}

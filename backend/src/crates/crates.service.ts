import { BadRequestException, Injectable } from '@nestjs/common';
import { CrateHolderType, CrateMovementType, Prisma, ReceivableMovementType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, money } from '../common/decimal';
import { ReceivablesService } from '../common/receivables.service';
import { PrismaService } from '../prisma/prisma.service';
import { CrateFiltersDto, CrateMovementDto } from './dto/crates.dto';

type Tx = Prisma.TransactionClient;
export interface Holder {
  type: CrateHolderType;
  id: string;
}

export interface CrateMove {
  type: CrateMovementType;
  quantity: number;
  from?: Holder | null;
  to?: Holder | null;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  chargeAmount?: Prisma.Decimal | null;
  actorId: string;
  /** El origen puede quedar en negativo (conteo del chofer en la calle; se concilia al liquidar). */
  allowNegativeFrom?: boolean;
}

const MANUAL_TYPES: CrateMovementType[] = [CrateMovementType.INITIAL, CrateMovementType.TRANSFER, CrateMovementType.RETURN, CrateMovementType.WRITE_OFF];

/**
 * Canastillos por cantidad y por responsable. Cada movimiento lleva origen y destino (almacén, vehículo,
 * cliente o persona) y actualiza el saldo materializado de ambos en la misma transacción.
 * Un almacén o una persona nunca quedan en negativo; un cliente sí puede (devolvió más de lo registrado
 * a su nombre, por ejemplo canastillos anteriores al sistema) y se ve así en el reporte.
 */
@Injectable()
export class CratesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receivables: ReceivablesService,
    private readonly audit: AuditService,
  ) {}

  /** Registra un movimiento dentro de una transacción existente (rutas, cobros, altas y bajas). */
  async move(tx: Tx, m: CrateMove) {
    if (!Number.isInteger(m.quantity) || m.quantity <= 0) throw new BadRequestException('La cantidad de canastillos debe ser un entero positivo');
    if (!m.from && !m.to) throw new BadRequestException('Indique el origen o el destino de los canastillos');
    if (m.from && m.to && m.from.type === m.to.type && m.from.id === m.to.id) throw new BadRequestException('El origen y el destino son el mismo');

    // Bloqueo en orden fijo para evitar interbloqueos entre dos movimientos cruzados.
    const holders = [m.from, m.to].filter((h): h is Holder => !!h).sort((a, b) => `${a.type}${a.id}`.localeCompare(`${b.type}${b.id}`));
    for (const h of holders) {
      await tx.$executeRaw`INSERT INTO crate_balances (holder_type, holder_id, quantity, updated_at)
        VALUES (${h.type}::"CrateHolderType", ${h.id}::uuid, 0, now()) ON CONFLICT DO NOTHING`;
      await tx.$queryRaw`SELECT quantity FROM crate_balances WHERE holder_type = ${h.type}::"CrateHolderType" AND holder_id = ${h.id}::uuid FOR UPDATE`;
    }
    if (m.from) {
      const balance = await tx.crateBalance.findUniqueOrThrow({ where: { holderType_holderId: { holderType: m.from.type, holderId: m.from.id } } });
      if (m.from.type !== CrateHolderType.CUSTOMER && !m.allowNegativeFrom && balance.quantity < m.quantity) {
        throw new BadRequestException(`${await this.holderName(tx, m.from)} tiene ${balance.quantity} canastillos; no puede entregar ${m.quantity}`);
      }
      await tx.crateBalance.update({
        where: { holderType_holderId: { holderType: m.from.type, holderId: m.from.id } },
        data: { quantity: { decrement: m.quantity } },
      });
    }
    if (m.to) {
      await tx.crateBalance.update({
        where: { holderType_holderId: { holderType: m.to.type, holderId: m.to.id } },
        data: { quantity: { increment: m.quantity } },
      });
    }
    return tx.crateMovement.create({
      data: {
        type: m.type,
        quantity: m.quantity,
        fromType: m.from?.type,
        fromId: m.from?.id,
        toType: m.to?.type,
        toId: m.to?.id,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        reason: m.reason,
        chargeAmount: m.chargeAmount ?? undefined,
        createdById: m.actorId,
      },
    });
  }

  /** Movimiento manual desde la web: alta, traspaso, recepción en almacén o baja (con sanción opcional al cliente). */
  async manual(dto: CrateMovementDto, actor: AuthUser) {
    if (!MANUAL_TYPES.includes(dto.type)) throw new BadRequestException('Ese tipo de movimiento lo registran las rutas y los cobros');
    if (dto.type === CrateMovementType.INITIAL && (dto.from || !dto.to || dto.to.type !== CrateHolderType.WAREHOUSE)) {
      throw new BadRequestException('Un alta ingresa canastillos a un almacén');
    }
    if (dto.type === CrateMovementType.WRITE_OFF && (!dto.from || dto.to)) throw new BadRequestException('Una baja sale de un tenedor y no va a ninguno');
    if ((dto.type === CrateMovementType.TRANSFER || dto.type === CrateMovementType.RETURN) && (!dto.from || !dto.to)) {
      throw new BadRequestException('Indique origen y destino');
    }
    if (dto.type === CrateMovementType.RETURN && dto.to?.type !== CrateHolderType.WAREHOUSE) throw new BadRequestException('Una devolución llega a un almacén');
    if ((dto.type === CrateMovementType.WRITE_OFF || dto.type === CrateMovementType.TRANSFER) && !dto.reason?.trim()) {
      throw new BadRequestException('Indique el motivo');
    }
    const charge = dto.chargePerCrate ? money(D(dto.chargePerCrate).times(dto.quantity)) : null;
    if (charge && (dto.type !== CrateMovementType.WRITE_OFF || dto.from?.type !== CrateHolderType.CUSTOMER)) {
      throw new BadRequestException('La sanción se cobra solo al dar de baja canastillos que perdió un cliente');
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      for (const h of [dto.from, dto.to]) if (h) await this.holderName(tx, h); // valida que exista
      const mv = await this.move(tx, {
        type: dto.type,
        quantity: dto.quantity,
        from: dto.from,
        to: dto.to,
        reason: dto.reason?.trim(),
        chargeAmount: charge,
        actorId: actor.id,
      });
      if (charge) {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${dto.from!.id}::uuid FOR UPDATE`;
        await this.receivables.apply(tx, {
          customerId: dto.from!.id,
          type: ReceivableMovementType.ADJUSTMENT,
          amount: charge,
          referenceType: 'crate_movement',
          referenceId: mv.id,
          actorId: actor.id,
          reason: `Sanción por ${dto.quantity} canastillo(s) no devuelto(s): ${dto.reason?.trim()}`,
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: `crates.${dto.type.toLowerCase()}`,
          entityType: 'crate_movement',
          entityId: mv.id,
          newData: { quantity: dto.quantity, from: dto.from, to: dto.to, charge: charge?.toFixed(2) },
          reason: dto.reason,
        },
        tx,
      );
      return mv;
    });
    return (await this.present([movement]))[0];
  }

  /** Saldos con el nombre de cada tenedor, agrupados por tipo. */
  async balances() {
    const rows = await this.prisma.crateBalance.findMany({ where: { quantity: { not: 0 } }, orderBy: { quantity: 'desc' } });
    const names = await this.names(rows.map((r) => ({ type: r.holderType, id: r.holderId })));
    const list = rows.map((r) => ({ holderType: r.holderType, holderId: r.holderId, quantity: r.quantity, ...names.get(`${r.holderType}:${r.holderId}`)! }));
    const total = list.reduce((t, r) => t + r.quantity, 0);
    const sum = (type: CrateHolderType) => list.filter((r) => r.holderType === type).reduce((t, r) => t + r.quantity, 0);
    return {
      total,
      inWarehouses: list.filter((r) => r.holderType === CrateHolderType.WAREHOUSE && r.kind !== 'VEHICLE').reduce((t, r) => t + r.quantity, 0),
      inVehicles: list.filter((r) => r.kind === 'VEHICLE').reduce((t, r) => t + r.quantity, 0),
      withCustomers: sum(CrateHolderType.CUSTOMER),
      withPeople: sum(CrateHolderType.USER),
      holders: list,
    };
  }

  async movements(f: CrateFiltersDto) {
    const holder = f.holderType && f.holderId ? { type: f.holderType, id: f.holderId } : null;
    const rows = await this.prisma.crateMovement.findMany({
      where: {
        type: f.type,
        OR: holder ? [{ fromType: holder.type, fromId: holder.id }, { toType: holder.type, toId: holder.id }] : undefined,
      },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return this.present(rows);
  }

  /** Posibles tenedores para elegir en un movimiento manual. */
  async holders() {
    const [warehouses, customers, people] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      this.prisma.customer.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
      this.prisma.user.findMany({
        where: { isActive: true, role: { code: { in: ['DRIVER', 'COLLECTOR'] } } },
        select: { id: true, fullName: true, role: { select: { name: true } } },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    return {
      warehouses,
      customers,
      people: people.map((p) => ({ id: p.id, name: p.fullName, role: p.role.name })),
    };
  }

  /** Canastillos que tiene un cliente (para su ficha y para el cobrador). */
  async customerBalance(customerId: string) {
    const b = await this.prisma.crateBalance.findUnique({ where: { holderType_holderId: { holderType: CrateHolderType.CUSTOMER, holderId: customerId } } });
    return b?.quantity ?? 0;
  }

  // ── Internos ────────────────────────────────────────────

  private async present<T extends { fromType: CrateHolderType | null; fromId: string | null; toType: CrateHolderType | null; toId: string | null }>(rows: T[]) {
    const holders = rows.flatMap((r) => [
      ...(r.fromType && r.fromId ? [{ type: r.fromType, id: r.fromId }] : []),
      ...(r.toType && r.toId ? [{ type: r.toType, id: r.toId }] : []),
    ]);
    const names = await this.names(holders);
    return rows.map((r) => ({
      ...r,
      from: r.fromType && r.fromId ? { type: r.fromType, id: r.fromId, ...names.get(`${r.fromType}:${r.fromId}`)! } : null,
      to: r.toType && r.toId ? { type: r.toType, id: r.toId, ...names.get(`${r.toType}:${r.toId}`)! } : null,
    }));
  }

  /** Nombre visible de cada tenedor (y si un almacén es un vehículo). */
  private async names(holders: Holder[]) {
    const ids = (t: CrateHolderType) => [...new Set(holders.filter((h) => h.type === t).map((h) => h.id))];
    const [warehouses, customers, users] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { id: { in: ids(CrateHolderType.WAREHOUSE) } }, select: { id: true, name: true, type: true } }),
      this.prisma.customer.findMany({ where: { id: { in: ids(CrateHolderType.CUSTOMER) } }, select: { id: true, name: true, code: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids(CrateHolderType.USER) } }, select: { id: true, fullName: true, role: { select: { name: true } } } }),
    ]);
    const map = new Map<string, { name: string; kind: string }>();
    for (const w of warehouses) map.set(`WAREHOUSE:${w.id}`, { name: w.name, kind: w.type });
    for (const c of customers) map.set(`CUSTOMER:${c.id}`, { name: c.name, kind: 'CUSTOMER' });
    for (const u of users) map.set(`USER:${u.id}`, { name: u.fullName, kind: u.role.name });
    for (const h of holders) if (!map.has(`${h.type}:${h.id}`)) map.set(`${h.type}:${h.id}`, { name: '(desconocido)', kind: h.type });
    return map;
  }

  private async holderName(tx: Tx, h: Holder) {
    const found =
      h.type === CrateHolderType.WAREHOUSE
        ? (await tx.warehouse.findUnique({ where: { id: h.id } }))?.name
        : h.type === CrateHolderType.CUSTOMER
          ? (await tx.customer.findUnique({ where: { id: h.id } }))?.name
          : (await tx.user.findUnique({ where: { id: h.id } }))?.fullName;
    if (!found) throw new BadRequestException('El tenedor de canastillos no existe');
    return found;
  }
}

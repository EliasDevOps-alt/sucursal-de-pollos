import { ForbiddenException, Injectable } from '@nestjs/common';
import { CustomerStatus, PresaleStatus, Prisma, SyncStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, kg, money, ZERO } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CustomerCreatePayload,
  GpsPositionPayload,
  parsePayload,
  PresaleCancelPayload,
  PresaleCreatePayload,
} from './dto/payloads';
import { RegisterDeviceDto, SyncOperationDto, SyncRequestDto } from './dto/sync.dto';

type Db = Prisma.TransactionClient;

export interface SyncResult {
  deviceOperationId: string;
  status: SyncStatus;
  entityId?: string | null;
  /** Número visible asignado por el servidor (ej. P-000012, CLI-00007). */
  reference?: string | null;
  error?: string | null;
  /** true si la operación ya se había procesado antes (reintento). */
  duplicate?: boolean;
}

/** Error de negocio que se informa al móvil sin abortar el resto del lote. */
class OperationError extends Error {}

@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async registerDevice(dto: RegisterDeviceDto, user: AuthUser) {
    const existing = await this.prisma.device.findUnique({ where: { deviceUuid: dto.deviceUuid } });
    if (existing && existing.userId !== user.id) {
      // Un teléfono que cambia de usuario se reasigna y queda auditado.
      await this.audit.log({ userId: user.id, action: 'devices.reassign', entityType: 'device', entityId: existing.id, oldData: { userId: existing.userId } });
    }
    return this.prisma.device.upsert({
      where: { deviceUuid: dto.deviceUuid },
      update: { userId: user.id, platform: dto.platform, appVersion: dto.appVersion, isActive: true },
      create: { deviceUuid: dto.deviceUuid, userId: user.id, platform: dto.platform, appVersion: dto.appVersion },
    });
  }

  /**
   * Datos para trabajar sin conexión: catálogo con precio de referencia y stock, clientes,
   * tipos de cliente y las preventas propias recientes (para ver si ya fueron atendidas).
   */
  async bootstrap(user: AuthUser) {
    const central = await this.prisma.warehouse.findFirst({ where: { type: 'CENTRAL', isActive: true } });
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Precio de referencia = precio central del lote que se vendería primero (FEFO).
    const stock = central
      ? await this.prisma.$queryRaw<{ product_id: string; available_kg: Prisma.Decimal; fefo_price: Prisma.Decimal | null }[]>`
          SELECT ib.product_id,
                 SUM(ib.weight_kg) AS available_kg,
                 (SELECT lp.price_per_kg FROM inventory_balances ib2
                    JOIN lots l2 ON l2.id = ib2.lot_id
                    JOIN lot_prices lp ON lp.lot_id = l2.id AND lp.is_active AND lp.branch_id IS NULL
                   WHERE ib2.product_id = ib.product_id AND ib2.warehouse_id = ib.warehouse_id
                     AND ib2.weight_kg > 0 AND l2.status = 'ACTIVE' AND l2.expiry_date >= ${todayStr}::date
                   ORDER BY l2.expiry_date, l2.created_at LIMIT 1) AS fefo_price
          FROM inventory_balances ib
          JOIN lots l ON l.id = ib.lot_id
          WHERE ib.warehouse_id = ${central.id}::uuid AND ib.weight_kg > 0
            AND l.status = 'ACTIVE' AND l.expiry_date >= ${todayStr}::date
          GROUP BY ib.product_id, ib.warehouse_id`
      : [];
    const stockByProduct = new Map(stock.map((s) => [s.product_id, s]));

    const [products, customers, customerTypes, presales] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true },
        include: { category: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.customer.findMany({
        where: { status: CustomerStatus.ACTIVE },
        include: {
          rank: { select: { name: true, discountPercentage: true } },
          addresses: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.customerType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      this.myPresales(user.id),
    ]);

    return {
      serverTime: new Date().toISOString(),
      products: products.map((p) => {
        const s = stockByProduct.get(p.id);
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category.name,
          saleUnit: p.saleUnit,
          referencePrice: s?.fefo_price ? D(s.fefo_price) : null,
          availableKg: s ? kg(D(s.available_kg)) : ZERO,
        };
      }),
      customers: customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        phone: c.phone,
        documentId: c.documentId,
        customerTypeId: c.customerTypeId,
        rank: c.rank?.name ?? null,
        discountPercentage: c.rank?.discountPercentage ?? ZERO,
        creditEnabled: c.creditEnabled,
        creditAvailable: c.creditEnabled ? money(Prisma.Decimal.max(0, D(c.creditLimit).minus(c.currentDebt))) : ZERO,
        currentDebt: c.currentDebt,
        addresses: c.addresses.map((a) => ({
          id: a.id,
          label: a.label,
          address: a.address,
          latitude: a.latitude,
          longitude: a.longitude,
          isPrimary: a.isPrimary,
        })),
      })),
      customerTypes: customerTypes.map((t) => ({ id: t.id, name: t.name })),
      presales,
    };
  }

  private async myPresales(userId: string) {
    const presales = await this.prisma.presale.findMany({
      where: { preventistaId: userId },
      include: {
        customer: { select: { id: true, name: true } },
        sale: { select: { saleNumber: true, totalAmount: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return presales.map((p) => ({
      id: p.id,
      presaleNumber: p.presaleNumber,
      status: p.status,
      customerId: p.customerId,
      customerName: p.customer.name,
      totalAmount: p.totalAmount,
      scheduledDeliveryDate: p.scheduledDeliveryDate,
      createdAt: p.createdAt,
      cancelReason: p.cancelReason,
      saleNumber: p.sale?.saleNumber ?? null,
      saleTotal: p.sale?.totalAmount ?? null,
      items: p.items.map((i) => ({ productId: i.productId, productName: i.product.name, weightKg: i.weightKg, unitPrice: i.unitPrice, subtotal: i.subtotal })),
    }));
  }

  /**
   * Procesa un lote de operaciones offline en orden. Cada operación es atómica e idempotente:
   * si su device_operation_id ya se sincronizó, se devuelve el resultado anterior sin repetirla.
   * Un error en una operación no detiene las siguientes (salvo las que dependen de ella, que fallarán por sí solas).
   */
  async sync(dto: SyncRequestDto, user: AuthUser) {
    const device = await this.registerDevice({ deviceUuid: dto.deviceUuid, platform: 'android', appVersion: dto.appVersion }, user);

    const results: SyncResult[] = [];
    for (const op of dto.operations) {
      results.push(await this.processOperation(op, device.id, user));
    }
    await this.prisma.device.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } });
    return { serverTime: new Date().toISOString(), results };
  }

  private async processOperation(op: SyncOperationDto, deviceId: string, user: AuthUser): Promise<SyncResult> {
    const previous = await this.prisma.syncOperation.findUnique({ where: { deviceOperationId: op.deviceOperationId } });
    if (previous) {
      if (previous.userId !== user.id) {
        return { deviceOperationId: op.deviceOperationId, status: SyncStatus.ERROR, error: 'La operación pertenece a otro usuario' };
      }
      if (previous.status === SyncStatus.SYNCED) {
        const reference = (previous.payload as { _reference?: string } | null)?._reference ?? null;
        return { deviceOperationId: op.deviceOperationId, status: SyncStatus.SYNCED, entityId: previous.entityId, reference, duplicate: true };
      }
    }

    try {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const result = await this.apply(tx, op, deviceId, user);
          const record = {
            deviceId,
            userId: user.id,
            operationType: op.operationType,
            entityType: result.entityType,
            entityId: result.entityId,
            payload: { ...op.payload, _reference: result.reference } as Prisma.InputJsonValue,
            status: SyncStatus.SYNCED,
            createdAtDevice: new Date(op.createdAtDevice),
            errorMessage: null,
          };
          await tx.syncOperation.upsert({
            where: { deviceOperationId: op.deviceOperationId },
            update: { ...record, receivedAtServer: new Date() },
            create: { deviceOperationId: op.deviceOperationId, ...record },
          });
          return result;
        },
        { timeout: 20_000 },
      );
      return { deviceOperationId: op.deviceOperationId, status: SyncStatus.SYNCED, entityId: outcome.entityId, reference: outcome.reference };
    } catch (e) {
      // Los errores de negocio quedan registrados para revisión; el móvil los muestra al usuario.
      const message = e instanceof OperationError || e instanceof Error ? e.message : 'Error desconocido';
      const isBusiness = e instanceof OperationError;
      const record = {
        deviceId,
        userId: user.id,
        operationType: op.operationType,
        entityType: op.operationType.split('_')[0].toLowerCase(),
        payload: op.payload as Prisma.InputJsonValue,
        status: isBusiness ? SyncStatus.REVIEW : SyncStatus.ERROR,
        createdAtDevice: new Date(op.createdAtDevice),
        errorMessage: message,
      };
      await this.prisma.syncOperation.upsert({
        where: { deviceOperationId: op.deviceOperationId },
        update: { ...record, receivedAtServer: new Date() },
        create: { deviceOperationId: op.deviceOperationId, ...record },
      });
      return { deviceOperationId: op.deviceOperationId, status: record.status, error: message };
    }
  }

  private async apply(tx: Db, op: SyncOperationDto, deviceId: string, user: AuthUser) {
    const need = (permission: string) => {
      if (!user.permissions.includes(permission)) throw new ForbiddenException(`Sin permiso: ${permission}`);
    };

    switch (op.operationType) {
      case 'CUSTOMER_CREATE': {
        need('customers.manage');
        const p = await parsePayload(CustomerCreatePayload, op.payload);
        const type = await tx.customerType.findUnique({ where: { id: p.customerTypeId } });
        if (!type) throw new OperationError('Tipo de cliente inexistente');
        const code = await this.sequences.next(tx, 'customer', 5);
        await tx.customer.create({
          data: {
            id: p.id,
            code,
            name: p.name.trim(),
            phone: p.phone,
            documentId: p.documentId,
            customerTypeId: p.customerTypeId,
            createdById: user.id,
            addresses: p.address
              ? {
                  create: {
                    id: p.address.id,
                    label: p.address.label,
                    address: p.address.address,
                    latitude: p.address.latitude,
                    longitude: p.address.longitude,
                    isPrimary: true,
                    // La ubicación capturada por el preventista queda como principal y solo se cambia con autorización.
                    source: 'PRESALE',
                    capturedById: user.id,
                  },
                }
              : undefined,
          },
        });
        await this.audit.log({ userId: user.id, action: 'customers.create', entityType: 'customer', entityId: p.id, newData: { code, name: p.name, offline: true }, deviceId }, tx);
        return { entityType: 'customer', entityId: p.id, reference: code };
      }

      case 'PRESALE_CREATE': {
        need('presales.create');
        const p = await parsePayload(PresaleCreatePayload, op.payload);
        const customer = await tx.customer.findUnique({ where: { id: p.customerId } });
        if (!customer) throw new OperationError('El cliente del pedido no existe (¿falló su alta?)');
        if (customer.status !== CustomerStatus.ACTIVE) throw new OperationError(`El cliente ${customer.name} está inactivo`);
        if (p.addressId) {
          const address = await tx.customerAddress.findFirst({ where: { id: p.addressId, customerId: p.customerId } });
          if (!address) throw new OperationError('La dirección no pertenece al cliente');
        }
        const productIds = [...new Set(p.items.map((i) => i.productId))];
        const active = await tx.product.count({ where: { id: { in: productIds }, isActive: true } });
        if (active !== productIds.length) throw new OperationError('El pedido incluye productos inexistentes o inactivos');

        const items = p.items.map((i) => ({
          productId: i.productId,
          weightKg: kg(D(i.weightKg)),
          quantity: D(i.quantity ?? 0),
          unitPrice: D(i.unitPrice),
          subtotal: money(D(i.weightKg).times(i.unitPrice)),
          notes: i.notes,
        }));
        const presaleNumber = await this.sequences.next(tx, 'presale');
        await tx.presale.create({
          data: {
            id: p.id,
            presaleNumber,
            customerId: p.customerId,
            addressId: p.addressId,
            preventistaId: user.id,
            scheduledDeliveryDate: p.scheduledDeliveryDate ? new Date(p.scheduledDeliveryDate) : undefined,
            totalAmount: money(items.reduce((s, i) => s.plus(i.subtotal), ZERO)),
            notes: p.notes,
            latitude: p.latitude,
            longitude: p.longitude,
            createdOffline: true,
            deviceOperationId: op.deviceOperationId,
            createdAtDevice: new Date(op.createdAtDevice),
            items: { create: items },
          },
        });
        await this.audit.log({ userId: user.id, action: 'presales.create', entityType: 'presale', entityId: p.id, newData: { presaleNumber }, deviceId }, tx);
        return { entityType: 'presale', entityId: p.id, reference: presaleNumber };
      }

      case 'PRESALE_CANCEL': {
        need('presales.create');
        const p = await parsePayload(PresaleCancelPayload, op.payload);
        const [presale] = await tx.$queryRaw<{ id: string; status: PresaleStatus; preventista_id: string; presale_number: string }[]>`
          SELECT id, status, preventista_id, presale_number FROM presales WHERE id = ${p.presaleId}::uuid FOR UPDATE`;
        if (!presale) throw new OperationError('El pedido no existe en el servidor');
        if (presale.preventista_id !== user.id) throw new OperationError('Solo puede cancelar sus propios pedidos');
        if (presale.status === PresaleStatus.CANCELLED) return { entityType: 'presale', entityId: presale.id, reference: presale.presale_number };
        if (presale.status !== PresaleStatus.PENDING && presale.status !== PresaleStatus.CONFIRMED) {
          // Conflicto visible: el pedido ya fue atendido o asignado mientras el teléfono estaba sin conexión.
          throw new OperationError(`El pedido ${presale.presale_number} ya fue ${presale.status === PresaleStatus.DELIVERED ? 'atendido' : 'asignado a ruta'} y no puede cancelarse`);
        }
        await tx.presale.update({ where: { id: presale.id }, data: { status: PresaleStatus.CANCELLED, cancelledAt: new Date(), cancelReason: p.reason } });
        await this.audit.log({ userId: user.id, action: 'presales.cancel', entityType: 'presale', entityId: presale.id, reason: p.reason, deviceId }, tx);
        return { entityType: 'presale', entityId: presale.id, reference: presale.presale_number };
      }

      case 'GPS_POSITION': {
        need('sync.push');
        const p = await parsePayload(GpsPositionPayload, op.payload);
        const position = await tx.gpsPosition.create({
          data: {
            deviceId,
            userId: user.id,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracyMeters: p.accuracyMeters,
            eventType: p.eventType,
            referenceId: p.referenceId,
            capturedAtDevice: new Date(op.createdAtDevice),
          },
        });
        return { entityType: 'gps_position', entityId: position.id, reference: null };
      }
    }
  }
}

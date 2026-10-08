import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, PresaleStatus, Prisma, SyncStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { D, kg, money, ZERO } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { PERMISSIONS } from '../auth/permissions';
import { CollectionsService } from '../collections/collections.service';
import { CratesService } from '../crates/crates.service';
import { RoutesService } from '../logistics/routes.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CustomerAddressAddPayload,
  CollectionCreatePayload,
  CratePickupPayload,
  CustomerCreatePayload,
  DeliveryCompletePayload,
  DeliveryFailPayload,
  GpsPositionPayload,
  parsePayload,
  PresaleCancelPayload,
  PresaleCreatePayload,
  PresaleUpdatePayload,
  VisitCreatePayload,
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
    private readonly routes: RoutesService,
    private readonly collections: CollectionsService,
    private readonly crates: CratesService,
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

    // Para cobrar: canastillos que tiene cada cliente y desde cuándo debe (cargo más antiguo sin saldar).
    const debtInfo = await this.prisma.$queryRaw<{ id: string; crates: number | null; oldest_charge: Date | null }[]>`
      SELECT c.id,
        (SELECT cb.quantity FROM crate_balances cb WHERE cb.holder_type = 'CUSTOMER' AND cb.holder_id = c.id) AS crates,
        CASE WHEN c.current_debt > 0 THEN (SELECT MIN(rm.created_at) FROM receivable_movements rm
          WHERE rm.customer_id = c.id AND rm.movement_type = 'CHARGE'
            AND rm.created_at > COALESCE((SELECT MAX(z.created_at) FROM receivable_movements z WHERE z.customer_id = c.id AND z.balance_after <= 0), '-infinity'::timestamp))
        END AS oldest_charge
      FROM customers c WHERE c.status = 'ACTIVE'`;
    const debtById = new Map(debtInfo.map((d) => [d.id, d]));

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
        cratesHeld: Number(debtById.get(c.id)?.crates ?? 0),
        debtSince: debtById.get(c.id)?.oldest_charge ?? null,
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
      // Chofer: sus rutas con paradas, pedidos y lo ya registrado (sin las firmas, para no pesar).
      // Cobrador: sus cobros de los últimos días (para ver lo cobrado y los recibos).
      collections: user.permissions.includes(PERMISSIONS.COLLECTIONS_CREATE) && !user.permissions.includes(PERMISSIONS.PRESALES_CREATE)
        ? await this.myCollections(user.id)
        : [],
      routes: user.permissions.includes(PERMISSIONS.DELIVERIES_REGISTER)
        ? (await this.routes.forDriver(user.id)).map((r) => ({ ...r, stops: r.stops.map(({ signature, ...s }) => ({ ...s, signed: !!signature })) }))
        : [],
    };
  }

  private async myCollections(userId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { receivedById: userId, saleId: null, paymentDate: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { paymentDate: 'desc' },
    });
    return rows.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      customerId: p.customerId,
      customerName: p.customer?.name ?? '',
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      status: p.status,
      isAdvance: p.isAdvance,
      collectedAt: p.collectedAtDevice ?? p.paymentDate,
    }));
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
      addressId: p.addressId,
      notes: p.notes,
      // Hora en que el preventista tomó el pedido (no la de llegada al servidor).
      createdAt: p.createdAtDevice ?? p.createdAt,
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

      case 'PRESALE_UPDATE': {
        need('presales.create');
        const p = await parsePayload(PresaleUpdatePayload, op.payload);
        const [presale] = await tx.$queryRaw<{ id: string; status: PresaleStatus; preventista_id: string; presale_number: string; customer_id: string }[]>`
          SELECT id, status, preventista_id, presale_number, customer_id FROM presales WHERE id = ${p.presaleId}::uuid FOR UPDATE`;
        if (!presale) throw new OperationError('El pedido no existe en el servidor');
        if (presale.preventista_id !== user.id) throw new OperationError('Solo puede modificar sus propios pedidos');
        if (presale.status !== PresaleStatus.PENDING && presale.status !== PresaleStatus.CONFIRMED) {
          // Regla del alcance: un pedido no se modifica después de atendido o asignado a ruta.
          throw new OperationError(`El pedido ${presale.presale_number} ya fue ${presale.status === PresaleStatus.DELIVERED ? 'atendido' : presale.status === PresaleStatus.CANCELLED ? 'cancelado' : 'asignado a ruta'} y no puede modificarse`);
        }
        if (p.addressId && !(await tx.customerAddress.findFirst({ where: { id: p.addressId, customerId: presale.customer_id } }))) {
          throw new OperationError('La dirección no pertenece al cliente');
        }
        const productIds = [...new Set(p.items.map((i) => i.productId))];
        if ((await tx.product.count({ where: { id: { in: productIds }, isActive: true } })) !== productIds.length) {
          throw new OperationError('El pedido incluye productos inexistentes o inactivos');
        }
        const before = await tx.presale.findUniqueOrThrow({ where: { id: presale.id }, include: { items: true } });
        const items = p.items.map((i) => ({
          productId: i.productId,
          weightKg: kg(D(i.weightKg)),
          quantity: D(i.quantity ?? 0),
          unitPrice: D(i.unitPrice),
          subtotal: money(D(i.weightKg).times(i.unitPrice)),
          notes: i.notes,
        }));
        await tx.presaleItem.deleteMany({ where: { presaleId: presale.id } });
        await tx.presale.update({
          where: { id: presale.id },
          data: {
            addressId: p.addressId,
            scheduledDeliveryDate: p.scheduledDeliveryDate ? new Date(p.scheduledDeliveryDate) : undefined,
            notes: p.notes,
            totalAmount: money(items.reduce((s, i) => s.plus(i.subtotal), ZERO)),
            items: { create: items },
          },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'presales.update',
            entityType: 'presale',
            entityId: presale.id,
            oldData: { total: before.totalAmount, items: before.items.map((i) => ({ productId: i.productId, weightKg: i.weightKg })) },
            newData: { items: items.map((i) => ({ productId: i.productId, weightKg: i.weightKg })) },
            deviceId,
          },
          tx,
        );
        return { entityType: 'presale', entityId: presale.id, reference: presale.presale_number };
      }

      case 'CUSTOMER_ADDRESS_ADD': {
        need('customers.manage');
        const p = await parsePayload(CustomerAddressAddPayload, op.payload);
        const customer = await tx.customer.findUnique({ where: { id: p.customerId } });
        if (!customer) throw new OperationError('El cliente no existe (¿falló su alta?)');
        const hasPrimary = (await tx.customerAddress.count({ where: { customerId: p.customerId, isPrimary: true, isActive: true } })) > 0;
        await tx.customerAddress.create({
          data: {
            id: p.id,
            customerId: p.customerId,
            label: p.label,
            address: p.address,
            latitude: p.latitude,
            longitude: p.longitude,
            // La dirección principal no cambia sin una operación autorizada: las nuevas son adicionales.
            isPrimary: !hasPrimary,
            source: 'PRESALE',
            capturedById: user.id,
          },
        });
        await this.audit.log({ userId: user.id, action: 'customers.address_add', entityType: 'customer', entityId: p.customerId, newData: { label: p.label, address: p.address }, deviceId }, tx);
        return { entityType: 'customer_address', entityId: p.id, reference: null };
      }

      case 'VISIT_CREATE': {
        need('presales.create');
        const p = await parsePayload(VisitCreatePayload, op.payload);
        if (!(await tx.customer.findUnique({ where: { id: p.customerId } }))) throw new OperationError('El cliente de la visita no existe');
        await tx.visit.create({
          data: {
            id: p.id,
            preventistaId: user.id,
            customerId: p.customerId,
            outcome: p.outcome,
            notes: p.notes,
            presaleId: p.presaleId,
            latitude: p.latitude,
            longitude: p.longitude,
            visitedAtDevice: new Date(op.createdAtDevice),
          },
        });
        return { entityType: 'visit', entityId: p.id, reference: null };
      }

      case 'DELIVERY_COMPLETE': {
        need(PERMISSIONS.DELIVERIES_REGISTER);
        const p = await parsePayload(DeliveryCompletePayload, op.payload);
        const { stopId, ...dto } = p;
        const r = await this.asOperation(() =>
          this.routes.deliverInTx(tx, stopId, dto, user, { at: new Date(op.createdAtDevice), operationId: op.deviceOperationId }),
        );
        return { entityType: 'route_stop', entityId: r.stopId, reference: r.saleNumber };
      }

      case 'DELIVERY_FAIL': {
        need(PERMISSIONS.DELIVERIES_REGISTER);
        const p = await parsePayload(DeliveryFailPayload, op.payload);
        const { stopId, ...dto } = p;
        const r = await this.asOperation(() =>
          this.routes.failInTx(tx, stopId, dto, user, { at: new Date(op.createdAtDevice), operationId: op.deviceOperationId }),
        );
        return { entityType: 'route_stop', entityId: r.stopId, reference: null };
      }

      case 'COLLECTION_CREATE': {
        need(PERMISSIONS.COLLECTIONS_CREATE);
        const p = await parsePayload(CollectionCreatePayload, op.payload);
        const id = await this.asOperation(() =>
          this.collections.createInTx(
            tx,
            { customerId: p.customerId, amount: p.amount, paymentMethod: p.paymentMethod, referenceNumber: p.referenceNumber, notes: p.notes },
            user,
            {
              id: p.id,
              operationId: op.deviceOperationId,
              at: new Date(op.createdAtDevice),
              paidByName: p.paidByName?.trim() || undefined,
              signature: p.signature,
              latitude: p.latitude,
              longitude: p.longitude,
              cratesPickedUp: p.cratesPickedUp,
            },
          ),
        );
        const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
        return { entityType: 'payment', entityId: id, reference: payment.receiptNumber };
      }

      case 'CRATE_PICKUP': {
        need(PERMISSIONS.COLLECTIONS_CREATE);
        const p = await parsePayload(CratePickupPayload, op.payload);
        const customer = await tx.customer.findUnique({ where: { id: p.customerId } });
        if (!customer) throw new OperationError('Cliente inexistente');
        const mv = await this.crates.move(tx, {
          type: 'PICKUP',
          quantity: p.quantity,
          from: { type: 'CUSTOMER', id: customer.id },
          to: { type: 'USER', id: user.id },
          reason: p.notes?.trim() || 'Recogidos por el cobrador',
          actorId: user.id,
        });
        return { entityType: 'crate_movement', entityId: mv.id, reference: null };
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

  /** Convierte los errores de negocio de los servicios compartidos en errores de operación (quedan en REVIEW). */
  private async asOperation<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ConflictException || e instanceof NotFoundException || e instanceof ForbiddenException) {
        throw new OperationError(e.message);
      }
      throw e;
    }
  }
}

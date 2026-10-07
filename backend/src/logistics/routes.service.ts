import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PresaleStatus, Prisma, RouteStatus, StopStatus, TransferStatus, WarehouseType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PERMISSIONS } from '../auth/permissions';
import { D, kg, money, ZERO } from '../common/decimal';
import { SequenceService } from '../common/sequence.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { TransfersService } from '../transfers/transfers.service';
import { CloseRouteDto, DeliverStopDto, DispatchRouteDto, FailStopDto, RouteFiltersDto, SaveRouteDto } from './dto/logistics.dto';

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 30_000 };
/** Kg aproximados por canastillo, para estimar cuántos lleva el vehículo. */
export const KG_PER_CRATE = 20;

const userRef = { select: { id: true, fullName: true } } as const;
const routeInclude = {
  vehicle: true,
  driver: userRef,
  originWarehouse: { select: { id: true, code: true, name: true } },
  createdBy: userRef,
  dispatchedBy: userRef,
  closedBy: userRef,
  cancelledBy: userRef,
  loadTransfer: { include: { items: { include: { product: { select: { id: true, name: true } }, lot: { select: { id: true, lotCode: true } } } } } },
  returnTransfer: { include: { items: { include: { product: { select: { id: true, name: true } }, lot: { select: { id: true, lotCode: true } } } } } },
  stops: {
    orderBy: { sequence: 'asc' },
    include: {
      customer: { select: { id: true, code: true, name: true, phone: true, creditEnabled: true, creditLimit: true, currentDebt: true } },
      address: true,
      presale: { select: { id: true, presaleNumber: true, totalAmount: true, notes: true, preventista: userRef } },
      sale: { select: { id: true, saleNumber: true, totalAmount: true, paidAmount: true, creditAmount: true, paymentStatus: true, creditExceptionReason: true } },
      creditAuthorizedBy: userRef,
      recordedBy: userRef,
      items: { include: { product: { select: { id: true, code: true, name: true } } } },
    },
  },
} satisfies Prisma.DeliveryRouteInclude;

export type RouteWithStops = Prisma.DeliveryRouteGetPayload<{ include: typeof routeInclude }>;

/**
 * Rutas de entrega: se arman con preventas pendientes, se despachan (la carga pasa al almacén del vehículo
 * y la ruta queda fija), el chofer entrega o informa el problema en cada parada y al final se liquida
 * devolviendo el sobrante pesado al almacén. Cada entrega genera la venta desde el stock del vehículo.
 */
@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly transfers: TransfersService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
  ) {}

  // ── Consultas ───────────────────────────────────────────

  async findAll(f: RouteFiltersDto) {
    const routes = await this.prisma.deliveryRoute.findMany({
      where: { status: f.status, routeDate: f.date ? new Date(`${f.date.slice(0, 10)}T00:00:00Z`) : undefined },
      include: {
        vehicle: { select: { id: true, plate: true, description: true } },
        driver: userRef,
        stops: { select: { status: true, presale: { select: { totalAmount: true } }, items: { select: { orderedWeightKg: true } } } },
      },
      orderBy: [{ routeDate: 'desc' }, { routeNumber: 'desc' }],
      take: 200,
    });
    return routes.map(({ stops, ...r }) => ({
      ...r,
      summary: {
        stops: stops.length,
        delivered: stops.filter((s) => s.status === StopStatus.DELIVERED || s.status === StopStatus.PARTIAL).length,
        failed: stops.filter((s) => s.status === StopStatus.FAILED).length,
        orderedKg: kg(stops.reduce((t, s) => t.plus(s.items.reduce((u, i) => u.plus(i.orderedWeightKg), ZERO)), ZERO)),
        orderedAmount: money(stops.reduce((t, s) => t.plus(s.presale.totalAmount), ZERO)),
      },
    }));
  }

  async findOne(id: string) {
    const route = await this.prisma.deliveryRoute.findUnique({ where: { id }, include: routeInclude });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return this.present(route);
  }

  /** Preventas que se pueden asignar a una ruta para esa fecha (pendientes y sin ruta activa). */
  async candidates(date: string) {
    const presales = await this.prisma.presale.findMany({
      where: {
        status: { in: [PresaleStatus.PENDING, PresaleStatus.CONFIRMED] },
        OR: [{ scheduledDeliveryDate: null }, { scheduledDeliveryDate: { lte: new Date(`${date}T00:00:00Z`) } }],
      },
      include: {
        customer: { select: { id: true, code: true, name: true, creditEnabled: true, creditLimit: true, currentDebt: true } },
        address: true,
        preventista: userRef,
        items: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: [{ scheduledDeliveryDate: 'asc' }, { createdAt: 'asc' }],
    });
    return presales.map((p) => {
      const available = p.customer.creditEnabled ? D(p.customer.creditLimit).minus(p.customer.currentDebt) : ZERO;
      return {
        id: p.id,
        presaleNumber: p.presaleNumber,
        scheduledDeliveryDate: p.scheduledDeliveryDate,
        totalAmount: p.totalAmount,
        notes: p.notes,
        customer: p.customer,
        address: p.address,
        preventista: p.preventista,
        weightKg: kg(p.items.reduce((t, i) => t.plus(i.weightKg), ZERO)),
        items: p.items.map((i) => ({ productId: i.productId, productName: i.product.name, weightKg: i.weightKg })),
        // Si se entregara todo a crédito, ¿cabe en el límite? Ayuda a decidir si autorizar de antemano.
        creditAvailable: money(Prisma.Decimal.max(0, available)),
        creditWouldExceed: !p.customer.creditEnabled || D(p.totalAmount).gt(available),
      };
    });
  }

  drivers() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { code: 'DRIVER' } },
      select: { id: true, fullName: true, username: true, phone: true },
      orderBy: { fullName: 'asc' },
    });
  }

  /** Rutas del chofer para trabajar sin conexión: las en curso y las planificadas desde ayer. */
  async forDriver(driverId: string) {
    const since = new Date(Date.now() - 2 * 86_400_000);
    const routes = await this.prisma.deliveryRoute.findMany({
      where: {
        driverId,
        OR: [{ status: RouteStatus.IN_PROGRESS }, { status: { in: [RouteStatus.PLANNED, RouteStatus.COMPLETED] }, routeDate: { gte: since } }],
      },
      include: routeInclude,
      orderBy: { routeDate: 'asc' },
    });
    return routes.map((r) => this.present(r));
  }

  /** Posiciones GPS del chofer durante la ruta (desde el despacho hasta el cierre). */
  async tracking(id: string) {
    const route = await this.prisma.deliveryRoute.findUnique({ where: { id } });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    if (!route.dispatchedAt) return [];
    return this.prisma.gpsPosition.findMany({
      where: { userId: route.driverId, capturedAtDevice: { gte: route.dispatchedAt, lte: route.closedAt ?? new Date() } },
      select: { id: true, latitude: true, longitude: true, accuracyMeters: true, eventType: true, referenceId: true, capturedAtDevice: true },
      orderBy: { capturedAtDevice: 'asc' },
      take: 5000,
    });
  }

  // ── Planificación ───────────────────────────────────────

  async create(dto: SaveRouteDto, actor: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      const routeNumber = await this.sequences.next(tx, 'route');
      const origin = await this.resolveOrigin(tx, dto.originWarehouseId);
      const route = await tx.deliveryRoute.create({
        data: {
          routeNumber,
          routeDate: new Date(`${dto.routeDate}T00:00:00Z`),
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          originWarehouseId: origin.id,
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.validateAssignment(tx, route.id, dto);
      await this.assignStops(tx, route.id, dto, actor);
      await this.audit.log({ userId: actor.id, action: 'routes.create', entityType: 'route', entityId: route.id, newData: { routeNumber, ...dto } }, tx);
      return route.id;
    }, TX_OPTIONS);
    return this.findOne(id);
  }

  /** Mientras está planificada se puede cambiar todo: vehículo, chofer, pedidos y su orden. */
  async update(id: string, dto: SaveRouteDto, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lock(tx, id);
      if (route.status !== RouteStatus.PLANNED) throw new ConflictException('La ruta ya fue despachada: su recorrido es fijo');
      const origin = await this.resolveOrigin(tx, dto.originWarehouseId ?? route.originWarehouseId);
      await tx.deliveryRoute.update({
        where: { id },
        data: { routeDate: new Date(`${dto.routeDate}T00:00:00Z`), vehicleId: dto.vehicleId, driverId: dto.driverId, originWarehouseId: origin.id, notes: dto.notes },
      });
      await this.validateAssignment(tx, id, dto);
      // Se liberan las preventas que salen de la ruta y se vuelven a armar las paradas.
      const previous = await tx.routeStop.findMany({ where: { routeId: id } });
      const kept = new Set(dto.stops.map((s) => s.presaleId));
      for (const stop of previous) {
        if (!kept.has(stop.presaleId)) await tx.presale.update({ where: { id: stop.presaleId }, data: { status: PresaleStatus.PENDING } });
      }
      await tx.routeStopItem.deleteMany({ where: { stop: { routeId: id } } });
      await tx.routeStop.deleteMany({ where: { routeId: id } });
      await this.assignStops(tx, id, dto, actor, new Set(previous.map((p) => p.presaleId)));
      await this.audit.log({ userId: actor.id, action: 'routes.update', entityType: 'route', entityId: id, newData: dto }, tx);
    }, TX_OPTIONS);
    return this.findOne(id);
  }

  async cancel(id: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lock(tx, id);
      if (route.status !== RouteStatus.PLANNED) throw new ConflictException('Solo se cancela una ruta planificada; una despachada se cierra con su liquidación');
      const stops = await tx.routeStop.findMany({ where: { routeId: id } });
      await tx.presale.updateMany({ where: { id: { in: stops.map((s) => s.presaleId) } }, data: { status: PresaleStatus.PENDING } });
      await tx.deliveryRoute.update({ where: { id }, data: { status: RouteStatus.CANCELLED, cancelledAt: new Date(), cancelledById: actor.id, cancelReason: reason } });
      await this.audit.log({ userId: actor.id, action: 'routes.cancel', entityType: 'route', entityId: id, oldData: { status: route.status }, reason }, tx);
    }, TX_OPTIONS);
    return this.findOne(id);
  }

  // ── Despacho ────────────────────────────────────────────

  /** Carga el vehículo: transfiere del almacén de origen al del vehículo (hoja de carga) y fija la ruta. */
  async dispatch(id: string, dto: DispatchRouteDto, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lock(tx, id);
      if (route.status !== RouteStatus.PLANNED) throw new ConflictException('La ruta ya fue despachada o cerrada');
      const full = await tx.deliveryRoute.findUniqueOrThrow({ where: { id }, include: { vehicle: true, stops: { include: { items: true } } } });
      if (!full.vehicle.isActive) throw new BadRequestException('El vehículo está inactivo');

      const ordered = new Map<string, Prisma.Decimal>();
      for (const item of full.stops.flatMap((s) => s.items)) ordered.set(item.productId, (ordered.get(item.productId) ?? ZERO).plus(item.orderedWeightKg));
      const loads = dto.loads?.length ? new Map(dto.loads.map((l) => [l.productId, kg(D(l.weightKg))])) : ordered;
      for (const [productId, weight] of ordered) {
        if ((loads.get(productId) ?? ZERO).lt(weight)) {
          const product = await tx.product.findUnique({ where: { id: productId } });
          throw new BadRequestException(`${product?.name}: la carga (${(loads.get(productId) ?? ZERO).toFixed(3)} kg) no cubre lo pedido (${weight.toFixed(3)} kg)`);
        }
      }
      const total = [...loads.values()].reduce((t, w) => t.plus(w), ZERO);
      if (total.gt(full.vehicle.capacityKg)) {
        throw new BadRequestException(`La carga (${total.toFixed(3)} kg) supera la capacidad del vehículo ${full.vehicle.plate} (${D(full.vehicle.capacityKg).toFixed(0)} kg)`);
      }
      // El vehículo debe salir vacío: lo de una ruta anterior ya se devolvió al cerrarla.
      const leftover = await tx.inventoryBalance.aggregate({ where: { warehouseId: full.vehicle.warehouseId }, _sum: { weightKg: true } });
      if (D(leftover._sum.weightKg ?? 0).gt(0)) throw new ConflictException(`El vehículo ${full.vehicle.plate} todavía tiene carga de otra ruta sin liquidar`);

      const items = [...loads.entries()].filter(([, w]) => w.gt(0)).map(([productId, w]) => ({ productId, weightKg: w.toNumber() }));
      const transferId = await this.transfers.createInTx(
        tx,
        { originWarehouseId: route.originWarehouseId, destinationWarehouseId: full.vehicle.warehouseId, items, notes: `Carga de la ruta ${route.routeNumber}` },
        actor,
      );
      await this.transfers.receiveInTx(tx, transferId, { notes: 'Cargado en el vehículo al despachar' }, actor);
      await tx.deliveryRoute.update({
        where: { id },
        data: { status: RouteStatus.IN_PROGRESS, dispatchedAt: new Date(), dispatchedById: actor.id, loadTransferId: transferId },
      });
      await this.audit.log({ userId: actor.id, action: 'routes.dispatch', entityType: 'route', entityId: id, newData: { loads: items, totalKg: total.toFixed(3) } }, tx);
    }, TX_OPTIONS);
    return this.findOne(id);
  }

  // ── Entregas ────────────────────────────────────────────

  /** Registra la entrega (desde la web o desde el teléfono del chofer dentro de su sincronización). */
  async deliverInTx(tx: Tx, stopId: string, dto: DeliverStopDto, actor: AuthUser, device?: { at: Date; operationId: string }) {
    const { stop, route } = await this.lockStop(tx, stopId, actor);

    const byProduct = new Map(dto.items.map((i) => [i.productId, i]));
    for (const productId of byProduct.keys()) {
      if (!stop.items.some((i) => i.productId === productId)) throw new BadRequestException('Un producto entregado no está en el pedido');
    }
    let anyDifference = false;
    const lines: { productId: string; weightKg: number }[] = [];
    for (const item of stop.items) {
      const got = byProduct.get(item.productId);
      const delivered = kg(D(got?.deliveredWeightKg ?? 0));
      const differs = !delivered.eq(item.orderedWeightKg);
      if (differs) {
        anyDifference = true;
        if (!got?.differenceReason?.trim()) {
          throw new BadRequestException(`${item.product.name}: se pidió ${D(item.orderedWeightKg).toFixed(3)} kg y se entrega ${delivered.toFixed(3)} kg; indique el motivo de la diferencia`);
        }
      }
      if (delivered.gt(0)) lines.push({ productId: item.productId, weightKg: delivered.toNumber() });
    }
    if (!lines.length) throw new BadRequestException('No se entregó nada: registre la parada como no entregada, con su motivo');

    const saleId = await this.sales.createInTx(
      tx,
      {
        warehouseId: route.vehicle.warehouseId,
        customerId: stop.customerId,
        presaleId: stop.presaleId,
        items: lines,
        paidAmount: dto.paidAmount,
        paymentMethod: dto.paidAmount > 0 ? dto.paymentMethod ?? 'EFECTIVO' : undefined,
        notes: `Entrega en ruta ${route.routeNumber}`,
      },
      actor,
      null,
      {
        routeNumber: route.routeNumber,
        creditApprover: stop.creditAuthorizedBy ? { id: stop.creditAuthorizedBy.id, fullName: stop.creditAuthorizedBy.fullName, reason: stop.creditAuthReason ?? 'Autorizado al planificar la ruta' } : null,
      },
    );

    for (const item of stop.items) {
      const got = byProduct.get(item.productId);
      await tx.routeStopItem.update({
        where: { id: item.id },
        data: { deliveredWeightKg: kg(D(got?.deliveredWeightKg ?? 0)), differenceReason: got?.differenceReason?.trim() || null },
      });
    }
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    await tx.routeStop.update({
      where: { id: stop.id },
      data: {
        status: anyDifference ? StopStatus.PARTIAL : StopStatus.DELIVERED,
        saleId,
        receivedByName: dto.receivedByName.trim(),
        signature: dto.signature,
        // Lo cobrado de verdad (si excedió el total real, el excedente quedó como saldo a favor).
        paidAmount: money(D(dto.paidAmount)),
        paymentMethod: dto.paidAmount > 0 ? dto.paymentMethod ?? 'EFECTIVO' : null,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
        resolvedAtDevice: device?.at ?? new Date(),
        resolvedAt: new Date(),
        recordedById: actor.id,
        deviceOperationId: device?.operationId,
      },
    });
    await this.audit.log(
      {
        userId: actor.id,
        action: 'deliveries.deliver',
        entityType: 'route_stop',
        entityId: stop.id,
        newData: { route: route.routeNumber, sale: sale.saleNumber, total: sale.totalAmount, paid: sale.paidAmount, receivedBy: dto.receivedByName, withDifferences: anyDifference },
      },
      tx,
    );
    return { stopId: stop.id, saleId, saleNumber: sale.saleNumber };
  }

  async deliver(stopId: string, dto: DeliverStopDto, actor: AuthUser) {
    const r = await this.prisma.$transaction((tx) => this.deliverInTx(tx, stopId, dto, actor), TX_OPTIONS);
    return { ...r, route: await this.findOne((await this.prisma.routeStop.findUniqueOrThrow({ where: { id: stopId } })).routeId) };
  }

  /** No se pudo entregar: queda el motivo y la preventa vuelve a pendiente para otra ruta. */
  async failInTx(tx: Tx, stopId: string, dto: FailStopDto, actor: AuthUser, device?: { at: Date; operationId: string }) {
    const { stop, route } = await this.lockStop(tx, stopId, actor);
    if (dto.problemType === 'OTHER' && !dto.notes?.trim()) throw new BadRequestException('Describa el problema');
    await tx.routeStop.update({
      where: { id: stop.id },
      data: {
        status: StopStatus.FAILED,
        problemType: dto.problemType,
        notes: dto.notes?.trim() || null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        resolvedAtDevice: device?.at ?? new Date(),
        resolvedAt: new Date(),
        recordedById: actor.id,
        deviceOperationId: device?.operationId,
      },
    });
    await tx.presale.update({ where: { id: stop.presaleId }, data: { status: PresaleStatus.PENDING } });
    await this.audit.log(
      { userId: actor.id, action: 'deliveries.fail', entityType: 'route_stop', entityId: stop.id, newData: { route: route.routeNumber, problemType: dto.problemType }, reason: dto.notes },
      tx,
    );
    return { stopId: stop.id };
  }

  async fail(stopId: string, dto: FailStopDto, actor: AuthUser) {
    await this.prisma.$transaction((tx) => this.failInTx(tx, stopId, dto, actor), TX_OPTIONS);
    return this.findOne((await this.prisma.routeStop.findUniqueOrThrow({ where: { id: stopId } })).routeId);
  }

  // ── Liquidación ─────────────────────────────────────────

  /**
   * Cierra la ruta: las paradas sin resolver quedan como no visitadas (sus preventas vuelven a pendiente)
   * y el sobrante del vehículo vuelve al almacén con el peso real; lo que falte queda como pérdida.
   */
  async close(id: string, dto: CloseRouteDto, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lock(tx, id);
      if (route.status !== RouteStatus.IN_PROGRESS) throw new ConflictException('Solo se liquida una ruta en curso');
      const full = await tx.deliveryRoute.findUniqueOrThrow({ where: { id }, include: { vehicle: true, stops: true } });

      const pending = full.stops.filter((s) => s.status === StopStatus.PENDING);
      for (const stop of pending) {
        await tx.routeStop.update({
          where: { id: stop.id },
          data: { status: StopStatus.FAILED, problemType: 'NOT_VISITED', notes: 'No se visitó en la ruta', resolvedAt: new Date(), recordedById: actor.id },
        });
      }
      if (pending.length) await tx.presale.updateMany({ where: { id: { in: pending.map((s) => s.presaleId) } }, data: { status: PresaleStatus.PENDING } });

      const balances = await tx.inventoryBalance.findMany({ where: { warehouseId: full.vehicle.warehouseId, weightKg: { gt: 0 } } });
      const given = new Map((dto.returns ?? []).map((r) => [r.lotId, r.receivedWeightKg]));
      for (const lotId of given.keys()) {
        if (!balances.some((b) => b.lotId === lotId)) throw new BadRequestException('Un lote devuelto no está en el vehículo');
      }
      let returnTransferId: string | null = null;
      if (balances.length) {
        returnTransferId = await this.transfers.createInTx(
          tx,
          {
            originWarehouseId: full.vehicle.warehouseId,
            destinationWarehouseId: route.originWarehouseId,
            items: balances.map((b) => ({ productId: b.productId, lotId: b.lotId, weightKg: D(b.weightKg).toNumber() })),
            notes: `Sobrante de la ruta ${route.routeNumber}`,
          },
          actor,
          { includeExpired: true },
        );
        const transfer = await tx.transfer.findUniqueOrThrow({ where: { id: returnTransferId }, include: { items: true } });
        await this.transfers.receiveInTx(
          tx,
          returnTransferId,
          {
            notes: dto.notes ?? 'Sobrante pesado al cerrar la ruta',
            items: transfer.items.map((i) => ({ itemId: i.id, receivedWeightKg: given.get(i.lotId) ?? D(i.sentWeightKg).toNumber() })),
          },
          actor,
        );
      }
      await tx.deliveryRoute.update({
        where: { id },
        data: { status: RouteStatus.COMPLETED, closedAt: new Date(), closedById: actor.id, closeNotes: dto.notes, returnTransferId },
      });
      await this.audit.log(
        { userId: actor.id, action: 'routes.close', entityType: 'route', entityId: id, newData: { notVisited: pending.length, returnedLots: balances.length }, reason: dto.notes },
        tx,
      );
    }, TX_OPTIONS);
    return this.findOne(id);
  }

  // ── Internos ────────────────────────────────────────────

  private async lock(tx: Tx, id: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM delivery_routes WHERE id = ${id}::uuid FOR UPDATE`;
    if (!row) throw new NotFoundException('Ruta no encontrada');
    return tx.deliveryRoute.findUniqueOrThrow({ where: { id } });
  }

  private async lockStop(tx: Tx, stopId: string, actor: AuthUser) {
    const [row] = await tx.$queryRaw<{ route_id: string }[]>`SELECT route_id FROM route_stops WHERE id = ${stopId}::uuid FOR UPDATE`;
    if (!row) throw new NotFoundException('Parada no encontrada');
    const route = await tx.deliveryRoute.findUniqueOrThrow({ where: { id: row.route_id }, include: { vehicle: true } });
    if (route.driverId !== actor.id && !actor.permissions.includes(PERMISSIONS.ROUTES_MANAGE)) {
      throw new ForbiddenException('Solo el chofer de la ruta puede registrar sus entregas');
    }
    if (route.status !== RouteStatus.IN_PROGRESS) {
      throw new ConflictException(route.status === RouteStatus.PLANNED ? 'La ruta todavía no fue despachada' : 'La ruta ya está cerrada');
    }
    const stop = await tx.routeStop.findUniqueOrThrow({
      where: { id: stopId },
      include: { items: { include: { product: { select: { name: true } } } }, creditAuthorizedBy: userRef },
    });
    if (stop.status !== StopStatus.PENDING) throw new ConflictException('Esta parada ya fue registrada');
    return { stop, route };
  }

  private async resolveOrigin(tx: Tx, id?: string) {
    const origin = id
      ? await tx.warehouse.findFirst({ where: { id, isActive: true } })
      : await tx.warehouse.findFirst({ where: { type: WarehouseType.CENTRAL, isActive: true } });
    if (!origin || origin.type === WarehouseType.VEHICLE) throw new BadRequestException('Almacén de origen inválido');
    return origin;
  }

  /** Vehículo activo con capacidad y chofer activo, ninguno ocupado en otra ruta del mismo día. */
  private async validateAssignment(tx: Tx, routeId: string, dto: SaveRouteDto) {
    const vehicle = await tx.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || !vehicle.isActive) throw new BadRequestException('Vehículo inexistente o inactivo');
    const driver = await tx.user.findUnique({ where: { id: dto.driverId }, include: { role: true } });
    if (!driver || !driver.isActive || driver.role.code !== 'DRIVER') throw new BadRequestException('El chofer debe ser un usuario activo con rol Chofer');
    const date = new Date(`${dto.routeDate}T00:00:00Z`);
    const busy = await tx.deliveryRoute.findFirst({
      where: {
        id: { not: routeId },
        status: { in: [RouteStatus.PLANNED, RouteStatus.IN_PROGRESS] },
        OR: [{ vehicleId: dto.vehicleId, routeDate: date }, { driverId: dto.driverId, routeDate: date }, { vehicleId: dto.vehicleId, status: RouteStatus.IN_PROGRESS }],
      },
    });
    if (busy) throw new ConflictException(`El vehículo o el chofer ya están en la ruta ${busy.routeNumber}`);
    return vehicle;
  }

  private async assignStops(tx: Tx, routeId: string, dto: SaveRouteDto, actor: AuthUser, alreadyHere = new Set<string>()) {
    if (new Set(dto.stops.map((s) => s.presaleId)).size !== dto.stops.length) throw new BadRequestException('Un pedido está repetido en la ruta');
    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: dto.vehicleId } });
    let totalKg = ZERO;
    for (const [index, s] of dto.stops.entries()) {
      const [locked] = await tx.$queryRaw<{ status: PresaleStatus }[]>`SELECT status FROM presales WHERE id = ${s.presaleId}::uuid FOR UPDATE`;
      if (!locked) throw new BadRequestException('Preventa inexistente');
      const presale = await tx.presale.findUniqueOrThrow({ where: { id: s.presaleId }, include: { items: true } });
      const free = locked.status === PresaleStatus.PENDING || locked.status === PresaleStatus.CONFIRMED;
      if (!free && !(alreadyHere.has(s.presaleId) && locked.status === PresaleStatus.ASSIGNED)) {
        throw new ConflictException(`La preventa ${presale.presaleNumber} ya está en otra ruta, fue atendida o cancelada`);
      }
      if (s.authorizeCredit && !actor.permissions.includes(PERMISSIONS.CREDIT_EXCEPTION_AUTHORIZE)) {
        throw new ForbiddenException('No tiene permiso para autorizar excepciones de crédito');
      }
      if (s.authorizeCredit && !s.creditReason?.trim()) throw new BadRequestException(`${presale.presaleNumber}: indique el motivo de la autorización de crédito`);
      await tx.routeStop.create({
        data: {
          routeId,
          sequence: index + 1,
          presaleId: presale.id,
          customerId: presale.customerId,
          addressId: presale.addressId,
          creditAuthorizedById: s.authorizeCredit ? actor.id : null,
          creditAuthReason: s.authorizeCredit ? s.creditReason!.trim() : null,
          items: {
            create: presale.items.map((i) => ({ productId: i.productId, orderedWeightKg: i.weightKg, orderedQuantity: i.quantity })),
          },
        },
      });
      await tx.presale.update({ where: { id: presale.id }, data: { status: PresaleStatus.ASSIGNED } });
      totalKg = totalKg.plus(presale.items.reduce((t, i) => t.plus(i.weightKg), ZERO));
    }
    if (totalKg.gt(vehicle.capacityKg)) {
      throw new BadRequestException(`Los pedidos suman ${totalKg.toFixed(1)} kg y el vehículo ${vehicle.plate} carga ${D(vehicle.capacityKg).toFixed(0)} kg`);
    }
  }

  /** Agrega la hoja de carga y la conciliación por producto: pedido, cargado, entregado y sobrante. */
  private present(route: RouteWithStops) {
    const byProduct = new Map<string, { productId: string; name: string; orderedKg: Prisma.Decimal; loadedKg: Prisma.Decimal; deliveredKg: Prisma.Decimal; returnedKg: Prisma.Decimal; lossKg: Prisma.Decimal }>();
    const row = (productId: string, name: string) => {
      const r = byProduct.get(productId) ?? { productId, name, orderedKg: ZERO, loadedKg: ZERO, deliveredKg: ZERO, returnedKg: ZERO, lossKg: ZERO };
      byProduct.set(productId, r);
      return r;
    };
    for (const item of route.stops.flatMap((s) => s.items)) {
      const r = row(item.productId, item.product.name);
      r.orderedKg = r.orderedKg.plus(item.orderedWeightKg);
      r.deliveredKg = r.deliveredKg.plus(item.deliveredWeightKg ?? 0);
    }
    for (const t of route.loadTransfer?.items ?? []) {
      const r = row(t.productId, t.product.name);
      r.loadedKg = r.loadedKg.plus(t.receivedWeightKg ?? t.sentWeightKg);
    }
    const returned = route.returnTransfer?.status === TransferStatus.RECEIVED;
    for (const t of route.returnTransfer?.items ?? []) {
      const r = row(t.productId, t.product.name);
      if (returned) {
        r.returnedKg = r.returnedKg.plus(t.receivedWeightKg ?? 0);
        r.lossKg = r.lossKg.plus(t.differenceKg);
      }
    }
    const loadSheet = [...byProduct.values()].map((r) => ({
      ...r,
      orderedKg: kg(r.orderedKg),
      loadedKg: kg(r.loadedKg),
      deliveredKg: kg(r.deliveredKg),
      returnedKg: kg(r.returnedKg),
      lossKg: kg(r.lossKg),
      // En la calle: lo que el vehículo todavía debería llevar.
      onBoardKg: route.status === RouteStatus.IN_PROGRESS ? kg(r.loadedKg.minus(r.deliveredKg)) : ZERO,
    }));
    const orderedKg = kg(loadSheet.reduce((t, r) => t.plus(r.orderedKg), ZERO));
    return {
      ...route,
      loadSheet,
      summary: {
        stops: route.stops.length,
        delivered: route.stops.filter((s) => s.status === StopStatus.DELIVERED || s.status === StopStatus.PARTIAL).length,
        failed: route.stops.filter((s) => s.status === StopStatus.FAILED).length,
        pending: route.stops.filter((s) => s.status === StopStatus.PENDING).length,
        orderedKg,
        estimatedCrates: Math.ceil(orderedKg.toNumber() / KG_PER_CRATE),
        orderedAmount: money(route.stops.reduce((t, s) => t.plus(s.presale.totalAmount), ZERO)),
        soldAmount: money(route.stops.reduce((t, s) => t.plus(s.sale?.totalAmount ?? 0), ZERO)),
        collectedAmount: money(route.stops.reduce((t, s) => t.plus(s.paidAmount), ZERO)),
        creditAmount: money(route.stops.reduce((t, s) => t.plus(s.sale?.creditAmount ?? 0), ZERO)),
      },
    };
  }
}

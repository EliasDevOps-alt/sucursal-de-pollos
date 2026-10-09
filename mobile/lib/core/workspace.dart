import 'package:uuid/uuid.dart';

import 'local_db.dart';
import 'models.dart';

/// Posición capturada por el teléfono (puede faltar si no hay permiso o señal GPS).
class GeoPoint {
  GeoPoint(this.latitude, this.longitude, {this.accuracy});
  final double latitude;
  final double longitude;
  final double? accuracy;
}

/// Operaciones de negocio del preventista. Todas funcionan sin conexión:
/// guardan el dato local y encolan la operación para el servidor.
class Workspace {
  Workspace(this.db, {DateTime Function()? clock}) : _now = clock ?? DateTime.now;
  final LocalDb db;
  /// Hora del teléfono (las pruebas la fijan para que las capturas no cambien con el reloj).
  final DateTime Function() _now;
  static const _uuid = Uuid();

  Future<Customer> createCustomer({
    required String name,
    required String customerTypeId,
    String? phone,
    String? documentId,
    String addressLabel = 'Principal',
    String? address,
    GeoPoint? location,
  }) async {
    // El UUID se genera aquí: un pedido puede referirse a este cliente antes de que el servidor lo conozca.
    final customerId = _uuid.v4();
    final addr = (address != null && address.trim().isNotEmpty)
        ? Address(id: _uuid.v4(), label: addressLabel, address: address.trim(), latitude: location?.latitude, longitude: location?.longitude, isPrimary: true)
        : null;
    final customer = Customer(
      id: customerId,
      name: name.trim(),
      customerTypeId: customerTypeId,
      phone: _blankToNull(phone),
      documentId: _blankToNull(documentId),
      addresses: addr == null ? [] : [addr],
      pendingSync: true,
    );
    await db.saveCustomer(customer);
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'CUSTOMER_CREATE',
      createdAt: _now(),
      payload: {
        'id': customerId,
        'name': customer.name,
        'customerTypeId': customerTypeId,
        if (customer.phone != null) 'phone': customer.phone,
        if (customer.documentId != null) 'documentId': customer.documentId,
        if (addr != null) 'address': addr.toJson()..remove('isPrimary')..removeWhere((_, v) => v == null),
      },
    ));
    if (location != null) await recordPosition(location, 'CUSTOMER_CREATE', referenceId: customerId);
    return customer;
  }

  Future<Presale> createPresale({
    required Customer customer,
    required List<PresaleItem> items,
    Address? address,
    String? scheduledDeliveryDate,
    String? notes,
    GeoPoint? location,
  }) async {
    if (items.isEmpty) throw ArgumentError('El pedido no tiene productos');
    final presale = Presale(
      id: _uuid.v4(),
      customerId: customer.id,
      customerName: customer.name,
      items: items,
      createdAt: _now(),
      scheduledDeliveryDate: scheduledDeliveryDate,
      notes: _blankToNull(notes),
    );
    await db.savePresale(presale);
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'PRESALE_CREATE',
      createdAt: presale.createdAt,
      payload: {
        'id': presale.id,
        'customerId': customer.id,
        if (address != null) 'addressId': address.id,
        if (scheduledDeliveryDate != null) 'scheduledDeliveryDate': scheduledDeliveryDate,
        if (presale.notes != null) 'notes': presale.notes,
        if (location != null) 'latitude': location.latitude,
        if (location != null) 'longitude': location.longitude,
        'items': items
            .map((i) => {
                  'productId': i.productId,
                  'weightKg': i.weightKg,
                  if (i.quantity != null) 'quantity': i.quantity,
                  'unitPrice': i.unitPrice,
                })
            .toList(),
      },
    ));
    if (location != null) await recordPosition(location, 'PRESALE', referenceId: presale.id);
    // Tomar un pedido es también una visita con resultado "pedido".
    await recordVisit(customer: customer, outcome: 'ORDER', presaleId: presale.id, location: location);
    return presale;
  }

  /// Edita un pedido. Si todavía no salió del teléfono se corrige la operación en la cola (no se crea otra);
  /// si ya se envió, se encola la edición y el servidor decide (la rechaza si ya fue atendido).
  Future<Presale> updatePresale(
    Presale presale, {
    required List<PresaleItem> items,
    Address? address,
    String? scheduledDeliveryDate,
    String? notes,
  }) async {
    if (items.isEmpty) throw ArgumentError('El pedido no tiene productos');
    final edited = presale.withEdits(items: items, addressId: address?.id, scheduledDeliveryDate: scheduledDeliveryDate, notes: _blankToNull(notes));
    final itemsJson = items
        .map((i) => {'productId': i.productId, 'weightKg': i.weightKg, if (i.quantity != null) 'quantity': i.quantity, 'unitPrice': i.unitPrice})
        .toList();
    final pendingCreate = (await db.outbox()).where((o) => o.type == 'PRESALE_CREATE' && o.payload['id'] == presale.id).firstOrNull;
    if (pendingCreate != null) {
      await db.updateOpPayload(pendingCreate.id, {
        ...pendingCreate.payload,
        'items': itemsJson,
        'addressId': address?.id,
        'scheduledDeliveryDate': scheduledDeliveryDate,
        'notes': edited.notes,
      }..removeWhere((_, v) => v == null));
    } else {
      await db.enqueue(OutboxOp(
        id: _uuid.v4(),
        type: 'PRESALE_UPDATE',
        createdAt: _now(),
        payload: {
          'presaleId': presale.id,
          'items': itemsJson,
          if (address != null) 'addressId': address.id,
          if (scheduledDeliveryDate != null) 'scheduledDeliveryDate': scheduledDeliveryDate,
          if (edited.notes != null) 'notes': edited.notes,
        },
      ));
    }
    await db.savePresale(edited);
    return edited;
  }

  /// Dirección adicional del cliente (la principal no cambia sin autorización de Administración).
  Future<Customer> addAddress(Customer customer, {required String label, required String address, GeoPoint? location}) async {
    final a = Address(id: _uuid.v4(), label: label.trim(), address: address.trim(), latitude: location?.latitude, longitude: location?.longitude);
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'CUSTOMER_ADDRESS_ADD',
      createdAt: _now(),
      payload: {'customerId': customer.id, ...(a.toJson()..remove('isPrimary')..removeWhere((_, v) => v == null))},
    ));
    final updated = customer.withAddress(a);
    await db.saveCustomer(updated);
    return updated;
  }

  /// Registra la visita a un cliente, con o sin pedido.
  Future<void> recordVisit({required Customer customer, required String outcome, String? notes, String? presaleId, GeoPoint? location}) async {
    final id = _uuid.v4();
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'VISIT_CREATE',
      createdAt: _now(),
      payload: {
        'id': id,
        'customerId': customer.id,
        'outcome': outcome,
        if (_blankToNull(notes) != null) 'notes': notes!.trim(),
        if (presaleId != null) 'presaleId': presaleId,
        if (location != null) 'latitude': location.latitude,
        if (location != null) 'longitude': location.longitude,
      },
    ));
    if (location != null && presaleId == null) await recordPosition(location, 'VISIT', referenceId: id);
  }

  /// Cancela un pedido. Si nunca llegó al servidor, se retira de la cola y desaparece;
  /// si ya llegó, se encola la cancelación (el servidor la rechaza si el pedido ya fue atendido).
  Future<void> cancelPresale(Presale presale, String reason) async {
    final ops = await db.outbox();
    final pendingCreate = ops.where((o) => o.type == 'PRESALE_CREATE' && o.payload['id'] == presale.id).firstOrNull;
    if (pendingCreate != null) {
      await db.removeOp(pendingCreate.id);
      await db.deletePresale(presale.id);
      return;
    }
    await db.savePresale(presale.copyWith(status: 'CANCEL_PENDING', syncState: SyncState.pending, cancelReason: reason, clearError: true));
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'PRESALE_CANCEL',
      createdAt: _now(),
      payload: {'presaleId': presale.id, 'reason': reason},
    ));
  }

  Future<void> recordPosition(GeoPoint p, String eventType, {String? referenceId}) => db.enqueue(OutboxOp(
        id: _uuid.v4(),
        type: 'GPS_POSITION',
        createdAt: _now(),
        payload: {
          'latitude': p.latitude,
          'longitude': p.longitude,
          if (p.accuracy != null) 'accuracyMeters': double.parse(p.accuracy!.toStringAsFixed(2)),
          'eventType': eventType,
          if (referenceId != null) 'referenceId': referenceId,
        },
      ));

  // ── Chofer ──────────────────────────────────────────────

  /// Registra la entrega en el teléfono y la encola. El servidor genera la venta al sincronizar.
  Future<RouteStop> deliverStop(
    RouteStop stop, {
    required List<StopItem> items,
    required double paidAmount,
    String? paymentMethod,
    required String receivedByName,
    String? signaturePng,
    String? notes,
    GeoPoint? location,
    int cratesDelivered = 0,
    int cratesPickedUp = 0,
  }) async {
    final route = await db.routeOfStop(stop.id);
    if (route == null || !route.inProgress) throw StateError('La ruta no está en curso');
    final differs = items.any((i) => (i.deliveredKg ?? 0) != i.orderedKg);
    final updated = stop.copyWith(
      status: differs ? 'PARTIAL' : 'DELIVERED',
      items: items,
      receivedByName: receivedByName.trim(),
      paidAmount: paidAmount,
      paymentMethod: paidAmount > 0 ? paymentMethod : null,
      notes: _blankToNull(notes),
      signed: signaturePng != null,
      syncState: SyncState.pending,
      clearError: true,
      cratesDelivered: cratesDelivered,
      cratesPickedUp: cratesPickedUp,
    );
    await db.saveRoute(route.withStop(updated));
    if (location != null) await recordPosition(location, 'DELIVERY', referenceId: stop.id);
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'DELIVERY_COMPLETE',
      createdAt: _now(),
      payload: {
        'stopId': stop.id,
        'items': [
          for (final i in items)
            {
              'productId': i.productId,
              'deliveredWeightKg': i.deliveredKg ?? 0,
              if (i.differenceReason != null && i.differenceReason!.trim().isNotEmpty) 'differenceReason': i.differenceReason!.trim(),
            },
        ],
        'paidAmount': double.parse(paidAmount.toStringAsFixed(2)),
        if (paidAmount > 0 && paymentMethod != null) 'paymentMethod': paymentMethod,
        'receivedByName': receivedByName.trim(),
        if (cratesDelivered > 0) 'cratesDelivered': cratesDelivered,
        if (cratesPickedUp > 0) 'cratesPickedUp': cratesPickedUp,
        if (signaturePng != null) 'signature': signaturePng,
        if (_blankToNull(notes) != null) 'notes': notes!.trim(),
        if (location != null) 'latitude': location.latitude,
        if (location != null) 'longitude': location.longitude,
      },
    ));
    return updated;
  }

  /// No se pudo entregar: queda el motivo (el pedido vuelve a pendiente en el servidor).
  Future<RouteStop> failStop(RouteStop stop, {required String problemType, String? notes, GeoPoint? location}) async {
    final route = await db.routeOfStop(stop.id);
    if (route == null || !route.inProgress) throw StateError('La ruta no está en curso');
    final updated = stop.copyWith(status: 'FAILED', problemType: problemType, notes: _blankToNull(notes), syncState: SyncState.pending, clearError: true);
    await db.saveRoute(route.withStop(updated));
    if (location != null) await recordPosition(location, 'DELIVERY_FAIL', referenceId: stop.id);
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'DELIVERY_FAIL',
      createdAt: _now(),
      payload: {
        'stopId': stop.id,
        'problemType': problemType,
        if (_blankToNull(notes) != null) 'notes': notes!.trim(),
        if (location != null) 'latitude': location.latitude,
        if (location != null) 'longitude': location.longitude,
      },
    ));
    return updated;
  }

  // ── Cobrador ────────────────────────────────────────────

  /// Cobro en la calle: queda en el teléfono (con la deuda y los canastillos del cliente ya descontados) y se encola.
  Future<Collection> collect(
    Customer customer, {
    required double amount,
    required String paymentMethod,
    String? referenceNumber,
    String? paidByName,
    String? signaturePng,
    String? notes,
    int cratesPickedUp = 0,
    GeoPoint? location,
  }) async {
    final id = _uuid.v4();
    final c = Collection(
      id: id,
      customerId: customer.id,
      customerName: customer.name,
      amount: amount,
      paymentMethod: paymentMethod,
      collectedAt: _now(),
      isAdvance: amount > customer.currentDebt + 0.005,
      paidByName: _blankToNull(paidByName),
      cratesPickedUp: cratesPickedUp,
      syncState: SyncState.pending,
    );
    await db.saveCollection(c);
    await db.saveCustomer(customer.copyWith(currentDebt: double.parse((customer.currentDebt - amount).toStringAsFixed(2)), cratesHeld: customer.cratesHeld - cratesPickedUp));
    if (location != null) await recordPosition(location, 'COLLECTION', referenceId: id);
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'COLLECTION_CREATE',
      createdAt: _now(),
      payload: {
        'id': id,
        'customerId': customer.id,
        'amount': double.parse(amount.toStringAsFixed(2)),
        'paymentMethod': paymentMethod,
        if (_blankToNull(referenceNumber) != null) 'referenceNumber': referenceNumber!.trim(),
        if (_blankToNull(notes) != null) 'notes': notes!.trim(),
        if (_blankToNull(paidByName) != null) 'paidByName': paidByName!.trim(),
        if (signaturePng != null) 'signature': signaturePng,
        if (cratesPickedUp > 0) 'cratesPickedUp': cratesPickedUp,
        if (location != null) 'latitude': location.latitude,
        if (location != null) 'longitude': location.longitude,
      },
    ));
    return c;
  }

  /// Canastillos vacíos que el cliente devuelve sin pagar nada.
  Future<void> pickupCrates(Customer customer, int quantity, {String? notes, GeoPoint? location}) async {
    await db.saveCustomer(customer.copyWith(cratesHeld: customer.cratesHeld - quantity));
    if (location != null) await recordPosition(location, 'COLLECTION', referenceId: customer.id);
    await db.enqueue(OutboxOp(
      id: _uuid.v4(),
      type: 'CRATE_PICKUP',
      createdAt: _now(),
      payload: {'customerId': customer.id, 'quantity': quantity, if (_blankToNull(notes) != null) 'notes': notes!.trim()},
    ));
  }

  /// Deja constancia de un comprobante impreso por Bluetooth (se registra en el servidor al sincronizar).
  Future<void> logPrint(String slug, String documentId) => db.enqueue(OutboxOp(
        id: _uuid.v4(),
        type: 'RECEIPT_PRINT',
        createdAt: _now(),
        payload: {'documentType': slug, 'documentId': documentId},
      ));

  /// Descarta una operación que el servidor rechazó (queda la decisión al usuario).
  Future<void> discard(OutboxOp op) async {
    await db.removeOp(op.id);
    // Sin el documento, sus impresiones pendientes tampoco tienen a qué asociarse.
    final docId = op.type == 'COLLECTION_CREATE' ? op.payload['id'] : op.type == 'DELIVERY_COMPLETE' || op.type == 'DELIVERY_FAIL' ? op.payload['stopId'] : null;
    if (docId != null) {
      for (final o in await db.outbox()) {
        if (o.type == 'RECEIPT_PRINT' && o.payload['documentId'] == docId) await db.removeOp(o.id);
      }
    }
    if (op.type == 'COLLECTION_CREATE') await db.deleteCollection(op.payload['id'] as String);
    if (op.type == 'DELIVERY_COMPLETE' || op.type == 'DELIVERY_FAIL') {
      // La parada vuelve a pendiente en el teléfono para registrarla de nuevo.
      final stopId = op.payload['stopId'] as String;
      final route = await db.routeOfStop(stopId);
      if (route != null) await db.saveRoute(route.withStop(route.stops.firstWhere((s) => s.id == stopId).copyWith(status: 'PENDING', syncState: SyncState.synced, reset: true)));
    }
    if (op.type == 'PRESALE_CREATE') await db.deletePresale(op.payload['id'] as String);
    if (op.type == 'PRESALE_CANCEL') {
      final p = await db.presale(op.payload['presaleId'] as String);
      if (p != null) await db.savePresale(p.copyWith(status: 'PENDING', syncState: SyncState.synced, clearError: true));
    }
  }

  static String? _blankToNull(String? v) => (v == null || v.trim().isEmpty) ? null : v.trim();
}

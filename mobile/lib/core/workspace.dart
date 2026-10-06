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
  Workspace(this.db);
  final LocalDb db;
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
      createdAt: DateTime.now(),
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
      createdAt: DateTime.now(),
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
        createdAt: DateTime.now(),
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
      createdAt: DateTime.now(),
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
      createdAt: DateTime.now(),
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
      createdAt: DateTime.now(),
      payload: {'presaleId': presale.id, 'reason': reason},
    ));
  }

  Future<void> recordPosition(GeoPoint p, String eventType, {String? referenceId}) => db.enqueue(OutboxOp(
        id: _uuid.v4(),
        type: 'GPS_POSITION',
        createdAt: DateTime.now(),
        payload: {
          'latitude': p.latitude,
          'longitude': p.longitude,
          if (p.accuracy != null) 'accuracyMeters': double.parse(p.accuracy!.toStringAsFixed(2)),
          'eventType': eventType,
          if (referenceId != null) 'referenceId': referenceId,
        },
      ));

  /// Descarta una operación que el servidor rechazó (queda la decisión al usuario).
  Future<void> discard(OutboxOp op) async {
    await db.removeOp(op.id);
    if (op.type == 'PRESALE_CREATE') await db.deletePresale(op.payload['id'] as String);
    if (op.type == 'PRESALE_CANCEL') {
      final p = await db.presale(op.payload['presaleId'] as String);
      if (p != null) await db.savePresale(p.copyWith(status: 'PENDING', syncState: SyncState.synced, clearError: true));
    }
  }

  static String? _blankToNull(String? v) => (v == null || v.trim().isEmpty) ? null : v.trim();
}

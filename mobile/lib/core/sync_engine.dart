import 'dart:convert';
import 'api_client.dart';
import 'local_db.dart';
import 'models.dart';

class SyncReport {
  SyncReport({this.sent = 0, this.synced = 0, this.failed = 0, this.pulled = false, this.messages = const []});
  final int sent;
  final int synced;
  final int failed;
  final bool pulled;
  final List<String> messages;
}

/// Envía la cola de salida y luego descarga el catálogo y el estado de los pedidos.
///
/// Garantías:
/// - Cada operación conserva su id (device_operation_id): si la respuesta se pierde y se reenvía,
///   el servidor la reconoce y no la duplica.
/// - Una operación solo sale de la cola cuando el servidor confirma SYNCED.
/// - Las rechazadas (REVIEW/ERROR) quedan en la cola con su mensaje y se reintentan; el usuario puede descartarlas.
class SyncEngine {
  SyncEngine({required this.db, required this.api, required this.deviceUuid, this.appVersion = '0.1.0'});

  final LocalDb db;
  final ApiClient api;
  final String deviceUuid;
  final String appVersion;
  static const _batchSize = 50;

  Future<SyncReport> run() async {
    var sent = 0, synced = 0, failed = 0;
    final messages = <String>[];

    final ops = await db.outbox();
    for (var i = 0; i < ops.length; i += _batchSize) {
      final batch = ops.sublist(i, i + _batchSize > ops.length ? ops.length : i + _batchSize);
      final response = await api.sync(deviceUuid, appVersion, batch.map((o) => o.toSyncJson()).toList());
      sent += batch.length;
      final byId = {for (final o in batch) o.id: o};
      for (final raw in (response['results'] as List)) {
        final r = Map<String, dynamic>.from(raw as Map);
        final op = byId[r['deviceOperationId']];
        if (op == null) continue;
        if (r['status'] == 'SYNCED') {
          synced++;
          await _applySuccess(op, r['reference'] as String?);
          await db.removeOp(op.id);
        } else {
          failed++;
          final error = (r['error'] ?? 'Rechazado por el servidor') as String;
          messages.add('${op.label}: $error');
          await db.markOp(op.id, state: (r['status'] as String).toLowerCase(), error: error);
          await _applyFailure(op, error);
        }
      }
    }

    await _pull();
    await db.setValue('lastSyncAt', DateTime.now().toUtc().toIso8601String());
    return SyncReport(sent: sent, synced: synced, failed: failed, pulled: true, messages: messages);
  }

  Future<void> _applySuccess(OutboxOp op, String? reference) async {
    switch (op.type) {
      case 'CUSTOMER_CREATE':
        final c = (await db.customers()).where((c) => c.id == op.payload['id']).firstOrNull;
        if (c != null) await db.saveCustomer(c.copyWith(code: reference, pendingSync: false));
      case 'PRESALE_CREATE':
        final p = await db.presale(op.payload['id'] as String);
        if (p != null) {
          await db.savePresale(p.copyWith(number: reference, status: p.status == 'LOCAL' ? 'PENDING' : p.status, syncState: SyncState.synced, clearError: true));
        }
      case 'PRESALE_CANCEL':
        final p = await db.presale(op.payload['presaleId'] as String);
        if (p != null) await db.savePresale(p.copyWith(status: 'CANCELLED', syncState: SyncState.synced, clearError: true));
      case 'PRESALE_UPDATE':
        final p = await db.presale(op.payload['presaleId'] as String);
        if (p != null) await db.savePresale(p.copyWith(syncState: SyncState.synced, clearError: true));
      case 'COLLECTION_CREATE':
        final c = await db.collection(op.payload['id'] as String);
        if (c != null) await db.saveCollection(c.copyWith(receiptNumber: reference, syncState: SyncState.synced, clearError: true));
      case 'DELIVERY_COMPLETE' || 'DELIVERY_FAIL':
        await _updateStop(op.payload['stopId'] as String, (s) => s.copyWith(saleNumber: reference, syncState: SyncState.synced, clearError: true));
    }
  }

  Future<void> _updateStop(String stopId, RouteStop Function(RouteStop) change) async {
    final route = await db.routeOfStop(stopId);
    if (route == null) return;
    await db.saveRoute(route.withStop(change(route.stops.firstWhere((s) => s.id == stopId))));
  }

  Future<void> _applyFailure(OutboxOp op, String error) async {
    if (op.type == 'COLLECTION_CREATE') {
      final c = await db.collection(op.payload['id'] as String);
      if (c != null) await db.saveCollection(c.copyWith(syncState: SyncState.error, error: error));
      return;
    }
    if (op.type == 'DELIVERY_COMPLETE' || op.type == 'DELIVERY_FAIL') {
      await _updateStop(op.payload['stopId'] as String, (s) => s.copyWith(syncState: SyncState.error, error: error));
      return;
    }
    final presaleId = switch (op.type) {
      'PRESALE_CREATE' => op.payload['id'] as String?,
      'PRESALE_CANCEL' || 'PRESALE_UPDATE' => op.payload['presaleId'] as String?,
      _ => null,
    };
    if (presaleId == null) return;
    final p = await db.presale(presaleId);
    if (p != null) await db.savePresale(p.copyWith(syncState: SyncState.error, error: error));
  }

  /// Descarga catálogo, clientes y el estado de mis pedidos. Lo que el servidor dice es la fuente oficial,
  /// salvo los pedidos y clientes que aún esperan en la cola.
  Future<void> _pull() async {
    final data = await api.bootstrap();
    if (data['company'] is Map) await db.setValue('company', jsonEncode(data['company']));
    await db.replaceCatalog(
      products: (data['products'] as List).map((j) => Product.fromJson(Map<String, dynamic>.from(j as Map))).toList(),
      customers: (data['customers'] as List).map((j) => Customer.fromJson(Map<String, dynamic>.from(j as Map))).toList(),
      customerTypes: (data['customerTypes'] as List).map((j) => {'id': j['id'] as String, 'name': j['name'] as String}).toList(),
    );

    final pendingOps = await db.outbox();
    final waiting = <String>{
      for (final o in pendingOps)
        if (o.type == 'PRESALE_CREATE') o.payload['id'] as String else if (o.type == 'PRESALE_CANCEL' || o.type == 'PRESALE_UPDATE') o.payload['presaleId'] as String,
    };
    // Chofer: rutas asignadas (las paradas registradas sin enviar se conservan como están en el teléfono).
    final waitingStops = <String>{
      for (final o in pendingOps)
        if (o.type == 'DELIVERY_COMPLETE' || o.type == 'DELIVERY_FAIL') o.payload['stopId'] as String,
    };
    await db.replaceRoutes(
      (data['routes'] as List? ?? []).map((j) => DeliveryRoute.fromServer(Map<String, dynamic>.from(j as Map))).toList(),
      waitingStops,
    );
    // Cobrador: sus cobros recientes (los que aún esperan en la cola quedan como están).
    await db.replaceCollections(
      (data['collections'] as List? ?? []).map((j) => Collection.fromServer(Map<String, dynamic>.from(j as Map))).toList(),
      {for (final o in pendingOps) if (o.type == 'COLLECTION_CREATE') o.payload['id'] as String},
    );
    for (final raw in (data['presales'] as List)) {
      final j = Map<String, dynamic>.from(raw as Map);
      if (waiting.contains(j['id'])) continue; // el teléfono tiene un cambio sin enviar: no se pisa
      final local = await db.presale(j['id'] as String);
      await db.savePresale(Presale.fromJson({
        ...j,
        'notes': j['notes'] ?? local?.notes,
        'syncState': SyncState.synced.name,
      }));
    }
  }
}

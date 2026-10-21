// Prueba de integración del cobrador contra el backend real.
// Ejecutar con el servidor encendido:  flutter test test/collector_integration_test.dart --dart-define=API_URL=http://localhost:3001/api
@Tags(['integration'])
library;

import 'dart:convert';

import 'package:erp_preventa/core/api_client.dart';
import 'package:erp_preventa/core/local_db.dart';
import 'package:erp_preventa/core/models.dart';
import 'package:erp_preventa/core/sync_engine.dart';
import 'package:erp_preventa/core/workspace.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

const serverUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000/api');
const _png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

Future<dynamic> call(String method, String path, String token, [Object? body]) async {
  final req = http.Request(method, Uri.parse('$serverUrl$path'))
    ..headers.addAll({'Content-Type': 'application/json', 'Authorization': 'Bearer $token'});
  if (body != null) req.body = jsonEncode(body);
  final res = await http.Response.fromStream(await req.send());
  final data = res.body.isEmpty ? null : jsonDecode(res.body);
  if (res.statusCode >= 300) throw StateError('$method $path → ${res.statusCode}: $data');
  return data;
}

void main() {
  sqfliteFfiInit();

  test('cobrador: cobra y recoge canastillos sin señal, y sincroniza una sola vez', () async {
    final admin = (await ApiClient(baseUrl: serverUrl).login('admin', '1234'))['accessToken'] as String;
    final online = ApiClient(baseUrl: serverUrl);
    online.token = (await online.login('cobrador', '6666'))['accessToken'] as String;
    final offline = ApiClient(baseUrl: 'http://127.0.0.1:9/api', token: online.token);
    final device = 'flutter-cobrador-${const Uuid().v4()}';

    // ── La oficina: un cliente con deuda y 3 canastillos prestados ──
    final types = await call('GET', '/customer-types', admin) as List;
    final ranks = await call('GET', '/customer-ranks', admin) as List;
    final customer = await call('POST', '/customers', admin, {
      'name': 'Cobranza Flutter ${DateTime.now().millisecondsSinceEpoch}',
      'customerTypeId': types.first['id'],
      'rankId': ranks.firstWhere((r) => r['code'] == 'ORO')['id'],
      'creditEnabled': true,
      'address': {'label': 'Local', 'address': 'Calle de prueba', 'latitude': -17.78, 'longitude': -63.18},
    });
    final warehouses = await call('GET', '/warehouses', admin) as List;
    final central = warehouses.firstWhere((w) => w['code'] == 'ALM-CEN')['id'];
    await call('POST', '/crates/movements', admin, {'type': 'INITIAL', 'quantity': 3, 'to': {'type': 'WAREHOUSE', 'id': central}, 'reason': 'Prueba'});
    await call('POST', '/crates/movements', admin, {'type': 'TRANSFER', 'quantity': 3, 'from': {'type': 'WAREHOUSE', 'id': central}, 'to': {'type': 'CUSTOMER', 'id': customer['id']}, 'reason': 'Préstamo'});
    final lots = await call('GET', '/sales/available-lots?warehouseId=$central&productId=${(await call('GET', '/products', admin) as List).first['id']}', admin) as List;
    final products = await call('GET', '/products', admin) as List;
    var productId = products.first['id'] as String;
    if (lots.isEmpty) {
      for (final p in products) {
        if ((await call('GET', '/sales/available-lots?warehouseId=$central&productId=${p['id']}', admin) as List).isNotEmpty) {
          productId = p['id'] as String;
          break;
        }
      }
    }
    await call('POST', '/sales', admin, {'warehouseId': central, 'customerId': customer['id'], 'items': [{'productId': productId, 'weightKg': 5}], 'paidAmount': 0, 'paymentMethod': 'EFECTIVO'});
    final debt0 = double.parse('${(await call('GET', '/customers/${customer['id']}', admin))['currentDebt']}');

    // ── El cobrador descarga su cartera ──
    final db = await LocalDb.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
    addTearDown(db.close);
    await SyncEngine(db: db, api: online, deviceUuid: device).run();
    final mine = (await db.customers()).firstWhere((c) => c.id == customer['id']);
    expect(mine.currentDebt, closeTo(debt0, 0.01));
    expect(mine.cratesHeld, 3);
    expect(mine.debtDays, isNotNull);

    // ── En la calle, sin señal ──
    final ws = Workspace(db);
    final c1 = await ws.collect(mine, amount: 20, paymentMethod: 'EFECTIVO', paidByName: 'Dueño', signaturePng: _png, cratesPickedUp: 2, location: GeoPoint(-17.78, -63.18));
    final after1 = (await db.customers()).firstWhere((c) => c.id == mine.id);
    expect(after1.currentDebt, closeTo(debt0 - 20, 0.01), reason: 'la deuda se ve descontada en el teléfono');
    expect(after1.cratesHeld, 1);
    await ws.pickupCrates(after1, 1, notes: 'Vacío');
    await ws.logPrint('cobro', c1.id); // recibo impreso por Bluetooth sin señal
    expect((await db.outbox()).map((o) => o.type), ['GPS_POSITION', 'COLLECTION_CREATE', 'CRATE_PICKUP', 'RECEIPT_PRINT']);
    await expectLater(SyncEngine(db: db, api: offline, deviceUuid: device).run(), throwsA(isA<OfflineException>()));
    expect((await db.collection(c1.id))!.syncState, SyncState.pending);

    // ── Vuelve la señal; la primera respuesta se pierde ──
    final queued = await db.outbox();
    await online.sync(device, 'test', queued.map((o) => o.toSyncJson()).toList());
    final report = await SyncEngine(db: db, api: online, deviceUuid: device).run();
    expect(report.failed, 0);
    expect(await db.outbox(), isEmpty);

    final synced = (await db.collection(c1.id))!;
    expect(synced.receiptNumber, startsWith('R-'), reason: 'el número de recibo lo da el servidor');
    expect(synced.syncState, SyncState.synced);
    final server = await call('GET', '/customers/${customer['id']}', admin);
    expect(double.parse('${server['currentDebt']}'), closeTo(debt0 - 20, 0.01), reason: 'el reintento no duplicó el cobro');
    expect(server['cratesHeld'], 0);
    final receipt = await call('GET', '/collections/${c1.id}', admin);
    expect(receipt['signature'], _png);
    expect(receipt['paymentSource'], 'COLLECTOR');

    // ── La impresión quedó registrada una sola vez y el recibo se puede reimprimir desde el servidor ──
    final prints = (await call('GET', '/receipts/prints?type=COLLECTION', admin) as List).where((p) => p['documentId'] == c1.id).toList();
    expect(prints, hasLength(1));
    expect(prints.single['channel'], 'BLUETOOTH');
    expect(prints.single['copyNumber'], 0);
    expect(prints.single['documentNumber'], synced.receiptNumber);
    final mineReceipt = await online.receipt('cobro', c1.id);
    expect(mineReceipt['number'], synced.receiptNumber);
    expect(mineReceipt['signature'], _png);
    expect(mineReceipt['printCount'], 1);
  });
}

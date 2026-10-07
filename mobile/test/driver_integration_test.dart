// Prueba de integración del chofer contra el backend real.
// Ejecutar con el servidor encendido:  flutter test test/driver_integration_test.dart --dart-define=API_URL=http://localhost:3001/api
// Prepara una ruta despachada desde la API (como lo haría la oficina) y la reparte con el mismo código de la app.
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

  test('chofer: recibe la ruta, entrega y registra un fallo sin señal, y sincroniza una sola vez', () async {
    final admin = (await ApiClient(baseUrl: serverUrl).login('admin', 'Admin123!'))['accessToken'] as String;
    final pre = (await ApiClient(baseUrl: serverUrl).login('preventista', 'Demo123!'))['accessToken'] as String;
    final online = ApiClient(baseUrl: serverUrl);
    online.token = (await online.login('chofer', 'Demo123!'))['accessToken'] as String;
    final offline = ApiClient(baseUrl: 'http://127.0.0.1:9/api', token: online.token);
    final device = 'flutter-chofer-${const Uuid().v4()}';
    const uuid = Uuid();

    // ── La oficina prepara la ruta ──
    final boot = await ApiClient(baseUrl: serverUrl, token: pre).bootstrap();
    final product = (boot['products'] as List).firstWhere((p) => p['referencePrice'] != null && double.parse('${p['availableKg']}') > 30);
    final customers = (boot['customers'] as List).where((c) => c['creditEnabled'] == true && (c['addresses'] as List).isNotEmpty).toList();
    final presaleIds = <String>[];
    for (final c in customers.take(2)) {
      final id = uuid.v4();
      await call('POST', '/mobile/sync', pre, {
        'deviceUuid': 'flutter-test-pre',
        'operations': [
          {
            'deviceOperationId': uuid.v4(),
            'operationType': 'PRESALE_CREATE',
            'createdAtDevice': DateTime.now().toUtc().toIso8601String(),
            'payload': {
              'id': id,
              'customerId': c['id'],
              'items': [{'productId': product['id'], 'weightKg': 6, 'unitPrice': double.parse('${product['referencePrice']}')}],
            },
          }
        ],
      });
      presaleIds.add(id);
    }
    // Mañana: hoy el chofer puede tener ya su ruta de la demo (un chofer, una ruta por día).
    final today = DateTime.now().add(const Duration(days: 1)).toIso8601String().substring(0, 10);
    final vehicle = await call('POST', '/vehicles', admin, {'plate': 'F${DateTime.now().millisecondsSinceEpoch % 1000000}', 'description': 'Prueba Flutter', 'ownership': 'OWN', 'capacityKg': 500, 'capacityCrates': 20});
    final drivers = await call('GET', '/routes/drivers', admin) as List;
    final route = await call('POST', '/routes', admin, {
      'routeDate': today,
      'vehicleId': vehicle['id'],
      'driverId': drivers.firstWhere((d) => d['username'] == 'chofer')['id'],
      'stops': [for (final id in presaleIds) {'presaleId': id}],
    });
    await call('POST', '/routes/${route['id']}/dispatch', admin, {});

    // ── El chofer sincroniza antes de salir ──
    final db = await LocalDb.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
    addTearDown(db.close);
    await SyncEngine(db: db, api: online, deviceUuid: device).run();
    final mine = (await db.routes()).firstWhere((r) => r.id == route['id']);
    expect(mine.inProgress, isTrue);
    expect(mine.stops.length, 2);
    expect(mine.stops.first.items.first.unitPrice, greaterThan(0), reason: 'trae el precio cotizado para estimar el cobro');

    // ── En la calle, sin señal ──
    final ws = Workspace(db);
    final first = mine.stops[0];
    final delivered = await ws.deliverStop(
      first,
      items: [for (final i in first.items) StopItem(productId: i.productId, productName: i.productName, orderedKg: i.orderedKg, unitPrice: i.unitPrice, deliveredKg: 5.6, differenceReason: 'Peso real al entregar')],
      paidAmount: 0,
      receivedByName: 'Encargada',
      signaturePng: _png,
      location: GeoPoint(-17.78, -63.18, accuracy: 6),
    );
    expect(delivered.status, 'PARTIAL');
    await ws.failStop(mine.stops[1], problemType: 'CLOSED', notes: 'Cerrado', location: GeoPoint(-17.79, -63.17));
    expect((await db.outbox()).map((o) => o.type), ['GPS_POSITION', 'DELIVERY_COMPLETE', 'GPS_POSITION', 'DELIVERY_FAIL']);

    await expectLater(SyncEngine(db: db, api: offline, deviceUuid: device).run(), throwsA(isA<OfflineException>()));
    expect((await db.outbox()).length, 4, reason: 'sin señal nada se pierde');
    final waiting = (await db.route(mine.id))!;
    expect(waiting.stops.map((s) => '${s.status}/${s.syncState.name}'), ['PARTIAL/pending', 'FAILED/pending'], reason: 'el teléfono muestra lo registrado aunque no haya salido');

    // ── Vuelve la señal: la respuesta se pierde y se reintenta ──
    final queued = await db.outbox();
    await online.sync(device, 'test', queued.map((o) => o.toSyncJson()).toList());
    final report = await SyncEngine(db: db, api: online, deviceUuid: device).run();
    expect(report.failed, 0);
    expect(await db.outbox(), isEmpty);

    final after = (await db.route(mine.id))!;
    expect(after.stops[0].status, 'PARTIAL');
    expect(after.stops[0].saleNumber, startsWith('V-'), reason: 'la venta la generó el servidor');
    expect(after.stops[1].status, 'FAILED');
    final server = await call('GET', '/routes/${route['id']}', admin);
    final sales = (server['stops'] as List).where((s) => s['sale'] != null).toList();
    expect(sales.length, 1, reason: 'el reintento no duplicó la venta');
    expect(server['stops'][0]['signature'], _png);
    expect(double.parse('${server['stops'][0]['items'][0]['deliveredWeightKg']}'), 5.6);

    // ── La oficina liquida la ruta ──
    final closed = await call('POST', '/routes/${route['id']}/close', admin, {});
    expect(closed['status'], 'COMPLETED');
    await SyncEngine(db: db, api: online, deviceUuid: device).run();
    expect((await db.route(mine.id))?.status, 'COMPLETED');
    await call('PATCH', '/vehicles/${vehicle['id']}', admin, {'isActive': false});
    for (final id in presaleIds.skip(1)) {
      await call('POST', '/presales/$id/cancel', admin, {'reason': 'Prueba'});
    }
  });
}

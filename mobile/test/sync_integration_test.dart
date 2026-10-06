// Prueba de integración contra el backend real (http://localhost:3000).
// Ejecutar con el servidor encendido:  flutter test test/sync_integration_test.dart
// Usa SQLite en memoria (sqflite_common_ffi) y el mismo código de sincronización que la app.
@Tags(['integration'])
library;

import 'package:erp_preventa/core/api_client.dart';
import 'package:erp_preventa/core/local_db.dart';
import 'package:erp_preventa/core/models.dart';
import 'package:erp_preventa/core/sync_engine.dart';
import 'package:erp_preventa/core/workspace.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

const serverUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000/api');

void main() {
  sqfliteFfiInit();
  late LocalDb db;
  late ApiClient online;
  late ApiClient offline;
  late String device;

  setUpAll(() async {
    online = ApiClient(baseUrl: serverUrl);
    final res = await online.login('preventista', 'Demo123!');
    online.token = res['accessToken'] as String;
    // Mismo token, servidor inalcanzable: simula el teléfono sin señal.
    offline = ApiClient(baseUrl: 'http://127.0.0.1:9/api', token: online.token);
    device = 'flutter-test-${const Uuid().v4()}';
  });

  setUp(() async {
    db = await LocalDb.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
  });

  tearDown(() => db.close());

  test('pedido offline: se guarda, sobrevive sin señal y se sincroniza una sola vez', () async {
    // 1. Primera sincronización con señal: baja el catálogo.
    final first = await SyncEngine(db: db, api: online, deviceUuid: device).run();
    expect(first.pulled, isTrue);
    final products = await db.products();
    final gra = products.firstWhere((p) => p.code == 'PE-GRA');
    expect(gra.referencePrice, isNotNull, reason: 'el catálogo trae precio de referencia FEFO');
    final types = await db.customerTypes();

    // 2. Sin señal: alta de cliente + pedido para ese cliente + un pedido que se descarta.
    final ws = Workspace(db);
    final customer = await ws.createCustomer(
      name: 'Pensión Flutter Test',
      customerTypeId: types.first['id']!,
      phone: '76543210',
      address: 'Mercado Los Pozos, puesto 8',
      location: GeoPoint(-17.789, -63.176, accuracy: 6),
    );
    final presale = await ws.createPresale(
      customer: customer,
      address: customer.primaryAddress,
      items: [PresaleItem(productId: gra.id, productName: gra.name, weightKg: 8.5, quantity: 4, unitPrice: gra.referencePrice!)],
      scheduledDeliveryDate: '2026-10-09',
      notes: 'Prueba offline',
      location: GeoPoint(-17.789, -63.176),
    );
    final discarded = await ws.createPresale(
      customer: customer,
      items: [PresaleItem(productId: gra.id, productName: gra.name, weightKg: 1, unitPrice: 10)],
    );
    await ws.cancelPresale(discarded, 'Me equivoqué');
    expect(await db.presale(discarded.id), isNull, reason: 'un pedido que nunca salió se retira de la cola y desaparece');

    final queued = await db.outbox();
    expect(queued.map((o) => o.type), ['CUSTOMER_CREATE', 'GPS_POSITION', 'PRESALE_CREATE', 'GPS_POSITION']);

    await expectLater(SyncEngine(db: db, api: offline, deviceUuid: device).run(), throwsA(isA<OfflineException>()));
    expect((await db.outbox()).length, 4, reason: 'sin señal nada se pierde ni sale de la cola');
    expect((await db.customers()).any((c) => c.id == customer.id && c.pendingSync), isTrue, reason: 'el cliente nuevo ya es usable sin conexión');

    // 3. Vuelve la señal; el servidor procesa el lote pero la respuesta se pierde (el teléfono no se entera).
    final lost = await online.sync(device, 'test', queued.map((o) => o.toSyncJson()).toList());
    expect((lost['results'] as List).every((r) => r['status'] == 'SYNCED'), isTrue);
    expect((await db.outbox()).length, 4);

    // 4. La app reintenta con la misma cola: el servidor reconoce los ids y no duplica.
    final report = await SyncEngine(db: db, api: online, deviceUuid: device).run();
    expect(report.synced, 4);
    expect(report.failed, 0);
    expect(await db.outbox(), isEmpty);

    final syncedPresale = await db.presale(presale.id);
    expect(syncedPresale!.number, startsWith('P-'));
    expect(syncedPresale.status, 'PENDING');
    expect(syncedPresale.syncState, SyncState.synced);
    final syncedCustomer = (await db.customers()).firstWhere((c) => c.id == customer.id);
    expect(syncedCustomer.pendingSync, isFalse);
    expect(syncedCustomer.code, startsWith('CLI-'));

    // El servidor tiene exactamente un pedido con ese id.
    final boot = await online.bootstrap();
    final serverPresales = (boot['presales'] as List).where((p) => p['id'] == presale.id).toList();
    expect(serverPresales.length, 1);
    expect(double.parse(serverPresales.first['totalAmount'].toString()), closeTo(8.5 * gra.referencePrice!, 0.01));
  });

  test('rechazo del servidor: queda en la cola con su mensaje y se puede descartar', () async {
    await SyncEngine(db: db, api: online, deviceUuid: device).run();
    final gra = (await db.products()).firstWhere((p) => p.code == 'PE-GRA');
    // Cliente que el servidor no conoce (simula un alta que falló o fue descartada).
    final ghost = Customer(id: const Uuid().v4(), name: 'Fantasma', customerTypeId: (await db.customerTypes()).first['id']!);
    final ws = Workspace(db);
    final p = await ws.createPresale(customer: ghost, items: [PresaleItem(productId: gra.id, productName: gra.name, weightKg: 2, unitPrice: 15)]);

    final report = await SyncEngine(db: db, api: online, deviceUuid: device).run();
    expect(report.failed, 1);
    final op = (await db.outbox()).single;
    expect(op.state, 'review');
    expect(op.error, contains('no existe'));
    expect((await db.presale(p.id))!.syncState, SyncState.error);

    await ws.discard(op);
    expect(await db.outbox(), isEmpty);
    expect(await db.presale(p.id), isNull);
  });
}

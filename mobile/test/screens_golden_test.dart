// Capturas de las pantallas a tamaño de teléfono para revisión visual.
// Generar:  flutter test --update-goldens --tags golden test/screens_golden_test.dart
// Los PNG quedan en test/goldens/. Carga Roboto e íconos de Material desde el SDK para que el texto sea legible.
@Tags(['golden'])
library;

import 'dart:convert';
import 'dart:io';

import 'package:erp_preventa/core/local_db.dart';
import 'package:erp_preventa/core/location_service.dart';
import 'package:erp_preventa/core/models.dart';
import 'package:erp_preventa/core/workspace.dart';
import 'package:erp_preventa/screens/customer_detail_screen.dart';
import 'package:erp_preventa/screens/collector/collect_screen.dart';
import 'package:erp_preventa/screens/collector/collector_home_screen.dart';
import 'package:erp_preventa/screens/customer_form_screen.dart';
import 'package:erp_preventa/screens/driver/delivery_form_screen.dart';
import 'package:erp_preventa/screens/driver/driver_home_screen.dart';
import 'package:erp_preventa/screens/driver/signature_pad.dart';
import 'package:erp_preventa/screens/driver/stop_screen.dart';
import 'package:erp_preventa/screens/printing/printer_settings_screen.dart';
import 'package:erp_preventa/screens/printing/receipt_screen.dart';
import 'package:erp_preventa/printing/escpos.dart';
import 'package:erp_preventa/printing/printer_service.dart';
import 'package:erp_preventa/screens/home_screen.dart';
import 'package:erp_preventa/screens/presale_detail_screen.dart';
import 'package:erp_preventa/screens/presale_form_screen.dart';
import 'package:erp_preventa/screens/sync_screen.dart';
import 'package:erp_preventa/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:image/image.dart' as img;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

class _FixedLocation extends LocationService {
  @override
  Future<GeoPoint?> current({Duration timeout = const Duration(seconds: 10)}) async => GeoPoint(-17.7833, -63.1821, accuracy: 7);
}

class _FakePrinters implements PrinterTransport {
  @override
  Future<void> ensurePermissions() async {}
  @override
  Future<List<PrinterDevice>> paired() async => const [PrinterDevice('MTP-II', '66:22:B3:01:02:03'), PrinterDevice('Auriculares JBL', '0C:A6:94:11:22:33')];
  @override
  Future<void> send(String address, List<int> bytes) async {}
}

/// Firma de ejemplo (trazo ondulado), como la exporta el panel de firma.
String _signature() {
  final im = img.Image(width: 300, height: 100, numChannels: 4);
  for (var i = 0; i < 26; i++) {
    final x = 20 + i * 10;
    img.drawLine(im, x1: x, y1: 55 + (i.isEven ? -18 : 14), x2: x + 10, y2: 55 + (i.isEven ? 14 : -18), color: img.ColorRgba8(0, 0, 0, 255), thickness: 3);
  }
  return 'data:image/png;base64,${base64Encode(img.encodePng(im))}';
}

Future<void> _loadFonts() async {
  final sdk = File(Platform.resolvedExecutable).parent.parent.parent.parent.parent.parent.path; // .../flutter
  final dir = '$sdk/bin/cache/artifacts/material_fonts';
  Future<ByteData> read(String f) async => ByteData.view(Uint8List.fromList(await File('$dir/$f').readAsBytes()).buffer);
  final roboto = FontLoader('Roboto')
    ..addFont(read('roboto-regular.ttf'))
    ..addFont(read('roboto-medium.ttf'))
    ..addFont(read('roboto-bold.ttf'));
  await roboto.load();
  await (FontLoader('MaterialIcons')..addFont(read('materialicons-regular.otf'))).load();
  // El ticket usa letra monoespaciada (como la térmica); en la PC de pruebas se usa Consolas.
  Future<ByteData> win(String f) async => ByteData.view(Uint8List.fromList(await File('C:/Windows/Fonts/$f').readAsBytes()).buffer);
  if (File('C:/Windows/Fonts/consola.ttf').existsSync()) {
    await (FontLoader('monospace')
          ..addFont(win('consola.ttf'))
          ..addFont(win('consolab.ttf')))
        .load();
  }
}

Future<AppState> _seed() async {
  final db = await LocalDb.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
  await db.replaceCatalog(
    products: [
      Product(id: 'p1', code: 'PE-GRA', name: 'Pollo entero granja', category: 'Pollo entero', referencePrice: 16.2, availableKg: 62),
      Product(id: 'p2', code: 'PE-SOF', name: 'Pollo entero SOFIA', category: 'Pollo entero', referencePrice: 17.4, availableKg: 246, kgPerCrate: 22),
      Product(id: 'p3', code: 'DE-PEC', name: 'Pechuga', category: 'Despiece', referencePrice: null, availableKg: 0),
    ],
    customers: [
      Customer(id: 'c1', code: 'CLI-00001', name: 'Pollería Doña Juana', customerTypeId: 't1', rank: 'Plata', discountPercentage: 2, creditEnabled: true, creditAvailable: 706.8,
          addresses: [Address(id: 'a1', label: 'Puesto', address: 'Mercado Central #12', latitude: -17.78, longitude: -63.18, isPrimary: true)]),
      Customer(id: 'c2', code: 'CLI-00002', name: 'Tienda Don Pedro', customerTypeId: 't1', addresses: [Address(id: 'a2', label: 'Tienda', address: 'Av. Banzer 4to anillo', isPrimary: true)]),
    ],
    customerTypes: [
      {'id': 't1', 'name': 'Tienda'},
      {'id': 't2', 'name': 'Mercado'},
    ],
  );
  // Hora fija: lo creado en el teléfono no cambia con el reloj de la máquina que corre la prueba.
  final ws = Workspace(db, clock: () => DateTime(2026, 10, 6, 10, 5));
  // Un pedido ya atendido, uno enviado, uno rechazado y uno sin enviar.
  final base = DateTime(2026, 10, 6, 9, 30);
  await db.savePresale(Presale(id: 'x1', number: 'P-000012', status: 'DELIVERED', saleNumber: 'V-000031', customerId: 'c1', customerName: 'Pollería Doña Juana',
      items: [PresaleItem(productId: 'p2', productName: 'Pollo entero SOFIA', weightKg: 20, unitPrice: 17.4)], createdAt: base, syncState: SyncState.synced));
  await db.savePresale(Presale(id: 'x2', number: 'P-000013', status: 'PENDING', customerId: 'c2', customerName: 'Tienda Don Pedro',
      items: [PresaleItem(productId: 'p1', productName: 'Pollo entero granja', weightKg: 12.5, unitPrice: 16.2)], createdAt: base.add(const Duration(minutes: 40)), syncState: SyncState.synced));
  final newCustomer = await ws.createCustomer(name: 'Pensión La Esquina', customerTypeId: 't1', address: 'Calle Sucre #45', location: GeoPoint(-17.79, -63.17));
  await ws.createPresale(
    customer: newCustomer,
    items: [
      PresaleItem(productId: 'p1', productName: 'Pollo entero granja', weightKg: 8.5, quantity: 4, unitPrice: 16.2),
      PresaleItem(productId: 'p2', productName: 'Pollo entero SOFIA', weightKg: 5, unitPrice: 17.4),
    ],
    scheduledDeliveryDate: '2026-10-08',
    notes: 'Entregar antes de las 9',
  );
  await db.setValue('company', jsonEncode({'name': 'Distribuidora de Pollos', 'nit': '1023456027', 'address': 'Av. Principal #100, Santa Cruz', 'phone': '3-3456789', 'footer': 'Gracias por su compra'}));
  final state = AppState(db: db, location: _FixedLocation(), printer: PrinterService(transport: _FakePrinters()), clock: () => DateTime(2026, 10, 6, 10, 5))
    ..user = SessionUser(id: 'u1', username: 'preventista', fullName: 'Preventista Demo', roleName: 'Preventista', permissions: ['presales.create'])
    ..deviceUuid = '3f2a9c1e-0000-4000-8000-000000000000'
    ..online = false
    ..lastSyncAt = DateTime(2026, 10, 6, 10, 15);
  await state.reload();
  return state;
}

/// Chofer con una ruta en curso: una entrega enviada, una no entregada, una registrada sin señal y una pendiente.
Future<AppState> _seedDriver() async {
  final s = await _seed();
  final db = s.db;
  StopItem item(String id, String name, double kg, double price, {double? delivered, String? reason, int crates = 0}) =>
      StopItem(productId: id, productName: name, orderedKg: kg, unitPrice: price, deliveredKg: delivered, differenceReason: reason, orderedCrates: crates);
  await db.saveRoute(DeliveryRoute(
    id: 'r1',
    number: 'RT-000024',
    date: '2026-10-07',
    status: 'IN_PROGRESS',
    vehiclePlate: '3456-KTR',
    vehicleDescription: 'Toyota Hilux con furgón térmico',
    notes: 'Zona norte',
    stops: [
      RouteStop(id: 's1', sequence: 1, status: 'DELIVERED', presaleId: 'x1', presaleNumber: 'P-000093', customerId: 'c1', customerName: 'Pollería Doña Juana',
          address: Address(id: 'a1', label: 'Puesto', address: 'Mercado Central #12', latitude: -17.78, longitude: -63.18), presaleTotal: 437.61,
          items: [item('p2', 'Pollo entero SOFIA', 25, 17.4, delivered: 25)], receivedByName: 'Juana Pérez', paidAmount: 437.61, paymentMethod: 'QR', saleNumber: 'V-000418', signed: true),
      RouteStop(id: 's2', sequence: 2, status: 'FAILED', presaleId: 'x5', presaleNumber: 'P-000094', customerId: 'c2', customerName: 'Tienda Don Pedro',
          address: Address(id: 'a2', label: 'Tienda', address: 'Av. Banzer 4to anillo'), presaleTotal: 202.5, items: [item('p1', 'Pollo entero granja', 12.5, 16.2)],
          problemType: 'CLOSED', notes: 'Cerrado a las 10:30'),
      RouteStop(id: 's3', sequence: 3, status: 'PARTIAL', presaleId: 'x6', presaleNumber: 'P-000095', customerId: 'c1', customerName: 'Mercado Abasto · Puesto 112',
          address: Address(id: 'a3', label: 'Puesto', address: 'Mercado Abasto, nave 2'), presaleTotal: 1088.71,
          items: [item('p2', 'Pollo entero SOFIA', 40, 17.4, delivered: 38.6, reason: 'Peso real al entregar'), item('p1', 'Pollo entero granja', 24, 16.2, delivered: 24)],
          receivedByName: 'Rosa Mamani', paidAmount: 0, signed: true, syncState: SyncState.pending),
      RouteStop(id: 's4', sequence: 4, status: 'PENDING', presaleId: 'x7', presaleNumber: 'P-000098', customerId: 'c1', customerName: 'Pollería Doña Juana',
          customerPhone: '70812345', address: Address(id: 'a1', label: 'Puesto', address: 'Mercado Central #12', latitude: -17.78, longitude: -63.18), presaleTotal: 566.82,
          items: [item('p2', 'Pollo entero SOFIA', 20, 17.4, crates: 1), item('p1', 'Pollo entero granja', 14, 16.2)]),
    ],
  ));
  s.user = SessionUser(id: 'u2', username: 'chofer', fullName: 'Chofer Demo', roleName: 'Chofer', permissions: ['deliveries.register', 'sync.push']);
  await s.reload();
  return s;
}

/// Cobrador: clientes con deuda y canastillos, un cobro enviado y uno sin señal.
Future<AppState> _seedCollector() async {
  final s = await _seed();
  final db = s.db;
  final now = DateTime.now();
  await db.replaceCatalog(
    products: await db.products(),
    customers: [
      Customer(id: 'c1', code: 'CLI-00001', name: 'Pollería Doña Juana', customerTypeId: 't1', creditEnabled: true, currentDebt: 1840.5, cratesHeld: 4,
          debtSince: now.subtract(const Duration(days: 23)), phone: '70812345',
          addresses: [Address(id: 'a1', label: 'Puesto', address: 'Mercado Central #12', latitude: -17.78, longitude: -63.18, isPrimary: true)]),
      Customer(id: 'c2', code: 'CLI-00002', name: 'Tienda Don Pedro', customerTypeId: 't1', creditEnabled: true, currentDebt: 312.8, debtSince: now.subtract(const Duration(days: 4)),
          addresses: [Address(id: 'a2', label: 'Tienda', address: 'Av. Banzer 4to anillo', isPrimary: true)]),
      Customer(id: 'c3', code: 'CLI-00003', name: 'Restaurante El Fogón', customerTypeId: 't1', cratesHeld: 2,
          addresses: [Address(id: 'a3', label: 'Local', address: 'Av. Monseñor Rivero #245', isPrimary: true)]),
      Customer(id: 'c4', code: 'CLI-00004', name: 'Minimarket La Esquina', customerTypeId: 't1', creditEnabled: true, currentDebt: 960, debtSince: now.subtract(const Duration(days: 11))),
    ],
    customerTypes: await db.customerTypes(),
  );
  await db.saveCollection(Collection(id: 'k1', customerId: 'c2', customerName: 'Tienda Don Pedro', amount: 200, paymentMethod: 'EFECTIVO',
      collectedAt: DateTime(2026, 10, 6, 9, 40), receiptNumber: 'R-000041', paidByName: 'Pedro Rojas', cratesPickedUp: 2));
  await db.saveCollection(Collection(id: 'k2', customerId: 'c4', customerName: 'Minimarket La Esquina', amount: 150, paymentMethod: 'QR',
      collectedAt: DateTime(2026, 10, 6, 10, 15), syncState: SyncState.pending));
  s.user = SessionUser(id: 'u3', username: 'cobrador', fullName: 'Cobrador Demo', roleName: 'Cobrador', permissions: ['collections.create', 'sync.push']);
  await s.reload();
  return s;
}

Widget _app(AppState s, Widget home) => ChangeNotifierProvider.value(
      value: s,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: const Color(0xFFEB6834), useMaterial3: true, fontFamily: 'Roboto'),
        home: home,
      ),
    );

void main() {
  sqfliteFfiInit();
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await initializeDateFormatting('es');
    await _loadFonts();
  });

  Future<void> shot(WidgetTester tester, String name, Widget Function(AppState) build,
      {Future<void> Function(WidgetTester)? act, Future<void> Function(AppState)? prepare, bool driver = false, bool collector = false}) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    late AppState s;
    await tester.runAsync(() async {
      s = driver ? await _seedDriver() : collector ? await _seedCollector() : await _seed();
      if (prepare != null) await prepare(s);
    });
    await tester.pumpWidget(_app(s, build(s)));
    // Las pantallas que leen la base local al abrir (comprobante, impresoras) necesitan E/S real.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 400)));
    await tester.pumpAndSettle();
    // …y las imágenes (firma) se decodifican fuera del reloj falso.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    if (act != null) await act(tester);
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$name.png'));
    await tester.runAsync(() => s.db.close());
  }

  testWidgets('inicio con pedidos', (t) => shot(t, 'home_pedidos', (_) => const HomeScreen()));
  testWidgets('clientes', (t) => shot(t, 'home_clientes', (_) => const HomeScreen(), act: (t) async {
        await t.tap(find.text('Clientes').last);
        await t.pumpAndSettle();
      }));
  testWidgets('detalle de pedido sin enviar', (t) => shot(t, 'detalle_pedido', (s) => PresaleDetailScreen(presaleId: s.presales.first.id)));
  testWidgets('estado y cola', (t) => shot(t, 'estado_cola', (_) => const SyncScreen()));
  testWidgets('nuevo pedido', (t) => shot(t, 'nuevo_pedido', (_) => const PresaleFormScreen(), act: (t) async {
        await t.tap(find.text('Elegir cliente'));
        await t.pumpAndSettle();
        await t.tap(find.text('Pollería Doña Juana'));
        await t.pumpAndSettle();
        await t.tap(find.text('Agregar producto'));
        await t.pumpAndSettle();
        await t.tap(find.text('Pollo entero granja'));
        await t.pumpAndSettle();
        await t.enterText(find.widgetWithText(TextField, 'Kg'), '80');
        await t.pumpAndSettle();
      }));
  testWidgets('pedido por canastillo', (t) => shot(t, 'pedido_canastillo', (_) => const PresaleFormScreen(), act: (t) async {
        await t.tap(find.text('Elegir cliente'));
        await t.pumpAndSettle();
        await t.tap(find.text('Pollería Doña Juana'));
        await t.pumpAndSettle();
        await t.tap(find.text('Agregar producto'));
        await t.pumpAndSettle();
        await t.tap(find.text('Pollo entero SOFIA'));
        await t.pumpAndSettle();
        await t.enterText(find.widgetWithText(TextField, 'Canastillos'), '3');
        await t.pumpAndSettle();
      }));
  testWidgets('ficha de cliente', (t) => shot(t, 'ficha_cliente', (_) => const CustomerDetailScreen(customerId: 'c1')));
  testWidgets('editar pedido', (t) => shot(t, 'editar_pedido', (s) => PresaleFormScreen(editing: s.presales.firstWhere((p) => p.id == 'x2'))));
  testWidgets('nuevo cliente', (t) => shot(t, 'nuevo_cliente', (_) => const CustomerFormScreen()));

  // Chofer
  testWidgets('chofer: ruta del día', (t) => shot(t, 'chofer_ruta', (_) => const DriverHomeScreen(), driver: true));
  testWidgets('chofer: parada pendiente', (t) => shot(t, 'chofer_parada', (_) => const StopScreen(routeId: 'r1', stopId: 's4'), driver: true));
  testWidgets('chofer: entrega con diferencia y firma', (t) => shot(t, 'chofer_entrega', (_) => const DeliveryFormScreen(routeId: 'r1', stopId: 's4'), driver: true,
      act: (t) async {
        await t.enterText(find.byType(TextField).first, '19,4');
        await t.pumpAndSettle();
        await t.tap(find.text('Peso real al entregar'));
        await t.pumpAndSettle();
        await t.tap(find.text('Crédito'));
        await t.pumpAndSettle();
        await t.enterText(find.widgetWithText(TextField, 'Quién recibe'), 'Juana Pérez');
        await t.ensureVisible(find.byType(SignaturePad));
        await t.pumpAndSettle();
        final pad = t.getTopLeft(find.byType(SignaturePad));
        final g = await t.startGesture(pad + const Offset(30, 110));
        for (var i = 1; i <= 24; i++) {
          await g.moveTo(pad + Offset(30.0 + i * 11, 110.0 - 40.0 * (i.isEven ? 1.0 : 0.2) + i));
        }
        await g.up();
        await t.pumpAndSettle();
      }));

  // Cobrador
  testWidgets('cobrador: por cobrar', (t) => shot(t, 'cobrador_pendientes', (_) => const CollectorHomeScreen(), collector: true));
  testWidgets('cobrador: mis cobros', (t) => shot(t, 'cobrador_cobros', (_) => const CollectorHomeScreen(), collector: true, act: (t) async {
        await t.tap(find.text('Mis cobros').last);
        await t.pumpAndSettle();
      }));
  testWidgets('cobrador: cobrar', (t) => shot(t, 'cobrador_cobrar', (_) => const CollectScreen(customerId: 'c1'), collector: true, act: (t) async {
        await t.enterText(find.widgetWithText(TextField, 'Monto cobrado'), '500');
        await t.tap(find.byTooltip('Más'));
        await t.tap(find.byTooltip('Más'));
        await t.pumpAndSettle();
      }));

  // Comprobantes
  testWidgets('cobrador: recibo con firma sin enviar', (t) {
    late Collection c;
    return shot(t, 'cobrador_recibo', (s) => ReceiptScreen(load: (s) => s.collectionReceipt(c)), collector: true, prepare: (s) async {
      // Fijo (sin uuid ni hora actual) para que la imagen sea estable.
      c = Collection(id: '8a0ed214-5c3e-4f7a-9d1b-2e6f0a9c4b11', customerId: 'c1', customerName: 'Pollería Doña Juana', amount: 500, paymentMethod: 'EFECTIVO',
          collectedAt: DateTime(2026, 10, 8, 11, 25), paidByName: 'Juana Pérez', cratesPickedUp: 2, syncState: SyncState.pending);
      await s.db.saveCollection(c);
      await s.db.enqueue(OutboxOp(id: 'op-k9', type: 'COLLECTION_CREATE', createdAt: c.collectedAt, payload: {
        'id': c.id, 'customerId': 'c1', 'amount': 500, 'paymentMethod': 'EFECTIVO', 'paidByName': 'Juana Pérez', 'signature': _signature(), 'cratesPickedUp': 2,
      }));
      await s.db.saveCustomer(s.customers.firstWhere((x) => x.id == 'c1').copyWith(currentDebt: 1340.5));
      await s.printer.choose(const PrinterDevice('MTP-II', '66:22:B3:01:02:03'), PaperWidth.mm58);
      await s.reload();
    });
  });
  testWidgets('chofer: comprobante de entrega parcial', (t) => shot(t, 'chofer_comprobante',
      (s) => ReceiptScreen(load: (s) => s.deliveryReceipt(s.routes.first, s.routes.first.stops.firstWhere((x) => x.id == 's3'))), driver: true,
      prepare: (s) async {
        await s.db.enqueue(OutboxOp(id: 'op-s3', type: 'DELIVERY_COMPLETE', createdAt: DateTime(2026, 10, 7, 10, 52),
            payload: {'stopId': 's3', 'receivedByName': 'Rosa Mamani', 'signature': _signature()}));
        await s.reload();
      }));
  testWidgets('impresora', (t) => shot(t, 'impresora', (_) => const PrinterSettingsScreen(), collector: true, prepare: (s) async {
        await s.printer.choose(const PrinterDevice('MTP-II', '66:22:B3:01:02:03'), PaperWidth.mm58);
      }));
}

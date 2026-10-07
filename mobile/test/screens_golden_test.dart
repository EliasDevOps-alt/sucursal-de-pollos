// Capturas de las pantallas a tamaño de teléfono para revisión visual.
// Generar:  flutter test --update-goldens --tags golden test/screens_golden_test.dart
// Los PNG quedan en test/goldens/. Carga Roboto e íconos de Material desde el SDK para que el texto sea legible.
@Tags(['golden'])
library;

import 'dart:io';

import 'package:erp_preventa/core/local_db.dart';
import 'package:erp_preventa/core/location_service.dart';
import 'package:erp_preventa/core/models.dart';
import 'package:erp_preventa/core/workspace.dart';
import 'package:erp_preventa/screens/customer_detail_screen.dart';
import 'package:erp_preventa/screens/customer_form_screen.dart';
import 'package:erp_preventa/screens/driver/delivery_form_screen.dart';
import 'package:erp_preventa/screens/driver/driver_home_screen.dart';
import 'package:erp_preventa/screens/driver/signature_pad.dart';
import 'package:erp_preventa/screens/driver/stop_screen.dart';
import 'package:erp_preventa/screens/home_screen.dart';
import 'package:erp_preventa/screens/presale_detail_screen.dart';
import 'package:erp_preventa/screens/presale_form_screen.dart';
import 'package:erp_preventa/screens/sync_screen.dart';
import 'package:erp_preventa/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

class _FixedLocation extends LocationService {
  @override
  Future<GeoPoint?> current({Duration timeout = const Duration(seconds: 10)}) async => GeoPoint(-17.7833, -63.1821, accuracy: 7);
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
}

Future<AppState> _seed() async {
  final db = await LocalDb.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
  await db.replaceCatalog(
    products: [
      Product(id: 'p1', code: 'PE-GRA', name: 'Pollo entero granja', category: 'Pollo entero', referencePrice: 16.2, availableKg: 62),
      Product(id: 'p2', code: 'PE-SOF', name: 'Pollo entero SOFIA', category: 'Pollo entero', referencePrice: 17.4, availableKg: 246),
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
  final ws = Workspace(db);
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
  final state = AppState(db: db, location: _FixedLocation())
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
  StopItem item(String id, String name, double kg, double price, {double? delivered, String? reason}) =>
      StopItem(productId: id, productName: name, orderedKg: kg, unitPrice: price, deliveredKg: delivered, differenceReason: reason);
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
          items: [item('p2', 'Pollo entero SOFIA', 20, 17.4), item('p1', 'Pollo entero granja', 14, 16.2)]),
    ],
  ));
  s.user = SessionUser(id: 'u2', username: 'chofer', fullName: 'Chofer Demo', roleName: 'Chofer', permissions: ['deliveries.register', 'sync.push']);
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
    await initializeDateFormatting('es');
    await _loadFonts();
  });

  Future<void> shot(WidgetTester tester, String name, Widget Function(AppState) build, {Future<void> Function(WidgetTester)? act, bool driver = false}) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    late AppState s;
    await tester.runAsync(() async => s = driver ? await _seedDriver() : await _seed());
    await tester.pumpWidget(_app(s, build(s)));
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
}

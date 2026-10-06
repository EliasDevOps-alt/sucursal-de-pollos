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
import 'package:erp_preventa/screens/customer_form_screen.dart';
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

  Future<void> shot(WidgetTester tester, String name, Widget Function(AppState) build, {Future<void> Function(WidgetTester)? act}) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    late AppState s;
    await tester.runAsync(() async => s = await _seed());
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
  testWidgets('nuevo cliente', (t) => shot(t, 'nuevo_cliente', (_) => const CustomerFormScreen()));
}

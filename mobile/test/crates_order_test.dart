// Pedido por canastillo: el teléfono lo guarda, lo envía con los canastillos y el chofer los ve en la parada.
import 'package:erp_preventa/core/local_db.dart';
import 'package:erp_preventa/core/models.dart';
import 'package:erp_preventa/core/workspace.dart';
import 'package:erp_preventa/printing/receipt_doc.dart';
import 'package:erp_preventa/screens/format.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();
  setUpAll(() => initializeDateFormatting('es'));

  test('el producto trae su peso por canastillo desde la sincronización', () {
    final p = Product.fromJson({'id': 'p1', 'code': 'PE', 'name': 'Pollo entero', 'category': 'Pollo', 'referencePrice': '16.5', 'availableKg': '300', 'kgPerCrate': '22.000'});
    expect(p.kgPerCrate, 22);
    expect(Product.fromJson(p.toJson()).kgPerCrate, 22, reason: 'se conserva en el teléfono');
    expect(Product.fromJson({'id': 'p2', 'code': 'PI', 'name': 'Pierna', 'availableKg': 0}).kgPerCrate, isNull);
  });

  test('el pedido por canastillo se guarda sin señal y viaja con los canastillos', () async {
    final db = await LocalDb.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
    addTearDown(db.close);
    final ws = Workspace(db);
    final customer = Customer(id: 'c1', code: 'CLI-00001', name: 'Mayorista', customerTypeId: 't1');
    final presale = await ws.createPresale(
      customer: customer,
      items: [
        PresaleItem(productId: 'p1', productName: 'Pollo entero', weightKg: 66, unitPrice: 16.5, crates: 3),
        PresaleItem(productId: 'p2', productName: 'Pierna', weightKg: 5, unitPrice: 18, quantity: 10),
      ],
    );
    final op = (await db.outbox()).singleWhere((o) => o.type == 'PRESALE_CREATE');
    final items = (op.payload['items'] as List).cast<Map>();
    expect(items.first['crates'], 3);
    expect(items.last.containsKey('crates'), isFalse, reason: 'sin canastillos no se envía el campo');
    final saved = (await db.presale(presale.id))!;
    expect(saved.items.first.crates, 3);
    expect(saved.items.last.crates, 0);
    expect(saved.items.last.quantity, 10);
  });

  test('el chofer ve los canastillos pedidos y el comprobante los muestra', () {
    final route = DeliveryRoute.fromServer({
      'id': 'r1',
      'routeNumber': 'RT-000030',
      'routeDate': '2026-10-10',
      'status': 'IN_PROGRESS',
      'vehicle': {'plate': '3456-KTR', 'description': 'Hilux'},
      'stops': [
        {
          'id': 's1',
          'sequence': 1,
          'status': 'PENDING',
          'presaleId': 'x1',
          'presale': {'presaleNumber': 'P-000120', 'totalAmount': '1089', 'items': [{'productId': 'p1', 'unitPrice': '16.5'}]},
          'customer': {'id': 'c1', 'name': 'Mayorista'},
          'items': [
            {'product': {'id': 'p1', 'name': 'Pollo entero'}, 'orderedWeightKg': '66.000', 'orderedCrates': 3},
          ],
          'paidAmount': '0',
          'cratesDelivered': 0,
          'cratesPickedUp': 0,
        },
      ],
    });
    final item = route.stops.single.items.single;
    expect(item.orderedCrates, 3);
    expect(fmtOrdered(item.orderedKg, item.orderedCrates), '3 canastillos (66 kg)');
    expect(fmtOrdered(5, 0), '5 kg');
    expect(StopItem.fromJson(item.toJson()).orderedCrates, 3, reason: 'se conserva en el teléfono');

    final delivered = route.stops.single.copyWith(
      status: 'PARTIAL',
      items: [StopItem(productId: 'p1', productName: 'Pollo entero', orderedKg: 66, orderedCrates: 3, unitPrice: 16.5, deliveredKg: 64.2, differenceReason: 'Peso real')],
      receivedByName: 'Mayorista',
      cratesDelivered: 3,
    );
    final r = ReceiptDoc.delivery(route: route, stop: delivered, company: const CompanyInfo(), driverName: 'Chofer Demo');
    expect(r.items.single.detail, startsWith('Pedido 3 canastillos (66 kg) · entregado 64,2 kg'));
  });
}

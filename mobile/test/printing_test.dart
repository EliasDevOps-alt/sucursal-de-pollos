// Comprobantes e impresión térmica: codificación ESC/POS, recibo armado sin conexión y registro de la impresión.
import 'dart:convert';

import 'package:erp_preventa/core/api_client.dart';
import 'package:erp_preventa/core/local_db.dart';
import 'package:erp_preventa/core/models.dart';
import 'package:erp_preventa/core/workspace.dart';
import 'package:erp_preventa/printing/escpos.dart';
import 'package:erp_preventa/printing/printer_service.dart';
import 'package:erp_preventa/printing/receipt_doc.dart';
import 'package:erp_preventa/state/app_state.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:intl/date_symbol_data_local.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Firma de prueba: un trazo negro sobre fondo transparente, como la que exporta el panel de firma.
String signaturePng() {
  final im = img.Image(width: 240, height: 90, numChannels: 4);
  img.drawLine(im, x1: 20, y1: 60, x2: 220, y2: 30, color: img.ColorRgba8(0, 0, 0, 255), thickness: 4);
  return 'data:image/png;base64,${base64Encode(img.encodePng(im))}';
}

class FakeTransport implements PrinterTransport {
  final sent = <List<int>>[];
  bool fail = false;
  @override
  Future<void> ensurePermissions() async {}
  @override
  Future<List<PrinterDevice>> paired() async => const [PrinterDevice('MTP-II', '66:22:B3:01:02:03')];
  @override
  Future<void> send(String address, List<int> bytes) async {
    if (fail) throw PrinterException('No se pudo conectar con la impresora');
    sent.add(bytes);
  }
}

bool containsSeq(List<int> haystack, List<int> needle) {
  for (var i = 0; i + needle.length <= haystack.length; i++) {
    var ok = true;
    for (var j = 0; j < needle.length && ok; j++) {
      ok = haystack[i + j] == needle[j];
    }
    if (ok) return true;
  }
  return false;
}

void main() {
  sqfliteFfiInit();
  setUpAll(() => initializeDateFormatting('es'));

  group('ESC/POS', () {
    test('acentos y símbolos en la página de códigos 850', () {
      expect(EscPos.encodeText('Ñandú ¿Sí? N.º 2 × Bs − ok €'),
          [0xA5, 0x61, 0x6E, 0x64, 0xA3, 0x20, 0xA8, 0x53, 0xA1, 0x3F, 0x20, 0x4E, 0x2E, 0xA7, 0x20, 0x32, 0x20, 0x9E, 0x20, 0x42, 0x73, 0x20, 0x2D, 0x20, 0x6F, 0x6B, 0x20, 0x3F]);
    });

    test('renglones por palabras y pares etiqueta/valor al ancho del papel', () {
      expect(EscPos.wrap('Pollería Doña Juana del Mercado Central', 16), ['Pollería Doña', 'Juana del', 'Mercado Central']);
      expect(EscPos.wrap('ABCDEFGHIJKLMNOPQRST', 8), ['ABCDEFGH', 'IJKLMNOP', 'QRST']);
      final p = EscPos(PaperWidth.mm58)..pair('TOTAL', 'Bs 1.234,50');
      final text = latin1.decode(p.bytes());
      expect(text, 'TOTAL${' ' * (32 - 5 - 11)}Bs 1.234,50\n');
      final long = EscPos(PaperWidth.mm58)..pair('Dirección:', 'Av. Monseñor Rivero #245, frente al parque');
      final lines = latin1.decode(long.bytes()).split('\n')..removeLast();
      expect(lines.every((l) => l.length <= 32), isTrue);
      expect(lines.last.endsWith('parque'), isTrue, reason: 'el valor largo baja alineado a la derecha');
    });

    test('la firma se imprime como imagen de trama (GS v 0) recortada al trazo', () {
      final sig = decodeSignature(signaturePng())!;
      expect(sig.width, lessThan(240));
      expect(sig.height, lessThan(90));
      final p = EscPos(PaperWidth.mm80)..image(sig);
      final b = p.bytes();
      expect(b.sublist(0, 4), [0x1D, 0x76, 0x30, 0]);
      final widthBytes = b[4] | (b[5] << 8), height = b[6] | (b[7] << 8);
      expect(widthBytes, (sig.width + 7) ~/ 8);
      expect(height, sig.height);
      expect(b.length, 8 + widthBytes * height);
      expect(b.skip(8).any((x) => x != 0), isTrue, reason: 'hay puntos negros');
      expect(decodeSignature('no-es-una-imagen'), isNull);
    });
  });

  group('comprobante', () {
    final serverJson = {
      'type': 'COLLECTION',
      'documentId': '0f5c6a52-8d55-4e43-9b8c-1a0c9b0b7f10',
      'number': 'R-000055',
      'title': 'RECIBO DE COBRO',
      'issuedAt': '08/10/2026 14:21',
      'company': {'name': 'Distribuidora de Pollos', 'nit': '1234567', 'address': 'Av. Principal #100', 'phone': '', 'footer': 'Gracias por su compra'},
      'meta': [
        {'label': 'Cliente', 'value': 'Mercado Mutualista · Puesto 45'},
        {'label': 'Cobró', 'value': 'Cobrador Demo'},
      ],
      'items': [
        {'description': 'Pago a cuenta de deuda', 'detail': 'Efectivo', 'amount': 'Bs 611,00'},
      ],
      'totals': [
        {'label': 'PAGADO', 'value': 'Bs 611,00', 'strong': true},
        {'label': 'Saldo pendiente', 'value': 'Bs 1.907,52'},
      ],
      'extra': [
        {'label': 'Pagó', 'value': 'Elena Flores'},
      ],
      'signature': signaturePng(),
      'signatureLabel': 'Firma de Elena Flores',
      'footer': 'Gracias por su compra',
      'printCount': 0,
    };

    test('el del servidor se imprime completo: encabezado, totales a doble alto, firma y corte', () {
      final r = ReceiptDoc.fromServer('cobro', serverJson);
      expect(r.number, 'R-000055');
      expect(r.totals.first.strong, isTrue);
      for (final paper in PaperWidth.values) {
        final b = encodeReceipt(r, paper, copyLabel: 'COPIA 1');
        expect(b.sublist(0, 5), [0x1B, 0x40, 0x1B, 0x74, 2], reason: 'reinicia y elige CP850');
        expect(containsSeq(b, EscPos.encodeText('N.º R-000055')), isTrue);
        expect(containsSeq(b, EscPos.encodeText('NIT 1234567')), isTrue);
        expect(containsSeq(b, EscPos.encodeText('COPIA 1')), isTrue);
        expect(containsSeq(b, [0x1D, 0x21, 0x01]), isTrue, reason: 'total a doble alto');
        expect(containsSeq(b, [0x1D, 0x76, 0x30, 0]), isTrue, reason: 'firma');
        expect(b.sublist(b.length - 4), [0x1D, 0x56, 0x42, 0], reason: 'corte al final');
        final lines = latin1.decode(b.where((x) => x >= 0x20 || x == 0x0A).toList()).split('\n');
        // Ningún renglón de texto supera el ancho (se excluyen los de la imagen de la firma).
        expect(lines.where((l) => !l.contains('v0')).every((l) => l.length <= paper.columns + 4), isTrue);
      }
    });

    test('la entrega armada en el teléfono calcula total, cobro y crédito; la no entregada es constancia', () {
      final route = DeliveryRoute(id: 'r1', number: 'RT-000024', date: '2026-10-08', status: 'IN_PROGRESS', vehiclePlate: '3456-KTR', vehicleDescription: 'Hilux', stops: const []);
      final stop = RouteStop(
        id: 's3', sequence: 3, status: 'PARTIAL', presaleId: 'x6', presaleNumber: 'P-000095', customerId: 'c1', customerName: 'Mercado Abasto · Puesto 112',
        presaleTotal: 1084.8,
        items: [
          StopItem(productId: 'p2', productName: 'Pollo entero SOFIA', orderedKg: 40, unitPrice: 17.4, deliveredKg: 38.6, differenceReason: 'Peso real'),
          StopItem(productId: 'p1', productName: 'Pollo entero granja', orderedKg: 24, unitPrice: 16.2, deliveredKg: 24),
        ],
        receivedByName: 'Rosa Mamani', paidAmount: 500, paymentMethod: 'EFECTIVO', cratesDelivered: 3, cratesPickedUp: 1, signed: true,
      );
      final r = ReceiptDoc.delivery(route: route, stop: stop, company: const CompanyInfo(name: 'Distribuidora'), driverName: 'Chofer Demo', at: DateTime(2026, 10, 8, 9, 42));
      expect(r.provisional, isTrue, reason: 'sin número de venta todavía');
      expect(r.number, 'RT-000024-3');
      expect(r.issuedAt, '08/10/2026 09:42');
      expect(r.totals.map((t) => '${t.label}=${t.value}'), ['TOTAL=Bs 1.060,44', 'Cobrado=Bs 500,00', 'A crédito=Bs 560,44']);
      expect(r.extra.map((e) => e.label), containsAll(['Forma de pago', 'Canastillos', 'Recibió']));
      expect(r.items.first.detail, contains('(Peso real)'));

      final failed = ReceiptDoc.delivery(
          route: route,
          stop: RouteStop(id: 's2', sequence: 2, status: 'FAILED', presaleId: 'x5', presaleNumber: 'P-000094', customerId: 'c2', customerName: 'Tienda',
              presaleTotal: 10, items: const [], problemType: 'CLOSED', notes: 'Cerrado a las 10:30'),
          company: const CompanyInfo(),
          driverName: 'Chofer Demo');
      expect(failed.title, 'CONSTANCIA DE VISITA');
      expect(failed.totals, isEmpty);
      expect(failed.extra.single.value, 'Local cerrado: Cerrado a las 10:30');
      expect(failed.provisional, isFalse);
    });
  });

  test('imprimir sin señal: original y copias, constancia en la cola y la firma tomada de la cola', () async {
    final db = await LocalDb.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
    addTearDown(db.close);
    await db.setValue('company', jsonEncode({'name': 'Distribuidora de Pollos', 'nit': '', 'address': 'Av. Principal #100', 'phone': '', 'footer': 'Gracias'}));
    final customer = Customer(id: 'c1', code: 'CLI-00001', name: 'Pollería Doña Juana', customerTypeId: 't1', documentId: '4567890', creditEnabled: true, currentDebt: 900);
    await db.replaceCatalog(products: const [], customers: [customer], customerTypes: const []);
    final transport = FakeTransport();
    final printer = PrinterService(transport: transport)..device = const PrinterDevice('MTP-II', '66:22:B3:01:02:03');
    final s = AppState(db: db, printer: printer)..api = ApiClient(baseUrl: 'http://127.0.0.1:9/api'); // sin señal
    await s.reload();
    s.user = SessionUser(id: 'u3', username: 'cobrador', fullName: 'Cobrador Demo', roleName: 'Cobrador', permissions: ['collections.create']);

    final sig = signaturePng();
    final c = await Workspace(db).collect(customer, amount: 300, paymentMethod: 'QR', referenceNumber: 'TX-881', paidByName: 'Juana', signaturePng: sig);
    await s.reload();
    expect(s.company.name, 'Distribuidora de Pollos');

    final r = await s.collectionReceipt(c);
    expect(r.provisional, isTrue);
    expect(r.signature, sig, reason: 'la firma sale de la operación en cola');
    expect(r.items.single.detail, 'QR · TX-881');
    expect(r.totals.map((t) => '${t.label}=${t.value}'), ['Deuda anterior=Bs 900,00', 'PAGADO=Bs 300,00', 'Saldo pendiente=Bs 600,00']);
    expect(r.meta.map((m) => m.value), contains('4567890'));

    expect(await s.printReceipt(r), 'ORIGINAL');
    expect(await s.printReceipt(r), 'COPIA 1');
    expect(transport.sent, hasLength(2));
    expect(containsSeq(transport.sent.first, EscPos.encodeText('ORIGINAL')), isTrue);
    expect(containsSeq(transport.sent.last, EscPos.encodeText('COPIA 1')), isTrue);
    final prints = s.outbox.where((o) => o.type == 'RECEIPT_PRINT').toList();
    expect(prints, hasLength(2));
    expect(prints.first.payload, {'documentType': 'cobro', 'documentId': c.id});
    expect(prints.first.label, 'Comprobante impreso');

    // Si la impresora falla no se cuenta como impreso.
    transport.fail = true;
    await expectLater(s.printReceipt(r), throwsA(isA<PrinterException>()));
    expect(await s.printCount(r), 2);

    // Descartar el cobro rechazado arrastra sus impresiones.
    final op = s.outbox.firstWhere((o) => o.type == 'COLLECTION_CREATE');
    await s.discard(op);
    expect(s.outbox.where((o) => o.type == 'RECEIPT_PRINT'), isEmpty);
  });

  test('sin impresora elegida pide elegirla', () async {
    final printer = PrinterService(transport: FakeTransport());
    await expectLater(printer.print([1, 2, 3]), throwsA(isA<PrinterException>().having((e) => e.message, 'mensaje', contains('Elija la impresora'))));
    printer.paper = PaperWidth.mm58;
    final page = latin1.decode(printer.testPage().where((x) => x >= 0x20 || x == 0x0A).toList());
    expect(page.split('\n').where((l) => l.startsWith('1234567890')).single.length, 32);
  });
}

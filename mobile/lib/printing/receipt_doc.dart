import 'package:intl/intl.dart';

import '../core/models.dart';
import '../screens/driver/stop_screen.dart' show problemLabels;
import '../screens/format.dart';

/// Datos del negocio para el encabezado (llegan en la sincronización; se editan en el panel web).
class CompanyInfo {
  const CompanyInfo({this.name = 'Distribuidora', this.nit = '', this.address = '', this.phone = '', this.footer = ''});

  final String name;
  final String nit;
  final String address;
  final String phone;
  final String footer;

  factory CompanyInfo.fromJson(Map<String, dynamic> j) => CompanyInfo(
        name: (j['name'] as String?)?.trim().isNotEmpty == true ? j['name'] as String : 'Distribuidora',
        nit: (j['nit'] ?? '') as String,
        address: (j['address'] ?? '') as String,
        phone: (j['phone'] ?? '') as String,
        footer: (j['footer'] ?? '') as String,
      );

  Map<String, dynamic> toJson() => {'name': name, 'nit': nit, 'address': address, 'phone': phone, 'footer': footer};
}

class ReceiptLine {
  const ReceiptLine(this.description, {this.detail, this.amount});
  final String description;
  final String? detail;
  final String? amount;
}

class ReceiptPair {
  const ReceiptPair(this.label, this.value, {this.strong = false});
  final String label;
  final String value;
  final bool strong;
}

/// Comprobante listo para dibujar o imprimir. Es el mismo modelo que devuelve el servidor (GET /receipts/:tipo/:id),
/// así el recibo hecho sin conexión y el reimpreso después de sincronizar se ven igual.
class ReceiptDoc {
  const ReceiptDoc({
    required this.slug,
    required this.documentId,
    required this.number,
    required this.title,
    required this.issuedAt,
    required this.company,
    this.meta = const [],
    this.items = const [],
    this.totals = const [],
    this.extra = const [],
    this.signature,
    this.signatureLabel,
    this.notice,
    this.footer = '',
    this.provisional = false,
  });

  final String slug; // entrega | cobro
  final String documentId;
  final String number;
  final String title;
  final String issuedAt;
  final CompanyInfo company;
  final List<ReceiptPair> meta;
  final List<ReceiptLine> items;
  final List<ReceiptPair> totals;
  final List<ReceiptPair> extra;
  final String? signature; // PNG en data URL
  final String? signatureLabel;
  final String? notice;
  final String footer;
  /// Armado en el teléfono antes de sincronizar: el número y los montos finales los pone el servidor.
  final bool provisional;

  factory ReceiptDoc.fromServer(String slug, Map<String, dynamic> j) {
    List<ReceiptPair> pairs(String key) => [
          for (final raw in (j[key] as List? ?? []))
            ReceiptPair((raw as Map)['label'] as String, raw['value'] as String, strong: raw['strong'] == true),
        ];
    final company = CompanyInfo.fromJson(Map<String, dynamic>.from(j['company'] as Map));
    return ReceiptDoc(
      slug: slug,
      documentId: j['documentId'] as String,
      number: j['number'] as String,
      title: j['title'] as String,
      issuedAt: j['issuedAt'] as String,
      company: company,
      meta: pairs('meta'),
      items: [
        for (final raw in (j['items'] as List? ?? []))
          ReceiptLine((raw as Map)['description'] as String, detail: raw['detail'] as String?, amount: raw['amount'] as String?),
      ],
      totals: pairs('totals'),
      extra: pairs('extra'),
      signature: j['signature'] as String?,
      signatureLabel: j['signatureLabel'] as String?,
      notice: j['notice'] as String?,
      footer: (j['footer'] ?? company.footer) as String,
    );
  }

  static final _date = DateFormat('dd/MM/yyyy HH:mm');
  static const _methods = {'EFECTIVO': 'Efectivo', 'QR': 'QR', 'TRANSFERENCIA': 'Transferencia'};

  /// Entrega registrada en el teléfono (con o sin conexión).
  factory ReceiptDoc.delivery({
    required DeliveryRoute route,
    required RouteStop stop,
    required CompanyInfo company,
    required String driverName,
    DateTime? at,
    String? signature,
  }) {
    final failed = stop.status == 'FAILED';
    final total = stop.items.fold<double>(0, (t, i) => t + (i.deliveredKg ?? 0) * i.unitPrice);
    final credit = total - stop.paidAmount;
    return ReceiptDoc(
      slug: 'entrega',
      documentId: stop.id,
      number: stop.saleNumber ?? '${route.number}-${stop.sequence}',
      title: failed ? 'CONSTANCIA DE VISITA' : 'COMPROBANTE DE ENTREGA',
      issuedAt: _date.format(at ?? DateTime.now()),
      company: company,
      meta: [
        ReceiptPair('Cliente', stop.customerName),
        if (stop.address != null) ReceiptPair('Dirección', stop.address!.address),
        ReceiptPair('Pedido', stop.presaleNumber),
        ReceiptPair('Ruta', '${route.number} · ${route.vehiclePlate}'),
        ReceiptPair('Chofer', driverName),
      ],
      items: failed
          ? const []
          : [
              for (final i in stop.items)
                ReceiptLine(
                  i.productName,
                  detail: 'Pedido ${fmtOrdered(i.orderedKg, i.orderedCrates)} · entregado ${fmtKg(i.deliveredKg ?? 0)} × ${fmtBob(i.unitPrice)}/kg'
                      '${i.differenceReason != null ? ' (${i.differenceReason})' : ''}',
                  amount: fmtBob((i.deliveredKg ?? 0) * i.unitPrice),
                ),
            ],
      totals: failed
          ? const []
          : [
              ReceiptPair('TOTAL', fmtBob(total), strong: true),
              ReceiptPair('Cobrado', fmtBob(stop.paidAmount)),
              if (credit > 0.005) ReceiptPair('A crédito', fmtBob(credit)),
            ],
      extra: [
        if (failed) ReceiptPair('No entregado', '${problemLabels[stop.problemType] ?? stop.problemType ?? ''}${stop.notes != null ? ': ${stop.notes}' : ''}'),
        if (stop.paymentMethod != null) ReceiptPair('Forma de pago', _methods[stop.paymentMethod] ?? stop.paymentMethod!),
        if (stop.cratesDelivered > 0 || stop.cratesPickedUp > 0)
          ReceiptPair('Canastillos', 'dejados ${stop.cratesDelivered} · recogidos ${stop.cratesPickedUp}'),
        if (stop.receivedByName != null) ReceiptPair('Recibió', stop.receivedByName!),
      ],
      signature: signature,
      signatureLabel: stop.receivedByName != null ? 'Firma de ${stop.receivedByName}' : null,
      footer: company.footer,
      provisional: stop.saleNumber == null && !failed,
    );
  }

  /// Cobro hecho en el teléfono. [debtAfter] es la deuda que quedó en el teléfono tras descontar el cobro.
  factory ReceiptDoc.collection({
    required Collection c,
    required CompanyInfo company,
    required String collectorName,
    String? customerDocument,
    double? debtAfter,
    String? referenceNumber,
    String? notes,
    String? signature,
  }) =>
      ReceiptDoc(
        slug: 'cobro',
        documentId: c.id,
        number: c.receiptNumber ?? c.id.substring(0, 8).toUpperCase(),
        title: 'RECIBO DE COBRO',
        issuedAt: _date.format(c.collectedAt),
        company: company,
        meta: [
          ReceiptPair('Cliente', c.customerName),
          if (customerDocument != null && customerDocument.isNotEmpty) ReceiptPair('CI/NIT', customerDocument),
          ReceiptPair('Cobró', collectorName),
        ],
        items: [
          ReceiptLine('Pago a cuenta de deuda',
              detail: '${_methods[c.paymentMethod] ?? c.paymentMethod}${referenceNumber != null ? ' · $referenceNumber' : ''}', amount: fmtBob(c.amount)),
        ],
        totals: [
          if (debtAfter != null) ReceiptPair('Deuda anterior', fmtBob(debtAfter + c.amount)),
          ReceiptPair('PAGADO', fmtBob(c.amount), strong: true),
          if (debtAfter != null) ReceiptPair(debtAfter < 0 ? 'Saldo a favor' : 'Saldo pendiente', fmtBob(debtAfter.abs())),
        ],
        extra: [
          if (c.paidByName != null) ReceiptPair('Pagó', c.paidByName!),
          if (c.cratesPickedUp > 0) ReceiptPair('Canastillos devueltos', '${c.cratesPickedUp}'),
          if (notes != null) ReceiptPair('Nota', notes),
        ],
        signature: signature,
        signatureLabel: c.paidByName != null ? 'Firma de ${c.paidByName}' : null,
        notice: c.status == 'ANNULLED' ? 'ANULADO' : null,
        footer: company.footer,
        provisional: c.receiptNumber == null,
      );
}

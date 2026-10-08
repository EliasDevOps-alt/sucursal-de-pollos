import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../counter_field.dart';
import '../format.dart';
import 'signature_pad.dart';
import 'stop_screen.dart' show paymentLabels;
import '../printing/receipt_screen.dart';

const differenceReasons = ['Peso real al entregar', 'El cliente pidió menos', 'Producto dañado', 'Faltó en el vehículo'];

class _Line {
  _Line(this.item) : kg = TextEditingController(text: _fmt(item.orderedKg));
  final StopItem item;
  final TextEditingController kg;
  String? reason;
  double get delivered => double.tryParse(kg.text.replaceAll(',', '.')) ?? 0;
  bool get differs => (delivered - item.orderedKg).abs() > 0.0005;
  static String _fmt(double v) => v.toStringAsFixed(3).replaceAll(RegExp(r'\.?0+$'), '').replaceAll('.', ',');
}

/// Registro de la entrega: peso real por producto (con motivo si difiere), cobro, quién recibe y firma.
class DeliveryFormScreen extends StatefulWidget {
  const DeliveryFormScreen({super.key, required this.routeId, required this.stopId});
  final String routeId;
  final String stopId;

  @override
  State<DeliveryFormScreen> createState() => _DeliveryFormScreenState();
}

class _DeliveryFormScreenState extends State<DeliveryFormScreen> {
  late final RouteStop _stop;
  late final List<_Line> _lines;
  Customer? _customer;
  String _payment = 'ALL'; // ALL | PARTIAL | CREDIT
  String _method = 'EFECTIVO';
  final _amount = TextEditingController();
  final _receiver = TextEditingController();
  final _notes = TextEditingController();
  final _signature = SignatureController();
  bool _signing = false;
  int _cratesOut = 0;
  int _cratesIn = 0;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final s = context.read<AppState>();
    _stop = s.routes.firstWhere((r) => r.id == widget.routeId).stops.firstWhere((x) => x.id == widget.stopId);
    _lines = _stop.items.map(_Line.new).toList();
    _customer = s.customers.where((c) => c.id == _stop.customerId).firstOrNull;
    _signature.addListener(() => setState(() {}));
  }

  /// Total estimado con los precios cotizados y el descuento del cliente; el definitivo lo calcula el servidor.
  double get _estimate {
    final gross = _lines.fold<double>(0, (t, l) => t + l.delivered * l.item.unitPrice);
    final discount = (_customer?.discountPercentage ?? 0) / 100;
    return (gross * (1 - discount) * 100).roundToDouble() / 100;
  }

  bool get _creditEnabled => _customer?.creditEnabled ?? false;

  double get _paid => switch (_payment) {
        'CREDIT' => 0,
        'PARTIAL' => double.tryParse(_amount.text.replaceAll(',', '.')) ?? 0,
        _ => _estimate,
      };

  String? get _problem {
    if (_lines.every((l) => l.delivered <= 0)) return 'No se entrega nada: use "No se pudo entregar"';
    if (_lines.any((l) => l.differs && (l.reason == null || l.reason!.trim().isEmpty))) return 'Indique el motivo de cada diferencia de peso';
    if (_payment == 'PARTIAL' && (_paid <= 0 || _paid > _estimate)) return 'El pago parcial debe ser mayor a 0 y menor al total';
    if (_receiver.text.trim().length < 2) return 'Indique quién recibe';
    if (_signature.isEmpty) return 'Falta la firma de quien recibe';
    return null;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final s = context.read<AppState>();
    try {
      final png = await _signature.toPngDataUrl();
      final location = await s.location.current(timeout: const Duration(seconds: 8));
      await s.deliverStop(
        _stop,
        items: [
          for (final l in _lines)
            StopItem(
              productId: l.item.productId,
              productName: l.item.productName,
              orderedKg: l.item.orderedKg,
              unitPrice: l.item.unitPrice,
              deliveredKg: double.parse(l.delivered.toStringAsFixed(3)),
              differenceReason: l.differs ? l.reason : null,
            ),
        ],
        paidAmount: _paid,
        paymentMethod: _paid > 0 ? _method : null,
        receivedByName: _receiver.text,
        signaturePng: png,
        notes: _notes.text,
        location: location,
        cratesDelivered: _cratesOut,
        cratesPickedUp: _cratesIn,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Entrega a ${_stop.customerName} registrada')));
      // El detalle de la parada se reemplaza por el comprobante, listo para imprimir; al volver se ve la lista.
      final route = s.routes.firstWhere((r) => r.id == widget.routeId);
      final stop = route.stops.firstWhere((x) => x.id == widget.stopId);
      Navigator.pop(context); // formulario
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ReceiptScreen(load: (s) => s.deliveryReceipt(route, stop))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo registrar: $e')));
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final creditNeeded = _estimate - _paid;
    final overCredit = _creditEnabled && creditNeeded > (_customer?.creditAvailable ?? 0) + 0.005;
    final problem = _problem;

    return Scaffold(
      appBar: AppBar(title: Text('Entregar a ${_stop.customerName}', overflow: TextOverflow.ellipsis)),
      body: ListView(
        physics: _signing ? const NeverScrollableScrollPhysics() : null,
        padding: const EdgeInsets.all(16),
        children: [
          Text('Peso entregado', style: t.titleMedium),
          const SizedBox(height: 4),
          const Text('Pese lo que entrega. Si no coincide con lo pedido, elija el motivo.'),
          for (final l in _lines) ...[
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: Text('${l.item.productName}\nPedido ${fmtKg(l.item.orderedKg)}')),
              SizedBox(
                width: 120,
                child: TextField(
                  controller: l.kg,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                  decoration: const InputDecoration(suffixText: 'kg', border: OutlineInputBorder(), isDense: true),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ]),
            if (l.differs)
              Wrap(spacing: 6, runSpacing: 4, children: [
                for (final r in differenceReasons)
                  ChoiceChip(label: Text(r), selected: l.reason == r, onSelected: (_) => setState(() => l.reason = r), visualDensity: VisualDensity.compact),
              ]),
          ],
          const Divider(height: 32),
          Row(children: [
            Text('Total estimado', style: t.titleMedium),
            const Spacer(),
            Text(fmtBob(_estimate), style: t.titleLarge),
          ]),
          if ((_customer?.discountPercentage ?? 0) > 0) Text('Incluye descuento de ${_customer!.discountPercentage.toStringAsFixed(0)} % del cliente', style: t.bodySmall),
          Text('El total definitivo lo calcula el sistema; si se cobra de más, queda como saldo a favor del cliente.', style: t.bodySmall),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: [
              const ButtonSegment(value: 'ALL', label: Text('Pagó todo')),
              ButtonSegment(value: 'PARTIAL', label: const Text('Parcial'), enabled: _creditEnabled),
              ButtonSegment(value: 'CREDIT', label: const Text('Crédito'), enabled: _creditEnabled),
            ],
            selected: {_payment},
            onSelectionChanged: (v) => setState(() => _payment = v.first),
          ),
          if (!_creditEnabled) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Cliente sin crédito: debe pagar al recibir.', style: t.bodySmall)),
          if (_payment == 'PARTIAL')
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Monto recibido', prefixText: 'Bs ', border: OutlineInputBorder()),
                onChanged: (_) => setState(() {}),
              ),
            ),
          if (_paid > 0) ...[
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              for (final e in paymentLabels.entries) ChoiceChip(label: Text(e.value), selected: _method == e.key, onSelected: (_) => setState(() => _method = e.key)),
            ]),
          ],
          if (overCredit)
            Card(
              color: Colors.orange.shade50,
              margin: const EdgeInsets.only(top: 12),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'Quedan ${fmtBob(creditNeeded)} a crédito y el cliente tiene ${fmtBob(_customer!.creditAvailable)} disponibles. '
                  'Si no lo autorizaron al planificar, la entrega quedará marcada para revisión de Administración.',
                  style: const TextStyle(color: Colors.black87),
                ),
              ),
            ),
          const Divider(height: 32),
          CounterField(label: 'Canastillos que deja', hint: 'llenos, quedan con el cliente', value: _cratesOut, onChanged: (v) => setState(() => _cratesOut = v)),
          const SizedBox(height: 8),
          CounterField(
            label: 'Canastillos vacíos que recoge',
            hint: (_customer?.cratesHeld ?? 0) > 0 ? 'Tiene ${_customer!.cratesHeld} registrados' : null,
            value: _cratesIn,
            onChanged: (v) => setState(() => _cratesIn = v),
          ),
          const Divider(height: 32),
          TextField(controller: _receiver, decoration: const InputDecoration(labelText: 'Quién recibe', border: OutlineInputBorder()), textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {})),
          const SizedBox(height: 12),
          Row(children: [
            Text('Firma', style: t.titleMedium),
            const Spacer(),
            TextButton.icon(onPressed: _signature.isEmpty ? null : _signature.clear, icon: const Icon(Icons.refresh), label: const Text('Borrar')),
          ]),
          SignaturePad(controller: _signature, onDrawing: (v) => setState(() => _signing = v)),
          const SizedBox(height: 12),
          TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Observaciones (opcional)', border: OutlineInputBorder()), maxLines: 2),
          const SizedBox(height: 16),
          if (problem != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(problem, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          FilledButton.icon(
            onPressed: problem != null || _saving ? null : _save,
            icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check),
            label: const Text('Confirmar entrega'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
        ],
      ),
    );
  }
}

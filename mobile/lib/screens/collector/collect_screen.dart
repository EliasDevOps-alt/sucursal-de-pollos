import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../counter_field.dart';
import '../driver/signature_pad.dart';
import '../format.dart';
import 'collector_home_screen.dart' show methodLabels;
import '../printing/receipt_screen.dart';

/// Cobro a un cliente: monto, método, canastillos que devuelve, quién paga y su firma.
class CollectScreen extends StatefulWidget {
  const CollectScreen({super.key, required this.customerId});
  final String customerId;

  @override
  State<CollectScreen> createState() => _CollectScreenState();
}

class _CollectScreenState extends State<CollectScreen> {
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _payer = TextEditingController();
  final _notes = TextEditingController();
  final _signature = SignatureController();
  String _method = 'EFECTIVO';
  int _crates = 0;
  bool _signing = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _signature.addListener(() => setState(() {}));
  }

  double get _value => double.tryParse(_amount.text.replaceAll(',', '.')) ?? 0;

  Future<void> _open(Uri uri) async {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No hay una aplicación para abrir esto')));
    }
  }

  String? _problem(Customer c) {
    if (_value <= 0 && _crates == 0) return 'Indique el monto cobrado o los canastillos que devuelve';
    if (_value > 0 && _method != 'EFECTIVO' && _reference.text.trim().isEmpty) return 'Indique el número de la transacción';
    if (_value <= 0) return null; // solo canastillos: no hace falta firma
    if (_payer.text.trim().length < 2) return 'Indique quién paga';
    if (_signature.isEmpty) return 'Falta la firma';
    return null;
  }

  Future<void> _save(Customer c) async {
    setState(() => _saving = true);
    final s = context.read<AppState>();
    try {
      final png = await _signature.toPngDataUrl();
      final location = await s.location.current(timeout: const Duration(seconds: 8));
      Collection? done;
      if (_value > 0) {
        done = await s.collect(c,
            amount: _value,
            paymentMethod: _method,
            referenceNumber: _reference.text,
            paidByName: _payer.text,
            signaturePng: png,
            notes: _notes.text,
            cratesPickedUp: _crates,
            location: location);
      } else {
        await s.pickupCrates(c, _crates, notes: _notes.text, location: location);
      }
      if (!mounted) return;
      final collection = done;
      if (collection != null) {
        // Recibo listo para imprimir y entregar al cliente.
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ReceiptScreen(load: (s) => s.collectionReceipt(collection))));
      } else {
        Navigator.pop(context);
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_value > 0 ? 'Cobro de ${fmtBob(_value)} a ${c.name} registrado' : '$_crates canastillos recogidos de ${c.name}')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo registrar: $e')));
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final c = s.customers.where((x) => x.id == widget.customerId).firstOrNull;
    if (c == null) return Scaffold(appBar: AppBar(), body: const Center(child: Text('El cliente ya no está en el teléfono.')));
    final t = Theme.of(context).textTheme;
    final addr = c.primaryAddress;
    final problem = _problem(c);
    final advance = _value > c.currentDebt + 0.005;

    return Scaffold(
      appBar: AppBar(title: Text(c.name, overflow: TextOverflow.ellipsis)),
      body: ListView(
        physics: _signing ? const NeverScrollableScrollPhysics() : null,
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.currentDebt >= 0 ? 'Deuda' : 'Saldo a favor', style: t.titleSmall),
                Text(fmtBob(c.currentDebt.abs()), style: t.headlineMedium),
                if (c.debtDays != null) Text('Debe desde hace ${c.debtDays} días'),
                if (c.cratesHeld > 0) Text('Tiene ${c.cratesHeld} canastillos del negocio'),
              ]),
            ),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined),
            title: Text(addr?.address ?? 'Sin dirección'),
            trailing: addr?.latitude == null
                ? null
                : IconButton.filledTonal(
                    tooltip: 'Navegar',
                    icon: const Icon(Icons.directions),
                    onPressed: () => _open(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${addr!.latitude},${addr.longitude}')),
                  ),
          ),
          if (c.phone != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.phone_outlined),
              title: Text(c.phone!),
              trailing: IconButton.filledTonal(tooltip: 'Llamar', icon: const Icon(Icons.call), onPressed: () => _open(Uri(scheme: 'tel', path: c.phone))),
            ),
          const Divider(height: 24),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                decoration: const InputDecoration(labelText: 'Monto cobrado', prefixText: 'Bs ', border: OutlineInputBorder()),
                onChanged: (_) => setState(() {}),
              ),
            ),
            const SizedBox(width: 8),
            if (c.currentDebt > 0)
              OutlinedButton(
                onPressed: () => setState(() => _amount.text = c.currentDebt.toStringAsFixed(2).replaceAll('.', ',')),
                child: const Text('Todo'),
              ),
          ]),
          if (advance && _value > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Supera la deuda: el excedente (${fmtBob(_value - (c.currentDebt > 0 ? c.currentDebt : 0))}) queda como saldo a favor.', style: t.bodySmall),
            ),
          const SizedBox(height: 12),
          Wrap(spacing: 8, children: [
            for (final e in methodLabels.entries) ChoiceChip(label: Text(e.value), selected: _method == e.key, onSelected: (_) => setState(() => _method = e.key)),
          ]),
          if (_method != 'EFECTIVO')
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: TextField(controller: _reference, decoration: const InputDecoration(labelText: 'N.º de transacción', border: OutlineInputBorder()), onChanged: (_) => setState(() {})),
            ),
          const SizedBox(height: 16),
          CounterField(
            label: 'Canastillos que devuelve',
            hint: c.cratesHeld > 0 ? 'Tiene ${c.cratesHeld} registrados' : null,
            value: _crates,
            onChanged: (v) => setState(() => _crates = v),
          ),
          const Divider(height: 32),
          TextField(controller: _payer, decoration: const InputDecoration(labelText: 'Quién paga', border: OutlineInputBorder()), textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {})),
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
            onPressed: problem != null || _saving ? null : () => _save(c),
            icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check),
            label: Text(_value > 0 ? 'Registrar cobro de ${fmtBob(_value)}' : _crates > 0 ? 'Registrar $_crates canastillos recogidos' : 'Registrar cobro'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
        ],
      ),
    );
  }
}

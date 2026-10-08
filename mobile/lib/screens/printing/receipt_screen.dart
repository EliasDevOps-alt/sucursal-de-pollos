import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../printing/receipt_doc.dart';
import '../../state/app_state.dart';
import 'printer_settings_screen.dart';

/// Vista previa del comprobante y botón para imprimirlo en la térmica por Bluetooth.
class ReceiptScreen extends StatefulWidget {
  const ReceiptScreen({super.key, required this.load});
  final Future<ReceiptDoc> Function(AppState s) load;

  @override
  State<ReceiptScreen> createState() => _ReceiptScreenState();
}

class _ReceiptScreenState extends State<ReceiptScreen> {
  late Future<ReceiptDoc> _doc;
  bool _printing = false;
  int _printed = 0;

  @override
  void initState() {
    super.initState();
    final s = context.read<AppState>();
    _doc = widget.load(s).then((d) async {
      final n = await s.printCount(d);
      if (mounted) setState(() => _printed = n);
      return d;
    });
  }

  Future<void> _print(ReceiptDoc d) async {
    final s = context.read<AppState>();
    if (!s.printer.configured) {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => const PrinterSettingsScreen()));
      if (!s.printer.configured || !mounted) return;
    }
    setState(() => _printing = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final label = await s.printReceipt(d);
      if (!mounted) return;
      setState(() => _printed++);
      messenger.showSnackBar(SnackBar(content: Text('Impreso ($label)')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('No se pudo imprimir: $e')));
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final printer = context.watch<AppState>().printer;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Comprobante'),
        actions: [
          IconButton(
            tooltip: 'Impresora',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrinterSettingsScreen())).then((_) => setState(() {})),
          ),
        ],
      ),
      body: FutureBuilder<ReceiptDoc>(
        future: _doc,
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('No se pudo armar el comprobante: ${snap.error}')));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final d = snap.data!;
          return Column(
            children: [
              Expanded(
                child: Container(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (d.provisional)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text('Todavía no se sincronizó: el número de venta o de recibo lo asigna el servidor.',
                              style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
                        ),
                      Center(child: ReceiptTicket(doc: d, copyLabel: _printed == 0 ? null : 'COPIA $_printed')),
                    ],
                  ),
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        printer.configured ? '${printer.device!.name} · papel de ${printer.paper.mm} mm' : 'Todavía no eligió la impresora',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 8),
                      FilledButton.icon(
                        onPressed: _printing ? null : () => _print(d),
                        icon: _printing ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.print),
                        label: Text(_printed == 0 ? 'Imprimir' : 'Reimprimir (copia $_printed)'),
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Dibujo del ticket (igual a lo que sale en papel y a la versión web).
class ReceiptTicket extends StatelessWidget {
  const ReceiptTicket({super.key, required this.doc, this.copyLabel});
  final ReceiptDoc doc;
  final String? copyLabel;

  static const _ink = Colors.black;
  static const _base = TextStyle(fontFamily: 'monospace', fontSize: 12.5, height: 1.35, color: _ink);
  static final _bold = _base.copyWith(fontWeight: FontWeight.w700);

  Widget _center(String text, {TextStyle? style}) => Text(text, textAlign: TextAlign.center, style: style ?? _base);

  Widget _row(String label, String value, {bool strong = false}) {
    final st = strong ? _bold.copyWith(fontSize: 14.5) : _base;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: st),
      const SizedBox(width: 8),
      Expanded(child: Text(value, textAlign: TextAlign.right, style: st)),
    ]);
  }

  Widget get _rule => const Padding(
        padding: EdgeInsets.symmetric(vertical: 4),
        child: Text('- - - - - - - - - - - - - - - - - - - - - - - - - -', maxLines: 1, overflow: TextOverflow.clip, softWrap: false, style: _base),
      );

  @override
  Widget build(BuildContext context) {
    final c = doc.company;
    final sig = doc.signature;
    return Container(
      width: 320,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 4, offset: const Offset(0, 1))]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _center(c.name, style: _bold.copyWith(fontSize: 15)),
          if (c.nit.isNotEmpty) _center('NIT ${c.nit}'),
          if (c.address.isNotEmpty) _center(c.address),
          if (c.phone.isNotEmpty) _center('Tel. ${c.phone}'),
          _rule,
          _center(doc.title, style: _bold),
          _center('N.º ${doc.number}'),
          _center(doc.issuedAt),
          if (copyLabel != null) _center(copyLabel!, style: _bold),
          if (doc.notice != null) _center('*** ${doc.notice} ***', style: _bold),
          _rule,
          for (final m in doc.meta) _row('${m.label}:', m.value),
          if (doc.items.isNotEmpty) _rule,
          for (final i in doc.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                i.amount != null ? _row(i.description, i.amount!, strong: false) : Text(i.description, style: _bold),
                if (i.detail != null) Text(i.detail!, style: _base.copyWith(fontSize: 11)),
              ]),
            ),
          if (doc.totals.isNotEmpty) _rule,
          for (final t in doc.totals) _row(t.label, t.value, strong: t.strong),
          if (doc.extra.isNotEmpty) _rule,
          for (final e in doc.extra) _row('${e.label}:', e.value),
          if (sig != null || doc.signatureLabel != null) ...[
            const SizedBox(height: 10),
            if (sig != null && sig.contains(','))
              Image.memory(base64Decode(sig.substring(sig.indexOf(',') + 1)), height: 90, fit: BoxFit.contain, errorBuilder: (_, _, _) => const SizedBox(height: 60))
            else
              const SizedBox(height: 60),
            const Divider(color: _ink, thickness: 1, indent: 24, endIndent: 24, height: 8),
            _center(doc.signatureLabel ?? 'Firma', style: _base.copyWith(fontSize: 11)),
          ],
          if (doc.footer.isNotEmpty) ...[const SizedBox(height: 8), _center(doc.footer)],
        ],
      ),
    );
  }
}

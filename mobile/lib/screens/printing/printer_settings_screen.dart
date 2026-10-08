import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../printing/escpos.dart';
import '../../printing/printer_service.dart';
import '../../state/app_state.dart';

/// Elegir la impresora térmica (vinculada antes en los ajustes de Bluetooth del teléfono) y el ancho del papel.
class PrinterSettingsScreen extends StatefulWidget {
  const PrinterSettingsScreen({super.key});

  @override
  State<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends State<PrinterSettingsScreen> {
  List<PrinterDevice>? _devices;
  String? _error;
  bool _testing = false;

  PrinterService get _printer => context.read<AppState>().printer;

  @override
  void initState() {
    super.initState();
    _scan();
  }

  Future<void> _scan() async {
    setState(() {
      _devices = null;
      _error = null;
    });
    try {
      final list = await _printer.transport.paired();
      if (mounted) setState(() => _devices = list);
    } catch (e) {
      if (mounted) {
        setState(() {
          _devices = [];
          _error = e.toString();
        });
      }
    }
  }

  Future<void> _choose(PrinterDevice? d, PaperWidth w) async {
    await _printer.choose(d, w);
    if (mounted) setState(() {});
  }

  Future<void> _test() async {
    setState(() => _testing = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _printer.print(_printer.testPage());
      messenger.showSnackBar(const SnackBar(content: Text('Página de prueba enviada')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('No se pudo imprimir: $e')));
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _printer;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Impresora'), actions: [IconButton(tooltip: 'Buscar de nuevo', icon: const Icon(Icons.refresh), onPressed: _scan)]),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Ancho del papel', style: t.titleSmall),
          const SizedBox(height: 8),
          SegmentedButton<PaperWidth>(
            segments: const [
              ButtonSegment(value: PaperWidth.mm58, label: Text('58 mm')),
              ButtonSegment(value: PaperWidth.mm80, label: Text('80 mm')),
            ],
            selected: {p.paper},
            onSelectionChanged: (v) => _choose(p.device, v.first),
          ),
          const SizedBox(height: 20),
          Text('Impresoras vinculadas', style: t.titleSmall),
          Text('Si no aparece, vincúlela primero en los ajustes de Bluetooth del teléfono (PIN habitual: 0000 o 1234).', style: t.bodySmall),
          const SizedBox(height: 8),
          if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_devices == null)
            const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
          else if (_devices!.isEmpty && _error == null)
            const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('No hay dispositivos vinculados.'))
          else
            RadioGroup<String>(
              groupValue: p.device?.address,
              onChanged: (address) => _choose(_devices!.firstWhere((d) => d.address == address), p.paper),
              child: Column(children: [
                for (final d in _devices!)
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    value: d.address,
                    title: Text(d.name.isEmpty ? 'Sin nombre' : d.name),
                    subtitle: Text(d.address),
                  ),
              ]),
            ),
          if (p.device != null && !(_devices ?? []).any((d) => d.address == p.device!.address))
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.print_outlined),
              title: Text(p.device!.name),
              subtitle: const Text('Elegida (no aparece entre las vinculadas)'),
            ),
          const SizedBox(height: 16),
          FilledButton.tonalIcon(
            onPressed: p.device == null || _testing ? null : _test,
            icon: const Icon(Icons.receipt_long_outlined),
            label: const Text('Imprimir página de prueba'),
          ),
          if (p.device != null)
            TextButton(onPressed: () => _choose(null, p.paper), child: const Text('Olvidar esta impresora')),
        ],
      ),
    );
  }
}

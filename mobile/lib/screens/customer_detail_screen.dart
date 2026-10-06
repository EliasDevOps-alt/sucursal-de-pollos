import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/workspace.dart';
import '../state/app_state.dart';
import 'format.dart';
import 'presale_form_screen.dart';

const visitOutcomes = {
  'NO_ORDER': ('Atendió, sin pedido', Icons.do_not_disturb_on_outlined),
  'CLOSED': ('Local cerrado', Icons.lock_clock),
  'NOT_FOUND': ('No estaba el responsable', Icons.person_off_outlined),
};

/// Ficha del cliente en la app: direcciones, visita y nuevo pedido.
class CustomerDetailScreen extends StatelessWidget {
  const CustomerDetailScreen({super.key, required this.customerId});
  final String customerId;

  Future<void> _addAddress(BuildContext context, Customer c) async {
    final s = context.read<AppState>();
    final label = TextEditingController(text: 'Depósito');
    final address = TextEditingController();
    GeoPoint? location;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Dirección adicional'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: label, decoration: const InputDecoration(labelText: 'Etiqueta')),
            TextField(controller: address, decoration: const InputDecoration(labelText: 'Dirección')),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () async {
                final p = await s.location.current();
                setState(() => location = p);
              },
              icon: Icon(location == null ? Icons.my_location : Icons.location_on, color: location == null ? null : Colors.green.shade700),
              label: Text(location == null ? 'Tomar ubicación GPS aquí' : '${location!.latitude.toStringAsFixed(5)}, ${location!.longitude.toStringAsFixed(5)}'),
            ),
            const SizedBox(height: 4),
            const Text('La dirección principal no cambia: esta se agrega como adicional.', style: TextStyle(fontSize: 12)),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, label.text.trim().isNotEmpty && address.text.trim().isNotEmpty), child: const Text('Guardar')),
          ],
        ),
      ),
    );
    if (ok == true && context.mounted) {
      await s.addAddress(c, label: label.text, address: address.text, location: location);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Dirección guardada')));
    }
  }

  Future<void> _visit(BuildContext context, Customer c) async {
    final s = context.read<AppState>();
    final notes = TextEditingController();
    String? outcome;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Registrar visita sin pedido'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final e in visitOutcomes.entries)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(e.value.$2),
                title: Text(e.value.$1),
                trailing: outcome == e.key ? const Icon(Icons.check_circle) : const Icon(Icons.circle_outlined),
                onTap: () => setState(() => outcome = e.key),
              ),
            TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observación (opcional)')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: outcome == null ? null : () => Navigator.pop(ctx, true), child: const Text('Registrar')),
          ],
        ),
      ),
    );
    if (ok == true && context.mounted) {
      final location = await s.location.current(timeout: const Duration(seconds: 8));
      await s.recordVisit(c, outcome: outcome!, notes: notes.text, location: location);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Visita registrada')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final c = s.customers.where((x) => x.id == customerId).firstOrNull;
    if (c == null) return Scaffold(appBar: AppBar(), body: const Center(child: Text('Cliente no encontrado en el teléfono.')));
    final orders = s.presales.where((p) => p.customerId == c.id).take(5).toList();

    return Scaffold(
      appBar: AppBar(title: Text(c.name, overflow: TextOverflow.ellipsis)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(spacing: 8, runSpacing: 8, children: [
            Chip(label: Text(c.code ?? 'Nuevo (sin enviar)')),
            if (c.rank != null) Chip(label: Text('Rango ${c.rank} · ${c.discountPercentage.toStringAsFixed(0)} % desc.')),
            Chip(label: Text(c.creditEnabled ? 'Crédito disp. ${fmtBob(c.creditAvailable)}' : 'Sin crédito')),
            if (c.currentDebt > 0) Chip(label: Text('Debe ${fmtBob(c.currentDebt)}')),
          ]),
          if (c.phone != null) ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.phone), title: Text(c.phone!)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PresaleFormScreen(initialCustomer: c))),
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('Nuevo pedido'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(onPressed: () => _visit(context, c), icon: const Icon(Icons.how_to_reg_outlined), label: const Text('Visita sin pedido')),
            ),
          ]),
          const SizedBox(height: 16),
          Row(children: [
            Text('Direcciones', style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            TextButton.icon(onPressed: () => _addAddress(context, c), icon: const Icon(Icons.add_location_alt_outlined), label: const Text('Agregar')),
          ]),
          if (c.addresses.isEmpty) const Text('Sin direcciones registradas.'),
          for (final a in c.addresses)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(a.latitude != null ? Icons.location_on : Icons.location_off_outlined),
              title: Text(a.label + (a.isPrimary ? ' · principal' : '')),
              subtitle: Text(a.address),
            ),
          if (orders.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Últimos pedidos', style: Theme.of(context).textTheme.titleMedium),
            for (final p in orders)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(p.number ?? 'Sin enviar'),
                subtitle: Text(fmtDateTime(p.createdAt)),
                trailing: Text(fmtBob(p.quotedTotal)),
              ),
          ],
        ],
      ),
    );
  }
}

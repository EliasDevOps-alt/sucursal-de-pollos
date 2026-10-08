import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../format.dart';
import 'delivery_form_screen.dart';
import 'driver_home_screen.dart' show stopBadge;
import '../printing/receipt_screen.dart';

const problemLabels = {
  'CLOSED': 'Local cerrado',
  'NOT_FOUND': 'No se encontró al cliente',
  'REJECTED': 'Rechazó el pedido',
  'NO_PAYMENT': 'No tenía con qué pagar',
  'WRONG_ADDRESS': 'Dirección incorrecta',
  'DAMAGED': 'Producto dañado',
  'NOT_VISITED': 'No se visitó',
  'OTHER': 'Otro',
};

const paymentLabels = {'EFECTIVO': 'Efectivo', 'QR': 'QR', 'TRANSFERENCIA': 'Transferencia'};

class StopScreen extends StatelessWidget {
  const StopScreen({super.key, required this.routeId, required this.stopId});
  final String routeId;
  final String stopId;

  Future<void> _open(BuildContext context, Uri uri) async {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No hay una aplicación para abrir esto')));
    }
  }

  Future<void> _fail(BuildContext context, RouteStop stop) async {
    final result = await showModalBottomSheet<({String type, String notes})>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _FailSheet(),
    );
    if (result == null || !context.mounted) return;
    final s = context.read<AppState>();
    final location = await s.location.current(timeout: const Duration(seconds: 8));
    await s.failStop(stop, problemType: result.type, notes: result.notes, location: location);
    if (context.mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final route = s.routes.where((r) => r.id == routeId).firstOrNull;
    final stop = route?.stops.where((x) => x.id == stopId).firstOrNull;
    if (route == null || stop == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: Text('La parada ya no está en el teléfono.')));
    }
    final badge = stopBadge(context, stop);
    final addr = stop.address;
    final canRegister = route.inProgress && stop.isPending;

    return Scaffold(
      appBar: AppBar(title: Text('Parada ${stop.sequence} de ${route.stops.length}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(stop.customerName, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Row(children: [
            Icon(badge.icon, color: badge.color, size: 18),
            const SizedBox(width: 6),
            Text(badge.label, style: TextStyle(color: badge.color, fontWeight: FontWeight.bold)),
          ]),
          if (stop.error != null)
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text('El servidor respondió: ${stop.error}\nRevise en "Estado y cuenta" para descartarla y registrarla de nuevo.'),
              ),
            ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined),
            title: Text(addr?.address ?? 'Sin dirección'),
            subtitle: addr == null ? null : Text(addr.label),
            trailing: addr?.latitude == null
                ? null
                : IconButton.filledTonal(
                    tooltip: 'Navegar',
                    icon: const Icon(Icons.directions),
                    onPressed: () => _open(context, Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${addr!.latitude},${addr.longitude}')),
                  ),
          ),
          if (stop.customerPhone != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.phone_outlined),
              title: Text(stop.customerPhone!),
              trailing: IconButton.filledTonal(tooltip: 'Llamar', icon: const Icon(Icons.call), onPressed: () => _open(context, Uri(scheme: 'tel', path: stop.customerPhone))),
            ),
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.receipt_long_outlined), title: Text('Pedido ${stop.presaleNumber}'), subtitle: Text(fmtBob(stop.presaleTotal))),
          const Divider(),
          Text('Productos', style: Theme.of(context).textTheme.titleMedium),
          for (final i in stop.items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(i.productName),
              subtitle: i.differenceReason != null ? Text(i.differenceReason!) : null,
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('Pedido ${fmtKg(i.orderedKg)}'),
                  if (i.deliveredKg != null) Text('Entregado ${fmtKg(i.deliveredKg!)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          if (!stop.isPending) ...[
            const Divider(),
            if (stop.status == 'FAILED')
              ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.report_outlined), title: Text(problemLabels[stop.problemType] ?? 'No entregado'), subtitle: stop.notes != null ? Text(stop.notes!) : null)
            else ...[
              ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.person_outline), title: Text('Recibió ${stop.receivedByName ?? ''}'), subtitle: Text(stop.signed ? 'Con firma' : 'Sin firma')),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.payments_outlined),
                title: Text(stop.paidAmount > 0 ? 'Cobrado ${fmtBob(stop.paidAmount)} · ${paymentLabels[stop.paymentMethod] ?? ''}' : 'A crédito'),
                subtitle: stop.saleNumber != null ? Text('Venta ${stop.saleNumber}') : const Text('La venta se genera al sincronizar'),
              ),
              if (stop.notes != null) ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.notes), title: Text(stop.notes!)),
            ],
          ],
          const SizedBox(height: 16),
          if (!stop.isPending) ...[
            OutlinedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReceiptScreen(load: (s) => s.deliveryReceipt(route, stop)))),
              icon: const Icon(Icons.print_outlined),
              label: Text(stop.status == 'FAILED' ? 'Constancia de visita' : 'Comprobante de entrega'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            ),
            const SizedBox(height: 8),
          ],
          if (canRegister) ...[
            FilledButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeliveryFormScreen(routeId: routeId, stopId: stopId))),
              icon: const Icon(Icons.check),
              label: const Text('Entregar'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _fail(context, stop),
              icon: const Icon(Icons.close),
              label: const Text('No se pudo entregar'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            ),
          ] else if (stop.isPending)
            const Text('La ruta no está en curso: no se pueden registrar entregas.'),
        ],
      ),
    );
  }
}

class _FailSheet extends StatefulWidget {
  const _FailSheet();

  @override
  State<_FailSheet> createState() => _FailSheetState();
}

class _FailSheetState extends State<_FailSheet> {
  String? _type;
  final _notes = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final needsNotes = _type == 'OTHER';
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('¿Por qué no se pudo entregar?', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final e in problemLabels.entries.where((e) => e.key != 'NOT_VISITED'))
                ChoiceChip(label: Text(e.value), selected: _type == e.key, onSelected: (_) => setState(() => _type = e.key)),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            decoration: InputDecoration(labelText: needsNotes ? 'Describa el problema' : 'Detalle (opcional)', border: const OutlineInputBorder()),
            maxLines: 2,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _type == null || (needsNotes && _notes.text.trim().isEmpty) ? null : () => Navigator.pop(context, (type: _type!, notes: _notes.text.trim())),
            child: const Text('Registrar'),
          ),
        ],
      ),
    );
  }
}

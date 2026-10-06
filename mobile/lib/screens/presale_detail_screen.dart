import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../state/app_state.dart';
import 'format.dart';

class PresaleDetailScreen extends StatelessWidget {
  const PresaleDetailScreen({super.key, required this.presaleId});
  final String presaleId;

  Future<void> _cancel(BuildContext context, Presale p) async {
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar pedido'),
        content: TextField(controller: reason, autofocus: true, decoration: const InputDecoration(labelText: 'Motivo')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.pop(ctx, reason.text.trim().isNotEmpty), child: const Text('Cancelar pedido')),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      await context.read<AppState>().cancelPresale(p, reason.text.trim());
      if (context.mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final p = s.presales.where((x) => x.id == presaleId).firstOrNull;
    if (p == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: Text('El pedido ya no existe en el teléfono.')));
    }
    final waiting = s.outbox.any((o) => (o.type == 'PRESALE_CREATE' && o.payload['id'] == p.id) || (o.type == 'PRESALE_CANCEL' && o.payload['presaleId'] == p.id));
    final badge = presaleBadge(context, p.status, p.syncState == SyncState.error, waiting);

    return Scaffold(
      appBar: AppBar(title: Text(p.number ?? 'Pedido sin enviar')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            Icon(badge.icon, color: badge.color),
            const SizedBox(width: 8),
            Text(badge.label, style: TextStyle(color: badge.color, fontWeight: FontWeight.bold)),
            if (p.status == 'CANCEL_PENDING') const Text('  (cancelación por enviar)'),
          ]),
          if (p.error != null)
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(padding: const EdgeInsets.all(12), child: Text('El servidor respondió: ${p.error}')),
            ),
          if (p.saleNumber != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Atendido con la venta ${p.saleNumber}')),
          if (p.cancelReason != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Motivo de cancelación: ${p.cancelReason}')),
          const SizedBox(height: 12),
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.storefront), title: Text(p.customerName)),
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.schedule), title: Text('Tomado ${fmtDateTime(p.createdAt)}')),
          if (p.scheduledDeliveryDate != null)
            ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.event), title: Text('Entrega ${fmtDate(p.scheduledDeliveryDate!)}')),
          if (p.notes != null) ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.notes), title: Text(p.notes!)),
          const Divider(),
          for (final i in p.items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(i.productName),
              subtitle: Text('${fmtKg(i.weightKg)}${i.quantity != null ? ' · ${i.quantity} u.' : ''} × ${fmtBob(i.unitPrice)}/kg'),
              trailing: Text(fmtBob(i.subtotal)),
            ),
          const Divider(),
          Row(children: [const Text('Total cotizado'), const Spacer(), Text(fmtBob(p.quotedTotal), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18))]),
          const SizedBox(height: 24),
          if (p.canCancel && !waiting)
            OutlinedButton.icon(
              onPressed: () => _cancel(context, p),
              icon: const Icon(Icons.block),
              label: const Text('Cancelar pedido'),
            ),
          if (p.status == 'LOCAL')
            OutlinedButton.icon(
              onPressed: () => _cancel(context, p),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Descartar (aún no se envió)'),
            ),
        ],
      ),
    );
  }
}

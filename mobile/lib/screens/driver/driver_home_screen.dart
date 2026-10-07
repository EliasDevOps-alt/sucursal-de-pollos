import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../format.dart';
import '../home_screen.dart' show SyncBanner;
import '../sync_screen.dart';
import 'stop_screen.dart';

const routeStatusLabels = {'PLANNED': 'Planificada', 'IN_PROGRESS': 'En ruta', 'COMPLETED': 'Liquidada'};

/// Estado visible de una parada, combinando el registrado con el de la cola de salida.
({String label, Color color, IconData icon}) stopBadge(BuildContext context, RouteStop s) {
  final cs = Theme.of(context).colorScheme;
  if (s.syncState == SyncState.error) return (label: 'Rechazada', color: cs.error, icon: Icons.error_outline);
  final base = switch (s.status) {
    'DELIVERED' => (label: 'Entregado', color: Colors.green.shade700, icon: Icons.check_circle),
    'PARTIAL' => (label: 'Con diferencias', color: Colors.orange.shade800, icon: Icons.check_circle_outline),
    'FAILED' => (label: 'No entregado', color: cs.error, icon: Icons.cancel_outlined),
    _ => (label: 'Pendiente', color: cs.outline, icon: Icons.radio_button_unchecked),
  };
  if (s.syncState == SyncState.pending) return (label: '${base.label} · sin enviar', color: base.color, icon: Icons.cloud_upload_outlined);
  return base;
}

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  String? _routeId;

  Future<void> _sync() async {
    final s = context.read<AppState>();
    final report = await s.sync();
    if (!mounted) return;
    final msg = !s.online
        ? 'Sin conexión: las entregas quedan guardadas en el teléfono'
        : report == null
            ? (s.lastSyncError ?? 'No se pudo sincronizar')
            : report.failed > 0
                ? '${report.synced} enviadas, ${report.failed} rechazadas'
                : 'Sincronizado';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    // Primero la ruta en curso, luego las planificadas y al final las liquidadas.
    const order = {'IN_PROGRESS': 0, 'PLANNED': 1, 'COMPLETED': 2};
    final routes = [...s.routes]..sort((a, b) => (order[a.status] ?? 3).compareTo(order[b.status] ?? 3));
    final route = routes.where((r) => r.id == _routeId).firstOrNull ?? routes.firstOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis entregas'),
        actions: [
          IconButton(
            tooltip: 'Sincronizar',
            onPressed: s.syncing ? null : _sync,
            icon: s.syncing ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.sync),
          ),
          IconButton(
            tooltip: 'Estado y cuenta',
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncScreen())),
            icon: const Icon(Icons.account_circle_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          const SyncBanner(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _sync,
              child: route == null
                  ? ListView(children: const [
                      SizedBox(height: 120),
                      Icon(Icons.local_shipping_outlined, size: 48),
                      SizedBox(height: 8),
                      Center(child: Text('No tiene rutas asignadas.\nDeslice hacia abajo para actualizar.', textAlign: TextAlign.center)),
                    ])
                  : ListView(
                      padding: const EdgeInsets.only(bottom: 24),
                      children: [
                        if (routes.length > 1)
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                            child: Row(children: [
                              for (final r in routes)
                                Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                    label: Text('${r.number} · ${routeStatusLabels[r.status] ?? r.status}'),
                                    selected: r.id == route.id,
                                    onSelected: (_) => setState(() => _routeId = r.id),
                                  ),
                                ),
                            ]),
                          ),
                        _RouteHeader(route: route),
                        if (route.status == 'PLANNED')
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                            child: Text('La ruta todavía no fue despachada: podrá registrar entregas cuando el almacén cargue el vehículo.'),
                          ),
                        for (final stop in route.stops) _StopTile(route: route, stop: stop),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteHeader extends StatelessWidget {
  const _RouteHeader({required this.route});
  final DeliveryRoute route;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final total = route.stops.length;
    return Card(
      margin: const EdgeInsets.all(12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text('Ruta ${route.number}', style: t.titleLarge)),
              Chip(label: Text(routeStatusLabels[route.status] ?? route.status), visualDensity: VisualDensity.compact),
            ]),
            Text('${fmtDate(route.date)} · ${route.vehiclePlate} · ${route.vehicleDescription}', style: t.bodyMedium),
            if (route.notes != null) Text(route.notes!, style: t.bodySmall),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: total == 0 ? 0 : route.resolved / total, minHeight: 6, borderRadius: BorderRadius.circular(3)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: Text('${route.resolved} de $total paradas registradas')),
              Text('Cobrado ${fmtBob(route.collected)}', style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ],
        ),
      ),
    );
  }
}

class _StopTile extends StatelessWidget {
  const _StopTile({required this.route, required this.stop});
  final DeliveryRoute route;
  final RouteStop stop;

  @override
  Widget build(BuildContext context) {
    final badge = stopBadge(context, stop);
    final cs = Theme.of(context).colorScheme;
    return ListTile(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StopScreen(routeId: route.id, stopId: stop.id))),
      leading: CircleAvatar(
        backgroundColor: stop.isPending ? cs.surfaceContainerHighest : badge.color,
        foregroundColor: stop.isPending ? cs.onSurface : Colors.white,
        child: Text('${stop.sequence}'),
      ),
      title: Text(stop.customerName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(stop.address?.address ?? 'Sin dirección', maxLines: 1, overflow: TextOverflow.ellipsis),
          Text('${fmtKg(stop.orderedKg)} · ${fmtBob(stop.presaleTotal)}'),
          Text(badge.label, style: TextStyle(color: badge.color, fontWeight: FontWeight.w600)),
        ],
      ),
      isThreeLine: true,
      trailing: Icon(badge.icon, color: badge.color),
    );
  }
}

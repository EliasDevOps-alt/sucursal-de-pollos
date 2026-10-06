import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../state/app_state.dart';
import 'customer_form_screen.dart';
import 'format.dart';
import 'presale_detail_screen.dart';
import 'presale_form_screen.dart';
import 'sync_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  Future<void> _manualSync() async {
    final s = context.read<AppState>();
    final report = await s.sync();
    if (!mounted) return;
    final msg = !s.online
        ? 'Sin conexión: los datos quedan guardados en el teléfono'
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
    return Scaffold(
      appBar: AppBar(
        title: Text(_tab == 0 ? 'Mis pedidos' : 'Clientes'),
        actions: [
          IconButton(
            tooltip: 'Sincronizar',
            onPressed: s.syncing ? null : _manualSync,
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
          Expanded(child: IndexedStack(index: _tab, children: [PresalesTab(onRefresh: _manualSync), CustomersTab(onRefresh: _manualSync)])),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => _tab == 0 ? const PresaleFormScreen() : const CustomerFormScreen()),
        ),
        icon: Icon(_tab == 0 ? Icons.add_shopping_cart : Icons.person_add_alt),
        label: Text(_tab == 0 ? 'Nuevo pedido' : 'Nuevo cliente'),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Pedidos'),
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Clientes'),
        ],
      ),
    );
  }
}

/// Franja de estado: conexión, operaciones sin enviar y última sincronización.
class SyncBanner extends StatelessWidget {
  const SyncBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final cs = Theme.of(context).colorScheme;
    final (icon, color, text) = !s.online
        ? (Icons.cloud_off, Colors.orange.shade800, 'Sin conexión · ${s.pendingCount} sin enviar')
        : s.rejectedCount > 0
            ? (Icons.error_outline, cs.error, '${s.rejectedCount} operación(es) rechazada(s) · tocar para revisar')
            : s.pendingCount > 0
                ? (Icons.cloud_upload_outlined, Colors.orange.shade800, '${s.pendingCount} sin enviar')
                : (Icons.cloud_done_outlined, Colors.green.shade700, 'Todo enviado');
    final last = s.lastSyncAt == null ? 'nunca' : fmtDateTime(s.lastSyncAt!);
    return Material(
      color: color.withValues(alpha: 0.12),
      child: InkWell(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncScreen())),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Expanded(child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600))),
              Text('Últ. sinc. $last', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class PresalesTab extends StatelessWidget {
  const PresalesTab({super.key, required this.onRefresh});
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final waiting = {
      for (final o in s.outbox)
        if (o.type == 'PRESALE_CREATE') o.payload['id'] as String else if (o.type == 'PRESALE_CANCEL') o.payload['presaleId'] as String,
    };
    if (s.presales.isEmpty) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(children: const [
          SizedBox(height: 120),
          Icon(Icons.receipt_long_outlined, size: 48),
          SizedBox(height: 8),
          Center(child: Text('Todavía no hay pedidos.\nToque "Nuevo pedido" para tomar uno, con o sin señal.', textAlign: TextAlign.center)),
        ]),
      );
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.only(bottom: 96),
        itemCount: s.presales.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) {
          final p = s.presales[i];
          final badge = presaleBadge(context, p.status, p.syncState == SyncState.error, waiting.contains(p.id));
          return ListTile(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PresaleDetailScreen(presaleId: p.id))),
            title: Text(p.customerName, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${p.number ?? 'Sin número aún'} · ${fmtDateTime(p.createdAt)}${p.saleNumber != null ? ' · Venta ${p.saleNumber}' : ''}'),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(fmtBob(p.quotedTotal), style: const TextStyle(fontWeight: FontWeight.w600)),
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(badge.icon, size: 14, color: badge.color),
                  const SizedBox(width: 4),
                  Text(badge.label, style: TextStyle(color: badge.color, fontSize: 12)),
                ]),
              ],
            ),
          );
        },
      ),
    );
  }
}

class CustomersTab extends StatefulWidget {
  const CustomersTab({super.key, required this.onRefresh});
  final Future<void> Function() onRefresh;

  @override
  State<CustomersTab> createState() => _CustomersTabState();
}

class _CustomersTabState extends State<CustomersTab> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final q = _q.toLowerCase();
    final list = s.customers
        .where((c) => q.isEmpty || c.name.toLowerCase().contains(q) || (c.code ?? '').toLowerCase().contains(q) || (c.phone ?? '').contains(q))
        .toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar cliente', border: OutlineInputBorder(), isDense: true),
            onChanged: (v) => setState(() => _q = v),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: widget.onRefresh,
            child: ListView.builder(
              padding: const EdgeInsets.only(bottom: 96),
              itemCount: list.length,
              itemBuilder: (_, i) {
                final c = list[i];
                final addr = c.primaryAddress;
                return ListTile(
                  leading: CircleAvatar(child: Text(c.name.characters.first.toUpperCase())),
                  title: Text(c.name),
                  subtitle: Text([c.code ?? 'Nuevo (sin enviar)', if (addr != null) addr.address, if (c.rank != null) 'Rango ${c.rank}'].join(' · '),
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                  trailing: c.pendingSync
                      ? Icon(Icons.cloud_upload_outlined, color: Colors.orange.shade800)
                      : (addr?.latitude != null ? const Icon(Icons.location_on_outlined) : null),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../format.dart';
import '../home_screen.dart' show SyncBanner;
import '../sync_screen.dart';
import 'collect_screen.dart';

const methodLabels = {'EFECTIVO': 'Efectivo', 'QR': 'QR', 'TRANSFERENCIA': 'Transferencia'};

/// Modo cobrador: clientes por visitar (deuda o canastillos) y lo cobrado.
class CollectorHomeScreen extends StatefulWidget {
  const CollectorHomeScreen({super.key});

  @override
  State<CollectorHomeScreen> createState() => _CollectorHomeScreenState();
}

class _CollectorHomeScreenState extends State<CollectorHomeScreen> {
  int _tab = 0;

  Future<void> _sync() async {
    final s = context.read<AppState>();
    final report = await s.sync();
    if (!mounted) return;
    final msg = !s.online
        ? 'Sin conexión: los cobros quedan guardados en el teléfono'
        : report == null
            ? (s.lastSyncError ?? 'No se pudo sincronizar')
            : report.failed > 0
                ? '${report.synced} enviados, ${report.failed} rechazados'
                : 'Sincronizado';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: Text(_tab == 0 ? 'Por cobrar' : 'Mis cobros'),
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
      body: Column(children: [
        const SyncBanner(),
        Expanded(child: IndexedStack(index: _tab, children: [_PendingTab(onRefresh: _sync), _MyCollectionsTab(onRefresh: _sync)])),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.person_search_outlined), selectedIcon: Icon(Icons.person_search), label: 'Por cobrar'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Mis cobros'),
        ],
      ),
    );
  }
}

class _PendingTab extends StatefulWidget {
  const _PendingTab({required this.onRefresh});
  final Future<void> Function() onRefresh;

  @override
  State<_PendingTab> createState() => _PendingTabState();
}

class _PendingTabState extends State<_PendingTab> {
  String _q = '';
  String _order = 'DEBT'; // DEBT | AGE

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final q = _q.toLowerCase();
    final list = s.customers.where((c) => c.currentDebt > 0.005 || c.cratesHeld > 0).where((c) => q.isEmpty || c.name.toLowerCase().contains(q) || (c.code ?? '').toLowerCase().contains(q)).toList()
      ..sort((a, b) => _order == 'AGE' ? (b.debtDays ?? -1).compareTo(a.debtDays ?? -1) : b.currentDebt.compareTo(a.currentDebt));
    final total = list.fold<double>(0, (t, c) => t + (c.currentDebt > 0 ? c.currentDebt : 0));
    final crates = list.fold<int>(0, (t, c) => t + (c.cratesHeld > 0 ? c.cratesHeld : 0));
    final cs = Theme.of(context).colorScheme;

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar cliente', border: OutlineInputBorder(), isDense: true),
          onChanged: (v) => setState(() => _q = v),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(children: [
          Expanded(child: Text('${list.length} clientes · ${fmtBob(total)} · $crates canastillos', style: Theme.of(context).textTheme.bodySmall)),
          SegmentedButton<String>(
            style: const ButtonStyle(visualDensity: VisualDensity.compact),
            segments: const [ButtonSegment(value: 'DEBT', label: Text('Monto')), ButtonSegment(value: 'AGE', label: Text('Días'))],
            selected: {_order},
            onSelectionChanged: (v) => setState(() => _order = v.first),
          ),
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: widget.onRefresh,
          child: list.isEmpty
              ? ListView(children: const [SizedBox(height: 120), Center(child: Text('Nadie debe ni tiene canastillos por recoger.'))])
              : ListView.separated(
                  padding: const EdgeInsets.only(bottom: 24),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final c = list[i];
                    final days = c.debtDays;
                    final late = (days ?? 0) > 15;
                    return ListTile(
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CollectScreen(customerId: c.id))),
                      title: Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text([
                        c.primaryAddress?.address ?? 'Sin dirección',
                        if (days != null) 'debe hace $days días',
                        if (c.cratesHeld > 0) '${c.cratesHeld} canastillos',
                      ].join(' · '), maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: Text(c.currentDebt > 0.005 ? fmtBob(c.currentDebt) : '—',
                          style: TextStyle(fontWeight: FontWeight.w700, color: late ? cs.error : null)),
                    );
                  },
                ),
        ),
      ),
    ]);
  }
}

class _MyCollectionsTab extends StatelessWidget {
  const _MyCollectionsTab({required this.onRefresh});
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final today = DateTime.now();
    final valid = s.collections.where((c) => c.status == 'VALID' && c.syncState != SyncState.error).toList();
    final ofToday = valid.where((c) => c.collectedAt.year == today.year && c.collectedAt.month == today.month && c.collectedAt.day == today.day).toList();
    final byMethod = <String, double>{};
    for (final c in ofToday) {
      byMethod[c.paymentMethod] = (byMethod[c.paymentMethod] ?? 0) + c.amount;
    }
    final crates = ofToday.fold<int>(0, (t, c) => t + c.cratesPickedUp);
    final t = Theme.of(context).textTheme;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          Card(
            margin: const EdgeInsets.all(12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Cobrado hoy', style: t.titleMedium),
                Text(fmtBob(ofToday.fold<double>(0, (a, c) => a + c.amount)), style: t.headlineMedium),
                const SizedBox(height: 4),
                for (final e in byMethod.entries) Text('${methodLabels[e.key] ?? e.key}: ${fmtBob(e.value)}'),
                Text('${ofToday.length} cobros · $crates canastillos recogidos'),
                const SizedBox(height: 4),
                Text('El efectivo se rinde en caja al final del día.', style: t.bodySmall),
              ]),
            ),
          ),
          if (s.collections.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Todavía no hay cobros.'))),
          for (final c in s.collections)
            ListTile(
              leading: Icon(
                c.syncState == SyncState.error ? Icons.error_outline : c.syncState == SyncState.pending ? Icons.cloud_upload_outlined : Icons.receipt_outlined,
                color: c.syncState == SyncState.error ? Theme.of(context).colorScheme.error : c.syncState == SyncState.pending ? Colors.orange.shade800 : null,
              ),
              title: Text(c.customerName, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text([
                c.receiptNumber ?? (c.syncState == SyncState.error ? 'Rechazado: ${c.error ?? ''}' : 'Sin enviar'),
                fmtDateTime(c.collectedAt),
                methodLabels[c.paymentMethod] ?? c.paymentMethod,
                if (c.isAdvance) 'anticipo',
                if (c.status == 'ANNULLED') 'ANULADO',
              ].join(' · ')),
              trailing: Text(fmtBob(c.amount), style: TextStyle(fontWeight: FontWeight.w600, decoration: c.status == 'ANNULLED' ? TextDecoration.lineThrough : null)),
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'format.dart';
import 'printing/printer_settings_screen.dart';

/// Estado de la sincronización, cola de salida y cuenta.
class SyncScreen extends StatelessWidget {
  const SyncScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Estado y cuenta')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.person),
            title: Text(s.user?.fullName ?? ''),
            subtitle: Text('${s.user?.roleName ?? ''} · ${s.user?.username ?? ''}'),
          ),
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.dns_outlined), title: const Text('Servidor'), subtitle: Text(s.apiUrl)),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(s.online ? Icons.cloud_done_outlined : Icons.cloud_off),
            title: Text(s.online ? 'Con conexión' : 'Sin conexión'),
            subtitle: Text('Última sincronización: ${s.lastSyncAt == null ? 'nunca' : fmtDateTime(s.lastSyncAt!)}'),
          ),
          if (s.isDriver || s.isCollector)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.print_outlined),
              title: const Text('Impresora'),
              subtitle: Text(s.printer.configured ? '${s.printer.device!.name} · ${s.printer.paper.mm} mm' : 'Sin elegir'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrinterSettingsScreen())),
            ),
          if (s.lastSyncError != null) Text(s.lastSyncError!, style: TextStyle(color: cs.error)),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: s.syncing ? null : () => s.sync(),
            icon: const Icon(Icons.sync),
            label: Text(s.syncing ? 'Sincronizando…' : 'Sincronizar ahora'),
          ),
          const SizedBox(height: 24),
          Text('Cola de salida (${s.outbox.length})', style: Theme.of(context).textTheme.titleMedium),
          const Text('Cada operación se envía con su identificador único: si se repite, el servidor no la duplica.', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 8),
          if (s.outbox.isEmpty) const Text('No hay operaciones pendientes.'),
          for (final op in s.outbox)
            Card(
              child: ListTile(
                leading: Icon(op.state == 'pending' ? Icons.schedule : Icons.error_outline, color: op.state == 'pending' ? null : cs.error),
                title: Text(op.label),
                subtitle: Text([
                  fmtDateTime(op.createdAt.toLocal()),
                  if (op.attempts > 0) '${op.attempts} intento(s)',
                  if (op.error != null) op.error!,
                ].join(' · ')),
                trailing: op.state == 'pending'
                    ? null
                    : IconButton(
                        tooltip: 'Descartar',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          final ok = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('Descartar operación'),
                              content: Text('"${op.label}" no se enviará al servidor. ¿Continuar?'),
                              actions: [
                                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
                                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Descartar')),
                              ],
                            ),
                          );
                          if (ok == true) await s.discard(op);
                        },
                      ),
              ),
            ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () async {
              final pending = s.outbox.isNotEmpty;
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Cerrar sesión'),
                  content: Text(pending
                      ? 'Hay ${s.outbox.length} operación(es) sin enviar. Se conservarán en el teléfono hasta que vuelva a ingresar.'
                      : 'Se borrarán los datos descargados en este teléfono.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Volver')),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cerrar sesión')),
                  ],
                ),
              );
              if (ok == true && context.mounted) {
                Navigator.popUntil(context, (r) => r.isFirst);
                await s.logout();
              }
            },
            icon: const Icon(Icons.logout),
            label: const Text('Cerrar sesión'),
          ),
          const SizedBox(height: 8),
          Text('Dispositivo ${s.deviceUuid.substring(0, 8)} · versión $appVersion', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}

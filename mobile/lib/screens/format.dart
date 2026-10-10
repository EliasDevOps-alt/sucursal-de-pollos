import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

// Convención boliviana: "Bs 1.234,50" (igual que el panel web).
final _bob = NumberFormat('#,##0.00', 'es');
final _kg = NumberFormat.decimalPattern('es');

String fmtBob(num v) => 'Bs ${_bob.format(v)}';
String fmtKg(num v) => '${_kg.format(v)} kg';

/// Cantidad pedida: "2 canastillos (44 kg)" si se pidió por canastillo, si no "44 kg".
String fmtOrdered(double kg, int crates) => crates > 0 ? '$crates ${crates == 1 ? 'canastillo' : 'canastillos'} (${fmtKg(kg)})' : fmtKg(kg);
String fmtDateTime(DateTime d) => DateFormat('dd/MM/yy HH:mm', 'es').format(d);
String fmtDate(String isoDate) => DateFormat('EEE dd/MM', 'es').format(DateTime.parse(isoDate));

/// Etiqueta y color del estado de un pedido, combinando el estado del servidor con el de la cola.
({String label, Color color, IconData icon}) presaleBadge(BuildContext context, String status, bool hasError, bool pendingSync) {
  final cs = Theme.of(context).colorScheme;
  if (hasError) return (label: 'Rechazado', color: cs.error, icon: Icons.error_outline);
  if (pendingSync) return (label: 'Sin enviar', color: Colors.orange.shade800, icon: Icons.cloud_upload_outlined);
  return switch (status) {
    'PENDING' || 'CONFIRMED' => (label: 'Enviado', color: Colors.blue.shade700, icon: Icons.cloud_done_outlined),
    'DELIVERED' => (label: 'Atendido', color: Colors.green.shade700, icon: Icons.check_circle_outline),
    'CANCELLED' => (label: 'Cancelado', color: cs.outline, icon: Icons.block),
    'ASSIGNED' => (label: 'En ruta', color: Colors.purple.shade400, icon: Icons.local_shipping_outlined),
    _ => (label: status, color: cs.outline, icon: Icons.help_outline),
  };
}

// Formateo para mostrar. Los cálculos oficiales los hace el servidor con decimales exactos.
const bob = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const unitFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const fmtBob = (v: string | number | null | undefined) => (v == null ? '—' : `Bs ${bob.format(Number(v))}`);
export const fmtKg = (v: string | number | null | undefined) => (v == null ? '—' : `${kgFmt.format(Number(v))} kg`);
export const fmtPerKg = (v: string | number | null | undefined) => (v == null ? '—' : `Bs ${unitFmt.format(Number(v))}/kg`);
export const fmtPct = (v: string | number | null | undefined) => (v == null ? '—' : `${kgFmt.format(Number(v))} %`);

/** Fechas tipo DATE (vencimiento) llegan como medianoche UTC: se formatean en UTC para no correr un día. */
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-BO', { timeZone: 'UTC' });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });

export const PAYMENT_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TRANSFERENCIA: 'Transferencia',
  CREDITO_PROVEEDOR: 'Crédito proveedor',
};

export const PURCHASE_STATUS: Record<string, { label: string; color: string }> = {
  REGISTERED: { label: 'Por recibir', color: 'yellow' },
  RECEIVED: { label: 'Recibida', color: 'green' },
  CANCELLED: { label: 'Anulada', color: 'gray' },
};

export const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: 'Ingreso por compra',
  SALE: 'Venta',
  SALE_ANNUL: 'Anulación de venta',
  TRANSFER_OUT: 'Transferencia (salida)',
  TRANSFER_IN: 'Transferencia (entrada)',
  RETURN: 'Devolución',
  ADJUSTMENT: 'Ajuste',
  LOSS: 'Baja / pérdida',
};

export const TREATMENT_LABELS: Record<string, string> = {
  ABSORB: 'Absorbida como pérdida',
  INCORPORATE: 'Incorporada al costo',
};

/** Color de alerta según días para vencer. */
export function expiryColor(days: number) {
  if (days < 0) return 'red';
  if (days <= 2) return 'orange';
  if (days <= 5) return 'yellow';
  return 'green';
}

export function expiryLabel(days: number) {
  if (days < 0) return `Vencido hace ${-days} d`;
  if (days === 0) return 'Vence hoy';
  return `${days} d`;
}

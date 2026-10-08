// Formateo para mostrar. Los cálculos oficiales los hace el servidor con decimales exactos.
const bob = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const unitFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const fmtBob = (v: string | number | null | undefined) => (v == null ? '—' : `Bs ${bob.format(Number(v))}`);
export const fmtKg = (v: string | number | null | undefined) => (v == null ? '—' : `${kgFmt.format(Number(v))} kg`);
const kgShortFmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
/** Kilos con a lo sumo un decimal, para indicadores y alertas. */
export const fmtKgShort = (v: string | number | null | undefined) => (v == null ? '—' : `${kgShortFmt.format(Number(v))} kg`);
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

export const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  PAID: { label: 'Pagada', color: 'green' },
  PARTIAL: { label: 'Pago parcial', color: 'yellow' },
  CREDIT: { label: 'A crédito', color: 'orange' },
  PENDING: { label: 'Pendiente', color: 'gray' },
};

export const SALE_STATUS: Record<string, { label: string; color: string }> = {
  CONFIRMED: { label: 'Confirmada', color: 'blue' },
  ANNULLED: { label: 'Anulada', color: 'gray' },
  RETURNED: { label: 'Devuelta', color: 'grape' },
};

export const RECEIVABLE_LABELS: Record<string, string> = {
  CHARGE: 'Venta a crédito',
  PAYMENT: 'Cobro',
  ANNUL: 'Anulación de venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
};

export const TRANSFER_STATUS: Record<string, { label: string; color: string }> = {
  IN_TRANSIT: { label: 'En tránsito', color: 'yellow' },
  RECEIVED: { label: 'Recibida', color: 'green' },
  CANCELLED: { label: 'Cancelada', color: 'gray' },
};

export const ADJUSTMENT_REASONS: Record<string, string> = {
  PHYSICAL_COUNT: 'Conteo físico',
  EXPIRED: 'Vencido',
  DAMAGED: 'Dañado',
  SPOILED: 'Descompuesto',
  THEFT: 'Robo o faltante',
  OTHER: 'Otro',
};

/** Causas del reporte de pérdidas de inventario. */
export const LOSS_CAUSES: Record<string, string> = {
  ...ADJUSTMENT_REASONS,
  COUNT_SHORTAGE: 'Faltante en conteo',
  COUNT_SURPLUS: 'Sobrante en conteo',
  TRANSIT: 'Faltante en transferencia',
  RETURN_DISCARD: 'Devolución descartada',
};

export const PRESALE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'yellow' },
  CONFIRMED: { label: 'Confirmada', color: 'blue' },
  ASSIGNED: { label: 'En ruta', color: 'grape' },
  DELIVERED: { label: 'Atendida', color: 'green' },
  CANCELLED: { label: 'Cancelada', color: 'gray' },
};

export const ROUTE_STATUS: Record<string, { label: string; color: string }> = {
  PLANNED: { label: 'Planificada', color: 'blue' },
  IN_PROGRESS: { label: 'En ruta', color: 'yellow' },
  COMPLETED: { label: 'Liquidada', color: 'green' },
  CANCELLED: { label: 'Cancelada', color: 'gray' },
};

export const STOP_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'gray' },
  DELIVERED: { label: 'Entregado', color: 'green' },
  PARTIAL: { label: 'Con diferencias', color: 'yellow' },
  FAILED: { label: 'No entregado', color: 'red' },
};

export const DELIVERY_PROBLEMS: Record<string, string> = {
  CLOSED: 'Local cerrado',
  NOT_FOUND: 'No se encontró al cliente',
  REJECTED: 'Rechazó el pedido',
  NO_PAYMENT: 'Sin dinero para pagar',
  WRONG_ADDRESS: 'Dirección incorrecta',
  DAMAGED: 'Producto dañado',
  NOT_VISITED: 'No se visitó',
  OTHER: 'Otro',
};

export const CRATE_MOVEMENT_LABELS: Record<string, string> = {
  INITIAL: 'Alta',
  DISPATCH: 'Carga al vehículo',
  DELIVERY: 'Entrega al cliente',
  PICKUP: 'Recojo del cliente',
  RETURN: 'Devolución al almacén',
  SHORTAGE: 'Faltante a cargo',
  TRANSFER: 'Traspaso',
  WRITE_OFF: 'Baja',
};

export const PAYMENT_SOURCE_LABELS: Record<string, string> = {
  CENTRAL: 'Central',
  BRANCH: 'Sucursal',
  DRIVER: 'Chofer',
  COLLECTOR: 'Cobrador',
};

export const CASH_CATEGORY_LABELS: Record<string, string> = {
  SALE: 'Ventas',
  COLLECTION: 'Cobros en oficina',
  SETTLEMENT: 'Rendiciones',
  PURCHASE: 'Compras',
  REFUND: 'Devoluciones de dinero',
  EXPENSE: 'Gastos',
  OTHER_INCOME: 'Otros ingresos',
  TRANSFER: 'Traspasos',
  ADJUSTMENT: 'Diferencias de arqueo',
  REVERSAL: 'Reversiones',
};

export const EXPENSE_TYPE_LABELS: Record<string, string> = {
  COMBUSTIBLE: 'Combustible',
  SUELDOS: 'Sueldos',
  ALQUILER: 'Alquiler',
  SERVICIOS: 'Servicios (luz, agua, internet)',
  MANTENIMIENTO: 'Mantenimiento',
  VIATICOS: 'Viáticos',
  IMPUESTOS: 'Impuestos',
  INSUMOS: 'Insumos',
  OTROS: 'Otros',
};

/** Billetes y monedas en bolivianos, para el arqueo de caja. */
export const BOB_DENOMINATIONS = ['200', '100', '50', '20', '10', '5', '2', '1', '0.5', '0.2', '0.1'];

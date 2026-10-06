// Especificaciones comunes de marcas: barras ≤ 24 px, extremo redondeado de 4 px, separación de 2 px
// en el color de la superficie, grilla fina y recesiva.
export const BAR_MAX = 24;

export const axisFormatterBob = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('es-BO', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('es-BO');

// Ojo: en Mantine gridAxis='x' dibuja lineas horizontales (columnas) y 'y' verticales (barras horizontales).
export const chartChrome = {
  gridAxis: 'x' as const,
  tickLine: 'none' as const,
  strokeDasharray: '0',
  gridColor: 'var(--viz-grid)',
  textColor: 'var(--viz-axis)',
};

/** Separación de 2 px entre segmentos y barras adyacentes. */
export const surfaceGap = { stroke: 'var(--viz-surface)', strokeWidth: 2 };

/** Barras horizontales: grilla vertical y margen derecho para que la etiqueta del extremo no se corte. */
export const horizontalBars = {
  gridAxis: 'y' as const,
  barChartProps: { margin: { right: 88, left: 0, top: 0, bottom: 0 } },
};

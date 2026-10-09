import { Group, Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import type { ReportOptions, SalesFilterValues } from '../api/types';

/** Listas para los filtros de reportes (una sola consulta, compartida por todas las pestañas). */
export function useReportOptions() {
  return useQuery({
    queryKey: ['report-options'],
    queryFn: async () => (await api.get<ReportOptions>('/reports/options')).data,
    staleTime: 5 * 60_000,
  });
}

type Key = keyof SalesFilterValues;
const LABELS: Record<Key, string> = { branchId: 'Sucursal', categoryId: 'Categoría', sellerId: 'Vendedor', customerId: 'Cliente' };

/** Filtros de ventas en una fila: sucursal (o reparto), categoría, vendedor y cliente. Vacío = todos. */
export function useSalesFilters(keys: Key[] = ['branchId', 'categoryId', 'sellerId', 'customerId']) {
  const [filters, setFilters] = useState<SalesFilterValues>({});
  const { data: o } = useReportOptions();
  const data: Record<Key, { value: string; label: string }[]> = {
    branchId: [...(o?.branches ?? []).map((b) => ({ value: b.id, label: b.name })), { value: 'routes', label: 'Reparto en ruta' }],
    categoryId: (o?.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    sellerId: (o?.sellers ?? []).map((u) => ({ value: u.id, label: u.name })),
    customerId: (o?.customers ?? []).map((c) => ({ value: c.id, label: c.name })),
  };
  const controls = (
    <Group gap="xs" wrap="wrap">
      {keys.map((k) => (
        <Select
          key={k}
          size="sm"
          w={{ base: '100%', xs: 200 }}
          aria-label={LABELS[k]}
          placeholder={`${LABELS[k]}: todos`}
          data={data[k]}
          value={filters[k] ?? null}
          onChange={(v) => setFilters((f) => ({ ...f, [k]: v ?? undefined }))}
          clearable
          searchable
          nothingFoundMessage="Sin coincidencias"
        />
      ))}
    </Group>
  );
  // Solo los filtros con valor viajan a la API (y forman parte de la clave de la consulta).
  const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as SalesFilterValues;
  return { filters: active, controls };
}

/** Un filtro suelto (chofer, vehículo, proveedor, tipo de cliente). */
export function FilterSelect({ label, value, onChange, data }: { label: string; value: string | null; onChange: (v: string | null) => void; data: { value: string; label: string }[] }) {
  return (
    <Select size="sm" w={{ base: '100%', xs: 220 }} aria-label={label} placeholder={`${label}: todos`} data={data} value={value} onChange={onChange}
      clearable searchable nothingFoundMessage="Sin coincidencias" />
  );
}

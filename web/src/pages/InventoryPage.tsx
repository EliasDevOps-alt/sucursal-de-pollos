import { Anchor, Card, Group, Select, SimpleGrid, Table, Tabs, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { StockRow, Warehouse } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatTile } from '../components/viz/StatTile';
import { QueryState } from '../components/QueryState';
import { fmtBob, fmtDate, fmtDateTime, fmtKg, fmtPerKg, MOVEMENT_LABELS } from '../lib/format';
import { AdjustmentsTab } from './inventory/AdjustmentsTab';
import { TransfersTab } from './inventory/TransfersTab';
import { LotsPage } from './lots/LotsPage';

interface MovementRow {
  id: string;
  movementType: string;
  weightKg: string;
  unitCostPerKg: string;
  movementDate: string;
  referenceType: string;
  referenceId: string;
  reason: string | null;
  product: { code: string; name: string };
  lot: { id: string; lotCode: string };
  warehouse: { code: string; name: string };
  createdBy: { fullName: string };
}

const REF_LINKS: Record<string, (id: string) => string> = {
  sale: (id) => `/ventas/${id}`,
  transfer: () => '/inventario?tab=transferencias',
  adjustment: () => '/inventario?tab=ajustes',
};

const TABS = ['stock', 'lotes', 'kardex', 'transferencias', 'ajustes'];

function StockTab({ warehouseId }: { warehouseId: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory-stock', warehouseId],
    queryFn: async () => (await api.get<StockRow[]>('/inventory/stock', { params: { warehouseId: warehouseId ?? undefined } })).data,
  });
  const kg = (data ?? []).reduce((s, r) => s + Number(r.weightKg), 0);
  const value = (data ?? []).reduce((s, r) => s + Number(r.value), 0);

  return (
    <QueryState isLoading={isLoading} error={error}>
      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
        <StatTile label="Stock total" value={fmtKg(kg.toFixed(3))} />
        <StatTile label="Valor a costo real" value={fmtBob(value)} />
        <StatTile label="Productos con stock" value={String(data?.length ?? 0)} />
      </SimpleGrid>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={640}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Categoría</Table.Th>
                <Table.Th ta="right">Kg disponibles</Table.Th>
                <Table.Th ta="right">Valor</Table.Th>
                <Table.Th ta="center">Lotes</Table.Th>
                <Table.Th>Próximo vencimiento</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.map((r) => (
                <Table.Tr key={r.product.id}>
                  <Table.Td fw={500}>{r.product.name}</Table.Td>
                  <Table.Td>{r.product.category.name}</Table.Td>
                  <Table.Td ta="right" fw={600}>{fmtKg(r.weightKg)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(r.value)}</Table.Td>
                  <Table.Td ta="center">{r.lots}</Table.Td>
                  <Table.Td>{r.nextExpiry ? fmtDate(r.nextExpiry) : '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </QueryState>
  );
}

function KardexTab({ warehouseId }: { warehouseId: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory-movements', warehouseId],
    queryFn: async () => (await api.get<MovementRow[]>('/inventory/movements', { params: { warehouseId: warehouseId ?? undefined } })).data,
  });
  return (
    <QueryState isLoading={isLoading} error={error}>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={900}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Movimiento</Table.Th>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Lote</Table.Th>
                <Table.Th>Almacén</Table.Th>
                <Table.Th ta="right">Kg</Table.Th>
                <Table.Th ta="right">Costo/kg</Table.Th>
                <Table.Th>Usuario</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.map((m) => {
                const link = REF_LINKS[m.referenceType]?.(m.referenceId);
                const label = MOVEMENT_LABELS[m.movementType] ?? m.movementType;
                return (
                  <Table.Tr key={m.id}>
                    <Table.Td>{fmtDateTime(m.movementDate)}</Table.Td>
                    <Table.Td>
                      {link ? <Anchor component={Link} to={link} size="sm">{label}</Anchor> : label}
                      {m.reason && <Text size="xs" c="dimmed">{m.reason}</Text>}
                    </Table.Td>
                    <Table.Td>{m.product.name}</Table.Td>
                    <Table.Td><Anchor component={Link} to={`/lotes/${m.lot.id}`} size="sm">{m.lot.lotCode}</Anchor></Table.Td>
                    <Table.Td>{m.warehouse.name}</Table.Td>
                    <Table.Td ta="right" fw={500} c={Number(m.weightKg) < 0 ? 'red' : 'green'}>
                      {Number(m.weightKg) > 0 ? '+' : ''}{fmtKg(m.weightKg)}
                    </Table.Td>
                    <Table.Td ta="right">{fmtPerKg(m.unitCostPerKg)}</Table.Td>
                    <Table.Td>{m.createdBy.fullName}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </QueryState>
  );
}

export function InventoryPage() {
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = requested && TABS.includes(requested) ? requested : 'stock';
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data });

  return (
    <>
      <PageHeader title="Inventario" subtitle="Stock por producto y lote, transferencias entre almacenes, ajustes, bajas y kardex" />
      <Group mb="sm">
        <Select
          placeholder="Todos los almacenes"
          clearable
          w={260}
          value={warehouseId}
          onChange={setWarehouseId}
          data={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <Text size="sm" c="dimmed">El historial oficial es el kardex; el stock es su suma.</Text>
      </Group>
      <Tabs value={tab} onChange={(v) => setParams(v && v !== 'stock' ? { tab: v } : {})} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="stock">Stock por producto</Tabs.Tab>
          <Tabs.Tab value="lotes">Lotes</Tabs.Tab>
          <Tabs.Tab value="transferencias">Transferencias</Tabs.Tab>
          <Tabs.Tab value="ajustes">Ajustes y bajas</Tabs.Tab>
          <Tabs.Tab value="kardex">Kardex</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="stock"><StockTab warehouseId={warehouseId} /></Tabs.Panel>
        <Tabs.Panel value="lotes"><LotsPage embedded /></Tabs.Panel>
        <Tabs.Panel value="transferencias"><TransfersTab warehouseId={warehouseId} /></Tabs.Panel>
        <Tabs.Panel value="ajustes"><AdjustmentsTab warehouseId={warehouseId} /></Tabs.Panel>
        <Tabs.Panel value="kardex"><KardexTab warehouseId={warehouseId} /></Tabs.Panel>
      </Tabs>
    </>
  );
}

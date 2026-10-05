import { Anchor, Badge, Card, Group, Select, Switch, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { LotListItem, Product, Warehouse } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { expiryColor, expiryLabel, fmtDate, fmtKg, fmtPerKg } from '../../lib/format';

export function LotsPage() {
  const [productId, setProductId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const products = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get<Product[]>('/products')).data });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data });

  const params = { productId: productId ?? undefined, warehouseId: warehouseId ?? undefined, onlyAvailable };
  const { data, isLoading, error } = useQuery({
    queryKey: ['lots', params],
    queryFn: async () => (await api.get<LotListItem[]>('/lots', { params })).data,
  });

  // Primer lote con saldo de cada producto: el que el sistema sugerirá vender (FEFO).
  const fefoFirst = new Set<string>();
  const seen = new Set<string>();
  for (const l of data ?? []) {
    if (Number(l.availableWeightKg) > 0 && !seen.has(l.product.id)) {
      seen.add(l.product.id);
      fefoFirst.add(l.id);
    }
  }

  const totalKg = (data ?? []).reduce((s, l) => s + Number(l.availableWeightKg), 0);

  return (
    <>
      <PageHeader title="Lotes e inventario" subtitle="Ordenados por vencimiento: el que vence primero sale primero (FEFO)" />
      <Group mb="sm" align="flex-end" wrap="wrap">
        <Select
          label="Producto"
          placeholder="Todos"
          clearable
          searchable
          w={240}
          value={productId}
          onChange={setProductId}
          data={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          label="Almacén"
          placeholder="Todos"
          clearable
          w={240}
          value={warehouseId}
          onChange={setWarehouseId}
          data={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <Switch label="Solo con saldo" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.currentTarget.checked)} mb={8} />
        <Text ml="auto" fw={600} mb={6}>Total disponible: {fmtKg(totalKg.toFixed(3))}</Text>
      </Group>

      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No hay lotes con este filtro. Los lotes se crean al recibir una compra.</Text>
          ) : (
            <Table.ScrollContainer minWidth={960}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Lote</Table.Th>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th>Compra / proveedor</Table.Th>
                    <Table.Th ta="right">Recibido</Table.Th>
                    <Table.Th ta="right">Disponible</Table.Th>
                    <Table.Th ta="right">Costo real</Table.Th>
                    <Table.Th ta="right">Precio</Table.Th>
                    <Table.Th>Vencimiento</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((l) => (
                    <Table.Tr key={l.id}>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Anchor component={Link} to={`/lotes/${l.id}`} fw={600}>{l.lotCode}</Anchor>
                          {fefoFirst.has(l.id) && <Badge size="xs" variant="filled">Sale primero</Badge>}
                        </Group>
                      </Table.Td>
                      <Table.Td>{l.product.name}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{l.purchase.purchaseNumber}</Text>
                        <Text size="xs" c="dimmed">{l.purchase.supplier.name}</Text>
                      </Table.Td>
                      <Table.Td ta="right">{fmtKg(l.receivedWeightKg)}</Table.Td>
                      <Table.Td ta="right" fw={600}>{fmtKg(l.availableWeightKg)}</Table.Td>
                      <Table.Td ta="right">{fmtPerKg(l.actualCostPerKg)}</Table.Td>
                      <Table.Td ta="right">{l.currentPrice ? fmtPerKg(l.currentPrice.pricePerKg) : '—'}</Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">{fmtDate(l.expiryDate)}</Text>
                          <Badge size="sm" variant="light" color={expiryColor(l.daysToExpiry)}>{expiryLabel(l.daysToExpiry)}</Badge>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      </QueryState>
    </>
  );
}

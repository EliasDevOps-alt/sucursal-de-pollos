import { Anchor, Badge, Card, Group, SimpleGrid, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { LotListItem, PurchaseListItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { expiryColor, expiryLabel, fmtBob, fmtKg } from '../lib/format';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card withBorder padding="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="xl" fw={700} mt={4}>{value}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Card>
  );
}

// Inicio provisional: el dashboard completo (ventas, rentabilidad) llega en la fase D.
export function DashboardPage() {
  const { user, can } = useAuth();
  const lots = useQuery({
    queryKey: ['lots', { onlyAvailable: true }],
    queryFn: async () => (await api.get<LotListItem[]>('/lots', { params: { onlyAvailable: true } })).data,
    enabled: can('lots.view'),
  });
  const pending = useQuery({
    queryKey: ['purchases', { status: 'REGISTERED' }],
    queryFn: async () => (await api.get<PurchaseListItem[]>('/purchases', { params: { status: 'REGISTERED' } })).data,
    enabled: can('purchases.view'),
  });

  const available = lots.data ?? [];
  const stockKg = available.reduce((s, l) => s + Number(l.availableWeightKg), 0);
  const stockValue = available.reduce((s, l) => s + Number(l.availableWeightKg) * Number(l.actualCostPerKg), 0);
  const expiring = available.filter((l) => l.daysToExpiry <= 3);

  return (
    <>
      <PageHeader title={`Hola, ${user?.fullName.split(' ')[0]}`} subtitle="Resumen de la operación" />
      {can('lots.view') && (
        <QueryState isLoading={lots.isLoading} error={lots.error}>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} mb="lg">
            <Stat label="Stock disponible" value={fmtKg(stockKg)} hint={`${available.length} lotes con saldo`} />
            <Stat label="Valor del stock" value={fmtBob(stockValue)} hint="a costo real" />
            <Stat label="Por vencer (≤ 3 días)" value={String(expiring.length)} hint="lotes" />
            <Stat label="Compras por recibir" value={String(pending.data?.length ?? 0)} />
          </SimpleGrid>

          <Card withBorder>
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Lotes próximos a vencer</Text>
              <Anchor component={Link} to="/lotes" size="sm">Ver todos</Anchor>
            </Group>
            {expiring.length === 0 ? (
              <Text c="dimmed" size="sm">No hay lotes por vencer en los próximos 3 días.</Text>
            ) : (
              <Table.ScrollContainer minWidth={480}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Lote</Table.Th>
                      <Table.Th>Producto</Table.Th>
                      <Table.Th ta="right">Disponible</Table.Th>
                      <Table.Th>Vence</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {expiring.map((l) => (
                      <Table.Tr key={l.id}>
                        <Table.Td><Anchor component={Link} to={`/lotes/${l.id}`}>{l.lotCode}</Anchor></Table.Td>
                        <Table.Td>{l.product.name}</Table.Td>
                        <Table.Td ta="right">{fmtKg(l.availableWeightKg)}</Table.Td>
                        <Table.Td><Badge color={expiryColor(l.daysToExpiry)} variant="light">{expiryLabel(l.daysToExpiry)}</Badge></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>
        </QueryState>
      )}
    </>
  );
}

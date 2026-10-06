import { Anchor, Badge, Button, Card, Group, Select, Table, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { SaleListItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDateTime, PAYMENT_STATUS, SALE_STATUS } from '../../lib/format';

export function SalesPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  const params = { status: status ?? undefined, paymentStatus: paymentStatus ?? undefined };
  const { data, isLoading, error } = useQuery({
    queryKey: ['sales', params],
    queryFn: async () => (await api.get<SaleListItem[]>('/sales', { params })).data,
  });

  const confirmed = (data ?? []).filter((s) => s.status === 'CONFIRMED');
  const total = confirmed.reduce((s, x) => s + Number(x.totalAmount), 0);

  return (
    <>
      <PageHeader
        title="Ventas"
        subtitle="Ventas en almacén central y sucursales"
        actions={can('sales.create') && <Button component={Link} to="/ventas/nueva" leftSection={<IconPlus size={16} />}>Nueva venta</Button>}
      />
      <Group mb="sm" align="flex-end">
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          w={180}
          value={status}
          onChange={setStatus}
          data={Object.entries(SALE_STATUS).map(([value, v]) => ({ value, label: v.label }))}
        />
        <Select
          label="Pago"
          placeholder="Todos"
          clearable
          w={180}
          value={paymentStatus}
          onChange={setPaymentStatus}
          data={Object.entries(PAYMENT_STATUS).map(([value, v]) => ({ value, label: v.label }))}
        />
        <Text ml="auto" fw={600} mb={6}>{confirmed.length} ventas confirmadas · {fmtBob(total)}</Text>
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No hay ventas con este filtro.</Text>
          ) : (
            <Table.ScrollContainer minWidth={820}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>N.º</Table.Th>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th>Almacén</Table.Th>
                    <Table.Th>Vendedor</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                    <Table.Th>Pago</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((s) => (
                    <Table.Tr key={s.id} style={{ opacity: s.status === 'ANNULLED' ? 0.55 : 1 }}>
                      <Table.Td><Anchor component={Link} to={`/ventas/${s.id}`} fw={600}>{s.saleNumber}</Anchor></Table.Td>
                      <Table.Td>{fmtDateTime(s.createdAt)}</Table.Td>
                      <Table.Td>{s.customer ? s.customer.name : <Text span size="sm" c="dimmed">Venta rápida</Text>}</Table.Td>
                      <Table.Td>{s.warehouse.name}</Table.Td>
                      <Table.Td>{s.seller.fullName}</Table.Td>
                      <Table.Td ta="right" fw={500}>{fmtBob(s.totalAmount)}</Table.Td>
                      <Table.Td><Badge variant="light" color={PAYMENT_STATUS[s.paymentStatus].color}>{PAYMENT_STATUS[s.paymentStatus].label}</Badge></Table.Td>
                      <Table.Td><Badge variant="light" color={SALE_STATUS[s.status].color}>{SALE_STATUS[s.status].label}</Badge></Table.Td>
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

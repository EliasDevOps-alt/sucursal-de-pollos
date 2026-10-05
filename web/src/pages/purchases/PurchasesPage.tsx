import { Anchor, Badge, Button, Card, Group, SegmentedControl, Table, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { PurchaseListItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDateTime, PAYMENT_LABELS, PURCHASE_STATUS } from '../../lib/format';

export function PurchasesPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('ALL');

  const { data, isLoading, error } = useQuery({
    queryKey: ['purchases', { status }],
    queryFn: async () =>
      (await api.get<PurchaseListItem[]>('/purchases', { params: status === 'ALL' ? {} : { status } })).data,
  });

  return (
    <>
      <PageHeader
        title="Compras"
        subtitle="Compra → recepción con peso real → lotes"
        actions={
          can('purchases.create') && (
            <Button component={Link} to="/compras/nueva" leftSection={<IconPlus size={16} />}>
              Nueva compra
            </Button>
          )
        }
      />
      <Group mb="sm">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          data={[
            { value: 'ALL', label: 'Todas' },
            { value: 'REGISTERED', label: 'Por recibir' },
            { value: 'RECEIVED', label: 'Recibidas' },
            { value: 'CANCELLED', label: 'Anuladas' },
          ]}
        />
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No hay compras con este filtro.</Text>
          ) : (
            <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>N.º</Table.Th>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Proveedor</Table.Th>
                    <Table.Th>Destino</Table.Th>
                    <Table.Th ta="center">Líneas</Table.Th>
                    <Table.Th>Pago</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/compras/${p.id}`} fw={600}>{p.purchaseNumber}</Anchor>
                      </Table.Td>
                      <Table.Td>{fmtDateTime(p.purchaseDate)}</Table.Td>
                      <Table.Td>{p.supplier.name}</Table.Td>
                      <Table.Td>{p.warehouse.name}</Table.Td>
                      <Table.Td ta="center">{p._count.items}</Table.Td>
                      <Table.Td>{PAYMENT_LABELS[p.paymentMethod] ?? p.paymentMethod}</Table.Td>
                      <Table.Td ta="right" fw={500}>{fmtBob(p.totalAmount)}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={PURCHASE_STATUS[p.status].color}>{PURCHASE_STATUS[p.status].label}</Badge>
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

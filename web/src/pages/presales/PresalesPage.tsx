import { Anchor, Badge, Button, Card, Group, SegmentedControl, Table, Text, Tooltip } from '@mantine/core';
import { IconMapPin, IconWifiOff } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { PresaleListItem } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDate, fmtDateTime, PRESALE_STATUS } from '../../lib/format';

export function PresalesPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const { data, isLoading, error } = useQuery({
    queryKey: ['presales', status],
    queryFn: async () => (await api.get<PresaleListItem[]>('/presales', { params: status === 'ALL' ? {} : { status } })).data,
    refetchInterval: 15_000, // los pedidos llegan desde los teléfonos al sincronizar
  });

  return (
    <>
      <PageHeader title="Preventas" subtitle="Pedidos tomados por los preventistas desde la app móvil"
        actions={can('presales.view_all') && (
          <Button component={Link} to="/preventas/recorrido" variant="light" leftSection={<IconMapPin size={16} />}>Ver recorrido</Button>
        )}
      />
      <SegmentedControl
        mb="sm"
        value={status}
        onChange={setStatus}
        data={[
          { value: 'PENDING', label: 'Pendientes' },
          { value: 'DELIVERED', label: 'Atendidas' },
          { value: 'CANCELLED', label: 'Canceladas' },
          { value: 'ALL', label: 'Todas' },
        ]}
      />
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No hay preventas con este filtro.</Text>
          ) : (
            <Table.ScrollContainer minWidth={820}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>N.º</Table.Th>
                    <Table.Th>Tomado</Table.Th>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th>Preventista</Table.Th>
                    <Table.Th>Entrega</Table.Th>
                    <Table.Th ta="right">Total cotizado</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Anchor component={Link} to={`/preventas/${p.id}`} fw={600}>{p.presaleNumber}</Anchor>
                          {p.createdOffline && (
                            <Tooltip label="Registrado en el teléfono y sincronizado después">
                              <IconWifiOff size={14} aria-label="Registrado sin conexión" />
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>{fmtDateTime(p.createdAtDevice ?? p.createdAt)}</Table.Td>
                      <Table.Td>{p.customer.name}</Table.Td>
                      <Table.Td>{p.preventista.fullName}</Table.Td>
                      <Table.Td>{p.scheduledDeliveryDate ? fmtDate(p.scheduledDeliveryDate) : '—'}</Table.Td>
                      <Table.Td ta="right">{fmtBob(p.totalAmount)}</Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          <Badge variant="light" color={PRESALE_STATUS[p.status].color}>{PRESALE_STATUS[p.status].label}</Badge>
                          {p.sale && <Anchor component={Link} to={`/ventas/${p.sale.id}`} size="xs">{p.sale.saleNumber}</Anchor>}
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

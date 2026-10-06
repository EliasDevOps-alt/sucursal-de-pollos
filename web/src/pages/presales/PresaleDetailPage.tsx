import { Alert, Anchor, Badge, Button, Card, Group, Modal, SimpleGrid, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconArrowLeft, IconBan, IconMapPin, IconShoppingCartCheck, IconWifiOff } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PresaleDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDate, fmtDateTime, fmtKg, fmtPerKg, PRESALE_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={500} component="div">{children}</Text>
    </div>
  );
}

const mapsLink = (lat: string, lng: string) => `https://www.google.com/maps?q=${lat},${lng}`;

export function PresaleDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['presales', id],
    queryFn: async () => (await api.get<PresaleDetail>(`/presales/${id}`)).data,
  });

  const cancel = useMutation({
    mutationFn: async () => api.post(`/presales/${id}/cancel`, { reason }),
    onSuccess: () => {
      notifyOk('Preventa cancelada');
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ['presales'] });
    },
    onError: notifyError,
  });

  const open = p && (p.status === 'PENDING' || p.status === 'CONFIRMED');

  return (
    <QueryState isLoading={isLoading} error={error}>
      {p && (
        <Stack>
          <Anchor component={Link} to="/preventas" size="sm">
            <Group gap={4}><IconArrowLeft size={14} /> Preventas</Group>
          </Anchor>
          <PageHeader
            title={`Preventa ${p.presaleNumber}`}
            subtitle={`${p.customer.name} · tomada por ${p.preventista.fullName}`}
            actions={
              <>
                <Badge size="lg" variant="light" color={PRESALE_STATUS[p.status].color}>{PRESALE_STATUS[p.status].label}</Badge>
                {open && can('presales.manage') && (
                  <Button variant="light" color="red" leftSection={<IconBan size={16} />} onClick={() => setCancelOpen(true)}>Cancelar</Button>
                )}
                {open && can('sales.create') && (
                  <Button leftSection={<IconShoppingCartCheck size={16} />} onClick={() => navigate(`/ventas/nueva?preventa=${p.id}`)}>
                    Atender pedido
                  </Button>
                )}
              </>
            }
          />

          {p.status === 'DELIVERED' && p.sale && (
            <Alert color="green" title="Pedido atendido">
              Se registró la venta <Anchor component={Link} to={`/ventas/${p.sale.id}`}>{p.sale.saleNumber}</Anchor> por {fmtBob(p.sale.totalAmount)}.
            </Alert>
          )}
          {p.status === 'CANCELLED' && (
            <Alert color="gray" title="Preventa cancelada">{p.cancelReason} {p.cancelledAt && `— ${fmtDateTime(p.cancelledAt)}`}</Alert>
          )}

          <Card withBorder>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
              <Field label="Tomado en el teléfono">
                <Group gap={6}>
                  {fmtDateTime(p.createdAtDevice ?? p.createdAt)}
                  {p.createdOffline && <IconWifiOff size={14} aria-label="Sin conexión" />}
                </Group>
              </Field>
              <Field label="Recibido en el servidor">{fmtDateTime(p.createdAt)}</Field>
              <Field label="Entrega programada">{p.scheduledDeliveryDate ? fmtDate(p.scheduledDeliveryDate) : '—'}</Field>
              <Field label="Teléfono del cliente">{p.customer.phone ?? '—'}</Field>
            </SimpleGrid>
            {p.address && (
              <Group gap={6} mt="sm">
                <IconMapPin size={16} />
                <Text size="sm">{p.address.label}: {p.address.address}</Text>
                {p.address.latitude && p.address.longitude && (
                  <Anchor href={mapsLink(p.address.latitude, p.address.longitude)} target="_blank" size="sm">Ver en mapa</Anchor>
                )}
              </Group>
            )}
            {p.latitude && p.longitude && (
              <Text size="xs" c="dimmed" mt={4}>
                Pedido tomado en {Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)} ·{' '}
                <Anchor href={mapsLink(p.latitude, p.longitude)} target="_blank" size="xs">ver</Anchor>
              </Text>
            )}
            {p.notes && <Text size="sm" mt="sm">Observaciones: {p.notes}</Text>}
          </Card>

          <Card withBorder p={0}>
            <Table.ScrollContainer minWidth={560}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Kg</Table.Th>
                    <Table.Th ta="right">Unidades</Table.Th>
                    <Table.Th ta="right">Precio cotizado</Table.Th>
                    <Table.Th ta="right">Subtotal</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {p.items.map((i) => (
                    <Table.Tr key={i.id}>
                      <Table.Td>{i.product.name}{i.notes && <Text size="xs" c="dimmed">{i.notes}</Text>}</Table.Td>
                      <Table.Td ta="right">{fmtKg(i.weightKg)}</Table.Td>
                      <Table.Td ta="right">{Number(i.quantity) || '—'}</Table.Td>
                      <Table.Td ta="right">{fmtPerKg(i.unitPrice)}</Table.Td>
                      <Table.Td ta="right">{fmtBob(i.subtotal)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Group justify="space-between" p="md">
              <Text size="xs" c="dimmed">El precio final se calcula al atender, con los lotes que salgan por vencimiento.</Text>
              <Text fw={700}>Total cotizado {fmtBob(p.totalAmount)}</Text>
            </Group>
          </Card>

          <Modal opened={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancelar preventa ${p.presaleNumber}`}>
            <Stack>
              <Textarea label="Motivo" withAsterisk value={reason} onChange={(e) => setReason(e.currentTarget.value)} autosize minRows={2} />
              <Button color="red" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>Confirmar cancelación</Button>
            </Stack>
          </Modal>
        </Stack>
      )}
    </QueryState>
  );
}

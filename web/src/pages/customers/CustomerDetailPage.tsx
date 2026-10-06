import { Anchor, Badge, Button, Card, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Switch, Table, Text, Textarea, Title } from '@mantine/core';
import { IconArrowLeft, IconEdit } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { CustomerDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDateTime, fmtPct, PAYMENT_STATUS, RECEIVABLE_LABELS, SALE_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { useCustomerCatalogs } from './CustomersPage';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={500}>{children}</Text>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { ranks } = useCustomerCatalogs();
  const [editing, setEditing] = useState(false);
  const [rankId, setRankId] = useState<string | null>(null);
  const [creditEnabled, setCreditEnabled] = useState(false);
  const [creditLimit, setCreditLimit] = useState<number | string>(0);
  const [reason, setReason] = useState('');

  const { data: c, isLoading, error } = useQuery({
    queryKey: ['customers', id],
    queryFn: async () => (await api.get<CustomerDetail>(`/customers/${id}`)).data,
  });

  const openEdit = () => {
    if (!c) return;
    setRankId(c.rankId);
    setCreditEnabled(c.creditEnabled);
    setCreditLimit(Number(c.creditLimit));
    setReason('');
    setEditing(true);
  };
  const rankChanged = c ? rankId !== c.rankId : false;

  const save = useMutation({
    mutationFn: async () =>
      api.patch(`/customers/${id}`, {
        rankId: rankId ?? undefined,
        creditEnabled,
        creditLimit: Number(creditLimit),
        rankChangeReason: rankChanged ? reason : undefined,
      }),
    onSuccess: () => {
      notifyOk('Cliente actualizado');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: notifyError,
  });

  return (
    <QueryState isLoading={isLoading} error={error}>
      {c && (
        <Stack>
          <Anchor component={Link} to="/clientes" size="sm">
            <Group gap={4}><IconArrowLeft size={14} /> Clientes</Group>
          </Anchor>
          <PageHeader
            title={c.name}
            subtitle={`${c.code} · ${c.customerType.name}`}
            actions={
              can('customer.rank_change') && (
                <Button variant="light" leftSection={<IconEdit size={16} />} onClick={openEdit}>Rango y crédito</Button>
              )
            }
          />

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <Card withBorder>
              <Title order={5} mb="sm">Datos</Title>
              <Stack gap="xs">
                <Field label="CI / NIT">{c.documentId ?? '—'}</Field>
                <Field label="Teléfono">{c.phone ?? '—'}</Field>
                <Field label="Rango">{c.rank ? `${c.rank.name} · ${fmtPct(c.rank.discountPercentage)} de descuento` : 'Sin rango'}</Field>
              </Stack>
            </Card>
            <Card withBorder>
              <Title order={5} mb="sm">Crédito</Title>
              <Stack gap="xs">
                <Field label="Estado">{c.creditEnabled ? 'Habilitado' : 'Sin crédito'}</Field>
                <Field label="Límite">{fmtBob(c.creditLimit)}</Field>
                <Field label="Deuda actual"><Text span fw={700} c={Number(c.currentDebt) > 0 ? 'orange' : undefined}>{fmtBob(c.currentDebt)}</Text></Field>
                <Field label="Disponible">{fmtBob(c.creditAvailable)}</Field>
              </Stack>
            </Card>
            <Card withBorder>
              <Title order={5} mb="sm">Direcciones</Title>
              <Stack gap="xs">
                {c.addresses.length === 0 && <Text size="sm" c="dimmed">Sin direcciones</Text>}
                {c.addresses.map((a) => (
                  <div key={a.id}>
                    <Group gap={6}>
                      <Text fw={500} size="sm">{a.label}</Text>
                      {a.isPrimary && <Badge size="xs">Principal</Badge>}
                      {a.latitude && <Badge size="xs" variant="light" color="teal">GPS</Badge>}
                    </Group>
                    <Text size="sm" c="dimmed">{a.address}</Text>
                  </div>
                ))}
              </Stack>
            </Card>
          </SimpleGrid>

          <Card withBorder p={0}>
            <Text fw={600} p="md" pb={0}>Últimas ventas</Text>
            {c.sales.length === 0 ? (
              <Text c="dimmed" size="sm" p="md">Sin ventas registradas.</Text>
            ) : (
              <Table.ScrollContainer minWidth={560}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>N.º</Table.Th>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th ta="right">Total</Table.Th>
                      <Table.Th>Pago</Table.Th>
                      <Table.Th>Estado</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {c.sales.map((s) => (
                      <Table.Tr key={s.id}>
                        <Table.Td><Anchor component={Link} to={`/ventas/${s.id}`} fw={600}>{s.saleNumber}</Anchor></Table.Td>
                        <Table.Td>{fmtDateTime(s.createdAt)}</Table.Td>
                        <Table.Td ta="right">{fmtBob(s.totalAmount)}</Table.Td>
                        <Table.Td><Badge variant="light" color={PAYMENT_STATUS[s.paymentStatus].color}>{PAYMENT_STATUS[s.paymentStatus].label}</Badge></Table.Td>
                        <Table.Td><Badge variant="light" color={SALE_STATUS[s.status].color}>{SALE_STATUS[s.status].label}</Badge></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>

          <Card withBorder p={0}>
            <Text fw={600} p="md" pb={0}>Movimientos de deuda</Text>
            {c.receivableMovements.length === 0 ? (
              <Text c="dimmed" size="sm" p="md">Sin movimientos.</Text>
            ) : (
              <Table.ScrollContainer minWidth={620}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th>Movimiento</Table.Th>
                      <Table.Th ta="right">Importe</Table.Th>
                      <Table.Th ta="right">Saldo</Table.Th>
                      <Table.Th>Usuario</Table.Th>
                      <Table.Th>Motivo</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {c.receivableMovements.map((m) => (
                      <Table.Tr key={m.id}>
                        <Table.Td>{fmtDateTime(m.createdAt)}</Table.Td>
                        <Table.Td>
                          {m.referenceType === 'sale' ? (
                            <Anchor component={Link} to={`/ventas/${m.referenceId}`}>{RECEIVABLE_LABELS[m.movementType]}</Anchor>
                          ) : (
                            RECEIVABLE_LABELS[m.movementType]
                          )}
                        </Table.Td>
                        <Table.Td ta="right" c={Number(m.amount) > 0 ? 'orange' : 'green'}>
                          {Number(m.amount) > 0 ? '+' : ''}{fmtBob(m.amount)}
                        </Table.Td>
                        <Table.Td ta="right" fw={600}>{fmtBob(m.balanceAfter)}</Table.Td>
                        <Table.Td>{m.createdBy.fullName}</Table.Td>
                        <Table.Td><Text size="sm" c="dimmed">{m.reason ?? ''}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>

          <Modal opened={editing} onClose={() => setEditing(false)} title="Rango y crédito">
            <Stack>
              <Select
                label="Rango"
                clearable
                value={rankId}
                onChange={(v) => {
                  setRankId(v);
                  const r = ranks.find((x) => x.id === v);
                  if (r) setCreditLimit(Number(r.creditLimit));
                }}
                data={ranks.map((r) => ({ value: r.id, label: `${r.name} · ${fmtPct(r.discountPercentage)} desc. · límite ${fmtBob(r.creditLimit)}` }))}
              />
              <Switch label="Crédito habilitado" checked={creditEnabled} onChange={(e) => setCreditEnabled(e.currentTarget.checked)} />
              <NumberInput label="Límite de crédito (Bs)" min={0} decimalScale={2} value={creditLimit} onChange={setCreditLimit} />
              {rankChanged && (
                <Textarea label="Motivo del cambio de rango" withAsterisk value={reason} onChange={(e) => setReason(e.currentTarget.value)} autosize minRows={2} />
              )}
              <Button loading={save.isPending} disabled={rankChanged && !reason.trim()} onClick={() => save.mutate()}>
                Guardar
              </Button>
            </Stack>
          </Modal>
        </Stack>
      )}
    </QueryState>
  );
}

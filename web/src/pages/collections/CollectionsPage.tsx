import { ActionIcon, Anchor, Badge, Button, Card, Group, Modal, Select, Stack, Table, Tabs, Text, Textarea, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconBan, IconCash, IconMap, IconReceipt } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Collection, Customer } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDateTime, PAYMENT_LABELS, PAYMENT_SOURCE_LABELS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { CollectionModal } from './CollectionModal';
import { CollectionReceiptModal } from './CollectionReceiptModal';
import { PendingMapTab } from './PendingMapTab';

export function CollectionsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [collecting, setCollecting] = useState(false);
  const [annulling, setAnnulling] = useState<Collection | null>(null);
  const [reason, setReason] = useState('');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mapa' ? 'mapa' : 'cobros';

  const customers = useQuery({
    queryKey: ['customers', { debounced, withDebt: false }],
    queryFn: async () => (await api.get<Customer[]>('/customers', { params: { search: debounced || undefined } })).data,
  });
  const selected = customers.data?.find((c) => c.id === customerId) ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['collections', customerId],
    queryFn: async () => (await api.get<Collection[]>('/collections', { params: { customerId: customerId ?? undefined } })).data,
  });

  const annul = useMutation({
    mutationFn: async () => api.post(`/collections/${annulling!.id}/annul`, { reason }),
    onSuccess: () => {
      notifyOk('Cobro anulado: la deuda del cliente se restituyó');
      setAnnulling(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: notifyError,
  });

  const valid = (data ?? []).filter((c) => c.status === 'VALID');
  const total = valid.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <>
      <PageHeader
        title="Cobranza"
        subtitle="Cobros de deuda en oficina y en la calle (cobrador): cada uno con su recibo y un solo método de pago"
        actions={
          can('collections.create') && (
            <Button leftSection={<IconCash size={16} />} disabled={!selected} onClick={() => setCollecting(true)}>
              {selected ? `Cobrar a ${selected.name}` : 'Elija un cliente para cobrar'}
            </Button>
          )
        }
      />
      <Tabs value={tab} onChange={(v) => setParams(v === 'mapa' ? { tab: v } : {})} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="cobros" leftSection={<IconReceipt size={16} />}>Cobros</Tabs.Tab>
          <Tabs.Tab value="mapa" leftSection={<IconMap size={16} />}>Mapa de pendientes</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="mapa"><PendingMapTab /></Tabs.Panel>
        <Tabs.Panel value="cobros">
      <Group mb="sm" align="flex-end">
        <Select
          label="Cliente"
          placeholder="Todos los clientes"
          searchable
          clearable
          w={360}
          value={customerId}
          onChange={setCustomerId}
          searchValue={search}
          onSearchChange={setSearch}
          filter={({ options }) => options}
          data={(customers.data ?? []).map((c) => ({
            value: c.id,
            label: `${c.name}${Number(c.currentDebt) > 0 ? ` · debe ${fmtBob(c.currentDebt)}` : ''}`,
          }))}
        />
        {selected && (
          <Text mb={6} size="sm">
            {Number(selected.currentDebt) >= 0 ? <>Deuda actual <b>{fmtBob(selected.currentDebt)}</b></> : <>Saldo a favor <b>{fmtBob(-Number(selected.currentDebt))}</b></>}
          </Text>
        )}
        <Text ml="auto" fw={600} mb={6}>{valid.length} cobros vigentes · {fmtBob(total)}</Text>
      </Group>

      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No hay cobros registrados{selected ? ' para este cliente' : ''}.</Text>
          ) : (
            <Table.ScrollContainer minWidth={860}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Recibo</Table.Th>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th>Método</Table.Th>
                    <Table.Th ta="right">Monto</Table.Th>
                    <Table.Th>Recibió</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((c) => (
                    <Table.Tr key={c.id} style={{ opacity: c.status === 'ANNULLED' ? 0.55 : 1 }}>
                      <Table.Td fw={600} ff="monospace">{c.receiptNumber}</Table.Td>
                      <Table.Td>{fmtDateTime(c.paymentDate)}</Table.Td>
                      <Table.Td><Anchor component={Link} to={`/clientes/${c.customer.id}`} size="sm">{c.customer.name}</Anchor></Table.Td>
                      <Table.Td>
                        {PAYMENT_LABELS[c.paymentMethod] ?? c.paymentMethod}
                        {c.referenceNumber && <Text size="xs" c="dimmed">{c.referenceNumber}</Text>}
                      </Table.Td>
                      <Table.Td ta="right" fw={600}>{fmtBob(c.amount)}</Table.Td>
                      <Table.Td>
                        {c.receivedBy.fullName}
                        <Text size="xs" c="dimmed">{PAYMENT_SOURCE_LABELS[c.paymentSource] ?? c.paymentSource}{c.paidByName ? ` · pagó ${c.paidByName}` : ''}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Group gap={4}>
                            <Badge variant="light" color={c.status === 'VALID' ? 'green' : 'gray'}>{c.status === 'VALID' ? 'Vigente' : 'Anulado'}</Badge>
                            {c.isAdvance && <Badge variant="light" color="blue">Anticipo</Badge>}
                          </Group>
                          {c.annulReason && <Text size="xs" c="dimmed">{c.annulReason} · {c.annulledBy?.fullName}</Text>}
                        </Stack>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        <Tooltip label="Ver recibo">
                          <ActionIcon variant="subtle" onClick={() => setReceiptId(c.id)} aria-label="Ver recibo">
                            <IconReceipt size={16} />
                          </ActionIcon>
                        </Tooltip>
                        {c.status === 'VALID' && can('collections.annul') && (
                          <Tooltip label="Anular cobro">
                            <ActionIcon variant="subtle" color="red" onClick={() => setAnnulling(c)} aria-label="Anular cobro">
                              <IconBan size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      </QueryState>
        </Tabs.Panel>
      </Tabs>

      <CollectionReceiptModal id={receiptId} onClose={() => setReceiptId(null)} />
      <CollectionModal opened={collecting} onClose={() => setCollecting(false)} customer={selected} />

      <Modal opened={!!annulling} onClose={() => setAnnulling(null)} title={`Anular cobro ${annulling?.receiptNumber ?? ''}`}>
        <Stack>
          <Text size="sm">
            El cobro de {annulling && fmtBob(annulling.amount)} no se borra: queda anulado y la deuda del cliente vuelve a subir en ese monto.
          </Text>
          <Textarea label="Motivo" withAsterisk value={reason} onChange={(e) => setReason(e.currentTarget.value)} autosize minRows={2} />
          <Button color="red" disabled={!reason.trim()} loading={annul.isPending} onClick={() => annul.mutate()}>Confirmar anulación</Button>
        </Stack>
      </Modal>
    </>
  );
}

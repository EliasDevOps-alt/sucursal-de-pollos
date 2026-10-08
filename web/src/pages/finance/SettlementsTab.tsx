import { Alert, Badge, Button, Card, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconCashBanknote } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CashAccountRow, PendingSettlement, SettlementRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDateTime, PAYMENT_LABELS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { INVALIDATE_CASH } from './CashModals';

function PaymentsTable({ payments }: { payments: PendingSettlement['payments'] }) {
  return (
    <Table.ScrollContainer minWidth={520} mah={320}>
      <Table striped style={{ fontVariantNumeric: 'tabular-nums' }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Fecha</Table.Th>
            <Table.Th>Cliente / documento</Table.Th>
            <Table.Th>Método</Table.Th>
            <Table.Th ta="right">Monto</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {payments.map((p) => (
            <Table.Tr key={p.id}>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(p.paymentDate)}</Table.Td>
              <Table.Td>
                {p.customer?.name ?? '—'}
                <Text size="xs" c="dimmed">{p.sale ? `Venta ${p.sale.saleNumber}` : p.receiptNumber ? `Recibo ${p.receiptNumber}` : ''}</Text>
              </Table.Td>
              <Table.Td>{PAYMENT_LABELS[p.paymentMethod] ?? p.paymentMethod}{p.referenceNumber ? ` · ${p.referenceNumber}` : ''}</Table.Td>
              <Table.Td ta="right">{fmtBob(p.amount)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function ReceiveModal({ pending, accounts, onClose }: { pending: PendingSettlement | null; accounts: CashAccountRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [counted, setCounted] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!pending) return;
    setAccountId(accounts.find((a) => a.code === 'CAJA-CEN')?.id ?? accounts.find((a) => a.type === 'CASH')?.id ?? null);
    setCounted(Number(pending.cash));
    setNotes('');
  }, [pending, accounts]);
  const diff = Math.round((Number(counted || 0) - Number(pending?.cash ?? 0)) * 100) / 100;
  const save = useMutation({
    mutationFn: async () => api.post<SettlementRow>('/cash/settlements', { userId: pending!.user.id, cashAccountId: accountId, countedCash: Number(counted || 0), notes: notes || undefined }),
    onSuccess: (r) => {
      notifyOk(`Rendición ${r.data.settlementNumber} registrada`);
      for (const k of INVALIDATE_CASH) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
    onError: notifyError,
  });
  return (
    <Modal opened={!!pending} onClose={onClose} title={pending ? `Rendición de ${pending.user.fullName}` : ''} size="lg">
      {pending && (
        <Stack>
          <SimpleGrid cols={3}>
            <div><Text size="xs" c="dimmed">Efectivo esperado</Text><Text fw={700} size="lg">{fmtBob(pending.cash)}</Text></div>
            <div><Text size="xs" c="dimmed">QR y transferencias</Text><Text fw={700} size="lg">{fmtBob(pending.digital)}</Text></div>
            <div><Text size="xs" c="dimmed">Cobros</Text><Text fw={700} size="lg">{pending.count}</Text></div>
          </SimpleGrid>
          <PaymentsTable payments={pending.payments} />
          <Text size="xs" c="dimmed">Los QR y transferencias ya están en el banco: al rendir se confirman y se registran en la cuenta bancaria.</Text>
          <Group grow align="flex-start">
            <Select label="Caja que recibe" allowDeselect={false} value={accountId} onChange={setAccountId}
              data={accounts.filter((a) => a.type === 'CASH').map((a) => ({ value: a.id, label: a.name }))} />
            <NumberInput label="Efectivo contado" withAsterisk min={0} decimalScale={2} value={counted} onChange={(v) => setCounted(v as number | '')} />
          </Group>
          {diff !== 0 && <Alert color={diff < 0 ? 'red' : 'orange'}>{diff < 0 ? `Faltan ${fmtBob(-diff)}` : `Sobran ${fmtBob(diff)}`}: quedará registrado en la rendición.</Alert>}
          <Textarea label="Observaciones" withAsterisk={diff !== 0} autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
          <Button loading={save.isPending} disabled={!accountId || (diff !== 0 && !notes.trim())} onClick={() => save.mutate()}>Recibir rendición</Button>
        </Stack>
      )}
    </Modal>
  );
}

function SettlementModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: s, isLoading, error } = useQuery({ queryKey: ['cash', 'settlement', id], queryFn: async () => (await api.get<SettlementRow>(`/cash/settlements/${id}`)).data, enabled: !!id });
  return (
    <Modal opened={!!id} onClose={onClose} title={s ? `Rendición ${s.settlementNumber}` : 'Rendición'} size="lg">
      <QueryState isLoading={isLoading} error={error}>
        {s && (
          <Stack>
            <Text size="sm">{s.user.fullName} entregó a {s.receivedBy.fullName} el {fmtDateTime(s.createdAt)} en {s.cashAccount.name}.</Text>
            <SimpleGrid cols={4}>
              <div><Text size="xs" c="dimmed">Esperado</Text><Text fw={600}>{fmtBob(s.expectedCash)}</Text></div>
              <div><Text size="xs" c="dimmed">Contado</Text><Text fw={600}>{fmtBob(s.countedCash)}</Text></div>
              <div><Text size="xs" c="dimmed">Diferencia</Text><Text fw={600} c={Number(s.cashDifference) < 0 ? 'red' : Number(s.cashDifference) > 0 ? 'orange' : 'green'}>{fmtBob(s.cashDifference)}</Text></div>
              <div><Text size="xs" c="dimmed">QR y transf.</Text><Text fw={600}>{fmtBob(s.digitalAmount)}</Text></div>
            </SimpleGrid>
            {s.notes && <Text size="sm">Observaciones: {s.notes}</Text>}
            {s.payments && <PaymentsTable payments={s.payments} />}
          </Stack>
        )}
      </QueryState>
    </Modal>
  );
}

export function SettlementsTab({ accounts }: { accounts: CashAccountRow[] }) {
  const { can } = useAuth();
  const [receiving, setReceiving] = useState<PendingSettlement | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const pending = useQuery({ queryKey: ['cash', 'pending'], queryFn: async () => (await api.get<PendingSettlement[]>('/cash/settlements/pending')).data, refetchInterval: 30_000 });
  const history = useQuery({ queryKey: ['cash', 'settlements'], queryFn: async () => (await api.get<SettlementRow[]>('/cash/settlements')).data });

  return (
    <Stack>
      <QueryState isLoading={pending.isLoading} error={pending.error}>
        {pending.data?.length === 0 ? (
          <Card withBorder><Text c="dimmed">Nadie tiene cobros pendientes de rendir.</Text></Card>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
            {pending.data?.map((p) => (
              <Card withBorder key={p.user.id}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text fw={600}>{p.user.fullName}</Text>
                    <Text size="xs" c="dimmed">{p.user.role} · {p.count} cobros desde {fmtDateTime(p.since)}</Text>
                  </div>
                  <Badge color="orange" variant="light" style={{ minWidth: 'max-content' }}>Por rendir</Badge>
                </Group>
                <Group mt="sm" gap="xl">
                  <div><Text size="xs" c="dimmed">Efectivo</Text><Text fw={700} size="lg">{fmtBob(p.cash)}</Text></div>
                  <div><Text size="xs" c="dimmed">QR y transf.</Text><Text fw={700} size="lg">{fmtBob(p.digital)}</Text></div>
                </Group>
                {can('settlements.manage') && (
                  <Button mt="sm" variant="light" leftSection={<IconCashBanknote size={16} />} onClick={() => setReceiving(p)}>Recibir rendición</Button>
                )}
              </Card>
            ))}
          </SimpleGrid>
        )}
      </QueryState>
      <Card withBorder p={0}>
        <Text fw={600} p="md" pb={0}>Rendiciones recibidas</Text>
        <QueryState isLoading={history.isLoading} error={history.error}>
          <Table.ScrollContainer minWidth={820}>
            <Table striped highlightOnHover style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N.º</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Rindió</Table.Th>
                  <Table.Th ta="right">Esperado</Table.Th>
                  <Table.Th ta="right">Contado</Table.Th>
                  <Table.Th ta="right">Diferencia</Table.Th>
                  <Table.Th ta="right">QR y transf.</Table.Th>
                  <Table.Th>Recibió</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.data?.map((s) => (
                  <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setViewing(s.id)}>
                    <Table.Td fw={600}>{s.settlementNumber}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(s.createdAt)}</Table.Td>
                    <Table.Td>{s.user.fullName}</Table.Td>
                    <Table.Td ta="right">{fmtBob(s.expectedCash)}</Table.Td>
                    <Table.Td ta="right">{fmtBob(s.countedCash)}</Table.Td>
                    <Table.Td ta="right" c={Number(s.cashDifference) < 0 ? 'red' : Number(s.cashDifference) > 0 ? 'orange' : undefined}>
                      {Number(s.cashDifference) === 0 ? '—' : fmtBob(s.cashDifference)}
                    </Table.Td>
                    <Table.Td ta="right">{fmtBob(s.digitalAmount)}</Table.Td>
                    <Table.Td>{s.receivedBy.fullName}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </QueryState>
      </Card>
      <ReceiveModal pending={receiving} accounts={accounts} onClose={() => setReceiving(null)} />
      <SettlementModal id={viewing} onClose={() => setViewing(null)} />
    </Stack>
  );
}

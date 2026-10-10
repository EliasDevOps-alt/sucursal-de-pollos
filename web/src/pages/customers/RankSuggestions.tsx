import { Alert, Anchor, Badge, Button, Card, Checkbox, Group, Modal, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconTrendingUp } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { RankSuggestion } from '../../api/types';
import { fmtBob, fmtPct } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

/** Clientes que ya cumplen las condiciones de un rango superior. El sistema sugiere; quien tiene permiso aprueba. */
export function RankSuggestions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [approving, setApproving] = useState<RankSuggestion | null>(null);
  const [reason, setReason] = useState('');
  const [raiseLimit, setRaiseLimit] = useState(true);
  const { data } = useQuery({
    queryKey: ['customers', 'rank-suggestions'],
    queryFn: async () => (await api.get<RankSuggestion[]>('/customers/rank-suggestions')).data,
  });
  const approve = useMutation({
    mutationFn: async (s: RankSuggestion) =>
      api.patch(`/customers/${s.customer.id}`, {
        rankId: s.suggestedRank.id,
        rankChangeReason: reason.trim(),
        ...(raiseLimit && Number(s.suggestedRank.creditLimit) > Number(s.currentCreditLimit) ? { creditLimit: Number(s.suggestedRank.creditLimit) } : {}),
      }),
    onSuccess: (_, s) => {
      notifyOk(`${s.customer.name} sube a ${s.suggestedRank.name}`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      setApproving(null);
    },
    onError: notifyError,
  });

  if (!data?.length) return null;
  const start = (s: RankSuggestion) => {
    setApproving(s);
    setReason(`Sugerencia del sistema: ${s.reason}.`);
    setRaiseLimit(true);
  };

  return (
    <>
      <Alert variant="light" color="blue" icon={<IconTrendingUp size={18} />} mb="sm">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text size="sm">
            {data.length === 1 ? '1 cliente cumple' : `${data.length} clientes cumplen`} las condiciones para subir de rango (compra promedio y pagos al día).
          </Text>
          <Button size="xs" variant="light" onClick={() => setOpen((o) => !o)}>{open ? 'Ocultar' : 'Ver sugerencias'}</Button>
        </Group>
      </Alert>
      {open && (
        <Card withBorder p={0} mb="sm">
          <Table.ScrollContainer minWidth={760}>
            <Table striped style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Rango</Table.Th>
                  <Table.Th ta="right">Compra promedio / mes</Table.Th>
                  <Table.Th ta="right">Deuda más antigua</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((s) => (
                  <Table.Tr key={s.customer.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/clientes/${s.customer.id}`} size="sm" fw={500}>{s.customer.name}</Anchor>
                      <Text size="xs" c="dimmed">{s.sales} ventas en 90 días</Text>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {s.currentRank?.name ?? 'Sin rango'} → <Badge variant="light" color="blue" style={{ minWidth: 'max-content' }}>{s.suggestedRank.name}</Badge>
                    </Table.Td>
                    <Table.Td ta="right">{fmtBob(s.monthlyAverage)}</Table.Td>
                    <Table.Td ta="right">{s.oldestDebtDays === null ? 'sin deuda' : `${s.oldestDebtDays} días`}</Table.Td>
                    <Table.Td ta="right"><Button size="xs" onClick={() => start(s)}>Ascender</Button></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}
      <Modal opened={!!approving} onClose={() => setApproving(null)} title={approving ? `${approving.customer.name}: subir a ${approving.suggestedRank.name}` : ''}>
        {approving && (
          <Stack>
            <Text size="sm">
              {approving.suggestedRank.name}: {fmtPct(approving.suggestedRank.discountPercentage)} de descuento y límite de crédito de {fmtBob(approving.suggestedRank.creditLimit)}.
            </Text>
            {Number(approving.suggestedRank.creditLimit) > Number(approving.currentCreditLimit) && (
              <Checkbox
                checked={raiseLimit}
                onChange={(e) => setRaiseLimit(e.currentTarget.checked)}
                label={`Subir su límite de crédito de ${fmtBob(approving.currentCreditLimit)} a ${fmtBob(approving.suggestedRank.creditLimit)}`}
              />
            )}
            <Textarea label="Motivo" withAsterisk autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
            <Button loading={approve.isPending} disabled={!reason.trim()} onClick={() => approve.mutate(approving)}>Confirmar ascenso</Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}

import { Alert, Button, Group, Modal, NumberInput, PasswordInput, SegmentedControl, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { SaleDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { fmtBob, fmtKg } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

type Line = { weightKg: number | ''; disposition: 'RESTOCK' | 'DISCARD' };

const remainingOf = (i: SaleDetail['items'][number]) => Math.round((Number(i.requestedWeightKg) - Number(i.returnedWeightKg)) * 1000) / 1000;

/** Importe a devolver de una línea: lo que falta si se devuelve todo; si no, la parte proporcional al peso. */
function lineAmount(i: SaleDetail['items'][number], kg: number) {
  if (!kg) return 0;
  if (kg >= remainingOf(i)) return Number(i.subtotal) - Number(i.returnedAmount);
  return Math.round((Number(i.subtotal) * kg / Number(i.requestedWeightKg)) * 100) / 100;
}

export function ReturnModal({ sale, opened, onClose }: { sale: SaleDetail; opened: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<'CREDIT' | 'CASH'>('CASH');
  const [supervisor, setSupervisor] = useState({ username: '', password: '' });
  const needsSupervisor = !can('sales.return');

  useEffect(() => {
    if (!opened) return;
    setLines(Object.fromEntries(sale.items.map((i) => [i.id, { weightKg: '', disposition: 'RESTOCK' }])));
    setReason('');
    setRefund(sale.customer && Number(sale.creditAmount) > 0 ? 'CREDIT' : 'CASH');
    setSupervisor({ username: '', password: '' });
  }, [opened, sale]);

  const chosen = sale.items.filter((i) => Number(lines[i.id]?.weightKg) > 0);
  const total = chosen.reduce((s, i) => s + lineAmount(i, Number(lines[i.id].weightKg)), 0);
  const tooMuch = chosen.some((i) => Number(lines[i.id].weightKg) > remainingOf(i));

  const save = useMutation({
    mutationFn: async () =>
      api.post(`/sales/${sale.id}/returns`, {
        reason,
        refundMethod: refund,
        items: chosen.map((i) => ({ saleItemId: i.id, weightKg: Number(lines[i.id].weightKg), disposition: lines[i.id].disposition })),
        authorization: needsSupervisor ? supervisor : undefined,
      }),
    onSuccess: (res) => {
      notifyOk(`Devolución ${res.data.returnNumber} registrada`);
      onClose();
      for (const key of ['sales', 'lots', 'customers', 'inventory-stock', 'inventory-movements']) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: notifyError,
  });

  return (
    <Modal opened={opened} onClose={onClose} title={`Devolución de la venta ${sale.saleNumber}`} size="xl">
      <Stack>
        <Text size="sm" c="dimmed">
          Indique cuántos kilos devuelve el cliente de cada producto. Lo que está en buen estado reingresa al mismo lote; lo descartado se registra como pérdida.
        </Text>
        <Table.ScrollContainer minWidth={640}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">Puede devolver</Table.Th>
                <Table.Th>Kg devueltos</Table.Th>
                <Table.Th>Destino</Table.Th>
                <Table.Th ta="right">Importe</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sale.items.map((i) => {
                const rem = remainingOf(i);
                const line = lines[i.id] ?? { weightKg: '', disposition: 'RESTOCK' };
                const set = (patch: Partial<Line>) => setLines((ls) => ({ ...ls, [i.id]: { ...line, ...patch } }));
                return (
                  <Table.Tr key={i.id}>
                    <Table.Td fw={500}>{i.product.name}</Table.Td>
                    <Table.Td ta="right">{fmtKg(rem)}</Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <NumberInput size="xs" w={100} min={0} max={rem} decimalScale={3} disabled={rem <= 0} value={line.weightKg}
                          error={Number(line.weightKg) > rem} onChange={(v) => set({ weightKg: v as number | '' })} aria-label={`Kg devueltos de ${i.product.name}`} />
                        {rem > 0 && <Button size="compact-xs" variant="subtle" onClick={() => set({ weightKg: rem })}>Todo</Button>}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <SegmentedControl size="xs" disabled={rem <= 0} value={line.disposition} onChange={(v) => set({ disposition: v as Line['disposition'] })}
                        data={[{ value: 'RESTOCK', label: 'Reingresa' }, { value: 'DISCARD', label: 'Se descarta' }]} />
                    </Table.Td>
                    <Table.Td ta="right">{Number(line.weightKg) > 0 ? fmtBob(lineAmount(i, Math.min(Number(line.weightKg), rem))) : '—'}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        <Group align="flex-end" justify="space-between">
          <div>
            <Text size="sm" fw={500} mb={4}>Cómo se devuelve el dinero</Text>
            <SegmentedControl
              value={refund}
              onChange={(v) => setRefund(v as 'CREDIT' | 'CASH')}
              data={[
                { value: 'CREDIT', label: 'Descontar de la deuda', disabled: !sale.customer },
                { value: 'CASH', label: 'Efectivo' },
              ]}
            />
          </div>
          <Text fw={700} size="lg">A devolver {fmtBob(total)}</Text>
        </Group>
        {refund === 'CREDIT' && <Text size="xs" c="dimmed">Si el cliente no tiene deuda, el importe queda como saldo a favor.</Text>}

        <Textarea label="Motivo" withAsterisk autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="Ej.: producto con mal olor al abrir la bolsa" />

        {needsSupervisor && (
          <Alert color="orange" title="Requiere autorización">
            <Text size="xs" mb="xs">Ingrese las credenciales de un supervisor con permiso para autorizar devoluciones:</Text>
            <Group grow>
              <TextInput size="xs" placeholder="Usuario" autoComplete="off" value={supervisor.username} onChange={(e) => setSupervisor((s) => ({ ...s, username: e.currentTarget.value }))} />
              <PasswordInput size="xs" placeholder="Contraseña" autoComplete="new-password" value={supervisor.password} onChange={(e) => setSupervisor((s) => ({ ...s, password: e.currentTarget.value }))} />
            </Group>
          </Alert>
        )}

        <Button
          loading={save.isPending}
          disabled={!chosen.length || tooMuch || reason.trim().length < 5 || (needsSupervisor && (!supervisor.username || !supervisor.password))}
          onClick={() => save.mutate()}
        >
          Registrar devolución
        </Button>
      </Stack>
    </Modal>
  );
}

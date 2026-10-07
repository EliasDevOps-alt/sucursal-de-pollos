import { Alert, Anchor, Badge, Button, Card, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconClipboardCheck, IconTrashX } from '@tabler/icons-react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Adjustment, AdjustmentKind, LotBalance, Warehouse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { QueryState } from '../../components/QueryState';
import { ADJUSTMENT_REASONS, fmtBob, fmtDate, fmtDateTime, fmtKg } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

const INVALIDATE = ['adjustments', 'inventory-stock', 'inventory-movements', 'inventory-lots', 'lots'];
const LOSS_REASONS = ['EXPIRED', 'DAMAGED', 'SPOILED', 'THEFT', 'OTHER'];

type Draft = { kind: AdjustmentKind; warehouseId?: string; lotId?: string; weightKg?: number; reasonCode?: string; notes?: string };

export function AdjustmentsTab({ warehouseId }: { warehouseId: string | null }) {
  const { can } = useAuth();
  const [kind, setKind] = useState('ALL');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [annulling, setAnnulling] = useState<Adjustment | null>(null);
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data });
  const { data, isLoading, error } = useQuery({
    queryKey: ['adjustments', kind, warehouseId],
    queryFn: async () =>
      (await api.get<Adjustment[]>('/inventory/adjustments', { params: { kind: kind === 'ALL' ? undefined : kind, warehouseId: warehouseId ?? undefined } })).data,
  });

  // Lotes vencidos que todavía tienen saldo: no se pueden vender y deben darse de baja.
  const visible = (warehouses.data ?? []).filter((w) => !warehouseId || w.id === warehouseId);
  const lotQueries = useQueries({
    queries: visible.map((w) => ({
      queryKey: ['inventory-lots', w.id],
      queryFn: async () => (await api.get<LotBalance[]>('/inventory/lots', { params: { warehouseId: w.id } })).data,
    })),
  });
  const expired = visible.flatMap((w, i) => (lotQueries[i]?.data ?? []).filter((l) => l.expired).map((l) => ({ ...l, warehouse: w })));
  const canAdjust = can('inventory.adjust');

  return (
    <>
      {expired.length > 0 && (
        <Alert color="red" mb="md" title={`${expired.length} lote(s) vencido(s) con saldo`}>
          <Text size="sm" mb="xs">No se pueden vender. Si ya no sirven, dé de baja el saldo para que el stock y su valor sean reales.</Text>
          <Table>
            <Table.Tbody>
              {expired.map((l) => (
                <Table.Tr key={`${l.warehouse.id}-${l.lotId}`}>
                  <Table.Td><Anchor component={Link} to={`/lotes/${l.lotId}`} size="sm">{l.lotCode}</Anchor></Table.Td>
                  <Table.Td>{l.product.name}</Table.Td>
                  <Table.Td>{l.warehouse.name}</Table.Td>
                  <Table.Td>venció {fmtDate(l.expiryDate)}</Table.Td>
                  <Table.Td ta="right">{fmtKg(l.weightKg)} · {fmtBob(l.value)}</Table.Td>
                  <Table.Td ta="right">
                    {canAdjust && (
                      <Button size="compact-xs" color="red" variant="light"
                        onClick={() => setDraft({ kind: 'LOSS', warehouseId: l.warehouse.id, lotId: l.lotId, weightKg: Number(l.weightKg), reasonCode: 'EXPIRED', notes: 'Lote vencido' })}>
                        Dar de baja
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Alert>
      )}
      <Group justify="space-between" mb="sm">
        <SegmentedControl value={kind} onChange={setKind} data={[{ value: 'ALL', label: 'Todos' }, { value: 'COUNT', label: 'Conteos' }, { value: 'LOSS', label: 'Bajas' }]} />
        {canAdjust && (
          <Group gap="xs">
            <Button variant="light" leftSection={<IconClipboardCheck size={16} />} onClick={() => setDraft({ kind: 'COUNT', warehouseId: warehouseId ?? undefined })}>Conteo físico</Button>
            <Button variant="light" color="red" leftSection={<IconTrashX size={16} />} onClick={() => setDraft({ kind: 'LOSS', warehouseId: warehouseId ?? undefined })}>Dar de baja</Button>
          </Group>
        )}
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">Sin ajustes ni bajas registrados.</Text>
          ) : (
            <Table.ScrollContainer minWidth={1080}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>N.º / fecha</Table.Th>
                    <Table.Th>Motivo</Table.Th>
                    <Table.Th>Producto / lote</Table.Th>
                    <Table.Th>Almacén</Table.Th>
                    <Table.Th ta="right">Sistema → nuevo</Table.Th>
                    <Table.Th ta="right">Diferencia</Table.Th>
                    <Table.Th ta="right">Valor</Table.Th>
                    <Table.Th>Registró</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((a) => {
                    const annulled = a.status === 'ANNULLED';
                    return (
                      <Table.Tr key={a.id} opacity={annulled ? 0.55 : 1}>
                        <Table.Td>
                          <Text size="sm" fw={600}>{a.adjustmentNumber}</Text>
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.createdAt)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            <Badge size="sm" variant="light" color={a.kind === 'COUNT' ? 'blue' : 'red'}>{a.kind === 'COUNT' ? 'Conteo' : 'Baja'}</Badge>
                            {a.kind === 'LOSS' && <Text size="sm">{ADJUSTMENT_REASONS[a.reasonCode]}</Text>}
                            {annulled && <Badge size="sm" color="gray">Anulado</Badge>}
                          </Group>
                          <Text size="xs" c="dimmed" maw={260}>{a.notes}</Text>
                          {annulled && <Text size="xs" c="dimmed">Anuló {a.annulledBy?.fullName}: {a.annulReason}</Text>}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{a.product.name}</Text>
                          <Anchor component={Link} to={`/lotes/${a.lot.id}`} size="xs">{a.lot.lotCode}</Anchor>
                        </Table.Td>
                        <Table.Td>{a.warehouse.name}</Table.Td>
                        <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{fmtKg(a.systemWeightKg)} → {fmtKg(a.newWeightKg)}</Table.Td>
                        <Table.Td ta="right" fw={600} c={Number(a.weightKg) < 0 ? 'red' : 'green'} style={{ whiteSpace: 'nowrap' }}>{Number(a.weightKg) > 0 ? '+' : ''}{fmtKg(a.weightKg)}</Table.Td>
                        <Table.Td ta="right" c={Number(a.amount) < 0 ? 'red' : 'green'} style={{ whiteSpace: 'nowrap' }}>{fmtBob(a.amount)}</Table.Td>
                        <Table.Td>{a.createdBy.fullName}</Table.Td>
                        <Table.Td>
                          {!annulled && canAdjust && <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setAnnulling(a)}>Anular</Button>}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      </QueryState>
      <AdjustmentModal draft={draft} onClose={() => setDraft(null)} warehouses={warehouses.data ?? []} />
      <AnnulModal adjustment={annulling} onClose={() => setAnnulling(null)} />
    </>
  );
}

function AdjustmentModal({ draft, onClose, warehouses }: { draft: Draft | null; onClose: () => void; warehouses: Warehouse[] }) {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [lotId, setLotId] = useState<string | null>(null);
  const [weight, setWeight] = useState<number | ''>('');
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!draft) return;
    setWarehouseId(draft.warehouseId ?? warehouses.find((w) => w.type === 'CENTRAL')?.id ?? null);
    setLotId(draft.lotId ?? null);
    setWeight(draft.weightKg ?? '');
    setReasonCode(draft.kind === 'COUNT' ? 'PHYSICAL_COUNT' : draft.reasonCode ?? null);
    setNotes(draft.notes ?? '');
  }, [draft, warehouses]);

  const lots = useQuery({
    queryKey: ['inventory-lots', warehouseId],
    queryFn: async () => (await api.get<LotBalance[]>('/inventory/lots', { params: { warehouseId } })).data,
    enabled: !!draft && !!warehouseId,
  });
  const lot = lots.data?.find((l) => l.lotId === lotId);
  const isCount = draft?.kind === 'COUNT';
  const system = Number(lot?.weightKg ?? 0);
  const delta = weight === '' || !lot ? null : isCount ? Number(weight) - system : -Number(weight);
  const tooMuch = !isCount && lot && Number(weight) > system;

  const save = useMutation({
    mutationFn: async () =>
      api.post<Adjustment>('/inventory/adjustments', {
        kind: draft!.kind,
        reasonCode,
        warehouseId,
        lotId,
        ...(isCount ? { countedWeightKg: Number(weight) } : { weightKg: Number(weight) }),
        notes,
      }),
    onSuccess: (res) => {
      notifyOk(`${res.data.adjustmentNumber} registrado`);
      for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: notifyError,
  });

  return (
    <Modal opened={!!draft} onClose={onClose} title={isCount ? 'Ajuste por conteo físico' : 'Baja de inventario'} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {isCount
            ? 'Pese el lote y registre lo contado: el saldo del sistema pasa a ese peso y la diferencia queda en el kardex con su valor.'
            : 'Saca del stock lo que ya no se puede vender. Queda registrado como pérdida, con su motivo y su valor a costo real.'}
        </Text>
        <Select label="Almacén" allowDeselect={false} value={warehouseId} onChange={(v) => { setWarehouseId(v); setLotId(null); }}
          data={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
        <Select label="Lote" searchable placeholder="Elija el lote" value={lotId} onChange={setLotId} nothingFoundMessage="Sin lotes con saldo"
          data={(lots.data ?? []).map((l) => ({ value: l.lotId, label: `${l.lotCode} · ${l.product.name} · ${fmtKg(l.weightKg)}${l.expired ? ' · VENCIDO' : ` · vence ${fmtDate(l.expiryDate)}`}` }))} />
        {!isCount && (
          <Select label="Motivo de la baja" withAsterisk value={reasonCode} onChange={setReasonCode} data={LOSS_REASONS.map((r) => ({ value: r, label: ADJUSTMENT_REASONS[r] }))} />
        )}
        <Group align="flex-end">
          <NumberInput label={isCount ? 'Peso contado (kg)' : 'Kg a dar de baja'} withAsterisk w={200} min={0} decimalScale={3} value={weight}
            onChange={(v) => setWeight(v as number | '')} error={tooMuch ? `El lote tiene ${fmtKg(system)}` : undefined} />
          {lot && !isCount && <Button variant="subtle" size="xs" mb={4} onClick={() => setWeight(system)}>Todo el saldo</Button>}
        </Group>
        {lot && delta !== null && (
          <Text size="sm">
            Sistema {fmtKg(system)} → <b>{fmtKg((system + delta).toFixed(3))}</b> · diferencia{' '}
            <Text span fw={600} c={delta < 0 ? 'red' : 'green'}>{delta > 0 ? '+' : ''}{fmtKg(delta.toFixed(3))}</Text> ·{' '}
            {fmtBob(delta * Number(lot.costPerKg))}
          </Text>
        )}
        <Textarea label="Explicación" withAsterisk autosize minRows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder={isCount ? 'Ej.: conteo semanal de cámara' : 'Ej.: bolsas rotas al descargar'} />
        <Button color={isCount ? undefined : 'red'} loading={save.isPending}
          disabled={!lot || weight === '' || !reasonCode || notes.trim().length < 5 || !!tooMuch || (isCount && delta !== null && Math.abs(delta) < 0.0005) || (!isCount && Number(weight) <= 0)}
          onClick={() => save.mutate()}>
          {isCount ? 'Registrar ajuste' : 'Registrar baja'}
        </Button>
      </Stack>
    </Modal>
  );
}

function AnnulModal({ adjustment, onClose }: { adjustment: Adjustment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [adjustment]);
  const annul = useMutation({
    mutationFn: async () => api.post(`/inventory/adjustments/${adjustment!.id}/annul`, { reason }),
    onSuccess: () => {
      notifyOk('Ajuste anulado: el saldo volvió a como estaba');
      for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: notifyError,
  });
  return (
    <Modal opened={!!adjustment} onClose={onClose} title={`Anular ${adjustment?.adjustmentNumber ?? ''}`}>
      <Stack>
        <Text size="sm">No se borra: se registra el movimiento inverso en el kardex. Si ese stock ya se vendió o se movió, no se puede anular.</Text>
        <Textarea label="Motivo" withAsterisk autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Button color="red" disabled={!reason.trim()} loading={annul.isPending} onClick={() => annul.mutate()}>Anular</Button>
      </Stack>
    </Modal>
  );
}

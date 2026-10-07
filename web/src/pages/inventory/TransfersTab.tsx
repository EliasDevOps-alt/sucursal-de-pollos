import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { IconPlus, IconTrash, IconTruckDelivery } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { LotBalance, Transfer, Warehouse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDate, fmtDateTime, fmtKg, TRANSFER_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

const INVALIDATE = ['transfers', 'inventory-stock', 'inventory-movements', 'inventory-lots', 'lots'];
const sumKg = (xs: (string | null)[]) => xs.reduce((s, x) => s + Number(x ?? 0), 0);

export function TransfersTab({ warehouseId }: { warehouseId: string | null }) {
  const { can } = useAuth();
  const [status, setStatus] = useState('IN_TRANSIT');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['transfers', status, warehouseId],
    queryFn: async () =>
      (await api.get<Transfer[]>('/transfers', { params: { status: status === 'ALL' ? undefined : status, warehouseId: warehouseId ?? undefined } })).data,
  });
  const open = data?.find((t) => t.id === openId) ?? null;

  return (
    <>
      <Group justify="space-between" mb="sm">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          data={[
            { value: 'IN_TRANSIT', label: 'En tránsito' },
            { value: 'RECEIVED', label: 'Recibidas' },
            { value: 'CANCELLED', label: 'Canceladas' },
            { value: 'ALL', label: 'Todas' },
          ]}
        />
        {can('transfers.create') && (
          <Button leftSection={<IconTruckDelivery size={16} />} onClick={() => setCreating(true)}>Nueva transferencia</Button>
        )}
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No hay transferencias con este filtro.</Text>
          ) : (
            <Table.ScrollContainer minWidth={980}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>N.º</Table.Th>
                    <Table.Th>Enviada</Table.Th>
                    <Table.Th>Origen → destino</Table.Th>
                    <Table.Th>Productos</Table.Th>
                    <Table.Th ta="right">Enviado</Table.Th>
                    <Table.Th ta="right">Recibido</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((t) => {
                    const sent = sumKg(t.items.map((i) => i.sentWeightKg));
                    const diff = sumKg(t.items.map((i) => i.differenceKg));
                    return (
                      <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(t.id)}>
                        <Table.Td fw={600} style={{ whiteSpace: 'nowrap' }}>{t.transferNumber}</Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(t.sentAt)}</Table.Td>
                        <Table.Td>{t.origin.name} → {t.destination.name}</Table.Td>
                        <Table.Td>{[...new Set(t.items.map((i) => i.product.name))].join(', ')}</Table.Td>
                        <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{fmtKg(sent)}</Table.Td>
                        <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                          {t.status === 'RECEIVED' ? (
                            <>
                              {fmtKg(sent - diff)}
                              {diff > 0 && <Text size="xs" c="red">faltan {fmtKg(diff)}</Text>}
                            </>
                          ) : '—'}
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}><Badge variant="light" style={{ minWidth: 'max-content' }} color={TRANSFER_STATUS[t.status].color}>{TRANSFER_STATUS[t.status].label}</Badge></Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      </QueryState>
      <NewTransferModal opened={creating} onClose={() => setCreating(false)} />
      <TransferModal transfer={open} onClose={() => setOpenId(null)} />
    </>
  );
}

type Line = { key: number; productId: string | null; weightKg: number | ''; lotId: string | null };

function NewTransferModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data });
  const [origin, setOrigin] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!opened || !warehouses.data) return;
    // Un usuario de sucursal envía desde su almacén; el resto, por defecto desde el central hacia una sucursal.
    const own = warehouses.data.find((w) => user?.branchId && w.branch?.id === user.branchId);
    const cen = warehouses.data.find((w) => w.type === 'CENTRAL');
    const from = own ?? cen ?? null;
    setOrigin(from?.id ?? null);
    setDestination(warehouses.data.find((w) => w.id !== from?.id && (from?.type === 'CENTRAL' ? w.type === 'BRANCH' : w.type === 'CENTRAL'))?.id ?? null);
    setLines([{ key: Date.now(), productId: null, weightKg: '', lotId: null }]);
    setNotes('');
  }, [opened, warehouses.data, user]);

  const lots = useQuery({
    queryKey: ['inventory-lots', origin],
    queryFn: async () => (await api.get<LotBalance[]>('/inventory/lots', { params: { warehouseId: origin } })).data,
    enabled: opened && !!origin,
  });
  const sellable = useMemo(() => (lots.data ?? []).filter((l) => !l.expired), [lots.data]);
  const products = useMemo(() => {
    const m = new Map<string, { name: string; kg: number }>();
    for (const l of sellable) m.set(l.product.id, { name: l.product.name, kg: (m.get(l.product.id)?.kg ?? 0) + Number(l.weightKg) });
    return m;
  }, [sellable]);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const valid = lines.length > 0 && lines.every((l) => l.productId && Number(l.weightKg) > 0) && origin && destination && origin !== destination;

  const save = useMutation({
    mutationFn: async () =>
      api.post<Transfer>('/transfers', {
        originWarehouseId: origin,
        destinationWarehouseId: destination,
        notes: notes || undefined,
        items: lines.map((l) => ({ productId: l.productId, weightKg: Number(l.weightKg), lotId: l.lotId ?? undefined })),
      }),
    onSuccess: (res) => {
      notifyOk(`Transferencia ${res.data.transferNumber} enviada: el stock queda en tránsito hasta que el destino la reciba`);
      for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: notifyError,
  });

  const whOptions = (warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }));
  return (
    <Modal opened={opened} onClose={onClose} title="Nueva transferencia" size="xl">
      <Stack>
        <Group grow>
          <Select label="Origen" data={whOptions} value={origin} allowDeselect={false} disabled={!!user?.branchId}
            onChange={(v) => { setOrigin(v); setLines((ls) => ls.map((l) => ({ ...l, lotId: null }))); }} />
          <Select label="Destino" data={whOptions.filter((w) => w.value !== origin)} value={destination} allowDeselect={false} onChange={setDestination} />
        </Group>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th>Kg</Table.Th>
              <Table.Th>Lote</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l) => {
              const avail = l.productId ? products.get(l.productId)?.kg ?? 0 : 0;
              const lotOptions = sellable.filter((x) => x.product.id === l.productId);
              return (
                <Table.Tr key={l.key}>
                  <Table.Td>
                    <Select searchable placeholder="Producto con stock" value={l.productId} onChange={(v) => update(l.key, { productId: v, lotId: null })}
                      data={[...products.entries()].map(([id, p]) => ({ value: id, label: `${p.name} · ${fmtKg(p.kg.toFixed(3))}` }))} />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput w={110} min={0} decimalScale={3} value={l.weightKg} onChange={(v) => update(l.key, { weightKg: v as number | '' })}
                      error={Number(l.weightKg) > avail && l.productId ? `Máx. ${avail.toFixed(3)}` : undefined} aria-label="Kg a enviar" />
                  </Table.Td>
                  <Table.Td>
                    <Select clearable placeholder="FEFO automático" disabled={!l.productId} value={l.lotId} onChange={(v) => update(l.key, { lotId: v })}
                      data={lotOptions.map((x) => ({ value: x.lotId, label: `${x.lotCode} · ${fmtKg(x.weightKg)} · vence ${fmtDate(x.expiryDate)}` }))} />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon variant="subtle" color="red" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Quitar línea">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        <Button variant="subtle" leftSection={<IconPlus size={16} />} w="fit-content"
          onClick={() => setLines((ls) => [...ls, { key: Date.now(), productId: null, weightKg: '', lotId: null }])}>
          Agregar producto
        </Button>
        <Text size="xs" c="dimmed">Sin lote elegido se envía primero lo que vence antes (FEFO). Cada lote conserva su código y costo en el destino.</Text>
        <Textarea label="Observaciones" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>Enviar</Button>
      </Stack>
    </Modal>
  );
}

function TransferModal({ transfer: t, onClose }: { transfer: Transfer | null; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [received, setReceived] = useState<Record<string, number | ''>>({});
  const [notes, setNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!t) return;
    setReceived(Object.fromEntries(t.items.map((i) => [i.id, Number(i.sentWeightKg)])));
    setNotes('');
    setCancelReason('');
    setCancelling(false);
  }, [t]);

  const done = (msg: string) => {
    notifyOk(msg);
    for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
    onClose();
  };
  const receive = useMutation({
    mutationFn: async () =>
      api.post(`/transfers/${t!.id}/receive`, { notes: notes || undefined, items: t!.items.map((i) => ({ itemId: i.id, receivedWeightKg: Number(received[i.id] || 0) })) }),
    onSuccess: () => done('Transferencia recibida: el stock ya está en el destino'),
    onError: notifyError,
  });
  const cancel = useMutation({
    mutationFn: async () => api.post(`/transfers/${t!.id}/cancel`, { reason: cancelReason }),
    onSuccess: () => done('Transferencia cancelada: el stock volvió al origen'),
    onError: notifyError,
  });

  if (!t) return null;
  const inTransit = t.status === 'IN_TRANSIT';
  const canReceive = inTransit && can('transfers.receive');
  const weighing = t.destination.branch?.transferWeighingEnabled;
  const invalid = t.items.some((i) => received[i.id] === '' || Number(received[i.id]) > Number(i.sentWeightKg));

  return (
    <Modal opened onClose={onClose} title={`Transferencia ${t.transferNumber}`} size="xl">
      <Stack>
        <Group gap="xs">
          <Badge variant="light" color={TRANSFER_STATUS[t.status].color}>{TRANSFER_STATUS[t.status].label}</Badge>
          <Text size="sm">{t.origin.name} → {t.destination.name}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          Envió {t.sentBy.fullName} el {fmtDateTime(t.sentAt)}
          {t.receivedBy && t.receivedAt && ` · recibió ${t.receivedBy.fullName} el ${fmtDateTime(t.receivedAt)}`}
          {t.cancelledBy && t.cancelledAt && ` · canceló ${t.cancelledBy.fullName} el ${fmtDateTime(t.cancelledAt)}: ${t.cancelReason}`}
        </Text>
        {t.notes && <Text size="sm">Observaciones: {t.notes}</Text>}
        {canReceive && (
          <Alert color={weighing ? 'orange' : 'blue'}>
            {weighing
              ? 'Esta sucursal pesa lo que recibe: ingrese el peso de cada lote. La diferencia con lo enviado queda como pérdida en tránsito.'
              : 'Confirme lo recibido. Si llegó menos, corrija el peso: la diferencia queda como pérdida en tránsito.'}
          </Alert>
        )}
        <Table.ScrollContainer minWidth={620}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto / lote</Table.Th>
                <Table.Th ta="right">Enviado</Table.Th>
                <Table.Th ta="right">Recibido</Table.Th>
                <Table.Th ta="right">Diferencia</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {t.items.map((i) => {
                const diff = canReceive ? Number(i.sentWeightKg) - Number(received[i.id] || 0) : Number(i.differenceKg);
                return (
                  <Table.Tr key={i.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{i.product.name}</Text>
                      <Text size="xs" c="dimmed">{i.lot.lotCode} · vence {fmtDate(i.lot.expiryDate)}</Text>
                    </Table.Td>
                    <Table.Td ta="right">{fmtKg(i.sentWeightKg)}</Table.Td>
                    <Table.Td ta="right">
                      {canReceive ? (
                        <NumberInput size="xs" w={110} ml="auto" min={0} max={Number(i.sentWeightKg)} decimalScale={3} value={received[i.id]}
                          error={Number(received[i.id]) > Number(i.sentWeightKg)} onChange={(v) => setReceived((r) => ({ ...r, [i.id]: v as number | '' }))}
                          aria-label={`Kg recibidos de ${i.lot.lotCode}`} />
                      ) : i.receivedWeightKg != null ? fmtKg(i.receivedWeightKg) : '—'}
                    </Table.Td>
                    <Table.Td ta="right" c={diff > 0.0005 ? 'red' : undefined}>
                      {t.status === 'CANCELLED' ? '—' : diff > 0.0005 ? `−${fmtKg(diff.toFixed(3))}` : '0'}
                      {!canReceive && Number(i.lossAmount) > 0 && <Text size="xs" c="dimmed">{fmtBob(i.lossAmount)}</Text>}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {t.receiveNotes && <Text size="sm">Al recibir: {t.receiveNotes}</Text>}
        {canReceive && !cancelling && (
          <>
            <Textarea label="Observaciones de recepción" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
            <Button disabled={invalid} loading={receive.isPending} onClick={() => receive.mutate()}>Confirmar recepción</Button>
          </>
        )}
        {inTransit && can('transfers.create') && (
          cancelling ? (
            <Stack gap="xs">
              <Textarea label="Motivo de la cancelación" withAsterisk autosize minRows={1} value={cancelReason} onChange={(e) => setCancelReason(e.currentTarget.value)} />
              <Group>
                <Button color="red" disabled={!cancelReason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar transferencia</Button>
                <Button variant="default" onClick={() => setCancelling(false)}>Volver</Button>
              </Group>
            </Stack>
          ) : (
            <Button variant="subtle" color="red" w="fit-content" onClick={() => setCancelling(true)}>Cancelar transferencia (el stock vuelve al origen)</Button>
          )
        )}
      </Stack>
    </Modal>
  );
}

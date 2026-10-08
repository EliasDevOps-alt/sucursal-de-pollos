import { Anchor, Badge, Button, Card, Group, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Tabs, Text, Textarea } from '@mantine/core';
import { IconArrowsExchange, IconPlus, IconTrashX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { CrateBalances, CrateHolderType, CrateMovement } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatTile } from '../../components/viz/StatTile';
import { CRATE_MOVEMENT_LABELS, fmtBob, fmtDateTime } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

interface Holders {
  warehouses: { id: string; name: string; type: string }[];
  customers: { id: string; name: string; code: string }[];
  people: { id: string; name: string; role: string }[];
}
type HolderRef = { type: CrateHolderType; id: string };

const HOLDER_LABELS: Record<CrateHolderType, string> = { WAREHOUSE: 'Almacén / vehículo', CUSTOMER: 'Cliente', USER: 'Responsable' };
const kindLabel = (kind: string) => (kind === 'VEHICLE' ? 'Vehículo' : kind === 'CENTRAL' ? 'Almacén central' : kind === 'BRANCH' ? 'Sucursal' : kind === 'CUSTOMER' ? 'Cliente' : kind);

function BalancesTab({ data, onSelect }: { data: CrateBalances; onSelect: (h: HolderRef) => void }) {
  const [type, setType] = useState('ALL');
  const rows = data.holders.filter((h) => type === 'ALL' || h.holderType === type);
  return (
    <>
      <SegmentedControl mb="sm" value={type} onChange={setType}
        data={[{ value: 'ALL', label: 'Todos' }, { value: 'WAREHOUSE', label: 'Almacenes y vehículos' }, { value: 'CUSTOMER', label: 'Clientes' }, { value: 'USER', label: 'Responsables' }]} />
      <Card withBorder p={0}>
        {rows.length === 0 ? (
          <Text c="dimmed" p="md">Nadie tiene canastillos con este filtro.</Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tenedor</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th ta="right">Canastillos</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((h) => (
                  <Table.Tr key={`${h.holderType}-${h.holderId}`}>
                    <Table.Td fw={500}>
                      {h.holderType === 'CUSTOMER' ? <Anchor component={Link} to={`/clientes/${h.holderId}`} size="sm">{h.name}</Anchor> : h.name}
                    </Table.Td>
                    <Table.Td>{kindLabel(h.kind)}</Table.Td>
                    <Table.Td ta="right" fw={600} c={h.quantity < 0 ? 'red' : undefined}>
                      {h.quantity}
                      {h.quantity < 0 && <Text size="xs" c="dimmed">devolvió más de lo registrado</Text>}
                      {h.holderType === 'USER' && h.quantity > 0 && <Text size="xs" c="orange">a su cargo</Text>}
                    </Table.Td>
                    <Table.Td><Button size="compact-xs" variant="subtle" onClick={() => onSelect({ type: h.holderType, id: h.holderId })}>Movimientos</Button></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </>
  );
}

function MovementsTab({ holder, onClear }: { holder: HolderRef | null; onClear: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['crates', 'movements', holder],
    queryFn: async () => (await api.get<CrateMovement[]>('/crates/movements', { params: holder ? { holderType: holder.type, holderId: holder.id } : {} })).data,
  });
  const side = (s: CrateMovement['from']) => (s ? s.name : '—');
  return (
    <QueryState isLoading={isLoading} error={error}>
      {holder && (
        <Group mb="sm">
          <Text size="sm">Movimientos de <b>{data?.[0] ? (data[0].from?.id === holder.id ? data[0].from?.name : data[0].to?.name) : ''}</b></Text>
          <Button size="compact-xs" variant="subtle" onClick={onClear}>Ver todos</Button>
        </Group>
      )}
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={900}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Movimiento</Table.Th>
                <Table.Th>Desde</Table.Th>
                <Table.Th>Hacia</Table.Th>
                <Table.Th ta="right">Cant.</Table.Th>
                <Table.Th>Motivo</Table.Th>
                <Table.Th>Registró</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(m.createdAt)}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={m.type === 'WRITE_OFF' || m.type === 'SHORTAGE' ? 'red' : m.type === 'INITIAL' ? 'green' : 'blue'}>
                      {CRATE_MOVEMENT_LABELS[m.type] ?? m.type}
                    </Badge>
                    {m.referenceType === 'route' && m.referenceId && <Anchor component={Link} to={`/logistica/${m.referenceId}`} size="xs" ml={6}>ruta</Anchor>}
                  </Table.Td>
                  <Table.Td>{side(m.from)}</Table.Td>
                  <Table.Td>{side(m.to)}</Table.Td>
                  <Table.Td ta="right" fw={600}>{m.quantity}</Table.Td>
                  <Table.Td>
                    {m.reason ?? '—'}
                    {m.chargeAmount && <Text size="xs" c="red">Sanción {fmtBob(m.chargeAmount)} a la deuda del cliente</Text>}
                  </Table.Td>
                  <Table.Td>{m.createdBy.fullName}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </QueryState>
  );
}

function HolderPicker({ label, value, onChange, holders, only }: { label: string; value: HolderRef | null; onChange: (h: HolderRef | null) => void; holders?: Holders; only?: CrateHolderType[] }) {
  const types = (only ?? (['WAREHOUSE', 'CUSTOMER', 'USER'] as CrateHolderType[]));
  const [type, setType] = useState<CrateHolderType>(value?.type ?? types[0]);
  useEffect(() => setType(value?.type ?? types[0]), [value?.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const options =
    type === 'WAREHOUSE'
      ? (holders?.warehouses ?? []).map((w) => ({ value: w.id, label: `${w.name}${w.type === 'VEHICLE' ? ' (vehículo)' : ''}` }))
      : type === 'CUSTOMER'
        ? (holders?.customers ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.code}` }))
        : (holders?.people ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${p.role}` }));
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>{label}</Text>
      {types.length > 1 && (
        <SegmentedControl size="xs" value={type} onChange={(v) => { setType(v as CrateHolderType); onChange(null); }}
          data={types.map((t) => ({ value: t, label: HOLDER_LABELS[t] }))} />
      )}
      <Select searchable placeholder="Elegir" data={options} value={value?.type === type ? value.id : null} onChange={(id) => onChange(id ? { type, id } : null)} />
    </Stack>
  );
}

type Kind = 'INITIAL' | 'TRANSFER' | 'WRITE_OFF';

function MovementModal({ kind, onClose }: { kind: Kind | null; onClose: () => void }) {
  const qc = useQueryClient();
  const holders = useQuery({ queryKey: ['crates', 'holders'], queryFn: async () => (await api.get<Holders>('/crates/holders')).data, enabled: !!kind });
  const [qty, setQty] = useState<number | ''>(1);
  const [from, setFrom] = useState<HolderRef | null>(null);
  const [to, setTo] = useState<HolderRef | null>(null);
  const [reason, setReason] = useState('');
  const [charge, setCharge] = useState<number | ''>('');
  useEffect(() => {
    if (!kind) return;
    setQty(1);
    setFrom(null);
    setReason('');
    setCharge('');
    const central = holders.data?.warehouses.find((w) => w.type === 'CENTRAL');
    setTo(kind === 'INITIAL' && central ? { type: 'WAREHOUSE', id: central.id } : null);
  }, [kind, holders.data]);

  // Hacia un almacén es una devolución; entre otros tenedores, un traspaso.
  const type = kind === 'TRANSFER' && to?.type === 'WAREHOUSE' && from?.type !== 'WAREHOUSE' ? 'RETURN' : kind;
  const save = useMutation({
    mutationFn: async () =>
      api.post('/crates/movements', {
        type,
        quantity: Number(qty),
        from: kind === 'INITIAL' ? undefined : from,
        to: kind === 'WRITE_OFF' ? undefined : to,
        reason: reason || undefined,
        chargePerCrate: kind === 'WRITE_OFF' && from?.type === 'CUSTOMER' && charge ? Number(charge) : undefined,
      }),
    onSuccess: () => {
      notifyOk('Movimiento de canastillos registrado');
      qc.invalidateQueries({ queryKey: ['crates'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: notifyError,
  });
  const needsReason = kind !== 'INITIAL';
  const title = kind === 'INITIAL' ? 'Alta de canastillos' : kind === 'TRANSFER' ? 'Traspaso o devolución' : 'Baja de canastillos';
  const valid = Number(qty) > 0 && (kind === 'INITIAL' ? !!to : kind === 'WRITE_OFF' ? !!from : !!from && !!to) && (!needsReason || reason.trim().length > 0);
  return (
    <Modal opened={!!kind} onClose={onClose} title={title}>
      <Stack>
        <Text size="sm" c="dimmed">
          {kind === 'INITIAL'
            ? 'Canastillos nuevos (compra) o el inventario inicial al empezar a usar el sistema.'
            : kind === 'TRANSFER'
              ? 'Entre almacenes, o un préstamo a un cliente; si llega a un almacén desde un cliente o un responsable, se registra como devolución.'
              : 'Canastillos rotos o perdidos. Si los perdió un cliente, se le puede cobrar una sanción que se suma a su deuda.'}
        </Text>
        {kind !== 'INITIAL' && <HolderPicker label="Desde" value={from} onChange={setFrom} holders={holders.data} />}
        {kind !== 'WRITE_OFF' && <HolderPicker label={kind === 'INITIAL' ? 'Almacén' : 'Hacia'} value={to} onChange={setTo} holders={holders.data} only={kind === 'INITIAL' ? ['WAREHOUSE'] : undefined} />}
        <NumberInput label="Cantidad" withAsterisk min={1} allowDecimal={false} value={qty} onChange={(v) => setQty(v as number | '')} />
        {kind === 'WRITE_OFF' && from?.type === 'CUSTOMER' && (
          <NumberInput label="Sanción por canastillo (Bs, opcional)" min={0} decimalScale={2} value={charge} onChange={(v) => setCharge(v as number | '')}
            description={charge ? `Se suman ${fmtBob(Number(charge) * Number(qty || 0))} a la deuda del cliente` : 'Vacío: sin cobro'} />
        )}
        <Textarea label="Motivo" withAsterisk={needsReason} autosize minRows={1} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Button color={kind === 'WRITE_OFF' ? 'red' : undefined} disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>Registrar</Button>
      </Stack>
    </Modal>
  );
}

export function CratesPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'movimientos' ? 'movimientos' : 'saldos';
  const [holder, setHolder] = useState<HolderRef | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['crates', 'balances'], queryFn: async () => (await api.get<CrateBalances>('/crates/balances')).data });

  return (
    <>
      <PageHeader
        title="Canastillos"
        subtitle="Cuántos hay y quién los tiene: almacenes, vehículos, clientes y responsables"
        actions={can('crates.manage') && (
          <Group gap="xs">
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setKind('INITIAL')}>Alta</Button>
            <Button variant="light" leftSection={<IconArrowsExchange size={16} />} onClick={() => setKind('TRANSFER')}>Traspaso</Button>
            <Button variant="light" color="red" leftSection={<IconTrashX size={16} />} onClick={() => setKind('WRITE_OFF')}>Baja</Button>
          </Group>
        )}
      />
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <>
            <SimpleGrid cols={{ base: 2, md: 5 }} mb="md">
              <StatTile label="Total" value={String(data.total)} />
              <StatTile label="En almacenes" value={String(data.inWarehouses)} />
              <StatTile label="En vehículos" value={String(data.inVehicles)} />
              <StatTile label="Con clientes" value={String(data.withCustomers)} hint="por recoger" />
              <StatTile label="A cargo de personas" value={String(data.withPeople)} hint="choferes y cobradores" />
            </SimpleGrid>
            <Tabs value={tab} onChange={(v) => setParams(v === 'movimientos' ? { tab: v } : {})} keepMounted={false}>
              <Tabs.List mb="md">
                <Tabs.Tab value="saldos">Quién los tiene</Tabs.Tab>
                <Tabs.Tab value="movimientos">Movimientos</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="saldos">
                <BalancesTab data={data} onSelect={(h) => { setHolder(h); setParams({ tab: 'movimientos' }); }} />
              </Tabs.Panel>
              <Tabs.Panel value="movimientos"><MovementsTab holder={holder} onClear={() => setHolder(null)} /></Tabs.Panel>
            </Tabs>
          </>
        )}
      </QueryState>
      <MovementModal kind={kind} onClose={() => setKind(null)} />
    </>
  );
}

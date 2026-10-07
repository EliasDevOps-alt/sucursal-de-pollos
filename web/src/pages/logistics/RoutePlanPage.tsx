import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, Grid, Group, Progress, ScrollArea, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { RouteCandidate, RouteDetail, Vehicle } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDate, fmtKg } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

const KG_PER_CRATE = 20;
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());

type Stop = RouteCandidate & { authorizeCredit: boolean; creditReason: string };

/** Convierte una parada ya guardada en el mismo formato que una candidata. */
function fromRouteStop(s: RouteDetail['stops'][number]): Stop {
  const debt = Number(s.customer.currentDebt);
  const available = s.customer.creditEnabled ? Math.max(0, Number(s.customer.creditLimit) - debt) : 0;
  return {
    id: s.presaleId,
    presaleNumber: s.presale.presaleNumber,
    scheduledDeliveryDate: null,
    totalAmount: s.presale.totalAmount,
    notes: s.presale.notes,
    customer: s.customer,
    address: s.address,
    preventista: s.presale.preventista,
    weightKg: String(s.items.reduce((t, i) => t + Number(i.orderedWeightKg), 0)),
    items: s.items.map((i) => ({ productId: i.product.id, productName: i.product.name, weightKg: i.orderedWeightKg })),
    creditAvailable: String(available),
    creditWouldExceed: !s.customer.creditEnabled || Number(s.presale.totalAmount) > available,
    authorizeCredit: !!s.creditAuthorizedBy,
    creditReason: s.creditAuthReason ?? '',
  };
}

export function RoutePlanPage() {
  const { id } = useParams();
  const editing = !!id;
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayLocal());
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);

  const existing = useQuery({ queryKey: ['routes', id], queryFn: async () => (await api.get<RouteDetail>(`/routes/${id}`)).data, enabled: editing });
  useEffect(() => {
    const r = existing.data;
    if (!r) return;
    setDate(r.routeDate.slice(0, 10));
    setVehicleId(r.vehicle.id);
    setDriverId(r.driver.id);
    setNotes(r.notes ?? '');
    setStops(r.stops.map(fromRouteStop));
  }, [existing.data]);

  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: async () => (await api.get<Vehicle[]>('/vehicles')).data });
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/routes/drivers')).data });
  const candidates = useQuery({
    queryKey: ['route-candidates', date],
    queryFn: async () => (await api.get<RouteCandidate[]>('/routes/candidates', { params: { date } })).data,
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
  });

  const chosen = new Set(stops.map((s) => s.id));
  const available = (candidates.data ?? []).filter((c) => !chosen.has(c.id));
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const totalKg = stops.reduce((t, s) => t + Number(s.weightKg), 0);
  const totalAmount = stops.reduce((t, s) => t + Number(s.totalAmount), 0);
  const crates = Math.ceil(totalKg / KG_PER_CRATE);
  const capacity = Number(vehicle?.capacityKg ?? 0);
  const overKg = vehicle ? totalKg > capacity : false;
  const overCrates = vehicle ? crates > vehicle.capacityCrates : false;

  const productTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stops) for (const i of s.items) m.set(i.productName, (m.get(i.productName) ?? 0) + Number(i.weightKg));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [stops]);

  const move = (idx: number, delta: number) =>
    setStops((list) => {
      const next = [...list];
      const [item] = next.splice(idx, 1);
      next.splice(idx + delta, 0, item);
      return next;
    });
  const update = (sid: string, patch: Partial<Stop>) => setStops((list) => list.map((s) => (s.id === sid ? { ...s, ...patch } : s)));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        routeDate: date,
        vehicleId,
        driverId,
        notes: notes || undefined,
        stops: stops.map((s) => ({ presaleId: s.id, authorizeCredit: s.authorizeCredit || undefined, creditReason: s.authorizeCredit ? s.creditReason : undefined })),
      };
      return editing ? api.patch<RouteDetail>(`/routes/${id}`, body) : api.post<RouteDetail>('/routes', body);
    },
    onSuccess: (res) => {
      notifyOk(editing ? 'Ruta actualizada' : `Ruta ${res.data.routeNumber} planificada`);
      for (const key of ['routes', 'route-candidates', 'presales', 'vehicles']) qc.invalidateQueries({ queryKey: [key] });
      navigate(`/logistica/${res.data.id}`);
    },
    onError: notifyError,
  });

  const missingReason = stops.some((s) => s.authorizeCredit && !s.creditReason.trim());
  const blocked = existing.data && existing.data.status !== 'PLANNED';

  return (
    <QueryState isLoading={editing && existing.isLoading} error={existing.error}>
      <Anchor component={Link} to={editing ? `/logistica/${id}` : '/logistica'} size="sm">
        <Group gap={4}><IconArrowLeft size={14} /> {editing ? existing.data?.routeNumber : 'Logística'}</Group>
      </Anchor>
      <PageHeader
        title={editing ? `Editar ruta ${existing.data?.routeNumber ?? ''}` : 'Nueva ruta'}
        subtitle="Elija los pedidos pendientes y ordénelos según el recorrido. Al despachar, la ruta queda fija."
      />
      {blocked ? (
        <Alert color="orange">La ruta ya fue despachada: su recorrido no se puede cambiar.</Alert>
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder>
              <Stack>
                <TextInput label="Fecha de entrega" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
                <Select label="Vehículo" withAsterisk value={vehicleId} onChange={setVehicleId}
                  data={(vehicles.data ?? []).filter((v) => v.isActive).map((v) => ({ value: v.id, label: `${v.plate} · ${v.description} · ${Number(v.capacityKg).toLocaleString('es-BO')} kg` }))} />
                <Select label="Chofer" withAsterisk value={driverId} onChange={setDriverId} nothingFoundMessage="No hay usuarios con rol Chofer"
                  data={(drivers.data ?? []).map((d) => ({ value: d.id, label: d.fullName }))} />
                <Textarea label="Observaciones" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} placeholder="Ej.: zona norte" />
                <div>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm" fw={500}>Carga</Text>
                    <Text size="sm" c={overKg ? 'red' : undefined}>{fmtKg(totalKg.toFixed(3))}{vehicle ? ` de ${fmtKg(vehicle.capacityKg)}` : ''}</Text>
                  </Group>
                  <Progress value={vehicle ? Math.min(100, (totalKg / capacity) * 100) : 0} color={overKg ? 'red' : 'blue'} />
                  <Text size="xs" c={overCrates ? 'red' : 'dimmed'} mt={4}>
                    ≈ {crates} canastillos{vehicle ? ` de ${vehicle.capacityCrates}` : ''} · {stops.length} paradas · {fmtBob(totalAmount)}
                  </Text>
                </div>
                {productTotals.length > 0 && (
                  <div>
                    <Text size="sm" fw={500} mb={4}>Por producto</Text>
                    {productTotals.map(([name, kg]) => (
                      <Group key={name} justify="space-between"><Text size="xs">{name}</Text><Text size="xs">{fmtKg(kg.toFixed(3))}</Text></Group>
                    ))}
                  </div>
                )}
                <Button loading={save.isPending} disabled={!vehicleId || !driverId || !stops.length || overKg || missingReason} onClick={() => save.mutate()}>
                  {editing ? 'Guardar cambios' : 'Planificar ruta'}
                </Button>
                {overKg && <Text size="xs" c="red">Los pedidos superan la capacidad del vehículo.</Text>}
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder p={0}>
              <Text fw={600} p="md" pb="xs">Recorrido ({stops.length})</Text>
              <ScrollArea.Autosize mah={620}>
                {stops.length === 0 && <Text c="dimmed" size="sm" px="md" pb="md">Agregue pedidos desde la lista de pendientes.</Text>}
                <Stack gap={0}>
                  {stops.map((s, idx) => (
                    <div key={s.id} style={{ borderTop: '1px solid var(--mantine-color-default-border)', padding: '8px 12px' }}>
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                          <Badge circle size="lg">{idx + 1}</Badge>
                          <div>
                            <Text size="sm" fw={600}>{s.customer.name}</Text>
                            <Text size="xs" c="dimmed">{s.address?.address ?? 'Sin dirección'}</Text>
                            <Text size="xs">{s.presaleNumber} · {fmtKg(s.weightKg)} · {fmtBob(s.totalAmount)}</Text>
                          </div>
                        </Group>
                        <Group gap={2} wrap="nowrap">
                          <ActionIcon variant="subtle" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Subir"><IconArrowUp size={16} /></ActionIcon>
                          <ActionIcon variant="subtle" disabled={idx === stops.length - 1} onClick={() => move(idx, 1)} aria-label="Bajar"><IconArrowDown size={16} /></ActionIcon>
                          <ActionIcon variant="subtle" color="red" onClick={() => setStops((l) => l.filter((x) => x.id !== s.id))} aria-label="Quitar"><IconX size={16} /></ActionIcon>
                        </Group>
                      </Group>
                      {s.creditWouldExceed && (
                        <Stack gap={4} mt={6} ml={40}>
                          <Text size="xs" c="orange">
                            {Number(s.creditAvailable) > 0 ? `Si no paga, supera su crédito disponible (${fmtBob(s.creditAvailable)}).` : 'Sin crédito disponible: debe pagar al recibir.'}
                          </Text>
                          {can('credit.exception_authorize') && (
                            <Checkbox size="xs" label="Autorizar de antemano que quede a crédito" checked={s.authorizeCredit}
                              onChange={(e) => update(s.id, { authorizeCredit: e.currentTarget.checked })} />
                          )}
                          {s.authorizeCredit && (
                            <TextInput size="xs" placeholder="Motivo de la autorización" value={s.creditReason} error={!s.creditReason.trim()}
                              onChange={(e) => update(s.id, { creditReason: e.currentTarget.value })} />
                          )}
                        </Stack>
                      )}
                    </div>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder p={0}>
              <Text fw={600} p="md" pb={0}>Pedidos pendientes</Text>
              <Text size="xs" c="dimmed" px="md" pb="xs">Con entrega hasta {date ? fmtDate(date) : '—'}</Text>
              <QueryState isLoading={candidates.isLoading} error={candidates.error}>
                <ScrollArea.Autosize mah={620}>
                  {available.length === 0 && <Text c="dimmed" size="sm" px="md" pb="md">No hay más pedidos pendientes.</Text>}
                  {available.map((c) => (
                    <div key={c.id} style={{ borderTop: '1px solid var(--mantine-color-default-border)', padding: '8px 12px' }}>
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <div>
                          <Text size="sm" fw={600}>{c.customer.name}</Text>
                          <Text size="xs" c="dimmed">{c.address?.address ?? 'Sin dirección'}</Text>
                          <Text size="xs">
                            {c.presaleNumber} · {fmtKg(c.weightKg)} · {fmtBob(c.totalAmount)}
                            {c.scheduledDeliveryDate && ` · para ${fmtDate(c.scheduledDeliveryDate)}`}
                          </Text>
                          <Text size="xs" c="dimmed">{c.items.map((i) => `${i.productName} ${fmtKg(i.weightKg)}`).join(', ')}</Text>
                        </div>
                        <Button size="compact-sm" variant="light" onClick={() => setStops((l) => [...l, { ...c, authorizeCredit: false, creditReason: '' }])}>Agregar</Button>
                      </Group>
                    </div>
                  ))}
                </ScrollArea.Autosize>
              </QueryState>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </QueryState>
  );
}

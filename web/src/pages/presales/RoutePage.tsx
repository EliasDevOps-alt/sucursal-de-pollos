import 'leaflet/dist/leaflet.css';

import { Anchor, Badge, Card, Grid, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { LatLngExpression } from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, PRESALE_STATUS } from '../../lib/format';

interface Activity {
  date: string;
  positions: { id: string; latitude: string; longitude: string; accuracyMeters: string | null; eventType: string; capturedAtDevice: string }[];
  visits: { id: string; outcome: string; notes: string | null; latitude: string | null; longitude: string | null; visitedAtDevice: string; presaleId: string | null; customer: { id: string; name: string } }[];
  presales: {
    id: string;
    presaleNumber: string;
    status: string;
    totalAmount: string;
    latitude: string | null;
    longitude: string | null;
    createdAtDevice: string | null;
    createdAt: string;
    customer: { id: string; name: string };
  }[];
}

const OUTCOME_LABELS: Record<string, string> = {
  ORDER: 'Con pedido',
  NO_ORDER: 'Sin pedido',
  CLOSED: 'Local cerrado',
  NOT_FOUND: 'Responsable ausente',
};

// Colores de la paleta de gráficos: trayectoria azul (serie 1), pedidos naranja (serie 2);
// las visitas sin pedido usan un gris marcado con borde, y la tabla repite todo en texto.
const COLORS = { track: '#2a78d6', order: '#eb6834', visit: '#52514e' };

const time = (iso: string) => new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());

/** Ajusta el encuadre del mapa a los puntos del día. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
  }, [map, points]);
  return null;
}

export function RoutePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [date, setDate] = useState(todayLocal());

  const preventistas = useQuery({
    queryKey: ['preventistas'],
    queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/presales/preventistas')).data,
  });
  const selected = userId ?? preventistas.data?.[0]?.id ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity', selected, date],
    queryFn: async () => (await api.get<Activity>('/presales/activity', { params: { userId: selected, date } })).data,
    enabled: !!selected && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });

  const track = useMemo(() => (data?.positions ?? []).map((p) => [Number(p.latitude), Number(p.longitude)] as [number, number]), [data]);
  const orders = (data?.presales ?? []).filter((p) => p.latitude && p.longitude);
  const visits = (data?.visits ?? []).filter((v) => v.outcome !== 'ORDER' && v.latitude && v.longitude);
  const allPoints = useMemo(
    () => [...track, ...orders.map((p) => [Number(p.latitude), Number(p.longitude)] as [number, number]), ...visits.map((v) => [Number(v.latitude), Number(v.longitude)] as [number, number])],
    [track, orders, visits],
  );

  // Línea de tiempo: pedidos y visitas en orden.
  const timeline = [
    ...(data?.presales ?? []).map((p) => ({ at: p.createdAtDevice ?? p.createdAt, kind: 'order' as const, p })),
    ...(data?.visits ?? []).filter((v) => v.outcome !== 'ORDER').map((v) => ({ at: v.visitedAtDevice, kind: 'visit' as const, v })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const center: LatLngExpression = allPoints[0] ?? [-17.7833, -63.1821]; // Santa Cruz de la Sierra

  return (
    <>
      <Anchor component={Link} to="/preventas" size="sm">
        <Group gap={4}><IconArrowLeft size={14} /> Preventas</Group>
      </Anchor>
      <PageHeader title="Recorrido del preventista" subtitle="Trayectoria GPS del teléfono, visitas y pedidos del día" />
      <Group mb="sm" align="flex-end">
        <Select label="Preventista" w={260} allowDeselect={false} value={selected} onChange={setUserId}
          data={(preventistas.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))} />
        <TextInput label="Fecha" type="date" w={180} value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        {data && (
          <Text mb={6} size="sm" c="dimmed">
            {data.positions.length} posiciones GPS · {data.presales.length} pedidos · {data.visits.filter((v) => v.outcome !== 'ORDER').length} visitas sin pedido
          </Text>
        )}
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Grid>
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Card withBorder p={0} style={{ overflow: 'hidden', isolation: 'isolate' }}>
              <MapContainer center={center} zoom={13} style={{ height: 520 }} scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds points={allPoints} />
                {track.length > 1 && <Polyline positions={track} pathOptions={{ color: COLORS.track, weight: 2, opacity: 0.8 }} />}
                {data?.positions.map((p) => (
                  <CircleMarker key={p.id} center={[Number(p.latitude), Number(p.longitude)]} radius={3}
                    pathOptions={{ color: COLORS.track, fillColor: COLORS.track, fillOpacity: 1, weight: 1 }}>
                    <Popup>{time(p.capturedAtDevice)} · {p.eventType === 'PERIODIC' ? 'posición periódica' : p.eventType.toLowerCase()}</Popup>
                  </CircleMarker>
                ))}
                {visits.map((v) => (
                  <CircleMarker key={v.id} center={[Number(v.latitude), Number(v.longitude)]} radius={7}
                    pathOptions={{ color: '#fff', weight: 2, fillColor: COLORS.visit, fillOpacity: 1 }}>
                    <Popup><b>{v.customer.name}</b><br />{time(v.visitedAtDevice)} · {OUTCOME_LABELS[v.outcome]}{v.notes ? <><br />{v.notes}</> : null}</Popup>
                  </CircleMarker>
                ))}
                {orders.map((p) => (
                  <CircleMarker key={p.id} center={[Number(p.latitude), Number(p.longitude)]} radius={8}
                    pathOptions={{ color: '#fff', weight: 2, fillColor: COLORS.order, fillOpacity: 1 }}>
                    <Popup><b>{p.customer.name}</b><br />{p.presaleNumber} · {fmtBob(p.totalAmount)}<br />{time(p.createdAtDevice ?? p.createdAt)}</Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
              <Group gap="lg" p="sm">
                <Group gap={6}><span style={{ width: 18, height: 2, background: COLORS.track, display: 'inline-block' }} /><Text size="xs">Trayectoria GPS</Text></Group>
                <Group gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, background: COLORS.order, display: 'inline-block' }} /><Text size="xs">Pedido</Text></Group>
                <Group gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, background: COLORS.visit, display: 'inline-block' }} /><Text size="xs">Visita sin pedido</Text></Group>
              </Group>
            </Card>
            {allPoints.length === 0 && <Text c="dimmed" size="sm" mt="xs">No hay posiciones registradas este día.</Text>}
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card withBorder p={0}>
              <Text fw={600} p="md" pb={0}>Línea de tiempo</Text>
              {timeline.length === 0 ? (
                <Text c="dimmed" size="sm" p="md">Sin actividad.</Text>
              ) : (
                <Table.ScrollContainer minWidth={260} mah={520}>
                  <Table>
                    <Table.Tbody>
                      {timeline.map((t) =>
                        t.kind === 'order' ? (
                          <Table.Tr key={t.p.id}>
                            <Table.Td w={56} c="dimmed" style={{ verticalAlign: 'top' }}>{time(t.at)}</Table.Td>
                            <Table.Td>
                              <Stack gap={0}>
                                <Anchor component={Link} to={`/preventas/${t.p.id}`} size="sm" fw={500}>{t.p.customer.name}</Anchor>
                                <Text size="xs" c="dimmed">{t.p.presaleNumber} · {fmtBob(t.p.totalAmount)}</Text>
                                <Badge mt={4} size="xs" variant="light" color={PRESALE_STATUS[t.p.status]?.color}>{PRESALE_STATUS[t.p.status]?.label}</Badge>
                              </Stack>
                            </Table.Td>
                          </Table.Tr>
                        ) : (
                          <Table.Tr key={t.v.id}>
                            <Table.Td w={56} c="dimmed" style={{ verticalAlign: 'top' }}>{time(t.at)}</Table.Td>
                            <Table.Td>
                              <Stack gap={0}>
                                <Text size="sm" fw={500}>{t.v.customer.name}</Text>
                                {t.v.notes && <Text size="xs" c="dimmed">{t.v.notes}</Text>}
                                <Badge mt={4} size="xs" variant="light" color="gray">{OUTCOME_LABELS[t.v.outcome]}</Badge>
                              </Stack>
                            </Table.Td>
                          </Table.Tr>
                        ),
                      )}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>
          </Grid.Col>
        </Grid>
      </QueryState>
    </>
  );
}

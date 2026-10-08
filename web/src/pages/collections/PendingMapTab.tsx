import 'leaflet/dist/leaflet.css';

import { Anchor, Card, Grid, Group, SegmentedControl, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { PendingCustomer } from '../../api/types';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDateTime } from '../../lib/format';

// Antigüedad de la deuda: secuencial de claro a oscuro (más días, más intenso). Solo canastillos: gris.
const AGE = [
  { label: '0–7 días', max: 7, color: '#f5b183' },
  { label: '8–15 días', max: 15, color: '#eb6834' },
  { label: '16–30 días', max: 30, color: '#c2410c' },
  { label: 'Más de 30 días', max: Infinity, color: '#7c2d12' },
];
const CRATES_ONLY = '#6b7280';
const colorOf = (c: PendingCustomer) =>
  Number(c.debt) > 0 ? (AGE.find((a) => (c.daysOutstanding ?? 0) <= a.max) ?? AGE[3]).color : CRATES_ONLY;

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
  }, [map, points]);
  return null;
}

/** Clientes por visitar: con deuda (color según antigüedad) o con canastillos por recoger. */
export function PendingMapTab() {
  const [filter, setFilter] = useState('ALL');
  const { data, isLoading, error } = useQuery({
    queryKey: ['collections', 'pending-map'],
    queryFn: async () => (await api.get<PendingCustomer[]>('/collections/pending-map')).data,
  });
  const rows = (data ?? []).filter((c) => filter === 'ALL' || (filter === 'DEBT' ? Number(c.debt) > 0 : c.crates > 0));
  const located = rows.filter((c) => c.latitude && c.longitude);
  const points = useMemo(() => located.map((c) => [Number(c.latitude), Number(c.longitude)] as [number, number]), [located]);
  const totalDebt = rows.reduce((t, c) => t + Math.max(0, Number(c.debt)), 0);
  const totalCrates = rows.reduce((t, c) => t + Math.max(0, c.crates), 0);

  return (
    <QueryState isLoading={isLoading} error={error}>
      <Group justify="space-between" mb="sm">
        <SegmentedControl value={filter} onChange={setFilter}
          data={[{ value: 'ALL', label: 'Todos' }, { value: 'DEBT', label: 'Con deuda' }, { value: 'CRATES', label: 'Con canastillos' }]} />
        <Text size="sm">{rows.length} clientes · por cobrar <b>{fmtBob(totalDebt)}</b> · <b>{totalCrates}</b> canastillos por recoger</Text>
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card withBorder p={0} style={{ overflow: 'hidden', isolation: 'isolate' }}>
            <MapContainer center={points[0] ?? [-17.7833, -63.1821]} zoom={13} style={{ height: 520 }} scrollWheelZoom>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitBounds points={points} />
              {located.map((c) => (
                <CircleMarker key={c.id} center={[Number(c.latitude), Number(c.longitude)]}
                  radius={Number(c.debt) > 0 ? Math.min(16, 6 + Math.sqrt(Number(c.debt)) / 6) : 6}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: colorOf(c), fillOpacity: 0.95 }}>
                  <Popup>
                    <b>{c.name}</b><br />
                    {Number(c.debt) > 0 ? `Debe ${fmtBob(c.debt)} · ${c.daysOutstanding ?? 0} días` : 'Sin deuda'}
                    {c.crates > 0 && <><br />{c.crates} canastillos por recoger</>}
                    {c.phone && <><br />{c.phone}</>}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
            <Group gap="md" p="sm">
              {AGE.map((a) => (
                <Group key={a.label} gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, background: a.color, display: 'inline-block' }} /><Text size="xs">{a.label}</Text></Group>
              ))}
              <Group gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, background: CRATES_ONLY, display: 'inline-block' }} /><Text size="xs">Solo canastillos</Text></Group>
              <Text size="xs" c="dimmed">El tamaño crece con la deuda.</Text>
            </Group>
          </Card>
          {rows.length > located.length && <Text size="xs" c="dimmed" mt={4}>{rows.length - located.length} cliente(s) sin ubicación en su dirección no aparecen en el mapa.</Text>}
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card withBorder p={0}>
            <Table.ScrollContainer minWidth={420} mah={570}>
              <Table striped style={{ fontVariantNumeric: 'tabular-nums' }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th ta="right">Deuda</Table.Th>
                    <Table.Th ta="right">Días</Table.Th>
                    <Table.Th ta="right">Canast.</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/clientes/${c.id}`} size="sm">{c.name}</Anchor>
                        <Text size="xs" c="dimmed">{c.address ?? 'Sin dirección'}{c.lastPayment ? ` · último pago ${fmtDateTime(c.lastPayment)}` : ''}</Text>
                      </Table.Td>
                      <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{Number(c.debt) > 0 ? fmtBob(c.debt) : '—'}</Table.Td>
                      <Table.Td ta="right">{Number(c.debt) > 0 ? c.daysOutstanding ?? 0 : '—'}</Table.Td>
                      <Table.Td ta="right">{c.crates || '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Grid.Col>
      </Grid>
    </QueryState>
  );
}

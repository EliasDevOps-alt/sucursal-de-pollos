import 'leaflet/dist/leaflet.css';

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Image,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconArrowLeft, IconEdit, IconPrinter, IconTruckDelivery, IconTruckReturn, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { LotBalance, RouteDetail, RouteStop } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatTile } from '../../components/viz/StatTile';
import { DELIVERY_PROBLEMS, fmtBob, fmtDate, fmtDateTime, fmtKg, PAYMENT_LABELS, ROUTE_STATUS, STOP_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

const STOP_COLORS: Record<string, string> = { PENDING: '#6b7280', DELIVERED: '#16a34a', PARTIAL: '#d97706', FAILED: '#dc2626' };
const TRACK_COLOR = '#2a78d6';
const INVALIDATE = ['routes', 'presales', 'sales', 'customers', 'inventory-stock', 'inventory-lots', 'inventory-movements', 'transfers'];

const numberIcon = (n: number, status: string) =>
  L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:14px;background:${STOP_COLORS[status]};color:#fff;font:600 13px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>`,
  });

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
  }, [map, points]);
  return null;
}

export function RouteDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const [modal, setModal] = useState<'dispatch' | 'close' | 'cancel' | null>(null);
  const [receipt, setReceipt] = useState<RouteStop | null>(null);
  const [register, setRegister] = useState<RouteStop | null>(null);

  const { data: r, isLoading, error } = useQuery({
    queryKey: ['routes', id],
    queryFn: async () => (await api.get<RouteDetail>(`/routes/${id}`)).data,
    refetchInterval: (q) => (q.state.data?.status === 'IN_PROGRESS' ? 15_000 : false),
  });
  const tracking = useQuery({
    queryKey: ['routes', id, 'tracking'],
    queryFn: async () => (await api.get<{ id: string; latitude: string; longitude: string; capturedAtDevice: string; eventType: string }[]>(`/routes/${id}/tracking`)).data,
    enabled: !!r?.dispatchedAt,
    refetchInterval: r?.status === 'IN_PROGRESS' ? 15_000 : false,
  });

  const track = useMemo(() => (tracking.data ?? []).map((p) => [Number(p.latitude), Number(p.longitude)] as [number, number]), [tracking.data]);
  const stopPoints = useMemo(
    () => (r?.stops ?? []).filter((s) => s.address?.latitude && s.address?.longitude).map((s) => ({ s, at: [Number(s.address!.latitude), Number(s.address!.longitude)] as [number, number] })),
    [r],
  );
  const allPoints = useMemo(() => [...stopPoints.map((p) => p.at), ...track], [stopPoints, track]);
  const manage = can('routes.manage');

  return (
    <QueryState isLoading={isLoading} error={error}>
      {r && (
        <Stack>
          <Anchor component={Link} to="/logistica" size="sm">
            <Group gap={4}><IconArrowLeft size={14} /> Logística</Group>
          </Anchor>
          <PageHeader
            title={`Ruta ${r.routeNumber}`}
            subtitle={`${fmtDate(r.routeDate)} · ${r.vehicle.plate} (${r.vehicle.description}) · chofer ${r.driver.fullName} · carga desde ${r.originWarehouse.name}`}
            actions={
              <>
                <Badge size="lg" variant="light" color={ROUTE_STATUS[r.status].color}>{ROUTE_STATUS[r.status].label}</Badge>
                <Button component={Link} to={`/logistica/${r.id}/hoja`} target="_blank" variant="default" leftSection={<IconPrinter size={16} />}>Hoja de carga</Button>
                {manage && r.status === 'PLANNED' && (
                  <>
                    <Button component={Link} to={`/logistica/${r.id}/editar`} variant="light" leftSection={<IconEdit size={16} />}>Editar</Button>
                    <Button leftSection={<IconTruckDelivery size={16} />} onClick={() => setModal('dispatch')}>Despachar</Button>
                    <Button variant="subtle" color="red" leftSection={<IconX size={16} />} onClick={() => setModal('cancel')}>Cancelar</Button>
                  </>
                )}
                {manage && r.status === 'IN_PROGRESS' && (
                  <Button leftSection={<IconTruckReturn size={16} />} onClick={() => setModal('close')}>Liquidar ruta</Button>
                )}
              </>
            }
          />

          {r.status === 'PLANNED' && <Alert color="blue">Planificada por {r.createdBy.fullName}. Al despachar se carga el vehículo y el recorrido queda fijo.</Alert>}
          {r.status === 'CANCELLED' && <Alert color="gray" title="Ruta cancelada">{r.cancelReason} — {r.cancelledBy?.fullName}</Alert>}
          {r.status === 'COMPLETED' && (
            <Alert color="green" title="Ruta liquidada">
              Cerrada por {r.closedBy?.fullName} el {r.closedAt && fmtDateTime(r.closedAt)}. {r.closeNotes}
            </Alert>
          )}

          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <StatTile label="Entregas" value={`${r.summary.delivered} de ${r.summary.stops}`} hint={r.summary.failed ? `${r.summary.failed} no entregadas` : r.summary.pending ? `${r.summary.pending} pendientes` : 'todas resueltas'} />
            <StatTile label="Kg pedidos" value={fmtKg(r.summary.orderedKg)} hint={`≈ ${r.summary.estimatedCrates} canastillos`} />
            <StatTile label="Vendido" value={fmtBob(r.summary.soldAmount)} hint={`pedido ${fmtBob(r.summary.orderedAmount)}`} />
            <StatTile label="Cobrado por el chofer" value={fmtBob(r.summary.collectedAmount)} hint={`a crédito ${fmtBob(r.summary.creditAmount)}`} />
          </SimpleGrid>

          <Grid>
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Card withBorder p={0} style={{ overflow: 'hidden', isolation: 'isolate' }}>
                <MapContainer center={allPoints[0] ?? [-17.7833, -63.1821]} zoom={13} style={{ height: 420 }} scrollWheelZoom>
                  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <FitBounds points={allPoints} />
                  {track.length > 1 && <Polyline positions={track} pathOptions={{ color: TRACK_COLOR, weight: 3, opacity: 0.8 }} />}
                  {stopPoints.map(({ s, at }) => (
                    <Marker key={s.id} position={at} icon={numberIcon(s.sequence, s.status)}>
                      <Popup>
                        <b>{s.sequence}. {s.customer.name}</b><br />{s.address?.address}<br />{STOP_STATUS[s.status].label}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
                <Group gap="md" p="sm">
                  {Object.entries(STOP_STATUS).map(([k, v]) => (
                    <Group key={k} gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, background: STOP_COLORS[k], display: 'inline-block' }} /><Text size="xs">{v.label}</Text></Group>
                  ))}
                  <Group gap={6}><span style={{ width: 18, height: 3, background: TRACK_COLOR, display: 'inline-block' }} /><Text size="xs">Recorrido del chofer (GPS)</Text></Group>
                </Group>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <Card withBorder p={0}>
                <Text fw={600} p="md" pb={0}>Carga por producto</Text>
                <Table.ScrollContainer minWidth={420}>
                  <Table style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Producto</Table.Th>
                        <Table.Th ta="right">Pedido</Table.Th>
                        <Table.Th ta="right">Cargado</Table.Th>
                        <Table.Th ta="right">Entregado</Table.Th>
                        <Table.Th ta="right">{r.status === 'COMPLETED' ? 'Devuelto' : 'A bordo'}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {r.loadSheet.map((l) => (
                        <Table.Tr key={l.productId}>
                          <Table.Td>{l.name}</Table.Td>
                          <Table.Td ta="right">{fmtKg(l.orderedKg)}</Table.Td>
                          <Table.Td ta="right">{r.dispatchedAt ? fmtKg(l.loadedKg) : '—'}</Table.Td>
                          <Table.Td ta="right">{fmtKg(l.deliveredKg)}</Table.Td>
                          <Table.Td ta="right">
                            {r.status === 'COMPLETED' ? fmtKg(l.returnedKg) : r.status === 'IN_PROGRESS' ? fmtKg(l.onBoardKg) : '—'}
                            {Number(l.lossKg) > 0 && <Text size="xs" c="red">faltó {fmtKg(l.lossKg)}</Text>}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
                {r.dispatchedAt && (
                  <>
                    <Text size="sm" px="sm" pt="sm">
                      Canastillos: salieron <b>{r.cratesLoaded}</b> · quedaron con clientes <b>{r.summary.crates?.delivered ?? 0}</b> · recogidos <b>{r.summary.crates?.pickedUp ?? 0}</b> ·{' '}
                      {r.status === 'COMPLETED' ? <>volvieron <b>{r.cratesReturned ?? 0}</b> de {r.summary.crates?.expectedBack ?? 0}</> : <>a bordo <b>{r.summary.crates?.expectedBack ?? 0}</b></>}
                    </Text>
                    <Text size="xs" c="dimmed" p="sm">Despachó {r.dispatchedBy?.fullName} el {fmtDateTime(r.dispatchedAt)}</Text>
                  </>
                )}
              </Card>
            </Grid.Col>
          </Grid>

          <Card withBorder p={0}>
            <Text fw={600} p="md" pb={0}>Paradas</Text>
            <Table.ScrollContainer minWidth={980}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Cliente / dirección</Table.Th>
                    <Table.Th>Pedido</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th>Venta</Table.Th>
                    <Table.Th ta="right">Cobrado</Table.Th>
                    <Table.Th>Recibió / motivo</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {r.stops.map((s) => (
                    <Table.Tr key={s.id}>
                      <Table.Td fw={600}>{s.sequence}</Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/clientes/${s.customer.id}`} size="sm" fw={500}>{s.customer.name}</Anchor>
                        <Text size="xs" c="dimmed">{s.address?.address ?? 'Sin dirección'}{s.customer.phone ? ` · ${s.customer.phone}` : ''}</Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        <Anchor component={Link} to={`/preventas/${s.presale.id}`} size="sm">{s.presale.presaleNumber}</Anchor>
                        <Text size="xs" c="dimmed">{fmtKg(s.items.reduce((t, i) => t + Number(i.orderedWeightKg), 0).toFixed(3))} · {fmtBob(s.presale.totalAmount)}</Text>
                        {s.creditAuthorizedBy && <Text size="xs" c="orange">Crédito autorizado: {s.creditAuthorizedBy.fullName}</Text>}
                      </Table.Td>
                      <Table.Td><Badge variant="light" color={STOP_STATUS[s.status].color} style={{ minWidth: 'max-content' }}>{STOP_STATUS[s.status].label}</Badge></Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        {s.sale ? <Anchor component={Link} to={`/ventas/${s.sale.id}`} size="sm">{s.sale.saleNumber}</Anchor> : '—'}
                        {s.sale && <Text size="xs" c="dimmed">{fmtBob(s.sale.totalAmount)}</Text>}
                        {s.sale?.creditExceptionReason?.startsWith('Entregado en ruta') && <Badge size="xs" color="red" variant="light">Excedió crédito</Badge>}
                      </Table.Td>
                      <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                        {s.status === 'PENDING' || s.status === 'FAILED' ? '—' : fmtBob(s.paidAmount)}
                        {s.paymentMethod && <Text size="xs" c="dimmed">{PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod}</Text>}
                      </Table.Td>
                      <Table.Td>
                        {s.receivedByName && <Text size="sm">{s.receivedByName}</Text>}
                        {s.problemType && <Text size="sm" c="red">{DELIVERY_PROBLEMS[s.problemType]}</Text>}
                        {(s.cratesDelivered > 0 || s.cratesPickedUp > 0) && (
                          <Text size="xs" c="dimmed">Canastillos: dejó {s.cratesDelivered} · recogió {s.cratesPickedUp}</Text>
                        )}
                        {s.notes && <Text size="xs" c="dimmed">{s.notes}</Text>}
                        {s.resolvedAtDevice && <Text size="xs" c="dimmed">{fmtDateTime(s.resolvedAtDevice)}</Text>}
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        {s.status !== 'PENDING' && <Button size="compact-xs" variant="subtle" onClick={() => setReceipt(s)}>Ver entrega</Button>}
                        {s.status === 'PENDING' && r.status === 'IN_PROGRESS' && manage && (
                          <Button size="compact-xs" variant="light" onClick={() => setRegister(s)}>Registrar</Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          <DispatchModal route={r} opened={modal === 'dispatch'} onClose={() => setModal(null)} />
          <CloseModal route={r} opened={modal === 'close'} onClose={() => setModal(null)} />
          <CancelModal route={r} opened={modal === 'cancel'} onClose={() => setModal(null)} />
          <ReceiptModal stop={receipt} onClose={() => setReceipt(null)} />
          <RegisterModal stop={register} onClose={() => setRegister(null)} />
        </Stack>
      )}
    </QueryState>
  );
}

function useRouteMutation(fn: () => Promise<unknown>, ok: string, onClose: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      notifyOk(ok);
      for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: notifyError,
  });
}

function DispatchModal({ route, opened, onClose }: { route: RouteDetail; opened: boolean; onClose: () => void }) {
  const [loads, setLoads] = useState<Record<string, number | ''>>({});
  const [crates, setCrates] = useState<number | ''>(0);
  useEffect(() => {
    if (!opened) return;
    setLoads(Object.fromEntries(route.loadSheet.map((l) => [l.productId, Number(l.orderedKg)])));
    setCrates(Math.min(route.summary.estimatedCrates, route.vehicle.capacityCrates));
  }, [opened, route]);
  const stock = useQuery({
    queryKey: ['inventory-lots', route.originWarehouse.id],
    queryFn: async () => (await api.get<LotBalance[]>('/inventory/lots', { params: { warehouseId: route.originWarehouse.id } })).data,
    enabled: opened,
  });
  const available = (productId: string) => (stock.data ?? []).filter((l) => !l.expired && l.product.id === productId).reduce((t, l) => t + Number(l.weightKg), 0);
  const total = Object.values(loads).reduce<number>((t, v) => t + Number(v || 0), 0);
  const capacity = Number(route.vehicle.capacityKg);
  const invalid = route.loadSheet.some((l) => Number(loads[l.productId] || 0) < Number(l.orderedKg) || Number(loads[l.productId] || 0) > available(l.productId)) || total > capacity;
  const dispatch = useRouteMutation(
    () => api.post(`/routes/${route.id}/dispatch`, { cratesLoaded: Number(crates || 0), loads: Object.entries(loads).map(([productId, w]) => ({ productId, weightKg: Number(w || 0) })) }),
    'Ruta despachada: la carga pasó al vehículo y el chofer ya puede entregar',
    onClose,
  );
  return (
    <Modal opened={opened} onClose={onClose} title={`Despachar ${route.routeNumber}`} size="lg">
      <Stack>
        <Text size="sm">
          Confirme lo que se carga en {route.vehicle.plate}. Puede llevar un margen sobre lo pedido (los pollos se pesan al entregar); lo que sobre vuelve al almacén al liquidar.
        </Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th ta="right">Pedido</Table.Th>
              <Table.Th ta="right">En {route.originWarehouse.name}</Table.Th>
              <Table.Th>Cargar (kg)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {route.loadSheet.map((l) => {
              const v = Number(loads[l.productId] || 0);
              const avail = available(l.productId);
              return (
                <Table.Tr key={l.productId}>
                  <Table.Td>{l.name}</Table.Td>
                  <Table.Td ta="right">{fmtKg(l.orderedKg)}</Table.Td>
                  <Table.Td ta="right" c={avail < Number(l.orderedKg) ? 'red' : undefined}>{stock.data ? fmtKg(avail.toFixed(3)) : '…'}</Table.Td>
                  <Table.Td>
                    <NumberInput size="xs" w={110} min={0} decimalScale={3} value={loads[l.productId]} aria-label={`Kg a cargar de ${l.name}`}
                      error={v < Number(l.orderedKg) ? 'Menos de lo pedido' : v > avail ? 'Sin stock' : undefined}
                      onChange={(val) => setLoads((s) => ({ ...s, [l.productId]: val as number | '' }))} />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        <Text size="sm" c={total > capacity ? 'red' : undefined}>Total {fmtKg(total.toFixed(3))} de {fmtKg(route.vehicle.capacityKg)}</Text>
        <NumberInput label="Canastillos que salen" w={220} min={0} max={route.vehicle.capacityCrates} allowDecimal={false} value={crates}
          onChange={(v) => setCrates(v as number | '')} description={`Estimado ${route.summary.estimatedCrates} · capacidad ${route.vehicle.capacityCrates}`}
          error={Number(crates) > route.vehicle.capacityCrates ? 'Supera la capacidad' : undefined} />
        <Button disabled={invalid || Number(crates) > route.vehicle.capacityCrates} loading={dispatch.isPending} onClick={() => dispatch.mutate()}>Cargar y despachar</Button>
      </Stack>
    </Modal>
  );
}

function CloseModal({ route, opened, onClose }: { route: RouteDetail; opened: boolean; onClose: () => void }) {
  const [returns, setReturns] = useState<Record<string, number | ''>>({});
  const [notes, setNotes] = useState('');
  const expectedCrates = route.summary.crates?.expectedBack ?? 0;
  const [crates, setCrates] = useState<number | ''>(expectedCrates);
  useEffect(() => {
    if (opened) setCrates(Math.max(0, expectedCrates));
  }, [opened, expectedCrates]);
  const onBoard = useQuery({
    queryKey: ['inventory-lots', route.vehicle.warehouseId],
    queryFn: async () => (await api.get<LotBalance[]>('/inventory/lots', { params: { warehouseId: route.vehicle.warehouseId } })).data,
    enabled: opened,
  });
  useEffect(() => {
    if (opened && onBoard.data) setReturns(Object.fromEntries(onBoard.data.map((l) => [l.lotId, Number(l.weightKg)])));
    if (opened) setNotes('');
  }, [opened, onBoard.data]);
  const pending = route.stops.filter((s) => s.status === 'PENDING');
  const close = useRouteMutation(
    () => api.post(`/routes/${route.id}/close`, { notes: notes || undefined, cratesReturned: Number(crates || 0), returns: Object.entries(returns).map(([lotId, w]) => ({ lotId, receivedWeightKg: Number(w || 0) })) }),
    'Ruta liquidada: el sobrante volvió al almacén',
    onClose,
  );
  return (
    <Modal opened={opened} onClose={onClose} title={`Liquidar ${route.routeNumber}`} size="lg">
      <Stack>
        {pending.length > 0 && (
          <Alert color="orange">
            {pending.length} parada(s) sin registrar quedarán como «no visitadas» y sus pedidos volverán a pendientes: {pending.map((s) => s.customer.name).join(', ')}.
          </Alert>
        )}
        <Text size="sm">Pese lo que vuelve en el vehículo. Si falta algo respecto a lo que el sistema espera, la diferencia queda como pérdida.</Text>
        <QueryState isLoading={onBoard.isLoading} error={onBoard.error}>
          {onBoard.data?.length === 0 ? (
            <Text size="sm" c="dimmed">El vehículo vuelve vacío.</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto / lote</Table.Th>
                  <Table.Th ta="right">Debería volver</Table.Th>
                  <Table.Th>Vuelve (kg)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {onBoard.data?.map((l) => (
                  <Table.Tr key={l.lotId}>
                    <Table.Td>
                      <Text size="sm">{l.product.name}</Text>
                      <Text size="xs" c="dimmed">{l.lotCode}</Text>
                    </Table.Td>
                    <Table.Td ta="right">{fmtKg(l.weightKg)}</Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" w={110} min={0} max={Number(l.weightKg)} decimalScale={3} value={returns[l.lotId]} aria-label={`Kg que vuelven de ${l.lotCode}`}
                        error={Number(returns[l.lotId]) > Number(l.weightKg)} onChange={(v) => setReturns((s) => ({ ...s, [l.lotId]: v as number | '' }))} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </QueryState>
        <NumberInput label="Canastillos que volvieron" w={240} min={0} allowDecimal={false} value={crates} onChange={(v) => setCrates(v as number | '')}
          description={`Deberían volver ${expectedCrates}: salieron ${route.cratesLoaded}, quedaron ${route.summary.crates?.delivered ?? 0} con clientes y se recogieron ${route.summary.crates?.pickedUp ?? 0}`}
          error={Number(crates) < expectedCrates ? `Faltan ${expectedCrates - Number(crates)}: quedarán a cargo de ${route.driver.fullName}` : undefined} />
        <Textarea label="Observaciones" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        <Button loading={close.isPending} disabled={onBoard.isLoading || (onBoard.data ?? []).some((l) => returns[l.lotId] === '' || Number(returns[l.lotId]) > Number(l.weightKg))}
          onClick={() => close.mutate()}>
          Liquidar
        </Button>
      </Stack>
    </Modal>
  );
}

function CancelModal({ route, opened, onClose }: { route: RouteDetail; opened: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const cancel = useRouteMutation(() => api.post(`/routes/${route.id}/cancel`, { reason }), 'Ruta cancelada: los pedidos vuelven a pendientes', onClose);
  return (
    <Modal opened={opened} onClose={onClose} title={`Cancelar ${route.routeNumber}`}>
      <Stack>
        <Textarea label="Motivo" withAsterisk autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Button color="red" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar ruta</Button>
      </Stack>
    </Modal>
  );
}

/** Comprobante de la entrega: lo pedido vs. lo entregado, cobro, quién recibió y su firma. */
function ReceiptModal({ stop: s, onClose }: { stop: RouteStop | null; onClose: () => void }) {
  return (
    <Modal opened={!!s} onClose={onClose} title={s ? `Entrega a ${s.customer.name}` : ''} size="lg">
      {s && (
        <Stack>
          <Group gap="xs">
            <Badge variant="light" color={STOP_STATUS[s.status].color}>{STOP_STATUS[s.status].label}</Badge>
            {s.resolvedAtDevice && <Text size="sm">{fmtDateTime(s.resolvedAtDevice)}</Text>}
            {s.recordedBy && <Text size="sm" c="dimmed">· registró {s.recordedBy.fullName}</Text>}
          </Group>
          {s.problemType && <Alert color="red" title={DELIVERY_PROBLEMS[s.problemType]}>{s.notes ?? 'Sin observaciones'}</Alert>}
          {s.status !== 'FAILED' && (
            <>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Pedido</Table.Th>
                    <Table.Th ta="right">Entregado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {s.items.map((i) => (
                    <Table.Tr key={i.id}>
                      <Table.Td>
                        {i.product.name}
                        {i.differenceReason && <Text size="xs" c="orange">{i.differenceReason}</Text>}
                      </Table.Td>
                      <Table.Td ta="right">{fmtKg(i.orderedWeightKg)}</Table.Td>
                      <Table.Td ta="right" fw={600}>{fmtKg(i.deliveredWeightKg)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <SimpleGrid cols={2}>
                <div>
                  <Text size="xs" c="dimmed">Venta</Text>
                  <Text size="sm">{s.sale ? `${s.sale.saleNumber} · ${fmtBob(s.sale.totalAmount)}` : '—'}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Cobrado</Text>
                  <Text size="sm">{fmtBob(s.paidAmount)}{s.paymentMethod ? ` · ${PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod}` : ''}{s.sale && Number(s.sale.creditAmount) > 0 ? ` · a crédito ${fmtBob(s.sale.creditAmount)}` : ''}</Text>
                </div>
              </SimpleGrid>
              {s.sale?.creditExceptionReason && <Text size="xs" c="red">{s.sale.creditExceptionReason}</Text>}
              <div>
                <Text size="xs" c="dimmed">Recibió</Text>
                <Text size="sm" fw={500}>{s.receivedByName}</Text>
                {s.signature ? (
                  <Image src={s.signature} alt={`Firma de ${s.receivedByName}`} maw={320} mt={4} bg="white" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }} />
                ) : (
                  <Text size="xs" c="dimmed">Sin firma</Text>
                )}
              </div>
              {s.notes && <Text size="sm">Observaciones: {s.notes}</Text>}
            </>
          )}
          {s.latitude && s.longitude && (
            <Anchor href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=18/${s.latitude}/${s.longitude}`} target="_blank" size="sm">
              Ver dónde se registró
            </Anchor>
          )}
        </Stack>
      )}
    </Modal>
  );
}

/** Registro desde la oficina (p. ej. el chofer llamó o no tiene teléfono). */
function RegisterModal({ stop: s, onClose }: { stop: RouteStop | null; onClose: () => void }) {
  const [mode, setMode] = useState<'deliver' | 'fail'>('deliver');
  const [kgs, setKgs] = useState<Record<string, number | ''>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [paid, setPaid] = useState<number | ''>(0);
  const [method, setMethod] = useState<string | null>('EFECTIVO');
  const [receiver, setReceiver] = useState('');
  const [cratesOut, setCratesOut] = useState<number | ''>(0);
  const [cratesIn, setCratesIn] = useState<number | ''>(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!s) return;
    setMode('deliver');
    setKgs(Object.fromEntries(s.items.map((i) => [i.product.id, Number(i.orderedWeightKg)])));
    setReasons({});
    setPaid(0);
    setReceiver('');
    setCratesOut(0);
    setCratesIn(0);
    setProblem(null);
    setNotes('');
  }, [s]);
  const deliver = useRouteMutation(
    () =>
      api.post(`/routes/stops/${s!.id}/deliver`, {
        items: s!.items.map((i) => ({ productId: i.product.id, deliveredWeightKg: Number(kgs[i.product.id] || 0), differenceReason: reasons[i.product.id] || undefined })),
        paidAmount: Number(paid || 0),
        paymentMethod: Number(paid || 0) > 0 ? method : undefined,
        receivedByName: receiver,
        cratesDelivered: Number(cratesOut || 0),
        cratesPickedUp: Number(cratesIn || 0),
        notes: notes || undefined,
      }),
    'Entrega registrada',
    onClose,
  );
  const fail = useRouteMutation(() => api.post(`/routes/stops/${s!.id}/fail`, { problemType: problem, notes: notes || undefined }), 'Parada registrada como no entregada', onClose);
  const missingReason = s?.items.some((i) => Number(kgs[i.product.id] || 0) !== Number(i.orderedWeightKg) && !reasons[i.product.id]?.trim());
  return (
    <Modal opened={!!s} onClose={onClose} title={s ? `Registrar parada ${s.sequence}: ${s.customer.name}` : ''} size="lg">
      {s && (
        <Stack>
          <Group>
            <Button variant={mode === 'deliver' ? 'filled' : 'default'} onClick={() => setMode('deliver')}>Entregado</Button>
            <Button variant={mode === 'fail' ? 'filled' : 'default'} color="red" onClick={() => setMode('fail')}>No entregado</Button>
          </Group>
          {mode === 'deliver' ? (
            <>
              {s.items.map((i) => {
                const differs = Number(kgs[i.product.id] || 0) !== Number(i.orderedWeightKg);
                return (
                  <Group key={i.id} align="flex-end" grow>
                    <NumberInput label={`${i.product.name} (pidió ${fmtKg(i.orderedWeightKg)})`} min={0} decimalScale={3} value={kgs[i.product.id]}
                      onChange={(v) => setKgs((k) => ({ ...k, [i.product.id]: v as number | '' }))} />
                    {differs && (
                      <TextInput label="Motivo de la diferencia" withAsterisk value={reasons[i.product.id] ?? ''}
                        onChange={(e) => { const value = e.currentTarget.value; setReasons((r) => ({ ...r, [i.product.id]: value })); }} />
                    )}
                  </Group>
                );
              })}
              <Group grow>
                <NumberInput label="Cobrado (Bs)" min={0} decimalScale={2} value={paid} onChange={(v) => setPaid(v as number | '')} />
                <Select label="Método" disabled={!Number(paid)} value={method} onChange={setMethod} data={Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))} />
              </Group>
              <Group grow>
                <NumberInput label="Canastillos que deja" min={0} allowDecimal={false} value={cratesOut} onChange={(v) => setCratesOut(v as number | '')} />
                <NumberInput label="Canastillos que recoge" min={0} allowDecimal={false} value={cratesIn} onChange={(v) => setCratesIn(v as number | '')} />
              </Group>
              <TextInput label="Recibió" withAsterisk value={receiver} onChange={(e) => setReceiver(e.currentTarget.value)} />
              <Textarea label="Observaciones" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
              <Text size="xs" c="dimmed">Sin firma: la firma se toma en el teléfono del chofer.</Text>
              <Button disabled={receiver.trim().length < 2 || !!missingReason} loading={deliver.isPending} onClick={() => deliver.mutate()}>Registrar entrega</Button>
            </>
          ) : (
            <>
              <Select label="Motivo" withAsterisk value={problem} onChange={setProblem}
                data={Object.entries(DELIVERY_PROBLEMS).filter(([k]) => k !== 'NOT_VISITED').map(([value, label]) => ({ value, label }))} />
              <Textarea label="Detalle" autosize minRows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
              <Button color="red" disabled={!problem || (problem === 'OTHER' && !notes.trim())} loading={fail.isPending} onClick={() => fail.mutate()}>Registrar no entrega</Button>
            </>
          )}
        </Stack>
      )}
    </Modal>
  );
}

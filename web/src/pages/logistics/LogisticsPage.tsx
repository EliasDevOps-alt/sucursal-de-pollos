import { Anchor, Badge, Button, Card, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Switch, Table, Tabs, Text, TextInput } from '@mantine/core';
import { IconEdit, IconPlus, IconRoute, IconTruck } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { RouteListItem, Vehicle } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDate, fmtKg, ROUTE_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());

function RoutesTab() {
  const { can } = useAuth();
  const [date, setDate] = useState(todayLocal());
  const [status, setStatus] = useState('ALL');
  const { data, isLoading, error } = useQuery({
    queryKey: ['routes', date, status],
    queryFn: async () =>
      (await api.get<RouteListItem[]>('/routes', { params: { date: date || undefined, status: status === 'ALL' ? undefined : status } })).data,
    refetchInterval: 20_000, // las entregas llegan desde los teléfonos
  });

  return (
    <>
      <Group justify="space-between" mb="sm" align="flex-end">
        <Group align="flex-end">
          <TextInput label="Fecha" type="date" w={170} value={date} onChange={(e) => setDate(e.currentTarget.value)} />
          <SegmentedControl
            value={status}
            onChange={setStatus}
            data={[
              { value: 'ALL', label: 'Todas' },
              { value: 'PLANNED', label: 'Planificadas' },
              { value: 'IN_PROGRESS', label: 'En ruta' },
              { value: 'COMPLETED', label: 'Liquidadas' },
            ]}
          />
          {date && <Button variant="subtle" size="xs" onClick={() => setDate('')}>Ver todas las fechas</Button>}
        </Group>
        {can('routes.manage') && (
          <Button component={Link} to="/logistica/nueva" leftSection={<IconRoute size={16} />}>Nueva ruta</Button>
        )}
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No hay rutas con este filtro.</Text>
          ) : (
            <Table.ScrollContainer minWidth={880}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ruta</Table.Th>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Vehículo</Table.Th>
                    <Table.Th>Chofer</Table.Th>
                    <Table.Th ta="center">Entregas</Table.Th>
                    <Table.Th ta="right">Kg pedidos</Table.Th>
                    <Table.Th ta="right">Monto pedido</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}><Anchor component={Link} to={`/logistica/${r.id}`} fw={600}>{r.routeNumber}</Anchor></Table.Td>
                      <Table.Td>{fmtDate(r.routeDate)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>{r.vehicle.plate}</Text>
                        <Text size="xs" c="dimmed">{r.vehicle.description}</Text>
                      </Table.Td>
                      <Table.Td>{r.driver.fullName}</Table.Td>
                      <Table.Td ta="center" style={{ whiteSpace: 'nowrap' }}>
                        {r.summary.delivered}/{r.summary.stops}
                        {r.summary.failed > 0 && <Text span size="xs" c="red"> · {r.summary.failed} sin entregar</Text>}
                      </Table.Td>
                      <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{fmtKg(r.summary.orderedKg)}</Table.Td>
                      <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{fmtBob(r.summary.orderedAmount)}</Table.Td>
                      <Table.Td><Badge variant="light" color={ROUTE_STATUS[r.status].color} style={{ minWidth: 'max-content' }}>{ROUTE_STATUS[r.status].label}</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      </QueryState>
    </>
  );
}

function VehiclesTab() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['vehicles'], queryFn: async () => (await api.get<Vehicle[]>('/vehicles')).data });
  return (
    <>
      <Group justify="flex-end" mb="sm">
        {can('routes.manage') && <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>Nuevo vehículo</Button>}
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={760}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Placa</Table.Th>
                  <Table.Th>Descripción</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th ta="right">Capacidad</Table.Th>
                  <Table.Th>Ruta actual</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.map((v) => (
                  <Table.Tr key={v.id} opacity={v.isActive ? 1 : 0.5}>
                    <Table.Td fw={600}>{v.plate}{!v.isActive && <Badge ml="xs" size="xs" color="gray">Inactivo</Badge>}</Table.Td>
                    <Table.Td>{v.description}</Table.Td>
                    <Table.Td>{v.ownership === 'OWN' ? 'Propio' : `Subcontratado · ${v.ownerName}`}</Table.Td>
                    <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{fmtKg(v.capacityKg)} · {v.capacityCrates} canastillos</Table.Td>
                    <Table.Td>
                      {v.activeRoutes?.map((r) => (
                        <Anchor key={r.id} component={Link} to={`/logistica/${r.id}`} size="sm" mr="xs">{r.routeNumber} ({ROUTE_STATUS[r.status].label.toLowerCase()})</Anchor>
                      ))}
                    </Table.Td>
                    <Table.Td>
                      {can('routes.manage') && (
                        <Button size="compact-xs" variant="subtle" leftSection={<IconEdit size={14} />} onClick={() => setEditing(v)}>Editar</Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </QueryState>
      <VehicleModal vehicle={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function VehicleModal({ vehicle, onClose }: { vehicle: Vehicle | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = vehicle === 'new';
  const [form, setForm] = useState({ plate: '', description: '', ownership: 'OWN', ownerName: '', capacityKg: 1000 as number | '', capacityCrates: 50 as number | '', isActive: true });
  useEffect(() => {
    if (!vehicle) return;
    if (vehicle === 'new') setForm({ plate: '', description: '', ownership: 'OWN', ownerName: '', capacityKg: 1000, capacityCrates: 50, isActive: true });
    else
      setForm({
        plate: vehicle.plate,
        description: vehicle.description,
        ownership: vehicle.ownership,
        ownerName: vehicle.ownerName ?? '',
        capacityKg: Number(vehicle.capacityKg),
        capacityCrates: vehicle.capacityCrates,
        isActive: vehicle.isActive,
      });
  }, [vehicle]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        description: form.description,
        ownership: form.ownership,
        ownerName: form.ownership === 'SUBCONTRACTED' ? form.ownerName : undefined,
        capacityKg: Number(form.capacityKg),
        capacityCrates: Number(form.capacityCrates),
      };
      return isNew ? api.post('/vehicles', { ...body, plate: form.plate }) : api.patch(`/vehicles/${(vehicle as Vehicle).id}`, { ...body, isActive: form.isActive });
    },
    onSuccess: () => {
      notifyOk(isNew ? 'Vehículo registrado' : 'Vehículo actualizado');
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
    },
    onError: notifyError,
  });
  return (
    <Modal opened={!!vehicle} onClose={onClose} title={isNew ? 'Nuevo vehículo' : `Vehículo ${form.plate}`}>
      <Stack>
        {isNew && <TextInput label="Placa" withAsterisk value={form.plate} onChange={(e) => set({ plate: e.currentTarget.value.toUpperCase() })} />}
        <TextInput label="Descripción" withAsterisk value={form.description} onChange={(e) => set({ description: e.currentTarget.value })} placeholder="Ej.: Camioneta con furgón térmico" />
        <Select label="Tipo" allowDeselect={false} value={form.ownership} onChange={(v) => set({ ownership: v ?? 'OWN' })}
          data={[{ value: 'OWN', label: 'Propio' }, { value: 'SUBCONTRACTED', label: 'Subcontratado' }]} />
        {form.ownership === 'SUBCONTRACTED' && (
          <TextInput label="Empresa o dueño" withAsterisk value={form.ownerName} onChange={(e) => set({ ownerName: e.currentTarget.value })} />
        )}
        <Group grow>
          <NumberInput label="Capacidad (kg)" withAsterisk min={1} value={form.capacityKg} onChange={(v) => set({ capacityKg: v as number | '' })} />
          <NumberInput label="Canastillos" withAsterisk min={0} allowDecimal={false} value={form.capacityCrates} onChange={(v) => set({ capacityCrates: v as number | '' })} />
        </Group>
        {!isNew && <Switch label="Activo" checked={form.isActive} onChange={(e) => set({ isActive: e.currentTarget.checked })} />}
        <Button loading={save.isPending} disabled={(isNew && form.plate.trim().length < 4) || !form.description.trim() || !form.capacityKg || form.capacityCrates === '' || (form.ownership === 'SUBCONTRACTED' && !form.ownerName.trim())}
          onClick={() => save.mutate()}>
          Guardar
        </Button>
      </Stack>
    </Modal>
  );
}

export function LogisticsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'vehiculos' ? 'vehiculos' : 'rutas';
  return (
    <>
      <PageHeader title="Logística" subtitle="Rutas de entrega, carga de vehículos, entregas del chofer y liquidación" />
      <Tabs value={tab} onChange={(v) => setParams(v === 'vehiculos' ? { tab: v } : {})} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="rutas" leftSection={<IconRoute size={16} />}>Rutas</Tabs.Tab>
          <Tabs.Tab value="vehiculos" leftSection={<IconTruck size={16} />}>Vehículos</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="rutas"><RoutesTab /></Tabs.Panel>
        <Tabs.Panel value="vehiculos"><VehiclesTab /></Tabs.Panel>
      </Tabs>
    </>
  );
}

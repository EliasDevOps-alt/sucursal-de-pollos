import { ActionIcon, Badge, Button, Card, Group, Modal, NumberInput, Stack, Switch, Table, Tabs, Text, TextInput } from '@mantine/core';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Category, CompanyInfo, CustomerRank } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtPct } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

interface CustomerTypeRow {
  id: string;
  name: string;
  isActive: boolean;
  _count: { customers: number };
}

function CategoriesTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const { data, isLoading, error } = useQuery({ queryKey: ['categories'], queryFn: async () => (await api.get<Category[]>('/categories')).data });

  const open = (c: Category | 'new') => {
    setCode(c === 'new' ? '' : c.code);
    setName(c === 'new' ? '' : c.name);
    setDescription(c === 'new' ? '' : (c.description ?? ''));
    setActive(c === 'new' ? true : c.isActive);
    setEditing(c);
  };
  const save = useMutation({
    mutationFn: async () => {
      const body = { code: code.toUpperCase(), name: name.trim(), description: description.trim() || undefined };
      return editing === 'new' ? api.post('/categories', body) : api.patch(`/categories/${(editing as Category).id}`, { ...body, isActive: active });
    },
    onSuccess: () => {
      notifyOk('Categoría guardada');
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
    },
    onError: notifyError,
  });

  return (
    <QueryState isLoading={isLoading} error={error}>
      <Group justify="flex-end" mb="sm">
        {can('catalog.manage') && <Button leftSection={<IconPlus size={16} />} onClick={() => open('new')}>Nueva categoría</Button>}
      </Group>
      <Card withBorder p={0}>
        <Table striped>
          <Table.Thead>
            <Table.Tr><Table.Th>Código</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Descripción</Table.Th><Table.Th>Estado</Table.Th><Table.Th /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td ff="monospace">{c.code}</Table.Td>
                <Table.Td fw={500}>{c.name}</Table.Td>
                <Table.Td>{c.description ?? '—'}</Table.Td>
                <Table.Td><Badge variant="light" color={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Activa' : 'Inactiva'}</Badge></Table.Td>
                <Table.Td>{can('catalog.manage') && <ActionIcon variant="subtle" onClick={() => open(c)} aria-label="Editar"><IconEdit size={16} /></ActionIcon>}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva categoría' : 'Editar categoría'}>
        <Stack>
          <TextInput label="Código" withAsterisk placeholder="ENT" value={code} onChange={(e) => setCode(e.currentTarget.value.toUpperCase())} />
          <TextInput label="Nombre" withAsterisk value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <TextInput label="Descripción" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
          {editing !== 'new' && <Switch label="Activa" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />}
          <Button disabled={!/^[A-Z0-9-]{2,20}$/.test(code) || !name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button>
        </Stack>
      </Modal>
    </QueryState>
  );
}

function CustomerTypesTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CustomerTypeRow | 'new' | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-customer-types'],
    queryFn: async () => (await api.get<CustomerTypeRow[]>('/admin/customer-types')).data,
  });
  const open = (t: CustomerTypeRow | 'new') => {
    setName(t === 'new' ? '' : t.name);
    setActive(t === 'new' ? true : t.isActive);
    setEditing(t);
  };
  const save = useMutation({
    mutationFn: async () =>
      editing === 'new' ? api.post('/customer-types', { name }) : api.patch(`/customer-types/${(editing as CustomerTypeRow).id}`, { name, isActive: active }),
    onSuccess: () => {
      notifyOk('Tipo de cliente guardado');
      qc.invalidateQueries({ queryKey: ['admin-customer-types'] });
      qc.invalidateQueries({ queryKey: ['customer-types'] });
      setEditing(null);
    },
    onError: notifyError,
  });

  return (
    <QueryState isLoading={isLoading} error={error}>
      <Group justify="flex-end" mb="sm">
        {can('catalog.manage') && <Button leftSection={<IconPlus size={16} />} onClick={() => open('new')}>Nuevo tipo</Button>}
      </Group>
      <Card withBorder p={0}>
        <Table striped>
          <Table.Thead>
            <Table.Tr><Table.Th>Nombre</Table.Th><Table.Th ta="right">Clientes</Table.Th><Table.Th>Estado</Table.Th><Table.Th /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td fw={500}>{t.name}</Table.Td>
                <Table.Td ta="right">{t._count.customers}</Table.Td>
                <Table.Td><Badge variant="light" color={t.isActive ? 'green' : 'gray'}>{t.isActive ? 'Activo' : 'Inactivo'}</Badge></Table.Td>
                <Table.Td>{can('catalog.manage') && <ActionIcon variant="subtle" onClick={() => open(t)} aria-label="Editar"><IconEdit size={16} /></ActionIcon>}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo tipo de cliente' : 'Editar tipo de cliente'}>
        <Stack>
          <TextInput label="Nombre" withAsterisk placeholder="Restaurante" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          {editing !== 'new' && (
            <Switch label="Activo" description="Un tipo inactivo no se ofrece al registrar clientes nuevos" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
          )}
          <Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button>
        </Stack>
      </Modal>
    </QueryState>
  );
}

/** Rangos de cliente: beneficios (descuento y límite) y condiciones para que el sistema sugiera el ascenso. */
function RanksTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CustomerRank | null>(null);
  const [form, setForm] = useState({ discountPercentage: 0, creditLimit: 0, minMonthlyPurchase: 0, maxDaysOverdue: 30 });
  const { data, isLoading, error } = useQuery({ queryKey: ['customer-ranks'], queryFn: async () => (await api.get<CustomerRank[]>('/customer-ranks')).data });
  const open = (r: CustomerRank) => {
    setForm({ discountPercentage: Number(r.discountPercentage), creditLimit: Number(r.creditLimit), minMonthlyPurchase: Number(r.minMonthlyPurchase), maxDaysOverdue: r.maxDaysOverdue });
    setEditing(r);
  };
  const save = useMutation({
    mutationFn: async () => api.patch(`/customer-ranks/${editing!.id}`, form),
    onSuccess: () => {
      notifyOk(`Rango ${editing!.name} guardado`);
      qc.invalidateQueries({ queryKey: ['customer-ranks'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditing(null);
    },
    onError: notifyError,
  });
  const num = (k: keyof typeof form) => ({ value: form[k], onChange: (v: string | number) => setForm((f) => ({ ...f, [k]: Number(v) || 0 })) });
  return (
    <QueryState isLoading={isLoading} error={error}>
      <Text size="sm" c="dimmed" mb="sm">
        El sistema sugiere subir de rango a los clientes cuya compra promedio de los últimos 90 días alcanza el mínimo del rango y cuya deuda más antigua no supera los días indicados (en Clientes). El cambio lo aprueba una persona, con motivo.
      </Text>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={680}>
          <Table striped style={{ fontVariantNumeric: 'tabular-nums' }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Rango</Table.Th>
                <Table.Th ta="right">Descuento</Table.Th>
                <Table.Th ta="right">Límite de crédito</Table.Th>
                <Table.Th ta="right">Compra mínima / mes</Table.Th>
                <Table.Th ta="right">Deuda más antigua</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td fw={500}>{r.name}</Table.Td>
                  <Table.Td ta="right">{fmtPct(r.discountPercentage)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(r.creditLimit)}</Table.Td>
                  <Table.Td ta="right">{Number(r.minMonthlyPurchase) > 0 ? fmtBob(r.minMonthlyPurchase) : 'rango de entrada'}</Table.Td>
                  <Table.Td ta="right">hasta {r.maxDaysOverdue} días</Table.Td>
                  <Table.Td><ActionIcon variant="subtle" onClick={() => open(r)} aria-label="Editar"><IconEdit size={16} /></ActionIcon></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
      <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Rango ${editing?.name ?? ''}`}>
        <Stack>
          <NumberInput label="Descuento (%)" min={0} max={50} decimalScale={2} {...num('discountPercentage')} />
          <NumberInput label="Límite de crédito (Bs)" description="Se propone al asignar el rango; cada cliente puede tener el suyo" min={0} decimalScale={2} {...num('creditLimit')} />
          <NumberInput label="Compra mínima por mes (Bs)" description="Promedio de los últimos 90 días para sugerir este rango (0 = rango de entrada)" min={0} decimalScale={2} {...num('minMonthlyPurchase')} />
          <NumberInput label="Deuda más antigua permitida (días)" min={0} max={365} allowDecimal={false} {...num('maxDaysOverdue')} />
          <Button loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button>
        </Stack>
      </Modal>
    </QueryState>
  );
}

const COMPANY_FIELDS: { key: keyof CompanyInfo; label: string; hint?: string }[] = [
  { key: 'name', label: 'Nombre comercial' },
  { key: 'nit', label: 'NIT' },
  { key: 'address', label: 'Dirección' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'footer', label: 'Pie del comprobante', hint: 'Se imprime al final de cada recibo' },
];

/** Encabezado y pie de los comprobantes (web y app). */
function CompanyTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CompanyInfo | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['settings', 'company'], queryFn: async () => (await api.get<CompanyInfo>('/settings/company')).data });
  const value = form ?? data;
  const save = useMutation({
    mutationFn: async () => api.put<CompanyInfo>('/settings/company', value),
    onSuccess: (r) => {
      qc.setQueryData(['settings', 'company'], r.data);
      setForm(null);
      notifyOk('Datos del negocio guardados');
    },
    onError: notifyError,
  });
  return (
    <QueryState isLoading={isLoading} error={error}>
      {value && (
        <Card withBorder maw={560}>
          <Stack>
            {COMPANY_FIELDS.map((f) => (
              <TextInput key={f.key} label={f.label} description={f.hint} value={value[f.key]}
                onChange={(e) => setForm({ ...value, [f.key]: e.currentTarget.value })} />
            ))}
            <Text size="xs" c="dimmed">La app del chofer y del cobrador los recibe al sincronizar.</Text>
            <Group><Button disabled={!form || !value.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button></Group>
          </Stack>
        </Card>
      )}
    </QueryState>
  );
}

export function CatalogsAdminPage() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader title="Catálogos" subtitle="Categorías de producto, tipos de cliente y datos del negocio para los comprobantes" />
      <Tabs defaultValue="categories" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="categories">Categorías de producto</Tabs.Tab>
          <Tabs.Tab value="types">Tipos de cliente</Tabs.Tab>
          {can('customer.rank_change') && <Tabs.Tab value="ranks">Rangos de cliente</Tabs.Tab>}
          {can('users.manage') && <Tabs.Tab value="company">Datos del negocio</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="categories"><CategoriesTab /></Tabs.Panel>
        <Tabs.Panel value="types"><CustomerTypesTab /></Tabs.Panel>
        <Tabs.Panel value="ranks"><RanksTab /></Tabs.Panel>
        <Tabs.Panel value="company"><CompanyTab /></Tabs.Panel>
      </Tabs>
      <Text size="xs" c="dimmed" mt="md">Los rangos de cliente (descuento y límite de crédito) se asignan desde la ficha de cada cliente.</Text>
    </>
  );
}

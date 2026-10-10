import { Anchor, Badge, Button, Card, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Customer, CustomerRank } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtPct } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { RankSuggestions } from './RankSuggestions';

export function useCustomerCatalogs() {
  const types = useQuery({
    queryKey: ['customer-types'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/customer-types')).data,
  });
  const ranks = useQuery({
    queryKey: ['customer-ranks'],
    queryFn: async () => (await api.get<CustomerRank[]>('/customer-ranks')).data,
  });
  return { types: types.data ?? [], ranks: ranks.data ?? [] };
}

interface FormValues {
  name: string;
  documentId: string;
  phone: string;
  customerTypeId: string;
  rankId: string | null;
  creditEnabled: boolean;
  creditLimit: number | '';
  addressLabel: string;
  address: string;
}

export function CustomersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [withDebt, setWithDebt] = useState(false);
  const [creating, setCreating] = useState(false);
  const { types, ranks } = useCustomerCatalogs();
  const canAdminCredit = can('customer.rank_change');

  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', { debounced, withDebt }],
    queryFn: async () =>
      (await api.get<Customer[]>('/customers', { params: { search: debounced || undefined, withDebt: withDebt || undefined } })).data,
  });

  const form = useForm<FormValues>({
    initialValues: {
      name: '', documentId: '', phone: '', customerTypeId: '', rankId: null,
      creditEnabled: false, creditLimit: '', addressLabel: 'Principal', address: '',
    },
    validate: {
      name: (v) => (v.trim() ? null : 'El nombre es obligatorio'),
      customerTypeId: (v) => (v ? null : 'Seleccione el tipo'),
    },
  });

  const create = useMutation({
    mutationFn: async (v: FormValues) =>
      (
        await api.post<Customer>('/customers', {
          name: v.name.trim(),
          documentId: v.documentId || undefined,
          phone: v.phone || undefined,
          customerTypeId: v.customerTypeId,
          ...(canAdminCredit
            ? { rankId: v.rankId || undefined, creditEnabled: v.creditEnabled, creditLimit: v.creditLimit === '' ? undefined : v.creditLimit }
            : {}),
          address: v.address.trim() ? { label: v.addressLabel || 'Principal', address: v.address.trim() } : undefined,
        })
      ).data,
    onSuccess: (c) => {
      notifyOk(`Cliente ${c.code} creado`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      setCreating(false);
      form.reset();
      navigate(`/clientes/${c.id}`);
    },
    onError: notifyError,
  });

  const selectedRank = ranks.find((r) => r.id === form.values.rankId);

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Tiendas, mercados, mayoristas y particulares"
        actions={can('customers.manage') && <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>Nuevo cliente</Button>}
      />
      {canAdminCredit && <RankSuggestions />}
      <Group mb="sm" align="flex-end">
        <TextInput
          placeholder="Buscar por nombre, código, CI/NIT o teléfono"
          leftSection={<IconSearch size={16} />}
          w={360}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Switch label="Solo con deuda" checked={withDebt} onChange={(e) => setWithDebt(e.currentTarget.checked)} mb={8} />
      </Group>

      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No se encontraron clientes.</Text>
          ) : (
            <Table.ScrollContainer minWidth={820}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Rango</Table.Th>
                    <Table.Th ta="right">Deuda</Table.Th>
                    <Table.Th ta="right">Crédito disponible</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td ff="monospace">{c.code}</Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/clientes/${c.id}`} fw={600}>{c.name}</Anchor>
                        {c.addresses[0] && <Text size="xs" c="dimmed">{c.addresses[0].address}</Text>}
                      </Table.Td>
                      <Table.Td>{c.customerType.name}</Table.Td>
                      <Table.Td>
                        {c.rank ? <Badge variant="light">{c.rank.name} · {fmtPct(c.rank.discountPercentage)}</Badge> : '—'}
                      </Table.Td>
                      <Table.Td ta="right" c={Number(c.currentDebt) > 0 ? 'orange' : undefined} fw={Number(c.currentDebt) > 0 ? 600 : undefined}>
                        {fmtBob(c.currentDebt)}
                      </Table.Td>
                      <Table.Td ta="right">{c.creditEnabled ? fmtBob(c.creditAvailable) : <Text span size="sm" c="dimmed">Sin crédito</Text>}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={c.status === 'ACTIVE' ? 'green' : 'gray'}>{c.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      </QueryState>

      <Modal opened={creating} onClose={() => setCreating(false)} title="Nuevo cliente" size="lg">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack>
            <TextInput label="Nombre o razón comercial" withAsterisk {...form.getInputProps('name')} />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Select label="Tipo" withAsterisk data={types.map((t) => ({ value: t.id, label: t.name }))} {...form.getInputProps('customerTypeId')} />
              <TextInput label="CI / NIT" {...form.getInputProps('documentId')} />
              <TextInput label="Teléfono" {...form.getInputProps('phone')} />
            </SimpleGrid>
            {canAdminCredit ? (
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Select
                  label="Rango"
                  clearable
                  data={ranks.map((r) => ({ value: r.id, label: `${r.name} (${fmtPct(r.discountPercentage)} desc.)` }))}
                  {...form.getInputProps('rankId')}
                />
                <NumberInput
                  label="Límite de crédito (Bs)"
                  min={0}
                  decimalScale={2}
                  placeholder={selectedRank ? `Del rango: ${Number(selectedRank.creditLimit)}` : '0'}
                  {...form.getInputProps('creditLimit')}
                />
                <Switch label="Crédito habilitado" mt={30} {...form.getInputProps('creditEnabled', { type: 'checkbox' })} />
              </SimpleGrid>
            ) : (
              <Text size="xs" c="dimmed">Rango y crédito los asigna Administración.</Text>
            )}
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <TextInput label="Etiqueta de dirección" {...form.getInputProps('addressLabel')} />
              <TextInput label="Dirección" style={{ gridColumn: 'span 2' }} {...form.getInputProps('address')} />
            </SimpleGrid>
            <Button type="submit" loading={create.isPending}>Crear cliente</Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}

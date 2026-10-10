import { ActionIcon, Badge, Button, Card, Group, Modal, NumberInput, Select, Stack, Switch, Table, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import type { Category, Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { fmtKg } from '../lib/format';
import { notifyError, notifyOk } from '../lib/notify';

interface FormValues {
  code: string;
  name: string;
  brand: string;
  categoryId: string;
  saleUnit: Product['saleUnit'];
  minStockKg: number | '';
  kgPerCrate: number | '';
  isActive: boolean;
}

const empty: FormValues = { code: '', name: '', brand: '', categoryId: '', saleUnit: 'KG', minStockKg: 0, kgPerCrate: '', isActive: true };

const UNIT_OPTIONS = [
  { value: 'KG', label: 'Kilogramo' },
  { value: 'CANASTILLO', label: 'Canastillo' },
  { value: 'UNIDAD', label: 'Unidad' },
];

export function ProductsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  const products = useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => (await api.get<Product[]>('/products', { params: { includeInactive: true } })).data,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
  });

  const form = useForm<FormValues>({
    initialValues: empty,
    validate: {
      code: (v) => (/^[A-Z0-9-]{2,20}$/.test(v) ? null : '2–20 caracteres: mayúsculas, números o guion'),
      name: (v) => (v.trim() ? null : 'El nombre es obligatorio'),
      categoryId: (v) => (v ? null : 'Seleccione una categoría'),
    },
    transformValues: (v) => ({ ...v, code: v.code.toUpperCase() }),
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = { ...values, brand: values.brand || undefined, minStockKg: Number(values.minStockKg || 0), kgPerCrate: values.kgPerCrate ? Number(values.kgPerCrate) : null };
      if (editing === 'new') {
        const { isActive: _ignored, ...create } = body;
        return api.post('/products', create);
      }
      return api.patch(`/products/${(editing as Product).id}`, body);
    },
    onSuccess: () => {
      notifyOk(editing === 'new' ? 'Producto creado' : 'Producto actualizado');
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
    },
    onError: notifyError,
  });

  const open = (p: Product | 'new') => {
    form.setValues(
      p === 'new'
        ? empty
        : { code: p.code, name: p.name, brand: p.brand ?? '', categoryId: p.categoryId, saleUnit: p.saleUnit, minStockKg: Number(p.minStockKg), kgPerCrate: p.kgPerCrate ? Number(p.kgPerCrate) : '', isActive: p.isActive },
    );
    setEditing(p);
  };

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="El precio no se define aquí: cada lote tiene su propio costo y precio"
        actions={can('catalog.manage') && <Button leftSection={<IconPlus size={16} />} onClick={() => open('new')}>Nuevo producto</Button>}
      />
      <QueryState isLoading={products.isLoading} error={products.error}>
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={600}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Código</Table.Th>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Marca</Table.Th>
                  <Table.Th>Categoría</Table.Th>
                  <Table.Th>Unidad</Table.Th>
                  <Table.Th ta="right">Stock mínimo</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {products.data?.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td ff="monospace">{p.code}</Table.Td>
                    <Table.Td fw={500}>{p.name}</Table.Td>
                    <Table.Td>{p.brand ?? '—'}</Table.Td>
                    <Table.Td>{p.category.name}</Table.Td>
                    <Table.Td>
                      {UNIT_OPTIONS.find((u) => u.value === p.saleUnit)?.label}
                      {p.kgPerCrate && <Badge ml={6} size="xs" variant="light" style={{ minWidth: 'max-content' }}>canastillo ≈ {fmtKg(p.kgPerCrate)}</Badge>}
                    </Table.Td>
                    <Table.Td ta="right">{Number(p.minStockKg) > 0 ? fmtKg(p.minStockKg) : '—'}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Activo' : 'Inactivo'}</Badge>
                    </Table.Td>
                    <Table.Td>
                      {can('catalog.manage') && (
                        <ActionIcon variant="subtle" onClick={() => open(p)} aria-label="Editar">
                          <IconEdit size={16} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </QueryState>

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'}>
        <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
          <Stack>
            <Group grow>
              <TextInput label="Código" withAsterisk placeholder="PE-SOF" {...form.getInputProps('code')} />
              <TextInput label="Marca" placeholder="SOFIA" {...form.getInputProps('brand')} />
            </Group>
            <TextInput label="Nombre" withAsterisk {...form.getInputProps('name')} />
            <Group grow>
              <Select
                label="Categoría"
                withAsterisk
                data={(categories.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))}
                {...form.getInputProps('categoryId')}
              />
              <Select label="Unidad de venta" data={UNIT_OPTIONS} allowDeselect={false} {...form.getInputProps('saleUnit')} />
            </Group>
            <NumberInput
              label="Stock mínimo (kg)"
              description="Debajo de este saldo aparece la alerta de stock bajo (0 = sin alerta)"
              min={0}
              decimalScale={3}
              {...form.getInputProps('minStockKg')}
            />
            <NumberInput
              label="Kg por canastillo"
              description="Si se vende también por canastillo: peso aproximado de uno lleno (al vender se usa el peso real de la balanza). Vacío = solo por kilo"
              min={0}
              decimalScale={3}
              placeholder="Ej.: 22"
              {...form.getInputProps('kgPerCrate')}
            />
            {editing !== 'new' && <Switch label="Activo" {...form.getInputProps('isActive', { type: 'checkbox' })} />}
            <Button type="submit" loading={save.isPending}>Guardar</Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}

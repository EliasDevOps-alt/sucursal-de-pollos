import { ActionIcon, Badge, Button, Card, Group, Modal, Stack, Switch, Table, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import type { Supplier } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { notifyError, notifyOk } from '../lib/notify';

type FormValues = Omit<Supplier, 'id' | 'isActive'> & { isActive: boolean };

const empty: FormValues = { name: '', taxId: '', phone: '', address: '', contactName: '', isActive: true };

export function SuppliersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['suppliers', 'all'],
    queryFn: async () => (await api.get<Supplier[]>('/suppliers', { params: { includeInactive: true } })).data,
  });

  const form = useForm<FormValues>({
    initialValues: empty,
    validate: { name: (v) => (v.trim() ? null : 'El nombre es obligatorio') },
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      // Campos vacíos se envían como ausentes, no como cadena vacía.
      const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== null));
      if (editing === 'new') return api.post('/suppliers', { ...body, isActive: undefined });
      return api.patch(`/suppliers/${(editing as Supplier).id}`, body);
    },
    onSuccess: () => {
      notifyOk(editing === 'new' ? 'Proveedor creado' : 'Proveedor actualizado');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setEditing(null);
    },
    onError: notifyError,
  });

  const open = (s: Supplier | 'new') => {
    form.setValues(s === 'new' ? empty : { ...empty, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ''])) });
    form.resetDirty();
    setEditing(s);
  };

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle="Granjas y distribuidores a los que se compra"
        actions={can('catalog.manage') && <Button leftSection={<IconPlus size={16} />} onClick={() => open('new')}>Nuevo proveedor</Button>}
      />
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={640}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>NIT / Doc.</Table.Th>
                  <Table.Th>Contacto</Table.Th>
                  <Table.Th>Teléfono</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td fw={500}>{s.name}</Table.Td>
                    <Table.Td>{s.taxId ?? '—'}</Table.Td>
                    <Table.Td>{s.contactName ?? '—'}</Table.Td>
                    <Table.Td>{s.phone ?? '—'}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={s.isActive ? 'green' : 'gray'}>{s.isActive ? 'Activo' : 'Inactivo'}</Badge>
                    </Table.Td>
                    <Table.Td>
                      {can('catalog.manage') && (
                        <ActionIcon variant="subtle" onClick={() => open(s)} aria-label="Editar">
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

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo proveedor' : 'Editar proveedor'}>
        <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
          <Stack>
            <TextInput label="Nombre" withAsterisk {...form.getInputProps('name')} />
            <Group grow>
              <TextInput label="NIT / Documento" {...form.getInputProps('taxId')} />
              <TextInput label="Teléfono" {...form.getInputProps('phone')} />
            </Group>
            <TextInput label="Persona de contacto" {...form.getInputProps('contactName')} />
            <TextInput label="Dirección" {...form.getInputProps('address')} />
            {editing !== 'new' && <Switch label="Activo" {...form.getInputProps('isActive', { type: 'checkbox' })} />}
            <Button type="submit" loading={save.isPending}>Guardar</Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}

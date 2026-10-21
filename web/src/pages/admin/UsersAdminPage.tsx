import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, PasswordInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconDots, IconEdit, IconKey, IconLock, IconLockOpen, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Branch, RoleRow, UserRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtDate } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

interface FormValues {
  username: string;
  password: string;
  fullName: string;
  phone: string;
  email: string;
  roleId: string;
  branchId: string | null;
}

const empty: FormValues = { username: '', password: '', fullName: '', phone: '', email: '', roleId: '', branchId: null };

export function UsersAdminPage() {
  const { user: me, can } = useAuth();
  const qc = useQueryClient();
  const manage = can('users.manage');
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [pwdFor, setPwdFor] = useState<UserRow | null>(null);
  const [newPwd, setNewPwd] = useState('');

  const users = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get<UserRow[]>('/users')).data });
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<RoleRow[]>('/users/roles')).data });
  const branches = useQuery({ queryKey: ['branches'], queryFn: async () => (await api.get<Branch[]>('/branches')).data });

  const isNew = editing === 'new';
  // El contenido del modal se evalúa aunque esté cerrado: no asumir que hay un usuario en edición.
  const editingSelf = editing !== null && editing !== 'new' && editing.id === me?.id;
  const form = useForm<FormValues>({
    initialValues: empty,
    validate: {
      username: (v) => (!isNew || /^[a-z0-9._-]{3,30}$/.test(v) ? null : '3–30 caracteres: minúsculas, números, punto o guion'),
      password: (v) => (!isNew || /^\d{4}$/.test(v) ? null : 'El PIN debe tener 4 dígitos'),
      fullName: (v) => (v.trim().length >= 3 ? null : 'Nombre completo'),
      roleId: (v) => (v ? null : 'Elija el rol'),
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const common = { fullName: v.fullName.trim(), phone: v.phone || undefined, email: v.email || undefined, roleId: v.roleId };
      if (isNew) return api.post('/users', { ...common, username: v.username, password: v.password, branchId: v.branchId ?? undefined });
      return api.patch(`/users/${(editing as UserRow).id}`, { ...common, ...(v.branchId ? { branchId: v.branchId } : { clearBranch: true }) });
    },
    onSuccess: () => {
      notifyOk(isNew ? 'Usuario creado' : 'Usuario actualizado');
      refresh();
      qc.invalidateQueries({ queryKey: ['roles'] });
      setEditing(null);
    },
    onError: notifyError,
  });

  const toggle = useMutation({
    mutationFn: async (u: UserRow) => api.patch(`/users/${u.id}/active`, { isActive: !u.isActive }),
    onSuccess: (_r, u) => {
      notifyOk(u.isActive ? `${u.fullName} bloqueado: pierde el acceso de inmediato` : `${u.fullName} reactivado`);
      refresh();
    },
    onError: notifyError,
  });

  const resetPwd = useMutation({
    mutationFn: async () => api.post(`/users/${pwdFor!.id}/password`, { password: newPwd }),
    onSuccess: () => {
      notifyOk('PIN actualizado');
      setPwdFor(null);
      setNewPwd('');
    },
    onError: notifyError,
  });

  const open = (u: UserRow | 'new') => {
    form.setValues(
      u === 'new'
        ? empty
        : { username: u.username, password: '', fullName: u.fullName, phone: u.phone ?? '', email: u.email ?? '', roleId: u.role.id, branchId: u.branch?.id ?? null },
    );
    form.resetDirty();
    setEditing(u);
  };

  const roleCode = roles.data?.find((r) => r.id === form.values.roleId)?.code;

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Cada usuario tiene un rol; los permisos se configuran por rol"
        actions={manage && <Button leftSection={<IconPlus size={16} />} onClick={() => open('new')}>Nuevo usuario</Button>}
      />
      <QueryState isLoading={users.isLoading} error={users.error}>
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={760}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Usuario</Table.Th>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Rol</Table.Th>
                  <Table.Th>Sucursal</Table.Th>
                  <Table.Th>Alta</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.data?.map((u) => (
                  <Table.Tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <Table.Td ff="monospace">{u.username}</Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>{u.fullName}</Text>
                      {(u.phone || u.email) && <Text size="xs" c="dimmed">{[u.phone, u.email].filter(Boolean).join(' · ')}</Text>}
                    </Table.Td>
                    <Table.Td><Badge variant="light">{u.role.name}</Badge></Table.Td>
                    <Table.Td>{u.branch?.name ?? '—'}</Table.Td>
                    <Table.Td>{fmtDate(u.createdAt)}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={u.isActive ? 'green' : 'gray'} leftSection={u.isActive ? null : <IconLock size={10} />}>
                        {u.isActive ? 'Activo' : 'Bloqueado'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {manage && (
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" aria-label={`Acciones de ${u.username}`}><IconDots size={16} /></ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => open(u)}>Editar datos y rol</Menu.Item>
                            <Menu.Item leftSection={<IconKey size={14} />} onClick={() => setPwdFor(u)}>Cambiar PIN</Menu.Item>
                            {u.id !== me?.id && (
                              <Menu.Item
                                color={u.isActive ? 'red' : undefined}
                                leftSection={u.isActive ? <IconLock size={14} /> : <IconLockOpen size={14} />}
                                onClick={() => toggle.mutate(u)}
                              >
                                {u.isActive ? 'Bloquear acceso' : 'Reactivar'}
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </QueryState>

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Nuevo usuario' : `Editar ${editing?.username ?? ''}`}>
        <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
          <Stack>
            {isNew && (
              <SimpleGrid cols={2}>
                <TextInput label="Usuario (para ingresar)" withAsterisk autoComplete="off" {...form.getInputProps('username')} />
                <PasswordInput label="PIN inicial (4 dígitos)" withAsterisk maxLength={4} inputMode="numeric" autoComplete="new-password" {...form.getInputProps('password')} />
              </SimpleGrid>
            )}
            <TextInput label="Nombre completo" withAsterisk {...form.getInputProps('fullName')} />
            <SimpleGrid cols={2}>
              <TextInput label="Teléfono" {...form.getInputProps('phone')} />
              <TextInput label="Correo" {...form.getInputProps('email')} />
            </SimpleGrid>
            <Select
              label="Rol"
              withAsterisk
              disabled={editingSelf}
              description={editingSelf ? 'No puede cambiar su propio rol' : undefined}
              data={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
              {...form.getInputProps('roleId')}
            />
            <Select
              label="Sucursal asignada"
              description={roleCode === 'SELLER_BRANCH' ? 'Un vendedor de sucursal solo vende desde el almacén de su sucursal' : 'Opcional'}
              clearable
              data={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              {...form.getInputProps('branchId')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={save.isPending}>Guardar</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!pwdFor} onClose={() => setPwdFor(null)} title={`Nuevo PIN para ${pwdFor?.fullName ?? ''}`}>
        <Stack>
          <PasswordInput label="PIN" description="4 dígitos" maxLength={4} inputMode="numeric" value={newPwd} onChange={(e) => setNewPwd(e.currentTarget.value.replace(/\D/g, ""))} autoComplete="new-password" />
          <Button disabled={newPwd.length !== 4} loading={resetPwd.isPending} onClick={() => resetPwd.mutate()}>Guardar PIN</Button>
        </Stack>
      </Modal>
    </>
  );
}

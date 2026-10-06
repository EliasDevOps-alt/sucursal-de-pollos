import { Alert, Badge, Button, Card, Checkbox, Grid, Group, NavLink, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { PermissionRow, RoleRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { notifyError, notifyOk } from '../../lib/notify';

const MODULE_LABELS: Record<string, string> = {
  users: 'Usuarios',
  audit: 'Auditoría',
  catalog: 'Catálogo',
  purchases: 'Compras',
  receptions: 'Recepción',
  lots: 'Lotes',
  lot: 'Lotes',
  price: 'Precios',
  inventory: 'Inventario',
  customers: 'Clientes',
  customer: 'Clientes',
  sales: 'Ventas',
  credit: 'Crédito',
  collections: 'Cobranza',
  presales: 'Preventas',
  sync: 'App móvil',
  reports: 'Reportes',
};

export function RolesAdminPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can('users.manage');
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<RoleRow[]>('/users/roles')).data });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: async () => (await api.get<PermissionRow[]>('/permissions')).data });
  const [roleId, setRoleId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const role = roles.data?.find((r) => r.id === (roleId ?? roles.data?.[0]?.id));
  useEffect(() => {
    if (role) setSelected(new Set(role.permissions));
  }, [role]);

  // Agrupados por área para leerlos como el negocio, no como código.
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of perms.data ?? []) {
      const label = MODULE_LABELS[p.module] ?? p.module;
      map.set(label, [...(map.get(label) ?? []), p]);
    }
    return [...map.entries()];
  }, [perms.data]);

  const dirty = role ? role.permissions.length !== selected.size || role.permissions.some((p) => !selected.has(p)) : false;

  const save = useMutation({
    mutationFn: async () => api.put(`/roles/${role!.id}/permissions`, { permissions: [...selected] }),
    onSuccess: () => {
      notifyOk(`Permisos de ${role!.name} actualizados: rigen desde la próxima acción de cada usuario`);
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: notifyError,
  });

  const toggle = (code: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  return (
    <>
      <PageHeader title="Roles y permisos" subtitle="Permisos por acción: tener acceso a un módulo no habilita todas sus operaciones" />
      <QueryState isLoading={roles.isLoading || perms.isLoading} error={roles.error ?? perms.error}>
        <Grid>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card withBorder p="xs">
              {roles.data?.map((r) => (
                <NavLink
                  key={r.id}
                  active={r.id === role?.id}
                  label={r.name}
                  description={`${r.users} usuario${r.users === 1 ? '' : 's'} · ${r.permissions.length} permisos`}
                  onClick={() => setRoleId(r.id)}
                />
              ))}
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            {role && (
              <Card withBorder>
                <Group justify="space-between" mb="md">
                  <div>
                    <Title order={4}>{role.name}</Title>
                    <Text size="sm" c="dimmed">{selected.size} permisos seleccionados</Text>
                  </div>
                  {manage && (
                    <Group>
                      <Button variant="default" disabled={!dirty} onClick={() => setSelected(new Set(role.permissions))}>Descartar</Button>
                      <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Guardar cambios</Button>
                    </Group>
                  )}
                </Group>
                {role.code === 'ADMIN' && (
                  <Alert mb="md" variant="light" icon={<IconShieldLock size={16} />}>
                    El Administrador conserva siempre la gestión de usuarios, para que nadie quede sin acceso al sistema.
                  </Alert>
                )}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                  {grouped.map(([module, list]) => (
                    <Stack key={module} gap={6}>
                      <Group gap={6}>
                        <Text fw={600} size="sm">{module}</Text>
                        <Badge size="xs" variant="light">{list.filter((p) => selected.has(p.code)).length}/{list.length}</Badge>
                      </Group>
                      {list.map((p) => (
                        <Checkbox
                          key={p.code}
                          size="sm"
                          label={p.description}
                          description={p.code}
                          checked={selected.has(p.code)}
                          disabled={!manage || (role.code === 'ADMIN' && p.code === 'users.manage')}
                          onChange={() => toggle(p.code)}
                        />
                      ))}
                    </Stack>
                  ))}
                </SimpleGrid>
              </Card>
            )}
          </Grid.Col>
        </Grid>
      </QueryState>
    </>
  );
}

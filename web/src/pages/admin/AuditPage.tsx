import { Badge, Button, Card, Center, Code, Collapse, Group, Select, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '../../api/client';
import type { AuditLogRow, UserRow } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useDateRange } from '../../components/viz/RangePicker';
import { fmtDateTime } from '../../lib/format';

// Acciones críticas que el documento exige auditar: se resaltan.
const CRITICAL = ['price.modify', 'credit.exception_authorize', 'lot.override', 'sales.annul', 'purchases.annul', 'collections.annul', 'customer.rank_change', 'roles.permissions_change', 'users.role_change', 'users.deactivate'];

const ENTITY_LABELS: Record<string, string> = {
  sale: 'Venta', purchase: 'Compra', reception: 'Recepción', lot: 'Lote', customer: 'Cliente', user: 'Usuario', role: 'Rol',
  payment: 'Cobro', presale: 'Preventa', product: 'Producto', supplier: 'Proveedor', sync_operation: 'Sincronización', customer_type: 'Tipo de cliente',
};

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
      <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{JSON.stringify(value, null, 2)}</Code>
    </div>
  );
}

export function AuditPage() {
  const { range, picker } = useDateRange('7');
  const [userId, setUserId] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const users = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get<UserRow[]>('/users')).data });

  const params = {
    from: `${range.from}T00:00:00`,
    to: `${range.to}T23:59:59`,
    userId: userId ?? undefined,
    action: action ?? undefined,
    entityType: entityType ?? undefined,
    limit,
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', params],
    queryFn: async () => (await api.get<{ logs: AuditLogRow[]; actions: string[] }>('/audit-logs', { params })).data,
  });

  return (
    <>
      <PageHeader title="Auditoría" subtitle="Quién hizo qué, cuándo, qué cambió y por qué" actions={picker} />
      <Group mb="sm" align="flex-end" wrap="wrap">
        <Select label="Usuario" placeholder="Todos" clearable searchable w={220} value={userId} onChange={setUserId}
          data={(users.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))} />
        <Select label="Acción" placeholder="Todas" clearable searchable w={240} value={action} onChange={setAction} data={data?.actions ?? []} />
        <Select label="Entidad" placeholder="Todas" clearable w={200} value={entityType} onChange={setEntityType}
          data={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))} />
        <Text ml="auto" size="sm" c="dimmed" mb={6}>{data?.logs.length ?? 0} registros más recientes</Text>
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={820}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={28} />
                  <Table.Th>Fecha y hora</Table.Th>
                  <Table.Th>Usuario</Table.Th>
                  <Table.Th>Acción</Table.Th>
                  <Table.Th>Entidad</Table.Th>
                  <Table.Th>Motivo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.logs.map((l) => {
                  const expanded = open === l.id;
                  const hasDetail = l.oldData != null || l.newData != null;
                  return (
                    <Fragment key={l.id}>
                      <Table.Tr style={{ cursor: hasDetail ? 'pointer' : undefined }} onClick={() => hasDetail && setOpen(expanded ? null : l.id)}>
                        <Table.Td>
                          {hasDetail && (
                            <UnstyledButton aria-label={expanded ? 'Ocultar detalle' : 'Ver detalle'}>
                              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                            </UnstyledButton>
                          )}
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.createdAt)}</Table.Td>
                        <Table.Td>{l.user?.fullName ?? 'Sistema'}</Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={CRITICAL.includes(l.action) ? 'orange' : 'gray'} ff="monospace" tt="none">{l.action}</Badge>
                        </Table.Td>
                        <Table.Td>{ENTITY_LABELS[l.entityType] ?? l.entityType}</Table.Td>
                        <Table.Td><Text size="sm" c={l.reason ? undefined : 'dimmed'}>{l.reason ?? '—'}</Text></Table.Td>
                      </Table.Tr>
                      {hasDetail && (
                        <Table.Tr style={{ display: expanded ? undefined : 'none' }}>
                          <Table.Td />
                          <Table.Td colSpan={5}>
                            <Collapse in={expanded}>
                              <Stack gap="xs" py="xs">
                                <Text size="xs" c="dimmed">ID de la entidad: {l.entityId ?? '—'}</Text>
                                <Group grow align="flex-start">
                                  <JsonBlock label="Antes" value={l.oldData} />
                                  <JsonBlock label="Después" value={l.newData} />
                                </Group>
                              </Stack>
                            </Collapse>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {data && data.logs.length >= limit && limit < 500 && (
            <Center p="sm">
              <Button variant="subtle" onClick={() => setLimit((l) => Math.min(500, l + 100))}>Cargar 100 más</Button>
            </Center>
          )}
        </Card>
      </QueryState>
    </>
  );
}

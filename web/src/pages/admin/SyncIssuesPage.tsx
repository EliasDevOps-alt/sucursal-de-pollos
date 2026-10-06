import { Alert, Badge, Button, Card, Code, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { IconCheck, IconDeviceMobile } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { SyncIssue } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtDateTime } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

const OP_LABELS: Record<string, string> = {
  CUSTOMER_CREATE: 'Alta de cliente',
  PRESALE_CREATE: 'Pedido nuevo',
  PRESALE_CANCEL: 'Cancelación de pedido',
  GPS_POSITION: 'Posición GPS',
};

/** Resumen legible del contenido de la operación. */
function summary(i: SyncIssue) {
  const p = i.payload as Record<string, any>;
  if (i.operationType === 'CUSTOMER_CREATE') return `Cliente "${p.name ?? '?'}"${p.phone ? ` · ${p.phone}` : ''}`;
  if (i.operationType === 'PRESALE_CREATE') return `${(p.items ?? []).length} producto(s) · ${(p.items ?? []).reduce((s: number, it: any) => s + Number(it.weightKg ?? 0), 0)} kg`;
  if (i.operationType === 'PRESALE_CANCEL') return `Motivo: ${p.reason ?? '—'}`;
  return '';
}

export function SyncIssuesPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<'pending' | 'resolved'>('pending');
  const [resolving, setResolving] = useState<SyncIssue | null>(null);
  const [note, setNote] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['sync-issues', view],
    queryFn: async () => (await api.get<SyncIssue[]>('/sync-operations/issues', { params: { view } })).data,
  });

  const resolve = useMutation({
    mutationFn: async () => api.post(`/sync-operations/${resolving!.id}/resolve`, { note }),
    onSuccess: () => {
      notifyOk('Operación marcada como revisada');
      setResolving(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['sync-issues'] });
    },
    onError: notifyError,
  });

  return (
    <>
      <PageHeader title="Sincronización móvil" subtitle="Operaciones de los teléfonos que el servidor rechazó y necesitan una decisión" />
      <Alert variant="light" mb="md" icon={<IconDeviceMobile size={16} />}>
        El servidor nunca sobrescribe stock ni deuda en silencio: si una operación del teléfono choca con lo que ya pasó
        (por ejemplo, cancelar un pedido que ya fue atendido), queda aquí. El teléfono también la muestra con su motivo.
      </Alert>
      <SegmentedControl mb="sm" value={view} onChange={(v) => setView(v as typeof view)} data={[{ value: 'pending', label: 'Pendientes' }, { value: 'resolved', label: 'Revisadas' }]} />
      <QueryState isLoading={isLoading} error={error}>
        <Stack>
          {data?.length === 0 && <Text c="dimmed">{view === 'pending' ? 'No hay operaciones pendientes de revisión.' : 'Todavía no se revisó ninguna operación.'}</Text>}
          {data?.map((i) => (
            <Card key={i.id} withBorder>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Text fw={600}>{OP_LABELS[i.operationType] ?? i.operationType}</Text>
                    <Badge variant="light" color={i.status === 'REVIEW' ? 'orange' : 'red'}>{i.status === 'REVIEW' ? 'Conflicto de negocio' : 'Error'}</Badge>
                  </Group>
                  <Text size="sm">{summary(i)}</Text>
                  <Text size="sm" c="red.8">{i.errorMessage}</Text>
                  <Text size="xs" c="dimmed">
                    {i.user.fullName} · tomado en el teléfono {fmtDateTime(i.createdAtDevice)} · recibido {fmtDateTime(i.receivedAtServer)} · dispositivo {i.device.deviceUuid.slice(0, 8)}
                  </Text>
                  {i.resolvedAt && (
                    <Text size="sm" mt={4}><b>Revisada</b> por {i.resolvedBy?.fullName} el {fmtDateTime(i.resolvedAt)}: {i.resolutionNote}</Text>
                  )}
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12 }}>Ver datos enviados</summary>
                    <Code block mt={4} style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(i.payload, null, 2)}</Code>
                  </details>
                </Stack>
                {!i.resolvedAt && (
                  <Button variant="light" leftSection={<IconCheck size={16} />} onClick={() => setResolving(i)}>Marcar revisada</Button>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      </QueryState>
      <Modal opened={!!resolving} onClose={() => setResolving(null)} title="Marcar como revisada">
        <Stack>
          <Text size="sm">Anote qué se decidió (por ejemplo, si se registró a mano o se descartó). Queda en la auditoría.</Text>
          <Textarea label="Resolución" withAsterisk autosize minRows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          <Button disabled={!note.trim()} loading={resolve.isPending} onClick={() => resolve.mutate()}>Guardar</Button>
        </Stack>
      </Modal>
    </>
  );
}

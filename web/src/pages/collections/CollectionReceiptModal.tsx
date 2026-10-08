import { Anchor, Badge, Group, Image, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Collection } from '../../api/types';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDateTime, PAYMENT_LABELS, PAYMENT_SOURCE_LABELS } from '../../lib/format';

/** Recibo de cobranza: número, monto, quién cobró y quién pagó, firma y lugar (si se cobró en la calle). */
export function CollectionReceiptModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: c, isLoading, error } = useQuery({
    queryKey: ['collections', 'detail', id],
    queryFn: async () => (await api.get<Collection>(`/collections/${id}`)).data,
    enabled: !!id,
  });
  return (
    <Modal opened={!!id} onClose={onClose} title={c ? `Recibo ${c.receiptNumber}` : 'Recibo'}>
      <QueryState isLoading={isLoading} error={error}>
        {c && (
          <Stack>
            <Group gap="xs">
              <Badge variant="light" color={c.status === 'VALID' ? 'green' : 'gray'}>{c.status === 'VALID' ? 'Vigente' : 'Anulado'}</Badge>
              {c.isAdvance && <Badge variant="light" color="blue">Anticipo</Badge>}
              <Badge variant="outline">{PAYMENT_SOURCE_LABELS[c.paymentSource] ?? c.paymentSource}</Badge>
            </Group>
            <Text fw={700} size="xl">{fmtBob(c.amount)}</Text>
            <SimpleGrid cols={2}>
              <div>
                <Text size="xs" c="dimmed">Cliente</Text>
                <Text size="sm">{c.customer.name}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Método</Text>
                <Text size="sm">{PAYMENT_LABELS[c.paymentMethod] ?? c.paymentMethod}{c.referenceNumber ? ` · ${c.referenceNumber}` : ''}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Cobró</Text>
                <Text size="sm">{c.receivedBy.fullName}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Fecha</Text>
                <Text size="sm">{fmtDateTime(c.collectedAtDevice ?? c.paymentDate)}</Text>
              </div>
            </SimpleGrid>
            {c.notes && <Text size="sm">Observaciones: {c.notes}</Text>}
            {(c.paidByName || c.signature) && (
              <div>
                <Text size="xs" c="dimmed">Pagó</Text>
                <Text size="sm" fw={500}>{c.paidByName ?? '—'}</Text>
                {c.signature && (
                  <Image src={c.signature} alt={`Firma de ${c.paidByName ?? 'quien pagó'}`} maw={320} mt={4} bg="white"
                    style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }} />
                )}
              </div>
            )}
            {c.latitude && c.longitude && (
              <Anchor href={`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=18/${c.latitude}/${c.longitude}`} target="_blank" size="sm">
                Ver dónde se cobró
              </Anchor>
            )}
            {c.annulReason && <Text size="sm" c="dimmed">Anulado: {c.annulReason} · {c.annulledBy?.fullName}</Text>}
          </Stack>
        )}
      </QueryState>
    </Modal>
  );
}

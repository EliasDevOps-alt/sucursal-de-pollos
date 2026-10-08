import { Alert, Anchor, Badge, Button, Card, Group, Modal, SegmentedControl, SimpleGrid, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconArrowLeft, IconBan, IconCash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PurchaseDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDate, fmtDateTime, fmtKg, fmtPct, fmtPerKg, PAYMENT_LABELS, PURCHASE_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { ReceptionForm } from './ReceptionForm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={500} component="div">{children}</Text>
    </div>
  );
}

export function PurchaseDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [annulOpen, setAnnulOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState('TRANSFERENCIA');

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['purchases', id],
    queryFn: async () => (await api.get<PurchaseDetail>(`/purchases/${id}`)).data,
  });

  const pay = useMutation({
    mutationFn: async () => api.post(`/purchases/${id}/pay`, { paymentMethod: method }),
    onSuccess: () => {
      notifyOk('Pago registrado');
      setPaying(false);
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
    onError: notifyError,
  });

  const annul = useMutation({
    mutationFn: async () => api.post(`/purchases/${id}/annul`, { reason }),
    onSuccess: () => {
      notifyOk('Compra anulada');
      setAnnulOpen(false);
      qc.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: notifyError,
  });

  const lotByProduct = new Map(p?.lots.map((l) => [l.productId, l]));

  return (
    <QueryState isLoading={isLoading} error={error}>
      {p && (
        <Stack>
          <Anchor component={Link} to="/compras" size="sm">
            <Group gap={4}><IconArrowLeft size={14} /> Compras</Group>
          </Anchor>
          <PageHeader
            title={`Compra ${p.purchaseNumber}`}
            subtitle={p.supplier.name}
            actions={
              <>
                <Badge size="lg" variant="light" color={PURCHASE_STATUS[p.status].color}>{PURCHASE_STATUS[p.status].label}</Badge>
                {p.status !== 'CANCELLED' && (
                  <Badge size="lg" variant="light" color={p.paidAt ? 'green' : 'orange'}>{p.paidAt ? 'Pagada' : 'Por pagar'}</Badge>
                )}
                {!p.paidAt && p.status !== 'CANCELLED' && can('cash.manage') && (
                  <Button variant="light" leftSection={<IconCash size={16} />} onClick={() => setPaying(true)}>Pagar</Button>
                )}
                {p.status === 'REGISTERED' && can('purchases.annul') && (
                  <Button variant="light" color="red" leftSection={<IconBan size={16} />} onClick={() => setAnnulOpen(true)}>
                    Anular
                  </Button>
                )}
              </>
            }
          />

          {p.status === 'CANCELLED' && (
            <Alert color="gray" title="Compra anulada">
              {p.annulReason} — {p.annulledBy?.fullName}, {p.annulledAt && fmtDateTime(p.annulledAt)}
            </Alert>
          )}

          <Card withBorder>
            <SimpleGrid cols={{ base: 2, md: 5 }}>
              <Field label="Fecha">{fmtDateTime(p.purchaseDate)}</Field>
              <Field label="Destino">{p.warehouse.name}</Field>
              <Field label="Pago">{PAYMENT_LABELS[p.paymentMethod] ?? p.paymentMethod}</Field>
              <Field label="Registrada por">{p.createdBy.fullName}</Field>
              <Field label="Total pagado">{fmtBob(p.totalAmount)}</Field>
            </SimpleGrid>
            {p.notes && <Text size="sm" mt="sm" c="dimmed">{p.notes}</Text>}
          </Card>

          <Card withBorder p={0}>
            <Table.ScrollContainer minWidth={900}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Kg comprados</Table.Th>
                    <Table.Th ta="right">Costo/kg</Table.Th>
                    <Table.Th ta="right">Subtotal</Table.Th>
                    {p.status === 'RECEIVED' && (
                      <>
                        <Table.Th ta="right">Kg netos</Table.Th>
                        <Table.Th ta="right">Merma</Table.Th>
                        <Table.Th>Lote</Table.Th>
                        <Table.Th ta="right">Costo real/kg</Table.Th>
                        <Table.Th>Vence</Table.Th>
                      </>
                    )}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {p.items.map((i) => {
                    const lot = lotByProduct.get(i.productId);
                    return (
                      <Table.Tr key={i.id}>
                        <Table.Td fw={500}>{i.product.name}</Table.Td>
                        <Table.Td ta="right">{fmtKg(i.purchasedWeightKg)}</Table.Td>
                        <Table.Td ta="right">{fmtPerKg(i.unitCost)}</Table.Td>
                        <Table.Td ta="right">{fmtBob(i.subtotal)}</Table.Td>
                        {p.status === 'RECEIVED' && i.receptionItem && (
                          <>
                            <Table.Td ta="right">{fmtKg(i.receptionItem.netReceivedWeightKg)}</Table.Td>
                            <Table.Td ta="right">
                              {fmtKg(i.receptionItem.shrinkageWeightKg)} ({fmtPct(i.receptionItem.shrinkagePercentage)})
                            </Table.Td>
                            <Table.Td>{lot && <Anchor component={Link} to={`/lotes/${lot.id}`} fw={600}>{lot.lotCode}</Anchor>}</Table.Td>
                            <Table.Td ta="right">{lot && fmtPerKg(lot.actualCostPerKg)}</Table.Td>
                            <Table.Td>{fmtDate(i.receptionItem.expiryDate)}</Table.Td>
                          </>
                        )}
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          {p.receptions[0] && (
            <Text size="sm" c="dimmed">
              Recibida el {fmtDateTime(p.receptions[0].receivedAt)} por {p.receptions[0].receivedBy.fullName}
            </Text>
          )}

          {p.status === 'REGISTERED' && can('receptions.create') && <ReceptionForm purchase={p} />}

          <Modal opened={paying} onClose={() => setPaying(false)} title={`Pagar la compra ${p.purchaseNumber}`}>
            <Stack>
              <Text size="sm">Se registra el egreso de {fmtBob(p.totalAmount)} a {p.supplier.name}: en efectivo sale de la caja; por QR o transferencia, del banco.</Text>
              <SegmentedControl value={method} onChange={setMethod} data={[{ value: 'EFECTIVO', label: 'Efectivo' }, { value: 'TRANSFERENCIA', label: 'Transferencia' }, { value: 'QR', label: 'QR' }]} />
              <Button loading={pay.isPending} onClick={() => pay.mutate()}>Registrar pago</Button>
            </Stack>
          </Modal>

          <Modal opened={annulOpen} onClose={() => setAnnulOpen(false)} title={`Anular compra ${p.purchaseNumber}`}>
            <Stack>
              <Text size="sm">La compra no se borra: queda registrada como anulada con su motivo.</Text>
              <Textarea label="Motivo" withAsterisk value={reason} onChange={(e) => setReason(e.currentTarget.value)} autosize minRows={2} />
              <Button color="red" disabled={!reason.trim()} loading={annul.isPending} onClick={() => annul.mutate()}>
                Confirmar anulación
              </Button>
            </Stack>
          </Modal>
        </Stack>
      )}
    </QueryState>
  );
}

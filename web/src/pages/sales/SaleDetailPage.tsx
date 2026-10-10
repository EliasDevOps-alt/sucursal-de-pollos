import { Alert, Anchor, Badge, Button, Card, Group, Modal, SimpleGrid, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconArrowBackUp, IconArrowLeft, IconBan, IconLock } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { SaleDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { ReceiptButton } from '../../components/ReceiptButton';
import { QueryState } from '../../components/QueryState';
import { fmtBob, fmtDate, fmtDateTime, fmtKg, fmtPct, fmtPerKg, PAYMENT_LABELS, PAYMENT_STATUS, SALE_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { ReturnModal } from './ReturnModal';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text fw={700} size="lg" c={color}>{value}</Text>
    </Card>
  );
}

export function SaleDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [annulOpen, setAnnulOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data: s, isLoading, error } = useQuery({
    queryKey: ['sales', id],
    queryFn: async () => (await api.get<SaleDetail>(`/sales/${id}`)).data,
  });

  const annul = useMutation({
    mutationFn: async () => api.post(`/sales/${id}/annul`, { reason }),
    onSuccess: () => {
      notifyOk('Venta anulada: stock devuelto a sus lotes');
      setAnnulOpen(false);
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: notifyError,
  });

  const showProfit = can('reports.financial');

  return (
    <QueryState isLoading={isLoading} error={error}>
      {s && (
        <Stack>
          <Anchor component={Link} to="/ventas" size="sm">
            <Group gap={4}><IconArrowLeft size={14} /> Ventas</Group>
          </Anchor>
          <PageHeader
            title={`Venta ${s.saleNumber}`}
            subtitle={`${fmtDateTime(s.createdAt)} · ${s.warehouse.name} · ${s.seller.fullName}`}
            actions={
              <>
                <Badge size="lg" variant="light" color={SALE_STATUS[s.status].color}>{SALE_STATUS[s.status].label}</Badge>
                <Badge size="lg" variant="light" color={PAYMENT_STATUS[s.paymentStatus].color}>{PAYMENT_STATUS[s.paymentStatus].label}</Badge>
                <ReceiptButton type="venta" id={s.id} label="Nota de venta" />
                {s.status === 'CONFIRMED' && can('sales.create') && (
                  <Button variant="light" leftSection={<IconArrowBackUp size={16} />} onClick={() => setReturnOpen(true)}>Devolución</Button>
                )}
                {s.status === 'CONFIRMED' && Number(s.returnedAmount) === 0 && can('sales.annul') && (
                  <Button variant="light" color="red" leftSection={<IconBan size={16} />} onClick={() => setAnnulOpen(true)}>Anular</Button>
                )}
              </>
            }
          />

          {s.status === 'ANNULLED' && (
            <Alert color="gray" title="Venta anulada">
              {s.annulReason} — {s.annulledBy?.fullName}, {s.annulledAt && fmtDateTime(s.annulledAt)}. El stock volvió a sus lotes y la deuda se revirtió.
            </Alert>
          )}

          {s.status === 'RETURNED' && (
            <Alert color="grape" title="Venta devuelta por completo">
              Todo lo vendido fue devuelto ({fmtBob(s.returnedAmount)}). El detalle de cada devolución está al final.
            </Alert>
          )}

          <SimpleGrid cols={{ base: 2, md: showProfit ? 5 : 3 }}>
            <Stat label="Cliente" value={s.customer?.name ?? 'Venta rápida'} />
            <Stat label={Number(s.returnedAmount) > 0 ? 'Total (neto de devoluciones)' : 'Total'} value={Number(s.returnedAmount) > 0 ? `${fmtBob(s.profitability.revenue)}` : fmtBob(s.totalAmount)} />
            <Stat label="Pagado / a deuda" value={`${fmtBob(s.paidAmount)} / ${fmtBob(s.creditAmount)}`} />
            {showProfit && (
              <>
                <Stat label="Costo real" value={fmtBob(s.profitability.cost)} />
                <Stat
                  label="Margen"
                  value={`${fmtBob(s.profitability.margin)} (${fmtPct(s.profitability.marginPercentage)})`}
                  color={Number(s.profitability.margin) >= 0 ? 'green' : 'red'}
                />
              </>
            )}
          </SimpleGrid>

          <Card withBorder p={0}>
            <Text fw={600} p="md" pb={0}>Productos y lotes consumidos</Text>
            <Table.ScrollContainer minWidth={860}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto / lote</Table.Th>
                    <Table.Th ta="right">Kg</Table.Th>
                    <Table.Th ta="right">Precio/kg</Table.Th>
                    {showProfit && <Table.Th ta="right">Costo/kg</Table.Th>}
                    <Table.Th ta="right">Descuento</Table.Th>
                    <Table.Th ta="right">Subtotal</Table.Th>
                    {showProfit && <Table.Th ta="right">Margen</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {s.items.map((item) => (
                    <Fragment key={item.id}>
                      <Table.Tr bg="var(--mantine-color-default-hover)">
                        <Table.Td fw={600}>
                          {item.product.name}
                          {item.priceChangeReason && (
                            <Text size="xs" c="orange">
                              Precio cambiado de {fmtPerKg(item.originalUnitPrice)}: {item.priceChangeReason} (autorizó {item.priceAuthorizedBy?.fullName})
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" fw={600}>
                          {fmtKg(item.requestedWeightKg)}
                          {item.crates > 0 && <Text size="xs" c="dimmed">{item.crates} {item.crates === 1 ? 'canastillo' : 'canastillos'}</Text>}
                          {Number(item.returnedWeightKg) > 0 && <Text size="xs" c="grape">devuelto {fmtKg(item.returnedWeightKg)}</Text>}
                        </Table.Td>
                        <Table.Td ta="right">{fmtPerKg(item.unitPrice)}</Table.Td>
                        {showProfit && <Table.Td />}
                        <Table.Td ta="right">{Number(item.discountAmount) ? `−${fmtBob(item.discountAmount)}` : '—'}</Table.Td>
                        <Table.Td ta="right" fw={600}>{fmtBob(item.subtotal)}</Table.Td>
                        {showProfit && <Table.Td ta="right" fw={600} c={Number(item.margin) >= 0 ? 'green' : 'red'}>{fmtBob(item.margin)}</Table.Td>}
                      </Table.Tr>
                      {item.allocations.map((a) => (
                        <Table.Tr key={a.id}>
                          <Table.Td pl="xl">
                            <Group gap={6}>
                              <Anchor component={Link} to={`/lotes/${a.lot.id}`} size="sm">{a.lot.lotCode}</Anchor>
                              <Text size="xs" c="dimmed">vence {fmtDate(a.lot.expiryDate)}</Text>
                              {a.forcedLot && (
                                <Badge size="xs" color="red" leftSection={<IconLock size={10} />}>
                                  Fuera de FEFO · {a.authorizedBy?.fullName}
                                </Badge>
                              )}
                            </Group>
                            {a.forceReason && <Text size="xs" c="dimmed">Motivo: {a.forceReason}</Text>}
                          </Table.Td>
                          <Table.Td ta="right"><Text size="sm">{fmtKg(a.weightKg)}</Text></Table.Td>
                          <Table.Td ta="right"><Text size="sm">{fmtPerKg(a.salePricePerKg)}</Text></Table.Td>
                          {showProfit && <Table.Td ta="right"><Text size="sm">{fmtPerKg(a.costPerKg)}</Text></Table.Td>}
                          <Table.Td />
                          <Table.Td />
                          {showProfit && <Table.Td />}
                        </Table.Tr>
                      ))}
                    </Fragment>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Group justify="flex-end" p="md" gap="xl">
              <Text size="sm">Subtotal {fmtBob(s.subtotal)}</Text>
              {Number(s.discountAmount) > 0 && <Text size="sm" c="green">Descuento −{fmtBob(s.discountAmount)}</Text>}
              <Text fw={700} size="lg">Total {fmtBob(s.totalAmount)}</Text>
              {Number(s.returnedAmount) > 0 && <Text size="sm" c="grape">Devuelto −{fmtBob(s.returnedAmount)}</Text>}
            </Group>
          </Card>

          {s.returns.length > 0 && (
            <Card withBorder>
              <Text fw={600} mb="xs">Devoluciones</Text>
              <Stack gap="sm">
                {s.returns.map((r) => (
                  <div key={r.id}>
                    <Group gap="xs">
                      <Text size="sm" fw={600}>{r.returnNumber}</Text>
                      <Text size="sm">· {fmtDateTime(r.createdAt)} · <b>{fmtBob(r.totalAmount)}</b> {r.refundMethod === 'CREDIT' ? 'descontado de la deuda' : 'devuelto en efectivo'}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {r.reason} — registró {r.createdBy.fullName}, autorizó {r.authorizedBy.fullName}
                    </Text>
                    <Text size="xs">
                      {r.items.map((it) => `${it.product.name} ${fmtKg(it.weightKg)} (${it.lot.lotCode}, ${it.disposition === 'RESTOCK' ? 'reingresó' : 'descartado'})`).join(' · ')}
                    </Text>
                  </div>
                ))}
              </Stack>
            </Card>
          )}

          {(s.payments.length > 0 || s.creditAuthorizedBy) && (
            <Card withBorder>
              <Text fw={600} mb="xs">Pagos y crédito</Text>
              {s.payments.map((p) => (
                <Text size="sm" key={p.id}>
                  {fmtDateTime(p.paymentDate)} · {PAYMENT_LABELS[p.paymentMethod] ?? p.paymentMethod} · <b>{fmtBob(p.amount)}</b> · recibió {p.receivedBy.fullName}
                </Text>
              ))}
              {s.creditAuthorizedBy && (
                <Text size="sm" c="orange" mt="xs">
                  Excepción de límite de crédito autorizada por {s.creditAuthorizedBy.fullName}: {s.creditExceptionReason}
                </Text>
              )}
            </Card>
          )}
          {s.notes && <Text size="sm" c="dimmed">Observaciones: {s.notes}</Text>}

          <ReturnModal sale={s} opened={returnOpen} onClose={() => setReturnOpen(false)} />

          <Modal opened={annulOpen} onClose={() => setAnnulOpen(false)} title={`Anular venta ${s.saleNumber}`}>
            <Stack>
              <Text size="sm">
                La venta no se borra. El stock vuelve a los mismos lotes y, si hubo crédito, se revierte la deuda del cliente.
              </Text>
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

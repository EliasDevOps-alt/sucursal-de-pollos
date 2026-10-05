import { Anchor, Badge, Button, Card, Group, Modal, NumberInput, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconTag } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { LotDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import {
  expiryColor,
  expiryLabel,
  fmtBob,
  fmtDate,
  fmtDateTime,
  fmtKg,
  fmtPct,
  fmtPerKg,
  MOVEMENT_LABELS,
  TREATMENT_LABELS,
} from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={500}>{children}</Text>
    </div>
  );
}

export function LotDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [priceOpen, setPriceOpen] = useState(false);
  const [mode, setMode] = useState<'margin' | 'price'>('margin');
  const [value, setValue] = useState<number | string>(20);

  const { data: lot, isLoading, error } = useQuery({
    queryKey: ['lots', id],
    queryFn: async () => (await api.get<LotDetail>(`/lots/${id}`)).data,
  });

  const setPrice = useMutation({
    mutationFn: async () =>
      api.post(`/lots/${id}/prices`, mode === 'margin' ? { marginPercentage: Number(value) } : { pricePerKg: Number(value) }),
    onSuccess: () => {
      notifyOk('Precio actualizado');
      setPriceOpen(false);
      qc.invalidateQueries({ queryKey: ['lots'] });
    },
    onError: notifyError,
  });

  const activePrice = lot?.prices.find((p) => p.isActive && !p.branch);
  const cost = Number(lot?.actualCostPerKg ?? 0);
  const previewPrice = mode === 'margin' ? cost * (1 + Number(value || 0) / 100) : Number(value || 0);

  return (
    <QueryState isLoading={isLoading} error={error}>
      {lot && (
        <Stack>
          <Anchor component={Link} to="/lotes" size="sm">
            <Group gap={4}><IconArrowLeft size={14} /> Lotes</Group>
          </Anchor>
          <PageHeader
            title={`Lote ${lot.lotCode}`}
            subtitle={lot.product.name}
            actions={
              <Badge size="lg" variant="light" color={expiryColor(lot.daysToExpiry)}>
                Vence {fmtDate(lot.expiryDate)} · {expiryLabel(lot.daysToExpiry)}
              </Badge>
            }
          />

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <Card withBorder>
              <Title order={5} mb="sm">Origen</Title>
              <Stack gap="xs">
                <Field label="Compra">
                  <Anchor component={Link} to={`/compras/${lot.purchase.id}`}>{lot.purchase.purchaseNumber}</Anchor>
                </Field>
                <Field label="Proveedor">{lot.purchase.supplier.name}</Field>
                <Field label="Recibido">{fmtDateTime(lot.reception.receivedAt)} · {lot.reception.receivedBy.fullName}</Field>
                <Field label="Almacén inicial">{lot.warehouse.name}</Field>
              </Stack>
            </Card>

            <Card withBorder>
              <Title order={5} mb="sm">Peso y merma</Title>
              <Stack gap="xs">
                <Field label="Bruto en balanza / tara">
                  {fmtKg(lot.receptionItem.receivedWeightKg)} / {fmtKg(lot.receptionItem.canastilloWeightKg)}
                </Field>
                <Field label="Neto ingresado">{fmtKg(lot.receivedWeightKg)}</Field>
                <Field label="Merma">
                  {fmtKg(lot.shrinkageWeightKg)} ({fmtPct(lot.receptionItem.shrinkagePercentage)}) · {fmtBob(lot.shrinkageLossAmount)}
                </Field>
                <Field label="Tratamiento">{TREATMENT_LABELS[lot.shrinkageTreatment]}</Field>
                <Field label="Disponible ahora">
                  <Text span fw={700} c="orange">{fmtKg(lot.availableWeightKg)}</Text>
                </Field>
              </Stack>
            </Card>

            <Card withBorder>
              <Group justify="space-between" mb="sm">
                <Title order={5}>Costo y precio</Title>
                {can('price.configure') && (
                  <Button size="xs" variant="light" leftSection={<IconTag size={14} />} onClick={() => setPriceOpen(true)}>
                    Cambiar precio
                  </Button>
                )}
              </Group>
              <Stack gap="xs">
                <Field label="Costo de compra">{fmtPerKg(lot.originalCostPerKg)}</Field>
                <Field label="Costo real (usado en rentabilidad)">{fmtPerKg(lot.actualCostPerKg)}</Field>
                <Field label="Precio de venta central">
                  {activePrice ? `${fmtPerKg(activePrice.pricePerKg)} · margen ${fmtPct(activePrice.marginPercentage)}` : '—'}
                </Field>
              </Stack>
            </Card>
          </SimpleGrid>

          <Card withBorder p={0}>
            <Text fw={600} p="md" pb={0}>Kardex del lote</Text>
            <Table.ScrollContainer minWidth={760}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Movimiento</Table.Th>
                    <Table.Th>Almacén</Table.Th>
                    <Table.Th ta="right">Kg</Table.Th>
                    <Table.Th ta="right">Saldo</Table.Th>
                    <Table.Th ta="right">Costo/kg</Table.Th>
                    <Table.Th>Usuario</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {lot.inventoryMovements.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{fmtDateTime(m.movementDate)}</Table.Td>
                      <Table.Td>{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</Table.Td>
                      <Table.Td>{m.warehouse.name}</Table.Td>
                      <Table.Td ta="right" c={Number(m.weightKg) < 0 ? 'red' : 'green'} fw={500}>
                        {Number(m.weightKg) > 0 ? '+' : ''}{fmtKg(m.weightKg)}
                      </Table.Td>
                      <Table.Td ta="right" fw={600}>{fmtKg(m.balanceWeightKg)}</Table.Td>
                      <Table.Td ta="right">{fmtPerKg(m.unitCostPerKg)}</Table.Td>
                      <Table.Td>{m.createdBy.fullName}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          <Card withBorder p={0}>
            <Text fw={600} p="md" pb={0}>Historial de precios</Text>
            <Table.ScrollContainer minWidth={560}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Ámbito</Table.Th>
                    <Table.Th ta="right">Precio</Table.Th>
                    <Table.Th ta="right">Margen</Table.Th>
                    <Table.Th>Usuario</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {lot.prices.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>{fmtDateTime(p.createdAt)}</Table.Td>
                      <Table.Td>{p.branch?.name ?? 'Central'}</Table.Td>
                      <Table.Td ta="right">{fmtPerKg(p.pricePerKg)}</Table.Td>
                      <Table.Td ta="right">{fmtPct(p.marginPercentage)}</Table.Td>
                      <Table.Td>{p.createdBy?.fullName}</Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Vigente' : 'Anterior'}</Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          <Modal opened={priceOpen} onClose={() => setPriceOpen(false)} title={`Precio del lote ${lot.lotCode}`}>
            <Stack>
              <Text size="sm">Costo real: <b>{fmtPerKg(lot.actualCostPerKg)}</b></Text>
              <SegmentedControl
                value={mode}
                onChange={(v) => {
                  setMode(v as 'margin' | 'price');
                  setValue(v === 'margin' ? 20 : Number(activePrice?.pricePerKg ?? cost));
                }}
                data={[
                  { value: 'margin', label: 'Por margen %' },
                  { value: 'price', label: 'Precio directo' },
                ]}
              />
              <NumberInput
                label={mode === 'margin' ? 'Margen (%)' : 'Precio por kg (Bs)'}
                min={0}
                decimalScale={mode === 'margin' ? 2 : 4}
                value={value}
                onChange={setValue}
              />
              <Text size="sm">
                Precio resultante: <b>{fmtPerKg(previewPrice.toFixed(4))}</b>
                {mode === 'price' && cost > 0 && <> · margen {fmtPct((((previewPrice - cost) / cost) * 100).toFixed(2))}</>}
              </Text>
              <Button loading={setPrice.isPending} disabled={!(Number(value) > 0)} onClick={() => setPrice.mutate()}>
                Guardar precio
              </Button>
            </Stack>
          </Modal>
        </Stack>
      )}
    </QueryState>
  );
}

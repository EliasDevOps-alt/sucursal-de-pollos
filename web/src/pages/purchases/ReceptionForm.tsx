import { Alert, Button, Card, Group, NumberInput, SegmentedControl, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconScale } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { PurchaseDetail, ShrinkageTreatment } from '../../api/types';
import { fmtKg, fmtPct, fmtPerKg } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

interface Line {
  purchaseItemId: string;
  receivedWeightKg: number | '';
  canastilloWeightKg: number | '';
  receivedQuantity: number | '';
  expiryDate: string;
  shrinkageTreatment: ShrinkageTreatment;
}

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Fecha local (toISOString usaría UTC y en la noche boliviana adelantaría un día).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Vista previa del cálculo (misma fórmula que el servidor). Solo es orientativa:
 * los valores oficiales los calcula y guarda el backend con decimales exactos.
 */
function preview(purchasedKg: number, unitCost: number, subtotal: number, line: Line) {
  const gross = Number(line.receivedWeightKg || 0);
  const net = gross - Number(line.canastilloWeightKg || 0);
  if (!gross || net <= 0) return null;
  const shrinkage = Math.max(0, purchasedKg - net);
  return {
    net,
    shrinkage,
    pct: (shrinkage / purchasedKg) * 100,
    cost: line.shrinkageTreatment === 'INCORPORATE' ? subtotal / net : unitCost,
  };
}

export function ReceptionForm({ purchase }: { purchase: PurchaseDetail }) {
  const qc = useQueryClient();

  const form = useForm({
    initialValues: {
      notes: '',
      items: purchase.items.map<Line>((i) => ({
        purchaseItemId: i.id,
        receivedWeightKg: Number(i.purchasedWeightKg) || '',
        canastilloWeightKg: 0,
        receivedQuantity: Number(i.purchasedQuantity) || '',
        expiryDate: inDays(7),
        shrinkageTreatment: 'ABSORB',
      })),
    },
    validate: {
      items: {
        receivedWeightKg: (v, values, path) => {
          const idx = Number(path.split('.')[1]);
          if (!(Number(v) > 0)) return 'Ingrese el peso';
          return Number(v) - Number(values.items[idx].canastilloWeightKg || 0) > 0 ? null : 'Neto ≤ 0';
        },
        expiryDate: (v) => (v ? null : 'Fecha'),
      },
    },
  });

  const receive = useMutation({
    mutationFn: async (values: typeof form.values) =>
      api.post(`/purchases/${purchase.id}/reception`, {
        notes: values.notes || undefined,
        items: values.items.map((l) => ({
          purchaseItemId: l.purchaseItemId,
          receivedWeightKg: Number(l.receivedWeightKg),
          canastilloWeightKg: Number(l.canastilloWeightKg || 0),
          receivedQuantity: l.receivedQuantity === '' ? undefined : Number(l.receivedQuantity),
          expiryDate: l.expiryDate,
          shrinkageTreatment: l.shrinkageTreatment,
        })),
      }),
    onSuccess: () => {
      notifyOk('Recepción registrada: lotes creados e ingresados al inventario');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
    },
    onError: notifyError,
  });

  return (
    <Card withBorder>
      <form onSubmit={form.onSubmit((v) => receive.mutate(v))}>
        <Stack>
          <Group gap="xs">
            <IconScale size={20} />
            <Text fw={600}>Confirmar que llegó la mercadería</Text>
          </Group>
          <Alert variant="light" color="blue" title="¿Ya llegó el pedido?">
            Ponga la mercadería en la balanza y revise el peso. Si <b>coincide con lo comprado</b>, solo presione
            <b> Confirmar</b>: ya está, el producto queda listo para vender. Si pesó <b>menos</b>, cambie el peso por el
            real. La diferencia es la <b>merma</b> y usted elige si se registra como pérdida o se suma al costo.
            Si el pedido todavía no llegó, deje esta compra así y vuelva cuando llegue.
          </Alert>
          <Table.ScrollContainer minWidth={1100}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Comprado</Table.Th>
                  <Table.Th>Peso bruto (kg)</Table.Th>
                  <Table.Th>Tara canast. (kg)</Table.Th>
                  <Table.Th>Unidades</Table.Th>
                  <Table.Th>Vencimiento</Table.Th>
                  <Table.Th>Merma</Table.Th>
                  <Table.Th>Resultado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {purchase.items.map((item, idx) => {
                  const line = form.values.items[idx];
                  const p = preview(Number(item.purchasedWeightKg), Number(item.unitCost), Number(item.subtotal), line);
                  return (
                    <Table.Tr key={item.id}>
                      <Table.Td fw={500}>{item.product.name}</Table.Td>
                      <Table.Td>{fmtKg(item.purchasedWeightKg)}</Table.Td>
                      <Table.Td><NumberInput min={0} decimalScale={3} w={110} {...form.getInputProps(`items.${idx}.receivedWeightKg`)} /></Table.Td>
                      <Table.Td><NumberInput min={0} decimalScale={3} w={100} {...form.getInputProps(`items.${idx}.canastilloWeightKg`)} /></Table.Td>
                      <Table.Td><NumberInput min={0} decimalScale={0} w={90} {...form.getInputProps(`items.${idx}.receivedQuantity`)} /></Table.Td>
                      <Table.Td><TextInput type="date" w={150} {...form.getInputProps(`items.${idx}.expiryDate`)} /></Table.Td>
                      <Table.Td>
                        <SegmentedControl
                          size="xs"
                          data={[
                            { value: 'ABSORB', label: 'Pérdida' },
                            { value: 'INCORPORATE', label: 'Al costo' },
                          ]}
                          {...form.getInputProps(`items.${idx}.shrinkageTreatment`)}
                        />
                      </Table.Td>
                      <Table.Td miw={170}>
                        {p ? (
                          <Text size="xs">
                            Neto <b>{fmtKg(p.net.toFixed(3))}</b> · merma {fmtKg(p.shrinkage.toFixed(3))} ({fmtPct(p.pct.toFixed(2))})
                            <br />
                            Costo real <b>{fmtPerKg(p.cost.toFixed(4))}</b>
                          </Text>
                        ) : (
                          <Text size="xs" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Textarea label="Observaciones de la recepción" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button type="submit" loading={receive.isPending} leftSection={<IconScale size={16} />}>
              Confirmar recepción
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}

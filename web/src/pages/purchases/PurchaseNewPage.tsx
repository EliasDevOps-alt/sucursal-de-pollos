import { ActionIcon, Alert, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Switch, Table, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Product, PurchaseDetail, Supplier, Warehouse } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { fmtBob, fmtKg, PAYMENT_LABELS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

interface Line {
  key: string;
  productId: string;
  purchasedQuantity: number | '';
  purchasedWeightKg: number | '';
  grossWeightKg: number | '';
  tareKg: number | '';
  unitCost: number | '';
  expiryDate: string;
}

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Fecha local (toISOString usaría UTC y en la noche boliviana adelantaría un día).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  productId: '',
  purchasedQuantity: '',
  purchasedWeightKg: '',
  grossWeightKg: '',
  tareKg: 0,
  unitCost: '',
  expiryDate: inDays(7),
});

/** Peso que se paga: con recepción inmediata es el neto de la balanza (bruto menos tara); si no, lo que dice el proveedor. */
const payableKg = (l: Line, receiveNow: boolean) =>
  receiveNow ? Number(l.grossWeightKg || 0) - Number(l.tareKg || 0) : Number(l.purchasedWeightKg || 0);

export function PurchaseNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await api.get<Supplier[]>('/suppliers')).data });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data });
  const products = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get<Product[]>('/products')).data });

  const form = useForm({
    initialValues: {
      supplierId: '',
      warehouseId: '',
      paymentMethod: 'EFECTIVO',
      receiveNow: true,
      notes: '',
      items: [newLine()],
    },
    validate: {
      supplierId: (v) => (v ? null : 'Seleccione el proveedor'),
      warehouseId: (v) => (v ? null : 'Seleccione el almacén'),
      items: {
        productId: (v) => (v ? null : 'Producto'),
        purchasedWeightKg: (v, values) => (values.receiveNow || Number(v) > 0 ? null : 'Kg > 0'),
        grossWeightKg: (v, values) => (!values.receiveNow || Number(v) > 0 ? null : 'Peso > 0'),
        tareKg: (_v, values, path) => {
          if (!values.receiveNow) return null;
          const idx = Number(path.split('.')[1]);
          return payableKg(values.items[idx], true) > 0 ? null : 'Tara ≥ peso';
        },
        unitCost: (v) => (Number(v) > 0 ? null : 'Costo > 0'),
        expiryDate: (v, values) => (!values.receiveNow || v ? null : 'Fecha'),
      },
    },
  });

  const receiveNow = form.values.receiveNow;
  const total = form.values.items.reduce((s, i) => s + Math.max(0, payableKg(i, receiveNow)) * Number(i.unitCost || 0), 0);

  const create = useMutation({
    mutationFn: async (values: typeof form.values) => {
      const body = {
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        paymentMethod: values.paymentMethod,
        notes: values.notes || undefined,
        items: values.items.map((i) => ({
          productId: i.productId,
          purchasedQuantity: i.purchasedQuantity === '' ? undefined : Number(i.purchasedQuantity),
          purchasedWeightKg: Number(payableKg(i, values.receiveNow).toFixed(3)),
          unitCost: Number(i.unitCost),
        })),
      };
      const purchase = (await api.post<PurchaseDetail>('/purchases', body)).data;
      if (!values.receiveNow) return { purchase, received: null as boolean | null };

      // La compra ya quedó registrada; si la recepción falla se avisa y se puede confirmar desde el detalle.
      try {
        await api.post(`/purchases/${purchase.id}/reception`, {
          items: purchase.items.map((it, idx) => ({
            purchaseItemId: it.id,
            receivedWeightKg: Number(values.items[idx].grossWeightKg),
            canastilloWeightKg: Number(values.items[idx].tareKg || 0),
            receivedQuantity: values.items[idx].purchasedQuantity === '' ? undefined : Number(values.items[idx].purchasedQuantity),
            expiryDate: values.items[idx].expiryDate,
            shrinkageTreatment: 'ABSORB',
          })),
        });
        return { purchase, received: true };
      } catch (e) {
        notifyError(e);
        return { purchase, received: false };
      }
    },
    onSuccess: ({ purchase, received }) => {
      if (received === true) notifyOk(`Compra ${purchase.purchaseNumber} registrada y recibida: ya hay stock para vender`);
      else if (received === false) notifyOk(`Compra ${purchase.purchaseNumber} registrada, pero falta confirmar la recepción`);
      else notifyOk(`Compra ${purchase.purchaseNumber} registrada`);
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      navigate(`/compras/${purchase.id}`);
    },
    onError: notifyError,
  });

  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));

  return (
    <>
      <PageHeader
        title="Nueva compra"
        subtitle={receiveNow ? 'Compra y recepción en un solo paso: pese la mercadería y listo' : 'Registre lo comprado según el proveedor; el peso real se confirma después'}
      />
      <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
        <Stack>
          <Card withBorder>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Select
                label="Proveedor"
                withAsterisk
                searchable
                data={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                {...form.getInputProps('supplierId')}
              />
              <Select
                label="Almacén de destino"
                withAsterisk
                data={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
                {...form.getInputProps('warehouseId')}
              />
              <Select
                label="Método de pago"
                allowDeselect={false}
                data={Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))}
                {...form.getInputProps('paymentMethod')}
              />
            </SimpleGrid>
            <Switch
              mt="md"
              label="La mercadería ya llegó: pesarla y recibirla ahora"
              description="Active esto cuando compra y recibe en el mismo momento. Al guardar, el producto queda listo para vender."
              {...form.getInputProps('receiveNow', { type: 'checkbox' })}
            />
          </Card>

          {receiveNow && (
            <Alert variant="light" color="blue">
              Ponga el <b>peso bruto</b> de la balanza (con canastillos) y la <b>tara</b> (lo que pesan los canastillos vacíos). El sistema calcula el peso
              neto, y eso es lo que se paga por el precio del kg.
            </Alert>
          )}

          <Card withBorder p={0}>
            <Table.ScrollContainer minWidth={receiveNow ? 1000 : 760}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={receiveNow ? '24%' : '36%'}>Producto</Table.Th>
                    <Table.Th>Unidades</Table.Th>
                    {receiveNow ? (
                      <>
                        <Table.Th>Peso bruto (kg)</Table.Th>
                        <Table.Th>Tara canastillos (kg)</Table.Th>
                        <Table.Th>Peso neto</Table.Th>
                      </>
                    ) : (
                      <Table.Th>Kg comprados</Table.Th>
                    )}
                    <Table.Th>Costo por kg (Bs)</Table.Th>
                    <Table.Th ta="right">Subtotal</Table.Th>
                    {receiveNow && <Table.Th>Vencimiento</Table.Th>}
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {form.values.items.map((line, idx) => {
                    const net = payableKg(line, receiveNow);
                    return (
                      <Table.Tr key={line.key}>
                        <Table.Td>
                          <Select searchable data={productOptions} placeholder="Seleccione" {...form.getInputProps(`items.${idx}.productId`)} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput min={0} decimalScale={0} placeholder="24" {...form.getInputProps(`items.${idx}.purchasedQuantity`)} />
                        </Table.Td>
                        {receiveNow ? (
                          <>
                            <Table.Td>
                              <NumberInput min={0} decimalScale={3} placeholder="250" {...form.getInputProps(`items.${idx}.grossWeightKg`)} />
                            </Table.Td>
                            <Table.Td>
                              <NumberInput min={0} decimalScale={3} {...form.getInputProps(`items.${idx}.tareKg`)} />
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={500}>{net > 0 ? fmtKg(net.toFixed(3)) : '—'}</Text>
                            </Table.Td>
                          </>
                        ) : (
                          <Table.Td>
                            <NumberInput min={0} decimalScale={3} placeholder="250" {...form.getInputProps(`items.${idx}.purchasedWeightKg`)} />
                          </Table.Td>
                        )}
                        <Table.Td>
                          <NumberInput min={0} decimalScale={4} placeholder="14.50" {...form.getInputProps(`items.${idx}.unitCost`)} />
                        </Table.Td>
                        <Table.Td ta="right">{fmtBob(Math.max(0, net) * Number(line.unitCost || 0))}</Table.Td>
                        {receiveNow && (
                          <Table.Td>
                            <TextInput type="date" w={150} {...form.getInputProps(`items.${idx}.expiryDate`)} />
                          </Table.Td>
                        )}
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            disabled={form.values.items.length === 1}
                            onClick={() => form.removeListItem('items', idx)}
                            aria-label="Quitar línea"
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Group justify="space-between" p="md">
              <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => form.insertListItem('items', newLine())}>
                Agregar producto
              </Button>
              <Text fw={700} size="lg">Total: {fmtBob(total)}</Text>
            </Group>
          </Card>

          <Textarea label="Observaciones" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => navigate('/compras')}>Cancelar</Button>
            <Button type="submit" loading={create.isPending}>{receiveNow ? 'Registrar y recibir compra' : 'Registrar compra'}</Button>
          </Group>
        </Stack>
      </form>
    </>
  );
}

import { ActionIcon, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Product, PurchaseDetail, Supplier, Warehouse } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { fmtBob, PAYMENT_LABELS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

interface Line {
  key: string;
  productId: string;
  purchasedQuantity: number | '';
  purchasedWeightKg: number | '';
  unitCost: number | '';
}

const newLine = (): Line => ({ key: crypto.randomUUID(), productId: '', purchasedQuantity: '', purchasedWeightKg: '', unitCost: '' });

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
      notes: '',
      items: [newLine()],
    },
    validate: {
      supplierId: (v) => (v ? null : 'Seleccione el proveedor'),
      warehouseId: (v) => (v ? null : 'Seleccione el almacén'),
      items: {
        productId: (v) => (v ? null : 'Producto'),
        purchasedWeightKg: (v) => (Number(v) > 0 ? null : 'Kg > 0'),
        unitCost: (v) => (Number(v) > 0 ? null : 'Costo > 0'),
      },
    },
  });

  const total = form.values.items.reduce((s, i) => s + Number(i.purchasedWeightKg || 0) * Number(i.unitCost || 0), 0);

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
          purchasedWeightKg: Number(i.purchasedWeightKg),
          unitCost: Number(i.unitCost),
        })),
      };
      return (await api.post<PurchaseDetail>('/purchases', body)).data;
    },
    onSuccess: (p) => {
      notifyOk(`Compra ${p.purchaseNumber} registrada`);
      qc.invalidateQueries({ queryKey: ['purchases'] });
      navigate(`/compras/${p.id}`);
    },
    onError: notifyError,
  });

  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));

  return (
    <>
      <PageHeader title="Nueva compra" subtitle="Registre lo comprado según el proveedor; el peso real se registra en la recepción" />
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
          </Card>

          <Card withBorder p={0}>
            <Table.ScrollContainer minWidth={760}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w="36%">Producto</Table.Th>
                    <Table.Th>Unidades</Table.Th>
                    <Table.Th>Kg comprados</Table.Th>
                    <Table.Th>Costo por kg (Bs)</Table.Th>
                    <Table.Th ta="right">Subtotal</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {form.values.items.map((line, idx) => (
                    <Table.Tr key={line.key}>
                      <Table.Td>
                        <Select searchable data={productOptions} placeholder="Seleccione" {...form.getInputProps(`items.${idx}.productId`)} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput min={0} decimalScale={0} placeholder="120" {...form.getInputProps(`items.${idx}.purchasedQuantity`)} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput min={0} decimalScale={3} placeholder="250" {...form.getInputProps(`items.${idx}.purchasedWeightKg`)} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput min={0} decimalScale={4} placeholder="14.50" {...form.getInputProps(`items.${idx}.unitCost`)} />
                      </Table.Td>
                      <Table.Td ta="right">{fmtBob(Number(line.purchasedWeightKg || 0) * Number(line.unitCost || 0))}</Table.Td>
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
                  ))}
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
            <Button type="submit" loading={create.isPending}>Registrar compra</Button>
          </Group>
        </Stack>
      </form>
    </>
  );
}

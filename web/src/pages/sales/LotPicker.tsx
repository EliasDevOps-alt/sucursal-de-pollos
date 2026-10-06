import { Alert, Badge, Button, Group, Modal, NumberInput, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AvailableLot } from '../../api/types';
import { fmtDate, fmtKg, fmtPerKg } from '../../lib/format';

export interface LotChoice {
  lotId: string;
  weightKg: number;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  warehouseId: string;
  productId: string;
  productName: string;
  weightKg: number;
  value: LotChoice[] | undefined;
  onChange: (choices: LotChoice[] | undefined) => void;
}

/** Selección manual de lotes. Saltarse el orden FEFO exigirá autorización y motivo al confirmar. */
export function LotPicker({ opened, onClose, warehouseId, productId, productName, weightKg, value, onChange }: Props) {
  const [draft, setDraft] = useState<Record<string, number | string>>({});

  const { data: lots } = useQuery({
    queryKey: ['available-lots', warehouseId, productId],
    queryFn: async () => (await api.get<AvailableLot[]>('/sales/available-lots', { params: { warehouseId, productId } })).data,
    enabled: opened && !!warehouseId && !!productId,
  });

  useEffect(() => {
    if (opened) setDraft(Object.fromEntries((value ?? []).map((c) => [c.lotId, c.weightKg])));
  }, [opened, value]);

  const sum = Object.values(draft).reduce<number>((s, v) => s + (Number(v) || 0), 0);
  const matches = Math.abs(sum - weightKg) < 0.0005;

  const apply = () => {
    const choices = Object.entries(draft)
      .filter(([, v]) => Number(v) > 0)
      .map(([lotId, v]) => ({ lotId, weightKg: Number(v) }));
    onChange(choices.length ? choices : undefined);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Elegir lotes · ${productName}`} size="lg">
      <Stack>
        <Alert variant="light" color="blue">
          El sistema sugiere el orden FEFO (vence primero, sale primero). Tomar de un lote posterior antes de agotar el
          anterior requiere autorización y motivo.
        </Alert>
        <Table.ScrollContainer minWidth={520}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Orden</Table.Th>
                <Table.Th>Lote</Table.Th>
                <Table.Th>Vence</Table.Th>
                <Table.Th ta="right">Disponible</Table.Th>
                <Table.Th ta="right">Precio</Table.Th>
                <Table.Th>Kg a tomar</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lots?.map((l) => (
                <Table.Tr key={l.lotId}>
                  <Table.Td><Badge variant={l.fefoOrder === 1 ? 'filled' : 'light'}>{l.fefoOrder}</Badge></Table.Td>
                  <Table.Td fw={600}>{l.lotCode}</Table.Td>
                  <Table.Td>{fmtDate(l.expiryDate)}</Table.Td>
                  <Table.Td ta="right">{fmtKg(l.availableKg)}</Table.Td>
                  <Table.Td ta="right">{fmtPerKg(l.pricePerKg)}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      w={110}
                      min={0}
                      max={Number(l.availableKg)}
                      decimalScale={3}
                      value={draft[l.lotId] ?? ''}
                      onChange={(v) => setDraft((d) => ({ ...d, [l.lotId]: v }))}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {lots?.length === 0 && <Text c="dimmed">No hay lotes vendibles de este producto en el almacén.</Text>}
        <Text size="sm" c={matches ? 'green' : 'red'}>
          Asignado {fmtKg(sum.toFixed(3))} de {fmtKg(weightKg)}
        </Text>
        <Group justify="space-between">
          <Button variant="subtle" onClick={() => { onChange(undefined); onClose(); }}>Volver a FEFO automático</Button>
          <Button disabled={!matches} onClick={apply}>Aplicar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

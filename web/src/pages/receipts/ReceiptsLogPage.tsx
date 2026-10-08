import { Badge, Card, Group, Select, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { ReceiptPrintRow } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { ReceiptButton } from '../../components/ReceiptButton';
import { useDateRange } from '../../components/viz/RangePicker';
import { fmtDateTime, RECEIPT_TYPES } from '../../lib/format';

/** Historial de comprobantes impresos (web y Bluetooth), con reimpresión. */
export function ReceiptsLogPage() {
  const { range, picker } = useDateRange('7');
  const [type, setType] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['receipt-prints', range, type],
    queryFn: async () =>
      (await api.get<ReceiptPrintRow[]>('/receipts/prints', { params: { type: type ?? undefined, from: `${range.from}T00:00:00`, to: `${range.to}T23:59:59` } })).data,
  });
  return (
    <>
      <PageHeader title="Comprobantes" subtitle="Impresiones de notas de venta, entregas, recibos de cobro, rendiciones y cierres de caja" actions={picker} />
      <Group mb="md">
        <Select placeholder="Todos los tipos" clearable value={type} onChange={setType} w={220}
          data={Object.entries(RECEIPT_TYPES).map(([value, t]) => ({ value, label: t.label }))} />
      </Group>
      <Card withBorder p={0}>
        <QueryState isLoading={isLoading} error={error}>
          {data?.length === 0 ? (
            <Text c="dimmed" p="md">No se imprimieron comprobantes en este período.</Text>
          ) : (
            <Table.ScrollContainer minWidth={760}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>N.º</Table.Th>
                    <Table.Th>Copia</Table.Th>
                    <Table.Th>Dónde</Table.Th>
                    <Table.Th>Imprimió</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(p.printedAt)}</Table.Td>
                      <Table.Td>{RECEIPT_TYPES[p.documentType]?.label ?? p.documentType}</Table.Td>
                      <Table.Td fw={600} ff="monospace" style={{ whiteSpace: 'nowrap' }}>{p.documentNumber}</Table.Td>
                      <Table.Td>
                        {p.copyNumber === 0
                          ? <Badge variant="light" color="green" style={{ minWidth: 'max-content' }}>Original</Badge>
                          : <Badge variant="light" color="gray" style={{ minWidth: 'max-content' }}>Copia {p.copyNumber}</Badge>}
                      </Table.Td>
                      <Table.Td>{p.channel === 'BLUETOOTH' ? 'App (Bluetooth)' : 'Web'}</Table.Td>
                      <Table.Td>{p.printedBy.fullName}</Table.Td>
                      <Table.Td ta="right">
                        <ReceiptButton size="xs" type={RECEIPT_TYPES[p.documentType].slug} id={p.documentId} label="Ver / reimprimir" />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </QueryState>
      </Card>
    </>
  );
}

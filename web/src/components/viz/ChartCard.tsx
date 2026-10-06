import { Card, Group, SegmentedControl, Table, Text } from '@mantine/core';
import { ReactNode, useState } from 'react';

export interface TableColumn<T> {
  label: string;
  value: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

interface Props<T> {
  title: string;
  subtitle?: string;
  chart: ReactNode;
  rows: T[];
  columns: TableColumn<T>[];
  empty?: boolean;
  emptyText?: string;
}

/** Tarjeta de gráfico con vista de tabla alternativa (accesibilidad y lectura exacta de valores). */
export function ChartCard<T>({ title, subtitle, chart, rows, columns, empty, emptyText = 'Sin datos en el período.' }: Props<T>) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm" align="flex-start" gap="xs">
        <div>
          <Text fw={600}>{title}</Text>
          {subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}
        </div>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as 'chart' | 'table')}
          data={[
            { value: 'chart', label: 'Gráfico' },
            { value: 'table', label: 'Tabla' },
          ]}
        />
      </Group>
      {empty ? (
        <Text c="dimmed" size="sm" py="xl" ta="center">{emptyText}</Text>
      ) : view === 'chart' ? (
        chart
      ) : (
        <Table.ScrollContainer minWidth={360} mah={320}>
          <Table striped stickyHeader>
            <Table.Thead>
              <Table.Tr>
                {columns.map((c) => (
                  <Table.Th key={c.label} ta={c.align}>{c.label}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row, i) => (
                <Table.Tr key={i}>
                  {columns.map((c) => (
                    <Table.Td key={c.label} ta={c.align} style={{ fontVariantNumeric: 'tabular-nums' }}>{c.value(row)}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}

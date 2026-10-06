import { Card, Group, Text } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';

interface Props {
  label: string;
  value: string;
  hint?: string;
  /** Variación % contra el período anterior; null si no hay base de comparación. */
  delta?: string | number | null;
}

/** Indicador: etiqueta, valor y variación con flecha + texto (nunca solo color). */
export function StatTile({ label, value, hint, delta }: Props) {
  const d = delta === null || delta === undefined ? null : Number(delta);
  return (
    <Card withBorder padding="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text fz={28} fw={700} mt={2} lh={1.2}>{value}</Text>
      <Group gap={6} mt={4} wrap="nowrap">
        {d !== null && (
          <Group gap={2} wrap="nowrap" c={d >= 0 ? 'green.8' : 'red.8'}>
            {d >= 0 ? <IconArrowUpRight size={16} /> : <IconArrowDownRight size={16} />}
            <Text size="sm" fw={600} c="inherit">{`${d >= 0 ? '+' : ''}${d.toFixed(1)} %`}</Text>
          </Group>
        )}
        {hint && <Text size="sm" c="dimmed" truncate>{hint}</Text>}
      </Group>
    </Card>
  );
}

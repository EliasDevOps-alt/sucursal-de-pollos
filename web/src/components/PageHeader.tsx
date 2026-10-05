import { Group, Text, Title } from '@mantine/core';
import { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
      <div>
        <Title order={2}>{title}</Title>
        {subtitle && <Text c="dimmed" size="sm">{subtitle}</Text>}
      </div>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}

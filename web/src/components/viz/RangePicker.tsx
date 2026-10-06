import { SegmentedControl } from '@mantine/core';

export type RangePreset = '7' | '30' | '90' | 'month';

/** Rango en fechas locales (AAAA-MM-DD) a partir de un preset. */
export function presetRange(preset: RangePreset): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const from = new Date(today);
  if (preset === 'month') from.setDate(1);
  else from.setDate(today.getDate() - (Number(preset) - 1));
  return { from: fmt(from), to: fmt(today) };
}

export function RangePicker({ value, onChange }: { value: RangePreset; onChange: (v: RangePreset) => void }) {
  return (
    <SegmentedControl
      value={value}
      onChange={(v) => onChange(v as RangePreset)}
      data={[
        { value: '7', label: '7 días' },
        { value: '30', label: '30 días' },
        { value: '90', label: '90 días' },
        { value: 'month', label: 'Este mes' },
      ]}
    />
  );
}

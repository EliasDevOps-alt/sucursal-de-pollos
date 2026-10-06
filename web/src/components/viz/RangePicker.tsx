import { Group, SegmentedControl, TextInput } from '@mantine/core';
import { useState } from 'react';

export type RangePreset = '7' | '30' | '90' | 'month' | 'custom';
export type DateRange = { from: string; to: string };

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rango en fechas locales (AAAA-MM-DD) a partir de un preset. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const today = new Date();
  const from = new Date(today);
  if (preset === 'month') from.setDate(1);
  else from.setDate(today.getDate() - (Number(preset) - 1));
  return { from: fmt(from), to: fmt(today) };
}

const MAX_DAYS = 366; // mismo tope que el servidor

/** Rango completo, en orden, desde el año 2000 y de un año como máximo (descarta los estados intermedios al tipear). */
function isValidRange({ from, to }: DateRange) {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from < '2000-01-01' || from > to) return false;
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 <= MAX_DAYS;
}

/**
 * Rango de fechas con presets y rango libre. Devuelve el rango vigente y el selector para el encabezado.
 * Mientras el rango libre está incompleto o invertido se conserva el último rango válido.
 */
export function useDateRange(initial: Exclude<RangePreset, 'custom'> = '30') {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [custom, setCustom] = useState<DateRange>(() => presetRange(initial));
  const customValid = isValidRange(custom);
  const [lastValid, setLastValid] = useState<DateRange>(custom);
  if (preset === 'custom' && customValid && (lastValid.from !== custom.from || lastValid.to !== custom.to)) setLastValid(custom);

  const range = preset === 'custom' ? (customValid ? custom : lastValid) : presetRange(preset);

  const picker = (
    <Group gap="xs" wrap="wrap" justify="flex-end">
      {preset === 'custom' && (
        <>
          <TextInput type="date" size="xs" w={140} aria-label="Desde" value={custom.from} max={custom.to}
            onChange={(e) => setCustom({ ...custom, from: e.currentTarget.value })} error={!customValid} />
          <TextInput type="date" size="xs" w={140} aria-label="Hasta" value={custom.to} min={custom.from}
            onChange={(e) => setCustom({ ...custom, to: e.currentTarget.value })} error={!customValid} />
        </>
      )}
      <SegmentedControl
        value={preset}
        onChange={(v) => {
          // Al pasar a "Personalizado" se parte del rango que se estaba viendo.
          if (v === 'custom' && preset !== 'custom') setCustom(range);
          setPreset(v as RangePreset);
        }}
        data={[
          { value: '7', label: '7 días' },
          { value: '30', label: '30 días' },
          { value: '90', label: '90 días' },
          { value: 'month', label: 'Este mes' },
          { value: 'custom', label: 'Personalizado' },
        ]}
      />
    </Group>
  );
  return { range, picker };
}

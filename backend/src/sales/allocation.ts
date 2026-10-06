import { Prisma } from '@prisma/client';
import { D, kg, ZERO } from '../common/decimal';

export interface AvailableLot {
  lotId: string;
  lotCode: string;
  expiryDate: Date;
  availableKg: Prisma.Decimal;
  costPerKg: Prisma.Decimal;
}

export interface Allocation {
  lot: AvailableLot;
  weightKg: Prisma.Decimal;
  /** true si se tomó de un lote que no correspondía según FEFO. */
  forced: boolean;
}

export class AllocationError extends Error {}

/**
 * FEFO: consume los lotes en el orden recibido (ya ordenados por vencimiento) hasta cubrir el peso.
 * Ejemplo: 200 kg con L001 = 120 kg y L002 = 300 kg → 120 kg de L001 + 80 kg de L002.
 */
export function allocateFefo(lots: AvailableLot[], weightKg: Prisma.Decimal.Value): Allocation[] {
  let pending = kg(D(weightKg));
  const result: Allocation[] = [];
  for (const lot of lots) {
    if (pending.lte(0)) break;
    const take = Prisma.Decimal.min(pending, lot.availableKg);
    if (take.lte(0)) continue;
    result.push({ lot, weightKg: kg(take), forced: false });
    pending = kg(pending.minus(take));
  }
  if (pending.gt(0)) {
    const available = lots.reduce((s, l) => s.plus(l.availableKg), ZERO);
    throw new AllocationError(`Stock insuficiente: disponible ${available.toFixed(3)} kg, solicitado ${D(weightKg).toFixed(3)} kg`);
  }
  return result;
}

/**
 * Lotes elegidos a mano. Cada porción se marca como forzada si excede lo que FEFO
 * habría tomado de ese mismo lote (es decir, se saltó un lote que vence antes).
 */
export function allocateManual(
  lots: AvailableLot[],
  weightKg: Prisma.Decimal.Value,
  chosen: { lotId: string; weightKg: Prisma.Decimal.Value }[],
): Allocation[] {
  const total = kg(chosen.reduce((s, c) => s.plus(D(c.weightKg)), ZERO));
  if (!total.eq(kg(D(weightKg)))) {
    throw new AllocationError(`La suma por lote (${total.toFixed(3)} kg) no coincide con el peso de la línea (${D(weightKg).toFixed(3)} kg)`);
  }
  if (new Set(chosen.map((c) => c.lotId)).size !== chosen.length) throw new AllocationError('Un lote está repetido en la línea');

  const fefo = new Map(allocateFefo(lots, weightKg).map((a) => [a.lot.lotId, a.weightKg]));
  return chosen.map((c) => {
    const lot = lots.find((l) => l.lotId === c.lotId);
    if (!lot) throw new AllocationError('Un lote elegido no está disponible para este producto y almacén (sin saldo o vencido)');
    const weight = kg(D(c.weightKg));
    if (weight.lte(0)) throw new AllocationError(`Peso inválido para el lote ${lot.lotCode}`);
    if (weight.gt(lot.availableKg)) {
      throw new AllocationError(`El lote ${lot.lotCode} solo tiene ${lot.availableKg.toFixed(3)} kg`);
    }
    return { lot, weightKg: weight, forced: weight.gt(fefo.get(lot.lotId) ?? ZERO) };
  });
}

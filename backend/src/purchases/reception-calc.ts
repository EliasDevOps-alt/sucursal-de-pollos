import { Prisma, ShrinkageTreatment } from '@prisma/client';
import { D, kg, money, perKg, ZERO } from '../common/decimal';

export interface ReceptionLineInput {
  purchasedWeightKg: Prisma.Decimal.Value;
  unitCost: Prisma.Decimal.Value; // costo por kg comprado
  subtotal: Prisma.Decimal.Value; // lo pagado por la línea
  grossWeightKg: Prisma.Decimal.Value; // peso en balanza
  tareWeightKg: Prisma.Decimal.Value; // canastillos
  treatment: ShrinkageTreatment;
}

export interface ReceptionLineResult {
  netWeightKg: Prisma.Decimal;
  shrinkageWeightKg: Prisma.Decimal;
  shrinkagePercentage: Prisma.Decimal;
  shrinkageLossAmount: Prisma.Decimal; // valor de la merma a costo de compra
  originalCostPerKg: Prisma.Decimal;
  actualCostPerKg: Prisma.Decimal;
}

/**
 * Calcula la merma y el costo real de una línea recibida.
 *
 *   neto  = bruto − tara
 *   merma = comprado − neto (mínimo 0)
 *   ABSORB      → costo real = costo de compra; la merma se valora como pérdida.
 *   INCORPORATE → costo real = lo pagado / kg netos; la merma queda dentro del costo.
 *
 * Ejemplo: 250 kg a 14.50 = 3 625 BOB; balanza 262 kg, tara 16 kg → neto 246 kg, merma 4 kg (1.60 %).
 *   ABSORB:      costo 14.5000/kg, pérdida 58.00 BOB.
 *   INCORPORATE: costo 3 625 / 246 = 14.7358/kg.
 */
export function computeReceptionLine(input: ReceptionLineInput): ReceptionLineResult {
  const purchased = D(input.purchasedWeightKg);
  const net = kg(D(input.grossWeightKg).minus(D(input.tareWeightKg)));
  if (net.lte(0)) {
    throw new Error('El peso neto (bruto − tara) debe ser mayor a cero');
  }

  const rawShrinkage = purchased.minus(net);
  const shrinkage = rawShrinkage.isNegative() ? ZERO : kg(rawShrinkage);
  const shrinkagePercentage = shrinkage.div(purchased).times(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const originalCostPerKg = perKg(D(input.unitCost));
  const actualCostPerKg =
    input.treatment === ShrinkageTreatment.INCORPORATE ? perKg(D(input.subtotal).div(net)) : originalCostPerKg;

  return {
    netWeightKg: net,
    shrinkageWeightKg: shrinkage,
    shrinkagePercentage,
    shrinkageLossAmount: money(shrinkage.times(originalCostPerKg)),
    originalCostPerKg,
    actualCostPerKg,
  };
}

/** Precio sugerido por kg = costo real × (1 + margen %). */
export function suggestedPrice(actualCostPerKg: Prisma.Decimal, marginPercentage: Prisma.Decimal.Value) {
  return perKg(actualCostPerKg.times(D(1).plus(D(marginPercentage).div(100))));
}

import { Prisma } from '@prisma/client';

export interface RankRule {
  id: string;
  minMonthlyPurchase: Prisma.Decimal;
  maxDaysOverdue: number;
}

export interface CustomerStanding {
  monthlyAverage: Prisma.Decimal; // compra neta promedio por mes en la ventana
  oldestDebtDays: number | null; // antigüedad del cargo más antiguo sin saldar (null = sin deuda)
  overLimit: boolean; // la deuda supera su límite de crédito
  currentRankId: string | null;
}

/**
 * Rango que corresponde a un cliente: el más alto cuyo mínimo de compra alcanza y cuya deuda más antigua respeta.
 * Solo se sugiere subir (nunca bajar) y nunca a quien debe por encima de su límite.
 */
export function suggestRank<T extends RankRule>(ranks: T[], c: CustomerStanding): T | null {
  if (c.overLimit) return null;
  const ordered = [...ranks].sort((a, b) => a.minMonthlyPurchase.comparedTo(b.minMonthlyPurchase));
  const current = ordered.find((r) => r.id === c.currentRankId) ?? null;
  const qualifies = ordered.filter((r) => c.monthlyAverage.gte(r.minMonthlyPurchase) && (c.oldestDebtDays ?? 0) <= r.maxDaysOverdue);
  const best = qualifies[qualifies.length - 1];
  if (!best) return null;
  if (current) return best.minMonthlyPurchase.gt(current.minMonthlyPurchase) ? best : null;
  // Sin rango: se sugiere solo si alcanza uno con exigencia (no el de entrada, que no aporta nada).
  return best.minMonthlyPurchase.gt(0) ? best : null;
}

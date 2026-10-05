import { Prisma } from '@prisma/client';

// Toda la aritmética de pesos y dinero usa Decimal (nunca number) para evitar errores de coma flotante.
export const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

export const ZERO = D(0);

/** Redondeo a 2 decimales (dinero). */
export const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** Redondeo a 3 decimales (pesos). */
export const kg = (value: Prisma.Decimal) => value.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

/** Redondeo a 4 decimales (costo o precio por kg). */
export const perKg = (value: Prisma.Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

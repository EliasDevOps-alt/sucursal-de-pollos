-- Sugerencia de ascenso de rango: cada rango indica la compra promedio mensual (últimos 90 días) y la deuda más
-- antigua permitida para sugerirlo. Valores iniciales para los rangos de fábrica (se editan en Catálogos).
ALTER TABLE "customer_ranks" ADD COLUMN "min_monthly_purchase" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "customer_ranks" ADD COLUMN "max_days_overdue" INTEGER NOT NULL DEFAULT 30;
UPDATE "customer_ranks" SET "min_monthly_purchase" = 3000, "max_days_overdue" = 30 WHERE "code" = 'PLATA';
UPDATE "customer_ranks" SET "min_monthly_purchase" = 8000, "max_days_overdue" = 15 WHERE "code" = 'ORO';

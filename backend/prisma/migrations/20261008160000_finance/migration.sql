-- CreateEnum
CREATE TYPE "CashAccountType" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashCategory" AS ENUM ('SALE', 'COLLECTION', 'SETTLEMENT', 'PURCHASE', 'REFUND', 'EXPENSE', 'OTHER_INCOME', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "settlement_id" UUID;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "paid_by_id" UUID;

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CashAccountType" NOT NULL,
    "branch_id" UUID,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "session_number" TEXT NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_expected" DECIMAL(14,2) NOT NULL,
    "opening_counted" DECIMAL(14,2) NOT NULL,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "closing_expected" DECIMAL(14,2),
    "closing_counted" DECIMAL(14,2),
    "closing_difference" DECIMAL(14,2),
    "denominations" JSONB,
    "notes" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "session_id" UUID,
    "direction" "CashDirection" NOT NULL,
    "category" "CashCategory" NOT NULL,
    "expense_type" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "payment_method" TEXT,
    "description" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "reversed_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "settlement_number" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "received_by_id" UUID NOT NULL,
    "expected_cash" DECIMAL(14,2) NOT NULL,
    "counted_cash" DECIMAL(14,2) NOT NULL,
    "cash_difference" DECIMAL(14,2) NOT NULL,
    "digital_amount" DECIMAL(14,2) NOT NULL,
    "payments_count" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_code_key" ON "cash_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_session_number_key" ON "cash_sessions"("session_number");

-- CreateIndex
CREATE INDEX "cash_sessions_cash_account_id_status_idx" ON "cash_sessions"("cash_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_reversed_by_id_key" ON "cash_movements"("reversed_by_id");

-- CreateIndex
CREATE INDEX "cash_movements_cash_account_id_created_at_idx" ON "cash_movements"("cash_account_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_reference_type_reference_id_idx" ON "cash_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "cash_movements_category_created_at_idx" ON "cash_movements"("category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_settlement_number_key" ON "settlements"("settlement_number");

-- CreateIndex
CREATE INDEX "settlements_user_id_created_at_idx" ON "settlements"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Datos: cuentas de dinero iniciales, numeración y permisos de finanzas.
INSERT INTO "cash_accounts" ("id", "code", "name", "type", "branch_id")
SELECT gen_random_uuid(), 'CAJA-CEN', 'Caja Central', 'CASH', b.id FROM "branches" b WHERE b.code = 'CEN'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "cash_accounts" ("id", "code", "name", "type", "branch_id")
SELECT gen_random_uuid(), 'CAJA-' || b.code, 'Caja ' || b.name, 'CASH', b.id FROM "branches" b WHERE b.code <> 'CEN'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "cash_accounts" ("id", "code", "name", "type") VALUES (gen_random_uuid(), 'BANCO', 'Cuenta bancaria (QR y transferencias)', 'BANK')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "document_sequences" ("name", "prefix", "last_value") VALUES ('cash_session', 'CJ-', 0), ('settlement', 'RD-', 0)
ON CONFLICT ("name") DO NOTHING;

-- Compras anteriores: las pagadas al contado se dan por pagadas (no tienen movimiento de caja histórico).
UPDATE "purchases" SET "paid_at" = "created_at", "paid_by_id" = "created_by_id"
WHERE "payment_method" <> 'CREDITO_PROVEEDOR' AND "status" <> 'CANCELLED' AND "paid_at" IS NULL;

INSERT INTO "permissions" ("id", "code", "module", "description") VALUES
  (gen_random_uuid(), 'cash.view', 'cash', 'Ver cajas, cuentas, movimientos de dinero y rendiciones'),
  (gen_random_uuid(), 'cash.manage', 'cash', 'Abrir y cerrar caja, registrar ingresos, egresos y traspasos'),
  (gen_random_uuid(), 'settlements.manage', 'cash', 'Recibir rendiciones de choferes y cobradores')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON
     (r.code = 'ADMIN' AND p.code IN ('cash.view', 'cash.manage', 'settlements.manage'))
  OR (r.code = 'SELLER_CENTRAL' AND p.code IN ('cash.view', 'cash.manage', 'settlements.manage'))
  OR (r.code = 'SELLER_BRANCH' AND p.code IN ('cash.view', 'cash.manage'))
  OR (r.code = 'ACCOUNTANT' AND p.code = 'cash.view')
ON CONFLICT DO NOTHING;

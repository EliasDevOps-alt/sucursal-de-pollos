-- CreateEnum
CREATE TYPE "ReceivableMovementType" AS ENUM ('CHARGE', 'PAYMENT', 'ANNUL', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "price_authorized_by_id" UUID,
ADD COLUMN     "price_change_reason" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "credit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "credit_authorized_by_id" UUID,
ADD COLUMN     "credit_exception_reason" TEXT,
ADD COLUMN     "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "sale_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_source" TEXT NOT NULL DEFAULT 'CENTRAL',
    "received_by_id" UUID NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference_number" TEXT,
    "notes" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_movements" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "movement_type" "ReceivableMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" UUID NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_customer_id_payment_date_idx" ON "payments"("customer_id", "payment_date");

-- CreateIndex
CREATE INDEX "receivable_movements_customer_id_created_at_idx" ON "receivable_movements"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_credit_authorized_by_id_fkey" FOREIGN KEY ("credit_authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_price_authorized_by_id_fkey" FOREIGN KEY ("price_authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_movements" ADD CONSTRAINT "receivable_movements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_movements" ADD CONSTRAINT "receivable_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

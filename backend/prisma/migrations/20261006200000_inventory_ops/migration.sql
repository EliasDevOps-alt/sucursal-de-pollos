-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('COUNT', 'LOSS');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('PHYSICAL_COUNT', 'EXPIRED', 'DAMAGED', 'SPOILED', 'THEFT', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('VALID', 'ANNULLED');

-- CreateEnum
CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCK', 'DISCARD');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('CREDIT', 'CASH');

-- AlterEnum
ALTER TYPE "ReceivableMovementType" ADD VALUE 'RETURN';

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "returned_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "returned_weight_kg" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_lot_allocations" ADD COLUMN     "restocked_weight_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN     "returned_weight_kg" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "returned_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "origin_warehouse_id" UUID NOT NULL,
    "destination_warehouse_id" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "notes" TEXT,
    "sent_by_id" UUID NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_id" UUID,
    "received_at" TIMESTAMP(3),
    "receive_notes" TEXT,
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_items" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "sent_weight_kg" DECIMAL(14,3) NOT NULL,
    "sent_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "received_weight_kg" DECIMAL(14,3),
    "received_quantity" DECIMAL(14,3),
    "difference_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cost_per_kg" DECIMAL(14,4) NOT NULL,
    "loss_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" UUID NOT NULL,
    "adjustment_number" TEXT NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "reason_code" "AdjustmentReason" NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "system_weight_kg" DECIMAL(14,3) NOT NULL,
    "new_weight_kg" DECIMAL(14,3) NOT NULL,
    "weight_kg" DECIMAL(14,3) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cost_per_kg" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'VALID',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annulled_by_id" UUID,
    "annulled_at" TIMESTAMP(3),
    "annul_reason" TEXT,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" UUID NOT NULL,
    "return_number" TEXT NOT NULL,
    "sale_id" UUID NOT NULL,
    "customer_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_method" "RefundMethod" NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "restocked_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "discarded_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "loss_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "authorized_by_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "weight_kg" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "cost_per_kg" DECIMAL(14,4) NOT NULL,
    "disposition" "ReturnDisposition" NOT NULL,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfers_transfer_number_key" ON "transfers"("transfer_number");

-- CreateIndex
CREATE INDEX "transfers_status_sent_at_idx" ON "transfers"("status", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_adjustment_number_key" ON "inventory_adjustments"("adjustment_number");

-- CreateIndex
CREATE INDEX "inventory_adjustments_created_at_idx" ON "inventory_adjustments"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_return_number_key" ON "sale_returns"("return_number");

-- CreateIndex
CREATE INDEX "sale_returns_created_at_idx" ON "sale_returns"("created_at");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_origin_warehouse_id_fkey" FOREIGN KEY ("origin_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_annulled_by_id_fkey" FOREIGN KEY ("annulled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "sale_lot_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Datos: numeración de los nuevos documentos y permisos nuevos con sus roles iniciales
-- (en bases ya existentes no hace falta volver a correr el seed, que reinicia los permisos de los roles).
INSERT INTO "document_sequences" ("name", "prefix", "last_value") VALUES
  ('transfer', 'TR-', 0), ('adjustment', 'AJ-', 0), ('return', 'DV-', 0)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "permissions" ("id", "code", "module", "description") VALUES
  (gen_random_uuid(), 'transfers.create', 'transfers', 'Enviar transferencias entre almacenes'),
  (gen_random_uuid(), 'transfers.receive', 'transfers', 'Recibir transferencias en el almacén de destino'),
  (gen_random_uuid(), 'sales.return', 'sales', 'Autorizar devoluciones de clientes')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON
     (r.code = 'ADMIN' AND p.code IN ('transfers.create', 'transfers.receive', 'sales.return'))
  OR (r.code = 'SELLER_CENTRAL' AND p.code IN ('transfers.create', 'transfers.receive'))
  OR (r.code = 'SELLER_BRANCH' AND p.code = 'transfers.receive')
ON CONFLICT DO NOTHING;

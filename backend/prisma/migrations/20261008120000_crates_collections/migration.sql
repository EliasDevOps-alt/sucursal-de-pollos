-- CreateEnum
CREATE TYPE "CrateHolderType" AS ENUM ('WAREHOUSE', 'CUSTOMER', 'USER');

-- CreateEnum
CREATE TYPE "CrateMovementType" AS ENUM ('INITIAL', 'DISPATCH', 'DELIVERY', 'PICKUP', 'RETURN', 'SHORTAGE', 'TRANSFER', 'WRITE_OFF');

-- AlterTable
ALTER TABLE "delivery_routes" ADD COLUMN     "crates_loaded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "crates_returned" INTEGER;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "collected_at_device" TIMESTAMP(3),
ADD COLUMN     "device_operation_id" UUID,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "paid_by_name" TEXT,
ADD COLUMN     "signature" TEXT;

-- AlterTable
ALTER TABLE "route_stops" ADD COLUMN     "crates_delivered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "crates_picked_up" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "crate_balances" (
    "holder_type" "CrateHolderType" NOT NULL,
    "holder_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crate_balances_pkey" PRIMARY KEY ("holder_type","holder_id")
);

-- CreateTable
CREATE TABLE "crate_movements" (
    "id" UUID NOT NULL,
    "type" "CrateMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from_type" "CrateHolderType",
    "from_id" UUID,
    "to_type" "CrateHolderType",
    "to_id" UUID,
    "reference_type" TEXT,
    "reference_id" UUID,
    "reason" TEXT,
    "charge_amount" DECIMAL(14,2),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crate_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crate_movements_from_type_from_id_idx" ON "crate_movements"("from_type", "from_id");

-- CreateIndex
CREATE INDEX "crate_movements_to_type_to_id_idx" ON "crate_movements"("to_type", "to_id");

-- CreateIndex
CREATE INDEX "crate_movements_created_at_idx" ON "crate_movements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_device_operation_id_key" ON "payments"("device_operation_id");

-- AddForeignKey
ALTER TABLE "crate_movements" ADD CONSTRAINT "crate_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Datos: permisos de canastillos, catálogo para el cobrador (descarga de datos al teléfono) y un cobrador de demostración.
INSERT INTO "permissions" ("id", "code", "module", "description") VALUES
  (gen_random_uuid(), 'crates.view', 'crates', 'Ver canastillos por tenedor y sus movimientos'),
  (gen_random_uuid(), 'crates.manage', 'crates', 'Registrar altas, traspasos y bajas de canastillos')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON
     (r.code = 'ADMIN' AND p.code IN ('crates.view', 'crates.manage'))
  OR (r.code = 'SELLER_CENTRAL' AND p.code IN ('crates.view', 'crates.manage'))
  OR (r.code IN ('SELLER_BRANCH', 'ACCOUNTANT') AND p.code = 'crates.view')
  OR (r.code = 'COLLECTOR' AND p.code = 'catalog.view')
ON CONFLICT DO NOTHING;

INSERT INTO "users" ("id", "username", "password_hash", "full_name", "role_id", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'cobrador', '$2b$10$mt1qXU7WZvWdxY20sGOOaOz3CEkLukbndDVuY2HLIofOB/OEay1VW', 'Cobrador Demo', r.id, true, now(), now()
FROM "roles" r WHERE r.code = 'COLLECTOR'
ON CONFLICT ("username") DO NOTHING;

-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('OWN', 'SUBCONTRACTED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDING', 'DELIVERED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryProblem" AS ENUM ('CLOSED', 'NOT_FOUND', 'REJECTED', 'NO_PAYMENT', 'WRONG_ADDRESS', 'DAMAGED', 'NOT_VISITED', 'OTHER');

-- AlterEnum
ALTER TYPE "WarehouseType" ADD VALUE 'VEHICLE';

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownership" "VehicleOwnership" NOT NULL,
    "owner_name" TEXT,
    "capacity_kg" DECIMAL(14,3) NOT NULL,
    "capacity_crates" INTEGER NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_routes" (
    "id" UUID NOT NULL,
    "route_number" TEXT NOT NULL,
    "route_date" DATE NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "origin_warehouse_id" UUID NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "load_transfer_id" UUID,
    "return_transfer_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_by_id" UUID,
    "dispatched_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "close_notes" TEXT,
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "delivery_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "presale_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address_id" UUID,
    "status" "StopStatus" NOT NULL DEFAULT 'PENDING',
    "credit_authorized_by_id" UUID,
    "credit_auth_reason" TEXT,
    "sale_id" UUID,
    "received_by_name" TEXT,
    "signature" TEXT,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_method" TEXT,
    "problem_type" "DeliveryProblem",
    "notes" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "resolved_at_device" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "recorded_by_id" UUID,
    "device_operation_id" UUID,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stop_items" (
    "id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "ordered_weight_kg" DECIMAL(14,3) NOT NULL,
    "ordered_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "delivered_weight_kg" DECIMAL(14,3),
    "difference_reason" TEXT,

    CONSTRAINT "route_stop_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_warehouse_id_key" ON "vehicles"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_routes_route_number_key" ON "delivery_routes"("route_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_routes_load_transfer_id_key" ON "delivery_routes"("load_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_routes_return_transfer_id_key" ON "delivery_routes"("return_transfer_id");

-- CreateIndex
CREATE INDEX "delivery_routes_route_date_status_idx" ON "delivery_routes"("route_date", "status");

-- CreateIndex
CREATE INDEX "delivery_routes_driver_id_status_idx" ON "delivery_routes"("driver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_sale_id_key" ON "route_stops"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_device_operation_id_key" ON "route_stops"("device_operation_id");

-- CreateIndex
CREATE INDEX "route_stops_route_id_sequence_idx" ON "route_stops"("route_id", "sequence");

-- CreateIndex
CREATE INDEX "route_stops_presale_id_idx" ON "route_stops"("presale_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_origin_warehouse_id_fkey" FOREIGN KEY ("origin_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_dispatched_by_id_fkey" FOREIGN KEY ("dispatched_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_load_transfer_id_fkey" FOREIGN KEY ("load_transfer_id") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_return_transfer_id_fkey" FOREIGN KEY ("return_transfer_id") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "delivery_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_presale_id_fkey" FOREIGN KEY ("presale_id") REFERENCES "presales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_credit_authorized_by_id_fkey" FOREIGN KEY ("credit_authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stop_items" ADD CONSTRAINT "route_stop_items_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stop_items" ADD CONSTRAINT "route_stop_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Datos: numeración de rutas, permisos de logística y un chofer de demostración
-- (en bases existentes no hace falta correr el seed, que reinicia los permisos de los roles).
INSERT INTO "document_sequences" ("name", "prefix", "last_value") VALUES ('route', 'RT-', 0)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "permissions" ("id", "code", "module", "description") VALUES
  (gen_random_uuid(), 'routes.view', 'routes', 'Ver vehículos, rutas y entregas'),
  (gen_random_uuid(), 'routes.manage', 'routes', 'Gestionar vehículos; planificar, despachar y cerrar rutas'),
  (gen_random_uuid(), 'deliveries.register', 'deliveries', 'Registrar entregas en ruta')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON
     (r.code = 'ADMIN' AND p.code IN ('routes.view', 'routes.manage', 'deliveries.register'))
  OR (r.code = 'SELLER_CENTRAL' AND p.code IN ('routes.view', 'routes.manage'))
  OR (r.code = 'ACCOUNTANT' AND p.code = 'routes.view')
  OR (r.code = 'DRIVER' AND p.code = 'deliveries.register')
ON CONFLICT DO NOTHING;

INSERT INTO "users" ("id", "username", "password_hash", "full_name", "role_id", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'chofer', '$2b$10$nHXL6OZWqMRjCh.Jd9B7LO46Xha8ATpcap/bUpiuFobjAHX0GF54a', 'Chofer Demo', r.id, true, now(), now()
FROM "roles" r WHERE r.code = 'DRIVER'
ON CONFLICT ("username") DO NOTHING;

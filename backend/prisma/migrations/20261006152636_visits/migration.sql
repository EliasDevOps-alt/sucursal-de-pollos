-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('ORDER', 'NO_ORDER', 'CLOSED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "preventista_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "outcome" "VisitOutcome" NOT NULL,
    "notes" TEXT,
    "presale_id" UUID,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "visited_at_device" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visits_preventista_id_visited_at_device_idx" ON "visits"("preventista_id", "visited_at_device");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_preventista_id_fkey" FOREIGN KEY ("preventista_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


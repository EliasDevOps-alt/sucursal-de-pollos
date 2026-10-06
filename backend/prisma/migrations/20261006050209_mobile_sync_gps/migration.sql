-- AlterTable
ALTER TABLE "presales" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7);

-- CreateTable
CREATE TABLE "gps_positions" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy_meters" DECIMAL(8,2),
    "event_type" TEXT NOT NULL,
    "reference_id" UUID,
    "captured_at_device" TIMESTAMP(3) NOT NULL,
    "received_at_server" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gps_positions_user_id_captured_at_device_idx" ON "gps_positions"("user_id", "captured_at_device");

-- AddForeignKey
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

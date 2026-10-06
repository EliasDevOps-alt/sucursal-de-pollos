-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('VALID', 'ANNULLED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "annul_reason" TEXT,
ADD COLUMN     "annulled_at" TIMESTAMP(3),
ADD COLUMN     "annulled_by_id" UUID,
ADD COLUMN     "is_advance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receipt_number" TEXT,
ADD COLUMN     "status" "PaymentRecordStatus" NOT NULL DEFAULT 'VALID';

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_annulled_by_id_fkey" FOREIGN KEY ("annulled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


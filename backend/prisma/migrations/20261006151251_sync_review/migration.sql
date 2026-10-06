-- AlterTable
ALTER TABLE "sync_operations" ADD COLUMN     "resolution_note" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolved_by_id" UUID;

-- CreateIndex
CREATE INDEX "sync_operations_status_resolved_at_idx" ON "sync_operations"("status", "resolved_at");

-- AddForeignKey
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


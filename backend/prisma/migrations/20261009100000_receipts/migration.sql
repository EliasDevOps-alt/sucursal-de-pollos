-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "receipt_prints" (
    "id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_id" UUID NOT NULL,
    "document_number" TEXT NOT NULL,
    "copy_number" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "printed_by_id" UUID NOT NULL,
    "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_prints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_prints_document_type_document_id_idx" ON "receipt_prints"("document_type", "document_id");

-- CreateIndex
CREATE INDEX "receipt_prints_printed_at_idx" ON "receipt_prints"("printed_at");

-- AddForeignKey
ALTER TABLE "receipt_prints" ADD CONSTRAINT "receipt_prints_printed_by_id_fkey" FOREIGN KEY ("printed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Datos del negocio para los recibos (editables desde Administración).
INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('company.name', 'Distribuidora de Pollos', now()),
  ('company.nit', '', now()),
  ('company.address', 'Av. Principal #100, Santa Cruz', now()),
  ('company.phone', '', now()),
  ('receipt.footer', 'Gracias por su compra', now())
ON CONFLICT ("key") DO NOTHING;

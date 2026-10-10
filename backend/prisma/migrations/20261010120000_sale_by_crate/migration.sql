-- Venta por canastillo: el producto indica el peso aproximado de un canastillo lleno; cada línea guarda cuántos
-- canastillos lleva (el precio y el stock siguen siendo por kg, con el peso real de la balanza).
ALTER TABLE "products" ADD COLUMN "kg_per_crate" DECIMAL(8,3);
ALTER TABLE "sale_items" ADD COLUMN "crates" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "presale_items" ADD COLUMN "crates" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "route_stop_items" ADD COLUMN "ordered_crates" INTEGER NOT NULL DEFAULT 0;

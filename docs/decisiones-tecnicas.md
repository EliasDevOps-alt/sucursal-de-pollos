# Decisiones técnicas

Desviaciones y precisiones respecto al *Documento de Diseño de Base de Datos v1.0*.

1. **Nombres** de tablas y campos en inglés (`snake_case` en BD, `camelCase` en código). Interfaz en español.
2. **IDs** UUID en todas las tablas. Los números visibles (`C-000001`, `V-000001`) salen de `document_sequences`.
3. **Stock: una sola fuente de verdad.** `inventory_movements` es el historial oficial; `inventory_balances` es el saldo materializado y se actualiza en la misma transacción. Se elimina `lots.available_weight_kg` para no duplicar el saldo.
4. **Movimientos con signo.** En `inventory_movements`, `weight_kg` y `quantity` son positivos en entradas y negativos en salidas; el saldo es la suma.
5. **Concurrencia.** Al vender se bloquea la fila del saldo del lote (`SELECT … FOR UPDATE`) para que dos ventas simultáneas no consuman el mismo stock.
6. **Precisión decimal.** Pesos `DECIMAL(14,3)`, dinero `DECIMAL(14,2)`, costos por kg `DECIMAL(14,4)`. Nunca `float`.
7. **Moneda** BOB fija en el MVP (campo `currency` presente donde hay importes).
8. **Anulación, no borrado.** Compras y ventas tienen `status` y campos `annulled_at`, `annulled_by_id`, `annul_reason`.
9. **Precio por lote.** `lot_prices` guarda el precio sugerido por lote y sucursal; `sale_items` conserva `original_unit_price` y `unit_price` para auditar cambios de precio.
10. **Offline idempotente.** `sync_operations.device_operation_id` y `presales.device_operation_id` son únicos: reenviar la misma operación no la duplica.
11. **Ambigüedades del documento resueltas:** referencias polimórficas con `reference_type` + `reference_id`; `presales.sale_id` enlaza la preventa con la venta que la atiende.

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
12. **Stock controlado por kg.** Las unidades (pollos) se registran como dato informativo en compras y ventas; el saldo que se valida y bloquea es el peso.
13. **Venta multi-lote.** Cada línea se reparte entre lotes (FEFO por defecto) en `sale_lot_allocations`, que congela el costo real y el precio de cada porción. La rentabilidad sale de ahí.
14. **Excepciones con autorización.** Forzar un lote fuera de FEFO, cambiar el precio sugerido o superar el límite de crédito requieren el permiso correspondiente y un motivo. Si el vendedor no tiene el permiso, un supervisor autoriza en el momento ingresando sus credenciales; queda registrado quién autorizó.
15. **Deuda por movimientos.** Se añadieron `payments` y `receivable_movements` (mínimos) para que `customers.current_debt` nunca cambie sin un movimiento que lo respalde.
16. **Anulación de venta.** Devuelve el stock a los mismos lotes (movimiento `SALE_ANNUL`) y revierte la parte a crédito. El reembolso de lo cobrado queda anotado en auditoría; el módulo de caja está fuera de la demo.
17. **Lotes vencidos** no se ofrecen ni se pueden vender; siguen contando en el stock hasta darse de baja.
18. **IDs generados en el móvil.** Clientes y preventas creados offline llevan UUID del teléfono; el servidor los respeta. Así un pedido puede referirse a un cliente aún no sincronizado.
19. **Sincronización por lote ordenado.** `POST /mobile/sync` procesa cada operación en su propia transacción. Ya sincronizada → devuelve el resultado anterior (idempotencia). Error de negocio → `REVIEW` con mensaje, sin bloquear las demás; se puede reintentar con el mismo id.
20. **Conflictos visibles, nunca silenciosos.** Si el teléfono cancela un pedido que ya fue atendido, el servidor lo rechaza y el teléfono lo muestra; nada se sobrescribe.
21. **Token móvil de 7 días** para que el preventista pueda trabajar varios días sin señal; si vence, se reingresa sin perder la cola.
22. **GPS del teléfono** por evento (pedido, alta de cliente) y periódico cada ~10 min con la app abierta, en `gps_positions`.

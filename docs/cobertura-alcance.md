# Cobertura del alcance del MVP

Revisión punto por punto del *Documento de Delimitación v1.0* y del *Documento de Diseño de Base de Datos v1.0* contra lo construido (octubre 2026).

Leyenda: ✅ hecho · 🟡 parcial · ❌ no hecho

## Resumen

| Módulo (delimitación §6) | Estado | Comentario |
|---|---|---|
| 6.1 Compras y abastecimiento | 🟡 7 de 8 | Falta registrar el pago de la compra como egreso de caja |
| 6.2 Inventario y almacenes | ✅ 10 de 10 | Transferencias con peso recibido, ajustes por conteo, bajas y kardex completo |
| 6.3 Ventas | 🟡 9 de 11 | Faltan recibos imprimibles, venta por canastillo e impresión térmica |
| 6.4 Preventas | ✅ 8 de 8 | Incluye edición de pedidos, direcciones adicionales, visitas y mapa de recorrido |
| 6.5 Logística y distribución | ❌ 0 de 12 | Módulo completo pendiente (incluye la app del chofer) |
| 6.6 Cobranza y crédito | 🟡 6 de 10 | Cobros y anticipos en la web sí; faltan la app del cobrador, mapa, recibos y rendición |
| 6.7 Canastillos | ❌ 0 de 7 | Módulo completo pendiente |
| 6.8 Finanzas operativas | 🟡 1 de 11 | Solo rentabilidad; falta caja, ingresos/egresos, rendiciones y cierres |
| 6.9 Dashboard y reportes | 🟡 | Hechos los de ventas, stock, merma, rentabilidad y cuentas por cobrar; faltan dinero, logística, canastillos y sucursales |
| §8 Apps móviles | 🟡 1 de 3 | Hecha la del preventista; faltan chofer y cobrador |
| §11 Recibos e impresión | ❌ | Pendiente |

**Estimación de avance del MVP: ~45 %.** Lo construido es el núcleo (lotes, costo real, ventas FEFO, crédito, preventa offline, reportes), que es la parte con más reglas de negocio. Lo que falta son módulos enteros: logística, cobranza en ruta, canastillos, caja e impresión.

## Detalle

### 6.1 Compras y abastecimiento
- ✅ Gestión de proveedores
- ✅ Compras con múltiples productos
- ✅ Recepción real del producto
- ✅ Lotes y costos por lote
- ✅ Merma: diferencia entre peso comprado y recibido, con tara de canastillos
- ✅ Vencimiento por lote
- ✅ Producto disponible para venta al recibir
- ❌ Pago de compras como egreso del dinero empresarial (se guarda el método de pago, pero no hay módulo de caja)

### 6.2 Inventario y almacenes
- ✅ Kardex (por lote y general)
- ✅ Productos y categorías editables (pantalla de catálogos)
- ✅ Stock por almacén y sucursal (la sucursal se abastece con transferencias)
- ✅ Stock por lote
- ✅ Transferencias central–sucursales: envío por FEFO o lote elegido, stock en tránsito, recepción con peso real (obligatoria si la sucursal pesa), faltante como pérdida en tránsito, cancelación con retorno al origen
- ✅ Ajustes por conteo físico con explicación obligatoria, valorizados a costo real, anulables con movimiento inverso
- ✅ Bajas y pérdidas por motivo (vencido, dañado, descompuesto, robo, otro); alerta de lotes vencidos con saldo y baja en un clic; reporte de pérdidas por causa
- ✅ Productos próximos a vencer
- ✅ Prioridad de salida por vencimiento (FEFO)
- ✅ Trazabilidad completa recepción → transferencia → venta / devolución / baja, por lote y almacén

### 6.3 Ventas
- ✅ Ventas en almacén central
- ✅ Ventas en sucursales con el stock transferido
- ✅ Clientes registrados y ventas rápidas
- 🟡 Venta por kilogramo y despiece (como productos) sí; por canastillo no
- ❌ Recibos/notas de venta (documento imprimible)
- ✅ Descuentos automáticos por rango
- ✅ Ventas a crédito cuando están habilitadas
- ✅ Pagos completos y parciales al vender; anticipos (saldo a favor) desde Cobranza
- ✅ Devoluciones autorizadas (permiso o credenciales de supervisor), parciales o totales: lo sano reingresa al mismo lote, lo descartado es pérdida; se descuenta de la deuda o se devuelve en efectivo; reportes netos de devoluciones
- ❌ Impresión térmica de 80 mm

### 6.4 Preventas (app del preventista)
- ✅ Registro móvil de pedidos
- ✅ Registro de clientes con GPS
- ✅ Direcciones adicionales desde la app
- ✅ Catálogo y precios
- ✅ Cancelación y modificación del pedido antes de atenderlo
- ✅ Consulta de preventas propias
- ✅ Trabajo offline y sincronización idempotente
- ✅ Trayectoria GPS: posiciones por evento y cada ~10 min, visitas con resultado (con pedido, sin pedido, cerrado, responsable ausente) y página web **Recorrido** con mapa (OpenStreetMap), trayectoria, pedidos, visitas y línea de tiempo por preventista y día

### 6.5 Logística y distribución — pendiente completo
- ❌ Vehículos propios y subcontratados, capacidad en kg y canastillos
- ❌ Asignación manual de pedidos, vehículos y choferes; organización de rutas (ruta fija al iniciar)
- ❌ Hoja de carga/despacho
- ❌ Seguimiento GPS del chofer
- ❌ Entregas, diferencias con motivo obligatorio, reporte de problemas
- ❌ Firma digital, recibo digital, impresión térmica, consulta y reimpresión
- ❌ App del chofer (offline)

### 6.6 Cobranza y crédito
- ✅ Deuda acumulada por cliente (con historial de movimientos)
- ✅ Límites de crédito por rango
- ✅ Bloqueo al superar el límite, salvo excepción autorizada
- ✅ Cobros parciales o totales de la deuda, con recibo numerado, anticipos y anulación (web)
- ✅ Un solo método de pago por operación
- ✅ Actualización automática del saldo
- ❌ Mapa de clientes pendientes
- ❌ Firma y recibo de cobranza
- ❌ Control de canastillos recogidos
- ❌ Rendición del dinero; app del cobrador (offline)

### 6.7 Canastillos — pendiente completo
- ❌ Control por cantidad y responsable (central, sucursal, cliente, chofer); entregados, devueltos y pendientes; bajas con motivo; sanciones; trazabilidad

### 6.8 Finanzas operativas
- ❌ Dinero inicial, ingresos y egresos, compras como egresos, ventas y cobranzas como ingresos
- ❌ Rendiciones, control físico y digital, esperado vs. recibido, diferencias, cierre de caja, historial
- ✅ Rentabilidad usando el costo real por lote

### 6.9 Dashboard y reportes
- ✅ Dashboard general; ventas, stock y cuentas por cobrar
- ❌ Dinero (caja), entregas y rutas activas, sucursales y vehículos, canastillos pendientes, diferencias de caja y problemas de entrega
- ✅ Lotes próximos a vencer y alertas de bajo stock
- ✅ Reportes de ventas, inventario, merma, rentabilidad (por producto, lote, cliente y vendedor) y cobranza (antigüedad)
- 🟡 Compras y clientes: listados, sin reporte dedicado
- ❌ Reportes de logística, sucursales y canastillos
- 🟡 Filtros: rangos de fecha predefinidos y **rango libre** (hasta un año) en tablero, reportes y auditoría, y algunos filtros por producto/almacén; faltan filtros por sucursal, categoría, usuario, vehículo y cliente en todos los reportes
- ✅ Gráficos históricos

### 7. Reglas de negocio
- ✅ 7.1 Lotes, merma y costos: todas (incluye forzar lote con autorización, usuario, fecha y motivo)
- ✅ 7.2 Precios: por lote, central vs. sucursal (por API), permiso de modificación, precio original y final auditados. 🟡 La pantalla de precios solo edita el precio central
- 🟡 7.3 Clientes: rangos, descuentos, límites, aprobación de cambio de rango, excepciones, tipos de cliente y cobros sí; sugerencia automática de ascenso no
- ❌ 7.4 Entregas y rutas
- ❌ 7.5 Canastillos
- ✅ 7.6 Anulaciones (sin borrado, con usuario, fecha y motivo) y devoluciones autorizadas

### 8–10. Roles, seguridad y offline
- ✅ Administrador, Vendedor Central y Preventista operativos
- ✅ Vendedor Sucursal (recibe transferencias y vende); 🟡 Contador (reportes sí, caja no)
- ❌ Chofer y Cobrador (roles creados, sin app ni funciones)
- ✅ Permisos por acción y autorización de supervisor con credenciales
- ✅ Pantallas para administrar usuarios, roles y permisos
- ✅ Auditoría de todo lo crítico, con visor y filtros
- ✅ Offline de preventas; ❌ offline de entregas y cobranzas
- ✅ Conflictos: quedan en REVIEW con su motivo, el teléfono los muestra y Administración los resuelve en la web

### 11. Recibos e impresión — pendiente completo
- ❌ Impresoras térmicas de 80 mm; recibos de venta, entrega y cobranza; firma incorporada; almacenamiento, consulta y reimpresión

## Base de datos (documento de diseño)

Implementadas 40 tablas de las ~60 del documento: seguridad y auditoría, organización (sin vehículos), productos y precios por lote, compras/recepción/lotes, inventario (movimientos, saldos, transferencias y ajustes), clientes y direcciones, ventas con asignación por lote y devoluciones, preventas y visitas, pagos y movimientos de deuda, dispositivos, sincronización y GPS.

Pendientes: `vehicles`, `product_ranges`, `lot_shrinkages` (la merma está en el lote y la recepción), `customer_rank_history` (hoy en auditoría), `receivable_accounts` (integrada en `customers`), `sale_payments` (integrada en `payments`), rutas, despachos, entregas, firmas, recibos, canastillos, caja, rendiciones y cierres.

## Plan para completar el MVP

| Fase | Contenido | Estimación* |
|---|---|---|
| G. Brechas del núcleo ✅ | **Cobros de deuda** (web), pantallas de usuarios/roles, categorías y tipos de cliente, visor de auditoría, revisión de conflictos de sincronización, modificar preventa, direcciones adicionales y visitas en la app, rango de fechas libre | 1–1,5 semanas |
| H. Inventario operativo ✅ | Transferencias central–sucursal (con peso recibido), ajustes con motivo, bajas y pérdidas, devoluciones autorizadas | 1–1,5 semanas |
| I. Logística + app del chofer | Vehículos, rutas manuales (bloqueadas al iniciar), hoja de despacho, entregas offline con diferencias y problemas, firma digital, seguimiento GPS | 2,5–3 semanas |
| J. Cobranza + app del cobrador + canastillos | Cobros offline, mapa de pendientes, recibo y firma, canastillos por cantidad y responsable, bajas y sanciones | 2–2,5 semanas |
| K. Finanzas operativas | Cuentas de caja, movimientos automáticos (ventas, cobros, compras), egresos, rendiciones, cierres con diferencias | 1,5 semanas |
| L. Recibos e impresión | Recibos PDF de venta, entrega y cobranza; impresión térmica 80 mm (web y Bluetooth desde la app); reimpresión | 1 semana |
| M. Cierre | Reportes y dashboard faltantes, filtros completos, pruebas, puesta en producción y capacitación | 1–1,5 semanas |

\*Una persona a tiempo completo con apoyo de IA. **Total estimado: 10–13 semanas** para el MVP completo.

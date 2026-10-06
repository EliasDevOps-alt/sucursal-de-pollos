# Cobertura del alcance del MVP

Revisión punto por punto del *Documento de Delimitación v1.0* y del *Documento de Diseño de Base de Datos v1.0* contra lo construido (octubre 2026).

Leyenda: ✅ hecho · 🟡 parcial · ❌ no hecho

## Resumen

| Módulo (delimitación §6) | Estado | Comentario |
|---|---|---|
| 6.1 Compras y abastecimiento | 🟡 7 de 8 | Falta registrar el pago de la compra como egreso de caja |
| 6.2 Inventario y almacenes | 🟡 6 de 10 | Faltan transferencias, ajustes manuales y bajas/pérdidas |
| 6.3 Ventas | 🟡 6 de 11 | Faltan recibos, devoluciones, anticipos, venta por canastillo e impresión térmica |
| 6.4 Preventas | 🟡 6 de 8 | Faltan modificar pedidos, direcciones adicionales en la app y registro de visitas |
| 6.5 Logística y distribución | ❌ 0 de 12 | Módulo completo pendiente (incluye la app del chofer) |
| 6.6 Cobranza y crédito | 🟡 4 de 10 | Falta **registrar cobros de deuda**, la app del cobrador, mapa, recibos y rendición |
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
- 🟡 Productos y categorías editables: productos sí; categorías solo por API, sin pantalla
- 🟡 Stock por almacén y sucursal: el modelo lo soporta, pero la sucursal no recibe stock porque no hay transferencias
- ✅ Stock por lote
- ❌ Transferencias central–sucursales
- ❌ Ajustes manuales con motivo obligatorio (existe el permiso, no la función)
- ❌ Bajas y pérdidas (hoy un lote vencido no se puede dar de baja)
- ✅ Productos próximos a vencer
- ✅ Prioridad de salida por vencimiento (FEFO)
- 🟡 Trazabilidad recepción → venta completa; faltan transferencia y baja

### 6.3 Ventas
- ✅ Ventas en almacén central
- 🟡 Ventas en sucursales: la lógica y los permisos existen; no hay stock en sucursal sin transferencias
- ✅ Clientes registrados y ventas rápidas
- 🟡 Venta por kilogramo y despiece (como productos) sí; por canastillo no
- ❌ Recibos/notas de venta (documento imprimible)
- ✅ Descuentos automáticos por rango
- ✅ Ventas a crédito cuando están habilitadas
- 🟡 Pagos completos y parciales al vender sí; anticipos no
- ❌ Devoluciones autorizadas (existe la anulación, que es distinta)
- ❌ Impresión térmica de 80 mm

### 6.4 Preventas (app del preventista)
- ✅ Registro móvil de pedidos
- ✅ Registro de clientes con GPS
- 🟡 Direcciones adicionales: la API las admite; la app solo registra la principal
- ✅ Catálogo y precios
- 🟡 Cancelación antes de atender sí; modificación del pedido no
- ✅ Consulta de preventas propias
- ✅ Trabajo offline y sincronización idempotente
- 🟡 Trayectoria GPS: se registran posiciones por evento y cada ~10 min, pero no hay registro de visitas ni mapa de trayectoria en la web

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
- ❌ **Cobros parciales o totales de la deuda** (hoy la deuda solo sube con ventas a crédito y baja con anulaciones)
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
- 🟡 Filtros: rangos de fecha predefinidos y algunos filtros por producto/almacén; faltan rango libre y filtros por sucursal, categoría, usuario, vehículo y cliente en todos los reportes
- ✅ Gráficos históricos

### 7. Reglas de negocio
- ✅ 7.1 Lotes, merma y costos: todas (incluye forzar lote con autorización, usuario, fecha y motivo)
- ✅ 7.2 Precios: por lote, central vs. sucursal (por API), permiso de modificación, precio original y final auditados. 🟡 La pantalla de precios solo edita el precio central
- 🟡 7.3 Clientes: rangos, descuentos, límites, aprobación de cambio de rango y excepciones sí; tipos de cliente sin pantalla para agregarlos; sugerencia automática de ascenso no; **los pagos no reducen la deuda porque no hay cobros**
- ❌ 7.4 Entregas y rutas
- ❌ 7.5 Canastillos
- 🟡 7.6 Anulaciones sí (sin borrado, con usuario, fecha y motivo); devoluciones no

### 8–10. Roles, seguridad y offline
- ✅ Administrador, Vendedor Central y Preventista operativos
- 🟡 Vendedor Sucursal (sin stock en sucursal) y Contador (reportes sí, caja no)
- ❌ Chofer y Cobrador (roles creados, sin app ni funciones)
- ✅ Permisos por acción y autorización de supervisor con credenciales
- ❌ Pantalla para administrar usuarios, roles y permisos (los usuarios existen por API; roles y permisos solo por el seed)
- 🟡 Auditoría: se registra todo lo crítico implementado, pero no hay pantalla para consultar la bitácora
- ✅ Offline de preventas; ❌ offline de entregas y cobranzas
- 🟡 Conflictos: quedan en estado REVIEW con su motivo y el teléfono los muestra; falta una pantalla web de revisión administrativa

### 11. Recibos e impresión — pendiente completo
- ❌ Impresoras térmicas de 80 mm; recibos de venta, entrega y cobranza; firma incorporada; almacenamiento, consulta y reimpresión

## Base de datos (documento de diseño)

Implementadas 32 tablas de las ~60 del documento: seguridad y auditoría, organización (sin vehículos), productos y precios por lote, compras/recepción/lotes, inventario (movimientos y saldos), clientes y direcciones, ventas con asignación por lote, preventas, pagos y movimientos de deuda, dispositivos, sincronización y GPS.

Pendientes: `vehicles`, `product_ranges`, `lot_shrinkages` (la merma está en el lote y la recepción), `inventory_adjustments`, `transfers`, `customer_rank_history` (hoy en auditoría), `receivable_accounts` (integrada en `customers`), `sale_payments` (integrada en `payments`), rutas, despachos, entregas, firmas, recibos, canastillos, caja, rendiciones, cierres y devoluciones.

## Plan para completar el MVP

| Fase | Contenido | Estimación* |
|---|---|---|
| G. Brechas del núcleo | **Cobros de deuda** (web), pantallas de usuarios/roles, categorías y tipos de cliente, visor de auditoría, revisión de conflictos de sincronización, modificar preventa, direcciones adicionales y visitas en la app, rango de fechas libre | 1–1,5 semanas |
| H. Inventario operativo | Transferencias central–sucursal (con peso recibido), ajustes con motivo, bajas y pérdidas, devoluciones autorizadas | 1–1,5 semanas |
| I. Logística + app del chofer | Vehículos, rutas manuales (bloqueadas al iniciar), hoja de despacho, entregas offline con diferencias y problemas, firma digital, seguimiento GPS | 2,5–3 semanas |
| J. Cobranza + app del cobrador + canastillos | Cobros offline, mapa de pendientes, recibo y firma, canastillos por cantidad y responsable, bajas y sanciones | 2–2,5 semanas |
| K. Finanzas operativas | Cuentas de caja, movimientos automáticos (ventas, cobros, compras), egresos, rendiciones, cierres con diferencias | 1,5 semanas |
| L. Recibos e impresión | Recibos PDF de venta, entrega y cobranza; impresión térmica 80 mm (web y Bluetooth desde la app); reimpresión | 1 semana |
| M. Cierre | Reportes y dashboard faltantes, filtros completos, pruebas, puesta en producción y capacitación | 1–1,5 semanas |

\*Una persona a tiempo completo con apoyo de IA. **Total estimado: 10–13 semanas** para el MVP completo.

# Cobertura del alcance del MVP

Revisión punto por punto del *Documento de Delimitación v1.0* y del *Documento de Diseño de Base de Datos v1.0* contra lo construido (octubre 2026).

Leyenda: ✅ hecho · 🟡 parcial · ❌ no hecho

## Resumen

| Módulo (delimitación §6) | Estado | Comentario |
|---|---|---|
| 6.1 Compras y abastecimiento | ✅ 8 de 8 | El pago de la compra es egreso de caja o banco; a crédito del proveedor queda por pagar |
| 6.2 Inventario y almacenes | ✅ 10 de 10 | Transferencias con peso recibido, ajustes por conteo, bajas y kardex completo |
| 6.3 Ventas | 🟡 10 de 11 | Nota de venta imprimible (térmica 80/58 mm o PDF); falta la venta por canastillo |
| 6.4 Preventas | ✅ 8 de 8 | Incluye edición de pedidos, direcciones adicionales, visitas y mapa de recorrido |
| 6.5 Logística y distribución | ✅ 12 de 12 | Vehículos, rutas, hoja de carga, entregas offline con firma y GPS, comprobante impreso por Bluetooth y reimpresión |
| 6.6 Cobranza y crédito | ✅ 10 de 10 | Cobros en oficina y en la calle (app del cobrador offline), mapa, recibo con firma, canastillos y rendición |
| 6.7 Canastillos | ✅ 7 de 7 | Saldos por tenedor, entregas y recojos en rutas y cobros, faltantes a cargo, bajas con sanción y trazabilidad |
| 6.8 Finanzas operativas | ✅ 11 de 11 | Cajas y banco, ingresos y egresos automáticos y manuales, apertura y cierre con arqueo, rendiciones con diferencias |
| 6.9 Dashboard y reportes | 🟡 | Hechos los de ventas, stock, merma, rentabilidad y cuentas por cobrar; faltan dinero, logística, canastillos y sucursales |
| §8 Apps móviles | ✅ 3 de 3 | Preventista, chofer y cobrador en una sola app por rol, offline, con impresión Bluetooth |
| §11 Recibos e impresión | ✅ | Venta, entrega, cobro, rendición y cierre de caja; térmica 80/58 mm desde la web y por Bluetooth desde la app; firma en el papel; historial y reimpresión con copias numeradas |

**Estimación de avance del MVP: ~90 %.** Están todos los módulos operativos (compras, inventario, ventas, preventa, logística, cobranza, canastillos, finanzas e impresión). Falta la fase de cierre: dashboard y reportes de dinero, logística, canastillos y sucursales, filtros completos, puesta en producción y capacitación.

## Detalle

### 6.1 Compras y abastecimiento
- ✅ Gestión de proveedores
- ✅ Compras con múltiples productos
- ✅ Recepción real del producto
- ✅ Lotes y costos por lote
- ✅ Merma: diferencia entre peso comprado y recibido, con tara de canastillos
- ✅ Vencimiento por lote
- ✅ Producto disponible para venta al recibir
- ✅ Pago de compras como egreso: al contado sale de la caja o del banco al registrarla; a crédito del proveedor queda por pagar hasta que se paga

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
- ✅ Nota de venta imprimible (con forma de pago, saldo del cliente y marca de ANULADA si corresponde)
- ✅ Descuentos automáticos por rango
- ✅ Ventas a crédito cuando están habilitadas
- ✅ Pagos completos y parciales al vender; anticipos (saldo a favor) desde Cobranza
- ✅ Devoluciones autorizadas (permiso o credenciales de supervisor), parciales o totales: lo sano reingresa al mismo lote, lo descartado es pérdida; se descuenta de la deuda o se devuelve en efectivo; reportes netos de devoluciones
- ✅ Impresión térmica de 80 mm (o 58 mm) desde el navegador, o PDF con «Guardar como PDF»

### 6.4 Preventas (app del preventista)
- ✅ Registro móvil de pedidos
- ✅ Registro de clientes con GPS
- ✅ Direcciones adicionales desde la app
- ✅ Catálogo y precios
- ✅ Cancelación y modificación del pedido antes de atenderlo
- ✅ Consulta de preventas propias
- ✅ Trabajo offline y sincronización idempotente
- ✅ Trayectoria GPS: posiciones por evento y cada ~10 min, visitas con resultado (con pedido, sin pedido, cerrado, responsable ausente) y página web **Recorrido** con mapa (OpenStreetMap), trayectoria, pedidos, visitas y línea de tiempo por preventista y día

### 6.5 Logística y distribución
- ✅ Vehículos propios y subcontratados, con capacidad en kg y canastillos (cada uno con su almacén móvil)
- ✅ Asignación manual de pedidos, vehículo y chofer; orden de visita; control de capacidad; la ruta queda fija al despachar
- ✅ Hoja de carga/despacho imprimible; la carga se transfiere al vehículo y el sobrante vuelve pesado al liquidar
- ✅ Seguimiento GPS del chofer (cada ~3 min con la ruta en curso) y mapa de la ruta con paradas por estado
- ✅ Entregas con peso real y motivo obligatorio de cada diferencia; no entregas con motivo (cerrado, rechazo, sin dinero…); el pedido no entregado vuelve a pendiente
- ✅ Firma digital y comprobante de entrega: el chofer lo imprime por Bluetooth en el momento (aun sin señal) y se reimprime desde la web o la app
- ✅ App del chofer offline: misma app con modo de entregas según el rol, cola idempotente, navegación y llamada al cliente

### 6.6 Cobranza y crédito
- ✅ Deuda acumulada por cliente (con historial de movimientos)
- ✅ Límites de crédito por rango
- ✅ Bloqueo al superar el límite, salvo excepción autorizada
- ✅ Cobros parciales o totales de la deuda, con recibo numerado, anticipos y anulación (web)
- ✅ Un solo método de pago por operación
- ✅ Actualización automática del saldo
- ✅ Mapa de clientes pendientes (deuda por antigüedad y canastillos por recoger) en la web; en la app, lista por monto o por días con navegación
- ✅ Firma y recibo de cobranza: número de recibo del servidor, quién pagó, firma, lugar y hora del teléfono; impreso por Bluetooth en la calle
- ✅ Control de canastillos recogidos por el cobrador y el chofer
- ✅ App del cobrador offline y rendición del dinero en caja

### 6.7 Canastillos
- ✅ Control por cantidad y por tenedor: almacén central, sucursal, vehículo, cliente y responsable (chofer o cobrador)
- ✅ Entregados con el pedido, devueltos vacíos y pendientes por cliente; al liquidar la ruta, el faltante queda a cargo del chofer
- ✅ Bajas con motivo y sanción opcional al cliente (se suma a su deuda); trazabilidad de cada movimiento con quién lo registró

### 6.8 Finanzas operativas
- ✅ Cuentas de dinero: caja central, caja de cada sucursal y banco (QR y transferencias), con saldo igual a la suma de sus movimientos
- ✅ Dinero inicial (aportes), ingresos y egresos: ventas y cobros en mostrador como ingresos, compras y devoluciones como egresos, gastos por tipo (combustible, sueldos, alquiler…), traspasos (depósito al banco)
- ✅ Apertura y cierre de caja con arqueo por billetes y monedas; esperado vs. contado; la diferencia queda registrada con su motivo
- ✅ Rendiciones de choferes y cobradores: efectivo esperado vs. contado (control físico) y QR/transferencias confirmados en el banco (control digital); historial
- ✅ Rentabilidad usando el costo real por lote

### 6.9 Dashboard y reportes
- ✅ Dashboard general; ventas, stock y cuentas por cobrar
- 🟡 Rutas activas, entregas y problemas de entrega en Logística (no en el tablero); dinero, por rendir y diferencias de caja en Finanzas; canastillos pendientes en su propia página (falta unificarlos en el tablero, fase M)
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
- ✅ 7.4 Entregas y rutas: ruta fija al despachar, diferencias y problemas con motivo obligatorio, firma, cobro registrado por el chofer, excesos de crédito marcados para revisión
- ✅ 7.5 Canastillos: por cantidad y responsable, bajas con motivo, sanciones
- ✅ 7.6 Anulaciones (sin borrado, con usuario, fecha y motivo) y devoluciones autorizadas

### 8–10. Roles, seguridad y offline
- ✅ Administrador, Vendedor Central y Preventista operativos
- ✅ Vendedor Sucursal (recibe transferencias y vende); ✅ Contador (reportes y finanzas en consulta)
- ✅ Chofer (app de entregas) y Cobrador (app de cobranza)
- ✅ Permisos por acción y autorización de supervisor con credenciales
- ✅ Pantallas para administrar usuarios, roles y permisos
- ✅ Auditoría de todo lo crítico, con visor y filtros
- ✅ Offline de preventas, entregas y cobranzas
- ✅ Conflictos: quedan en REVIEW con su motivo, el teléfono los muestra y Administración los resuelve en la web

### 11. Recibos e impresión
- ✅ Comprobantes de venta, entrega (o constancia de visita fallida), cobro, rendición y cierre de caja, con el encabezado del negocio (nombre, NIT, dirección, teléfono y pie, editables en Catálogos)
- ✅ Impresoras térmicas de 80 y 58 mm: desde la web (ticket con `@page` al ancho del papel, o PDF) y desde la app por Bluetooth (ESC/POS, tildes en CP850)
- ✅ Firma del cliente impresa en el papel (imagen de trama recortada al trazo)
- ✅ Sin señal la app arma el comprobante con lo del teléfono (marcado provisorio) y lo imprime; sincronizado, lo pide al servidor
- ✅ Cada impresión queda registrada (original y copias numeradas, quién, cuándo y por dónde); historial en «Comprobantes» con reimpresión

## Base de datos (documento de diseño)

Implementadas 52 tablas de las ~60 del documento: seguridad y auditoría, organización con vehículos, productos y precios por lote, compras/recepción/lotes, inventario (movimientos, saldos, transferencias y ajustes), clientes y direcciones, ventas con asignación por lote y devoluciones, preventas y visitas, pagos y movimientos de deuda, rutas de entrega con paradas y productos entregados, canastillos (saldos y movimientos), cuentas de dinero, sesiones de caja, movimientos y rendiciones, impresiones de comprobantes, configuración del negocio, dispositivos, sincronización y GPS.

Pendientes: `product_ranges`, `lot_shrinkages` (la merma está en el lote y la recepción), `customer_rank_history` (hoy en auditoría), `receivable_accounts` (integrada en `customers`), `sale_payments` (integrada en `payments`). Los recibos no se guardan como archivo: se arman de los datos y se registra cada impresión (`receipt_prints`).

## Plan para completar el MVP

| Fase | Contenido | Estimación* |
|---|---|---|
| G. Brechas del núcleo ✅ | **Cobros de deuda** (web), pantallas de usuarios/roles, categorías y tipos de cliente, visor de auditoría, revisión de conflictos de sincronización, modificar preventa, direcciones adicionales y visitas en la app, rango de fechas libre | 1–1,5 semanas |
| H. Inventario operativo ✅ | Transferencias central–sucursal (con peso recibido), ajustes con motivo, bajas y pérdidas, devoluciones autorizadas | 1–1,5 semanas |
| I. Logística + app del chofer ✅ | Vehículos, rutas manuales (bloqueadas al iniciar), hoja de despacho, entregas offline con diferencias y problemas, firma digital, seguimiento GPS | 2,5–3 semanas |
| J. Cobranza + app del cobrador + canastillos ✅ | Cobros offline, mapa de pendientes, recibo y firma, canastillos por cantidad y responsable, bajas y sanciones | 2–2,5 semanas |
| K. Finanzas operativas ✅ | Cuentas de caja, movimientos automáticos (ventas, cobros, compras), egresos, rendiciones, cierres con diferencias | 1,5 semanas |
| L. Recibos e impresión ✅ | Recibos PDF de venta, entrega y cobranza; impresión térmica 80 mm (web y Bluetooth desde la app); reimpresión | 1 semana |
| M. Cierre | Reportes y dashboard faltantes, filtros completos, pruebas, puesta en producción y capacitación | 1–1,5 semanas |

\*Una persona a tiempo completo con apoyo de IA. **Total estimado: 10–13 semanas** para el MVP completo.

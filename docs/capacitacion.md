# Plan de capacitación y puesta en marcha

Cómo pasar del sistema instalado a operar con él. El detalle de cada tarea está en el [manual de uso por rol](manual-usuario.md); la instalación, en [despliegue.md](despliegue.md).

## Calendario sugerido (dos semanas)

| Día | Qué | Quiénes | Duración |
|---|---|---|---|
| 1 | Instalación en el servidor, datos del negocio, usuarios, productos, proveedores y clientes principales | Administrador + soporte | 3–4 h |
| 2 | Sesión 1: recorrido general y conceptos | Todos | 1 h |
| 2 | Sesión 2: compras, recepción, lotes e inventario | Administrador, vendedores | 1,5 h |
| 3 | Sesión 3: ventas, caja y comprobantes | Vendedores, administrador | 1,5 h |
| 3 | Sesión 4: app de preventa | Preventistas | 1 h |
| 4 | Sesión 5: logística y app del chofer | Administrador, choferes | 1,5 h |
| 4 | Sesión 6: cobranza, app del cobrador y rendiciones | Cobradores, administrador, vendedores | 1 h |
| 5 | Sesión 7: reportes, finanzas y auditoría | Administrador, contador | 1 h |
| 6–10 | **Operación en paralelo**: se registra todo en el sistema y se sigue con el método actual para comparar | Todos | Jornada normal |
| 11 | Revisión: diferencias encontradas, ajustes de permisos, precios y límites | Administrador + soporte | 2 h |
| 12 | **Arranque**: el sistema pasa a ser el registro oficial | Todos | — |

Cada sesión se da en el sistema real (con datos de prueba si todavía no se arrancó) y termina con un ejercicio que cada persona hace sola.

## Contenido de cada sesión

**1. Recorrido general.** Para qué sirve el sistema, panel y app, un usuario por persona, nada se borra (se anula con motivo), lotes y FEFO (se vende primero lo que vence antes), costo real del lote, trabajo sin señal y sincronización.
*Ejercicio:* ingresar, cambiar la contraseña propia, encontrar un cliente y un lote.

**2. Compras e inventario.** Nueva compra, recepción con peso real y merma, lotes y vencimientos, precios por lote, transferencias a la sucursal (envío y recepción con peso), ajustes por conteo y bajas con motivo, kardex.
*Ejercicio:* registrar una compra de dos productos, recibirla con 2 % de merma y transferir parte a la sucursal.

**3. Ventas y caja.** Abrir caja, venta con cliente y venta rápida, descuentos por rango, crédito y su límite, pagos parciales, nota de venta (térmica o PDF) y reimpresión, devoluciones con autorización, cobro en mostrador, gastos, cierre de caja con arqueo por billetes.
*Ejercicio:* abrir caja, tres ventas (contado, QR, crédito), una devolución, un gasto y cerrar caja con una diferencia de 1 Bs.

**4. Preventa (app).** Instalar y sincronizar, cartera de clientes, alta de cliente con ubicación, pedido con y sin señal (modo avión), editar y cancelar, visitas sin pedido, estado de la cola.
*Ejercicio:* tres pedidos, uno en modo avión, y comprobar que llegan al panel al volver la señal.

**5. Logística y chofer.** Armar la ruta con los pedidos, ordenar las paradas, hoja de carga, despachar; en la app: ruta del día, entrega con peso real y diferencias, canastillos, cobro, firma e impresión del comprobante por Bluetooth; no entregado con motivo; liquidación de la ruta (sobrantes y canastillos).
*Ejercicio:* una ruta de tres paradas: una completa, una con diferencia de peso y una no entregada; liquidarla.

**6. Cobranza y rendiciones.** Cartera por cobrar y antigüedad, mapa de pendientes, cobro con firma e impresión del recibo, recojo de canastillos, rendición en caja con diferencia y motivo.
*Ejercicio:* dos cobros (efectivo y QR) y la rendición de ambos.

**7. Reportes y control.** Tablero (la operación de hoy y las ventas del período con filtros), rentabilidad con costo real, sucursales, logística, compras, clientes, canastillos, merma, cuentas por cobrar, finanzas, comprobantes impresos y auditoría.
*Ejercicio:* responder con el sistema: ¿qué producto deja más margen este mes?, ¿qué proveedor tiene más merma?, ¿qué clientes dejaron de comprar?, ¿cuánto falta rendir hoy?

## Lista de verificación para el arranque

- [ ] Servidor con HTTPS, respaldo diario funcionando y copiado fuera del servidor; una restauración probada.
- [ ] Contraseña del `admin` cambiada; un usuario por persona, con el rol correcto; sin usuarios de prueba.
- [ ] Datos del negocio (NIT, dirección, teléfono) revisados en un comprobante impreso.
- [ ] Productos con vida útil y stock mínimo; proveedores; clientes con rango, límite de crédito y ubicación.
- [ ] Stock inicial cargado como compra recibida (un lote por producto con su costo y vencimiento reales).
- [ ] Deudas iniciales de clientes cargadas (**Clientes → ficha → Ajustar deuda → Saldo inicial**) y canastillos en poder de cada cliente (**Canastillos → Alta** y **Traspaso** al cliente).
- [ ] Dinero inicial de cada caja y saldo del banco registrados como aporte.
- [ ] App instalada en cada teléfono con la URL del servidor; impresoras vinculadas y página de prueba impresa.
- [ ] Una semana de operación en paralelo sin diferencias sin explicar.

## Después del arranque

- Primera semana: revisar a diario **Sincronización móvil** y las diferencias de caja y de rendición.
- Primer mes: revisar con el contador los reportes de merma y rentabilidad, y ajustar precios, rangos y límites de crédito.
- Usuarios nuevos: darles esta guía, crearles su usuario y acompañarlos en su primera jornada.

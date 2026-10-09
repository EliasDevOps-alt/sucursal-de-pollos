# Manual de uso por rol

Guía corta para el personal: qué hace cada uno en el sistema, día a día. Cada persona entra con **su propio usuario** (nunca compartido): todo lo que registra queda a su nombre en la auditoría.

- **Panel web** (computadora): administración, vendedores, contador.
- **App Android** (teléfono): preventista, chofer y cobrador. Funciona sin señal: lo registrado queda en el teléfono y se envía solo al recuperar conexión.

Reglas que valen para todos:

- **No se borra nada.** Lo que está mal se **anula** con un motivo (ventas, cobros, compras, movimientos de caja) y queda el registro.
- Los montos se escriben con coma decimal: `1.234,50`. Los pesos, en kilos con decimales: `12,350 kg`.
- Si algo no deja continuar, el mensaje dice por qué (sin stock, límite de crédito, falta motivo…). Léalo antes de llamar al administrador.

---

## 1. Administrador

**Primer día** (una sola vez): ver la lista «Antes de empezar a operar» en [despliegue.md](despliegue.md).

**Todos los días**

1. **Inicio**: la operación de hoy (reparto, efectivo en cajas, lo que falta rendir, canastillos con clientes) y las ventas del período con sus alertas (lotes por vencer, stock bajo, clientes con deuda).
2. **Compras → Nueva compra**: proveedor, productos, kilos y precio; después, **Recepción con peso real**: el peso que llegó. La diferencia es merma y el sistema calcula el costo real de cada lote.
3. **Logística**: armar las rutas del día con los pedidos de los preventistas (**Nueva ruta**), imprimir la **Hoja de carga**, **Despachar** (la ruta queda fija y la mercadería pasa al vehículo) y, al volver el chofer, **Liquidar ruta** (sobrantes y canastillos).
4. **Finanzas → Rendiciones**: recibir lo que cobraron choferes y cobradores (**Recibir rendición**). Si falta dinero, se registra la diferencia con el motivo.
5. **Sincronización móvil** (Administración): operaciones de los teléfonos que el servidor no pudo aplicar (por ejemplo, un cobro a un cliente que ya no existe). Resolverlas el mismo día.

**Cuando haga falta**

- **Usuarios**: alta, cambio de rol o contraseña y desactivación del personal que se va (no se borra: su historia queda).
- **Roles y permisos**: qué puede hacer cada rol. Cambiarlos con cuidado.
- **Clientes → ficha → Rango y crédito**: rango (descuento) y límite de crédito. Las ventas que superan el límite piden la autorización de un supervisor.
- **Clientes → ficha → Ajustar deuda**: el **saldo inicial** de lo que cada cliente ya debía al empezar, o una corrección con motivo (no mueve dinero).
- **Productos**: precio por lote (central y sucursal), vida útil y stock mínimo.
- **Catálogos**: categorías de producto, tipos de cliente y **Datos del negocio** (encabezado de los comprobantes).
- **Auditoría**: quién hizo qué y cuándo, con los datos antes y después.

## 2. Vendedor central y vendedor de sucursal

1. Al empezar el turno: **Finanzas → Abrir caja** y contar el efectivo. Si no coincide con lo que dice el sistema, se registra la diferencia con su motivo.
2. **Ventas → Nueva venta**: cliente (o venta rápida sin cliente), productos y kilos. El sistema toma los lotes más próximos a vencer (FEFO) y aplica el descuento del rango del cliente. Elegir la forma de pago: efectivo, QR, transferencia o a crédito (si el cliente lo tiene habilitado).
3. **Nota de venta**: en el detalle de la venta, **Nota de venta** abre el ticket para la impresora térmica (80 o 58 mm) o para guardarlo en PDF. Reimprimir sale como «COPIA».
4. **Devolución** (en el detalle de la venta): con la autorización de un supervisor. Lo que está en buen estado vuelve al mismo lote; lo dañado se descarta como pérdida.
5. **Cobranza → Registrar cobro**: cuando un cliente viene a pagar su deuda. Se entrega el recibo impreso.
6. Sucursal: **Inventario → Transferencias**: recibir lo que manda la central pesando lo que llegó.
7. Gastos del día (combustible, bolsas, hielo): **Finanzas → Gasto**, con el tipo y la descripción.
8. Al cerrar: **Finanzas → Cerrar caja** con el conteo por billetes y monedas. Imprimir el cierre si se entrega a administración.

## 3. Preventista (app)

1. Al iniciar el día, con señal: abrir la app para que se sincronice (clientes, productos con precio y stock del día).
2. **Clientes**: buscar al cliente, ver su deuda y su crédito disponible. Clientes nuevos: alta en el momento, con la ubicación del local.
3. **Nuevo pedido**: productos, kilos (o unidades) y fecha de entrega. Si no hay señal, el pedido queda «Sin enviar» y se envía solo después.
4. Si el cliente no pidió nada, registrar la **visita** con el motivo (sin pedido, cerrado…).
5. Pedidos aún no despachados se pueden **editar** o **cancelar** desde el detalle.
6. **Estado y cuenta**: ver qué falta enviar. Si algo fue rechazado, el motivo aparece ahí.

## 4. Chofer (app)

1. Antes de salir: la ruta del día aparece al sincronizar (después de que administración la despachó). Revisar la hoja de carga contra lo que se sube al vehículo.
2. En cada parada: **Entregar**. Poner el peso real de cada producto (si difiere, elegir el motivo), los canastillos que deja y los vacíos que recoge, lo cobrado (todo, parcial o crédito) y la **firma** de quien recibe.
3. Al guardar aparece el **comprobante de entrega**: **Imprimir** en la impresora Bluetooth y dejárselo al cliente. Sin señal también imprime (sale como provisorio; el número de venta llega al sincronizar).
4. Si no se pudo entregar: **No se pudo entregar** y el motivo (cerrado, rechazó, no tenía dinero…). El pedido vuelve a pendiente.
5. Al volver: sincronizar, devolver sobrantes y canastillos, y **rendir el dinero** en caja (lo cobrado en efectivo se cuenta; los QR y transferencias ya están en el banco).

## 5. Cobrador (app)

1. **Por cobrar**: clientes con deuda, cuánto deben y desde hace cuántos días. En cada cliente, **Navegar** abre el mapa del teléfono hasta su local (en el panel, **Cobranza → Mapa de pendientes** muestra todos).
2. **Cobrar**: monto, forma de pago (con el número de transacción si es QR o transferencia), canastillos que devuelve, quién paga y su **firma**.
3. Al guardar aparece el **recibo**: **Imprimir** por Bluetooth y entregárselo al cliente.
4. Si el cliente solo devuelve canastillos vacíos, se registra igual (sin monto).
5. **Mis cobros**: lo cobrado en los últimos días; tocar uno para reimprimir el recibo.
6. Al terminar: rendir el dinero en caja y entregar los canastillos recogidos.

**Impresora** (chofer y cobrador): la primera vez, vincularla en el Bluetooth del teléfono (PIN habitual 0000 o 1234) y elegirla en **Estado y cuenta → Impresora**, con el ancho del papel. **Imprimir página de prueba** confirma que funciona.

## 6. Contador

Solo consulta (no registra operaciones).

- **Reportes**: rentabilidad con el costo real de cada lote (por producto, lote, cliente o vendedor, con filtros por sucursal, categoría, vendedor y cliente), sucursales, logística, compras, clientes, canastillos, merma y cuentas por cobrar. Cada gráfico tiene su **Tabla** para copiar los números.
- **Finanzas**: cajas, banco, movimientos, aperturas y cierres, rendiciones y diferencias.
- **Comprobantes**: todo lo impreso, con original y copias.
- **Auditoría**: cambios críticos con usuario, fecha y datos.

## 7. Preguntas frecuentes

| Situación | Qué hacer |
|---|---|
| La app dice «Sin enviar» hace rato | Revisar la señal; en **Estado y cuenta → Sincronizar ahora**. Nada se pierde mientras no se desinstale la app. |
| Un cobro o entrega fue «Rechazado» | El motivo está en **Estado y cuenta**. Corregir y registrar de nuevo, o avisar al administrador (lo ve en Sincronización móvil). |
| La venta no deja seguir por el crédito | El cliente superó su límite: cobrar al contado o pedir la autorización de un supervisor. |
| «Demasiados intentos fallidos» | La cuenta se bloquea 15 minutos tras 5 contraseñas erróneas. Esperar o pedir al administrador que cambie la contraseña. |
| La impresora no imprime | Encendida, con papel y cerca; Bluetooth del teléfono activado; **Imprimir página de prueba**. Si sigue, **Olvidar esta impresora** y elegirla de nuevo. |
| Se registró algo mal | No se borra: **Anular** con el motivo y registrarlo de nuevo. |

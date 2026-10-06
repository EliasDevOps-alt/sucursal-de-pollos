# Guion de la demo para el cliente

Duración sugerida: **30 minutos** de demo + 15 de preguntas. La idea fuerza: *el sistema sabe de qué lote salió cada kilo, cuánto costó realmente y quién autorizó cada excepción, incluso cuando el preventista no tiene señal.*

## Preparación (el día anterior)

- [ ] Datos frescos que terminan "hoy": `cd backend && npm run demo:data -- --reset` (unos 2 minutos).
- [ ] Backend (`npm run start:dev`) y panel (`npm run dev -- --host`) encendidos. Ver [despliegue.md](despliegue.md), opción A o C.
- [ ] Teléfono Android con el APK instalado, en la misma Wi-Fi, con el servidor configurado e ingresado como `preventista` / `Demo123!`. Hacer **una preventa de prueba** para confirmar que sincroniza.
- [ ] Dos ventanas del navegador: una normal con `admin` / `Admin123!` y una de incógnito con `vcentral` / `Demo123!`.
- [ ] Proyector o pantalla compartida probados; tener a mano el teléfono para mostrarlo a cámara o pasarlo.
- [ ] Plan B sin internet: la opción A funciona en una red local sin salida a internet (un router propio o el punto de acceso del teléfono).

## 1. El problema y el dashboard (3 min) — `admin`

**Decir:** "Hoy el control de lotes, merma, deuda y dinero está repartido entre cuadernos, WhatsApp y memoria. Este es el mismo negocio con 30 días de operación cargados."

1. **Inicio**: señalar ventas del mes, margen bruto, deuda por cobrar y stock valorizado a costo real.
2. **Ventas por día**: cada barra es costo de los lotes + margen. "El margen no es un estimado: sale del costo real de cada lote vendido."
3. **Alertas**: lotes vencidos o por vencer y productos bajo el stock mínimo. "Esto le dice qué empujar hoy y qué pedir mañana."

## 2. Compra, recepción y merma (6 min) — `admin`

**Decir:** "El proveedor factura un peso; la balanza dice otro. Esa diferencia hoy se pierde de vista."

1. **Compras → Nueva compra**: proveedor *Granja San Pedro*, *Pollo entero granja*, **100 kg a Bs 12,80** → Registrar compra (total Bs 1.280).
2. En el detalle, la **recepción**: peso bruto **104 kg**, tara **7,2 kg** (4 canastillos), vencimiento sugerido.
   - La vista previa muestra: neto **96,8 kg**, merma **3,2 kg (3,2 %)**.
   - Elegir **"Al costo"**: costo real **Bs 13,2231/kg** (1.280 ÷ 96,8). Con "Pérdida", el costo queda en 12,80 y la merma se registra como pérdida.
   - "Esta decisión es de Administración y queda registrada."
3. Confirmar → se crea el **lote** con su costo real y un precio sugerido (costo + 20 %).
4. Abrir el lote: **kardex** con el ingreso y el **historial de precios**. Opcional: cambiar el precio por margen.

## 3. Venta con FEFO y varios lotes (7 min)

**Decir:** "Al vender, el sistema elige solo el lote que vence primero. Si el vendedor quiere otro, necesita autorización."

1. Con `admin`: **Ventas → Nueva venta**, cliente *Pollería Doña Juana* (rango Oro, 4 % de descuento), *Pollo entero granja*, una cantidad mayor que el lote más antiguo (por ejemplo **150 kg**).
2. En **Detalle calculado**: la venta se reparte entre dos o más lotes, cada uno con su vencimiento y precio. Descuento por rango, total y **margen real** de esa venta.
3. Pago **Crédito** → muestra el crédito disponible del cliente. Confirmar.
4. En el detalle de la venta: lotes consumidos con su costo, margen por producto. "Si esta venta se anula, el stock vuelve exactamente a esos lotes."
5. **Excepción con autorización** — ventana de incógnito con `vcentral`:
   - Nueva venta, un producto con varios lotes, botón **FEFO → elegir a mano** el lote más nuevo.
   - Aparece **"Requiere autorización"**: el vendedor no tiene permiso. Pedir motivo y credenciales del supervisor (`admin`).
   - En el detalle queda la insignia **"Fuera de FEFO · Administrador General"** con el motivo.
   - "Lo mismo pasa si el vendedor baja el precio o si el cliente supera su límite de crédito."

## 4. Preventa sin señal (6 min) — teléfono

**Decir:** "El preventista trabaja en mercados donde no hay señal. El pedido no se pierde ni se duplica."

1. En el teléfono, activar **modo avión**. La franja superior dice **"Sin conexión"**.
2. **Nuevo pedido**: elegir cliente (muestra rango y crédito disponible), agregar producto (precio de referencia y stock), kilos → **Guardar pedido**. Queda como **"Sin enviar"**.
3. Opcional: **Clientes → Nuevo cliente** con ubicación GPS, sin señal, y tomarle un pedido.
4. Desactivar el modo avión → en segundos pasa a **"Enviado"** con su número (P-…).
5. En el panel (`admin`): **Preventas** — el pedido aparece solo (se actualiza cada 15 s), con el ícono de "tomado sin conexión", la hora del teléfono y la ubicación en el mapa.
6. **Atender pedido** → se abre la venta con cliente y productos cargados; los lotes salen por FEFO. Confirmar. En el teléfono, al sincronizar, el pedido figura **"Atendido · V-…"**.

**Si preguntan por duplicados:** "Cada operación del teléfono tiene un identificador único. Si la señal se corta justo cuando el servidor respondía y el teléfono reenvía, el servidor reconoce la operación y no la vuelve a registrar." (Esto está cubierto por pruebas automáticas.)

## 5. Reportes y trazabilidad (5 min) — `admin`

1. **Reportes → Rentabilidad**: por producto, **por lote** (qué compra dejó más margen), por cliente y por vendedor. Botón **Tabla** para ver cifras exactas.
2. **Merma**: por proveedor. "¿Qué granja entrega con más diferencia de peso?"
3. **Cuentas por cobrar**: antigüedad de la deuda y uso del límite de cada cliente.
4. **Trazabilidad completa**: Inventario → Kardex → un lote → su compra y proveedor; desde el lote, las ventas que lo consumieron.

## 6. Cierre (3 min)

**Decir:** "Lo que vieron es el núcleo: lotes, costo real, ventas, crédito y preventa offline. El documento de alcance tiene más módulos; esto es lo que sigue."

Próximas fases del MVP (no incluidas en la demo):

| Fase | Contenido |
|---|---|
| Logística | Rutas, hoja de despacho, entregas con firma digital, diferencias de entrega |
| Cobranza y caja | Cobros en ruta, rendición del chofer/cobrador, cierre de caja, ingresos y egresos |
| Canastillos | Control por cantidad y responsable, bajas y sanciones |
| Operación | Transferencias central–sucursal, devoluciones, bajas de inventario, impresión térmica de 80 mm |

Infraestructura propuesta: **servidor en la nube** (~5–12 USD/mes) con HTTPS y respaldos diarios. Ver [despliegue.md](despliegue.md).

## Preguntas probables

| Pregunta | Respuesta |
|---|---|
| ¿Qué pasa si se corta internet en la oficina? | Con servidor en la nube, sucursales y teléfonos siguen operando; la oficina vuelve a conectarse cuando regresa el servicio. Los teléfonos trabajan sin señal y envían después. |
| ¿Dónde quedan mis datos? ¿Y si se daña el servidor? | En un servidor contratado a su nombre, con respaldo diario copiado fuera del servidor. Puede descargar copias propias. |
| ¿Funciona en iPhone? | La app es para Android, como se acordó. Flutter permite compilar para iPhone más adelante si hace falta. |
| ¿Se puede imprimir el recibo? | La impresión térmica de 80 mm está en el alcance del MVP y se implementa en la fase de operación. |
| ¿Un vendedor puede cambiar el precio? | Solo si su rol tiene el permiso y la sucursal lo habilita; si no, necesita la clave de un supervisor. Siempre queda el precio original, el final, quién y por qué. |
| ¿Y si el preventista se equivoca? | Puede cancelar el pedido mientras no fue atendido. Si ya se atendió, el sistema rechaza la cancelación y lo avisa en el teléfono. |
| ¿Cuánto cuesta / cuánto tarda el resto? | Llevarlo preparado según su propuesta comercial; la demo cubre aproximadamente la mitad del alcance funcional del MVP. |

## Si algo falla en vivo

- **El teléfono no sincroniza:** revisar que esté en la misma red, la dirección del servidor y el firewall (puertos 3000/5173). Mostrar la cola en **Estado y cuenta**: "los pedidos están a salvo en el teléfono".
- **No alcanza el stock para la venta grande:** bajar los kilos; la vista previa avisa cuánto hay disponible.
- **Datos raros después de ensayar:** `npm run demo:data -- --reset` deja todo como nuevo en ~2 minutos.

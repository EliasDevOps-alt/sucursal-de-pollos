# JAMIL — ERP de Pollos

Sistema integral para gestión de ventas, logística, cobranza e inventario de pollo. Panel web (Mantine + React) + app móvil (Flutter).

## Estado del Proyecto

**Versión:** 0.5.1 (app) | web latest
**Última actualización:** 2026-10-12
**Commit:** 518f21a "Tema claro y con color en el panel web y la app"

### Fases Completadas

- ✅ **Fase A-E:** Usuarios, productos, catálogos, cajas y cierres.
- ✅ **Fase F-I:** Ventas, compras, logística, entregas, cobros.
- ✅ **Fase J-M:** FEFO, anulationes, reportes, tema y UI.
- ✅ **Fase N (parcial):** Venta por canastillo, precios por sucursal, sugerencia de ascenso de rango, tema claro y colorido.

### Features Activos

- **Ventas:** por kg, por canastillo (con peso real), despiece.
- **Precios:** central y por sucursal (en pantalla del lote: fijar, cambiar, quitar).
- **Clientes:** rangos con descuento y límite de crédito, sugerencia automática de ascenso.
- **Inventario:** FEFO, movimientos de canastillos, alertas de vencimiento.
- **Logística:** rutas, entregas con crates, devolución de canastillos vacíos.
- **Reportes:** rentabilidad, sucursales, logística, compras, clientes, canastillos, merma, deudas.
- **UI:** tema claro forzado, naranja + ámbar, blanco, gris muy claro; módulos con color distintivo en menú.
- **Impresión:** térmica (80/58 mm) y Bluetooth desde app; nota de venta, entrega, recibo, cierre.

## Stack

**Backend:** NestJS, Prisma, PostgreSQL.
**Web:** React 19, Mantine, TypeScript.
**Móvil:** Flutter (Dart), sin señal con Hive + Isar.
**Pruebas:** E2E Playwright (fase-m.mjs), golden tests Flutter.
**Deploy:** Docker, env vars (API_URL, LOGIN_MAX_FAILURES, etc).

## Base de Datos

**Usuarios:** usuario, contraseña hasheada, rol, sucursal, activo.
**Productos:** nombre, categoría, vida útil, stock mínimo, kg_per_crate.
**Lotes:** producto, sucursal, costo, precio central, precio_por_sucursal.
**Ventas/Preventas:** cliente, artículos con crates y peso, forma de pago.
**Clientes:** nombre, deuda, crédito disponible, rango, teléfono, ubicación.
**Rutas/Entregas:** paradas con peso real, canastillos, motivos, firma.
**Canastillos:** saldo por cliente, movimientos (DELIVERY/RETURN).
**Auditoría:** usuario, fecha, tabla, operación, antes/después.

## Archivos Clave

**Web:**
- `src/theme.css` — colores, encabezado, tableros.
- `src/main.tsx` — modo claro forzado, defaults Mantine.
- `src/components/AppLayout.tsx` — menú con color por módulo.
- `src/pages/sales/SaleNewPage.tsx` — venta por canastillo.
- `src/pages/lots/LotDetailPage.tsx` — precios por sucursal.
- `src/pages/customers/RankSuggestions.tsx` — sugerencia de ascenso.

**App:**
- `lib/theme.dart` — tema claro, naranja, Material 3.
- `lib/screens/login_screen.dart` — degradado naranja en fondo.
- `lib/screens/presale_form_screen.dart` — crates y peso.
- `lib/screens/driver/delivery_form_screen.dart` — canastillos en entrega.
- `lib/printing/receipt_doc.dart` — formato canastillos en recibos.
- `test/screens_golden_test.dart` — 19 capturas de prueba.

**Backend:**
- `src/sales/sales.service.ts` — crates, movimientos de canastillos.
- `src/customers/customers.service.ts` — rankSuggestions, updateRank.
- `src/lots/lots.service.ts` — precios por sucursal.
- `src/auth/login-attempts.ts` — freno de intentos, desactivable.
- `src/reports/` — rentabilidad, sucursales, logística, clientes, canastillos.

**Docs:**
- `docs/despliegue.md` — instrucciones Docker, variables de entorno.
- `docs/manual-usuario.md` — roles, flujos, operaciones día a día.
- `docs/decisiones-tecnicas.md` — arquitectura, decisiones de diseño.
- `docs/guion-demo.md` — demostración en 4 escenas.

## Datos de Prueba

**Usuarios (todos contraseña `password`):**
- `admin` — administrador.
- `preventista` — preventista.
- `chofer` — chofer.
- `cobrador` — cobrador.

**Productos:**
- Pollo entero: 22 kg/canastillo.
- Muslo, pechuga, ala: por kilo.
- Vísceras: por kilo.

## Deploy Local

```bash
docker-compose up -d
npm run dev        # web, en http://localhost:5173
npm run dev        # backend, en http://localhost:3000/api
flutter run        # app, en emulador o device
```

**APK:** `dist/PreventaPollos.apk` — versión 0.5.1, apunta a la IP local.

## Próximos Pasos (Opcional)

- Testing en impresora térmica real por Bluetooth.
- Testing en device real.
- Docker full local build + push a registry.

## Notas

- **Auditoría completa:** todo cambio queda registrado con usuario, fecha, datos antes/después.
- **Sin eliminaciones:** todo se anula con motivo; el historial permanece.
- **Determinismo en tests:** AppState inyecta reloj; golden tests fijos a 2026-10-06.
- **Freno de login desactivable:** LOGIN_MAX_FAILURES=0 en .env local.
- **Sincronización:** app sin señal registra localmente, envía al reconectar.

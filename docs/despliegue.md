# Despliegue

Tres formas de poner el sistema en marcha, de la más rápida a la definitiva (la C es la de producción).

| Opción | Cuándo usarla | Costo | HTTPS |
|---|---|---|---|
| A. PC local + teléfono en la misma Wi-Fi | Presentación en la oficina del cliente con la propia laptop | 0 | No (HTTP en red local) |
| B. Túnel temporal (Cloudflare Tunnel) | Que el cliente pruebe desde su casa unos días, sin contratar servidor | 0 | Sí |
| C. Servidor en la nube (VPS) con Docker | Piloto real o producción | ~5–12 USD/mes + dominio | Sí, automático |

---

## A. PC local + teléfono en la misma Wi-Fi

1. Backend: `cd backend && npm run start:dev` (API en el puerto 3000).
2. Panel: `cd web && npm run dev -- --host` (el `--host` lo expone a la red local en el puerto 5173).
3. IP de la PC: `ipconfig` → "Dirección IPv4" (ej. `192.168.1.25`).
4. Firewall de Windows: permitir los puertos 3000 y 5173 en redes privadas (la primera vez Windows lo pregunta).
5. Panel desde cualquier equipo de la red: `http://192.168.1.25:5173`.
6. App móvil: en **Servidor**, `http://192.168.1.25:3000/api`.

Para tener datos de demostración frescos el día de la presentación:

```bash
cd backend
npm run demo:data -- --reset     # BORRA las operaciones y genera 30 días nuevos que terminan hoy
```

## B. Túnel temporal con Cloudflare (sin servidor)

Publica la demo que corre en la PC con una URL HTTPS pública temporal.

1. Instalar `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Tener corriendo el backend (`npm run start:dev`) y el panel (`npm run dev`), como en la opción A.
3. `cloudflared tunnel --url http://localhost:5173` → muestra una URL `https://xxxx.trycloudflare.com`.
4. Panel: esa URL. App móvil: `https://xxxx.trycloudflare.com/api` (Vite reenvía `/api` al backend; `vite.config.ts` ya admite los dominios `*.trycloudflare.com`).

La URL cambia cada vez que se reinicia el túnel y la PC debe quedar encendida. Sirve para pruebas cortas, no para operar.

## C. Servidor en la nube con Docker (producción)

### 1. Contratar el servidor

Un VPS con **2 GB de RAM** y Ubuntu 24.04 alcanza para el MVP (por ejemplo, Hetzner CX22, DigitalOcean Basic o Contabo VPS S). Verifique precios vigentes; rondan 5–12 USD/mes. Un dominio cuesta ~10–15 USD/año.

En el DNS del dominio, crear un registro **A** (ej. `erp.midominio.com`) con la IP del servidor.

### 2. Preparar el servidor

```bash
ssh root@IP-DEL-SERVIDOR
curl -fsSL https://get.docker.com | sh
git clone <URL-del-repositorio> erp && cd erp
cp .env.production.example .env
nano .env
```

En `.env` complete, como mínimo:

| Variable | Qué poner |
|---|---|
| `DOMAIN`, `PUBLIC_URL` | El dominio (`erp.midominio.com`) y su URL con `https://` |
| `DB_PASSWORD`, `JWT_SECRET` | Claves largas y distintas: `openssl rand -base64 48` |
| `ADMIN_PASSWORD` | Contraseña inicial del usuario `admin` (mínimo 10 caracteres) |
| `SEED_BRANCH_NAME` | Nombre de la sucursal además de la Central (ej. `Sucursal Abasto`) |
| `BACKUP_HOUR`, `BACKUP_KEEP_DAYS` | Hora del respaldo diario y días que se conservan (por defecto 02:00 y 14) |

### 3. Levantar

```bash
docker compose up -d --build
docker compose exec backend npx prisma db seed      # solo la primera vez
docker compose ps                                    # los cuatro servicios en "running"; backend "healthy"
```

El seed de producción crea roles y permisos, la Central y una sucursal con su almacén y su caja, la cuenta bancaria, el catálogo base de productos y categorías, los tipos y rangos de cliente, y **un solo usuario: `admin`** con la contraseña de `ADMIN_PASSWORD`. No crea usuarios, proveedores ni datos de demostración.

- Panel: `https://erp.midominio.com` (Caddy obtiene el certificado HTTPS solo, en el primer acceso).
- App móvil: `https://erp.midominio.com/api`.
- La documentación de la API (`/api/docs`) está apagada en producción; se activa con `ENABLE_API_DOCS=true`.

### 4. Antes de empezar a operar

1. Ingresar con `admin`, cambiar su contraseña (**Administración → Usuarios**) y anotarla en un lugar seguro.
2. **Catálogos → Datos del negocio**: nombre, NIT, dirección, teléfono y pie de los comprobantes.
3. Crear el personal en **Usuarios**: un usuario por persona (nunca compartidos), con su rol y, si es de sucursal, su sucursal.
4. Revisar **Productos** (vida útil, stock mínimo) y cargar **Proveedores** y **Clientes** (rango, límite de crédito, dirección con ubicación). Lo que cada cliente ya debía se carga en su ficha con **Ajustar deuda → Saldo inicial**.
5. **Finanzas**: registrar el dinero inicial de cada caja (otro ingreso: aporte) y abrir las cajas.
6. **Canastillos**: alta de los canastillos que tiene el negocio (y los que ya están en manos de clientes).
7. Compilar e instalar la app en los teléfonos con la URL del servidor (punto 7) y probar un pedido, una entrega y un cobro de punta a punta.
8. Verificar que exista el primer respaldo en `./backups` y probar restaurarlo una vez (punto 6).

### 5. Actualizar a una nueva versión

```bash
cd erp && git pull
docker compose up -d --build      # las migraciones de base de datos se aplican solas al arrancar el backend
```

Conviene actualizar fuera del horario de trabajo y con los teléfonos sincronizados: lo que esté en la cola de un teléfono se envía igual después (las operaciones no se duplican), pero así nadie ve errores durante el reinicio.

### 6. Respaldos

El servicio `backup` hace un respaldo de la base al arrancar y luego **todos los días a la hora `BACKUP_HOUR`**, en la carpeta `./backups` del servidor (`erp_pollos_AAAAMMDD_HHMM.dump`), y borra los de más de `BACKUP_KEEP_DAYS` días. Para ver que funciona: `docker compose logs backup`.

**Copie los respaldos fuera del servidor** (otro proveedor, almacenamiento de objetos o una PC de la oficina): un respaldo en el mismo equipo no protege si se pierde el equipo. Por ejemplo, desde una PC con acceso SSH: `scp root@IP:/root/erp/backups/*.dump D:/respaldos-erp/`.

Restaurar un respaldo (reemplaza todos los datos actuales):

```bash
docker compose stop backend web
docker compose exec -T db pg_restore -U erp -d erp_pollos --clean --if-exists < backups/erp_pollos_AAAAMMDD_HHMM.dump
docker compose start backend web
```

### 7. App móvil para producción

- Compilar con la URL del servidor: `flutter build apk --release --split-per-abi --dart-define=API_URL=https://erp.midominio.com/api` (la mayoría de los teléfonos usa `app-arm64-v8a-release.apk`).
- Quitar `android:usesCleartextTraffic="true"` del `AndroidManifest.xml`: con HTTPS ya no hace falta.
- Firmar el APK con una clave propia antes de distribuirlo (o publicarlo en Google Play) y guardar esa clave: sin ella no se pueden instalar actualizaciones encima.
- Impresoras térmicas: vincularlas en el Bluetooth de cada teléfono y elegirlas en la app (**Estado y cuenta → Impresora**); imprimir una página de prueba.

### 8. Seguridad incluida

- Contraseñas guardadas con bcrypt; sesiones con token firmado (12 h en el panel, 7 días en la app para trabajar sin señal).
- Tras 5 intentos fallidos la cuenta se bloquea 15 minutos (también al autorizar con credenciales de supervisor); tras 20 fallos desde una misma IP, esa IP. Los intentos fallidos quedan en la auditoría.
- Permisos por rol en cada operación de la API (no solo en las pantallas) y auditoría de lo crítico.
- HTTPS automático, cabeceras de seguridad en el panel y registros de los contenedores con rotación.

## Notas

- La configuración Docker (`docker-compose.yml`) se valida con `docker compose config`.
- Zona horaria: los reportes agrupan por día en `America/La_Paz` (`REPORT_TZ`).

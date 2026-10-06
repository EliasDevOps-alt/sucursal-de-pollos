# Despliegue

Tres formas de poner la demo en marcha, de la más rápida a la definitiva.

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

## C. Servidor en la nube con Docker (recomendado para el piloto)

### 1. Contratar el servidor

Un VPS con **2 GB de RAM** y Ubuntu 24.04 alcanza para el MVP (por ejemplo, Hetzner CX22, DigitalOcean Basic o Contabo VPS S). Verifique precios vigentes; rondan 5–12 USD/mes. Un dominio cuesta ~10–15 USD/año.

En el DNS del dominio, crear un registro **A** (ej. `erp.midominio.com`) con la IP del servidor.

### 2. Preparar el servidor

```bash
ssh root@IP-DEL-SERVIDOR
curl -fsSL https://get.docker.com | sh
git clone <URL-del-repositorio> erp && cd erp
cp .env.production.example .env
nano .env        # DOMAIN, PUBLIC_URL, DB_PASSWORD y JWT_SECRET (claves largas: openssl rand -base64 48)
```

### 3. Levantar

```bash
docker compose up -d --build
docker compose exec backend npx prisma db seed      # solo la primera vez: roles, permisos, usuarios y catálogos
```

- Panel: `https://erp.midominio.com` (Caddy obtiene el certificado HTTPS solo, en el primer acceso).
- App móvil: `https://erp.midominio.com/api`.
- Documentación de la API: `https://erp.midominio.com/api/docs`.

**Cambiar las contraseñas de los usuarios de demo antes de entregar el sistema** (todas usan `Admin123!` / `Demo123!`).

### 4. Actualizar a una nueva versión

```bash
cd erp && git pull
docker compose up -d --build      # las migraciones de base de datos se aplican solas al arrancar el backend
```

### 5. Respaldos

Respaldo diario a las 02:00 con 14 días de retención (`crontab -e`):

```cron
0 2 * * * cd /root/erp && docker compose exec -T db pg_dump -U erp -Fc erp_pollos > /root/respaldos/erp_$(date +\%F).dump && find /root/respaldos -name 'erp_*.dump' -mtime +14 -delete
```

Restaurar: `docker compose exec -T db pg_restore -U erp -d erp_pollos --clean < archivo.dump`.

Copie los respaldos fuera del servidor (otro proveedor o almacenamiento de objetos): un respaldo en el mismo equipo no protege si se pierde el equipo.

### 6. App móvil para producción

- Compilar en modo release: `flutter build apk --release --split-per-abi` (genera APK de ~20 MB por arquitectura).
- Quitar `android:usesCleartextTraffic="true"` del `AndroidManifest.xml`: con HTTPS ya no hace falta.
- Firmar el APK con una clave propia antes de distribuirlo (o publicarlo en Google Play).

## Notas

- La configuración Docker (`docker-compose.yml`) se validó con `docker compose config`; la construcción de imágenes no se probó en la PC de desarrollo porque Docker Desktop no estaba en ejecución.
- Zona horaria: los reportes agrupan por día en `America/La_Paz` (`REPORT_TZ`).

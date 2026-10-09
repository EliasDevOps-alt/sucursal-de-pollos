# ERP Distribuidora de Pollo

ERP para compra, distribución y comercialización de pollo faenado: compras con merma y costo real por lote, inventario FEFO, ventas, preventa, reparto y cobranza con apps Android sin señal, canastillos, caja y banco, comprobantes impresos y reportes.

## Estructura

| Carpeta | Contenido | Tecnología |
|---|---|---|
| `backend/` | API central y reglas de negocio | NestJS + Prisma + PostgreSQL |
| `web/` | Panel administrativo | React + Vite + Mantine |
| `mobile/` | App Android sin señal: preventista, chofer y cobrador (impresión Bluetooth) | Flutter + SQLite ([ver README](mobile/README.md)) |
| `docs/` | Despliegue, manual de uso, capacitación, decisiones técnicas y alcance | — |
| `ops/` | Script de respaldo diario (servicio `backup` de docker-compose) | sh + pg_dump |

## Requisitos

- Node.js 22+
- PostgreSQL 17
- Flutter 3.35+ (solo para `mobile/`)

## Arranque del backend

```bash
cd backend
cp .env.example .env        # completar DATABASE_URL y JWT_SECRET
npm install
npx prisma migrate dev      # crea las tablas
npm run seed                # datos iniciales (roles, permisos, admin, catálogos)
npm run start:dev           # API en http://localhost:3000, docs en /api/docs
```

## Arranque del panel web

```bash
cd web
npm install
npm run dev                 # http://localhost:5173 (reenvía /api al backend)
```

Usuarios de desarrollo: `admin` / `Admin123!`; `vcentral`, `vsucursal`, `preventista`, `contador`, `chofer`, `cobrador` con `Demo123!`. En producción el seed crea solo `admin`, con la contraseña de `ADMIN_PASSWORD` (ver [docs/despliegue.md](docs/despliegue.md)).

## Datos de demostración

```bash
cd backend
npm run demo:data -- --reset    # BORRA las operaciones y genera 30 días de operación que terminan hoy
```

Requiere la API en marcha. Conserva usuarios, productos, proveedores y almacenes.

## Despliegue

`docker compose up -d --build` levanta base de datos, API, panel con HTTPS automático y respaldo diario. Guía completa (PC local, túnel temporal o servidor en la nube), lista de verificación para empezar a operar y restauración de respaldos: [docs/despliegue.md](docs/despliegue.md).

## Documentación

- [docs/manual-usuario.md](docs/manual-usuario.md) — manual de uso por rol
- [docs/capacitacion.md](docs/capacitacion.md) — plan de capacitación y puesta en marcha
- [docs/guion-demo.md](docs/guion-demo.md) — guion de la presentación al cliente
- [docs/despliegue.md](docs/despliegue.md) — despliegue y respaldos
- [docs/decisiones-tecnicas.md](docs/decisiones-tecnicas.md) — decisiones de diseño y desviaciones del documento de base de datos
- [docs/plan-demo.md](docs/plan-demo.md) — fases de la demo
- [docs/cobertura-alcance.md](docs/cobertura-alcance.md) — qué cubre la demo frente al alcance del MVP y qué falta
- [mobile/README.md](mobile/README.md) — app de preventa

# ERP Distribuidora de Pollo — Demo

Prototipo funcional del ERP para compra, distribución y comercialización de pollo faenado.

## Estructura

| Carpeta | Contenido | Tecnología |
|---|---|---|
| `backend/` | API central y reglas de negocio | NestJS + Prisma + PostgreSQL |
| `web/` | Panel administrativo | React + Vite + Mantine |
| `mobile/` | App Android de preventa offline | Flutter + SQLite ([ver README](mobile/README.md)) |
| `docs/` | Decisiones técnicas y alcance de la demo | — |

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

Usuarios de demo: `admin` / `Admin123!`; `vcentral`, `vsucursal`, `preventista`, `contador` con `Demo123!`.

Ver [docs/decisiones-tecnicas.md](docs/decisiones-tecnicas.md) y [docs/plan-demo.md](docs/plan-demo.md).

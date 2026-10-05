# ERP Distribuidora de Pollo — Demo

Prototipo funcional del ERP para compra, distribución y comercialización de pollo faenado.

## Estructura

| Carpeta | Contenido | Tecnología |
|---|---|---|
| `backend/` | API central y reglas de negocio | NestJS + Prisma + PostgreSQL |
| `web/` | Panel administrativo | React + Vite (fase B en adelante) |
| `mobile/` | App Android para preventistas | Flutter (fase E) |
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

Usuario inicial: `admin` / `Admin123!` (cambiar en producción).

Ver [docs/decisiones-tecnicas.md](docs/decisiones-tecnicas.md) y [docs/plan-demo.md](docs/plan-demo.md).

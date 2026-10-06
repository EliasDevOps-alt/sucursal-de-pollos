# API NestJS + Prisma. Imagen Debian (Prisma usa su motor para debian-openssl-3.0.x sin configuración extra).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Se conservan las dependencias de desarrollo para poder ejecutar el seed (ts-node) dentro del contenedor.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/auth/permissions.ts ./src/auth/permissions.ts
COPY package*.json tsconfig.json ./
EXPOSE 3000
# Aplica migraciones pendientes y arranca la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]

# Panel web: se compila con Vite y lo sirve Caddy, que además reenvía /api al backend
# y obtiene el certificado HTTPS automáticamente cuando DOMAIN es un dominio real.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443

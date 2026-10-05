# Plan de la demo

## Stack

NestJS (API) · PostgreSQL · Prisma (ORM y migraciones) · React + Vite (panel web) · Flutter (app Android). Despliegue en la nube (VPS).

## Flujos que la demo debe mostrar funcionando

1. Login con roles (Administrador, Vendedor, Preventista) y permisos por acción.
2. Compra con varios productos → recepción con peso real, tara de canastillo y merma → creación de lotes con costo real.
3. Inventario por lote: kardex, vencimientos, alerta de lotes próximos a vencer.
4. Venta que consume varios lotes con prioridad FEFO (vence primero, sale primero); forzar un lote exige autorización y motivo.
5. Rentabilidad por venta usando el costo real de cada lote consumido.
6. App Android: el preventista registra un pedido sin internet y se sincroniza sin duplicarse.
7. Dashboard: ventas, stock, lotes por vencer.

Fuera de la demo (fases siguientes): rutas, entregas con firma, GPS, cobranza, caja, canastillos, impresión térmica, devoluciones.

## Fases

| Fase | Entregable | Estado |
|---|---|---|
| A | Monorepo, esquema de BD, migraciones, seed, login, roles y permisos | Completada |
| B | Proveedores, productos, compra, recepción, merma, lotes | Pendiente |
| C | Kardex, stock por lote, venta FEFO multi-lote | Pendiente |
| D | Reportes y dashboard | Pendiente |
| E | App Flutter: preventa offline + sincronización | Pendiente |
| F | Datos realistas, despliegue y guion de demo | Pendiente |

-- MIGRACIÓN: MovimientosInventario.referencia_tipo acepta 'COTIZACION'
-- Fecha: 2026-05-04
-- Motivo: El consumo de almacén hacia un servicio se imputaba a la tabla
--         legacy `Servicios` (con 0 rows en producción tras el cierre del
--         Camino A). Migramos a `Cotizaciones` (APROBADA / TRABAJO_EN_RIESGO).
--         Para esto el kárdex polimórfico necesita aceptar el nuevo tipo.
--
-- Postgres (Supabase): aplicar vía MCP. Idempotente.

ALTER TABLE movimientosinventario
  DROP CONSTRAINT IF EXISTS movimientosinventario_referencia_tipo_check;

ALTER TABLE movimientosinventario
  ADD CONSTRAINT movimientosinventario_referencia_tipo_check
  CHECK (referencia_tipo IN ('SERVICIO', 'COMPRA', 'GASTO', 'PRESTAMO', 'ORDEN_COMPRA', 'COTIZACION'));

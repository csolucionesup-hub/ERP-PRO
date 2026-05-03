-- MIGRACIÓN: Permitir referencia_tipo='ORDEN_COMPRA' en MovimientosInventario
-- Fecha: 2026-05-02
-- Motivo: Cierre Fase C — al recibir una OC ALMACEN se registra ENTRADA en
--         kárdex con referencia al id_oc (la Compra todavía no existe; recién
--         se crea al facturar). El check constraint original solo permitía
--         SERVICIO/COMPRA/GASTO/PRESTAMO y rechazaba ORDEN_COMPRA.
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-02. Idempotente: si la
-- constraint ya existe con el valor extendido, este script no la duplica
-- (DROP IF EXISTS + ADD).
--
-- MySQL: ENUM no aplica acá (la tabla usa CHECK en Postgres). Si se vuelve a
-- bootstrear sobre MySQL, el campo es texto libre — no hace falta alter.

ALTER TABLE MovimientosInventario
  DROP CONSTRAINT IF EXISTS movimientosinventario_referencia_tipo_check;

ALTER TABLE MovimientosInventario
  ADD CONSTRAINT movimientosinventario_referencia_tipo_check
  CHECK (referencia_tipo IN ('SERVICIO', 'COMPRA', 'GASTO', 'PRESTAMO', 'ORDEN_COMPRA'));

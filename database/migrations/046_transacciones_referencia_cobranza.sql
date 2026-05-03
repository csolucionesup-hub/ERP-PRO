-- MIGRACIÓN: Permitir referencia_tipo='COBRANZA' en Transacciones
-- Fecha: 2026-05-02
-- Motivo: Bug detectado durante testing — el Dashboard Gerencial mira la
--         tabla Transacciones para calcular saldos e ingresos del día,
--         pero registrarCobranza() solo creaba CobranzasCotizacion +
--         MovimientoBancario, sin Transaccion. Resultado: caja siempre 0
--         en el Dashboard aunque hubiera cobranzas registradas.
--
-- Fix: registrarCobranza() ahora también inserta en Transacciones con
--      referencia_tipo='COBRANZA' y tipo_movimiento='INGRESO'. Esta migración
--      extiende el CHECK constraint para permitir el nuevo valor.
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-02. Idempotente.
-- MySQL: la columna es texto libre — sin alter necesario en bootstrap.

ALTER TABLE Transacciones
  DROP CONSTRAINT IF EXISTS transacciones_referencia_tipo_check;

ALTER TABLE Transacciones
  ADD CONSTRAINT transacciones_referencia_tipo_check
  CHECK (referencia_tipo IN ('SERVICIO', 'COMPRA', 'GASTO', 'PRESTAMO', 'COBRANZA'));

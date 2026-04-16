-- ============================================================
-- Migración 017: Libro Bancos
--   - Extiende MovimientoBancario con campos del EECC bancario
--   - Permite auto-registro desde cobros/gastos/pagos IGV
--   - Soporta importación de estado de cuenta (detectar duplicados)
-- ============================================================

ALTER TABLE MovimientoBancario
  ADD COLUMN fecha_proceso         DATE          NULL       AFTER fecha,
  ADD COLUMN nro_operacion         VARCHAR(50)   NULL       AFTER fecha_proceso,
  ADD COLUMN canal                 VARCHAR(30)   NULL       AFTER nro_operacion,
  ADD COLUMN tipo_movimiento_banco VARCHAR(60)   NULL       AFTER canal,
  ADD COLUMN saldo_contable        DECIMAL(14,2) NULL       AFTER tipo,
  ADD COLUMN fuente                ENUM('MANUAL','AUTO','IMPORT_EECC') NOT NULL DEFAULT 'MANUAL' AFTER saldo_contable;

-- Permitir PAGO_IMPUESTO como ref_tipo
ALTER TABLE MovimientoBancario
  MODIFY COLUMN ref_tipo ENUM('COBRANZA','COMPRA','GASTO','GASTO_BANCARIO','PAGO_IMPUESTO','TRASPASO','PRESTAMO','OTRO') NULL;

-- Índice para detectar duplicados al reimportar EECC
CREATE INDEX idx_mov_unico ON MovimientoBancario (id_cuenta, nro_operacion, fecha, monto);

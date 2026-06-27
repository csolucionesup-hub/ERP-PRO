-- Migración 078: agregar 'TRANSFERENCIA_INTERNA' al ENUM de MovimientoBancario.ref_tipo
--
-- Motivo: la conciliación "🔄 Vincular con Transferencia Interna"
-- (CobranzasService.conciliarComoTransferenciaInterna, feature de la mig 072)
-- escribe `ref_tipo = 'TRANSFERENCIA_INTERNA'` en MovimientoBancario, pero ese
-- valor nunca se agregó al ENUM/CHECK de la columna. En producción (Supabase
-- Postgres) la columna tiene el constraint:
--   movimientobancario_ref_tipo_check CHECK (ref_tipo IN
--     ('COBRANZA','COMPRA','GASTO','GASTO_BANCARIO','PAGO_IMPUESTO','TRASPASO','PRESTAMO','OTRO'))
-- por lo que el UPDATE de la conciliación reventaba con error de BD y la
-- transferencia interna nunca quedaba vinculada al movimiento del extracto.
--
-- Fix aditivo y reversible: extiende la lista permitida con 'TRANSFERENCIA_INTERNA'.
-- El adapter MySQL→Postgres traduce este MODIFY COLUMN ENUM a un DROP+ADD del
-- CHECK constraint (mismo patrón que la mig 017).

ALTER TABLE MovimientoBancario
  MODIFY COLUMN ref_tipo ENUM(
    'COBRANZA','COMPRA','GASTO','GASTO_BANCARIO','PAGO_IMPUESTO',
    'TRASPASO','PRESTAMO','TRANSFERENCIA_INTERNA','OTRO'
  ) NULL;

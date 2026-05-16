-- Migración 073: flag es_gasto_operativo en OrdenesCompra.
-- Fecha: 2026-05-15. Motivo: Julio reportó que hay OCs de SERVICIO cuyos
-- ítems son combustible, taxi, viáticos, reembolsos de campo, etc — gastos
-- consumidos directamente en obra que NO entran al almacén ni tiene sentido
-- "recibirlos" porque ya se consumieron al pagarse.
--
-- Hoy quedan atascados en estado RECEPCION sin nada que recibir. Patrón
-- idéntico a es_honorario (que ya hace skip de recepción para honorarios
-- persona natural).
--
-- Comportamiento al tildar el flag:
--   - _requiereRecepcion() devuelve false → skip estado RECEPCION.
--   - Al pagar la OC se crea CostosServicio tipo_costo='GASTO_OC' con
--     id_cotizacion del proyecto (igual que recibir() lo hace hoy).
--   - El gasto aparece en Producción como "Pagado real" del proyecto.
--
-- Solo aplica a tipo_oc='SERVICIO' (las que tienen id_cotizacion). Las
-- GENERAL ya no requieren recepción de todos modos.
--
-- Aditiva. Default FALSE → todas las OCs históricas siguen funcionando igual.

ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS es_gasto_operativo BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_oc_es_gasto_operativo
  ON OrdenesCompra(es_gasto_operativo)
  WHERE es_gasto_operativo = TRUE;

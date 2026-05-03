-- MIGRACIÓN: CostosServicio acepta id_cotizacion (Camino A continuación)
-- Fecha: 2026-05-03
-- Motivo: Las OC SERVICIO ahora se vinculan a cotizaciones (no a la tabla
--         orfanada Servicios). Cuando se factura una OC SERVICIO, queremos
--         registrar el costo en CostosServicio para que aparezca en la
--         rentabilidad de ese proyecto. Pero CostosServicio.id_servicio era
--         NOT NULL → no podíamos registrar costo asociado a una cotización.
--
-- Cambios:
--   1. id_servicio pasa a NULLABLE (cubre casos legacy + nuevo flujo)
--   2. id_cotizacion (NULLABLE) agregado con FK a Cotizaciones
--   3. CHECK constraint: al menos uno de los dos debe estar poblado
--   4. Índice en id_cotizacion para queries de rentabilidad por cotización
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-03. Idempotente.

ALTER TABLE CostosServicio ALTER COLUMN id_servicio DROP NOT NULL;

ALTER TABLE CostosServicio
  ADD COLUMN IF NOT EXISTS id_cotizacion INTEGER NULL
  REFERENCES Cotizaciones(id_cotizacion) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_costoservicio_id_cotizacion ON CostosServicio(id_cotizacion);

ALTER TABLE CostosServicio
  DROP CONSTRAINT IF EXISTS chk_costoservicio_origen;
ALTER TABLE CostosServicio
  ADD CONSTRAINT chk_costoservicio_origen
  CHECK (id_servicio IS NOT NULL OR id_cotizacion IS NOT NULL);

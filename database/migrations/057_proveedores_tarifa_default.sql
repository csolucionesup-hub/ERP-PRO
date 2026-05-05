-- MIGRACIÓN: Proveedores — tarifa default para personas naturales
-- Fecha: 2026-05-04
-- Motivo: Para el módulo "👥 Personal" en Administración (gasto de personal
--         por OC). Cuando el admin crea una OC de honorarios para un
--         colaborador (ej. Manuel Huaranga, S/100/día), el sistema
--         autocompleta la tarifa por defecto y unidad. Aplicable a
--         cualquier proveedor pero pensado para PERSONA_NATURAL.
--
-- Postgres (Supabase): aplicar vía MCP. Idempotente con IF NOT EXISTS.

ALTER TABLE Proveedores
  ADD COLUMN IF NOT EXISTS tarifa_default  NUMERIC(12,4) NULL,
  ADD COLUMN IF NOT EXISTS unidad_default  VARCHAR(20)   NULL;

COMMENT ON COLUMN Proveedores.tarifa_default IS
  'Tarifa por unidad pre-cargada al crear OCs (ej. 100.00 para honorarios diarios).';
COMMENT ON COLUMN Proveedores.unidad_default IS
  'Unidad asociada a tarifa_default (DIAS / MES / GLB / HRS / etc.). Texto libre, sin enum estricto.';

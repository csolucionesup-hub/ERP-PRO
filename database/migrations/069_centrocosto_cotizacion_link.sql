-- MIGRACIÓN 069: Vincular CentrosCosto a Cotizaciones aprobadas
-- Fecha: 2026-05-12
-- Motivo: Hoy el campo "Nombre" del centro de costo es texto libre, lo que
--         lleva a inconsistencia (mezcla nombre de cliente con nombre de
--         proyecto). Cuando un mismo cliente tiene varios proyectos
--         simultáneos, el ojímetro no alcanza.
--
--         Solución: cuando se crea un CC tipo PROYECTO, opcionalmente se
--         vincula a una cotización APROBADA — el nombre se auto-genera
--         como "<PROYECTO> · <CLIENTE>" y queda trazabilidad
--         centro_costo ↔ cotización para reportes.
--
-- Cambios:
--   1. Agrega columna `id_cotizacion` (FK nullable) a CentrosCosto.
--   2. Índice para queries por cotización.
--
-- ADD-only: no modifica ningún registro existente. Los CCs viejos quedan
-- con id_cotizacion=NULL (es el default) — funcionan igual que antes.
--
-- Postgres (Supabase). Idempotente.

ALTER TABLE CentrosCosto
  ADD COLUMN IF NOT EXISTS id_cotizacion INT NULL REFERENCES Cotizaciones(id_cotizacion) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cc_cotizacion ON CentrosCosto(id_cotizacion);

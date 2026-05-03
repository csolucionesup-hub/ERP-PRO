-- MIGRACIÓN: Vincular OC SERVICIO a Cotización (Camino A)
-- Fecha: 2026-05-03
-- Motivo: La tabla `Servicios` quedó orfanada (0 rows en producción al
--         momento de esta decisión). Las "Servicios / Proyectos" que el
--         usuario ve en el form de OC SERVICIO son en realidad cotizaciones
--         APROBADAS/TERMINADAS/TRABAJO_EN_RIESGO de clientes.
--
-- Cambio: agregamos `id_cotizacion` (nullable) en OrdenesCompra. El campo
-- viejo `id_servicio` se mantiene para retrocompat (servicios sueltos sin
-- cotización formal, raros). El frontend del form OC SERVICIO ahora muestra
-- un picker de cotizaciones filtrado por moneda + año.
--
-- ON DELETE SET NULL: si se elimina una cotización (caso GERENTE en estado
-- editable), las OCs vinculadas pierden el link pero no se borran.
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-03. Idempotente.

ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS id_cotizacion INTEGER NULL
  REFERENCES Cotizaciones(id_cotizacion) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oc_id_cotizacion ON OrdenesCompra(id_cotizacion);

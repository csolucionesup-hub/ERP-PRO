-- MIGRACIÓN: Flag es_honorario en OrdenesCompra
-- Fecha: 2026-05-04
-- Motivo: Distinguir OCs por TRABAJO REALIZADO de personas naturales
--         (honorarios reales: oficina, limpieza, almacenero, servicios)
--         vs. OCs que son ANTICIPOS para gastos varios que después se
--         rinden (caso 001-2026: dinero entregado al gerente para que
--         pague gastos del mes y luego rinda con boletas/facturas).
--
-- El módulo "👥 Personal" en Administración solo consume OCs con
-- es_honorario=TRUE. El form "+ Nueva OC de Honorario" en ese módulo
-- forza el flag. Las OCs creadas desde Logística siguen el flujo
-- normal (es_honorario=FALSE por default).
--
-- Postgres (Supabase): aplicar vía MCP. Idempotente con IF NOT EXISTS.

ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS es_honorario BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN OrdenesCompra.es_honorario IS
  'TRUE si la OC representa honorarios por trabajo realizado de una persona natural (oficina/limpieza/almacenero/servicio). FALSE para todo lo demás (compras de almacén, anticipos, reembolsos, OCs a empresas).';

CREATE INDEX IF NOT EXISTS idx_ordenescompra_es_honorario
  ON OrdenesCompra(es_honorario)
  WHERE es_honorario = TRUE;

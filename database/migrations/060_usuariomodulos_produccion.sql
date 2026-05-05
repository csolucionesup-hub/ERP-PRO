-- MIGRACIÓN: Agregar 'PRODUCCION' al ENUM de UsuarioModulos
-- Fecha: 2026-05-04
-- Motivo: Inicio de Fase E (Producción Metalmecánica) — versión MVP. La
--         pantalla 🏭 Producción es un visor de Órdenes de Trabajo
--         implícitas (cotizaciones APROBADA / TRABAJO_EN_RIESGO) con
--         desglose de costos imputados (materiales + mano de obra). El
--         GERENTE entra siempre por bypass; otros usuarios necesitarán
--         este módulo asignado para verlo.
--
-- Postgres (Supabase): aplicar vía MCP. Idempotente (DROP + ADD).

ALTER TABLE usuariomodulos
  DROP CONSTRAINT IF EXISTS usuariomodulos_modulo_check;

ALTER TABLE usuariomodulos
  ADD CONSTRAINT usuariomodulos_modulo_check
  CHECK (modulo IN ('GERENCIA', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ALMACEN', 'ADMINISTRACION', 'PRODUCCION'));

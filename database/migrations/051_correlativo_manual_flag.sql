-- MIGRACIÓN: Flag "permitir_correlativo_manual" en ConfiguracionEmpresa
-- Fecha: 2026-05-03
-- Motivo: Modo migración para cargar data histórica con sus correlativos
--         REALES (los que ya circularon a clientes en el sistema viejo).
--
-- Cuando está ON:
--   - Form de cotización + form de OC muestran un campo opcional "Nº manual"
--   - GERENTE puede tipear el correlativo exacto (ej. COT 2025-002-MN)
--   - Backend valida: formato, ventana de fechas (24m + año actual), no duplicado,
--     que el rol sea GERENTE y que el flag esté efectivamente ON
--   - Si el campo se deja vacío, el sistema cae al modo automático normal
--   - El uso del campo manual queda registrado en auditoría
--
-- Cuando está OFF (default):
--   - El campo no aparece en el form
--   - Backend ignora cualquier valor enviado y usa correlativo automático
--   - Sistema opera idéntico a antes de esta migración
--
-- Pensado como producto SaaS: cualquier empresa que adopte el ERP en el futuro
-- puede prender el flag, cargar 1-2 años de historia, y apagarlo. La data nueva
-- a partir de ahí queda con correlativos automáticos sincronizados con el MAX
-- existente en BD para evitar gaps al volver al modo automático.
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-03. Idempotente.

ALTER TABLE ConfiguracionEmpresa
  ADD COLUMN IF NOT EXISTS permitir_correlativo_manual BOOLEAN NOT NULL DEFAULT false;

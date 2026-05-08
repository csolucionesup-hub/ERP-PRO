-- MIGRACIÓN 066: Extender CHECK de AprobacionesOC.accion para multifirma
-- Fecha: 2026-05-08
-- Motivo: Mig 065 introdujo multifirma con eventos nuevos en el audit log
--         (LISTA_PARA_APROBACION + FIRMAR_PREPARADO/REVISADO/AUTORIZADO +
--         DESFIRMAR_PREPARADO/REVISADO/AUTORIZADO). El CHECK original solo
--         permitía APROBAR/RECHAZAR/SOLICITAR_CAMBIOS y bloqueaba el flujo
--         con "violates check constraint".
--
-- Postgres (Supabase). Aplicar vía MCP.

ALTER TABLE AprobacionesOC DROP CONSTRAINT IF EXISTS aprobacionesoc_accion_check;

ALTER TABLE AprobacionesOC ADD CONSTRAINT aprobacionesoc_accion_check
  CHECK (accion IN (
    'APROBAR',                  -- legacy: 1 firma directa (mantenida por compat)
    'RECHAZAR',
    'SOLICITAR_CAMBIOS',
    'LISTA_PARA_APROBACION',    -- BORRADOR -> APROBADA
    'FIRMAR_PREPARADO',
    'FIRMAR_REVISADO',
    'FIRMAR_AUTORIZADO',
    'DESFIRMAR_PREPARADO',
    'DESFIRMAR_REVISADO',
    'DESFIRMAR_AUTORIZADO'
  ));

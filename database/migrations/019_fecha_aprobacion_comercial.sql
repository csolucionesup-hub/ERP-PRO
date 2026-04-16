-- ============================================================
-- Migración 019: Fecha de aprobación comercial
--   Registra cuándo el módulo Comercial marcó la cotización como APROBADA
-- ============================================================

ALTER TABLE Cotizaciones
  ADD COLUMN fecha_aprobacion_comercial DATETIME NULL AFTER estado;

-- Back-fill: usar updated_at como aproximación para las APROBADAS existentes
UPDATE Cotizaciones
   SET fecha_aprobacion_comercial = updated_at
 WHERE estado IN ('APROBADA','TERMINADA')
   AND fecha_aprobacion_comercial IS NULL;

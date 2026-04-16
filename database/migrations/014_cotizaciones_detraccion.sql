-- ============================================================
-- Migración 014: Detracción y retención en Cotizaciones
-- Necesario para que Finanzas calcule cuánto entra al banco regular
-- vs cuánto va al Banco de la Nación (detracción).
-- ============================================================

ALTER TABLE Cotizaciones
  ADD COLUMN detraccion_porcentaje DECIMAL(5,2)  NOT NULL DEFAULT 0.00 AFTER igv,
  ADD COLUMN monto_detraccion      DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER detraccion_porcentaje,
  ADD COLUMN retencion_porcentaje  DECIMAL(5,2)  NOT NULL DEFAULT 0.00 AFTER monto_detraccion,
  ADD COLUMN monto_retencion       DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER retencion_porcentaje;

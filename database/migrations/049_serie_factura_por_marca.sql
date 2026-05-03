-- MIGRACIÓN: serie_factura y serie_boleta por marca en ConfiguracionMarca
-- Fecha: 2026-05-02
-- Motivo: Fase B. Cada marca usa su propia serie de factura electrónica:
--           METAL → F001 (PEN)
--           PERFOTOOLS → F002 (USD)
-- Antes solo había un campo global en ConfiguracionEmpresa (sirve como default
-- legacy pero la marca específica gana si tiene su propia serie poblada).
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-02. Idempotente.

ALTER TABLE ConfiguracionMarca
  ADD COLUMN IF NOT EXISTS serie_factura VARCHAR(10);

ALTER TABLE ConfiguracionMarca
  ADD COLUMN IF NOT EXISTS serie_boleta  VARCHAR(10);

UPDATE ConfiguracionMarca
   SET serie_factura = 'F001', serie_boleta = 'B001'
 WHERE marca = 'METAL' AND serie_factura IS NULL;

UPDATE ConfiguracionMarca
   SET serie_factura = 'F002', serie_boleta = 'B001'
 WHERE marca = 'PERFOTOOLS' AND serie_factura IS NULL;

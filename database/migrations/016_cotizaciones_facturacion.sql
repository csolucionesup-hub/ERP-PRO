-- ============================================================
-- Migración 016: Facturación en Finanzas v2
--   - Agrega fecha_factura a Cotizaciones
--   - (nro_factura ya existe)
-- ============================================================

ALTER TABLE Cotizaciones
  ADD COLUMN fecha_factura DATE NULL AFTER nro_factura,
  ADD COLUMN fecha_cobro_total DATETIME NULL AFTER fecha_factura;

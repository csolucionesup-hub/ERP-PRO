-- ============================================================
-- Migración 010: Cotizaciones — marca (Metal/Perfotools) + campos PDF
-- Incluye sub-descripción, notas y foto por ítem
-- Fecha: 2026-04-13
-- ============================================================

-- ── Cotizaciones: marca y campos adicionales del PDF ─────────
ALTER TABLE Cotizaciones
  ADD COLUMN marca ENUM('METAL','PERFOTOOLS') NOT NULL DEFAULT 'METAL' AFTER nro_cotizacion,
  ADD COLUMN ref VARCHAR(500) NULL AFTER proyecto,
  ADD COLUMN lugar_trabajo VARCHAR(255) NULL AFTER lugar_entrega,
  ADD COLUMN precios_incluyen VARCHAR(500) NULL AFTER comentarios;

CREATE INDEX idx_cotizaciones_marca ON Cotizaciones(marca);

-- ── DetalleCotizacion: sub-descripción, notas, foto ──────────
ALTER TABLE DetalleCotizacion
  ADD COLUMN subdescripcion TEXT NULL AFTER descripcion,
  ADD COLUMN notas TEXT NULL AFTER subdescripcion,
  ADD COLUMN foto_url VARCHAR(500) NULL AFTER notas;

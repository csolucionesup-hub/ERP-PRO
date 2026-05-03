-- MIGRACIÓN: Correlativos de facturas/boletas por serie
-- Fecha: 2026-05-02
-- Motivo: Fase B (facturación electrónica). SUNAT permite múltiples series
--         por contribuyente. Metal Engineers maneja:
--           F001 → facturas marca METAL  (PEN)
--           F002 → facturas marca PERFOTOOLS (USD)
--           B001 → boletas (común)
-- El correlativo se asigna en el momento de emitir, NO al crear borrador
-- (porque borradores se pueden descartar y dejarían huecos en la numeración
-- que SUNAT rechaza). Patrón: UPDATE-then-SELECT con row-lock implícito de
-- Postgres garantiza atomicidad bajo concurrencia.
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-02. Idempotente.

CREATE TABLE IF NOT EXISTS CorrelativosFactura (
  serie       VARCHAR(10) PRIMARY KEY,
  ultimo      INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed con las 3 series de Metal Engineers
INSERT INTO CorrelativosFactura (serie, ultimo) VALUES
  ('F001', 0),  -- Metal facturas
  ('F002', 0),  -- Perfotools facturas
  ('B001', 0)   -- Boletas (común a ambas marcas)
ON CONFLICT (serie) DO NOTHING;

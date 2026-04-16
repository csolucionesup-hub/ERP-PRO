-- ============================================================
-- Migración 015: PagosImpuestos — integración con Finanzas v2
--   - Agrega id_cuenta (cuenta desde donde se pagó SUNAT)
--   - Agrega moneda y tipo_cambio
-- ============================================================

ALTER TABLE PagosImpuestos
  ADD COLUMN id_cuenta    INT NULL AFTER monto,
  ADD COLUMN moneda       VARCHAR(3) NOT NULL DEFAULT 'PEN' AFTER id_cuenta,
  ADD COLUMN tipo_cambio  DECIMAL(10,4) NOT NULL DEFAULT 1.0000 AFTER moneda,
  ADD CONSTRAINT fk_pagoimp_cuenta FOREIGN KEY (id_cuenta) REFERENCES Cuentas(id_cuenta) ON DELETE SET NULL;

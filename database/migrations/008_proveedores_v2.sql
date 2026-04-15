-- Migración 008: Campos V2 para Proveedores
-- Auditoría V3 — B03
-- Fecha: 2026-04-09

ALTER TABLE Proveedores
  ADD COLUMN tipo ENUM('EMPRESA','PERSONA_NATURAL') NOT NULL DEFAULT 'EMPRESA' AFTER razon_social,
  ADD COLUMN dni VARCHAR(8) NULL AFTER tipo,
  ADD COLUMN banco_1_nombre VARCHAR(60) NULL AFTER dni,
  ADD COLUMN banco_1_numero VARCHAR(30) NULL AFTER banco_1_nombre,
  ADD COLUMN banco_1_cci VARCHAR(30) NULL AFTER banco_1_numero,
  ADD COLUMN banco_2_nombre VARCHAR(60) NULL AFTER banco_1_cci,
  ADD COLUMN banco_2_numero VARCHAR(30) NULL AFTER banco_2_nombre,
  ADD COLUMN banco_2_cci VARCHAR(30) NULL AFTER banco_2_numero;

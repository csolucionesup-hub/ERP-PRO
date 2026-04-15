-- Migración 007: Campos V2 para módulo Logística
-- Auditoría V3 — V02
-- Fecha: 2026-04-09

ALTER TABLE Gastos
  ADD COLUMN centro_costo VARCHAR(100) NULL AFTER tipo_gasto,
  ADD COLUMN tipo_gasto_logistica ENUM('GENERAL','SERVICIO','ALMACEN') NULL AFTER centro_costo;

ALTER TABLE Compras
  ADD COLUMN centro_costo VARCHAR(100) NULL AFTER nro_comprobante;

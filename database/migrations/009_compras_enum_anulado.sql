-- Migración 009: Normalizar ENUM estado en Compras ANULADA → ANULADO
-- Auditoría V3 — B04
-- Fecha: 2026-04-09
-- Nota: Gastos y Transacciones ya usan 'ANULADO' — solo Compras usaba 'ANULADA'

ALTER TABLE Compras MODIFY COLUMN estado ENUM('PENDIENTE','CONFIRMADA','ANULADO') NOT NULL DEFAULT 'CONFIRMADA';
UPDATE Compras SET estado = 'ANULADO' WHERE estado = 'ANULADA';

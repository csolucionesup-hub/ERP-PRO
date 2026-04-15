-- ============================================================
-- Migración 005: Agrega ANULADA al ENUM estado de Cotizaciones
-- Fecha: 08/04/2026
-- ============================================================

ALTER TABLE Cotizaciones
  MODIFY COLUMN estado ENUM(
    'EN_PROCESO',
    'ENVIADA',
    'APROBADA',
    'NO_APROBADA',
    'RECHAZADA',
    'TERMINADA',
    'A_ESPERA_RESPUESTA',
    'ANULADA'
  ) DEFAULT 'EN_PROCESO';

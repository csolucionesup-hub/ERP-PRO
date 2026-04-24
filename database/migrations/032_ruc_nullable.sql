-- MIGRACIÓN: Permitir proveedores PERSONA_NATURAL con DNI (sin RUC)
-- Fecha: 2026-04-24
-- Motivo: La migración 008 agregó `dni` y `tipo='PERSONA_NATURAL'` pero
-- olvidó hacer `ruc` nullable. ProvidersService.createProveedor pasa
-- ruc=null para personas naturales y el INSERT falla con "cannot be null".

ALTER TABLE Proveedores MODIFY ruc VARCHAR(20) NULL;

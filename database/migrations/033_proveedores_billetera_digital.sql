-- MIGRACIÓN: Agregar billetera digital (Yape/Plin) a Proveedores
-- Fecha: 2026-04-25
-- Motivo: muchos proveedores en Perú cobran por billeteras digitales
-- (Yape, Plin) en lugar de transferencia bancaria. El campo guarda el
-- número de celular asociado.

ALTER TABLE Proveedores
  ADD COLUMN billetera_digital VARCHAR(50) NULL;

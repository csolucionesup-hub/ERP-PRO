-- 079_cotizacion_condiciones_servicio.sql
-- Entrega 1 formato cotización: condiciones del servicio (texto libre) por cotización
-- + default reutilizable por marca.

ALTER TABLE Cotizaciones
  ADD COLUMN condiciones_servicio TEXT NULL AFTER precios_incluyen;

ALTER TABLE ConfiguracionMarca
  ADD COLUMN condiciones_servicio_default TEXT NULL;

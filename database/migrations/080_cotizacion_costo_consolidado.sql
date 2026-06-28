-- 080_cotizacion_costo_consolidado.sql
-- Entrega 2 formato cotización: modo costo consolidado.
-- ocultar_precios_items: oculta P.Unit/Subtotal por ítem en el PDF.
-- desglose_comercial: texto multilínea "Concepto: monto" (Materiales/MO/Utilidad).

ALTER TABLE Cotizaciones
  ADD COLUMN ocultar_precios_items BOOLEAN NOT NULL DEFAULT 0 AFTER condiciones_servicio,
  ADD COLUMN desglose_comercial TEXT NULL AFTER ocultar_precios_items;

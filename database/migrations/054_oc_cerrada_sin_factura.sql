-- MIGRACIÓN: Estado CERRADA_SIN_FACTURA en OrdenesCompra
-- Fecha: 2026-05-03
-- Motivo: Caso real Julio — gastos de caja chica / marketing donde el
--         proveedor no entrega factura formal. La OC está pagada en el
--         momento (efectivo) pero no podemos registrarla como FACTURADA
--         porque no hay comprobante.
--
-- Estado nuevo CERRADA_SIN_FACTURA:
--   - Generado por OrdenCompraService.cerrarSinFactura(id, { concepto, forma_pago_real })
--   - Inserta Gasto con nro_comprobante=NULL + Transaccion EGRESO
--   - Marca OC.estado_pago='PAGADO' (ya se pagó, no genera CxP)
--   - Si la factura aparece tarde, asociarFacturaTardia() enriquece el Gasto
--     y mueve OC a FACTURADA (UPDATE en vez de crear duplicado)
--
-- Estado equivalente a "PAGADA sin sustento documental". Diferencia con FACTURADA:
--   FACTURADA: tiene nro_comprobante real, aparece en Libro de Compras (PLE 8.1)
--   CERRADA_SIN_FACTURA: sin comprobante, NO aparece en Libro de Compras
--                        (tributariamente solo deducible bajo el límite 3% UIT)
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-03. Idempotente.

ALTER TABLE OrdenesCompra
  DROP CONSTRAINT IF EXISTS ordenescompra_estado_check;

ALTER TABLE OrdenesCompra
  ADD CONSTRAINT ordenescompra_estado_check
  CHECK (estado IN (
    'BORRADOR',
    'APROBADA',
    'ENVIADA',
    'RECIBIDA_PARCIAL',
    'RECIBIDA',
    'FACTURADA',
    'PAGADA',
    'ANULADA',
    'CERRADA_SIN_FACTURA'
  ));

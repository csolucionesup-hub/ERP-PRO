-- MIGRACIÓN 064: Multi-factura + multi-pago por OC
-- Fecha: 2026-05-08
-- Motivo: El proveedor puede entregar la mercadería/servicio en VARIAS facturas
--         (split por items, fechas distintas, etc.) y el pago puede hacerse en
--         VARIAS constancias bancarias (parcial inicial + saldo en recepción,
--         depósitos múltiples, etc.). Cada documento (factura del proveedor o
--         constancia de pago) tiene su propio archivo escaneado en Cloudinary.
--         Esto desbloquea el bridge OC → Rendición de gastos donde cada
--         documento del flujo aparece pre-poblado.
--
-- Cambio 1: drop UNIQUE en OrdenCompraFactura(id_oc) → ya permite N facturas.
-- Cambio 2: nueva tabla OrdenCompraPago para trackear pagos individualmente
--           con su voucher de Cloudinary y su MovimientoBancario asociado.
--
-- Postgres (Supabase). Aplicar vía MCP.

-- 1. Multi-factura por OC: quitar UNIQUE
ALTER TABLE OrdenCompraFactura DROP CONSTRAINT IF EXISTS ordencomprafactura_id_oc_key;

-- 2. Tabla de pagos individuales contra una OC
CREATE TABLE IF NOT EXISTS OrdenCompraPago (
  id_pago             SERIAL PRIMARY KEY,
  id_oc               INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  id_cuenta           INT NOT NULL REFERENCES Cuentas(id_cuenta),
  fecha_pago          DATE NOT NULL,
  nro_operacion       VARCHAR(60),
  monto               DECIMAL(14,4) NOT NULL,
  monto_pen           DECIMAL(14,4) NOT NULL,
  observaciones       TEXT,
  voucher_url         VARCHAR(500),
  voucher_cloudinary_id VARCHAR(200),
  id_movimiento_bancario INT REFERENCES MovimientoBancario(id_movimiento) ON DELETE SET NULL,
  id_usuario_registra INT REFERENCES Usuarios(id_usuario),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_pago_id_oc ON OrdenCompraPago(id_oc);
CREATE INDEX IF NOT EXISTS idx_oc_pago_fecha ON OrdenCompraPago(fecha_pago);

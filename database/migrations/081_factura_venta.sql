-- 081_factura_venta.sql
-- Postgres NATIVO (Supabase project fhlrxlsscerfiuuyiejw) -- NO pasa por el
-- adapter MySQL->PG. Facturas de VENTA creadas manualmente en SUNAT y subidas
-- al ERP. Reemplaza el camino Nubefact (FacturaService) que se retira.
-- ADITIVA: no toca cotizaciones.nro_factura/fecha_factura.
-- Columnas de cotizaciones confirmadas: subtotal (base gravada), cliente (razon
-- social), igv, total, moneda, tipo_cambio, detraccion_porcentaje,
-- monto_detraccion, monto_retencion, nro_factura, fecha_factura.

-- 1) Tabla
CREATE TABLE IF NOT EXISTS facturaventa (
  id_factura_venta      SERIAL PRIMARY KEY,
  id_cotizacion         INT NOT NULL REFERENCES cotizaciones(id_cotizacion),
  tipo                  VARCHAR(10) NOT NULL DEFAULT 'FACTURA' CHECK (tipo IN ('FACTURA','BOLETA')),
  serie                 VARCHAR(8),
  numero                INT,
  fecha_emision         DATE,
  moneda                VARCHAR(3) NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  tipo_cambio           NUMERIC(8,4) NOT NULL DEFAULT 1.0000,
  base_imponible        NUMERIC(14,2) NOT NULL DEFAULT 0,
  igv                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  aplica_detraccion     BOOLEAN NOT NULL DEFAULT FALSE,
  porcentaje_detraccion NUMERIC(5,2) NOT NULL DEFAULT 0,
  monto_detraccion      NUMERIC(14,2) NOT NULL DEFAULT 0,
  aplica_retencion      BOOLEAN NOT NULL DEFAULT FALSE,
  monto_retencion       NUMERIC(14,2) NOT NULL DEFAULT 0,
  cliente_razon_social  VARCHAR(200),
  cliente_num_doc       VARCHAR(15),
  observaciones         VARCHAR(500),
  id_usuario_registro   INT,
  estado                VARCHAR(10) NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADA')),
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tipo, serie, numero)
);
CREATE INDEX IF NOT EXISTS facturaventa_idx_cotizacion ON facturaventa (id_cotizacion);
CREATE INDEX IF NOT EXISTS facturaventa_idx_fecha ON facturaventa (fecha_emision);

-- 2) Back-fill: cada cotizacion con nro_factura -> 1 fila FacturaVenta.
INSERT INTO facturaventa (
  id_cotizacion, tipo, serie, numero, fecha_emision, moneda, tipo_cambio,
  base_imponible, igv, total, aplica_detraccion, porcentaje_detraccion, monto_detraccion,
  aplica_retencion, monto_retencion, cliente_razon_social, cliente_num_doc, estado
)
SELECT
  c.id_cotizacion, 'FACTURA',
  split_part(c.nro_factura, '-', 1),
  NULLIF(regexp_replace(split_part(c.nro_factura, '-', 2), '\D', '', 'g'), '')::INT,
  c.fecha_factura,
  COALESCE(c.moneda, 'PEN'), COALESCE(c.tipo_cambio, 1),
  COALESCE(c.subtotal, 0), COALESCE(c.igv, 0), COALESCE(c.total, 0),
  (COALESCE(c.monto_detraccion, 0) > 0), COALESCE(c.detraccion_porcentaje, 0), COALESCE(c.monto_detraccion, 0),
  (COALESCE(c.monto_retencion, 0) > 0), COALESCE(c.monto_retencion, 0),
  c.cliente, NULL,
  'VIGENTE'
FROM cotizaciones c
WHERE c.nro_factura IS NOT NULL AND c.nro_factura <> ''
  AND NOT EXISTS (SELECT 1 FROM facturaventa fv WHERE fv.id_cotizacion = c.id_cotizacion);

-- 3) Reasignar los adjuntos de factura (PR #33 usaba ref_id = id_cotizacion)
--    al nuevo id_factura_venta (1:1 por el back-fill).
UPDATE adjuntos a
SET ref_id = fv.id_factura_venta
FROM facturaventa fv
WHERE a.ref_tipo = 'FacturaVenta' AND a.ref_id = fv.id_cotizacion;

-- 4) Las tablas STUB de Nubefact (facturas, detallefactura) NO se dropean:
--    tienen FKs desde guiasremision/notascredito/notasdebito (fk_guia_factura,
--    fk_nc_factura, fk_nd_factura). Estan VACIAS (0 filas) y ya no las referencia
--    ningun codigo (FacturaService removido en este mismo trabajo). Se dejan
--    inertes. Limpiarlas requeriria DROP ... CASCADE, que tocaria el schema de
--    esas 3 tablas usadas -> queda fuera de alcance (cosmetico).

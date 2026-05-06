-- MIGRACIÓN: Rediseño del kanban de Órdenes de Compra
-- Fecha: 2026-05-06
-- Spec: docs/superpowers/specs/2026-05-06-logistica-kanban-rediseno-design.md
-- Motivo: Brainstorm con Julio. ENVIADA no se usa. Comprimimos pago/recepción/factura
--         como ejes independientes (forma_pago, estado_pago, estado_recepcion calculado,
--         estado_factura nuevo). Cascada de alertas a Gerencia.
--
-- Cambios:
--   1. Agrega `fecha_credito_vence` DATE NULL.
--   2. Agrega `estado_factura` ENUM('PENDIENTE','FACTURADA','SIN_FACTURA') NOT NULL DEFAULT 'PENDIENTE'.
--   3. Reescribe ENUM `estado`: agrega 'PAGO','RECEPCION','FACTURACION','TERMINADA';
--      mantiene 'BORRADOR','APROBADA','CERRADA_SIN_FACTURA','ANULADA'.
--      Migra valores viejos a nuevos según mapping (ver más abajo).
--   4. Crea tabla OrdenCompraHistorial — log de transiciones de estado.
--   5. Crea tabla OrdenCompraNota — comentarios libres por OC.
--   6. Crea tabla OrdenCompraFactura — facturas del proveedor subidas a Cloudinary.
--   7. Inserta registro sintético en OrdenCompraHistorial para cada OC existente
--      (estado_anterior=NULL, estado_nuevo=<estado_actual>, fecha=created_at).
--
-- Mapping de estados viejos → nuevos:
--   BORRADOR              → BORRADOR
--   APROBADA              → APROBADA
--   ENVIADA               → APROBADA (ENVIADA no existe más)
--   RECIBIDA_PARCIAL      → RECEPCION
--   RECIBIDA              → RECEPCION
--   FACTURADA             → FACTURACION  (estado_factura=FACTURADA)
--   PAGADA_PEND_FACTURA   → FACTURACION  (estado_pago=PAGADO, estado_factura=PENDIENTE)
--   PAGADA                → TERMINADA    (estado_factura=FACTURADA, estado_pago=PAGADO)
--   CERRADA_SIN_FACTURA   → CERRADA_SIN_FACTURA (estado_factura=SIN_FACTURA, estado_pago=PAGADO)
--   ANULADA               → ANULADA
--
-- Postgres (Supabase). Idempotente.

-- 1. Columnas nuevas en OrdenesCompra
ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS fecha_credito_vence DATE NULL,
  ADD COLUMN IF NOT EXISTS estado_factura VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_factura IN ('PENDIENTE','FACTURADA','SIN_FACTURA'));

-- 2. Drop del check constraint viejo
ALTER TABLE OrdenesCompra
  DROP CONSTRAINT IF EXISTS ordenescompra_estado_check;

-- 3. Migración de los valores existentes (orden importa: primero PAGADA_PEND_FACTURA antes de FACTURADA)
UPDATE OrdenesCompra SET estado_factura='FACTURADA' WHERE estado IN ('FACTURADA','PAGADA');
UPDATE OrdenesCompra SET estado_factura='SIN_FACTURA' WHERE estado='CERRADA_SIN_FACTURA';

UPDATE OrdenesCompra SET estado='APROBADA'    WHERE estado='ENVIADA';
UPDATE OrdenesCompra SET estado='RECEPCION'   WHERE estado IN ('RECIBIDA_PARCIAL','RECIBIDA');
UPDATE OrdenesCompra SET estado='FACTURACION' WHERE estado IN ('FACTURADA','PAGADA_PEND_FACTURA');
UPDATE OrdenesCompra SET estado='TERMINADA'   WHERE estado='PAGADA';

-- 4. Nuevo check constraint
ALTER TABLE OrdenesCompra
  ADD CONSTRAINT ordenescompra_estado_check
  CHECK (estado IN (
    'BORRADOR','APROBADA','PAGO','RECEPCION','FACTURACION','TERMINADA',
    'CERRADA_SIN_FACTURA','ANULADA'
  ));

-- 5. Índice para fecha_credito_vence (alertas usan este filtro)
CREATE INDEX IF NOT EXISTS idx_oc_credito_vence
  ON OrdenesCompra(fecha_credito_vence)
  WHERE forma_pago = 'CREDITO' AND estado_pago <> 'PAGADO';

-- 6. Tabla OrdenCompraHistorial
CREATE TABLE IF NOT EXISTS OrdenCompraHistorial (
  id_historial    SERIAL PRIMARY KEY,
  id_oc           INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  estado_anterior VARCHAR(30),
  estado_nuevo    VARCHAR(30) NOT NULL,
  id_usuario      INT REFERENCES Usuarios(id_usuario),
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comentario      VARCHAR(500)
);
CREATE INDEX IF NOT EXISTS idx_historial_oc    ON OrdenCompraHistorial(id_oc);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON OrdenCompraHistorial(fecha DESC);

-- 7. Tabla OrdenCompraNota
CREATE TABLE IF NOT EXISTS OrdenCompraNota (
  id_nota    SERIAL PRIMARY KEY,
  id_oc      INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  id_usuario INT REFERENCES Usuarios(id_usuario),
  fecha      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  texto      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nota_oc ON OrdenCompraNota(id_oc, fecha DESC);

-- 8. Tabla OrdenCompraFactura
CREATE TABLE IF NOT EXISTS OrdenCompraFactura (
  id_factura_oc   SERIAL PRIMARY KEY,
  id_oc           INT NOT NULL UNIQUE REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  nro_comprobante VARCHAR(30) NOT NULL,
  fecha_emision   DATE NOT NULL,
  monto           DECIMAL(14,2) NOT NULL,
  url_pdf         VARCHAR(500),
  cloudinary_id   VARCHAR(200),
  id_usuario_sube INT REFERENCES Usuarios(id_usuario),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_factura_oc ON OrdenCompraFactura(id_oc);

-- 9. Backfill de OrdenCompraHistorial con un registro sintético por OC
INSERT INTO OrdenCompraHistorial (id_oc, estado_anterior, estado_nuevo, fecha, comentario)
SELECT id_oc, NULL, estado, COALESCE(created_at, CURRENT_TIMESTAMP), 'Backfill mig 062'
FROM OrdenesCompra
WHERE NOT EXISTS (
  SELECT 1 FROM OrdenCompraHistorial h WHERE h.id_oc = OrdenesCompra.id_oc
);

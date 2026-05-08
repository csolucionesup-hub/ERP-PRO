-- MIGRACIÓN: Rediseño del kanban de Órdenes de Compra
-- Fecha: 2026-05-06
-- Spec: docs/superpowers/specs/2026-05-06-logistica-kanban-rediseno-design.md
-- Motivo: Brainstorm con Julio. ENVIADA no se usa. Comprimimos pago/recepción/factura
--         como ejes independientes. Cascada de alertas a Gerencia.
--
-- Cambios:
--   1. Agrega `estado_pago` ENUM('PENDIENTE','PARCIAL','PAGADO','ANULADO') (NO existía).
--   2. Agrega `monto_pagado` DECIMAL(14,2) DEFAULT 0 (NO existía).
--   3. Agrega `fecha_credito_vence` DATE NULL.
--   4. Agrega `estado_factura` ENUM('PENDIENTE','FACTURADA','SIN_FACTURA') NOT NULL DEFAULT 'PENDIENTE'.
--   5. Reescribe ENUM `estado` a las 8 fases del rediseño.
--   6. Backfill determinista de estado_pago/monto_pagado/estado_factura desde el estado viejo.
--   7. Crea OrdenCompraHistorial, OrdenCompraNota, OrdenCompraFactura.
--   8. Inserta registro sintético en OrdenCompraHistorial por cada OC existente.
--
-- Mapping de estados viejos → nuevos:
--   BORRADOR              → BORRADOR              (estado_pago=PENDIENTE, estado_factura=PENDIENTE)
--   APROBADA              → APROBADA              (estado_pago=PENDIENTE, estado_factura=PENDIENTE)
--   ENVIADA               → APROBADA              (ENVIADA eliminado)
--   RECIBIDA_PARCIAL      → RECEPCION             (estado_pago=PENDIENTE, estado_factura=PENDIENTE)
--   RECIBIDA              → RECEPCION             (estado_pago=PENDIENTE, estado_factura=PENDIENTE)
--   FACTURADA             → FACTURACION           (estado_pago=PENDIENTE, estado_factura=FACTURADA)
--   PAGADA_PEND_FACTURA   → FACTURACION           (estado_pago=PAGADO,    estado_factura=PENDIENTE)
--   PAGADA                → TERMINADA             (estado_pago=PAGADO,    estado_factura=FACTURADA)
--   CERRADA_SIN_FACTURA   → CERRADA_SIN_FACTURA   (estado_pago=PAGADO,    estado_factura=SIN_FACTURA)
--   ANULADA               → ANULADA
--
-- Postgres (Supabase). Idempotente.
--
-- ⚠️ CONTEXTO IMPORTANTE: en producción Supabase la tabla OrdenesCompra NO tiene
--    columnas estado_pago ni monto_pagado (a diferencia de lo que sugieren las
--    memorias previas). El control de pagos vivía en Compras.estado_pago vía
--    id_compra_generada. Este rediseño los promueve a la propia OC para que el
--    kanban pueda mostrar el dot semáforo + badges sin un join extra.

-- ───────────────────────────────────────────────────────────────────
-- 1. Columnas nuevas en OrdenesCompra
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS estado_pago         VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS monto_pagado        DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_credito_vence DATE          NULL,
  ADD COLUMN IF NOT EXISTS estado_factura      VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE';

-- Drop checks viejos antes de los nuevos (idempotente)
ALTER TABLE OrdenesCompra DROP CONSTRAINT IF EXISTS ordenescompra_estado_check;
ALTER TABLE OrdenesCompra DROP CONSTRAINT IF EXISTS ordenescompra_estado_pago_check;
ALTER TABLE OrdenesCompra DROP CONSTRAINT IF EXISTS ordenescompra_estado_factura_check;

ALTER TABLE OrdenesCompra
  ADD CONSTRAINT ordenescompra_estado_pago_check
    CHECK (estado_pago IN ('PENDIENTE','PARCIAL','PAGADO','ANULADO'));

ALTER TABLE OrdenesCompra
  ADD CONSTRAINT ordenescompra_estado_factura_check
    CHECK (estado_factura IN ('PENDIENTE','FACTURADA','SIN_FACTURA'));

-- ───────────────────────────────────────────────────────────────────
-- 2. Backfill ANTES del cambio de estado (lee los estados viejos)
-- ───────────────────────────────────────────────────────────────────

-- 2a. estado_factura derivado del estado viejo
UPDATE OrdenesCompra SET estado_factura = 'FACTURADA'
 WHERE estado IN ('FACTURADA','PAGADA');
UPDATE OrdenesCompra SET estado_factura = 'SIN_FACTURA'
 WHERE estado = 'CERRADA_SIN_FACTURA';
-- (PAGADA_PEND_FACTURA queda en estado_factura=PENDIENTE, default — correcto)

-- 2b. estado_pago + monto_pagado derivados del estado viejo
UPDATE OrdenesCompra
   SET estado_pago = 'PAGADO',
       monto_pagado = total
 WHERE estado IN ('PAGADA','PAGADA_PEND_FACTURA','CERRADA_SIN_FACTURA');

-- 2c. fallback: leer pagos hechos vía Compras.estado_pago para casos no cubiertos
UPDATE OrdenesCompra oc
   SET estado_pago = c.estado_pago,
       monto_pagado = oc.total
  FROM Compras c
 WHERE oc.id_compra_generada = c.id_compra
   AND oc.estado_pago = 'PENDIENTE'
   AND c.estado_pago = 'PAGADO';

-- ───────────────────────────────────────────────────────────────────
-- 3. Migrar los valores del campo `estado` a las 8 fases nuevas
-- ───────────────────────────────────────────────────────────────────
UPDATE OrdenesCompra SET estado = 'APROBADA'    WHERE estado = 'ENVIADA';
UPDATE OrdenesCompra SET estado = 'RECEPCION'   WHERE estado IN ('RECIBIDA_PARCIAL','RECIBIDA');
UPDATE OrdenesCompra SET estado = 'FACTURACION' WHERE estado IN ('FACTURADA','PAGADA_PEND_FACTURA');
UPDATE OrdenesCompra SET estado = 'TERMINADA'   WHERE estado = 'PAGADA';

-- ───────────────────────────────────────────────────────────────────
-- 4. Nuevo check constraint para `estado`
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE OrdenesCompra
  ADD CONSTRAINT ordenescompra_estado_check
  CHECK (estado IN (
    'BORRADOR','APROBADA','PAGO','RECEPCION','FACTURACION','TERMINADA',
    'CERRADA_SIN_FACTURA','ANULADA'
  ));

-- ───────────────────────────────────────────────────────────────────
-- 5. Índices auxiliares
-- ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oc_credito_vence
  ON OrdenesCompra(fecha_credito_vence)
  WHERE forma_pago = 'CREDITO' AND estado_pago <> 'PAGADO';

CREATE INDEX IF NOT EXISTS idx_oc_estado_pago
  ON OrdenesCompra(estado_pago);

CREATE INDEX IF NOT EXISTS idx_oc_estado_factura
  ON OrdenesCompra(estado_factura);

-- ───────────────────────────────────────────────────────────────────
-- 6. Tabla OrdenCompraHistorial — log de transiciones de estado
-- ───────────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────────
-- 7. Tabla OrdenCompraNota — comentarios libres
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS OrdenCompraNota (
  id_nota    SERIAL PRIMARY KEY,
  id_oc      INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  id_usuario INT REFERENCES Usuarios(id_usuario),
  fecha      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  texto      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nota_oc ON OrdenCompraNota(id_oc, fecha DESC);

-- ───────────────────────────────────────────────────────────────────
-- 8. Tabla OrdenCompraFactura — facturas del proveedor (Cloudinary)
-- ───────────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────────
-- 9. Backfill OrdenCompraHistorial — un registro sintético por OC
-- ───────────────────────────────────────────────────────────────────
INSERT INTO OrdenCompraHistorial (id_oc, estado_anterior, estado_nuevo, fecha, comentario)
SELECT id_oc, NULL, estado, COALESCE(created_at, CURRENT_TIMESTAMP), 'Backfill mig 062'
FROM OrdenesCompra
WHERE NOT EXISTS (
  SELECT 1 FROM OrdenCompraHistorial h WHERE h.id_oc = OrdenesCompra.id_oc
);

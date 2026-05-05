-- MIGRACIÓN: Pago y factura como eventos independientes en OC
-- Fecha: 2026-05-05
-- Motivo: Caso real Julio — en metalmecánica peruana muchos proveedores
--         chicos primero exigen el pago (transferencia/depósito) y la
--         factura llega días/semanas después. El flujo lineal anterior
--         RECIBIDA → FACTURADA → PAGADA forzaba el orden contrario.
--
-- Cambios:
--   1. Agrega timestamps `pagada_at` y `facturada_at` (nullable) para
--      registrar cuándo ocurrió cada evento, independiente del estado.
--   2. Agrega estado nuevo `PAGADA_PEND_FACTURA` al CHECK del ENUM —
--      "pago hecho, esperando factura". Existe junto al `FACTURADA`
--      original (que pasa a significar "facturado, esperando pago").
--   3. Backfill: poblar `facturada_at` en todas las OC que ya pasaron
--      por FACTURADA o PAGADA. Poblar `pagada_at` en las PAGADA y
--      CERRADA_SIN_FACTURA.
--
-- Mapping conceptual (sin romper nombres viejos):
--   FACTURADA           = factura recibida, pendiente de pago
--   PAGADA_PEND_FACTURA = pagado, pendiente de factura            ← nuevo
--   PAGADA              = factura recibida + pago hecho (cerrada)
--   CERRADA_SIN_FACTURA = pagado al contado, sin comprobante (sigue igual)
--
-- Postgres (Supabase). Idempotente.

ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS pagada_at    TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS facturada_at TIMESTAMP NULL;

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
    'PAGADA_PEND_FACTURA',
    'PAGADA',
    'ANULADA',
    'CERRADA_SIN_FACTURA'
  ));

-- Backfill: facturada_at para todas las OC que en algún momento se facturaron
UPDATE OrdenesCompra
   SET facturada_at = COALESCE(facturada_at, updated_at)
 WHERE estado IN ('FACTURADA', 'PAGADA');

-- Backfill: pagada_at para OCs ya pagadas (PAGADA o CERRADA_SIN_FACTURA)
UPDATE OrdenesCompra
   SET pagada_at = COALESCE(pagada_at, updated_at)
 WHERE estado IN ('PAGADA', 'CERRADA_SIN_FACTURA');

-- MIGRACIÓN 068: Importaciones con landed cost (Perfotools)
-- Fecha: 2026-05-09
-- Motivo: Perfotools importa de China ~5 veces/año. La OC ALMACEN al proveedor
--         se paga ~3 meses ANTES de que lleguen los productos a Callao y de
--         que se conozcan los costos asociados (flete, desaduanaje, impuestos
--         SUNAT). Hoy si se "recibe" inmediatamente al pagar, el inventario
--         queda con costo crudo del proveedor — sin landed cost — inflando
--         los márgenes ~50%.
--
-- Cambios:
--   1. Nuevo estado EN_TRANSITO entre PAGO y RECEPCION en OrdenesCompra.estado.
--      Solo aplica para ALMACEN. La OC ya está pagada al proveedor; la
--      mercancía está en barco/aduana; NO entra al inventario hasta
--      "cerrar importación".
--
--   2. Nueva columna oc_madre_id (FK self-reference). Permite vincular OCs
--      satélite (flete, desaduanaje, impuestos) a una OC ALMACEN madre.
--      Hoy NO existe esta relación entre OCs.
--
--   3. Nueva columna landed_costed_at (timestamp del cierre). NULL = la OC
--      fue recibida con costo crudo (flujo normal). NOT NULL = se cerró
--      con prorrateo de gastos al inventario.
--
--   4. Nueva tabla ImportacionGastoSnapshot — congela el desglose de costos
--      al momento del cierre. Mantiene trazabilidad aunque después se
--      modifiquen/eliminen las OCs satélite.
--
-- Postgres (Supabase). Idempotente.

-- ─── 1. Nuevo estado EN_TRANSITO ──────────────────────────────────────
ALTER TABLE OrdenesCompra DROP CONSTRAINT IF EXISTS ordenescompra_estado_check;

ALTER TABLE OrdenesCompra
  ADD CONSTRAINT ordenescompra_estado_check
  CHECK (estado IN (
    'BORRADOR','APROBADA','PAGO','EN_TRANSITO','RECEPCION','FACTURACION','TERMINADA',
    'CERRADA_SIN_FACTURA','ANULADA'
  ));

-- ─── 2. FK self-reference + timestamp landed cost ─────────────────────
ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS oc_madre_id      INT       NULL REFERENCES OrdenesCompra(id_oc) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS landed_costed_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_oc_madre_id ON OrdenesCompra(oc_madre_id);

-- ─── 3. Tabla de snapshot — congela desglose al cerrar importación ────
CREATE TABLE IF NOT EXISTS ImportacionGastoSnapshot (
  id_snapshot     SERIAL PRIMARY KEY,
  id_oc_madre     INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  id_oc_satelite  INT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE SET NULL,
  concepto        VARCHAR(200) NOT NULL,
  monto_pen       DECIMAL(14,2) NOT NULL,
  monto_orig      DECIMAL(14,2) NULL,
  moneda_orig     VARCHAR(3)    NULL,
  tipo_cambio     DECIMAL(10,4) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_impsnap_madre ON ImportacionGastoSnapshot(id_oc_madre);

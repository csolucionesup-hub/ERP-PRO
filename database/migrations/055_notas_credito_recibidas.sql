-- MIGRACIÓN: Notas de Crédito RECIBIDAS del proveedor
-- Fecha: 2026-05-03
-- Motivo: Hasta ahora NotasCredito (mig 026) modelaba NCs SALIENTES — las
--         que Metal Engineers emite a SUNAT vía Nubefact. Faltaba el caso
--         más común en el día a día: NCs ENTRANTES que el proveedor envía
--         por devolución total/parcial, descuento, error de RUC, etc.
--
-- Diseño:
--   Reusamos la misma tabla NotasCredito y agregamos:
--     - direccion ENUM('EMITIDA','RECIBIDA') — 'EMITIDA' default para no
--       romper datos existentes; 'RECIBIDA' para las nuevas del proveedor.
--     - proveedor_ruc / proveedor_razon_social — snapshot del emisor
--       cuando direccion='RECIBIDA' (en EMITIDA, el cliente_* ya cubre).
--     - id_compra_referencia / id_gasto_referencia — vínculo a la Compra
--       o Gasto que la NC ajusta. Una NC entrante siempre apunta a un
--       documento de costo previo (la factura del proveedor que ya
--       registramos como Compra o Gasto).
--
-- Comportamiento al registrar una NC entrante:
--   1. INSERT NotasCredito con direccion='RECIBIDA', estado_sunat='REGISTRADA'
--      (no la emitimos nosotros — la entregó el proveedor con su firma).
--   2. INSERT DetalleNotaCredito por cada línea ajustada.
--   3. Si vincula a Compra: rebajar Compra.total_base y crear Tx ajuste.
--      Si vincula a Gasto: rebajar Gasto.total_base + actualizar estado_pago.
--   4. Eliminar la NC revierte ambos pasos en transacción.
--
-- Postgres (Supabase): aplicar vía MCP. Idempotente con IF NOT EXISTS.

-- ── 1. Columna dirección ────────────────────────────────────
ALTER TABLE NotasCredito
  ADD COLUMN IF NOT EXISTS direccion VARCHAR(10) NOT NULL DEFAULT 'EMITIDA';

ALTER TABLE NotasCredito
  DROP CONSTRAINT IF EXISTS chk_nc_direccion;
ALTER TABLE NotasCredito
  ADD CONSTRAINT chk_nc_direccion
  CHECK (direccion IN ('EMITIDA','RECIBIDA'));

-- ── 2. Snapshot del proveedor emisor (solo aplica para direccion='RECIBIDA') ──
ALTER TABLE NotasCredito
  ADD COLUMN IF NOT EXISTS proveedor_ruc VARCHAR(15);
ALTER TABLE NotasCredito
  ADD COLUMN IF NOT EXISTS proveedor_razon_social VARCHAR(200);

-- ── 3. Vínculo a la Compra o Gasto que se ajusta ──────────
ALTER TABLE NotasCredito
  ADD COLUMN IF NOT EXISTS id_compra_referencia INT NULL;
ALTER TABLE NotasCredito
  ADD COLUMN IF NOT EXISTS id_gasto_referencia INT NULL;

-- FKs (con DROP IF EXISTS por idempotencia)
ALTER TABLE NotasCredito
  DROP CONSTRAINT IF EXISTS fk_nc_compra_referencia;
ALTER TABLE NotasCredito
  ADD CONSTRAINT fk_nc_compra_referencia
  FOREIGN KEY (id_compra_referencia) REFERENCES Compras(id_compra) ON DELETE SET NULL;

ALTER TABLE NotasCredito
  DROP CONSTRAINT IF EXISTS fk_nc_gasto_referencia;
ALTER TABLE NotasCredito
  ADD CONSTRAINT fk_nc_gasto_referencia
  FOREIGN KEY (id_gasto_referencia) REFERENCES Gastos(id_gasto) ON DELETE SET NULL;

-- ── 4. Índices auxiliares ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_nc_direccion ON NotasCredito(direccion);
CREATE INDEX IF NOT EXISTS idx_nc_compra_ref ON NotasCredito(id_compra_referencia);
CREATE INDEX IF NOT EXISTS idx_nc_gasto_ref ON NotasCredito(id_gasto_referencia);
CREATE INDEX IF NOT EXISTS idx_nc_proveedor_ruc ON NotasCredito(proveedor_ruc);

-- ── 5. Extender CHECK de estado_sunat para aceptar 'REGISTRADA' ──
-- (las NCs RECIBIDAS no pasan por nuestro Nubefact, ya vienen firmadas
--  por el proveedor; 'REGISTRADA' = "asentada en nuestro libro").
ALTER TABLE NotasCredito
  DROP CONSTRAINT IF EXISTS chk_nc_estado_sunat;
ALTER TABLE NotasCredito
  ADD CONSTRAINT chk_nc_estado_sunat
  CHECK (estado_sunat IN (
    'SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR','REGISTRADA'
  ));

-- ── 6. Aliviar UNIQUE serie+numero — solo aplica a EMITIDAS ────
-- En NCs RECIBIDAS la serie+numero es la del proveedor; perfectamente
-- pueden existir dos proveedores con la misma serie "FC01-1234". Por eso
-- el UNIQUE original (uk_nota_credito) se reemplaza por uno parcial que
-- solo aplica a 'EMITIDA'.
ALTER TABLE NotasCredito
  DROP CONSTRAINT IF EXISTS uk_nota_credito;

CREATE UNIQUE INDEX IF NOT EXISTS uk_nc_emitida
  ON NotasCredito (serie, numero)
  WHERE direccion = 'EMITIDA';

-- Para RECIBIDAS, evitar duplicado por proveedor: serie+numero+RUC del
-- proveedor debe ser único.
CREATE UNIQUE INDEX IF NOT EXISTS uk_nc_recibida
  ON NotasCredito (proveedor_ruc, serie, numero)
  WHERE direccion = 'RECIBIDA';

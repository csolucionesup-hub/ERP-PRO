-- MIGRACIÓN 065: Multifirma para Órdenes de Compra
-- Fecha: 2026-05-08
-- Motivo: Estado APROBADA hoy se alcanza con 1 sola firma (GERENTE/APROBADOR).
--         Para audit y compliance Julio quiere multifirma estilo Rendiciones:
--         3 casilleros (PREPARADO POR / REVISADO POR / AUTORIZADO POR) y reglas
--         configurables que decidan cuántas firmas se requieren según monto y
--         centro de costo. Mientras se firma, la OC sigue en BORRADOR; cuando
--         se alcanza el umbral, pasa automáticamente a APROBADA.
--
-- Compat:
--   - Si la regla default es "1 firma siempre", el comportamiento actual se
--     preserva: GERENTE/APROBADOR firma una vez y pasa a APROBADA.
--   - El método aprobar() existente queda como wrapper que firma los 3
--     casilleros con el mismo usuario (atajo "todo en uno" para GERENTE).
--   - id_usuario_aprueba + fecha_aprobacion existentes NO se borran (audit
--     legacy + compat con consumidores que no migraron).
--
-- Postgres (Supabase). Aplicar vía MCP.

-- 1. Columnas de firmas en OrdenesCompra (mismo patrón que Rendiciones)
ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS preparado_por_id  INT REFERENCES Usuarios(id_usuario),
  ADD COLUMN IF NOT EXISTS preparado_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revisado_por_id   INT REFERENCES Usuarios(id_usuario),
  ADD COLUMN IF NOT EXISTS revisado_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS autorizado_por_id INT REFERENCES Usuarios(id_usuario),
  ADD COLUMN IF NOT EXISTS autorizado_at     TIMESTAMPTZ;

-- 2. Tabla de reglas de firmas requeridas
-- Resolución: la regla con mayor `prioridad` que matchee (centro_costo IN
-- {regla.centro_costo, NULL} AND monto IN [min, max]) gana. Por defecto la
-- regla más específica tiene mayor prioridad — Julio la edita en UI.
CREATE TABLE IF NOT EXISTS OCFirmasReglas (
  id_regla            SERIAL PRIMARY KEY,
  centro_costo        VARCHAR(50),                         -- NULL = aplica a todos los centros
  monto_min           DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_max           DECIMAL(14,2),                       -- NULL = sin tope
  firmas_requeridas   INT NOT NULL CHECK (firmas_requeridas BETWEEN 1 AND 3),
  prioridad           INT NOT NULL DEFAULT 0,
  activo              BOOLEAN DEFAULT TRUE,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_firmas_reglas_activo
  ON OCFirmasReglas(activo, prioridad DESC);

-- 3. Regla default: 1 firma para todo (preserva comportamiento actual)
-- Julio puede cambiarla / agregar reglas más específicas desde Configuración.
INSERT INTO OCFirmasReglas (centro_costo, monto_min, monto_max, firmas_requeridas, prioridad, observaciones)
SELECT NULL, 0, NULL, 1, 0, 'Regla default: 1 firma para todo (creada por mig 065)'
 WHERE NOT EXISTS (SELECT 1 FROM OCFirmasReglas);

-- 4. Para OCs ya en APROBADA o posteriores: backfill autorizado_por_id desde
-- id_usuario_aprueba para mantener trazabilidad histórica visible en la nueva
-- UI. preparado_por_id y revisado_por_id quedan NULL (no había concepto antes).
UPDATE OrdenesCompra
   SET autorizado_por_id = id_usuario_aprueba,
       autorizado_at     = fecha_aprobacion
 WHERE estado <> 'BORRADOR'
   AND id_usuario_aprueba IS NOT NULL
   AND autorizado_por_id  IS NULL;

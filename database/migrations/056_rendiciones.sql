-- MIGRACIÓN: Rendición de Gastos por OC
-- Fecha: 2026-05-04
-- Motivo: Caso de uso interno de Metal Engineers — tras aprobar y pagar
--         una OC (típicamente un reembolso a un colaborador para que
--         compre items en efectivo), el responsable arma una RENDICIÓN
--         consolidando comprobantes (facturas/boletas) que respaldan
--         el uso del fondo asignado. Tres firmas: PREPARADO / REVISADO
--         / AUTORIZADO. Se exporta PDF como expediente.
--
-- Decisiones (definidas con Julio el 04/05/2026):
--   1. Una OC = una rendición (id_oc UNIQUE).
--   2. Cualquier usuario puede firmar cualquier casillero (auditado
--      con id_usuario + fecha en cada firma).
--   3. Adjuntos como referencia visual — NO crean Compras/Gastos
--      automáticos en BD (Opción A del plan).
--   4. La rendición usa la numeración de la OC (no correlativo propio).
--
-- Postgres (Supabase): aplicar vía MCP. Idempotente con IF NOT EXISTS.

-- ── 1. Cabecera de rendición ─────────────────────────────────
CREATE TABLE IF NOT EXISTS Rendiciones (
  id_rendicion          SERIAL PRIMARY KEY,
  id_oc                 INT NOT NULL UNIQUE,                -- 1:1 con OC

  -- Datos snapshot al momento de crear (la OC puede editarse después)
  nro_oc_referencia     VARCHAR(50)  NOT NULL,             -- snapshot OC.nro_oc
  centro_costo          VARCHAR(100) NOT NULL,
  proyecto              VARCHAR(150),
  importe_recibido      NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda                VARCHAR(3)    NOT NULL DEFAULT 'PEN',

  -- Datos de la transferencia bancaria que originó el fondo
  banco                 VARCHAR(100),
  nro_operacion         VARCHAR(50),
  fecha_operacion       DATE,

  -- Responsables
  cuenta_a_cargo_de_id  INT,                                -- FK Usuarios
  cargo                 VARCHAR(100),                       -- ADMINISTRADOR, LOGISTICO, etc.
  fecha_rendicion       DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Resumen calculado (denormalizado para velocidad — recalc al guardar)
  saldo_anterior        NUMERIC(14,2) DEFAULT 0,
  fondo_asignado        NUMERIC(14,2) DEFAULT 0,             -- = importe_recibido + saldo_anterior
  total_gastos          NUMERIC(14,2) DEFAULT 0,
  saldo_disponible      NUMERIC(14,2) DEFAULT 0,             -- = fondo_asignado - total_gastos

  -- 3 firmas (cada una: id usuario que firmó + fecha)
  preparado_por_id      INT,
  preparado_at          TIMESTAMP,
  revisado_por_id       INT,
  revisado_at           TIMESTAMP,
  autorizado_por_id     INT,
  autorizado_at         TIMESTAMP,

  -- Estado lógico
  estado                VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
  observaciones         TEXT,

  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rendicion_estado
    CHECK (estado IN ('BORRADOR','EN_REVISION','AUTORIZADA','CERRADA','ANULADA')),
  CONSTRAINT chk_rendicion_moneda
    CHECK (moneda IN ('PEN','USD'))
);

ALTER TABLE Rendiciones
  DROP CONSTRAINT IF EXISTS fk_rendicion_oc;
ALTER TABLE Rendiciones
  ADD CONSTRAINT fk_rendicion_oc
  FOREIGN KEY (id_oc) REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE;

ALTER TABLE Rendiciones
  DROP CONSTRAINT IF EXISTS fk_rendicion_cargo_de;
ALTER TABLE Rendiciones
  ADD CONSTRAINT fk_rendicion_cargo_de
  FOREIGN KEY (cuenta_a_cargo_de_id) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE Rendiciones
  DROP CONSTRAINT IF EXISTS fk_rendicion_preparado_por;
ALTER TABLE Rendiciones
  ADD CONSTRAINT fk_rendicion_preparado_por
  FOREIGN KEY (preparado_por_id) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE Rendiciones
  DROP CONSTRAINT IF EXISTS fk_rendicion_revisado_por;
ALTER TABLE Rendiciones
  ADD CONSTRAINT fk_rendicion_revisado_por
  FOREIGN KEY (revisado_por_id) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE Rendiciones
  DROP CONSTRAINT IF EXISTS fk_rendicion_autorizado_por;
ALTER TABLE Rendiciones
  ADD CONSTRAINT fk_rendicion_autorizado_por
  FOREIGN KEY (autorizado_por_id) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rendicion_oc        ON Rendiciones(id_oc);
CREATE INDEX IF NOT EXISTS idx_rendicion_estado    ON Rendiciones(estado);
CREATE INDEX IF NOT EXISTS idx_rendicion_fecha     ON Rendiciones(fecha_rendicion);

-- ── 2. Items de la rendición (líneas de la tabla de gastos) ──
CREATE TABLE IF NOT EXISTS RendicionItems (
  id_item               SERIAL PRIMARY KEY,
  id_rendicion          INT NOT NULL,
  orden                 INT NOT NULL DEFAULT 1,
  fecha                 DATE NOT NULL,
  nro_documento         VARCHAR(50),                        -- F004-0052624 / EB01-419
  beneficiario          VARCHAR(200),                       -- razón social proveedor
  concepto              VARCHAR(200) NOT NULL,              -- HERRAMIENTAS, ALMUERZO, etc.
  subtotal              NUMERIC(14,4) NOT NULL DEFAULT 0,
  igv                   NUMERIC(14,4) NOT NULL DEFAULT 0,
  importe_total         NUMERIC(14,4) NOT NULL DEFAULT 0,
  observaciones         TEXT,

  -- Vínculos opcionales si el item ya existe en Compras/Gastos
  id_compra_referencia  INT,
  id_gasto_referencia   INT,

  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE RendicionItems
  DROP CONSTRAINT IF EXISTS fk_rendicion_item_rendicion;
ALTER TABLE RendicionItems
  ADD CONSTRAINT fk_rendicion_item_rendicion
  FOREIGN KEY (id_rendicion) REFERENCES Rendiciones(id_rendicion) ON DELETE CASCADE;

ALTER TABLE RendicionItems
  DROP CONSTRAINT IF EXISTS fk_rendicion_item_compra;
ALTER TABLE RendicionItems
  ADD CONSTRAINT fk_rendicion_item_compra
  FOREIGN KEY (id_compra_referencia) REFERENCES Compras(id_compra) ON DELETE SET NULL;

ALTER TABLE RendicionItems
  DROP CONSTRAINT IF EXISTS fk_rendicion_item_gasto;
ALTER TABLE RendicionItems
  ADD CONSTRAINT fk_rendicion_item_gasto
  FOREIGN KEY (id_gasto_referencia) REFERENCES Gastos(id_gasto) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rendicion_item_rendicion ON RendicionItems(id_rendicion);

-- ── 3. Adjuntos (Cloudinary URLs) ─────────────────────────────
CREATE TABLE IF NOT EXISTS RendicionAdjuntos (
  id_adjunto            SERIAL PRIMARY KEY,
  id_rendicion          INT NOT NULL,
  tipo                  VARCHAR(30) NOT NULL DEFAULT 'OTRO',  -- CONSTANCIA, FACTURA, BOLETA, OC, COMPROBANTE, OTRO
  url                   VARCHAR(500) NOT NULL,                 -- Cloudinary
  public_id             VARCHAR(200),                          -- para borrar de Cloudinary si se elimina
  nombre_archivo        VARCHAR(200),
  mime_type             VARCHAR(50),
  tamano_bytes          INT,
  subido_por_id         INT,
  subido_at             TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rendicion_adjunto_tipo
    CHECK (tipo IN ('CONSTANCIA','FACTURA','BOLETA','OC','COMPROBANTE','OTRO'))
);

ALTER TABLE RendicionAdjuntos
  DROP CONSTRAINT IF EXISTS fk_rendicion_adjunto_rendicion;
ALTER TABLE RendicionAdjuntos
  ADD CONSTRAINT fk_rendicion_adjunto_rendicion
  FOREIGN KEY (id_rendicion) REFERENCES Rendiciones(id_rendicion) ON DELETE CASCADE;

ALTER TABLE RendicionAdjuntos
  DROP CONSTRAINT IF EXISTS fk_rendicion_adjunto_usuario;
ALTER TABLE RendicionAdjuntos
  ADD CONSTRAINT fk_rendicion_adjunto_usuario
  FOREIGN KEY (subido_por_id) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rendicion_adjunto_rendicion ON RendicionAdjuntos(id_rendicion);
CREATE INDEX IF NOT EXISTS idx_rendicion_adjunto_tipo      ON RendicionAdjuntos(tipo);

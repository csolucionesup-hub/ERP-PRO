-- ============================================================
-- Migración 013: Módulo Finanzas v2 — Cobranzas + Conciliación
-- Fecha: 2026-04-15
--
-- Objetivos:
--   1. Agregar estado_financiero a Cotizaciones (paralelo al estado comercial)
--   2. Tabla CobranzasCotizacion: cada movimiento de cobro (banco regular y BN)
--   3. Tabla MovimientoBancario: extracto bancario para conciliación
--   4. Tabla GastoBancario: ITF, comisiones, portes, etc.
-- ============================================================

-- 1. Estado financiero en Cotizaciones (paralelo al estado comercial)
ALTER TABLE Cotizaciones
  ADD COLUMN estado_financiero ENUM(
    'PENDIENTE_DEPOSITO',
    'BANCO_PARCIAL',
    'BANCO_OK_DETRACCION_PENDIENTE',
    'FONDEADA_TOTAL',
    'SIN_DETRACCION_FONDEADA',
    'FACTURADA',
    'COBRADA',
    'NA'
  ) NOT NULL DEFAULT 'NA';

-- 'NA' = la cotización no ha sido APROBADA aún (no aplica seguimiento financiero)
-- Cuando Comercial pasa a APROBADA, se setea a PENDIENTE_DEPOSITO

-- Columna acumuladora para cálculos rápidos (denormalizada, se actualiza por triggers/servicio)
ALTER TABLE Cotizaciones
  ADD COLUMN monto_cobrado_banco DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN monto_cobrado_detraccion DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN fecha_aprobacion_finanzas DATETIME NULL;

-- 2. Cobranzas: cada fila es UN movimiento (puede haber varios por cotización)
CREATE TABLE CobranzasCotizacion (
  id_cobranza        INT PRIMARY KEY AUTO_INCREMENT,
  id_cotizacion      INT NOT NULL,
  tipo               ENUM('DEPOSITO_BANCO','DETRACCION_BN','RETENCION') NOT NULL,
  fecha_movimiento   DATE NOT NULL,
  id_cuenta          INT NULL,                  -- A qué Cuenta nuestra entró
  banco              VARCHAR(80) NULL,           -- Banco del cliente o banco destino
  nro_operacion      VARCHAR(50) NULL,
  monto              DECIMAL(12,2) NOT NULL,
  moneda             VARCHAR(3)  NOT NULL DEFAULT 'PEN',
  tipo_cambio        DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  voucher_url        VARCHAR(500) NULL,
  comentario         TEXT NULL,
  registrado_por     INT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cobranza_cot     FOREIGN KEY (id_cotizacion) REFERENCES Cotizaciones(id_cotizacion) ON DELETE CASCADE,
  CONSTRAINT fk_cobranza_cuenta  FOREIGN KEY (id_cuenta)     REFERENCES Cuentas(id_cuenta)         ON DELETE SET NULL,
  CONSTRAINT fk_cobranza_usuario FOREIGN KEY (registrado_por) REFERENCES Usuarios(id_usuario)      ON DELETE SET NULL,
  INDEX idx_cob_cotizacion (id_cotizacion),
  INDEX idx_cob_fecha (fecha_movimiento),
  INDEX idx_cob_tipo (tipo)
);

-- 3. Movimientos bancarios (extracto importado o cargado manual)
CREATE TABLE MovimientoBancario (
  id_movimiento       INT PRIMARY KEY AUTO_INCREMENT,
  id_cuenta           INT NOT NULL,
  fecha               DATE NOT NULL,
  descripcion_banco   VARCHAR(255) NOT NULL,
  monto               DECIMAL(12,2) NOT NULL,
  tipo                ENUM('ABONO','CARGO') NOT NULL,
  estado_conciliacion ENUM('POR_CONCILIAR','CONCILIADO','IGNORADO') NOT NULL DEFAULT 'POR_CONCILIAR',
  ref_tipo            ENUM('COBRANZA','COMPRA','GASTO','GASTO_BANCARIO','TRASPASO','OTRO') NULL,
  ref_id              INT NULL,
  comentario          TEXT NULL,
  conciliado_por      INT NULL,
  conciliado_at       DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_cuenta   FOREIGN KEY (id_cuenta)      REFERENCES Cuentas(id_cuenta)  ON DELETE CASCADE,
  CONSTRAINT fk_mov_usuario  FOREIGN KEY (conciliado_por) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL,
  INDEX idx_mov_cuenta_fecha (id_cuenta, fecha),
  INDEX idx_mov_estado       (estado_conciliacion)
);

-- 4. Gastos bancarios (ITF, comisiones, portes)
CREATE TABLE GastoBancario (
  id_gasto_bancario INT PRIMARY KEY AUTO_INCREMENT,
  id_cuenta         INT NOT NULL,
  fecha             DATE NOT NULL,
  categoria         ENUM('ITF','COMISION_MANT','COMISION_TC','PORTES','OTROS') NOT NULL,
  concepto          VARCHAR(200) NOT NULL,
  monto             DECIMAL(12,2) NOT NULL,
  moneda            VARCHAR(3)  NOT NULL DEFAULT 'PEN',
  tipo_cambio       DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  comentario        TEXT NULL,
  registrado_por    INT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gb_cuenta  FOREIGN KEY (id_cuenta)      REFERENCES Cuentas(id_cuenta)   ON DELETE CASCADE,
  CONSTRAINT fk_gb_usuario FOREIGN KEY (registrado_por) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL,
  INDEX idx_gb_cuenta_fecha (id_cuenta, fecha),
  INDEX idx_gb_categoria    (categoria)
);

-- 5. Marcar cotizaciones ya APROBADAS como pendientes de depósito (back-fill)
UPDATE Cotizaciones
   SET estado_financiero = 'PENDIENTE_DEPOSITO'
 WHERE estado IN ('APROBADA','TERMINADA') AND estado_financiero = 'NA';

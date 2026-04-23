-- 026_notas_credito_debito.sql
-- Notas de Crédito (07) y Notas de Débito (08) según tabla SUNAT.
--
-- Nota de Crédito — motivos (codigo_motivo):
--   01: Anulación de la operación
--   02: Anulación por error en el RUC
--   03: Corrección por error en la descripción
--   04: Descuento global
--   05: Descuento por ítem
--   06: Devolución total
--   07: Devolución por ítem
--   08: Bonificación
--   09: Disminución en el valor
--   10: Otros
--
-- Nota de Débito — motivos:
--   01: Intereses por mora
--   02: Aumento en el valor
--   03: Penalidades / otros conceptos
--   10: Ajustes operativos (REMP/EMPE)
--   11: Ajustes afectos al IVAP

CREATE TABLE IF NOT EXISTS NotasCredito (
  id_nota               INT PRIMARY KEY AUTO_INCREMENT,
  serie                 VARCHAR(5) NOT NULL,
  numero                INT NOT NULL,
  fecha_emision         DATE NOT NULL,

  -- Documento que modifica
  tipo_doc_referencia   ENUM('FACTURA','BOLETA') NOT NULL,
  id_factura_referencia INT NULL,
  serie_referencia      VARCHAR(5) NOT NULL,
  numero_referencia     INT NOT NULL,

  motivo_codigo         VARCHAR(2) NOT NULL,
  motivo_descripcion    VARCHAR(200) NOT NULL,

  -- Cliente (snapshot)
  cliente_tipo_doc      ENUM('DNI','CE','RUC','PASAPORTE') NOT NULL,
  cliente_numero_doc    VARCHAR(15) NOT NULL,
  cliente_razon_social  VARCHAR(200) NOT NULL,

  -- Montos (positivos — la naturaleza de NC es disminuir)
  moneda                ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
  tipo_cambio           DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
  subtotal              DECIMAL(14,2) NOT NULL,
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  -- Estado SUNAT
  estado_sunat          ENUM('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')
                        NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat          VARCHAR(20),
  descripcion_sunat     VARCHAR(500),

  xml_url               VARCHAR(500),
  pdf_url               VARCHAR(500),
  cdr_url               VARCHAR(500),

  id_usuario_emisor     INT,
  observaciones         VARCHAR(500),

  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_nota_credito (serie, numero),
  INDEX idx_nc_referencia (id_factura_referencia),
  INDEX idx_nc_fecha (fecha_emision),
  INDEX idx_nc_estado (estado_sunat),

  CONSTRAINT fk_nc_factura FOREIGN KEY (id_factura_referencia)
    REFERENCES Facturas(id_factura) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detalle de la NC (puede ser diferente del detalle de la factura original)
CREATE TABLE IF NOT EXISTS DetalleNotaCredito (
  id_detalle            INT PRIMARY KEY AUTO_INCREMENT,
  id_nota               INT NOT NULL,
  orden                 INT NOT NULL DEFAULT 1,
  codigo_item           VARCHAR(50),
  descripcion           VARCHAR(500) NOT NULL,
  unidad_sunat          VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad              DECIMAL(14,4) NOT NULL,
  precio_unitario       DECIMAL(14,4) NOT NULL,
  subtotal              DECIMAL(14,2) NOT NULL,
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  INDEX idx_detalle_nc (id_nota),
  CONSTRAINT fk_detalle_nc FOREIGN KEY (id_nota)
    REFERENCES NotasCredito(id_nota) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notas de Débito: estructura idéntica a NC pero naturaleza de aumento
CREATE TABLE IF NOT EXISTS NotasDebito (
  id_nota               INT PRIMARY KEY AUTO_INCREMENT,
  serie                 VARCHAR(5) NOT NULL,
  numero                INT NOT NULL,
  fecha_emision         DATE NOT NULL,

  tipo_doc_referencia   ENUM('FACTURA','BOLETA') NOT NULL,
  id_factura_referencia INT NULL,
  serie_referencia      VARCHAR(5) NOT NULL,
  numero_referencia     INT NOT NULL,

  motivo_codigo         VARCHAR(2) NOT NULL,
  motivo_descripcion    VARCHAR(200) NOT NULL,

  cliente_tipo_doc      ENUM('DNI','CE','RUC','PASAPORTE') NOT NULL,
  cliente_numero_doc    VARCHAR(15) NOT NULL,
  cliente_razon_social  VARCHAR(200) NOT NULL,

  moneda                ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
  tipo_cambio           DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
  subtotal              DECIMAL(14,2) NOT NULL,
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  estado_sunat          ENUM('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')
                        NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat          VARCHAR(20),
  descripcion_sunat     VARCHAR(500),
  xml_url               VARCHAR(500),
  pdf_url               VARCHAR(500),
  cdr_url               VARCHAR(500),

  id_usuario_emisor     INT,
  observaciones         VARCHAR(500),

  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_nota_debito (serie, numero),
  INDEX idx_nd_referencia (id_factura_referencia),
  INDEX idx_nd_fecha (fecha_emision),

  CONSTRAINT fk_nd_factura FOREIGN KEY (id_factura_referencia)
    REFERENCES Facturas(id_factura) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS DetalleNotaDebito (
  id_detalle            INT PRIMARY KEY AUTO_INCREMENT,
  id_nota               INT NOT NULL,
  orden                 INT NOT NULL DEFAULT 1,
  codigo_item           VARCHAR(50),
  descripcion           VARCHAR(500) NOT NULL,
  unidad_sunat          VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad              DECIMAL(14,4) NOT NULL,
  precio_unitario       DECIMAL(14,4) NOT NULL,
  subtotal              DECIMAL(14,2) NOT NULL,
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  INDEX idx_detalle_nd (id_nota),
  CONSTRAINT fk_detalle_nd FOREIGN KEY (id_nota)
    REFERENCES NotasDebito(id_nota) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

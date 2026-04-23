-- 025_facturas.sql — Facturas y Boletas Electrónicas SUNAT
-- Cada fila representa un comprobante electrónico emitido (o pendiente).
-- El modo STUB (sin certificado) genera filas con estado 'SIMULADO' y sin URL CDR.
-- El modo REAL (Fase B activa) genera 'ACEPTADA'/'RECHAZADA'/'OBSERVADA' según SUNAT.

CREATE TABLE IF NOT EXISTS Facturas (
  id_factura            INT PRIMARY KEY AUTO_INCREMENT,
  tipo                  ENUM('FACTURA','BOLETA') NOT NULL,
  serie                 VARCHAR(5) NOT NULL,
  numero                INT NOT NULL,
  fecha_emision         DATE NOT NULL,
  fecha_vencimiento     DATE NULL,

  -- Cliente (snapshot al momento de emitir — no FK para preservar histórico si se edita el cliente)
  cliente_tipo_doc      ENUM('DNI','CE','RUC','PASAPORTE') NOT NULL,
  cliente_numero_doc    VARCHAR(15) NOT NULL,
  cliente_razon_social  VARCHAR(200) NOT NULL,
  cliente_direccion     VARCHAR(300),
  cliente_email         VARCHAR(150),

  -- Montos
  moneda                ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
  tipo_cambio           DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
  subtotal              DECIMAL(14,2) NOT NULL,
  descuento_global      DECIMAL(14,2) NOT NULL DEFAULT 0,
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  -- Forma de pago
  forma_pago            ENUM('CONTADO','CREDITO') NOT NULL DEFAULT 'CONTADO',
  dias_credito          INT NOT NULL DEFAULT 0,

  -- Detracción (para servicios >S/700)
  aplica_detraccion     TINYINT(1) NOT NULL DEFAULT 0,
  porcentaje_detraccion DECIMAL(5,2) DEFAULT 0,
  monto_detraccion      DECIMAL(14,2) DEFAULT 0,
  codigo_servicio_spot  VARCHAR(10),

  -- Relación con Cotización origen
  id_cotizacion         INT NULL,

  -- Estado SUNAT
  estado_sunat          ENUM('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')
                        NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat          VARCHAR(20),
  descripcion_sunat     VARCHAR(500),

  -- Enlaces que devuelve el OSE (Nubefact)
  xml_url               VARCHAR(500),
  pdf_url               VARCHAR(500),
  cdr_url               VARCHAR(500),
  cadena_qr             TEXT,

  -- Usuario que emitió
  id_usuario_emisor     INT,

  observaciones         VARCHAR(500),

  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_factura_serie_nro (tipo, serie, numero),
  INDEX idx_facturas_fecha (fecha_emision),
  INDEX idx_facturas_cliente_doc (cliente_numero_doc),
  INDEX idx_facturas_estado (estado_sunat),
  INDEX idx_facturas_cotizacion (id_cotizacion),

  CONSTRAINT fk_facturas_cotizacion FOREIGN KEY (id_cotizacion)
    REFERENCES Cotizaciones(id_cotizacion) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detalle línea por línea (items facturados)
CREATE TABLE IF NOT EXISTS DetalleFactura (
  id_detalle            INT PRIMARY KEY AUTO_INCREMENT,
  id_factura            INT NOT NULL,
  orden                 INT NOT NULL DEFAULT 1,
  codigo_item           VARCHAR(50),
  descripcion           VARCHAR(500) NOT NULL,
  unidad_sunat          VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad              DECIMAL(14,4) NOT NULL,
  precio_unitario       DECIMAL(14,4) NOT NULL,
  subtotal              DECIMAL(14,2) NOT NULL,
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  INDEX idx_detalle_factura (id_factura),
  CONSTRAINT fk_detalle_factura FOREIGN KEY (id_factura)
    REFERENCES Facturas(id_factura) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

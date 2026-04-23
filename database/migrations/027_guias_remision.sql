-- 027_guias_remision.sql — Guías de Remisión Electrónicas
--
-- Motivos de traslado (codigo_motivo) según SUNAT:
--   01: Venta
--   02: Venta con entrega a terceros
--   04: Traslado entre establecimientos de la misma empresa
--   08: Importación
--   09: Exportación
--   13: Otros

CREATE TABLE IF NOT EXISTS GuiasRemision (
  id_guia               INT PRIMARY KEY AUTO_INCREMENT,
  serie                 VARCHAR(5) NOT NULL,
  numero                INT NOT NULL,
  fecha_emision         DATE NOT NULL,
  fecha_traslado        DATE NOT NULL,

  -- Motivo del traslado
  motivo_codigo         VARCHAR(2) NOT NULL,
  motivo_descripcion    VARCHAR(200) NOT NULL,

  -- Destinatario
  destinatario_tipo_doc ENUM('DNI','CE','RUC','PASAPORTE') NOT NULL,
  destinatario_num_doc  VARCHAR(15) NOT NULL,
  destinatario_razon    VARCHAR(200) NOT NULL,

  -- Direcciones
  punto_partida         VARCHAR(300) NOT NULL,
  punto_llegada         VARCHAR(300) NOT NULL,
  ubigeo_partida        VARCHAR(6),
  ubigeo_llegada        VARCHAR(6),

  -- Transporte
  modalidad_transporte  ENUM('PRIVADO','PUBLICO') NOT NULL DEFAULT 'PRIVADO',
  transportista_ruc     VARCHAR(11),
  transportista_razon   VARCHAR(200),
  conductor_dni         VARCHAR(12),
  conductor_nombre      VARCHAR(200),
  conductor_licencia    VARCHAR(20),
  placa_vehiculo        VARCHAR(10),

  -- Mercadería
  peso_total_bruto      DECIMAL(10,3) NOT NULL,
  unidad_peso           VARCHAR(5) NOT NULL DEFAULT 'KGM',
  numero_bultos         INT NOT NULL DEFAULT 1,

  -- Relación con factura/venta
  id_factura_referencia INT NULL,

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

  UNIQUE KEY uk_guia (serie, numero),
  INDEX idx_guia_fecha (fecha_emision),
  INDEX idx_guia_traslado (fecha_traslado),
  INDEX idx_guia_factura (id_factura_referencia),
  INDEX idx_guia_estado (estado_sunat),

  CONSTRAINT fk_guia_factura FOREIGN KEY (id_factura_referencia)
    REFERENCES Facturas(id_factura) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS DetalleGuiaRemision (
  id_detalle            INT PRIMARY KEY AUTO_INCREMENT,
  id_guia               INT NOT NULL,
  orden                 INT NOT NULL DEFAULT 1,
  codigo_item           VARCHAR(50),
  descripcion           VARCHAR(500) NOT NULL,
  unidad_sunat          VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad              DECIMAL(14,4) NOT NULL,

  INDEX idx_detalle_guia (id_guia),
  CONSTRAINT fk_detalle_guia FOREIGN KEY (id_guia)
    REFERENCES GuiasRemision(id_guia) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

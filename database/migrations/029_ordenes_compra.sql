-- 029_ordenes_compra.sql
-- Órdenes de Compra (OC) — documento formal que Metal Engineers envía al proveedor.
-- Sigue el estándar de ERPs mundiales (SAP B1, Odoo, Epicor).
--
-- Ciclo de vida de una OC:
--   BORRADOR → APROBADA → ENVIADA → RECIBIDA_PARCIAL → RECIBIDA → FACTURADA → PAGADA
--             (puede: ANULADA en cualquier paso previo a FACTURADA)
--
-- Conversión al flujo existente:
--   OC RECIBIDA + factura del proveedor → genera registro en tabla Compras
--   (la OC queda enlazada con id_compra_generada para trazabilidad)

CREATE TABLE IF NOT EXISTS OrdenesCompra (
  id_oc                 INT PRIMARY KEY AUTO_INCREMENT,
  nro_oc                VARCHAR(30) NOT NULL,
  fecha_emision         DATE NOT NULL,
  fecha_entrega_esperada DATE NULL,

  -- Proveedor
  id_proveedor          INT NOT NULL,

  -- Proyecto / centro de costo
  id_servicio           INT NULL,
  centro_costo          VARCHAR(60) NOT NULL DEFAULT 'OFICINA CENTRAL',
  tipo_oc               ENUM('GENERAL','SERVICIO','ALMACEN') NOT NULL DEFAULT 'GENERAL',

  -- Marca emisora (Metal Engineers o PerfoTools)
  empresa               ENUM('ME','PT') NOT NULL DEFAULT 'ME',

  -- Moneda
  moneda                ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
  tipo_cambio           DECIMAL(8,4) NOT NULL DEFAULT 1.0000,

  -- Montos (en la moneda de la OC)
  subtotal              DECIMAL(14,2) NOT NULL,
  descuento             DECIMAL(14,2) NOT NULL DEFAULT 0,
  aplica_igv            TINYINT(1) NOT NULL DEFAULT 1,
  igv                   DECIMAL(14,2) NOT NULL DEFAULT 0,
  total                 DECIMAL(14,2) NOT NULL,

  -- Condiciones comerciales
  forma_pago            ENUM('CONTADO','CREDITO') NOT NULL DEFAULT 'CONTADO',
  dias_credito          INT NOT NULL DEFAULT 0,
  condiciones_entrega   VARCHAR(300),
  observaciones         VARCHAR(500),

  -- Workflow
  estado                ENUM('BORRADOR','APROBADA','ENVIADA','RECIBIDA_PARCIAL','RECIBIDA','FACTURADA','PAGADA','ANULADA')
                        NOT NULL DEFAULT 'BORRADOR',
  id_usuario_crea       INT,
  id_usuario_aprueba    INT NULL,
  fecha_aprobacion      TIMESTAMP NULL,
  motivo_anulacion      VARCHAR(300),

  -- Documentos adjuntos (PDF OC, guía, factura)
  pdf_url               VARCHAR(500),

  -- Enlace con Compras una vez facturada
  id_compra_generada    INT NULL,

  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_oc_nro (nro_oc, empresa),
  INDEX idx_oc_fecha (fecha_emision),
  INDEX idx_oc_proveedor (id_proveedor),
  INDEX idx_oc_estado (estado),
  INDEX idx_oc_servicio (id_servicio),

  CONSTRAINT fk_oc_proveedor FOREIGN KEY (id_proveedor)
    REFERENCES Proveedores(id_proveedor) ON DELETE RESTRICT,
  CONSTRAINT fk_oc_servicio FOREIGN KEY (id_servicio)
    REFERENCES Servicios(id_servicio) ON DELETE SET NULL,
  CONSTRAINT fk_oc_compra FOREIGN KEY (id_compra_generada)
    REFERENCES Compras(id_compra) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detalle de la OC (líneas)
CREATE TABLE IF NOT EXISTS DetalleOrdenCompra (
  id_detalle            INT PRIMARY KEY AUTO_INCREMENT,
  id_oc                 INT NOT NULL,
  orden                 INT NOT NULL DEFAULT 1,
  id_item               INT NULL,           -- FK a Inventario si es material
  codigo                VARCHAR(50),
  descripcion           VARCHAR(500) NOT NULL,
  unidad                VARCHAR(10) NOT NULL DEFAULT 'UND',
  cantidad              DECIMAL(14,4) NOT NULL,
  cantidad_recibida     DECIMAL(14,4) NOT NULL DEFAULT 0,
  precio_unitario       DECIMAL(14,4) NOT NULL,
  subtotal              DECIMAL(14,2) NOT NULL,
  observaciones         VARCHAR(300),

  INDEX idx_detalle_oc (id_oc),
  INDEX idx_detalle_item (id_item),
  CONSTRAINT fk_detoc_oc FOREIGN KEY (id_oc)
    REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  CONSTRAINT fk_detoc_item FOREIGN KEY (id_item)
    REFERENCES Inventario(id_item) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Aprobaciones (audit log de quién aprobó cada OC y por qué monto)
CREATE TABLE IF NOT EXISTS AprobacionesOC (
  id_aprobacion         INT PRIMARY KEY AUTO_INCREMENT,
  id_oc                 INT NOT NULL,
  id_usuario            INT NOT NULL,
  accion                ENUM('APROBAR','RECHAZAR','SOLICITAR_CAMBIOS') NOT NULL,
  comentario            VARCHAR(500),
  monto_total_aprobado  DECIMAL(14,2),
  moneda                VARCHAR(3),
  fecha                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_aprob_oc (id_oc),
  CONSTRAINT fk_aprob_oc FOREIGN KEY (id_oc)
    REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

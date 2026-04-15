-- ============================================================
-- Migración 004: Tabla Cotizaciones + DetalleCotizacion
-- Módulo Comercial V2
-- Fecha: 09/04/2026
-- ============================================================

CREATE TABLE Cotizaciones (
  id_cotizacion INT AUTO_INCREMENT PRIMARY KEY,
  nro_cotizacion VARCHAR(30) NOT NULL UNIQUE,
  fecha DATE NOT NULL,
  cliente VARCHAR(150) NOT NULL,
  atencion VARCHAR(100),
  telefono VARCHAR(30),
  correo VARCHAR(100),
  proyecto VARCHAR(200),
  estado ENUM(
    'EN_PROCESO',
    'ENVIADA',
    'APROBADA',
    'NO_APROBADA',
    'RECHAZADA',
    'TERMINADA',
    'A_ESPERA_RESPUESTA'
  ) DEFAULT 'EN_PROCESO',
  estado_trabajo ENUM(
    'NO_INICIADO',
    'EN_EJECUCION',
    'TERMINADO',
    'TERMINADO_CON_DEUDA'
  ) DEFAULT 'NO_INICIADO',
  moneda ENUM('PEN','USD') DEFAULT 'PEN',
  tipo_cambio DECIMAL(10,4) DEFAULT 1.0000,
  subtotal DECIMAL(14,2) DEFAULT 0.00,
  igv DECIMAL(14,2) DEFAULT 0.00,
  total DECIMAL(14,2) DEFAULT 0.00,
  adelanto_recibido DECIMAL(14,2) DEFAULT 0.00,
  forma_pago VARCHAR(100),
  validez_oferta VARCHAR(50),
  plazo_entrega VARCHAR(100),
  lugar_entrega VARCHAR(200),
  nro_oc_cliente VARCHAR(50),
  nro_factura VARCHAR(50),
  comentarios TEXT,
  id_servicio INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cotizacion_servicio
    FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE DetalleCotizacion (
  id_detalle INT AUTO_INCREMENT PRIMARY KEY,
  id_cotizacion INT NOT NULL,
  descripcion TEXT NOT NULL,
  unidad VARCHAR(30),
  cantidad DECIMAL(10,3) DEFAULT 1.000,
  precio_unitario DECIMAL(14,4) DEFAULT 0.0000,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS
    (ROUND(cantidad * precio_unitario, 2)) STORED,
  CONSTRAINT fk_detalle_cotizacion
    FOREIGN KEY (id_cotizacion) REFERENCES Cotizaciones(id_cotizacion)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_cotizaciones_estado ON Cotizaciones(estado);
CREATE INDEX idx_cotizaciones_cliente ON Cotizaciones(cliente);
CREATE INDEX idx_cotizaciones_fecha ON Cotizaciones(fecha);

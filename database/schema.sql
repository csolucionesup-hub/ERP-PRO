CREATE TABLE TipoCambio (
    id_tipo_cambio INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL,
    moneda VARCHAR(3) NOT NULL,
    valor DECIMAL(10,4) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Cuentas (
    id_cuenta INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'PEN',
    saldo_actual DECIMAL(12,2) DEFAULT 0.00,
    estado ENUM('ACTIVA', 'INACTIVA', 'SUSPENDIDA') DEFAULT 'ACTIVA',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Servicios (
    id_servicio INT PRIMARY KEY AUTO_INCREMENT,
    codigo VARCHAR(50) UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    cliente VARCHAR(150),
    descripcion TEXT,
    fecha_servicio DATE NOT NULL,
    fecha_vencimiento DATE,
    moneda VARCHAR(3) DEFAULT 'PEN',
    monto_base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    aplica_igv BOOLEAN DEFAULT FALSE,
    igv_base DECIMAL(12,2) DEFAULT 0.00,
    total_base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    detraccion_porcentaje DECIMAL(5,2) DEFAULT 0.00,
    monto_detraccion DECIMAL(12,2) DEFAULT 0.00,
    estado ENUM('PENDIENTE', 'PARCIAL', 'COBRADO', 'ANULADO') DEFAULT 'PENDIENTE',
    tipo_ultima_accion VARCHAR(50) DEFAULT 'CREACION',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE CostosServicio (
    id_costo INT PRIMARY KEY AUTO_INCREMENT,
    id_servicio INT NOT NULL,
    concepto VARCHAR(150) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'PEN',
    monto_original DECIMAL(12,2) NOT NULL,
    tipo_cambio DECIMAL(10,4) DEFAULT 1.0000,
    monto_base DECIMAL(12,2) NOT NULL,
    tipo_costo VARCHAR(50),
    fecha DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Inventario (
    id_item INT PRIMARY KEY AUTO_INCREMENT,
    sku VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    unidad VARCHAR(50) DEFAULT 'UNIDAD',
    stock_actual DECIMAL(10,2) DEFAULT 0.00,
    stock_minimo DECIMAL(10,2) DEFAULT 10.00,
    costo_promedio_unitario DECIMAL(12,2) DEFAULT 0.00,
    moneda VARCHAR(3) DEFAULT 'PEN',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Proveedores (
    id_proveedor INT PRIMARY KEY AUTO_INCREMENT,
    ruc VARCHAR(20) UNIQUE NOT NULL,
    razon_social VARCHAR(150) NOT NULL,
    contacto VARCHAR(150),
    telefono VARCHAR(50),
    email VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Compras (
    id_compra INT PRIMARY KEY AUTO_INCREMENT,
    id_proveedor INT NOT NULL,
    fecha DATE NOT NULL,
    nro_comprobante VARCHAR(50) NOT NULL,
    
    moneda VARCHAR(3) DEFAULT 'PEN',
    tipo_cambio DECIMAL(10,4) DEFAULT 1.0000,
    monto_base DECIMAL(12,2) NOT NULL,
    igv_base DECIMAL(12,2) NOT NULL,
    total_base DECIMAL(12,2) NOT NULL,
    
    estado ENUM('BORRADOR', 'CONFIRMADA', 'ANULADA') DEFAULT 'CONFIRMADA',
    estado_pago ENUM('PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO') DEFAULT 'PENDIENTE',
    tipo_ultima_accion VARCHAR(50) DEFAULT 'CREACION',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE DetalleCompra (
    id_detalle INT PRIMARY KEY AUTO_INCREMENT,
    id_compra INT NOT NULL,
    id_item INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL
);

CREATE TABLE Gastos (
    id_gasto INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL,
    concepto VARCHAR(150) NOT NULL,
    proveedor_nombre VARCHAR(150),
    nro_comprobante VARCHAR(50),
    monto_base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    aplica_igv BOOLEAN DEFAULT FALSE,
    igv_base DECIMAL(12,2) DEFAULT 0.00,
    total_base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estado ENUM('BORRADOR', 'CONFIRMADO', 'ANULADO') DEFAULT 'CONFIRMADO',
    estado_pago ENUM('PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO') DEFAULT 'PENDIENTE',
    tipo_ultima_accion VARCHAR(50) DEFAULT 'CREACION',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Transacciones (
    id_transaccion INT PRIMARY KEY AUTO_INCREMENT,
    id_cuenta INT NOT NULL,
    referencia_tipo ENUM('SERVICIO', 'COMPRA', 'GASTO', 'PRESTAMO'),
    referencia_id INT,
    tipo_movimiento ENUM('INGRESO', 'EGRESO') NOT NULL,
    
    moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
    tipo_cambio DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
    
    aplica_igv BOOLEAN DEFAULT TRUE,
    tipo_igv VARCHAR(15), 
    
    monto_original DECIMAL(12,2) NOT NULL,
    igv_original DECIMAL(12,2) NOT NULL,
    total_original DECIMAL(12,2) NOT NULL,

    monto_base DECIMAL(12,2) NOT NULL,
    igv_base DECIMAL(12,2) NOT NULL,
    total_base DECIMAL(12,2) NOT NULL,
    
    estado ENUM('PENDIENTE', 'REALIZADO', 'ANULADO') DEFAULT 'PENDIENTE',
    fecha DATETIME NOT NULL,
    descripcion VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE MovimientosInventario (
    id_movimiento INT PRIMARY KEY AUTO_INCREMENT,
    id_item INT NOT NULL,
    referencia_tipo ENUM('SERVICIO', 'COMPRA', 'GASTO', 'PRESTAMO'),
    referencia_id INT,
    tipo_movimiento VARCHAR(20) NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    saldo_posterior DECIMAL(10,2) NOT NULL,
    fecha_movimiento DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Prestamos (
    id_prestamo INT PRIMARY KEY AUTO_INCREMENT,
    id_cuenta INT NOT NULL,
    entidad VARCHAR(100) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'PEN',
    monto_capital DECIMAL(12,2) NOT NULL,
    tasa_interes DECIMAL(5,2) NOT NULL,
    saldo_pendiente DECIMAL(12,2) NOT NULL,
    fecha_vencimiento DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE Detracciones (
    id_detraccion INT PRIMARY KEY AUTO_INCREMENT,
    id_servicio INT NOT NULL,
    porcentaje DECIMAL(5,2) NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    fecha_pago DATE,
    estado ENUM('PENDIENTE', 'PAGADO') DEFAULT 'PENDIENTE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- INDICES PARA OPTIMIZAR CONSULTAS Y TRAZABILIDAD
CREATE INDEX idx_transacciones_ref ON Transacciones(referencia_tipo, referencia_id);
CREATE INDEX idx_transacciones_fecha ON Transacciones(fecha);

CREATE INDEX idx_movimientos_ref ON MovimientosInventario(referencia_tipo, referencia_id);
CREATE INDEX idx_movimientos_fecha ON MovimientosInventario(fecha_movimiento);

CREATE INDEX idx_compras_fecha ON Compras(fecha);
CREATE INDEX idx_gastos_fecha ON Gastos(fecha);
CREATE INDEX idx_servicios_estado ON Servicios(estado);
CREATE INDEX idx_costos_fecha ON CostosServicio(fecha);

-- FUNCIONES / TRIGGERS DE VALIDACION POLIMORFICA

DELIMITER //

CREATE TRIGGER chk_transacciones_referencia_ins
BEFORE INSERT ON Transacciones
FOR EACH ROW
BEGIN
    DECLARE record_exists INT;
    IF NEW.referencia_tipo = 'SERVICIO' THEN
        SELECT COUNT(*) INTO record_exists FROM Servicios WHERE id_servicio = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Servicio referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'COMPRA' THEN
        SELECT COUNT(*) INTO record_exists FROM Compras WHERE id_compra = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: La Compra referenciada no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'PRESTAMO' THEN
        SELECT COUNT(*) INTO record_exists FROM Prestamos WHERE id_prestamo = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Prestamo referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'GASTO' THEN
        SELECT COUNT(*) INTO record_exists FROM Gastos WHERE id_gasto = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Gasto referenciado no existe.';
        END IF;
    END IF;
END; //

CREATE TRIGGER chk_transacciones_referencia_upd
BEFORE UPDATE ON Transacciones
FOR EACH ROW
BEGIN
    DECLARE record_exists INT;
    IF NEW.referencia_tipo = 'SERVICIO' THEN
        SELECT COUNT(*) INTO record_exists FROM Servicios WHERE id_servicio = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Servicio referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'COMPRA' THEN
        SELECT COUNT(*) INTO record_exists FROM Compras WHERE id_compra = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: La Compra referenciada no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'PRESTAMO' THEN
        SELECT COUNT(*) INTO record_exists FROM Prestamos WHERE id_prestamo = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Prestamo referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'GASTO' THEN
        SELECT COUNT(*) INTO record_exists FROM Gastos WHERE id_gasto = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Gasto referenciado no existe.';
        END IF;
    END IF;
END; //

DELIMITER ;

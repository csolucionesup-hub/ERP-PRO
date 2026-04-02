# Schema Completo ERP-PRO - 15 Tablas

## 1. empresas
**Descripción**: Gestión de Metal Engineers SAC y PerfoTools

```sql
CREATE TABLE empresas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ruc VARCHAR(11) NOT NULL UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  nombre_comercial VARCHAR(255),
  moneda_principal ENUM('PEN', 'USD') DEFAULT 'PEN',
  telefono VARCHAR(20),
  email VARCHAR(100),
  direccion TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'ACTIVO',
  fecha_anulacion TIMESTAMP NULL,
  INDEX idx_ruc (ruc),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 2. servicios
**Descripción**: Servicios de fundación/pilotaje prestados a clientes

```sql
CREATE TABLE servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  codigo VARCHAR(50) UNIQUE,
  nombre_proyecto VARCHAR(255) NOT NULL,
  cliente_ruc VARCHAR(11) NOT NULL,
  cliente_razon_social VARCHAR(255) NOT NULL,
  monto_base DECIMAL(12,2) NOT NULL,
  igv DECIMAL(12,2) GENERATED ALWAYS AS (monto_base * 0.18) STORED,
  total DECIMAL(12,2) GENERATED ALWAYS AS (monto_base * 1.18) STORED,
  estado_trabajo ENUM('ACTIVO', 'TERMINADO') DEFAULT 'ACTIVO',
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  aplica_detraccion BOOLEAN DEFAULT FALSE,
  porcentaje_detraccion DECIMAL(5,2) DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'ACTIVO',
  fecha_anulacion TIMESTAMP NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  INDEX idx_empresa (empresa_id),
  INDEX idx_estado_trabajo (estado_trabajo),
  INDEX idx_cliente (cliente_ruc),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Reglas importantes**:
- `estado_trabajo = 'ACTIVO'` → servicio en curso, puede recibir gastos
- `estado_trabajo = 'TERMINADO'` → no se le pueden asignar más gastos
- Detracciones: siempre se calculan sobre `monto_base`, NO sobre `total`

---

## 3. gastos
**Descripción**: Gastos/egresos asignados a servicios

```sql
CREATE TABLE gastos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  servicio_id INT NOT NULL,
  empresa_id INT NOT NULL,
  tipo_gasto ENUM('MATERIAL', 'MANO_OBRA', 'SUBCONTRATO', 'TRANSPORTE', 'OTROS') NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  proveedor_ruc VARCHAR(11),
  proveedor_nombre VARCHAR(255),
  fecha_gasto DATE NOT NULL,
  monto_base DECIMAL(12,2) NOT NULL,
  igv DECIMAL(12,2) GENERATED ALWAYS AS (monto_base * 0.18) STORED,
  total DECIMAL(12,2) GENERATED ALWAYS AS (monto_base * 1.18) STORED,
  es_deducible BOOLEAN DEFAULT TRUE,
  comprobante_tipo ENUM('FACTURA', 'BOLETA', 'RECIBO', 'NINGUNO'),
  comprobante_numero VARCHAR(50),
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'ACTIVO',
  fecha_anulacion TIMESTAMP NULL,
  FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  INDEX idx_servicio (servicio_id),
  INDEX idx_tipo (tipo_gasto),
  INDEX idx_fecha (fecha_gasto),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Reglas importantes**:
- Solo se pueden asignar a servicios con `estado_trabajo = 'ACTIVO'`
- Dropdown de servicios debe filtrar por empresa_id y estado_trabajo

---

## 4. compras
**Descripción**: Compras a proveedores (van a inventario general)

```sql
CREATE TABLE compras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  proveedor_ruc VARCHAR(11) NOT NULL,
  proveedor_nombre VARCHAR(255) NOT NULL,
  fecha_compra DATE NOT NULL,
  tipo_compra ENUM('INSUMO', 'EQUIPO', 'SUBCONTRATO', 'OTROS') NOT NULL,
  descripcion TEXT NOT NULL,
  monto_base DECIMAL(12,2) NOT NULL,
  igv DECIMAL(12,2) GENERATED ALWAYS AS (monto_base * 0.18) STORED,
  total DECIMAL(12,2) GENERATED ALWAYS AS (monto_base * 1.18) STORED,
  aplica_detraccion BOOLEAN DEFAULT FALSE,
  porcentaje_detraccion DECIMAL(5,2) DEFAULT 0,
  comprobante_tipo ENUM('FACTURA', 'BOLETA', 'RECIBO'),
  comprobante_numero VARCHAR(50),
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'ACTIVO',
  fecha_anulacion TIMESTAMP NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  INDEX idx_empresa (empresa_id),
  INDEX idx_proveedor (proveedor_ruc),
  INDEX idx_fecha (fecha_compra),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Reglas importantes**:
- Compras van directo a inventario general
- NO se asignan a servicios al momento de compra
- Detracciones tipo "CREER_RETIENE" (cuando subcontratamos)

---

## 5. inventario
**Descripción**: Inventario general sin asignar

```sql
CREATE TABLE inventario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  compra_id INT NOT NULL,
  empresa_id INT NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  unidad VARCHAR(20) NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  cantidad_disponible DECIMAL(10,2) NOT NULL,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'DISPONIBLE',
  fecha_anulacion TIMESTAMP NULL,
  FOREIGN KEY (compra_id) REFERENCES compras(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  INDEX idx_empresa (empresa_id),
  INDEX idx_disponible (cantidad_disponible),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Reglas importantes**:
- `cantidad_disponible` se reduce con cada salida
- Solo items con `cantidad_disponible > 0` pueden retirarse

---

## 6. salidas_inventario
**Descripción**: Retiros asignados a servicios

```sql
CREATE TABLE salidas_inventario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventario_id INT NOT NULL,
  servicio_id INT NOT NULL,
  cantidad_retirada DECIMAL(10,2) NOT NULL,
  fecha_retiro DATE NOT NULL,
  responsable VARCHAR(100),
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventario_id) REFERENCES inventario(id),
  FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  INDEX idx_inventario (inventario_id),
  INDEX idx_servicio (servicio_id),
  INDEX idx_fecha (fecha_retiro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 7. detracciones
**Descripción**: Detracciones SPOT (4% o 10%)

```sql
CREATE TABLE detracciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  tipo_origen ENUM('SERVICIO', 'COMPRA') NOT NULL,
  origen_id INT NOT NULL,
  tipo_detraccion ENUM('CLIENTE_RETIENE', 'CREER_RETIENE') NOT NULL,
  monto_base DECIMAL(12,2) NOT NULL,
  porcentaje_detraccion DECIMAL(5,2) NOT NULL,
  monto_detraccion DECIMAL(12,2) GENERATED ALWAYS AS (monto_base * (porcentaje_detraccion / 100)) STORED,
  fecha_operacion DATE,
  numero_constancia VARCHAR(50),
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'PENDIENTE',
  fecha_anulacion TIMESTAMP NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  INDEX idx_tipo (tipo_detraccion),
  INDEX idx_origen (tipo_origen, origen_id),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Reglas CRÍTICAS**:
- `CLIENTE_RETIENE`: Cliente nos descuenta (facturas emitidas)
- `CREER_RETIENE`: Nosotros retenemos a subcontratista (compras)
- **NUNCA mezclar**: Son flujos separados
- Porcentajes comunes: 4% servicios generales, 10% algunos específicos

---

## 8-15. Tablas Restantes

```sql
-- retenciones (3%)
-- prestamos
-- cuotas_prestamo
-- bancos_cuentas
-- movimientos_bancarios
-- planilla
-- pagos_planilla
-- banco_nacion_detracciones
```

(Esquemas disponibles en knowledge base completa)

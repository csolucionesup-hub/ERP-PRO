-- MIGRACIÓN: Soporte Multi-Moneda (PEN / USD)
-- Ejecutar en bases de datos existentes que NO quieran hacer db:setup completo
-- Fecha: 2026-04-01

-- 1. Tabla TipoCambio: Agregar columnas y constraint únicos
--    (Si la tabla ya existe con estructura anterior, la modificamos)
ALTER TABLE TipoCambio
  ADD COLUMN IF NOT EXISTS valor_compra DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS valor_venta DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS fuente VARCHAR(50) DEFAULT 'SBS';

-- Si la tabla tenía columna "valor" (versión anterior), migrar datos
UPDATE TipoCambio SET valor_compra = valor, valor_venta = valor WHERE valor_compra = 0 AND valor IS NOT NULL;

-- Agregar índice único si no existe
ALTER TABLE TipoCambio
  ADD CONSTRAINT IF NOT EXISTS uk_tipocambio_fecha_moneda UNIQUE (fecha, moneda);

CREATE INDEX IF NOT EXISTS idx_tipocambio_fecha ON TipoCambio(fecha);

-- 2. Servicios: agregar tipo_cambio
ALTER TABLE Servicios
  ADD COLUMN IF NOT EXISTS tipo_cambio DECIMAL(10,4) DEFAULT 1.0000 AFTER moneda;

-- 3. Gastos: agregar moneda y tipo_cambio
ALTER TABLE Gastos
  ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'PEN' AFTER nro_comprobante,
  ADD COLUMN IF NOT EXISTS tipo_cambio DECIMAL(10,4) DEFAULT 1.0000 AFTER moneda;

-- 4. PrestamosTomados: agregar moneda y tipo_cambio
ALTER TABLE PrestamosTomados
  ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'PEN' AFTER fecha_vencimiento,
  ADD COLUMN IF NOT EXISTS tipo_cambio DECIMAL(10,4) DEFAULT 1.0000 AFTER moneda;

-- 5. PrestamosOtorgados: agregar moneda y tipo_cambio
ALTER TABLE PrestamosOtorgados
  ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'PEN' AFTER fecha_vencimiento,
  ADD COLUMN IF NOT EXISTS tipo_cambio DECIMAL(10,4) DEFAULT 1.0000 AFTER moneda;

SELECT 'Migración multi-moneda aplicada correctamente' AS resultado;

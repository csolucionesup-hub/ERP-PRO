-- Migración 071: maestro de Contrapartes + extensión de Préstamos.
-- Fecha: 2026-05-14. Motivo: Julio necesita ver consolidado por persona
-- ("cuánto le debe la empresa a JRH" sumando sus 2 préstamos en Interbank
-- y Falabella) + distinguir Metal Engineers vs Perfotools como tomadora.
--
-- 1. Contrapartes: maestro único. Una entrada por persona/empresa/banco.
--    Sirve como base reutilizable a futuro (CRM ligero).
-- 2. PrestamosTomados / PrestamosOtorgados: 3 columnas nuevas (nullable):
--    - id_contraparte: FK al maestro (puede quedar NULL si no se vinculó)
--    - medio_pago: banco/cuenta por donde entró/salió la plata
--    - empresa: METAL (PEN) o PERFOTOOLS (USD) — qué empresa tomó/dio
-- 3. Los campos legacy acreedor/deudor (texto libre) se quedan como
--    fallback histórico — no rompo nada existente.
--
-- Aditiva. Reversible.

CREATE TABLE IF NOT EXISTS Contrapartes (
  id_contraparte    SERIAL PRIMARY KEY,
  nombre            VARCHAR(160) NOT NULL,
  tipo              VARCHAR(20),
  documento_tipo    VARCHAR(10),
  documento_numero  VARCHAR(20),
  telefono          VARCHAR(40),
  email             VARCHAR(120),
  notas             TEXT,
  activo            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE por nombre normalizado (UPPER+trim) para evitar duplicados de
-- "Jorge Roman Hurtado" vs "JORGE ROMAN HURTADO" vs " jorge roman ".
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrapartes_nombre_upper
  ON Contrapartes (UPPER(TRIM(nombre)));

-- CHECK tipo válido (DO $$ para idempotencia)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contrapartes_tipo_check'
  ) THEN
    ALTER TABLE Contrapartes
      ADD CONSTRAINT contrapartes_tipo_check
      CHECK (tipo IN ('PERSONA','EMPRESA','BANCO','OTRO'));
  END IF;
END $$;

-- PrestamosTomados — 3 columnas nuevas
ALTER TABLE PrestamosTomados
  ADD COLUMN IF NOT EXISTS id_contraparte INT REFERENCES Contrapartes(id_contraparte) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medio_pago VARCHAR(80),
  ADD COLUMN IF NOT EXISTS empresa VARCHAR(20) DEFAULT 'METAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'prestamostomados_empresa_check'
  ) THEN
    ALTER TABLE PrestamosTomados
      ADD CONSTRAINT prestamostomados_empresa_check
      CHECK (empresa IN ('METAL','PERFOTOOLS'));
  END IF;
END $$;

UPDATE PrestamosTomados SET empresa = 'METAL' WHERE empresa IS NULL;

-- PrestamosOtorgados — mismas 3 columnas
ALTER TABLE PrestamosOtorgados
  ADD COLUMN IF NOT EXISTS id_contraparte INT REFERENCES Contrapartes(id_contraparte) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medio_pago VARCHAR(80),
  ADD COLUMN IF NOT EXISTS empresa VARCHAR(20) DEFAULT 'METAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'prestamosotorgados_empresa_check'
  ) THEN
    ALTER TABLE PrestamosOtorgados
      ADD CONSTRAINT prestamosotorgados_empresa_check
      CHECK (empresa IN ('METAL','PERFOTOOLS'));
  END IF;
END $$;

UPDATE PrestamosOtorgados SET empresa = 'METAL' WHERE empresa IS NULL;

-- Índices para joins/agregados frecuentes
CREATE INDEX IF NOT EXISTS idx_prest_tomados_contraparte    ON PrestamosTomados(id_contraparte);
CREATE INDEX IF NOT EXISTS idx_prest_otorgados_contraparte  ON PrestamosOtorgados(id_contraparte);
CREATE INDEX IF NOT EXISTS idx_prest_tomados_empresa        ON PrestamosTomados(empresa);
CREATE INDEX IF NOT EXISTS idx_prest_otorgados_empresa      ON PrestamosOtorgados(empresa);

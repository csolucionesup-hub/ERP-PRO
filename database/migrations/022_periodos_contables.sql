-- 022_periodos_contables.sql
-- Periodos contables con estado ABIERTO/CERRADO/BLOQUEADO.
-- El middleware periodoGuard usa esto para bloquear mutaciones
-- en documentos de periodos cerrados.

CREATE TABLE IF NOT EXISTS PeriodosContables (
  id                 INT PRIMARY KEY AUTO_INCREMENT,
  anio               INT NOT NULL,
  mes                INT NOT NULL,
  estado             ENUM('ABIERTO','CERRADO','BLOQUEADO') NOT NULL DEFAULT 'ABIERTO',
  fecha_cierre       TIMESTAMP NULL,
  id_usuario_cierre  INT,
  observaciones      VARCHAR(500),
  UNIQUE KEY uk_periodo (anio, mes),
  INDEX idx_periodos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed: meses 2024-01 a 2027-12 (48 filas) ABIERTOS por defecto.
-- Usamos producto cartesiano de years x months.
INSERT IGNORE INTO PeriodosContables (anio, mes, estado)
SELECT y.anio, m.mes, 'ABIERTO' FROM
  (SELECT 2024 AS anio UNION SELECT 2025 UNION SELECT 2026 UNION SELECT 2027) y,
  (SELECT 1 AS mes UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
   UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m;

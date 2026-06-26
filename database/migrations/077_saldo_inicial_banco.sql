-- 077_saldo_inicial_banco.sql
-- Saldo inicial declarado del Libro Bancos, por cuenta + período (YYYY-MM).
-- Solo guarda los anclas que el usuario carga manualmente; los demás períodos
-- se calculan encadenando movimientos desde el ancla previa (ver
-- CobranzasService.getSaldoInicial). Reemplaza el back-calc frágil desde el EECC.
CREATE TABLE IF NOT EXISTS SaldoInicialBanco (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  id_cuenta       INT NOT NULL,
  periodo         VARCHAR(7) NOT NULL,            -- 'YYYY-MM'
  saldo           DECIMAL(14,2) NOT NULL,
  registrado_por  INT,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_cuenta, periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

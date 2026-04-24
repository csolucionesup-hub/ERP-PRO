-- MIGRACIÓN: Tabla Correlativos para secuencias atómicas por (anio, marca)
-- Fecha: 2026-04-24
-- Motivo: generarCorrelativo() usaba COUNT(*) fuera de transacción.
--         Dos inserts concurrentes podían obtener el mismo número.

CREATE TABLE IF NOT EXISTS Correlativos (
  anio   INT          NOT NULL,
  marca  VARCHAR(20)  NOT NULL,
  ultimo INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (anio, marca)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Back-fill desde Cotizaciones existentes (excluye COT 0000-000 residuales).
-- Se calcula MAX(secuencia) parseando la posición media del nro_cotizacion.
INSERT INTO Correlativos (anio, marca, ultimo)
SELECT
  YEAR(fecha)                                              AS anio,
  marca,
  COALESCE(
    MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(nro_cotizacion, '-', 2), '-', -1) AS UNSIGNED)),
    0
  )                                                        AS ultimo
FROM Cotizaciones
WHERE nro_cotizacion REGEXP '^COT [0-9]{4}-[0-9]{3}-(MN|ME)$'
  AND YEAR(fecha) > 0
GROUP BY YEAR(fecha), marca
ON DUPLICATE KEY UPDATE ultimo = GREATEST(Correlativos.ultimo, VALUES(ultimo));

-- Limpiar residuos COT 0000-000 si existen (ESTADO.md bug #1).
DELETE FROM DetalleCotizacion
 WHERE id_cotizacion IN (
   SELECT id_cotizacion FROM Cotizaciones WHERE nro_cotizacion LIKE 'COT 0000%'
 );
DELETE FROM Cotizaciones WHERE nro_cotizacion LIKE 'COT 0000%';

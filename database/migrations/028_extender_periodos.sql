-- 028_extender_periodos.sql
-- Extiende PeriodosContables de 2024-2027 a 2020-2029 (10 años completos).
-- Necesario para permitir carga de data histórica desde 2022+ y planificación
-- a futuro sin que periodoGuard bloquee mutaciones con fechas fuera del rango.

INSERT IGNORE INTO PeriodosContables (anio, mes, estado)
SELECT y.anio, m.mes, 'ABIERTO' FROM
  (SELECT 2020 AS anio UNION SELECT 2021 UNION SELECT 2022 UNION SELECT 2023
   UNION SELECT 2028 UNION SELECT 2029) y,
  (SELECT 1 AS mes UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
   UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m;

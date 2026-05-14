-- Migración 070: agrupar items de inventario por familia + marca empresa.
-- Fecha: 2026-05-13. Motivo: Julio reportó que ve variantes del mismo
-- producto (6 soldaduras, 3 pernos, 2 alambres, 2 tubos) como filas
-- sueltas. Necesita verlos agrupados para no confundir uno con otro al
-- recibir/retirar.
--
-- Cambios:
--   1. Inventario.familia: TEXT nullable. Agrupa variantes de la misma
--      raíz (SOLDADURA, PERNO, TUBO, ALAMBRE, DISCO...). Auto-poblada
--      con la primera palabra del nombre — el usuario edita los casos
--      sueltos desde la UI.
--   2. Inventario.marca: VARCHAR(20) con CHECK (METAL/PERFOTOOLS/COMPARTIDO).
--      Default 'COMPARTIDO' — el almacén físico es uno solo, la marca
--      indica a qué empresa se imputa contablemente. Julio marca casos
--      específicos manualmente.
--   3. Índices para que los filtros del UI sean rápidos.
--
-- Aditiva. No toca registros existentes salvo poblar familia + marca con
-- defaults. Reversible (drop columns + indexes).

ALTER TABLE Inventario
  ADD COLUMN IF NOT EXISTS familia VARCHAR(80);

ALTER TABLE Inventario
  ADD COLUMN IF NOT EXISTS marca VARCHAR(20) DEFAULT 'COMPARTIDO';

-- CHECK constraint para marca — solo 3 valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventario_marca_check'
  ) THEN
    ALTER TABLE Inventario
      ADD CONSTRAINT inventario_marca_check
      CHECK (marca IN ('METAL', 'PERFOTOOLS', 'COMPARTIDO'));
  END IF;
END $$;

-- Auto-poblar familia con la primera palabra del nombre (UPPER).
-- Solo registros que aún no tienen familia (idempotente).
UPDATE Inventario
   SET familia = UPPER(SPLIT_PART(nombre, ' ', 1))
 WHERE familia IS NULL;

-- Asegurar que todos los registros tienen marca seteada (back-fill).
UPDATE Inventario
   SET marca = 'COMPARTIDO'
 WHERE marca IS NULL;

CREATE INDEX IF NOT EXISTS idx_inv_familia ON Inventario(familia);
CREATE INDEX IF NOT EXISTS idx_inv_marca   ON Inventario(marca);

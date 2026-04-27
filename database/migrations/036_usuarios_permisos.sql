-- 036_usuarios_permisos.sql
-- Permisos granulares por usuario, independientes del rol.
--
-- ANTES: el acceso a Contabilidad e Importar Histórico se decidía por
-- el rol (GERENTE o CONTADOR). El rol era enum cerrado de 3 valores.
--
-- AHORA: el rol pasa a ser una etiqueta libre (Almacenero, Comercial,
-- Administrador, etc) y los accesos especiales se controlan por dos
-- flags booleanos por usuario que el GERENTE asigna manualmente:
--   • puede_contabilidad → ve la pestaña 📘 Contabilidad
--   • puede_importar     → ve 📥 Importar Histórico
--
-- GERENTE siempre tiene todo (sin importar los flags).

ALTER TABLE Usuarios
  ADD COLUMN IF NOT EXISTS puede_contabilidad BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS puede_importar     BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill: usuarios que ya tenían acceso por rol mantienen los flags activos
UPDATE Usuarios SET puede_contabilidad = TRUE, puede_importar = TRUE
WHERE rol IN ('GERENTE', 'CONTADOR');

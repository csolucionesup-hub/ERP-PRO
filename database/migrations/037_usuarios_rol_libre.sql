-- 037_usuarios_rol_libre.sql
-- Remueve el CHECK constraint que limitaba el rol a un enum cerrado.
-- A partir de la migración 036 los accesos especiales se controlan por flags
-- (puede_contabilidad, puede_importar), no por el rol. El rol pasa a ser
-- un label libre (ALMACENERO, COMERCIAL, ADMINISTRADOR, OPERARIO, etc.)
-- validado en application code (longitud 1-30 chars).

ALTER TABLE Usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

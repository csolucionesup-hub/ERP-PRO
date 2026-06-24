-- 075_usuariomodulos_add_prestamos.sql
-- Agrega 'PRESTAMOS' como módulo asignable, separándolo de FINANZAS.
--
-- Contexto: el módulo Préstamos vivía bajo la llave FINANZAS (junto a
-- cobranzas/caja). Para que Logística/Administración vean Préstamos SIN ver
-- la parte sensible de Finanzas, se separa en su propia llave 'PRESTAMOS'.
-- En el código, /prestamos pasa a aceptar FINANZAS *o* PRESTAMOS.
--
-- ADITIVA y segura: solo agrega un valor permitido al CHECK; no toca datos
-- existentes ni quita módulos. Dormida hasta que se asigne PRESTAMOS a alguien.
--
-- Aplicar a Supabase vía MCP cuando se vaya a "echar llave" (la BD no corre
-- migraciones automáticamente — ver CLAUDE.md gotcha #33/#35).

ALTER TABLE usuariomodulos DROP CONSTRAINT IF EXISTS usuariomodulos_modulo_check;

ALTER TABLE usuariomodulos ADD CONSTRAINT usuariomodulos_modulo_check
  CHECK (modulo = ANY (ARRAY[
    'GERENCIA','COMERCIAL','FINANZAS','LOGISTICA',
    'ALMACEN','ADMINISTRACION','PRODUCCION','PRESTAMOS'
  ]));

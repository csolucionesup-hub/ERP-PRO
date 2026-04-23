-- 024_roles_extendidos.sql
-- Extiende el ENUM de Usuarios.rol con roles adicionales para separación de funciones:
--   APROBADOR: aprueba órdenes de compra > umbral
--   CAJA: registra cobranzas y pagos sin acceso a configuración
--   CONTADOR: acceso a libros, estados financieros, pack contable — solo lectura + export

ALTER TABLE Usuarios
  MODIFY COLUMN rol ENUM('GERENTE','USUARIO','APROBADOR','CAJA','CONTADOR') NOT NULL DEFAULT 'USUARIO';

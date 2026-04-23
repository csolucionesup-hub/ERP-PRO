-- 021_auditoria.sql
-- Registro de auditoría transversal: quién hizo qué y cuándo.
-- Alimentado por middleware auditLog aplicado a rutas sensibles.

CREATE TABLE IF NOT EXISTS Auditoria (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario      INT,
  nombre_usuario  VARCHAR(100),
  accion          ENUM('CREATE','UPDATE','DELETE','ANULAR','LOGIN','LOGOUT','CONFIG','EXPORT','EMIT') NOT NULL,
  entidad         VARCHAR(60) NOT NULL,
  entidad_id      VARCHAR(60),
  datos_antes     JSON,
  datos_despues   JSON,
  ip              VARCHAR(45),
  user_agent      VARCHAR(300),

  INDEX idx_auditoria_fecha (fecha),
  INDEX idx_auditoria_entidad (entidad, entidad_id),
  INDEX idx_auditoria_usuario (id_usuario),
  INDEX idx_auditoria_accion (accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

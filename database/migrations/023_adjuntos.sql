-- 023_adjuntos.sql
-- Adjuntos genéricos (PDFs, imágenes) para cualquier entidad:
--   ref_tipo: 'Compra','Gasto','Cotizacion','Factura','Cobranza','OT', etc.
--   ref_id:   id numérico del documento
-- Los archivos físicos viven en Cloudinary (ya configurado).

CREATE TABLE IF NOT EXISTS Adjuntos (
  id                   INT PRIMARY KEY AUTO_INCREMENT,
  ref_tipo             VARCHAR(40) NOT NULL,
  ref_id               INT NOT NULL,
  nombre_original      VARCHAR(255),
  url                  VARCHAR(500) NOT NULL,
  cloudinary_public_id VARCHAR(300),
  mimetype             VARCHAR(100),
  tamano_bytes         INT,
  id_usuario_subio     INT,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_adjuntos_ref (ref_tipo, ref_id),
  INDEX idx_adjuntos_usuario (id_usuario_subio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

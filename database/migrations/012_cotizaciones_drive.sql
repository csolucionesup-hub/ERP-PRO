-- Migración 012: Google Drive file tracking para cotizaciones
-- Guarda el fileId y el link de visualización del PDF en Drive

ALTER TABLE Cotizaciones
  ADD COLUMN drive_file_id VARCHAR(200) NULL,
  ADD COLUMN drive_url     VARCHAR(500) NULL;

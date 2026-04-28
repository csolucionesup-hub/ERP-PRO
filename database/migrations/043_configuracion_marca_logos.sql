-- Migración 043: Logos por marca para PDF de cotizaciones
-- Antes el PDF cargaba public/img/logo-{metal,perfotools}.png como path local.
-- Ahora soportamos URL de Cloudinary subida desde Configuración de Empresa.

ALTER TABLE ConfiguracionMarca
  ADD COLUMN logo_url       VARCHAR(500) NULL,
  ADD COLUMN logo_public_id VARCHAR(255) NULL;

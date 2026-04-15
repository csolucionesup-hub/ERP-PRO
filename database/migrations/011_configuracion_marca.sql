-- Migración 011: Configuración por marca (datos que se repiten en cotizaciones)
-- Una fila por marca. Al generar el PDF se leen estos valores en vez de constantes.

CREATE TABLE IF NOT EXISTS ConfiguracionMarca (
  marca               ENUM('METAL','PERFOTOOLS') NOT NULL PRIMARY KEY,

  -- Datos de empresa (footer + firma)
  razon_social        VARCHAR(150) NOT NULL,
  ruc                 VARCHAR(15)  NOT NULL,
  direccion           VARCHAR(255) NOT NULL,
  web                 VARCHAR(120) NOT NULL,
  email               VARCHAR(120) NOT NULL,

  -- Cuenta bancaria en Soles
  cta_pen_banco       VARCHAR(60)  NULL,
  cta_pen_numero      VARCHAR(40)  NULL,
  cta_pen_cci         VARCHAR(40)  NULL,

  -- Cuenta bancaria en Dólares
  cta_usd_banco       VARCHAR(60)  NULL,
  cta_usd_numero      VARCHAR(40)  NULL,
  cta_usd_cci         VARCHAR(40)  NULL,

  -- Firma (gerente comercial)
  firma_nombre        VARCHAR(120) NOT NULL,
  firma_cargo         VARCHAR(80)  NOT NULL,
  firma_telefono      VARCHAR(30)  NULL,
  firma_email         VARCHAR(120) NULL,
  firma_direccion     VARCHAR(255) NULL,

  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed con los valores actuales hardcodeados en CotizacionPDFService.ts
INSERT INTO ConfiguracionMarca
  (marca, razon_social, ruc, direccion, web, email,
   cta_pen_banco, cta_pen_numero, cta_pen_cci,
   cta_usd_banco, cta_usd_numero, cta_usd_cci,
   firma_nombre, firma_cargo, firma_telefono, firma_email, firma_direccion)
VALUES
  ('METAL',
   'METAL ENGINEERS S.A.C.', '20610071962',
   'Av. Javier Prado Este Nº 2813 Oficina 502 – San Borja, Lima, Perú',
   'www.metalengineers.com.pe', 'administracion@metalengineers.com.pe',
   'Interbank', '200-3004523324', '003-200-003004523324-31',
   'Interbank', '200-3007027785', '003-200-003007027785-37',
   'JULIO ROJAS COTRINA', 'Gerente Comercial',
   '933 440 483', 'juliorojas@metalengineers.com.pe',
   'Av. Javier Prado Este Nº 2813 Oficina 502 – San Borja'),
  ('PERFOTOOLS',
   'PERFOTOOLS — METAL ENGINEERS S.A.C.', '20610071962',
   'Av. Javier Prado Este Nº 2813 Oficina 502 – San Borja, Lima, Perú',
   'www.metalengineers.com.pe', 'administracion@metalengineers.com.pe',
   'Interbank', '200-3004523324', '003-200-003004523324-31',
   'Interbank', '200-3007027785', '003-200-003007027785-37',
   'JULIO ROJAS COTRINA', 'Gerente Comercial',
   '933 440 483', 'juliorojas@metalengineers.com.pe',
   'Av. Javier Prado Este Nº 2813 Oficina 502 – San Borja')
ON DUPLICATE KEY UPDATE marca = VALUES(marca);

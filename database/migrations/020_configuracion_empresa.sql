-- 020_configuracion_empresa.sql
-- Tabla central de configuración de la empresa.
-- Habilita ERP multi-régimen tributario peruano (NRUS/RER/RMT/GENERAL).
-- Preparada para multi-tenancy futuro (Fase F).

CREATE TABLE IF NOT EXISTS ConfiguracionEmpresa (
  id                           INT PRIMARY KEY AUTO_INCREMENT,

  -- Identificación
  ruc                          VARCHAR(11) NOT NULL UNIQUE,
  razon_social                 VARCHAR(200) NOT NULL,
  nombre_comercial             VARCHAR(200),
  direccion_fiscal             VARCHAR(300),
  telefono                     VARCHAR(30),
  email_facturacion            VARCHAR(150),
  web                          VARCHAR(150),
  logo_url                     VARCHAR(500),

  -- Régimen tributario (afecta IGV, libros obligatorios, comprobantes)
  regimen                      ENUM('NRUS','RER','RMT','GENERAL') NOT NULL DEFAULT 'RMT',
  fecha_cambio_regimen         DATE,

  -- IGV
  aplica_igv                   TINYINT(1) NOT NULL DEFAULT 1,
  tasa_igv                     DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  es_agente_retencion          TINYINT(1) NOT NULL DEFAULT 0,
  es_agente_percepcion         TINYINT(1) NOT NULL DEFAULT 0,

  -- Renta
  tasa_pago_cuenta_renta       DECIMAL(5,2) DEFAULT 1.00,
  cuota_fija_mensual           DECIMAL(10,2),

  -- Libros PLE (derivados del régimen, calculados al guardar)
  lleva_libro_diario_completo  TINYINT(1) NOT NULL DEFAULT 0,
  lleva_libro_mayor            TINYINT(1) NOT NULL DEFAULT 0,
  lleva_libro_caja_bancos      TINYINT(1) NOT NULL DEFAULT 1,
  lleva_inventarios_balances   TINYINT(1) NOT NULL DEFAULT 0,

  -- Facturación electrónica (se llena en Fase B)
  emite_factura                TINYINT(1) NOT NULL DEFAULT 1,
  emite_boleta                 TINYINT(1) NOT NULL DEFAULT 1,
  ose_proveedor                ENUM('NUBEFACT','EFACT','SUNAT','NONE') NOT NULL DEFAULT 'NONE',
  ose_endpoint_url             VARCHAR(500),
  ose_usuario                  VARCHAR(200),
  ose_token_hash               VARCHAR(500),
  cert_digital_ruta            VARCHAR(500),
  cert_digital_password_hash   VARCHAR(500),

  -- Series de numeración electrónica
  serie_factura                VARCHAR(5) DEFAULT 'F001',
  serie_boleta                 VARCHAR(5) DEFAULT 'B001',
  serie_nota_credito           VARCHAR(5) DEFAULT 'FC01',
  serie_nota_debito            VARCHAR(5) DEFAULT 'FD01',
  serie_guia_remision          VARCHAR(5) DEFAULT 'T001',

  -- UIT vigente (referencia tributaria)
  uit_vigente                  DECIMAL(10,2) NOT NULL DEFAULT 5350.00,
  anio_uit                     INT NOT NULL DEFAULT 2026,

  -- Preferencias operativas
  moneda_base                  ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
  metodo_costeo                ENUM('PROMEDIO','PEPS','UEPS') NOT NULL DEFAULT 'PROMEDIO',
  dias_credito_default         INT NOT NULL DEFAULT 30,
  monto_limite_sin_aprobacion  DECIMAL(12,2) NOT NULL DEFAULT 5000.00,

  -- Módulos activos (bit flags — el sidebar los respeta)
  modulo_comercial             TINYINT(1) NOT NULL DEFAULT 1,
  modulo_finanzas              TINYINT(1) NOT NULL DEFAULT 1,
  modulo_logistica             TINYINT(1) NOT NULL DEFAULT 1,
  modulo_almacen               TINYINT(1) NOT NULL DEFAULT 1,
  modulo_administracion        TINYINT(1) NOT NULL DEFAULT 1,
  modulo_prestamos             TINYINT(1) NOT NULL DEFAULT 1,
  modulo_produccion            TINYINT(1) NOT NULL DEFAULT 0,
  modulo_calidad               TINYINT(1) NOT NULL DEFAULT 0,
  modulo_contabilidad          TINYINT(1) NOT NULL DEFAULT 0,

  -- Metas anuales (para dashboard gerencial)
  meta_ventas_anual            DECIMAL(14,2),
  meta_utilidad_anual          DECIMAL(14,2),

  created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed: Metal Engineers SAC (RUC y datos según CLAUDE.md)
INSERT IGNORE INTO ConfiguracionEmpresa
  (ruc, razon_social, nombre_comercial, direccion_fiscal, email_facturacion, web,
   regimen, aplica_igv, tasa_igv,
   lleva_libro_diario_completo, lleva_libro_mayor, lleva_libro_caja_bancos, lleva_inventarios_balances,
   emite_factura, emite_boleta,
   moneda_base, uit_vigente, anio_uit)
VALUES
  ('20610071962',
   'METAL ENGINEERS SAC',
   'Metal Engineers',
   'Calle Rio Cenepa Mz D Lote 5 - Urb. El Cascajal - La Molina - Lima',
   'administracion@metalengineers.com.pe',
   'www.metalengineers.com.pe',
   'RMT', 1, 18.00,
   1, 1, 1, 1,
   1, 1,
   'PEN', 5350.00, 2026);

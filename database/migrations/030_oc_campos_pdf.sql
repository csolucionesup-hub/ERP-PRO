-- 030_oc_campos_pdf.sql
-- Campos adicionales en OrdenesCompra para replicar el PDF físico que
-- Metal Engineers ya usa hoy (analizado de 4 OCs reales).

ALTER TABLE OrdenesCompra
  ADD COLUMN atencion              VARCHAR(150) NULL COMMENT 'Persona contacto en la empresa del proveedor',
  ADD COLUMN contacto_interno      VARCHAR(150) NULL COMMENT 'Nombre del ejecutivo interno que atiende la OC',
  ADD COLUMN contacto_telefono     VARCHAR(30)  NULL COMMENT 'Celular del contacto interno',
  ADD COLUMN solicitado_por        VARCHAR(150) NULL COMMENT 'Firma: nombre de quien solicitó',
  ADD COLUMN revisado_por          VARCHAR(150) NULL COMMENT 'Firma: nombre de quien revisó',
  ADD COLUMN autorizado_por        VARCHAR(150) NULL COMMENT 'Firma: nombre de quien autorizó',
  ADD COLUMN cuenta_bancaria_pago  VARCHAR(300) NULL COMMENT 'Cta bancaria del proveedor: ej "Cta.Interbank Soles 898-3187294381; CCI 00389801318729438149"',
  ADD COLUMN lugar_entrega         VARCHAR(200) NULL COMMENT 'Lima, Puente Piedra, Obra Toromocho, N/A';

-- Firmas default por empresa (para auto-llenar en cada OC nueva)
ALTER TABLE ConfiguracionEmpresa
  ADD COLUMN oc_solicitado_default VARCHAR(150) NULL DEFAULT 'Jorge Luis Roman Hurtado',
  ADD COLUMN oc_revisado_default   VARCHAR(150) NULL DEFAULT 'Jorge Luis Roman Hurtado',
  ADD COLUMN oc_autorizado_default VARCHAR(150) NULL DEFAULT 'Julio Cesar Rojas Cotrina',
  ADD COLUMN oc_contacto_nombre    VARCHAR(150) NULL DEFAULT 'Jorge Luis Roman Hurtado',
  ADD COLUMN oc_contacto_telefono  VARCHAR(30)  NULL DEFAULT '975574228',
  ADD COLUMN oc_ciudad_emision     VARCHAR(100) NULL DEFAULT 'Puente Piedra';

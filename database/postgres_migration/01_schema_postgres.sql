-- ===========================================================
-- ERP-PRO — Schema Postgres (auto-generado desde MySQL dump)
-- ===========================================================

-- Habilitar extensiones útiles
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tablas
CREATE TABLE IF NOT EXISTS _migrations (
  name VARCHAR(190) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (name)
);
CREATE TABLE IF NOT EXISTS adjuntos (
  id INTEGER GENERATED ALWAYS AS IDENTITY,
  ref_tipo VARCHAR(40) NOT NULL,
  ref_id INTEGER NOT NULL,
  nombre_original VARCHAR(255) DEFAULT NULL,
  url VARCHAR(500) NOT NULL,
  cloudinary_public_id VARCHAR(300) DEFAULT NULL,
  mimetype VARCHAR(100) DEFAULT NULL,
  tamano_bytes INTEGER DEFAULT NULL,
  id_usuario_subio INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS aprobacionesoc (
  id_aprobacion INTEGER GENERATED ALWAYS AS IDENTITY,
  id_oc INTEGER NOT NULL,
  id_usuario INTEGER NOT NULL,
  accion TEXT CHECK (accion IN ('APROBAR','RECHAZAR','SOLICITAR_CAMBIOS')) NOT NULL,
  comentario VARCHAR(500) DEFAULT NULL,
  monto_total_aprobado NUMERIC(14,2) DEFAULT NULL,
  moneda VARCHAR(3) DEFAULT NULL,
  fecha TIMESTAMPTZ NULL DEFAULT NOW(),
  PRIMARY KEY (id_aprobacion)
);
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  id_usuario INTEGER DEFAULT NULL,
  nombre_usuario VARCHAR(100) DEFAULT NULL,
  accion TEXT CHECK (accion IN ('CREATE','UPDATE','DELETE','ANULAR','LOGIN','LOGOUT','CONFIG','EXPORT','EMIT')) NOT NULL,
  entidad VARCHAR(60) NOT NULL,
  entidad_id VARCHAR(60) DEFAULT NULL,
  datos_antes JSONB DEFAULT NULL,
  datos_despues JSONB DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  user_agent VARCHAR(300) DEFAULT NULL,
  PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS cobranzascotizacion (
  id_cobranza INTEGER GENERATED ALWAYS AS IDENTITY,
  id_cotizacion INTEGER NOT NULL,
  tipo TEXT CHECK (tipo IN ('DEPOSITO_BANCO','DETRACCION_BN','RETENCION')) NOT NULL,
  fecha_movimiento date NOT NULL,
  id_cuenta INTEGER DEFAULT NULL,
  banco VARCHAR(80) DEFAULT NULL,
  nro_operacion VARCHAR(50) DEFAULT NULL,
  monto NUMERIC(12,2) NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) NOT NULL DEFAULT '1.0000',
  voucher_url VARCHAR(500) DEFAULT NULL,
  comentario TEXT,
  registrado_por INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_cobranza)
);
CREATE TABLE IF NOT EXISTS compras (
  id_compra INTEGER GENERATED ALWAYS AS IDENTITY,
  nro_oc VARCHAR(50) NOT NULL DEFAULT '',
  id_proveedor INTEGER NOT NULL,
  fecha date NOT NULL,
  nro_comprobante VARCHAR(50) NOT NULL,
  centro_costo VARCHAR(100) DEFAULT NULL,
  moneda VARCHAR(3) DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) DEFAULT '1.0000',
  monto_base NUMERIC(12,2) NOT NULL,
  igv_base NUMERIC(12,2) NOT NULL,
  total_base NUMERIC(12,2) NOT NULL,
  aplica_igv BOOLEAN DEFAULT TRUE,
  estado TEXT CHECK (estado IN ('PENDIENTE','CONFIRMADA','ANULADO')) NOT NULL DEFAULT 'CONFIRMADA',
  estado_pago TEXT CHECK (estado_pago IN ('PENDIENTE','PARCIAL','PAGADO','ANULADO')) DEFAULT 'PENDIENTE',
  tipo_ultima_accion VARCHAR(50) DEFAULT 'CREACION',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_compra)
);
CREATE TABLE IF NOT EXISTS configuracionempresa (
  id INTEGER GENERATED ALWAYS AS IDENTITY,
  ruc VARCHAR(11) NOT NULL,
  razon_social VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200) DEFAULT NULL,
  direccion_fiscal VARCHAR(300) DEFAULT NULL,
  telefono VARCHAR(30) DEFAULT NULL,
  email_facturacion VARCHAR(150) DEFAULT NULL,
  web VARCHAR(150) DEFAULT NULL,
  logo_url VARCHAR(500) DEFAULT NULL,
  regimen TEXT CHECK (regimen IN ('NRUS','RER','RMT','GENERAL')) NOT NULL DEFAULT 'RMT',
  fecha_cambio_regimen date DEFAULT NULL,
  aplica_igv BOOLEAN NOT NULL DEFAULT TRUE,
  tasa_igv NUMERIC(5,2) NOT NULL DEFAULT '18.00',
  es_agente_retencion BOOLEAN NOT NULL DEFAULT FALSE,
  es_agente_percepcion BOOLEAN NOT NULL DEFAULT FALSE,
  tasa_pago_cuenta_renta NUMERIC(5,2) DEFAULT '1.00',
  cuota_fija_mensual NUMERIC(10,2) DEFAULT NULL,
  lleva_libro_diario_completo BOOLEAN NOT NULL DEFAULT FALSE,
  lleva_libro_mayor BOOLEAN NOT NULL DEFAULT FALSE,
  lleva_libro_caja_bancos BOOLEAN NOT NULL DEFAULT TRUE,
  lleva_inventarios_balances BOOLEAN NOT NULL DEFAULT FALSE,
  emite_factura BOOLEAN NOT NULL DEFAULT TRUE,
  emite_boleta BOOLEAN NOT NULL DEFAULT TRUE,
  ose_proveedor TEXT CHECK (ose_proveedor IN ('NUBEFACT','EFACT','SUNAT','NONE')) NOT NULL DEFAULT 'NONE',
  ose_endpoint_url VARCHAR(500) DEFAULT NULL,
  ose_usuario VARCHAR(200) DEFAULT NULL,
  ose_token_hash VARCHAR(500) DEFAULT NULL,
  cert_digital_ruta VARCHAR(500) DEFAULT NULL,
  cert_digital_password_hash VARCHAR(500) DEFAULT NULL,
  serie_factura VARCHAR(5) DEFAULT 'F001',
  serie_boleta VARCHAR(5) DEFAULT 'B001',
  serie_nota_credito VARCHAR(5) DEFAULT 'FC01',
  serie_nota_debito VARCHAR(5) DEFAULT 'FD01',
  serie_guia_remision VARCHAR(5) DEFAULT 'T001',
  uit_vigente NUMERIC(10,2) NOT NULL DEFAULT '5350.00',
  anio_uit INTEGER NOT NULL DEFAULT '2026',
  moneda_base TEXT CHECK (moneda_base IN ('PEN','USD')) NOT NULL DEFAULT 'PEN',
  metodo_costeo TEXT CHECK (metodo_costeo IN ('PROMEDIO','PEPS','UEPS')) NOT NULL DEFAULT 'PROMEDIO',
  dias_credito_default INTEGER NOT NULL DEFAULT '30',
  monto_limite_sin_aprobacion NUMERIC(12,2) NOT NULL DEFAULT '5000.00',
  modulo_comercial BOOLEAN NOT NULL DEFAULT TRUE,
  modulo_finanzas BOOLEAN NOT NULL DEFAULT TRUE,
  modulo_logistica BOOLEAN NOT NULL DEFAULT TRUE,
  modulo_almacen BOOLEAN NOT NULL DEFAULT TRUE,
  modulo_administracion BOOLEAN NOT NULL DEFAULT TRUE,
  modulo_prestamos BOOLEAN NOT NULL DEFAULT TRUE,
  modulo_produccion BOOLEAN NOT NULL DEFAULT FALSE,
  modulo_calidad BOOLEAN NOT NULL DEFAULT FALSE,
  modulo_contabilidad BOOLEAN NOT NULL DEFAULT FALSE,
  meta_ventas_anual NUMERIC(14,2) DEFAULT NULL,
  meta_utilidad_anual NUMERIC(14,2) DEFAULT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  oc_solicitado_default VARCHAR(150) DEFAULT 'Jorge Luis Roman Hurtado',
  oc_revisado_default VARCHAR(150) DEFAULT 'Jorge Luis Roman Hurtado',
  oc_autorizado_default VARCHAR(150) DEFAULT 'Julio Cesar Rojas Cotrina',
  oc_contacto_nombre VARCHAR(150) DEFAULT 'Jorge Luis Roman Hurtado',
  oc_contacto_telefono VARCHAR(30) DEFAULT '975574228',
  oc_ciudad_emision VARCHAR(100) DEFAULT 'Puente Piedra',
  PRIMARY KEY (id),
  CONSTRAINT ruc UNIQUE (ruc)
);
CREATE TABLE IF NOT EXISTS configuracionmarca (
  marca TEXT CHECK (marca IN ('METAL','PERFOTOOLS')) NOT NULL,
  razon_social VARCHAR(150) NOT NULL,
  ruc VARCHAR(15) NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  web VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL,
  cta_pen_banco VARCHAR(60) DEFAULT NULL,
  cta_pen_numero VARCHAR(40) DEFAULT NULL,
  cta_pen_cci VARCHAR(40) DEFAULT NULL,
  cta_usd_banco VARCHAR(60) DEFAULT NULL,
  cta_usd_numero VARCHAR(40) DEFAULT NULL,
  cta_usd_cci VARCHAR(40) DEFAULT NULL,
  firma_nombre VARCHAR(120) NOT NULL,
  firma_cargo VARCHAR(80) NOT NULL,
  firma_telefono VARCHAR(30) DEFAULT NULL,
  firma_email VARCHAR(120) DEFAULT NULL,
  firma_direccion VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  PRIMARY KEY (marca)
);
CREATE TABLE IF NOT EXISTS correlativos (
  anio INTEGER NOT NULL,
  marca VARCHAR(20) NOT NULL,
  ultimo INTEGER NOT NULL DEFAULT '0',
  PRIMARY KEY (anio,marca)
);
CREATE TABLE IF NOT EXISTS costosservicio (
  id_costo INTEGER GENERATED ALWAYS AS IDENTITY,
  id_servicio INTEGER NOT NULL,
  concepto VARCHAR(150) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'PEN',
  monto_original NUMERIC(12,2) NOT NULL,
  tipo_cambio NUMERIC(10,4) DEFAULT '1.0000',
  monto_base NUMERIC(12,2) NOT NULL,
  tipo_costo VARCHAR(50) DEFAULT NULL,
  fecha date DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_costo)
);
CREATE TABLE IF NOT EXISTS cotizaciones (
  id_cotizacion INTEGER GENERATED ALWAYS AS IDENTITY,
  nro_cotizacion VARCHAR(30) NOT NULL,
  marca TEXT CHECK (marca IN ('METAL','PERFOTOOLS')) NOT NULL DEFAULT 'METAL',
  fecha date NOT NULL,
  cliente VARCHAR(150) NOT NULL,
  atencion VARCHAR(100) DEFAULT NULL,
  telefono VARCHAR(30) DEFAULT NULL,
  correo VARCHAR(100) DEFAULT NULL,
  proyecto VARCHAR(200) DEFAULT NULL,
  ref VARCHAR(500) DEFAULT NULL,
  estado TEXT CHECK (estado IN ('EN_PROCESO','ENVIADA','APROBADA','NO_APROBADA','RECHAZADA','TERMINADA','A_ESPERA_RESPUESTA','ANULADA')) DEFAULT 'EN_PROCESO',
  fecha_aprobacion_comercial TIMESTAMPTZ DEFAULT NULL,
  estado_trabajo TEXT CHECK (estado_trabajo IN ('NO_INICIADO','EN_EJECUCION','TERMINADO','TERMINADO_CON_DEUDA')) DEFAULT 'NO_INICIADO',
  moneda TEXT CHECK (moneda IN ('PEN','USD')) DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) DEFAULT '1.0000',
  subtotal NUMERIC(14,2) DEFAULT '0.00',
  igv NUMERIC(14,2) DEFAULT '0.00',
  detraccion_porcentaje NUMERIC(5,2) NOT NULL DEFAULT '0.00',
  monto_detraccion NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  retencion_porcentaje NUMERIC(5,2) NOT NULL DEFAULT '0.00',
  monto_retencion NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  total NUMERIC(14,2) DEFAULT '0.00',
  adelanto_recibido NUMERIC(14,2) DEFAULT '0.00',
  forma_pago VARCHAR(100) DEFAULT NULL,
  validez_oferta VARCHAR(50) DEFAULT NULL,
  plazo_entrega VARCHAR(100) DEFAULT NULL,
  lugar_entrega VARCHAR(200) DEFAULT NULL,
  lugar_trabajo VARCHAR(255) DEFAULT NULL,
  nro_oc_cliente VARCHAR(50) DEFAULT NULL,
  nro_factura VARCHAR(50) DEFAULT NULL,
  fecha_factura date DEFAULT NULL,
  fecha_cobro_total TIMESTAMPTZ DEFAULT NULL,
  comentarios TEXT,
  precios_incluyen VARCHAR(500) DEFAULT NULL,
  id_servicio INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  drive_file_id VARCHAR(200) DEFAULT NULL,
  drive_url VARCHAR(500) DEFAULT NULL,
  estado_financiero TEXT CHECK (estado_financiero IN ('PENDIENTE_DEPOSITO','BANCO_PARCIAL','BANCO_OK_DETRACCION_PENDIENTE','FONDEADA_TOTAL','SIN_DETRACCION_FONDEADA','FACTURADA','COBRADA','NA')) NOT NULL DEFAULT 'NA',
  monto_cobrado_banco NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  monto_cobrado_detraccion NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  fecha_aprobacion_finanzas TIMESTAMPTZ DEFAULT NULL,
  PRIMARY KEY (id_cotizacion),
  CONSTRAINT nro_cotizacion UNIQUE (nro_cotizacion)
);
CREATE TABLE IF NOT EXISTS cuentas (
  id_cuenta INTEGER GENERATED ALWAYS AS IDENTITY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'PEN',
  saldo_actual NUMERIC(12,2) DEFAULT '0.00',
  estado TEXT CHECK (estado IN ('ACTIVA','INACTIVA','SUSPENDIDA')) DEFAULT 'ACTIVA',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_cuenta)
);
CREATE TABLE IF NOT EXISTS detallecompra (
  id_detalle INTEGER GENERATED ALWAYS AS IDENTITY,
  id_compra INTEGER NOT NULL,
  id_item INTEGER NOT NULL,
  cantidad NUMERIC(10,2) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (id_detalle)
);
CREATE TABLE IF NOT EXISTS detallecotizacion (
  id_detalle INTEGER GENERATED ALWAYS AS IDENTITY,
  id_cotizacion INTEGER NOT NULL,
  descripcion TEXT NOT NULL,
  subdescripcion TEXT,
  notas TEXT,
  foto_url VARCHAR(500) DEFAULT NULL,
  unidad VARCHAR(30) DEFAULT NULL,
  cantidad NUMERIC(10,3) DEFAULT '1.000',
  precio_unitario NUMERIC(14,4) DEFAULT '0.0000',
  subtotal NUMERIC(14,2) GENERATED ALWAYS AS (round((cantidad * precio_unitario),2)) STORED,
  PRIMARY KEY (id_detalle)
);
CREATE TABLE IF NOT EXISTS detallefactura (
  id_detalle INTEGER GENERATED ALWAYS AS IDENTITY,
  id_factura INTEGER NOT NULL,
  orden INTEGER NOT NULL DEFAULT '1',
  codigo_item VARCHAR(50) DEFAULT NULL,
  descripcion VARCHAR(500) NOT NULL,
  unidad_sunat VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad NUMERIC(14,4) NOT NULL,
  precio_unitario NUMERIC(14,4) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  igv NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (id_detalle)
);
CREATE TABLE IF NOT EXISTS detalleguiaremision (
  id_detalle INTEGER GENERATED ALWAYS AS IDENTITY,
  id_guia INTEGER NOT NULL,
  orden INTEGER NOT NULL DEFAULT '1',
  codigo_item VARCHAR(50) DEFAULT NULL,
  descripcion VARCHAR(500) NOT NULL,
  unidad_sunat VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad NUMERIC(14,4) NOT NULL,
  PRIMARY KEY (id_detalle)
);
CREATE TABLE IF NOT EXISTS detallenotacredito (
  id_detalle INTEGER GENERATED ALWAYS AS IDENTITY,
  id_nota INTEGER NOT NULL,
  orden INTEGER NOT NULL DEFAULT '1',
  codigo_item VARCHAR(50) DEFAULT NULL,
  descripcion VARCHAR(500) NOT NULL,
  unidad_sunat VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad NUMERIC(14,4) NOT NULL,
  precio_unitario NUMERIC(14,4) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  igv NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (id_detalle)
);
CREATE TABLE IF NOT EXISTS detallenotadebito (
  id_detalle INTEGER GENERATED ALWAYS AS IDENTITY,
  id_nota INTEGER NOT NULL,
  orden INTEGER NOT NULL DEFAULT '1',
  codigo_item VARCHAR(50) DEFAULT NULL,
  descripcion VARCHAR(500) NOT NULL,
  unidad_sunat VARCHAR(10) NOT NULL DEFAULT 'NIU',
  cantidad NUMERIC(14,4) NOT NULL,
  precio_unitario NUMERIC(14,4) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  igv NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (id_detalle)
);
CREATE TABLE IF NOT EXISTS detalleordencompra (
  id_detalle INTEGER GENERATED ALWAYS AS IDENTITY,
  id_oc INTEGER NOT NULL,
  orden INTEGER NOT NULL DEFAULT '1',
  id_item INTEGER DEFAULT NULL,
  codigo VARCHAR(50) DEFAULT NULL,
  descripcion VARCHAR(500) NOT NULL,
  unidad VARCHAR(10) NOT NULL DEFAULT 'UND',
  cantidad NUMERIC(14,4) NOT NULL,
  cantidad_recibida NUMERIC(14,4) NOT NULL DEFAULT '0.0000',
  precio_unitario NUMERIC(14,4) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  observaciones VARCHAR(300) DEFAULT NULL,
  PRIMARY KEY (id_detalle)
);
CREATE TABLE IF NOT EXISTS detracciones (
  id_detraccion INTEGER GENERATED ALWAYS AS IDENTITY,
  id_servicio INTEGER NOT NULL,
  cliente VARCHAR(150) DEFAULT NULL,
  porcentaje NUMERIC(5,2) NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  cliente_deposito TEXT CHECK (cliente_deposito IN ('SI','NO','PARCIAL')) DEFAULT 'NO',
  monto_depositado NUMERIC(12,2) DEFAULT '0.00',
  fecha_deposito date DEFAULT NULL,
  fecha_pago date DEFAULT NULL,
  estado TEXT CHECK (estado IN ('PENDIENTE','PAGADO','ANULADO')) DEFAULT 'PENDIENTE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_detraccion)
);
CREATE TABLE IF NOT EXISTS facturas (
  id_factura INTEGER GENERATED ALWAYS AS IDENTITY,
  tipo TEXT CHECK (tipo IN ('FACTURA','BOLETA')) NOT NULL,
  serie VARCHAR(5) NOT NULL,
  numero INTEGER NOT NULL,
  fecha_emision date NOT NULL,
  fecha_vencimiento date DEFAULT NULL,
  cliente_tipo_doc TEXT CHECK (cliente_tipo_doc IN ('DNI','CE','RUC','PASAPORTE')) NOT NULL,
  cliente_numero_doc VARCHAR(15) NOT NULL,
  cliente_razon_social VARCHAR(200) NOT NULL,
  cliente_direccion VARCHAR(300) DEFAULT NULL,
  cliente_email VARCHAR(150) DEFAULT NULL,
  moneda TEXT CHECK (moneda IN ('PEN','USD')) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(8,4) NOT NULL DEFAULT '1.0000',
  subtotal NUMERIC(14,2) NOT NULL,
  descuento_global NUMERIC(14,2) NOT NULL DEFAULT '0.00',
  igv NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  forma_pago TEXT CHECK (forma_pago IN ('CONTADO','CREDITO')) NOT NULL DEFAULT 'CONTADO',
  dias_credito INTEGER NOT NULL DEFAULT '0',
  aplica_detraccion BOOLEAN NOT NULL DEFAULT FALSE,
  porcentaje_detraccion NUMERIC(5,2) DEFAULT '0.00',
  monto_detraccion NUMERIC(14,2) DEFAULT '0.00',
  codigo_servicio_spot VARCHAR(10) DEFAULT NULL,
  id_cotizacion INTEGER DEFAULT NULL,
  estado_sunat TEXT CHECK (estado_sunat IN ('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')) NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat VARCHAR(20) DEFAULT NULL,
  descripcion_sunat VARCHAR(500) DEFAULT NULL,
  xml_url VARCHAR(500) DEFAULT NULL,
  pdf_url VARCHAR(500) DEFAULT NULL,
  cdr_url VARCHAR(500) DEFAULT NULL,
  cadena_qr TEXT,
  id_usuario_emisor INTEGER DEFAULT NULL,
  observaciones VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  PRIMARY KEY (id_factura),
  CONSTRAINT uk_factura_serie_nro UNIQUE (tipo,serie,numero)
);
CREATE TABLE IF NOT EXISTS gastobancario (
  id_gasto_bancario INTEGER GENERATED ALWAYS AS IDENTITY,
  id_cuenta INTEGER NOT NULL,
  fecha date NOT NULL,
  categoria TEXT CHECK (categoria IN ('ITF','COMISION_MANT','COMISION_TC','PORTES','OTROS')) NOT NULL,
  concepto VARCHAR(200) NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) NOT NULL DEFAULT '1.0000',
  comentario TEXT,
  registrado_por INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_gasto_bancario)
);
CREATE TABLE IF NOT EXISTS gastos (
  id_gasto INTEGER GENERATED ALWAYS AS IDENTITY,
  nro_oc VARCHAR(50) DEFAULT NULL,
  codigo_contador VARCHAR(50) DEFAULT NULL,
  id_servicio INTEGER DEFAULT NULL,
  tipo_gasto TEXT CHECK (tipo_gasto IN ('OPERATIVO','SERVICIO')) DEFAULT 'OPERATIVO',
  centro_costo VARCHAR(100) DEFAULT NULL,
  tipo_gasto_logistica TEXT CHECK (tipo_gasto_logistica IN ('GENERAL','SERVICIO','ALMACEN')) DEFAULT NULL,
  fecha date NOT NULL,
  concepto VARCHAR(150) NOT NULL,
  proveedor_nombre VARCHAR(150) DEFAULT NULL,
  nro_comprobante VARCHAR(50) DEFAULT NULL,
  moneda VARCHAR(3) DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) DEFAULT '1.0000',
  detraccion_porcentaje NUMERIC(5,2) DEFAULT '0.00',
  monto_detraccion NUMERIC(12,2) DEFAULT '0.00',
  detraccion_depositada TEXT CHECK (detraccion_depositada IN ('SI','NO','NA')) DEFAULT 'NA',
  monto_base NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  aplica_igv BOOLEAN DEFAULT FALSE,
  igv_base NUMERIC(12,2) DEFAULT '0.00',
  total_base NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  estado TEXT CHECK (estado IN ('BORRADOR','CONFIRMADO','ANULADO')) DEFAULT 'CONFIRMADO',
  estado_pago TEXT CHECK (estado_pago IN ('PENDIENTE','PARCIAL','PAGADO','ANULADO')) DEFAULT 'PENDIENTE',
  tipo_ultima_accion VARCHAR(50) DEFAULT 'CREACION',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_gasto)
);
CREATE TABLE IF NOT EXISTS guiasremision (
  id_guia INTEGER GENERATED ALWAYS AS IDENTITY,
  serie VARCHAR(5) NOT NULL,
  numero INTEGER NOT NULL,
  fecha_emision date NOT NULL,
  fecha_traslado date NOT NULL,
  motivo_codigo VARCHAR(2) NOT NULL,
  motivo_descripcion VARCHAR(200) NOT NULL,
  destinatario_tipo_doc TEXT CHECK (destinatario_tipo_doc IN ('DNI','CE','RUC','PASAPORTE')) NOT NULL,
  destinatario_num_doc VARCHAR(15) NOT NULL,
  destinatario_razon VARCHAR(200) NOT NULL,
  punto_partida VARCHAR(300) NOT NULL,
  punto_llegada VARCHAR(300) NOT NULL,
  ubigeo_partida VARCHAR(6) DEFAULT NULL,
  ubigeo_llegada VARCHAR(6) DEFAULT NULL,
  modalidad_transporte TEXT CHECK (modalidad_transporte IN ('PRIVADO','PUBLICO')) NOT NULL DEFAULT 'PRIVADO',
  transportista_ruc VARCHAR(11) DEFAULT NULL,
  transportista_razon VARCHAR(200) DEFAULT NULL,
  conductor_dni VARCHAR(12) DEFAULT NULL,
  conductor_nombre VARCHAR(200) DEFAULT NULL,
  conductor_licencia VARCHAR(20) DEFAULT NULL,
  placa_vehiculo VARCHAR(10) DEFAULT NULL,
  peso_total_bruto NUMERIC(10,3) NOT NULL,
  unidad_peso VARCHAR(5) NOT NULL DEFAULT 'KGM',
  numero_bultos INTEGER NOT NULL DEFAULT '1',
  id_factura_referencia INTEGER DEFAULT NULL,
  estado_sunat TEXT CHECK (estado_sunat IN ('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')) NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat VARCHAR(20) DEFAULT NULL,
  descripcion_sunat VARCHAR(500) DEFAULT NULL,
  xml_url VARCHAR(500) DEFAULT NULL,
  pdf_url VARCHAR(500) DEFAULT NULL,
  cdr_url VARCHAR(500) DEFAULT NULL,
  id_usuario_emisor INTEGER DEFAULT NULL,
  observaciones VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  PRIMARY KEY (id_guia),
  CONSTRAINT uk_guia UNIQUE (serie,numero)
);
CREATE TABLE IF NOT EXISTS inventario (
  id_item INTEGER GENERATED ALWAYS AS IDENTITY,
  sku VARCHAR(50) NOT NULL,
  categoria TEXT CHECK (categoria IN ('Material','Consumible','Herramienta','Equipo','EPP')) DEFAULT 'Material',
  nombre VARCHAR(150) NOT NULL,
  unidad VARCHAR(50) DEFAULT 'UNIDAD',
  stock_actual NUMERIC(10,2) DEFAULT '0.00',
  stock_minimo NUMERIC(10,2) DEFAULT '10.00',
  costo_promedio_unitario NUMERIC(12,2) DEFAULT '0.00',
  moneda VARCHAR(3) DEFAULT 'PEN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_item),
  CONSTRAINT sku UNIQUE (sku)
);
CREATE TABLE IF NOT EXISTS movimientobancario (
  id_movimiento INTEGER GENERATED ALWAYS AS IDENTITY,
  id_cuenta INTEGER NOT NULL,
  fecha date NOT NULL,
  fecha_proceso date DEFAULT NULL,
  nro_operacion VARCHAR(50) DEFAULT NULL,
  canal VARCHAR(30) DEFAULT NULL,
  tipo_movimiento_banco VARCHAR(60) DEFAULT NULL,
  descripcion_banco VARCHAR(255) NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  tipo TEXT CHECK (tipo IN ('ABONO','CARGO')) NOT NULL,
  saldo_contable NUMERIC(14,2) DEFAULT NULL,
  fuente TEXT CHECK (fuente IN ('MANUAL','AUTO','IMPORT_EECC')) NOT NULL DEFAULT 'MANUAL',
  estado_conciliacion TEXT CHECK (estado_conciliacion IN ('POR_CONCILIAR','CONCILIADO','IGNORADO')) NOT NULL DEFAULT 'POR_CONCILIAR',
  ref_tipo TEXT CHECK (ref_tipo IN ('COBRANZA','COMPRA','GASTO','GASTO_BANCARIO','PAGO_IMPUESTO','TRASPASO','PRESTAMO','OTRO')) DEFAULT NULL,
  ref_id INTEGER DEFAULT NULL,
  comentario TEXT,
  conciliado_por INTEGER DEFAULT NULL,
  conciliado_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_movimiento)
);
CREATE TABLE IF NOT EXISTS movimientosinventario (
  id_movimiento INTEGER GENERATED ALWAYS AS IDENTITY,
  id_item INTEGER NOT NULL,
  referencia_tipo TEXT CHECK (referencia_tipo IN ('SERVICIO','COMPRA','GASTO','PRESTAMO')) DEFAULT NULL,
  referencia_id INTEGER DEFAULT NULL,
  tipo_movimiento VARCHAR(20) NOT NULL,
  cantidad NUMERIC(10,2) NOT NULL,
  saldo_posterior NUMERIC(10,2) NOT NULL,
  fecha_movimiento TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_movimiento)
);
CREATE TABLE IF NOT EXISTS notascredito (
  id_nota INTEGER GENERATED ALWAYS AS IDENTITY,
  serie VARCHAR(5) NOT NULL,
  numero INTEGER NOT NULL,
  fecha_emision date NOT NULL,
  tipo_doc_referencia TEXT CHECK (tipo_doc_referencia IN ('FACTURA','BOLETA')) NOT NULL,
  id_factura_referencia INTEGER DEFAULT NULL,
  serie_referencia VARCHAR(5) NOT NULL,
  numero_referencia INTEGER NOT NULL,
  motivo_codigo VARCHAR(2) NOT NULL,
  motivo_descripcion VARCHAR(200) NOT NULL,
  cliente_tipo_doc TEXT CHECK (cliente_tipo_doc IN ('DNI','CE','RUC','PASAPORTE')) NOT NULL,
  cliente_numero_doc VARCHAR(15) NOT NULL,
  cliente_razon_social VARCHAR(200) NOT NULL,
  moneda TEXT CHECK (moneda IN ('PEN','USD')) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(8,4) NOT NULL DEFAULT '1.0000',
  subtotal NUMERIC(14,2) NOT NULL,
  igv NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  estado_sunat TEXT CHECK (estado_sunat IN ('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')) NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat VARCHAR(20) DEFAULT NULL,
  descripcion_sunat VARCHAR(500) DEFAULT NULL,
  xml_url VARCHAR(500) DEFAULT NULL,
  pdf_url VARCHAR(500) DEFAULT NULL,
  cdr_url VARCHAR(500) DEFAULT NULL,
  id_usuario_emisor INTEGER DEFAULT NULL,
  observaciones VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  PRIMARY KEY (id_nota),
  CONSTRAINT uk_nota_credito UNIQUE (serie,numero)
);
CREATE TABLE IF NOT EXISTS notasdebito (
  id_nota INTEGER GENERATED ALWAYS AS IDENTITY,
  serie VARCHAR(5) NOT NULL,
  numero INTEGER NOT NULL,
  fecha_emision date NOT NULL,
  tipo_doc_referencia TEXT CHECK (tipo_doc_referencia IN ('FACTURA','BOLETA')) NOT NULL,
  id_factura_referencia INTEGER DEFAULT NULL,
  serie_referencia VARCHAR(5) NOT NULL,
  numero_referencia INTEGER NOT NULL,
  motivo_codigo VARCHAR(2) NOT NULL,
  motivo_descripcion VARCHAR(200) NOT NULL,
  cliente_tipo_doc TEXT CHECK (cliente_tipo_doc IN ('DNI','CE','RUC','PASAPORTE')) NOT NULL,
  cliente_numero_doc VARCHAR(15) NOT NULL,
  cliente_razon_social VARCHAR(200) NOT NULL,
  moneda TEXT CHECK (moneda IN ('PEN','USD')) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(8,4) NOT NULL DEFAULT '1.0000',
  subtotal NUMERIC(14,2) NOT NULL,
  igv NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  estado_sunat TEXT CHECK (estado_sunat IN ('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')) NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat VARCHAR(20) DEFAULT NULL,
  descripcion_sunat VARCHAR(500) DEFAULT NULL,
  xml_url VARCHAR(500) DEFAULT NULL,
  pdf_url VARCHAR(500) DEFAULT NULL,
  cdr_url VARCHAR(500) DEFAULT NULL,
  id_usuario_emisor INTEGER DEFAULT NULL,
  observaciones VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  PRIMARY KEY (id_nota),
  CONSTRAINT uk_nota_debito UNIQUE (serie,numero)
);
CREATE TABLE IF NOT EXISTS ordenescompra (
  id_oc INTEGER GENERATED ALWAYS AS IDENTITY,
  nro_oc VARCHAR(30) NOT NULL,
  fecha_emision date NOT NULL,
  fecha_entrega_esperada date DEFAULT NULL,
  id_proveedor INTEGER NOT NULL,
  id_servicio INTEGER DEFAULT NULL,
  centro_costo VARCHAR(60) NOT NULL DEFAULT 'OFICINA CENTRAL',
  tipo_oc TEXT CHECK (tipo_oc IN ('GENERAL','SERVICIO','ALMACEN')) NOT NULL DEFAULT 'GENERAL',
  empresa TEXT CHECK (empresa IN ('ME','PT')) NOT NULL DEFAULT 'ME',
  moneda TEXT CHECK (moneda IN ('PEN','USD')) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(8,4) NOT NULL DEFAULT '1.0000',
  subtotal NUMERIC(14,2) NOT NULL,
  descuento NUMERIC(14,2) NOT NULL DEFAULT '0.00',
  aplica_igv BOOLEAN NOT NULL DEFAULT TRUE,
  igv NUMERIC(14,2) NOT NULL DEFAULT '0.00',
  total NUMERIC(14,2) NOT NULL,
  forma_pago TEXT CHECK (forma_pago IN ('CONTADO','CREDITO')) NOT NULL DEFAULT 'CONTADO',
  dias_credito INTEGER NOT NULL DEFAULT '0',
  condiciones_entrega VARCHAR(300) DEFAULT NULL,
  observaciones VARCHAR(500) DEFAULT NULL,
  estado TEXT CHECK (estado IN ('BORRADOR','APROBADA','ENVIADA','RECIBIDA_PARCIAL','RECIBIDA','FACTURADA','PAGADA','ANULADA')) NOT NULL DEFAULT 'BORRADOR',
  id_usuario_crea INTEGER DEFAULT NULL,
  id_usuario_aprueba INTEGER DEFAULT NULL,
  fecha_aprobacion TIMESTAMPTZ NULL DEFAULT NULL,
  motivo_anulacion VARCHAR(300) DEFAULT NULL,
  pdf_url VARCHAR(500) DEFAULT NULL,
  id_compra_generada INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  atencion VARCHAR(150) DEFAULT NULL COMMENT 'Persona contacto en la empresa del proveedor',
  contacto_interno VARCHAR(150) DEFAULT NULL COMMENT 'Nombre del ejecutivo interno que atiende la OC',
  contacto_telefono VARCHAR(30) DEFAULT NULL COMMENT 'Celular del contacto interno',
  solicitado_por VARCHAR(150) DEFAULT NULL COMMENT 'Firma: nombre de quien solicitó',
  revisado_por VARCHAR(150) DEFAULT NULL COMMENT 'Firma: nombre de quien revisó',
  autorizado_por VARCHAR(150) DEFAULT NULL COMMENT 'Firma: nombre de quien autorizó',
  cuenta_bancaria_pago VARCHAR(300) DEFAULT NULL COMMENT 'Cta bancaria del proveedor: ej "Cta.Interbank Soles 898-3187294381; CCI 00389801318729438149"',
  lugar_entrega VARCHAR(200) DEFAULT NULL COMMENT 'Lima, Puente Piedra, Obra Toromocho, N/A',
  PRIMARY KEY (id_oc),
  CONSTRAINT uk_oc_nro UNIQUE (nro_oc,empresa)
);
CREATE TABLE IF NOT EXISTS pagosimpuestos (
  id_pago INTEGER GENERATED ALWAYS AS IDENTITY,
  fecha date NOT NULL,
  tipo_impuesto VARCHAR(50) NOT NULL,
  periodo VARCHAR(20) DEFAULT NULL,
  monto NUMERIC(12,2) NOT NULL,
  id_cuenta INTEGER DEFAULT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) NOT NULL DEFAULT '1.0000',
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_pago)
);
CREATE TABLE IF NOT EXISTS periodoscontables (
  id INTEGER GENERATED ALWAYS AS IDENTITY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  estado TEXT CHECK (estado IN ('ABIERTO','CERRADO','BLOQUEADO')) NOT NULL DEFAULT 'ABIERTO',
  fecha_cierre TIMESTAMPTZ NULL DEFAULT NULL,
  id_usuario_cierre INTEGER DEFAULT NULL,
  observaciones VARCHAR(500) DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_periodo UNIQUE (anio,mes)
);
CREATE TABLE IF NOT EXISTS prestamosotorgados (
  id_prestamo INTEGER GENERATED ALWAYS AS IDENTITY,
  nro_oc VARCHAR(50) DEFAULT NULL,
  deudor VARCHAR(150) NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  comentario TEXT,
  fecha_emision date NOT NULL,
  fecha_vencimiento date DEFAULT NULL,
  moneda VARCHAR(3) DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) DEFAULT '1.0000',
  monto_capital NUMERIC(12,2) NOT NULL,
  tasa_interes NUMERIC(5,2) DEFAULT '0.00',
  monto_interes NUMERIC(12,2) DEFAULT '0.00',
  monto_total NUMERIC(12,2) NOT NULL,
  monto_pagado NUMERIC(12,2) DEFAULT '0.00',
  saldo NUMERIC(12,2) NOT NULL,
  estado TEXT CHECK (estado IN ('PENDIENTE','PARCIAL','COBRADO','ANULADO')) DEFAULT 'PENDIENTE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_prestamo)
);
CREATE TABLE IF NOT EXISTS prestamostomados (
  id_prestamo INTEGER GENERATED ALWAYS AS IDENTITY,
  nro_oc VARCHAR(50) DEFAULT NULL,
  acreedor VARCHAR(150) NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  comentario TEXT,
  fecha_emision date NOT NULL,
  fecha_vencimiento date DEFAULT NULL,
  moneda VARCHAR(3) DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) DEFAULT '1.0000',
  monto_capital NUMERIC(12,2) NOT NULL,
  tasa_interes NUMERIC(5,2) DEFAULT '0.00',
  monto_interes NUMERIC(12,2) DEFAULT '0.00',
  monto_total NUMERIC(12,2) NOT NULL,
  monto_pagado NUMERIC(12,2) DEFAULT '0.00',
  saldo NUMERIC(12,2) NOT NULL,
  estado TEXT CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADO','ANULADO')) DEFAULT 'PENDIENTE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_prestamo)
);
CREATE TABLE IF NOT EXISTS proveedores (
  id_proveedor INTEGER GENERATED ALWAYS AS IDENTITY,
  ruc VARCHAR(20) DEFAULT NULL,
  razon_social VARCHAR(150) NOT NULL,
  tipo TEXT CHECK (tipo IN ('EMPRESA','PERSONA_NATURAL')) NOT NULL DEFAULT 'EMPRESA',
  dni VARCHAR(8) DEFAULT NULL,
  banco_1_nombre VARCHAR(60) DEFAULT NULL,
  banco_1_numero VARCHAR(30) DEFAULT NULL,
  banco_1_cci VARCHAR(30) DEFAULT NULL,
  banco_2_nombre VARCHAR(60) DEFAULT NULL,
  banco_2_numero VARCHAR(30) DEFAULT NULL,
  banco_2_cci VARCHAR(30) DEFAULT NULL,
  contacto VARCHAR(150) DEFAULT NULL,
  telefono VARCHAR(50) DEFAULT NULL,
  email VARCHAR(100) DEFAULT NULL,
  direccion VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_proveedor),
  CONSTRAINT ruc UNIQUE (ruc)
);
CREATE TABLE IF NOT EXISTS servicios (
  id_servicio INTEGER GENERATED ALWAYS AS IDENTITY,
  codigo VARCHAR(50) DEFAULT NULL,
  nro_cotizacion VARCHAR(50) DEFAULT NULL,
  nombre VARCHAR(150) NOT NULL,
  cliente VARCHAR(150) DEFAULT NULL,
  descripcion TEXT,
  fecha_servicio date NOT NULL,
  fecha_vencimiento date DEFAULT NULL,
  moneda VARCHAR(3) DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) DEFAULT '1.0000',
  monto_base NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  aplica_igv BOOLEAN DEFAULT FALSE,
  igv_base NUMERIC(12,2) DEFAULT '0.00',
  total_base NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  detraccion_porcentaje NUMERIC(5,2) DEFAULT '0.00',
  monto_detraccion NUMERIC(12,2) DEFAULT '0.00',
  retencion_porcentaje NUMERIC(5,2) DEFAULT '0.00',
  monto_retencion NUMERIC(12,2) DEFAULT '0.00',
  estado TEXT CHECK (estado IN ('PENDIENTE','PARCIAL','COBRADO','ANULADO')) DEFAULT 'PENDIENTE',
  estado_trabajo VARCHAR(50) DEFAULT 'EN_PROCESO',
  tipo_ultima_accion VARCHAR(50) DEFAULT 'CREACION',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_servicio),
  CONSTRAINT codigo UNIQUE (codigo)
);
CREATE TABLE IF NOT EXISTS tipocambio (
  id_tipo_cambio INTEGER GENERATED ALWAYS AS IDENTITY,
  fecha date NOT NULL,
  moneda VARCHAR(3) NOT NULL,
  valor_compra NUMERIC(10,4) NOT NULL,
  valor_venta NUMERIC(10,4) NOT NULL,
  fuente VARCHAR(50) DEFAULT 'SBS',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_tipo_cambio),
  CONSTRAINT uk_tipocambio_fecha_moneda UNIQUE (fecha,moneda)
);
CREATE TABLE IF NOT EXISTS transacciones (
  id_transaccion INTEGER GENERATED ALWAYS AS IDENTITY,
  id_cuenta INTEGER NOT NULL,
  referencia_tipo TEXT CHECK (referencia_tipo IN ('SERVICIO','COMPRA','GASTO','PRESTAMO')) DEFAULT NULL,
  referencia_id INTEGER DEFAULT NULL,
  tipo_movimiento TEXT CHECK (tipo_movimiento IN ('INGRESO','EGRESO')) NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4) NOT NULL DEFAULT '1.0000',
  aplica_igv BOOLEAN DEFAULT TRUE,
  tipo_igv VARCHAR(15) DEFAULT NULL,
  monto_original NUMERIC(12,2) NOT NULL,
  igv_original NUMERIC(12,2) NOT NULL,
  total_original NUMERIC(12,2) NOT NULL,
  monto_base NUMERIC(12,2) NOT NULL,
  igv_base NUMERIC(12,2) NOT NULL,
  total_base NUMERIC(12,2) NOT NULL,
  estado TEXT CHECK (estado IN ('PENDIENTE','REALIZADO','ANULADO')) DEFAULT 'PENDIENTE',
  fecha TIMESTAMPTZ NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_transaccion)
);
CREATE TABLE IF NOT EXISTS usuariomodulos (
  id INTEGER GENERATED ALWAYS AS IDENTITY,
  id_usuario INTEGER NOT NULL,
  modulo TEXT CHECK (modulo IN ('GERENCIA','COMERCIAL','FINANZAS','LOGISTICA','ALMACEN','ADMINISTRACION')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id),
  CONSTRAINT uk_usuario_modulo UNIQUE (id_usuario,modulo)
);
CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario INTEGER GENERATED ALWAYS AS IDENTITY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol TEXT CHECK (rol IN ('GERENTE','USUARIO','APROBADOR','CAJA','CONTADOR')) NOT NULL DEFAULT 'USUARIO',
  activo BOOLEAN DEFAULT TRUE,
  ultimo_acceso TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id_usuario),
  CONSTRAINT email UNIQUE (email)
);

-- Foreign Keys (después de crear todas las tablas para evitar order issues)
ALTER TABLE aprobacionesoc ADD CONSTRAINT fk_aprob_oc FOREIGN KEY (id_oc) REFERENCES ordenescompra (id_oc) ON DELETE CASCADE;
ALTER TABLE cobranzascotizacion ADD CONSTRAINT fk_cobranza_cot FOREIGN KEY (id_cotizacion) REFERENCES cotizaciones (id_cotizacion) ON DELETE CASCADE;
ALTER TABLE cobranzascotizacion ADD CONSTRAINT fk_cobranza_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuentas (id_cuenta) ON DELETE SET NULL;
ALTER TABLE cobranzascotizacion ADD CONSTRAINT fk_cobranza_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios (id_usuario) ON DELETE SET NULL;
ALTER TABLE costosservicio ADD CONSTRAINT fk_costos_servicio FOREIGN KEY (id_servicio) REFERENCES servicios (id_servicio);
ALTER TABLE cotizaciones ADD CONSTRAINT fk_cotizacion_servicio FOREIGN KEY (id_servicio) REFERENCES servicios (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE detallecompra ADD CONSTRAINT fk_detalle_item FOREIGN KEY (id_item) REFERENCES inventario (id_item) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE detallecotizacion ADD CONSTRAINT fk_detalle_cotizacion FOREIGN KEY (id_cotizacion) REFERENCES cotizaciones (id_cotizacion) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE detallefactura ADD CONSTRAINT fk_detalle_factura FOREIGN KEY (id_factura) REFERENCES facturas (id_factura) ON DELETE CASCADE;
ALTER TABLE detalleguiaremision ADD CONSTRAINT fk_detalle_guia FOREIGN KEY (id_guia) REFERENCES guiasremision (id_guia) ON DELETE CASCADE;
ALTER TABLE detallenotacredito ADD CONSTRAINT fk_detalle_nc FOREIGN KEY (id_nota) REFERENCES notascredito (id_nota) ON DELETE CASCADE;
ALTER TABLE detallenotadebito ADD CONSTRAINT fk_detalle_nd FOREIGN KEY (id_nota) REFERENCES notasdebito (id_nota) ON DELETE CASCADE;
ALTER TABLE detalleordencompra ADD CONSTRAINT fk_detoc_item FOREIGN KEY (id_item) REFERENCES inventario (id_item) ON DELETE SET NULL;
ALTER TABLE detalleordencompra ADD CONSTRAINT fk_detoc_oc FOREIGN KEY (id_oc) REFERENCES ordenescompra (id_oc) ON DELETE CASCADE;
ALTER TABLE detracciones ADD CONSTRAINT fk_detracciones_servicio FOREIGN KEY (id_servicio) REFERENCES servicios (id_servicio);
ALTER TABLE facturas ADD CONSTRAINT fk_facturas_cotizacion FOREIGN KEY (id_cotizacion) REFERENCES cotizaciones (id_cotizacion) ON DELETE SET NULL;
ALTER TABLE gastobancario ADD CONSTRAINT fk_gb_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuentas (id_cuenta) ON DELETE CASCADE;
ALTER TABLE gastobancario ADD CONSTRAINT fk_gb_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios (id_usuario) ON DELETE SET NULL;
ALTER TABLE guiasremision ADD CONSTRAINT fk_guia_factura FOREIGN KEY (id_factura_referencia) REFERENCES facturas (id_factura) ON DELETE SET NULL;
ALTER TABLE movimientobancario ADD CONSTRAINT fk_mov_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuentas (id_cuenta) ON DELETE CASCADE;
ALTER TABLE movimientobancario ADD CONSTRAINT fk_mov_usuario FOREIGN KEY (conciliado_por) REFERENCES usuarios (id_usuario) ON DELETE SET NULL;
ALTER TABLE movimientosinventario ADD CONSTRAINT fk_movimientos_item FOREIGN KEY (id_item) REFERENCES inventario (id_item);
ALTER TABLE notascredito ADD CONSTRAINT fk_nc_factura FOREIGN KEY (id_factura_referencia) REFERENCES facturas (id_factura) ON DELETE SET NULL;
ALTER TABLE notasdebito ADD CONSTRAINT fk_nd_factura FOREIGN KEY (id_factura_referencia) REFERENCES facturas (id_factura) ON DELETE SET NULL;
ALTER TABLE ordenescompra ADD CONSTRAINT fk_oc_compra FOREIGN KEY (id_compra_generada) REFERENCES compras (id_compra) ON DELETE SET NULL;
ALTER TABLE ordenescompra ADD CONSTRAINT fk_oc_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedores (id_proveedor) ON DELETE RESTRICT;
ALTER TABLE ordenescompra ADD CONSTRAINT fk_oc_servicio FOREIGN KEY (id_servicio) REFERENCES servicios (id_servicio) ON DELETE SET NULL;
ALTER TABLE pagosimpuestos ADD CONSTRAINT fk_pagoimp_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuentas (id_cuenta) ON DELETE SET NULL;
ALTER TABLE transacciones ADD CONSTRAINT fk_transacciones_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuentas (id_cuenta);
ALTER TABLE usuariomodulos ADD CONSTRAINT usuariomodulos_ibfk_1 FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_adjuntos_ref ON adjuntos (ref_tipo,ref_id);
CREATE INDEX IF NOT EXISTS idx_adjuntos_usuario ON adjuntos (id_usuario_subio);
CREATE INDEX IF NOT EXISTS idx_aprob_oc ON aprobacionesoc (id_oc);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria (entidad,entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (id_usuario);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria (accion);
CREATE INDEX IF NOT EXISTS fk_cobranza_cuenta ON cobranzascotizacion (id_cuenta);
CREATE INDEX IF NOT EXISTS fk_cobranza_usuario ON cobranzascotizacion (registrado_por);
CREATE INDEX IF NOT EXISTS idx_cob_cotizacion ON cobranzascotizacion (id_cotizacion);
CREATE INDEX IF NOT EXISTS idx_cob_fecha ON cobranzascotizacion (fecha_movimiento);
CREATE INDEX IF NOT EXISTS idx_cob_tipo ON cobranzascotizacion (tipo);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras (fecha);
CREATE INDEX IF NOT EXISTS idx_compras_estado_pago ON compras (estado_pago);
CREATE INDEX IF NOT EXISTS idx_costos_fecha ON costosservicio (fecha);
CREATE INDEX IF NOT EXISTS fk_costos_servicio ON costosservicio (id_servicio);
CREATE INDEX IF NOT EXISTS fk_cotizacion_servicio ON cotizaciones (id_servicio);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones (estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON cotizaciones (cliente);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha ON cotizaciones (fecha);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_marca ON cotizaciones (marca);
CREATE INDEX IF NOT EXISTS fk_detalle_item ON detallecompra (id_item);
CREATE INDEX IF NOT EXISTS fk_detalle_cotizacion ON detallecotizacion (id_cotizacion);
CREATE INDEX IF NOT EXISTS idx_detalle_factura ON detallefactura (id_factura);
CREATE INDEX IF NOT EXISTS idx_detalle_guia ON detalleguiaremision (id_guia);
CREATE INDEX IF NOT EXISTS idx_detalle_nc ON detallenotacredito (id_nota);
CREATE INDEX IF NOT EXISTS idx_detalle_nd ON detallenotadebito (id_nota);
CREATE INDEX IF NOT EXISTS idx_detalle_oc ON detalleordencompra (id_oc);
CREATE INDEX IF NOT EXISTS idx_detalle_item ON detalleordencompra (id_item);
CREATE INDEX IF NOT EXISTS fk_detracciones_servicio ON detracciones (id_servicio);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente_doc ON facturas (cliente_numero_doc);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas (estado_sunat);
CREATE INDEX IF NOT EXISTS idx_facturas_cotizacion ON facturas (id_cotizacion);
CREATE INDEX IF NOT EXISTS fk_gb_usuario ON gastobancario (registrado_por);
CREATE INDEX IF NOT EXISTS idx_gb_cuenta_fecha ON gastobancario (id_cuenta,fecha);
CREATE INDEX IF NOT EXISTS idx_gb_categoria ON gastobancario (categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos (fecha);
CREATE INDEX IF NOT EXISTS idx_guia_fecha ON guiasremision (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_guia_traslado ON guiasremision (fecha_traslado);
CREATE INDEX IF NOT EXISTS idx_guia_factura ON guiasremision (id_factura_referencia);
CREATE INDEX IF NOT EXISTS idx_guia_estado ON guiasremision (estado_sunat);
CREATE INDEX IF NOT EXISTS fk_mov_usuario ON movimientobancario (conciliado_por);
CREATE INDEX IF NOT EXISTS idx_mov_cuenta_fecha ON movimientobancario (id_cuenta,fecha);
CREATE INDEX IF NOT EXISTS idx_mov_estado ON movimientobancario (estado_conciliacion);
CREATE INDEX IF NOT EXISTS idx_mov_unico ON movimientobancario (id_cuenta,nro_operacion,fecha,monto);
CREATE INDEX IF NOT EXISTS idx_movimientos_ref ON movimientosinventario (referencia_tipo,referencia_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientosinventario (fecha_movimiento);
CREATE INDEX IF NOT EXISTS fk_movimientos_item ON movimientosinventario (id_item);
CREATE INDEX IF NOT EXISTS idx_nc_referencia ON notascredito (id_factura_referencia);
CREATE INDEX IF NOT EXISTS idx_nc_fecha ON notascredito (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_nc_estado ON notascredito (estado_sunat);
CREATE INDEX IF NOT EXISTS idx_nd_referencia ON notasdebito (id_factura_referencia);
CREATE INDEX IF NOT EXISTS idx_nd_fecha ON notasdebito (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_oc_fecha ON ordenescompra (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_oc_proveedor ON ordenescompra (id_proveedor);
CREATE INDEX IF NOT EXISTS idx_oc_estado ON ordenescompra (estado);
CREATE INDEX IF NOT EXISTS idx_oc_servicio ON ordenescompra (id_servicio);
CREATE INDEX IF NOT EXISTS fk_oc_compra ON ordenescompra (id_compra_generada);
CREATE INDEX IF NOT EXISTS fk_pagoimp_cuenta ON pagosimpuestos (id_cuenta);
CREATE INDEX IF NOT EXISTS idx_periodos_estado ON periodoscontables (estado);
CREATE INDEX IF NOT EXISTS idx_servicios_estado ON servicios (estado);
CREATE INDEX IF NOT EXISTS idx_servicios_cliente ON servicios (cliente);
CREATE INDEX IF NOT EXISTS idx_servicios_vencimiento ON servicios (fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_tipocambio_fecha ON tipocambio (fecha);
CREATE INDEX IF NOT EXISTS idx_transacciones_ref ON transacciones (referencia_tipo,referencia_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones (fecha);
CREATE INDEX IF NOT EXISTS fk_transacciones_cuenta ON transacciones (id_cuenta);
CREATE INDEX IF NOT EXISTS idx_usuario_modulos ON usuariomodulos (id_usuario);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);

-- Trigger genérico para updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compras_set_updated_at BEFORE UPDATE ON compras FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER configuracionempresa_set_updated_at BEFORE UPDATE ON configuracionempresa FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER configuracionmarca_set_updated_at BEFORE UPDATE ON configuracionmarca FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER costosservicio_set_updated_at BEFORE UPDATE ON costosservicio FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER cotizaciones_set_updated_at BEFORE UPDATE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER cuentas_set_updated_at BEFORE UPDATE ON cuentas FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER detracciones_set_updated_at BEFORE UPDATE ON detracciones FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER facturas_set_updated_at BEFORE UPDATE ON facturas FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER gastos_set_updated_at BEFORE UPDATE ON gastos FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER guiasremision_set_updated_at BEFORE UPDATE ON guiasremision FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER inventario_set_updated_at BEFORE UPDATE ON inventario FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER movimientosinventario_set_updated_at BEFORE UPDATE ON movimientosinventario FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER notascredito_set_updated_at BEFORE UPDATE ON notascredito FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER notasdebito_set_updated_at BEFORE UPDATE ON notasdebito FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER ordenescompra_set_updated_at BEFORE UPDATE ON ordenescompra FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER prestamosotorgados_set_updated_at BEFORE UPDATE ON prestamosotorgados FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER prestamostomados_set_updated_at BEFORE UPDATE ON prestamostomados FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER proveedores_set_updated_at BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER servicios_set_updated_at BEFORE UPDATE ON servicios FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER tipocambio_set_updated_at BEFORE UPDATE ON tipocambio FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER transacciones_set_updated_at BEFORE UPDATE ON transacciones FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER usuarios_set_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ===========================================================
-- Fin de schema
-- ===========================================================
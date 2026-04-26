
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_migrations` (
  `name` varchar(190) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `adjuntos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ref_tipo` varchar(40) NOT NULL,
  `ref_id` int NOT NULL,
  `nombre_original` varchar(255) DEFAULT NULL,
  `url` varchar(500) NOT NULL,
  `cloudinary_public_id` varchar(300) DEFAULT NULL,
  `mimetype` varchar(100) DEFAULT NULL,
  `tamano_bytes` int DEFAULT NULL,
  `id_usuario_subio` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_adjuntos_ref` (`ref_tipo`,`ref_id`),
  KEY `idx_adjuntos_usuario` (`id_usuario_subio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `aprobacionesoc` (
  `id_aprobacion` int NOT NULL AUTO_INCREMENT,
  `id_oc` int NOT NULL,
  `id_usuario` int NOT NULL,
  `accion` enum('APROBAR','RECHAZAR','SOLICITAR_CAMBIOS') NOT NULL,
  `comentario` varchar(500) DEFAULT NULL,
  `monto_total_aprobado` decimal(14,2) DEFAULT NULL,
  `moneda` varchar(3) DEFAULT NULL,
  `fecha` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_aprobacion`),
  KEY `idx_aprob_oc` (`id_oc`),
  CONSTRAINT `fk_aprob_oc` FOREIGN KEY (`id_oc`) REFERENCES `ordenescompra` (`id_oc`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `fecha` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `id_usuario` int DEFAULT NULL,
  `nombre_usuario` varchar(100) DEFAULT NULL,
  `accion` enum('CREATE','UPDATE','DELETE','ANULAR','LOGIN','LOGOUT','CONFIG','EXPORT','EMIT') NOT NULL,
  `entidad` varchar(60) NOT NULL,
  `entidad_id` varchar(60) DEFAULT NULL,
  `datos_antes` json DEFAULT NULL,
  `datos_despues` json DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auditoria_fecha` (`fecha`),
  KEY `idx_auditoria_entidad` (`entidad`,`entidad_id`),
  KEY `idx_auditoria_usuario` (`id_usuario`),
  KEY `idx_auditoria_accion` (`accion`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cobranzascotizacion` (
  `id_cobranza` int NOT NULL AUTO_INCREMENT,
  `id_cotizacion` int NOT NULL,
  `tipo` enum('DEPOSITO_BANCO','DETRACCION_BN','RETENCION') NOT NULL,
  `fecha_movimiento` date NOT NULL,
  `id_cuenta` int DEFAULT NULL,
  `banco` varchar(80) DEFAULT NULL,
  `nro_operacion` varchar(50) DEFAULT NULL,
  `monto` decimal(12,2) NOT NULL,
  `moneda` varchar(3) NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `voucher_url` varchar(500) DEFAULT NULL,
  `comentario` text,
  `registrado_por` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_cobranza`),
  KEY `fk_cobranza_cuenta` (`id_cuenta`),
  KEY `fk_cobranza_usuario` (`registrado_por`),
  KEY `idx_cob_cotizacion` (`id_cotizacion`),
  KEY `idx_cob_fecha` (`fecha_movimiento`),
  KEY `idx_cob_tipo` (`tipo`),
  CONSTRAINT `fk_cobranza_cot` FOREIGN KEY (`id_cotizacion`) REFERENCES `cotizaciones` (`id_cotizacion`) ON DELETE CASCADE,
  CONSTRAINT `fk_cobranza_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuentas` (`id_cuenta`) ON DELETE SET NULL,
  CONSTRAINT `fk_cobranza_usuario` FOREIGN KEY (`registrado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras` (
  `id_compra` int NOT NULL AUTO_INCREMENT,
  `nro_oc` varchar(50) NOT NULL DEFAULT '',
  `id_proveedor` int NOT NULL,
  `fecha` date NOT NULL,
  `nro_comprobante` varchar(50) NOT NULL,
  `centro_costo` varchar(100) DEFAULT NULL,
  `moneda` varchar(3) DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `monto_base` decimal(12,2) NOT NULL,
  `igv_base` decimal(12,2) NOT NULL,
  `total_base` decimal(12,2) NOT NULL,
  `aplica_igv` tinyint(1) DEFAULT '1',
  `estado` enum('PENDIENTE','CONFIRMADA','ANULADO') NOT NULL DEFAULT 'CONFIRMADA',
  `estado_pago` enum('PENDIENTE','PARCIAL','PAGADO','ANULADO') DEFAULT 'PENDIENTE',
  `tipo_ultima_accion` varchar(50) DEFAULT 'CREACION',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_compra`),
  KEY `idx_compras_fecha` (`fecha`),
  KEY `idx_compras_estado_pago` (`estado_pago`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracionempresa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ruc` varchar(11) NOT NULL,
  `razon_social` varchar(200) NOT NULL,
  `nombre_comercial` varchar(200) DEFAULT NULL,
  `direccion_fiscal` varchar(300) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email_facturacion` varchar(150) DEFAULT NULL,
  `web` varchar(150) DEFAULT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `regimen` enum('NRUS','RER','RMT','GENERAL') NOT NULL DEFAULT 'RMT',
  `fecha_cambio_regimen` date DEFAULT NULL,
  `aplica_igv` tinyint(1) NOT NULL DEFAULT '1',
  `tasa_igv` decimal(5,2) NOT NULL DEFAULT '18.00',
  `es_agente_retencion` tinyint(1) NOT NULL DEFAULT '0',
  `es_agente_percepcion` tinyint(1) NOT NULL DEFAULT '0',
  `tasa_pago_cuenta_renta` decimal(5,2) DEFAULT '1.00',
  `cuota_fija_mensual` decimal(10,2) DEFAULT NULL,
  `lleva_libro_diario_completo` tinyint(1) NOT NULL DEFAULT '0',
  `lleva_libro_mayor` tinyint(1) NOT NULL DEFAULT '0',
  `lleva_libro_caja_bancos` tinyint(1) NOT NULL DEFAULT '1',
  `lleva_inventarios_balances` tinyint(1) NOT NULL DEFAULT '0',
  `emite_factura` tinyint(1) NOT NULL DEFAULT '1',
  `emite_boleta` tinyint(1) NOT NULL DEFAULT '1',
  `ose_proveedor` enum('NUBEFACT','EFACT','SUNAT','NONE') NOT NULL DEFAULT 'NONE',
  `ose_endpoint_url` varchar(500) DEFAULT NULL,
  `ose_usuario` varchar(200) DEFAULT NULL,
  `ose_token_hash` varchar(500) DEFAULT NULL,
  `cert_digital_ruta` varchar(500) DEFAULT NULL,
  `cert_digital_password_hash` varchar(500) DEFAULT NULL,
  `serie_factura` varchar(5) DEFAULT 'F001',
  `serie_boleta` varchar(5) DEFAULT 'B001',
  `serie_nota_credito` varchar(5) DEFAULT 'FC01',
  `serie_nota_debito` varchar(5) DEFAULT 'FD01',
  `serie_guia_remision` varchar(5) DEFAULT 'T001',
  `uit_vigente` decimal(10,2) NOT NULL DEFAULT '5350.00',
  `anio_uit` int NOT NULL DEFAULT '2026',
  `moneda_base` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `metodo_costeo` enum('PROMEDIO','PEPS','UEPS') NOT NULL DEFAULT 'PROMEDIO',
  `dias_credito_default` int NOT NULL DEFAULT '30',
  `monto_limite_sin_aprobacion` decimal(12,2) NOT NULL DEFAULT '5000.00',
  `modulo_comercial` tinyint(1) NOT NULL DEFAULT '1',
  `modulo_finanzas` tinyint(1) NOT NULL DEFAULT '1',
  `modulo_logistica` tinyint(1) NOT NULL DEFAULT '1',
  `modulo_almacen` tinyint(1) NOT NULL DEFAULT '1',
  `modulo_administracion` tinyint(1) NOT NULL DEFAULT '1',
  `modulo_prestamos` tinyint(1) NOT NULL DEFAULT '1',
  `modulo_produccion` tinyint(1) NOT NULL DEFAULT '0',
  `modulo_calidad` tinyint(1) NOT NULL DEFAULT '0',
  `modulo_contabilidad` tinyint(1) NOT NULL DEFAULT '0',
  `meta_ventas_anual` decimal(14,2) DEFAULT NULL,
  `meta_utilidad_anual` decimal(14,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `oc_solicitado_default` varchar(150) DEFAULT 'Jorge Luis Roman Hurtado',
  `oc_revisado_default` varchar(150) DEFAULT 'Jorge Luis Roman Hurtado',
  `oc_autorizado_default` varchar(150) DEFAULT 'Julio Cesar Rojas Cotrina',
  `oc_contacto_nombre` varchar(150) DEFAULT 'Jorge Luis Roman Hurtado',
  `oc_contacto_telefono` varchar(30) DEFAULT '975574228',
  `oc_ciudad_emision` varchar(100) DEFAULT 'Puente Piedra',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ruc` (`ruc`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracionmarca` (
  `marca` enum('METAL','PERFOTOOLS') NOT NULL,
  `razon_social` varchar(150) NOT NULL,
  `ruc` varchar(15) NOT NULL,
  `direccion` varchar(255) NOT NULL,
  `web` varchar(120) NOT NULL,
  `email` varchar(120) NOT NULL,
  `cta_pen_banco` varchar(60) DEFAULT NULL,
  `cta_pen_numero` varchar(40) DEFAULT NULL,
  `cta_pen_cci` varchar(40) DEFAULT NULL,
  `cta_usd_banco` varchar(60) DEFAULT NULL,
  `cta_usd_numero` varchar(40) DEFAULT NULL,
  `cta_usd_cci` varchar(40) DEFAULT NULL,
  `firma_nombre` varchar(120) NOT NULL,
  `firma_cargo` varchar(80) NOT NULL,
  `firma_telefono` varchar(30) DEFAULT NULL,
  `firma_email` varchar(120) DEFAULT NULL,
  `firma_direccion` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`marca`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `correlativos` (
  `anio` int NOT NULL,
  `marca` varchar(20) NOT NULL,
  `ultimo` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`anio`,`marca`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `costosservicio` (
  `id_costo` int NOT NULL AUTO_INCREMENT,
  `id_servicio` int NOT NULL,
  `concepto` varchar(150) NOT NULL,
  `moneda` varchar(3) DEFAULT 'PEN',
  `monto_original` decimal(12,2) NOT NULL,
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `monto_base` decimal(12,2) NOT NULL,
  `tipo_costo` varchar(50) DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_costo`),
  KEY `idx_costos_fecha` (`fecha`),
  KEY `fk_costos_servicio` (`id_servicio`),
  CONSTRAINT `fk_costos_servicio` FOREIGN KEY (`id_servicio`) REFERENCES `servicios` (`id_servicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cotizaciones` (
  `id_cotizacion` int NOT NULL AUTO_INCREMENT,
  `nro_cotizacion` varchar(30) NOT NULL,
  `marca` enum('METAL','PERFOTOOLS') NOT NULL DEFAULT 'METAL',
  `fecha` date NOT NULL,
  `cliente` varchar(150) NOT NULL,
  `atencion` varchar(100) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `correo` varchar(100) DEFAULT NULL,
  `proyecto` varchar(200) DEFAULT NULL,
  `ref` varchar(500) DEFAULT NULL,
  `estado` enum('EN_PROCESO','ENVIADA','APROBADA','NO_APROBADA','RECHAZADA','TERMINADA','A_ESPERA_RESPUESTA','ANULADA') DEFAULT 'EN_PROCESO',
  `fecha_aprobacion_comercial` datetime DEFAULT NULL,
  `estado_trabajo` enum('NO_INICIADO','EN_EJECUCION','TERMINADO','TERMINADO_CON_DEUDA') DEFAULT 'NO_INICIADO',
  `moneda` enum('PEN','USD') DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `subtotal` decimal(14,2) DEFAULT '0.00',
  `igv` decimal(14,2) DEFAULT '0.00',
  `detraccion_porcentaje` decimal(5,2) NOT NULL DEFAULT '0.00',
  `monto_detraccion` decimal(12,2) NOT NULL DEFAULT '0.00',
  `retencion_porcentaje` decimal(5,2) NOT NULL DEFAULT '0.00',
  `monto_retencion` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total` decimal(14,2) DEFAULT '0.00',
  `adelanto_recibido` decimal(14,2) DEFAULT '0.00',
  `forma_pago` varchar(100) DEFAULT NULL,
  `validez_oferta` varchar(50) DEFAULT NULL,
  `plazo_entrega` varchar(100) DEFAULT NULL,
  `lugar_entrega` varchar(200) DEFAULT NULL,
  `lugar_trabajo` varchar(255) DEFAULT NULL,
  `nro_oc_cliente` varchar(50) DEFAULT NULL,
  `nro_factura` varchar(50) DEFAULT NULL,
  `fecha_factura` date DEFAULT NULL,
  `fecha_cobro_total` datetime DEFAULT NULL,
  `comentarios` text,
  `precios_incluyen` varchar(500) DEFAULT NULL,
  `id_servicio` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `drive_file_id` varchar(200) DEFAULT NULL,
  `drive_url` varchar(500) DEFAULT NULL,
  `estado_financiero` enum('PENDIENTE_DEPOSITO','BANCO_PARCIAL','BANCO_OK_DETRACCION_PENDIENTE','FONDEADA_TOTAL','SIN_DETRACCION_FONDEADA','FACTURADA','COBRADA','NA') NOT NULL DEFAULT 'NA',
  `monto_cobrado_banco` decimal(12,2) NOT NULL DEFAULT '0.00',
  `monto_cobrado_detraccion` decimal(12,2) NOT NULL DEFAULT '0.00',
  `fecha_aprobacion_finanzas` datetime DEFAULT NULL,
  PRIMARY KEY (`id_cotizacion`),
  UNIQUE KEY `nro_cotizacion` (`nro_cotizacion`),
  KEY `fk_cotizacion_servicio` (`id_servicio`),
  KEY `idx_cotizaciones_estado` (`estado`),
  KEY `idx_cotizaciones_cliente` (`cliente`),
  KEY `idx_cotizaciones_fecha` (`fecha`),
  KEY `idx_cotizaciones_marca` (`marca`),
  CONSTRAINT `fk_cotizacion_servicio` FOREIGN KEY (`id_servicio`) REFERENCES `servicios` (`id_servicio`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cuentas` (
  `id_cuenta` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `moneda` varchar(3) DEFAULT 'PEN',
  `saldo_actual` decimal(12,2) DEFAULT '0.00',
  `estado` enum('ACTIVA','INACTIVA','SUSPENDIDA') DEFAULT 'ACTIVA',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_cuenta`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detallecompra` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_compra` int NOT NULL,
  `id_item` int NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `precio_unitario` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `fk_detalle_item` (`id_item`),
  CONSTRAINT `fk_detalle_item` FOREIGN KEY (`id_item`) REFERENCES `inventario` (`id_item`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detallecotizacion` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_cotizacion` int NOT NULL,
  `descripcion` text NOT NULL,
  `subdescripcion` text,
  `notas` text,
  `foto_url` varchar(500) DEFAULT NULL,
  `unidad` varchar(30) DEFAULT NULL,
  `cantidad` decimal(10,3) DEFAULT '1.000',
  `precio_unitario` decimal(14,4) DEFAULT '0.0000',
  `subtotal` decimal(14,2) GENERATED ALWAYS AS (round((`cantidad` * `precio_unitario`),2)) STORED,
  PRIMARY KEY (`id_detalle`),
  KEY `fk_detalle_cotizacion` (`id_cotizacion`),
  CONSTRAINT `fk_detalle_cotizacion` FOREIGN KEY (`id_cotizacion`) REFERENCES `cotizaciones` (`id_cotizacion`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detallefactura` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_factura` int NOT NULL,
  `orden` int NOT NULL DEFAULT '1',
  `codigo_item` varchar(50) DEFAULT NULL,
  `descripcion` varchar(500) NOT NULL,
  `unidad_sunat` varchar(10) NOT NULL DEFAULT 'NIU',
  `cantidad` decimal(14,4) NOT NULL,
  `precio_unitario` decimal(14,4) NOT NULL,
  `subtotal` decimal(14,2) NOT NULL,
  `igv` decimal(14,2) NOT NULL,
  `total` decimal(14,2) NOT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `idx_detalle_factura` (`id_factura`),
  CONSTRAINT `fk_detalle_factura` FOREIGN KEY (`id_factura`) REFERENCES `facturas` (`id_factura`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detalleguiaremision` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_guia` int NOT NULL,
  `orden` int NOT NULL DEFAULT '1',
  `codigo_item` varchar(50) DEFAULT NULL,
  `descripcion` varchar(500) NOT NULL,
  `unidad_sunat` varchar(10) NOT NULL DEFAULT 'NIU',
  `cantidad` decimal(14,4) NOT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `idx_detalle_guia` (`id_guia`),
  CONSTRAINT `fk_detalle_guia` FOREIGN KEY (`id_guia`) REFERENCES `guiasremision` (`id_guia`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detallenotacredito` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_nota` int NOT NULL,
  `orden` int NOT NULL DEFAULT '1',
  `codigo_item` varchar(50) DEFAULT NULL,
  `descripcion` varchar(500) NOT NULL,
  `unidad_sunat` varchar(10) NOT NULL DEFAULT 'NIU',
  `cantidad` decimal(14,4) NOT NULL,
  `precio_unitario` decimal(14,4) NOT NULL,
  `subtotal` decimal(14,2) NOT NULL,
  `igv` decimal(14,2) NOT NULL,
  `total` decimal(14,2) NOT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `idx_detalle_nc` (`id_nota`),
  CONSTRAINT `fk_detalle_nc` FOREIGN KEY (`id_nota`) REFERENCES `notascredito` (`id_nota`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detallenotadebito` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_nota` int NOT NULL,
  `orden` int NOT NULL DEFAULT '1',
  `codigo_item` varchar(50) DEFAULT NULL,
  `descripcion` varchar(500) NOT NULL,
  `unidad_sunat` varchar(10) NOT NULL DEFAULT 'NIU',
  `cantidad` decimal(14,4) NOT NULL,
  `precio_unitario` decimal(14,4) NOT NULL,
  `subtotal` decimal(14,2) NOT NULL,
  `igv` decimal(14,2) NOT NULL,
  `total` decimal(14,2) NOT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `idx_detalle_nd` (`id_nota`),
  CONSTRAINT `fk_detalle_nd` FOREIGN KEY (`id_nota`) REFERENCES `notasdebito` (`id_nota`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detalleordencompra` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_oc` int NOT NULL,
  `orden` int NOT NULL DEFAULT '1',
  `id_item` int DEFAULT NULL,
  `codigo` varchar(50) DEFAULT NULL,
  `descripcion` varchar(500) NOT NULL,
  `unidad` varchar(10) NOT NULL DEFAULT 'UND',
  `cantidad` decimal(14,4) NOT NULL,
  `cantidad_recibida` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `precio_unitario` decimal(14,4) NOT NULL,
  `subtotal` decimal(14,2) NOT NULL,
  `observaciones` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `idx_detalle_oc` (`id_oc`),
  KEY `idx_detalle_item` (`id_item`),
  CONSTRAINT `fk_detoc_item` FOREIGN KEY (`id_item`) REFERENCES `inventario` (`id_item`) ON DELETE SET NULL,
  CONSTRAINT `fk_detoc_oc` FOREIGN KEY (`id_oc`) REFERENCES `ordenescompra` (`id_oc`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detracciones` (
  `id_detraccion` int NOT NULL AUTO_INCREMENT,
  `id_servicio` int NOT NULL,
  `cliente` varchar(150) DEFAULT NULL,
  `porcentaje` decimal(5,2) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `cliente_deposito` enum('SI','NO','PARCIAL') DEFAULT 'NO',
  `monto_depositado` decimal(12,2) DEFAULT '0.00',
  `fecha_deposito` date DEFAULT NULL,
  `fecha_pago` date DEFAULT NULL,
  `estado` enum('PENDIENTE','PAGADO','ANULADO') DEFAULT 'PENDIENTE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_detraccion`),
  KEY `fk_detracciones_servicio` (`id_servicio`),
  CONSTRAINT `fk_detracciones_servicio` FOREIGN KEY (`id_servicio`) REFERENCES `servicios` (`id_servicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `facturas` (
  `id_factura` int NOT NULL AUTO_INCREMENT,
  `tipo` enum('FACTURA','BOLETA') NOT NULL,
  `serie` varchar(5) NOT NULL,
  `numero` int NOT NULL,
  `fecha_emision` date NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `cliente_tipo_doc` enum('DNI','CE','RUC','PASAPORTE') NOT NULL,
  `cliente_numero_doc` varchar(15) NOT NULL,
  `cliente_razon_social` varchar(200) NOT NULL,
  `cliente_direccion` varchar(300) DEFAULT NULL,
  `cliente_email` varchar(150) DEFAULT NULL,
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(8,4) NOT NULL DEFAULT '1.0000',
  `subtotal` decimal(14,2) NOT NULL,
  `descuento_global` decimal(14,2) NOT NULL DEFAULT '0.00',
  `igv` decimal(14,2) NOT NULL,
  `total` decimal(14,2) NOT NULL,
  `forma_pago` enum('CONTADO','CREDITO') NOT NULL DEFAULT 'CONTADO',
  `dias_credito` int NOT NULL DEFAULT '0',
  `aplica_detraccion` tinyint(1) NOT NULL DEFAULT '0',
  `porcentaje_detraccion` decimal(5,2) DEFAULT '0.00',
  `monto_detraccion` decimal(14,2) DEFAULT '0.00',
  `codigo_servicio_spot` varchar(10) DEFAULT NULL,
  `id_cotizacion` int DEFAULT NULL,
  `estado_sunat` enum('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR') NOT NULL DEFAULT 'PENDIENTE',
  `codigo_sunat` varchar(20) DEFAULT NULL,
  `descripcion_sunat` varchar(500) DEFAULT NULL,
  `xml_url` varchar(500) DEFAULT NULL,
  `pdf_url` varchar(500) DEFAULT NULL,
  `cdr_url` varchar(500) DEFAULT NULL,
  `cadena_qr` text,
  `id_usuario_emisor` int DEFAULT NULL,
  `observaciones` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_factura`),
  UNIQUE KEY `uk_factura_serie_nro` (`tipo`,`serie`,`numero`),
  KEY `idx_facturas_fecha` (`fecha_emision`),
  KEY `idx_facturas_cliente_doc` (`cliente_numero_doc`),
  KEY `idx_facturas_estado` (`estado_sunat`),
  KEY `idx_facturas_cotizacion` (`id_cotizacion`),
  CONSTRAINT `fk_facturas_cotizacion` FOREIGN KEY (`id_cotizacion`) REFERENCES `cotizaciones` (`id_cotizacion`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gastobancario` (
  `id_gasto_bancario` int NOT NULL AUTO_INCREMENT,
  `id_cuenta` int NOT NULL,
  `fecha` date NOT NULL,
  `categoria` enum('ITF','COMISION_MANT','COMISION_TC','PORTES','OTROS') NOT NULL,
  `concepto` varchar(200) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `moneda` varchar(3) NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `comentario` text,
  `registrado_por` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_gasto_bancario`),
  KEY `fk_gb_usuario` (`registrado_por`),
  KEY `idx_gb_cuenta_fecha` (`id_cuenta`,`fecha`),
  KEY `idx_gb_categoria` (`categoria`),
  CONSTRAINT `fk_gb_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuentas` (`id_cuenta`) ON DELETE CASCADE,
  CONSTRAINT `fk_gb_usuario` FOREIGN KEY (`registrado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gastos` (
  `id_gasto` int NOT NULL AUTO_INCREMENT,
  `nro_oc` varchar(50) DEFAULT NULL,
  `codigo_contador` varchar(50) DEFAULT NULL,
  `id_servicio` int DEFAULT NULL,
  `tipo_gasto` enum('OPERATIVO','SERVICIO') DEFAULT 'OPERATIVO',
  `centro_costo` varchar(100) DEFAULT NULL,
  `tipo_gasto_logistica` enum('GENERAL','SERVICIO','ALMACEN') DEFAULT NULL,
  `fecha` date NOT NULL,
  `concepto` varchar(150) NOT NULL,
  `proveedor_nombre` varchar(150) DEFAULT NULL,
  `nro_comprobante` varchar(50) DEFAULT NULL,
  `moneda` varchar(3) DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `detraccion_porcentaje` decimal(5,2) DEFAULT '0.00',
  `monto_detraccion` decimal(12,2) DEFAULT '0.00',
  `detraccion_depositada` enum('SI','NO','NA') DEFAULT 'NA',
  `monto_base` decimal(12,2) NOT NULL DEFAULT '0.00',
  `aplica_igv` tinyint(1) DEFAULT '0',
  `igv_base` decimal(12,2) DEFAULT '0.00',
  `total_base` decimal(12,2) NOT NULL DEFAULT '0.00',
  `estado` enum('BORRADOR','CONFIRMADO','ANULADO') DEFAULT 'CONFIRMADO',
  `estado_pago` enum('PENDIENTE','PARCIAL','PAGADO','ANULADO') DEFAULT 'PENDIENTE',
  `tipo_ultima_accion` varchar(50) DEFAULT 'CREACION',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_gasto`),
  KEY `idx_gastos_fecha` (`fecha`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `guiasremision` (
  `id_guia` int NOT NULL AUTO_INCREMENT,
  `serie` varchar(5) NOT NULL,
  `numero` int NOT NULL,
  `fecha_emision` date NOT NULL,
  `fecha_traslado` date NOT NULL,
  `motivo_codigo` varchar(2) NOT NULL,
  `motivo_descripcion` varchar(200) NOT NULL,
  `destinatario_tipo_doc` enum('DNI','CE','RUC','PASAPORTE') NOT NULL,
  `destinatario_num_doc` varchar(15) NOT NULL,
  `destinatario_razon` varchar(200) NOT NULL,
  `punto_partida` varchar(300) NOT NULL,
  `punto_llegada` varchar(300) NOT NULL,
  `ubigeo_partida` varchar(6) DEFAULT NULL,
  `ubigeo_llegada` varchar(6) DEFAULT NULL,
  `modalidad_transporte` enum('PRIVADO','PUBLICO') NOT NULL DEFAULT 'PRIVADO',
  `transportista_ruc` varchar(11) DEFAULT NULL,
  `transportista_razon` varchar(200) DEFAULT NULL,
  `conductor_dni` varchar(12) DEFAULT NULL,
  `conductor_nombre` varchar(200) DEFAULT NULL,
  `conductor_licencia` varchar(20) DEFAULT NULL,
  `placa_vehiculo` varchar(10) DEFAULT NULL,
  `peso_total_bruto` decimal(10,3) NOT NULL,
  `unidad_peso` varchar(5) NOT NULL DEFAULT 'KGM',
  `numero_bultos` int NOT NULL DEFAULT '1',
  `id_factura_referencia` int DEFAULT NULL,
  `estado_sunat` enum('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR') NOT NULL DEFAULT 'PENDIENTE',
  `codigo_sunat` varchar(20) DEFAULT NULL,
  `descripcion_sunat` varchar(500) DEFAULT NULL,
  `xml_url` varchar(500) DEFAULT NULL,
  `pdf_url` varchar(500) DEFAULT NULL,
  `cdr_url` varchar(500) DEFAULT NULL,
  `id_usuario_emisor` int DEFAULT NULL,
  `observaciones` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_guia`),
  UNIQUE KEY `uk_guia` (`serie`,`numero`),
  KEY `idx_guia_fecha` (`fecha_emision`),
  KEY `idx_guia_traslado` (`fecha_traslado`),
  KEY `idx_guia_factura` (`id_factura_referencia`),
  KEY `idx_guia_estado` (`estado_sunat`),
  CONSTRAINT `fk_guia_factura` FOREIGN KEY (`id_factura_referencia`) REFERENCES `facturas` (`id_factura`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventario` (
  `id_item` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(50) NOT NULL,
  `categoria` enum('Material','Consumible','Herramienta','Equipo','EPP') DEFAULT 'Material',
  `nombre` varchar(150) NOT NULL,
  `unidad` varchar(50) DEFAULT 'UNIDAD',
  `stock_actual` decimal(10,2) DEFAULT '0.00',
  `stock_minimo` decimal(10,2) DEFAULT '10.00',
  `costo_promedio_unitario` decimal(12,2) DEFAULT '0.00',
  `moneda` varchar(3) DEFAULT 'PEN',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_item`),
  UNIQUE KEY `sku` (`sku`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movimientobancario` (
  `id_movimiento` int NOT NULL AUTO_INCREMENT,
  `id_cuenta` int NOT NULL,
  `fecha` date NOT NULL,
  `fecha_proceso` date DEFAULT NULL,
  `nro_operacion` varchar(50) DEFAULT NULL,
  `canal` varchar(30) DEFAULT NULL,
  `tipo_movimiento_banco` varchar(60) DEFAULT NULL,
  `descripcion_banco` varchar(255) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `tipo` enum('ABONO','CARGO') NOT NULL,
  `saldo_contable` decimal(14,2) DEFAULT NULL,
  `fuente` enum('MANUAL','AUTO','IMPORT_EECC') NOT NULL DEFAULT 'MANUAL',
  `estado_conciliacion` enum('POR_CONCILIAR','CONCILIADO','IGNORADO') NOT NULL DEFAULT 'POR_CONCILIAR',
  `ref_tipo` enum('COBRANZA','COMPRA','GASTO','GASTO_BANCARIO','PAGO_IMPUESTO','TRASPASO','PRESTAMO','OTRO') DEFAULT NULL,
  `ref_id` int DEFAULT NULL,
  `comentario` text,
  `conciliado_por` int DEFAULT NULL,
  `conciliado_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_movimiento`),
  KEY `fk_mov_usuario` (`conciliado_por`),
  KEY `idx_mov_cuenta_fecha` (`id_cuenta`,`fecha`),
  KEY `idx_mov_estado` (`estado_conciliacion`),
  KEY `idx_mov_unico` (`id_cuenta`,`nro_operacion`,`fecha`,`monto`),
  CONSTRAINT `fk_mov_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuentas` (`id_cuenta`) ON DELETE CASCADE,
  CONSTRAINT `fk_mov_usuario` FOREIGN KEY (`conciliado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movimientosinventario` (
  `id_movimiento` int NOT NULL AUTO_INCREMENT,
  `id_item` int NOT NULL,
  `referencia_tipo` enum('SERVICIO','COMPRA','GASTO','PRESTAMO') DEFAULT NULL,
  `referencia_id` int DEFAULT NULL,
  `tipo_movimiento` varchar(20) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `saldo_posterior` decimal(10,2) NOT NULL,
  `fecha_movimiento` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_movimiento`),
  KEY `idx_movimientos_ref` (`referencia_tipo`,`referencia_id`),
  KEY `idx_movimientos_fecha` (`fecha_movimiento`),
  KEY `fk_movimientos_item` (`id_item`),
  CONSTRAINT `fk_movimientos_item` FOREIGN KEY (`id_item`) REFERENCES `inventario` (`id_item`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notascredito` (
  `id_nota` int NOT NULL AUTO_INCREMENT,
  `serie` varchar(5) NOT NULL,
  `numero` int NOT NULL,
  `fecha_emision` date NOT NULL,
  `tipo_doc_referencia` enum('FACTURA','BOLETA') NOT NULL,
  `id_factura_referencia` int DEFAULT NULL,
  `serie_referencia` varchar(5) NOT NULL,
  `numero_referencia` int NOT NULL,
  `motivo_codigo` varchar(2) NOT NULL,
  `motivo_descripcion` varchar(200) NOT NULL,
  `cliente_tipo_doc` enum('DNI','CE','RUC','PASAPORTE') NOT NULL,
  `cliente_numero_doc` varchar(15) NOT NULL,
  `cliente_razon_social` varchar(200) NOT NULL,
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(8,4) NOT NULL DEFAULT '1.0000',
  `subtotal` decimal(14,2) NOT NULL,
  `igv` decimal(14,2) NOT NULL,
  `total` decimal(14,2) NOT NULL,
  `estado_sunat` enum('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR') NOT NULL DEFAULT 'PENDIENTE',
  `codigo_sunat` varchar(20) DEFAULT NULL,
  `descripcion_sunat` varchar(500) DEFAULT NULL,
  `xml_url` varchar(500) DEFAULT NULL,
  `pdf_url` varchar(500) DEFAULT NULL,
  `cdr_url` varchar(500) DEFAULT NULL,
  `id_usuario_emisor` int DEFAULT NULL,
  `observaciones` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_nota`),
  UNIQUE KEY `uk_nota_credito` (`serie`,`numero`),
  KEY `idx_nc_referencia` (`id_factura_referencia`),
  KEY `idx_nc_fecha` (`fecha_emision`),
  KEY `idx_nc_estado` (`estado_sunat`),
  CONSTRAINT `fk_nc_factura` FOREIGN KEY (`id_factura_referencia`) REFERENCES `facturas` (`id_factura`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notasdebito` (
  `id_nota` int NOT NULL AUTO_INCREMENT,
  `serie` varchar(5) NOT NULL,
  `numero` int NOT NULL,
  `fecha_emision` date NOT NULL,
  `tipo_doc_referencia` enum('FACTURA','BOLETA') NOT NULL,
  `id_factura_referencia` int DEFAULT NULL,
  `serie_referencia` varchar(5) NOT NULL,
  `numero_referencia` int NOT NULL,
  `motivo_codigo` varchar(2) NOT NULL,
  `motivo_descripcion` varchar(200) NOT NULL,
  `cliente_tipo_doc` enum('DNI','CE','RUC','PASAPORTE') NOT NULL,
  `cliente_numero_doc` varchar(15) NOT NULL,
  `cliente_razon_social` varchar(200) NOT NULL,
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(8,4) NOT NULL DEFAULT '1.0000',
  `subtotal` decimal(14,2) NOT NULL,
  `igv` decimal(14,2) NOT NULL,
  `total` decimal(14,2) NOT NULL,
  `estado_sunat` enum('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR') NOT NULL DEFAULT 'PENDIENTE',
  `codigo_sunat` varchar(20) DEFAULT NULL,
  `descripcion_sunat` varchar(500) DEFAULT NULL,
  `xml_url` varchar(500) DEFAULT NULL,
  `pdf_url` varchar(500) DEFAULT NULL,
  `cdr_url` varchar(500) DEFAULT NULL,
  `id_usuario_emisor` int DEFAULT NULL,
  `observaciones` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_nota`),
  UNIQUE KEY `uk_nota_debito` (`serie`,`numero`),
  KEY `idx_nd_referencia` (`id_factura_referencia`),
  KEY `idx_nd_fecha` (`fecha_emision`),
  CONSTRAINT `fk_nd_factura` FOREIGN KEY (`id_factura_referencia`) REFERENCES `facturas` (`id_factura`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ordenescompra` (
  `id_oc` int NOT NULL AUTO_INCREMENT,
  `nro_oc` varchar(30) NOT NULL,
  `fecha_emision` date NOT NULL,
  `fecha_entrega_esperada` date DEFAULT NULL,
  `id_proveedor` int NOT NULL,
  `id_servicio` int DEFAULT NULL,
  `centro_costo` varchar(60) NOT NULL DEFAULT 'OFICINA CENTRAL',
  `tipo_oc` enum('GENERAL','SERVICIO','ALMACEN') NOT NULL DEFAULT 'GENERAL',
  `empresa` enum('ME','PT') NOT NULL DEFAULT 'ME',
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(8,4) NOT NULL DEFAULT '1.0000',
  `subtotal` decimal(14,2) NOT NULL,
  `descuento` decimal(14,2) NOT NULL DEFAULT '0.00',
  `aplica_igv` tinyint(1) NOT NULL DEFAULT '1',
  `igv` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total` decimal(14,2) NOT NULL,
  `forma_pago` enum('CONTADO','CREDITO') NOT NULL DEFAULT 'CONTADO',
  `dias_credito` int NOT NULL DEFAULT '0',
  `condiciones_entrega` varchar(300) DEFAULT NULL,
  `observaciones` varchar(500) DEFAULT NULL,
  `estado` enum('BORRADOR','APROBADA','ENVIADA','RECIBIDA_PARCIAL','RECIBIDA','FACTURADA','PAGADA','ANULADA') NOT NULL DEFAULT 'BORRADOR',
  `id_usuario_crea` int DEFAULT NULL,
  `id_usuario_aprueba` int DEFAULT NULL,
  `fecha_aprobacion` timestamp NULL DEFAULT NULL,
  `motivo_anulacion` varchar(300) DEFAULT NULL,
  `pdf_url` varchar(500) DEFAULT NULL,
  `id_compra_generada` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `atencion` varchar(150) DEFAULT NULL COMMENT 'Persona contacto en la empresa del proveedor',
  `contacto_interno` varchar(150) DEFAULT NULL COMMENT 'Nombre del ejecutivo interno que atiende la OC',
  `contacto_telefono` varchar(30) DEFAULT NULL COMMENT 'Celular del contacto interno',
  `solicitado_por` varchar(150) DEFAULT NULL COMMENT 'Firma: nombre de quien solicitó',
  `revisado_por` varchar(150) DEFAULT NULL COMMENT 'Firma: nombre de quien revisó',
  `autorizado_por` varchar(150) DEFAULT NULL COMMENT 'Firma: nombre de quien autorizó',
  `cuenta_bancaria_pago` varchar(300) DEFAULT NULL COMMENT 'Cta bancaria del proveedor: ej "Cta.Interbank Soles 898-3187294381; CCI 00389801318729438149"',
  `lugar_entrega` varchar(200) DEFAULT NULL COMMENT 'Lima, Puente Piedra, Obra Toromocho, N/A',
  PRIMARY KEY (`id_oc`),
  UNIQUE KEY `uk_oc_nro` (`nro_oc`,`empresa`),
  KEY `idx_oc_fecha` (`fecha_emision`),
  KEY `idx_oc_proveedor` (`id_proveedor`),
  KEY `idx_oc_estado` (`estado`),
  KEY `idx_oc_servicio` (`id_servicio`),
  KEY `fk_oc_compra` (`id_compra_generada`),
  CONSTRAINT `fk_oc_compra` FOREIGN KEY (`id_compra_generada`) REFERENCES `compras` (`id_compra`) ON DELETE SET NULL,
  CONSTRAINT `fk_oc_proveedor` FOREIGN KEY (`id_proveedor`) REFERENCES `proveedores` (`id_proveedor`) ON DELETE RESTRICT,
  CONSTRAINT `fk_oc_servicio` FOREIGN KEY (`id_servicio`) REFERENCES `servicios` (`id_servicio`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagosimpuestos` (
  `id_pago` int NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `tipo_impuesto` varchar(50) NOT NULL,
  `periodo` varchar(20) DEFAULT NULL,
  `monto` decimal(12,2) NOT NULL,
  `id_cuenta` int DEFAULT NULL,
  `moneda` varchar(3) NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `descripcion` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_pago`),
  KEY `fk_pagoimp_cuenta` (`id_cuenta`),
  CONSTRAINT `fk_pagoimp_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuentas` (`id_cuenta`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `periodoscontables` (
  `id` int NOT NULL AUTO_INCREMENT,
  `anio` int NOT NULL,
  `mes` int NOT NULL,
  `estado` enum('ABIERTO','CERRADO','BLOQUEADO') NOT NULL DEFAULT 'ABIERTO',
  `fecha_cierre` timestamp NULL DEFAULT NULL,
  `id_usuario_cierre` int DEFAULT NULL,
  `observaciones` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_periodo` (`anio`,`mes`),
  KEY `idx_periodos_estado` (`estado`)
) ENGINE=InnoDB AUTO_INCREMENT=191 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prestamosotorgados` (
  `id_prestamo` int NOT NULL AUTO_INCREMENT,
  `nro_oc` varchar(50) DEFAULT NULL,
  `deudor` varchar(150) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `comentario` text,
  `fecha_emision` date NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `moneda` varchar(3) DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `monto_capital` decimal(12,2) NOT NULL,
  `tasa_interes` decimal(5,2) DEFAULT '0.00',
  `monto_interes` decimal(12,2) DEFAULT '0.00',
  `monto_total` decimal(12,2) NOT NULL,
  `monto_pagado` decimal(12,2) DEFAULT '0.00',
  `saldo` decimal(12,2) NOT NULL,
  `estado` enum('PENDIENTE','PARCIAL','COBRADO','ANULADO') DEFAULT 'PENDIENTE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_prestamo`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prestamostomados` (
  `id_prestamo` int NOT NULL AUTO_INCREMENT,
  `nro_oc` varchar(50) DEFAULT NULL,
  `acreedor` varchar(150) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `comentario` text,
  `fecha_emision` date NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `moneda` varchar(3) DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `monto_capital` decimal(12,2) NOT NULL,
  `tasa_interes` decimal(5,2) DEFAULT '0.00',
  `monto_interes` decimal(12,2) DEFAULT '0.00',
  `monto_total` decimal(12,2) NOT NULL,
  `monto_pagado` decimal(12,2) DEFAULT '0.00',
  `saldo` decimal(12,2) NOT NULL,
  `estado` enum('PENDIENTE','PARCIAL','PAGADO','ANULADO') DEFAULT 'PENDIENTE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_prestamo`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proveedores` (
  `id_proveedor` int NOT NULL AUTO_INCREMENT,
  `ruc` varchar(20) DEFAULT NULL,
  `razon_social` varchar(150) NOT NULL,
  `tipo` enum('EMPRESA','PERSONA_NATURAL') NOT NULL DEFAULT 'EMPRESA',
  `dni` varchar(8) DEFAULT NULL,
  `banco_1_nombre` varchar(60) DEFAULT NULL,
  `banco_1_numero` varchar(30) DEFAULT NULL,
  `banco_1_cci` varchar(30) DEFAULT NULL,
  `banco_2_nombre` varchar(60) DEFAULT NULL,
  `banco_2_numero` varchar(30) DEFAULT NULL,
  `banco_2_cci` varchar(30) DEFAULT NULL,
  `contacto` varchar(150) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `direccion` varchar(200) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_proveedor`),
  UNIQUE KEY `ruc` (`ruc`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `servicios` (
  `id_servicio` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) DEFAULT NULL,
  `nro_cotizacion` varchar(50) DEFAULT NULL,
  `nombre` varchar(150) NOT NULL,
  `cliente` varchar(150) DEFAULT NULL,
  `descripcion` text,
  `fecha_servicio` date NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `moneda` varchar(3) DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `monto_base` decimal(12,2) NOT NULL DEFAULT '0.00',
  `aplica_igv` tinyint(1) DEFAULT '0',
  `igv_base` decimal(12,2) DEFAULT '0.00',
  `total_base` decimal(12,2) NOT NULL DEFAULT '0.00',
  `detraccion_porcentaje` decimal(5,2) DEFAULT '0.00',
  `monto_detraccion` decimal(12,2) DEFAULT '0.00',
  `retencion_porcentaje` decimal(5,2) DEFAULT '0.00',
  `monto_retencion` decimal(12,2) DEFAULT '0.00',
  `estado` enum('PENDIENTE','PARCIAL','COBRADO','ANULADO') DEFAULT 'PENDIENTE',
  `estado_trabajo` varchar(50) DEFAULT 'EN_PROCESO',
  `tipo_ultima_accion` varchar(50) DEFAULT 'CREACION',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_servicio`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `idx_servicios_estado` (`estado`),
  KEY `idx_servicios_cliente` (`cliente`),
  KEY `idx_servicios_vencimiento` (`fecha_vencimiento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipocambio` (
  `id_tipo_cambio` int NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `moneda` varchar(3) NOT NULL,
  `valor_compra` decimal(10,4) NOT NULL,
  `valor_venta` decimal(10,4) NOT NULL,
  `fuente` varchar(50) DEFAULT 'SBS',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_tipo_cambio`),
  UNIQUE KEY `uk_tipocambio_fecha_moneda` (`fecha`,`moneda`),
  KEY `idx_tipocambio_fecha` (`fecha`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transacciones` (
  `id_transaccion` int NOT NULL AUTO_INCREMENT,
  `id_cuenta` int NOT NULL,
  `referencia_tipo` enum('SERVICIO','COMPRA','GASTO','PRESTAMO') DEFAULT NULL,
  `referencia_id` int DEFAULT NULL,
  `tipo_movimiento` enum('INGRESO','EGRESO') NOT NULL,
  `moneda` varchar(3) NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `aplica_igv` tinyint(1) DEFAULT '1',
  `tipo_igv` varchar(15) DEFAULT NULL,
  `monto_original` decimal(12,2) NOT NULL,
  `igv_original` decimal(12,2) NOT NULL,
  `total_original` decimal(12,2) NOT NULL,
  `monto_base` decimal(12,2) NOT NULL,
  `igv_base` decimal(12,2) NOT NULL,
  `total_base` decimal(12,2) NOT NULL,
  `estado` enum('PENDIENTE','REALIZADO','ANULADO') DEFAULT 'PENDIENTE',
  `fecha` datetime NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_transaccion`),
  KEY `idx_transacciones_ref` (`referencia_tipo`,`referencia_id`),
  KEY `idx_transacciones_fecha` (`fecha`),
  KEY `fk_transacciones_cuenta` (`id_cuenta`),
  CONSTRAINT `fk_transacciones_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuentas` (`id_cuenta`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `chk_transacciones_referencia_ins` BEFORE INSERT ON `transacciones` FOR EACH ROW BEGIN
    DECLARE record_exists INT;
    IF NEW.referencia_tipo = 'SERVICIO' THEN
        SELECT COUNT(*) INTO record_exists FROM Servicios WHERE id_servicio = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Servicio referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'COMPRA' THEN
        SELECT COUNT(*) INTO record_exists FROM Compras WHERE id_compra = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: La Compra referenciada no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'GASTO' THEN
        SELECT COUNT(*) INTO record_exists FROM Gastos WHERE id_gasto = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Gasto referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'PRESTAMO' THEN
        SELECT COUNT(*) INTO record_exists FROM PrestamosTomados WHERE id_prestamo = NEW.referencia_id;
        IF record_exists = 0 THEN
            SELECT COUNT(*) INTO record_exists FROM PrestamosOtorgados WHERE id_prestamo = NEW.referencia_id;
        END IF;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Prestamo referenciado no existe.';
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `chk_transacciones_referencia_upd` BEFORE UPDATE ON `transacciones` FOR EACH ROW BEGIN
    DECLARE record_exists INT;
    IF NEW.referencia_tipo = 'SERVICIO' THEN
        SELECT COUNT(*) INTO record_exists FROM Servicios WHERE id_servicio = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Servicio referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'COMPRA' THEN
        SELECT COUNT(*) INTO record_exists FROM Compras WHERE id_compra = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: La Compra referenciada no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'GASTO' THEN
        SELECT COUNT(*) INTO record_exists FROM Gastos WHERE id_gasto = NEW.referencia_id;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Gasto referenciado no existe.';
        END IF;
    ELSEIF NEW.referencia_tipo = 'PRESTAMO' THEN
        SELECT COUNT(*) INTO record_exists FROM PrestamosTomados WHERE id_prestamo = NEW.referencia_id;
        IF record_exists = 0 THEN
            SELECT COUNT(*) INTO record_exists FROM PrestamosOtorgados WHERE id_prestamo = NEW.referencia_id;
        END IF;
        IF record_exists = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error Validacion: El Prestamo referenciado no existe.';
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuariomodulos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `modulo` enum('GERENCIA','COMERCIAL','FINANZAS','LOGISTICA','ALMACEN','ADMINISTRACION') NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_usuario_modulo` (`id_usuario`,`modulo`),
  KEY `idx_usuario_modulos` (`id_usuario`),
  CONSTRAINT `usuariomodulos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id_usuario` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('GERENTE','USUARIO','APROBADOR','CAJA','CONTADOR') NOT NULL DEFAULT 'USUARIO',
  `activo` tinyint(1) DEFAULT '1',
  `ultimo_acceso` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_usuarios_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


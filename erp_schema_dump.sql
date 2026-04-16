
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
DROP TABLE IF EXISTS `compras`;
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
DROP TABLE IF EXISTS `configuracionmarca`;
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
DROP TABLE IF EXISTS `costosservicio`;
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
DROP TABLE IF EXISTS `cotizaciones`;
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
  `estado_trabajo` enum('NO_INICIADO','EN_EJECUCION','TERMINADO','TERMINADO_CON_DEUDA') DEFAULT 'NO_INICIADO',
  `moneda` enum('PEN','USD') DEFAULT 'PEN',
  `tipo_cambio` decimal(10,4) DEFAULT '1.0000',
  `subtotal` decimal(14,2) DEFAULT '0.00',
  `igv` decimal(14,2) DEFAULT '0.00',
  `total` decimal(14,2) DEFAULT '0.00',
  `adelanto_recibido` decimal(14,2) DEFAULT '0.00',
  `forma_pago` varchar(100) DEFAULT NULL,
  `validez_oferta` varchar(50) DEFAULT NULL,
  `plazo_entrega` varchar(100) DEFAULT NULL,
  `lugar_entrega` varchar(200) DEFAULT NULL,
  `lugar_trabajo` varchar(255) DEFAULT NULL,
  `nro_oc_cliente` varchar(50) DEFAULT NULL,
  `nro_factura` varchar(50) DEFAULT NULL,
  `comentarios` text,
  `precios_incluyen` varchar(500) DEFAULT NULL,
  `id_servicio` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `drive_file_id` varchar(200) DEFAULT NULL,
  `drive_url` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id_cotizacion`),
  UNIQUE KEY `nro_cotizacion` (`nro_cotizacion`),
  KEY `fk_cotizacion_servicio` (`id_servicio`),
  KEY `idx_cotizaciones_estado` (`estado`),
  KEY `idx_cotizaciones_cliente` (`cliente`),
  KEY `idx_cotizaciones_fecha` (`fecha`),
  KEY `idx_cotizaciones_marca` (`marca`),
  CONSTRAINT `fk_cotizacion_servicio` FOREIGN KEY (`id_servicio`) REFERENCES `servicios` (`id_servicio`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cuentas`;
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `detallecompra`;
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
DROP TABLE IF EXISTS `detallecotizacion`;
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
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `detracciones`;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `gastos`;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inventario`;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `movimientosinventario`;
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
DROP TABLE IF EXISTS `pagosimpuestos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagosimpuestos` (
  `id_pago` int NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `tipo_impuesto` varchar(50) NOT NULL,
  `periodo` varchar(20) DEFAULT NULL,
  `monto` decimal(12,2) NOT NULL,
  `descripcion` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_pago`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prestamosotorgados`;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prestamostomados`;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `proveedores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proveedores` (
  `id_proveedor` int NOT NULL AUTO_INCREMENT,
  `ruc` varchar(20) NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `servicios`;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tipocambio`;
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
DROP TABLE IF EXISTS `transacciones`;
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
DROP TABLE IF EXISTS `usuariomodulos`;
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
DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id_usuario` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('GERENTE','USUARIO') DEFAULT 'USUARIO',
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


import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * Script de inicialización de Base de Datos para el ERP Pro System.
 */
async function setup() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  };

  console.log('\x1b[36m%s\x1b[0m', '--- ERP DATABASE SETUP ---');
  let connection;

  try {
    connection = await mysql.createConnection(config);
    console.log('[1/4] Conectado a MySQL local.');

    const dbName = process.env.DB_NAME || 'erp_db';
    await connection.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await connection.query(`CREATE DATABASE ${dbName}`);
    await connection.query(`USE ${dbName}`);
    console.log(`[2/4] Base de datos "${dbName}" reiniciada y lista.`);

    console.log('[3/4] Ejecutando scripts SQL...');
    
    // 1. CARGAR SCHEMA
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    
    // Separar la parte de tablas de la de triggers
    const triggerSectionIndex = schemaSql.indexOf('DELIMITER //');
    if (triggerSectionIndex === -1) {
        await connection.query(schemaSql);
        console.log('    - Schema aplicado (sin triggers).');
    } else {
        const tablesSql = schemaSql.substring(0, triggerSectionIndex);
        const triggersPart = schemaSql.substring(triggerSectionIndex);
        
        // Ejecutar tablas
        await connection.query(tablesSql);
        console.log('    - Tablas e Índices creados.');
        
        // Procesar Triggers
        // Removemos los comandos DELIMITER que son solo para CLI
        const cleanTriggers = triggersPart
            .replace(/DELIMITER \/\//g, '')
            .replace(/DELIMITER ;/g, '');
            
        // Los triggers están separados por //
        const individualTriggers = cleanTriggers.split('//')
            .map(t => t.trim())
            .filter(t => t.length > 0);
            
        for (const trigger of individualTriggers) {
            await connection.query(trigger);
        }
        console.log('    - Triggers de validación aplicados.');
    }

    // 2. CARGAR RELACIONES
    const relationsSql = fs.readFileSync(path.join(__dirname, 'relations.sql'), 'utf8');
    await connection.query(relationsSql);
    console.log('    - Relaciones de Claves Foráneas aplicadas.');

    // 3. CARGAR DATOS DE PRUEBA (Seed Data)
    console.log('[4/4] Insertando datos de prueba (Seed)...');

    // CUENTAS
    await connection.query("INSERT INTO Cuentas (nombre, tipo, saldo_actual) VALUES ('Caja General Soles', 'EFECTIVO', 0.00)");

    // PROVEEDORES
    await connection.query(`
      INSERT INTO Proveedores (ruc, razon_social, contacto, email) VALUES 
      ('20100100101', 'Logística Global S.A.', 'Juan Pérez', 'ventas@logistica.com'),
      ('20555666777', 'Suministros Industriales EIRL', 'Maria Luz', 'contacto@suministros.pe')
    `);

    // INVENTARIO
    await connection.query(`
      INSERT INTO Inventario (sku, nombre, unidad, stock_actual, stock_minimo, costo_promedio_unitario) VALUES 
      ('P001', 'Cable Ethernet Cat6 305m', 'BOBINA', 15.00, 5.00, 350.00),
      ('P002', 'Switch 24 Puertos Administrable', 'UNIDAD', 2.00, 4.00, 1200.00),
      ('P003', 'Acces Point Dual Band', 'UNIDAD', 20.00, 10.00, 450.00)
    `);

    // COMPRAS
    await connection.query("INSERT INTO Compras (id_proveedor, fecha, nro_comprobante, monto_base, igv_base, total_base, estado_pago) VALUES (1, CURDATE(), 'F001-0001', 1000.00, 180.00, 1180.00, 'PAGADO')");
    await connection.query("INSERT INTO Compras (id_proveedor, fecha, nro_comprobante, monto_base, igv_base, total_base, estado_pago) VALUES (1, CURDATE(), 'F001-0002', 3500.00, 630.00, 4130.00, 'PENDIENTE')");
    await connection.query("INSERT INTO Compras (id_proveedor, fecha, nro_comprobante, monto_base, igv_base, total_base, estado_pago) VALUES (2, CURDATE(), 'F005-9921', 2400.00, 432.00, 2832.00, 'PARCIAL')");

    // SERVICIOS
    // 1. Rentable
    await connection.query(`
      INSERT INTO Servicios (codigo, nombre, cliente, fecha_servicio, monto_base, igv_base, total_base, estado, fecha_vencimiento) 
      VALUES ('SRV-GOOD', 'Instalación de Red Local', 'Empresa Tech SAC', CURDATE(), 5000.00, 900.00, 5900.00, 'COBRADO', DATE_ADD(CURDATE(), INTERVAL 30 DAY))
    `);
    await connection.query("INSERT INTO CostosServicio (id_servicio, concepto, monto_base, fecha) VALUES (1, 'Mano de Obra', 1500.00, CURDATE())");
    await connection.query("INSERT INTO CostosServicio (id_servicio, concepto, monto_base, fecha) VALUES (1, 'Materiales', 500.00, CURDATE())");
    await connection.query("INSERT INTO Transacciones (id_cuenta, referencia_id, referencia_tipo, tipo_movimiento, monto_original, igv_original, total_original, monto_base, igv_base, total_base, fecha, estado) VALUES (1, 1, 'SERVICIO', 'INGRESO', 5900.00, 0, 5900.00, 5000.00, 900.00, 5900.00, NOW(), 'REALIZADO')");

    // 2. Pérdida
    await connection.query(`
      INSERT INTO Servicios (codigo, nombre, cliente, fecha_servicio, monto_base, igv_base, total_base, estado, fecha_vencimiento) 
      VALUES ('SRV-LOSS', 'Mantenimiento Correctivo Urgente', 'Restaurante El Chef', CURDATE(), 800.00, 144.00, 944.00, 'PENDIENTE', DATE_ADD(CURDATE(), INTERVAL 15 DAY))
    `);
    await connection.query("INSERT INTO CostosServicio (id_servicio, concepto, monto_base, fecha) VALUES (2, 'Viáticos y Emergencia', 1200.00, CURDATE())");

    // 3. Deuda Vencida
    await connection.query(`
      INSERT INTO Servicios (codigo, nombre, cliente, fecha_servicio, monto_base, igv_base, total_base, estado, fecha_vencimiento) 
      VALUES ('SRV-OVERDUE', 'Consultoría IT Anual', 'Corporación MalasPagas', DATE_SUB(CURDATE(), INTERVAL 60 DAY), 10000.00, 1800.00, 11800.00, 'PENDIENTE', DATE_SUB(CURDATE(), INTERVAL 30 DAY))
    `);

    console.log('\x1b[32m%s\x1b[0m', '--- SETUP COMPLETADO EXITOSAMENTE ---');

  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Error durante el setup:');
    console.error(error);
  } finally {
    if (connection) await connection.end();
  }
}

setup();

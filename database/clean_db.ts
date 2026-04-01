import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function clean() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erp_db',
    multipleStatements: true
  });

  console.log('\x1b[36m%s\x1b[0m', '--- ERP DATABASE CLEAN ---');

  await conn.query('SET FOREIGN_KEY_CHECKS=0');

  const tables = [
    'Transacciones', 'CostosServicio', 'MovimientosInventario',
    'DetalleCompra', 'Detracciones', 'PagosImpuestos',
    'Servicios', 'Compras', 'Gastos', 'Inventario',
    'Proveedores', 'PrestamosTomados', 'PrestamosOtorgados', 'TipoCambio'
  ];

  for (const t of tables) {
    await conn.query(`TRUNCATE TABLE \`${t}\``);
    console.log(`  ✓ ${t} limpiada`);
  }

  // Cuentas: preservar id=1, eliminar el resto
  await conn.query('DELETE FROM Cuentas WHERE id_cuenta != 1');
  console.log('  ✓ Cuentas limpiada (id=1 preservada)');

  // Si por alguna razón id=1 no existe, la recreamos
  const [rows] = await conn.query('SELECT id_cuenta FROM Cuentas WHERE id_cuenta = 1');
  if ((rows as any[]).length === 0) {
    await conn.query("INSERT INTO Cuentas (nombre, tipo, saldo_actual) VALUES ('Caja General Soles', 'EFECTIVO', 0.00)");
    console.log('  ✓ Cuenta base recreada (id=1)');
  }

  await conn.query('SET FOREIGN_KEY_CHECKS=1');

  console.log('\x1b[32m%s\x1b[0m', '--- LIMPIEZA COMPLETADA ---');
  await conn.end();
}

clean().catch(console.error);

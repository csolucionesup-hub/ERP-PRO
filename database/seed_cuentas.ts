/**
 * Seed Cuentas — catálogo realista de cuentas bancarias y caja
 * para que el filtro del modal Cobranza tenga sentido.
 *
 * Tipos:
 *   EFECTIVO    — caja física / pettycash
 *   BANCO       — cuentas corrientes / ahorros normales
 *   DETRACCION  — cuenta Banco de la Nación (solo para detracciones)
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const CUENTAS = [
  // Efectivo
  { nombre: 'Caja General Soles',       tipo: 'EFECTIVO',   moneda: 'PEN' },
  { nombre: 'Caja General Dólares',     tipo: 'EFECTIVO',   moneda: 'USD' },

  // Bancos regulares PEN
  { nombre: 'BCP Cta. Corriente Soles', tipo: 'BANCO',      moneda: 'PEN' },
  { nombre: 'BBVA Cta. Corriente Soles',tipo: 'BANCO',      moneda: 'PEN' },
  { nombre: 'Interbank Soles',          tipo: 'BANCO',      moneda: 'PEN' },

  // Bancos regulares USD
  { nombre: 'BCP Cta. Dólares',         tipo: 'BANCO',      moneda: 'USD' },
  { nombre: 'BBVA Cta. Dólares',        tipo: 'BANCO',      moneda: 'USD' },

  // Banco de la Nación (detracciones)
  { nombre: 'Banco de la Nación (Detracciones)', tipo: 'DETRACCION', moneda: 'PEN' },
];

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'erp_pro',
  });

  console.log(`\n🏦 Sembrando cuentas en ${process.env.DB_NAME || 'erp_pro'}\n`);

  for (const c of CUENTAS) {
    // upsert por nombre
    const [ex]: any = await conn.query('SELECT id_cuenta FROM cuentas WHERE nombre = ?', [c.nombre]);
    if ((ex as any[]).length > 0) {
      await conn.query(
        'UPDATE cuentas SET tipo=?, moneda=?, estado=? WHERE nombre=?',
        [c.tipo, c.moneda, 'ACTIVA', c.nombre]
      );
      console.log(`  ↻ ${c.nombre.padEnd(40)} ${c.tipo.padEnd(12)} ${c.moneda}`);
    } else {
      await conn.query(
        'INSERT INTO cuentas (nombre, tipo, moneda, saldo_actual, estado) VALUES (?, ?, ?, 0, ?)',
        [c.nombre, c.tipo, c.moneda, 'ACTIVA']
      );
      console.log(`  ✓ ${c.nombre.padEnd(40)} ${c.tipo.padEnd(12)} ${c.moneda}`);
    }
  }

  const [[tot]]: any = await conn.query('SELECT COUNT(*) AS n FROM cuentas WHERE estado="ACTIVA"');
  console.log(`\n✅ ${tot.n} cuentas activas en catálogo.\n`);
  await conn.end();
}

main().catch(e => { console.error('❌', e); process.exit(1); });

/**
 * Backup completo de la BD productiva (Supabase Postgres) a un archivo JSON
 * timestamped en `./backups/`.
 *
 * Uso:
 *   npm run db:backup
 *
 * Lee DATABASE_URL desde .env.railway (preferido) o .env (fallback).
 * Genera: backups/erp-pro-YYYY-MM-DDTHH-MM-SS.json
 *
 * El JSON contiene TODAS las tablas del schema public con todas sus filas:
 *   {
 *     "Cotizaciones": [ {...}, {...}, ... ],
 *     "OrdenesCompra": [ ... ],
 *     ...
 *   }
 *
 * Para restaurar: ver docs/BACKUP_RESTORE.md
 *
 * Por qué JSON y no pg_dump: pg_dump requiere binario CLI instalado en la
 * máquina del usuario. Esta implementación funciona con solo Node (que ya
 * tenemos) y un driver `pg` (ya en dependencies). Pierdo algunas features
 * de pg_dump (constraints, secuencias) pero gano portabilidad. Los snapshots
 * automáticos diarios de Supabase complementan este backup con dumps SQL
 * completos del lado del proveedor.
 */

import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.railway') });
if (!process.env.DATABASE_URL) dotenv.config();

async function backup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('\x1b[31m%s\x1b[0m', 'FATAL: DATABASE_URL no encontrada en .env.railway ni .env');
    process.exit(1);
  }

  console.log('\x1b[36m%s\x1b[0m', '--- BACKUP DB ERP-PRO ---');
  console.log('Conectando a Supabase Postgres...');

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('✓ Conectado.\n');

  // 1. Listar todas las tablas del schema public
  const tablesRes = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `);
  console.log(`Encontradas ${tablesRes.rows.length} tablas. Dumpeando...`);

  // 2. Dump por tabla
  const dump: Record<string, any[]> = {};
  let totalFilas = 0;
  for (const row of tablesRes.rows) {
    const t = row.table_name as string;
    try {
      const dataRes = await client.query(`SELECT * FROM "${t}"`);
      dump[t] = dataRes.rows;
      totalFilas += dataRes.rows.length;
      console.log(`  - ${t.padEnd(35)} ${String(dataRes.rows.length).padStart(6)} filas`);
    } catch (err: any) {
      console.error(`  ✗ ${t}: ${err.message}`);
      dump[t] = [];
    }
  }

  await client.end();

  // 3. Escribir a disco
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `erp-pro-${ts}.json`);

  const meta = {
    version: 1,
    timestamp: new Date().toISOString(),
    database_url_host: new URL(url).host,
    total_tablas: tablesRes.rows.length,
    total_filas: totalFilas,
  };
  fs.writeFileSync(file, JSON.stringify({ meta, data: dump }, null, 2));

  const sizeMB = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
  console.log('');
  console.log('\x1b[32m%s\x1b[0m', `✓ Backup guardado: ${file}`);
  console.log(`  Tablas: ${tablesRes.rows.length}, filas: ${totalFilas}, tamaño: ${sizeMB} MB`);
}

backup().catch((e) => {
  console.error('\x1b[31m%s\x1b[0m', 'Error durante el backup:');
  console.error(e);
  process.exit(1);
});

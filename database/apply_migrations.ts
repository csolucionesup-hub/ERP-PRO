import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

/**
 * Migration runner idempotente.
 *
 * - Lleva registro de migraciones aplicadas en tabla `_migrations`.
 * - Aplica los .sql de database/migrations en orden alfabético.
 * - Maneja archivos con DELIMITER // (triggers): los divide por // en vez de ;.
 *
 * Uso:
 *   ts-node database/apply_migrations.ts                 → usa .env
 *   ts-node database/apply_migrations.ts --env=railway   → usa .env.railway
 */

const args = process.argv.slice(2);
const envArg = args.find(a => a.startsWith('--env='));
const envSuffix = envArg ? envArg.split('=')[1] : '';
const envFile = envSuffix ? `.env.${envSuffix}` : '.env';

dotenv.config({ path: path.join(__dirname, '..', envFile) });

console.log(`\x1b[36m[migrations] Cargando entorno desde ${envFile}\x1b[0m`);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface MigrationRow { name: string; }

async function ensureMigrationsTable(conn: mysql.Connection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        VARCHAR(190) PRIMARY KEY,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getApplied(conn: mysql.Connection): Promise<Set<string>> {
  const [rows] = await conn.query(`SELECT name FROM _migrations`);
  return new Set((rows as MigrationRow[]).map(r => r.name));
}

/**
 * Ejecuta el SQL de un archivo. Si contiene DELIMITER //, divide los bloques.
 */
async function runSqlFile(conn: mysql.Connection, fullPath: string) {
  const raw = fs.readFileSync(fullPath, 'utf8');

  if (!raw.includes('DELIMITER')) {
    // SQL plano — multipleStatements habilitado en la conexión
    await conn.query(raw);
    return;
  }

  // Limpiar líneas DELIMITER y dividir por //
  const cleaned = raw
    .replace(/^\s*DELIMITER\s+\/\/\s*$/gm, '')
    .replace(/^\s*DELIMITER\s+;\s*$/gm, '');

  // Cada statement termina con // (con o sin ; antes)
  const blocks = cleaned
    .split(/\/\//)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  for (const block of blocks) {
    // Quitar el ; final si quedó (queda dentro del trigger)
    await conn.query(block);
  }
}

async function main() {
  const config: mysql.ConnectionOptions = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    connectTimeout: 20000,
  };

  console.log(`\x1b[36m[migrations] Conectando a ${config.host}:${config.port}/${config.database} como ${config.user}\x1b[0m`);

  const conn = await mysql.createConnection(config);
  console.log('\x1b[32m[migrations] Conectado.\x1b[0m');

  await ensureMigrationsTable(conn);
  const applied = await getApplied(conn);
  console.log(`[migrations] Ya aplicadas: ${applied.size}`);

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  · ${file} — ya aplicada, omitida`);
      continue;
    }

    process.stdout.write(`  → aplicando ${file} ... `);
    try {
      await runSqlFile(conn, path.join(MIGRATIONS_DIR, file));
      await conn.query(`INSERT INTO _migrations (name) VALUES (?)`, [file]);
      console.log('\x1b[32mOK\x1b[0m');
      count++;
    } catch (err: any) {
      console.log('\x1b[31mFALLA\x1b[0m');
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  console.log(`\n\x1b[32m[migrations] Listo. ${count} nueva(s) aplicada(s).\x1b[0m`);
  await conn.end();
}

main().catch(err => {
  console.error('\x1b[31m[migrations] ERROR FATAL:\x1b[0m', err.message);
  process.exit(1);
});

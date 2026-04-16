/**
 * Bootstrap completo de Railway desde cero.
 *
 * 1. Drop todas las tablas existentes
 * 2. Aplica schema.sql (PascalCase preservado para Linux MySQL case-sensitive)
 * 3. Aplica relations.sql
 * 4. Aplica migraciones (saltando 001 y 006 que ya están en schema.sql)
 * 5. Crea usuario gerente
 *
 * Uso: ts-node database/bootstrap_railway.ts
 *  - lee credenciales de .env.railway
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.railway') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
// Migraciones cuyo contenido ya está cubierto por schema.sql
const SKIP_AS_NOOP = new Set(['001_multimoneda.sql', '006_indices_optimizacion.sql']);

async function runStatements(conn: mysql.Connection, sql: string) {
  // Sin multipleStatements: separar por ; al final de línea, ignorando ; dentro de strings
  // Aproximación simple: split en ;\n
  const stmts = sql
    .replace(/--.*$/gm, '')
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const s of stmts) {
    await conn.query(s);
  }
}

async function runSqlFile(conn: mysql.Connection, fullPath: string) {
  const raw = fs.readFileSync(fullPath, 'utf8');
  const fileName = path.basename(fullPath);

  // Archivos con triggers (CREATE TRIGGER ... BEGIN ... END)
  if (raw.includes('CREATE TRIGGER') || raw.includes('DELIMITER')) {
    const cleaned = raw
      .replace(/^\s*DELIMITER\s+\/\/\s*$/gm, '')
      .replace(/^\s*DELIMITER\s+;\s*$/gm, '')
      .split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n');

    // Drop statements
    const drops = cleaned.match(/DROP TRIGGER[^;]*;/g) || [];
    for (const d of drops) await conn.query(d.replace(/;$/, ''));

    // Trigger blocks
    const triggers = cleaned.match(/CREATE TRIGGER[\s\S]*?END\s*;/g) || [];
    for (const t of triggers) await conn.query(t.replace(/;\s*$/, ''));

    console.log(`     [triggers] ${drops.length} drops, ${triggers.length} create`);
    return;
  }

  await runStatements(conn, raw);
}

async function main() {
  const config: mysql.ConnectionOptions = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
    connectTimeout: 20000,
  };

  console.log(`\x1b[36m[bootstrap] ${config.host}:${config.port}/${config.database}\x1b[0m`);
  const conn = await mysql.createConnection(config);
  console.log('\x1b[32m[bootstrap] Conectado.\x1b[0m');

  // 1. DROP all
  console.log('[1/5] Eliminando tablas existentes...');
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  const [tables] = await conn.query('SHOW TABLES') as [any[], any];
  for (const t of tables) {
    const name = Object.values(t)[0] as string;
    await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  console.log(`    ${tables.length} tablas eliminadas`);

  // 2. schema.sql (separa parte de tablas vs triggers por DELIMITER)
  console.log('[2/5] Aplicando schema.sql...');
  const schemaRaw = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const delimIdx = schemaRaw.indexOf('DELIMITER //');
  if (delimIdx === -1) {
    await runStatements(conn, schemaRaw);
  } else {
    await runStatements(conn, schemaRaw.substring(0, delimIdx));
    const triggersPart = schemaRaw.substring(delimIdx);
    const cleaned = triggersPart
      .replace(/^\s*DELIMITER\s+\/\/\s*$/gm, '')
      .replace(/^\s*DELIMITER\s+;\s*$/gm, '')
      .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    const triggers = cleaned.match(/CREATE TRIGGER[\s\S]*?END\s*;/g) || [];
    for (const t of triggers) await conn.query(t.replace(/;\s*$/, ''));
    console.log(`    schema triggers: ${triggers.length}`);
  }

  // 3. relations.sql
  console.log('[3/5] Aplicando relations.sql...');
  await runStatements(conn, fs.readFileSync(path.join(__dirname, 'relations.sql'), 'utf8'));

  // 4. migraciones
  console.log('[4/5] Aplicando migraciones...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(190) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (SKIP_AS_NOOP.has(file)) {
      await conn.query(`INSERT INTO _migrations (name) VALUES (?)`, [file]);
      console.log(`  · ${file} — ya cubierta por schema.sql, marcada`);
      continue;
    }
    process.stdout.write(`  → ${file} ... `);
    try {
      await runSqlFile(conn, path.join(MIGRATIONS_DIR, file));
      await conn.query(`INSERT INTO _migrations (name) VALUES (?)`, [file]);
      console.log('\x1b[32mOK\x1b[0m');
    } catch (err: any) {
      console.log('\x1b[31mFALLA\x1b[0m');
      console.error(`     ${err.message}`);
      throw err;
    }
  }

  // 5. seed gerente
  console.log('[5/5] Creando usuario gerente...');
  const hash = await bcrypt.hash('Metal2026!', 10);
  await conn.query(`
    INSERT INTO Usuarios (nombre, email, password_hash, rol, activo)
    VALUES (?, ?, ?, 'GERENTE', TRUE)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), activo = TRUE
  `, ['Julio Rojas Cotrina', 'julio@metalengineers.com.pe', hash]);
  console.log('    Usuario julio@metalengineers.com.pe / Metal2026! listo');

  const [t2] = await conn.query('SHOW TABLES') as [any[], any];
  console.log(`\n\x1b[32m[bootstrap] OK. ${t2.length} tablas en Railway.\x1b[0m`);
  await conn.end();
}

main().catch(err => {
  console.error('\x1b[31m[bootstrap] ERROR FATAL:\x1b[0m', err.message);
  process.exit(1);
});

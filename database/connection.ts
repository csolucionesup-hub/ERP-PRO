/**
 * Connection layer — Postgres (Supabase) con interface compatible mysql2.
 *
 * El resto del codebase usa patrones mysql2:
 *   - placeholders `?` (positional)
 *   - destructuring `[rows, fields] = await db.query(...)`
 *   - `(result as any).insertId` después de INSERT
 *   - `conn.beginTransaction() / commit() / rollback() / release()`
 *
 * Este adapter traduce todo eso a pg para evitar reescribir 350+ queries.
 *
 * Cambios necesarios SOLO en queries con sintaxis MySQL-específica:
 *   - IFNULL → COALESCE
 *   - INSERT ... ON DUPLICATE KEY UPDATE → INSERT ... ON CONFLICT (col) DO UPDATE SET
 *   - YEAR(x) → EXTRACT(YEAR FROM x)
 *   - MONTH(x) → EXTRACT(MONTH FROM x)
 *   - SHOW TABLES LIKE → query a information_schema
 *   - INSERT IGNORE → INSERT ... ON CONFLICT DO NOTHING
 */
import { Pool, PoolClient, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn('[DB] DATABASE_URL no configurada. Conexión Postgres no funcionará.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  // Supabase requiere SSL pero el driver lo detecta automáticamente cuando hostname es supabase.com
  ssl: databaseUrl?.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000,
});

pool.on('error', (err) => console.error('[DB] Pool error:', err.message));

export const DEFAULT_ACCOUNT_ID = parseInt(process.env.DEFAULT_ACCOUNT_ID || '1');

/**
 * Reemplazo de funciones tipo `FN(arg1, arg2)` con argumentos que pueden
 * contener paréntesis anidados. Usa contador de paréntesis para encontrar
 * el cierre correcto.
 */
function replaceFnTwoArgs(
  sql: string,
  fnName: string,
  builder: (a: string, b: string) => string
): string {
  const re = new RegExp(`\\b${fnName}\\s*\\(`, 'gi');
  let result = '';
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    result += sql.slice(lastIdx, m.index);
    let i = m.index + m[0].length;
    let depth = 1;
    let commaIdx = -1;
    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 1 && commaIdx === -1) commaIdx = i;
      if (depth > 0) i++;
    }
    if (depth !== 0 || commaIdx === -1) {
      // Sintaxis rara — dejarlo como estaba
      result += m[0];
      lastIdx = m.index + m[0].length;
      re.lastIndex = lastIdx;
      continue;
    }
    const arg1 = sql.slice(m.index + m[0].length, commaIdx).trim();
    const arg2 = sql.slice(commaIdx + 1, i).trim();
    result += builder(arg1, arg2);
    lastIdx = i + 1; // saltar el ')'
    re.lastIndex = lastIdx;
  }
  result += sql.slice(lastIdx);
  return result;
}

/**
 * Traduce sintaxis MySQL común a Postgres equivalente.
 * No cubre todos los casos — los más complejos (ON DUPLICATE KEY UPDATE)
 * deben adaptarse en el código fuente del Service.
 */
function translateMysqlSql(sql: string): string {
  // DATEDIFF(a, b) → (a::date - b::date) — soporta args con parens anidados
  sql = replaceFnTwoArgs(sql, 'DATEDIFF', (a, b) => `((${a})::date - (${b})::date)`);
  // DATE_FORMAT(x, fmt) → TO_CHAR(x, pgFmt)
  sql = replaceFnTwoArgs(sql, 'DATE_FORMAT', (a, fmt) => {
    const cleanFmt = fmt.replace(/^['"]|['"]$/g, '');
    const pgFmt = cleanFmt
      .replace(/%Y/g, 'YYYY').replace(/%y/g, 'YY')
      .replace(/%m/g, 'MM').replace(/%c/g, 'FMMM')
      .replace(/%d/g, 'DD').replace(/%e/g, 'FMDD')
      .replace(/%H/g, 'HH24').replace(/%i/g, 'MI').replace(/%s/g, 'SS')
      .replace(/%T/g, 'HH24:MI:SS').replace(/%r/g, 'HH12:MI:SS AM');
    return `TO_CHAR(${a}, '${pgFmt}')`;
  });

  return doSimpleReplaces(sql);
}

function doSimpleReplaces(sql: string): string {
  return sql
    // IFNULL(a, b) → COALESCE(a, b) — misma sintaxis, solo cambia el nombre
    .replace(/\bIFNULL\b/gi, 'COALESCE')
    // YEAR(x) → EXTRACT(YEAR FROM x)  — solo si no está dentro de EXTRACT
    .replace(/\bYEAR\s*\(([^()]+)\)/gi, 'EXTRACT(YEAR FROM $1)')
    .replace(/\bMONTH\s*\(([^()]+)\)/gi, 'EXTRACT(MONTH FROM $1)')
    .replace(/\bDAY\s*\(([^()]+)\)/gi, 'EXTRACT(DAY FROM $1)')
    // DATEDIFF(a, b) → (a::date - b::date)  — devuelve días como entero
    .replace(/\bDATEDIFF\s*\(([^,()]+),\s*([^,()]+)\)/gi, '($1::date - $2::date)')
    // CURDATE() → CURRENT_DATE
    .replace(/\bCURDATE\s*\(\s*\)/gi, 'CURRENT_DATE')
    // GROUP_CONCAT(expr SEPARATOR ',') → STRING_AGG(expr, ',')
    .replace(/\bGROUP_CONCAT\s*\(\s*([^()]+?)\s+SEPARATOR\s+('[^']*')\s*\)/gi, 'STRING_AGG($1, $2)')
    // GROUP_CONCAT(expr) → STRING_AGG(expr::text, ',')
    .replace(/\bGROUP_CONCAT\s*\(\s*([^()]+?)\s*\)/gi, "STRING_AGG($1::text, ',')")
    // DATE_FORMAT(x, '%Y-%m') → TO_CHAR(x, 'YYYY-MM') — mapeo de placeholders comunes
    .replace(/\bDATE_FORMAT\s*\(([^,]+),\s*'([^']+)'\s*\)/gi, (_, expr, fmt) => {
      const pgFmt = fmt
        .replace(/%Y/g, 'YYYY').replace(/%y/g, 'YY')
        .replace(/%m/g, 'MM').replace(/%c/g, 'FMMM')
        .replace(/%d/g, 'DD').replace(/%e/g, 'FMDD')
        .replace(/%H/g, 'HH24').replace(/%i/g, 'MI').replace(/%s/g, 'SS')
        .replace(/%T/g, 'HH24:MI:SS').replace(/%r/g, 'HH12:MI:SS AM');
      return `TO_CHAR(${expr.trim()}, '${pgFmt}')`;
    })
    // DATE_SUB(x, INTERVAL N UNIT) → (x - INTERVAL 'N unit')
    .replace(/\bDATE_SUB\s*\(([^,]+),\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR|HOUR|MINUTE|WEEK)\s*\)/gi,
      (_, expr, n, unit) => `(${expr.trim()} - INTERVAL '${n} ${unit.toLowerCase()}')`)
    // DATE_ADD(x, INTERVAL N UNIT) → (x + INTERVAL 'N unit')
    .replace(/\bDATE_ADD\s*\(([^,]+),\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR|HOUR|MINUTE|WEEK)\s*\)/gi,
      (_, expr, n, unit) => `(${expr.trim()} + INTERVAL '${n} ${unit.toLowerCase()}')`)
    // INSERT IGNORE → INSERT ... ON CONFLICT DO NOTHING (manejo en parte 2 del adapter)
    .replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT')
    // BIT_OR/BIT_AND, CONCAT, NOW son iguales en Postgres
    ;
}

/**
 * Convierte placeholders mysql2 (`?`) a pg ($1, $2, ...).
 * Respeta `?` dentro de strings literales 'foo?bar'.
 */
function convertPlaceholders(sql: string): string {
  let result = '';
  let i = 0;
  let placeholderIdx = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" && !inDoubleQuote) {
      // Escape: '' dentro de un string es comilla literal, no fin de string
      if (inSingleQuote && sql[i + 1] === "'") {
        result += "''";
        i += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      result += c;
      i++;
      continue;
    }
    if (c === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += c;
      i++;
      continue;
    }
    if (c === '?' && !inSingleQuote && !inDoubleQuote) {
      placeholderIdx++;
      result += `$${placeholderIdx}`;
      i++;
      continue;
    }
    result += c;
    i++;
  }
  return result;
}

/**
 * Detecta INSERT statements y devuelve la primera columna PK plausible.
 * Soporta tablas que NO tengan id_<algo>.
 */
function isInsert(sql: string): boolean {
  return /^\s*INSERT\s+/i.test(sql);
}
function hasReturning(sql: string): boolean {
  return /\bRETURNING\b/i.test(sql);
}

/**
 * Construye el resultado en formato mysql2:
 *   - Para SELECT/UPDATE/DELETE: [rows, fields]
 *   - Para INSERT: [{ insertId, affectedRows }, fields] (compatible con destructuring)
 */
function toMysql2Result(qr: QueryResult, originalSql: string): any[] {
  // Para INSERT con RETURNING: extraer insertId del primer row
  if (isInsert(originalSql) && qr.rows && qr.rows.length > 0) {
    const firstRow = qr.rows[0] as Record<string, any>;
    // Buscar la primera columna que parezca PK: id_*, id, o terminada en _id
    let insertId: any = null;
    for (const k of Object.keys(firstRow)) {
      if (/^id($|_)/.test(k) || k === 'id') {
        insertId = firstRow[k];
        break;
      }
    }
    return [
      { insertId, affectedRows: qr.rowCount, rows: qr.rows },
      qr.fields,
    ];
  }

  // UPDATE / DELETE: usar rowCount como affectedRows
  if (/^\s*(UPDATE|DELETE)\s+/i.test(originalSql)) {
    return [
      Object.assign(qr.rows || [], { affectedRows: qr.rowCount }),
      qr.fields,
    ];
  }

  // SELECT y otros: rows tal cual
  return [qr.rows, qr.fields];
}

/**
 * Wrapper de pg client para transacciones, con métodos mysql2-style.
 */
class TxConnection {
  constructor(private client: PoolClient) {}

  async beginTransaction(): Promise<void> {
    await this.client.query('BEGIN');
  }

  async commit(): Promise<void> {
    await this.client.query('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK');
  }

  release(): void {
    this.client.release();
  }

  async query(sql: string, values?: any[]): Promise<any[]> {
    const wasInsertIgnore = /\bINSERT\s+IGNORE\b/i.test(sql);
    let processedSql = convertPlaceholders(translateMysqlSql(sql));
    if (wasInsertIgnore && !/ON CONFLICT/i.test(processedSql)) {
      processedSql = processedSql.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
    }
    if (isInsert(processedSql) && !hasReturning(processedSql)) {
      processedSql = processedSql.replace(/;?\s*$/, ' RETURNING *');
    }
    const qr = await this.client.query(processedSql, values);
    return toMysql2Result(qr, sql);
  }
}

export const db = {
  async query(sql: string, values?: any[]): Promise<any[]> {
    const start = process.hrtime();
    const wasInsertIgnore = /\bINSERT\s+IGNORE\b/i.test(sql);
    let processedSql = convertPlaceholders(translateMysqlSql(sql));
    // INSERT IGNORE → agregar ON CONFLICT DO NOTHING
    if (wasInsertIgnore && !/ON CONFLICT/i.test(processedSql)) {
      processedSql = processedSql.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
    }
    // Auto-añadir RETURNING * a INSERTs sin RETURNING para extraer insertId
    if (isInsert(processedSql) && !hasReturning(processedSql)) {
      processedSql = processedSql.replace(/;?\s*$/, ' RETURNING *');
    }
    try {
      const qr = await pool.query(processedSql, values);
      const diff = process.hrtime(start);
      const time = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB Query | ${time}ms] ${sql.replace(/[\n\s]+/g, ' ').trim().slice(0, 150)}...`);
      }
      return toMysql2Result(qr, sql);
    } catch (error: any) {
      console.error(`[DATABASE ERROR] ${error.message} - Faltó instrucción: ${sql.slice(0, 80)}`);
      throw new Error('Error ejecutando consulta en BD. Revise conexión o sintaxis.');
    }
  },

  async getConnection(): Promise<TxConnection> {
    const client = await pool.connect();
    return new TxConnection(client);
  },
};

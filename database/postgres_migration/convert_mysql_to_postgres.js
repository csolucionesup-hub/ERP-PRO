#!/usr/bin/env node
/**
 * Convierte el dump de schema MySQL (mysqldump --no-data) a Postgres equivalente.
 *
 * Uso:
 *   node convert_mysql_to_postgres.js < mysql_full_schema.sql > 01_schema_postgres.sql
 *
 * Reglas aplicadas (MySQL → Postgres):
 *  - `name` (backticks)            → name (sin quotes; Postgres lowercases)
 *  - INT AUTO_INCREMENT            → INT GENERATED ALWAYS AS IDENTITY
 *  - BIGINT AUTO_INCREMENT         → BIGINT GENERATED ALWAYS AS IDENTITY
 *  - tinyint(1)                    → BOOLEAN
 *  - DEFAULT '1' (en tinyint)      → DEFAULT TRUE
 *  - DEFAULT '0' (en tinyint)      → DEFAULT FALSE
 *  - datetime                      → TIMESTAMPTZ
 *  - timestamp                     → TIMESTAMPTZ
 *  - DEFAULT CURRENT_TIMESTAMP     → DEFAULT NOW()
 *  - ON UPDATE CURRENT_TIMESTAMP   → eliminado (se reemplaza con trigger genérico)
 *  - text                          → TEXT
 *  - json                          → JSONB
 *  - enum('A','B')                 → TEXT CHECK (col IN ('A','B'))
 *  - GENERATED ALWAYS AS (...) STORED → Postgres lo soporta igual
 *  - KEY idx_x (cols)              → CREATE INDEX idx_x ON tbl (cols)  [separado]
 *  - UNIQUE KEY uk_x (cols)        → UNIQUE NULLS NOT DISTINCT (cols)  [postgres 15+]
 *  - ENGINE=InnoDB ... COLLATE=... → eliminado
 *  - AUTO_INCREMENT=N              → eliminado
 *
 * Limitaciones (revisar manualmente):
 *  - Triggers MySQL no se convierten (los aplicamos aparte)
 *  - FK ON UPDATE CASCADE: Postgres lo soporta igual
 *  - Algunos checks de ENUM con CHECK pueden colisionar si hay > 1 ENUM por tabla
 *  - GENERATED columns con sintaxis MySQL específica pueden requerir ajuste
 */

const fs = require('fs');

const raw = fs.readFileSync(process.argv[2] || '/dev/stdin', 'utf8');

// 1) Eliminar comentarios y directives MySQL
let sql = raw
  .replace(/\/\*!\d+\s+SET\s+[^;]*\*\/;/g, '')   // /*!40101 SET ... */;
  .replace(/\/\*![^*]*\*\//g, '')                 // /*! ... */
  .replace(/--[^\n]*/g, '')                       // -- comentarios
  .replace(/\n\s*\n/g, '\n');                     // líneas vacías

// Helper: mapeo ENUM → CHECK (incluye comillas escapadas)
function enumToCheck(colName, values) {
  // values es la lista entre paréntesis: 'A','B','C'
  const parsedValues = values.split(',').map(v => v.trim());
  return `TEXT CHECK (${colName} IN (${parsedValues.join(',')}))`;
}

// Procesar bloques CREATE TABLE
const tableBlocks = [];
const indexStatements = [];
const triggerStatements = [];
const fkStatements = [];  // ALTER TABLE ... ADD CONSTRAINT (ejecutado después de todas las CREATE)

const tableRegex = /CREATE\s+TABLE\s+`([^`]+)`\s*\(([\s\S]*?)\)\s*ENGINE=[^;]*;/gi;
let m;
while ((m = tableRegex.exec(sql)) !== null) {
  const tableName = m[1];
  const body = m[2];

  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const newCols = [];
  const inlineConstraints = [];

  for (let raw of lines) {
    // Quitar coma final si tiene
    let line = raw.replace(/,$/, '');
    if (!line) continue;

    // PRIMARY KEY (col, ...)
    if (/^PRIMARY\s+KEY\s*\(/i.test(line)) {
      const cols = line.match(/\(([^)]+)\)/)[1].replace(/`/g, '');
      inlineConstraints.push(`PRIMARY KEY (${cols})`);
      continue;
    }

    // UNIQUE KEY name (cols)
    let uniqueMatch = line.match(/^UNIQUE\s+KEY\s+`([^`]+)`\s*\(([^)]+)\)/i);
    if (uniqueMatch) {
      const cols = uniqueMatch[2].replace(/`/g, '');
      inlineConstraints.push(`CONSTRAINT ${uniqueMatch[1]} UNIQUE (${cols})`);
      continue;
    }

    // KEY name (cols)  → índice separado
    let keyMatch = line.match(/^KEY\s+`([^`]+)`\s*\(([^)]+)\)/i);
    if (keyMatch) {
      const idxName = keyMatch[1];
      const cols = keyMatch[2].replace(/`/g, '');
      indexStatements.push(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${tableName} (${cols});`);
      continue;
    }

    // FULLTEXT KEY → skip (Postgres usa tsvector/GIN)
    if (/^FULLTEXT\s+KEY/i.test(line)) {
      continue;
    }

    // CONSTRAINT ... FOREIGN KEY ... → ALTER TABLE separado (resuelve orden de creación)
    let fkMatch = line.match(/^CONSTRAINT\s+`([^`]+)`\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+`([^`]+)`\s*\(([^)]+)\)([^,]*)$/i);
    if (fkMatch) {
      const fkName = fkMatch[1];
      const localCols = fkMatch[2].replace(/`/g, '');
      const refTable = fkMatch[3];
      const refCols = fkMatch[4].replace(/`/g, '');
      const onClauses = fkMatch[5].trim();
      fkStatements.push(
        `ALTER TABLE ${tableName} ADD CONSTRAINT ${fkName} ` +
        `FOREIGN KEY (${localCols}) REFERENCES ${refTable} (${refCols})` +
        `${onClauses ? ' ' + onClauses : ''};`
      );
      continue;
    }

    // Linea de columna normal: `nombre` tipo ...
    let colMatch = line.match(/^`([^`]+)`\s+(.+)$/);
    if (!colMatch) {
      // bloque desconocido, lo dejamos para revisión manual
      newCols.push(`-- TODO: revisar línea: ${line}`);
      continue;
    }
    const colName = colMatch[1];
    let colDef = colMatch[2];

    // Conversiones de tipo
    // tinyint(1) → BOOLEAN (debe ir antes que 'int')
    colDef = colDef.replace(/\btinyint\(1\)/gi, 'BOOLEAN');
    // tinyint(N>1)/smallint/mediumint → SMALLINT
    colDef = colDef.replace(/\b(?:tiny|small|medium)int\b(?:\(\d+\))?/gi, 'SMALLINT');
    // bigint
    colDef = colDef.replace(/\bbigint\b(?:\(\d+\))?/gi, 'BIGINT');
    // int (con o sin tamaño)
    colDef = colDef.replace(/\bint\b(?:\(\d+\))?/gi, 'INTEGER');
    // datetime → TIMESTAMPTZ
    colDef = colDef.replace(/\bdatetime\b/gi, 'TIMESTAMPTZ');
    // timestamp → TIMESTAMPTZ
    colDef = colDef.replace(/\btimestamp\b/gi, 'TIMESTAMPTZ');
    // text
    colDef = colDef.replace(/\btext\b/gi, 'TEXT');
    // json → JSONB
    colDef = colDef.replace(/\bjson\b/gi, 'JSONB');
    // decimal/numeric (mantener)
    colDef = colDef.replace(/\bdecimal\b/gi, 'NUMERIC');
    // varchar (mantener)
    colDef = colDef.replace(/\bvarchar\b/gi, 'VARCHAR');
    // ENUM('A','B') → TEXT CHECK
    colDef = colDef.replace(/\benum\(([^)]+)\)/gi, (full, vals) => {
      const placeholder = `__ENUMCHECK__(${vals})`;
      return placeholder;
    });

    // AUTO_INCREMENT (puede tener "NOT NULL" en medio)
    if (/AUTO_INCREMENT/i.test(colDef)) {
      colDef = colDef
        .replace(/BIGINT(\s+NOT\s+NULL)?\s+AUTO_INCREMENT/i, 'BIGINT GENERATED ALWAYS AS IDENTITY')
        .replace(/INTEGER(\s+NOT\s+NULL)?\s+AUTO_INCREMENT/i, 'INTEGER GENERATED ALWAYS AS IDENTITY')
        .replace(/\s*AUTO_INCREMENT/gi, ''); // catch-all por si quedó algún resto
    }

    // ON UPDATE CURRENT_TIMESTAMP → eliminar (lo agregamos como trigger genérico)
    const hasUpdateTrigger = /ON\s+UPDATE\s+CURRENT_TIMESTAMP/i.test(colDef);
    colDef = colDef.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '');
    if (hasUpdateTrigger && colName === 'updated_at') {
      // Marcamos que esta tabla necesita trigger
      tableBlocks._needsUpdateTrigger = tableBlocks._needsUpdateTrigger || new Set();
      tableBlocks._needsUpdateTrigger.add(tableName);
    }

    // DEFAULT CURRENT_TIMESTAMP → DEFAULT NOW()
    colDef = colDef.replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, 'DEFAULT NOW()');

    // DEFAULT '1' / DEFAULT '0' en BOOLEAN
    if (/BOOLEAN/.test(colDef)) {
      colDef = colDef.replace(/DEFAULT\s+'1'/gi, 'DEFAULT TRUE');
      colDef = colDef.replace(/DEFAULT\s+'0'/gi, 'DEFAULT FALSE');
    }

    // GENERATED columns: MySQL → Postgres syntax (usually compatible)
    // GENERATED ALWAYS AS (`a` * `b`) STORED → mantener pero quitar backticks
    colDef = colDef.replace(/`/g, '');

    // Re-procesar __ENUMCHECK__ ahora que conocemos el nombre de columna
    colDef = colDef.replace(/__ENUMCHECK__\(([^)]+)\)/g, (_, vals) => {
      return `TEXT CHECK (${colName} IN (${vals}))`;
    });

    newCols.push(`  ${colName} ${colDef.trim()}`);
  }

  const allDefs = [...newCols, ...inlineConstraints.map(c => `  ${c}`)].join(',\n');
  tableBlocks.push(`CREATE TABLE IF NOT EXISTS ${tableName} (\n${allDefs}\n);`);
}

// Trigger genérico para updated_at
const updateTrigger = `
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

if (tableBlocks._needsUpdateTrigger) {
  for (const t of tableBlocks._needsUpdateTrigger) {
    triggerStatements.push(
      `CREATE TRIGGER ${t}_set_updated_at BEFORE UPDATE ON ${t} ` +
      `FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`
    );
  }
}

// Output final
const out = [
  '-- ===========================================================',
  '-- ERP-PRO — Schema Postgres (auto-generado desde MySQL dump)',
  '-- ===========================================================',
  '',
  '-- Habilitar extensiones útiles',
  'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
  '',
  '-- Tablas',
  ...tableBlocks,
  '',
  '-- Foreign Keys (después de crear todas las tablas para evitar order issues)',
  ...fkStatements,
  '',
  '-- Índices',
  ...indexStatements,
  '',
  '-- Trigger genérico para updated_at',
  updateTrigger.trim(),
  '',
  ...triggerStatements,
  '',
  '-- ===========================================================',
  '-- Fin de schema',
  '-- ===========================================================',
].join('\n');

process.stdout.write(out);

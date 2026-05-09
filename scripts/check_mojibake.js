#!/usr/bin/env node
/**
 * Detector de mojibake. Corre antes del build (npm run build → prebuild).
 * Si encuentra secuencias UTF-8-leído-como-Latin1, falla con exit code 1
 * para que Railway aborte el deploy.
 *
 * Caso real que motivó esto (08/05/2026): public/js/app.js e index.html
 * quedaron con bytes corruptos hardcoded ("Cargando mÃ³dulo...", "â˜°"
 * en vez de "☰"). El usuario lo vio recién en producción. Esto lo
 * captura en build.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Carpetas a saltar — no recorrer
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.claude',
  'sunat-golden-files', 'uploads', 'tmp',
]);

// Archivos a saltar por path relativo (este script se contiene a sí mismo
// como ejemplos en comentarios y patterns, así que no se auto-escanea).
const SKIP_FILES = new Set([
  'scripts/check_mojibake.js',
]);

// Extensiones a escanear
const SCAN_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.html', '.css',
  '.json', '.md', '.sql', '.yml', '.yaml',
]);

// Patrones mojibake — todos extremadamente improbables en español legítimo.
// Cada entry: [regex, descripción de lo que debería ser]
const PATTERNS = [
  [/Ã[³±©¡­º¼]/g, 'vocal acentuada española (ó/ñ/é/á/í/ú/ü)'],
  [/Ã[‘“‰š]/g,    'vocal acentuada mayúscula (Ñ/Ó/É/Ú)'],
  [/Â[¿¡]/g,      'puntuación invertida ¿ ¡'],
  [/â€[""¦"–—]/g, 'comilla tipográfica, ellipsis o em-dash'],
  [/â”[€‚]/g,     'caracter de caja (─ │)'],
  [/â˜°/g,        'símbolo ☰ (hamburger)'],
  [/âœ•/g,        'símbolo ✕ (X de cerrar)'],
  [/âžœ/g,        'símbolo ➜ (flecha)'],
  [/â†[''""]/g,   'flecha → ←'],
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && SCAN_EXT.has(path.extname(entry.name))) yield full;
  }
}

let totalHits = 0;
const findings = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (SKIP_FILES.has(rel)) continue;

  let content;
  try { content = fs.readFileSync(file, 'utf8'); }
  catch { continue; }

  for (const [pattern, desc] of PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const before = content.slice(0, m.index);
      const line = before.split('\n').length;
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = content.indexOf('\n', m.index);
      const lineText = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
      findings.push({
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        line,
        match: m[0],
        desc,
        snippet: lineText.length > 120 ? lineText.slice(0, 120) + '…' : lineText,
      });
      totalHits++;
    }
  }
}

if (totalHits === 0) {
  console.log('✓ check_mojibake: sin secuencias mojibake. OK.');
  process.exit(0);
}

console.error('\n✗ check_mojibake: se detectó mojibake en el árbol de fuentes.\n');
console.error('Esto significa que un archivo tiene bytes UTF-8 que fueron leídos como');
console.error('Latin-1/Windows-1252 en algún momento y re-guardados corruptos.\n');
console.error('Hallazgos:\n');
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    "${f.match}"  → debería ser ${f.desc}`);
  console.error(`    | ${f.snippet}`);
  console.error('');
}
console.error(`Total: ${totalHits} ocurrencias en ${new Set(findings.map(f => f.file)).size} archivo(s).\n`);
console.error('Cómo arreglar:');
console.error('  1) Abrí el archivo en VS Code.');
console.error('  2) Click en la barra inferior derecha donde dice la codificación.');
console.error('  3) "Reopen with Encoding" → Windows-1252.');
console.error('  4) Si los acentos se ven bien ahora, "Save with Encoding" → UTF-8.');
console.error('  5) Si los acentos siguen mal, hacé find/replace manual de los patrones.\n');
process.exit(1);

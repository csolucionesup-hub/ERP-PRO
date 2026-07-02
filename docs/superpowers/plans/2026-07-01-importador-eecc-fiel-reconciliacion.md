# Importador EECC fiel + reconciliación "el EECC manda" — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que subir el EECC de Interbank cargue TODA línea fiel, se enlace conservadoramente a los movimientos ERP sin duplicar ni borrar, y se pueda deshacer/re-cargar por (cuenta, período).

**Architecture:** Modelo "el EECC manda" (spec `docs/superpowers/specs/2026-07-01-importador-eecc-fiel-reconciliacion-design.md`). El extracto es el libro del banco; los movimientos ERP espejo se marcan *reemplazados* de forma reversible (columna `reemplazado_por_mov`). La decisión de match vive en una función pura testeable; la orquestación (BD) y el deshacer viven en `CobranzasService`.

**Tech Stack:** TypeScript/Node, Express 5, Postgres (Supabase) vía `db.query` (adapter MySQL→PG en `connection.ts`), frontend Vanilla JS. Tests = scripts standalone `npx ts-node scripts/test_*.ts` (no hay jest).

---

## Estructura de archivos

- **Crear** `database/migrations/082_reemplazado_por_mov.sql` — columna nueva (aditiva).
- **Crear** `app/modules/finance/matchLineaEECC.ts` — función pura de decisión de match + tipos.
- **Crear** `scripts/test_match_linea_eecc.ts` — unit test de la función pura.
- **Modificar** `app/modules/finance/CobranzasService.ts` — dedup por saldo_contable, pase de reconciliación, `deshacerImportacionEECC`, filtro en `getLibroBancos`.
- **Modificar** `index.ts` — ruta `POST /cobranzas/libro-bancos/deshacer-importacion`.
- **Modificar** `public/js/services/api.js` — `api.cobranzas.deshacerImportacionEECC`.
- **Modificar** `public/js/pages/Finanzas.js` — botón "Deshacer importación EECC" + handler.
- **Modificar** `public/js/app.js` + `public/index.html` — cache buster global.

---

## Task 1: Migración — columna `reemplazado_por_mov`

**Files:**
- Create: `database/migrations/082_reemplazado_por_mov.sql`

- [ ] **Step 1: Escribir la migración**

Archivo `database/migrations/082_reemplazado_por_mov.sql`:

```sql
-- 082_reemplazado_por_mov.sql
-- Postgres NATIVO (Supabase fhlrxlsscerfiuuyiejw) -- NO pasa por el adapter.
-- Modelo "el EECC manda": cuando una linea IMPORT_EECC se enlaza a un movimiento
-- ERP espejo, la espejo se marca REEMPLAZADA (reversible) apuntando a la linea EECC.
-- NULL = fila activa. Con valor = fila espejo reemplazada (no suma, no se muestra).
-- ADITIVA: nullable, sin default destructivo, sin back-fill.
ALTER TABLE movimientobancario
  ADD COLUMN IF NOT EXISTS reemplazado_por_mov INT NULL;

CREATE INDEX IF NOT EXISTS movimientobancario_idx_reemplazado
  ON movimientobancario (reemplazado_por_mov);
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Se aplica con la herramienta de migración (MCP `apply_migration` o el runner del proyecto), NO por SQL manual suelto. Nombre de migración: `reemplazado_por_mov`. Contenido: el del Step 1.
Expected: columna `reemplazado_por_mov` visible en `movimientobancario` (verificar con `list_tables verbose` o `information_schema.columns`).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/082_reemplazado_por_mov.sql
git commit -m "feat(libro-bancos): migracion 082 columna reemplazado_por_mov (reversible)"
```

---

## Task 2: Función pura `matchLineaEECC` + unit test (TDD)

Decide, para una línea del EECC y un pool de filas espejo candidatas, cuál espejo es el match seguro (o ninguno). Sin BD. El caller quita del pool la espejo elegida para lograr 1:1.

**Regla:** match si `(nro_operacion igual Y monto igual)` **o** `(monto igual Y fecha ±3 días Y solapan tokens de nombre)`. Ante la duda → `null`.

**Files:**
- Create: `app/modules/finance/matchLineaEECC.ts`
- Test: `scripts/test_match_linea_eecc.ts`

- [ ] **Step 1: Escribir el test que falla**

Archivo `scripts/test_match_linea_eecc.ts`:

```ts
// Unit test de matchLineaEECC (función pura, sin BD).
// Correr: npx ts-node scripts/test_match_linea_eecc.ts
import { matchLineaEECC, LineaEECCMatch, EspejoMatch } from '../app/modules/finance/matchLineaEECC';

let pass = 0, fail = 0;
function check(nombre: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  OK  ${nombre}`); }
  else { fail++; console.log(`  XX  ${nombre} ${extra}`); }
}

const linea = (o: Partial<LineaEECCMatch>): LineaEECCMatch => ({
  monto: 100, fecha: '2026-06-22', tipo: 'CARGO', descripcion: '', nro_operacion: null, ...o,
});
const espejo = (id: number, o: Partial<EspejoMatch>): EspejoMatch => ({
  id_movimiento: id, monto: 100, fecha: '2026-06-22', tipo: 'CARGO', descripcion: '', nro_operacion: null, ...o,
});

// (a) monto + fecha + nombre solapan -> match
{
  const l = linea({ monto: 1152.19, descripcion: 'RAMOS QUISPE LUIS DAVID' });
  const c = [espejo(324, { monto: 1152.19, descripcion: 'Pago OC 007 - 2026 (sin factura aun) LUIS RAMOS QUISPE' })];
  check('(a) monto+fecha+nombre -> match 324', matchLineaEECC(l, c) === 324);
}
// (b) monto igual pero nombre NO solapa -> null (no falso match)
{
  const l = linea({ monto: 500, descripcion: 'PEREZ GOMEZ ANA' });
  const c = [espejo(1, { monto: 500, descripcion: 'Pago OC 018 MANRIQUE GRANADOS' })];
  check('(b) nombre no solapa -> null', matchLineaEECC(l, c) === null, String(matchLineaEECC(l, c)));
}
// (c) monto difiere (comision) -> null (no borrar la comision)
{
  const l = linea({ monto: 17399.70, descripcion: 'N/D I-BANC + COM' });
  const c = [espejo(331, { monto: 17394.40, descripcion: 'Pago OC 014 CREER' })];
  check('(c) monto difiere -> null', matchLineaEECC(l, c) === null, String(matchLineaEECC(l, c)));
}
// (d) fecha fuera de +-3 dias -> null
{
  const l = linea({ monto: 100, fecha: '2026-06-22', descripcion: 'SUCLUPE' });
  const c = [espejo(2, { monto: 100, fecha: '2026-06-30', descripcion: 'SUCLUPE ARISMENDIZ' })];
  check('(d) fuera de rango de fecha -> null', matchLineaEECC(l, c) === null, String(matchLineaEECC(l, c)));
}
// (e) nro_operacion igual + monto igual -> match aunque el nombre no solape (caso deposito)
{
  const l = linea({ monto: 89877.10, tipo: 'ABONO', descripcion: 'TIENDA 365 DEP EFECTIVO', nro_operacion: '3127394' });
  const c = [espejo(317, { monto: 89877.10, tipo: 'ABONO', descripcion: 'Cobranza deposito Cot COT 2026-014-MN', nro_operacion: '3127394' })];
  check('(e) nro_op + monto -> match 317', matchLineaEECC(l, c) === 317, String(matchLineaEECC(l, c)));
}
// (f) tipo distinto -> null (un CARGO no matchea un ABONO)
{
  const l = linea({ monto: 100, tipo: 'CARGO', descripcion: 'SUCLUPE' });
  const c = [espejo(3, { monto: 100, tipo: 'ABONO', descripcion: 'SUCLUPE' })];
  check('(f) tipo distinto -> null', matchLineaEECC(l, c) === null, String(matchLineaEECC(l, c)));
}
// (g) varios candidatos identicos -> devuelve uno (el de menor id) para 1:1
{
  const l = linea({ monto: 1200, descripcion: 'SUCLUPE ARISMENDIZ LUIS' });
  const c = [
    espejo(325, { monto: 1200, descripcion: 'Pago OC 008 SUCLUPE' }),
    espejo(326, { monto: 1200, descripcion: 'Pago OC 009 SUCLUPE' }),
  ];
  check('(g) varios identicos -> 325 (menor id)', matchLineaEECC(l, c) === 325, String(matchLineaEECC(l, c)));
}
// (h) sin candidatos -> null
{
  check('(h) pool vacio -> null', matchLineaEECC(linea({}), []) === null);
}

console.log(`\n${pass}/${pass + fail} casos OK`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx ts-node scripts/test_match_linea_eecc.ts`
Expected: FAIL — error de compilación "Cannot find module '../app/modules/finance/matchLineaEECC'".

- [ ] **Step 3: Escribir la implementación**

Archivo `app/modules/finance/matchLineaEECC.ts`:

```ts
// Decisión pura de match entre una línea del EECC y filas espejo del ERP.
// Sin BD/HTTP. El caller quita del pool la espejo devuelta para lograr 1:1.
// Regla: match si (nro_operacion igual Y monto igual) O
//               (monto igual Y fecha ±3 días Y solapan tokens de nombre).
// Ante la duda -> null (nunca inventa match; la diferencia queda pendiente).

export interface LineaEECCMatch {
  monto: number;
  fecha: string;                 // 'YYYY-MM-DD'
  tipo: 'CARGO' | 'ABONO';
  descripcion: string;           // texto/beneficiario de la línea del banco
  nro_operacion: string | null;
}

export interface EspejoMatch {
  id_movimiento: number;
  monto: number;
  fecha: string;                 // 'YYYY-MM-DD'
  tipo: 'CARGO' | 'ABONO';
  descripcion: string;           // descripcion_banco de la fila ERP
  nro_operacion: string | null;
}

const TOL_DIAS = 3;
const cents = (n: number): number => Math.round(Number(n) * 100);

// Palabras genéricas que NO deben contar como "nombre" para el solapamiento.
const STOP = new Set([
  'PAGO', 'OC', 'TRANSFERENCIA', 'CARGO', 'ABONO', 'SIN', 'FACTURA', 'AUN',
  'WEB', 'DEL', 'LOS', 'LAS', 'POR', 'CON', 'DEP', 'EFECTIVO', 'SERVICIO',
  'SERVICIOS', 'COBRANZA', 'DEPOSITO', 'COT', 'INTERNO', 'BANC', 'COM',
]);

// Normaliza a tokens significativos (mayúsculas, sin acentos, len>=3, sin stopwords ni números).
function tokens(s: string): Set<string> {
  const norm = (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .replace(/[^A-Z0-9\s]/g, ' ');
  const out = new Set<string>();
  for (const t of norm.split(/\s+/)) {
    if (t.length < 3) continue;
    if (/^\d+$/.test(t)) continue;
    if (STOP.has(t)) continue;
    out.add(t);
  }
  return out;
}

function solapanNombre(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

function diasEntre(a: string, b: string): number {
  const da = Date.parse(a + 'T00:00:00Z');
  const db = Date.parse(b + 'T00:00:00Z');
  if (Number.isNaN(da) || Number.isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

export function matchLineaEECC(linea: LineaEECCMatch, candidatos: EspejoMatch[]): number | null {
  const mismoTipoYmonto = candidatos.filter(
    (c) => c.tipo === linea.tipo && cents(c.monto) === cents(linea.monto)
  );
  if (mismoTipoYmonto.length === 0) return null;

  // Señal fuerte: nro_operacion igual + monto igual (caso depósito/cobranza).
  if (linea.nro_operacion) {
    const porOp = mismoTipoYmonto.filter((c) => c.nro_operacion && c.nro_operacion === linea.nro_operacion);
    if (porOp.length) {
      return porOp.sort((a, b) => a.id_movimiento - b.id_movimiento)[0].id_movimiento;
    }
  }

  // Señal normal: fecha ±3 días + solapamiento de nombre.
  const seguros = mismoTipoYmonto
    .filter((c) => diasEntre(c.fecha, linea.fecha) <= TOL_DIAS)
    .filter((c) => solapanNombre(c.descripcion, linea.descripcion));
  if (seguros.length === 0) return null;

  // Desempate: más cercano en fecha, luego menor id (para 1:1 estable).
  seguros.sort((a, b) => {
    const da = diasEntre(a.fecha, linea.fecha);
    const db = diasEntre(b.fecha, linea.fecha);
    if (da !== db) return da - db;
    return a.id_movimiento - b.id_movimiento;
  });
  return seguros[0].id_movimiento;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx ts-node scripts/test_match_linea_eecc.ts`
Expected: PASS — `8/8 casos OK`.

- [ ] **Step 5: Commit**

```bash
git add app/modules/finance/matchLineaEECC.ts scripts/test_match_linea_eecc.ts
git commit -m "feat(libro-bancos): matchLineaEECC puro + unit test 8/8"
```

---

## Task 3: Fidelidad — dedup por `saldo_contable`

Reemplaza el dedup que descarta ITF legítimos. `saldo_contable` es único por línea del extracto.

**Files:**
- Modify: `app/modules/finance/CobranzasService.ts` (bloque de dedup dentro de `importarEECCInterbank`, actualmente `~1650-1666`)

- [ ] **Step 1: Reemplazar el bloque de dedup**

Buscar (dentro de `importarEECCInterbank`, en el loop `for (const it of items)`):

```ts
      // Dedupe: misma cuenta + nro_operacion + fecha + monto
      let dup: any[];
      if (it.nro_operacion) {
        [dup] = await db.query(
          `SELECT id_movimiento FROM MovimientoBancario
            WHERE id_cuenta=? AND nro_operacion=? AND fecha=? AND monto=?`,
          [idCuenta, it.nro_operacion, it.fecha_op, it.monto]
        ) as any;
      } else {
        [dup] = await db.query(
          `SELECT id_movimiento FROM MovimientoBancario
            WHERE id_cuenta=? AND fecha=? AND monto=? AND tipo=? AND tipo_movimiento_banco=?`,
          [idCuenta, it.fecha_op, it.monto, it.tipo, it.tipo_mov]
        ) as any;
      }
      if ((dup as any[]).length) { duplicados++; continue; }
```

Reemplazar por:

```ts
      // Dedupe FIEL: una línea del EECC ya cargada se identifica por su saldo
      // contable (único por movimiento del extracto) + monto + fecha. Antes se
      // deduplicaba por (nº op | fecha+monto+tipo), lo que colapsaba ITF de mismo
      // monto/día (comparten nº op "–") y PERDÍA líneas -> data silenciosa.
      const [dup] = await db.query(
        `SELECT id_movimiento FROM MovimientoBancario
          WHERE id_cuenta=? AND fuente='IMPORT_EECC'
            AND saldo_contable=? AND monto=? AND fecha=?`,
        [idCuenta, it.saldo_contable, it.monto, it.fecha_op]
      ) as any;
      if ((dup as any[]).length) { duplicados++; continue; }
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/modules/finance/CobranzasService.ts
git commit -m "fix(libro-bancos): dedup EECC por saldo_contable (no perder ITF repetidos)"
```

---

## Task 4: Reconciliación EECC ↔ ERP (match + reemplazo reversible)

Después de insertar las líneas nuevas, enlazar las pendientes a su espejo con `matchLineaEECC` y marcar la espejo `reemplazado_por_mov`.

**Files:**
- Modify: `app/modules/finance/CobranzasService.ts` — import del helper (top del archivo), llamada al final de `importarEECCInterbank`, nuevo método privado `reconciliarEECCContraERP`.

- [ ] **Step 1: Importar el helper**

Al inicio de `app/modules/finance/CobranzasService.ts`, junto a los otros imports (ej. debajo de `import { clasificarSaldoBanco } ...`):

```ts
import { matchLineaEECC, LineaEECCMatch, EspejoMatch } from './matchLineaEECC';
```

- [ ] **Step 2: Llamar la reconciliación al final de `importarEECCInterbank`**

En `importarEECCInterbank`, justo ANTES del `return { total_lineas, insertados, duplicados };`, agregar:

```ts
    // Enlazar (reconciliar) las líneas recién importadas contra los movimientos
    // ERP espejo: match conservador, reemplazo reversible. Idempotente.
    const enlazados = await this.reconciliarEECCContraERP(idCuenta, items);

    return {
      total_lineas: items.length,
      insertados,
      duplicados,
      enlazados,
    };
```

(Borrar el `return { total_lineas: items.length, insertados, duplicados };` viejo.)

- [ ] **Step 3: Agregar el método `reconciliarEECCContraERP`**

Agregar como método de la clase `CobranzasService`, justo después de `importarEECCInterbank` (antes del bloque de "HERRAMIENTAS DE CONCILIACIÓN AVANZADA"):

```ts
  /**
   * Enlaza líneas IMPORT_EECC POR_CONCILIAR contra movimientos ERP espejo
   * (MANUAL/AUTO activos). Match conservador vía matchLineaEECC. Al enlazar:
   * la línea EECC hereda ref de la espejo y queda CONCILIADO; la espejo se marca
   * reemplazado_por_mov = <id línea EECC> (reversible). Idempotente.
   * `items` = líneas parseadas de esta importación (para acotar el rango de fechas).
   */
  private async reconciliarEECCContraERP(idCuenta: number, items: any[]): Promise<number> {
    if (!items.length) return 0;
    const fechas = items.map(i => i.fecha_op).sort();
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];

    // Líneas EECC pendientes de esta cuenta en el rango (las recién importadas
    // + cualquier pendiente previa; re-matchear es idempotente).
    const [lineasRaw] = await db.query(
      `SELECT id_movimiento, monto, fecha, tipo, descripcion_banco, nro_operacion
         FROM MovimientoBancario
        WHERE id_cuenta=? AND fuente='IMPORT_EECC' AND estado_conciliacion='POR_CONCILIAR'
          AND fecha BETWEEN ? AND ?
        ORDER BY id_movimiento ASC`,
      [idCuenta, desde, hasta]
    );

    // Pool de espejos candidatas (activas, no reemplazadas). Ventana ±3 días.
    const [espejosRaw] = await db.query(
      `SELECT id_movimiento, monto, fecha, tipo, descripcion_banco, nro_operacion
         FROM MovimientoBancario
        WHERE id_cuenta=? AND fuente IN ('MANUAL','AUTO') AND reemplazado_por_mov IS NULL
          AND fecha BETWEEN ? AND ?`,
      [idCuenta, this.diaOffset(desde, -3), this.diaOffset(hasta, 3)]
    );

    const pool: EspejoMatch[] = (espejosRaw as any[]).map(e => ({
      id_movimiento: Number(e.id_movimiento),
      monto: Number(e.monto),
      fecha: String(e.fecha).slice(0, 10),
      tipo: e.tipo,
      descripcion: e.descripcion_banco || '',
      nro_operacion: e.nro_operacion || null,
    }));

    let enlazados = 0;
    for (const l of (lineasRaw as any[])) {
      const linea: LineaEECCMatch = {
        monto: Number(l.monto),
        fecha: String(l.fecha).slice(0, 10),
        tipo: l.tipo,
        descripcion: l.descripcion_banco || '',
        nro_operacion: l.nro_operacion || null,
      };
      const idEspejo = matchLineaEECC(linea, pool);
      if (idEspejo == null) continue;

      // Traer ref + descripción de la espejo para heredarlas en la línea EECC
      // (así la línea del extracto conserva la etiqueta "Pago OC 0XX" en comentario;
      // getLibroBancos NO arma ref_label para ref_tipo='GASTO', por eso el comentario).
      const [[esp]]: any = await db.query(
        `SELECT ref_tipo, ref_id, descripcion_banco FROM MovimientoBancario WHERE id_movimiento=?`,
        [idEspejo]
      );
      await db.query(
        `UPDATE MovimientoBancario
            SET estado_conciliacion='CONCILIADO',
                ref_tipo=?, ref_id=?, comentario=COALESCE(?, comentario), conciliado_at=NOW()
          WHERE id_movimiento=?`,
        [esp?.ref_tipo || 'OTRO', esp?.ref_id || null, esp?.descripcion_banco || null, l.id_movimiento]
      );
      await db.query(
        `UPDATE MovimientoBancario SET reemplazado_por_mov=? WHERE id_movimiento=?`,
        [l.id_movimiento, idEspejo]
      );
      // Sacar la espejo del pool para 1:1.
      const idx = pool.findIndex(p => p.id_movimiento === idEspejo);
      if (idx >= 0) pool.splice(idx, 1);
      enlazados++;
    }
    return enlazados;
  }

  /** Suma `dias` a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. */
  private diaOffset(fecha: string, dias: number): string {
    const d = new Date(fecha + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/modules/finance/CobranzasService.ts
git commit -m "feat(libro-bancos): reconciliar EECC contra ERP (match + reemplazo reversible)"
```

---

## Task 5: `getLibroBancos` excluye las filas reemplazadas

**Files:**
- Modify: `app/modules/finance/CobranzasService.ts` — WHERE del SELECT de movimientos en `getLibroBancos` (`~1374-1377`)

- [ ] **Step 1: Agregar el filtro**

En `getLibroBancos`, en el query de movimientos del período, cambiar:

```ts
        FROM MovimientoBancario m
       WHERE m.id_cuenta = ? AND m.fecha BETWEEN ? AND ?
       ORDER BY m.fecha ASC, m.id_movimiento ASC
```

por:

```ts
        FROM MovimientoBancario m
       WHERE m.id_cuenta = ? AND m.fecha BETWEEN ? AND ?
         AND m.reemplazado_por_mov IS NULL
       ORDER BY m.fecha ASC, m.id_movimiento ASC
```

Con esto las filas espejo reemplazadas no suman (ingresos/egresos/saldo), no aparecen en la lista, no cuentan como pendientes, y no entran a `clasificarSaldoBanco`.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/modules/finance/CobranzasService.ts
git commit -m "feat(libro-bancos): excluir filas reemplazadas del extracto/KPIs"
```

---

## Task 6: `deshacerImportacionEECC` (deshacer / re-cargar)

**Files:**
- Modify: `app/modules/finance/CobranzasService.ts` — nuevo método público (junto a `deleteMovimientoBancario`).

- [ ] **Step 1: Agregar el método**

```ts
  /**
   * Deshace la importación EECC de un (cuenta, período): restaura las filas espejo
   * reemplazadas (reemplazado_por_mov = NULL) y borra las líneas IMPORT_EECC del
   * período. Reversible + idempotente. Solo GERENTE (validado en la ruta).
   * periodo: 'YYYY-MM'.
   */
  async deshacerImportacionEECC(idCuenta: number, periodo: string, userId?: number) {
    if (!idCuenta) throw new Error('id_cuenta requerido');
    if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error('periodo (YYYY-MM) requerido');
    const [anio, mes] = periodo.split('-').map(Number);
    const desde = `${periodo}-01`;
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${new Date(anio, mes, 0).getDate()}`;

    // 1) Restaurar espejos reemplazadas por líneas EECC de este período.
    await db.query(
      `UPDATE MovimientoBancario SET reemplazado_por_mov = NULL
        WHERE id_cuenta=? AND reemplazado_por_mov IN (
          SELECT id_movimiento FROM MovimientoBancario
           WHERE id_cuenta=? AND fuente='IMPORT_EECC' AND fecha BETWEEN ? AND ?
        )`,
      [idCuenta, idCuenta, desde, hasta]
    );

    // 2) Borrar las líneas IMPORT_EECC del período.
    const [del]: any = await db.query(
      `DELETE FROM MovimientoBancario
        WHERE id_cuenta=? AND fuente='IMPORT_EECC' AND fecha BETWEEN ? AND ?`,
      [idCuenta, desde, hasta]
    );

    // 3) Auditoría (best-effort, no romper si falla).
    try {
      await db.query(
        `INSERT INTO Auditoria (entidad, accion, detalle, id_usuario)
         VALUES ('MovimientoBancario', 'DESHACER_EECC', ?, ?)`,
        [`Deshacer importación EECC cuenta ${idCuenta} período ${periodo}`, userId || null]
      );
    } catch (_) { /* auditoría opcional */ }

    return { ok: true };
  }
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si `Auditoria` tiene columnas distintas, ajustar el INSERT del Step 1 a las columnas reales de la tabla `auditoria`; el bloque está en try/catch así que un desajuste no rompe el deshacer, pero conviene alinearlo.)

- [ ] **Step 3: Commit**

```bash
git add app/modules/finance/CobranzasService.ts
git commit -m "feat(libro-bancos): deshacerImportacionEECC (restaura espejos + borra EECC)"
```

---

## Task 7: Ruta + api.js + botón en la UI

**Files:**
- Modify: `index.ts` (después de la ruta `importar-eecc`, `~729`)
- Modify: `public/js/services/api.js` (namespace `cobranzas`, `~249`)
- Modify: `public/js/pages/Finanzas.js` (header del modal Libro Bancos + handler)
- Modify: `public/js/app.js` + `public/index.html` (cache buster)

- [ ] **Step 1: Ruta en `index.ts`**

Después del bloque `apiRouter.post('/cobranzas/libro-bancos/importar-eecc', ...)`:

```ts
apiRouter.post('/cobranzas/libro-bancos/deshacer-importacion', async (req: Request, res: Response) => {
  const { id_cuenta, periodo } = req.body;
  const user = (req as any).user;
  if (user?.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE puede deshacer importaciones.' });
  res.json(await CobranzasService.deshacerImportacionEECC(parseInt(id_cuenta), String(periodo), user?.id_usuario));
});
```

- [ ] **Step 2: `api.cobranzas.deshacerImportacionEECC`**

En `public/js/services/api.js`, dentro del objeto `cobranzas`, después de `importarEECC`:

```js
    deshacerImportacionEECC: (idCuenta, periodo) => post('/cobranzas/libro-bancos/deshacer-importacion', { id_cuenta: idCuenta, periodo }),
```

- [ ] **Step 3: Botón en el header del modal Libro Bancos (`Finanzas.js`)**

En `public/js/pages/Finanzas.js`, en el header del modal (junto a `btn-import-eecc`), agregar el botón SOLO si el banner de EECC está cargado. Agregar tras el botón `btn-import-eecc` (`~985`):

```js
          <button id="btn-undo-eecc" title="Deshacer la importación del EECC de este período: restaura los movimientos que fueron enlazados y borra las líneas del extracto. Reversible. Solo GERENTE." style="padding:8px 14px;border:1px solid #b91c1c;background:#fff;color:#b91c1c;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">↩ Deshacer EECC</button>
```

- [ ] **Step 4: Handler del botón**

En `Finanzas.js`, donde se cablean los botones del header (junto a `#btn-new-mov` / `#btn-import-eecc`, `~1071`), agregar:

```js
    const btnUndo = box.querySelector('#btn-undo-eecc');
    if (btnUndo) btnUndo.onclick = async () => {
      const u = JSON.parse(localStorage.getItem('erp_user') || '{}');
      if (u.rol !== 'GERENTE') { showError('Solo GERENTE puede deshacer importaciones.'); return; }
      if (!confirm(`¿Deshacer la importación del EECC de ${periodoSel}?\n\nSe restauran los movimientos enlazados y se borran las líneas del extracto de este período. Es reversible (podés volver a importar).`)) return;
      try {
        await api.cobranzas.deshacerImportacionEECC(idCuentaSel, periodoSel);
        showSuccess('Importación EECC deshecha');
        render();
      } catch (e) { showError(e.error || e.message); }
    };
```

(Verificar los nombres reales de las variables del scope: `idCuentaSel`, `periodoSel`, `box`, `render` — usar los que ya usa el modal, visibles en `modalLibroBancos`.)

- [ ] **Step 5: Cache buster global**

Bump del token en TODO `public/js` + `index.html` (gotcha #36). Buscar el token actual y reemplazarlo por `20260701r2`:

Run: `sed -i "s/20260701r1/20260701r2/g" public/index.html public/js/app.js`
Verificar: `grep -rc "20260701r1" public/` → 0 ; `grep -rc "20260701r2" public/js/app.js public/index.html` → 26.
(Si el token en `main` ya es otro por deploys intermedios, usar el actual como origen del reemplazo.)

- [ ] **Step 6: Verificar compila + mojibake**

Run: `npx tsc --noEmit && node scripts/check_mojibake.js`
Expected: sin errores TS + "sin secuencias mojibake. OK."

- [ ] **Step 7: Commit**

```bash
git add index.ts public/js/services/api.js public/js/pages/Finanzas.js public/js/app.js public/index.html
git commit -m "feat(libro-bancos): boton Deshacer EECC + ruta + api + cache buster"
```

---

## Task 8: Verificación final + cierre de Junio (validación end-to-end)

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite de verificación**

Run: `npx tsc --noEmit && node scripts/check_mojibake.js && npx ts-node scripts/test_match_linea_eecc.ts && npx ts-node scripts/test_saldo_banco_clasificador.ts`
Expected: TS OK, mojibake OK, `8/8`, `7/7`.

- [ ] **Step 2: Abrir PR y desplegar**

Push de la rama `claude/importador-eecc-fiel`. Julio mergea a `main` → Railway deploya. Aplicar la migración 082 (Task 1 Step 2) al entorno productivo.

- [ ] **Step 3: Cerrar Junio Soles in-app (smoke real)**

En la app (Finanzas → Libro Bancos → Caja Soles → Junio 2026):
1. **↩ Deshacer EECC** → vuelve la capa ERP limpia (0 líneas EECC, pendientes = 0).
2. **📥 Importar EECC Interbank** → pegar el EECC de Junio. Verificar: entran TODAS las líneas (incluidos los ~10 ITF, ya no 6), los pagos de OC quedan enlazados (etiqueta "Pago OC 0XX", conciliados) y sus filas espejo desaparecen del listado.
3. Conciliar los pendientes con 💡/💱: SEDAPAL S/17.50 (servicio), ITF, comisiones N/D.
4. **✎ Saldo inicial** → declarar S/34.59.
5. Verificar KPIs: Saldo final **S/1,716.75**, indicador **CUADRADO** (verde), 0 pendientes.

- [ ] **Step 4: Verificar deshacer/re-cargar (reversibilidad)**

En un período de prueba: importar → deshacer → confirmar que las filas espejo volvieron (reemplazado_por_mov = NULL) y las líneas EECC se borraron; re-importar → mismo resultado (idempotente).

---

## Self-review (cobertura del spec)

- R1 fidelidad → Task 3 (dedup por saldo_contable). ✓
- R2 match conservador + reemplazo reversible → Task 2 (pura) + Task 4 (orquestación) + Task 1 (columna). ✓
- R3 deshacer/re-cargar/progresivo → Task 6 + Task 7 (UI) + Task 8 Step 4. ✓
- getLibroBancos excluye reemplazadas → Task 5. ✓
- Genérico (cuenta, período), Soles+USD → todos los métodos parametrizados por idCuenta/periodo; sin lógica por moneda. ✓
- Cierre de Junio (sección 5 del spec) → Task 8 Step 3. ✓

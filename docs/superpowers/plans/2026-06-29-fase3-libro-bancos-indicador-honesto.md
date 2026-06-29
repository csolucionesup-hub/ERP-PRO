# Fase 3 — Indicador honesto "Saldo Banco (EECC)" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la caja "Saldo Banco (EECC)" del Libro Bancos deje de mostrar un "Dif" falso cuando la cadena EECC está incompleta (movimientos manuales mezclados), mostrando en su lugar un estado neutro "Parcial".

**Architecture:** Una función pura `clasificarSaldoBanco()` (nueva, en su propio archivo, testeable sin BD) encapsula toda la regla del indicador y devuelve `{ saldo_banco, diferencia, estado }`. `CobranzasService.getLibroBancos` la llama y agrega `saldo_banco_estado` a su respuesta. El frontend mapea ese estado a presentación (color + valor + sub-línea). `saldo_final` y todo lo demás quedan intactos.

**Tech Stack:** TypeScript (Node/Express backend), Vanilla JS frontend, ts-node para tests. Sin BD nueva, sin migración.

**Spec:** `docs/superpowers/specs/2026-06-29-fase3-libro-bancos-indicador-honesto-design.md`

---

## Task 1: Función pura `clasificarSaldoBanco` + unit test (TDD)

**Files:**
- Create: `app/modules/finance/saldoBancoClasificador.ts`
- Test: `scripts/test_saldo_banco_clasificador.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test_saldo_banco_clasificador.ts`:

```typescript
// Unit test de clasificarSaldoBanco (función pura, sin BD).
// Correr: npx ts-node scripts/test_saldo_banco_clasificador.ts
import { clasificarSaldoBanco, MovimientoSaldo } from '../app/modules/finance/saldoBancoClasificador';

let pass = 0, fail = 0;
function check(nombre: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${nombre}`); }
  else { fail++; console.log(`  ✗ ${nombre} ${extra}`); }
}

// Helper para construir filas EECC sintéticas.
function eecc(id: number, tipo: 'CARGO' | 'ABONO', monto: number, saldo: number, fecha = '2026-03-10'): MovimientoSaldo {
  return { id_movimiento: id, fuente: 'IMPORT_EECC', tipo, monto, saldo_contable: saldo, fecha_proceso: fecha, fecha };
}

// (a) Cadena completa, dif=0 → CUADRADO.
//   inicial 100; CARGO 30 → saldo 70 (antes=100); saldo_final 70.
{
  const r = clasificarSaldoBanco([eecc(1, 'CARGO', 30, 70)], 100, 70);
  check('(a) cadena completa dif=0 → CUADRADO', r.estado === 'CUADRADO', JSON.stringify(r));
}

// (b) Cadena completa, dif≠0 → DIF.
//   inicial 100; CARGO 30 → saldo 70; saldo_final 60 (ERP difiere) → dif 10.
{
  const r = clasificarSaldoBanco([eecc(1, 'CARGO', 30, 70)], 100, 60);
  check('(b) cadena completa dif≠0 → DIF', r.estado === 'DIF' && r.diferencia === 10, JSON.stringify(r));
}

// (c) Cadena fragmentada (2 terminales), dif≠0 → PARCIAL.
//   row1: CARGO 50 → saldo 50 (antes 100); row2: CARGO 20 → saldo 200 (antes 220). saldo_final 30.
{
  const r = clasificarSaldoBanco(
    [eecc(1, 'CARGO', 50, 50, '2026-03-05'), eecc(2, 'CARGO', 20, 200, '2026-03-20')],
    100, 30
  );
  check('(c) cadena fragmentada dif≠0 → PARCIAL', r.estado === 'PARCIAL' && r.diferencia === null, JSON.stringify(r));
}

// (d) Sin filas EECC → SIN_EECC.
{
  const manual: MovimientoSaldo = { id_movimiento: 9, fuente: 'MANUAL', tipo: 'CARGO', monto: 40, saldo_contable: null, fecha_proceso: '2026-03-10', fecha: '2026-03-10' };
  const r = clasificarSaldoBanco([manual], 100, 60);
  check('(d) sin EECC → SIN_EECC', r.estado === 'SIN_EECC' && r.saldo_banco === null, JSON.stringify(r));
}

// (e) 1 terminal pero NO arranca en saldo_inicial → PARCIAL.
//   inicial 100; CARGO 30 → saldo 470 (antes 500 ≠ 100); saldo_final 460 → dif 10.
{
  const r = clasificarSaldoBanco([eecc(1, 'CARGO', 30, 470)], 100, 460);
  check('(e) 1 terminal pero no arranca en inicial → PARCIAL', r.estado === 'PARCIAL' && r.diferencia === null, JSON.stringify(r));
}

console.log(`\n${pass}/${pass + fail} casos OK`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ts-node scripts/test_saldo_banco_clasificador.ts`
Expected: FAIL — error de compilación "Cannot find module '../app/modules/finance/saldoBancoClasificador'".

- [ ] **Step 3: Write minimal implementation**

Create `app/modules/finance/saldoBancoClasificador.ts`:

```typescript
// Clasificador del indicador "Saldo Banco (EECC)" del Libro Bancos.
// Función pura (sin BD/HTTP): dada la lista de movimientos del período, el
// saldo inicial y el saldo final del ERP, decide si el cierre del banco
// (derivado de la cadena de saldo_contable de las filas IMPORT_EECC) cuadra,
// difiere de verdad, es parcial (cadena incompleta por movimientos manuales),
// o no hay EECC importado. Ver spec 2026-06-29.

export type EstadoSaldoBanco = 'CUADRADO' | 'DIF' | 'PARCIAL' | 'SIN_EECC';

export interface MovimientoSaldo {
  fuente: string;                          // 'IMPORT_EECC' | 'MANUAL' | 'AUTO'
  saldo_contable: number | string | null;
  monto: number;
  tipo: string;                            // 'ABONO' | 'CARGO'
  fecha_proceso?: any;
  fecha?: any;
  id_movimiento: number;
}

export interface ResultadoSaldoBanco {
  saldo_banco: number | null;
  diferencia: number | null;
  estado: EstadoSaldoBanco;
}

const TOL_CENTS = 1; // tolerancia 0.01

const cents = (n: number): number => Math.round(Number(n) * 100);

// Normaliza fecha (Date del driver pg, o string) a 'YYYY-MM-DD'. String(Date)
// da "Wed Jan 07..." y ordenar por eso compara por nombre de día (bug histórico
// del Saldo Banco) — por eso normalizamos antes de ordenar la cadena.
const isoDay = (v: any): string => {
  if (!v) return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
};

// "saldo antes" de una fila = su saldo_contable revertido por su importe.
const antesDe = (m: MovimientoSaldo): number =>
  cents(Number(m.saldo_contable) - (m.tipo === 'ABONO' ? Number(m.monto) : -Number(m.monto)));

export function clasificarSaldoBanco(
  movimientos: MovimientoSaldo[],
  saldo_inicial: number,
  saldo_final: number
): ResultadoSaldoBanco {
  const eeccRows = movimientos.filter((m) => m.fuente === 'IMPORT_EECC');
  if (eeccRows.length === 0) {
    return { saldo_banco: null, diferencia: null, estado: 'SIN_EECC' };
  }

  const eeccSaldo = eeccRows.filter((m) => m.saldo_contable != null);
  if (eeccSaldo.length === 0) {
    // Hay EECC pero sin saldo_contable usable: no se puede armar la cadena.
    return { saldo_banco: null, diferencia: null, estado: 'PARCIAL' };
  }

  const antesSet = new Set(eeccSaldo.map(antesDe));
  const saldoSet = new Set(eeccSaldo.map((m) => cents(Number(m.saldo_contable))));

  // Terminal = fila cuyo saldo_contable no es el "antes" de ninguna otra (fin de cadena).
  const terminales = eeccSaldo.filter((m) => !antesSet.has(cents(Number(m.saldo_contable))));
  // Inicio = fila cuyo "antes" no es el saldo_contable de ninguna otra (arranque de cadena).
  const inicios = eeccSaldo.filter((m) => !saldoSet.has(antesDe(m)));

  if (terminales.length === 0) {
    // Cadena en bucle: cierre indeterminable.
    return { saldo_banco: null, diferencia: null, estado: 'PARCIAL' };
  }

  // saldo_banco = terminal de mayor fecha_proceso (desempate por id_movimiento).
  const ordenados = [...terminales].sort((a, b) => {
    const pa = isoDay(a.fecha_proceso || a.fecha);
    const pb = isoDay(b.fecha_proceso || b.fecha);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return Number(a.id_movimiento) - Number(b.id_movimiento);
  });
  const saldo_banco = Number(ordenados[ordenados.length - 1].saldo_contable);
  const dif = +(saldo_banco - saldo_final).toFixed(2);

  // Regla de oro: si los números coinciden, siempre CUADRADO (sin importar manuales).
  if (Math.abs(cents(dif)) <= TOL_CENTS) {
    return { saldo_banco, diferencia: dif, estado: 'CUADRADO' };
  }

  // No cuadra: ¿la cadena es completa (1 inicio que arranca en saldo_inicial, 1 terminal)?
  const cadenaCompleta =
    terminales.length === 1 &&
    inicios.length === 1 &&
    Math.abs(antesDe(inicios[0]) - cents(saldo_inicial)) <= TOL_CENTS;

  if (cadenaCompleta) {
    return { saldo_banco, diferencia: dif, estado: 'DIF' }; // descalce real
  }
  return { saldo_banco, diferencia: null, estado: 'PARCIAL' }; // no exponer Dif engañoso
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ts-node scripts/test_saldo_banco_clasificador.ts`
Expected: PASS — `5/5 casos OK`.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/modules/finance/saldoBancoClasificador.ts scripts/test_saldo_banco_clasificador.ts
git commit -m "feat(libro-bancos): clasificarSaldoBanco (funcion pura) + unit test"
```

---

## Task 2: Cablear el helper en `getLibroBancos`

**Files:**
- Modify: `app/modules/finance/CobranzasService.ts` (import al inicio; reemplazar bloque ~1474-1505; agregar campo al return ~1539)

- [ ] **Step 1: Agregar el import**

Cerca de los imports al inicio de `app/modules/finance/CobranzasService.ts`, agregar:

```typescript
import { clasificarSaldoBanco } from './saldoBancoClasificador';
```

- [ ] **Step 2: Reemplazar el bloque inline de cómputo de saldo_banco**

Buscar el bloque que empieza en `const cents = (n: number) => Math.round(Number(n) * 100);` (definición local dentro de `getLibroBancos`, ~línea 1474) y termina en la línea `const diferencia = saldo_banco != null ? +(saldo_banco - saldo_final).toFixed(2) : null;` (~línea 1505), incluyendo el comentario "Saldo banco (EECC) = cierre real..." inmediatamente anterior. Reemplazar TODO ese bloque por:

```typescript
    // Saldo banco (EECC) + estado del indicador (CUADRADO / DIF / PARCIAL / SIN_EECC).
    // Regla pura en saldoBancoClasificador.ts (ver spec 2026-06-29). Devuelve un Dif
    // real solo cuando la cadena EECC es completa; si está fragmentada por movimientos
    // manuales, devuelve PARCIAL en vez de un Dif falso.
    const { saldo_banco, diferencia, estado: saldo_banco_estado } =
      clasificarSaldoBanco(lista as any, saldo_inicial, saldo_final);
```

Nota: el `const cents = ...` local se elimina (ahora vive en el helper). Verificar que `cents` no se use en otra parte de `getLibroBancos` (no debería).

- [ ] **Step 3: Agregar `saldo_banco_estado` al return**

En el objeto que retorna `getLibroBancos`, justo después de la línea `diferencia,`, agregar:

```typescript
      saldo_banco_estado,
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si tira "cents is not used" o "cents not defined" en otra línea, revisar el reemplazo.)

- [ ] **Step 5: Verify unit test sigue verde**

Run: `npx ts-node scripts/test_saldo_banco_clasificador.ts`
Expected: PASS — `5/5 casos OK`.

- [ ] **Step 6: Verificación contra data real (read-only, Supabase MCP)**

Con el agente: para cada período/cuenta correr `clasificarSaldoBanco` (o reproducir su lógica) con los movimientos reales y confirmar:
- Marzo Soles (id_cuenta=1, 2026-03) → `PARCIAL` (hoy mostraba Dif 130.80).
- Abril Soles (2026-04) → `CUADRADO`.
- Mayo Soles (2026-05) → `PARCIAL` (o CUADRADO si cuadra exacto).
- Junio Soles (2026-06) y Junio USD (id_cuenta=2) → `SIN_EECC`.
Y confirmar que `saldo_final` NO cambió en ningún período (la query de KPIs no se tocó).

- [ ] **Step 7: Commit**

```bash
git add app/modules/finance/CobranzasService.ts
git commit -m "feat(libro-bancos): getLibroBancos usa clasificarSaldoBanco + saldo_banco_estado"
```

---

## Task 3: Frontend — `difBadge` + tarjeta KPI por estado + cache buster

**Files:**
- Modify: `public/js/pages/Finanzas.js` (bloque ~872-877 y tarjeta ~1026-1030)
- Modify: `public/js/app.js` (19 ocurrencias de cache buster)
- Modify: `public/index.html` (8 ocurrencias de cache buster)

- [ ] **Step 1: Reescribir `difBadge` y agregar helpers de color/valor**

En `public/js/pages/Finanzas.js`, reemplazar el bloque actual (líneas ~873-877):

```javascript
    const difBadge = data.diferencia == null ? '' : (
      Math.abs(data.diferencia) < 0.01
        ? '<span style="color:#16a34a;font-weight:700">✅ Cuadrado</span>'
        : `<span style="color:#dc2626;font-weight:700">⚠️ Dif ${fMoney(data.diferencia, mon)}</span>`
    );
```

por:

```javascript
    // Estado del indicador Saldo Banco (EECC). Fallback defensivo por si el backend
    // viejo (durante el deploy) aún no manda saldo_banco_estado.
    const estadoSB = data.saldo_banco_estado || (
      data.diferencia == null ? 'SIN_EECC'
        : (Math.abs(data.diferencia) < 0.01 ? 'CUADRADO' : 'DIF')
    );
    const difBadge =
        estadoSB === 'CUADRADO' ? '<span style="color:#16a34a;font-weight:700">✅ Cuadrado</span>'
      : estadoSB === 'DIF'      ? `<span style="color:#dc2626;font-weight:700">⚠️ Dif ${fMoney(data.diferencia, mon)}</span>`
      : estadoSB === 'PARCIAL'  ? '<span style="color:#b45309;font-weight:600">Importá el EECC completo del mes para cuadrar</span>'
      : '';
    const sbColors = {
      CUADRADO: { bg: '#ecfdf5', border: '#16a34a' },
      DIF:      { bg: '#fef2f2', border: '#dc2626' },
      PARCIAL:  { bg: '#fffbeb', border: '#f59e0b' },
      SIN_EECC: { bg: '#f9fafb', border: '#6b7280' },
    };
    const sbC = sbColors[estadoSB] || sbColors.SIN_EECC;
    const sbValor = estadoSB === 'PARCIAL' ? 'Parcial'
                  : (data.saldo_banco != null ? fMoney(data.saldo_banco, mon) : '—');
```

- [ ] **Step 2: Reescribir la tarjeta KPI "SALDO BANCO (EECC)"**

En `public/js/pages/Finanzas.js`, reemplazar la tarjeta actual (líneas ~1026-1030):

```javascript
        <div style="background:${data.saldo_banco != null ? (Math.abs(data.diferencia || 0) < 0.01 ? '#ecfdf5' : '#fef2f2') : '#f9fafb'};padding:8px;border-radius:6px;border-left:3px solid ${data.saldo_banco != null ? (Math.abs(data.diferencia || 0) < 0.01 ? '#16a34a' : '#dc2626') : '#6b7280'}">
          <div style="font-size:10px;color:#6b7280;font-weight:600">SALDO BANCO (EECC)</div>
          <div style="font-size:14px;font-weight:700">${data.saldo_banco != null ? fMoney(data.saldo_banco, mon) : '—'}</div>
          <div style="font-size:10px">${difBadge}</div>
        </div>
```

por:

```javascript
        <div style="background:${sbC.bg};padding:8px;border-radius:6px;border-left:3px solid ${sbC.border}">
          <div style="font-size:10px;color:#6b7280;font-weight:600">SALDO BANCO (EECC)</div>
          <div style="font-size:14px;font-weight:700">${sbValor}</div>
          <div style="font-size:10px">${difBadge}</div>
        </div>
```

- [ ] **Step 3: Bump del cache buster**

Reemplazo global `20260628r2` → `20260629r1` en los dos archivos:
- `public/js/app.js` (19 ocurrencias)
- `public/index.html` (8 ocurrencias)

Verificar que no quede ninguna `20260628r2`:
Run: `grep -rc "20260628r2" public/js/app.js public/index.html`
Expected: `0` en ambos.

- [ ] **Step 4: Verify build + mojibake**

Run: `npx tsc --noEmit`
Expected: sin errores.
Run: `node scripts/check_mojibake.js`
Expected: sin hallazgos.

- [ ] **Step 5: Verificación visual (preview)**

Levantar el server (`npx ts-node index.ts`) y en el navegador (preview): abrir Finanzas → Libro Bancos.
- **Marzo 2026, Caja General Soles** → la caja "Saldo Banco (EECC)" debe verse **ámbar "Parcial"** con sub-línea "Importá el EECC completo…" (ya NO "⚠ Dif 130.80").
- **Abril 2026, Caja General Soles** → debe seguir **verde "✅ Cuadrado"** (sin cambios).
Capturar screenshot de ambos como evidencia.

- [ ] **Step 6: Commit**

```bash
git add public/js/pages/Finanzas.js public/js/app.js public/index.html
git commit -m "feat(libro-bancos): caja Saldo Banco por estado (Parcial honesto) + cache buster r1"
```

---

## Task 4: Push + PR

- [ ] **Step 1: Push de la rama**

```bash
git push -u origin claude/fase3-libro-bancos-indicador-honesto
```

- [ ] **Step 2: Abrir PR**

```bash
gh pr create --title "Fase 3 — Libro Bancos: indicador honesto Saldo Banco (EECC)" --body "$(cat <<'EOF'
Hace honesto el KPI "Saldo Banco (EECC)": deja de mostrar un Dif falso cuando
la cadena EECC está incompleta (movimientos manuales mezclados).

4 estados: CUADRADO / DIF (real, EECC completo) / PARCIAL (cadena incompleta,
sin número) / SIN_EECC. Regla de oro: dif≈0 ⇒ siempre CUADRADO (Abril no cambia).

- Backend: función pura `clasificarSaldoBanco` + `getLibroBancos` devuelve `saldo_banco_estado`.
- Frontend: caja KPI y badge por estado + cache buster.
- Sin migración, sin tabla nueva, `saldo_final` intacto.

Verificado vs extractos oficiales: Marzo→Parcial, Abril→Cuadrado, Junio→Sin EECC.
Spec: docs/superpowers/specs/2026-06-29-fase3-libro-bancos-indicador-honesto-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Dejar que Julio mergee a `main` (gate de release). Railway deploya solo.

---

## Notas de ejecución

- **Orden:** Task 1 → 2 → 3 → 4. Task 1 es TDD puro; Task 2 cablea; Task 3 es frontend (se verifica visualmente, no hay harness de tests de UI en el proyecto); Task 4 publica.
- **Gotchas del proyecto:** `npx tsc --noEmit` antes de pushear (un error TS rompe el deploy de Railway en silencio); cache buster en TODOS los imports; modales no se cierran por backdrop (no aplica acá, no se tocan modales).
- **Rama:** ya estamos en `claude/fase3-libro-bancos-indicador-honesto` (el spec ya está commiteado ahí).

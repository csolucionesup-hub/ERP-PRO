# Saldo inicial Libro Bancos (declarado + auto-encadenado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el cálculo erróneo del saldo inicial del Libro Bancos (back-calc desde una línea del EECC) por un saldo inicial declarado por cuenta+período que se auto-encadena mes a mes, editable por cualquier usuario con FINANZAS.

**Architecture:** Tabla nueva `SaldoInicialBanco` guarda los anclas manuales. `CobranzasService.getSaldoInicial` resuelve: declarado → heredado del ancla previa + movimientos → fallback. `getLibroBancos` lo usa y expone `saldo_inicial_origen`. UI: KPI "Saldo inicial" editable con badge de origen.

**Tech Stack:** Node + TypeScript + Express (backend), MySQL→Postgres adapter (`connection.ts`), Supabase Postgres (DB real, proyecto `fhlrxlsscerfiuuyiejw`), Vanilla JS ES modules (frontend).

**Nota tests:** el repo NO tiene framework de tests. Verificación = `npx tsc --noEmit`, `node --check`, y queries SQL contra Supabase (MCP). No inventar framework.

**Convenciones (CLAUDE.md):** cache buster gotcha #36 (bump global del token `?v=` en TODO `public/js` + index.html), tsc antes de push (#37), modales sin backdrop (#28), tooltips en botones nuevos, `escapeHtml`/`escapeAttr` para datos dinámicos. Tablas en Postgres son **minúsculas** (`saldoinicialbanco`); el adapter traduce los nombres CamelCase de las queries.

---

## Task 1: Migración — tabla `SaldoInicialBanco`

**Files:**
- Create: `database/migrations/077_saldo_inicial_banco.sql`

- [ ] **Step 1: Crear el archivo de migración (dialecto del repo, MySQL-style)**

```sql
-- 077_saldo_inicial_banco.sql
-- Saldo inicial declarado del Libro Bancos, por cuenta + período (YYYY-MM).
-- Solo guarda los anclas que el usuario carga manualmente; los demás períodos
-- se calculan encadenando movimientos desde el ancla previa (ver
-- CobranzasService.getSaldoInicial). Reemplaza el back-calc frágil desde el EECC.
CREATE TABLE IF NOT EXISTS SaldoInicialBanco (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  id_cuenta       INT NOT NULL,
  periodo         VARCHAR(7) NOT NULL,            -- 'YYYY-MM'
  saldo           DECIMAL(14,2) NOT NULL,
  registrado_por  INT,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_cuenta, periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Aplicar a Supabase (PRODUCCIÓN — lo hace el controlador, no un subagente)**

El controlador aplica el equivalente Postgres vía el MCP de Supabase
(`apply_migration`, name `077_saldo_inicial_banco`, project `fhlrxlsscerfiuuyiejw`):

```sql
CREATE TABLE IF NOT EXISTS saldoinicialbanco (
  id              SERIAL PRIMARY KEY,
  id_cuenta       INT NOT NULL,
  periodo         VARCHAR(7) NOT NULL,
  saldo           NUMERIC(14,2) NOT NULL,
  registrado_por  INT,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_cuenta, periodo)
);
```

Verificar: `SELECT to_regclass('public.saldoinicialbanco');` → devuelve `saldoinicialbanco` (no null).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/077_saldo_inicial_banco.sql
git commit -m "feat(libro-bancos): migración 077 SaldoInicialBanco"
```

---

## Task 2: Backend — `getSaldoInicial` / `setSaldoInicial` + wire en `getLibroBancos`

**Files:**
- Modify: `app/modules/finance/CobranzasService.ts`

- [ ] **Step 1: Reemplazar el bloque de cálculo de saldo_inicial en `getLibroBancos`**

Localizar (≈líneas 1269-1294):

```ts
    // Saldo inicial: preferir saldo_contable del EECC importado (más preciso)
    // Buscar el movimiento más antiguo del período que tenga saldo_contable
    // y calcular hacia atrás: saldo_antes = saldo_contable ∓ monto
    const [[eeccIniRow]]: any = await db.query(`
      SELECT saldo_contable, monto, tipo
        FROM MovimientoBancario
       WHERE id_cuenta = ? AND fecha BETWEEN ? AND ?
         AND saldo_contable IS NOT NULL AND fuente = 'IMPORT_EECC'
       ORDER BY fecha ASC, id_movimiento ASC
       LIMIT 1
    `, [idCuenta, desde, hasta]);

    let saldo_inicial: number;
    if (eeccIniRow && eeccIniRow.saldo_contable != null) {
      // Primer mov del EECC: saldo_antes = saldo_contable - (abono) o + (cargo)
      const sc = Number(eeccIniRow.saldo_contable);
      const m  = Number(eeccIniRow.monto);
      saldo_inicial = eeccIniRow.tipo === 'ABONO' ? +(sc - m).toFixed(2) : +(sc + m).toFixed(2);
    } else {
      // Fallback: suma de movimientos previos
      const [[iniRow]]: any = await db.query(`
        SELECT COALESCE(SUM(CASE WHEN tipo='ABONO' THEN monto ELSE -monto END),0) AS saldo_ini
          FROM MovimientoBancario WHERE id_cuenta = ? AND fecha < ?
      `, [idCuenta, desde]);
      saldo_inicial = Number(iniRow.saldo_ini) || 0;
    }
```

Reemplazar TODO ese bloque por:

```ts
    // Saldo inicial: declarado (SaldoInicialBanco) o encadenado desde el ancla
    // previa. Reemplaza el back-calc desde el EECC (frágil: Interbank ordena por
    // fecha de operación pero el saldo_contable corre por orden de proceso).
    const { saldo: saldo_inicial, origen: saldo_inicial_origen } =
      await this.getSaldoInicial(idCuenta, per);
```

(`per` es el período 'YYYY-MM' ya calculado arriba en la función. `desde` se sigue usando más abajo para los movimientos del período — NO lo borres.)

- [ ] **Step 2: Agregar `saldo_inicial_origen` al objeto de retorno**

Localizar el `return {` de `getLibroBancos` (≈líneas 1412-1424):

```ts
    return {
      cuenta,
      periodo: per,
      saldo_inicial: +saldo_inicial.toFixed(2),
      saldo_final: +saldo_final.toFixed(2),
```

Insertar la línea `saldo_inicial_origen` justo después de `saldo_inicial`:

```ts
    return {
      cuenta,
      periodo: per,
      saldo_inicial: +saldo_inicial.toFixed(2),
      saldo_inicial_origen,
      saldo_final: +saldo_final.toFixed(2),
```

- [ ] **Step 3: Agregar los métodos `getSaldoInicial` y `setSaldoInicial`**

Insertar estos dos métodos dentro de la clase `CobranzasService`, justo ANTES del método `getLibroBancos` (es decir, antes de la línea `async getLibroBancos(idCuenta: number, periodo?: string) {`):

```ts
  /**
   * Resuelve el saldo inicial de una cuenta+período:
   *  1. DECLARADO: hay fila manual en SaldoInicialBanco para ese período.
   *  2. HEREDADO: encadena desde el ancla declarada más reciente anterior
   *     (saldo_ancla + Σ(ABONO−CARGO) de movimientos entre ancla y período).
   *  3. SIN_DEFINIR: no hay ancla → Σ(ABONO−CARGO) de movimientos previos (puede
   *     ser 0). La UI lo marca en ámbar para que se cargue.
   * `periodo` formato 'YYYY-MM'.
   */
  async getSaldoInicial(idCuenta: number, periodo: string): Promise<{ saldo: number; origen: 'DECLARADO' | 'HEREDADO' | 'SIN_DEFINIR' }> {
    const desde = `${periodo}-01`;

    // 1. Declarado para este período exacto
    const [[decl]]: any = await db.query(
      `SELECT saldo FROM SaldoInicialBanco WHERE id_cuenta = ? AND periodo = ?`,
      [idCuenta, periodo]
    );
    if (decl && decl.saldo != null) {
      return { saldo: Number(decl.saldo), origen: 'DECLARADO' };
    }

    // 2. Heredado: ancla declarada más reciente con periodo < pedido
    const [[ancla]]: any = await db.query(
      `SELECT periodo, saldo FROM SaldoInicialBanco
        WHERE id_cuenta = ? AND periodo < ?
        ORDER BY periodo DESC LIMIT 1`,
      [idCuenta, periodo]
    );
    if (ancla && ancla.saldo != null) {
      const anclaDesde = `${ancla.periodo}-01`;
      const [[mov]]: any = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo='ABONO' THEN monto ELSE -monto END),0) AS neto
           FROM MovimientoBancario
          WHERE id_cuenta = ? AND fecha >= ? AND fecha < ?`,
        [idCuenta, anclaDesde, desde]
      );
      return { saldo: +(Number(ancla.saldo) + Number(mov.neto || 0)).toFixed(2), origen: 'HEREDADO' };
    }

    // 3. Sin definir: suma de movimientos previos (puede ser 0)
    const [[prev]]: any = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN tipo='ABONO' THEN monto ELSE -monto END),0) AS neto
         FROM MovimientoBancario WHERE id_cuenta = ? AND fecha < ?`,
      [idCuenta, desde]
    );
    return { saldo: +Number(prev.neto || 0).toFixed(2), origen: 'SIN_DEFINIR' };
  }

  /**
   * Declara/actualiza (upsert) el saldo inicial manual de una cuenta+período.
   * Upsert por SELECT-then-INSERT/UPDATE para no depender del dialecto
   * (ON DUPLICATE KEY / ON CONFLICT difieren entre MySQL y Postgres).
   */
  async setSaldoInicial(idCuenta: number, periodo: string, saldo: number, userId?: number) {
    if (!idCuenta || !/^\d{4}-\d{2}$/.test(periodo) || !Number.isFinite(saldo)) {
      throw new Error('id_cuenta, periodo (YYYY-MM) y saldo válidos son requeridos');
    }
    const [[existing]]: any = await db.query(
      `SELECT id FROM SaldoInicialBanco WHERE id_cuenta = ? AND periodo = ?`,
      [idCuenta, periodo]
    );
    if (existing && existing.id) {
      await db.query(
        `UPDATE SaldoInicialBanco SET saldo = ?, registrado_por = ?, updated_at = NOW()
          WHERE id_cuenta = ? AND periodo = ?`,
        [saldo, userId || null, idCuenta, periodo]
      );
    } else {
      await db.query(
        `INSERT INTO SaldoInicialBanco (id_cuenta, periodo, saldo, registrado_por)
         VALUES (?, ?, ?, ?)`,
        [idCuenta, periodo, saldo, userId || null]
      );
    }
    return { ok: true, saldo: Number(saldo) };
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/modules/finance/CobranzasService.ts
git commit -m "feat(libro-bancos): getSaldoInicial/setSaldoInicial + wire en getLibroBancos"
```

---

## Task 3: Endpoint — `POST /cobranzas/libro-bancos/saldo-inicial`

**Files:**
- Modify: `index.ts` (junto a las rutas de libro-bancos, ≈línea 721-726)

- [ ] **Step 1: Agregar la ruta**

Localizar:

```ts
apiRouter.post('/cobranzas/libro-bancos/importar-eecc', async (req: Request, res: Response) => {
  const { id_cuenta, texto } = req.body;
  const userId = (req as any).user?.id_usuario;
  res.json(await CobranzasService.importarEECCInterbank(parseInt(id_cuenta), texto, userId));
});
```

Insertar INMEDIATAMENTE DESPUÉS:

```ts
apiRouter.post('/cobranzas/libro-bancos/saldo-inicial', async (req: Request, res: Response) => {
  const { id_cuenta, periodo, saldo } = req.body;
  const userId = (req as any).user?.id_usuario;
  res.json(await CobranzasService.setSaldoInicial(parseInt(id_cuenta), String(periodo), Number(saldo), userId));
});
```

(Va dentro del grupo `/cobranzas`, ya gateado por `requireModulo('FINANZAS')` en la línea 515 → cualquiera con FINANZAS. La validación dura está en `setSaldoInicial`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add index.ts
git commit -m "feat(libro-bancos): POST /cobranzas/libro-bancos/saldo-inicial"
```

---

## Task 4: Frontend api — `api.cobranzas.setSaldoInicial`

**Files:**
- Modify: `public/js/services/api.js` (dentro del namespace `cobranzas`, junto a `importarEECC`, ≈línea 248)

- [ ] **Step 1: Agregar el método**

Localizar dentro del namespace `cobranzas`:

```js
    importarEECC: (idCuenta, texto) => post('/cobranzas/libro-bancos/importar-eecc', { id_cuenta: idCuenta, texto }),
```

Insertar INMEDIATAMENTE DESPUÉS (misma indentación):

```js
    setSaldoInicial: (id_cuenta, periodo, saldo) => post('/cobranzas/libro-bancos/saldo-inicial', { id_cuenta, periodo, saldo }),
```

- [ ] **Step 2: Sanity**

Run: `node --check public/js/services/api.js`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add public/js/services/api.js
git commit -m "feat(api): api.cobranzas.setSaldoInicial"
```

---

## Task 5: Frontend — KPI "Saldo inicial" editable + badge de origen

**Files:**
- Modify: `public/js/pages/Finanzas.js` (función `modalLibroBancos`, KPI ≈líneas 963-966 y bindings ≈línea 1024)

**Contexto:** `render` es async y reconstruye `box.innerHTML`; `idCuentaSel`/`periodoSel` están en scope; re-render = llamar `render()`. `data.saldo_inicial_origen` viene del backend.

- [ ] **Step 1: Reemplazar la tarjeta KPI "SALDO INICIAL" por la versión editable**

Localizar:

```js
        <div style="background:#f9fafb;padding:8px;border-radius:6px;border-left:3px solid #6b7280">
          <div style="font-size:10px;color:#6b7280;font-weight:600">SALDO INICIAL</div>
          <div style="font-size:14px;font-weight:700">${fMoney(data.saldo_inicial, mon)}</div>
        </div>
```

Reemplazar por:

```js
        <div style="background:#f9fafb;padding:8px;border-radius:6px;border-left:3px solid #6b7280">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:10px;color:#6b7280;font-weight:600">SALDO INICIAL</div>
            <button id="btn-edit-saldo-ini" title="Definir o corregir el saldo inicial de esta cuenta y período. Los meses siguientes se encadenan solos." aria-label="Editar saldo inicial"
              style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:12px;padding:0;line-height:1">✎</button>
          </div>
          <div style="font-size:14px;font-weight:700">${fMoney(data.saldo_inicial, mon)}</div>
          ${data.saldo_inicial_origen === 'DECLARADO'
            ? '<div style="font-size:9px;color:#166534">✓ declarado</div>'
            : data.saldo_inicial_origen === 'HEREDADO'
              ? '<div style="font-size:9px;color:#6b7280">↪ heredado del mes previo</div>'
              : '<div style="font-size:9px;color:#92400e;background:#fef3c7;border-radius:3px;padding:0 4px;display:inline-block">⚠ sin definir</div>'}
        </div>
```

- [ ] **Step 2: Agregar el handler del botón ✎ en la sección de bindings**

Localizar (≈línea 1024):

```js
    box.querySelector('#btn-import-eecc').onclick = () => importarEECCDialog(idCuentaSel, render);
    box.querySelector('#btn-new-mov').onclick    = () => nuevoMovManual(idCuentaSel, monedaCta(idCuentaSel), render);
```

Insertar INMEDIATAMENTE DESPUÉS:

```js
    box.querySelector('#btn-edit-saldo-ini').onclick = async () => {
      const actual = Number(data.saldo_inicial) || 0;
      const val = prompt(
        `Saldo inicial de ${data.cuenta.nombre} — ${periodoSel}\n` +
        `(El saldo con el que arranca el mes, tomado del cierre del extracto anterior.\n` +
        `Los meses siguientes se calculan solos.)`,
        actual.toFixed(2)
      );
      if (val === null) return;
      const saldo = Number(String(val).replace(',', '.'));
      if (!Number.isFinite(saldo)) { showError('Monto inválido'); return; }
      try {
        await api.cobranzas.setSaldoInicial(idCuentaSel, periodoSel, saldo);
        showSuccess('Saldo inicial actualizado');
        render();
      } catch (e) { showError('Error: ' + e.message); }
    };
```

(Se usa `prompt` para mantener el patrón liviano ya presente en este modal — `nuevoMovManual`/conciliación usan prompts. No agrega un sub-modal nuevo.)

- [ ] **Step 3: Sanity**

Run: `node --check public/js/pages/Finanzas.js`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(libro-bancos): KPI saldo inicial editable + badge de origen"
```

---

## Task 6: Cache buster + typecheck final

**Files:**
- Modify: `public/js/app.js`, `public/index.html`, `public/js/pages/Finanzas.js` (token `?v=`)

- [ ] **Step 1: Detectar versión actual**

Run: `grep -o "?v=20260625r[0-9]*" public/js/app.js | sort -u`
Expected: imprime el token vigente (ej. `?v=20260625r4`).

- [ ] **Step 2: Bump global del token (Find/Replace en TODO public/js + index.html)**

Nueva versión: subir el `r#` (ej. `20260625r4` → `20260625r5`). Reemplazar el token viejo por el nuevo con Edit `replace_all` en: `public/js/app.js`, `public/index.html`, `public/js/pages/Finanzas.js` (este último tiene el import versionado de api.js).

Run (0 ocurrencias viejas): `grep -rc "20260625r4" public/js/app.js public/index.html public/js/pages/Finanzas.js`
Expected: `0` en los tres (ajustar al token viejo real).

Run: `grep -c "20260625r5" public/js/app.js`
Expected: ≈19 (no 0).

- [ ] **Step 3: Typecheck final**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js public/index.html public/js/pages/Finanzas.js
git commit -m "chore: bump cache buster (saldo inicial libro bancos)"
```

---

## Task 7: Cargar el dato real + verificación

- [ ] **Step 1: Sembrar el ancla de Enero 2026 (controlador, vía Supabase MCP)**

El controlador inserta el ancla real (Caja General Soles = id_cuenta 1):

```sql
INSERT INTO saldoinicialbanco (id_cuenta, periodo, saldo, registrado_por)
VALUES (1, '2026-01', 1535.03, NULL)
ON CONFLICT (id_cuenta, periodo) DO UPDATE SET saldo = EXCLUDED.saldo;
```

(O se carga desde la UI con el ✎ una vez desplegado. 1,535.03 = cierre de diciembre 2025, confirmado contra el extracto.)

- [ ] **Step 2: Verificar la resolución contra Supabase**

Query de verificación (replica getSaldoInicial para enero):

```sql
SELECT saldo FROM saldoinicialbanco WHERE id_cuenta=1 AND periodo='2026-01';
-- esperado: 1535.03 (DECLARADO)
```

Y febrero (heredado) — debe dar 1535.03 + Σ(movimientos enero):

```sql
SELECT 1535.03 + COALESCE(SUM(CASE WHEN tipo='ABONO' THEN monto ELSE -monto END),0) AS feb_inicial
FROM movimientobancario
WHERE id_cuenta=1 AND fecha >= '2026-01-01' AND fecha < '2026-02-01';
```

- [ ] **Step 3: Verificación en navegador (tras deploy)**

1. Finanzas → Libro Bancos → Caja General Soles → Enero 2026.
2. KPI "Saldo inicial" muestra **S/ 1,535.03** con badge **✓ declarado**, y el saldo corrido de la tabla arranca en 1,535.03.
3. Cambiar a Febrero 2026 → badge **↪ heredado del mes previo**.
4. Una cuenta/mes sin ancla → badge **⚠ sin definir** (ámbar).
5. ✎ → cambiar el valor → se guarda y recarga.

- [ ] **Step 4: Push + PR (tras OK de Julio)**

```bash
git push -u origin claude/saldo-inicial-libro-bancos
```
Abrir PR con `gh` para que Julio mergee a main.

---

## Self-review (cobertura del spec)

- Tabla SaldoInicialBanco (mig 077) → Task 1. ✓
- Resolución declarado/heredado/sin_definir → Task 2 (getSaldoInicial). ✓
- Eliminar back-calc EECC → Task 2 Step 1 (reemplazo del bloque). ✓
- setSaldoInicial upsert cross-dialect → Task 2 Step 3. ✓
- getLibroBancos expone saldo_inicial_origen → Task 2 Step 2. ✓
- Endpoint POST saldo-inicial gateado FINANZAS → Task 3. ✓
- api.cobranzas.setSaldoInicial → Task 4. ✓
- KPI editable + badge origen → Task 5. ✓
- Cache buster + tsc → Task 6. ✓
- Dato real Enero=1535.03 + verificación → Task 7. ✓
- Fase 2 (saldo banco EECC / conciliación) → fuera de alcance, no hay tarea. ✓

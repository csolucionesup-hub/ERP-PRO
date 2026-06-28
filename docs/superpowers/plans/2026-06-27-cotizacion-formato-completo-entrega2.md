# Cotización formato completo — Entrega 2 (modo costo consolidado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que una cotización oculte los precios por ítem en el PDF y muestre, en su lugar, un bloque "CONDICIONES COMERCIALES" con un desglose de costo (Materiales / Fabricación y MO / Utilidad) y el TOTAL SERVICIO real.

**Architecture:** Arquitectura 1 — el total SIEMPRE sale de la suma de ítems (Finanzas intacto). Dos campos opcionales en `Cotizaciones`: `ocultar_precios_items` (boolean) y `desglose_comercial` (texto multilínea, una línea "Concepto: monto"). El PDF, cuando el flag está activo, ensancha la columna Descripción, no dibuja P.Unit/Subtotal ni el bloque de totales/SON, y renderiza CONDICIONES COMERCIALES con el desglose + TOTAL SERVICIO = total real.

**Tech Stack:** Node/TypeScript (Express, Zod 4, mysql2-adapter→Postgres), Vanilla JS, PDFKit. Migración a Supabase por MCP `apply_migration`.

---

## Contexto del código (leer antes de empezar)

- Esta rama (`claude/cotizacion-costo-consolidado`) parte de `main` y YA incluye la Entrega 1 (`condiciones_servicio`).
- **CotizacionService.ts:** `CotizacionInput` (~línea 40-60, ya tiene `condiciones_servicio?`), `createCotizacion` INSERT (~822-838, 22 columnas hoy, terminando en `condiciones_servicio`), `updateCotizacion` (UPDATE SET con `condiciones_servicio = ?` antes de `fecha = COALESCE(...)`).
- **cotizacion.schema.ts:** `baseCotizacion` ya tiene `condiciones_servicio: z.string().optional()`.
- **Comercial.js:** helpers multilínea `setupMultilineHandlers(form)`, `multilinePrefill(fieldEl, val)`, patrón `.multiline-field[data-field="X"]` con `input[type=hidden][name="X"]` (ver `precios_incluyen` ~555 y `forma_pago` ~564). IGV checkbox: `<input type="checkbox" name="aplica_igv" id="igv-${idp}">` (~542). bindForm prefill editData (~900-916, ya setea `condiciones_servicio`). Payload submit (~925-946, ya incluye `condiciones_servicio`).
- **CotizacionPDFService.ts:** columnas (consts `cIT..cST`, ~226-231), `drawTableHeader` (~233-258, las etiquetas P.Unit/SubTotal en ~250-255), loop de ítems (pu/sub en ~341-344, foto en cST ~346-353), bloque de totales + "SON" (~360-387), bloque `condiciones_servicio` de Entrega 1 (justo después de "SON", parser `:`/`-`/párrafo), luego "CONDICIONES GENERALES" (~después). `curSym`, `esUSD`, `tc`, `pageW`, `ensureSpace`, `L`, `R` en scope.
- **getCotizacionById** usa `SELECT *` → los campos nuevos llegan al PDF y al prefill sin tocar el SELECT.
- **Reglas:** sin `alert()`; `npx tsc --noEmit` antes de pushear; cache buster `?v=` global (gotcha #36); tablas Supabase en minúscula (adapter normaliza).

## File Structure

- **Create:** `database/migrations/080_cotizacion_costo_consolidado.sql`
- **Modify:** `app/validators/cotizacion.schema.ts` — 2 campos Zod.
- **Modify:** `app/modules/comercial/CotizacionService.ts` — interface + create + update.
- **Modify:** `public/js/pages/Comercial.js` — checkbox + multilínea desglose + prefill + payload.
- **Modify:** `app/modules/comercial/CotizacionPDFService.ts` — geometría condicional + ocultar precios + bloque CONDICIONES COMERCIALES.
- **Modify:** `public/js/app.js` + `public/index.html` (+ import api.js en Comercial.js) — cache buster.

**Fuera de alcance (limitación anotada):** el toggle y el desglose se editan en creación y en el form de edición completa (estados EN_PROCESO / A_ESPERA_RESPUESTA). NO se agregan al modal de edición segura (`editarMetadata`) en esta entrega.

---

### Task 1: Migración — columnas nuevas

**Files:**
- Create: `database/migrations/080_cotizacion_costo_consolidado.sql`

- [ ] **Step 1: Crear el archivo (sintaxis MySQL para tracking en repo)**

```sql
-- 080_cotizacion_costo_consolidado.sql
-- Entrega 2 formato cotización: modo costo consolidado.
-- ocultar_precios_items: oculta P.Unit/Subtotal por ítem en el PDF.
-- desglose_comercial: texto multilínea "Concepto: monto" (Materiales/MO/Utilidad).

ALTER TABLE Cotizaciones
  ADD COLUMN ocultar_precios_items BOOLEAN NOT NULL DEFAULT 0 AFTER condiciones_servicio,
  ADD COLUMN desglose_comercial TEXT NULL AFTER ocultar_precios_items;
```

- [ ] **Step 2: Verificar sintaxis del archivo creado**

Run: `cat database/migrations/080_cotizacion_costo_consolidado.sql`
Expected: muestra el contenido (archivo bien escrito). NO aplicar a ninguna BD en este paso.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/080_cotizacion_costo_consolidado.sql
git commit -m "feat(db): mig 080 ocultar_precios_items + desglose_comercial en Cotizaciones"
```

(La aplicación a Supabase producción la hace el controlador vía MCP, con OK explícito de Julio — NO el implementador.)

---

### Task 2: Backend — schema Zod + CotizacionService

**Files:**
- Modify: `app/validators/cotizacion.schema.ts` (en `baseCotizacion`, tras `condiciones_servicio`)
- Modify: `app/modules/comercial/CotizacionService.ts` (interface, create, update)

- [ ] **Step 1: Agregar campos al schema Zod**

En `cotizacion.schema.ts`, dentro de `baseCotizacion`, justo después de `condiciones_servicio: z.string().optional(),` agregar:

```javascript
  ocultar_precios_items: z.boolean().optional(),
  desglose_comercial: z.string().optional(),
```

- [ ] **Step 2: Agregar a la interface `CotizacionInput`**

En `CotizacionService.ts`, en `CotizacionInput`, después de `condiciones_servicio?: string;` agregar:

```typescript
  ocultar_precios_items?: boolean;
  desglose_comercial?: string;
```

- [ ] **Step 3: Persistir en `createCotizacion`**

En el destructuring del create, cambiar:
```typescript
      precios_incluyen, comentarios, condiciones_servicio,
```
por:
```typescript
      precios_incluyen, comentarios, condiciones_servicio,
      ocultar_precios_items, desglose_comercial,
```

En el INSERT, cambiar la lista de columnas:
```typescript
            comentarios, precios_incluyen, condiciones_servicio)
```
por:
```typescript
            comentarios, precios_incluyen, condiciones_servicio,
            ocultar_precios_items, desglose_comercial)
```
cambiar el VALUES para que tenga **24** placeholders:
```typescript
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
```
y en el array de params, cambiar:
```typescript
          comentarios ?? null, precios_incluyen ?? null, condiciones_servicio ?? null,
```
por:
```typescript
          comentarios ?? null, precios_incluyen ?? null, condiciones_servicio ?? null,
          ocultar_precios_items ?? false, desglose_comercial ?? null,
```

- [ ] **Step 4: Persistir en `updateCotizacion`**

En el destructuring del update, cambiar:
```typescript
      precios_incluyen, comentarios, condiciones_servicio,
```
por:
```typescript
      precios_incluyen, comentarios, condiciones_servicio,
      ocultar_precios_items, desglose_comercial,
```

En el `UPDATE Cotizaciones SET`, localizar la línea `condiciones_servicio = ?,` y agregar justo después (antes de `fecha = COALESCE(?, fecha)`):
```typescript
           ocultar_precios_items = ?, desglose_comercial = ?,
```

En el array de params, localizar `condiciones_servicio ?? null,` y agregar justo después (antes de `fechaValida,`):
```typescript
          ocultar_precios_items ?? false, desglose_comercial ?? null,
```

- [ ] **Step 5: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/validators/cotizacion.schema.ts app/modules/comercial/CotizacionService.ts
git commit -m "feat(comercial): persistir ocultar_precios_items + desglose_comercial"
```

---

### Task 3: Form de cotización — checkbox + desglose + prefill + payload

**Files:**
- Modify: `public/js/pages/Comercial.js` (sección tras el IGV toggle ~545; bindForm prefill ~912; payload ~942)

- [ ] **Step 1: Agregar el bloque de presentación de costos tras el IGV toggle**

En `formNueva`, justo después del `</div>` que cierra el bloque `<!-- IGV toggle -->` (línea ~545) insertar:

```javascript
        <!-- Presentación de costos (modo consolidado) -->
        <div style="background:var(--bg-app);padding:9px;border-radius:4px">
          <label style="font-size:12px;font-weight:bold;display:flex;gap:8px;align-items:center">
            <input type="checkbox" name="ocultar_precios_items" id="ocultar-precios-${idp}"> Ocultar precios por ítem en el PDF
            ${tip('Para cuando el cliente pide solo un costo total: oculta P.Unit y Subtotal de cada ítem y muestra el bloque "CONDICIONES COMERCIALES" con el desglose + Total servicio. El total real (suma de ítems) no cambia.')}
          </label>
          <div style="margin-top:8px">
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Desglose comercial (una línea "Concepto: monto") — solo aplica si ocultas precios</label>
            <div class="multiline-field" data-field="desglose_comercial" data-idp="${idp}">
              <input type="hidden" name="desglose_comercial">
              <div class="multiline-lines"></div>
              <button type="button" class="multiline-add" data-placeholder="Materiales: 3970.50"
                style="margin-top:4px;font-size:11px;padding:4px 10px;background:transparent;border:1px dashed var(--border-light);border-radius:6px;cursor:pointer;color:var(--text-secondary)">+ Agregar línea</button>
            </div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:3px">Ej.: "Materiales: 3970.50", "Fabricación y mano de obra: 2550.00", "Utilidad: 2608.20". El TOTAL SERVICIO se calcula solo (= total de la cotización).</div>
          </div>
        </div>
```

(`setupMultilineHandlers(form)` —que ya se llama en bindForm— inicializa automáticamente este nuevo `.multiline-field`.)

- [ ] **Step 2: Prefill en modo edición**

En `bindForm`, dentro del bloque `if (editData && form) {`, después de `setVal('condiciones_servicio', editData.condiciones_servicio);` agregar:

```javascript
    prefillML('desglose_comercial', editData.desglose_comercial);
    const chkOcultar = el(`ocultar-precios-${idp}`);
    if (chkOcultar) chkOcultar.checked = !!editData.ocultar_precios_items;
```

- [ ] **Step 3: Incluir en el payload del submit**

En el objeto `payload` del `form.onsubmit`, después de `condiciones_servicio: f.condiciones_servicio.value || undefined,` agregar:

```javascript
          ocultar_precios_items: f.ocultar_precios_items.checked,
          desglose_comercial: f.desglose_comercial.value || undefined,
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check public/js/pages/Comercial.js`
Expected: sin salida (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Comercial.js
git commit -m "feat(comercial): checkbox ocultar precios + desglose comercial en form"
```

---

### Task 4: PDF — geometría condicional + ocultar precios + bloque CONDICIONES COMERCIALES

**Files:**
- Modify: `app/modules/comercial/CotizacionPDFService.ts` (columnas ~226-231; header ~250-255; row ~341-344; totales+SON ~360-387; tras el bloque condiciones_servicio)

- [ ] **Step 1: Hacer la geometría de columnas condicional**

Reemplazar el bloque de consts de columnas (las 6 líneas `const cIT = L, ...` hasta `const cST = L + 386, ...`) por:

```typescript
    const ocultarPrecios = !!cot.ocultar_precios_items;
    // Geometría de columnas. En modo "ocultar precios" se ensancha Descripción
    // (absorbe el espacio de P.Unit/Subtotal); la foto queda en la columna derecha.
    const cIT = L,                              wIT = 28;
    const cDE = L + 28,                         wDE = ocultarPrecios ? 275 : 205;
    const cUN = ocultarPrecios ? L + 303 : L + 233, wUN = 38;
    const cCA = ocultarPrecios ? L + 341 : L + 271, wCA = 45;
    const cPU = L + 316,                        wPU = 70;            // solo si NO se ocultan precios
    const cST = L + 386,                        wST = R - (L + 386); // 109pt — columna de foto (y subtotal)
```

- [ ] **Step 2: No dibujar las etiquetas P.Unit/Subtotal en el header cuando se ocultan precios**

En `drawTableHeader`, envolver las 4 líneas de etiquetas de precio (las que dibujan 'Precio Unit.', `curSym`, 'Sub Total', `curSym` con `hY1`/`hY2`) en un guard:

```typescript
      if (!ocultarPrecios) {
        const hY1 = y + 5, hY2 = y + 18;
        doc.text('Precio Unit.', cPU, hY1, { width: wPU - 4, align: 'right' });
        doc.text(curSym,         cPU, hY2, { width: wPU - 4, align: 'right' });
        doc.text('Sub Total',    cST, hY1, { width: wST - 4, align: 'right' });
        doc.text(curSym,         cST, hY2, { width: wST - 4, align: 'right' });
      }
```

(Las etiquetas 'Unidad' y 'Cantidad' quedan igual, pero ahora usan los `cUN`/`cCA` condicionales.)

- [ ] **Step 3: No dibujar pu/sub por ítem cuando se ocultan precios**

En el loop de ítems, envolver las dos llamadas `doc.text(...)` que dibujan `pu` (en `cPU`) y `sub` (en `cST`) en:

```typescript
      if (!ocultarPrecios) {
        doc.text(pu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                               cPU, y, { width: wPU, align: 'right' });
        doc.text(sub.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                               cST, y, { width: wST, align: 'right' });
      }
```

(La foto sigue dibujándose en `cST` —sin cambios— y 'UND.'/cantidad en `cUN`/`cCA`.)

- [ ] **Step 4: Omitir el bloque de totales + "SON" cuando se ocultan precios**

Envolver TODO el bloque que va desde `// ── Totales (derecha) ──` hasta el final del bloque "SON: ..." (la línea que dibuja `SON: ${letras} ...` y su `y += 26;`) en:

```typescript
    if (!ocultarPrecios) {
      // ... (todo el bloque de totales existente: tot(), SUB TOTAL, IGV, Total, línea, "SON: ...")
    }
```

(No mover ni cambiar el contenido interno; solo envolverlo en el `if`. `subtotalOrig` se sigue acumulando en el loop, no afecta.)

- [ ] **Step 5: Renderizar CONDICIONES COMERCIALES tras el bloque condiciones_servicio**

Justo DESPUÉS del bloque de `condiciones_servicio` (Entrega 1, el que termina con `y += 10; }`) y ANTES de `// ── Condiciones generales ──`, insertar:

```typescript
    // ── Condiciones comerciales (modo costo consolidado) ──
    if (ocultarPrecios) {
      ensureSpace(60);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      doc.text('CONDICIONES COMERCIALES:', L, y); y += 16;
      const LBL_W = pageW - 110; // etiqueta a la izquierda, monto a la derecha (110pt)
      const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const desg = String(cot.desglose_comercial || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (const linea of desg) {
        const idx = linea.lastIndexOf(':');
        const concepto = idx >= 0 ? linea.slice(0, idx).trim() : linea;
        const montoRaw = idx >= 0 ? linea.slice(idx + 1).trim() : '';
        const montoNum = parseFloat(montoRaw.replace(/[^0-9.]/g, ''));
        doc.font('Helvetica').fontSize(9.5).fillColor('#000');
        const h = doc.heightOfString(concepto, { width: LBL_W });
        ensureSpace(h + 3);
        doc.text(concepto, L, y, { width: LBL_W });
        if (!isNaN(montoNum)) {
          doc.text(fmtNum(montoNum), L + LBL_W, y, { width: 110, align: 'right' });
        } else if (montoRaw) {
          doc.text(montoRaw, L + LBL_W, y, { width: 110, align: 'right' });
        }
        y += h + 3;
      }
      // Línea + TOTAL SERVICIO = total real de la cotización (en moneda original)
      const totalOrigCom = esUSD ? Number(cot.total) / tc : Number(cot.total);
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor('#000').stroke(); y += 5;
      ensureSpace(18);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      doc.text(`TOTAL SERVICIO (${curSym})`, L, y, { width: LBL_W });
      doc.text(fmtNum(totalOrigCom), L + LBL_W, y, { width: 110, align: 'right' });
      y += 22;
    }
```

- [ ] **Step 6: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/modules/comercial/CotizacionPDFService.ts
git commit -m "feat(comercial): PDF modo costo consolidado (ocultar precios + CONDICIONES COMERCIALES)"
```

---

### Task 5: Cache buster

**Files:**
- Modify: `public/js/app.js`, `public/index.html` (+ import api.js en `Comercial.js` si lo tiene)

- [ ] **Step 1: Detectar el sufijo vigente**

Run: `grep -o "?v=[0-9a-z]*" public/js/app.js | head -1`
Expected: imprime el sufijo actual (VIEJO).

- [ ] **Step 2: Definir el nuevo**

NUEVO = `?v=20260627r3` (si el VIEJO ya es `20260627rN`, usar `r(N+1)`).

- [ ] **Step 3: Reemplazar global**

Find/Replace del VIEJO por el NUEVO en `public/js/app.js`, `public/index.html`, y si `public/js/pages/Comercial.js` línea 1 importa `api.js?v=...`, bumpear ahí también.

Run: `grep -rn "VIEJO" public/js public/index.html` (sustituir VIEJO por el valor real)
Expected: sin resultados.

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js public/index.html public/js/pages/Comercial.js
git commit -m "chore: bump cache buster (formato cotizacion entrega 2)"
```

---

### Task 6: Verificación manual end-to-end

Requiere la mig 080 aplicada a Supabase (la aplica el controlador con OK de Julio).

- [ ] **Step 1: Levantar el server local**

Mostrar a Julio el comando para copiar (no ejecutar): `npm run dev`

- [ ] **Step 2: Cotización con precios por ítem (modo normal — regresión)**

Crear/ver una cotización con el checkbox APAGADO.
Expected: el PDF se ve igual que antes (columnas P.Unit/Subtotal, totales, SON). Nada cambió.

- [ ] **Step 3: Cotización en modo consolidado**

Nueva cotización (METAL) con ítems con precio → marcar "Ocultar precios por ítem en el PDF" → agregar líneas de desglose ("Materiales: 3970.50", "Fabricación y mano de obra: 2550.00", "Utilidad: 2608.20") → generar.
Expected en el PDF: (a) la tabla de ítems NO muestra P.Unit ni Subtotal y la Descripción se ve más ancha; (b) NO aparece el bloque de totales ni "SON:"; (c) aparece "CONDICIONES COMERCIALES:" con las líneas del desglose (monto a la derecha) y "TOTAL SERVICIO (S/)" = total real de la cotización (suma de ítems).

- [ ] **Step 4: Total real intacto (Finanzas)**

Confirmar que la cotización mantiene su total real en la lista de Comercial / Finanzas (el modo consolidado es solo presentación del PDF; el total no cambió).

- [ ] **Step 5: Edición**

Editar una cotización EN_PROCESO: alternar el checkbox y cambiar el desglose → guardar → re-generar PDF.
Expected: el cambio persiste y el PDF refleja el modo elegido.

- [ ] **Step 6: Fotos en modo consolidado**

Una cotización con foto en ítems + modo consolidado.
Expected: las fotos siguen apareciendo en la columna derecha; no se encima nada.

---

## Self-Review (cobertura del spec — Entrega 2)

- `ocultar_precios_items` (boolean) + `desglose_comercial` (texto) en Cotizaciones → Task 1 + Task 2. ✓
- Form: checkbox "ocultar precios" + desglose multilínea + prefill (edición) + payload → Task 3. ✓
- PDF: oculta P.Unit/Subtotal por ítem + ensancha Descripción + foto intacta → Task 4 Steps 1-3. ✓
- PDF: omite totales/SON en modo consolidado → Task 4 Step 4. ✓
- PDF: bloque CONDICIONES COMERCIALES (desglose + TOTAL SERVICIO = total real) → Task 4 Step 5. ✓
- Arquitectura 1: total nunca cambia de fuente (suma de ítems) → no se toca `calcularTotales`; TOTAL SERVICIO lee `cot.total`. ✓
- Todo opcional (default checkbox false; desglose vacío permitido) → Task 1 (DEFAULT 0) + campos `.optional()`. ✓
- Regresión modo normal: todo el comportamiento de precios va dentro de `if (!ocultarPrecios)` / `if (ocultarPrecios)` → modo normal idéntico. ✓
- Migración a Supabase por MCP (controlador, con OK) → Task 1 nota. ✓
- Cache buster + tsc → Task 5 + tsc en Tasks 2/4. ✓
- Limitación anotada: no editable en el modal de edición segura (`editarMetadata`) — fuera de alcance de esta entrega.

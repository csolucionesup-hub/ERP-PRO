# Cotización formato completo — Entrega 1 (condiciones libres + encabezados) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la cotización un campo libre de "condiciones del servicio" (soldadura/calidad/garantía/responsabilidades/exclusiones) con default reutilizable por marca, que se imprime debajo de los ítems en el PDF, más el título "PROPUESTA TÉCNICA" y el encabezado "CONDICIONES DE PAGO".

**Architecture:** Un campo `condiciones_servicio TEXT` en `Cotizaciones` (opcional) + un default `condiciones_servicio_default TEXT` por marca en `ConfiguracionMarca`. El form lo auto-rellena con el default de la marca en cotización nueva; en el PDF se renderiza con un parser simple (`:` → título, `-` → viñeta, resto → párrafo). Sin tocar cálculo de totales ni Finanzas.

**Tech Stack:** Node/TypeScript (Express, Zod 4, mysql2-adapter→Postgres), frontend Vanilla JS, PDFKit (CotizacionPDFService). Migraciones a Supabase por MCP `apply_migration`.

---

## Contexto del código (leer antes de empezar)

- **Cotización model/IO:** `app/modules/comercial/CotizacionService.ts` — interface `CotizacionInput` (línea ~40), `createCotizacion` (INSERT línea ~821-837), `updateCotizacion` (UPDATE línea ~969-987), `editarMetadata` (FIELDS línea ~1169-1173).
- **Validación:** `app/validators/cotizacion.schema.ts` — `baseCotizacion` (línea ~13-39).
- **Config por marca:** `app/modules/comercial/ConfiguracionMarcaService.ts` — interface `ConfiguracionMarca` (línea ~5-25), `CAMPOS_EDITABLES` (línea ~29-34).
- **UI config marca:** `public/js/pages/ConfiguracionComercial.js` — `renderHTML` (campos línea ~74-132), `guardar` lee SOLO `input[name]` (línea ~145).
- **Form cotización:** `public/js/pages/Comercial.js` — sección "Condiciones Generales" (línea ~547-601), `bindForm` prefill editData (línea ~891-916) y payload submit (línea ~925-946); `formNueva(marca, tcHoy, opts)` (línea ~444) devuelve HTML SINCRÓNICO (no puede await); modal de edición segura (línea ~1860-1935) usa `editarMetadata`.
- **PDF:** `app/modules/comercial/CotizacionPDFService.ts` — saludo (línea ~217-218), tabla de ítems empieza después, sección "CONDICIONES GENERALES" (línea ~384-430), helpers `condLine`/`condPar`/`formatMultiline`, `ensureSpace`. `forma_pago` se imprime en línea ~425.
- **api.js:** `api.configuracionMarca.getByMarca(marca)` (línea ~295) ya devuelve la config completa de la marca → sirve para prefill del default.
- **Reglas:** sin `alert()` (usar `showSuccess`/`showError`); modales no cierran por backdrop; `npx tsc --noEmit` antes de pushear; cache buster `?v=` global (gotcha #36).

## File Structure

- **Create:** `database/migrations/079_cotizacion_condiciones_servicio.sql` — DDL (tracking en repo).
- **Modify:** `app/validators/cotizacion.schema.ts` — campo Zod.
- **Modify:** `app/modules/comercial/CotizacionService.ts` — interface + create + update + editarMetadata.
- **Modify:** `app/modules/comercial/ConfiguracionMarcaService.ts` — interface + CAMPOS_EDITABLES.
- **Modify:** `public/js/pages/ConfiguracionComercial.js` — textarea default + fix guardar (leer textareas).
- **Modify:** `public/js/pages/Comercial.js` — textarea en form + prefill (default/editData) + payload + modal edición segura.
- **Modify:** `app/modules/comercial/CotizacionPDFService.ts` — título PROPUESTA TÉCNICA + bloque condiciones_servicio + encabezado CONDICIONES DE PAGO.
- **Modify:** `public/js/app.js` + `public/index.html` — cache buster.

---

### Task 1: Migración — columnas nuevas

**Files:**
- Create: `database/migrations/079_cotizacion_condiciones_servicio.sql`

- [ ] **Step 1: Crear el archivo de migración (sintaxis MySQL, para tracking en repo)**

```sql
-- 079_cotizacion_condiciones_servicio.sql
-- Entrega 1 formato cotización: condiciones del servicio (texto libre) por cotización
-- + default reutilizable por marca.

ALTER TABLE Cotizaciones
  ADD COLUMN condiciones_servicio TEXT NULL AFTER precios_incluyen;

ALTER TABLE ConfiguracionMarca
  ADD COLUMN condiciones_servicio_default TEXT NULL;
```

- [ ] **Step 2: Aplicar a Supabase (Postgres) vía MCP — PEDIR OK A JULIO ANTES**

Ejecutar con la tool MCP `apply_migration` (name: `079_cotizacion_condiciones_servicio`):

```sql
ALTER TABLE "Cotizaciones"  ADD COLUMN IF NOT EXISTS condiciones_servicio TEXT;
ALTER TABLE "ConfiguracionMarca" ADD COLUMN IF NOT EXISTS condiciones_servicio_default TEXT;
```

Verificación: tras aplicar, `SELECT condiciones_servicio FROM "Cotizaciones" LIMIT 1;` no debe dar error de columna inexistente.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/079_cotizacion_condiciones_servicio.sql
git commit -m "feat(db): mig 079 condiciones_servicio en Cotizaciones + default por marca"
```

---

### Task 2: Backend — schema Zod + CotizacionService

**Files:**
- Modify: `app/validators/cotizacion.schema.ts:30` (dentro de `baseCotizacion`)
- Modify: `app/modules/comercial/CotizacionService.ts` (interface ~54, create ~789/826/835, update ~941/974/983, editarMetadata ~1154/1172)

- [ ] **Step 1: Agregar el campo al schema Zod**

En `cotizacion.schema.ts`, dentro de `baseCotizacion`, justo después de `comentarios: z.string().optional(),` (línea ~30) agregar:

```javascript
  condiciones_servicio: z.string().optional(),
```

- [ ] **Step 2: Agregar a la interface `CotizacionInput`**

En `CotizacionService.ts`, después de `comentarios?: string;` (línea ~54) agregar:

```typescript
  condiciones_servicio?: string;
```

- [ ] **Step 3: Persistir en `createCotizacion`**

En el destructuring (línea ~789) cambiar:

```typescript
      precios_incluyen, comentarios,
```
por:
```typescript
      precios_incluyen, comentarios, condiciones_servicio,
```

En el INSERT, cambiar la lista de columnas (línea ~826):
```typescript
            comentarios, precios_incluyen)
```
por:
```typescript
            comentarios, precios_incluyen, condiciones_servicio)
```
agregar un `?` al VALUES (línea ~827) — debe quedar con 22 placeholders:
```typescript
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
```
y en el array de params (línea ~835) cambiar:
```typescript
          comentarios ?? null, precios_incluyen ?? null,
```
por:
```typescript
          comentarios ?? null, precios_incluyen ?? null, condiciones_servicio ?? null,
```

- [ ] **Step 4: Persistir en `updateCotizacion`**

En el destructuring (línea ~941) cambiar:
```typescript
      precios_incluyen, comentarios,
```
por:
```typescript
      precios_incluyen, comentarios, condiciones_servicio,
```

En el `UPDATE Cotizaciones SET` (línea ~974) cambiar:
```typescript
           lugar_entrega = ?, lugar_trabajo = ?, comentarios = ?, precios_incluyen = ?,
```
por:
```typescript
           lugar_entrega = ?, lugar_trabajo = ?, comentarios = ?, precios_incluyen = ?,
           condiciones_servicio = ?,
```

y en el array de params (línea ~983) cambiar:
```typescript
          comentarios ?? null, precios_incluyen ?? null,
```
por:
```typescript
          comentarios ?? null, precios_incluyen ?? null, condiciones_servicio ?? null,
```

(El `condiciones_servicio = ?` se ubica ANTES de `fecha = COALESCE(?, fecha)`, así que el orden del array queda: …precios_incluyen, condiciones_servicio, fechaValida, id. Verificar que `fechaValida` y `id` siguen al final.)

- [ ] **Step 5: Permitir editar `condiciones_servicio` en `editarMetadata`**

En `editarMetadata`, en el tipo del parámetro `data` (línea ~1154) después de `comentarios?: string;` agregar:
```typescript
    condiciones_servicio?: string;
```
y en el array `FIELDS` (línea ~1172) cambiar:
```typescript
        'nro_oc_cliente', 'nro_factura', 'comentarios',
```
por:
```typescript
        'nro_oc_cliente', 'nro_factura', 'comentarios', 'condiciones_servicio',
```

- [ ] **Step 6: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/validators/cotizacion.schema.ts app/modules/comercial/CotizacionService.ts
git commit -m "feat(comercial): persistir condiciones_servicio en cotizacion (create/update/metadata)"
```

---

### Task 3: Backend — ConfiguracionMarcaService (default por marca)

**Files:**
- Modify: `app/modules/comercial/ConfiguracionMarcaService.ts:24` (interface) y `:34` (CAMPOS_EDITABLES)

- [ ] **Step 1: Agregar el campo a la interface**

En `ConfiguracionMarca`, después de `logo_public_id: string | null;` (línea ~24) agregar:

```typescript
  condiciones_servicio_default: string | null;
```

- [ ] **Step 2: Hacerlo editable**

En `CAMPOS_EDITABLES` (línea ~33), después de `'firma_nombre', 'firma_cargo', 'firma_telefono', 'firma_email', 'firma_direccion',` agregar en la línea siguiente (antes del `] as const;`):

```typescript
  'condiciones_servicio_default',
```

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/modules/comercial/ConfiguracionMarcaService.ts
git commit -m "feat(comercial): condiciones_servicio_default editable por marca"
```

---

### Task 4: UI Configuración PDF — textarea del default + fix guardar

**Files:**
- Modify: `public/js/pages/ConfiguracionComercial.js` (sección nueva ~después de línea 121; `guardar` línea ~145)

- [ ] **Step 1: Agregar la sección del default antes del bloque de botones**

En `renderHTML`, justo después de la `</section>` de "Firma del responsable comercial" (línea ~121) y antes del `<div ...>Cancelar/Guardar`, insertar:

```javascript
        <section style="background:#f8f9fa;padding:14px 16px;border-radius:6px;margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase">Condiciones del servicio — texto por defecto</div>
          <p style="margin:0 0 8px;color:#666;font-size:12px">
            Se auto-rellena en cada cotización nueva de esta marca (lo podés editar por cotización).
            Formato: línea que termina en <b>:</b> = título en negrita · línea que empieza con <b>-</b> = viñeta · el resto = párrafo.
          </p>
          <textarea name="condiciones_servicio_default" rows="10"
            placeholder="Servicio de soldadura:&#10;La soldadura será ejecutada por soldadores calificados según AWS D1.1.&#10;- Se habilitará un proceso de soldadura FCAW...&#10;Garantía:&#10;- La estructura instalada tendrá una garantía de 6 meses..."
            style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:4px;font-size:13px;font-family:inherit;resize:vertical">${escapeHtml(c.condiciones_servicio_default || '')}</textarea>
        </section>
```

- [ ] **Step 2: Hacer que `guardar` lea también los textareas**

En `guardar` (línea ~145) cambiar:
```javascript
    for (const el of ev.target.querySelectorAll('input[name]')) {
```
por:
```javascript
    for (const el of ev.target.querySelectorAll('input[name], textarea[name]')) {
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check public/js/pages/ConfiguracionComercial.js`
Expected: sin salida (exit 0).

- [ ] **Step 4: Commit**

```bash
git add public/js/pages/ConfiguracionComercial.js
git commit -m "feat(comercial): editar condiciones_servicio_default en Configuracion PDF"
```

---

### Task 5: Form de cotización — textarea + prefill + payload

**Files:**
- Modify: `public/js/pages/Comercial.js` (sección condiciones ~590, bindForm prefill ~912, payload ~942, helper de default)

- [ ] **Step 1: Agregar el textarea en la sección "Condiciones Generales"**

En `formNueva`, dentro del `<div ...>Condiciones Generales`, después del `</div>` que cierra el grid de campos (después de "Lugar de Trabajo de Inspección", antes del `</div>` que cierra la sección, línea ~591) insertar:

```javascript
          <div style="margin-top:10px">
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Condiciones del servicio (propuesta técnica) — aparece en el PDF</label>
            <textarea name="condiciones_servicio" rows="8"
              placeholder="Servicio de soldadura:&#10;La soldadura será ejecutada por soldadores calificados según AWS D1.1.&#10;- Se habilitará un proceso de soldadura FCAW...&#10;Garantía:&#10;- Garantía de 6 meses..."
              style="width:100%;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px;font-family:inherit;resize:vertical"></textarea>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:3px">Formato: línea que termina en ":" = título · línea que empieza con "-" = viñeta · el resto = párrafo. Opcional.</div>
          </div>
```

- [ ] **Step 2: Prefill en modo edición**

En `bindForm`, dentro del bloque `if (editData && form) {` después de `setVal('comentarios', editData.comentarios);` (línea ~912) agregar:

```javascript
    setVal('condiciones_servicio', editData.condiciones_servicio);
```

- [ ] **Step 3: Prefill del default en modo NUEVA (fetch async tras render)**

En `bindForm`, después del cierre del bloque `if (editData && form) { ... }` (línea ~916) agregar:

```javascript
  // Cotización NUEVA: auto-rellenar condiciones_servicio con el default de la marca.
  // formNueva es síncrono (no puede await); lo cargamos acá tras el render.
  if (!editData && form) {
    const ta = form.querySelector('[name="condiciones_servicio"]');
    if (ta && !ta.value) {
      api.configuracionMarca.getByMarca(marca)
        .then(cfg => { if (ta && !ta.value && cfg?.condiciones_servicio_default) ta.value = cfg.condiciones_servicio_default; })
        .catch(() => { /* sin default: queda vacío, no bloquea */ });
    }
  }
```

- [ ] **Step 4: Incluir en el payload del submit**

En el objeto `payload` del `form.onsubmit`, después de `comentarios: f.comentarios.value || undefined,` (línea ~942) agregar:

```javascript
          condiciones_servicio: f.condiciones_servicio.value || undefined,
```

- [ ] **Step 5: Verificar sintaxis**

Run: `node --check public/js/pages/Comercial.js`
Expected: sin salida (exit 0).

- [ ] **Step 6: Commit**

```bash
git add public/js/pages/Comercial.js
git commit -m "feat(comercial): textarea condiciones_servicio en form + prefill default/edit"
```

---

### Task 6: Modal de edición segura — agregar condiciones_servicio

**Files:**
- Modify: `public/js/pages/Comercial.js` (modal de edición segura ~1895-1930)

- [ ] **Step 1: Localizar el modal y leer su estructura**

El modal de edición segura tiene campos `#ec-fp` (forma_pago), `#ec-val`, `#ec-plazo`, `#ec-com` (comentarios) y construye el payload con `g('#ec-...')` que va a `api.cotizaciones.editarMetadata`. Leer las líneas ~1895-1930 para ubicar el `<textarea id="ec-com">` (comentarios) y el objeto payload.

- [ ] **Step 2: Agregar el textarea al HTML del modal**

Justo después del bloque del textarea de comentarios (`<textarea id="ec-com" ...>`, línea ~1900) agregar un nuevo campo:

```javascript
            <div style="margin-top:10px">
              <label style="font-size:12px;color:#555;display:block;margin-bottom:3px">Condiciones del servicio (PDF)</label>
              <textarea id="ec-cond" rows="8" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;resize:vertical;font-family:inherit">${v(cot.condiciones_servicio || '')}</textarea>
            </div>
```

- [ ] **Step 3: Incluir en el payload de `editarMetadata`**

En el objeto payload del guardar de ese modal, después de `comentarios: g('#ec-com'),` (línea ~1928) agregar:

```javascript
            condiciones_servicio: g('#ec-cond'),
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check public/js/pages/Comercial.js`
Expected: sin salida (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Comercial.js
git commit -m "feat(comercial): editar condiciones_servicio en modal de edicion segura"
```

---

### Task 7: PDF — título PROPUESTA TÉCNICA + bloque condiciones + CONDICIONES DE PAGO

**Files:**
- Modify: `app/modules/comercial/CotizacionPDFService.ts` (saludo ~218, condiciones ~422-429)

- [ ] **Step 1: Agregar el título "PROPUESTA TÉCNICA" sobre la tabla de ítems**

Después de la línea del saludo `doc.text('En atención a su solicitud, nos es grato cotizarle:', L, y); y += 24;` (línea ~218) insertar:

```typescript
    // Título de la sección técnica (formato solicitado por clientes)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
      .text('PROPUESTA TÉCNICA', L, y, { width: pageW, align: 'center' });
    y += 18;
```

- [ ] **Step 2: Renderizar el bloque `condiciones_servicio` antes de CONDICIONES GENERALES**

Justo ANTES de la línea `// ── Condiciones generales ───` y su `ensureSpace(140)` (línea ~384), insertar el bloque. Usa las variables ya existentes en scope (`doc`, `L`, `y`, `pageW`, `ensureSpace`):

```typescript
    // ── Condiciones del servicio (texto libre, formato ":"=título, "-"=viñeta) ──
    if (cot.condiciones_servicio && String(cot.condiciones_servicio).trim()) {
      ensureSpace(40);
      const rawLines = String(cot.condiciones_servicio).split('\n');
      for (const raw of rawLines) {
        const line = raw.trim();
        if (!line) { y += 4; continue; }
        if (line.endsWith(':')) {
          // Título en negrita
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
          const h = doc.heightOfString(line, { width: pageW });
          ensureSpace(h + 4);
          doc.text(line, L, y, { width: pageW });
          y += h + 4;
        } else if (line.startsWith('-') || line.startsWith('•')) {
          // Viñeta indentada
          const txt = '• ' + line.replace(/^[-•]\s*/, '');
          doc.font('Helvetica').fontSize(9.5).fillColor('#000');
          const h = doc.heightOfString(txt, { width: pageW - 14 });
          ensureSpace(h + 3);
          doc.text(txt, L + 14, y, { width: pageW - 14 });
          y += h + 3;
        } else {
          // Párrafo normal
          doc.font('Helvetica').fontSize(9.5).fillColor('#000');
          const h = doc.heightOfString(line, { width: pageW });
          ensureSpace(h + 3);
          doc.text(line, L, y, { width: pageW });
          y += h + 3;
        }
      }
      y += 10;
    }
```

- [ ] **Step 3: Imprimir forma_pago bajo el encabezado "CONDICIONES DE PAGO"**

En la sección de condiciones generales, cambiar la línea (línea ~425):
```typescript
    condPar('Forma de Pago:',        formatMultiline(cot.forma_pago));
```
por:
```typescript
    if (cot.forma_pago) {
      y += 6;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      ensureSpace(16);
      doc.text('CONDICIONES DE PAGO:', L, y); y += 14;
      condLine(formatMultiline(cot.forma_pago));
    }
```

(Se mueve la forma de pago a su propio encabezado; el resto de condiciones —validez, plazo, lugares— quedan igual arriba.)

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/modules/comercial/CotizacionPDFService.ts
git commit -m "feat(comercial): PDF con PROPUESTA TECNICA + condiciones_servicio + CONDICIONES DE PAGO"
```

---

### Task 8: Cache buster

**Files:**
- Modify: `public/js/app.js`, `public/index.html`

- [ ] **Step 1: Detectar el sufijo vigente**

Run: `grep -o "?v=[0-9a-z]*" public/js/app.js | head -1`
Expected: imprime el sufijo actual (VIEJO), p. ej. `?v=20260627r1`.

- [ ] **Step 2: Definir el nuevo**

NUEVO = `?v=20260627r2` (si el VIEJO ya es `20260627rN`, usar `r(N+1)`; si es de otra fecha, usar `20260627r1`).

- [ ] **Step 3: Reemplazar en app.js, index.html y el import de api.js en los archivos tocados**

Find/Replace global del VIEJO por el NUEVO en `public/js/app.js` y `public/index.html`. Además, si `Comercial.js` o `ConfiguracionComercial.js` importan `api.js?v=...` en su línea 1, bumpear ese sufijo también.

Run: `grep -rn "VIEJO" public/js public/index.html` (sustituir VIEJO por el valor real)
Expected: sin resultados (0 ocurrencias del viejo).

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js public/index.html public/js/pages/Comercial.js public/js/pages/ConfiguracionComercial.js
git commit -m "chore: bump cache buster (formato cotizacion entrega 1)"
```

---

### Task 9: Verificación manual end-to-end

Sin test harness de frontend; se verifica en el navegador (local o prod tras deploy). Requiere haber aplicado la mig 079 a Supabase (Task 1 Step 2).

- [ ] **Step 1: Levantar el server local**

Mostrar a Julio el comando para copiar (no ejecutarlo automáticamente): `npm run dev`

- [ ] **Step 2: Guardar el default por marca**

Comercial → Configuración PDF → pestaña METAL → pegar texto de condiciones en "Condiciones del servicio — texto por defecto" → Guardar.
Expected: toast "Configuración METAL guardada". Recargar y confirmar que el texto persiste.

- [ ] **Step 3: Cotización nueva auto-rellena**

Comercial → Nueva cotización (METAL). El textarea "Condiciones del servicio" debe aparecer pre-rellenado con el default. Editarlo si se quiere, agregar 1 ítem, generar.
Expected: se guarda sin error (con o sin texto).

- [ ] **Step 4: PDF correcto**

Ver el PDF de esa cotización.
Expected: (a) título "PROPUESTA TÉCNICA" sobre los ítems; (b) el bloque de condiciones debajo de los totales, con títulos en negrita (líneas con ":") y viñetas (líneas con "-"); (c) "CONDICIONES DE PAGO:" como encabezado propio con la forma de pago.

- [ ] **Step 5: Edición**

Editar una cotización EN_PROCESO (form completo) y una en otro estado (modal de edición segura): cambiar el texto de condiciones y guardar.
Expected: el cambio persiste y se refleja en el PDF.

- [ ] **Step 6: No obligatorio**

Crear una cotización dejando el campo de condiciones vacío.
Expected: guarda sin problema; el PDF simplemente no muestra el bloque de condiciones.

---

## Self-Review (cobertura del spec — Entrega 1)

- `condiciones_servicio` en Cotizaciones (opcional) → Task 1 + Task 2. ✓
- `condiciones_servicio_default` por marca → Task 1 + Task 3 + Task 4. ✓
- Form: textarea + ayuda de formato + prefill default (nueva) / editData (edición) + payload → Task 5. ✓
- Editable en modal de edición segura (editarMetadata) → Task 2 Step 5 + Task 6. ✓
- PDF: título PROPUESTA TÉCNICA → Task 7 Step 1. ✓
- PDF: bloque condiciones (":"/"-"/párrafo) debajo de totales, antes de CONDICIONES GENERALES → Task 7 Step 2. ✓
- PDF: encabezado CONDICIONES DE PAGO → Task 7 Step 3. ✓
- No obligatorio (solo cliente + 1 ítem siguen siendo requeridos) → no se toca la validación de requeridos; el campo es `.optional()`. ✓
- Migración a Supabase por MCP → Task 1 Step 2. ✓
- Cache buster + tsc → Task 8 + tsc en Tasks 2/3/7. ✓
- Convenciones (sin alert, showSuccess/showError, no backdrop-close) → respetadas (no se agregan modales nuevos ni alerts). ✓
- Fuera de alcance: Entrega 2 (ocultar precios + desglose comercial) NO está en este plan — correcto, es su propio plan.

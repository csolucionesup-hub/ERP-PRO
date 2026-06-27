# Adjuntar factura de venta (PDF de SUNAT) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir, ver y descargar el PDF de la factura emitida en SUNAT, atado a cada cotización/cobranza, dentro del módulo Finanzas.

**Architecture:** Cero backend nuevo y cero migración. Se reusa el sistema genérico de adjuntos (`AdjuntosService` + endpoints `/api/adjuntos/...` ya autorizados para FINANZAS) con un `ref_tipo='FacturaVenta'` y `ref_id=id_cotizacion`. Todo el cambio vive en el frontend (`public/js/pages/Finanzas.js`), replicando el patrón ya probado de las constancias de pago.

**Tech Stack:** Vanilla JS (frontend), `api.adjuntos` (api.js), Cloudinary vía backend existente. No hay framework de tests de frontend en este repo — la verificación es manual vía el navegador/preview.

---

## Contexto del código (leer antes de empezar)

- `api.adjuntos` ya existe ([public/js/services/api.js:254](../../../public/js/services/api.js)): `listar(refTipo, refId)`, `subir(refTipo, refId, file)`, `eliminar(id)`, `archivoUrl(id)`.
- `previewAdjunto(url, titulo)` ([Finanzas.js:87](../../../public/js/pages/Finanzas.js)) abre PDF/imagen inline. Se le pasa `api.adjuntos.archivoUrl(id)`.
- `pintarAdjCobranza(idCobranza)` ([Finanzas.js:2038](../../../public/js/pages/Finanzas.js)) es el patrón EXACTO a copiar para la factura (lista + 👁 ver + ✕ quitar + 📎 subir).
- `modalFacturar(cot)` ([Finanzas.js:1832](../../../public/js/pages/Finanzas.js)) devuelve `{nro_factura, fecha_factura}` y NO tiene input de archivo.
- El botón `#btn-facturar` ([Finanzas.js:2116](../../../public/js/pages/Finanzas.js)) llama a `modalFacturar(c)` → `api.cobranzas.facturar(c.id_cotizacion, data)`.
- El bloque de facturación (estado FACTURADA/COBRADA) muestra "Factura: … · Fecha: …" en [Finanzas.js:1969](../../../public/js/pages/Finanzas.js). Ahí va el cajón del PDF.
- `escapeHtml` / `escapeAttr` / `showSuccess` / `showError` ya están importados en el archivo.

## File Structure

- **Modify:** `public/js/pages/Finanzas.js` — único archivo de lógica. Tres cambios: (1) helper `subirFacturaVentaUnica`, (2) input de archivo en `modalFacturar` + upload en el handler de `#btn-facturar`, (3) cajón de PDF de factura en `modalDetalle` con `pintarFacturaVenta`.
- **Modify:** `public/js/app.js` — bump del cache buster `?v=` en todos los imports.
- **Modify:** `public/index.html` — bump del cache buster `?v=` del `<script>`.

No se crea ni modifica nada en backend, BD ni `api.js`.

---

### Task 1: Helper de subida única (1 factura por cotización)

**Files:**
- Modify: `public/js/pages/Finanzas.js` (agregar función cerca de `previewAdjunto`, ~línea 118)

- [ ] **Step 1: Agregar el helper `subirFacturaVentaUnica`**

Insertar justo después del cierre de `previewAdjunto` (después de la línea 118, antes del comentario `// ── Render fila de cotización ──`):

```javascript
// Sube el PDF de la factura de venta de una cotización, garantizando UNA sola
// factura: borra cualquier adjunto FacturaVenta previo antes de subir el nuevo.
// ref_tipo='FacturaVenta', ref_id=id_cotizacion. Lanza si el upload falla.
async function subirFacturaVentaUnica(idCotizacion, file) {
  let previos = [];
  try { previos = await api.adjuntos.listar('FacturaVenta', idCotizacion); }
  catch { previos = []; }
  for (const p of (previos || [])) {
    try { await api.adjuntos.eliminar(p.id); } catch { /* best-effort */ }
  }
  return api.adjuntos.subir('FacturaVenta', idCotizacion, file);
}
```

- [ ] **Step 2: Verificar que el archivo carga sin error de sintaxis**

Run (PowerShell, en la raíz del proyecto):
`node --check public/js/pages/Finanzas.js`
Expected: sin salida (exit 0). Si imprime un SyntaxError, corregir.

- [ ] **Step 3: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(finanzas): helper subirFacturaVentaUnica (1 factura/cotizacion)"
```

---

### Task 2: Input de archivo opcional en el modal "Registrar factura"

**Files:**
- Modify: `public/js/pages/Finanzas.js:1850-1872` (modal `modalFacturar`)

- [ ] **Step 1: Agregar el input de archivo al form**

Reemplazar el bloque del campo "Fecha de emisión" + el cierre del form (líneas 1850-1858 actuales) por:

```javascript
        <div style="margin-bottom:12px">
          <label style="font-size:11px;color:#6b7280;font-weight:600">Fecha de emisión</label>
          <input type="date" name="fecha_factura" value="${hoy}" required style="width:100%;padding:8px;font-size:13px;border:1px solid #d1d5db;border-radius:4px">
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:11px;color:#6b7280;font-weight:600">Factura PDF (opcional)</label>
          <input type="file" name="factura_file" accept=".pdf,image/*" style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
          <div style="font-size:10px;color:#9ca3af;margin-top:3px">Sube el PDF descargado de SUNAT. También puedes subirlo o reemplazarlo después.</div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" id="fac-cancel" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cancelar</button>
          <button type="submit" style="padding:8px 16px;background:${cfg.color};color:#fff;border:none;border-radius:4px;font-weight:600;cursor:pointer">Registrar factura</button>
        </div>
```

- [ ] **Step 2: Devolver el archivo en el submit**

Reemplazar el handler `onsubmit` (líneas 1865-1872 actuales) por:

```javascript
    box.querySelector('#form-fac').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const fileInput = e.target.querySelector('input[name="factura_file"]');
      const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      close({
        nro_factura:   String(fd.get('nro_factura')).trim(),
        fecha_factura: fd.get('fecha_factura'),
        file,
      });
    };
```

- [ ] **Step 3: Subir el PDF en el handler de `#btn-facturar`**

Reemplazar el handler de `btnFac` (líneas 2116-2125 actuales) por:

```javascript
  if (btnFac) btnFac.onclick = async () => {
    const data = await modalFacturar(c);
    if (!data) return;
    const file = data.file || null;
    try {
      await api.cobranzas.facturar(c.id_cotizacion, { nro_factura: data.nro_factura, fecha_factura: data.fecha_factura });
      if (file) {
        try {
          await subirFacturaVentaUnica(c.id_cotizacion, file);
          showSuccess('Cotización facturada y PDF adjuntado');
        } catch (upErr) {
          showError(`Factura registrada, pero no se pudo subir el PDF: ${upErr.message}. Puedes subirlo desde el detalle.`);
        }
      } else {
        showSuccess('Cotización facturada');
      }
      close();
      window.refreshModule?.();
    } catch (e) { showError(e.message); }
  };
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check public/js/pages/Finanzas.js`
Expected: sin salida (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(finanzas): input PDF opcional al registrar factura de venta"
```

---

### Task 3: Cajón de factura PDF en el modal "Detalle de cobranza"

**Files:**
- Modify: `public/js/pages/Finanzas.js:1968-1970` (HTML del bloque facturación)
- Modify: `public/js/pages/Finanzas.js:~2099` (llamar al pintado tras montar el overlay)
- Modify: `public/js/pages/Finanzas.js` (agregar función `pintarFacturaVenta` dentro de `modalDetalle`)

- [ ] **Step 1: Agregar el contenedor del PDF en el HTML del bloque facturación**

Reemplazar el bloque `(estaFacturada||estaCobrada)` (líneas 1968-1970 actuales) por:

```javascript
                  ${(estaFacturada||estaCobrada) ? `
                    <div style="font-size:12px;margin-top:4px"><b>Factura:</b> ${escapeHtml(c.nro_factura || '—')} · <b>Fecha:</b> ${c.fecha_factura ? String(c.fecha_factura).slice(0,10) : '—'}</div>
                    <div style="margin-top:6px" data-fac-pdf-cell="${c.id_cotizacion}"><span style="font-size:11px;color:#9ca3af">cargando factura…</span></div>
                    ${estaCobrada && c.fecha_cobro_total ? `<div style="font-size:11px;color:#6b7280">Cobrada el ${String(c.fecha_cobro_total).slice(0,10)}</div>`:''}
                  ` : `
```

(Solo se añadió la línea `data-fac-pdf-cell`; el resto queda igual.)

- [ ] **Step 2: Agregar la función `pintarFacturaVenta` dentro de `modalDetalle`**

Insertar justo después de la función `pintarAdjCobranza` (después de su cierre en la línea 2097, antes de `movs.forEach(...)` en la línea 2099):

```javascript
  // Pinta el cajón del PDF de la factura de venta de la cotización.
  // ref_tipo='FacturaVenta', ref_id=id_cotizacion. 👁️ ver + ⬇ descargar + ✕ quitar (GERENTE) + 📎 subir/reemplazar.
  async function pintarFacturaVenta(idCot) {
    const cell = ov.querySelector(`[data-fac-pdf-cell="${idCot}"]`);
    if (!cell) return;
    let adjs = [];
    try { adjs = await api.adjuntos.listar('FacturaVenta', idCot); }
    catch { adjs = []; }
    const a = (adjs || [])[0] || null;
    const subirLabel = a ? '📎 Reemplazar' : '📎 Subir factura PDF';
    let html = '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">';
    if (a) {
      const nombre = escapeHtml(a.nombre_original || `Factura ${a.id}`);
      html += `<span style="font-size:11px;color:#374151">📄 ${nombre}</span>`;
      html += `<button type="button" data-fac-ver="${a.id}" data-fac-nom="${escapeAttr(a.nombre_original || 'Factura')}"
        title="Ver la factura ${nombre}" aria-label="Ver factura"
        style="background:#15803d;color:#fff;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">👁️</button>`;
      html += `<a href="${api.adjuntos.archivoUrl(a.id)}" download
        title="Descargar la factura ${nombre}" aria-label="Descargar factura"
        style="background:#fff;color:#15803d;border:1px solid #86efac;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;text-decoration:none">⬇</a>`;
      if (_esGerente) {
        html += `<button type="button" data-fac-del="${a.id}"
          title="Quitar el PDF de la factura. No borra la factura registrada, solo el archivo. Solo GERENTE." aria-label="Quitar factura PDF"
          style="background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px">✕</button>`;
      }
    } else {
      html += `<span style="font-size:11px;color:#9ca3af">Sin PDF adjunto</span>`;
    }
    html += `<button type="button" data-fac-subir="${idCot}"
      title="Adjuntar/reemplazar el PDF de la factura emitida en SUNAT (PDF o imagen)." aria-label="Subir factura PDF"
      style="background:#fff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">${subirLabel}</button>`;
    html += '</div>';
    cell.innerHTML = html;

    const verBtn = cell.querySelector('[data-fac-ver]');
    if (verBtn) verBtn.onclick = () => previewAdjunto(
      api.adjuntos.archivoUrl(Number(verBtn.dataset.facVer)),
      verBtn.dataset.facNom || 'Factura'
    );
    const delBtn = cell.querySelector('[data-fac-del]');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm('¿Quitar el PDF de la factura? La factura registrada (N°/fecha) no se borra, solo el archivo.')) return;
      try {
        await api.adjuntos.eliminar(Number(delBtn.dataset.facDel));
        showSuccess('PDF de factura eliminado');
        pintarFacturaVenta(idCot);
      } catch (e) { showError(e.message); }
    };
    const subirBtn = cell.querySelector('[data-fac-subir]');
    if (subirBtn) subirBtn.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.pdf,image/*';
      inp.onchange = async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        try {
          await subirFacturaVentaUnica(idCot, file);
          showSuccess('Factura PDF subida');
          pintarFacturaVenta(idCot);
        } catch (e) { showError(`No se pudo subir "${file.name}": ${e.message}`); }
      };
      inp.click();
    };
  }
```

- [ ] **Step 3: Invocar el pintado al montar el overlay**

En la línea 2099 actual (`movs.forEach(m => pintarAdjCobranza(m.id_cobranza));`), añadir justo debajo:

```javascript
  pintarFacturaVenta(c.id_cotizacion);
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check public/js/pages/Finanzas.js`
Expected: sin salida (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(finanzas): cajon ver/descargar/quitar/reemplazar factura PDF en detalle"
```

---

### Task 4: Cache buster

**Files:**
- Modify: `public/js/app.js` (todos los imports con `?v=`)
- Modify: `public/index.html` (el `<script>` con `?v=`)

- [ ] **Step 1: Detectar la versión actual del cache buster**

Run: `grep -o "?v=[0-9a-z]*" public/js/app.js | head -1`
Expected: imprime el sufijo vigente, p. ej. `?v=20260513r1`. Anotarlo como VIEJO.

- [ ] **Step 2: Definir el nuevo sufijo**

Nuevo = fecha de hoy + revisión 1, formato `?v=20260627r1`. Si el VIEJO ya fuera `20260627rN`, usar `r(N+1)`.

- [ ] **Step 3: Reemplazar en `app.js` (todos los imports)**

Find/Replace global del sufijo VIEJO por el NUEVO en `public/js/app.js`. Verificar que no quede ninguno del viejo:

Run: `grep -c "VIEJO" public/js/app.js` (sustituir VIEJO por el valor real)
Expected: `0`

- [ ] **Step 4: Reemplazar en `index.html`**

Reemplazar el `?v=` VIEJO por el NUEVO en `public/index.html`.

Run: `grep -c "VIEJO" public/index.html`
Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js public/index.html
git commit -m "chore: bump cache buster (factura venta PDF)"
```

---

### Task 5: Verificación manual end-to-end

No hay test harness de frontend; se verifica en el navegador (preview local o producción tras deploy). Usar una cotización **fondeada** (estado `FONDEADA_TOTAL` / `SIN_DETRACCION_FONDEADA`) para poder registrar factura.

- [ ] **Step 1: Levantar el server local**

Mostrar a Julio el comando para copiar (no ejecutarlo automáticamente):
`npm run dev`

- [ ] **Step 2: Registrar factura CON PDF**

En Finanzas → abrir detalle de una cotización fondeada → "📄 Registrar factura" → llenar N°/fecha → adjuntar un PDF → "Registrar factura".
Expected: toast "Cotización facturada y PDF adjuntado". El detalle se refresca a estado FACTURADA.

- [ ] **Step 3: Ver y descargar**

Reabrir el detalle de esa cotización. En el bloque azul de facturación debe aparecer el nombre del PDF + 👁️ + ⬇.
- Click 👁️ → abre el PDF inline.
- Click ⬇ → descarga el archivo.
Expected: ambas acciones funcionan.

- [ ] **Step 4: Reemplazar**

Click "📎 Reemplazar" → elegir otro PDF.
Expected: toast "Factura PDF subida"; al re-listar sigue habiendo **un solo** adjunto (el nuevo). Confirmar en consola: `await api.adjuntos.listar('FacturaVenta', <idCot>)` devuelve length 1.

- [ ] **Step 5: Quitar (como GERENTE)**

Click ✕ → confirmar.
Expected: toast "PDF de factura eliminado"; el cajón vuelve a "Sin PDF adjunto"; la factura (N°/fecha) sigue registrada.

- [ ] **Step 6: Registrar factura SIN PDF (no rompe)**

En otra cotización fondeada, registrar factura sin adjuntar archivo.
Expected: toast "Cotización facturada"; en el detalle el cajón muestra "Sin PDF adjunto" + botón "📎 Subir factura PDF" que funciona.

---

## Self-Review (cobertura del spec)

- Subir factura PDF (opcional) al registrar → Task 2. ✓
- Ver (👁) + descargar (⬇) en el detalle → Task 3 (Steps verBtn + enlace download). ✓
- Reemplazar / quitar después → Task 3 (subir/del) + Task 1 (única). ✓
- Solo dentro del modal "Detalle de cobranza" → Task 3 (no se toca `rowCotizacion`). ✓
- Una factura por cotización → Task 1 (`subirFacturaVentaUnica`). ✓
- Cero migración / cero backend → confirmado, solo Finanzas.js + app.js + index.html. ✓
- `ref_tipo='FacturaVenta'`, `ref_id=id_cotizacion` → consistente en Tasks 1, 2, 3. ✓
- Cache buster → Task 4. ✓
- Convenciones: sin `alert()` salvo `confirm()` (que el patrón de constancias ya usa), modales no cierran por backdrop (no se añade backdrop-close), `showSuccess`/`showError`. ✓
- No se tocan `.ts` → `npx tsc --noEmit` no es estrictamente necesario, pero inofensivo correrlo.

# Constancias de pago en Cobranzas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir adjuntar 1 o varias constancias de pago (voucher) por cada movimiento de cobranza en Finanzas, subibles al registrar o después desde el detalle, con preview embebido idéntico a Logística.

**Architecture:** Se reutiliza la tabla genérica `Adjuntos` (`ref_tipo='Cobranza'`, `ref_id`= id del movimiento `CobranzasCotizacion.id`) y el router `/api/adjuntos` ya montado. Backend: 2 cambios chicos (devolver id en `registrarCobranza` + un endpoint de preview proxied). El resto es frontend en `Finanzas.js` + un namespace nuevo en `api.js`.

**Tech Stack:** Node + TypeScript + Express (backend), Vanilla JS ES modules (frontend), Cloudinary (almacenamiento), MySQL→Supabase adapter.

**Nota sobre tests:** el repo NO tiene framework de tests automatizados. La verificación de cada tarea es `npx tsc --noEmit` (backend) y verificación en navegador (frontend), más una reproducción puntual donde aplique. No inventar un framework de tests.

**Convenciones del repo a respetar (de CLAUDE.md):**
- Gotcha #36 — cache buster: al tocar CUALQUIER `public/js/`, bumpear el sufijo `?v=YYYYMMDDr#` en TODOS los imports de `app.js` + la línea de `index.html`.
- Gotcha #37 — correr `npx tsc --noEmit` antes de cualquier push que toque `.ts`.
- Gotcha #28 — modales NO se cierran por clic en backdrop.
- Feedback tooltips — todo botón nuevo con `title=`; icon-only también `aria-label=`.
- `escapeHtml`/`escapeAttr` ya importados en `Finanzas.js` para todo dato dinámico.

---

## Task 1: Backend — `registrarCobranza` devuelve el id del movimiento

**Files:**
- Modify: `app/modules/finance/CobranzasService.ts` (la línea `return { ok: true };` dentro de `registrarCobranza`, ~línea 249)

- [ ] **Step 1: Cambiar el return**

Buscar dentro de `registrarCobranza` el cierre de la transacción:

```ts
      // Recalcular acumulados
      await this.recomputeEstado(conn, data.id_cotizacion);

      await conn.commit();
      return { ok: true };
```

Reemplazar la última línea por:

```ts
      await conn.commit();
      // Devolvemos el id del movimiento recién creado para que el frontend
      // pueda enganchar las constancias (Adjuntos ref_tipo='Cobranza') subidas
      // en el mismo momento del registro.
      return { ok: true, id_cobranza: cobIns.insertId };
```

(`cobIns` es el resultado del primer INSERT en `CobranzasCotizacion` dentro de esta misma función — ya está en scope.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (exit 0).

- [ ] **Step 3: Commit**

```bash
git add app/modules/finance/CobranzasService.ts
git commit -m "feat(cobranzas): registrarCobranza devuelve id_cobranza para adjuntos"
```

---

## Task 2: Backend — endpoint de preview proxied de un adjunto

**Files:**
- Modify: `index.ts` (dentro de `adjuntosRouter`, entre el `POST /:ref_tipo/:ref_id` y el `GET /:ref_tipo/:ref_id`, ~líneas 1376-1378)

**Contexto:** `proxyCloudinary(res, url)` es una `async function` declarada en `index.ts` (~línea 2263) — está hoisted y accesible. `AdjuntosService.obtener(id)` devuelve `{ url, ... } | null`. La ruta `/:id/archivo` DEBE ir ANTES de `/:ref_tipo/:ref_id`, si no Express captura `archivo` como `ref_id` (gotcha #21 — orden de rutas).

- [ ] **Step 1: Insertar la ruta**

Localizar en `index.ts`:

```ts
adjuntosRouter.post('/:ref_tipo/:ref_id', uploadAdjunto.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido (campo "file")' });
  const r = await AdjuntosService.subir({
    ref_tipo: req.params.ref_tipo as string,
    ref_id: Number(req.params.ref_id),
    buffer: req.file.buffer,
    nombre: req.file.originalname,
    mimetype: req.file.mimetype,
    id_usuario: req.user!.id_usuario,
  });
  res.json(r);
});

adjuntosRouter.get('/:ref_tipo/:ref_id', async (req: Request, res: Response) => {
```

Insertar ENTRE el `});` del POST y el `adjuntosRouter.get('/:ref_tipo/:ref_id'...`:

```ts
// Preview/descarga proxied de un adjunto (mirror de /pago/:id_pago/voucher de OC).
// Mantiene la URL de Cloudinary del lado del servidor y permite preview embebido.
// IMPORTANTE: registrar ANTES de GET '/:ref_tipo/:ref_id' (orden de rutas, gotcha #21).
adjuntosRouter.get('/:id/archivo', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'id de adjunto inválido' });
  }
  const adj = await AdjuntosService.obtener(id);
  await proxyCloudinary(res, adj?.url || null);
});

```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (exit 0).

- [ ] **Step 3: Commit**

```bash
git add index.ts
git commit -m "feat(adjuntos): GET /adjuntos/:id/archivo (preview proxied a Cloudinary)"
```

---

## Task 3: Frontend — namespace `api.adjuntos` en `api.js`

**Files:**
- Modify: `public/js/services/api.js` (agregar un namespace nuevo `adjuntos` dentro del objeto `api`, p.ej. justo después del cierre del namespace `cobranzas`, línea ~249 `},`)

**Patrón de subida (FormData + fetch directo):** copiar el estilo de `subirVoucherPago` (api.js ~línea 601). `API_BASE_URL` es `'/api'` y `del` ya existe.

- [ ] **Step 1: Agregar el namespace**

Localizar el cierre del namespace `cobranzas`:

```js
    importarEECC: (idCuenta, texto) => post('/cobranzas/libro-bancos/importar-eecc', { id_cuenta: idCuenta, texto }),
  },
  transferenciasInternas: {
```

Insertar ENTRE el `},` que cierra `cobranzas` y `transferenciasInternas: {`:

```js
  // Adjuntos genéricos (tabla Adjuntos, ref_tipo/ref_id). Reusable por cualquier
  // módulo. Hoy lo usa Cobranzas para las constancias de pago (ref_tipo='Cobranza',
  // ref_id = id del movimiento de cobranza).
  adjuntos: {
    listar: (refTipo, refId) => get(`/adjuntos/${refTipo}/${refId}`),
    subir: async (refTipo, refId, file) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${API_BASE_URL}/adjuntos/${refTipo}/${refId}`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error subiendo adjunto: HTTP ${r.status}`);
      }
      return r.json();
    },
    eliminar: (id) => del(`/adjuntos/${id}`),
    // URL del preview proxied (la consume el visor embebido, no fetchAPI).
    archivoUrl: (id) => `${API_BASE_URL}/adjuntos/${id}/archivo`,
  },
```

- [ ] **Step 2: Sanity check de sintaxis**

Run: `node --check public/js/services/api.js`
Expected: sin salida (exit 0).

- [ ] **Step 3: Commit**

```bash
git add public/js/services/api.js
git commit -m "feat(api): namespace api.adjuntos (listar/subir/eliminar/archivoUrl)"
```

---

## Task 4: Frontend — visor de constancia embebido en `Finanzas.js`

**Files:**
- Modify: `public/js/pages/Finanzas.js` (agregar dos helpers a nivel de módulo, cerca del tope del archivo después de los imports/const de formato, p.ej. después de `const formatDate = ...`)

**Decisión DRY:** OC tiene su propio `_previewArchivoBackend`. Para no introducir un módulo compartido nuevo (que obligaría a tocar la lista de imports versionados de `app.js`), se duplica un visor mínimo equivalente, self-contained en `Finanzas.js`. Es el mismo comportamiento que Logística: descarga el archivo vía backend, detecta tipo, muestra `<img>` o `<iframe>` en un modal con botón Cerrar.

- [ ] **Step 1: Agregar los helpers**

Insertar a nivel de módulo (fuera de cualquier función), por ejemplo tras la línea `const formatDate = ...` o junto a los otros helpers del tope:

```js
// ── Visor de constancia/adjunto embebido (mismo comportamiento que Logística) ──
function _abrirOverlayPreviewAdj(titulo) {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;' +
    'display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:min(960px,95vw);height:min(92vh,1200px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#f9fafb;gap:8px">
        <strong style="font-size:14px;color:#111">👁️ ${escapeHtml(titulo)}</strong>
        <button data-close type="button" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:12px">Cerrar</button>
      </div>
      <div data-content style="flex:1;display:flex;align-items:center;justify-content:center;background:#525659;overflow:auto">
        <div style="color:#d1d5db;font-size:13px">⏳ Cargando…</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

// Descarga el archivo del backend (proxy a Cloudinary), detecta si es imagen o
// PDF y lo muestra inline. `url` = api.adjuntos.archivoUrl(idAdjunto).
async function previewAdjunto(url, titulo = 'Constancia') {
  const overlay = _abrirOverlayPreviewAdj(titulo);
  let blobUrl = null;
  const cleanup = () => {
    if (overlay.parentNode) overlay.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };
  overlay.querySelector('[data-close]').onclick = cleanup;
  const content = overlay.querySelector('[data-content]');
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    blobUrl = URL.createObjectURL(blob);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.startsWith('image/')) {
      content.innerHTML = `<img src="${blobUrl}" alt="${escapeAttr(titulo)}" style="max-width:100%;max-height:100%;object-fit:contain">`;
    } else {
      content.innerHTML = `<iframe src="${blobUrl}" style="flex:1;border:none;width:100%;height:100%;background:#525659" title="${escapeAttr(titulo)}"></iframe>`;
    }
  } catch (err) {
    content.innerHTML = `
      <div style="text-align:center;color:#fef3c7;padding:24px;max-width:400px">
        <div style="font-size:36px;margin-bottom:10px">⚠️</div>
        <div style="font-size:14px;margin-bottom:8px;font-weight:600">No se pudo cargar el archivo</div>
        <div style="font-size:12px;color:#d1d5db">${escapeHtml(err.message || String(err))}</div>
      </div>`;
  }
}
```

(Confirmar que `escapeAttr` está importado al tope de `Finanzas.js`; el import actual es `import { showSuccess, showError, ... escapeHtml, escapeAttr ... } from '../services/ui.js'` — ya incluye ambos. Si faltara `escapeAttr`, agregarlo a ese import.)

- [ ] **Step 2: Sanity check de sintaxis**

Run: `node --check public/js/pages/Finanzas.js`
Expected: sin salida (exit 0).

- [ ] **Step 3: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(finanzas): visor embebido de constancias (preview como Logistica)"
```

---

## Task 5: Frontend — campo multi-archivo en el modal "Registrar cobranza"

**Files:**
- Modify: `public/js/pages/Finanzas.js` — función `modalRegistrarCobranza` (HTML del form ~línea 388-391 y handler `#cob-ok` ~línea 448-461)

**Objetivo:** agregar un input `type=file multiple` (solo en modo crear, no en edit) y devolver los archivos elegidos en `data._constancias` para que el caller los suba tras crear la cobranza.

- [ ] **Step 1: Agregar el campo de archivo al form**

Localizar en el HTML del form (dentro de `modalRegistrarCobranza`):

```js
            <div>
              <label style="font-size:11px;color:var(--text-secondary)">Comentario</label>
              <textarea name="comentario" rows="2" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px;resize:vertical">${isEdit ? (existing.comentario || '') : ''}</textarea>
            </div>
          </form>
```

Insertar ENTRE el `</div>` del comentario y `</form>` (solo cuando NO es edit):

```js
            ${isEdit ? '' : `
            <div>
              <label style="font-size:11px;color:var(--text-secondary)">📎 Constancias (opcional)</label>
              <input name="constancias" type="file" accept=".pdf,image/*" multiple
                title="Adjuntá una o varias constancias de pago (PDF o imagen). También podés agregarlas después desde el detalle de la cobranza."
                style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;background:#fff">
              <div style="font-size:10px;color:var(--text-secondary);margin-top:3px">Podés subir una o varias (PDF o imagen). Si todavía no la tenés, dejalo vacío y subila luego desde el detalle.</div>
            </div>`}
```

- [ ] **Step 2: Devolver los archivos elegidos desde el handler**

Localizar el handler del botón OK:

```js
    ov.querySelector('#cob-ok').onclick = () => {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.id_cotizacion = cot.id_cotizacion;
      data.monto = Number(data.monto);
      if (data.id_cuenta === '') data.id_cuenta = null;
      else data.id_cuenta = Number(data.id_cuenta);
      data.moneda = cot.moneda;
      data.tipo_cambio = Number(cot.tipo_cambio) || 1;
      // En modo edit el select de tipo está disabled — FormData no incluye
      // disabled fields, así que conservamos el tipo original explícito.
      if (isEdit) data.tipo = existing.tipo;
      close(data);
    };
```

Reemplazarlo por (agrega la extracción de archivos y limpia la clave cruda del FormData):

```js
    ov.querySelector('#cob-ok').onclick = () => {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.id_cotizacion = cot.id_cotizacion;
      data.monto = Number(data.monto);
      if (data.id_cuenta === '') data.id_cuenta = null;
      else data.id_cuenta = Number(data.id_cuenta);
      data.moneda = cot.moneda;
      data.tipo_cambio = Number(cot.tipo_cambio) || 1;
      // En modo edit el select de tipo está disabled — FormData no incluye
      // disabled fields, así que conservamos el tipo original explícito.
      if (isEdit) data.tipo = existing.tipo;
      // Constancias seleccionadas (solo modo crear). Las sacamos del payload
      // JSON (no son serializables) y las devolvemos aparte para subirlas tras
      // crear la cobranza. `Object.fromEntries` deja en data.constancias el
      // último File del input multiple — lo borramos.
      delete data.constancias;
      const fileInput = form.querySelector('input[name="constancias"]');
      data._constancias = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
      close(data);
    };
```

- [ ] **Step 3: Sanity check de sintaxis**

Run: `node --check public/js/pages/Finanzas.js`
Expected: sin salida (exit 0).

- [ ] **Step 4: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(finanzas): input multi-constancia en modal Registrar cobranza"
```

---

## Task 6: Frontend — subir constancias tras registrar la cobranza

**Files:**
- Modify: `public/js/pages/Finanzas.js` — handler de `.btn-registrar` (~línea 3093-3111)

- [ ] **Step 1: Reemplazar el handler para subir las constancias**

Localizar:

```js
  // Registrar cobranza
  document.querySelectorAll('.btn-registrar').forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.id);
      // Buscamos la cotización en los datos ya cargados (rowCotizacion sólo tiene básicos)
      // Recargamos detalle para tener los campos completos
      let det;
      try { det = await api.cobranzas.getDetalle(id); }
      catch (e) { return showError(e.message); }
      const data = await modalRegistrarCobranza(det.cotizacion, cuentas);
      if (!data) return;
      try {
        await api.cobranzas.registrar(data);
        showSuccess('Cobranza registrada');
        window.refreshModule?.();
      } catch (e) {
        showError('Error: ' + e.message);
      }
    };
  });
```

Reemplazar el bloque `try {...}` interno por:

```js
      const data = await modalRegistrarCobranza(det.cotizacion, cuentas);
      if (!data) return;
      // Separar las constancias del payload JSON antes de registrar.
      const constancias = Array.isArray(data._constancias) ? data._constancias : [];
      delete data._constancias;
      try {
        const res = await api.cobranzas.registrar(data);
        // Subir cada constancia al movimiento recién creado. Un fallo por archivo
        // no revierte la cobranza (ya quedó registrada) — se avisa por toast.
        let okCount = 0;
        if (constancias.length && res?.id_cobranza) {
          for (const file of constancias) {
            try {
              await api.adjuntos.subir('Cobranza', res.id_cobranza, file);
              okCount++;
            } catch (e) {
              showError(`No se pudo subir "${file.name}": ${e.message}`);
            }
          }
        }
        showSuccess(
          constancias.length
            ? `Cobranza registrada · ${okCount}/${constancias.length} constancia(s) subida(s)`
            : 'Cobranza registrada'
        );
        window.refreshModule?.();
      } catch (e) {
        showError('Error: ' + e.message);
      }
```

- [ ] **Step 2: Sanity check de sintaxis**

Run: `node --check public/js/pages/Finanzas.js`
Expected: sin salida (exit 0).

- [ ] **Step 3: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(finanzas): subir constancias al registrar cobranza"
```

---

## Task 7: Frontend — columna de constancias en el detalle (ver / subir / borrar)

**Files:**
- Modify: `public/js/pages/Finanzas.js` — función `modalDetalle`: tabla "Movimientos registrados" (header ~línea 1870-1878, filas ~línea 1881-1895) y binding tras append (~línea 1904).

**Modelo:** cada fila es un movimiento `m.id_cobranza`. Las constancias se cargan async tras renderizar (un `GET /adjuntos/Cobranza/:id` por movimiento). Botón ✕ de borrar solo visible para GERENTE (barrera de UI, como OC).

- [ ] **Step 1: Agregar el header de columna**

Localizar el `<thead>` de la tabla de movimientos:

```js
                <tr style="text-align:left">
                  <th style="padding:8px 10px">Fecha</th>
                  <th style="padding:8px 10px">Tipo</th>
                  <th style="padding:8px 10px">Cuenta / Banco</th>
                  <th style="padding:8px 10px">Nº Op</th>
                  <th style="padding:8px 10px;text-align:right">Monto</th>
                  <th style="padding:8px 10px"></th>
                </tr>
```

Agregar una `<th>` de Constancias antes de la `<th>` vacía de acciones:

```js
                <tr style="text-align:left">
                  <th style="padding:8px 10px">Fecha</th>
                  <th style="padding:8px 10px">Tipo</th>
                  <th style="padding:8px 10px">Cuenta / Banco</th>
                  <th style="padding:8px 10px">Nº Op</th>
                  <th style="padding:8px 10px;text-align:right">Monto</th>
                  <th style="padding:8px 10px">Constancias</th>
                  <th style="padding:8px 10px"></th>
                </tr>
```

- [ ] **Step 2: Agregar la celda de constancias en cada fila**

Localizar la celda del monto dentro de `movs.map(...)`:

```js
                    <td style="padding:8px 10px;text-align:right;font-weight:600">${fMoney(m.monto, m.moneda)}</td>
                    <td style="padding:8px 10px;text-align:right;white-space:nowrap">
```

Insertar una celda ENTRE el monto y la celda de acciones:

```js
                    <td style="padding:8px 10px;text-align:right;font-weight:600">${fMoney(m.monto, m.moneda)}</td>
                    <td style="padding:8px 10px;white-space:nowrap" data-adj-cell="${m.id_cobranza}">
                      <span style="color:#9ca3af;font-size:11px">cargando…</span>
                    </td>
                    <td style="padding:8px 10px;text-align:right;white-space:nowrap">
```

- [ ] **Step 3: Poblar las celdas async + bindings tras append**

Localizar, después de armar el modal, la línea donde se cierra/wirean cosas:

```js
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('#det-x').onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
```

Insertar DESPUÉS de `ov.querySelector('#det-x').onclick = close;` (no tocar el resto):

```js
  // ── Constancias por movimiento (tabla Adjuntos, ref_tipo='Cobranza') ──
  const _esGerente = (() => {
    try { return (JSON.parse(localStorage.getItem('erp_user') || '{}').rol === 'GERENTE'); }
    catch { return false; }
  })();

  // Pinta la celda de constancias de un movimiento: contador + lista con
  // 👁️ Ver (preview proxied) + ✕ (solo GERENTE) + 📎 Subir.
  async function pintarAdjCobranza(idCobranza) {
    const cell = ov.querySelector(`[data-adj-cell="${idCobranza}"]`);
    if (!cell) return;
    let adjs = [];
    try { adjs = await api.adjuntos.listar('Cobranza', idCobranza); }
    catch { adjs = []; }
    const items = (adjs || []).map(a => {
      const nombre = escapeHtml(a.nombre_original || `Adjunto ${a.id}`);
      const verBtn = `<button type="button" data-adj-ver="${a.id}" data-adj-nom="${escapeAttr(a.nombre_original || 'Constancia')}"
        title="Ver la constancia ${nombre}" aria-label="Ver constancia"
        style="background:#15803d;color:#fff;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">👁️</button>`;
      const delBtn = _esGerente
        ? `<button type="button" data-adj-del="${a.id}"
            title="Quitar esta constancia. El archivo queda huérfano en Cloudinary. Solo GERENTE." aria-label="Quitar constancia"
            style="background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;margin-left:3px">✕</button>`
        : '';
      return `<span style="display:inline-flex;align-items:center;gap:2px;margin:1px 4px 1px 0">${verBtn}${delBtn}</span>`;
    }).join('');
    const subirBtn = `<button type="button" data-adj-subir="${idCobranza}"
      title="Adjuntar otra constancia de pago a este movimiento (PDF o imagen)." aria-label="Subir constancia"
      style="background:#fff;color:#15803d;border:1px solid #86efac;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">📎 Subir</button>`;
    cell.innerHTML = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
      ${adjs.length ? `<span style="font-size:11px;color:#374151">📎 ${adjs.length}</span> ${items}` : '<span style="font-size:11px;color:#9ca3af">—</span>'}
      ${subirBtn}
    </div>`;

    // Ver (preview embebido proxied)
    cell.querySelectorAll('[data-adj-ver]').forEach(b => {
      b.onclick = () => previewAdjunto(
        api.adjuntos.archivoUrl(Number(b.dataset.adjVer)),
        b.dataset.adjNom || 'Constancia'
      );
    });
    // Borrar (solo GERENTE)
    cell.querySelectorAll('[data-adj-del]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('¿Quitar esta constancia? El pago no se borra, solo se desadjunta el archivo.')) return;
        try {
          await api.adjuntos.eliminar(Number(b.dataset.adjDel));
          showSuccess('Constancia eliminada');
          pintarAdjCobranza(idCobranza);
        } catch (e) { showError(e.message); }
      };
    });
    // Subir nueva
    cell.querySelectorAll('[data-adj-subir]').forEach(b => {
      b.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.pdf,image/*';
        inp.onchange = async () => {
          const file = inp.files && inp.files[0];
          if (!file) return;
          try {
            await api.adjuntos.subir('Cobranza', idCobranza, file);
            showSuccess('Constancia subida');
            pintarAdjCobranza(idCobranza);
          } catch (e) { showError(`No se pudo subir "${file.name}": ${e.message}`); }
        };
        inp.click();
      };
    });
  }

  movs.forEach(m => pintarAdjCobranza(m.id_cobranza));
```

**Nota:** `ov.onclick = (e) => { if (e.target === ov) close(); };` ya existe en este modal (cierra por backdrop). Es preexistente; NO se agrega ni se quita en esta tarea (fuera de alcance). Los modales NUEVOS de esta feature (visor de constancia, Task 4) ya respetan gotcha #28 (solo cierran con botón).

- [ ] **Step 4: Sanity check de sintaxis**

Run: `node --check public/js/pages/Finanzas.js`
Expected: sin salida (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Finanzas.js
git commit -m "feat(finanzas): columna de constancias en detalle (ver/subir/borrar)"
```

---

## Task 8: Cache buster + typecheck final

**Files:**
- Modify: `public/js/app.js` (los ~19 imports con `?v=`)
- Modify: `public/index.html` (la línea `<script ... app.js?v=...>`)

- [ ] **Step 1: Detectar la versión actual del cache buster**

Run: `grep -o "?v=[0-9]\{8\}r[0-9]\+" public/js/app.js | head -1`
Expected: imprime el sufijo vigente, p.ej. `?v=20260513r1`.

- [ ] **Step 2: Bumpear TODOS los sufijos a la nueva revisión**

Elegir la nueva versión: fecha de hoy + r1 → `?v=20260625r1` (si ya existiera una r de hoy, subir el número). Reemplazar globalmente en `app.js` y en `index.html` el sufijo viejo por el nuevo. Editar cada ocurrencia (Find/Replace global del string viejo por el nuevo).

Run (verificación de que no quedó ninguna ocurrencia vieja):
`grep -c "?v=20260513r1" public/js/app.js public/index.html`
Expected: `0` en ambos (ajustar el string viejo al que devolvió el Step 1).

- [ ] **Step 3: Verificar que la nueva versión está en todos lados**

Run: `grep -c "20260625r1" public/js/app.js`
Expected: el mismo número de imports que tenía el sufijo viejo (≈19, no 0).

- [ ] **Step 4: Typecheck final del backend**

Run: `npx tsc --noEmit`
Expected: sin errores (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js public/index.html
git commit -m "chore: bump cache buster r1 (constancias cobranzas)"
```

---

## Task 9: Verificación en navegador

**Objetivo:** confirmar el flujo real (no solo que compila).

- [ ] **Step 1: Levantar el server**

Mostrar al usuario el comando para copiar (no ejecutarlo automáticamente, por preferencia de Julio):
`npm run dev`  (o `ts-node index.ts`)

- [ ] **Step 2: Verificar flujo "subir al registrar"**

1. Login como GERENTE.
2. Finanzas → bandeja "Trabajo en riesgo" → "+ Cobranza" en una cotización.
3. Llenar monto, elegir 1-2 archivos en "📎 Constancias", Registrar.
4. Esperado: toast "Cobranza registrada · N/N constancia(s) subida(s)".

- [ ] **Step 3: Verificar flujo "ver / subir después / borrar"**

1. Abrir "Detalle" de esa cobranza.
2. En "Movimientos registrados", la fila muestra "📎 N" + 👁️ + ✕ + "📎 Subir".
3. 👁️ Ver → abre el visor embebido (imagen inline o PDF en iframe) con botón Cerrar.
4. "📎 Subir" → elegir archivo → toast "Constancia subida" → contador sube.
5. ✕ (como GERENTE) → confirma → "Constancia eliminada" → contador baja.

- [ ] **Step 4: Revisar consola/network**

Sin errores 4xx/5xx en las llamadas a `/api/adjuntos/...`. El GET `/api/adjuntos/:id/archivo` responde con el content-type del archivo.

- [ ] **Step 5: (al aprobar Julio) push de la rama**

```bash
git push -u origin claude/cobranzas-constancias
```

Luego abrir PR con `gh` para que Julio mergee a main (gate de release).

---

## Self-review (cobertura del spec)

- Granularidad N por pago → Adjuntos `ref_id`=movimiento (Tasks 3,5,6,7). ✓
- Subir al registrar → Tasks 5,6. ✓
- Subir después desde el detalle → Task 7. ✓
- Ver constancias → Tasks 4,7. ✓
- Preview como Logística (proxied embebido) → Tasks 2,4. ✓
- Backend mínimo (id en registrar + endpoint preview) → Tasks 1,2. ✓
- Borrado solo GERENTE (barrera UI) → Task 7. ✓
- Cache buster + tsc → Task 8. ✓
- Verificación browser → Task 9. ✓
- Fuera de alcance (rol en DELETE backend, migrar voucher_url legacy) → respetado. ✓

# Constancias de pago en Cobranzas (Finanzas) — Diseño

**Fecha:** 2026-06-25
**Autor:** Julio + Claude
**Módulo:** Finanzas → Cobranzas

## Problema

En **Finanzas** (bandejas "Trabajo en riesgo" / "Cobradas" y el "Detalle de cobranza")
no hay forma de adjuntar la **constancia de pago** (voucher bancario) cuando un
cliente paga, ni de ver las constancias ya subidas. Como un servicio puede
cobrarse en **partes** (pagos parciales), se necesita poder subir **1 o varias
constancias por cada pago**.

En **Logística** (kanban de Órdenes de Compra) esto ya existe: cada pago tiene su
constancia, subible en el momento o después, con preview embebido. Replicamos ese
patrón en Cobranzas.

## Decisiones de producto (acordadas)

1. **Granularidad:** varias constancias por un mismo pago (N adjuntos por movimiento).
2. **Momento de subida:** las dos — al registrar la cobranza **y** después desde el detalle.
3. **Preview:** idéntico a Logística — modal embebido que descarga el archivo vía
   backend (proxy a Cloudinary) y muestra imagen o PDF inline.

## Modelo de datos — sin migración

Se reutiliza la tabla genérica **`Adjuntos`** (migración 023, ya en producción):

```
Adjuntos(id, ref_tipo, ref_id, nombre_original, url, cloudinary_public_id,
         mimetype, tamano_bytes, id_usuario_subio, created_at)
```

- `ref_tipo = 'Cobranza'`
- `ref_id   = CobranzasCotizacion.id` (el id de cada **movimiento** = pago parcial)

Así cada pago parcial admite **N constancias**. No hay tabla nueva.

`AdjuntosService` (subir / listar / obtener / eliminar) ya existe y sube a
Cloudinary en carpeta `metalengineers/cobranza`.

## Backend — cambios mínimos

1. **`CobranzasService.registrarCobranza`** (1 línea): devolver el id del movimiento
   recién creado. Hoy retorna `{ ok: true }`; pasa a `{ ok: true, id_cobranza: cobIns.insertId }`.
   Necesario para enganchar las constancias subidas en el mismo momento del registro.

2. **Nuevo endpoint de preview proxied** (mirror de `/pago/:id_pago/voucher` de OC):
   `GET /api/adjuntos/:id/archivo` → `AdjuntosService.obtener(id)` → `proxyCloudinary(res, adj.url)`.
   Debe registrarse **ANTES** de `GET /:ref_tipo/:ref_id` en `adjuntosRouter` para que
   Express no capture `archivo` como `ref_id` (gotcha #21 — orden de rutas).

3. Reuso tal cual (sin cambios):
   - `POST /api/adjuntos/:ref_tipo/:ref_id` (sube 1 archivo, campo `file`)
   - `GET  /api/adjuntos/:ref_tipo/:ref_id` (lista)
   - `DELETE /api/adjuntos/:id` (borra; ya con `auditLog`)
   El router ya está gateado para FINANZAS (`requireAnyModulo`).

   **Nota de permiso de borrado:** OC restringe borrar voucher a GERENTE. El
   `DELETE /api/adjuntos/:id` genérico hoy **no** distingue rol. Para igualar a
   Logística, el botón ✕ en la UI se muestra solo a GERENTE (barrera de frontend,
   consistente con cómo OC muestra el ✕). No se cambia el endpoint en esta fase.

## Frontend — `public/js/pages/Finanzas.js`

### 1. Modal "Registrar cobranza"
- Agregar campo **"📎 Constancias (opcional)"**: `<input type="file" multiple accept=".pdf,image/*">`
  con preview de la lista de archivos elegidos y opción de quitar alguno antes de enviar.
- En el submit: tras `api.cobranzas.registrar(data)` que ahora devuelve `id_cobranza`,
  subir cada archivo con `api.adjuntos.subir('Cobranza', id_cobranza, file)` en secuencia.
  Errores por archivo no bloquean (toast por archivo fallido); la cobranza ya quedó registrada.

### 2. "Detalle de cobranza" → tabla "Movimientos registrados"
- Por cada fila (movimiento `m.id_cobranza`), una celda de **Constancias**:
  - contador (ej. `📎 2`),
  - **👁️ Ver** → abre el preview embebido. Si hay varias, lista cada una con su
    nombre + botón ver (proxied vía `GET /api/adjuntos/:id/archivo`) + **✕** (solo GERENTE).
  - **📎 Subir** → `<input type=file>` oculto; sube y refresca la fila.
- Las constancias se cargan al abrir el detalle: un `GET /api/adjuntos/Cobranza/:id_cobranza`
  por movimiento (o batch). Cantidades chicas → simple.

### 3. Preview (idéntico a OC)
- Portar el helper de OC: `abrirOverlayPreview(titulo)` + fetch del archivo con
  `credentials:'same-origin'` → detectar `content-type` → `<img>` o `<iframe>` → modal
  con botón "Cerrar". Fuente: `OrdenesCompra.js` `_previewArchivoBackend`.
- Se expone como helper reutilizable (evitar duplicar lógica entre páginas si es viable).

### 4. `public/js/services/api.js`
Nuevo namespace reutilizable:
```js
adjuntos: {
  listar:   (refTipo, refId) => get(`/adjuntos/${refTipo}/${refId}`),
  subir:    (refTipo, refId, file) => { /* FormData campo 'file', fetch directo como uploadFoto */ },
  eliminar: (id) => del(`/adjuntos/${id}`),
  archivoUrl: (id) => `${API_BASE_URL}/adjuntos/${id}/archivo`,  // para el preview proxied
}
```

## Detalles operativos

- **Cache buster (gotcha #36):** bump del sufijo `?v=YYYYMMDDr#` en TODOS los imports
  de `app.js` + la línea de `index.html`. Se tocan `Finanzas.js` y `api.js`.
- **`npx tsc --noEmit`** antes de pushear (gotcha #37) — se toca `index.ts` y `CobranzasService.ts`.
- **Verificación en browser** al terminar (login + registrar cobranza con constancia + ver + subir tardía).
- **Convención tooltips (feedback):** cada botón nuevo con `title=` describiendo alcance; icon-only también `aria-label=`.
- **Modales:** no cerrar por backdrop click (gotcha #28) en los modales nuevos.

## Fuera de alcance (YAGNI)

- Cambiar el endpoint `DELETE /api/adjuntos/:id` para validar rol en backend (hoy barrera solo en UI).
- Constancias en otros sub-flujos de cobranza (detracción BN / retención) más allá de lo que ya cubre el movimiento.
- Migrar el `voucher_url` legacy de `CobranzasCotizacion` (queda como columna sin uso; no estorba).

# Adjuntar factura de venta (PDF de SUNAT) — Diseño

**Fecha:** 2026-06-27
**Módulo:** Finanzas (lado ventas / cobranzas)
**Estado:** Aprobado por Julio — listo para plan de implementación

## Problema

Hoy las facturas se emiten en la plataforma de SUNAT y se descargan como PDF, pero el ERP
no tiene dónde guardar ese PDF. El flujo "Registrar factura" de una cobranza solo captura
`nro_factura` + `fecha_factura` ([CobranzasService.ts:1168](../../../app/modules/finance/CobranzasService.ts) `marcarFacturada`),
sin respaldo del documento. Falta poder **subir** la factura PDF contra el servicio,
**verla** (ojito) y **descargarla**.

Esto NO rompe el principio "un dato se llena una sola vez": la factura nace fuera del ERP
(en SUNAT), así que subir su PDF es la primera y única vez que ese documento entra al sistema.

## Alcance

- **Solo facturas de venta** (las que emitimos en SUNAT), atadas a la cotización/cobranza.
- **NO** incluye facturas de proveedor (lado compras / OC) — eso queda fuera de esta pasada.
- El PDF es **opcional** al registrar y se puede subir, ver, reemplazar y quitar después.
- Ver/descargar **solo** dentro del modal "Detalle de cobranza" (no hay iconito en las filas de las listas).
- **Una sola factura por cotización** (el modelo guarda un `nro_factura` por `Cotizaciones`).

## Diseño

### 1. Almacenamiento — reusa `AdjuntosService`, cero migración

- Nuevo `ref_tipo = 'FacturaVenta'`, con `ref_id = id_cotizacion`.
- El archivo va a Cloudinary vía `AdjuntosService.subir()` (carpeta `metalengineers/facturaventa`).
- **No se toca el schema.** `marcarFacturada` sigue guardando `nro_factura` + `fecha_factura`
  igual que hoy; el PDF cuelga aparte en la tabla `Adjuntos`.

### 2. Backend — nada nuevo

- El endpoint genérico ya existe y ya está autorizado para FINANZAS ([index.ts:1391](../../../index.ts)):
  - `POST   /api/adjuntos/:ref_tipo/:ref_id` — subir
  - `GET    /api/adjuntos/:ref_tipo/:ref_id` — listar
  - `GET    /api/adjuntos/:id/archivo`       — preview/descarga proxied
  - `DELETE /api/adjuntos/:id`               — eliminar
- No se agrega ruta ni servicio nuevo.

### 3. Frontend — único archivo que se toca: `public/js/pages/Finanzas.js`

**a) Modal "Registrar factura"** ([~1831](../../../public/js/pages/Finanzas.js)):
- Agregar input de archivo **opcional** (acepta PDF / JPG / PNG).
- Al enviar el form:
  1. Registrar la factura como hoy (`marcarFacturada` con nro + fecha).
  2. Si el usuario adjuntó archivo → `api.adjuntos.subir('FacturaVenta', id_cotizacion, file)`.
  3. Si el upload falla, la factura igual queda registrada → mostrar `showError`/aviso, no revertir
     ni bloquear (el PDF se puede subir luego desde el detalle).

**b) Modal "Detalle de cobranza"** ([~1894](../../../public/js/pages/Finanzas.js)):
- Cuando el estado es FACTURADA o COBRADA, mostrar una fila/bloque de factura con:
  - **👁 Ver** — inline, reusando el helper `abrirAdjuntoInline` ([~86](../../../public/js/pages/Finanzas.js)).
  - **⬇ Descargar** — `api.adjuntos.archivoUrl(idAdjunto)`.
  - **🗑 Quitar** — `api.adjuntos.eliminar(id)`.
  - **Subir / Reemplazar** — si no hay PDF o se quiere cambiar.
- Es el mismo patrón visual ya usado por las constancias de movimientos
  ([~2030](../../../public/js/pages/Finanzas.js), `ref_tipo='Cobranza'`).

### 4. Una sola factura por cotización

- Al subir una factura nueva cuando ya existe un adjunto `FacturaVenta` para esa cotización,
  borrar el anterior antes (o después de) insertar el nuevo, para mantener 1 PDF limpio.

### 5. Cache buster

- Toca `public/js/` → bumpear el sufijo `?v=YYYYMMDDr#` en **todos** los imports de `app.js`
  + la línea de `index.html` (gotcha #36 del CLAUDE.md).

## Reglas / convenciones a respetar

- Cero `alert()` — usar `showSuccess` / `showError` de `ui.js` (gotcha #16).
- Modales no se cierran por clic en backdrop (gotcha #28).
- Verificar `npx tsc --noEmit` antes de pushear si se tocan `.ts` (gotcha #37) —
  aunque este cambio es solo frontend, confirmar igual.

## Riesgo

Bajísimo: cero migración, cero backend nuevo, un solo archivo frontend, todo sobre
infraestructura (`AdjuntosService` + endpoints genéricos) ya en producción.

## Fuera de alcance (YAGNI)

- Facturas de proveedor (compras / OC).
- Múltiples facturas por cotización.
- Iconito de factura en las filas de las listas de Finanzas.
- Validación del XML/CDR de SUNAT — solo se guarda el PDF tal cual.

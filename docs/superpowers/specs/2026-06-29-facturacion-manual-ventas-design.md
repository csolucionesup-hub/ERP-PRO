# Facturación manual de ventas — Diseño

**Fecha:** 2026-06-29
**Módulo:** Finanzas (lado ventas / cobranzas)
**Estado:** Aprobado por Julio — listo para plan de implementación
**Relación:** Construye sobre PR #33 (`2026-06-27-adjuntar-factura-venta-pdf-design.md`, subir PDF de factura SUNAT). Surge de la Auditoría V4 (`docs/auditoria-v4-2026-06-29.md`): al retirar Nubefact, los críticos C3/C4/C5 y los altos A8/A9/A10 de facturación quedan resueltos por eliminación del código.

## Problema y decisión

Las facturas de venta se crean **manualmente en la plataforma de SUNAT** y se suben al ERP. El ERP **no es emisor**. Hoy conviven dos cosas:

1. El flujo real (PR #33): registrar `nro_factura` + `fecha_factura` en la cobranza + adjuntar el PDF. Funciona pero **el ERP no guarda la factura como dato** (solo nro/fecha + PDF), y no soporta más de una factura por cotización.
2. Un camino de **emisión electrónica vía Nubefact** (`FacturaService`/`/api/facturas`, STUB) que **no se usa** y es la fuente de la mayoría de los hallazgos de facturación del audit.

**Decisión (Julio, 29/06):** Nubefact afuera. El flujo manual (subir factura SUNAT) es el oficial. Se captura la factura como **dato estructurado completo**, modelo **1:N** (una cotización puede tener varias facturas), preservando toda la data de producción. El Registro de Ventas / PLE queda **fuera de esta pasada** (se retira junto con Nubefact; `FacturaVenta` queda lista para alimentarlo en el futuro).

## Principio rector

**El flujo de subir facturas que Julio usa hoy NO cambia.** El botón "Registrar factura" sigue en el mismo lugar, el PDF se sube/ve/descarga igual (AdjuntosService/Cloudinary), el PDF sigue siendo opcional, se sigue escribiendo `nro_factura`/`fecha_factura` y la cotización sigue pasando a `FACTURADA`. Lo nuevo (campos estructurados) viene **pre-llenado desde la cotización** y **plegado/secundario** para no agregar fricción.

## Alcance

- **Solo facturas de venta** (las que se emiten en SUNAT). Las facturas de **proveedor** (compras/OC, `FacturaOCService`) y las **Notas de Crédito** NO se tocan.
- Captura completa SUNAT: serie, número, fecha, tipo, moneda, base, IGV, total, detracción, retención + PDF.
- Modelo 1:N (tabla `FacturaVenta`), soporta varias facturas por cotización pero limpio con una.
- Migración aditiva: preserva `Cotizaciones.nro_factura`/`fecha_factura` y back-fillea la nueva tabla.
- Retiro completo del camino Nubefact.

## Diseño

### 1. Modelo de datos — tabla `FacturaVenta` (nueva, aditiva)

1:N con `Cotizaciones`. **No altera ni borra columnas existentes** — `Cotizaciones.nro_factura`/`fecha_factura` se quedan (back-compat + cero pérdida de data).

```
FacturaVenta
  id_factura_venta      PK
  id_cotizacion         FK -> Cotizaciones (NOT NULL, ON DELETE RESTRICT)
  tipo                  ENUM('FACTURA','BOLETA') DEFAULT 'FACTURA'
  serie                 VARCHAR(5)        -- ej. F001
  numero                INT               -- ej. 1234
  fecha_emision         DATE
  moneda                ENUM('PEN','USD') DEFAULT 'PEN'
  tipo_cambio           DECIMAL(8,4) DEFAULT 1.0000
  base_imponible        DECIMAL(14,2)
  igv                   DECIMAL(14,2)
  total                 DECIMAL(14,2)
  aplica_detraccion     BOOL DEFAULT false
  porcentaje_detraccion DECIMAL(5,2) DEFAULT 0
  monto_detraccion      DECIMAL(14,2) DEFAULT 0
  aplica_retencion      BOOL DEFAULT false
  monto_retencion       DECIMAL(14,2) DEFAULT 0
  cliente_razon_social  VARCHAR(200)      -- snapshot pre-llenado de la cotización
  cliente_num_doc       VARCHAR(15)       -- RUC/DNI, para el futuro Registro de Ventas
  observaciones         VARCHAR(500)
  id_usuario_registro   INT
  estado                ENUM('VIGENTE','ANULADA') DEFAULT 'VIGENTE'  -- anulación lógica, nunca borrado físico
  created_at / updated_at
  UNIQUE (tipo, serie, numero)            -- no se puede cargar 2 veces el mismo comprobante
  INDEX (id_cotizacion), INDEX (fecha_emision)
```

- **PDF:** se cuelga con `AdjuntosService` (`ref_tipo='FacturaVenta'`, `ref_id=id_factura_venta`). Cero esquema extra para el archivo; reusa la infra de PR #33. (Nota: PR #33 usaba `ref_id=id_cotizacion`; ahora pasa a `id_factura_venta` para soportar 1:N. La migración reasigna los adjuntos existentes — ver §5.)
- Sintaxis de la migración: estilo MySQL adaptado a Postgres como el resto del repo (ENUM→TEXT+CHECK, AUTO_INCREMENT→IDENTITY, etc.), aplicada vía MCP `apply_migration` (NO el runner mysql2 contra Railway legacy).

### 2. Backend — `FacturaVentaService` + encaje con cobranza

Nuevo `app/modules/facturacion/FacturaVentaService.ts`:
- `previewDesdeCotizacion(id_cotizacion)` — devuelve los campos pre-llenados (montos, detracción, cliente) desde la cotización. No persiste.
- `crear(data, { id_usuario })` — inserta la fila; si es la **primera** factura VIGENTE de la cotización, escribe `nro_factura`/`fecha_factura` en `Cotizaciones` y, si está fondeada, pasa `estado_financiero` a `FACTURADA` (misma lógica que `marcarFacturada` hoy). Facturas adicionales no cambian el estado.
- `listarPorCotizacion(id_cotizacion)` — facturas VIGENTES + ANULADAS.
- `editar(id, data)` — corrige datos (con guard de unicidad).
- `anular(id)` — anulación lógica (`estado='ANULADA'`). Si era la que disparó `FACTURADA` y no quedan otras vigentes, revierte el estado financiero (reusa la lógica de `revertirFacturacion`).
- **Cuadre suave:** si `SUM(facturas VIGENTES.total) ≠ total de la cotización`, se expone un flag/aviso (no bloquea — soporta anticipo/saldo).

Rutas nuevas bajo `requireAuth` + `requireModulo('FINANZAS')` + `validateParams(Zod)`:
- `GET  /api/facturas-venta/preview/:id_cotizacion`
- `GET  /api/facturas-venta?id_cotizacion=N`
- `POST /api/facturas-venta`
- `PUT  /api/facturas-venta/:id`
- `POST /api/facturas-venta/:id/anular`

`marcarFacturada`/`revertirFacturacion` de `CobranzasService` se mantienen como helpers internos reutilizados por el service nuevo (o se invocan desde él) para no duplicar la transición de estado.

### 3. Frontend — `public/js/pages/Finanzas.js`

- Modal **"Registrar factura"** (mismo lugar que hoy): inputs primarios = **nro/serie + fecha + PDF** (igual de simple que ahora). Campos estructurados (base, IGV, total, tipo, detracción, retención) **pre-llenados desde la cotización** y **plegados** en un "▸ Detalle de la factura (editable)" — el usuario solo confirma. El PDF sigue siendo opcional.
- **Detalle de cobranza:** lista la(s) factura(s) VIGENTES con **👁 Ver / ⬇ Descargar / ✎ Editar / ⊘ Anular** + botón "➕ Agregar factura" (caso anticipo/saldo). Aviso de cuadre si la suma no coincide.
- Se retira la UI muerta de Nubefact: badges/selectores de `estado_sunat` en `Finanzas.js` (~2319, ~2433) y `Contabilidad.js` (~385), y cualquier pantalla/diagnóstico de facturación electrónica.
- Reglas: cero `alert()` (#16), modales sin backdrop-close (#28), cache buster `?v=` bump `r2 → r3` en los 22 imports de `app.js` + `index.html` (#36).

### 4. Retiro de Nubefact

Eliminar (auto-contenidos; verificado que nadie externo los importa):
- `app/modules/facturacion/FacturaService.ts`
- `app/modules/facturacion/NubefactService.ts`
- `app/modules/facturacion/NubefactPayloadBuilder.ts`
- `app/modules/facturacion/FacturaPDFService.ts`
- `app/modules/facturacion/PLEExporter.ts`
- `app/modules/facturacion/FacturacionCron.ts`
- En `index.ts`: imports (líneas 38-45), `facturasRouter` (`/api/facturas`), `facturacionRouter` (`/api/facturacion/diagnostico`), rutas PLE, e inicialización de `FacturacionCron`.

NO se tocan: Notas de Crédito, `FacturaOCService` (facturas de proveedor), el resto del módulo Finanzas.

### 5. Migración y datos de producción

Nueva migración `0XX_factura_venta.sql` (número siguiente disponible, se fija en el plan), aplicada vía MCP a Supabase:
1. `CREATE TABLE FacturaVenta`.
2. **Back-fill:** por cada `Cotizaciones` con `nro_factura IS NOT NULL`, insertar 1 fila `FacturaVenta` con los montos de la cotización (`base`, `igv`, `total`, detracción), `tipo='FACTURA'`, `fecha_emision=fecha_factura`, `estado='VIGENTE'`. (serie/numero: parsear `nro_factura` formato `XXXX-NNNN` best-effort; si no parsea, guardar crudo en `serie`/`numero=0` y marcar para revisión.)
3. **Reasignar adjuntos:** los `Adjuntos` con `ref_tipo='FacturaVenta'` y `ref_id=id_cotizacion` (PR #33) se repuntan a `ref_id=id_factura_venta` de la fila recién creada para esa cotización.
4. **Drop guarded de `Facturas` + `DetalleFactura`:** la migración cuenta filas; si `Facturas` tiene >0 filas, **aborta con error** (no dropea) y avisa para revisión manual. Si está vacía (caso esperado: STUB nunca usado en real), dropea ambas.

**Seguridad de datos:** `npm run db:backup` ANTES de aplicar la migración (convención del repo). Migración 100% aditiva en lo que importa; el único DROP es de tablas STUB vacías (con guard que aborta si no lo están).

### 6. Errores y validación

- Zod en las rutas de escritura: `serie`/`numero`/`fecha_emision`/`total` requeridos; tipos numéricos coercionados; `tipo`/`moneda` enum.
- Duplicado `(tipo, serie, numero)` → mensaje claro ("ya existe esa factura"), no error pg crudo.
- Si falla el upload del PDF, la factura igual queda registrada → `showError`/aviso, no se revierte (se sube luego desde el detalle). Mismo patrón que PR #33.

### 7. Testing

- Unit test de `FacturaVentaService`: crear (primera → FACTURADA + escribe nro en Cotizaciones), agregar segunda (no cambia estado), anular (revierte si era la disparadora), cuadre suave.
- Verificación del back-fill: `COUNT(FacturaVenta) == COUNT(Cotizaciones WHERE nro_factura IS NOT NULL)` tras migrar.
- `npx tsc --noEmit` limpio + `check_mojibake` OK antes de pushear.
- Smoke manual: registrar factura en cotización fondeada → ver/descargar PDF → editar → anular → agregar segunda factura.

## Riesgo

Medio. Aditivo en data (nada se borra salvo tablas STUB vacías, con guard), pero toca varias zonas: migración + service + rutas + `Finanzas.js` + borrado de 6 archivos + reasignación de adjuntos. Mitigación: backup previo, migración guarded, verificación en cada paso, todo en rama `claude/*` con merge gateado por Julio.

## Fuera de alcance (YAGNI)

- Registro de Ventas / PLE desde las facturas manuales (otra pasada; `FacturaVenta` queda lista).
- Facturas de proveedor (compras/OC).
- Notas de crédito de venta (emitir NC en SUNAT y subirla) — futura extensión del mismo patrón.
- Detalle línea por línea de la factura (`DetalleFactura`) — el manual solo necesita totales + PDF.
- Validación del XML/CDR de SUNAT — solo se guarda el PDF tal cual.

# ESTADO DEL PROYECTO — ERP-PRO

> **LEER PRIMERO.** Este documento es la fuente de verdad sobre qué está hecho, qué falta y dónde estamos parados. Se actualiza al cierre de cada sesión de trabajo.

**Última actualización:** 2026-05-03 (noche — sesión continuación: modal ROC en Logística + unificar cálculo de Caja entre KPI Finanzas y alerta CAJA_BAJA)
**Rama activa:** `main`
**Último commit pusheado:** `041569e fix: unificar cálculo de Caja entre KPI Finanzas y alerta CAJA_BAJA`
**Servidor dev:** `npx ts-node index.ts` en `D:\proyectos\ERP-PRO` → `http://localhost:3000`
**Producción:** `erp-pro-production-e4c0.up.railway.app` — Railway (deploy automático desde main)
**Cache buster JS actual:** `v=20260503r4` (app.js) — **convención**: hardcoded en CADA import dentro de app.js. Ver gotcha #36 en CLAUDE.md.
**Migraciones BD:** 001 → 037 + 042 → 050 aplicadas (Supabase Postgres project `fhlrxlsscerfiuuyiejw`). Sin migraciones nuevas hoy (todo el trabajo fue Service + UI; el patrón de cascada usa los CHECKs/FKs existentes).

---

## ✅ Estado del repositorio

Working tree de este worktree **limpio**. Todo commiteado y pusheado a `origin/main`.
Railway desplegado y operativo con 41 tablas. Build limpio (`npx tsc --noEmit` pasa).

> **Heads up para próxima sesión:** el worktree principal `D:/proyectos/ERP-PRO` puede tener archivos modificados sin commit — son WIP de Julio. NO tocar sin preguntar.

---

## Módulos completados y operativos

| Módulo | Backend | Frontend | Migraciones | Estado |
|---|---|---|---|---|
| **Auth / Login JWT** | `app/modules/auth/` + `app/middlewares/auth.ts` | `public/login.html` | `002_auth_usuarios.sql` | ✅ Operativo |
| **Comercial / Cotizaciones** | `app/modules/comercial/` (5 services) | `public/js/pages/Comercial.js` + `ConfiguracionComercial.js` | `004, 005, 010, 011, 012` | ✅ Operativo |
| **Servicios** | `app/modules/services/CatalogService.ts` | `Servicios.js` | `001_multimoneda.sql` | ✅ Operativo |
| **Compras** | `app/modules/purchases/PurchaseService.ts` + `ProvidersService.ts` | `Compras.js` + `Proveedores.js` | `008, 009` | ✅ Operativo |
| **Inventario** | `app/modules/inventory/InventoryService.ts` | `Inventario.js` | — | ✅ Operativo |
| **Finanzas / Flujo** | `app/modules/finance/FinanceService.ts` + `CobranzasService.ts` + `TipoCambioService.ts` | `Finanzas.js` | `013-019` | ✅ Operativo |
| **Préstamos** | `app/modules/finance/PrestamosService.ts` | `Prestamos.js` | `003b_triggers_prestamo.sql` | ✅ Operativo |
| **Tributario** | `app/modules/finance/TributarioService.ts` | (en Finanzas) | — | ✅ Operativo |
| **Dashboard** | (agregados en varios services) | `Dashboard.js` | — | ✅ Operativo |
| **Administración** | `app/modules/admin/` | `Administracion.js` | — | ✅ Operativo |
| **Logística** | (compartido con purchases/finance) | `Logistica.js` | `007_logistica_campos.sql` | ✅ Operativo |
| **Usuarios** | `app/modules/auth/` | `Usuarios.js` | `002_auth_usuarios.sql` | ✅ Operativo |

**Sidebar cargado con 7 secciones** · **Branding Metal Engineers aplicado** (logos en `public/img/`, paleta en `public/css/main.css`).

---

## Módulo Comercial — detalle de features

- **Cotizaciones independientes por marca** con correlativos separados:
  - Metal Engineers: `COT 2026-NNN-MN` (moneda nacional PEN)
  - Perfotools: `COT 2026-NNN-ME` (moneda extranjera USD)
- **Dashboard de cotizaciones:** totales por moneda, pipeline activo, tasa de aprobación, top 8 clientes, tendencia 6 meses
- **Estados:** `EN_PROCESO`, `ENVIADA`, `APROBADA`, `NO_APROBADA`, `RECHAZADA`, `TERMINADA`, `A_ESPERA_RESPUESTA`, `ANULADA`
- **Edición** solo en `EN_PROCESO` y `A_ESPERA_RESPUESTA`
- **Anulación lógica** (no física) con archivo de anuladas
- **Generación de PDF** (`CotizacionPDFService.ts`, 367 líneas)
- **Subida a Google Drive** (`GoogleDriveService.ts`) con campos `drive_file_id` y `drive_url` persistidos
- **Subida de fotos de ítems** vía Cloudinary (`CloudinaryService.ts`)
- **Configuración de marca editable** (`ConfiguracionMarcaService.ts`) para datos de contacto en PDF

---

## ⚠️ Bugs / observaciones pendientes

1. ~~**Correlativos `COT 0000-000-MN`**~~ → resuelto: no existen en Supabase (verificado 01/05/2026 vía MCP). Era basura de MySQL local.
2. ~~**Race condition en correlativos**~~ → resuelto en `192f452` (02/05/2026): UPDATE-then-INSERT con retry-on-duplicate (5 intentos máx). Maneja correctamente la concurrencia del primer correlativo del año/marca.
3. ~~**Archivos `*_temp.txt` en raíz**~~ → 9 archivos borrados 02/05/2026.
4. ~~**`COT-2026-002-ME.pdf` en raíz**~~ → borrado 02/05/2026. `.gitignore` ya tiene patrón `COT-*.pdf`.
5. ~~**Worktrees basura en `.claude/worktrees/`**~~ → pruneado 02/05/2026 (`awesome-satoshi-ec1075`).
6. ~~**Auditoría V3 pendiente**~~ → cerrada 02/05/2026: A02/A06/F06 ya estaban; F01 cerrado en `18fa474` (Dashboard.js → api.administracion).
7. ~~**Libro Bancos — nro_operacion duplicado**~~ → fixed `783a629` (02/05/2026): scrub global ANTES del tipoMatch. Validar empíricamente al primer EECC importado.
8. ~~**Libro Bancos — KPI Comisiones = S/ 0.00**~~ → no es bug. `MovimientoBancario` vacío en producción. La heurística `esComisionImportada()` cubre ITF/N/D/COM./PORTE cuando llegue el primer EECC.

**Bugs activos al cierre del 02/05/2026:**
- (latente, no urgente) `PurchaseService.registrarCompra()` usa `'INGRESO'` cuando dashboards filtran `'ENTRADA'`. La nueva ruta OC ya usa `'ENTRADA'`. Compras directas no aparecerían en KPI hasta alinear (`PurchaseService.ts:208,:277`). Sin impacto hoy: 0 compras directas en producción.

---

## Próximos pasos acordados

- [x] ~~Hacer commit del trabajo sin commitear~~ → `122b0ea`
- [x] ~~Push a `origin/main`~~ → pusheado + Railway desplegado
- [x] ~~Rediseño Enterprise UI~~ → 10 commits desplegados al 27/04 (ver sección abajo)
- [x] ~~Fotos Cloudinary funcionando~~ → 7 commits 27-28/04 (CSP + pre-fetch + env vars Railway)
- [x] ~~Eliminar cotización física (duplicados)~~ → botón solo GERENTE en EN_PROCESO/A_ESPERA
- [x] ~~Editar ítem existente dentro de cotización~~ → botón ✎ con banner ámbar
- [x] ~~Sidebar mobile no abre módulos al tap~~ → fix z-index en `sidebar.css` (`6025290`)
- [x] ~~Subir foto HEIC desde iPhone (rebotaba con "solo JPG/PNG/WebP")~~ → filtro `image/*` + extension fallback (`5ebf77e..61fa07b`)
- [x] ~~Botón 👁️ Ver para previsualizar PDF antes de descargar~~ → modal con iframe (`f4a88ac`)
- [x] ~~Seed faltante de `ConfiguracionMarca` en producción~~ → INSERT vía Supabase MCP, 28/04 mediodía
- [x] ~~Logos editables por marca desde Configuración Empresa~~ → migración 043 + endpoint upload (`aa08c9c`)
- [x] ~~OC: editar y eliminar~~ → con confirmación (`140a61a`)
- [x] ~~OC: botón 👁️ Ver para preview PDF~~ → paridad con Cotizaciones (`e96504c`)
- [x] ~~SPA: preservar módulo al hard reload~~ → `ebff50f` + `0fa9a63`
- [x] ~~Sidebar colapsable para ganar espacio~~ → `«` + `☰` flotante (`9911ad3`, 30/04)
- [x] ~~Configuración: editar firmas y contacto OC~~ → tarjeta nueva en tab Empresa (`b6bffc0`)
- [x] ~~OC PDF: cuentas bancarias del proveedor~~ → con moneda PEN/USD por cuenta (`d956b7f` + `d3291a2`)
- [x] ~~OC firmas vivas (no snapshot)~~ → cambios en cfg aplican retroactivo (`503175e`)
- [x] ~~Reactivar OC anulada~~ → vuelve a BORRADOR, modal + fila inline (`70cbbe0` + `0e98a3f`)
- [x] ~~Cache busting de imports ES module~~ → hardcoded en cada import (`09dfb58`)
- [x] ~~Fix PDF cotización: cierre montado sobre footer~~ → ensureSpace en condLine/condPar + bloque indivisible (`e805ec5`)
- [x] ~~OC: refrescar inline en Logística sin navegar~~ → helper refreshOC (`36165fa`)
- [x] ~~Verificar end-to-end PDF~~ (Julio confirmó funcionando)
- [x] ~~Verificar end-to-end fotos~~ (Julio confirmó funcionando)
- [ ] Rotar `CLOUDINARY_API_SECRET` (acción manual de Julio en console.cloudinary.com + Railway env var)
- [x] ~~Investigar 2 registros `COT 0000-000-MN`~~ → no existen en Supabase (verificado 01/05/2026 vía MCP). Era basura de MySQL local.
- [x] ~~Fix KPI comisiones en Libro Bancos~~ → no es bug. Tabla `movimientobancario` vacía. Cuando se importe el primer EECC, la heurística de `esComisionImportada()` ya cubre ITF/N/D/COM./PORTE.
- [x] ~~Race condition correlativos cotizaciones~~ → fixed `192f452` 02/05/2026 (UPDATE-then-INSERT con retry-on-duplicate, 5 intentos máx).
- [x] ~~Resolver hallazgos auditoría V3~~ → A02/A06/F06 ya estaban; F01 cerrado en `18fa474` 02/05/2026 (Dashboard.js → api.administracion).
- [x] ~~Eliminar worktrees basura en `.claude/worktrees/`~~ → pruneado 02/05/2026. La carpeta física se borra al cerrar el proceso que la tiene abierta (lock de Windows).
- [x] ~~Limpiar archivos `*_temp.txt`, `COT-2026-002-ME.pdf`, `auditoria_*.pdf|txt` en raíz~~ → 9 archivos borrados 02/05/2026.
- [x] ~~Fix nro_operacion duplicado en descripción de EECC importados~~ → fixed `783a629` 02/05/2026 (scrub global ANTES del tipoMatch en parser).
- [ ] **Decisión estratégica:** ¿Fase B (facturación electrónica STUB→REAL) o verificación end-to-end Fase C primero?
- [x] ~~Módulo Logística completo (UI con 3 tipos: GENERAL/SERVICIO/ALMACEN)~~ → ya implementado (hub Logistica.js con 6 tabs, `tipo_oc` ENUM en OrdenesCompra). Verificado mapping 02/05/2026.
- [x] ~~OC de servicios en Finanzas~~ → ya implementado (`tipo_oc='SERVICIO'` + `id_servicio` en OrdenesCompra, sin tabla aparte). Verificado 02/05/2026.
- [x] ~~Almacén valorizado con kárdex por ítem~~ → ya implementado (costo promedio ponderado en PurchaseService, MovimientosInventario polimórfico, endpoint `GET /inventario/:id/kardex`, modal kárdex en Inventario.js). Verificado 02/05/2026.
- [x] ~~Fase C — implementación completa del flujo OC integrado~~ → cerrada en `58f7aec` 02/05/2026: recibir() afecta Inventario+kárdex; facturar() split por tipo; modal de resolución de ítems sin id_item.
- [x] ~~Fase C — verificación end-to-end~~ → Julio probó OC ALMACEN `002-2026` (BOTELLA OXIGENO S/140), `001-2026 ALMACEN` (6 ítems), funciona stock+kárdex+costo. Inventario quedó con 6 ítems valorizados S/557.
- [x] ~~UX recepción OC: reemplazar prompts nativos por modal con tabla~~ → `18db593`
- [x] ~~UX crear ítem: reemplazar prompts por mini-modal con dropdown enum válido~~ → `89241fc`
- [x] ~~Migración 045 (movimientosinventario referencia ORDEN_COMPRA)~~
- [x] ~~Comentarios internos visibles en lista de cotizaciones~~ → `a57c4f3`
- [x] ~~estado_financiero se cierra al rechazar/anular cotización~~ → `7ff73b0`
- [x] ~~Editar cobranza ya registrada (PUT + sync MovBancario)~~ → `03137c3`
- [x] ~~Atajo ✎ Editar en fila de bandeja~~ → `361e00e`
- [x] ~~Cobranza inserta Tx INGRESO (Dashboard Gerencial)~~ → `46c57ff` + migración 046
- [x] ~~Estado nuevo TRABAJO_EN_RIESGO~~ → `46bbd0a` + `ba60d26` + migración 047
- [x] ~~Form multi-item Factura + PDF estilo SUNAT~~ → `311f4f7` + migraciones 048-050
- [x] ~~Fechas editables en cotización (form + botón 📅)~~ → `52a98d5` + `1fd8d98`
- [x] ~~Fechas editables en OC (botón 📅)~~ → `dbc9440`
- [x] ~~OC editar metadata + eliminar con cascada total (Fase 1)~~ → `b76abf7` (03/05)
- [x] ~~Replicar editar/eliminar universal a Cotizaciones, Compras, Gastos, Items (Fase 3)~~ → `2119ec2` (03/05)
- [x] ~~Modal "Recibí factura" honesto sobre NC (no prometer pantalla inexistente)~~ → `337b20b` (03/05)
- [x] ~~Tooltips en todos los iconos discretos (×, ✕, 🗑, ✓, ⊘, 📅, ⟲)~~ → `97a7e8e` (03/05)
- [ ] **PRIORIDAD ALTA — Módulo NCs entrantes (recibir NC del proveedor):** 2-3 horas. Cierra loop "y si me equivoco después de facturar" + es prerequisito SUNAT SIRE Fase B. Tablas `NotasCredito`/`NotasDebito` ya creadas (migración 026), builder de payload SUNAT ya listo (`NubefactPayloadBuilder.buildNotaCredito`). Falta: NotaCreditoService + rutas + pantalla.
- [ ] **PRIORIDAD MEDIA — UI directa de Gastos:** 1.5 horas. Backend listo (`FinanceService.editarMetadata` + `deleteGasto` con cascada + endpoints + api client). Falta: tab en Logística o Finanzas con vista cruzada de TODOS los gastos para revisión contable mensual.
- [ ] **PRIORIDAD BAJA — Limpiar Servicios legacy:** 30 min. La tabla tiene 0 rows en producción (Camino A vació su uso). Sacar `Servicios.js` del `app.js` + archivar `CatalogService.ts`. Ya no está en el sidebar (90% deprecada de facto).
- [ ] **PRIORIDAD MUY BAJA — Fase 2 OC edit pesado en estados avanzados:** 6+ horas, alto riesgo. Cambiar items/montos en RECIBIDA/FACTURADA con reverso/regenerate automático de Tx/Compras/Inventario. Workaround actual (Fase 1 + 🗑 Eliminar) ya cubre el 90% de casos reales.
- [ ] **Bonus Fase C:** agregar campo opcional "Item del catálogo" en form de creación de OC (no urgente — modal de resolución cubre el caso al recibir).
- [ ] **Bug latente alineado pero sin fix:** `PurchaseService.registrarCompra()` usa `'INGRESO'` mientras dashboards filtran `'ENTRADA'`. La nueva ruta de recibir OC ya usa `'ENTRADA'`. Cuando se haga la primera compra directa, los dashboards no la verán hasta que se alinee. **Fix sugerido:** cambiar `INGRESO` → `ENTRADA` en `PurchaseService.ts:208` y `:277`. No urgente (0 compras directas en producción).
- [ ] Replicar hints contextuales (`.app-form-hint`) en Cotización/Logística OC/Compras/Cobranzas (cosmético, valor marginal — Comercial y OC ya tienen tooltips inline `tip()`)
- [ ] G20 — QA mobile real iPhone Safari + Android Chrome con dispositivo físico
- [ ] Empty states en Comercial/Alertas/Contabilidad (cosméticos)
- [ ] Refactor de iconos emoji → Lucide en KPIs de Administración/Inventario/Préstamos/OC/Contabilidad

## Rediseño Enterprise UI — 27/04/2026 (cerrado)

**10 commits desplegados a `origin/main`** en una sola sesión. Cero impacto en backend/lógica/datos.

| Commit | Bloque |
|---|---|
| `086d0f6` | Semana 1 — sidebar slate-950 + header refactor + Inter 300-800 + tabular-nums global + sprite Lucide + helper `icon()` |
| `bd6f712` | G11 — cards/tablas/badges enterprise |
| `30da2e9` | G17 — formularios con focus ring |
| `3604cb8` | G18-G19 — microinteracciones + focus visible WCAG AA |
| `0e728d2` | G8/G9/G10 helpers (KpiCard v2, Pill, EmptyState) + G12 piloto Dashboard Tesorería |
| `f4ec59e` | G13 piloto Comercial pills semánticos |
| `6142046` | G14/G15/G16 — pills en Finanzas/OC/Administración |
| `70ec1bd` | Dashboard B+D + KPIs Comercial/Finanzas/Logística enterprise + 2 empty states |
| `b48ade5` | Hints contextuales en Configuración Empresa (piloto del patrón `.app-form-hint`) |

## Cotizaciones — fotos y edit ítem (27-28/04/2026)

**7 commits adicionales** sobre el módulo Comercial. Fixes y features pedidos por Julio tras desplegar el rediseño.

| Commit | Cambio |
|---|---|
| `af1f17b` | Multilínea en `precios_incluyen` y `forma_pago` (botones +/× para agregar líneas, bullets `•` en PDF si 2+ líneas) |
| `4652644` | CSP `index.html` permite Cloudinary + pre-fetch fotos URL→Buffer en PDF (pdfkit no bajaba HTTPS) + foto debajo del subtotal + header tabla con color de marca |
| `c517771` | Cache buster JS bumpeado `v=20260427r5` + `window.showSuccess/Error/Toast` expuestos en app.js + botón "🗑 Eliminar" físico para duplicados (solo GERENTE, EN_PROCESO/A_ESPERA, doble confirmación con texto) |
| `efc2941` | Mensaje claro 503 cuando Cloudinary no está configurado (en lugar del críptico "Must supply api_key") |
| `adce913` | Cloudinary acepta `CLOUDINARY_URL` único O las 3 vars separadas |
| `cdfa4a5` | Límite foto 5MB → 10MB (fotos celulares modernos) |
| `6a56765` | Fix crítico `idpEdit`: guion → underscore. El guion en `onclick="window.__removeLinea_perfotools-edit(0)"` rompía con "edit is not defined" (pantalla roja) |
| `90bedbf` | Editar ítem existente inline: botones ✎/✕, banner ámbar, btnAdd → "Guardar cambios" en modo edit, ítem marcado con borde ámbar al editar |

**Configuración Railway (hecha por Julio el 27/04 23:25):**
- `CLOUDINARY_CLOUD_NAME=dyvzfg6sx`
- `CLOUDINARY_API_KEY=331187149616955`
- `CLOUDINARY_API_SECRET=<el secret de la API key Root>`

**Archivos nuevos clave:**
- `public/css/tokens.css` — variables `--app-*`
- `public/css/components/sidebar.css` | `header.css` | `cards-tables.css` | `forms.css` | `motion-states.css`
- `public/lib/icons.svg` — sprite Lucide 36 iconos
- `public/js/components/Pill.js` — helper de pills semánticos con mapping de estados ERP
- `public/js/components/EmptyState.js` — empty states diseñados

**Archivos modificados clave:**
- `public/index.html` — links a los nuevos CSS, weights Inter 300-800
- `public/js/components/Sidebar.js` — refactor completo
- `public/js/components/KpiCard.js` — soporta iconos Lucide + accent semántico
- `public/js/services/ui.js` — agregado helper `icon(name, opts)`
- `public/js/pages/Dashboard.js` | `Comercial.js` | `Finanzas.js` | `Logistica.js` | `OrdenesCompra.js` | `Administracion.js` | `Compras.js` | `Configuracion.js` — refactors puntuales

**Patrón:** CSS aditivo + adapters JS legacy → enterprise. Las clases legacy de main.css siguen funcionando, los archivos enterprise sobreescriben por orden de cascada.

**Detalles completos:** ver memoria `project_redesign_enterprise.md` en `~/.claude/projects/D--proyectos-ERP-PRO/memory/`.

---

## Sesión 28/04 tarde — sidebar mobile + uploads HEIC + preview PDF + seed ConfiguracionMarca

Sesión de bugfixes UX reportados por Julio probando en producción. Mezcla de mobile, uploads y data fix. **6 commits pusheados a `main`** (`6025290..3c351b3`) + 1 commit de housekeeping pendiente.

| Commit | Cambio |
|---|---|
| `6025290` | Fix sidebar mobile no abría módulos al tap. Causa: `sidebar.css` se carga después de `main.css` y su regla base (`z-index: var(--app-z-sidebar) = 100`) anulaba la intención mobile (`z-index: 1000` de main). El overlay (`z-index: 999`) quedaba sobre el sidebar y capturaba todos los taps, ejecutando solo `closeMobileSidebar()`. **Fix:** `z-index: 1000` explícito en el `@media (max-width:768px)` de `sidebar.css`. Bump cache buster a `v=20260428r2`. |
| `5ebf77e` | Upload de fotos: extender whitelist de mimetypes para aceptar HEIC/HEIF/AVIF/GIF (además de los 3 originales JPG/PNG/WebP). Caso real: cliente manda foto por WhatsApp desde iPhone, llega a la PC en HEIC. |
| `85439c3` | Refactor del filtro a `image/*` (más permisivo) + `accept="image/*"` en el `<input>`. Mensaje de error nuevo incluye el MIME real recibido para diagnóstico. |
| `61fa07b` | **Fix crítico HEIC en Chrome Windows:** Chrome sin la extensión HEIF/HEVC instalada manda los `.HEIC` con mimetype `application/octet-stream`, no `image/heic`. El filtro miraba solo el MIME y rebotaba. Solución: aceptar si MIME es `image/*` **O** la extensión del nombre matchea `\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?|svg|ico)$`. |
| `f4a88ac` | Feature 👁️ Ver para preview de PDF antes de descargar. Botón nuevo abre modal centrado con iframe que renderiza el PDF en el visor nativo del navegador. Botones internos: 📥 Descargar (genera `<a download>` con blob URL) y Cerrar (revoca el blob URL). El ✕ flotante de `app.js:285` también funciona porque el botón Cerrar tiene `data-close`. |
| `3c351b3` | Surface del error real del backend en el toast del PDF (antes solo mostraba "HTTP 500"). Helper compartido `fetchPDFCotizacion(id)` extrae `body.error` cuando `!r.ok` y lo concatena al mensaje. Esto permitió diagnosticar el bug de seed faltante. |

**Bug fix de data en producción (vía Supabase MCP, NO commit):**
- `ConfiguracionMarca` estaba **completamente vacía** en Supabase Postgres (project `fhlrxlsscerfiuuyiejw`) — METAL y PERFOTOOLS faltantes. Por eso `getByMarca()` tiraba `Configuración no encontrada` y el PDF respondía 500.
- INSERT directo en Supabase con valores reales actualizados. Brand-account split: METAL solo PEN, PERFOTOOLS solo USD. Confirmado vía SELECT que ambos rows quedaron OK.

**Datos empresa actualizados (Julio confirmó al 28/04 mediodía):**
- Dirección oficial nueva: `Av. San Juan 500-598, Asoc. Independencia, Puente Piedra, Lima, Perú` (reemplaza la vieja "Calle Rio Cenepa, La Molina")
- Email empresa: `proyectos@metalengineers.com.pe` (era `administracion@metalengineers.com.pe`)
- Teléfono Julio: `984 327 588` (era `933 440 483`)
- Cuentas Interbank: METAL=PEN 200-3004523324, PERFOTOOLS=USD 200-3007027785 (sin cuenta cruzada)
- Mismo RUC para las 2 marcas: 20610071962

**Housekeeping commiteado en esta sesión (al final):**
- `database/migrations/011_configuracion_marca.sql` — seed sincronizado con producción para que un bootstrap futuro de BD desde cero use la dirección/teléfono/email correctos.
- `app/modules/comercial/CotizacionPDFService.ts` — defaults hardcoded de fallback si `ConfiguracionMarca` se vacía otra vez. `try/catch` alrededor de `getByMarca()` y un `DEFAULT_CFG_BY_MARCA` con los datos reales.
- `CLAUDE.md` — sección "Datos empresa" actualizada + tabla bancaria por marca + clarificación del brand-account split.
- `ESTADO.md` — este bloque + bump del header.

**Pendiente de verificación end-to-end (Julio próxima sesión):**
- Confirmar que `👁️ Ver` muestra el PDF en modal sin error.
- Confirmar que `📄 PDF` baja el archivo OK.
- Probar las DOS marcas (Metal y Perfotools) — el bug del seed afectaba a las dos pero las síntomas aparecieron solo en Perfotools.

---

## Sesión 28/04 noche-29/04 — pulido PDF cotizaciones + logos editables

**6 commits pusheados a `main`** (`a5b194d..aa08c9c`). Todo cosmético del PDF + feature nuevo de logos editables.

| Commit | Cambio |
|---|---|
| `a5b194d` | CSP: permitir `frame-src 'self' blob:` y `object-src 'self' blob:` para que el preview de PDF en modal (iframe con blob URL) funcione en producción. |
| `ac372cf` | Espaciado del PDF: header de tabla más alto, saludo con margen, "Total" → "SON" (en letras) con mejor separación. |
| `2eb0fa7` | Header de tabla en 2 líneas (cabe el texto largo) + aire antes de la primera fila. |
| `85b7b88` | Fix path de logos en PDF: usar `process.cwd()` en lugar de `__dirname` para que funcione tanto en dev como en Railway. |
| `aa08c9c` | **Feature:** subir logos de marca desde Configuración Empresa (frontend + endpoint). Cloudinary upload reusado. METAL y PERFOTOOLS pueden tener logos distintos editables sin tocar código. Migración 043 (`configuracion_marca_logos`). |

---

## Sesión 28/04-29/04 — Órdenes de Compra (mejoras UX)

**5 commits pusheados a `main`** (`140a61a..e96504c`). Refactor del módulo OC con paridad respecto a Cotizaciones.

| Commit | Cambio |
|---|---|
| `140a61a` | **Feature:** editar y eliminar OC + alertas en transiciones de estado (con confirmación). |
| `6fb910d` | Refrescar el módulo OC sin recargar la página completa al cambiar estado. |
| `ebff50f` | Fix SPA: preservar el módulo actual al hacer hard reload (Ctrl+Shift+R no te tira al dashboard). |
| `0fa9a63` | Fix SPA: respetar el primer segmento del hash con sub-rutas (`#logistica/general` no fuerza re-navegación al cambiar pestaña interna). |
| `e96504c` | **Feature:** botón 👁️ Ver en OC para preview de PDF en modal (paridad con Cotizaciones). PDF mejorado con header marca + tabla legible. Migración 042 (`oc_unique_por_centro_costo`). |

---

## Sesión 30/04 — Sidebar colapsable

**1 commit pusheado a `main`** (`9911ad3`). Mejora UX solicitada por Julio para ganar espacio de trabajo.

- Botón `«` arriba a la derecha de la sidebar la oculta (transform translateX(-100%) + main-content reflow a 100vw).
- Aparece botón flotante `☰` arriba a la izquierda para volver a mostrarla.
- Estado persistido en `localStorage.erp_sidebar_collapsed` — sobrevive al reload.
- Solo aplica en desktop (≥769px). En mobile sigue el hamburger existente.
- **Nota técnica:** se descartaron las `transition: ... 0.22s` en `.sidebar` y `.main-content` porque Chromium no dispara la transición cuando una clase del `<body>` cambia en runtime y los selectores combinan media query + descendiente. Colapso instantáneo es lo correcto.

**Archivos tocados:**
- `public/js/components/Sidebar.js` — botón `«` en el render
- `public/css/components/sidebar.css` — `.app-sidebar-toggle`, `.app-sidebar-show`, reglas `body.sidebar-collapsed` (scoped a desktop)
- `public/js/app.js` — botón flotante `☰` en el shell, `window.toggleSidebarCollapse`, restauración del estado al iniciar
- `public/index.html` — cache busters bumpeados (`sidebar.css?v=20260430r3`, `app.js?v=20260430r1`)

---

## Sesión 30/04 noche → 01/05 — pulido OC + cuentas proveedor + reactivar (10 commits)

Sesión muy operativa: arreglos de UX en cotizaciones+OC pedidos por Julio mientras testeaba en producción, terminó con un episodio de build roto que tapó deploys ~3 hs. Todo cerrado y desplegado.

| Commit | Cambio |
|---|---|
| `e805ec5` | Fix PDF cotización: el texto de cierre se montaba sobre el footer cuando las condiciones eran largas. `condLine`/`condPar` ahora pre-calculan altura y llaman `ensureSpace`. Cierre + firma como bloque indivisible. |
| `36165fa` | Fix OC: refrescar inline cuando está embebida en Logística. El navigate('ordenes-compra') sacaba al usuario del hub. Helper `refreshOC()` detecta `#logi-panel-oc` y re-renderiza in-place. 7 acciones reemplazadas (aprobar, enviar, recibir, facturar, anular, eliminar, create/edit). |
| `b6bffc0` | **Feature:** Configuración → Empresa ahora tiene tarjeta "Firmas y contacto en OC" con 6 campos editables (oc_solicitado_default, oc_revisado_default, oc_autorizado_default, oc_contacto_nombre, oc_contacto_telefono, oc_ciudad_emision). Backend ya aceptaba via PUT /api/config (pasa-todo a ConfiguracionService.update). |
| `d956b7f` | **Feature:** OC PDF muestra cuentas bancarias del proveedor. La query `obtener(id_oc)` jalaba solo razon_social y ruc; ahora trae también `tipo, dni, direccion, telefono, email` (estos también salían vacíos antes) + las 6 columnas bancarias. PDF muestra `Cta. {Banco} N°{numero} / CCI {cci}` por cada banco con número. |
| `d3291a2` | **Feature + migración 044:** moneda explícita por cuenta bancaria (banco_1_moneda, banco_2_moneda VARCHAR(3) defaults 'PEN'/'USD'). UI Proveedores muestra dropdown PEN/USD por cuenta. PDF ahora muestra `Cta. {Banco} {Soles\|Dólares} N°{numero}`. Aplicada también en Supabase. |
| `503175e` | Fix OC firmas: antes se snapshoteaban al crear OC desde cfg.oc_*_default a las columnas de OrdenesCompra, así que cambiar Configuración no afectaba a OCs existentes. Ahora `OrdenCompraPDFService` lee dinámicamente con fallback al snapshot per-OC. `OrdenCompraService.create` deja columnas en NULL salvo override explícito. **Limpieza vía MCP:** UPDATE ordenescompra SET solicitado_por=NULL... (4 filas) para que las OCs históricas reflejen el config actual. |
| `70cbbe0` | **Feature:** reactivar OC anulada. `OrdenCompraService.reactivar(id)` valida estado=ANULADA, UPDATE estado=BORRADOR + motivo_anulacion=NULL. Ruta POST `/api/ordenes-compra/:id/reactivar` solo GERENTE. Botón "♻ Reactivar" en accionesSegunEstado del modal. |
| `0e98a3f` | Reactivar también en la fila inline de Logística (Gastos Generales/Servicio/Almacén tab), no solo dentro del modal. Más obvio para el usuario. |
| `09dfb58` | **Fix de raíz para cache:** los `import` de `app.js` (pages, components, services) NO tenían cache buster, solo `app.js` lo tenía. Browser refetcheaba app.js fresco pero servía pages/ desde caché → fixes invisibles. Hardcodeado `?v=20260430r7` en los 19 imports. **Convención**: a partir de ahora se bumpea ese sufijo en TODAS las líneas + en index.html cuando se cambia algo en `public/js/`. |
| `d285f31` | **Post-mortem build:** el commit 70cbbe0 introdujo `auditLog('OrdenCompra', 'REACTIVAR')` pero `'REACTIVAR'` no estaba en el type `AuditAccion`. tsc fallaba → Railway nixpacks no buildeaba → ningún push de los últimos ~3 hs se desplegó. Agregado `'REACTIVAR'` al ENUM. **Lección**: correr `npx tsc --noEmit` antes de pushear. |

**Configuración cambiada por Julio durante la sesión:**
- `oc_solicitado_default` cambiado de "Jorge Luis Roman Hurtado" a "Luis Ramos" — verificado vía MCP que se guardó. Las 4 OCs existentes ya muestran "Luis Ramos" en el PDF (gracias al fix de firmas vivas).

**OC reactivada exitosamente (test end-to-end):** OC #1 (`001-2026 - FABRICACION DE AUGER - PSV`) que estaba ANULADA → user usó el botón cyan → pasó a BORRADOR → user la aprobó → ahora está APROBADA. Flujo completo confirmado en producción.

---

## Auditoría 01/05/2026 — verificación post-deploy

Auditoría completa contra producción + Supabase MCP:

- ✅ `npx tsc --noEmit` limpio
- ✅ Railway last-modified `02:24 GMT 01/05`, sirviendo el código nuevo
- ✅ 41 tablas en Supabase, migraciones 001-037 + 042-044 aplicadas
- ✅ ConfiguracionEmpresa tiene "Luis Ramos" en oc_solicitado_default (cambio del usuario persistido)
- ✅ ConfiguracionMarca: METAL + PERFOTOOLS con datos correctos
- ✅ 4 proveedores con `banco_X_moneda` poblado
- ✅ 4 OCs con firmas en NULL (lectura desde cfg vivo funcional)
- ✅ 14 cotizaciones, ningún `COT 0000-000-MN` en BD productiva (era basura local)
- ✅ MovimientoBancario: 0 filas (no hay imports de EECC todavía — el KPI Comisiones=S/0 no es bug, es que no hay datos)
- ✅ 58 entradas de auditoría, tracking activo

**Verificaciones que tachan pendientes históricos del ESTADO:**
- ~~COT 0000-000-MN huérfanos~~ → no existen en producción
- ~~KPI Comisiones=0~~ → no hay datos para sumar; cuando importes EECC, `esComisionImportada()` en CobranzasService:906 ya cubre ITF/N/D/COM./PORTE

---

## Sesión 02/05/2026 — Housekeeping + 2 bugs + Auditoría V3 + cierre Fase C (5 commits)

Sesión amplia: arrancó como housekeeping y terminó cerrando Fase C completa. **5 commits pusheados a `main`** (`192f452..58f7aec`).

| Commit | Bloque |
|---|---|
| `192f452` | Bloque 2A — fix race condition `generarCorrelativo()` (retry-on-duplicate, MAX 5 intentos) |
| `783a629` | Bloque 2B — fix scrub `nro_operacion` ANTES del tipoMatch en parser EECC |
| `18fa474` | Bloque 4 — auditoría V3 F01 cerrada (3 fetch directos en Dashboard.js → `api.administracion`) + cache buster v=20260502r1 |
| `6f0385c` | Cierre intermedio: docs ESTADO con descubrimiento Fase C 95% |
| `58f7aec` | **Bloque 6 — Cierre Fase C** (ver detalle abajo) |

**Housekeeping no commiteado (filesystem):**
- 9 archivos basura borrados de raíz repo principal (`*_temp.txt`, `auditoria_*.{pdf,txt}`, `COT-2026-002-ME.pdf`)
- Worktree huérfano `awesome-satoshi-ec1075` pruneado de git
- Carpeta física quedó con lock de Windows; se borra al cerrar el proceso que la tiene abierta

### Bloque 6 — Cierre Fase C (commit `58f7aec`)

**Hallazgo crítico** durante la verificación end-to-end: el flujo OC nunca cerraba en código.

Antes de hoy:
- `OrdenCompraService.recibir()` → solo movía `cantidad_recibida`. NO afectaba `Inventario.stock_actual`, NO recalculaba `costo_promedio_unitario`, NO generaba `MovimientosInventario`.
- `OrdenCompraService.facturar()` → solo creaba cabecera de `Compras`. NO insertaba `DetalleCompra`, NO creaba `Transaccion EGRESO`. Para SERVICIO/GENERAL nunca se creaba registro en `Gastos`.
- Form de OC no pedía `id_item` del catálogo — texto libre.

**Sin daño en producción** (4 OCs en APROBADA, 0 facturadas, MovimientoBancario vacío) pero el flujo nunca habría cerrado correctamente.

**Cambios en `58f7aec`:**

`OrdenCompraService.recibir()` refactor:
- Si `tipo_oc='ALMACEN'`: valida que toda línea a recibir tenga `id_item`. Si falta, lanza error con `code='OC_LINEAS_SIN_ITEM'` + `lineas_pendientes`.
- Por cada línea con id_item: `SELECT FOR UPDATE` en Inventario, recalcula `costo_promedio_unitario` ponderado (convierte a PEN si OC es USD), actualiza `stock_actual`, registra `ENTRADA` en `MovimientosInventario` con `referencia_tipo='ORDEN_COMPRA'`.
- GENERAL/SERVICIO: solo cantidad_recibida + estado.
- Validación: `cantidad_recibida` no excede lo pedido.

`OrdenCompraService.facturar()` split por tipo:
- `ALMACEN` → INSERT `Compras` + `DetalleCompra` (con id_item, cantidad_recibida) + `Transaccion EGRESO`. Inventario YA afectado en `recibir()`.
- `SERVICIO` → INSERT `Gastos` (`tipo_gasto_logistica='SERVICIO'`, `id_servicio`) + `Transaccion EGRESO` + INSERT `CostosServicio` (`tipo_costo='GASTO_OC'`).
- `GENERAL` → INSERT `Gastos` (`tipo_gasto_logistica='GENERAL'`) + `Transaccion EGRESO`.
- Estado de Transaccion = `'CONFIRMADO'` si `forma_pago=CONTADO`, `'PENDIENTE'` sino.

`OrdenCompraService.asignarItemsALineas()` nuevo:
- Acepta `[{id_detalle, id_item}]`.
- Valida que ítem existe + línea no tiene cantidad_recibida.

API:
- `POST /api/ordenes-compra/:id/recibir` → captura `OC_LINEAS_SIN_ITEM` y devuelve **422** con `{ error, code, id_oc, lineas_pendientes }`.
- `POST /api/ordenes-compra/:id/asignar-items` → nuevo.

Frontend:
- `fetchAPI` ahora preserva todos los campos del body en el Error lanzado (`Object.assign(err, errData)`). Permite leer `err.code` y `err.lineas_pendientes` en el caller.
- `api.ordenesCompra.asignarItems(id, asignaciones)` agregado.
- `recibir()` delega en `registrarRecepcionConResolucion()` que detecta el 422 y abre modal automáticamente.
- `abrirModalResolucionItems()`: tabla con líneas pendientes + dropdown del catálogo + botón **+ Crear nuevo** inline (api.inventory.createInventarioItem).
- Modal solo cierra con botón explícito (gotcha #28).
- Cache buster bumpeado a `v=20260502r2`.

**Hallazgo lateral (no fixed en esta sesión, anotado en pendientes):**
- `PurchaseService.registrarCompra()` usa `tipo_movimiento='INGRESO'` mientras los dashboards filtran `'ENTRADA'`. Inconsistencia latente — la nueva ruta de recibir OC ya usa `'ENTRADA'`. Bug afectaría compras directas (aún 0 en producción). Fix: alinear a `ENTRADA` en `PurchaseService.ts:208` y `:277`.

---

---

## Sesión 02/05 noche → 03/05 madrugada — Maratón post-Fase C (15 commits adicionales)

Sesión muy larga con Julio testing en producción y reportando issues + features. **15 commits pusheados** después del cierre inicial de Fase C (`0086dfc..dbc9440`). Todo en `main`.

### Bloque 1 — UX recepción OC + bugs descubiertos al usar Fase C en vivo

| Commit | Cambio |
|---|---|
| `18db593` | Reemplazar `prompt()` nativos en `recibir()` por modal con tabla. Antes era 6 popups en serie por línea, ahora una tabla completa con cantidad pedida / ya recibida / falta / input "recibí ahora" / validaciones inline. |
| `89241fc` | Reemplazar prompts de "+ Crear nuevo ítem" por mini-modal con dropdown del enum válido (Material/Consumible/Herramienta/Equipo/EPP). El backend valida enum exacto en Zod; los prompts permitían tipos cualquier cosa y rebotaban con "Validación de datos fallida". |
| `0928078` | Migración 045: extender `movimientosinventario_referencia_tipo_check` para aceptar `ORDEN_COMPRA`. El commit 58f7aec usaba ese valor pero el CHECK solo permitía SERVICIO/COMPRA/GASTO/PRESTAMO. La transacción rolló back limpio (sin daño) pero rompía cada recepción ALMACEN. |
| `6397181` | Fix botones Kárdex/Eliminar en Inventario: el HTML llamaba `window.verKardex(...)` pero los handlers se registraban en `window.Inventario.{verKardex, eliminarItem}`. Patrón namespace por módulo (gotcha #17 / auditoría V3 F03). |

### Bloque 2 — Mejoras Comercial pedidas por Julio

| Commit | Cambio |
|---|---|
| `a57c4f3` | Mostrar comentarios internos (📝) en la fila de cotizaciones. Antes solo se veían entrando a editar; cuando la cotización pasaba a APROBADA/etc. ya no eran visibles. Caja amarilla suave debajo de cliente/proyecto, `white-space:pre-wrap` para preservar saltos de línea, tooltip "no aparece en PDF". |
| `7ff73b0` | Fix bug: `COT 2026-001-MN` (PDI) figuraba como RECHAZADA en Comercial pero seguía apareciendo "Pendiente Depósito" en Finanzas. El `updateEstado` solo abría flujo financiero al APROBAR, nunca lo cerraba al pasar a estado terminal negativo. Fix bidireccional: al pasar a RECHAZADA/NO_APROBADA/ANULADA resetea `estado_financiero='NA'` SOLO si no hay cobranzas registradas (sino requiere reverso manual). Backfill aplicado: 1 fila corregida vía MCP. |

### Bloque 3 — Editar cobranzas + Tx Dashboard Gerencial (descubierto al subir cobranza real)

| Commit | Cambio |
|---|---|
| `03137c3` | Feature: editar cobranza ya registrada. Endpoint `PUT /api/cobranzas/:id` con sync del MovimientoBancario AUTO asociado (UPDATE/INSERT/DELETE según cambio de cuenta). El modal "Registrar cobranza" ahora es bimodal — recibe `existing` opcional y entra en modo edit. Botón ✎ Editar en cada fila del modal Detalle, junto al Eliminar. Modal ya no se cierra por backdrop (gotcha #28). |
| `361e00e` | Atajo ✎ en fila de bandeja: si la cotización tiene 1 solo movimiento abre el editor directo, sino cae al modal Detalle. Solo se renderiza si hay algo cobrado. |
| `46c57ff` | **Bug crítico fixed:** Julio cobró COT 2026-008-MN por S/ 4,531.20 pero el Dashboard Gerencial seguía en S/ 0.00. Causa: `registrarCobranza()` creaba CobranzasCotizacion + MovimientoBancario pero NO insertaba en `Transacciones`. El Dashboard mira Transacciones para calcular saldos. Fix: agregar INSERT Transacciones (referencia_tipo='COBRANZA', tipo_movimiento='INGRESO') sólo si hay id_cuenta. Sync en eliminar/editar también. **Bonus**: arreglé bug latente del commit `58f7aec` — las Tx de OC.facturar() usaban `estado='CONFIRMADO'` que NO existe (CHECK acepta PENDIENTE/REALIZADO/ANULADO). Cualquier facturación habría explotado al primer intento. Cambiado a `'REALIZADO'`. **Migración 046**: extender `transacciones_referencia_tipo_check` para aceptar `COBRANZA`. **Backfill**: 1 Tx histórica creada para Promafa. |

### Bloque 4 — Estado nuevo TRABAJO_EN_RIESGO

| Commit | Cambio |
|---|---|
| `46bbd0a` | **Caso real Julio:** cliente pidió trabajo informal sin formalizar pago, Julio empezó a riesgo gastando capital en OCs. Para que apareciera con nombre del cliente en Logística marcaba la cotización APROBADA — pero eso la metía en CxC del Dashboard y en Cobranzas como "esperando depósito" (mentira: nunca habrá depósito). Estado nuevo `TRABAJO_EN_RIESGO` indica "trabajo realizado, NO compromiso de cobro". Migración 047 extiende el CHECK constraint. Badge naranja "⚠ TRABAJO A RIESGO". `getBandejas()` lo excluye automáticamente vía filtro `estado_financiero <> 'NA'` + reset al cambiar de estado. Transición a APROBADA reabre flujo financiero. |
| `ba60d26` | Fix Zod: el commit anterior agregó el estado al ENUM del Service y al CHECK de Postgres, pero olvidó extender `cotizacionEstadoSchema` que valida `PUT /cotizaciones/:id/estado`. El Zod corre antes del Service, rebotaba con "Validación de datos fallida". |

### Bloque 5 — Form multi-item Factura + PDF SUNAT (Fase B avanza de 40% → 75%)

| Commit | Cambio |
|---|---|
| `311f4f7` | **Hito grande**: cierre del flujo de emisión de facturas que estaba en STUB simple. Antes el botón "🧾 Emitir Factura" emitía 1:1 desde la cotización sin permitir editar nada. Ahora abre **modal multi-item** donde Julio puede ajustar cliente, dirección, items, observación, detracción. **Migraciones 048-050**: tabla `CorrelativosFactura(serie, ultimo)` con UPDATE-then-INSERT atómico (race-safe), `serie_factura/serie_boleta` por marca en `ConfiguracionMarca` (METAL=F001 PEN, PERFOTOOLS=F002 USD, boletas comunes=B001), `direccion_fiscal_sunat` en `ConfiguracionEmpresa` (Av. Javier Prado Este 2813 — la operativa de Puente Piedra sigue en `direccion_fiscal` para cotizaciones/OC). **Backend**: `FacturaService.crearYEmitir(data)` (núcleo, recibe payload completo, calcula totales, toma correlativo atómico, llama Nubefact STUB/REAL, persiste en Tx), `FacturaService.previewDesdeCotizacion(id)` (sugerido para form sin persistir), `FacturaService.resolverSerie()` (prioriza marca sobre default empresa). **`FacturaPDFService` nuevo (~280 líneas)**: layout SUNAT con caja empresa + caja tipo+correlativo, bloque cliente, tabla items multi-línea, columna totales, importe en letras, leyenda según estado SUNAT. **API**: GET preview-cotizacion/:id, POST /api/facturas, GET /:id/pdf. **Frontend**: `modalEmitirFactura(preview, opts)` con todos los campos editables + tabla items + totales en vivo + banner STUB/REAL. |

### Bloque 6 — Fechas editables (carga histórica)

| Commit | Cambio |
|---|---|
| `52a98d5` | Cotizaciones: campo `fecha` opcional en CotizacionInput + Zod schema. Form `formNueva` muestra input `<type="date">` al lado de moneda/TC. Default hoy. updateCotizacion usa COALESCE para no pisar la fecha si no viene una válida. Caso de uso: Julio cargando histórico enero/2025 sin que el sistema le ponga mayo/2026. |
| `1fd8d98` | Cotizaciones: botón **📅** chiquito en cada fila junto a la fecha. Click → modal mini con input date + Guardar. Endpoint `PUT /api/cotizaciones/:id/fecha` que SOLO toca fecha, sin disparar hooks (no toca estado_financiero, fecha_aprobacion_comercial, items, totales, correlativo). Disponible en cualquier estado salvo ANULADA. Útil para corregir fechas mal cargadas en cotizaciones ya APROBADAS/RECHAZADAS sin tener que regresarlas a EN_PROCESO. |
| `dbc9440` | OC: mismo patrón. Botón **📅** en columna fecha de la tab Lista. `OrdenCompraService.actualizarFecha`. Endpoint `PUT /api/ordenes-compra/:id/fecha`. Disponible en cualquier estado salvo ANULADA. El correlativo `nro_oc` (`NNN - YYYY`) NO se reasigna aunque cambie el año de la fecha. |

### Estado de fechas editables al cierre

| Módulo | Fecha en form | Botón 📅 rápido | Notas |
|---|---|---|---|
| Cotización | ✅ form pre-llenado hoy, editable | ✅ cualquier estado salvo ANULADA | El correlativo `COT YYYY-NNN` se calcula con año actual, NO con la fecha cargada |
| OC | ✅ form pre-llenado hoy, editable | ✅ cualquier estado salvo ANULADA | El correlativo `NNN - YYYY` se asigna con año de fecha al CREAR, no se reasigna después |
| Factura | ✅ en modal de emisión | ❌ a propósito | Las facturas emitidas son inmutables por trazabilidad SUNAT |

### Bugs encontrados y resueltos en esta sesión

1. ~~Race condition correlativos cotizaciones~~ → fix `192f452` con UPDATE-then-INSERT + retry-on-duplicate
2. ~~`nro_operacion` duplicado en parser EECC~~ → fix `783a629`
3. ~~Auditoría V3 F01 (3 fetch directos sin token en Dashboard.js)~~ → fix `18fa474`
4. ~~Flujo OC → Inventario/Compras/Gastos roto~~ → fix `58f7aec` (cierre Fase C)
5. ~~CHECK constraint movimientosinventario rechaza ORDEN_COMPRA~~ → migración 045
6. ~~Botones Kárdex/Eliminar window.X vs window.Inventario.X~~ → fix `6397181`
7. ~~estado_financiero no se cierra al rechazar/anular~~ → fix `7ff73b0`
8. ~~Cobranza no crea Tx INGRESO → Dashboard Gerencial S/0~~ → fix `46c57ff`
9. ~~OC.facturar() usa Tx.estado='CONFIRMADO' (CHECK rechaza)~~ → fix `46c57ff`
10. ~~CHECK transacciones rechaza COBRANZA~~ → migración 046
11. ~~CHECK cotizaciones rechaza TRABAJO_EN_RIESGO~~ → migración 047
12. ~~Zod schema cotizacionEstado no incluye TRABAJO_EN_RIESGO~~ → fix `ba60d26`

### Bugs latentes conocidos al cierre

- `PurchaseService.ts:208` y `:277` usan `tipo_movimiento='INGRESO'` para compras directas (sin OC) mientras dashboards filtran `'ENTRADA'`. La nueva ruta de OC ya usa `'ENTRADA'`. Sin impacto hoy: 0 compras directas en producción. Fix trivial cuando se haga la primera.

---

## Sesión 03/05 mañana+tarde — Universal edit/delete + Tooltips sweep (4 commits)

Sesión enfocada en darle a Julio control total sobre los datos cargados en producción. Pedido textual: *"todas las ordenes en todas las etapas deben poder editar y eliminarse y asi para todo, solo con el aviso bastara y el factor de escribir algo para borrar suficiente"* + después *"creo que la opcion 1 para empesar esta bien, y ver el tema de los tip tools es bueno en todo lo que vamos creando"*. **4 commits pusheados a `main`** (`b76abf7..97a7e8e`).

### Bloque 1 — Fase 1 OC: editar metadata + eliminar con cascada total (commit `b76abf7`)

Hasta ahora, OC solo tenía `editar líneas` (BORRADOR/APROBADA/ENVIADA) y `eliminar` (BORRADOR/APROBADA). Pedido: que GERENTE pueda eliminar en cualquier estado y que cualquier usuario pueda corregir metadata sin romper números.

Backend `OrdenCompraService`:
- **`editarMetadata(id_oc, data)`** nuevo: UPDATE seguro de `centro_costo`, `observaciones`, `atencion`, `contactos`, `firmas`, `lugar_entrega`, `fecha_entrega_esperada` en cualquier estado salvo ANULADA. Si la OC tiene `Gasto` asociado por `nro_oc`, propaga `centro_costo` + `concepto` al Gasto.
- **`eliminar(id_oc)` rediseñado** con cascada total. Tx atómica:
  1. Si `tipo_oc='ALMACEN'`: revierte stock por cada `MovimientoInventario` con `referencia_tipo='ORDEN_COMPRA'` + DELETE esos movimientos (kárdex limpio).
  2. Si `id_compra_generada`: DELETE Tx COMPRA + DetalleCompra + Compras.
  3. DELETE Gastos por `nro_oc` + sus Tx GASTO.
  4. DELETE CostosServicio matching `%nro_oc%` en concepto.
  5. DELETE OC (DetalleOrdenCompra + AprobacionesOC vía FK CASCADE).

API:
- `PUT /api/ordenes-compra/:id/metadata` — editarMetadata.
- `DELETE /api/ordenes-compra/:id` — guard GERENTE.

Frontend `OrdenesCompra.js`:
- ✎ Editar líneas — sigue limitado a BORRADOR/APROBADA/ENVIADA.
- ✎ Editar concepto/CC — botón nuevo, visible en todos los estados salvo ANULADA. Modal mini con datalist de centros activos + textarea observaciones + atención.
- 🗑 Eliminar — siempre visible para GERENTE. Modal `confirmarTexto` con cascada visible y tipeo del N° OC obligatorio.

### Bloque 2 — Fase 3: replicar patrón a Cotizaciones, Compras, Gastos, Items (commit `2119ec2`)

Cada uno expone `editarMetadata()` + `delete()` con cascada total, solo GERENTE en delete.

**Cotizaciones (`CotizacionService`):**
- `editarMetadata`: cliente, atencion, telefono, correo, proyecto, forma_pago, validez_oferta, plazo_entrega, lugar_entrega, nro_oc_cliente, nro_factura, comentarios.
- `deleteCotizacion` universal con cascada:
  1. Cobranzas → DELETE Tx COBRANZA + MovBancario AUTO + CobranzasCotizacion.
  2. CostosServicio que solo tenían `id_cotizacion` (sin `id_servicio`) — DELETE explícito antes del FK SET NULL para no romper el CHECK constraint `chk_costoservicio_origen`.
  3. DELETE Cotización: arrastra DetalleCotizacion (CASCADE), deja en NULL `id_cotizacion` en OrdenesCompra y CostosServicio restantes (SET NULL del FK).
- **Drive PDF + fotos Cloudinary se quedan** (consistente con `resetTodo`).
- Frontend: botón "✎ Editar datos" en cualquier estado, "🗑 Eliminar" para GERENTE en cualquier estado (incluida pestaña Anuladas).

**Compras (`PurchaseService`):**
- `editarMetadata`: nro_comprobante, nro_oc, fecha, centro_costo.
- `deleteCompra` universal: si CONFIRMADA reversa stock → DELETE Tx COMPRA + MovInv + DetalleCompra → desvincula OC origen (`id_compra_generada=NULL`) → DELETE Compras.
- Frontend: botón "Editar datos", botón "Eliminar" exige tipear el N° de comprobante exacto.

**Gastos (`FinanceService`):**
- `editarMetadata`: nro_factura, nro_oc, concepto, fecha, centro_costo, tipo_gasto_logistica.
- `deleteGasto` universal: DELETE Tx GASTO + CostosServicio matching → DELETE Gasto.
- DELETE endpoint ahora exige rol GERENTE.
- **Backend listo como fallback. UI directa de Gastos no construida** (acceso vía OC sigue siendo el flujo principal).

**Items inventario (`InventoryService`):**
- `editarMetadata`: nombre, categoria, unidad, stock_minimo. NO toca stock actual ni costo promedio.
- `deleteItem` con dos modos:
  - **NORMAL**: bloquea si stock>0, hay compras activas o costos en servicios. Mensajes informan al GERENTE que existe modo forzado.
  - **FORCE (`?force=1`, solo GERENTE)**: borra cascada DetalleCompra + MovInv + CostosServicio + Inventario. Recalcula totales de las Compras afectadas (las Compras siguen vivas con totales recalculados desde los detalles restantes).

API client:
- `cotizaciones.editarMetadata`, `purchases.editarMetadataCompra`, `finances.editarMetadataGasto`, `inventory.editarMetadataItem`.
- `inventory.deleteInventarioItem(id, {force:true})`.

### Bloque 3 — Modal facturar OC honesto sobre NC + tooltips primer pase (commit `337b20b`)

Caso real: Julio abrió la pantalla "🧾 Recibí factura" en una OC de Compra y vio el mensaje *"para revertirla deberás emitir una Nota de Crédito"* — pero **el módulo de NC no existe construido** (solo migración 026 con tablas + builder de payload SUNAT). El modal estaba prometiendo una pantalla que no existe.

Reescribí el texto para que sea honesto:
- Una vez facturada, el botón **Anular** desaparece.
- Si te equivocaste: **🗑 Eliminar** sigue disponible para GERENTE — borra todo en cascada.
- Si la factura ya fue declarada al **SIRE de SUNAT**, el ajuste correcto es pedirle al proveedor una **NC** y registrarla cuando llegue (módulo aún por construir).

**Tooltips agregados** (atributo `title=`) en:
- OC modal de detalle: 13 botones (Ver, PDF, Aprobar, Enviar, Recepción, Recibí factura, Cerrar sin facturar, Asociar factura tardía, Editar líneas, Editar concepto/CC, Eliminar, Anular, Reactivar). Cada uno explica alcance + qué pasa con registros derivados.
- Cotizaciones tabla: 8 botones (Ver, PDF, Emitir Factura, badge ✅ Factura, Editar líneas, Editar datos, Anular, Eliminar).
- Compras tabla: Editar líneas (recalcula stock+IGV) vs Editar datos (refs).
- Inventario tabla: Kárdex (auditoría), ✎ (alcance), × (NORMAL vs FORZADO).

### Bloque 4 — Tooltips sweep en iconos discretos sin texto (commit `97a7e8e`)

Pedido del usuario tras ver que pasaba el mouse por algunos iconos chiquitos (×, ✕, 🗑, etc.) y no había orientación.

Barrido completo del frontend. Cualquier botón icon-only ahora trae `title=` + `aria-label=` para accesibilidad:

| Archivo | Iconos cubiertos |
|---|---|
| `Sidebar.js` | × cierre del panel de alertas |
| `Comercial.js` | × quitar línea factura · ✕ quitar foto del item · ✕ cerrar editor cotización · ⟲ Reset (tooltip ampliado describiendo cascada y excepciones) |
| `OrdenesCompra.js` | ✕ cerrar reporte ROC · × quitar línea OC |
| `Compras.js` | X quitar línea (form crear) · ✕ quitar línea (form editar) |
| `Logistica.js` | × eliminar CC · × cerrar modal CC · ✕ anular OC · ✕ quitar línea · ♻ Reactivar · Editar/Activar/Desactivar CC |
| `Proveedores.js` | × eliminar proveedor · × cerrar modal · Editar (alcance vs históricos) |
| `Finanzas.js` | × cerrar gestión cuentas · 🗑 gasto bancario / pago IGV / mov manual · ✓ conciliar · ⊘ ignorar · 🔗 Match · × cerrar detalle |
| `Importador.js` | ✕ cerrar preview |

### Patrón UX común al cierre

| Acción | Cuándo aparece | Quién lo ve | Confirmación |
|---|---|---|---|
| ✎ Editar líneas/items | Estados iniciales (antes de impactar números) | Cualquiera con módulo | Modal de confirmación si edita data importante |
| ✎ Editar datos (metadata) | Cualquier estado salvo ANULADA | Cualquiera con módulo | Modal mini con campos prefilled |
| 🗑 Eliminar con cascada | **Cualquier estado** | Solo GERENTE | Tipear N° exacto |
| Anular | Hasta antes de facturar | Cualquiera con módulo | Modal `confirmarAccion` |
| ♻ Reactivar | Solo en ANULADA | Solo GERENTE | Modal de confirmación |
| Force delete (Items) | Cuando NORMAL bloquea por dependencias | Solo GERENTE | Confirm() con detalle de cascada |

### Pendientes que quedaron priorizados al cierre de hoy

| Prioridad | Tarea | Esfuerzo | Bloqueante? |
|---|---|---|---|
| **ALTA** | Construir módulo **NCs entrantes** (recibir NC del proveedor → ajusta Compras + libro Compras + estado_pago del Gasto) | 2-3 horas | Cierra loop "me equivoqué después de facturar" + es prerequisito SUNAT SIRE Fase B |
| **MEDIA** | UI directa de Gastos (vista cruzada para auditoría contable mensual) | 1.5 horas (backend listo) | No — el flujo OC sigue cubriendo todo |
| **BAJA** | Limpiar Servicios legacy (sacar del router, archivar `Servicios.js` y `CatalogService.ts`) | 30 min | No — ya no está en el sidebar (90% deprecada de facto) |
| **MUY BAJA** | Fase 2 OC: edit pesado en RECIBIDA/FACTURADA con reverso/regenerate automático de Tx/Compras/Inventario | 6+ horas (alto riesgo) | No — Fase 1 + 🗑 Eliminar ya cubre el 90% de casos reales |

**Recomendación** que le di a Julio: dejar la Fase 2 OC y la limpieza de Servicios para más adelante (no bloquean nada hoy). Si quiere cerrar otro frente, **NCs entrantes** da el cierre real para "y si me equivoco después de facturar" + es prerequisito de SUNAT SIRE Fase B.

---

## Sesión 03/05 noche — Modal ROC + unificar Caja (2 commits)

Sesión corta de pulido UX + bugfix de coherencia. **2 commits pusheados a `main`** (`35477b2..041569e`).

| Commit | Cambio |
|---|---|
| `35477b2` | UX: Modal ROC en Logística reemplaza `prompt()` nativo. Selector año (actual/anterior), input semana ISO 1-53 con placeholder mostrando la semana de hoy, botón "Semana actual (NN)" para reset, hint sobre corte acumulado, validación, loader `⏳ Generando…`, modal solo cierra con × / Cancelar (gotcha #28). `OrdenesCompra.reporteROC()` ya tenía modal — solo faltaba el de Logística → Centros de Costo. Cache buster `v=20260503r4`. |
| `041569e` | **Bug coherencia:** Finanzas dashboard mostraba S/18,120 en KPI "Caja Soles" mientras la alerta decía "Saldo bajo S/0.00" — dos fuentes distintas leyendo cosas distintas. KPI sumaba cobranzas brutas (`CobranzasCotizacion DEPOSITO_BANCO`); alerta leía `Cuentas.saldo_actual` (snapshot legacy nunca poblado). Fix: helper compartido `CobranzasService.calcularSaldosNetos()` que devuelve `{ PEN, USD: { ingresos, egresos, neto } }` con la fórmula `cobranzas DEPOSITO_BANCO - GastoBancario - PagosImpuestos`. KPI y alerta ahora consumen la misma fuente. **Sin tocar `Cuentas.saldo_actual`** — la data subida queda intacta. Umbrales alerta: PEN < 1000 (warn) / < 500 (danger), USD < 300 / < 150. |

### Detalles técnicos del helper unificado

`CobranzasService.calcularSaldosNetos()` (público, agregado antes de `getDashboardFinanzas`):
- `ingresos`: `SUM(CobranzasCotizacion.monto WHERE tipo='DEPOSITO_BANCO') GROUP BY moneda`
- `egresos`: `SUM(GastoBancario.monto) GROUP BY moneda` + `SUM(PagosImpuestos.monto) GROUP BY moneda`
- `neto`: `ingresos - egresos`
- Solo cuentas regulares — NO incluye Banco de la Nación (las detracciones siguen contabilizándose aparte en `bn` del dashboard)
- `try/catch` defensivo en GastoBancario y PagosImpuestos (por si la tabla aún no existiera, aunque sí está en producción)

**Consumers:**
- `getDashboardFinanzas()` línea ~520: KPI "Caja Soles" / "Caja Dólares"
- `AlertasService._computeAll()` punto 10 (CAJA_BAJA): import `CobranzasService` + iteración por moneda con título "Caja General Soles" / "Caja General Dólares"

**Comportamiento esperado tras deploy:**
- Si solo se registraron cobranzas (sin gastos bancarios ni IGV pagado) → KPI y alerta coinciden, alerta no dispara mientras > umbral
- Si hay gastos bancarios o pagos IGV registrados → KPI baja al neto real (más correcto), alerta dispara solo si neto < umbral
- `Cuentas.saldo_actual` queda intocado — sigue siendo válido para `FinanceService.getResumenOperativo()` (Dashboard Gerencial) que mezcla snapshot + Tx

### Pendientes que siguen vigentes

| Prio | Tarea |
|---|---|
| ALTA | Módulo NCs entrantes (recibir NC del proveedor) — 2-3h. Tablas + builder Nubefact ya listos (mig 026 + `NubefactPayloadBuilder.buildNotaCredito`). Falta Service + rutas + UI. |
| MEDIA | UI directa de Gastos (vista cruzada para auditoría contable) — 1.5h, backend listo. |
| BAJA | Limpiar Servicios legacy — 30min, 0 rows en producción. |
| MUY BAJA | Fase 2 OC edit pesado en RECIBIDA/FACTURADA — 6h+. |

(Sin cambio respecto a cierre 03/05 tarde.)

---

## Auditoría 02/05/2026 — donde estamos parados (post-cierre Fase C)

| Fase del Plan Maestro | Estado | Notas |
|---|---|---|
| **G** Rediseño Enterprise UI | ✅ **CERRADA** | 10 commits 27/04 + 7 cotizaciones + sidebar mobile/HEIC/PDF preview/colapsable |
| **A** Fundaciones (config, auditoría, periodos, adjuntos, roles) | 🟢 **CASI HECHA** | Migraciones 020-024 aplicadas. Módulo `app/modules/configuracion/` con 4 services. Falta verificar wizard de setup completo y uso del audit log en todas las rutas sensibles. |
| **B** Facturación electrónica + Libros SUNAT | 🟢 **75%** (era 40%) | Form multi-item completo + PDF estilo SUNAT (commit `311f4f7`). Series por marca configuradas (METAL=F001/PERFOTOOLS=F002/B001). Tabla `CorrelativosFactura` con UPDATE-then-INSERT atómico. `direccion_fiscal_sunat` separada de la operativa. Falta solo: listado UI, NC/ND, conexión Nubefact REAL (bloqueado por certificado externo). |
| **C** Logística + Almacén valorizado + Dashboards | ✅ **CERRADA** (02/05/2026) | Flujo OC end-to-end integrado en commit `58f7aec`: recibir() afecta Inventario+kárdex en ALMACEN; facturar() splittea por tipo (ALMACEN→Compras+DetalleCompra+Tx; SERVICIO→Gastos+Tx+CostosServicio; GENERAL→Gastos+Tx). Modal de resolución de ítems al recibir OC ALMACEN sin id_item. **Verificación end-to-end con OC real pendiente** (las 4 OCs en APROBADA están listas para test). |
| **D** Contabilidad PCGE + EE.FF. | 🔴 **INCIPIENTE** | Solo placeholder `Contabilidad.js`. Sin Plan de Cuentas, asientos automáticos ni Estados Financieros. |
| **E** Producción metalmecánica (OT, BOM, QC) | ⬜ **NO INICIADA** | El diferenciador. Para agosto-septiembre. |
| **F** Multi-tenancy SaaS + onboarding + pricing | ⬜ **NO INICIADA** | Para fin de septiembre. |

**Plan SUNAT SIRE (paralelo a B):** plan escrito y aprobado, no ejecutado. Bloqueado por certificado digital + Nubefact + Usuario Secundario SOL específico para el ERP.

**Fase de testing UAT (activa):** Luis y Jorge con rol GERENTE temporal hasta que los flujos críticos pasen 2 semanas sin bugs nuevos.

**Recomendación:** sesión corta de cierre (verificación end-to-end PDF/fotos + housekeeping) → arrancar Fase B en MODO STUB completo (UI Facturas terminada, certificado se enchufa al final) en paralelo a gestión de certificado/Nubefact por Julio. Alternativa: ir derecho a Fase C (Logística completa + Almacén) que no tiene bloqueos externos.

---

## Para Claude (contexto rápido en cada sesión nueva)

**Al arrancar una sesión, LEER este archivo completo antes de actuar.** Evita re-descubrir estado.

**Gotchas claves:**

- **Entorno:** Windows 11 + Git Bash. Usar paths Unix en bash (`/d/...`), paths Windows solo en comandos `.exe`. `cd` en el tool `Bash` **no persiste** entre llamadas — encadenar con `;` o `&&` en UNA sola llamada.
- **No levantar servidores desde worktrees.** El dev server va en `D:\proyectos\ERP-PRO` con `npx ts-node index.ts`. Puerto 3000.
- **Login:** JWT guardado en `localStorage.token`. Usuario de prueba: `julio@metalengineers.com.pe` (la contraseña la maneja el usuario, nunca pedirla).
- **MySQL:** pool de 10 conexiones, credenciales en `.env`. `JWT_SECRET`, `CLOUDINARY_*`, `GOOGLE_DRIVE_FOLDER_ID` también en `.env`.
- **Migraciones aplicadas:** 001 a 012. Ver tabla de módulos arriba para qué migración sirve a qué.
- **Multimoneda:** Servicios y Cotizaciones aceptan `moneda: 'PEN'|'USD'` + `tipo_cambio`. La conversión a PEN se hace al persistir (se guarda siempre en soles para consistencia contable, salvo el campo `moneda` que recuerda el origen).
- **Anulación lógica:** todos los módulos usan estado `ANULADA`/`ANULADO` en vez de DELETE físico. OJO inconsistencia ENUM: `Compras` usa `'ANULADA'` (fem.), `Gastos` y `Transacciones` usan `'ANULADO'` (masc.).
- **Reglas de seguridad Claude:** nunca escribir contraseñas por el usuario aunque las comparta en el chat. Sí se puede usar tokens JWT que el usuario genere y pase.

**Documentos de referencia:**
- `README.md` — qué es el sistema, cómo se instala, API endpoints.
- `CLAUDE.md` — guía técnica detallada, gotchas, branding, decisiones de arquitectura.
- `auditoria_v3_20260408.md` — 21 hallazgos pendientes al 08/04/2026.
- Este archivo (`ESTADO.md`) — estado de avance vivo.

**Al cerrar una sesión de trabajo importante:** actualizar este archivo (fecha, commits nuevos, cambios de estado, nuevos pendientes).

---

## Snapshot de `git status` (al 2026-05-03 noche)

**Working tree de este worktree limpio.** Todo pusheado a `origin/main`. Railway desplegado, sirviendo `v=20260503r4`.

**Acumulado de commits desde 27/04:**
- 10 commits rediseño Enterprise UI (27/04)
- 7 commits cotizaciones AM 27-28/04 (fotos Cloudinary + edit ítem + eliminar duplicado)
- 6 commits sesión 28/04 tarde (sidebar mobile + HEIC + preview PDF + seed ConfiguracionMarca)
- 1 commit cierre 28/04 (`8745bd2` — sync seed + hardening PDF + docs)
- 5 commits pulido PDF cotizaciones + logos editables (28-29/04, `a5b194d..aa08c9c`)
- 5 commits OC mejoras UX 28-29/04 (`140a61a..e96504c`)
- 1 commit sidebar colapsable (30/04, `9911ad3`)
- 1 commit sync ESTADO (30/04, `d590073`)
- 10 commits sesión 30/04 noche → 01/05 (OC: cuentas+moneda, firmas vivas, reactivar, cache buster, post-mortem build, `e805ec5..d285f31`)
- 1 commit cierre 01/05 (`e5e4e8c` — docs cierre)
- 5 commits sesión 02/05 mañana (housekeeping + 2 bugs + auditoría V3 + cierre Fase C, `192f452..58f7aec`)
- 1 commit cierre 02/05 mañana (`0086dfc` — docs Fase C)
- 15 commits sesión 02/05 noche → 03/05 madrugada (modal recepción OC + edición cobranzas + Tx Dashboard + TRABAJO_EN_RIESGO + Form factura SUNAT + fechas editables, `18db593..dbc9440`)
- 4 commits sesión 03/05 mañana+tarde (universal edit/delete + tooltips, `b76abf7..97a7e8e`)
- **2 commits sesión 03/05 noche (modal ROC Logística + unificar Caja KPI vs alerta, `35477b2..041569e`)**

**Total: 73 commits** desde el rediseño Enterprise.

## Para Claude (próxima sesión)

Si Julio dice "sigamos con cotizaciones" o reporta un bug del módulo Comercial:
1. **Leer primero** `~/.claude/projects/D--proyectos-ERP-PRO/memory/project_cotizaciones_fotos_y_edit.md` — ahí están todas las decisiones críticas no obvias.
2. **Si reporta "no me deja subir foto"**: verificar primero (a) cache del navegador, (b) que Railway tenga las env vars Cloudinary, (c) que el cache buster JS esté bumpeado en `index.html`. **Para HEIC en Chrome Windows:** ya está resuelto (commit `61fa07b`) — acepta por extensión cuando Chrome no reconoce el MIME.
3. **Si reporta error "edit is not defined" o pantalla roja al editar/borrar**: el `idp` con guion rompe HTML inline. Cambiar a underscore.
4. **Si reporta "PDF da HTTP 500" o "Configuración no encontrada"**: la tabla `ConfiguracionMarca` (lowercase en Postgres) debe tener filas para METAL y PERFOTOOLS. Verificar con `SELECT marca FROM configuracionmarca;` vía Supabase MCP en project `fhlrxlsscerfiuuyiejw`. Si faltan, ya hay defaults hardcoded en `CotizacionPDFService.ts` que evitan el 500, pero el ideal es re-insertar las filas.
5. **Cuando se commitea cambios en `public/js/`**: SIEMPRE bumpear el cache buster del script en `index.html` (`?v=YYYYMMDDr#`). Sin esto, los navegadores cargan el JS viejo y los fixes no se ven.
6. **Para hacer push a producción desde un worktree**: la rama `main` está checkout en `D:/proyectos/ERP-PRO`, así que NO se puede `git checkout main` desde el worktree. Usar `git push origin <branch-actual>:main` para empujar el commit como nuevo `main` (solo si es fast-forward).
7. **Si reporta "no me sumó stock al recibir OC ALMACEN"**: verificar (a) que la OC tiene `tipo_oc='ALMACEN'` (las GENERAL/SERVICIO NO afectan stock), (b) que las líneas tienen `id_item` poblado en `DetalleOrdenCompra` (el modal de resolución obliga a asignar antes), (c) revisar `MovimientosInventario` con `referencia_tipo='ORDEN_COMPRA' AND referencia_id=<id_oc>`. La afectación está en `OrdenCompraService.recibir()` post commit `58f7aec`.
8. **Si reporta "facturé OC y no veo la Compra/Gasto"**: el split por tipo en `facturar()` es:
   - ALMACEN → tabla `Compras` + `DetalleCompra` + `Transacciones (referencia_tipo='COMPRA')`
   - SERVICIO → tabla `Gastos` (con `id_servicio`) + `Transacciones (referencia_tipo='GASTO')` + `CostosServicio (tipo_costo='GASTO_OC')`
   - GENERAL → tabla `Gastos` + `Transacciones (referencia_tipo='GASTO')`
   Nota que solo ALMACEN setea `OrdenesCompra.id_compra_generada`. Para SERVICIO/GENERAL la trazabilidad es vía `Gastos.nro_oc`.
9. **Bug latente conocido (PurchaseService.ts:208 y :277)**: usa `tipo_movimiento='INGRESO'` mientras dashboards filtran `'ENTRADA'`. La nueva ruta de OC ya usa `'ENTRADA'`. Si Julio empieza a hacer compras directas (sin OC) y no aparecen en los dashboards de Inventario, este es el motivo. Fix trivial — alinear ambas líneas a `'ENTRADA'`.
10. **Saldos de Caja — fuente única `CobranzasService.calcularSaldosNetos()`** (desde `041569e` 03/05 noche). Cualquier KPI o alerta que mencione "saldo en caja", "Caja Soles", "Caja Dólares" debe consumir este helper, NO leer `Cuentas.saldo_actual` directamente (ese campo es snapshot legacy y diverge). Fórmula: `cobranzas DEPOSITO_BANCO - GastoBancario - PagosImpuestos` por moneda. NO incluye Banco de la Nación (detracciones se manejan en `bn` del dashboard). Si Julio reporta un mismatch entre alerta y dashboard de Finanzas, lo primero que hay que verificar es que ambos lados consuman el helper.

### Estado del filesystem (worktree principal)
- Working tree limpio en este worktree (`elegant-herschel-050bb4`).
- En `D:/proyectos/ERP-PRO`: `.gitignore` y `ESTADO.md` modificados (WIP de Julio según heads-up histórico) + carpeta `backups/` untracked.
- Carpeta basura `D:/proyectos/ERP-PRO/.claude/worktrees/awesome-satoshi-ec1075` quedó con lock de Windows tras prune; se elimina al cerrar el proceso que la tiene abierta (probablemente VS Code o antivirus).

### Dir `.claude/` — untracked
Contiene worktrees y configuración local. **NO commitear.** Ya en `.gitignore`.

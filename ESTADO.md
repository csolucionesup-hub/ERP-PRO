# ESTADO DEL PROYECTO — ERP-PRO

> **LEER PRIMERO.** Este documento es la fuente de verdad sobre qué está hecho, qué falta y dónde estamos parados. Se actualiza al cierre de cada sesión de trabajo.

**Última actualización:** 2026-05-01 (sesión OC: cuentas+moneda, firmas vivas, reactivar, post-mortem build)
**Rama activa:** `main`
**Último commit pusheado:** `d285f31 fix(build): agregar 'REACTIVAR' al type AuditAccion`
**Servidor dev:** `npx ts-node index.ts` en `D:\proyectos\ERP-PRO` → `http://localhost:3000`
**Producción:** `erp-pro-production-e4c0.up.railway.app` — Railway (deploy automático desde main)
**Cache buster JS actual:** `v=20260430r7` (app.js) — **convención nueva**: hardcoded en CADA import dentro de app.js. Ver gotcha #36 en CLAUDE.md.
**Migraciones BD:** 001 → 037 + 042 → 044 aplicadas (Supabase Postgres project `fhlrxlsscerfiuuyiejw`).

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

1. **Correlativos bugueados `COT 0000-000-MN`** — hay 2 registros anulados con año 0000 y secuencia 000. Investigar si son seed residual o bug real en `generarCorrelativo()`.
2. **Race condition en correlativos** — `CotizacionService.ts:63` usa `COUNT(*)` fuera de transacción. Dos usuarios simultáneos pueden obtener el mismo número.
3. **Archivos `*_temp.txt` en raíz** — basura de sesiones anteriores (`schema_temp.txt`, `inventory_temp.txt`, etc.). Borrar o agregar a `.gitignore`.
4. **`COT-2026-002-ME.pdf` en raíz** — PDF de prueba. No debe commitearse (agregar patrón a `.gitignore`).
5. **Worktrees basura en `.claude/worktrees/`** — copias viejas del código. Se pueden eliminar con seguridad.
6. **Auditoría V3 pendiente** — ver `auditoria_v3_20260408.md` para 21 hallazgos.
7. **Libro Bancos — nro_operacion duplicado en descripción** (cosmético): Algunas líneas importadas de EECC muestran "1845485 1845485". Parser tiene dedup parcial.
8. **Libro Bancos — KPI Comisiones siempre S/ 0.00**: Líneas ITF/N/D importadas de EECC tienen ref_tipo=NULL, el cálculo solo suma ref_tipo='GASTO_BANCARIO'.

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
- [ ] **Verificar end-to-end PDF** (Julio, próxima sesión): clickear `👁️ Ver` y `📄 PDF` en cotizaciones METAL y PERFOTOOLS — debe abrir / bajar sin 500
- [ ] **Verificar end-to-end fotos** (Julio, próxima sesión): subir foto HEIC desde iPhone y desde PC → debe llegar a Cloudinary y aparecer en preview + PDF con foto bajo subtotal
- [ ] Rotar `CLOUDINARY_API_SECRET` (memoria dice que fue expuesto en chats anteriores)
- [x] ~~Investigar 2 registros `COT 0000-000-MN`~~ → no existen en Supabase (verificado 01/05/2026 vía MCP). Era basura de MySQL local.
- [x] ~~Fix KPI comisiones en Libro Bancos~~ → no es bug. Tabla `movimientobancario` vacía. Cuando se importe el primer EECC, la heurística de `esComisionImportada()` ya cubre ITF/N/D/COM./PORTE.
- [ ] Race condition correlativos cotizaciones (`COUNT(*)` fuera de transacción en `CotizacionService.ts:63`)
- [ ] Resolver hallazgos de auditoría V3 (prioridad: F01, F06, A02, A06)
- [ ] Eliminar worktrees basura en `.claude/worktrees/`
- [ ] Limpiar archivos `*_temp.txt`, `COT-2026-002-ME.pdf`, `auditoria_erp_pro.pdf`, `auditoria_v2_contexto.txt` en raíz
- [ ] Fix nro_operacion duplicado en descripción de EECC importados (cuando empiece a importar)
- [ ] **Decisión estratégica:** ¿Fase B (facturación electrónica STUB→REAL) o Fase C (Logística + Almacén valorizado) primero?
- [ ] Módulo Logística completo (UI con 3 tipos: GENERAL/SERVICIO/ALMACEN) — Fase C
- [ ] OC de servicios en Finanzas (tabla nueva en BD) — Fase C
- [ ] Almacén valorizado con kárdex por ítem — Fase C
- [ ] Replicar hints contextuales (`.app-form-hint`) en Cotización Comercial, Logística OC, Compras, Cobranzas Finanzas (piloto hecho en Configuración Empresa)
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

## Auditoría 30/04/2026 — donde estamos parados

| Fase del Plan Maestro | Estado | Notas |
|---|---|---|
| **G** Rediseño Enterprise UI | ✅ **CERRADA** | 10 commits 27/04 + 7 cotizaciones + sidebar mobile/HEIC/PDF preview/colapsable |
| **A** Fundaciones (config, auditoría, periodos, adjuntos, roles) | 🟢 **CASI HECHA** | Migraciones 020-024 aplicadas. Módulo `app/modules/configuracion/` con 4 services (`ConfiguracionService`, `AuditoriaService`, `PeriodosService`, `AdjuntosService`). Falta verificar wizard de setup completo y uso del audit log en todas las rutas sensibles. |
| **B** Facturación electrónica + Libros SUNAT | 🟡 **MODO STUB** | Tablas Facturas/NotasCredito/GuiasRemision creadas (025-027). `NubefactService` implementado pero con flag STUB en línea 4. **Bloqueado por:** certificado digital + cuenta Nubefact REAL (gestión externa de Julio). |
| **C** Logística + Almacén valorizado + Dashboards | 🟡 **PARCIAL** | OC funcionando (029-030 + 042) con edit/delete/PDF/preview. Falta módulo Logística completo con 3 tipos (GENERAL/SERVICIO/ALMACEN) y kárdex de Almacén valorizado. |
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

## Snapshot de `git status` (al 2026-05-01)

**Working tree de este worktree limpio.** Todo pusheado a `origin/main`. Railway desplegado y verificado contra Supabase.

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

**Total: 46 commits** desde el rediseño Enterprise.

## Para Claude (próxima sesión)

Si Julio dice "sigamos con cotizaciones" o reporta un bug del módulo Comercial:
1. **Leer primero** `~/.claude/projects/D--proyectos-ERP-PRO/memory/project_cotizaciones_fotos_y_edit.md` — ahí están todas las decisiones críticas no obvias.
2. **Si reporta "no me deja subir foto"**: verificar primero (a) cache del navegador, (b) que Railway tenga las env vars Cloudinary, (c) que el cache buster JS esté bumpeado en `index.html`. **Para HEIC en Chrome Windows:** ya está resuelto (commit `61fa07b`) — acepta por extensión cuando Chrome no reconoce el MIME.
3. **Si reporta error "edit is not defined" o pantalla roja al editar/borrar**: el `idp` con guion rompe HTML inline. Cambiar a underscore.
4. **Si reporta "PDF da HTTP 500" o "Configuración no encontrada"**: la tabla `ConfiguracionMarca` (lowercase en Postgres) debe tener filas para METAL y PERFOTOOLS. Verificar con `SELECT marca FROM configuracionmarca;` vía Supabase MCP en project `fhlrxlsscerfiuuyiejw`. Si faltan, ya hay defaults hardcoded en `CotizacionPDFService.ts` que evitan el 500, pero el ideal es re-insertar las filas.
5. **Cuando se commitea cambios en `public/js/`**: SIEMPRE bumpear el cache buster del script en `index.html` (`?v=YYYYMMDDr#`). Sin esto, los navegadores cargan el JS viejo y los fixes no se ven.
6. **Para hacer push a producción desde un worktree**: la rama `main` está checkout en `D:/proyectos/ERP-PRO`, así que NO se puede `git checkout main` desde el worktree. Usar `git push origin <branch-actual>:main` para empujar el commit como nuevo `main` (solo si es fast-forward).

### Basura a limpiar (aún en disco, no commiteada)
```
*_temp.txt (schema, inventory, main_css, connection, finance, prestamos_tributario, contexto_fase1)
COT-2026-002-ME.pdf (PDF de prueba)
auditoria_erp_pro.pdf (duplicado del .md)
auditoria_v2_contexto.txt (contexto viejo)
```

### Dir `.claude/` — untracked
Contiene worktrees y configuración local. **NO commitear.** Ya en `.gitignore`.

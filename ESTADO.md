# ESTADO DEL PROYECTO — ERP-PRO

> **LEER PRIMERO.** Este documento es la fuente de verdad sobre qué está hecho, qué falta y dónde estamos parados. Se actualiza al cierre de cada sesión de trabajo.

**Última actualización:** 2026-06-24 sesión 6 — **XSS Fase 2 (CSP hardening)** implementada y **verificada en navegador** en rama `claude/csp-hardening-fase2` (PR pendiente). En paralelo sigue abierto el PR #17 (cookie httpOnly, Fase 3a) — ambos son gate de merge de Julio.
**Rama activa:** `claude/csp-hardening-fase2`. (PR #17 cookie httpOnly y PR #18 docs AGENTS.md también esperando merge.)
**Ramas integradas (PR #16, merged):** `claude/backend-hardening`, `claude/xss-escape-html`, `claude/auth-locks-dormant`.
**✅ Post-merge hecho:** migs 075 (PRESTAMOS al CHECK) + 076 (search_path + 20 índices FK) **aplicadas vía MCP a Supabase y verificadas**; `get_advisors` security = `[]`. **Candados de autorización DORMIDOS** (GERENTE pasa todo — no restringe a nadie hasta "echar llave"). Único pendiente opcional: smoke test manual del XSS (inyectar `<img src=x onerror>` en un campo → debe verse inerte).
**⚠ OJO apply_migrations.ts:** usa mysql2 contra `.env.railway` = **Railway MySQL LEGACY**, NO el Supabase productivo. Las migraciones a prod se aplican **vía MCP `apply_migration`** (o adaptando a Postgres), NO con ese runner.
**Servidor dev:** `npx ts-node index.ts` en `D:\proyectos\ERP-PRO` → `http://localhost:3000`
**Producción:** `erp-pro-production-e4c0.up.railway.app` — Railway (deploy automático desde main, ACTIVE confirmado)
**Cache buster actual:** JS `v=20260623r4` (19 imports app.js + index.html + main.css).
**Migraciones BD:** 001 → **074** aplicadas en Supabase. **075 + 076 en el repo pero AÚN NO aplicadas** (project `fhlrxlsscerfiuuyiejw`). 075=PRESTAMOS al CHECK de usuariomodulos · 076=search_path trigger + 20 índices FK.
**Permisos Claude:** Claude hace commit+push a feature branches `claude/*` automáticamente. Merge/push a `main` lo autoriza Julio (gate de release) — en esta sesión autorizó el merge del PR #15 explícitamente.

---

## ✅ Sesión 2026-06-24 (6) — XSS Fase 2: CSP hardening (sin tocar handlers)

Sub-proyecto B de la deuda "XSS Fase 2/3". La CSP pasó de un `<meta>` permisivo a una **cabecera HTTP servida por helmet** (`index.ts`), eliminando el `<meta>` de `index.html` (una sola fuente de verdad). **Sin migraciones de BD. Sin tocar ningún `.js`** → no se bumpea cache buster.

**Cambios:** `script-src` pierde `'unsafe-eval'` (verificado: nadie lo usa, ni código propio ni `chart.min.js`); `object-src 'self'`→`'none'`; + 3 directivas que solo una cabecera puede aplicar: `frame-ancestors 'self'` (anti-clickjacking), `base-uri 'self'`, `form-action 'self'`. **Se mantiene `'unsafe-inline'`** (181 handlers `onclick` + cientos de `style=` + 2 scripts inline) → eso es Fase 3b.

**Verificado (server local + preview navegador):** `tsc` limpio · `check_mojibake` OK · cabecera CSP correcta en `/`, `/login.html` y API (curl) · sin `<meta>` duplicado · login 200 · **navegador: login + Dashboard con datos reales + 4 gráficos Chart.js renderizados + iframe blob (preview PDF) — CERO violaciones de CSP en consola.**

**Spec/Plan:** `docs/superpowers/specs/2026-06-24-csp-hardening-fase2-design.md` · `docs/superpowers/plans/2026-06-24-csp-hardening-fase2.md`.

**Pendiente:** abrir PR + merge de Julio. Tras el merge, Railway deploya solo (CSP aplica igual en prod, con HTTPS la cabecera HSTS de helmet ya estaba).

**Sigue pendiente XSS (Fase 3b, post-UAT):** event delegation para los 181 handlers `onclick=` + externalizar/hashear los 2 scripts inline → recién ahí se quita `'unsafe-inline'` de `script-src`. Quitar `'unsafe-inline'` de `style-src` (cientos de `style=`) = proyecto aparte.

---

## 🛡️ Seguridad — auditoría 2026-06-23 RESUELTA, consolidada en `claude/security-integration` (sin merge a main)

Los **4 grupos de hallazgos** de la primera auditoría formal (detalle: vault `sessions/2026-06-23-erp-pro-auditoria-seguridad-funcionamiento.md`) están resueltos y mergeados en `claude/security-integration`. **Pendiente humano:** Julio revisa + mergea a main + aplica migs 075/076 + smoke test.

- 🔴 **Stored XSS (CRÍTICO) → RESUELTO Fase 1** (`xss-escape-html`): `escapeHtml`/`escapeAttr` global en `ui.js` + `showToast` por `textContent` (mata XSS en todos los toasts); 18 archivos con renders de BD escapados; helpers con 8/8 unit tests. Cache buster JS → `v=20260623r4`. Detalle: `sessions/2026-06-23-erp-pro-xss-fase1.md`. **Falta Fase 2 (CSP estricta) + Fase 3 (token httpOnly + event delegation).**
- 🟠 **Autorización por módulo → RESUELTA (dormida)** (`auth-locks-dormant`): candados (ocRouter→LOGISTICA, facturas/facturacion/ple→FINANZAS, adjuntos→requireAnyModulo, `/prestamos`→llave PRESTAMOS), fix shadowing `/admin`, helper `requireAnyModulo`, frontend Sidebar/Usuarios + PRESTAMOS/PRODUCCION, **migración 075** (PRESTAMOS al CHECK, NO aplicada). GERENTE pasa todo → invisible en UAT. "Echar llave" = aplicar mig 075 + asignar módulos + bajar rol en Usuarios.
- 🟡 **Hardening backend (4 medios) → RESUELTO** (`backend-hardening`): errorHandler no expone el error pg crudo (mantiene mensajes de app); `TxConnection.query` envuelve error pg preservando `code` (retry-on-dup); `periodoGuard` fail-closed (override GERENTE); `validateParams` aplica el parseado de Zod; `ConfiguracionService` whitelist de columnas (mata inyección por identificador). Detalle: `sessions/2026-06-23-erp-pro-hardening-backend-y-db-advisors.md`.
- ⚪ **DB lints → migración 076** (`backend-hardening`, NO aplicada): `search_path` de `trigger_set_updated_at` + 20 índices de cobertura para FKs. Los ~40 "unused_index" NO se tocan (BD joven).
- ⚪ **Arquitectural pendiente:** token JWT en localStorage → cookie httpOnly (Fase 3 XSS); pase móvil en vivo (G20). Backup de la auditoría: `backups/erp-pro-2026-06-23T22-33-52.json`.

## ✅ Sesión 2026-06-23 — Fix OC centro_costo + Kanban responsive

- **OC fallaba con `value too long for type character varying(60)`**: el nombre del CC superaba 60 chars. Causa: inconsistencia de esquema (`OrdenesCompra.centro_costo`=60 mientras el resto del modelo=100, maestro=120). Fix: **mig 074** sube OC/firmasreglas a 100 + guard backend/frontend (`CC_NOMBRE_MAX=100`, maxlength+contador, traducción del error críptico). Bonus: audit de renombrado de CC usaba columna `descripcion` inexistente → arreglado.
- **Kanban se cortaba al abrir la sidebar**: breakpoints por `@media`/viewport no restaban los 260px de la sidebar. Fix: migrados a `@container` (ancho real). Verificado con repro aislado.
- PR #15 mergeado a main (`b0398d5`), deployado y verificado en producción.

## 🚨 Bug RESUELTO — Cobranzas USD/PEN (cerrado 08/05 noche, antes era ACTIVO)

Bug detectado 08/05 mañana, **cerrado 08/05 noche** en 1 sesión: A (UPDATE de 6 filas en Supabase) + B (commit `7a7983d` / merge `81e023d`: fix `recomputeEstado` SUM*tipo_cambio + modal USD prefill+hint, cache buster r2) + C (recompute matemático verificado 2400×3.478=8347.20). Caja Dólares y Dashboard Gerencial volvieron a su valor real. Ver `memory/project_bug_cobranzas_usd_pen.md` para detalle.

---

## 🚀 Sesión 12/05/2026 — Maratón Importaciones + Responsive

Sesión densa con 12+ commits a `claude/busy-brown-829244` y 6 merges a `main`. Todo desplegado y verificado en producción. Las 4 features principales:

### 1. Importaciones con landed cost (Perfotools) — **Migración 068**
Construido el flujo completo para que Perfotools cargue sus 5 importaciones/año desde China con costo real (proveedor + flete + desaduanaje + impuestos SUNAT + comisión banco), NO el crudo del proveedor.

**Nuevo estado `EN_TRANSITO`** en `OrdenesCompra.estado` (entre PAGO y RECEPCION). Solo aplica a ALMACEN. La OC se paga al proveedor extranjero pero NO entra al inventario hasta cerrar la importación.

**Nueva columna `oc_madre_id`** (FK self-reference en OrdenesCompra) — permite vincular OCs satélite (FICARGO, SUNAT, banco) a una OC ALMACEN madre. Las satélite son GENERAL.

**Nueva columna `landed_costed_at`** (timestamp) marca cuándo se cerró con landed.

**Nueva tabla `ImportacionGastoSnapshot`** — congela el desglose al cierre para auditoría.

**6 métodos nuevos en `OrdenCompraService`**: `marcarEnTransito`, `desmarcarEnTransito`, `vincularSatelite`, `desvincularSatelite`, `getResumenImportacion`, `cerrarImportacion`. Más 6 endpoints REST en `index.ts` (POST `/en-transito`, `/vincular-madre`, etc.).

**UI**: nueva columna 🚢 EN TRANSITO en kanban OC, botones contextuales `Marcar en tránsito` / `Vincular a importación` / `Cerrar importación`, modal de cierre con prorrateo por valor en vivo + ajuste manual. CSS responsive del kanban actualizado a 7 cols (4/2/1 según viewport).

**Tutorial HTML interactivo** en `public/tutorial-importaciones.html` (1315 líneas, self-contained) accesible en `https://erp-pro-production-e4c0.up.railway.app/tutorial-importaciones.html`. Calculadora landed interactiva + checklist persistente + glosario + cheat sheet. Versión rev 2 aclara que la naviera va DENTRO de la OC FICARGO (no se carga aparte).

**Fase 2 pendiente**: Rondas con inversionistas + reparto utilidades (Julio/Jorge/Alex 16.67% c/u, Perfotools 50%) — pausada, ver memoria.

### 2. Centros de Costo vinculados a Cotización — **Migración 069**
Antes el nombre del centro de costo era texto libre → terminaba con inconsistencia (mezcla cliente vs proyecto, "PDI S.A.C." vs "FABRICACION AUGER" para el MISMO proyecto).

**Nueva columna `id_cotizacion`** en CentrosCosto (FK a Cotizaciones, nullable). Al crear un centro tipo PROYECTO, picker condicional muestra cotizaciones APROBADA/TRABAJO_EN_RIESGO disponibles → el nombre se autocompleta `"<PROYECTO> · <CLIENTE>"`.

**Rename con propagación atómica**: cambiar nombre del centro propaga UPDATE a `OrdenesCompra`, `Gastos`, `Compras` que lo referencian (texto libre). Preview de impacto antes de confirmar. Solo GERENTE. Snapshot before/after en `Auditoria` (jsonb).

**Detección de huérfanos**: strings de `centro_costo` en OCs/Gastos/Compras que NO existen como registro formal en CentrosCosto. Botón "Regularizar" crea el registro formal sin tocar las referencias existentes.

**Hoy regularizados 3 huérfanos** que Julio tenía: VENTA DE AUGER PARA FUNDAS DE 1000 (6 OCs), PROYECTO DOBLADORAS (2 OCs), VENTA DE CORE ROLLER PARA FUNDAS DE 800 MM (1 OC). Total: 4 centros → 7 centros formales.

**Merge manual PDI → Auger ejecutado vía MCP**: las 5 OCs en BORRADOR de "PDI S.A.C." (correlativos 001-005 del 2026) se renumeraron a 007-011 y se movieron al centro "VENTA DE AUGER PARA FUNDAS DE 1000". Razón: las 5 eran de la cotización COT 2026-010-MN (proyecto Auger - cliente PDI). Verificación pre/post: cero data perdida (oc_total_bd = 86 antes y después). Audit log persistido en `Auditoria` con before/after en jsonb. La transacción atómica intentó 3 veces y rolló back 2 veces por constraints de seguridad antes de cuadrar: (a) UNIQUE compuesta `(nro_oc, empresa, centro_costo)` — fix renumerar primero, (b) columna `descripcion` no existe en Auditoria — fix usar `datos_antes/datos_despues`, (c) CHECK constraint `auditoria_accion_check` no acepta `'MERGE_MANUAL'` — fix usar `'UPDATE'`. **Lección: las constraints existentes funcionan como red de seguridad.**

### 3. Panel "Compromiso futuro de caja" en Dashboard
Card amarillo en tab Análisis del Dashboard. Muestra **solo OCs en estado APROBADA** (en revisión para pago, NO incluye BORRADOR ni PAGO en curso). Hoy son 17 OCs por S/ 4,980. Desglose por tipo_oc (GENERAL/SERVICIO/ALMACEN) en 3 tarjetas + top 5 OCs comprometidas mayor→menor + columna "aprobada hace X días" (rojo si >15d). Click en nro_oc abre modal de detalle. Convierte USD→PEN con tipo_cambio propio de cada OC (fallback a TC del día).

### 4. Pase responsive 2026 + consistencia tipográfica
Aplicadas best practices 2026 (UXPin, Scrimba, Eleken):
- **Fluid typography** con `clamp(18px, 2.2vw + 12px, 28px)` en h1/h2/títulos (sin saltos)
- **Container queries** en `.kpi-grid` → reacciona al ancho del contenedor, no solo viewport
- **Safe area insets** (iPhone notch, Android nav bar)
- **Touch targets 38px+** en mobile, inputs 16px (evita zoom iOS)
- **Kanban OC: 7 cols → 4 → 2 → 1** según breakpoint (1400/1100/900/600px) + scroll horizontal cuando no entra
- **Indicador visual de scroll lateral en tablas** (gradient ::after) + JS que activa `.has-scroll` solo cuando hay overflow real (ResizeObserver + MutationObserver)
- **Override de min-widths hardcoded** en filtros del listado OC (5 selects con min-width fijo total 660px)
- **Tabbar 3 cols** en celular para tabs largos (Logística tiene 8)
- **`overflow-x:hidden` global** en html/body para prevenir scroll horizontal accidental

**Préstamos refactorizado** para usar `kpiGrid` en vez de tarjetas inline con `font-size:28px` hardcoded → ahora consistente con Logística y Dashboard (26px desktop / 20px tablet / 16px mobile).

### Permisos Claude actualizados
`.claude/settings.local.json` extendido. Yo (Claude) ahora puedo hacer `git add/commit/push` a feature branches `claude/*` sin pedir permiso. **NO autorizado**: push directo a main, ni merge a main, ni reset/force. Eso queda como gate humano.

### Commits + merges de la sesión (12/05/2026)
- `b4a675e` fix(importaciones): completar metodos service + UI OC + mig 068 que faltaron en commit anterior
- `6eed035` Merge: completar importaciones que faltaban en main
- `ca1b1d6` feat(dashboard): panel compromiso futuro de caja (OCs aprobadas)
- `11082db` Merge: panel compromiso futuro de caja en Dashboard
- `c411821` feat(responsive): pase 2026 + kanban EN_TRANSITO + Prestamos usa kpiGrid
- `65fdd35` Merge: responsive pass + Prestamos consistente

Más algunos commits intermedios del flujo importaciones / centros costo / tutorial rev 2 que vinieron antes.

### Bugs encontrados durante la sesión (resueltos)
1. **Mojibake en `public/js/app.js` e `index.html`** — bytes UTF-8 grabados literal como Win1252 (`â˜°`, `Cargando mÃ³dulo...`). Fix manual + protección anti-mojibake en build (3 capas: `.editorconfig` + `.gitattributes` + `scripts/check_mojibake.js` corriendo como `prebuild`).
2. **Tendencia comercial chart** — línea verde "aprobado" invisible porque eje Y único compartido con cotizado (100x mayor). Fix: eje Y dual + incluir USD convertido a PEN.
3. **Préstamos form lateral montaba sobre tabla** — fix con modal (patrón de Logística).
4. **Kanban OC columna EN_TRANSITO no se mostraba** — había DOS arrays hardcoded de estados, actualicé `COLUMNAS_KANBAN_PRINCIPALES` pero olvidé `estadosOrden` (línea 962). Fix al sync ambos.
5. **Railway deploy fallido por archivos huérfanos** — al hacer commit del feature centros costo, el `OrdenCompraService.ts` modificado para importaciones quedó sin commitear. Railway buildea desde main, donde `index.ts` llamaba a métodos que el service en main NO tenía → 6 errores TS2339. Fix: commit faltante. **Lección guardada en memoria**: SIEMPRE verificar `git status` antes de armar `git add` cuando index.ts llama métodos nuevos de un service.

---



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

**Bugs activos al cierre del 03/05/2026 (noche tarde):**
- ~~(latente) `PurchaseService.registrarCompra()` `'INGRESO'` vs `'ENTRADA'`~~ → **resuelto en `4883fa6` (03/05 noche tarde).** Línea 208 ahora usa `'ENTRADA'`, alineado con `OrdenCompraService:432` y los SELECTs de `InventoryService:124`. Sin compras directas históricas afectadas.

**Sin bugs activos al cierre.**

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

## Sesión 03/05 noche tarde — bug INGRESO→ENTRADA + cleanup Servicios legacy (2 commits)

Bloque corto pegado a la sesión noche. **2 commits pusheados a `main`** (`4883fa6..ad94323`).

| Commit | Cambio |
|---|---|
| `4883fa6` | **Fix #6 latente:** `PurchaseService.registrarCompra()` insertaba `'INGRESO'` en `MovimientosInventario.tipo_movimiento` mientras dashboards filtran `'ENTRADA'`. Resultado: compra directa quedaba huérfana de los SELECTs (`InventoryService:124`, `OrdenCompraService:432` ya usan `'ENTRADA'`). Fix mínimo: cambiar línea 208 a `'ENTRADA'` + comentario explicando convención (kárdex usa ENTRADA/SALIDA, Transacciones financieras usan INGRESO/EGRESO). Sin impacto histórico — 0 compras directas en producción. La línea 391 (`'ANULACION_EGRESO'`) se dejó como audit log: nadie la lee. |
| `ad94323` | **Cleanup #5 — Servicios legacy desconectado del router visible:** sacar `import { Servicios }` y entrada `servicios: Servicios` del map `PAGES` en `app.js`. Marcar `CatalogService.ts` y `Servicios.js` con bloque `@deprecated` que explica por qué siguen vivos. Bumpear cache buster `v=20260503r4 → r5`. Lo que **NO** se borró: rutas `/api/servicios/*`, `api.services.*`, `CatalogService.ts`. Razón: `Logistica.js:46`, `OrdenesCompra.js:202` e `Inventario.js:28` consumen `getServiciosActivos()` para popular dropdowns. Cuando esos consumers migren a "Cotizaciones APROBADAS sin OC" se elimina todo físicamente. Bookmarks a `#servicios` ya caen al dashboard del usuario por el fallback existente en `navigate()` (`app.js:180-183`). |

### Estado pendientes priorizados (cierre 03/05 noche tarde)

| Prio | Tarea | Esfuerzo |
|---|---|---|
| ALTA | NCs entrantes (recibir NC del proveedor) | 2-3h |
| MEDIA | UI listado facturas emitidas | 1-1.5h |
| MEDIA | UI directa de Gastos | 1.5h |
| GRANDE | Fase D — Plan de Cuentas + asientos automáticos | 2-3 semanas |
| MUY BAJA | Fase 2 OC edit pesado en RECIBIDA/FACTURADA | 6h+ |

#5 y #6 cerradas. La próxima sesión arranca por NCs entrantes según el orden acordado.

---

## Sesión 03/05 noche larga — UI Facturas + Gastos + NCs entrantes (3 commits + docs)

Sesión de "ve tú lo más conveniente" siguiendo el orden propuesto: dos UI cortas visibles primero (Facturas Emitidas, Gastos del periodo) y NCs entrantes como cierre del bloque grande de la sesión. **3 commits de feature + 1 de docs pusheados a `main`** (`4024eb1..263d9b8`).

| Commit | Cambio |
|---|---|
| `4024eb1` | **UI Facturas Emitidas** — botón 🧾 en header de Finanzas. Backend ya estaba completo (commit `311f4f7` 02/05 + `api.facturas.list/get/pdfUrl/consultarEstado`); solo faltaba pantalla. Modal con tabla (comprobante, fecha, tipo, cliente+RUC, total, badge SUNAT, origen cotización), filtros (rango fechas default 90 días, tipo F/B, estado SUNAT, RUC), resumen totales por moneda, acciones 📄 PDF (`/api/facturas/:id/pdf` en pestaña nueva) y 🔄 Refrescar (solo en PENDIENTE/ERROR, llama POST /:id/consultar-estado). Cache `r5→r6`. |
| `cc330b9` | **UI Gastos del periodo** — botón 📋 en header de Finanzas. Vista cruzada para auditoría contable mensual de Luis/Jorge. Modal con tabla 11 columnas (fecha, comprobante+proveedor, concepto, CC, tipo badge, origen servicio/OC, subtotal, IGV, total, pagado con saldo, estado_pago badge), filtros (rango default mes actual, CC desde `api.centrosCosto.list`, tipo GENERAL/SERVICIO/ALMACEN/OPERATIVO, estado_pago, búsqueda libre con debounce 250ms, checkbox incluir anulados), resumen por moneda con desglose IGV+pagado. READ-only — para editar va a la OC origen. Cache `r6→r7`. |
| `263d9b8` | **NCs entrantes del proveedor** — bloque grande con migración + Service + rutas + UI completa. Detalle abajo. Cache `r7→r8`. |

### Detalle del bloque NCs entrantes (`263d9b8`)

**Problema que resuelve:** hasta ahora `NotasCredito` (mig 026) modelaba solo NCs SALIENTES (las que Metal Engineers emite vía Nubefact — bloqueado por certificado). Faltaba el caso del día a día: cuando el **proveedor** envía una NC por devolución/descuento/error de RUC, no había forma de registrarla en el sistema y se desincronizaban los totales de Compras/Gastos.

**Migración 055** (aplicada en Supabase vía MCP):
- `direccion ENUM('EMITIDA','RECIBIDA')` default 'EMITIDA' — preserva data existente.
- `proveedor_ruc` + `proveedor_razon_social` — snapshot del emisor.
- `id_compra_referencia` + `id_gasto_referencia` — vínculo a Compra/Gasto local (FK ON DELETE SET NULL).
- `estado_sunat` ahora acepta `'REGISTRADA'` (NC ya viene firmada por proveedor).
- UNIQUE `serie+numero` migra a índice parcial: aplica a EMITIDAS. Para RECIBIDAS el UNIQUE es `(proveedor_ruc, serie, numero)`.

**`app/modules/notas-credito/NotaCreditoService.ts` nuevo:**
- `listar(filtros)`, `obtener(id)`.
- `registrarEntrante(data)` atómico: valida vínculo, INSERT cabecera+detalle, rebaja `total_base` del Compra/Gasto, recalcula `estado_pago`. NO crea Tx — el reembolso se registra aparte como cobranza.
- `eliminarEntrante(id)` cascada inversa: revierte ajuste sumando el total y recalcula estado_pago.

**Rutas API `/api/notas-credito`** (requireModulo FINANZAS):
- `GET /` listar con filtros.
- `GET /:id` ficha con detalle.
- `POST /recibida` registrar (audit CREATE).
- `DELETE /:id` eliminar (audit DELETE, GERENTE only).

**API client:** `api.notasCredito.list/get/registrarEntrante/eliminar`.

**UI en Finanzas — botón 📥 NCs proveedor:**
- Modal con form colapsable "+ Registrar nueva NC" arriba: dropdown que combina Compras + Gastos no anulados (con monto + proveedor en label), autofill RUC/razón/moneda/serie+nro al elegir, motivos SUNAT (01-10), inputs serie/número/fecha de la NC del proveedor, montos con cálculo automático del total.
- Tabla de NCs registradas debajo: comprobante, fecha, proveedor, doc ajustado, motivo (badge), total, badge "📥 RECIBIDA", botón 🗑 (solo GERENTE — confirm con explicación de reverso).
- Resumen header con cantidad + totales por moneda.
- Modal solo cierra con × / Cerrar (gotcha #28).

**Próximo paso (cuando llegue certificado SUNAT):** emitir NCs SALIENTES vía `NubefactPayloadBuilder.buildNotaCredito` (ya existe). El Service ya queda listo para extender con un método `emitirSaliente()`.

### Estado pendientes priorizados (cierre 03/05 noche larga)

| Prio | Tarea | Esfuerzo |
|---|---|---|
| GRANDE | Fase D — Plan de Cuentas + asientos automáticos | 2-3 semanas |
| MUY BAJA | Fase 2 OC edit pesado en RECIBIDA/FACTURADA | 6h+ |

#5, #6, UI Facturas, UI Gastos y NCs entrantes cerradas. Ya no hay tareas cortas pendientes — el siguiente bloque grande es Fase D (Contabilidad PCGE) o esperar feedback de Julio sobre testing de las features nuevas.

Acciones manuales pendientes (no código):
- Rotar `CLOUDINARY_API_SECRET` (Julio en console.cloudinary.com + Railway env var).
- Gestionar certificado digital SUNAT + Usuario Secundario SOL para desbloquear Nubefact REAL + envío directo SIRE + emisión de NCs salientes.
- QA mobile real iPhone Safari + Android Chrome con dispositivo físico.

---

## Sesión 04/05/2026 — Maratón (10 commits + 1 fix de cierre)

Sesión muy larga con Julio probando en producción y reportando issues + features nuevas. **10 commits pusheados a `main`** (`0dc578a..f3cbf67`).

### Bloque 1 — Préstamos: carga histórica con abonos previos

| Commit | Cambio |
|---|---|
| `0dc578a` | **Feature**: campo opcional "Pagado/Cobrado a la fecha" en form de Préstamos Tomados/Otorgados. Caso real Julio: cargando préstamos 2023-2024 con abonos parciales ya hechos. Bloque amarillo "Carga histórica" con input + saldo restante calculado en vivo. Backend `createTomado`/`createOtorgado` aceptan `monto_pagado_inicial` (Tomado) y `monto_cobrado_inicial` (Otorgado), validan vs total, calculan saldo y estado correcto (PENDIENTE/PARCIAL/PAGADO). |
| `344d6cc` | **Fix**: blindar schemas Zod (`prestamoTomadoCreateSchema` y `prestamoOtorgadoCreateSchema`) declarando `monto_pagado_inicial`/`monto_cobrado_inicial`. El flujo HOY funcionaba porque Zod modo strip elimina extras silenciosamente, pero quedaba sin validación formal. Si alguien agrega `.strict()` después rompería sin warning. Smoke test E2E vía MCP confirmó que el flujo guarda saldo y estado correctos. |

### Bloque 2 — Fix sesión stale (Luis sin botones GERENTE)

| Commit | Cambio |
|---|---|
| `40fed5c` | **Bug crítico fixed**: Luis tenía rol GERENTE en BD pero no veía los botones que solo muestra a GERENTE en OCs/Cotizaciones/Compras. Causa: `localStorage.erp_user` y JWT se setean SOLO al login. Si el GERENTE cambia el rol de un usuario después, los chequeos en frontend (todos leen `localStorage.erp_user.rol`) ven el rol viejo hasta que el usuario haga logout/login. Fix: `AuthService.getProfileFromDB(id_usuario, jwtPayload)` lee BD fresca y emite nuevo JWT si detecta cambio. `GET /api/auth/me` reescrito para usar este método. `app.js init()` llama `refreshSessionFromServer()` antes de pintar la SPA — si hay cambio de rol, actualiza localStorage automático. Si /me responde 401 (usuario desactivado) redirige a login. |
| `327429c` | **Mejora**: `refreshSessionFromServer()` también se llama en cada `navigate()`. Si detecta cambio de rol/flags hace `window.location.reload()` automático con toast "Tus permisos fueron actualizados" — única forma 100% segura porque varias páginas leen rol al renderizar y guardan en variables locales. Una recarga manual única (Ctrl+Shift+R) deja el flujo robusto para siempre. |

### Bloque 3 — UX OC: editar líneas + 4 decimales

| Commit | Cambio |
|---|---|
| `6428cf8` | **Bug 1 fixed**: dropdown de proveedor vacío al editar OC desde otros módulos (kanban en Logística). Causa: `_proveedores`/`_servicios`/`_cfg` solo se cargan en init de OrdenesCompra; al llegar al modal sin pasar por ahí quedaban en `[]`. Fix: `nuevaOC()` ahora es async y lazy-loadea esas listas si están vacías. **Bug 2 fixed**: 33 inputs de monto con `step="0.01"` no permitían tipear más de 2 decimales. Find/replace global a `step="0.0001"` en 9 archivos pages/. |
| `2d76600` | **Feature**: precios unitarios de OC aceptan 4 decimales mientras IGV apagado (caso real: proveedor cotiza S/ 23.7899/u). Al marcar checkbox "Aplica IGV 18%" se redondean precios y cantidades a 2 decimales (norma SUNAT/SIRE), con toast informativo "Precios redondeados a 2 decimales (norma SUNAT al aplicar IGV)". Tooltip nuevo al lado del checkbox explica la regla. Aplicado en form Logistica.js + modal Editar OC en OrdenesCompra.js. BD ya soportaba 4 decimales en `detalleordencompra.precio_unitario` (DECIMAL(14,4)) — sin migración. |

### Bloque 4 — Kanban: estado faltante

| Commit | Cambio |
|---|---|
| `297dd07` | **Bug fixed**: una OC pagada en efectivo (cerrada con `cerrarSinFactura()`, estado `CERRADA_SIN_FACTURA` introducido en mig 054) aparecía en pestaña "Sin facturar" pero NO en el kanban de OCs porque el array `estadosOrden` la excluía. Fix: agregar `'CERRADA_SIN_FACTURA'` al final del array (después de PAGADA) + cambiar grid de 7 columnas fijas a `repeat(${estadosOrden.length},1fr)` para que escale. ESTADO_COLOR ya tenía la entrada (icon 🗂, naranja-tierra). Cubre también el kanban embebido en Logística → tab OC (que delega a `OrdenesCompra()`). |

### Bloque 5 — Fase 1 Rendiciones de Gastos por OC

| Commit | Cambio |
|---|---|
| `0933058` | **Feature grande — MVP de Rendiciones de Gastos** (módulo Administración). Caso de uso: tras pagar una OC (típicamente reembolso a colaborador para que compre items en efectivo), el responsable arma un expediente consolidado con comprobantes, firmas y resumen — exportable como PDF para archivo interno + entrega al contador. Decisiones acordadas con Julio: 1 OC = 1 rendición (id_oc UNIQUE), cualquier usuario firma cualquier casillero (auditado), adjuntos como referencia visual NO crean Compras/Gastos auto, numeración usa N° de OC. Migración 056 aplicada (Rendiciones + RendicionItems + RendicionAdjuntos con FKs CASCADE). `RendicionService.ts` con CRUD + cálculo automático de total_gastos/saldo_disponible + firmas con audit. `RendicionPDFService.ts` con cabecera + items + 3 firmas (texto en MVP, firma escaneada en Fase 2). 12 endpoints `/api/rendiciones/*` + multer para adjuntos a Cloudinary. Tab nueva "🧾 Rendiciones de Gastos" en Administración con modal "+ Nueva desde OC" (dropdown filtrado) + modal de edición con cabecera editable, items CRUD, adjuntos drag&drop, 3 checkboxes de firma con confirmación, botón Ver PDF + Eliminar (solo GERENTE). |

### Bloque 6 — Cierre de bugs sueltos

| Commit | Cambio |
|---|---|
| `df4120a` | **Bug fixed**: botón "+ Crear nuevo" en modal "Resolver ítems del catálogo" (al recibir OC ALMACEN sin id_item asignado) lanzaba `Uncaught SyntaxError: Invalid or unexpected token` → pantalla blanca. Causa: `onclick="window.OC._crearItem(${id}, '${desc.replace(/'/g, "\\'")}', ...)"` solo escapaba comillas simples; saltos de línea, comillas dobles y backslash rompían la sintaxis JS al renderizar. Fix: refactor a `data-crear-item="${id_detalle}"` + wire-up con `wireCrearItemButtons()` que busca la línea en `lineasPendientes` (objeto JS, no HTML) y llama `_crearItem` con args resueltos. Helper `escHtml()` agregado para escapar la descripción al renderizar la celda. Re-engancha handlers tras cada `renderTabla()`. Smoke test E2E con MCP: login + POST /api/inventario + cleanup confirmó flujo completo OK. |
| `f3cbf67` | **Bug fixed**: pestaña "Rendiciones de Gastos" mostraba toast "Error ejecutando consulta en BD" porque las queries `listar()` y `obtener()` hacían `SELECT oc.proveedor_nombre`, columna que NO existe en `OrdenesCompra` (solo guarda id_proveedor — el nombre vive en Proveedores.razon_social). Fix: agregar `LEFT JOIN Proveedores prov ON prov.id_proveedor = oc.id_proveedor` y reemplazar `oc.proveedor_nombre` por `prov.razon_social AS proveedor_nombre`. Verificado vía MCP que la query corregida ejecuta OK. |

### Lo que queda PENDIENTE de Rendiciones

| Fase | Alcance | Esfuerzo |
|---|---|---|
| **Fase 2** | Firmas escaneadas embebidas en PDF — agregar `firma_url` a Usuarios + UI para subir firma una vez en perfil + check que embebe la imagen al firmar | 1.5h |
| **Fase 3** | Merge de adjuntos al PDF final — usar `pdf-lib` para mergear constancia + OC + facturas en un solo expediente descargable | 2-2.5h |
| **Test real** | Julio probó la creación pero el feedback completo está pendiente. Caso concreto: OC 013-2026 con 3 comprobantes (2 facturas Peruvian Screw + 1 boleta Restaurante Yaiza) | (test usuario) |

### Resumen de bugs resueltos en la sesión 04/05

| Bug | Commit | Categoría |
|---|---|---|
| ROC Logística usaba prompt() nativo feo | `35477b2` (03/05 noche) | UX |
| KPI Caja Finanzas ≠ alerta CAJA_BAJA | `041569e` (03/05 noche) | Coherencia datos |
| PurchaseService usa INGRESO en kárdex | `4883fa6` (03/05) | Convención BD |
| Página Servicios legacy en router | `ad94323` (03/05) | Limpieza |
| Backend Fase B sin UI listado facturas | `4024eb1` (03/05) | Cierre Fase B |
| Sin vista cruzada de gastos auditoría | `cc330b9` (03/05) | Feature |
| Faltaba módulo NCs entrantes | `263d9b8` (03/05) | Feature + mig 055 |
| Préstamos no soportan abonos previos | `0dc578a` (04/05) | Carga histórica |
| Schemas Zod préstamos no declaraban monto_pagado_inicial | `344d6cc` (04/05) | Convención 3 capas |
| Luis (GERENTE) no veía botones | `40fed5c` + `327429c` (04/05) | Auth — sesión stale |
| Dropdown proveedor vacío al editar OC | `6428cf8` (04/05) | UX |
| Inputs P.U. con step=0.01 | `6428cf8` (04/05) | UX |
| Falta redondeo automático al marcar IGV | `2d76600` (04/05) | UX SUNAT |
| OC CERRADA_SIN_FACTURA invisible en kanban | `297dd07` (04/05) | UX |
| Sin módulo Rendiciones de Gastos | `0933058` (04/05) | Feature + mig 056 |
| "+ Crear nuevo" en Resolver ítems lanzaba SyntaxError | `df4120a` (04/05) | Bug crítico |
| Pestaña Rendiciones tira "Error consulta BD" | `f3cbf67` (04/05) | Bug crítico |

### Pendientes priorizados al cierre 04/05

| Prio | Tarea | Esfuerzo |
|---|---|---|
| **TEST** | **Julio probará Rendición de OC 013-2026** con sus 3 comprobantes reales (2 facturas Peruvian Screw + 1 boleta Restaurante Yaiza). Feedback antes de avanzar a Fase 2. | (usuario) |
| ALTA | **Fase 2 Rendiciones**: firma escaneada del usuario embebida en el PDF al marcar el check (subir una vez al perfil + Cloudinary) | 1.5h |
| MEDIA | **Fase 3 Rendiciones**: merge de adjuntos al PDF final con `pdf-lib` (expediente único descargable) | 2-2.5h |
| GRANDE | **Fase D Contabilidad** — Plan de Cuentas + asientos automáticos | 2-3 semanas |
| MUY BAJA | Fase 2 OC edit pesado en RECIBIDA/FACTURADA con reverso automático | 6h+ |

**Acciones manuales Julio** (no código):
- Rotar `CLOUDINARY_API_SECRET` en Cloudinary console + Railway env var
- Gestionar certificado digital SUNAT + Usuario Secundario SOL (desbloquea Nubefact REAL + envío SIRE + emisión NCs salientes)
- QA mobile real iPhone Safari + Android Chrome con dispositivo físico

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

## Sesión 04-05/05/2026 — Outbox Rendiciones + Personal + Inventario→Cotizaciones + Fase E v0 (8 commits)

Sesión grande con dos hilos: pulido de UX en módulos existentes + arranque oficial de la **Fase E (Producción Metalmecánica)** en versión MVP visor. **8 commits pusheados a `main`** (`b00020a..dcbd0d4`).

| Commit | Cambio |
|---|---|
| `b00020a` | **Outbox auto Rendiciones**: las OCs en estado PAGADA o CERRADA_SIN_FACTURA sin rendición ya creada aparecen automáticamente arriba de la lista en Administración → Rendiciones. Botón "▶ Iniciar rendición" crea la rendición auto-poblada y abre directo el editor. Endpoint `GET /api/rendiciones/oc-pendientes`. |
| `20262a6` | **ROC vista previa** 👁: paridad con cotizaciones/OC pero adaptado al formato Excel. Backend `ROCService.getDatos()` devuelve los mismos datos del Excel en JSON. Frontend modal grande (1100px) con KPIs + tabla agrupada por SEMANA + selectores año/semana editables in-place + botón "📥 Descargar Excel" para guardar. Endpoint `GET /api/ordenes-compra/roc/preview`. |
| `941b9ee` | **Módulo Personal** en Administración (Fase 1): tab 👥 Personal con KPIs (Oficina Central / Servicios / Otros generales) + secciones agrupadas + top personas + modal "+ Nueva OC de Honorario" simplificado con alta inline de persona natural (DNI + banco + tarifa default). **Migración 057**: Proveedores +tarifa_default +unidad_default. Endpoints `/admin/personal`, `/admin/personas` (GET+POST), `/admin/oc-honorario`. |
| `5bb75f1` | **Fix conceptual Personal** (gotcha #16): la OC 001-2026 (S/500 Julio Rojas, OFICINA CENTRAL, CERRADA_SIN_FACTURA) era un **anticipo para gastos varios** que se rinde después, NO un honorario por trabajo. **Migración 058**: OrdenesCompra +es_honorario BOOLEAN. Solo `POST /admin/oc-honorario` setea TRUE. `getPersonal` filtra por TRUE. Modal Servicio ahora dropdown de cotizaciones APROBADA/TRABAJO_EN_RIESGO en vez de campo libre (con vínculo `id_cotizacion`). Endpoint nuevo `/admin/cotizaciones-fondeadas`. |
| `2ca5850` | **Inventario → Cotizaciones**: el dropdown "Servicio destino" estaba vacío en producción porque leía de la tabla `Servicios` legacy (Camino A vacío). Migrado a cotizaciones APROBADA / TRABAJO_EN_RIESGO con optgroups. **Migración 059**: extender CHECK constraint de `movimientosinventario.referencia_tipo` para aceptar `'COTIZACION'` (antes solo SERVICIO/COMPRA/GASTO/PRESTAMO/ORDEN_COMPRA). `InventoryService.registrarConsumoServicio` acepta `id_cotizacion` (preferido) o `id_servicio` (legacy). Endpoint nuevo `/inventario/cotizaciones-fondeadas`. |
| `09a63ad` | **Snapshot CostosServicio en honorarios**: cuando se crea una OC con `es_honorario=TRUE` + `id_cotizacion`, INSERT inmediato en `CostosServicio` con `tipo_costo='MANO_OBRA_OC'`. Cubre el caso típico CERRADA_SIN_FACTURA (persona natural no factura). `facturar()` detecta el flag y NO duplica. `anular()` borra el snapshot, `reactivar()` lo recrea, `actualizar()` lo refresca. `eliminar()` ya barre por LIKE `%nro_oc%`. |
| `c0ccd47` | **Fase E v0 — Visor MVP de Producción** (ver bloque dedicado abajo). |
| `dcbd0d4` | **Fix UX**: bug al cerrar el modal de detalle de OT con la X (TypeError por handler frágil con `closest('[style*="position:fixed"]')` después de reemplazar innerHTML del header). Refactor: header dividido en `#ot-head-info` (info actualizable) + `#ot-close` (botón intacto con handler `ov.remove()` directo). |

### Fase E v0 — Visor MVP de Producción Metalmecánica (commit `c0ccd47`)

**Decisión estratégica con Julio**: arrancar la Fase E como **visor de sólo lectura** sin construir las 5 semanas completas (BOM, work centers, partes, QC, trazabilidad heat numbers, remanentes, etc.). Aprovechar la data ya enlazada a cotizaciones (materiales + honorarios) para mostrar HOY un panorama útil de rentabilidad por OT.

**Modelo conceptual**:
- "Orden de Trabajo (OT)" = cotización APROBADA / TRABAJO_EN_RIESGO / TERMINADA. Toda cotización fondeada o a riesgo es una OT implícita.
- Costos reales = SUM `CostosServicio.monto_base` por `id_cotizacion`, agrupado por `tipo_costo`.
- Cotizado = `Cotizaciones.total` (convertido a PEN si moneda='USD' usando `tipo_cambio`).
- Margen = Cotizado − Costo imputado.

**Migración 060**: extender CHECK de `usuariomodulos.modulo` para aceptar `'PRODUCCION'`. GERENTE entra siempre por bypass.

**Backend** (`app/modules/produccion/ProductionService.ts`):
- `listarOTs(filtros)`: query con LEFT JOIN agregado a CostosServicio + breakdown (material/mano_obra/gasto_oc/otros) + totales + margen calculado. Filtros: estado, cliente (LIKE), rango fechas. Default activas.
- `obtenerOT(id)`: cotización completa + items cotizados + costos agrupados por categoría + movimientos de inventario detallados (kárdex específico de esa OT con `referencia_tipo='COTIZACION'`) + totales y margen.
- Endpoints `GET /api/produccion/ots` y `/:id` con `requireModulo('PRODUCCION')`.

**Frontend** (`public/js/pages/Produccion.js`):
- Item nuevo `🏭 Producción` en sidebar (sección Operaciones, icon `package`).
- Tabla con KPIs agregados (OTs activas, cotizado total, costo imputado, margen total con %) + filtros (estado, cliente).
- Fila por OT con margen color-coded: verde ≥30%, amarillo 15-30%, rojo <15% o pérdida.
- Filas grises = sin costos imputados (con hint).
- Modal detalle con KPIs específicos + barra horizontal stacked (proporciones visuales) + tablas plegables por categoría (Material azul, MO naranja, GastoOC violeta, Otros gris) + sub-detalle plegable con kárdex completo de los retiros del almacén.
- Empty state con CTA si la OT está vacía: "→ Inventario / Personal seleccionando esta cotización".

**Lo que NO incluye** (queda para Fase E completa, 5 semanas):
- Tabla `OrdenesTrabajo` formal
- BOM (Bill of Materials)
- Work Centers + cálculo OEE
- Partes de producción (operarios marcando tiempos)
- QC checklists con foto-evidencia
- Trazabilidad heat numbers / certificados de material
- Remanentes (retazos reutilizables)
- PDFs con QR / pantalla "Piso de Planta"

### Verificaciones post-deploy (Julio confirmó)

- ✅ Pantalla 🏭 Producción carga, lista 5 OTs activas con sus cotizados.
- ✅ Modal detalle muestra KPIs y desglose; al cerrar con X funciona OK tras fix `dcbd0d4`.
- ⏳ Pendiente verificar end-to-end: cargar un retiro de inventario contra una cotización → ver bloque azul "Material" aparecer; crear OC honorario → ver bloque naranja "Mano de obra".

### Pendientes priorizados al cierre 05/05/2026

| Prio | Tarea | Esfuerzo |
|---|---|---|
| **TEST** | Probar flujo end-to-end Producción: retirar material + crear OC honorario contra cotización APROBADA, verificar que aparece en bloques de detalle. | (usuario) |
| **TEST** | Julio probará Rendición OC 013-2026 con sus 3 comprobantes reales (pendiente desde 04/05). | (usuario) |
| ALTA | Decisión estratégica: ¿extender Fase E (BOM, Work Centers, partes producción) ahora o esperar a la fecha del Plan Maestro (agosto)? | — |
| ALTA | Snapshot CostosServicio para OCs SERVICIO no-honorario (subcontratos, viáticos) — opción 2 que descartamos por ir con la mínima. | ~1h |
| MEDIA | Fase 2 Rendiciones: firma escaneada embebida en PDF | ~1.5h |
| MEDIA | Fase 3 Rendiciones: merge de adjuntos al PDF con `pdf-lib` | ~2-2.5h |
| GRANDE | Fase D Contabilidad — Plan de Cuentas + asientos automáticos | 2-3 sem |

**Acciones manuales tuyas** (sin tocar):
- Rotar `CLOUDINARY_API_SECRET` (console.cloudinary.com + Railway env var)
- Gestionar certificado digital SUNAT + Usuario Secundario SOL (desbloquea Nubefact REAL + envío SIRE + NCs salientes)
- QA mobile real iPhone Safari + Android Chrome con dispositivo físico

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

## Snapshot de `git status` (al 2026-05-05)

**Working tree de este worktree limpio.** Todo pusheado a `origin/main`. Railway desplegado, sirviendo `v=20260504r14`.

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
- 2 commits sesión 03/05 noche (modal ROC Logística + unificar Caja KPI vs alerta, `35477b2..041569e`)
- 2 commits sesión 03/05 noche tarde (bug INGRESO→ENTRADA + cleanup Servicios legacy, `4883fa6..ad94323`)
- 3 commits sesión 03/05 noche larga (UI Facturas Emitidas + UI Gastos del periodo + NCs entrantes con migración 055, `4024eb1..263d9b8`)
- 10 commits sesión 04/05 maratón (préstamos histórico + auto-refresh sesión + 4 decimales OC + kanban + Fase 1 Rendiciones + fix SyntaxError, `0dc578a..f3cbf67`)
- 1 commit cierre 04/05 (`0033c37` — docs sesión maratón)
- **8 commits sesión 04-05/05 (outbox Rendiciones + preview ROC + módulo Personal + Inventario→cotizaciones + snapshot CostosServicio + Fase E v0 visor + fix close modal, `b00020a..dcbd0d4`)**

**Total: 97 commits** desde el rediseño Enterprise.

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
9. ~~Bug latente PurchaseService INGRESO vs ENTRADA~~ → cerrado en `4883fa6` (03/05 noche tarde). Convención: `MovimientosInventario.tipo_movimiento` usa `'ENTRADA'`/`'SALIDA'`/`'AJUSTE'`/`'ANULACION_*'`. `Transacciones.tipo_movimiento` usa `'INGRESO'`/`'EGRESO'` (financieras). No mezclar.
10. **Saldos de Caja — fuente única `CobranzasService.calcularSaldosNetos()`** (desde `041569e` 03/05 noche). Cualquier KPI o alerta que mencione "saldo en caja", "Caja Soles", "Caja Dólares" debe consumir este helper, NO leer `Cuentas.saldo_actual` directamente (ese campo es snapshot legacy y diverge). Fórmula: `cobranzas DEPOSITO_BANCO - GastoBancario - PagosImpuestos` por moneda. NO incluye Banco de la Nación (detracciones se manejan en `bn` del dashboard). Si Julio reporta un mismatch entre alerta y dashboard de Finanzas, lo primero que hay que verificar es que ambos lados consuman el helper.
11. **NCs (Notas de Crédito) — tabla `NotasCredito` modela DOS direcciones** (desde `263d9b8` 03/05). Columna `direccion`: `'EMITIDA'` (Metal Engineers → SUNAT vía Nubefact, bloqueado por certificado) y `'RECIBIDA'` (proveedor → registro local que ajusta Compra/Gasto). Para RECIBIDAS: se llena `proveedor_ruc/razon_social` + `id_compra_referencia` o `id_gasto_referencia`; estado_sunat = `'REGISTRADA'`. UNIQUE serie+numero es índice parcial: solo aplica a EMITIDAS (RECIBIDAS pueden colisionar entre proveedores distintos). Para emitir NCs SALIENTES cuando llegue el certificado, extender `NotaCreditoService` con método `emitirSaliente()` usando `NubefactPayloadBuilder.buildNotaCredito` que ya existe.
12. **Auto-refresh de sesión** (desde `40fed5c` + `327429c` 04/05). `localStorage.erp_user` se setea SOLO al login. Si el GERENTE cambia el rol/módulos/permisos de un usuario después, el localStorage queda stale hasta logout. Solucionado: `app.js init()` y `navigate()` llaman `refreshSessionFromServer()` que va a `GET /api/auth/me` (que ahora lee BD fresca con `AuthService.getProfileFromDB`). Si detecta cambio de rol/flags hace `window.location.reload()` automático con toast. Si /me devuelve 401 (usuario desactivado) redirige a login. Para que un usuario afectado vea los cambios necesita UN solo Ctrl+Shift+R; después funciona automático para siempre.
13. **OrdenesCompra NO guarda `proveedor_nombre`** — solo `id_proveedor`. Para mostrar el nombre, JOIN con `Proveedores prov ON prov.id_proveedor = oc.id_proveedor` y usar `prov.razon_social`. Bug histórico: queries que asumen snapshot del nombre en OC fallan. Fix aplicado en RendicionService (`f3cbf67` 04/05). Si vas a hacer otra query nueva contra OC y necesitás el proveedor, recordá el JOIN.
14. **Rendiciones de Gastos — Fase 1 MVP en producción** (desde `0933058` 04/05). 1 OC = 1 rendición (id_oc UNIQUE). Tab "🧾 Rendiciones de Gastos" en módulo Administración. PDF horizontal con cabecera + items + 3 firmas (texto). Adjuntos en Cloudinary (carpeta `metalengineers/rendiciones/{id}`). Cualquier usuario firma cualquier casillero (auditado), GERENTE puede quitar firma de cualquiera. Eliminar rendición es solo GERENTE. **Fases siguientes**: Fase 2 = firma escaneada embebida (1.5h), Fase 3 = merge de anexos al PDF (2-2.5h con `pdf-lib`).
15. **Patrón onclick inline con strings = peligroso**. Si pasás un string al onclick interpolando con `${variable.replace(/'/g, "\\'")}`, vas a romper si la variable tiene comillas dobles, saltos de línea o backslash. Síntoma típico: `Uncaught SyntaxError: Invalid or unexpected token` + pantalla blanca. Patrón seguro: usar `data-attribute="${id}"` y wire-up post-render con `querySelectorAll('button[data-x]')` + `forEach(b => b.onclick = ...)`. Resolver los strings desde la fuente de datos JS, no del HTML. Caso histórico: `df4120a` (modal Resolver ítems del catálogo).
16. **`es_honorario` flag distingue trabajo vs anticipo**. OCs con `es_honorario=TRUE` representan trabajo realizado de persona natural (oficina, limpieza, almacenero, servicio). OCs con flag FALSE son todo lo demás (compras almacén, anticipos para gastos varios que se rinden después, OCs a empresas). Solo el endpoint `POST /admin/oc-honorario` setea TRUE. La tab 👥 Personal en Administración filtra por TRUE; las OCs anticipo en BORRADOR/APROBADA aprobadas para Julio Rojas (S/500 etc.) NO aparecen ahí, son rendiciones.
17. **CostosServicio se llena automático desde 3 lugares**. (1) `InventoryService.registrarConsumoServicio()` cuando se retira material → `tipo_costo='MATERIAL_CONSUMO'`. (2) `OrdenCompraService.crear()` cuando es honorario con id_cotizacion → `tipo_costo='MANO_OBRA_OC'` (snapshot inmediato, NO espera a facturar). (3) `OrdenCompraService.facturar()` cuando es SERVICIO no-honorario → `tipo_costo='GASTO_OC'`. Los 3 vinculan por `id_cotizacion`. La tabla 'Servicios' legacy (vacía en producción) ya NO se usa para nada de esto.
18. **Producción Fase E v0 = visor sólo de lectura**. Cada cotización APROBADA / TRABAJO_EN_RIESGO / TERMINADA es una OT implícita. NO hay tabla `OrdenesTrabajo` formal todavía. Costos vienen de `CostosServicio` filtrado por id_cotizacion. El módulo full (BOM, work centers, partes, QC, trazabilidad heat numbers, remanentes, PDFs con QR) queda para cuando arranquemos las 5 semanas reales (Plan Maestro Fase E).
19. **Convención: dev server desde D:/proyectos/ERP-PRO, NO desde worktree**. `npx ts-node index.ts` en el directorio principal. Worktrees son solo para edición. Si Claude propone "preview server", recordar que la convención del proyecto es ejecutar el comando en otro shell.
20. **Importaciones (mig 068, sesión 12/05) — flujo en 3 OCs por importación Perfotools**. (1) OC ALMACEN al proveedor extranjero (productos) → `marcarEnTransito` (estado EN_TRANSITO). (2) OC GENERAL a FICARGO (servicio logístico incluye Ocean Freight) → `vincularSatelite(id_oc_madre)`. (3) OC GENERAL para impuestos SUNAT (en PEN) → `vincularSatelite`. Cuando llega el barco + todas las satélite cargadas → `cerrarImportacion` desde el detalle de la OC madre. Modal muestra el resumen + prorrateo por valor (editable) y al confirmar entra al inventario con landed cost + snapshot en `ImportacionGastoSnapshot`. La naviera NO se carga como OC aparte (FICARGO la incluye). Ver tutorial en `public/tutorial-importaciones.html` o URL producción para detalle.
21. **Centros de Costo vinculados a Cotización (mig 069, sesión 12/05)**. Al crear CC tipo PROYECTO en Logística → picker condicional muestra cotizaciones APROBADA/TRABAJO_EN_RIESGO disponibles (no asignadas a otro CC). Nombre se autocompleta `"<PROYECTO> · <CLIENTE>"`. Renombrar un CC dispara propagación atómica a OrdenesCompra+Gastos+Compras (preview de impacto). Solo GERENTE. Audit log en `Auditoria` (datos_antes / datos_despues en jsonb). Si Julio reporta "centros con nombres inconsistentes", el flujo es: (a) crear nuevo desde cotización, (b) regularizar huérfanos detectados (cuadro amarillo arriba de la tabla), (c) hacer rename del centro viejo con propagación. Para casos especiales de **merge entre centros** (cuando 2 centros existentes son el mismo proyecto): no se puede vía UI por la constraint UNIQUE `(nro_oc, empresa, centro_costo)`. Hay que hacerlo vía SQL en Supabase (renumerar correlativos primero + UPDATE centro_costo + audit log). Ver memoria `project_centros_costo_merge_pdi_auger.md` para precedente.
22. **Permission rules en `.claude/settings.local.json`** — desde 12/05 puedo hacer `git add/commit/push` a feature branches sin pedir permiso. Reglas exactas: `Bash(git push)`, `Bash(git push -u origin claude/*)`, `Bash(git push origin claude/*)`, `Bash(git push origin HEAD:*)`. Pero NO `git push origin main` ni `git push` desde el main worktree (la sandbox de Claude detecta default branch y bloquea). El push final a main lo hace Julio manualmente. Si Julio pregunta "puedes hacerlo tú", la respuesta es: yo hago commit+push al branch claude/*, después le paso comandos para merge+push main (3 comandos). Para cambiar esto: el user habilita más reglas explícitas, pero la convención actual es que main = release deliberado por humano.
23. **Constraints de Supabase como red de seguridad** (sesión 12/05). Los UPDATE/INSERT directos vía MCP pueden fallar por constraints existentes: UNIQUE compuesta (`ordenescompra_uk_oc_nro_uk` = nro_oc+empresa+centro_costo), CHECK (ej. `auditoria_accion_check` solo acepta CREATE/UPDATE/DELETE/ANULAR/LOGIN/LOGOUT/CONFIG/EXPORT/EMIT), columnas que no existen (ej. Auditoria NO tiene `descripcion`, usa `datos_antes/datos_despues` en jsonb). Cuando una transacción falla, hace rollback automático y NADA cambia. Si vas a hacer un UPDATE masivo, mejor envolverlo en `BEGIN; ... COMMIT;` explícito para garantizar atomicidad. Y siempre hacer snapshot ANTES (SELECT COUNT) y DESPUÉS para verificar que no se perdió data.
24. **Convención cache buster CSS** (desde 12/05) — además de `app.js?v=YYYYMMDDr#` y todos los imports, también `main.css?v=YYYYMMDDr#` en el `<link>` de `index.html`. Si solo tocás CSS no JS, NO olvidar bumpear el de CSS también, sino el browser carga el CSS viejo. Esto pasó al final de la sesión 12/05 — agregué un block "Pase Responsive 2026" al final de main.css y al inicio nadie lo veía hasta que bumpé el `?v=`.

### Estado del filesystem (worktree principal)
- Working tree limpio en este worktree (`elegant-herschel-050bb4`).
- En `D:/proyectos/ERP-PRO`: `.gitignore` y `ESTADO.md` modificados (WIP de Julio según heads-up histórico) + carpeta `backups/` untracked.
- Carpeta basura `D:/proyectos/ERP-PRO/.claude/worktrees/awesome-satoshi-ec1075` quedó con lock de Windows tras prune; se elimina al cerrar el proceso que la tiene abierta (probablemente VS Code o antivirus).

### Dir `.claude/` — untracked
Contiene worktrees y configuración local. **NO commitear.** Ya en `.gitignore`.

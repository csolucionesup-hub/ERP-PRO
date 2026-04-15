# ERP-PRO — CLAUDE.md

> **⚠ LEER SIEMPRE PRIMERO: [`ESTADO.md`](./ESTADO.md)** — contiene el estado real de avance del proyecto (módulos completos, trabajo sin commitear, bugs pendientes, próximos pasos). Este archivo (`CLAUDE.md`) es referencia técnica estable; `ESTADO.md` es la foto viva de dónde estamos.

Sistema ERP para empresa de servicios peruana. Backend Node.js/TypeScript con lógica tributaria peruana (IGV, detracciones, retenciones). Frontend Vanilla JS estático.

**Cliente actual:** Metal Engineers SAC — RUC: 20610071962
**Rubro:** Fabricación metalmecánica, herramientas para cimentaciones profundas
**Web:** www.metalengineers.com.pe
**Dirección:** Calle Rio Cenepa Mz D Lote 5 - Urb. El Cascajal - La Molina - Lima

---

## Tech Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js + TypeScript 5 (target ES2022, strict mode) |
| Framework | Express 5 (async errors nativas, sin try/catch manual en rutas) |
| Base de datos | MySQL via `mysql2/promise` (pool de 10 conexiones) |
| Validación | Zod 4 — usar `error:` no `required_error:` (API de Zod 4) |
| Frontend | HTML/CSS/JS Vanilla en `/public/` |
| Deploy | Railway (nixpacks) — `npm run build` → `npm start` |
| Uploads | `multer` (memoria) + `cloudinary` (CDN + transformaciones) — fotos de cotizaciones |
| Dev | `ts-node index.ts` / PM2 con `ecosystem.config.js` |

Variables de entorno requeridas: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `NODE_ENV`, `JWT_SECRET`, `DEFAULT_ACCOUNT_ID`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_APPLICATION_CREDENTIALS`.

---

## Branding Metal Engineers

**Paleta de colores:**
| Variable CSS | Color | Uso |
|---|---|---|
| `--bg-sidebar` | `#000000` | Fondo sidebar |
| `--primary-color` | `#676767` | Item activo, botones |
| `--hover-primary` | `#000000` | Hover botones |
| `--bg-app` | `#f5f5f5` | Fondo general |
| `--text-primary` | `#000000` | Texto principal |
| `--text-secondary` | `#a5a5a6` | Texto secundario |
| `--text-sidebar` | `#d9dad9` | Texto nav sidebar |

**Logo:** `public/img/logo-metal.png` — PNG con 4 barras grises + "METAL ENGINEERS" + "EL ARTE DE LA PRECISIÓN"

**Datos bancarios fijos de Metal Engineers (para OC y cotizaciones):**
- Cta. Soles Interbank: 200-3004523324 / CCI: 003-200-003004523324-31
- Cta. Dólares Interbank: 200-3007027785 / CCI: 003-200-003007027785-37
- Email facturación: administracion@metalengineers.com.pe

---

## Autenticación y Roles (Implementado en sesión 08/04/2026)

### Tablas en BD
```sql
Usuarios (id_usuario, nombre, email, password_hash, rol, activo, ultimo_acceso)
UsuarioModulos (id, id_usuario, modulo)
```

### Roles
- **GERENTE** — acceso total a todos los módulos, sin necesidad de asignación
- **USUARIO** — accede solo a los módulos que el Gerente le asigne

### Módulos disponibles
`GERENCIA` | `COMERCIAL` | `FINANZAS` | `LOGISTICA` | `ALMACEN` | `ADMINISTRACION`

### Usuario inicial (Gerente)
- **Email:** julio@metalengineers.com.pe
- **Password:** Metal2026!
- **Script de creación:** `scripts/crear_gerente.ts`

### Archivos de auth
- `app/modules/auth/AuthService.ts` — login, crearUsuario, getUsuarios, asignarModulos, toggleActivo
- `app/middlewares/auth.ts` — requireAuth (verifica JWT), requireModulo(modulo)
- `public/login.html` — pantalla de login con logo y ojito toggle
- `public/js/pages/Usuarios.js` — gestión de usuarios (solo GERENTE)

### Flujo JWT
1. POST /api/auth/login → valida bcrypt → devuelve JWT 8h con { id_usuario, nombre, email, rol, modulos[] }
2. Frontend guarda token en localStorage como `erp_token`
3. Frontend guarda usuario en localStorage como `erp_user` (JSON)
4. api.js inyecta `Authorization: Bearer <token>` en todas las peticiones
5. Si recibe 401 → limpia localStorage → redirige a /login.html

### Rutas de auth
- `POST /api/auth/login` — público
- `GET /api/auth/me` — requiere token
- `GET|POST /api/usuarios` — requiere GERENTE
- `PUT /api/usuarios/:id/modulos` — requiere GERENTE
- `PUT /api/usuarios/:id/toggle` — requiere GERENTE

### Estado
- Sidebar dinámico implementado (filtra por rol/módulos)
- Redirección por rol al login implementada (`getPaginaInicio`)

---

## Arquitectura V2 — Multi-Módulo (En Desarrollo)

### Principio fundamental
**"Un dato se llena una sola vez."** Cada módulo consume lo que el módulo anterior produjo. Nadie duplica información.

### Flujo de datos entre módulos

```
COMERCIAL → crea cotización (cliente, monto, proyecto)
     ↓ solo cotizaciones APROBADAS
FINANZAS → genera OC con datos del cliente ya cargados
     ↓
LOGÍSTICA → registra gastos vinculados al servicio
     ↓
ALMACÉN → salida de insumos con precios ya registrados
     ↓
GERENCIA → dashboard consolidado con data de todos los módulos
ADMINISTRACIÓN → consume gastos de personal de Logística
```

### Módulos definidos

#### 1. GERENCIA
- Dashboard gerencial principal (KPIs globales: caja, CxC, CxP, utilidad, margen)
- Préstamos tomados y otorgados
- Vista consolidada de todos los módulos

#### 2. COMERCIAL
- Crear y gestionar cotizaciones (marcas: Metal Engineers PEN / Perfotools USD)
- N° correlativo: `COT YYYY-NNN-MN` o `-ME` (Perfotools)
- Estados cotización: En Proceso / Enviada / Aprobada / No Aprobada / Rechazada / Terminada / A la espera de Respuesta / Anulada
- Estados servicio: No iniciado / En ejecución / Terminado / Terminado con deuda
- Clientes recurrentes: DCC, OTOYA, PSV, PDI, SAMAYCA, PROMAFA, VENTURO
- PDF descargable con formato Metal Engineers
- Fotos de ítems: upload a Cloudinary desde el form (botón 📷 Subir foto)
- Editar cotización (solo estados EN_PROCESO / A_ESPERA_RESPUESTA) con confirmación
- Anular con confirmación → pestaña Anuladas aparte
- Reset total (solo GERENTE, con doble confirmación por texto)
- Dashboard interno: 8 KPIs, distribución por estado/marca, tendencia mensual, top clientes

#### 3. FINANZAS
- OC de servicios (jala datos de cotizaciones APROBADAS)
- N° correlativo OC: `OC N° NNN-YYYY-CENTRO COSTO`
- CxC, CxP, detracciones, retenciones
- Dashboard interno: flujo caja, CxC, CxP, detracciones pendientes

#### 4. LOGÍSTICA
**Tipo 1 — Gastos Generales:** centro de costo OFICINA CENTRAL
**Tipo 2 — Gastos de Servicio:** vinculado a proyecto, incluye honorarios persona natural (DNI, sin IGV)
**Tipo 3 — Compras de Almacén:** centro de costo ALMACEN METAL, precios guardados para Almacén
- Cuenta bancaria del proveedor viene del maestro de proveedores
- Dashboard interno: gastos por centro de costo y tipo

#### 5. ALMACÉN
- Stock valorizado, recepción de Logística Tipo 3
- Salida de insumos hacia servicios con precio unitario
- Kárdex por ítem
- Dashboard interno: stock bajo mínimo, valor total, movimientos

#### 6. ADMINISTRACIÓN
- Dashboard gasto en personal por mes y por proyecto
- Consume de Logística Gastos Generales + Gastos Servicio
- Solo visualiza, no re-digita

---

## Campos V2 — Estado BD (actualizado 09/04/2026)

Todos los campos V2 prioritarios han sido aplicados en BD:

| Tabla | Columnas nuevas | Migración |
|-------|----------------|-----------|
| Proveedores | `tipo`, `dni`, `banco_1_nombre/numero/cci`, `banco_2_nombre/numero/cci` | 008 |
| Gastos | `centro_costo`, `tipo_gasto_logistica` | 007 |
| Compras | `centro_costo` | 007 |

**Pendiente BD:**
- Reembolso a persona (observaciones) en Gastos
- OC de servicios Finanzas (tabla nueva)

---

## Arquitectura — Estado Actual (09/04/2026)

```
index.ts              ← rutas API (sin SQL inline — todo en Services)
app/
  middlewares/
    auth.ts           ← requireAuth + requireModulo (JWT real)
    validateId.ts     ← validateIdParam middleware
    errorHandler.ts   ← captura global de errores
  modules/
    admin/            ← AdminService.ts (resetDb, getCuentasSaldo, setSaldoInicial, getGastoPersonal)
    auth/             ← AuthService.ts
    comercial/        ← CotizacionService.ts, CotizacionPDFService.ts, ConfiguracionMarcaService.ts, CloudinaryService.ts, GoogleDriveService.ts
    finance/          ← FinanceService, TributarioService, PrestamosService, TipoCambioService
    services/         ← CatalogService
    purchases/        ← PurchaseService, ProvidersService
    inventory/        ← InventoryService
  validators/
    shared.ts         ← fechaField centralizado
database/
  migrations/
    001–009           ← aplicadas en BD (009 = última: ENUM Compras normalizado)
scripts/
  crear_gerente.ts    ← script one-time para crear usuario gerente
public/
  login.html
  css/
    main.css          ← paleta Metal Engineers + estilos toast
  js/
    app.js            ← SPA router, navigate() con fallback, getPaginaInicio()
    components/
      Sidebar.js      ← dinámico por rol/módulos
    pages/
      Administracion.js ← dashboard gasto personal (consumo de Logística)
      Comercial.js      ← CRUD cotizaciones COT YYYY-NNN-MN
      Compras.js | Finanzas.js | Inventario.js | Prestamos.js
      Proveedores.js | Servicios.js | Usuarios.js | Dashboard.js
      Logistica.js      ← placeholder (módulo pendiente)
    services/
      api.js          ← fetchAPI centralizado, namespace por módulo
      ui.js           ← showToast(), showSuccess(), showError() — NO usar alert()
```

---

## Reglas de Negocio y Lógica Tributaria Peruana

### IGV (18%)
```
igv_base = monto_base * 0.18    // siempre en servidor
total_base = monto_base + igv_base
```
- Honorarios persona natural: sin IGV

### Detracciones (SPOT)
```
monto_detraccion = monto_base * (detraccion_porcentaje / 100)
```
- Control de detracciones vive en módulo FINANZAS en V2

### Cobranza Máxima
```
cobrable_maximo = total_base - monto_detraccion - monto_retencion
TOLERANCIA_REDONDEO = 0.10
```

### Multi-Moneda
- `monto_base` siempre en PEN: `monto_base = monto_ingresado * tipo_cambio`
- Aplica en createServicio, createGasto, registrarCompra, updateCompra

### CxC
```
deuda_neta = total_base - monto_detraccion - monto_retencion - cobrado
// Subquery SIEMPRE correlacionada por referencia_id = s.id_servicio
```

---

## Gotchas Importantes

1. **Auth ACTIVA.** `requireAuth` verifica JWT real. Sin token → 401 → redirige a login.
2. **`DELETE /compras/:id` → HTTP 405.** Usar `POST /compras/:id/anular`.
3. **ENUMs normalizados:** Compras, Gastos y Transacciones usan `'ANULADO'`. Cotizaciones usa `'ANULADA'` (tabla distinta, no cambiar).
4. **Caja USD sin movimientos.** Todo va a `id_cuenta=1`.
5. **`createGasto` convierte USD→PEN** antes de calcular IGV.
6. **`anularGasto` revierte CostosServicio** con `LIMIT 1`.
7. **`deleteServicio` limpia** Transacciones → Detracciones → CostosServicio → Servicios.
8. **`getControlIGV` retorna `{ anio, mes }`.**
9. **`deleteTomado`/`deleteOtorgado` solo en PENDIENTE.**
10. **`fechaField` en `app/validators/shared.ts`** — no duplicar.
11. **Cuenta bancaria del proveedor** — ya existe en BD (migración 008): `banco_1_nombre/numero/cci`, `banco_2_*`.
12. **`centro_costo` obligatorio** en create de Gastos y Compras (Zod min(2)). `tipo_gasto_logistica` ENUM('GENERAL','SERVICIO','ALMACEN').
13. **GERENTE no necesita módulos asignados** — `requireModulo` lo deja pasar siempre.
14. **api.js usa fetchAPI()** — inyecta Bearer token. Namespaces: `api.services`, `api.finances`, `api.purchases`, `api.inventory`, `api.prestamos`, `api.tributario`, `api.tipoCambio`, `api.cotizaciones`, `api.administracion`, `api.usuarios`.
15. **localStorage:** `erp_token` (JWT), `erp_user` (JSON con datos del usuario).
16. **Cero `alert()` en frontend.** Usar `showSuccess(msg)` / `showError(msg)` de `public/js/services/ui.js`.
17. **Namespace window por módulo.** Cada página asigna `window.NombreModulo = { fn1, fn2 }` al final del setTimeout. Los handlers individuales siguen existiendo para los onclick del HTML generado.
18. **`api.services.depositarDetraccion(idServicio, body)`** — llama a `POST /servicios/:id/detraccion-deposito`.
19. **`navigate()` en app.js** redirige a `getPaginaInicio(user)` si la página no existe en `PAGES` (no rompe).
20. **Sin SQL inline en index.ts.** Todo SQL vive en Services. Si necesitas una query nueva, agrégala al Service correspondiente.
21. **Orden de rutas Express.** Todas las rutas específicas de `/cotizaciones` (`/dashboard`, `/anuladas`, `/upload-foto`, `/reset`) DEBEN ir ANTES de `/cotizaciones/:id` con `validateIdParam`, sino el middleware captura "dashboard" como id y tira 400.
22. **Cloudinary para fotos de cotización.** `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` en `.env`. `CloudinaryService.subirFotoCotizacion(buffer, name)` devuelve `{ url, public_id }`. Optimiza a max 1200x1200 + quality:auto + fetch_format:auto. Carpeta: `metalengineers/cotizaciones/`.
23. **Upload endpoint `POST /api/cotizaciones/upload-foto`.** Multer en memoria, límite 5MB, tipos JPG/PNG/WebP. Frontend: `api.cotizaciones.uploadFoto(file)` con FormData.
24. **Reset Comercial `DELETE /api/cotizaciones/reset`** — doble barrera: backend valida `rol === 'GERENTE'`, frontend exige tipear "BORRAR TODO" en modal. NO borra fotos de Cloudinary (solo la referencia en BD). Reinicia AUTO_INCREMENT.
25. **Estados editables de cotización:** `ESTADOS_EDITABLES = ['EN_PROCESO', 'A_ESPERA_RESPUESTA']`. El botón ✎ Editar en archivo solo aparece para esos estados. En otros estados solo hay PDF y Anular.
26. **Modales de confirmación reutilizables** en `Comercial.js`:
    - `confirmarAccion({titulo, mensaje, tipo})` → Promise<boolean>. Tipos: `warning`, `danger`, `info`.
    - `confirmarTexto({titulo, mensaje, textoRequerido})` → Promise<boolean>. Requiere tipeo exacto para habilitar botón. Usar para acciones destructivas.
27. **`updateCotizacion` en edit** hace DELETE + INSERT de detalles en transacción — debes mandar SIEMPRE el array `detalles` completo en el payload.

---

## Historial de Cambios

### Auditoría V1 (marzo 2026)
- `DELETE /compras/:id` → HTTP 405
- Fix Zod 4: `required_error` → `error`

### Auditoría V2 (06/04/2026)
- 22 de 27 hallazgos resueltos
- Pendientes BD: índice Servicios.estado, FK DetalleCompra, triggers PRESTAMO, id_cuenta hardcodeado

### Sesión 07/04/2026
- Rebranding Metal Engineers aplicado (paleta, logo en sidebar)
- Arquitectura V2 multi-módulo diseñada y documentada
- 6 módulos definidos con flujo de datos entre ellos
- Campos faltantes identificados para V2

### Sesión 08/04/2026 — Fixes de Auditoría + Auth + Frontend

**Fixes MEDIO (auditoría V2):**
- #15: `PUT /gastos/:id` movido a `FinanceService.updateGasto()` con ACID + USD→PEN
- #16: `POST /servicios/:id/terminar` movido a `CatalogService.terminarServicio()` con validación
- #17: `fechaField` centralizado en `app/validators/shared.ts` (eliminada duplicación en 3 schemas)
- #18/#26: `serviceCreateSchema` y `serviceUpdateSchema` con `moneda` + `tipo_cambio`

**Fixes BAJO (auditoría V2):**
- #23: Typo `utilidadReala` → `utilidadReal` en CatalogService
- #24: `functions/calculations.ts` eliminado (dead code)
- #25: `isomorphic-git` removido de package.json
- #27: Import `dashboardQuerySchema` no usado removido de index.ts

**Branding:**
- Paleta Metal Engineers aplicada en main.css (negro puro, grises neutros)
- Logo `/img/logo-metal.png` en sidebar con `display:flex` centrado
- `nav-item.active` con color `#676767`

**Sistema de Autenticación JWT:**
- Migración 002: tablas `Usuarios` + `UsuarioModulos`
- `AuthService`: login, crearUsuario (bcrypt), getUsuarios, asignarModulos, toggleActivo
- `auth.ts` reemplazado: `requireAuth` (JWT real) + `requireModulo(modulo)`
- Rutas: `POST /api/auth/login`, `GET /api/auth/me`, CRUD `/api/usuarios`
- `scripts/crear_gerente.ts`: crea usuario inicial
- Credencial gerente: `julio@metalengineers.com.pe` / `Metal2026!`

**Frontend de Auth:**
- `public/login.html`: fondo negro, card blanca, logo, ojito toggle password
- `public/js/pages/Usuarios.js`: tabla de usuarios, modal crear/editar módulos, toggle activo — solo GERENTE
- `api.js`: reescrito con `fetchAPI()` centralizado — Bearer token automático en todas las peticiones, logout en 401
- `app.js`: guard al cargar (redirige a login si no hay token), función `logout()` global
- `Dashboard.js`: botón "Gestionar Usuarios" solo para GERENTE

**Sidebar Dinámico:**
- `Sidebar.js`: `MODULE_NAV` con 6 módulos, filtra por `rol`/`modulos[]`, ítem Usuarios solo GERENTE, footer con nombre + rol + logout
- `app.js`: `getPaginaInicio()` por rol/módulos, `navigate()` con `tieneAcceso()`, pantallas "Acceso restringido" y "Sin módulos asignados", shell estática `<aside>` + `<main>`, maneja `popstate`
- `main.css`: estilos sidebar-footer, btn-logout, placeholder-page

**Páginas Placeholder:**
- `Comercial.js`: renderComercial() — placeholder "COT YYYY-NNN-MN"
- `Logistica.js`: renderLogistica() — placeholder "Gastos Generales/Servicio/Almacén"
- `Administracion.js`: renderAdministracion() — placeholder "Gasto en personal"
- `app.js`: importaciones y objeto PAGES actualizados con los 3 módulos

**Auditoría V2 completada (#19–#22):**
- #19: `idx_servicios_estado` — ya existía en BD, cerrado
- #20: FK `fk_detalle_item` en DetalleCompra → Inventario aplicada (migración 003)
- #21: Triggers `chk_transacciones_referencia_ins/upd` con bloque PRESTAMO (migración 003b)
- #22: `id_cuenta` hardcodeado → `DEFAULT_ACCOUNT_ID` en `.env` + `connection.ts`

**Auditoría V3 — Sprint seguridad:**
- A06: `requireModulo` aplicado en 10 grupos de rutas en `index.ts`
- F06: `fetchAPI` protegido contra respuestas no-JSON (502/503 Railway) en `api.js`
- A02: `validateIdParam` en `app/middlewares/validateId.ts` — aplicado en 23 rutas

**Sesión 09/04/2026 — Auditoría V3 continuación (parte 1):**
- F01: `fetch` legacy migrado a `api.js` en `Finanzas.js`, `Compras.js`, `Inventario.js`
- A03: `deleteServicio` bloquea si estado es `COBRADO` o `PARCIAL`
- A04: `deleteItem` bloquea si tiene costos en `CostosServicio`
- V01: Migración `004_cotizaciones.sql` aplicada — tablas `Cotizaciones` + `DetalleCotizacion` con 6 índices confirmados en BD
- Módulo Comercial completo: `CotizacionService.ts` (311 líneas), rutas con `requireModulo('COMERCIAL')`, `Comercial.js` (643 líneas)

### Sesión 09/04/2026 — Auditoría V3 COMPLETADA (21/21 hallazgos)

**A01:** SQL inline eliminado de index.ts — movido a Services:
- `CatalogService.getServiciosActivos()`
- `TributarioService.marcarDetraccionPorServicio(idServicio, body)`
- `FinanceService.deleteGasto(id)`
- `AdminService` nuevo: `resetDb()`, `getCuentasSaldo()`, `setSaldoInicial()`, `getGastoPersonal(anio, mes?)`

**B01:** 3 índices nuevos en BD (idx_servicios_cliente, idx_servicios_vencimiento, idx_compras_estado_pago). Los otros 2 ya existían.

**B03:** Migración 008 — Proveedores V2: `tipo`, `dni`, `banco_1_*`, `banco_2_*`. `ProvidersService` y `provider.schema.ts` actualizados.

**B04:** Migración 009 — ENUM `Compras.estado` normalizado a `'ANULADO'`. Referencias en PurchaseService, TributarioService e InventoryService actualizadas.

**V02:** Migración 007 — `Gastos` +`centro_costo` +`tipo_gasto_logistica`, `Compras` +`centro_costo`. Schemas y Services actualizados.

**V03:** Módulo Administración implementado — `AdminService.getGastoPersonal()`, ruta `GET /admin/gasto-personal`, `Administracion.js` con dashboard completo (KPIs + resumen + detalle).

**F02:** `public/js/services/ui.js` creado — `showToast/showSuccess/showError`. Cero `alert()` en 6 páginas.

**F03:** Namespace `window.NombreModulo` en Servicios, Compras, Finanzas, Inventario, Proveedores, Prestamos.

**F05:** `navigate()` redirige a inicio si página no existe en `PAGES`.

**Pendientes próxima sesión (antes del 14/04):**
- Módulo Logística completo (UI con 3 tipos de orden: GENERAL, SERVICIO, ALMACEN)
- OC de servicios Finanzas (tabla nueva en BD)
- Sidebar dinámico para Logística con sub-tipos

### Sesión 14/04/2026 — Comercial pulido: Edit, Anuladas, Fotos Cloudinary, Reset

**Dashboard Comercial ampliado (sub-sesión previa):**
- `CotizacionService.getDashboard()` ampliado: agrega montos por estado, pipeline (EN_PROCESO + ENVIADA + A_ESPERA_RESPUESTA), aprobado (APROBADA + TERMINADA), promedios por moneda.
- `Comercial.js renderDashboardTab(d)`: 8 KPIs en grilla de 2 filas, barras CSS-only para distribución por estado y por marca, tendencia mensual 6 meses, top clientes con tasa de aprobación.

**Archivo de Anuladas:**
- `CotizacionService.getAnuladas()` — SELECT WHERE estado = 'ANULADA'.
- Ruta `GET /api/cotizaciones/anuladas` (ANTES de `/:id` para que no la capture `validateIdParam`).
- `api.cotizaciones.getAnuladas()` añadido a `api.js`.
- Nueva pestaña **🗂️ Anuladas** en Comercial con contador badge, tabla con razón histórica y aviso visual (`row-anulada`).

**Editar cotización:**
- `ESTADOS_EDITABLES = ['EN_PROCESO', 'A_ESPERA_RESPUESTA']` — único caso en que aparece botón ✎ Editar.
- `formNueva(marca, tcHoy, opts)` y `bindForm(marca, opts)` refactorizados para aceptar `{ editData, idp, onDone }`. Prefill de campos + líneas desde `editData.detalles`. Submit llama `updateCotizacion` si `editData`, sino `createCotizacion`.
- `window.editarCotizacion(id, nro)`: confirm → fetch con `getCotizacion(id)` → modal overlay (z-index:9998) con form prefilled → al guardar, cierra y reload.

**Modales de confirmación (nuevo patrón UI):**
- `confirmarAccion({titulo, mensaje, tipo})` en `Comercial.js` → Promise<boolean>. Tipos: `warning` / `danger` / `info`. Clic fuera = cancelar.
- `confirmarTexto({titulo, mensaje, textoRequerido})` → Promise<boolean>. Input con validación en vivo, botón deshabilitado hasta match exacto. Para acciones destructivas.
- Anular ahora pasa por `confirmarAccion` con advertencia de número quemado.

**Cloudinary (upload de fotos):**
- Cuenta creada: cloud `dyvzfg6sx`, carpeta `metalengineers/cotizaciones/`.
- `npm install multer cloudinary @types/multer`.
- `.env` +`CLOUDINARY_CLOUD_NAME` +`CLOUDINARY_API_KEY` +`CLOUDINARY_API_SECRET`.
- `app/modules/comercial/CloudinaryService.ts` — wrapper con `upload_stream` + transformaciones (max 1200x1200, quality:auto, fetch_format:auto).
- Ruta `POST /api/cotizaciones/upload-foto` con `multer.memoryStorage()`, límite 5MB, filtro JPG/PNG/WebP.
- `api.cotizaciones.uploadFoto(file)` usa FormData + fetch directo (bypassa `fetchAPI` JSON).
- UI: input de "URL de la foto" reemplazado por botón `📷 Subir foto` + `<input type="file" hidden>` + preview de miniatura + `✕` para quitar + spinner `⏳ Subiendo…`. Campo hidden `foto_url` se llena con la URL de Cloudinary al completar.
- Backend queda preparado para producción Railway (filesystem efímero, fotos sobreviven en Cloudinary).

**Reset Comercial (solo GERENTE):**
- `CotizacionService.resetTodo()` — transacción: DELETE DetalleCotizacion → DELETE Cotizaciones → ALTER AUTO_INCREMENT=1 en ambas. Devuelve `{ eliminadas }`.
- Ruta `DELETE /api/cotizaciones/reset` con doble barrera: `requireModulo('COMERCIAL')` + check explícito `user.rol === 'GERENTE'` → 403 si no.
- Botón discreto `⟲ Reset` en header Comercial (solo visible si `localStorage.erp_user.rol === 'GERENTE'`).
- `window.resetComercial` usa `confirmarTexto` con texto requerido = `"BORRAR TODO"`. Al confirmar, reload.
- **NO limpia Cloudinary** (decisión explícita) — las fotos quedan en el CDN por si se quieren reusar.

**Nuevas entradas en `api.js`:**
- `api.cotizaciones.getAnuladas()`
- `api.cotizaciones.uploadFoto(file)` (FormData custom)
- `api.cotizaciones.resetTodo()` (DELETE)

**Google Drive — Archivo PDF de cotizaciones (FUNCIONANDO):**
- `npm install googleapis`.
- Google Workspace creado para `metalengineers.com.pe` (dominio verificado por TXT DNS, MX records migrados de Hostinger a Google).
- Shared Drive **"Metal Engineers ERP"** creado (ID: `0AJP4PgHvCLxvUk9PVA`). Service account `erp-uploader@erp-metal-drive.iam.gserviceaccount.com` agregado como **Gestor de contenido**.
- `google-drive-credentials.json` en raíz del proyecto — **YA EN .gitignore** (línea 36).
- `.env`: `GOOGLE_DRIVE_FOLDER_ID=0AJP4PgHvCLxvUk9PVA` + `GOOGLE_DRIVE_SHARED=true` + `GOOGLE_APPLICATION_CREDENTIALS=./google-drive-credentials.json`.
- `app/modules/comercial/GoogleDriveService.ts` — scope `drive` (no `drive.file`), todas las llamadas con `supportsAllDrives: true`, `includeItemsFromAllDrives: true`, `corpora: 'drive'`, `driveId`. Carpetas: `METAL ENGINEERS/` y `PERFOTOOLS/` con subcarpetas por estado (EN PROCESO, ENVIADAS, APROBADAS, NO APROBADAS, RECHAZADAS, TERMINADAS, EN ESPERA, ANULADAS). `getOrCreateFolder` cachea IDs en `folderCache`.
- Migración 012: `Cotizaciones` +`drive_file_id VARCHAR(200)` +`drive_url VARCHAR(500)`. **Aplicada.**
- `CotizacionService.guardarDriveInfo(id, fileId, url)` guarda la referencia tras el upload.
- Al **crear cotización**: `setImmediate` → `CotizacionPDFService.generarPDF` → `GoogleDriveService.subirPDF({pdfBuffer, nroCotizacion, marca, estado:'EN_PROCESO'})` → `guardarDriveInfo`. No bloquea la respuesta HTTP. Errores solo log.
- Al **cambiar estado** (`PUT /cotizaciones/:id/estado`): `setImmediate` → `moverAEstado(fileId, marca, nuevoEstado)` mueve archivo entre carpetas.
- **Probado**: `TEST 2026-000-MN.pdf` y `COT 2026-008-MN.pdf` subieron correctamente al Shared Drive → METAL ENGINEERS → EN PROCESO.
- Service account NO puede usar Drive personal (no tiene quota); **requiere Shared Drive obligatoriamente**.

**Pendientes próxima sesión:**
- Rotar `CLOUDINARY_API_SECRET` (fue expuesto en chat).
- Módulo Logística (UI con 3 tipos: GENERAL / SERVICIO / ALMACEN).
- OC de servicios Finanzas (tabla nueva).
- **Deploy Railway:** subir `google-drive-credentials.json` como variable de entorno (contenido del JSON en base64 o escribirlo a disco en startup). NO subir el archivo al repo.
- Considerar limpiar fotos Cloudinary huérfanas cuando se usa Reset Comercial (hoy no se borran).

# ESTADO DEL PROYECTO — ERP-PRO

> **LEER PRIMERO.** Este documento es la fuente de verdad sobre qué está hecho, qué falta y dónde estamos parados. Se actualiza al cierre de cada sesión de trabajo.

**Última actualización:** 2026-04-15 (sesión Libro Bancos + modales)
**Rama activa:** `main`
**Último commit:** `933d8f7 fix: public path para produccion`
**Servidor dev:** `npx ts-node index.ts` en `D:\proyectos\ERP-PRO` → `http://localhost:3000`

---

## ⚠️ ALERTA CRÍTICA — Trabajo sin commitear

Hay **muchísimo** trabajo nuevo que vive solo en disco (no hay backup en git ni remoto). Si falla el disco `D:`, se pierde todo. Ver sección "Snapshot de `git status`" al final.

**Prioridad inmediata:** hacer un commit consolidado (o varios por tema) y pushear a `origin/main`.

---

## Módulos completados y operativos

| Módulo | Backend | Frontend | Migraciones | Estado |
|---|---|---|---|---|
| **Auth / Login JWT** | `app/modules/auth/` + `app/middlewares/auth.ts` | `public/login.html` | `002_auth_usuarios.sql` | ✅ Operativo |
| **Comercial / Cotizaciones** | `app/modules/comercial/` (5 services) | `public/js/pages/Comercial.js` + `ConfiguracionComercial.js` | `004, 005, 010, 011, 012` | ✅ Operativo |
| **Servicios** | `app/modules/services/CatalogService.ts` | `Servicios.js` | `001_multimoneda.sql` | ✅ Operativo |
| **Compras** | `app/modules/purchases/PurchaseService.ts` + `ProvidersService.ts` | `Compras.js` + `Proveedores.js` | `008, 009` | ✅ Operativo |
| **Inventario** | `app/modules/inventory/InventoryService.ts` | `Inventario.js` | — | ✅ Operativo |
| **Finanzas / Flujo** | `app/modules/finance/FinanceService.ts` + `TipoCambioService.ts` | `Finanzas.js` | — | ✅ Operativo |
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

- [ ] **Hacer commit del trabajo sin commitear** (dividir en commits temáticos: finanzas/libro-bancos, comercial, auth, limpieza)
- [ ] **Push a `origin/main`**
- [ ] Investigar y limpiar los 2 registros `COT 0000-000-MN`
- [ ] Resolver hallazgos de auditoría V3 (prioridad: F01, F06, A02, A06)
- [ ] Eliminar worktrees basura en `.claude/worktrees/`
- [ ] Fix KPI comisiones en Libro Bancos (contar ITF/N/D importados)
- [ ] Fix nro_operacion duplicado en descripción de EECC importados
- [ ] Módulo Logística completo (UI con 3 tipos: GENERAL/SERVICIO/ALMACEN)
- [ ] OC de servicios en Finanzas (tabla nueva en BD)

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

## Snapshot de `git status` (al 2026-04-15)

### Modificados (sin stagear)
```
app/middlewares/auth.ts
app/modules/finance/FinanceService.ts
app/modules/finance/PrestamosService.ts
app/modules/finance/TipoCambioService.ts
app/modules/finance/TributarioService.ts
app/modules/inventory/InventoryService.ts
app/modules/purchases/ProvidersService.ts
app/modules/purchases/PurchaseService.ts
app/modules/services/CatalogService.ts
app/validators/gastos.schema.ts
app/validators/provider.schema.ts
app/validators/purchase.schema.ts
app/validators/service.schema.ts
database/connection.ts
index.ts
package.json, package-lock.json
public/css/main.css
public/js/app.js
public/js/components/Sidebar.js
public/js/pages/{Compras,Dashboard,Finanzas,Inventario,Prestamos,Proveedores,Servicios}.js
public/js/services/api.js
.env.example, .gitignore
```

### Nuevos (untracked)
```
CLAUDE.md
app/lib/dateUtils.ts
app/middlewares/validateId.ts
app/modules/admin/
app/modules/auth/
app/modules/comercial/
app/validators/{admin,cotizacion,prestamos,tributario}.schema.ts
app/validators/shared.ts
database/migrations/002 a 012 (11 migraciones)
public/img/ (logos)
public/js/pages/{Administracion,Comercial,ConfiguracionComercial,Logistica,Usuarios}.js
public/js/services/ui.js
public/login.html
scripts/
```

### Eliminados
```
functions/calculations.ts (ya no se usa)
```

### Basura a limpiar antes del commit
```
*_temp.txt (schema, inventory, main_css, connection, finance, prestamos_tributario, contexto_fase1)
COT-2026-002-ME.pdf (PDF de prueba)
auditoria_erp_pro.pdf (duplicado del .md)
auditoria_v2_contexto.txt (contexto viejo)
```

### Dir `.claude/` — untracked
Contiene worktrees y configuración local. **NO commitear.** Agregar `.claude/` a `.gitignore`.

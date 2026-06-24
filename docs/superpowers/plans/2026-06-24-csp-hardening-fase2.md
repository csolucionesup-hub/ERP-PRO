# CSP Hardening Fase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover la Content-Security-Policy de un `<meta>` permisivo a una cabecera HTTP servida por helmet, quitando `'unsafe-eval'` y sumando `frame-ancestors`/`base-uri`/`form-action`/`object-src 'none'`, sin tocar handlers ni estilos inline.

**Architecture:** Una sola fuente de verdad para la CSP: helmet (cabecera HTTP `Content-Security-Policy`) en `index.ts`, que ya corre antes de `express.static` (línea 99 vs 133), por lo que cubre estáticos (`index.html`, `login.html`) y respuestas de API. Se elimina el `<meta>` CSP de `index.html` para evitar doble política. `'unsafe-inline'` se mantiene (181 handlers `onclick` + cientos de `style=` inline + 2 scripts inline) → eso es Fase 3b, fuera de alcance.

**Tech Stack:** Express 5, helmet, TypeScript. Verificación con `curl` contra el server local (`npx ts-node index.ts`) + consola del navegador.

**Spec:** `docs/superpowers/specs/2026-06-24-csp-hardening-fase2-design.md`

---

## File Structure

- **Modify** `index.ts:96-103` — reemplazar el bloque `helmet({ contentSecurityPolicy: false, ... })` por helmet con CSP activada.
- **Modify** `public/index.html:11` — eliminar la línea `<meta http-equiv="Content-Security-Policy" ...>`.

No se crean archivos nuevos. No hay migraciones de BD. No cambia ningún `.js` → no se bumpea el cache buster.

---

### Task 1: Activar CSP en helmet (`index.ts`)

**Files:**
- Modify: `index.ts:96-103`

- [ ] **Step 1: Reemplazar el bloque helmet**

Reemplazar exactamente estas líneas (96-103):

```ts
// Helmet: headers de seguridad estándar (X-Frame-Options, HSTS, X-Content-Type-Options, etc.)
// CSP queda controlada por el meta tag de index.html (que permite blob: para preview de PDF
// y res.cloudinary.com para fotos), por lo que la deshabilitamos aquí para no duplicar.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // permite Cloudinary servir imágenes
}));
```

por:

```ts
// Helmet: headers de seguridad. CSP servida como cabecera HTTP (fuente unica de verdad;
// el <meta> de index.html fue removido). Mantiene 'unsafe-inline' porque hay 181 handlers
// onclick + cientos de style= inline + 2 scripts inline (window.onerror / login) => migrar
// eso es Fase 3b (post-UAT). 'unsafe-eval' REMOVIDO: nada lo usa (verificado en codigo
// propio + chart.min.js). helmet corre antes de express.static, asi que la CSP cubre
// index.html, login.html y la API.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
      frameSrc: ["'self'", "blob:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // permite Cloudinary servir imágenes
}));
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (exit 0). Si helmet se queja del tipo de `directives`, confirmar que las claves van en camelCase (`scriptSrc`, no `script-src`) — helmet las traduce a kebab-case en la cabecera.

- [ ] **Step 3: Commit**

```bash
git add index.ts
git commit -m "feat(csp): activar CSP en helmet, sacar unsafe-eval + frame-ancestors/base-uri/form-action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Quitar el `<meta>` CSP de `index.html`

**Files:**
- Modify: `public/index.html:11`

- [ ] **Step 1: Eliminar la línea del meta CSP**

Borrar exactamente esta línea (línea 11):

```html
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://res.cloudinary.com https://*.cloudinary.com; connect-src 'self' https://api.cloudinary.com; frame-src 'self' blob: https://res.cloudinary.com https://*.cloudinary.com; object-src 'self' blob: https://res.cloudinary.com https://*.cloudinary.com;">
```

No tocar las demás líneas (los `<link>` de fonts y CSS quedan igual).

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat(csp): quitar meta CSP de index.html (la sirve la cabecera HTTP)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verificación de cabeceras (server local + curl)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Arrancar el server local**

El usuario corre en PowerShell, en `D:\proyectos\ERP-PRO`:

```
npx ts-node index.ts
```

Esperar `Servidor corriendo` / listening en `http://localhost:3000`. (Si ya está corriendo de antes, reiniciarlo con Ctrl+C y volver a arrancar para tomar el código nuevo.)

- [ ] **Step 2: Confirmar la cabecera CSP en la raíz**

Run: `curl -s -i http://localhost:3000/ | grep -i "content-security-policy"`
Expected: una línea `Content-Security-Policy: ...` que **contiene** `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'` y **NO contiene** `unsafe-eval`.

- [ ] **Step 3: Confirmar que aplica a estáticos (login.html)**

Run: `curl -s -i http://localhost:3000/login.html | grep -i "content-security-policy"`
Expected: misma cabecera CSP presente (confirma que helmet corre antes de express.static).

- [ ] **Step 4: Confirmar que el `<meta>` CSP ya no se sirve**

Run: `curl -s http://localhost:3000/index.html | grep -i "http-equiv=\"Content-Security-Policy\"" || echo "OK: sin meta CSP"`
Expected: `OK: sin meta CSP` (no debe haber doble política).

- [ ] **Step 5: Confirmar que el login sigue funcionando bajo la nueva CSP**

Run:
```
curl -s -o /dev/null -w "login -> HTTP %{http_code}\n" -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"julio@metalengineers.com.pe","password":"Metal2026!"}'
```
Expected: `login -> HTTP 200`.

---

### Task 4: Smoke test en el navegador (violaciones de CSP)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Login + recorrer pantallas principales**

En el navegador (con DevTools → Console abierta), loguearse y abrir: Dashboard, Comercial, Finanzas, Órdenes de Compra, Inventario.
Expected: NINGÚN error rojo del tipo `Refused to load/execute ... because it violates the following Content Security Policy directive`.

- [ ] **Step 2: Probar preview de PDF**

Abrir el 👁️ preview de PDF de una cotización (Comercial) y de una OC.
Expected: el PDF carga dentro del `<iframe>` (cubierto por `frame-src blob:`). Sin error de CSP.

- [ ] **Step 3: Probar carga de foto / Cloudinary**

Abrir una cotización con foto de ítem (imagen servida por `res.cloudinary.com`).
Expected: la imagen carga (cubierta por `img-src https://res.cloudinary.com`). Sin error de CSP.

- [ ] **Step 4: Si aparece alguna violación**

Leer la directiva exacta que reporta la consola. Si es por un recurso legítimo que olvidamos (ej. un dominio externo no listado), agregar ese origen a la directiva correspondiente en `index.ts` y repetir Task 3 + Task 4. Si es por `unsafe-eval`, revertir esa única remoción (volver a agregar `"'unsafe-eval'"` a `scriptSrc`) y anotarlo.

---

## Verificación final / cierre

- [ ] `npx tsc --noEmit` limpio.
- [ ] `scripts/check_mojibake.js` OK (si aplica al prebuild — index.ts cambió).
- [ ] Tasks 3 y 4 pasados.
- [ ] Actualizar `ESTADO.md`: marcar "XSS Fase 2 (CSP hardening) hecho en rama `claude/csp-hardening-fase2`", dejar Fase 3b (event delegation, 181 handlers) como único pendiente del bloque XSS.
- [ ] Abrir PR a `main` (gate de Julio para merge).

## Out of scope (Fase 3b, post-UAT)

- Event delegation para los 181 handlers `onclick=` + externalizar/hashear los 2 scripts inline → recién ahí se quita `'unsafe-inline'` de `script-src`.
- Quitar `'unsafe-inline'` de `style-src` (cientos de `style=` inline) — proyecto aparte.

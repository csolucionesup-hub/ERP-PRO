# JWT en cookie httpOnly — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover el JWT de sesión de `localStorage` a una cookie httpOnly para que un eventual XSS no pueda robar el token.

**Architecture:** El servidor setea el JWT como cookie httpOnly+Secure+SameSite=Strict en login y al re-emitir token en `/me`. `requireAuth` lee la cookie (no el header `Authorization`). El frontend deja de leer/escribir `erp_token`; `erp_user` (datos de UI, no secreto) sigue en localStorage. Logout pasa por un endpoint nuevo que borra la cookie. Corte limpio: sin fallback a Bearer → cada usuario re-loguea una vez.

**Tech Stack:** Express 5, `cookie-parser`, `jsonwebtoken`, frontend Vanilla JS (ESM), ts-node.

**Spec:** `docs/superpowers/specs/2026-06-23-jwt-httponly-cookie-design.md`

**Nota sobre tests:** el proyecto NO tiene framework de tests (no jest/vitest). Siguiendo la convención existente (`scripts/check_mojibake.js`), los unit tests van como script standalone ejecutable con `npx ts-node`. La cobertura real de las partes de integración (login, descargas, logout) es el **checklist E2E manual** de la Task 10.

---

### Task 1: Instalar y cablear `cookie-parser`

**Files:**
- Modify: `package.json` (vía npm install)
- Modify: `index.ts:110` (después de `app.use(express.json())`)

- [ ] **Step 1: Instalar dependencia**

Run:
```bash
npm install cookie-parser && npm install -D @types/cookie-parser
```
Expected: ambos paquetes agregados a `package.json` sin errores.

- [ ] **Step 2: Importar y montar el middleware**

En `index.ts`, agregar el import junto a los otros (cerca de la línea 7, `import helmet from 'helmet'`):
```ts
import cookieParser from 'cookie-parser';
```
Y montarlo justo después de `app.use(express.json());` (línea 110):
```ts
app.use(express.json());
app.use(cookieParser());
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json index.ts
git commit -m "chore(auth): agregar cookie-parser middleware"
```

---

### Task 2: Helper puro `authCookieOptions()` + unit test

Aislamos las opciones de la cookie en una función pura para poder testearlas sin Express.

**Files:**
- Create: `app/modules/auth/cookieOptions.ts`
- Create: `scripts/test_auth_cookie.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `scripts/test_auth_cookie.ts`:
```ts
import assert from 'assert';
import { authCookieOptions, AUTH_COOKIE_NAME } from '../app/modules/auth/cookieOptions';

// Caso producción: Secure encendido
process.env.NODE_ENV = 'production';
const prod = authCookieOptions();
assert.strictEqual(prod.httpOnly, true, 'httpOnly debe ser true');
assert.strictEqual(prod.sameSite, 'strict', 'sameSite debe ser strict');
assert.strictEqual(prod.secure, true, 'secure debe ser true en producción');
assert.strictEqual(prod.path, '/', 'path debe ser /');
assert.strictEqual(prod.maxAge, 8 * 60 * 60 * 1000, 'maxAge debe ser 8h en ms');

// Caso dev: Secure apagado (si no, la cookie no viaja sobre http://localhost)
process.env.NODE_ENV = 'development';
const dev = authCookieOptions();
assert.strictEqual(dev.secure, false, 'secure debe ser false fuera de producción');

assert.strictEqual(AUTH_COOKIE_NAME, 'erp_token', 'el nombre de cookie debe ser erp_token');

console.log('OK: authCookieOptions 6/6');
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx ts-node scripts/test_auth_cookie.ts`
Expected: FAIL — `Cannot find module '../app/modules/auth/cookieOptions'`.

- [ ] **Step 3: Implementar el helper mínimo**

Crear `app/modules/auth/cookieOptions.ts`:
```ts
import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'erp_token';

// Opciones de la cookie de auth. Pura (sin Express) para poder testearla.
// Secure solo en producción: en dev local (http://localhost) una cookie Secure
// no viaja y rompería el login.
export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8h, alineado con JWT_EXPIRES
    path: '/',
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx ts-node scripts/test_auth_cookie.ts`
Expected: `OK: authCookieOptions 6/6`.

- [ ] **Step 5: Commit**

```bash
git add app/modules/auth/cookieOptions.ts scripts/test_auth_cookie.ts
git commit -m "feat(auth): helper puro authCookieOptions + test"
```

---

### Task 3: `requireAuth` lee la cookie (no el header) + test

**Files:**
- Modify: `app/middlewares/auth.ts:24-37`
- Modify: `scripts/test_auth_cookie.ts` (agregar casos)

- [ ] **Step 1: Agregar el test que falla para requireAuth**

Agregar al final de `scripts/test_auth_cookie.ts` (antes del `console.log` final, y mover ese log al final del archivo):
```ts
import jwt from 'jsonwebtoken';
import { requireAuth } from '../app/middlewares/auth';

process.env.JWT_SECRET = 'test_secret_para_unit';
const token = jwt.sign(
  { id_usuario: 1, nombre: 'Test', email: 't@t.com', rol: 'GERENTE', modulos: [] },
  'test_secret_para_unit'
);

function fakeRes() {
  return {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
}

// Cookie válida → next() y req.user seteado
let nextCalled = false;
const reqOk: any = { cookies: { erp_token: token }, headers: {} };
requireAuth(reqOk, fakeRes() as any, () => { nextCalled = true; });
assert.strictEqual(nextCalled, true, 'cookie válida debe llamar next()');
assert.strictEqual(reqOk.user?.rol, 'GERENTE', 'req.user debe quedar seteado');

// Sin cookie → 401
const resNoCookie = fakeRes();
requireAuth({ cookies: {}, headers: {} } as any, resNoCookie as any, () => {
  throw new Error('no debería llamar next sin cookie');
});
assert.strictEqual(resNoCookie.statusCode, 401, 'sin cookie debe dar 401');

// Cookie inválida → 401
const resBad = fakeRes();
requireAuth({ cookies: { erp_token: 'basura' }, headers: {} } as any, resBad as any, () => {
  throw new Error('no debería llamar next con token inválido');
});
assert.strictEqual(resBad.statusCode, 401, 'token inválido debe dar 401');

console.log('OK: requireAuth 3/3');
```
(Quitar el `console.log('OK: authCookieOptions 6/6')` intermedio si quedó duplicado; dejar un log por bloque está bien.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx ts-node scripts/test_auth_cookie.ts`
Expected: FAIL — `requireAuth` lee `req.headers.authorization`, que está vacío → da 401 incluso con cookie válida (falla el primer assert).

- [ ] **Step 3: Modificar `requireAuth`**

En `app/middlewares/auth.ts`, reemplazar el cuerpo de `requireAuth` (líneas 24-37):
```ts
import { AUTH_COOKIE_NAME } from '../modules/auth/cookieOptions';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // El token vive en una cookie httpOnly (no en localStorage ni en el header
  // Authorization). Corte limpio: sin fallback a Bearer.
  const token = (req as any).cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}
```
(El import de `AUTH_COOKIE_NAME` va arriba del archivo, junto a los otros imports.)

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx ts-node scripts/test_auth_cookie.ts`
Expected: imprime `OK: authCookieOptions 6/6` y `OK: requireAuth 3/3`.

- [ ] **Step 5: Verificar build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/middlewares/auth.ts scripts/test_auth_cookie.ts
git commit -m "feat(auth): requireAuth lee cookie httpOnly (sin fallback Bearer)"
```

---

### Task 4: Login setea la cookie y deja de devolver el token en el body

**Files:**
- Modify: `index.ts:1119-1123` (ruta `authRouter.post('/login')`)

- [ ] **Step 1: Modificar la ruta de login**

Reemplazar la ruta (líneas 1119-1123):
```ts
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new Error('Email y password son requeridos.');
  const { token, usuario } = await AuthService.login(email, password);
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
  res.json({ usuario }); // el token NUNCA viaja en el body → nunca llega a JS
});
```

- [ ] **Step 2: Agregar el import en index.ts**

Junto a los otros imports de auth en `index.ts`:
```ts
import { authCookieOptions, AUTH_COOKIE_NAME } from './app/modules/auth/cookieOptions';
```

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add index.ts
git commit -m "feat(auth): login setea cookie httpOnly y no devuelve token en el body"
```

---

### Task 5: `/me` re-setea la cookie en cambio de rol (no manda token en el body)

**Files:**
- Modify: `index.ts:1129-1136` (ruta `authRouter.get('/me')`)

- [ ] **Step 1: Modificar la ruta /me**

Reemplazar la ruta (líneas 1129-1136):
```ts
authRouter.get('/me', requireAuth, async (req: any, res: Response) => {
  try {
    const result = await AuthService.getProfileFromDB(req.user.id_usuario, req.user);
    // Si getProfileFromDB re-emitió token por cambio de rol/módulos, lo
    // refrescamos en la cookie (no en el body).
    if (result.cambio && result.token) {
      res.cookie(AUTH_COOKIE_NAME, result.token, authCookieOptions());
    }
    const { token, ...rest } = result; // no exponer el token en el JSON
    res.json(rest);
  } catch (e: any) {
    res.status(401).json({ error: e?.message || 'Sesión inválida' });
  }
});
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add index.ts
git commit -m "feat(auth): /me refresca cookie en cambio de rol (token fuera del body)"
```

---

### Task 6: Endpoint `POST /api/auth/logout`

**Files:**
- Modify: `index.ts` (agregar ruta dentro de `authRouter`, antes de `app.use('/api/auth', authRouter)` en línea 1169)

- [ ] **Step 1: Agregar la ruta de logout**

Agregar dentro del bloque `authRouter` (por ejemplo justo después de la ruta `/me`):
```ts
authRouter.post('/logout', (_req: Request, res: Response) => {
  // El JS no puede borrar una cookie httpOnly → tiene que hacerlo el server.
  // clearCookie debe recibir las mismas opciones de path/sameSite/secure.
  res.clearCookie(AUTH_COOKIE_NAME, {
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ ok: true });
});
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add index.ts
git commit -m "feat(auth): endpoint POST /api/auth/logout que borra la cookie"
```

---

### Task 7: `login.html` deja de guardar el token

**Files:**
- Modify: `public/login.html:166-197`

- [ ] **Step 1: Cambiar el check "ya logueado"**

Reemplazar (línea ~167):
```js
    // Si ya hay token, redirigir al sistema
    if (localStorage.getItem('erp_token')) {
      window.location.replace('/');
    }
```
por:
```js
    // El token vive en cookie httpOnly (no legible por JS). Usamos erp_user
    // como pista de "ya logueado"; si la cookie no es válida, /me en app.js
    // rebota al login.
    if (localStorage.getItem('erp_user')) {
      window.location.replace('/');
    }
```

- [ ] **Step 2: Mandar credenciales en el fetch de login y no guardar token**

Reemplazar el `fetch('/api/auth/login', ...)` y el guardado posterior (líneas ~183-197):
```js
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al iniciar sesión');
        }

        // El token ya vino como cookie httpOnly. Solo guardamos datos de UI.
        localStorage.setItem('erp_user', JSON.stringify(data.usuario));
        window.location.replace('/');
```
(Conservar el resto del manejo de errores/botón tal como está alrededor.)

- [ ] **Step 3: Commit**

```bash
git add public/login.html
git commit -m "feat(auth): login.html no guarda token (cookie httpOnly) + credentials"
```

---

### Task 8: `api.js` deja de usar el token y manda credenciales

Regla de transformación para TODO `fetch` crudo de este archivo:
1. Borrar la línea `const token = localStorage.getItem('erp_token');`.
2. Borrar `Authorization`/`headers` que solo servían para el Bearer.
3. Agregar `credentials: 'same-origin'` a las opciones del `fetch`.

**Files:**
- Modify: `public/js/services/api.js`

- [ ] **Step 1: `fetchAPI` (base) — quitar token, agregar credentials**

Reemplazar las líneas 9-25:
```js
async function fetchAPI(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(url, { ...options, credentials: 'same-origin', headers });

    if (response.status === 401) {
      localStorage.removeItem('erp_user');
      window.location.replace('/login.html');
      return;
    }
```
(El resto de `fetchAPI`, de la línea 26 en adelante, queda igual.)

- [ ] **Step 2: Aplicar la regla de transformación a los 14 helpers con `fetch` crudo**

Aplicar la regla (arriba) a cada una de estas funciones. Patrón canónico antes/después:

ANTES:
```js
    descargarPDF: async (id) => {
      const token = localStorage.getItem('erp_token');
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
```
DESPUÉS:
```js
    descargarPDF: async (id) => {
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/${id}/pdf`, {
        credentials: 'same-origin',
      });
```

Para los uploads con `FormData` (que pasan `headers: { Authorization: ... }` y luego `body: fd`):
ANTES:
```js
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      fd.append('foto', file);
      const r = await fetch(`${API_BASE_URL}/cotizaciones/upload-foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
```
DESPUÉS:
```js
      const fd = new FormData();
      fd.append('foto', file);
      const r = await fetch(`${API_BASE_URL}/cotizaciones/upload-foto`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
```

Funciones a editar (todas en `api.js`): `cotizaciones.uploadFoto`, `configuracionMarca.uploadLogo`, `usuarios.subirFirma`, `auth.subirMiFirma`, `adjuntos.upload`, `rendiciones.subirAdjunto`, `ordenesCompra.descargarPDF`, `ordenesCompra.descargarROC`, `ordenesCompra.subirFactura`, `ordenesCompra.subirVoucherPago`, `ordenesCompra.registrarPagoConVoucher`, `ordenesCompra.descargarExcel`, `ple.descargarVentas`, `ple.descargarCompras`.

- [ ] **Step 3: Verificar que no queda ninguna referencia al token**

Run: `grep -n "erp_token" public/js/services/api.js`
Expected: **cero** resultados.

- [ ] **Step 4: Agregar `logout` que pega al endpoint** (si `api.js` exporta un namespace `auth`)

En el namespace `auth` de `api.js`, agregar:
```js
    logout: () => post('/auth/logout', {}),
```
(Si no existe un namespace `auth`, omitir — el logout lo maneja `app.js` en la Task 9.)

- [ ] **Step 5: Commit**

```bash
git add public/js/services/api.js
git commit -m "feat(auth): api.js usa cookie (credentials same-origin), sin token en JS"
```

---

### Task 9: `app.js` — guard, refresh, logout y limpieza

**Files:**
- Modify: `public/js/app.js` (líneas 95-99, 236-239, 260-291, 306-309)

- [ ] **Step 1: `logout()` pega al endpoint y limpia solo erp_user**

Reemplazar (líneas 95-99):
```js
window.logout = async function () {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
  catch { /* aunque falle, seguimos al login */ }
  localStorage.removeItem('erp_user');
  localStorage.removeItem('erp_last_page');
  window.location.replace('/login.html');
};
```

- [ ] **Step 2: `/api/config/existe` usa cookie**

Reemplazar (líneas 236-239):
```js
  try {
    const r = await fetch('/api/config/existe', { credentials: 'same-origin' });
    if (!r.ok) return true; // ante cualquier duda no bloqueamos al usuario
```

- [ ] **Step 3: `refreshSessionFromServer` sin token en JS**

Reemplazar el cuerpo (líneas 260-291) por:
```js
async function refreshSessionFromServer({ reloadOnChange = false } = {}) {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (r.status === 401) {
      // Cookie inválida/ausente o usuario desactivado → al login.
      localStorage.removeItem('erp_user');
      window.location.replace('/login.html');
      return false;
    }
    if (!r.ok) return false;
    const data = await r.json();

    let prev = {};
    try { prev = JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch {}
    const cambioRolOFlags =
      prev.rol !== data.usuario.rol ||
      !!prev.puede_contabilidad !== !!data.usuario.puede_contabilidad ||
      !!prev.puede_importar     !== !!data.usuario.puede_importar;

    localStorage.setItem('erp_user', JSON.stringify(data.usuario));
    // El token ya no viaja en el body: /me refresca la cookie del lado server.

    if (reloadOnChange && cambioRolOFlags) {
      window.location.reload();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
```
(Ajustar el cierre del `try/catch`/return final para que coincida con la estructura original — el objetivo es: ya no leer ni escribir `erp_token`, y `/me` se llama sin header `Authorization`.)

- [ ] **Step 4: Guard de arranque + limpieza one-time del token viejo**

Reemplazar (líneas 306-309) el inicio de `init()`:
```js
async function init() {
  // Limpieza one-time: el token ahora vive en cookie httpOnly. Si quedó un
  // erp_token viejo de localStorage (sesión pre-migración), lo borramos.
  localStorage.removeItem('erp_token');

  if (!localStorage.getItem('erp_user')) {
    window.location.replace('/login.html');
    return;
  }
```
(La validación real de la sesión la hace `refreshSessionFromServer()` que ya se llama a continuación: si la cookie no sirve, da 401 y rebota al login.)

- [ ] **Step 5: Verificar que no queda referencia al token**

Run: `grep -n "erp_token" public/js/app.js`
Expected: solo la línea de limpieza `localStorage.removeItem('erp_token');` del Step 4. Ninguna lectura (`getItem`) ni uso en headers.

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js
git commit -m "feat(auth): app.js usa cookie (me/logout/config), limpia token viejo"
```

---

### Task 10: Cache buster, build y verificación E2E manual

**Files:**
- Modify: `public/index.html` (cache buster del `<script>` y de `app.js`)
- Modify: `public/js/app.js` (19 imports con `?v=`)

- [ ] **Step 1: Bump del cache buster JS**

Elegir la nueva versión `20260623r5` (siguiente a `r4`). Find/Replace global de `20260623r4` → `20260623r5` en:
- `public/js/app.js` (los 19 `import ... ?v=20260623r4`)
- `public/index.html` (el `<script type="module" src="./js/app.js?v=20260623r4">` de la línea 37)

Run para verificar que no quedó ninguno viejo:
```bash
grep -rn "20260623r4" public/ | grep -v node_modules
```
Expected: cero resultados (todos pasaron a r5). Nota: `main.css?v=20260623r4` también puede bumpearse a r5 por consistencia, pero no es obligatorio (no tocamos CSS).

- [ ] **Step 2: Build limpio + tests**

Run:
```bash
npx tsc --noEmit && node scripts/check_mojibake.js && npx ts-node scripts/test_auth_cookie.ts
```
Expected: tsc sin errores, mojibake OK, tests imprimen ambos `OK`.

- [ ] **Step 3: E2E manual en dev**

Mostrar a Julio el comando para levantar el server (no ejecutarlo):
```
npx ts-node index.ts
```
Checklist en `http://localhost:3000`:
1. Login con `julio@metalengineers.com.pe` → entra al sistema.
2. DevTools › Application › Cookies: existe `erp_token` con flag **HttpOnly** ✓. DevTools › Application › Local Storage: **NO** hay `erp_token` (sí `erp_user`).
3. Navegar módulos, abrir una cotización y una OC → cargan OK.
4. Subir una foto a una cotización (Cloudinary) → OK.
5. Bajar un PDF de una OC (👁️ Ver y 📄 PDF) → OK.
6. Logout → la cookie `erp_token` desaparece y redirige a login.
7. Recargar `/` sin loguear → rebota a login.

- [ ] **Step 4: Commit final**

```bash
git add public/index.html public/js/app.js
git commit -m "chore(auth): bump cache buster r5 para migración cookie httpOnly"
```

---

## Cierre

- **Migraciones BD:** ninguna.
- **Push a `main`:** lo autoriza Julio (gate de release). Tras merge, **no hace falta migración**; Railway ya tiene `NODE_ENV=production` → `secure:true` se activa solo.
- **Recordar a Julio:** tras el deploy, todos (Luis, Jorge, Julio) re-loguean una vez. Es esperado.
- **Pendientes que NO entran acá:** Sub-proyecto B (event delegation) y C (CSP estricta).

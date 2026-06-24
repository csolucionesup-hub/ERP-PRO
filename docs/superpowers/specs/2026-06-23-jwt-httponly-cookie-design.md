# Diseño — JWT en cookie httpOnly (XSS Fase 3a)

**Fecha:** 2026-06-23
**Autor:** Julio + Claude
**Estado:** Aprobado (pendiente review escrito)
**Contexto:** Auditoría de seguridad 2026-06-23. Sub-proyecto A de la deuda "XSS Fase 2/3".

---

## Problema

El JWT de sesión se guarda en `localStorage` (`erp_token`) y se lee desde JavaScript
(`api.js`, `login.html`, `app.js`). Cualquier código que se ejecute en la página —
incluido un eventual XSS— puede leer y exfiltrar ese token, suplantando al usuario.

La Fase 1 de la auditoría ya cerró el vector de inyección (escapeHtml global +
`showToast` por `textContent`). Este sub-proyecto agrega **defensa en profundidad**:
aunque se colara código malicioso, que **no pueda robar el token**.

## Objetivo

Mover el JWT de `localStorage` a una **cookie httpOnly** que el JavaScript no puede
leer, manteniendo el flujo de auth actual sin cambios visibles para el usuario (salvo
un re-login único en la transición).

## Decisiones tomadas (brainstorming)

1. **Alcance:** solo Sub-proyecto A (cookie httpOnly). B (event delegation) y C (CSP
   estricta) quedan como sub-proyectos futuros, probablemente post-UAT.
2. **CSRF:** cubierto con `SameSite=Strict` únicamente (app same-origin). Sin token
   CSRF separado (YAGNI).
3. **Corte limpio:** `requireAuth` lee **solo cookie**, sin fallback a `Authorization:
   Bearer`. Mantener el fallback dejaría el token robable vía localStorage y anularía
   el objetivo. Costo: re-login único de cada usuario.

## Arquitectura

### Backend

1. **Dependencia nueva:** `cookie-parser` + `@types/cookie-parser`.
   `app.use(cookieParser())` después de `express.json()` en `index.ts`.

2. **Helper `setAuthCookie(res, token)`** (en `app/modules/auth/` o util compartido):
   ```ts
   res.cookie('erp_token', token, {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production', // dev localhost va sin Secure
     sameSite: 'strict',
     maxAge: 8 * 60 * 60 * 1000, // 8h, alineado con JWT_EXPIRES
     path: '/',
   });
   ```

3. **`requireAuth` (`app/middlewares/auth.ts`):** leer el token de
   `req.cookies.erp_token` en vez del header `Authorization`. Mismo `jwt.verify`,
   mismos 401. Cookie-only (sin fallback Bearer).

4. **Ruta login (`authRouter` en `index.ts`):** tras `AuthService.login`, llamar
   `setAuthCookie(res, token)`. El body de respuesta **deja de incluir `token`** —
   solo devuelve `{ usuario }`.

5. **Ruta `/api/auth/me`:** si re-emite token por cambio de rol, hacer
   `setAuthCookie(res, token)` en vez de mandarlo en el body. Body devuelve
   `{ usuario, cambio }`.

6. **Nueva ruta `POST /api/auth/logout`:**
   `res.clearCookie('erp_token', { path: '/', sameSite: 'strict', secure: NODE_ENV === 'production' })`
   → `{ ok: true }`. Necesaria porque el JS no puede borrar una cookie httpOnly.

### Frontend

7. **`public/login.html`:**
   - Quitar `localStorage.setItem('erp_token', data.token)`.
   - Mantener `localStorage.setItem('erp_user', ...)` (datos de UI, no secreto).
   - El check "ya logueado" pasa de `localStorage.getItem('erp_token')` a
     `localStorage.getItem('erp_user')`.
   - `fetch('/api/auth/login', { credentials: 'same-origin', ... })`.

8. **`public/js/services/api.js`:**
   - `fetchAPI`: quitar el header `Authorization` y el `getItem('erp_token')`; agregar
     `credentials: 'same-origin'`. En 401 → `removeItem('erp_user')` + redirect login
     (ya no hay token que borrar).
   - Los ~13 helpers de upload/PDF/Excel que usan `fetch` crudo con `Authorization`:
     quitar el header, agregar `credentials: 'same-origin'`.
   - `logout()`: `POST /api/auth/logout` → limpiar `erp_user` → redirect.

9. **`public/js/app.js`:**
   - Guard de arranque: dejar de mirar `erp_token`; apoyarse en `/api/auth/me` como
     fuente de verdad (si 401 → login). `erp_user` solo para pintar UI inicial.
   - `refreshSessionFromServer`: ya no espera `token` en el body de `/me`.
   - Limpieza one-time: borrar cualquier `erp_token` viejo de localStorage al iniciar.

## Flujo de datos

```
login (email/pass)
  → server valida → setAuthCookie(httpOnly) + body { usuario }
  → browser guarda usuario (UI), cookie en caja fuerte invisible a JS
fetch autenticado
  → browser manda cookie sola (same-origin) → requireAuth la lee
cambio de rol detectado en /me
  → server re-setea cookie con nuevo JWT
logout
  → POST /logout → server borra cookie → cliente limpia erp_user → login
```

## Edge cases

- **Dev local (http://localhost):** `secure: false` cuando `NODE_ENV !== 'production'`,
  si no la cookie no viaja sobre http y el login local se rompe.
- **Usuarios ya logueados (UAT):** su `erp_token` de localStorage queda ignorado →
  primer `/me` da 401 → re-login único. El arranque limpia el `erp_token` huérfano.
- **SameSite=Strict:** no rompe la carga inicial — `index.html` es estático y el primer
  `/me` es una request same-site, así que la cookie viaja.
- **Descargas (PDF/Excel) e iframes de preview:** siguen siendo `fetch` same-origin →
  la cookie viaja. Verificar el preview de PDF en modal (blob URL).

## Testing

- **Unit:** `setAuthCookie` setea los flags correctos (httpOnly, sameSite, secure según
  env, maxAge). `requireAuth` acepta cookie válida, rechaza ausente/inválida con 401.
- **E2E manual en dev (`npx ts-node index.ts`):**
  1. Login → DevTools › Application › Cookies: existe `erp_token` con `HttpOnly` ✓ y
     **NO** hay `erp_token` en localStorage.
  2. Navegar módulos, abrir cotización/OC → funciona.
  3. Subir una foto (Cloudinary) y bajar un PDF de OC → funcionan (cookie viaja).
  4. Logout → la cookie desaparece, redirige a login.
  5. Simular cambio de rol (otro GERENTE baja el rol) → `/me` re-setea cookie sin
     requerir logout manual.

## Fuera de alcance

- Sub-proyecto B: migrar 196 handlers `onclick=` inline a event delegation.
- Sub-proyecto C: CSP estricta (quitar `unsafe-inline`/`unsafe-eval`).
- Token CSRF double-submit (decidido: solo SameSite).

## Despliegue

- Verificar `npx tsc --noEmit` antes de push (gotcha #37 — Railway falla silencioso).
- Bump cache buster JS (`?v=...`) en `app.js` (19 imports) + `index.html` por tocar
  `public/js/` (gotcha #36).
- Migraciones BD: **ninguna** (cambio solo de auth/transport).
- Railway: `secure: true` se activa solo por `NODE_ENV === 'production'` (ya seteado).

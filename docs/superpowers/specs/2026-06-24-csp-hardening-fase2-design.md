# Diseño — Fase 2: CSP hardening (sin tocar handlers)

**Fecha:** 2026-06-24
**Rama:** `claude/csp-hardening-fase2`
**Contexto:** Deuda "XSS Fase 2/3". La Fase 1 (escapeHtml global) y la Fase 3a (JWT en cookie httpOnly, PR #17) ya están hechas. Esta es la Fase 2: endurecer la Content-Security-Policy **sin** migrar los 181 handlers `onclick=` inline (eso queda como Fase 3b, post-UAT).

---

## Objetivo

Pasar la CSP de un `<meta>` permisivo a una **cabecera HTTP** servida por helmet, más estricta pero **100% compatible** con el código actual. Defensa en profundidad contra XSS, clickjacking e inyección de `<base>`/forms — sin riesgo de romper pantallas, porque no se toca ningún handler ni estilo inline.

## Estado actual

- `index.ts` (líneas ~98–105): `helmet({ contentSecurityPolicy: false, ... })` → la CSP de helmet está **desactivada**.
- `public/index.html` (línea 11): la CSP vive en un `<meta http-equiv="Content-Security-Policy">` con `script-src 'self' 'unsafe-inline' 'unsafe-eval'`.
- **Verificado:** ni el código propio (`public/js/**`) ni `chart.min.js` usan `eval()` / `new Function()` → `'unsafe-eval'` es removible sin riesgo.
- **Verificado:** hay 181 handlers `onclick=` inline en 23 archivos JS + cientos de `style="..."` inline → `'unsafe-inline'` (scripts y estilos) **debe quedarse** en esta fase.

## Alcance (qué SÍ y qué NO)

**SÍ:**
1. Activar la CSP vía helmet (cabecera HTTP `Content-Security-Policy`), reemplazando `contentSecurityPolicy: false`.
2. Quitar `'unsafe-eval'` de `script-src`.
3. Endurecer `object-src` de `'self'` a `'none'`.
4. Agregar 3 directivas que **solo una cabecera HTTP puede aplicar** (un `<meta>` las ignora): `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'`.
5. Quitar el `<meta http-equiv="Content-Security-Policy">` de `index.html` → una sola fuente de verdad.

**NO (fuera de alcance — Fase 3b, post-UAT):**
- Migrar los 181 handlers `onclick=` a event delegation.
- Externalizar/hashear los 2 bloques `<script>` inline (`index.html` window.onerror + `login.html`).
- Quitar `'unsafe-inline'` de `script-src` o `style-src`.

## Diseño detallado

### 1. Backend — `index.ts`

Reemplazar el bloque helmet actual:

```ts
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
```

por:

```ts
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' se mantiene (181 handlers onclick + 2 scripts inline) — Fase 3b.
      // 'unsafe-eval' REMOVIDO: nada lo usa (verificado en codigo propio + chart.min.js).
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
      // upgrade-insecure-requests se omite a proposito: en dev local corremos sobre http://localhost.
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
```

**Ordenamiento:** el `app.use(helmet(...))` debe seguir corriendo **antes** de `express.static`, para que la cabecera CSP aplique también a los archivos estáticos (`index.html`, `login.html`). Mantener la posición actual (ya está antes de las rutas y del static).

### 2. Frontend — `public/index.html`

Eliminar la línea 11 completa (`<meta http-equiv="Content-Security-Policy" ...>`). La CSP ahora la entrega la cabecera HTTP, que cubre `index.html`, `login.html` y las respuestas de la API por igual. Tener dos CSPs en paralelo es un foot-gun: el navegador aplica la intersección de ambas y puede romper recursos de forma confusa.

**Cache buster:** `index.html` cambia → no es un archivo JS versionado por `?v=`, pero conviene NO bumpear los `?v=` de los JS porque ningún `.js` cambió. Solo cambia el HTML, que el browser revalida solo.

## Riesgos y mitigación

| Cambio | Riesgo | Mitigación |
|---|---|---|
| Quitar `'unsafe-eval'` | Algo oculto lo necesita | Verificado: 0 usos en código propio + chart.min.js. Si la consola tira violación, se revierte esa línea. |
| `frame-ancestors 'self'` | Romper si la app se embebe en iframe externo | La app no se embebe; `'self'` permite el uso interno (preview PDF es la app embebiendo, no siendo embebida). |
| `base-uri 'self'` | Romper si se usa `<base>` | No se usa `<base>` en el proyecto. |
| `form-action 'self'` | Romper posteos de form externos | Único form es el login → postea a `/api/auth/login` (same-origin). |
| `object-src 'none'` | Romper `<object>/<embed>` | El preview de PDF usa `<iframe>`/`<embed>` con blob: cubierto por `frame-src`; `object-src` no afecta iframes. Verificar preview PDF funciona. |

## Verificación (smoke test, server local)

1. `npx tsc --noEmit` limpio.
2. Arrancar server, `curl -s -i http://localhost:3000/` → confirmar cabecera `Content-Security-Policy` presente y SIN `unsafe-eval`, CON `frame-ancestors`/`base-uri`/`form-action`.
3. `curl -s -i http://localhost:3000/index.html` y `/login.html` → confirmar que la cabecera aplica a estáticos.
4. Navegador: login OK, abrir Dashboard / Comercial / Finanzas / OrdenesCompra → consola sin errores de CSP (`Refused to ...`).
5. Probar preview de PDF de una cotización → que el blob: cargue (frame-src).
6. Confirmar que el `<meta>` CSP ya no está en el HTML servido (no hay doble CSP).

## Out of scope / siguiente

- **Fase 3b** (post-UAT): event delegation para los 181 handlers + externalizar los 2 scripts inline → recién ahí se puede quitar `'unsafe-inline'` de `script-src`.
- Quitar `'unsafe-inline'` de `style-src` (cientos de `style=` inline) — proyecto aparte, baja prioridad.

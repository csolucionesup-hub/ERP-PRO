// Cache busting para imports ES module: cada path lleva su ?v=YYYYMMDDr#
// hardcodeado. Si se cambia CUALQUIER archivo de pages/components/services
// hay que bumpear el sufijo en TODAS las líneas (Find/Replace de v=2026...).
// OJO: algunos imports anidados página→servicio también llevan el sufijo
// (ej. Finanzas.js importa './services/api.js?v=...'). Sin versión, el browser
// puede servir un api.js viejo cacheado aunque la página sea nueva (caso real:
// "api.adjuntos.subir is not a function"). El Find/Replace GLOBAL del token de
// versión (en TODO public/js, no solo este archivo) los mantiene sincronizados.
import { renderSidebar } from './components/Sidebar.js?v=20260629r2';
import { Dashboard }   from './pages/Dashboard.js?v=20260629r2';
import { Finanzas }    from './pages/Finanzas.js?v=20260629r2';
import { Inventario }  from './pages/Inventario.js?v=20260629r2';
import { Usuarios }    from './pages/Usuarios.js?v=20260629r2';
import { Compras }       from './pages/Compras.js?v=20260629r2';
// Servicios — módulo deprecado al cierre 03/05/2026 (Camino A vació la tabla
// en producción; flujo migrado a Cotizaciones APROBADAS + OCs). El backend
// sigue vivo porque Logística/OC consumen api.services.getServiciosActivos()
// para popular dropdowns, pero la página ya no se navega.
import { Proveedores }   from './pages/Proveedores.js?v=20260629r2';
import { Prestamos }     from './pages/Prestamos.js?v=20260629r2';
import { Comercial }     from './pages/Comercial.js?v=20260629r2';
import { ConfiguracionComercial } from './pages/ConfiguracionComercial.js?v=20260629r2';
import { Logistica }     from './pages/Logistica.js?v=20260629r2';
import { Administracion } from './pages/Administracion.js?v=20260629r2';
import { Configuracion }  from './pages/Configuracion.js?v=20260629r2';
import { Contabilidad }   from './pages/Contabilidad.js?v=20260629r2';
import { Importador }     from './pages/Importador.js?v=20260629r2';
import { OrdenesCompra }  from './pages/OrdenesCompra.js?v=20260629r2';
import { Produccion }     from './pages/Produccion.js?v=20260629r2';
import { Alertas }        from './pages/Alertas.js?v=20260629r2';
import { showSuccess, showError, showToast } from './services/ui.js?v=20260629r2';

// Exponer helpers de toast globalmente (los modules ES no tienen acceso
// directo desde otros modules sin import; varios usan window.showSuccess?.()
// con optional chaining, que sin esto falla silenciosamente).
window.showSuccess = showSuccess;
window.showError   = showError;
window.showToast   = showToast;

// ── Módulos en orden de preferencia para redirección inicial ──
const MODULE_ORDER = ['GERENCIA', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ALMACEN', 'ADMINISTRACION'];

const MODULE_TO_PAGE = {
  GERENCIA:       'dashboard',
  COMERCIAL:      'comercial',
  FINANZAS:       'finanzas',
  LOGISTICA:      'logistica',
  ALMACEN:        'inventario',
  PRODUCCION:     'produccion',
  ADMINISTRACION: 'administracion',
};

// Módulos que requieren acceso específico (GERENTE lo pasa siempre)
const PAGE_MODULE = {
  dashboard:      'GERENCIA',
  comercial:      'COMERCIAL',
  'configuracion-comercial': 'COMERCIAL',
  finanzas:       'FINANZAS',
  logistica:      'LOGISTICA',
  inventario:     'ALMACEN',
  produccion:     'PRODUCCION',
  administracion: 'ADMINISTRACION',
  usuarios:       null, // solo GERENTE, controlado aparte
  configuracion:  null, // solo GERENTE
  contabilidad:   null, // GERENTE o CONTADOR — chequeo aparte
  importador:     null, // solo GERENTE
  'ordenes-compra': 'LOGISTICA',
  alertas:        null, // accesible a todos; el contenido se filtra server-side
};

const PAGES = {
  dashboard:      Dashboard,
  finanzas:       Finanzas,
  inventario:     Inventario,
  produccion:     Produccion,
  usuarios:       Usuarios,
  compras:        Compras,
  comercial:      Comercial,
  'configuracion-comercial': ConfiguracionComercial,
  logistica:      Logistica,
  administracion: Administracion,
  proveedores:    Proveedores,
  prestamos:      Prestamos,
  configuracion:  Configuracion,
  contabilidad:   Contabilidad,
  importador:     Importador,
  'ordenes-compra': OrdenesCompra,
  alertas:        Alertas,
};

// ── Auth helpers ──────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); }
  catch { return {}; }
}

// Exponer navigate globalmente para que los onclick en páginas puedan llamarlo
window.navigate = (page) => navigate(page);

window.logout = async function () {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
  catch { /* aunque falle, seguimos al login */ }
  localStorage.removeItem('erp_user');
  localStorage.removeItem('erp_last_page');
  window.location.replace('/login.html');
};

// Toggle ocultar/mostrar sidebar (desktop). Persiste en localStorage para
// que el estado sobreviva al reload. En mobile no se usa (allí está el
// hamburger), las reglas CSS de .sidebar-collapsed están scopeadas a desktop.
window.toggleSidebarCollapse = function () {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  try { localStorage.setItem('erp_sidebar_collapsed', collapsed ? '1' : '0'); } catch {}
};

function getPaginaInicio(user) {
  if (user.rol === 'GERENTE') return 'dashboard';
  const modulos = user.modulos || [];
  for (const m of MODULE_ORDER) {
    if (modulos.includes(m)) return MODULE_TO_PAGE[m];
  }
  return null; // sin módulos asignados
}

function tieneAcceso(user, page) {
  if (user.rol === 'GERENTE') return true;
  // Solo GERENTE puede gestionar usuarios y configuración del sistema
  if (page === 'usuarios' || page === 'configuracion') return false;
  // Acceso granular por flags por usuario (asignados desde el modal de Usuarios).
  // El GERENTE puede dar/quitar Contabilidad e Importador a cualquier rol.
  if (page === 'contabilidad') return !!user.puede_contabilidad;
  if (page === 'importador')   return !!user.puede_importar;
  const moduloRequerido = PAGE_MODULE[page];
  if (!moduloRequerido) return true; // páginas sin módulo requerido
  return (user.modulos || []).includes(moduloRequerido);
}

// ── Pantallas de error/estado ─────────────────────────────────
function paginaAccesoRestringido(page) {
  return `
    <div class="placeholder-page">
      <h2>Acceso restringido</h2>
      <p>No tienes permiso para acceder al módulo <strong>${page}</strong>.</p>
      <p>Contacta al administrador para solicitar acceso.</p>
    </div>`;
}

function paginaSinModulos() {
  return `
    <div class="placeholder-page">
      <h2>Sin módulos asignados</h2>
      <p>Tu usuario no tiene módulos habilitados.</p>
      <p>Contacta al administrador del sistema.</p>
    </div>`;
}

// ── Router SPA ────────────────────────────────────────────────
let currentPage = null;

// Redirecciones legacy: páginas standalone absorbidas en hubs. Si alguien
// aterriza vía URL vieja o link viejo, lo mandamos al deeplink correcto del
// hub para que tenga el menú de tabs y pueda navegar de vuelta.
const REDIRECTS_LEGACY = {
  proveedores: 'logistica/proveedores',
  // El kanban OC standalone está integrado dentro de Logística como sub-tab.
  // Redirigimos para evitar tener dos vistas duplicadas y el usuario "atrapado"
  // en una pantalla sin sidebar contextual.
  'ordenes-compra': 'logistica/oc',
};

async function navigate(page) {
  if (REDIRECTS_LEGACY[page]) {
    window.location.hash = REDIRECTS_LEGACY[page];
    return;
  }

  // Re-chequea sesión contra BD en cada cambio de página (sin bloquear).
  // Si el GERENTE cambió rol/módulos, los pickea aquí. Si hay cambio de
  // rol/flags, hace reload automático para garantizar que TODOS los
  // componentes vean el localStorage fresco.
  const cambio = await refreshSessionFromServer({ reloadOnChange: true });
  if (cambio) return; // reload en curso, no seguimos pintando la SPA

  const user = getUser();
  if (!tieneAcceso(user, page)) {
    renderSidebar(page);
    document.getElementById('main-content').innerHTML = paginaAccesoRestringido(page);
    return;
  }

  currentPage = page;
  renderSidebar(page);

  // Preservar sub-tab si estamos re-navegando al MISMO módulo (caso típico:
  // refreshModule() después de una acción). Si cambiamos de módulo, el
  // sub-tab anterior pertenece a otro módulo y no debe arrastrarse.
  // Hash format: #modulo o #modulo/sub-tab (sin slash inicial).
  const partesHash = (window.location.hash || '').replace(/^#\/?/, '').split('/');
  const moduloAnterior = partesHash[0];
  const subTabAnterior = moduloAnterior === page ? partesHash.slice(1).filter(Boolean).join('/') : '';
  const nuevoHash = subTabAnterior ? `#${page}/${subTabAnterior}` : `#${page}`;
  history.pushState({ page }, '', nuevoHash);

  // Persistimos la última página visitada para que un Ctrl+Shift+R o
  // un cierre/apertura de pestaña re-aterrice al usuario donde estaba,
  // incluso si el hash se pierde por algún motivo (cache, redirect, etc.).
  try { localStorage.setItem('erp_last_page', page); } catch {}

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = '<div style="padding:50px;text-align:center;color:var(--text-secondary);">Cargando módulo...</div>';

  if (!PAGES[page]) {
    // El usuario pidió explícitamente esta página pero el JS cargado no la
    // conoce. Causa típica: el browser cacheó un app.js viejo que no incluye
    // este import. Antes redirigíamos silenciosamente a dashboard, lo que
    // confundía al usuario.
    console.warn(`[Router] Página "${page}" no está en PAGES. Probable caché viejo.`);
    mainContent.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-secondary);max-width:560px;margin:60px auto;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
        <h2 style="color:#9a3412;font-size:18px;margin-bottom:10px">⚠️ Página no disponible en este browser</h2>
        <p style="color:#374151;font-size:13px">La página <strong>${page}</strong> existe en el servidor pero tu browser está usando una versión vieja del código (caché).</p>
        <p style="color:#374151;font-size:13px;margin-top:14px"><strong>Solución:</strong> hacé <kbd style="background:#f3f4f6;padding:2px 7px;border:1px solid #d1d5db;border-radius:4px">Ctrl + Shift + R</kbd> para forzar la descarga del código nuevo.</p>
        <p style="color:#6b7280;font-size:11px;margin-top:14px">Si el problema persiste tras el refresh, abrí una ventana de incógnito (Ctrl+Shift+N) o borrá el caché completo del sitio.</p>
        <button onclick="location.reload(true)" style="margin-top:16px;padding:9px 20px;background:#2563eb;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:600">🔄 Recargar página</button>
      </div>
    `;
    return;
  }
  const Component = PAGES[page];
  try {
    mainContent.innerHTML = await Component();
  } catch (err) {
    console.error('[Router] Error cargando página:', err);
    mainContent.innerHTML = `<div class="text-danger" style="padding:40px;">Error cargando el módulo: ${err.message}</div>`;
  }
}

// ── ¿Existe ya la ConfiguracionEmpresa? ──────────────────────
// Si NO existe y el usuario es GERENTE, forzamos #configuracion para ejecutar
// el wizard antes de que se topen con errores en Contabilidad / OCs / Facturas.
async function configEmpresaExiste() {
  try {
    const r = await fetch('/api/config/existe', { credentials: 'same-origin' });
    if (!r.ok) return true; // ante cualquier duda no bloqueamos al usuario
    const data = await r.json();
    return !!data?.existe;
  } catch {
    return true;
  }
}

/**
 * Refresca rol/módulos/permisos contra la BD. El JWT y el localStorage se
 * setean SOLO al hacer login — si el GERENTE cambia el rol/módulos de un
 * usuario después, sin esto la pantalla queda stale hasta logout/login.
 *
 * /api/auth/me ahora consulta BD fresca y devuelve `{ usuario }`.
 * Si el rol/flags cambiaron, recargamos la SPA para que los componentes lean el localStorage fresco.
 *
 * Best-effort: si falla (sin red, 401, etc.), no bloqueamos el arranque —
 * el flujo legacy con el JWT existente sigue funcionando hasta que el
 * usuario haga logout o el token expire.
 */
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
      // Aviso visible 1.5s antes del reload para que el usuario sepa qué pasa.
      try { window.showToast?.('Tus permisos fueron actualizados. Refrescando…', 'info'); } catch {}
      setTimeout(() => window.location.reload(), 1500);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Aviso de nueva versión desplegada ──────────────────────────────────────
// Pollea /api/version. Si el id de build cambió respecto al de cuando cargó la
// página, hubo un deploy nuevo → mostramos un banner discreto para que el
// usuario recargue cuando quiera. NO recargamos solos (no interrumpir forms).
let _bootBuildVersion = null;
let _nuevaVersionBannerMostrado = false;

async function _fetchBuildVersion() {
  try {
    const r = await fetch('/api/version', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.version ? d.version : null;
  } catch { return null; }
}

function _mostrarBannerNuevaVersion() {
  if (_nuevaVersionBannerMostrado || document.getElementById('nueva-version-banner')) return;
  _nuevaVersionBannerMostrado = true;
  const bar = document.createElement('div');
  bar.id = 'nueva-version-banner';
  bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:99999;'
    + 'background:#111827;color:#fff;border:1px solid #374151;border-radius:10px;'
    + 'padding:10px 14px;display:flex;align-items:center;gap:12px;'
    + 'box-shadow:0 10px 30px rgba(0,0,0,.35);font-size:13px;max-width:92vw';
  bar.innerHTML = `
    <span>✨ Hay una versión nueva del sistema.</span>
    <button id="nv-reload" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;font-size:13px">Recargar</button>
    <button id="nv-dismiss" title="Posponer" aria-label="Posponer" style="background:transparent;color:#9ca3af;border:none;cursor:pointer;font-size:18px;line-height:1">×</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#nv-reload').onclick = () => location.reload();
  bar.querySelector('#nv-dismiss').onclick = () => bar.remove(); // pospuesto esta sesión
}

async function _chequearNuevaVersion() {
  const v = await _fetchBuildVersion();
  if (!v) return;
  if (_bootBuildVersion === null) { _bootBuildVersion = v; return; } // 1ra lectura = versión de arranque
  if (v !== _bootBuildVersion) _mostrarBannerNuevaVersion();
}

function setupVersionCheck() {
  _chequearNuevaVersion();                              // captura la versión de arranque
  setInterval(_chequearNuevaVersion, 3 * 60 * 1000);    // re-chequea cada 3 min
  document.addEventListener('visibilitychange', () => { // y al volver a la pestaña
    if (document.visibilityState === 'visible') _chequearNuevaVersion();
  });
}

async function init() {
  // Limpieza one-time: el token ahora vive en cookie httpOnly. Si quedó un
  // erp_token viejo de localStorage (sesión pre-migración), lo borramos.
  localStorage.removeItem('erp_token');

  if (!localStorage.getItem('erp_user')) {
    window.location.replace('/login.html');
    return;
  }

  // Chequeo de versión: arranca el polling para avisar cuando haya un deploy
  // nuevo (banner discreto). Se hace acá, ya con sesión, antes de cualquier
  // early-return posterior de init().
  setupVersionCheck();

  // Refresca antes de pintar la SPA, así Sidebar y todos los chequeos de
  // rol leen valores frescos de BD. Si el rol cambió y el usuario quedó
  // sin acceso a la página actual, navigate() se encarga del redirect.
  await refreshSessionFromServer();

  const user = getUser();

  // Shell estática con sidebar + main-content + hamburger mobile
  document.getElementById('root').innerHTML = `
    <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Menú">☰</button>
    <button class="app-sidebar-show" id="app-sidebar-show" type="button"
            aria-label="Mostrar menú lateral" title="Mostrar menú"
            onclick="toggleSidebarCollapse()">☰</button>
    <div class="mobile-overlay" id="mobile-overlay"></div>
    <div class="app-container">
      <aside class="sidebar" id="sidebar"></aside>
      <main class="main-content" id="main-content"></main>
    </div>
  `;

  // Restaurar estado colapsado de la sidebar (solo aplica visualmente en desktop;
  // en mobile la regla CSS está scopeada a min-width:769px y no afecta).
  try {
    if (localStorage.getItem('erp_sidebar_collapsed') === '1') {
      document.body.classList.add('sidebar-collapsed');
    }
  } catch {}

  // Toggle hamburger en mobile
  const sidebarEl = document.getElementById('sidebar');
  const overlayEl = document.getElementById('mobile-overlay');
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const closeMobileSidebar = () => {
    sidebarEl.classList.remove('mobile-open');
    overlayEl.classList.remove('mobile-open');
    document.body.classList.remove('sidebar-open');
  };
  const openMobileSidebar = () => {
    sidebarEl.classList.add('mobile-open');
    overlayEl.classList.add('mobile-open');
    document.body.classList.add('sidebar-open');
  };
  toggleBtn.addEventListener('click', () => {
    if (sidebarEl.classList.contains('mobile-open')) closeMobileSidebar();
    else openMobileSidebar();
  });
  overlayEl.addEventListener('click', closeMobileSidebar);

  // Delegación de eventos en sidebar
  document.getElementById('sidebar').addEventListener('click', (e) => {
    const item = e.target.closest('[data-page]');
    if (item) {
      navigate(item.dataset.page);
      closeMobileSidebar(); // cierra al navegar en mobile
    }
  });

  // Botón atrás del browser
  window.addEventListener('popstate', (e) => {
    const page = e.state?.page || getPaginaInicio(user) || 'dashboard';
    navigate(page);
  });

  // Navegación por hash (links internos tipo <a href="#pagina">). Tomamos
  // sólo el primer segmento porque algunos módulos usan sub-rutas internas
  // (#logistica/general, #logistica/almacen) y no queremos re-navegar al
  // módulo cada vez que cambia la pestaña interna.
  window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '').trim().split('/')[0];
    if (page && PAGES[page] && page !== currentPage) navigate(page);
  });

  // Helper para refrescar el módulo actual (re-fetch + re-render) tras una
  // mutation. El listener de hashchange por sí solo NO re-navega cuando el
  // page no cambia (decisión consciente para preservar state de pestañas
  // internas tipo #logistica/general). Para post-cobranza/post-OC/etc.
  // necesitamos forzar el re-render — este helper lo cubre.
  window.refreshModule = () => {
    if (currentPage && PAGES[currentPage]) navigate(currentPage);
  };

  // Página inicial — primer segmento del hash (algunos módulos usan
  // sub-rutas internas tipo #logistica/general para sus pestañas, así
  // que partimos por '/' y nos quedamos con el módulo).
  const hashRaw  = window.location.hash.replace('#', '').trim();
  const hashPage = hashRaw.split('/')[0];
  const paginaInicio = getPaginaInicio(user);

  if (!paginaInicio) {
    renderSidebar(null);
    document.getElementById('main-content').innerHTML = paginaSinModulos();
    return;
  }

  // Si el GERENTE entra y aún no existe ConfiguracionEmpresa, llevarlo directo
  // al wizard de setup. Cualquier otro destino fallaría en backend.
  if (user.rol === 'GERENTE') {
    const existe = await configEmpresaExiste();
    if (!existe) {
      navigate('configuracion');
      return;
    }
  }

  // Resolver destino con fallback en cascada para que un Ctrl+Shift+R
  // mantenga al usuario en el módulo donde estaba (clave: muchos usuarios
  // no son GERENTE y no tienen acceso al dashboard, así que recargar y
  // caer ahí los mete en "Acceso restringido").
  // 1) hash explícito en la URL (#finanzas) — top priority
  // 2) última página guardada en localStorage (sobrevive a reloads)
  // 3) página de inicio según rol/módulos (último recurso)
  let lastPage = null;
  try { lastPage = localStorage.getItem('erp_last_page'); } catch {}

  let destino = paginaInicio;
  if (hashPage && PAGES[hashPage] && tieneAcceso(user, hashPage)) {
    destino = hashPage;
  } else if (lastPage && PAGES[lastPage] && tieneAcceso(user, lastPage)) {
    destino = lastPage;
  }
  navigate(destino);
}

document.addEventListener('DOMContentLoaded', init);

// ── Tooltips .tip — soporte tap-to-show en mobile ─────────────
// En desktop con `:hover` el tooltip aparece solo. En mobile no hay hover,
// así que cualquier click en un .tip lo activa, y un click fuera lo cierra.
document.addEventListener('click', (e) => {
  const tipEl = e.target.closest?.('.tip');
  // Cerrar todos los tooltips activos primero
  document.querySelectorAll('.tip.tip-active').forEach(t => {
    if (t !== tipEl) t.classList.remove('tip-active');
  });
  if (tipEl) {
    tipEl.classList.toggle('tip-active');
    e.stopPropagation();
  }
}, true);

// ── Auto-cierre flotante para modales ─────────────────────────
// En el ERP los modales son divs con `position:fixed; inset:0;` y un hijo box.
// El botón "Cerrar" suele estar al final → en mobile queda fuera del viewport
// y el usuario no sabe cómo cerrar. Inyectamos un ✕ flotante arriba a la derecha
// que dispara el handler del botón Cerrar existente (o remueve el overlay).
(function setupFloatingCloseButton() {
  const isModalOverlay = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const s = el.getAttribute('style') || '';
    return /position:\s*fixed/.test(s) && /inset:\s*0/.test(s);
  };

  const inyectarCerrarFlotante = (overlay) => {
    if (overlay.dataset.fcInjected) return;
    const box = overlay.querySelector(':scope > div');
    if (!box) return;
    overlay.dataset.fcInjected = '1';

    const x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar');
    x.textContent = '✕';
    x.style.cssText = [
      // Pegado al overlay (fixed position), NO al box (que tiene overflow:auto)
      // así el ✕ no se va con el scroll del contenido del modal.
      'position:absolute', 'top:14px', 'right:14px',
      'width:40px', 'height:40px',
      'border:none', 'border-radius:50%',
      'background:#000', 'color:#fff',
      'font-size:20px', 'font-weight:700',
      'line-height:1',
      'cursor:pointer', 'z-index:10001',
      'display:flex', 'align-items:center', 'justify-content:center',
      'box-shadow:0 2px 8px rgba(0,0,0,.35)',
      '-webkit-tap-highlight-color:transparent',
      'padding:0',
    ].join(';');
    x.onclick = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      // Si hay un botón "Cerrar" existente, dispará su handler (mantiene reglas
      // de negocio si el modal hace algo extra al cerrar).
      const cerrarExistente = box.querySelector('button[id^="close-"], button[data-close]');
      if (cerrarExistente) cerrarExistente.click();
      else overlay.remove();
    };
    // Append al overlay (position:fixed) para que el ✕ siempre esté visible
    overlay.appendChild(x);
  };

  // Procesar overlays ya existentes
  document.querySelectorAll('body > div').forEach(el => {
    if (isModalOverlay(el)) inyectarCerrarFlotante(el);
  });

  // Observar nuevos modales que se inyecten en runtime
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (isModalOverlay(n)) inyectarCerrarFlotante(n);
      });
    }
  });
  obs.observe(document.body, { childList: true });
})();

// ─── Indicador visual de scroll horizontal en tablas ─────────────────
// Cuando una .table-container tiene contenido que se desborda lateralmente,
// agregamos la clase .has-scroll → activa el gradient ::after definido en CSS.
// Útil en mobile para que el usuario sepa que puede deslizar la tabla.
(function setupTableScrollIndicator() {
  const checkScroll = (el) => {
    if (!el || !el.classList) return;
    const tieneScroll = el.scrollWidth > el.clientWidth + 2;
    el.classList.toggle('has-scroll', tieneScroll);
  };
  const checkAll = () => document.querySelectorAll('.table-container').forEach(checkScroll);

  // Re-check al cargar, al cambiar tamaño de ventana, y cuando se agreguen tablas
  window.addEventListener('resize', checkAll, { passive: true });
  // Observar mutaciones del DOM para tablas que aparecen dinámicamente
  const mo = new MutationObserver(() => requestAnimationFrame(checkAll));
  mo.observe(document.body, { childList: true, subtree: true });
  // Al hacer scroll lateral, oculta el gradient si llegó al final
  document.addEventListener('scroll', (e) => {
    if (e.target?.classList?.contains('table-container')) {
      const llegoAlFinal = e.target.scrollLeft + e.target.clientWidth >= e.target.scrollWidth - 2;
      e.target.classList.toggle('has-scroll', !llegoAlFinal);
    }
  }, { capture: true, passive: true });
  // Primera evaluación
  requestAnimationFrame(checkAll);
})();

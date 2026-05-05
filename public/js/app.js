// Cache busting para imports ES module: cada path lleva su ?v=YYYYMMDDr#
// hardcodeado. Si se cambia CUALQUIER archivo de pages/components/services
// hay que bumpear el sufijo en TODAS las líneas (Find/Replace de v=2026...).
import { renderSidebar } from './components/Sidebar.js?v=20260504r13';
import { Dashboard }   from './pages/Dashboard.js?v=20260504r13';
import { Finanzas }    from './pages/Finanzas.js?v=20260504r13';
import { Inventario }  from './pages/Inventario.js?v=20260504r13';
import { Usuarios }    from './pages/Usuarios.js?v=20260504r13';
import { Compras }       from './pages/Compras.js?v=20260504r13';
// Servicios — módulo deprecado al cierre 03/05/2026 (Camino A vació la tabla
// en producción; flujo migrado a Cotizaciones APROBADAS + OCs). El backend
// sigue vivo porque Logística/OC consumen api.services.getServiciosActivos()
// para popular dropdowns, pero la página ya no se navega.
import { Proveedores }   from './pages/Proveedores.js?v=20260504r13';
import { Prestamos }     from './pages/Prestamos.js?v=20260504r13';
import { Comercial }     from './pages/Comercial.js?v=20260504r13';
import { ConfiguracionComercial } from './pages/ConfiguracionComercial.js?v=20260504r13';
import { Logistica }     from './pages/Logistica.js?v=20260504r13';
import { Administracion } from './pages/Administracion.js?v=20260504r13';
import { Configuracion }  from './pages/Configuracion.js?v=20260504r13';
import { Contabilidad }   from './pages/Contabilidad.js?v=20260504r13';
import { Importador }     from './pages/Importador.js?v=20260504r13';
import { OrdenesCompra }  from './pages/OrdenesCompra.js?v=20260504r13';
import { Produccion }     from './pages/Produccion.js?v=20260504r13';
import { Alertas }        from './pages/Alertas.js?v=20260504r13';
import { showSuccess, showError, showToast } from './services/ui.js?v=20260504r13';

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

window.logout = function () {
  localStorage.removeItem('erp_token');
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
  history.pushState({ page }, '', `#${page}`);
  // Persistimos la última página visitada para que un Ctrl+Shift+R o
  // un cierre/apertura de pestaña re-aterrice al usuario donde estaba,
  // incluso si el hash se pierde por algún motivo (cache, redirect, etc.).
  try { localStorage.setItem('erp_last_page', page); } catch {}

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = '<div style="padding:50px;text-align:center;color:var(--text-secondary);">Cargando módulo...</div>';

  if (!PAGES[page]) {
    navigate(getPaginaInicio(user));
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
    const r = await fetch('/api/config/existe', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('erp_token') || '') }
    });
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
 * /api/auth/me ahora consulta BD fresca y devuelve `{ usuario, cambio, token }`.
 * Si `cambio: true`, regrabamos `erp_user` y `erp_token` en localStorage.
 *
 * Best-effort: si falla (sin red, 401, etc.), no bloqueamos el arranque —
 * el flujo legacy con el JWT existente sigue funcionando hasta que el
 * usuario haga logout o el token expire.
 */
async function refreshSessionFromServer({ reloadOnChange = false } = {}) {
  try {
    const token = localStorage.getItem('erp_token');
    if (!token) return false;
    const r = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (r.status === 401) {
      // JWT inválido o usuario desactivado → al login.
      localStorage.removeItem('erp_token');
      localStorage.removeItem('erp_user');
      window.location.replace('/login.html');
      return false;
    }
    if (!r.ok) return false;
    const data = await r.json();
    if (!data?.usuario) return false;

    // Detectar si el rol o flags cambiaron contra el localStorage actual.
    // Si cambian, varias páginas leyeron el rol viejo en variables locales
    // y la única forma 100% segura es recargar.
    let prev = {};
    try { prev = JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch {}
    const cambioRolOFlags =
      prev.rol !== data.usuario.rol ||
      !!prev.puede_contabilidad !== !!data.usuario.puede_contabilidad ||
      !!prev.puede_importar     !== !!data.usuario.puede_importar;

    localStorage.setItem('erp_user', JSON.stringify(data.usuario));
    if (data.cambio && data.token) {
      localStorage.setItem('erp_token', data.token);
    }

    if (cambioRolOFlags && reloadOnChange) {
      // Aviso visible 1.5s antes del reload para que el usuario sepa qué pasa.
      try { window.showToast?.('Tus permisos fueron actualizados. Refrescando…', 'info'); } catch {}
      setTimeout(() => window.location.reload(), 1500);
      return true;
    }
    return cambioRolOFlags;
  } catch {
    // sin red / endpoint caído → no bloqueamos
    return false;
  }
}

async function init() {
  if (!localStorage.getItem('erp_token')) {
    window.location.replace('/login.html');
    return;
  }

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

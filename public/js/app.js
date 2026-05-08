// Cache busting para imports ES module: cada path lleva su ?v=YYYYMMDDr#
// hardcodeado. Si se cambia CUALQUIER archivo de pages/components/services
// hay que bumpear el sufijo en TODAS las lÃ­neas (Find/Replace de v=2026...).
import { renderSidebar } from './components/Sidebar.js?v=20260508r9';
import { Dashboard }   from './pages/Dashboard.js?v=20260508r9';
import { Finanzas }    from './pages/Finanzas.js?v=20260508r9';
import { Inventario }  from './pages/Inventario.js?v=20260508r9';
import { Usuarios }    from './pages/Usuarios.js?v=20260508r9';
import { Compras }       from './pages/Compras.js?v=20260508r9';
// Servicios â€” mÃ³dulo deprecado al cierre 03/05/2026 (Camino A vaciÃ³ la tabla
// en producciÃ³n; flujo migrado a Cotizaciones APROBADAS + OCs). El backend
// sigue vivo porque LogÃ­stica/OC consumen api.services.getServiciosActivos()
// para popular dropdowns, pero la pÃ¡gina ya no se navega.
import { Proveedores }   from './pages/Proveedores.js?v=20260508r9';
import { Prestamos }     from './pages/Prestamos.js?v=20260508r9';
import { Comercial }     from './pages/Comercial.js?v=20260508r9';
import { ConfiguracionComercial } from './pages/ConfiguracionComercial.js?v=20260508r9';
import { Logistica }     from './pages/Logistica.js?v=20260508r9';
import { Administracion } from './pages/Administracion.js?v=20260508r9';
import { Configuracion }  from './pages/Configuracion.js?v=20260508r9';
import { Contabilidad }   from './pages/Contabilidad.js?v=20260508r9';
import { Importador }     from './pages/Importador.js?v=20260508r9';
import { OrdenesCompra }  from './pages/OrdenesCompra.js?v=20260508r9';
import { Produccion }     from './pages/Produccion.js?v=20260508r9';
import { Alertas }        from './pages/Alertas.js?v=20260508r9';
import { showSuccess, showError, showToast } from './services/ui.js?v=20260508r9';

// Exponer helpers de toast globalmente (los modules ES no tienen acceso
// directo desde otros modules sin import; varios usan window.showSuccess?.()
// con optional chaining, que sin esto falla silenciosamente).
window.showSuccess = showSuccess;
window.showError   = showError;
window.showToast   = showToast;

// â”€â”€ MÃ³dulos en orden de preferencia para redirecciÃ³n inicial â”€â”€
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

// MÃ³dulos que requieren acceso especÃ­fico (GERENTE lo pasa siempre)
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
  contabilidad:   null, // GERENTE o CONTADOR â€” chequeo aparte
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

// â”€â”€ Auth helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getUser() {
  try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); }
  catch { return {}; }
}

// Exponer navigate globalmente para que los onclick en pÃ¡ginas puedan llamarlo
window.navigate = (page) => navigate(page);

window.logout = function () {
  localStorage.removeItem('erp_token');
  localStorage.removeItem('erp_user');
  localStorage.removeItem('erp_last_page');
  window.location.replace('/login.html');
};

// Toggle ocultar/mostrar sidebar (desktop). Persiste en localStorage para
// que el estado sobreviva al reload. En mobile no se usa (allÃ­ estÃ¡ el
// hamburger), las reglas CSS de .sidebar-collapsed estÃ¡n scopeadas a desktop.
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
  return null; // sin mÃ³dulos asignados
}

function tieneAcceso(user, page) {
  if (user.rol === 'GERENTE') return true;
  // Solo GERENTE puede gestionar usuarios y configuraciÃ³n del sistema
  if (page === 'usuarios' || page === 'configuracion') return false;
  // Acceso granular por flags por usuario (asignados desde el modal de Usuarios).
  // El GERENTE puede dar/quitar Contabilidad e Importador a cualquier rol.
  if (page === 'contabilidad') return !!user.puede_contabilidad;
  if (page === 'importador')   return !!user.puede_importar;
  const moduloRequerido = PAGE_MODULE[page];
  if (!moduloRequerido) return true; // pÃ¡ginas sin mÃ³dulo requerido
  return (user.modulos || []).includes(moduloRequerido);
}

// â”€â”€ Pantallas de error/estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function paginaAccesoRestringido(page) {
  return `
    <div class="placeholder-page">
      <h2>Acceso restringido</h2>
      <p>No tienes permiso para acceder al mÃ³dulo <strong>${page}</strong>.</p>
      <p>Contacta al administrador para solicitar acceso.</p>
    </div>`;
}

function paginaSinModulos() {
  return `
    <div class="placeholder-page">
      <h2>Sin mÃ³dulos asignados</h2>
      <p>Tu usuario no tiene mÃ³dulos habilitados.</p>
      <p>Contacta al administrador del sistema.</p>
    </div>`;
}

// â”€â”€ Router SPA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let currentPage = null;

// Redirecciones legacy: pÃ¡ginas standalone absorbidas en hubs. Si alguien
// aterriza vÃ­a URL vieja o link viejo, lo mandamos al deeplink correcto del
// hub para que tenga el menÃº de tabs y pueda navegar de vuelta.
const REDIRECTS_LEGACY = {
  proveedores: 'logistica/proveedores',
  // El kanban OC standalone estÃ¡ integrado dentro de LogÃ­stica como sub-tab.
  // Redirigimos para evitar tener dos vistas duplicadas y el usuario "atrapado"
  // en una pantalla sin sidebar contextual.
  'ordenes-compra': 'logistica/oc',
};

async function navigate(page) {
  if (REDIRECTS_LEGACY[page]) {
    window.location.hash = REDIRECTS_LEGACY[page];
    return;
  }

  // Re-chequea sesiÃ³n contra BD en cada cambio de pÃ¡gina (sin bloquear).
  // Si el GERENTE cambiÃ³ rol/mÃ³dulos, los pickea aquÃ­. Si hay cambio de
  // rol/flags, hace reload automÃ¡tico para garantizar que TODOS los
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

  // Preservar sub-tab si estamos re-navegando al MISMO mÃ³dulo (caso tÃ­pico:
  // refreshModule() despuÃ©s de una acciÃ³n). Si cambiamos de mÃ³dulo, el
  // sub-tab anterior pertenece a otro mÃ³dulo y no debe arrastrarse.
  // Hash format: #modulo o #modulo/sub-tab (sin slash inicial).
  const partesHash = (window.location.hash || '').replace(/^#\/?/, '').split('/');
  const moduloAnterior = partesHash[0];
  const subTabAnterior = moduloAnterior === page ? partesHash.slice(1).filter(Boolean).join('/') : '';
  const nuevoHash = subTabAnterior ? `#${page}/${subTabAnterior}` : `#${page}`;
  history.pushState({ page }, '', nuevoHash);

  // Persistimos la Ãºltima pÃ¡gina visitada para que un Ctrl+Shift+R o
  // un cierre/apertura de pestaÃ±a re-aterrice al usuario donde estaba,
  // incluso si el hash se pierde por algÃºn motivo (cache, redirect, etc.).
  try { localStorage.setItem('erp_last_page', page); } catch {}

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = '<div style="padding:50px;text-align:center;color:var(--text-secondary);">Cargando mÃ³dulo...</div>';

  if (!PAGES[page]) {
    navigate(getPaginaInicio(user));
    return;
  }
  const Component = PAGES[page];
  try {
    mainContent.innerHTML = await Component();
  } catch (err) {
    console.error('[Router] Error cargando pÃ¡gina:', err);
    mainContent.innerHTML = `<div class="text-danger" style="padding:40px;">Error cargando el mÃ³dulo: ${err.message}</div>`;
  }
}

// â”€â”€ Â¿Existe ya la ConfiguracionEmpresa? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
 * Refresca rol/mÃ³dulos/permisos contra la BD. El JWT y el localStorage se
 * setean SOLO al hacer login â€” si el GERENTE cambia el rol/mÃ³dulos de un
 * usuario despuÃ©s, sin esto la pantalla queda stale hasta logout/login.
 *
 * /api/auth/me ahora consulta BD fresca y devuelve `{ usuario, cambio, token }`.
 * Si `cambio: true`, regrabamos `erp_user` y `erp_token` en localStorage.
 *
 * Best-effort: si falla (sin red, 401, etc.), no bloqueamos el arranque â€”
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
      // JWT invÃ¡lido o usuario desactivado â†’ al login.
      localStorage.removeItem('erp_token');
      localStorage.removeItem('erp_user');
      window.location.replace('/login.html');
      return false;
    }
    if (!r.ok) return false;
    const data = await r.json();
    if (!data?.usuario) return false;

    // Detectar si el rol o flags cambiaron contra el localStorage actual.
    // Si cambian, varias pÃ¡ginas leyeron el rol viejo en variables locales
    // y la Ãºnica forma 100% segura es recargar.
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
      // Aviso visible 1.5s antes del reload para que el usuario sepa quÃ© pasa.
      try { window.showToast?.('Tus permisos fueron actualizados. Refrescandoâ€¦', 'info'); } catch {}
      setTimeout(() => window.location.reload(), 1500);
      return true;
    }
    return cambioRolOFlags;
  } catch {
    // sin red / endpoint caÃ­do â†’ no bloqueamos
    return false;
  }
}

async function init() {
  if (!localStorage.getItem('erp_token')) {
    window.location.replace('/login.html');
    return;
  }

  // Refresca antes de pintar la SPA, asÃ­ Sidebar y todos los chequeos de
  // rol leen valores frescos de BD. Si el rol cambiÃ³ y el usuario quedÃ³
  // sin acceso a la pÃ¡gina actual, navigate() se encarga del redirect.
  await refreshSessionFromServer();

  const user = getUser();

  // Shell estÃ¡tica con sidebar + main-content + hamburger mobile
  document.getElementById('root').innerHTML = `
    <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="MenÃº">â˜°</button>
    <button class="app-sidebar-show" id="app-sidebar-show" type="button"
            aria-label="Mostrar menÃº lateral" title="Mostrar menÃº"
            onclick="toggleSidebarCollapse()">â˜°</button>
    <div class="mobile-overlay" id="mobile-overlay"></div>
    <div class="app-container">
      <aside class="sidebar" id="sidebar"></aside>
      <main class="main-content" id="main-content"></main>
    </div>
  `;

  // Restaurar estado colapsado de la sidebar (solo aplica visualmente en desktop;
  // en mobile la regla CSS estÃ¡ scopeada a min-width:769px y no afecta).
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

  // DelegaciÃ³n de eventos en sidebar
  document.getElementById('sidebar').addEventListener('click', (e) => {
    const item = e.target.closest('[data-page]');
    if (item) {
      navigate(item.dataset.page);
      closeMobileSidebar(); // cierra al navegar en mobile
    }
  });

  // BotÃ³n atrÃ¡s del browser
  window.addEventListener('popstate', (e) => {
    const page = e.state?.page || getPaginaInicio(user) || 'dashboard';
    navigate(page);
  });

  // NavegaciÃ³n por hash (links internos tipo <a href="#pagina">). Tomamos
  // sÃ³lo el primer segmento porque algunos mÃ³dulos usan sub-rutas internas
  // (#logistica/general, #logistica/almacen) y no queremos re-navegar al
  // mÃ³dulo cada vez que cambia la pestaÃ±a interna.
  window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '').trim().split('/')[0];
    if (page && PAGES[page] && page !== currentPage) navigate(page);
  });

  // Helper para refrescar el mÃ³dulo actual (re-fetch + re-render) tras una
  // mutation. El listener de hashchange por sÃ­ solo NO re-navega cuando el
  // page no cambia (decisiÃ³n consciente para preservar state de pestaÃ±as
  // internas tipo #logistica/general). Para post-cobranza/post-OC/etc.
  // necesitamos forzar el re-render â€” este helper lo cubre.
  window.refreshModule = () => {
    if (currentPage && PAGES[currentPage]) navigate(currentPage);
  };

  // PÃ¡gina inicial â€” primer segmento del hash (algunos mÃ³dulos usan
  // sub-rutas internas tipo #logistica/general para sus pestaÃ±as, asÃ­
  // que partimos por '/' y nos quedamos con el mÃ³dulo).
  const hashRaw  = window.location.hash.replace('#', '').trim();
  const hashPage = hashRaw.split('/')[0];
  const paginaInicio = getPaginaInicio(user);

  if (!paginaInicio) {
    renderSidebar(null);
    document.getElementById('main-content').innerHTML = paginaSinModulos();
    return;
  }

  // Si el GERENTE entra y aÃºn no existe ConfiguracionEmpresa, llevarlo directo
  // al wizard de setup. Cualquier otro destino fallarÃ­a en backend.
  if (user.rol === 'GERENTE') {
    const existe = await configEmpresaExiste();
    if (!existe) {
      navigate('configuracion');
      return;
    }
  }

  // Resolver destino con fallback en cascada para que un Ctrl+Shift+R
  // mantenga al usuario en el mÃ³dulo donde estaba (clave: muchos usuarios
  // no son GERENTE y no tienen acceso al dashboard, asÃ­ que recargar y
  // caer ahÃ­ los mete en "Acceso restringido").
  // 1) hash explÃ­cito en la URL (#finanzas) â€” top priority
  // 2) Ãºltima pÃ¡gina guardada en localStorage (sobrevive a reloads)
  // 3) pÃ¡gina de inicio segÃºn rol/mÃ³dulos (Ãºltimo recurso)
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

// â”€â”€ Tooltips .tip â€” soporte tap-to-show en mobile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// En desktop con `:hover` el tooltip aparece solo. En mobile no hay hover,
// asÃ­ que cualquier click en un .tip lo activa, y un click fuera lo cierra.
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

// â”€â”€ Auto-cierre flotante para modales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// En el ERP los modales son divs con `position:fixed; inset:0;` y un hijo box.
// El botÃ³n "Cerrar" suele estar al final â†’ en mobile queda fuera del viewport
// y el usuario no sabe cÃ³mo cerrar. Inyectamos un âœ• flotante arriba a la derecha
// que dispara el handler del botÃ³n Cerrar existente (o remueve el overlay).
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
    x.textContent = 'âœ•';
    x.style.cssText = [
      // Pegado al overlay (fixed position), NO al box (que tiene overflow:auto)
      // asÃ­ el âœ• no se va con el scroll del contenido del modal.
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
      // Si hay un botÃ³n "Cerrar" existente, disparÃ¡ su handler (mantiene reglas
      // de negocio si el modal hace algo extra al cerrar).
      const cerrarExistente = box.querySelector('button[id^="close-"], button[data-close]');
      if (cerrarExistente) cerrarExistente.click();
      else overlay.remove();
    };
    // Append al overlay (position:fixed) para que el âœ• siempre estÃ© visible
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

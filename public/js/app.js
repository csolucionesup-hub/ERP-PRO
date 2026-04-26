import { renderSidebar } from './components/Sidebar.js';
import { Dashboard }   from './pages/Dashboard.js';
import { Finanzas }    from './pages/Finanzas.js';
import { Inventario }  from './pages/Inventario.js';
import { Usuarios }    from './pages/Usuarios.js';
import { Compras }       from './pages/Compras.js';
import { Servicios }     from './pages/Servicios.js';
import { Proveedores }   from './pages/Proveedores.js';
import { Prestamos }     from './pages/Prestamos.js';
import { Comercial }     from './pages/Comercial.js';
import { ConfiguracionComercial } from './pages/ConfiguracionComercial.js';
import { Logistica }     from './pages/Logistica.js';
import { Administracion } from './pages/Administracion.js';
import { Configuracion }  from './pages/Configuracion.js';
import { Contabilidad }   from './pages/Contabilidad.js';
import { Importador }     from './pages/Importador.js';
import { OrdenesCompra }  from './pages/OrdenesCompra.js';
import { Alertas }        from './pages/Alertas.js';

// ── Módulos en orden de preferencia para redirección inicial ──
const MODULE_ORDER = ['GERENCIA', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ALMACEN', 'ADMINISTRACION'];

const MODULE_TO_PAGE = {
  GERENCIA:       'dashboard',
  COMERCIAL:      'comercial',
  FINANZAS:       'finanzas',
  LOGISTICA:      'logistica',
  ALMACEN:        'inventario',
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
  usuarios:       Usuarios,
  compras:        Compras,
  comercial:      Comercial,
  'configuracion-comercial': ConfiguracionComercial,
  logistica:      Logistica,
  administracion: Administracion,
  servicios:      Servicios,
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
  window.location.replace('/login.html');
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
  if (page === 'usuarios' || page === 'configuracion' || page === 'importador') return false;
  if (page === 'contabilidad') return user.rol === 'CONTADOR';
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

async function navigate(page) {
  const user = getUser();
  if (!tieneAcceso(user, page)) {
    renderSidebar(page);
    document.getElementById('main-content').innerHTML = paginaAccesoRestringido(page);
    return;
  }

  currentPage = page;
  renderSidebar(page);
  history.pushState({ page }, '', `#${page}`);

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

async function init() {
  if (!localStorage.getItem('erp_token')) {
    window.location.replace('/login.html');
    return;
  }

  const user = getUser();

  // Shell estática con sidebar + main-content + hamburger mobile
  document.getElementById('root').innerHTML = `
    <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Menú">☰</button>
    <div class="mobile-overlay" id="mobile-overlay"></div>
    <div class="app-container">
      <aside class="sidebar" id="sidebar"></aside>
      <main class="main-content" id="main-content"></main>
    </div>
  `;

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

  // Navegación por hash (links internos tipo <a href="#pagina"> o window.location.hash=)
  window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '').trim();
    if (page) navigate(page);
  });

  // Página inicial
  const hashPage = window.location.hash.replace('#', '').trim();
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

  const destino = hashPage && PAGES[hashPage] ? hashPage : paginaInicio;
  navigate(destino);
}

document.addEventListener('DOMContentLoaded', init);

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

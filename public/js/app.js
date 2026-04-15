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
  if (page === 'usuarios') return false;
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

function init() {
  if (!localStorage.getItem('erp_token')) {
    window.location.replace('/login.html');
    return;
  }

  const user = getUser();

  // Shell estática con sidebar + main-content
  document.getElementById('root').innerHTML = `
    <div class="app-container">
      <aside class="sidebar" id="sidebar"></aside>
      <main class="main-content" id="main-content"></main>
    </div>
  `;

  // Delegación de eventos en sidebar
  document.getElementById('sidebar').addEventListener('click', (e) => {
    const item = e.target.closest('[data-page]');
    if (item) navigate(item.dataset.page);
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

  const destino = hashPage && PAGES[hashPage] ? hashPage : paginaInicio;
  navigate(destino);
}

document.addEventListener('DOMContentLoaded', init);

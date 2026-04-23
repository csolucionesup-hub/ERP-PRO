const MODULE_NAV = [
  { modulo: 'GERENCIA',       label: 'Dashboard',          page: 'dashboard'    },
  { modulo: 'COMERCIAL',      label: 'Comercial',          page: 'comercial'    },
  { modulo: 'FINANZAS',       label: 'Finanzas y Flujo',   page: 'finanzas'     },
  { modulo: 'LOGISTICA',      label: 'Logística',          page: 'logistica'    },
  { modulo: 'ALMACEN',        label: 'Inventario',         page: 'inventario'   },
  { modulo: 'ADMINISTRACION', label: 'Administración',     page: 'administracion' },
];

function getUser() {
  try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); }
  catch { return {}; }
}

export function renderSidebar(activePage) {
  const user = getUser();
  const esGerente = user.rol === 'GERENTE';
  const modulos = user.modulos || [];

  const navItems = MODULE_NAV
    .filter(item => esGerente || modulos.includes(item.modulo))
    .map(item => `
      <div class="nav-item ${activePage === item.page ? 'active' : ''}"
           data-page="${item.page}">
        ${item.label}
      </div>
    `).join('');

  const usuariosItem = esGerente ? `
    <div class="nav-item ${activePage === 'usuarios' ? 'active' : ''}"
         data-page="usuarios">
      Usuarios
    </div>
    <div class="nav-item ${activePage === 'configuracion' ? 'active' : ''}"
         data-page="configuracion">
      ⚙️ Configuración
    </div>
  ` : '';

  const rolLabel = esGerente ? 'Gerente' : (user.rol || 'Usuario');

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-logo">
      <img src="/img/logo-metal.png" alt="Metal Engineers"
           style="max-width: 180px; height: auto;" />
    </div>
    <nav class="sidebar-nav">
      ${navItems}
      ${usuariosItem}
    </nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <span class="user-name">${user.nombre || 'Usuario'}</span>
        <span class="user-role">${rolLabel}</span>
      </div>
      <button class="btn-logout" onclick="logout()">Cerrar sesión</button>
    </div>
  `;
}

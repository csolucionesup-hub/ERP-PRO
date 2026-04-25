const MODULE_NAV = [
  { modulo: 'GERENCIA',       label: 'Dashboard',          page: 'dashboard'    },
  { modulo: 'COMERCIAL',      label: 'Comercial',          page: 'comercial'    },
  { modulo: 'FINANZAS',       label: 'Finanzas y Flujo',   page: 'finanzas'     },
  { modulo: 'FINANZAS',       label: '💳 Préstamos',        page: 'prestamos'    },
  { modulo: 'LOGISTICA',      label: 'Logística',          page: 'logistica'    },
  // Proveedores y Órdenes de Compra ahora son sub-pestañas DENTRO de Logística (módulo unificado)
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

  const esContador = user.rol === 'CONTADOR';
  const verContabilidad = esGerente || esContador;

  const contabilidadItem = verContabilidad ? `
    <div class="nav-item ${activePage === 'contabilidad' ? 'active' : ''}"
         data-page="contabilidad">
      📘 Contabilidad
    </div>
  ` : '';

  const usuariosItem = esGerente ? `
    <div class="nav-item ${activePage === 'importador' ? 'active' : ''}"
         data-page="importador">
      📥 Importar Histórico
    </div>
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
      ${contabilidadItem}
      ${usuariosItem}
      <div class="nav-item" id="nav-alertas" onclick="window.toggleAlertas && window.toggleAlertas()" style="position:relative;cursor:pointer">
        🔔 Alertas
        <span id="badge-alertas" style="display:none;position:absolute;top:8px;right:14px;background:#dc2626;color:white;border-radius:10px;font-size:10px;font-weight:700;min-width:18px;height:18px;display:none;align-items:center;justify-content:center;padding:0 5px"></span>
      </div>
    </nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <span class="user-name">${user.nombre || 'Usuario'}</span>
        <span class="user-role">${rolLabel}</span>
      </div>
      <button class="btn-logout" onclick="logout()">Cerrar sesión</button>
    </div>
  `;
  // Cargar alertas asíncronamente
  setTimeout(() => loadAlertas(), 200);
}

let _alertasCache = [];
async function loadAlertas() {
  try {
    if (!window.api) {
      const mod = await import('../services/api.js');
      window.api = mod.api;
    }
    _alertasCache = await window.api.alertas.list();
    const badge = document.getElementById('badge-alertas');
    if (badge && _alertasCache.length > 0) {
      badge.textContent = _alertasCache.length > 9 ? '9+' : String(_alertasCache.length);
      badge.style.display = 'flex';
    }
  } catch (_) { /* silencioso */ }
}

window.toggleAlertas = () => {
  const existing = document.getElementById('alertas-panel');
  if (existing) { existing.remove(); return; }

  const sevColor = { info: '#0284c7', warn: '#d97706', danger: '#dc2626' };
  const sevBg    = { info: '#f0f9ff', warn: '#fef3c7', danger: '#fef2f2' };

  const items = _alertasCache.length === 0
    ? '<div style="padding:30px;text-align:center;color:var(--text-secondary);font-size:13px">✅ No hay alertas activas</div>'
    : _alertasCache.map(a => `
        <div onclick="window.location.hash='${a.link || ''}';document.getElementById('alertas-panel')?.remove()"
             style="padding:10px 12px;border-bottom:1px solid #e5e7eb;cursor:pointer;background:${sevBg[a.severidad] || '#f9fafb'};border-left:3px solid ${sevColor[a.severidad] || '#6b7280'}">
          <div style="font-size:13px;font-weight:600;color:#111">${a.titulo}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">${a.detalle}</div>
        </div>
      `).join('');

  const panel = document.createElement('div');
  panel.id = 'alertas-panel';
  panel.style.cssText = 'position:fixed;top:60px;left:200px;background:white;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);width:380px;max-height:480px;overflow-y:auto;z-index:1500;border:1px solid #e5e7eb';
  panel.innerHTML = `
    <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#fafafa">
      <strong style="font-size:13px">🔔 Alertas (${_alertasCache.length})</strong>
      <button onclick="document.getElementById('alertas-panel')?.remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#999">×</button>
    </div>
    ${items}
  `;
  document.body.appendChild(panel);
  // Cierra al hacer clic afuera
  setTimeout(() => {
    document.addEventListener('click', function once(e) {
      if (!panel.contains(e.target) && !document.getElementById('nav-alertas')?.contains(e.target)) {
        panel.remove();
        document.removeEventListener('click', once);
      }
    });
  }, 100);
};

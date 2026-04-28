/**
 * Sidebar.js — Enterprise edition (slate-950 + Lucide icons + sections + footer avatar)
 * Refactor del rediseño Enterprise (G5).
 * Mantiene compatibilidad con app.js: id="sidebar", data-page por item, mobile-open class.
 */

import { icon } from '../services/ui.js';

/* ─── Mapping pagina → icono Lucide del sprite /lib/icons.svg ─────── */
const ICON_MAP = {
  dashboard:      'layout-dashboard',
  comercial:      'clipboard-check',
  finanzas:       'dollar-sign',
  prestamos:      'credit-card',
  logistica:      'truck',
  inventario:     'archive',
  administracion: 'users',
  contabilidad:   'book-open',
  importador:     'download',
  usuarios:       'user',
  configuracion:  'settings',
  alertas:        'bell',
};

/* ─── Definición de items por sección ─────────────────────────────── */
const MODULE_NAV = [
  { modulo: 'GERENCIA',       label: 'Dashboard',        page: 'dashboard',     section: 'general' },
  { modulo: 'COMERCIAL',      label: 'Comercial',        page: 'comercial',     section: 'general' },
  { modulo: 'FINANZAS',       label: 'Finanzas y Flujo', page: 'finanzas',      section: 'operaciones' },
  { modulo: 'FINANZAS',       label: 'Préstamos',        page: 'prestamos',     section: 'operaciones' },
  { modulo: 'LOGISTICA',      label: 'Logística',        page: 'logistica',     section: 'operaciones' },
  { modulo: 'ALMACEN',        label: 'Inventario',       page: 'inventario',    section: 'operaciones' },
  { modulo: 'ADMINISTRACION', label: 'Administración',   page: 'administracion',section: 'operaciones' },
];

/* ─── Helpers ─────────────────────────────────────────────────────── */
function getUser() {
  try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); }
  catch { return {}; }
}

function navItem({ page, label, active }) {
  const ico = ICON_MAP[page] || 'layout-dashboard';
  return `
    <div class="app-nav-item ${active ? 'active' : ''}" data-page="${page}">
      ${icon(ico, { size: 17 })}
      <span>${label}</span>
    </div>
  `;
}

function section(title, htmlBody) {
  if (!htmlBody) return '';
  return `
    <div class="app-nav-section">
      <div class="app-nav-section-label">${title}</div>
      ${htmlBody}
    </div>
  `;
}

function getInitials(nombre) {
  const parts = String(nombre || 'U').trim().split(/\s+/);
  return (parts[0]?.[0] || 'U').toUpperCase() +
         (parts[1]?.[0] || '').toUpperCase();
}

/* ─── Render principal ────────────────────────────────────────────── */
export function renderSidebar(activePage) {
  const user      = getUser();
  const esGerente = user.rol === 'GERENTE';
  const modulos   = user.modulos || [];

  // Items accesibles según rol/módulos
  const accesibles = MODULE_NAV.filter(item => esGerente || modulos.includes(item.modulo));

  // Construir cada sección
  const generalHTML = accesibles
    .filter(i => i.section === 'general')
    .map(i => navItem({ page: i.page, label: i.label, active: activePage === i.page }))
    .join('');

  const operacionesHTML = accesibles
    .filter(i => i.section === 'operaciones')
    .map(i => navItem({ page: i.page, label: i.label, active: activePage === i.page }))
    .join('');

  // Sección Gestión: depende de flags granulares + rol GERENTE
  const verContabilidad = esGerente || !!user.puede_contabilidad;
  const verImportador   = esGerente || !!user.puede_importar;

  const gestionItems = [];
  if (verContabilidad) gestionItems.push({ page: 'contabilidad',  label: 'Contabilidad' });
  if (verImportador)   gestionItems.push({ page: 'importador',    label: 'Importar Histórico' });
  if (esGerente) {
    gestionItems.push({ page: 'usuarios',      label: 'Usuarios' });
    gestionItems.push({ page: 'configuracion', label: 'Configuración' });
  }
  const gestionHTML = gestionItems
    .map(i => navItem({ page: i.page, label: i.label, active: activePage === i.page }))
    .join('');

  // Alertas (sistema) — mantiene id="nav-alertas" y badge id="badge-alertas" por compat
  const alertasHTML = `
    <div class="app-nav-item ${activePage === 'alertas' ? 'active' : ''}"
         id="nav-alertas" data-page="alertas">
      ${icon('bell', { size: 17 })}
      <span>Alertas</span>
      <span id="badge-alertas" class="app-nav-item__badge"></span>
    </div>
  `;

  // Footer
  const initials = getInitials(user.nombre);
  const rolLabel = esGerente ? 'Gerente' : (user.rol || 'Usuario');

  document.getElementById('sidebar').innerHTML = `
    <div class="app-sidebar-brand">
      <img src="/img/logo-metal.png" alt="Metal Engineers" />
    </div>

    <nav class="app-nav">
      ${section('Visión general', generalHTML)}
      ${section('Operaciones',    operacionesHTML)}
      ${section('Gestión',        gestionHTML)}
      ${section('Sistema',        alertasHTML)}
    </nav>

    <div class="app-sidebar-footer">
      <div class="app-sidebar-user">
        <div class="app-sidebar-avatar" aria-hidden="true">${initials}</div>
        <div class="app-sidebar-user__info">
          <span class="app-sidebar-user__name">${user.nombre || 'Usuario'}</span>
          <span class="app-sidebar-user__role">${rolLabel}</span>
        </div>
      </div>
      <button class="app-sidebar-logout" onclick="logout()" type="button">
        ${icon('log-out', { size: 14 })}
        <span>Cerrar sesión</span>
      </button>
    </div>
  `;

  // Cargar alertas async
  setTimeout(() => loadAlertas(), 200);
}

/* ─── Alertas (sin cambios funcionales, solo CSS class para badge) ── */
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
      badge.classList.add('is-visible');
    }
  } catch (_) { /* silencioso */ }
}

window.toggleAlertas = () => {
  const existing = document.getElementById('alertas-panel');
  if (existing) { existing.remove(); return; }

  const sevColor = { info: '#0284c7', warn: '#d97706', danger: '#dc2626' };
  const sevBg    = { info: '#f0f9ff', warn: '#fef3c7', danger: '#fef2f2' };

  const items = _alertasCache.length === 0
    ? '<div style="padding:30px;text-align:center;color:var(--app-text-muted);font-size:13px">✅ No hay alertas activas</div>'
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
  setTimeout(() => {
    document.addEventListener('click', function once(e) {
      if (!panel.contains(e.target) && !document.getElementById('nav-alertas')?.contains(e.target)) {
        panel.remove();
        document.removeEventListener('click', once);
      }
    });
  }, 100);
};

/**
 * Logistica.js — Módulo 📦 Logística (v3: hub completo con todos los sub-recursos)
 *
 * 6 tabs: TODA la logística vive aquí. Sin links sueltos en el sidebar.
 *   🤝 Proveedores         — CRUD de proveedores (empresas + personas naturales)
 *   📋 Órdenes de Compra   — workflow completo (Borrador → Aprobada → ... → Pagada)
 *   🏢 Gastos Generales    — tipo_oc=GENERAL  (luz, agua, SUNAT, marketing, etc.)
 *   🔧 Gastos de Servicio  — tipo_oc=SERVICIO (vinculado a proyecto)
 *   📥 Compras Almacén     — tipo_oc=ALMACEN  (multi-línea con ítems)
 *   📊 Dashboard           — KPIs consolidados desde OrdenesCompra
 *
 * Cada OC creada:
 *   - Recibe correlativo "NNN - YYYY" secuencial por empresa (ME/PT)
 *   - Auto-aprueba si total ≤ umbral (configurable, default S/5000)
 *   - Genera PDF descargable con formato físico Metal Engineers
 */

import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';
import { lineChart, barChart, chartColors, destroyChart } from '../components/charts.js';
import { Proveedores } from './Proveedores.js';
import { OrdenesCompra } from './OrdenesCompra.js';

const fPEN = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0);
const fUSD = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);
const fmtDate = (d) => d ? String(d).split('T')[0] : '—';
const fmtMoney = (v, moneda) => moneda === 'USD' ? fUSD(v) : fPEN(v);

let _cfg = null;
let _servicios = [];
let _proveedores = [];
let _centrosCosto = [];
let _ocsGeneral = [];
let _ocsServicio = [];
let _ocsAlmacen = [];
let _chartInstances = {};

export const Logistica = async () => {
  try {
    [_cfg, _servicios, _proveedores, _centrosCosto, _ocsGeneral, _ocsServicio, _ocsAlmacen] = await Promise.all([
      api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000 })),
      api.services.getServiciosActivos().catch(() => []),
      api.purchases.getProveedores().catch(() => []),
      api.centrosCosto.list(true).catch(() => []),
      api.ordenesCompra.list({ tipo_oc: 'GENERAL' }).catch(() => []),
      api.ordenesCompra.list({ tipo_oc: 'SERVICIO' }).catch(() => []),
      api.ordenesCompra.list({ tipo_oc: 'ALMACEN' }).catch(() => []),
    ]);
  } catch (e) {
    console.error('[Logistica] error cargando:', e);
  }

  setTimeout(() => initTabs(), 60);

  return `
    <header class="header">
      <div>
        <h1>📦 Logística</h1>
        <span style="color:var(--text-secondary)">Hub de operaciones: proveedores, OCs, gastos por centro de costo. Todas las salidas generan OC formal.</span>
      </div>
    </header>
    <div id="logi-tabbar" style="margin-top:20px"></div>
    <div id="logi-panel-proveedores" class="logi-tab-content"></div>
    <div id="logi-panel-oc"            class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-centros"       class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-general"       class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-servicio"      class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-almacen"       class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-dash"          class="logi-tab-content" style="display:none"></div>
  `;
};

function initTabs() {
  TabBar({
    container: '#logi-tabbar',
    tabs: [
      { id: 'proveedores', label: `🤝 Proveedores`,         badge: _proveedores.length },
      { id: 'centros',     label: `🎯 Centros de Costo`,    badge: _centrosCosto.length },
      { id: 'oc',          label: `📋 Órdenes de Compra`,   badge: _ocsGeneral.length + _ocsServicio.length + _ocsAlmacen.length },
      { id: 'general',     label: `🏢 Gastos Generales`,    badge: _ocsGeneral.length },
      { id: 'servicio',    label: `🔧 Gastos de Servicio`,  badge: _ocsServicio.length },
      { id: 'almacen',     label: `📥 Compras Almacén`,     badge: _ocsAlmacen.length },
      { id: 'dash',        label: '📊 Dashboard' },
    ],
    defaultTab: 'proveedores',
    onChange: async (id) => {
      // Solo escondemos los paneles de Logística (no los de páginas anidadas)
      document.querySelectorAll('.logi-tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('logi-panel-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'proveedores' && !panel.dataset.rendered) await renderTabProveedores(panel);
      if (id === 'centros'     && !panel.dataset.rendered) await renderTabCentros(panel);
      if (id === 'oc'          && !panel.dataset.rendered) await renderTabOC(panel);
      if (id === 'general'     && !panel.dataset.rendered) renderTabGastos(panel, 'GENERAL');
      if (id === 'servicio'    && !panel.dataset.rendered) renderTabGastos(panel, 'SERVICIO');
      if (id === 'almacen'     && !panel.dataset.rendered) renderTabAlmacen(panel);
      if (id === 'dash')                                   renderDashboard(panel);
    },
  });

  window.Logistica = { descargarPDF, anularOC, editarCC, toggleCC, eliminarCC, descargarROC };
}

// ─── TAB Proveedores (delega a página Proveedores.js) ───────────────────
async function renderTabProveedores(panel) {
  panel.dataset.rendered = '1';
  panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Cargando proveedores…</div>';
  try {
    const html = await Proveedores();
    // Proveedores.js incluye su propio <header>. Lo quitamos al embeber en tab.
    panel.innerHTML = html.replace(/<header[\s\S]*?<\/header>/, '');
  } catch (e) {
    panel.innerHTML = `<div style="padding:40px;color:var(--danger)">Error: ${e.message}</div>`;
  }
}

// ─── TAB Órdenes de Compra (delega a página OrdenesCompra.js) ────────────
async function renderTabOC(panel) {
  panel.dataset.rendered = '1';
  panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Cargando OCs…</div>';
  try {
    const html = await OrdenesCompra();
    panel.innerHTML = html.replace(/<header[\s\S]*?<\/header>/, '');
  } catch (e) {
    panel.innerHTML = `<div style="padding:40px;color:var(--danger)">Error: ${e.message}</div>`;
  }
}

// ─── TAB Centros de Costo (CRUD + ROC) ─────────────────────────────────
async function renderTabCentros(panel) {
  panel.dataset.rendered = '1';
  panel.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-secondary)">Cargando…</div>';

  let resumen = [];
  try {
    resumen = await api.centrosCosto.resumen(new Date().getFullYear());
  } catch (e) {
    panel.innerHTML = `<div style="padding:30px;color:var(--danger)">Error: ${e.message}</div>`;
    return;
  }

  const tipos = ['OFICINA', 'PROYECTO', 'ALMACEN', 'OTRO'];
  const tipoColor = {
    OFICINA:  { bg: '#dbeafe', fg: '#1e40af', icon: '🏢' },
    PROYECTO: { bg: '#fef3c7', fg: '#92400e', icon: '🔧' },
    ALMACEN:  { bg: '#dcfce7', fg: '#166534', icon: '📦' },
    OTRO:     { bg: '#f3f4f6', fg: '#374151', icon: '📁' },
  };

  const rows = resumen.map(cc => {
    const c = tipoColor[cc.tipo] || tipoColor.OTRO;
    const monto = Number(cc.monto_total) || 0;
    return `
      <tr style="${!cc.activo ? 'opacity:0.5' : ''}">
        <td style="padding:8px"><span style="background:${c.bg};color:${c.fg};padding:3px 8px;border-radius:8px;font-size:11px;font-weight:600">${c.icon} ${cc.tipo}</span></td>
        <td style="padding:8px;font-weight:600">${cc.nombre}</td>
        <td style="padding:8px;text-align:right">${cc.cantidad_ocs || 0}</td>
        <td style="padding:8px;text-align:right;font-weight:700">${fPEN(monto)}</td>
        <td style="padding:8px;font-size:11px;color:var(--text-secondary)">${cc.ultima_fecha ? fmtDate(cc.ultima_fecha) : '—'}</td>
        <td style="padding:8px;text-align:center">${cc.activo ? '✅' : '❌'}</td>
        <td style="padding:8px;white-space:nowrap">
          <button onclick="Logistica.descargarROC('${cc.nombre.replace(/'/g, "\\'")}')" style="padding:4px 8px;font-size:11px;background:#065f46;color:white;border:none;border-radius:4px;cursor:pointer" title="Reporte semanal de OCs (Excel)">📊 ROC</button>
          <button onclick="Logistica.editarCC(${cc.id_centro_costo})" style="padding:4px 8px;font-size:11px;background:var(--info);color:white;border:none;border-radius:4px;cursor:pointer">Editar</button>
          <button onclick="Logistica.toggleCC(${cc.id_centro_costo}, ${cc.activo})" style="padding:4px 8px;font-size:11px;background:${cc.activo ? '#f59e0b' : '#16a34a'};color:white;border:none;border-radius:4px;cursor:pointer">${cc.activo ? 'Desactivar' : 'Activar'}</button>
          <button onclick="Logistica.eliminarCC(${cc.id_centro_costo}, '${cc.nombre.replace(/'/g, "\\'")}')" style="padding:4px 8px;font-size:11px;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer">×</button>
        </td>
      </tr>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-top:16px;align-items:start">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:15px">Centros de Costo registrados</h3>
          <span style="font-size:11px;color:var(--text-secondary)">${resumen.length} centro(s) · año ${new Date().getFullYear()}</span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#fafafa;border-bottom:2px solid #e5e7eb">
              <th style="padding:8px;text-align:left">Tipo</th>
              <th style="padding:8px;text-align:left">Nombre</th>
              <th style="padding:8px;text-align:right">OCs</th>
              <th style="padding:8px;text-align:right">Monto Total</th>
              <th style="padding:8px;text-align:left">Última OC</th>
              <th style="padding:8px;text-align:center">Activo</th>
              <th style="padding:8px;text-align:center">Acciones</th>
            </tr></thead>
            <tbody>
              ${rows || '<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--text-secondary)">Sin centros — crea uno con el form de la derecha</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 12px;font-size:15px">➕ Nuevo Centro de Costo</h3>
        <form id="form-cc-nuevo" style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Tipo *</label>
            <select name="tipo" required style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              ${tipos.map(t => `<option value="${t}">${tipoColor[t].icon} ${t}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Nombre *</label>
            <input name="nombre" required placeholder="Ej: FABRICACION AUGER PSV, OFICINA SUR" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            <span style="font-size:10px;color:var(--text-secondary)">Se guarda en MAYÚSCULAS para evitar duplicados</span>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Descripción (opcional)</label>
            <input name="descripcion" placeholder="Notas internas sobre el centro" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <button type="submit" style="padding:11px;border:none;background:var(--primary-color);color:white;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">
            ➕ Guardar
          </button>
        </form>
        <div style="margin-top:14px;padding:10px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;font-size:11px;color:#075985">
          💡 <strong>Tip:</strong> En cada OC, el campo "Centro de Costo" autocompleta desde esta lista.
          Si escribís un nombre nuevo, se crea automáticamente al guardar la OC.
        </div>
      </div>
    </div>
  `;

  // Form crear
  panel.querySelector('#form-cc-nuevo').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api.centrosCosto.create({
        nombre: f.nombre.value,
        tipo: f.tipo.value,
        descripcion: f.descripcion.value || undefined,
      });
      showSuccess('Centro de costo creado');
      window.navigate('logistica');
    } catch (err) {
      showError(err?.error || err?.message || 'Error al crear');
    }
  };
}

// ─── Window handlers Centros de Costo ─────────────────────────────────
async function editarCC(id) {
  let cc;
  try {
    const lista = await api.centrosCosto.list(false);
    cc = lista.find(c => c.id_centro_costo === id);
  } catch (e) { showError('No se pudo cargar'); return; }
  if (!cc) { showError('No encontrado'); return; }

  const tipos = ['OFICINA', 'PROYECTO', 'ALMACEN', 'OTRO'];
  const overlay = document.createElement('div');
  overlay.id = 'modal-edit-cc';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1500;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:white;border-radius:10px;padding:24px;width:420px;max-width:95vw">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0">Editar centro de costo</h3>
        <button onclick="document.getElementById('modal-edit-cc').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
      </div>
      <form id="form-edit-cc" style="display:flex;flex-direction:column;gap:10px">
        <select name="tipo" required style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px">
          ${tipos.map(t => `<option value="${t}" ${cc.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input name="nombre" value="${cc.nombre}" required style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px">
        <input name="descripcion" value="${cc.descripcion || ''}" placeholder="Descripción" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px">
        <button type="submit" style="padding:11px;background:var(--primary-color);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Guardar cambios</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('form-edit-cc').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api.centrosCosto.update(id, {
        nombre: f.nombre.value,
        tipo: f.tipo.value,
        descripcion: f.descripcion.value || null,
      });
      showSuccess('Actualizado');
      window.navigate('logistica');
    } catch (err) { showError(err?.error || 'Error'); }
  };
}

async function toggleCC(id, activo) {
  try {
    await api.centrosCosto.update(id, { activo: !activo });
    showSuccess(activo ? 'Desactivado' : 'Activado');
    window.navigate('logistica');
  } catch (e) { showError(e?.error || 'Error'); }
}

async function eliminarCC(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"?\n\nSi tiene OCs asociadas se desactivará en lugar de borrarse.`)) return;
  try {
    const r = await api.centrosCosto.remove(id);
    showSuccess(r.desactivado ? `Desactivado (tiene ${r.registros_asociados} OCs asociadas)` : 'Eliminado');
    window.navigate('logistica');
  } catch (e) { showError(e?.error || 'Error'); }
}

async function descargarROC(centroNombre) {
  const anio = new Date().getFullYear();
  const semana = prompt(`ROC Semanal — ${centroNombre}\n\nNº de semana del año (1-52, vacío = semana actual):`);
  if (semana === null) return; // canceló
  try {
    await api.ordenesCompra.descargarROC({ centro_costo: centroNombre, anio, semana: semana || undefined });
    showSuccess('ROC descargado');
  } catch (e) { showError(e?.message || 'Error generando ROC'); }
}

// ─── TAB Gastos Generales / Servicios (ambos comparten layout multi-línea) ──
function renderTabGastos(panel, tipoOC) {
  panel.dataset.rendered = '1';
  const esServicio = tipoOC === 'SERVICIO';
  const ocs = esServicio ? _ocsServicio : _ocsGeneral;
  const total = ocs.reduce((s, o) => s + Number(o.total || 0), 0);

  const tituloPanel = esServicio
    ? 'Gastos vinculados a Servicios / Proyectos'
    : 'Gastos Generales — Oficina, Marketing, SUNAT, Servicios públicos';

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:16px;align-items:start">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:15px">${tituloPanel}</h3>
          <span style="font-size:11px;color:var(--text-secondary)">${ocs.length} OC(s) · ${fPEN(total)}</span>
        </div>
        ${ocs.length ? renderTablaOCs(ocs, { mostrarServicio: esServicio }) : emptyState(
          esServicio ? 'Sin gastos de servicio todavía' : 'Sin gastos generales registrados',
          'Cada OC que crees aparece aquí con su PDF descargable.'
        )}
      </div>
      ${renderFormOC(tipoOC)}
    </div>
  `;

  bindFormOCMulti(panel, tipoOC);
}

// ─── TAB Compras Almacén (usa el mismo form unificado) ──────────────────
function renderTabAlmacen(panel) {
  panel.dataset.rendered = '1';
  const ocs = _ocsAlmacen;
  const total = ocs.reduce((s, o) => s + Number(o.total || 0), 0);

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:16px;align-items:start">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:15px">Compras de Almacén</h3>
          <span style="font-size:11px;color:var(--text-secondary)">${ocs.length} OC(s) · ${fPEN(total)}</span>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;padding:10px;background:#f9fafb;border-radius:6px">
          📦 Los ítems aparecen en <a href="#inventario" style="color:var(--primary-color);font-weight:600">Inventario</a> cuando marques la OC como <strong>Recibida</strong>.
        </p>
        ${ocs.length ? renderTablaOCs(ocs, { mostrarAlmacen: true }) : emptyState(
          'Sin compras de almacén',
          'Registrá una OC con ítems y cantidades.'
        )}
      </div>
      ${renderFormOC('ALMACEN')}
    </div>
  `;

  bindFormOCMulti(panel, 'ALMACEN');
}

// ─── TAB Dashboard ──────────────────────────────────────────────────────
function renderDashboard(panel) {
  Object.values(_chartInstances).forEach(destroyChart);
  _chartInstances = {};

  const totalGen  = _ocsGeneral.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalSrv  = _ocsServicio.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalAlm  = _ocsAlmacen.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalAll  = totalGen + totalSrv + totalAlm;
  const pendientes = [..._ocsGeneral, ..._ocsServicio, ..._ocsAlmacen].filter(o => o.estado !== 'PAGADA' && o.estado !== 'ANULADA').length;

  panel.innerHTML = `
    <div style="margin-top:16px">
      ${kpiGrid([
        { label: 'OCs Generales',   value: fPEN(totalGen), change: `${_ocsGeneral.length} OC(s)`,  changeType: 'neutral', icon: 'briefcase', accent: 'info' },
        { label: 'OCs Servicio',    value: fPEN(totalSrv), change: `${_ocsServicio.length} OC(s)`, changeType: 'neutral', icon: 'truck',     accent: 'warning' },
        { label: 'OCs Almacén',     value: fPEN(totalAlm), change: `${_ocsAlmacen.length} OC(s)`,  changeType: 'neutral', icon: 'archive',   accent: 'success' },
        { label: 'Total histórico', value: fPEN(totalAll), change: `${pendientes} pendientes`,     changeType: 'neutral', icon: 'bar-chart', accent: 'primary' },
      ], 4)}
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 14px;font-size:15px">Tendencia últimos 12 meses</h3>
      <canvas id="ch-trend" style="max-height:280px"></canvas>
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 14px;font-size:15px">Top 8 centros de costo</h3>
      <canvas id="ch-cc" style="max-height:280px"></canvas>
    </div>
  `;

  setTimeout(() => {
    const allOCs = [..._ocsGeneral, ..._ocsServicio, ..._ocsAlmacen];
    const trend = buildMonthlyTrend(allOCs);
    _chartInstances.trend = lineChart('#ch-trend', trend, { label: 'Total OCs', currency: true });
    const byCC = buildByCentroCosto(allOCs).map(x => ({ label: x.cc, valor: x.valor }));
    _chartInstances.cc = barChart('#ch-cc', byCC, { label: 'S/' });
  }, 50);
}

function buildMonthlyTrend(ocs) {
  const now = new Date();
  const buckets = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = d.toISOString().slice(0, 7);
    buckets[k] = 0;
  }
  ocs.forEach(o => {
    const k = String(o.fecha_emision || '').slice(0, 7);
    if (k in buckets) buckets[k] += Number(o.total || 0);
  });
  return Object.entries(buckets).map(([k, v]) => {
    const [y, m] = k.split('-');
    return { mes: `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][+m-1]} ${y.slice(2)}`, valor: v };
  });
}

function buildByCentroCosto(ocs) {
  const map = {};
  ocs.forEach(o => {
    const cc = o.centro_costo || '—';
    map[cc] = (map[cc] || 0) + Number(o.total || 0);
  });
  return Object.entries(map)
    .map(([cc, valor]) => ({ cc, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);
}

// ─── Tabla de OCs compartida ────────────────────────────────────────────
function renderTablaOCs(ocs, opts = {}) {
  return `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
            <th style="padding:10px;text-align:left">N° OC</th>
            <th style="padding:10px;text-align:left">Fecha</th>
            <th style="padding:10px;text-align:left">Proveedor</th>
            ${opts.mostrarServicio ? '<th style="padding:10px;text-align:left">Proyecto</th>' : ''}
            <th style="padding:10px;text-align:left">CC</th>
            <th style="padding:10px;text-align:right">Total</th>
            <th style="padding:10px;text-align:center">Estado</th>
            <th style="padding:10px;text-align:center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${ocs.map(o => `
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px;font-weight:600">${o.nro_oc || '—'}</td>
              <td style="padding:8px">${fmtDate(o.fecha_emision)}</td>
              <td style="padding:8px">${o.proveedor_nombre || '—'}</td>
              ${opts.mostrarServicio ? `<td style="padding:8px;font-size:11px">${o.servicio_codigo || '—'}</td>` : ''}
              <td style="padding:8px"><span style="font-size:10px;background:#e5e7eb;padding:2px 6px;border-radius:4px">${o.centro_costo || '—'}</span></td>
              <td style="padding:8px;text-align:right;font-weight:700">${fmtMoney(o.total, o.moneda)}</td>
              <td style="padding:8px;text-align:center">${estadoBadgeOC(o.estado)}</td>
              <td style="padding:8px;text-align:center;white-space:nowrap">
                <button onclick="window.previewPDFOC(${o.id_oc}, '${String(o.nro_oc).replace(/'/g, "\\'")}')" style="padding:3px 8px;border:1px solid #d1d5db;background:transparent;color:#374151;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">👁️ Ver</button>
                <button onclick="Logistica.descargarPDF(${o.id_oc})" style="padding:3px 8px;border:1px solid var(--primary-color);background:transparent;color:var(--primary-color);border-radius:4px;cursor:pointer;font-size:11px">📄 PDF</button>
                ${o.estado !== 'ANULADA' && o.estado !== 'PAGADA' ? `<button onclick="Logistica.anularOC(${o.id_oc})" style="padding:3px 8px;border:1px solid #dc2626;background:transparent;color:#dc2626;border-radius:4px;cursor:pointer;font-size:11px;margin-left:4px">✕</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function estadoBadgeOC(estado) {
  const styles = {
    BORRADOR:         { bg: '#fef3c7', fg: '#92400e' },
    APROBADA:         { bg: '#dbeafe', fg: '#1e40af' },
    ENVIADA:          { bg: '#c7d2fe', fg: '#3730a3' },
    RECIBIDA:         { bg: '#ccfbf1', fg: '#115e59' },
    RECIBIDA_PARCIAL: { bg: '#fef9c3', fg: '#713f12' },
    FACTURADA:        { bg: '#bbf7d0', fg: '#166534' },
    PAGADA:           { bg: '#dcfce7', fg: '#166534' },
    ANULADA:          { bg: '#e5e7eb', fg: '#374151' },
  };
  const s = styles[estado] || styles.BORRADOR;
  return `<span style="background:${s.bg};color:${s.fg};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${estado || 'BORRADOR'}</span>`;
}

function emptyState(titulo, subtitulo = '') {
  return `<div style="padding:40px;text-align:center;color:var(--text-secondary)">
    <div style="font-size:32px;margin-bottom:10px">📋</div>
    <div style="font-size:14px;font-weight:600;color:#555">${titulo}</div>
    ${subtitulo ? `<div style="font-size:12px;margin-top:6px">${subtitulo}</div>` : ''}
  </div>`;
}

// ─── Form unificado: replica formato físico de OC Metal Engineers ───────
// Multi-línea + sub-descripción + auto-fill datos del proveedor + totales en vivo

function renderFormOC(tipoOC) {
  const esServicio = tipoOC === 'SERVICIO';
  const esAlmacen  = tipoOC === 'ALMACEN';
  const esGeneral  = tipoOC === 'GENERAL';
  const hoy = new Date().toISOString().slice(0, 10);
  const formId = `form-oc-${tipoOC.toLowerCase()}`;
  const igvDefault = !esServicio && _cfg?.aplica_igv;

  const provOpts = _proveedores.map(p => {
    const doc = p.ruc || p.dni || '';
    return `<option value="${p.id_proveedor}">${p.razon_social}${doc ? ' · ' + doc : ''}</option>`;
  }).join('');
  const servOpts = _servicios.map(s =>
    `<option value="${s.id_servicio}">${s.nro_servicio || ('SRV-' + s.id_servicio)} · ${s.cliente || s.descripcion || '—'}</option>`
  ).join('');

  const titulo = esServicio ? 'Nueva OC de Servicio'
              : esAlmacen  ? 'Nueva OC Almacén'
              : 'Nueva OC General';
  const ccDefault = esAlmacen ? 'ALMACEN METAL' : esServicio ? '' : 'OFICINA CENTRAL';
  const undDefault = esAlmacen ? 'NIU' : esServicio ? 'DIAS' : 'UND';
  const formaPagoDefault = esAlmacen ? 'CREDITO' : 'CONTADO';
  const ayuda = esServicio
    ? 'Honorarios persona natural (con DNI) NO llevan IGV. Vinculado al proyecto.'
    : 'Cada gasto genera OC con correlativo (NNN-YYYY-CC) y PDF formal.'
      + ` Auto-aprueba si total ≤ S/ ${_cfg?.monto_limite_sin_aprobacion || 5000}.`;

  return `
    <div class="card">
      <h3 style="margin-bottom:6px;font-size:15px">➕ ${titulo}</h3>
      <p style="font-size:11px;color:var(--text-secondary);margin-bottom:12px">${ayuda}</p>
      <form id="${formId}" data-tipo-oc="${tipoOC}" style="display:flex;flex-direction:column;gap:10px">
        <input type="hidden" name="tipo_oc" value="${tipoOC}">

        ${esServicio ? `
        <div>
          <label>Servicio / Proyecto *</label>
          <select name="id_servicio" required>
            <option value="">— Selecciona proyecto —</option>
            ${servOpts || '<option value="" disabled>Sin servicios activos</option>'}
          </select>
        </div>` : ''}

        <div>
          <label>Proveedor * ${_proveedores.length === 0 ? '<span style="color:#e65100">(crea uno en pestaña Proveedores)</span>' : ''}</label>
          <select name="id_proveedor" required>
            <option value="">— Selecciona proveedor —</option>
            ${provOpts}
          </select>
        </div>

        <div id="prov-info-${tipoOC}" style="display:none;font-size:11px;background:#f9fafb;border-radius:6px;padding:8px;line-height:1.5">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label>Atención</label><input name="atencion" placeholder="Persona contacto"></div>
          <div><label>Lugar entrega</label><input name="lugar_entrega" value="Lima"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label>Centro de Costo *</label>
            <input name="centro_costo" list="cc-list-${tipoOC}" value="${ccDefault}" placeholder="${esServicio ? 'Auto-rellena con proyecto' : 'OFICINA CENTRAL, MARKETING…'}" required autocomplete="off">
            <datalist id="cc-list-${tipoOC}">
              ${_centrosCosto.filter(c => c.activo !== false).map(c => `<option value="${c.nombre}">${c.tipo}</option>`).join('')}
            </datalist>
            <span style="font-size:10px;color:var(--text-secondary)">↳ Si escribís un nuevo nombre, se crea al guardar la OC</span>
          </div>
          <div><label>Fecha emisión *</label><input type="date" name="fecha_emision" value="${hoy}" required></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div><label>Empresa</label>
            <select name="empresa">
              <option value="ME">Metal Engineers (PEN)</option>
              <option value="PT">Perfotools (USD)</option>
            </select>
          </div>
          <div><label>Moneda</label>
            <select name="moneda"><option value="PEN">PEN</option><option value="USD">USD</option></select>
          </div>
          <div><label>TC</label><input type="number" step="0.0001" name="tipo_cambio" value="1.0000"></div>
        </div>

        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:13px">Items / Líneas *</strong>
            <button type="button" class="btn-add-linea" style="padding:4px 10px;font-size:11px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer">+ línea</button>
          </div>
          <div class="lineas-wrap" data-und-default="${undDefault}"></div>
        </div>

        <label style="display:flex;gap:6px;align-items:center;font-size:12px">
          <input type="checkbox" name="aplica_igv" ${igvDefault ? 'checked' : ''}>
          Aplica IGV 18%${esServicio ? ' (desmarcar si es RH persona natural)' : ''}
        </label>

        <div style="background:#f9fafb;padding:10px;border-radius:6px;font-size:13px">
          <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><strong class="t-subtotal">S/ 0.00</strong></div>
          <div style="display:flex;justify-content:space-between"><span>IGV 18%:</span><strong class="t-igv" style="color:var(--text-secondary)">S/ 0.00</strong></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;margin-top:4px;padding-top:4px"><span>Total:</span><strong class="t-total" style="font-size:15px">S/ 0.00</strong></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label>Forma de pago</label>
            <select name="forma_pago">
              <option value="CONTADO" ${formaPagoDefault === 'CONTADO' ? 'selected' : ''}>Contado</option>
              <option value="CREDITO" ${formaPagoDefault === 'CREDITO' ? 'selected' : ''}>Crédito</option>
            </select>
          </div>
          <div class="dc-wrap" style="display:none">
            <label>Días crédito</label>
            <input type="number" name="dias_credito" value="0" min="0">
          </div>
        </div>

        <div>
          <label>Observaciones / Forma pago detalle</label>
          <input name="observaciones" placeholder="Ej: Banca Móvil — Pago servicio · Depósito a CCI · NPS SUNAT 0004…">
        </div>

        <button type="submit" style="padding:12px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px">
          ✅ Crear OC + generar PDF
        </button>
      </form>
    </div>
  `;
}

function bindFormOCMulti(panel, tipoOC) {
  const form = panel.querySelector(`#form-oc-${tipoOC.toLowerCase()}`);
  if (!form) return;

  const lineasWrap   = form.querySelector('.lineas-wrap');
  const undDefault   = lineasWrap.dataset.undDefault || 'UND';
  const btnAddLinea  = form.querySelector('.btn-add-linea');
  const provInfoDiv  = form.querySelector(`#prov-info-${tipoOC}`);
  const provSelect   = form.querySelector('[name=id_proveedor]');
  const servSelect   = form.querySelector('[name=id_servicio]');
  const ccInput      = form.querySelector('[name=centro_costo]');
  const igvCheckbox  = form.querySelector('[name=aplica_igv]');
  const formaPagoSel = form.querySelector('[name=forma_pago]');
  const dcWrap       = form.querySelector('.dc-wrap');
  const tSubtotal    = form.querySelector('.t-subtotal');
  const tIGV         = form.querySelector('.t-igv');
  const tTotal       = form.querySelector('.t-total');

  // ── Crear una nueva línea ──
  function addLinea(data = {}) {
    const idx = lineasWrap.children.length + 1;
    const row = document.createElement('div');
    row.className = 'linea';
    row.style.cssText = 'display:grid;grid-template-columns:32px 2fr 60px 70px 90px 80px 24px;gap:4px;align-items:start;margin-bottom:6px;font-size:12px';
    row.innerHTML = `
      <div style="text-align:center;padding-top:8px;color:var(--text-secondary)">${idx}</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <input class="l-desc" placeholder="Descripción del ítem (ej: SOLDADURA 7018 1/8)" required style="width:100%;font-size:12px;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px">
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:10px;color:var(--text-secondary);padding:0 2px">↳</span>
          <input class="l-subdesc" placeholder="Sub-descripción opcional (ej: REEMBOLSO JULIO, SUMINISTRO 3239076)" style="flex:1;font-size:11px;padding:5px 8px;border:1px dashed #d1d5db;border-radius:4px;background:#fafafa;color:#555">
        </div>
      </div>
      <input class="l-und" value="${data.unidad || undDefault}" style="font-size:12px;text-align:center;padding:6px;border:1px solid #d1d5db;border-radius:4px">
      <input class="l-cant" type="number" step="0.01" min="0.01" value="${data.cantidad || 1}" required style="font-size:12px;text-align:right;padding:6px;border:1px solid #d1d5db;border-radius:4px">
      <input class="l-pu" type="number" step="0.01" min="0" placeholder="P/U" required style="font-size:12px;text-align:right;padding:6px;border:1px solid #d1d5db;border-radius:4px">
      <span class="l-total" style="text-align:right;font-weight:600;padding-top:8px">S/ 0.00</span>
      <button type="button" class="l-del" style="color:#dc2626;background:transparent;border:none;cursor:pointer;padding-top:6px;font-size:14px">✕</button>
    `;
    lineasWrap.appendChild(row);
    row.querySelectorAll('input').forEach(i => i.addEventListener('input', recalc));
    row.querySelector('.l-del').onclick = () => { row.remove(); renumber(); recalc(); };
    recalc();
  }

  function renumber() {
    [...lineasWrap.children].forEach((row, i) => {
      const n = row.querySelector(':scope > div:first-child');
      if (n) n.textContent = String(i + 1);
    });
  }

  function recalc() {
    let subtotal = 0;
    [...lineasWrap.children].forEach(row => {
      const cant = Number(row.querySelector('.l-cant')?.value) || 0;
      const pu   = Number(row.querySelector('.l-pu')?.value) || 0;
      const sub  = cant * pu;
      const lt = row.querySelector('.l-total');
      if (lt) lt.textContent = fPEN(sub);
      subtotal += sub;
    });
    const aplica = igvCheckbox.checked;
    const igv = aplica ? subtotal * 0.18 : 0;
    const total = subtotal + igv;
    tSubtotal.textContent = fPEN(subtotal);
    tIGV.textContent = fPEN(igv);
    tTotal.textContent = fPEN(total);
  }

  btnAddLinea.onclick = () => addLinea();
  igvCheckbox.onchange = recalc;

  // ── Auto-fill datos del proveedor al elegirlo ──
  provSelect.onchange = () => {
    const p = _proveedores.find(x => String(x.id_proveedor) === provSelect.value);
    if (!p) { provInfoDiv.style.display = 'none'; return; }
    const cuenta = p.banco_1_nombre
      ? `${p.banco_1_nombre} ${p.banco_1_numero || ''}${p.banco_1_cci ? ' · CCI ' + p.banco_1_cci : ''}`
      : '';
    const cuenta2 = p.banco_2_nombre
      ? `<br>${p.banco_2_nombre} ${p.banco_2_numero || ''}${p.banco_2_cci ? ' · CCI ' + p.banco_2_cci : ''}`
      : '';
    provInfoDiv.innerHTML = `
      <div>📞 <strong>${p.telefono || '—'}</strong>  📧 ${p.email || '—'}</div>
      ${p.contacto ? `<div>👤 Contacto: ${p.contacto}</div>` : ''}
      ${cuenta ? `<div>🏦 ${cuenta}${cuenta2}</div>` : '<div style="color:#e65100">⚠️ Sin cuenta bancaria registrada — agregar en Proveedores</div>'}
    `;
    provInfoDiv.style.display = 'block';
    // Auto-rellenar atención
    const atInput = form.querySelector('[name=atencion]');
    if (atInput && !atInput.value && p.contacto) atInput.value = p.contacto;
  };

  // ── Auto-fill centro costo al elegir servicio ──
  if (servSelect) {
    servSelect.onchange = () => {
      const s = _servicios.find(x => String(x.id_servicio) === servSelect.value);
      if (s && ccInput) ccInput.value = (s.cliente || ('PROYECTO-' + s.id_servicio)).toUpperCase();
    };
  }

  // ── Show/hide días crédito según forma pago ──
  formaPagoSel.onchange = () => {
    dcWrap.style.display = formaPagoSel.value === 'CREDITO' ? 'block' : 'none';
  };
  formaPagoSel.dispatchEvent(new Event('change'));

  // ── Línea inicial ──
  addLinea();

  // ── Submit ──
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    // Construir líneas
    const lineas = [];
    [...lineasWrap.children].forEach(row => {
      const desc = row.querySelector('.l-desc')?.value.trim();
      const subdesc = row.querySelector('.l-subdesc')?.value.trim();
      const und = row.querySelector('.l-und')?.value.trim() || 'UND';
      const cant = Number(row.querySelector('.l-cant')?.value) || 0;
      const pu = Number(row.querySelector('.l-pu')?.value) || 0;
      if (!desc || cant <= 0 || pu < 0) return;
      const descCompleta = subdesc ? `${desc}\n${subdesc}` : desc;
      lineas.push({
        descripcion: descCompleta,
        unidad: und,
        cantidad: cant,
        precio_unitario: pu,
      });
    });
    if (lineas.length === 0) { showError('Agregá al menos un ítem con descripción y precio'); return; }

    const payload = {
      tipo_oc:        fd.get('tipo_oc'),
      empresa:        fd.get('empresa') || 'ME',
      fecha_emision:  fd.get('fecha_emision'),
      id_proveedor:   Number(fd.get('id_proveedor')),
      id_servicio:    fd.get('id_servicio') ? Number(fd.get('id_servicio')) : null,
      centro_costo:   fd.get('centro_costo'),
      moneda:         fd.get('moneda') || 'PEN',
      tipo_cambio:    Number(fd.get('tipo_cambio')) || 1,
      aplica_igv:     fd.get('aplica_igv') === 'on',
      forma_pago:     fd.get('forma_pago') || 'CONTADO',
      dias_credito:   Number(fd.get('dias_credito')) || 0,
      atencion:       fd.get('atencion') || null,
      lugar_entrega:  fd.get('lugar_entrega') || 'Lima',
      observaciones:  fd.get('observaciones') || null,
      lineas,
    };

    const btn = form.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando OC…'; }

    // Auto-crear centro de costo si es nuevo (no existe en _centrosCosto)
    const ccNombre = (payload.centro_costo || '').trim().toUpperCase();
    const ccExiste = _centrosCosto.some(c => c.nombre.toUpperCase() === ccNombre);
    if (ccNombre && !ccExiste) {
      // Inferir tipo según contexto
      const tipoCC = tipoOC === 'ALMACEN' ? 'ALMACEN' : tipoOC === 'SERVICIO' ? 'PROYECTO' : 'OFICINA';
      try {
        await api.centrosCosto.create({ nombre: ccNombre, tipo: tipoCC, descripcion: `Auto-creado desde OC ${tipoOC}` });
      } catch (_) { /* si falla por race condition, lo ignoramos */ }
    }
    payload.centro_costo = ccNombre;

    try {
      const r = await api.ordenesCompra.create(payload);
      showSuccess(`OC ${r.nro_oc} creada (${r.estado}) — abriendo PDF...`);
      setTimeout(() => api.ordenesCompra.descargarPDF(r.id_oc).catch(() => {}), 400);
      setTimeout(() => location.reload(), 1800);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Crear OC + generar PDF'; }
      showError(err?.error || err?.message || 'Error al crear OC');
    }
  };
}

// ─── Window handlers ────────────────────────────────────────────────────

async function descargarPDF(id_oc) {
  try {
    await api.ordenesCompra.descargarPDF(id_oc);
  } catch (err) {
    showError(err?.message || 'Error descargando PDF');
  }
}

async function anularOC(id_oc) {
  const motivo = prompt('Motivo de anulación (obligatorio):');
  if (!motivo || !motivo.trim()) return;
  try {
    await api.ordenesCompra.anular(id_oc, motivo.trim());
    showSuccess('OC anulada');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    showError(err?.error || err?.message || 'Error anulando OC');
  }
}

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
let _proyectos = []; // cotizaciones APROBADAS/TERMINADAS/TRABAJO_EN_RIESGO (Camino A)
let _proveedores = [];
let _ocsSinFactura = []; // OCs cerradas sin factura — bandeja para asociar factura tardía
let _centrosCosto = [];
let _ocsGeneral = [];
let _ocsServicio = [];
let _ocsAlmacen = [];
let _chartInstances = {};

export const Logistica = async () => {
  try {
    [_cfg, _servicios, _proveedores, _centrosCosto, _ocsGeneral, _ocsServicio, _ocsAlmacen, _proyectos, _ocsSinFactura] = await Promise.all([
      api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000 })),
      api.services.getServiciosActivos().catch(() => []),
      api.purchases.getProveedores().catch(() => []),
      api.centrosCosto.list(true).catch(() => []),
      api.ordenesCompra.list({ tipo_oc: 'GENERAL' }).catch(() => []),
      api.ordenesCompra.list({ tipo_oc: 'SERVICIO' }).catch(() => []),
      api.ordenesCompra.list({ tipo_oc: 'ALMACEN' }).catch(() => []),
      api.cotizaciones.proyectosActivos({ todos: true }).catch(() => []),
      api.ordenesCompra.list({ estado: 'CERRADA_SIN_FACTURA' }).catch(() => []),
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
    <div id="logi-tabbar" style="margin-top:20px;position:sticky;top:0;z-index:10;background:var(--app-bg);padding-top:8px"></div>
    <div id="logi-panel-proveedores" class="logi-tab-content"></div>
    <div id="logi-panel-oc"            class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-centros"       class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-general"       class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-servicio"      class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-almacen"       class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-sin-factura"   class="logi-tab-content" style="display:none"></div>
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
      { id: 'sin-factura', label: `🗂 Sin facturar`,        badge: _ocsSinFactura.length },
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
      if (id === 'sin-factura' && !panel.dataset.rendered) renderTabSinFactura(panel);
      // (no await — renderTabSinFactura ya no es async, window.OC se inicializa al import)
      if (id === 'dash')                                   renderDashboard(panel);
    },
  });

  window.Logistica = { descargarPDF, anularOC, reactivarOC, editarCC, toggleCC, eliminarCC, descargarROC, verROC };
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
          <button onclick="Logistica.verROC('${cc.nombre.replace(/'/g, "\\'")}')" style="padding:4px 8px;font-size:11px;background:#fff;border:1px solid #065f46;color:#065f46;border-radius:4px;cursor:pointer" title="Vista previa del ROC en pantalla (sin descargar)" aria-label="Ver ROC">👁 Ver</button>
          <button onclick="Logistica.descargarROC('${cc.nombre.replace(/'/g, "\\'")}')" style="padding:4px 8px;font-size:11px;background:#065f46;color:white;border:none;border-radius:4px;cursor:pointer" title="Reporte semanal de OCs (Excel)">📊 ROC</button>
          <button onclick="Logistica.editarCC(${cc.id_centro_costo})" title="Editar nombre y datos del centro de costo" style="padding:4px 8px;font-size:11px;background:var(--info);color:white;border:none;border-radius:4px;cursor:pointer">Editar</button>
          <button onclick="Logistica.toggleCC(${cc.id_centro_costo}, ${cc.activo})" title="${cc.activo ? 'Desactivar (no aparece como opción en formularios pero sigue vinculado a OCs/gastos históricos)' : 'Reactivar para volver a usar en nuevos formularios'}" style="padding:4px 8px;font-size:11px;background:${cc.activo ? '#f59e0b' : '#16a34a'};color:white;border:none;border-radius:4px;cursor:pointer">${cc.activo ? 'Desactivar' : 'Activar'}</button>
          <button onclick="Logistica.eliminarCC(${cc.id_centro_costo}, '${cc.nombre.replace(/'/g, "\\'")}')" title="Eliminar permanente (solo si no tiene OCs/gastos asociados)" aria-label="Eliminar centro de costo" style="padding:4px 8px;font-size:11px;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer">×</button>
        </td>
      </tr>`;
  }).join('');

  panel.innerHTML = `
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <h3 style="margin:0;font-size:15px">Centros de Costo registrados</h3>
        <span style="font-size:11px;color:var(--text-secondary)">${resumen.length} centro(s) · año ${new Date().getFullYear()}</span>
      </div>
      <button id="btn-cc-nuevo" type="button" title="Crear un nuevo centro de costo (oficina, proyecto, almacén)." style="padding:8px 14px;background:#7c3aed;color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">➕ Nuevo Centro de Costo</button>
    </div>
    <div class="card">
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
            ${rows || '<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--text-secondary)">Sin centros — usá el botón "➕ Nuevo Centro de Costo" arriba.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div style="margin-top:14px;padding:10px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;font-size:11px;color:#075985">
      💡 <strong>Tip:</strong> En cada OC, el campo "Centro de Costo" autocompleta desde esta lista.
      Si escribís un nombre nuevo, se crea automáticamente al guardar la OC.
    </div>
  `;

  // Botón "+ Nuevo Centro de Costo" — abre form en modal
  panel.querySelector('#btn-cc-nuevo').onclick = () => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1500;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:white;border-radius:10px;padding:24px;width:440px;max-width:95vw">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:15px;font-weight:700">➕ Nuevo Centro de Costo</h3>
          <button data-close type="button" title="Cerrar sin guardar" aria-label="Cerrar" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
        </div>
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
          <button type="submit" style="padding:11px;border:none;background:var(--primary-color);color:white;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">➕ Guardar</button>
        </form>
      </div>
    `;
    document.body.appendChild(ov);
    ov.querySelector('[data-close]').onclick = () => ov.remove();
    ov.querySelector('#form-cc-nuevo').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api.centrosCosto.create({
          nombre: f.nombre.value,
          tipo: f.tipo.value,
          descripcion: f.descripcion.value || undefined,
        });
        showSuccess('Centro de costo creado');
        ov.remove();
        window.navigate('logistica');
      } catch (err) {
        showError(err?.error || err?.message || 'Error al crear');
      }
    };
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
        <button onclick="document.getElementById('modal-edit-cc').remove()" title="Cerrar sin guardar cambios" aria-label="Cerrar" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
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

function semanaISOActual() {
  const hoy = new Date();
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const diaSem = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSem);
  const anioIni = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - anioIni.getTime()) / 86400000) + 1) / 7);
}

async function descargarROC(centroNombre) {
  const anioActual = new Date().getFullYear();
  const semanaHoy = semanaISOActual();

  const overlay = document.createElement('div');
  overlay.id = 'modal-roc';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1500;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:white;border-radius:10px;padding:24px;width:460px;max-width:95vw">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;font-size:16px">📊 ROC Semanal — ${centroNombre}</h3>
        <button id="roc-close" title="Cerrar sin descargar" aria-label="Cerrar" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
      </div>
      <p style="margin:0 0 14px 0;font-size:12px;color:#6b7280;line-height:1.5">
        Genera un Excel con todas las OCs del centro <b>acumuladas hasta la semana indicada</b> (no es semana puntual).
        Incluye totales en S/ y $, columnas de aprobación, pago, factura y banco.
      </p>
      <form id="form-roc" style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Año</label>
          <select name="anio" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;width:100%">
            <option value="${anioActual}" selected>${anioActual} (actual)</option>
            <option value="${anioActual - 1}">${anioActual - 1}</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px">
            Semana de corte (1-52)
          </label>
          <div style="display:flex;gap:8px;align-items:center">
            <input
              name="semana"
              type="number"
              min="1"
              max="53"
              placeholder="Vacío = semana actual (${semanaHoy})"
              style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;flex:1"
            >
            <button type="button" id="roc-semana-actual" title="Usar semana ISO de hoy" style="padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:12px">
              Semana actual (${semanaHoy})
            </button>
          </div>
          <p style="margin:6px 0 0 0;font-size:11px;color:#6b7280">
            Ej: <b>15</b> = todas las OCs desde enero hasta la semana 15 inclusive.
          </p>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
          <button type="button" id="roc-cancel" style="padding:10px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">Cancelar</button>
          <button type="submit" id="roc-submit" style="padding:10px 18px;background:#065f46;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">📥 Descargar Excel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const cerrar = () => overlay.remove();
  document.getElementById('roc-close').onclick = cerrar;
  document.getElementById('roc-cancel').onclick = cerrar;

  document.getElementById('roc-semana-actual').onclick = () => {
    const inp = document.querySelector('#form-roc input[name="semana"]');
    if (inp) inp.value = '';
  };

  document.getElementById('form-roc').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const anio = Number(f.anio.value) || anioActual;
    const semanaRaw = (f.semana.value || '').trim();
    const semana = semanaRaw === '' ? undefined : Number(semanaRaw);

    if (semana !== undefined && (isNaN(semana) || semana < 1 || semana > 53)) {
      showError('Semana debe ser un número entre 1 y 53');
      return;
    }

    const btn = document.getElementById('roc-submit');
    btn.disabled = true;
    btn.textContent = '⏳ Generando…';

    try {
      await api.ordenesCompra.descargarROC({ centro_costo: centroNombre, anio, semana });
      showSuccess('ROC descargado');
      cerrar();
    } catch (err) {
      showError(err?.message || 'Error generando ROC');
      btn.disabled = false;
      btn.textContent = '📥 Descargar Excel';
    }
  };
}

// ─── ROC: vista previa en pantalla (sin descargar) ──────────────────────
// Muestra los mismos datos que el Excel, agrupados por SEMANA, con totales.
// Desde el modal se puede pasar a descargar el Excel sin volver a configurar.
async function verROC(centroNombre) {
  const anioActual = new Date().getFullYear();
  const semanaHoy = semanaISOActual();

  const overlay = document.createElement('div');
  overlay.id = 'modal-roc-preview';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1500;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:10px;width:1100px;max-width:98vw;height:90vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#f9fafb">
        <div>
          <h3 style="margin:0;font-size:16px">👁 Vista previa ROC — ${centroNombre}</h3>
          <p style="margin:3px 0 0;font-size:11px;color:#6b7280">Acumulado desde enero hasta la semana indicada · revisá antes de bajar el Excel</p>
        </div>
        <button id="rocp-close" title="Cerrar" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>
      </div>

      <div style="padding:12px 20px;border-bottom:1px solid #e5e7eb;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;background:#fff">
        <div>
          <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px;font-weight:600">Año</label>
          <select id="rocp-anio" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:12px">
            <option value="${anioActual}" selected>${anioActual} (actual)</option>
            <option value="${anioActual - 1}">${anioActual - 1}</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px;font-weight:600">Semana corte</label>
          <input id="rocp-semana" type="number" min="1" max="53" value="${semanaHoy}"
            style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;width:90px">
        </div>
        <button id="rocp-recargar" title="Recalcular con los nuevos parámetros"
          style="padding:7px 14px;background:#111827;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">🔄 Recargar</button>
        <div style="margin-left:auto">
          <button id="rocp-descargar" title="Descargar Excel con la configuración actual"
            style="padding:8px 16px;background:#065f46;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">📥 Descargar Excel</button>
        </div>
      </div>

      <div id="rocp-body" style="flex:1;overflow:auto;padding:14px 20px;background:#fafafa">
        <div style="padding:60px;text-align:center;color:#6b7280">⏳ Cargando…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cerrar = () => overlay.remove();
  document.getElementById('rocp-close').onclick = cerrar;

  const fmtMon = (n, mon) => (mon === 'USD' ? '$ ' : 'S/ ') + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtFecha = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s).slice(0, 10);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };

  const colorEstado = (e) => ({
    BORRADOR: '#fff7e6', APROBADA: '#e0f2fe', ENVIADA: '#dbeafe',
    RECIBIDA: '#dcfce7', RECIBIDA_PARCIAL: '#fef9c3', FACTURADA: '#ede9fe',
    PAGADA_PEND_FACTURA: '#fef3c7', PAGADA: '#dcfce7',
    CERRADA_SIN_FACTURA: '#fed7aa', ANULADA: '#fee2e2',
  }[e] || '#f3f4f6');

  const renderBody = (datos) => {
    const body = document.getElementById('rocp-body');
    if (!datos || !datos.semanas) {
      body.innerHTML = '<div style="padding:60px;text-align:center;color:#dc2626">No se pudieron cargar los datos</div>';
      return;
    }
    const tieneOCs = datos.semanas.some(s => s.ocs && s.ocs.length);

    const kpis = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:#6b7280;font-weight:600">CENTRO</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px">${datos.params.centro_costo}</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:#6b7280;font-weight:600">CANTIDAD OCs</div>
          <div style="font-size:18px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums">${datos.totales.cantidad}</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:#6b7280;font-weight:600">TOTAL SOLES</div>
          <div style="font-size:16px;font-weight:700;color:#065f46;margin-top:2px;font-variant-numeric:tabular-nums">${fmtMon(datos.totales.soles, 'PEN')}</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">
          <div style="font-size:10px;color:#6b7280;font-weight:600">TOTAL DÓLARES</div>
          <div style="font-size:16px;font-weight:700;color:#1e40af;margin-top:2px;font-variant-numeric:tabular-nums">${fmtMon(datos.totales.dolares, 'USD')}</div>
        </div>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px">
        Año <b>${datos.params.anio}</b> · semana corte <b>${String(datos.params.semana_corte).padStart(2,'0')}</b>
        ${datos.tipoCambio > 0 ? ` · TC USD <b>${Number(datos.tipoCambio).toFixed(4)}</b>` : ''}
        · totales <b>excluyen anuladas</b>
      </div>
    `;

    if (!tieneOCs) {
      body.innerHTML = kpis + `<div style="padding:50px;text-align:center;color:#6b7280;background:#fff;border:1px solid #e5e7eb;border-radius:8px">Sin órdenes de compra para este centro hasta la semana ${datos.params.semana_corte}</div>`;
      return;
    }

    const semanasHTML = datos.semanas.filter(s => s.ocs && s.ocs.length).map(s => {
      const filas = s.ocs.map(o => {
        const esSoles = o.moneda === 'PEN';
        const tipo = o.tipo_oc === 'SERVICIO' ? 'OS' : 'OC';
        const desc = (o.descripcion_resumen || '').replace(/</g, '&lt;');
        const prov = (o.proveedor_nombre || '—').replace(/</g, '&lt;');
        return `
          <tr style="background:${colorEstado(o.estado)};border-bottom:1px solid #e5e7eb">
            <td style="padding:6px 8px;font-size:11px;font-weight:600">${tipo}</td>
            <td style="padding:6px 8px;font-size:11px;font-weight:600">${o.nro_oc}</td>
            <td style="padding:6px 8px;font-size:11px">${fmtFecha(o.fecha_emision)}</td>
            <td style="padding:6px 8px;font-size:11px">${prov}</td>
            <td style="padding:6px 8px;font-size:11px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${desc}">${desc || '—'}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:center">${esSoles ? 'MN' : 'ME'}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${esSoles ? fmtMon(o.subtotal, 'PEN') : ''}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${esSoles && o.aplica_igv ? fmtMon(o.igv, 'PEN') : ''}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${esSoles ? fmtMon(o.total, 'PEN') : ''}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${!esSoles ? fmtMon(o.subtotal, 'USD') : ''}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${!esSoles && o.aplica_igv ? fmtMon(o.igv, 'USD') : ''}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${!esSoles ? fmtMon(o.total, 'USD') : ''}</td>
            <td style="padding:6px 8px;font-size:10px;text-align:center">${o.aprobada_marca ? '✓' : ''}</td>
            <td style="padding:6px 8px;font-size:10px;text-align:center">${o.pagada_marca ? '✓' : ''}</td>
            <td style="padding:6px 8px;font-size:10px;text-align:center">${o.fecha_real_pago || ''}</td>
            <td style="padding:6px 8px;font-size:10px;text-align:center">${o.estado_rendicion}</td>
            <td style="padding:6px 8px;font-size:10px">${o.nro_factura || ''}</td>
          </tr>
        `;
      }).join('');
      return `
        <div style="margin-bottom:12px">
          <div style="background:#374151;color:#fff;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.4px;border-radius:5px 5px 0 0">SEMANA ${String(s.semana).padStart(2,'0')} <span style="opacity:0.7;font-weight:500">· ${s.ocs.length} OC(s)</span></div>
          <div style="overflow:auto;border:1px solid #e5e7eb;border-radius:0 0 5px 5px;background:#fff">
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead style="background:#1f4e79;color:#fff">
                <tr>
                  <th style="padding:6px 8px;text-align:left">Tipo</th>
                  <th style="padding:6px 8px;text-align:left">Nº</th>
                  <th style="padding:6px 8px;text-align:left">Fecha</th>
                  <th style="padding:6px 8px;text-align:left">Proveedor</th>
                  <th style="padding:6px 8px;text-align:left">Descripción</th>
                  <th style="padding:6px 8px;text-align:center">Mon</th>
                  <th style="padding:6px 8px;text-align:right">SubT S/</th>
                  <th style="padding:6px 8px;text-align:right">IGV S/</th>
                  <th style="padding:6px 8px;text-align:right">Total S/</th>
                  <th style="padding:6px 8px;text-align:right">SubT $</th>
                  <th style="padding:6px 8px;text-align:right">IGV $</th>
                  <th style="padding:6px 8px;text-align:right">Total $</th>
                  <th style="padding:6px 8px;text-align:center">Aprob</th>
                  <th style="padding:6px 8px;text-align:center">Pag</th>
                  <th style="padding:6px 8px;text-align:center">F. Pago</th>
                  <th style="padding:6px 8px;text-align:center">Rend.</th>
                  <th style="padding:6px 8px;text-align:left">Factura</th>
                </tr>
              </thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    body.innerHTML = kpis + semanasHTML;
  };

  const cargar = async () => {
    const body = document.getElementById('rocp-body');
    body.innerHTML = '<div style="padding:60px;text-align:center;color:#6b7280">⏳ Cargando…</div>';
    const anio = Number(document.getElementById('rocp-anio').value) || anioActual;
    const semanaRaw = (document.getElementById('rocp-semana').value || '').trim();
    const semana = semanaRaw === '' ? undefined : Number(semanaRaw);
    if (semana !== undefined && (isNaN(semana) || semana < 1 || semana > 53)) {
      showError('Semana debe ser un número entre 1 y 53');
      return;
    }
    try {
      const datos = await api.ordenesCompra.previewROC({ centro_costo: centroNombre, anio, semana });
      renderBody(datos);
    } catch (err) {
      body.innerHTML = `<div style="padding:60px;text-align:center;color:#dc2626">Error: ${err?.message || 'no se pudo cargar'}</div>`;
    }
  };

  document.getElementById('rocp-recargar').onclick = cargar;
  document.getElementById('rocp-descargar').onclick = async () => {
    const anio = Number(document.getElementById('rocp-anio').value) || anioActual;
    const semanaRaw = (document.getElementById('rocp-semana').value || '').trim();
    const semana = semanaRaw === '' ? undefined : Number(semanaRaw);
    const btn = document.getElementById('rocp-descargar');
    btn.disabled = true; btn.textContent = '⏳ Generando…';
    try {
      await api.ordenesCompra.descargarROC({ centro_costo: centroNombre, anio, semana });
      showSuccess('ROC descargado');
    } catch (err) {
      showError(err?.message || 'Error generando ROC');
    } finally {
      btn.disabled = false; btn.textContent = '📥 Descargar Excel';
    }
  };

  await cargar();
}

// Filtros por tab (Año/Mes). Persisten en module-scope para no perderlos
// al re-renderizar después de "Aplicar".
const _filtrosTabOC = {
  GENERAL:     { anio: new Date().getFullYear(), mes: 'Todos' },
  SERVICIO:    { anio: new Date().getFullYear(), mes: 'Todos' },
  ALMACEN:     { anio: new Date().getFullYear(), mes: 'Todos' },
  SIN_FACTURA: { anio: new Date().getFullYear(), mes: 'Todos' },
};

// Aplica filtros de Año/Mes a una lista de OCs.
function filtrarOCsPorFecha(ocs, tipoOC) {
  const f = _filtrosTabOC[tipoOC];
  if (!f) return ocs;
  return ocs.filter(oc => {
    const fecha = String(oc.fecha_emision || '');
    if (f.anio && !fecha.startsWith(String(f.anio))) return false;
    if (f.mes !== 'Todos' && fecha.slice(5, 7) !== f.mes) return false;
    return true;
  });
}

// HTML de la barra de filtros — compartido por los 3 tabs.
function filtrosBarHTML(tipoOC, ocsFuente) {
  const f = _filtrosTabOC[tipoOC];
  const aniosDisp = [...new Set(ocsFuente.map(o => (o.fecha_emision || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const meses = [
    { v: 'Todos', l: 'Todos' }, { v: '01', l: 'Enero' }, { v: '02', l: 'Febrero' },
    { v: '03', l: 'Marzo' }, { v: '04', l: 'Abril' }, { v: '05', l: 'Mayo' },
    { v: '06', l: 'Junio' }, { v: '07', l: 'Julio' }, { v: '08', l: 'Agosto' },
    { v: '09', l: 'Septiembre' }, { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' },
    { v: '12', l: 'Diciembre' },
  ];
  return `
    <div class="card" style="padding:12px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
      <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary)">
        Año
        <select id="ftab-${tipoOC}-anio" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;min-width:90px">
          ${aniosDisp.map(a => `<option value="${a}" ${String(f.anio) === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary)">
        Mes
        <select id="ftab-${tipoOC}-mes" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;min-width:130px">
          ${meses.map(m => `<option value="${m.v}" ${f.mes === m.v ? 'selected' : ''}>${m.l}</option>`).join('')}
        </select>
      </label>
      <button id="ftab-${tipoOC}-aplicar" class="btn-secondary" style="padding:6px 14px;font-size:12px">Aplicar</button>
      <button id="ftab-${tipoOC}-reset" class="btn-secondary" style="padding:6px 12px;font-size:12px;background:transparent" title="Limpiar filtros">⟲ Reset</button>
    </div>
  `;
}

// Bind de los handlers de la barra de filtros, recibe el panel y la función
// para re-renderizar el tab con los filtros aplicados.
function bindFiltrosTab(panel, tipoOC, reRender) {
  panel.querySelector(`#ftab-${tipoOC}-aplicar`).onclick = () => {
    _filtrosTabOC[tipoOC].anio = Number(panel.querySelector(`#ftab-${tipoOC}-anio`).value);
    _filtrosTabOC[tipoOC].mes  = panel.querySelector(`#ftab-${tipoOC}-mes`).value;
    reRender();
  };
  panel.querySelector(`#ftab-${tipoOC}-reset`).onclick = () => {
    _filtrosTabOC[tipoOC] = { anio: new Date().getFullYear(), mes: 'Todos' };
    reRender();
  };
}

// ─── TAB Gastos Generales / Servicios (ambos comparten layout multi-línea) ──
function renderTabGastos(panel, tipoOC) {
  panel.dataset.rendered = '1';
  const esServicio = tipoOC === 'SERVICIO';
  const ocsFuente = esServicio ? _ocsServicio : _ocsGeneral;
  const ocs = filtrarOCsPorFecha(ocsFuente, tipoOC);
  const total = ocs.reduce((s, o) => s + Number(o.total || 0), 0);

  const tituloPanel = esServicio
    ? 'Gastos vinculados a Servicios / Proyectos'
    : 'Gastos Generales — Oficina, Marketing, SUNAT, Servicios públicos';
  const btnLabel = esServicio ? '➕ Nueva OC de Servicio' : '➕ Nueva OC General';
  const f = _filtrosTabOC[tipoOC];
  const filtroDesc = f.mes === 'Todos' ? `año ${f.anio}` : `${f.anio}-${f.mes}`;

  panel.innerHTML = `
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <h3 style="margin:0;font-size:15px">${tituloPanel}</h3>
        <span style="font-size:11px;color:var(--text-secondary)">${ocs.length} OC(s) · ${fPEN(total)} · ${filtroDesc}</span>
      </div>
      <button id="btn-oc-${tipoOC.toLowerCase()}" type="button" style="padding:8px 14px;background:#7c3aed;color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">${btnLabel}</button>
    </div>
    ${filtrosBarHTML(tipoOC, ocsFuente)}
    <div class="card">
      ${ocs.length ? renderTablaOCs(ocs, { mostrarServicio: esServicio }) : emptyState(
        'No hay OCs para los filtros seleccionados',
        ocsFuente.length ? 'Probá ajustar el Año/Mes o presioná ⟲ Reset.' : 'Apretá el botón "' + btnLabel + '" arriba para empezar.'
      )}
    </div>
  `;

  panel.querySelector(`#btn-oc-${tipoOC.toLowerCase()}`).onclick = () => abrirModalNuevaOC(tipoOC);
  bindFiltrosTab(panel, tipoOC, () => {
    panel.dataset.rendered = '';
    renderTabGastos(panel, tipoOC);
  });
}

// ─── TAB Compras Almacén (usa el mismo form unificado) ──────────────────
function renderTabAlmacen(panel) {
  panel.dataset.rendered = '1';
  const ocsFuente = _ocsAlmacen;
  const ocs = filtrarOCsPorFecha(ocsFuente, 'ALMACEN');
  const total = ocs.reduce((s, o) => s + Number(o.total || 0), 0);
  const f = _filtrosTabOC.ALMACEN;
  const filtroDesc = f.mes === 'Todos' ? `año ${f.anio}` : `${f.anio}-${f.mes}`;

  panel.innerHTML = `
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <h3 style="margin:0;font-size:15px">Compras de Almacén</h3>
        <span style="font-size:11px;color:var(--text-secondary)">${ocs.length} OC(s) · ${fPEN(total)} · ${filtroDesc}</span>
      </div>
      <button id="btn-oc-almacen" type="button" style="padding:8px 14px;background:#7c3aed;color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">➕ Nueva OC Almacén</button>
    </div>
    ${filtrosBarHTML('ALMACEN', ocsFuente)}
    <div class="card" style="margin-bottom:14px;padding:10px 14px;background:#f9fafb;border-left:3px solid var(--primary-color);font-size:12px;color:var(--text-secondary)">
      📦 Los ítems aparecen en <a href="#inventario" style="color:var(--primary-color);font-weight:600">Inventario</a> cuando marques la OC como <strong>Recibida</strong>.
    </div>
    <div class="card">
      ${ocs.length ? renderTablaOCs(ocs, { mostrarAlmacen: true }) : emptyState(
        'No hay OCs para los filtros seleccionados',
        ocsFuente.length ? 'Probá ajustar el Año/Mes o presioná ⟲ Reset.' : 'Apretá "➕ Nueva OC Almacén" para registrar la primera.'
      )}
    </div>
  `;

  panel.querySelector('#btn-oc-almacen').onclick = () => abrirModalNuevaOC('ALMACEN');
  bindFiltrosTab(panel, 'ALMACEN', () => {
    panel.dataset.rendered = '';
    renderTabAlmacen(panel);
  });
}

// Helper: abre modal con el form completo de OC (multi-línea) y bindea handlers.
// Usado por los 3 tabs (General, Servicio, Almacén).
function abrirModalNuevaOC(tipoOC) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px 20px;overflow-y:auto';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:min(720px,95vw);box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:calc(100vh - 60px);overflow-y:auto;position:relative">
      <button data-close type="button" title="Cerrar sin guardar" aria-label="Cerrar" style="position:absolute;top:14px;right:14px;background:#fff;border:1px solid #d1d5db;border-radius:50%;width:30px;height:30px;font-size:18px;cursor:pointer;color:#64748b;z-index:10;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
      <div style="padding:8px">
        ${renderFormOC(tipoOC)}
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  ov.querySelector('[data-close]').onclick = () => ov.remove();
  bindFormOCMulti(ov, tipoOC);
}

// ─── TAB Sin facturar ──────────────────────────────────────────────────
// Bandeja de OCs cerradas sin factura formal (caja chica). Permite asociar
// la factura tardía cuando aparezca, moviendo la OC a FACTURADA.
// Los botones usan OC.verOC y OC.asociarFactura — el namespace window.OC
// se inicializa como side-effect del import del módulo OrdenesCompra
// (top-level del archivo), así que está disponible siempre.
//
// Recarga local de la tabla (sin pisar la pestaña activa). Se invoca después
// de subir factura o mandar a terminada, así no perdemos contexto.
async function refrescarTablaSinFactura() {
  try {
    _ocsSinFactura = await api.ordenesCompra.list({ estado: 'CERRADA_SIN_FACTURA' }).catch(() => []);
  } catch (_) { _ocsSinFactura = _ocsSinFactura || []; }
  const panel = document.getElementById('logi-panel-sin-factura');
  if (panel) {
    panel.dataset.rendered = '';
    renderTabSinFactura(panel);
  }
}
window._logiRefrescarSinFactura = refrescarTablaSinFactura;

// Helper para previsualizar el PDF adjunto de una OC desde un onclick inline.
// Usa el proxy backend (previewFacturaOC) para evitar CORS de Cloudinary.
window._logiVerPDFFactura = async (id_oc) => {
  try {
    const f = await api.ordenesCompra.getFactura(id_oc);
    if (f && f.url_pdf) {
      window.previewFacturaOC(id_oc, 'Factura ' + (f.nro_comprobante || ''));
    } else {
      showError('No se pudo cargar el PDF (puede que no se haya subido archivo, solo datos).');
    }
  } catch (e) {
    showError('Error abriendo preview: ' + (e.message || e));
  }
};

function renderTabSinFactura(panel) {
  panel.dataset.rendered = '1';
  const _esGerente = JSON.parse(localStorage.getItem('erp_user') || '{}').rol === 'GERENTE';

  if (!_ocsSinFactura.length) {
    panel.innerHTML = `
      <div class="card" style="margin-top:16px;padding:40px;text-align:center;color:var(--text-secondary)">
        <div style="font-size:40px;margin-bottom:10px">🗂</div>
        <div style="font-size:14px;font-weight:600">Sin OCs cerradas sin factura</div>
        <div style="font-size:12px;margin-top:6px;max-width:520px;margin-left:auto;margin-right:auto;line-height:1.5">
          Acá aparecen las OCs que cerraste con el botón <strong>"🗂 Cerrar sin facturar"</strong>
          (típicamente caja chica, gastos sin sustento documental). Si después aparece la factura del proveedor,
          podés asociarla desde acá para mover la OC al estado <strong>FACTURADA</strong>.
        </div>
      </div>`;
    return;
  }

  // Aplicar filtros año/mes (mismo patrón que los otros tabs).
  const ocsFiltradas = filtrarOCsPorFecha(_ocsSinFactura, 'SIN_FACTURA');
  const total = ocsFiltradas.reduce((s, oc) => {
    const t = oc.moneda === 'USD' ? Number(oc.total) * (Number(oc.tipo_cambio) || 1) : Number(oc.total);
    return s + (t || 0);
  }, 0);
  const f = _filtrosTabOC.SIN_FACTURA;
  const filtroDesc = f.mes === 'Todos' ? `año ${f.anio}` : `${f.anio}-${f.mes}`;

  panel.innerHTML = `
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <h3 style="margin:0;font-size:15px">🗂 OCs Cerradas Sin Factura</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
          Pendientes de asociar comprobante · ${filtroDesc} · Total: <strong>${fPEN(total)}</strong>
        </div>
      </div>
      <span style="background:#fff7ed;color:#9a3412;padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600">
        ${ocsFiltradas.length} pendiente(s)
      </span>
    </div>
    ${filtrosBarHTML('SIN_FACTURA', _ocsSinFactura)}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:14px;color:var(--text-secondary)">${ocsFiltradas.length === 0 ? 'No hay OCs para los filtros' : 'Listado'}</h3>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb;border-bottom:2px solid #d9dad9">
            <tr>
              <th style="padding:10px;text-align:left">OC</th>
              <th style="padding:10px;text-align:left">Fecha cierre</th>
              <th style="padding:10px;text-align:left">Proveedor</th>
              <th style="padding:10px;text-align:left">Tipo</th>
              <th style="padding:10px;text-align:left">Centro de costo</th>
              <th style="padding:10px;text-align:left">PDF</th>
              <th style="padding:10px;text-align:right">Total</th>
              <th style="padding:10px;text-align:center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${ocsFiltradas.map(oc => {
              // Multi-factura (mig 064): factura_adjunta_count viene del listing.
              // Mantenemos compat con factura_adjunta_id para data vieja.
              const cantFact = Number(oc.factura_adjunta_count ?? (oc.factura_adjunta_id ? 1 : 0));
              const tienePDF = cantFact > 0;
              const nroSafe = oc.nro_oc.replace(/'/g, "\\'");
              const onSubir = `OC.subirFactura(${oc.id_oc}).then(ok => { if (ok) window._logiRefrescarSinFactura?.(); })`;
              const onTerminar = `OC.facturar(${oc.id_oc}).then(() => window._logiRefrescarSinFactura?.())`;
              const txtBadge = cantFact > 1 ? `✓ ${cantFact} facturas` : '✓ PDF';
              const tipBadge = cantFact > 1
                ? `${cantFact} facturas adjuntas (la primera: ${oc.factura_adjunta_nro || ''})`
                : `Factura ${oc.factura_adjunta_nro || ''} adjunta`;
              return `
                <tr style="border-bottom:1px solid #e5e7eb">
                  <td style="padding:10px;font-weight:700">
                    <a href="#" onclick="event.preventDefault();OC.verOC(${oc.id_oc})" style="color:var(--primary-color);text-decoration:none">${oc.nro_oc}</a>
                  </td>
                  <td style="padding:10px;color:#6b7280">${fmtDate(oc.fecha_emision)}</td>
                  <td style="padding:10px">${oc.proveedor_nombre || '—'}</td>
                  <td style="padding:10px"><span style="font-size:10px;background:#e5e7eb;padding:2px 6px;border-radius:4px">${oc.tipo_oc}</span></td>
                  <td style="padding:10px;color:#6b7280">${oc.centro_costo || '—'}</td>
                  <td style="padding:10px">
                    ${tienePDF
                      ? `<span title="${tipBadge}" style="font-size:10px;background:#dcfce7;color:#166534;padding:3px 8px;border-radius:10px;font-weight:600;margin-right:4px">${txtBadge}</span>
                         <button onclick="window._logiVerPDFFactura(${oc.id_oc})" title="Previsualizar el PDF de la primera factura adjunta. Para ver todas, abrí la OC con 👁 Ver." style="background:transparent;color:#15803d;border:1px solid #86efac;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px">👁️</button>`
                      : `<span style="font-size:10px;color:#9ca3af">—</span>`}
                  </td>
                  <td style="padding:10px;text-align:right;font-weight:700">${oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total)}</td>
                  <td style="padding:10px;text-align:center;white-space:nowrap">
                    <button onclick="OC.verOC(${oc.id_oc})" title="Abrir el detalle completo de la OC con todas las acciones contextuales." style="padding:5px 10px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">👁 Ver</button>
                    ${tienePDF
                      ? `<button onclick="${onTerminar}" title="Cerrar la facturación de esta OC y mandarla a TERMINADA. Considera todas las facturas adjuntas (${cantFact})." style="padding:5px 10px;background:#15803d;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">✅ Mandar a TERMINADA</button>
                         <button onclick="${onSubir}" title="Subir otra factura a esta OC. Las anteriores se conservan — multi-factura permitido (mig 064)." style="padding:5px 10px;background:transparent;color:#2563eb;border:1px solid #93c5fd;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">➕ Subir otra</button>`
                      : `<button onclick="${onSubir}" title="Subir el PDF de la factura del proveedor + N° comprobante + fecha + monto. Si el proveedor entrega varios comprobantes, podés subir todos sin reemplazar." style="padding:5px 10px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">📄 Subir factura</button>
                         <button onclick="OC.asociarFactura(${oc.id_oc}, '${nroSafe}')" title="Atajo solo-datos: cargar N° y fecha sin PDF. Preferí 'Subir factura' para tener respaldo." style="padding:5px 10px;background:transparent;color:#7c3aed;border:1px solid #c4b5fd;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">🧾 Asociar sin PDF</button>`}
                    ${_esGerente ? `<button onclick="OC.mandarABorrador(${oc.id_oc}, '${nroSafe}')" title="Volver la OC a BORRADOR conservando el N° (solo GERENTE). Revierte cascada completa pero deja el correlativo intacto para re-editar." style="padding:5px 10px;background:transparent;color:#0891b2;border:1px solid #0891b2;border-radius:4px;cursor:pointer;font-size:11px">↩ A borrador</button>` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind de los filtros año/mes
  bindFiltrosTab(panel, 'SIN_FACTURA', () => {
    panel.dataset.rendered = '';
    renderTabSinFactura(panel);
  });
}

// ─── TAB Dashboard ──────────────────────────────────────────────────────
function renderDashboard(panel) {
  Object.values(_chartInstances).forEach(destroyChart);
  _chartInstances = {};

  const totalGen  = _ocsGeneral.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalSrv  = _ocsServicio.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalAlm  = _ocsAlmacen.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalAll  = totalGen + totalSrv + totalAlm;
  const pendientes = [..._ocsGeneral, ..._ocsServicio, ..._ocsAlmacen].filter(o => !['TERMINADA', 'ANULADA', 'CERRADA_SIN_FACTURA'].includes(o.estado)).length;

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
  // Rol del usuario (para mostrar Reactivar solo a GERENTE).
  let _rol = 'USUARIO';
  try { _rol = JSON.parse(localStorage.getItem('erp_user') || '{}').rol || 'USUARIO'; } catch {}
  const esGerente = _rol === 'GERENTE';
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
          ${ocs.map(o => {
            const nroSafe = String(o.nro_oc).replace(/'/g, "\\'");
            const btnAnular = !['ANULADA', 'TERMINADA', 'CERRADA_SIN_FACTURA'].includes(o.estado)
              ? `<button onclick="Logistica.anularOC(${o.id_oc})" title="Anular esta OC (cambia el estado, no borra). El correlativo queda quemado. Disponible hasta antes de pagar o facturar." aria-label="Anular OC" style="padding:3px 8px;border:1px solid #dc2626;background:transparent;color:#dc2626;border-radius:4px;cursor:pointer;font-size:11px;margin-left:4px">✕</button>`
              : '';
            const btnReactivar = (o.estado === 'ANULADA' && esGerente)
              ? `<button onclick="Logistica.reactivarOC(${o.id_oc}, '${nroSafe}')" title="Devolver la OC anulada a BORRADOR para retomar su flujo (solo GERENTE)" style="padding:3px 8px;border:1px solid #0891b2;background:transparent;color:#0891b2;border-radius:4px;cursor:pointer;font-size:11px;margin-left:4px">♻ Reactivar</button>`
              : '';
            return `
              <tr style="border-bottom:1px solid #e5e7eb">
                <td style="padding:8px;font-weight:600">${o.nro_oc || '—'}</td>
                <td style="padding:8px">${fmtDate(o.fecha_emision)}</td>
                <td style="padding:8px">${o.proveedor_nombre || '—'}</td>
                ${opts.mostrarServicio ? `<td style="padding:8px;font-size:11px">${o.servicio_codigo || '—'}</td>` : ''}
                <td style="padding:8px"><span style="font-size:10px;background:#e5e7eb;padding:2px 6px;border-radius:4px">${o.centro_costo || '—'}</span></td>
                <td style="padding:8px;text-align:right;font-weight:700">${fmtMoney(o.total, o.moneda)}</td>
                <td style="padding:8px;text-align:center">${estadoBadgeOC(o.estado)}</td>
                <td style="padding:8px;text-align:center;white-space:nowrap">
                  <button onclick="window.previewPDFOC(${o.id_oc}, '${nroSafe}')" style="padding:3px 8px;border:1px solid #d1d5db;background:transparent;color:#374151;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">👁️ Ver</button>
                  <button onclick="Logistica.descargarPDF(${o.id_oc})" style="padding:3px 8px;border:1px solid var(--primary-color);background:transparent;color:var(--primary-color);border-radius:4px;cursor:pointer;font-size:11px">📄 PDF</button>
                  ${btnAnular}${btnReactivar}
                </td>
              </tr>
            `;
          }).join('')}
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
    RECIBIDA:            { bg: '#ccfbf1', fg: '#115e59' },
    RECIBIDA_PARCIAL:    { bg: '#fef9c3', fg: '#713f12' },
    FACTURADA:           { bg: '#bbf7d0', fg: '#166534' },
    PAGADA_PEND_FACTURA: { bg: '#fef3c7', fg: '#854d0e' },
    PAGADA:              { bg: '#dcfce7', fg: '#166534' },
    CERRADA_SIN_FACTURA: { bg: '#fed7aa', fg: '#9a3412' },
    ANULADA:             { bg: '#e5e7eb', fg: '#374151' },
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
          <label>Proyecto / Cotización *</label>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <input type="text" id="srv-search-${tipoOC}" placeholder="🔍 Buscar por cliente o proyecto..."
              style="flex:1;padding:7px 10px;border:1px solid #d9dad9;border-radius:6px;font-size:12px">
          </div>
          <select name="id_cotizacion" id="srv-select-${tipoOC}" required>
            <option value="">— Selecciona proyecto —</option>
          </select>
          <div id="srv-info-${tipoOC}" style="font-size:10px;color:var(--text-secondary);margin-top:4px"></div>
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
  const servSelect   = form.querySelector('[name=id_cotizacion]');
  const srvSearch    = form.querySelector(`#srv-search-${tipoOC}`);
  const srvInfo      = form.querySelector(`#srv-info-${tipoOC}`);

  // ── Picker de Proyecto/Cotización (solo en form de Servicio) ──
  // Reemplaza el dropdown viejo de Servicios (tabla orfanada) por una lista
  // de cotizaciones APROBADAS/TERMINADAS/TRABAJO_EN_RIESGO. Filtra cliente-side
  // según moneda actual de la OC + searchbox.
  const renderProyectoOpts = () => {
    if (!servSelect) return;
    const monedaSel = form.querySelector('[name=moneda]')?.value || 'PEN';
    const f = (srvSearch?.value || '').trim().toLowerCase();
    const lista = _proyectos
      .filter(p => p.moneda === monedaSel)
      .filter(p => !f
        || String(p.cliente || '').toLowerCase().includes(f)
        || String(p.proyecto || '').toLowerCase().includes(f)
        || String(p.nro_cotizacion || '').toLowerCase().includes(f));
    const fmtMoney = (n, m) => (m === 'USD' ? '$ ' : 'S/ ') +
      Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    servSelect.innerHTML =
      `<option value="">— Selecciona proyecto —</option>` +
      lista.map(p => `
        <option value="${p.id_cotizacion}">
          ${p.nro_cotizacion} · ${p.cliente}${p.proyecto ? ' — ' + p.proyecto : ''} · ${fmtMoney(p.total, p.moneda)} (${p.estado})
        </option>
      `).join('');
    if (srvInfo) {
      srvInfo.textContent = lista.length === 0
        ? `Sin cotizaciones ${monedaSel} disponibles. Aprobá alguna en Comercial primero.`
        : `${lista.length} proyecto(s) ${monedaSel} disponible(s).`;
    }
  };
  // Auto-sync Empresa → Moneda + TC. Cambiar Empresa a Perfotools también
  // cambia Moneda a USD (con TC del día) y recarga la lista de proyectos.
  // Pensado para que "Empresa: Perfotools" muestre cotizaciones USD sin que
  // el usuario tenga que cambiar manualmente el select de Moneda.
  const empresaSel = form.querySelector('[name=empresa]');
  const monedaSel  = form.querySelector('[name=moneda]');
  const tcInput    = form.querySelector('[name=tipo_cambio]');
  if (empresaSel && monedaSel) {
    empresaSel.addEventListener('change', () => {
      const nueva = empresaSel.value === 'PT' ? 'USD' : 'PEN';
      if (monedaSel.value !== nueva) {
        monedaSel.value = nueva;
        if (tcInput && nueva === 'PEN') tcInput.value = '1.0000';
        monedaSel.dispatchEvent(new Event('change')); // dispara renderProyectoOpts
      }
    });
  }

  if (servSelect) {
    srvSearch?.addEventListener('input', renderProyectoOpts);
    monedaSel?.addEventListener('change', renderProyectoOpts);
    renderProyectoOpts();
  }

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
      <input class="l-cant" type="number" step="0.0001" min="0.01" value="${data.cantidad || 1}" required style="font-size:12px;text-align:right;padding:6px;border:1px solid #d1d5db;border-radius:4px">
      <input class="l-pu" type="number" step="0.0001" min="0" placeholder="P/U" required style="font-size:12px;text-align:right;padding:6px;border:1px solid #d1d5db;border-radius:4px">
      <span class="l-total" style="text-align:right;font-weight:600;padding-top:8px">S/ 0.00</span>
      <button type="button" class="l-del" title="Quitar esta línea de la OC" aria-label="Quitar línea" style="color:#dc2626;background:transparent;border:none;cursor:pointer;padding-top:6px;font-size:14px">✕</button>
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
  // Pedido Julio (04/05): mientras IGV esté apagado, los precios unitarios y
  // cantidades admiten 4 decimales (caso real: proveedor cotiza S/ 23.7899/u).
  // Al marcar "Aplica IGV 18%", redondeamos precios y cantidades a 2 decimales
  // (norma SUNAT/SIRE para ítems de comprobante electrónico).
  igvCheckbox.onchange = () => {
    if (igvCheckbox.checked) {
      let cambios = 0;
      [...lineasWrap.children].forEach(row => {
        const cantInput = row.querySelector('.l-cant');
        const puInput   = row.querySelector('.l-pu');
        const cant = Number(cantInput?.value) || 0;
        const pu   = Number(puInput?.value) || 0;
        const cantR = Math.round(cant * 100) / 100;
        const puR   = Math.round(pu   * 100) / 100;
        if (cantR !== cant && cantInput) { cantInput.value = cantR.toFixed(2); cambios++; }
        if (puR   !== pu   && puInput)   { puInput.value   = puR.toFixed(2);   cambios++; }
      });
      if (cambios > 0) {
        try { window.showToast?.('Precios y cantidades redondeados a 2 decimales (norma SUNAT al aplicar IGV)', 'info'); } catch {}
      }
    }
    recalc();
  };

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
    // Auto-rellenar Centro de Costo con el cliente de la cotización elegida.
    servSelect.onchange = () => {
      const idCot = Number(servSelect.value) || null;
      if (!idCot) return;
      const proy = _proyectos.find(p => p.id_cotizacion === idCot);
      if (proy && ccInput && !ccInput.dataset.userTouched) {
        ccInput.value = String(proy.cliente || `PROYECTO-${idCot}`).toUpperCase();
      }
    };
    // Si el usuario tipea manualmente en CC, no lo sobreescribimos al cambiar proyecto
    ccInput?.addEventListener('input', () => { ccInput.dataset.userTouched = '1'; });
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
      id_cotizacion:  fd.get('id_cotizacion') ? Number(fd.get('id_cotizacion')) : null,
      id_servicio:    null, // Camino A: el dropdown viejo de Servicios fue reemplazado por id_cotizacion
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

// Reactivar una OC anulada — vuelve a BORRADOR. Solo GERENTE.
async function reactivarOC(id_oc, nro) {
  if (!confirm(`¿Reactivar la OC ${nro}?\n\nVolverá al estado BORRADOR. Podrás editarla y re-aprobarla desde cero.`)) return;
  try {
    await api.ordenesCompra.reactivar(id_oc);
    showSuccess(`OC ${nro} reactivada — está en BORRADOR`);
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    showError(err?.error || err?.message || 'Error reactivando OC');
  }
}

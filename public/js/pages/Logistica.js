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
let _ocsGeneral = [];
let _ocsServicio = [];
let _ocsAlmacen = [];
let _chartInstances = {};

export const Logistica = async () => {
  try {
    [_cfg, _servicios, _proveedores, _ocsGeneral, _ocsServicio, _ocsAlmacen] = await Promise.all([
      api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000 })),
      api.services.getServiciosActivos().catch(() => []),
      api.purchases.getProveedores().catch(() => []),
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
    <div id="logi-panel-oc"        class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-general"   class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-servicio"  class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-almacen"   class="logi-tab-content" style="display:none"></div>
    <div id="logi-panel-dash"      class="logi-tab-content" style="display:none"></div>
  `;
};

function initTabs() {
  TabBar({
    container: '#logi-tabbar',
    tabs: [
      { id: 'proveedores', label: `🤝 Proveedores`,        badge: _proveedores.length },
      { id: 'oc',          label: `📋 Órdenes de Compra`,  badge: _ocsGeneral.length + _ocsServicio.length + _ocsAlmacen.length },
      { id: 'general',     label: `🏢 Gastos Generales`,   badge: _ocsGeneral.length },
      { id: 'servicio',    label: `🔧 Gastos de Servicio`, badge: _ocsServicio.length },
      { id: 'almacen',     label: `📥 Compras Almacén`,    badge: _ocsAlmacen.length },
      { id: 'dash',        label: '📊 Dashboard' },
    ],
    defaultTab: 'proveedores',
    onChange: async (id) => {
      // Solo escondemos los paneles de Logística (no los de páginas anidadas)
      document.querySelectorAll('.logi-tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('logi-panel-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'proveedores' && !panel.dataset.rendered) await renderTabProveedores(panel);
      if (id === 'oc'          && !panel.dataset.rendered) await renderTabOC(panel);
      if (id === 'general'     && !panel.dataset.rendered) renderTabGastos(panel, 'GENERAL');
      if (id === 'servicio'    && !panel.dataset.rendered) renderTabGastos(panel, 'SERVICIO');
      if (id === 'almacen'     && !panel.dataset.rendered) renderTabAlmacen(panel);
      if (id === 'dash')                                   renderDashboard(panel);
    },
  });

  window.Logistica = { descargarPDF, anularOC };
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

// ─── TAB Gastos Generales / Servicios (ambos comparten layout) ──────────
function renderTabGastos(panel, tipoOC) {
  panel.dataset.rendered = '1';
  const esServicio = tipoOC === 'SERVICIO';
  const ocs = esServicio ? _ocsServicio : _ocsGeneral;
  const total = ocs.reduce((s, o) => s + Number(o.total || 0), 0);
  const hoy = new Date().toISOString().slice(0, 10);

  const provOpts = _proveedores.map(p => {
    const doc = p.ruc || p.dni || '';
    return `<option value="${p.id_proveedor}">${p.razon_social}${doc ? ' · ' + doc : ''}</option>`;
  }).join('');
  const servOpts = _servicios.map(s =>
    `<option value="${s.id_servicio}">${s.nro_servicio || ('SRV-' + s.id_servicio)} · ${s.cliente || s.descripcion || '—'}</option>`
  ).join('');

  const tituloPanel = esServicio ? 'Gastos vinculados a Servicios / Proyectos' : 'Gastos Generales — Oficina, Marketing, SUNAT, Servicios públicos';
  const ayudaForm = esServicio
    ? 'Honorarios persona natural (con DNI) NO llevan IGV. El monto se inyecta como costo directo del proyecto.'
    : 'Cada gasto genera una OC formal con correlativo (001, 002…) y PDF descargable. Auto-aprueba si total ≤ S/ ' + (_cfg?.monto_limite_sin_aprobacion || 5000) + '.';

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-top:16px;align-items:start">
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

      <div class="card">
        <h3 style="margin-bottom:6px;font-size:15px">➕ Nueva OC ${esServicio ? 'de Servicio' : 'General'}</h3>
        <p style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">${ayudaForm}</p>
        <form id="form-oc-${tipoOC.toLowerCase()}" style="display:flex;flex-direction:column;gap:10px">
          <input type="hidden" name="tipo_oc" value="${tipoOC}">

          ${esServicio ? `
          <div>
            <label>Servicio / Proyecto *</label>
            <select name="id_servicio" required onchange="(()=>{const s=_servicios.find(x=>x.id_servicio==this.value);if(s){document.querySelector('[name=centro_costo]').value=s.cliente||('PROYECTO-'+s.id_servicio);}})()">
              <option value="">— Selecciona proyecto —</option>
              ${servOpts || '<option value="" disabled>Sin servicios activos</option>'}
            </select>
          </div>
          ` : ''}

          <div>
            <label>Proveedor * ${_proveedores.length === 0 ? '<span style="color:#e65100">(crea uno primero en Proveedores)</span>' : ''}</label>
            <select name="id_proveedor" required>
              <option value="">— Selecciona proveedor —</option>
              ${provOpts}
            </select>
          </div>

          <div>
            <label>Concepto / Descripción *</label>
            <input name="descripcion" required placeholder="${esServicio ? 'Ej: Honorario soldador 3 días, Flete a Las Bambas' : 'Ej: SERVICIO DE INTERNET FEB/2026, PAGO LUZ ENE'}">
          </div>

          <div>
            <label>Centro de Costo *</label>
            <input name="centro_costo" value="${esServicio ? '' : 'OFICINA CENTRAL'}" placeholder="${esServicio ? 'Auto-rellena al elegir proyecto' : 'OFICINA CENTRAL, MARKETING, etc.'}" required>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Fecha emisión *</label><input type="date" name="fecha_emision" value="${hoy}" required></div>
            <div><label>Empresa</label>
              <select name="empresa">
                <option value="ME">Metal Engineers (PEN)</option>
                <option value="PT">Perfotools (USD)</option>
              </select>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div><label>Monto *</label><input type="number" step="0.01" name="monto" required></div>
            <div><label>Moneda</label>
              <select name="moneda"><option value="PEN">PEN</option><option value="USD">USD</option></select>
            </div>
            <div><label>TC</label><input type="number" step="0.0001" name="tipo_cambio" value="1.0000"></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Forma de pago</label>
              <select name="forma_pago"><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select>
            </div>
            <div><label>Unidad</label>
              <select name="unidad"><option value="UND">UND</option><option value="GLB">GLB</option><option value="SERV">SERV</option></select>
            </div>
          </div>

          <div>
            <label>Observaciones</label>
            <input name="observaciones" placeholder="Ej: Banca Móvil — Pago servicio, Depósito a cuenta, NPS SUNAT">
          </div>

          <label style="display:flex;gap:6px;align-items:center;font-size:12px">
            <input type="checkbox" name="aplica_igv" ${esServicio ? '' : (_cfg?.aplica_igv ? 'checked' : '')}>
            Aplica IGV 18%${esServicio ? ' (desmarcar si es RH persona natural)' : ''}
          </label>

          <button type="submit" style="padding:10px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            Crear OC + generar PDF
          </button>
        </form>
      </div>
    </div>
  `;

  // Si es servicio, auto-rellenar centro_costo al elegir servicio
  if (esServicio) {
    const sel = panel.querySelector('[name=id_servicio]');
    const cc = panel.querySelector('[name=centro_costo]');
    if (sel && cc) {
      sel.onchange = () => {
        const s = _servicios.find(x => String(x.id_servicio) === sel.value);
        if (s) cc.value = s.cliente || ('PROYECTO-' + s.id_servicio);
      };
    }
  }

  bindFormOC(`form-oc-${tipoOC.toLowerCase()}`);
}

// ─── TAB Compras Almacén (multi-línea) ──────────────────────────────────
function renderTabAlmacen(panel) {
  panel.dataset.rendered = '1';
  const ocs = _ocsAlmacen;
  const total = ocs.reduce((s, o) => s + Number(o.total || 0), 0);
  const hoy = new Date().toISOString().slice(0, 10);
  const provOpts = _proveedores.map(p => {
    const doc = p.ruc || p.dni || '';
    return `<option value="${p.id_proveedor}">${p.razon_social}${doc ? ' · ' + doc : ''}</option>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin-top:16px;align-items:start">
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

      <div class="card">
        <h3 style="margin-bottom:14px;font-size:15px">➕ Nueva OC Almacén (multi-línea)</h3>
        <form id="form-oc-almacen" style="display:flex;flex-direction:column;gap:10px">
          <input type="hidden" name="tipo_oc" value="ALMACEN">

          <div>
            <label>Proveedor *</label>
            <select name="id_proveedor" required>
              <option value="">— Selecciona proveedor —</option>
              ${provOpts}
            </select>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Fecha emisión *</label><input type="date" name="fecha_emision" value="${hoy}" required></div>
            <div><label>Empresa</label>
              <select name="empresa">
                <option value="ME">Metal Engineers (PEN)</option>
                <option value="PT">Perfotools (USD)</option>
              </select>
            </div>
          </div>

          <div><label>Centro de Costo</label>
            <input name="centro_costo" value="ALMACEN METAL" required>
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:13px">Líneas</strong>
              <button type="button" id="add-linea" style="padding:4px 10px;font-size:11px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer">+ línea</button>
            </div>
            <div id="lineas-almacen">
              <div class="linea" style="display:grid;grid-template-columns:2fr 60px 70px 90px 24px;gap:4px;margin-bottom:4px">
                <input name="desc[]" placeholder="Descripción" required style="font-size:12px">
                <input name="und[]" value="UND" style="font-size:12px">
                <input name="cant[]" type="number" step="0.01" value="1" required style="font-size:12px">
                <input name="pu[]" type="number" step="0.01" placeholder="P/U" required style="font-size:12px">
                <button type="button" onclick="this.parentNode.remove()" style="color:#dc2626;background:transparent;border:none;cursor:pointer">✕</button>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Moneda</label>
              <select name="moneda"><option value="PEN">PEN</option><option value="USD">USD</option></select>
            </div>
            <div><label>TC</label><input type="number" step="0.0001" name="tipo_cambio" value="1.0000"></div>
          </div>

          <div>
            <label>Observaciones</label>
            <input name="observaciones" placeholder="Ej: Entrega en almacén La Molina">
          </div>

          <label style="display:flex;gap:6px;align-items:center;font-size:12px">
            <input type="checkbox" name="aplica_igv" ${_cfg?.aplica_igv ? 'checked' : ''}> Aplica IGV 18%
          </label>

          <button type="submit" style="padding:10px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            Crear OC Almacén + PDF
          </button>
        </form>
      </div>
    </div>
  `;

  // Botón "+ línea"
  const btnAdd = panel.querySelector('#add-linea');
  const wrap = panel.querySelector('#lineas-almacen');
  if (btnAdd && wrap) {
    btnAdd.onclick = () => {
      const row = document.createElement('div');
      row.className = 'linea';
      row.style.cssText = 'display:grid;grid-template-columns:2fr 60px 70px 90px 24px;gap:4px;margin-bottom:4px';
      row.innerHTML = `
        <input name="desc[]" placeholder="Descripción" required style="font-size:12px">
        <input name="und[]" value="UND" style="font-size:12px">
        <input name="cant[]" type="number" step="0.01" value="1" required style="font-size:12px">
        <input name="pu[]" type="number" step="0.01" placeholder="P/U" required style="font-size:12px">
        <button type="button" onclick="this.parentNode.remove()" style="color:#dc2626;background:transparent;border:none;cursor:pointer">✕</button>
      `;
      wrap.appendChild(row);
    };
  }

  bindFormOCAlmacen('form-oc-almacen');
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
        { label: 'OCs Generales',  value: fPEN(totalGen), subtitle: `${_ocsGeneral.length} OC(s)`, color: '#1565c0' },
        { label: 'OCs Servicio',   value: fPEN(totalSrv), subtitle: `${_ocsServicio.length} OC(s)`, color: '#e65100' },
        { label: 'OCs Almacén',    value: fPEN(totalAlm), subtitle: `${_ocsAlmacen.length} OC(s)`, color: '#2e7d32' },
        { label: 'Total histórico', value: fPEN(totalAll), subtitle: `${pendientes} pendientes`, color: '#676767' },
      ])}
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

// ─── Form handlers ──────────────────────────────────────────────────────

function bindFormOC(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const monto = Number(fd.get('monto')) || 0;
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
      observaciones:  fd.get('observaciones') || null,
      lineas: [{
        descripcion:     fd.get('descripcion'),
        unidad:          fd.get('unidad') || 'UND',
        cantidad:        1,
        precio_unitario: monto,
      }],
    };

    const btn = form.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando OC…'; }
    try {
      const r = await api.ordenesCompra.create(payload);
      showSuccess(`OC ${r.nro_oc} creada (${r.estado}) — abriendo PDF...`);
      setTimeout(() => api.ordenesCompra.descargarPDF(r.id_oc).catch(() => {}), 400);
      setTimeout(() => location.reload(), 1800);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Crear OC + generar PDF'; }
      showError(err?.error || err?.message || 'Error al crear OC');
    }
  };
}

function bindFormOCAlmacen(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const descs = fd.getAll('desc[]');
    const unds = fd.getAll('und[]');
    const cants = fd.getAll('cant[]');
    const pus = fd.getAll('pu[]');

    const lineas = [];
    for (let i = 0; i < descs.length; i++) {
      const d = String(descs[i] || '').trim();
      if (!d) continue;
      lineas.push({
        descripcion: d,
        unidad: unds[i] || 'UND',
        cantidad: Number(cants[i]) || 0,
        precio_unitario: Number(pus[i]) || 0,
      });
    }
    if (lineas.length === 0) { showError('Agregá al menos una línea'); return; }

    const payload = {
      tipo_oc:       'ALMACEN',
      empresa:       fd.get('empresa') || 'ME',
      fecha_emision: fd.get('fecha_emision'),
      id_proveedor:  Number(fd.get('id_proveedor')),
      centro_costo:  fd.get('centro_costo') || 'ALMACEN METAL',
      moneda:        fd.get('moneda') || 'PEN',
      tipo_cambio:   Number(fd.get('tipo_cambio')) || 1,
      aplica_igv:    fd.get('aplica_igv') === 'on',
      observaciones: fd.get('observaciones') || null,
      lineas,
    };

    const btn = form.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando OC…'; }
    try {
      const r = await api.ordenesCompra.create(payload);
      showSuccess(`OC ${r.nro_oc} creada — abriendo PDF...`);
      setTimeout(() => api.ordenesCompra.descargarPDF(r.id_oc).catch(() => {}), 400);
      setTimeout(() => location.reload(), 1800);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Crear OC Almacén + PDF'; }
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

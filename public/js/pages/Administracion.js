import { api } from '../services/api.js';
import { showError } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';
import { pill } from '../components/Pill.js';
import { emptyState } from '../components/EmptyState.js';
import { destroyChart } from '../components/charts.js';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const fPEN = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0);
const fmtPct = (v) => (v >= 0 ? '+' : '') + (Number(v) || 0).toFixed(0) + '%';
const colorPct = (v) => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#6b7280';

const abrirPDFRendicion = async (id) => {
  try {
    const token = localStorage.getItem('erp_token');
    const r = await fetch(`/api/rendiciones/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      let detalle = '';
      try { const data = await r.json(); detalle = data?.error || JSON.stringify(data); }
      catch { try { detalle = await r.text(); } catch {} }
      throw new Error(`HTTP ${r.status}${detalle ? ' — ' + detalle : ''}`);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    window.showError?.('Error generando PDF: ' + (err.message || err));
  }
};

let _chartInstances = {};

export const Administracion = async () => {
  setTimeout(() => initTabs(), 60);

  return `
    <header class="header">
      <div>
        <h1>📋 Administración — Gasto en Personal</h1>
        <span style="color:var(--text-secondary)">Consolidado desde Logística (gastos GENERAL/SERVICIO + Órdenes de Compra). Solo visualización.</span>
      </div>
    </header>
    <div id="adm-tabbar" style="margin-top:20px"></div>
    <div id="adm-tab-detalle"     class="adm-tab-content"></div>
    <div id="adm-tab-personal"    class="adm-tab-content" style="display:none"></div>
    <div id="adm-tab-rendiciones" class="adm-tab-content" style="display:none"></div>
    <div id="adm-tab-dashboard"   class="adm-tab-content" style="display:none"></div>
  `;
};

function initTabs() {
  TabBar({
    container: '#adm-tabbar',
    tabs: [
      { id: 'detalle',     label: '📋 Detalle por mes' },
      { id: 'personal',    label: '👥 Personal' },
      { id: 'rendiciones', label: '🧾 Rendiciones de Gastos' },
      { id: 'dashboard',   label: '📊 Dashboard histórico' },
    ],
    defaultTab: 'detalle',
    onChange: async (id) => {
      document.querySelectorAll('.adm-tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('adm-tab-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'detalle'     && !panel.dataset.rendered) await renderDetalle(panel);
      if (id === 'personal')                               await renderPersonal(panel);
      if (id === 'rendiciones')                            await renderRendiciones(panel);
      if (id === 'dashboard')                              await renderDashboard(panel);
    },
  });
}

// ─── TAB Detalle (vista actual mejorada) ──────────────────────────
async function renderDetalle(panel) {
  panel.dataset.rendered = '1';
  const anioActual = new Date().getFullYear();
  let anioSel = anioActual;
  let mesSel = '';
  let data = null;

  panel.innerHTML = `
    <div class="card" style="margin-top:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <span style="font-size:13px;font-weight:600">Filtros:</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">Año:
        <select id="adm-anio" style="padding:6px 10px;border-radius:6px;border:1px solid #d1d5db">
          ${[anioActual, anioActual - 1, anioActual - 2].map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">Mes:
        <select id="adm-mes" style="padding:6px 10px;border-radius:6px;border:1px solid #d1d5db">
          <option value="">Todos los meses</option>
          ${MESES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
        </select>
      </label>
      <span style="font-size:11px;color:var(--text-secondary)">ⓘ Solo gastos tipo GENERAL (Oficina) y SERVICIO (Proyectos).</span>
    </div>
    <div id="adm-contenido"></div>
  `;

  const cargar = async () => {
    try {
      data = await api.administracion.getGastoPersonal(anioSel, mesSel || undefined);
      renderInner();
    } catch (err) {
      showError(err.error || 'Error al cargar datos');
    }
  };

  const renderInner = () => {
    const cont = panel.querySelector('#adm-contenido');
    if (!cont || !data) return;
    const t = data.totales || {};
    const resumen = data.resumen || [];
    const detalle = data.detalle || [];

    const resumenRows = resumen.map(r => `
      <tr>
        <td style="padding:8px;font-size:12px">${MESES[r.mes] || '—'}</td>
        <td style="padding:8px"><span style="background:${r.tipo_gasto_logistica === 'GENERAL' ? '#dbeafe' : '#fef3c7'};color:${r.tipo_gasto_logistica === 'GENERAL' ? '#1e40af' : '#92400e'};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${r.tipo_gasto_logistica}</span></td>
        <td style="padding:8px;font-weight:600">${r.centro_costo}</td>
        <td style="padding:8px;text-align:right;font-size:12px">${r.cantidad}</td>
        <td style="padding:8px;text-align:right;font-weight:700">${fPEN(r.total_gasto)}</td>
      </tr>`).join('');

    const detalleRows = detalle.map(d => `
      <tr>
        <td style="padding:8px;font-size:12px">${String(d.fecha).split('T')[0]}</td>
        <td style="padding:8px"><strong>${d.proveedor_nombre || '—'}</strong></td>
        <td style="padding:8px;font-size:12px">${d.concepto}</td>
        <td style="padding:8px"><span style="background:#f3f4f6;padding:2px 6px;border-radius:6px;font-size:11px">${d.tipo_gasto_logistica}</span></td>
        <td style="padding:8px;font-size:12px">${d.centro_costo}</td>
        <td style="padding:8px;text-align:right;font-weight:700">${fPEN(d.total_base)}</td>
        <td style="padding:8px">${pill(d.estado_pago || 'PENDIENTE', d.estado_pago || 'PENDIENTE')}</td>
      </tr>`).join('');

    cont.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px 0">
        <div class="card" style="border-top:4px solid #676767;text-align:center">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Total Personal</div>
          <div style="font-size:22px;font-weight:700">${fPEN(t.total_general)}</div>
        </div>
        <div class="card" style="border-top:4px solid #2d7a45;text-align:center">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Oficina Central</div>
          <div style="font-size:22px;font-weight:700;color:#2d7a45">${fPEN(t.total_oficina)}</div>
        </div>
        <div class="card" style="border-top:4px solid #b5302a;text-align:center">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Proyectos</div>
          <div style="font-size:22px;font-weight:700;color:#b5302a">${fPEN(t.total_proyectos)}</div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px">Resumen por Centro de Costo</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#fafafa;border-bottom:2px solid #e5e7eb">
            <th style="padding:10px;text-align:left">Mes</th>
            <th style="padding:10px;text-align:left">Tipo</th>
            <th style="padding:10px;text-align:left">Centro de Costo</th>
            <th style="padding:10px;text-align:right">Registros</th>
            <th style="padding:10px;text-align:right">Total</th>
          </tr></thead>
          <tbody>${resumenRows || `<tr><td colspan="5" style="padding:0">${emptyState({
            icon: 'archive',
            title: 'Sin datos para el período',
            text: 'Cuando se registren gastos de personal en Logística con centro de costo asignado, aparecerán acá.',
          })}</td></tr>`}</tbody>
        </table>
      </div>

      <div class="card" style="margin-top:20px">
        <h3 style="margin:0 0 14px;font-size:15px">Detalle de Gastos de Personal</h3>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#fafafa;border-bottom:2px solid #e5e7eb">
              <th style="padding:10px;text-align:left">Fecha</th>
              <th style="padding:10px;text-align:left">Proveedor / Persona</th>
              <th style="padding:10px;text-align:left">Concepto</th>
              <th style="padding:10px;text-align:left">Tipo</th>
              <th style="padding:10px;text-align:left">Centro de Costo</th>
              <th style="padding:10px;text-align:right">Monto</th>
              <th style="padding:10px;text-align:left">Estado</th>
            </tr></thead>
            <tbody>${detalleRows || `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--text-secondary)">Sin registros</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  };

  panel.querySelector('#adm-anio').onchange = (e) => { anioSel = Number(e.target.value); cargar(); };
  panel.querySelector('#adm-mes').onchange  = (e) => { mesSel  = e.target.value; cargar(); };
  await cargar();
}

// ─── TAB Dashboard histórico ─────────────────────────────────────
async function renderDashboard(panel) {
  Object.values(_chartInstances).forEach(destroyChart);
  _chartInstances = {};

  panel.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-secondary)">Cargando dashboard…</div>`;
  let d;
  try {
    d = await api.administracion.getDashboard();
  } catch (e) {
    panel.innerHTML = `<div style="padding:40px;color:var(--danger)">Error: ${e.message}</div>`;
    return;
  }

  const k = d.kpis || {};
  const deltaYTD = k.total_ytd_prev > 0 ? ((k.total_ytd - k.total_ytd_prev) / k.total_ytd_prev * 100) : 0;
  const deltaMes = k.mes_anterior > 0 ? ((k.mes_actual - k.mes_anterior) / k.mes_anterior * 100) : 0;

  // Construir mapa mes→total para year actual y anterior
  const mapAct = {}, mapPrev = {}, mapOfic = {}, mapProy = {};
  (d.tendencia_actual || []).forEach(r => {
    const m = Number(r.mes);
    mapAct[m] = Number(r.total) || 0;
    mapOfic[m] = Number(r.oficina) || 0;
    mapProy[m] = Number(r.proyectos) || 0;
  });
  (d.tendencia_anterior || []).forEach(r => {
    mapPrev[Number(r.mes)] = Number(r.total) || 0;
  });

  panel.innerHTML = `
    <div style="margin-top:16px">
      ${kpiGrid([
        { label: `YTD ${d.anio} (${k.meses_transcurridos} meses)`, value: fPEN(k.total_ytd), icon: '💰' },
        { label: `YTD ${d.anio_anterior} (mismo período)`, value: fPEN(k.total_ytd_prev), icon: '📅', changeType: deltaYTD < 0 ? 'positive' : 'negative' },
        { label: 'Mes actual', value: fPEN(k.mes_actual), icon: '📊' },
        { label: 'Promedio mensual', value: fPEN(k.promedio_mensual), icon: '📈' },
      ], 4)}
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 14px;font-size:15px">📅 Comparativas clave</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div style="padding:14px;background:#f0f9ff;border-left:4px solid #0284c7;border-radius:6px">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;font-weight:600">YTD ${d.anio} vs ${d.anio_anterior}</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
            <div style="font-size:22px;font-weight:700">${fPEN(k.total_ytd)}</div>
            <div style="font-size:13px;color:${colorPct(deltaYTD)};font-weight:600">${fmtPct(deltaYTD)}</div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">vs ${fPEN(k.total_ytd_prev)} mismo período año anterior</div>
        </div>
        <div style="padding:14px;background:#fef3c7;border-left:4px solid #d97706;border-radius:6px">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;font-weight:600">Mes actual vs anterior</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
            <div style="font-size:22px;font-weight:700">${fPEN(k.mes_actual)}</div>
            <div style="font-size:13px;color:${colorPct(deltaMes)};font-weight:600">${fmtPct(deltaMes)}</div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">vs ${fPEN(k.mes_anterior)} mes anterior</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 14px;font-size:15px">📈 Tendencia mensual ${d.anio} vs ${d.anio_anterior}</h3>
      <canvas id="ch-anios" style="max-height:320px"></canvas>
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 14px;font-size:15px">🏢 Distribución mensual: Oficina vs Proyectos (${d.anio})</h3>
      <canvas id="ch-oficproy" style="max-height:300px"></canvas>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px">🎯 Top 10 proyectos (${d.anio})</h3>
        ${renderTopList(d.top_proyectos, 'centro_costo', 'total', 'cantidad')}
      </div>
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px">👥 Top 10 personas/proveedores (${d.anio})</h3>
        ${renderTopList(d.top_personas, 'acreedor', 'total', 'cantidad')}
      </div>
    </div>
  `;

  // Charts
  setTimeout(() => {
    const labels = MESES_CORTO.slice(1);
    const dataAct = labels.map((_, i) => mapAct[i + 1] || 0);
    const dataPrev = labels.map((_, i) => mapPrev[i + 1] || 0);
    const dataOfic = labels.map((_, i) => mapOfic[i + 1] || 0);
    const dataProy = labels.map((_, i) => mapProy[i + 1] || 0);

    if (window.Chart) {
      const c1 = document.getElementById('ch-anios');
      if (c1) {
        _chartInstances.anios = new window.Chart(c1, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: `${d.anio}`, data: dataAct, borderColor: '#0284c7', backgroundColor: '#0284c733', fill: true, tension: 0.3 },
              { label: `${d.anio_anterior}`, data: dataPrev, borderColor: '#9ca3af', borderDash: [6, 4], fill: false, tension: 0.3 },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + Number(v).toLocaleString() } } } }
        });
      }
      const c2 = document.getElementById('ch-oficproy');
      if (c2) {
        _chartInstances.oficproy = new window.Chart(c2, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Oficina Central', data: dataOfic, backgroundColor: '#2d7a45' },
              { label: 'Proyectos',       data: dataProy, backgroundColor: '#b5302a' },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });
      }
    }
  }, 50);
}

function renderTopList(items, labelKey, valueKey, countKey) {
  if (!items || items.length === 0) {
    return '<div style="padding:30px;text-align:center;color:var(--text-secondary);font-size:13px">Sin datos en el período</div>';
  }
  const max = Math.max(...items.map(i => Number(i[valueKey]) || 0));
  return items.map((it, i) => {
    const valor = Number(it[valueKey]) || 0;
    const pct = max > 0 ? (valor / max * 100) : 0;
    return `
      <div style="margin-bottom:10px;font-size:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            <strong>${i + 1}.</strong> ${it[labelKey] || '—'}
          </span>
          <strong>${fPEN(valor)}</strong>
        </div>
        <div style="background:#f3f4f6;border-radius:3px;height:6px;overflow:hidden">
          <div style="background:var(--primary-color);height:100%;width:${pct}%"></div>
        </div>
        ${countKey && it[countKey] ? `<div style="font-size:10px;color:var(--text-secondary)">${it[countKey]} registro(s)</div>` : ''}
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// TAB Rendiciones de Gastos
// ═══════════════════════════════════════════════════════════════════

const fmtDate = (s) => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const fmtMoney = (n, mon = 'PEN') => (mon === 'USD' ? '$' : 'S/') + ' ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Filtros del tab Rendiciones — persistidos en module-scope para que no se
// pisen al re-renderizar tras crear/editar una rendición.
const _filtrosRend = {
  centro: 'Todos',
  anio:   new Date().getFullYear(),
  mes:    'Todos',
};

async function renderRendiciones(panel) {
  panel.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280">⏳ Cargando rendiciones…</div>';
  let listaFull = [];
  let pendientesFull = [];
  try {
    [listaFull, pendientesFull] = await Promise.all([
      api.rendiciones.list(),
      api.rendiciones.ocsPendientes(),
    ]);
  } catch (e) { return showError(e?.message || 'Error cargando'); }

  // Aplicar filtros
  const f = _filtrosRend;
  const matchFiltros = (cc, fecha) => {
    if (f.centro !== 'Todos' && cc !== f.centro) return false;
    const fSt = String(fecha || '');
    if (f.anio && !fSt.startsWith(String(f.anio))) return false;
    if (f.mes !== 'Todos' && fSt.slice(5, 7) !== f.mes) return false;
    return true;
  };
  const lista = listaFull.filter(r => matchFiltros(r.centro_costo, r.fecha_rendicion));
  const pendientes = pendientesFull.filter(o => matchFiltros(o.centro_costo, o.fecha_emision));

  // Opciones para los dropdowns (basados en datos completos, no filtrados)
  const centrosDisp = [...new Set([
    ...listaFull.map(r => r.centro_costo).filter(Boolean),
    ...pendientesFull.map(o => o.centro_costo).filter(Boolean),
  ])].sort();
  const aniosDisp = [...new Set([
    ...listaFull.map(r => (r.fecha_rendicion || '').slice(0, 4)).filter(Boolean),
    ...pendientesFull.map(o => (o.fecha_emision || '').slice(0, 4)).filter(Boolean),
  ])].sort().reverse();
  const meses = [
    { v: 'Todos', l: 'Todos' }, { v: '01', l: 'Enero' }, { v: '02', l: 'Febrero' },
    { v: '03', l: 'Marzo' }, { v: '04', l: 'Abril' }, { v: '05', l: 'Mayo' },
    { v: '06', l: 'Junio' }, { v: '07', l: 'Julio' }, { v: '08', l: 'Agosto' },
    { v: '09', l: 'Septiembre' }, { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' },
    { v: '12', l: 'Diciembre' },
  ];
  const filtroDesc = f.mes === 'Todos' ? `año ${f.anio}` : `${f.anio}-${f.mes}`;
  const filtroCentroDesc = f.centro === 'Todos' ? 'todos los centros' : f.centro;

  const estadoBadge = (e) => {
    const map = {
      BORRADOR:    { bg: '#f3f4f6', fg: '#374151', label: '📝 BORRADOR' },
      EN_REVISION: { bg: '#fef3c7', fg: '#92400e', label: '🔍 EN REVISIÓN' },
      AUTORIZADA:  { bg: '#d1fae5', fg: '#065f46', label: '✅ AUTORIZADA' },
      CERRADA:     { bg: '#dbeafe', fg: '#1e40af', label: '🔒 CERRADA' },
      ANULADA:     { bg: '#fee2e2', fg: '#991b1b', label: '⊘ ANULADA' },
    };
    const c = map[e] || { bg: '#f3f4f6', fg: '#374151', label: e || '—' };
    return `<span style="background:${c.bg};color:${c.fg};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${c.label}</span>`;
  };

  const ocEstadoBadge = (e) => {
    if (e === 'PAGADA')                return `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">💵 PAGADA</span>`;
    if (e === 'CERRADA_SIN_FACTURA')   return `<span style="background:#fed7aa;color:#9a3412;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">🗂 CERRADA SIN FACTURA</span>`;
    return `<span style="background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${e || '—'}</span>`;
  };

  // ── Filas: pendientes de rendir (OCs PAGADA / CERRADA_SIN_FACTURA sin rendición) ──
  const filasPendientes = (pendientes || []).map(o => `
    <tr style="border-bottom:1px solid #fde68a;background:#fffbeb">
      <td style="padding:8px;font-size:11px;font-weight:600">${o.nro_oc}</td>
      <td style="padding:8px;font-size:11px">${fmtDate(o.fecha_emision)}</td>
      <td style="padding:8px;font-size:11px">${o.proveedor_nombre || '—'}</td>
      <td style="padding:8px;font-size:11px">${o.centro_costo || '—'}</td>
      <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmtMoney(o.total, o.moneda)}</td>
      <td style="padding:8px;text-align:center">${ocEstadoBadge(o.estado)}</td>
      <td style="padding:8px;text-align:right;white-space:nowrap">
        <button data-iniciar-oc="${o.id_oc}" title="Crear rendición auto-poblada desde la OC y abrir editor"
          aria-label="Iniciar rendición"
          style="padding:5px 12px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">▶ Iniciar rendición</button>
      </td>
    </tr>
  `).join('');

  // ── Filas: rendiciones ya creadas ──
  const filas = (lista || []).map(r => `
    <tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:8px;font-size:11px;font-weight:600">${r.nro_oc_referencia}</td>
      <td style="padding:8px;font-size:11px">${fmtDate(r.fecha_rendicion)}</td>
      <td style="padding:8px;font-size:11px">${r.proveedor_nombre || '—'}</td>
      <td style="padding:8px;font-size:11px">${r.centro_costo || '—'}</td>
      <td style="padding:8px;font-size:11px">${r.cuenta_a_cargo_de_nombre || '—'}<br><span style="font-size:10px;color:#6b7280">${r.cargo || ''}</span></td>
      <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${fmtMoney(r.fondo_asignado, r.moneda)}</td>
      <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${fmtMoney(r.total_gastos, r.moneda)}</td>
      <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;${Number(r.saldo_disponible) < 0 ? 'color:#dc2626' : ''}">${fmtMoney(r.saldo_disponible, r.moneda)}</td>
      <td style="padding:8px;text-align:center">${estadoBadge(r.estado)}</td>
      <td style="padding:8px;text-align:right;white-space:nowrap">
        <button data-abrir-rendicion="${r.id_rendicion}" title="Ver / Editar rendición"
          style="padding:4px 10px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">Abrir</button>
        <button data-pdf-rendicion="${r.id_rendicion}" title="Ver PDF en pestaña nueva"
          style="padding:4px 10px;background:#fff;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:11px">📄 PDF</button>
      </td>
    </tr>
  `).join('');

  // Bloque pendientes solo si hay alguna
  const bloquePendientes = (pendientes && pendientes.length) ? `
    <div style="margin:18px 0 12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <h4 style="margin:0;font-size:13px;color:#92400e">⏳ Pendientes de rendir</h4>
        <span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${pendientes.length}</span>
        <span style="font-size:11px;color:#6b7280">OCs ya pagadas o cerradas en efectivo que aún no tienen rendición creada.</span>
      </div>
      <div style="border:1px solid #fde68a;border-radius:6px;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#fef3c7">
            <tr>
              <th style="padding:8px;text-align:left;font-size:10px;color:#92400e;font-weight:600">N° OC</th>
              <th style="padding:8px;text-align:left;font-size:10px;color:#92400e;font-weight:600">Fecha</th>
              <th style="padding:8px;text-align:left;font-size:10px;color:#92400e;font-weight:600">Proveedor</th>
              <th style="padding:8px;text-align:left;font-size:10px;color:#92400e;font-weight:600">Centro Costo</th>
              <th style="padding:8px;text-align:right;font-size:10px;color:#92400e;font-weight:600">Total OC</th>
              <th style="padding:8px;text-align:center;font-size:10px;color:#92400e;font-weight:600">Estado OC</th>
              <th style="padding:8px;text-align:right;font-size:10px;color:#92400e;font-weight:600">Acción</th>
            </tr>
          </thead>
          <tbody>${filasPendientes}</tbody>
        </table>
      </div>
    </div>
  ` : '';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 14px">
      <div>
        <h3 style="margin:0;font-size:15px">🧾 Rendiciones de Gastos por OC</h3>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Una OC = una rendición · ${filtroDesc} · ${filtroCentroDesc} · ${lista.length} registrada(s) · ${pendientes.length} pendiente(s)</div>
      </div>
      <button id="btn-nueva-rendicion"
        title="Crear rendición desde cualquier OC (incluye no pagadas) — fallback manual"
        style="padding:9px 16px;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">+ Nueva desde OC</button>
    </div>

    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
      <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#6b7280">
        Centro de costo
        <select id="frend-centro" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;min-width:200px">
          <option value="Todos">Todos</option>
          ${centrosDisp.map(c => `<option value="${c.replace(/"/g, '&quot;')}" ${f.centro === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#6b7280">
        Año
        <select id="frend-anio" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;min-width:90px">
          ${aniosDisp.map(a => `<option value="${a}" ${String(f.anio) === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#6b7280">
        Mes
        <select id="frend-mes" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;min-width:130px">
          ${meses.map(m => `<option value="${m.v}" ${f.mes === m.v ? 'selected' : ''}>${m.l}</option>`).join('')}
        </select>
      </label>
      <button id="frend-aplicar" class="btn-secondary" style="padding:6px 14px;font-size:12px">Aplicar</button>
      <button id="frend-reset" class="btn-secondary" style="padding:6px 12px;font-size:12px;background:transparent" title="Limpiar filtros">⟲ Reset</button>
    </div>

    ${bloquePendientes}

    <div style="margin:14px 0 8px">
      <h4 style="margin:0;font-size:13px;color:#374151">📋 Rendiciones registradas</h4>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead style="background:#f9fafb">
          <tr>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">N° OC</th>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Fecha</th>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Proveedor</th>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Centro Costo</th>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Responsable</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Fondo</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Gastos</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Saldo</th>
            <th style="padding:8px;text-align:center;font-size:10px;color:#6b7280;font-weight:600">Estado</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Acciones</th>
          </tr>
        </thead>
        <tbody>${filas || `<tr><td colspan="10" style="padding:30px;text-align:center;color:#6b7280">Sin rendiciones — ${pendientes && pendientes.length ? 'usá "▶ Iniciar rendición" en una OC pendiente arriba' : 'cuando pagues una OC aparecerá acá lista para rendir'}</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-nueva-rendicion').onclick = abrirModalNueva;

  // Filtros año/mes/centro
  document.getElementById('frend-aplicar').onclick = () => {
    _filtrosRend.centro = document.getElementById('frend-centro').value;
    _filtrosRend.anio   = Number(document.getElementById('frend-anio').value);
    _filtrosRend.mes    = document.getElementById('frend-mes').value;
    renderRendiciones(panel);
  };
  document.getElementById('frend-reset').onclick = () => {
    _filtrosRend.centro = 'Todos';
    _filtrosRend.anio   = new Date().getFullYear();
    _filtrosRend.mes    = 'Todos';
    renderRendiciones(panel);
  };
  panel.querySelectorAll('button[data-abrir-rendicion]').forEach(b => {
    b.onclick = () => abrirModalEditar(Number(b.dataset.abrirRendicion));
  });
  panel.querySelectorAll('button[data-pdf-rendicion]').forEach(b => {
    b.onclick = () => abrirPDFRendicion(Number(b.dataset.pdfRendicion));
  });
  panel.querySelectorAll('button[data-iniciar-oc]').forEach(b => {
    b.onclick = async () => {
      const id_oc = Number(b.dataset.iniciarOc);
      b.disabled = true;
      b.textContent = '⏳ Creando…';
      try {
        const r = await api.rendiciones.crearDesdeOC({ id_oc });
        window.showSuccess?.('Rendición iniciada — completá los datos y firmas');
        await renderRendiciones(panel);
        abrirModalEditar(r.id_rendicion);
      } catch (err) {
        b.disabled = false;
        b.textContent = '▶ Iniciar rendición';
        showError(err?.error || err?.message || 'Error al iniciar rendición');
      }
    };
  });
}

// ─── Modal: Nueva rendición desde OC ──────────────────────────
async function abrirModalNueva() {
  let ocs = [];
  try { ocs = await api.ordenesCompra.list(); } catch (e) { return showError('Error cargando OCs'); }
  // Solo OCs en estados activos del nuevo state machine (post mig 062).
  // Excluye BORRADOR (todavía no aprobada) y ANULADA.
  const elegibles = (ocs || []).filter(o =>
    ['APROBADA', 'PAGO', 'RECEPCION', 'FACTURACION', 'TERMINADA', 'CERRADA_SIN_FACTURA'].includes(o.estado)
  );

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:10px;padding:24px;width:540px;max-width:95vw">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:16px">🧾 Nueva rendición desde OC</h3>
        <button id="btn-cerrar-nr" title="Cerrar" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>
      </div>
      <form id="form-nr" style="display:flex;flex-direction:column;gap:10px">
        <div>
          <label style="font-size:11px;font-weight:600;color:#374151">Orden de Compra *</label>
          <select id="nr-oc" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
            <option value="">— Seleccionar —</option>
            ${elegibles.map(o => `<option value="${o.id_oc}">OC ${o.nro_oc} · ${o.proveedor_nombre || '—'} · ${fmtMoney(o.total, o.moneda)} · ${o.estado}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Banco</label>
            <input id="nr-banco" placeholder="Ej: INTERBANK" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Nº operación</label>
            <input id="nr-nro-op" placeholder="48956081" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Fecha de operación</label>
            <input id="nr-fecha-op" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Cargo del responsable</label>
            <input id="nr-cargo" placeholder="Ej: ADMINISTRADOR" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
          <button type="button" id="btn-cancel-nr" style="padding:9px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer">Cancelar</button>
          <button type="submit" style="padding:9px 18px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600">Crear rendición</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.querySelector('#btn-cerrar-nr').onclick = cerrar;
  ov.querySelector('#btn-cancel-nr').onclick = cerrar;

  ov.querySelector('#form-nr').onsubmit = async (e) => {
    e.preventDefault();
    const id_oc = Number(ov.querySelector('#nr-oc').value);
    if (!id_oc) return showError('Falta seleccionar OC');
    try {
      const r = await api.rendiciones.crearDesdeOC({
        id_oc,
        banco:           ov.querySelector('#nr-banco').value.trim() || undefined,
        nro_operacion:   ov.querySelector('#nr-nro-op').value.trim() || undefined,
        fecha_operacion: ov.querySelector('#nr-fecha-op').value || undefined,
        cargo:           ov.querySelector('#nr-cargo').value.trim() || undefined,
      });
      cerrar();
      window.showSuccess?.('Rendición creada');
      // Re-render del tab + abrir el modal de edición de la nueva
      const panel = document.getElementById('adm-tab-rendiciones');
      if (panel) await renderRendiciones(panel);
      abrirModalEditar(r.id_rendicion);
    } catch (err) { showError(err?.error || err?.message || 'Error al crear'); }
  };
}

// ─── Modal: Editar / Ver rendición (items + adjuntos + firmas) ──
async function abrirModalEditar(id_rendicion) {
  let r;
  try { r = await api.rendiciones.get(id_rendicion); } catch (e) { return showError(e?.message || 'No se pudo cargar'); }

  const u = (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })();
  const idUser = u.id_usuario;
  const esGerente = u.rol === 'GERENTE';

  const ov = document.createElement('div');
  ov.id = 'modal-rendicion';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
  ov.innerHTML = `<div style="background:#fff;border-radius:10px;padding:24px;width:1100px;max-width:98vw;margin:auto"></div>`;
  const box = ov.firstElementChild;
  document.body.appendChild(ov);

  const render = () => {
    const isMine = (id) => id && id === idUser;
    const itemsHtml = (r.items || []).map((it, i) => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:6px 4px;text-align:center;font-size:11px">${i + 1}</td>
        <td style="padding:6px 4px;font-size:11px">${fmtDate(it.fecha)}</td>
        <td style="padding:6px 4px;font-size:11px">${it.nro_documento || '—'}</td>
        <td style="padding:6px 4px;font-size:11px">${it.beneficiario || '—'}</td>
        <td style="padding:6px 4px;font-size:11px">${it.concepto}</td>
        <td style="padding:6px 4px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums">${fmtMoney(it.subtotal, r.moneda)}</td>
        <td style="padding:6px 4px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums">${fmtMoney(it.igv, r.moneda)}</td>
        <td style="padding:6px 4px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums;font-weight:600">${fmtMoney(it.importe_total, r.moneda)}</td>
        <td style="padding:6px 4px;font-size:10px;color:#6b7280">${it.observaciones || ''}</td>
        <td style="padding:6px 4px;text-align:right">
          <button data-del-item="${it.id_item}" title="Eliminar línea" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:14px">×</button>
        </td>
      </tr>
    `).join('');

    const adjuntosHtml = (r.adjuntos || []).map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px">
        <div style="display:flex;gap:10px;align-items:center">
          <span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600">${a.tipo}</span>
          <a href="${a.url}" target="_blank" style="color:#1e40af;font-size:12px;text-decoration:none">${a.nombre_archivo}</a>
          <span style="font-size:10px;color:#6b7280">${a.subido_por_nombre || ''} · ${fmtDate(a.subido_at)}</span>
        </div>
        <button data-del-adj="${a.id_adjunto}" title="Eliminar adjunto" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:14px">×</button>
      </div>
    `).join('');

    const firmaCheck = (tipo, label, nombre, fecha, idFirmante) => {
      const firmado = !!nombre;
      const puedeQuitar = firmado && (isMine(idFirmante) || esGerente);
      return `
        <div style="border:1px solid ${firmado ? '#10b981' : '#d1d5db'};border-radius:8px;padding:14px;background:${firmado ? '#ecfdf5' : '#fff'}">
          <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">${label}</div>
          ${firmado
            ? `<div style="font-size:13px;font-weight:600">${nombre}</div>
               <div style="font-size:10px;color:#6b7280;margin-bottom:8px">firmado: ${fmtDate(fecha)}</div>
               ${puedeQuitar ? `<button data-desfirmar="${tipo}" style="padding:5px 10px;background:#fff;border:1px solid #dc2626;color:#dc2626;border-radius:4px;cursor:pointer;font-size:11px">Quitar firma</button>` : ''}`
            : `<label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:12px">
                 <input type="checkbox" data-firmar="${tipo}">
                 Marcar para firmar como <strong>${u.nombre || 'yo'}</strong>
               </label>`}
        </div>`;
    };

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:18px">🧾 Rendición OC ${r.nro_oc_referencia}</h3>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${r.proveedor_nombre || ''} · ${r.centro_costo} · ${fmtMoney(r.importe_recibido, r.moneda)}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="btn-pdf-r" style="padding:7px 14px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:12px">📄 Ver PDF</button>
          ${esGerente ? `<button id="btn-eliminar-r" style="padding:7px 14px;background:#fff;border:1px solid #dc2626;color:#dc2626;border-radius:5px;cursor:pointer;font-size:12px">🗑 Eliminar</button>` : ''}
          <button id="btn-cerrar-r" title="Cerrar" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>
        </div>
      </div>

      <!-- Cabecera editable -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;background:#f9fafb;padding:12px;border-radius:6px;margin-bottom:14px">
        <div>
          <label style="font-size:10px;font-weight:600;color:#374151">Banco</label>
          <input id="meta-banco" value="${r.banco || ''}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:#374151">Nº operación</label>
          <input id="meta-nro-op" value="${r.nro_operacion || ''}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:#374151">Fecha de operación</label>
          <input id="meta-fecha-op" type="date" value="${r.fecha_operacion ? String(r.fecha_operacion).slice(0,10) : ''}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:#374151">Cargo</label>
          <input id="meta-cargo" value="${r.cargo || ''}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div style="grid-column:span 4;text-align:right">
          <button id="btn-guardar-meta" style="padding:6px 14px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">💾 Guardar cabecera</button>
        </div>
      </div>

      <!-- Items -->
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <h4 style="margin:0;font-size:13px">Items de gasto</h4>
          <button id="btn-add-item" style="padding:5px 12px;background:#10b981;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">+ Agregar línea</button>
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:auto;max-height:35vh">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead style="background:#f9fafb;position:sticky;top:0">
              <tr>
                <th style="padding:6px 4px;text-align:center;font-size:10px;color:#6b7280">#</th>
                <th style="padding:6px 4px;text-align:left;font-size:10px;color:#6b7280">Fecha</th>
                <th style="padding:6px 4px;text-align:left;font-size:10px;color:#6b7280">N° Doc</th>
                <th style="padding:6px 4px;text-align:left;font-size:10px;color:#6b7280">Beneficiario</th>
                <th style="padding:6px 4px;text-align:left;font-size:10px;color:#6b7280">Concepto</th>
                <th style="padding:6px 4px;text-align:right;font-size:10px;color:#6b7280">Subtotal</th>
                <th style="padding:6px 4px;text-align:right;font-size:10px;color:#6b7280">IGV</th>
                <th style="padding:6px 4px;text-align:right;font-size:10px;color:#6b7280">Total</th>
                <th style="padding:6px 4px;text-align:left;font-size:10px;color:#6b7280">Observ.</th>
                <th style="padding:6px 4px"></th>
              </tr>
            </thead>
            <tbody>${itemsHtml || `<tr><td colspan="10" style="padding:20px;text-align:center;color:#6b7280">Sin items — usa "+ Agregar línea"</td></tr>`}</tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:18px;margin-top:8px;font-size:12px">
          <span><b>Fondo asignado:</b> ${fmtMoney(r.fondo_asignado, r.moneda)}</span>
          <span><b>Total gastos:</b> ${fmtMoney(r.total_gastos, r.moneda)}</span>
          <span style="${Number(r.saldo_disponible) < 0 ? 'color:#dc2626' : 'color:#065f46'};font-weight:700"><b>Saldo disponible:</b> ${fmtMoney(r.saldo_disponible, r.moneda)}</span>
        </div>
      </div>

      <!-- Adjuntos -->
      <div style="margin-bottom:14px">
        <h4 style="margin:0 0 8px 0;font-size:13px">Adjuntos (constancia, facturas, boletas)</h4>
        ${adjuntosHtml || '<div style="font-size:11px;color:#6b7280;padding:6px">Sin adjuntos.</div>'}
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;padding:10px;background:#f9fafb;border-radius:6px">
          <select id="adj-tipo" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
            <option value="CONSTANCIA">Constancia bancaria</option>
            <option value="FACTURA">Factura</option>
            <option value="BOLETA">Boleta</option>
            <option value="OC">OC</option>
            <option value="COMPROBANTE">Comprobante</option>
            <option value="OTRO">Otro</option>
          </select>
          <input type="file" id="adj-file" accept="image/*,application/pdf" style="flex:1;font-size:12px">
          <button id="btn-subir-adj" style="padding:7px 14px;background:#10b981;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">📎 Subir</button>
        </div>
      </div>

      <!-- Firmas -->
      <div>
        <h4 style="margin:0 0 8px 0;font-size:13px">Firmas</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          ${firmaCheck('preparado',  'Preparado por',  r.preparado_por_nombre,  r.preparado_at,  r.preparado_por_id)}
          ${firmaCheck('revisado',   'Revisado por',   r.revisado_por_nombre,   r.revisado_at,   r.revisado_por_id)}
          ${firmaCheck('autorizado', 'Autorizado por', r.autorizado_por_nombre, r.autorizado_at, r.autorizado_por_id)}
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:18px">
        <button id="btn-cerrar-r-2" style="padding:9px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:12px">Cerrar</button>
      </div>
    `;

    // Wire-up
    const snapshotCabecera = () => ({
      banco:           box.querySelector('#meta-banco').value,
      nro_operacion:   box.querySelector('#meta-nro-op').value,
      fecha_operacion: box.querySelector('#meta-fecha-op').value,
      cargo:           box.querySelector('#meta-cargo').value,
    });
    let cabeceraSnap = snapshotCabecera();
    const hayCambiosCabecera = () => {
      const c = snapshotCabecera();
      return c.banco !== cabeceraSnap.banco
          || c.nro_operacion !== cabeceraSnap.nro_operacion
          || c.fecha_operacion !== cabeceraSnap.fecha_operacion
          || c.cargo !== cabeceraSnap.cargo;
    };
    const cerrar = () => {
      if (hayCambiosCabecera() && !confirm('Tenés cambios sin guardar en la cabecera (banco / Nº operación / fecha / cargo). Si salís ahora, se pierden. ¿Salir igual?')) return;
      ov.remove();
    };
    box.querySelector('#btn-cerrar-r').onclick = cerrar;
    box.querySelector('#btn-cerrar-r-2').onclick = cerrar;
    box.querySelector('#btn-pdf-r').onclick = () => abrirPDFRendicion(id_rendicion);
    if (esGerente) {
      box.querySelector('#btn-eliminar-r')?.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar la rendición de la OC ${r.nro_oc_referencia}? Se borrarán items y adjuntos. La OC NO se toca.`)) return;
        try {
          await api.rendiciones.eliminar(id_rendicion);
          window.showSuccess?.('Rendición eliminada');
          cerrar();
          const panel = document.getElementById('adm-tab-rendiciones');
          if (panel) await renderRendiciones(panel);
        } catch (e) { showError(e?.message || 'Error'); }
      });
    }

    box.querySelector('#btn-guardar-meta').onclick = async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Guardando…';
      try {
        await api.rendiciones.editarMetadata(id_rendicion, {
          banco:           box.querySelector('#meta-banco').value,
          nro_operacion:   box.querySelector('#meta-nro-op').value,
          fecha_operacion: box.querySelector('#meta-fecha-op').value || null,
          cargo:           box.querySelector('#meta-cargo').value,
        });
        cabeceraSnap = snapshotCabecera();
        window.showSuccess?.('Cabecera guardada');
        await reload();
      } catch (err) {
        showError(err?.message || 'Error');
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    };

    box.querySelector('#btn-add-item').onclick = () => abrirModalItem(id_rendicion, reload);
    box.querySelectorAll('button[data-del-item]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('¿Eliminar esta línea?')) return;
        try { await api.rendiciones.eliminarItem(id_rendicion, Number(b.dataset.delItem)); await reload(); }
        catch (e) { showError(e?.message || 'Error'); }
      };
    });
    box.querySelectorAll('button[data-del-adj]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('¿Eliminar este adjunto?')) return;
        try { await api.rendiciones.eliminarAdjunto(id_rendicion, Number(b.dataset.delAdj)); await reload(); }
        catch (e) { showError(e?.message || 'Error'); }
      };
    });

    box.querySelector('#btn-subir-adj').onclick = async () => {
      const fi = box.querySelector('#adj-file');
      const tipo = box.querySelector('#adj-tipo').value;
      if (!fi.files || !fi.files[0]) return showError('Seleccioná un archivo');
      const btn = box.querySelector('#btn-subir-adj');
      btn.disabled = true; btn.textContent = '⏳ Subiendo…';
      try {
        await api.rendiciones.subirAdjunto(id_rendicion, fi.files[0], tipo);
        window.showSuccess?.('Adjunto subido');
        await reload();
      } catch (e) { showError(e?.message || 'Error'); }
      finally { btn.disabled = false; btn.textContent = '📎 Subir'; }
    };

    box.querySelectorAll('input[data-firmar]').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        if (!e.target.checked) return;
        const tipo = e.target.dataset.firmar;
        if (!confirm(`Vas a firmar como "${tipo.toUpperCase()}". Esto queda auditado con tu nombre y la hora. ¿Continuar?`)) {
          e.target.checked = false;
          return;
        }
        try { await api.rendiciones.firmar(id_rendicion, tipo); window.showSuccess?.('Firmado'); await reload(); }
        catch (err) { showError(err?.message || 'Error al firmar'); }
      });
    });
    box.querySelectorAll('button[data-desfirmar]').forEach(b => {
      b.onclick = async () => {
        const tipo = b.dataset.desfirmar;
        if (!confirm(`¿Quitar firma "${tipo.toUpperCase()}"?`)) return;
        try { await api.rendiciones.desfirmar(id_rendicion, tipo); window.showSuccess?.('Firma quitada'); await reload(); }
        catch (e) { showError(e?.message || 'Error'); }
      };
    });
  };

  const reload = async () => {
    try { r = await api.rendiciones.get(id_rendicion); render(); }
    catch (e) { showError(e?.message || 'Error recargando'); }
  };

  render();
}

// ─── Modal: agregar item ──────────────────────────────────────
function abrirModalItem(id_rendicion, onSaved) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:10px;padding:22px;width:520px;max-width:95vw">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="margin:0;font-size:15px">+ Agregar línea de gasto</h4>
        <button id="btn-x-it" title="Cerrar" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>
      </div>
      <form id="form-it" style="display:flex;flex-direction:column;gap:8px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:600;color:#374151">Fecha *</label>
            <input id="it-fecha" type="date" required value="${new Date().toISOString().slice(0,10)}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:600;color:#374151">Nº documento</label>
            <input id="it-nro" placeholder="F004-0052624" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:#374151">Beneficiario / Proveedor</label>
          <input id="it-bene" placeholder="Razón social" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:#374151">Concepto *</label>
          <input id="it-concepto" required placeholder="HERRAMIENTAS, ALMUERZO..." style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:600;color:#374151">Subtotal</label>
            <input id="it-sub" type="number" step="0.0001" value="0" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-align:right">
          </div>
          <div>
            <label style="font-size:10px;font-weight:600;color:#374151">IGV</label>
            <input id="it-igv" type="number" step="0.0001" value="0" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-align:right">
          </div>
          <div>
            <label style="font-size:10px;font-weight:600;color:#374151">Total *</label>
            <input id="it-total" type="number" step="0.0001" required style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-align:right;font-weight:600">
          </div>
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:#374151">Observaciones</label>
          <input id="it-obs" placeholder="Detalle del gasto..." style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button type="button" id="btn-c-it" style="padding:8px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer">Cancelar</button>
          <button type="submit" style="padding:8px 16px;background:#10b981;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600">Agregar</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.querySelector('#btn-x-it').onclick = cerrar;
  ov.querySelector('#btn-c-it').onclick = cerrar;

  // Auto-calcular total = sub + igv
  const recalc = () => {
    const sub = Number(ov.querySelector('#it-sub').value || 0);
    const igv = Number(ov.querySelector('#it-igv').value || 0);
    const totalInput = ov.querySelector('#it-total');
    if (!totalInput.dataset.tocado) totalInput.value = (sub + igv).toFixed(2);
  };
  ov.querySelector('#it-sub').oninput = recalc;
  ov.querySelector('#it-igv').oninput = recalc;
  ov.querySelector('#it-total').oninput = (e) => { e.target.dataset.tocado = '1'; };

  ov.querySelector('#form-it').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;
    const orig = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Guardando…';
    try {
      await api.rendiciones.agregarItem(id_rendicion, {
        fecha:         ov.querySelector('#it-fecha').value,
        nro_documento: ov.querySelector('#it-nro').value,
        beneficiario:  ov.querySelector('#it-bene').value,
        concepto:      ov.querySelector('#it-concepto').value,
        subtotal:      Number(ov.querySelector('#it-sub').value || 0),
        igv:           Number(ov.querySelector('#it-igv').value || 0),
        importe_total: Number(ov.querySelector('#it-total').value),
        observaciones: ov.querySelector('#it-obs').value || null,
      });
      cerrar();
      window.showSuccess?.('Línea agregada');
      onSaved && await onSaved();
    } catch (err) {
      showError(err?.message || 'Error');
      submitBtn.disabled = false;
      submitBtn.textContent = orig;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
// TAB Personal — gasto en personal (OCs cuyo proveedor es PERSONA_NATURAL)
// ═══════════════════════════════════════════════════════════════════

async function renderPersonal(panel) {
  const anioActual = new Date().getFullYear();

  // Estado local del filtro (no rendered flag para que cada tabSwitch refresque)
  let anioSel = anioActual;
  let mesSel  = '';

  panel.innerHTML = `
    <div style="margin-top:16px;background:#eff6ff;border-left:3px solid #1e40af;padding:10px 14px;border-radius:6px;font-size:12px;color:#1e3a8a;line-height:1.5">
      💡 <b>Solo OCs por trabajo realizado</b> de personas naturales (oficina, limpieza, almacenero, o trabajo en un servicio fondeado / a riesgo).
      <br>Para anticipos / dinero entregado para gastos varios usá el módulo <b>🧾 Rendiciones de Gastos</b>.
    </div>
    <div class="card" style="margin-top:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0;font-size:15px">👥 Gasto en Personal</h3>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">OCs marcadas como honorarios reales (es_honorario=TRUE).</div>
      </div>
      <span style="margin-left:14px;color:#d1d5db">|</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">Año:
        <select id="per-anio" style="padding:6px 10px;border-radius:6px;border:1px solid #d1d5db">
          ${[anioActual, anioActual - 1, anioActual - 2].map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">Mes:
        <select id="per-mes" style="padding:6px 10px;border-radius:6px;border:1px solid #d1d5db">
          <option value="">Todos</option>
          ${MESES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
        </select>
      </label>
      <button id="per-aplicar" style="padding:7px 14px;background:#111827;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Aplicar</button>
      <div style="flex:1"></div>
      <button id="per-nueva" title="Crear OC de honorario (atajo simplificado para personas naturales)"
        style="padding:9px 16px;background:#111827;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">+ Nueva OC de Honorario</button>
    </div>

    <div id="per-body" style="margin-top:14px">
      <div style="padding:30px;text-align:center;color:#6b7280">⏳ Cargando…</div>
    </div>
  `;

  const cargar = async () => {
    const body = document.getElementById('per-body');
    body.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280">⏳ Cargando…</div>';
    let data;
    try { data = await api.administracion.getPersonal(anioSel, mesSel || null); }
    catch (e) { body.innerHTML = `<div style="padding:30px;color:#dc2626">Error: ${e?.message || 'no se pudo cargar'}</div>`; return; }
    pintarPersonal(body, data);
  };

  document.getElementById('per-aplicar').onclick = async () => {
    anioSel = Number(document.getElementById('per-anio').value) || anioActual;
    mesSel  = document.getElementById('per-mes').value;
    await cargar();
  };
  document.getElementById('per-nueva').onclick = () => abrirModalOCHonorario(async () => { await cargar(); });

  await cargar();
}

function pintarPersonal(body, data) {
  const k = data.kpis || {};
  const fmt = (n) => fPEN(n);

  const estadoBadge = (e) => {
    const map = {
      BORRADOR:           { bg: '#fff7e6', fg: '#92400e' },
      APROBADA:           { bg: '#e0f2fe', fg: '#075985' },
      ENVIADA:            { bg: '#dbeafe', fg: '#1e40af' },
      RECIBIDA:           { bg: '#dcfce7', fg: '#166534' },
      RECIBIDA_PARCIAL:   { bg: '#fef9c3', fg: '#854d0e' },
      FACTURADA:          { bg: '#ede9fe', fg: '#5b21b6' },
      PAGADA:             { bg: '#dcfce7', fg: '#166534' },
      CERRADA_SIN_FACTURA:{ bg: '#fed7aa', fg: '#9a3412' },
      ANULADA:            { bg: '#fee2e2', fg: '#991b1b' },
    };
    const c = map[e] || { bg: '#f3f4f6', fg: '#374151' };
    return `<span style="background:${c.bg};color:${c.fg};padding:2px 7px;border-radius:8px;font-size:10px;font-weight:600">${e || '—'}</span>`;
  };

  const ocFila = (o) => `
    <tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:6px 8px;font-size:11px;font-weight:600">
        <a href="#" onclick="event.preventDefault();window.OC&&window.OC.verOC(${o.id_oc})" style="color:#1e40af;text-decoration:none">${o.nro_oc}</a>
      </td>
      <td style="padding:6px 8px;font-size:11px">${(String(o.fecha_emision || '').slice(0,10)).split('-').reverse().join('/')}</td>
      <td style="padding:6px 8px;font-size:11px;font-weight:600">${escapeHtml(o.persona || '—')}</td>
      <td style="padding:6px 8px;font-size:10px;color:#6b7280">${o.dni || ''}</td>
      <td style="padding:6px 8px;font-size:11px">${escapeHtml(o.centro_costo || '—')}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmt(o.moneda === 'USD' ? Number(o.total) * Number(o.tipo_cambio || 0) : o.total)}</td>
      <td style="padding:6px 8px;text-align:center">${estadoBadge(o.estado)}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">
        <button onclick="window.OC&&window.OC.verOC(${o.id_oc})" title="Ver / gestionar OC"
          style="padding:3px 9px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">👁 Ver</button>
        <button onclick="window.Logistica&&window.Logistica.descargarPDF(${o.id_oc})" title="Descargar PDF"
          style="padding:3px 9px;background:#fff;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:11px;margin-left:3px">📄</button>
      </td>
    </tr>
  `;

  const seccionOficina = `
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h4 style="margin:0;font-size:14px;color:#1e40af">🏢 Oficina Central
          <span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:8px">${k.oficina_central?.cantidad || 0} OCs</span>
        </h4>
        <span style="font-size:18px;font-weight:700;color:#1e40af;font-variant-numeric:tabular-nums">${fmt(k.oficina_central?.total || 0)}</span>
      </div>
      ${(data.oficina_central || []).length ? `
        <div style="overflow:auto;border:1px solid #e5e7eb;border-radius:6px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="background:#f9fafb"><tr>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">N° OC</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Fecha</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Persona</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">DNI</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Centro</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Total (S/)</th>
              <th style="padding:6px 8px;text-align:center;font-size:10px;color:#6b7280;font-weight:600">Estado</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Acciones</th>
            </tr></thead>
            <tbody>${data.oficina_central.map(ocFila).join('')}</tbody>
          </table>
        </div>
      ` : `<div style="padding:18px;text-align:center;color:#6b7280;background:#fafafa;border-radius:6px;font-size:12px">Sin honorarios de oficina central en este periodo</div>`}
    </div>
  `;

  const seccionServicios = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h4 style="margin:0;font-size:14px;color:#9a3412">⚙️ Personal por Servicios
          <span style="background:#fed7aa;color:#9a3412;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:8px">${k.servicios?.cantidad || 0} OCs · ${k.servicios?.centros || 0} centros</span>
        </h4>
        <span style="font-size:18px;font-weight:700;color:#9a3412;font-variant-numeric:tabular-nums">${fmt(k.servicios?.total || 0)}</span>
      </div>
      ${(data.servicios || []).length ? data.servicios.map(grp => `
        <details open style="margin-bottom:10px;border:1px solid #fed7aa;border-radius:6px">
          <summary style="padding:8px 12px;background:#fff7ed;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600">
            <span>📁 ${escapeHtml(grp.centro_costo)} <span style="color:#6b7280;font-weight:400">· ${grp.cantidad} OC(s)</span></span>
            <span style="color:#9a3412;font-variant-numeric:tabular-nums">${fmt(grp.total)}</span>
          </summary>
          <div style="overflow:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead style="background:#fafafa"><tr>
                <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">N° OC</th>
                <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">Fecha</th>
                <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">Persona</th>
                <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">DNI</th>
                <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">Centro</th>
                <th style="padding:5px 8px;text-align:right;font-size:10px;color:#6b7280">Total</th>
                <th style="padding:5px 8px;text-align:center;font-size:10px;color:#6b7280">Estado</th>
                <th style="padding:5px 8px;text-align:right;font-size:10px;color:#6b7280">Acciones</th>
              </tr></thead>
              <tbody>${grp.ocs.map(ocFila).join('')}</tbody>
            </table>
          </div>
        </details>
      `).join('') : `<div style="padding:18px;text-align:center;color:#6b7280;background:#fafafa;border-radius:6px;font-size:12px">Sin honorarios por servicios en este periodo</div>`}
    </div>
  `;

  const otrosGenerales = (data.otros_generales || []).length ? `
    <div class="card" style="margin-top:14px;border-color:#fde68a">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="margin:0;font-size:13px;color:#92400e">⚠️ Otros generales (no oficina central)</h4>
        <span style="font-size:14px;font-weight:600;color:#92400e">${fmt(k.otros_generales?.total || 0)}</span>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px">OCs tipo GENERAL con persona natural pero centro distinto a OFICINA CENTRAL — revisar si están bien clasificadas.</div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#fef3c7"><tr>
            <th style="padding:5px 8px;text-align:left;font-size:10px;color:#92400e">N° OC</th>
            <th style="padding:5px 8px;text-align:left;font-size:10px;color:#92400e">Fecha</th>
            <th style="padding:5px 8px;text-align:left;font-size:10px;color:#92400e">Persona</th>
            <th style="padding:5px 8px;text-align:left;font-size:10px;color:#92400e">DNI</th>
            <th style="padding:5px 8px;text-align:left;font-size:10px;color:#92400e">Centro</th>
            <th style="padding:5px 8px;text-align:right;font-size:10px;color:#92400e">Total</th>
            <th style="padding:5px 8px;text-align:center;font-size:10px;color:#92400e">Estado</th>
            <th style="padding:5px 8px;text-align:right;font-size:10px;color:#92400e">Acciones</th>
          </tr></thead>
          <tbody>${data.otros_generales.map(ocFila).join('')}</tbody>
        </table>
      </div>
    </div>
  ` : '';

  const topPersonas = (data.top_personas || []).length ? `
    <div class="card" style="margin-top:14px">
      <h4 style="margin:0 0 10px;font-size:13px">🏆 Top personas por monto (${data.anio}${data.mes ? ' · ' + MESES[data.mes] : ''})</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead style="background:#f9fafb"><tr>
          <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">Persona</th>
          <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">DNI</th>
          <th style="padding:5px 8px;text-align:right;font-size:10px;color:#6b7280">OCs</th>
          <th style="padding:5px 8px;text-align:right;font-size:10px;color:#6b7280">Total (S/)</th>
        </tr></thead>
        <tbody>
          ${data.top_personas.map(p => `
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:5px 8px;font-size:11px;font-weight:600">${escapeHtml(p.persona)}</td>
              <td style="padding:5px 8px;font-size:10px;color:#6b7280">${p.dni || ''}</td>
              <td style="padding:5px 8px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums">${p.cantidad}</td>
              <td style="padding:5px 8px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums;font-weight:600">${fmt(p.total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div class="card" style="padding:12px"><div style="font-size:10px;color:#6b7280;font-weight:600">TOTAL GENERAL</div><div style="font-size:20px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums">${fmt(k.total_general || 0)}</div></div>
      <div class="card" style="padding:12px;border-left:3px solid #1e40af"><div style="font-size:10px;color:#6b7280;font-weight:600">OFICINA CENTRAL</div><div style="font-size:18px;font-weight:700;color:#1e40af;margin-top:3px;font-variant-numeric:tabular-nums">${fmt(k.oficina_central?.total || 0)}</div><div style="font-size:10px;color:#6b7280">${k.oficina_central?.cantidad || 0} OCs</div></div>
      <div class="card" style="padding:12px;border-left:3px solid #9a3412"><div style="font-size:10px;color:#6b7280;font-weight:600">SERVICIOS</div><div style="font-size:18px;font-weight:700;color:#9a3412;margin-top:3px;font-variant-numeric:tabular-nums">${fmt(k.servicios?.total || 0)}</div><div style="font-size:10px;color:#6b7280">${k.servicios?.cantidad || 0} OCs · ${k.servicios?.centros || 0} centros</div></div>
      <div class="card" style="padding:12px;border-left:3px solid #92400e"><div style="font-size:10px;color:#6b7280;font-weight:600">OTROS GENERALES</div><div style="font-size:18px;font-weight:700;color:#92400e;margin-top:3px;font-variant-numeric:tabular-nums">${fmt(k.otros_generales?.total || 0)}</div><div style="font-size:10px;color:#6b7280">${k.otros_generales?.cantidad || 0} OCs</div></div>
    </div>
    ${seccionOficina}
    ${seccionServicios}
    ${otrosGenerales}
    ${topPersonas}
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Modal: Nueva OC de Honorario ─────────────────────────────────────
async function abrirModalOCHonorario(onCreated) {
  let personas = [];
  let cotizaciones = [];
  try {
    [personas, cotizaciones] = await Promise.all([
      api.administracion.listPersonas(),
      api.administracion.cotizacionesFondeadas(),
    ]);
  } catch (e) { return showError('Error cargando datos: ' + (e?.message || '')); }

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const hoy = new Date().toISOString().slice(0, 10);

  ov.innerHTML = `
    <div style="background:#fff;border-radius:10px;padding:22px;width:680px;max-width:96vw;max-height:92vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:16px">🧾 Nueva OC de Honorario</h3>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Atajo simplificado para honorarios de personas naturales (sin IGV).</div>
        </div>
        <button id="oc-cerrar" title="Cerrar" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>
      </div>

      <form id="form-oc-h" style="display:flex;flex-direction:column;gap:12px">

        <div>
          <label style="font-size:11px;font-weight:600;color:#374151">Destino *</label>
          <div style="display:flex;gap:8px;margin-top:4px">
            <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;border:2px solid #1e40af;border-radius:6px;cursor:pointer;background:#dbeafe;font-size:12px;font-weight:600;color:#1e40af">
              <input type="radio" name="destino" value="OFICINA" checked> 🏢 Oficina Central
            </label>
            <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;border:2px solid #d1d5db;border-radius:6px;cursor:pointer;background:#fff;font-size:12px;font-weight:600;color:#374151">
              <input type="radio" name="destino" value="SERVICIO"> ⚙️ Servicio (proyecto)
            </label>
          </div>
        </div>

        <div id="oc-h-cc-wrap" style="display:none">
          <label style="font-size:11px;font-weight:600;color:#374151">Servicio fondeado / a riesgo *</label>
          <select id="oc-h-cot" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
            <option value="">— Seleccionar cotización —</option>
            ${cotizaciones.length ? `
              <optgroup label="✅ APROBADAS (cliente pagó / depositará)">
                ${cotizaciones.filter(c => c.estado === 'APROBADA').map(c => `
                  <option value="${c.id_cotizacion}"
                    data-proyecto="${escapeHtml(c.proyecto || c.cliente || '')}"
                    data-cliente="${escapeHtml(c.cliente || '')}"
                    data-moneda="${c.moneda || 'PEN'}"
                    data-total="${c.total || 0}">
                    ${escapeHtml(c.nro_cotizacion)} · ${escapeHtml(c.cliente || '—')} · ${escapeHtml(c.proyecto || '')} · ${c.moneda} ${Number(c.total || 0).toFixed(2)}
                  </option>
                `).join('')}
              </optgroup>
              <optgroup label="⚠️ TRABAJO EN RIESGO (estamos pagando con capital propio)">
                ${cotizaciones.filter(c => c.estado === 'TRABAJO_EN_RIESGO').map(c => `
                  <option value="${c.id_cotizacion}"
                    data-proyecto="${escapeHtml(c.proyecto || c.cliente || '')}"
                    data-cliente="${escapeHtml(c.cliente || '')}"
                    data-moneda="${c.moneda || 'PEN'}"
                    data-total="${c.total || 0}">
                    ${escapeHtml(c.nro_cotizacion)} · ${escapeHtml(c.cliente || '—')} · ${escapeHtml(c.proyecto || '')} · ${c.moneda} ${Number(c.total || 0).toFixed(2)}
                  </option>
                `).join('')}
              </optgroup>
            ` : ''}
          </select>
          ${!cotizaciones.length ? `<div style="font-size:11px;color:#92400e;margin-top:6px;background:#fef3c7;padding:6px 8px;border-radius:4px">Sin cotizaciones APROBADAS o TRABAJO_EN_RIESGO. Pedile a Comercial que apruebe la cotización primero (o pásela a TRABAJO_EN_RIESGO si vas a pagar con capital propio).</div>` : ''}
          <div id="oc-h-cot-info" style="font-size:11px;color:#6b7280;margin-top:6px;display:none"></div>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#374151">Persona *</label>
          <div style="display:flex;gap:8px;margin-top:4px">
            <select id="oc-h-persona" required style="flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
              <option value="">— Seleccionar —</option>
              ${personas.map(p => `<option value="${p.id_proveedor}" data-tarifa="${p.tarifa_default || ''}" data-unidad="${p.unidad_default || ''}" data-dni="${p.dni || ''}">${escapeHtml(p.razon_social)}${p.dni ? ' · ' + p.dni : ''}${p.tarifa_default ? ' · S/' + Number(p.tarifa_default).toFixed(2) + '/' + (p.unidad_default || 'u') : ''}</option>`).join('')}
            </select>
            <button type="button" id="oc-h-nueva-persona" title="Crear persona nueva sin salir de este formulario"
              style="padding:8px 14px;background:#fff;border:1px solid #111827;color:#111827;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">+ Nueva persona</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Concepto *</label>
            <input id="oc-h-concepto" required placeholder="Ej: HONORARIOS SEM 03 - 2026 - 12 AL 17 DE ENERO"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-transform:uppercase">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Fecha *</label>
            <input id="oc-h-fecha" type="date" required value="${hoy}"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Cantidad *</label>
            <input id="oc-h-cant" type="number" min="0.01" step="0.01" required value="1"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Unidad *</label>
            <select id="oc-h-unidad" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
              <option value="DIAS">DIAS</option>
              <option value="HRS">HRS</option>
              <option value="MES">MES</option>
              <option value="GLB">GLB</option>
              <option value="UND">UND</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">P/U (S/) *</label>
            <input id="oc-h-pu" type="number" min="0.01" step="0.0001" required
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Total</label>
            <input id="oc-h-total" type="text" readonly tabindex="-1"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;background:#f3f4f6;font-weight:700">
          </div>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#374151">Forma de pago</label>
          <select id="oc-h-fpago" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
            <option value="CONTADO" selected>Contado (depósito en cuenta)</option>
            <option value="CREDITO">Crédito</option>
          </select>
        </div>

        <div style="background:#fef9c3;padding:8px 12px;border-radius:6px;font-size:11px;color:#854d0e">
          💡 Sin IGV (persona natural). Empresa: <b>METAL ENGINEERS SAC</b>. Moneda: <b>PEN</b>. La OC se crea en <b>BORRADOR</b> y aparece en <b>Logística → Órdenes de Compra → columna BORRADOR</b>. Desde ahí apretá "✓ Lista para aprobación" para avanzarla en el flujo.
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
          <button type="button" id="oc-h-cancel" style="padding:9px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer">Cancelar</button>
          <button type="submit" id="oc-h-submit" style="padding:9px 18px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600">Crear OC</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(ov);

  const cerrar = () => ov.remove();
  ov.querySelector('#oc-cerrar').onclick = cerrar;
  ov.querySelector('#oc-h-cancel').onclick = cerrar;

  // Toggle Oficina/Servicio
  const radios = ov.querySelectorAll('input[name="destino"]');
  const ccWrap = ov.querySelector('#oc-h-cc-wrap');
  const updateDestino = () => {
    const v = ov.querySelector('input[name="destino"]:checked').value;
    ccWrap.style.display = (v === 'SERVICIO') ? 'block' : 'none';
    // Actualizar estilos visuales
    radios.forEach(r => {
      const lbl = r.closest('label');
      if (r.checked) {
        lbl.style.borderColor = '#1e40af';
        lbl.style.background = '#dbeafe';
        lbl.style.color = '#1e40af';
      } else {
        lbl.style.borderColor = '#d1d5db';
        lbl.style.background = '#fff';
        lbl.style.color = '#374151';
      }
    });
  };
  radios.forEach(r => r.onchange = updateDestino);

  // Dropdown cotización → autopobla info
  const cotSel = ov.querySelector('#oc-h-cot');
  const cotInfo = ov.querySelector('#oc-h-cot-info');
  if (cotSel) {
    cotSel.onchange = () => {
      const opt = cotSel.options[cotSel.selectedIndex];
      if (!opt || !opt.value) { cotInfo.style.display = 'none'; return; }
      const proyecto = opt.dataset.proyecto;
      const cliente  = opt.dataset.cliente;
      cotInfo.style.display = 'block';
      cotInfo.innerHTML = `📌 Centro de costo: <b>${escapeHtml(proyecto || cliente || '—')}</b> · La OC se vinculará a esta cotización para trazabilidad.`;
    };
  }

  // Persona → autopobla tarifa/unidad
  const personaSel = ov.querySelector('#oc-h-persona');
  const cantInput  = ov.querySelector('#oc-h-cant');
  const unidadInput= ov.querySelector('#oc-h-unidad');
  const puInput    = ov.querySelector('#oc-h-pu');
  const totalInput = ov.querySelector('#oc-h-total');
  const conceptoInp= ov.querySelector('#oc-h-concepto');

  personaSel.onchange = () => {
    const opt = personaSel.options[personaSel.selectedIndex];
    if (!opt) return;
    const tarifa = opt.dataset.tarifa;
    const unidad = opt.dataset.unidad;
    if (tarifa) puInput.value = Number(tarifa).toFixed(2);
    if (unidad) unidadInput.value = unidad;
    recalcTotal();
  };

  const recalcTotal = () => {
    const t = (Number(cantInput.value) || 0) * (Number(puInput.value) || 0);
    totalInput.value = 'S/ ' + t.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  [cantInput, puInput].forEach(i => i.oninput = recalcTotal);

  // + Nueva persona inline
  ov.querySelector('#oc-h-nueva-persona').onclick = () => {
    abrirModalNuevaPersona(async (nueva) => {
      personas.push(nueva);
      const opt = document.createElement('option');
      opt.value = nueva.id_proveedor;
      opt.dataset.tarifa = nueva.tarifa_default || '';
      opt.dataset.unidad = nueva.unidad_default || '';
      opt.dataset.dni    = nueva.dni || '';
      opt.textContent = `${nueva.razon_social}${nueva.dni ? ' · ' + nueva.dni : ''}${nueva.tarifa_default ? ' · S/' + Number(nueva.tarifa_default).toFixed(2) + '/' + (nueva.unidad_default || 'u') : ''}`;
      personaSel.appendChild(opt);
      personaSel.value = nueva.id_proveedor;
      personaSel.dispatchEvent(new Event('change'));
    });
  };

  // Submit
  ov.querySelector('#form-oc-h').onsubmit = async (e) => {
    e.preventDefault();
    const destino = ov.querySelector('input[name="destino"]:checked').value;
    const id_proveedor = Number(personaSel.value);
    if (!id_proveedor) return showError('Seleccioná una persona');

    let centro_costo;
    let tipo_oc;
    let id_cotizacion = null;
    if (destino === 'OFICINA') {
      centro_costo = 'OFICINA CENTRAL';
      tipo_oc = 'GENERAL';
    } else {
      const cotSelEl = ov.querySelector('#oc-h-cot');
      if (!cotSelEl || !cotSelEl.value) return showError('Seleccioná la cotización del servicio');
      id_cotizacion = Number(cotSelEl.value);
      const opt = cotSelEl.options[cotSelEl.selectedIndex];
      centro_costo = (opt.dataset.proyecto || opt.dataset.cliente || '').trim().toUpperCase();
      if (!centro_costo) return showError('La cotización no tiene proyecto/cliente — no se puede derivar el centro de costo');
      tipo_oc = 'SERVICIO';
    }

    const cantidad = Number(cantInput.value);
    const pu = Number(puInput.value);
    const concepto = (conceptoInp.value || '').trim().toUpperCase();
    if (!concepto) return showError('Falta el concepto');
    if (cantidad <= 0 || pu <= 0) return showError('Cantidad y P/U deben ser mayores a 0');

    const subtotal = Number((cantidad * pu).toFixed(2));

    const payload = {
      fecha_emision: ov.querySelector('#oc-h-fecha').value,
      id_proveedor,
      id_cotizacion,
      centro_costo,
      tipo_oc,
      empresa: 'ME',
      moneda: 'PEN',
      tipo_cambio: 1,
      aplica_igv: false,
      forma_pago: ov.querySelector('#oc-h-fpago').value,
      dias_credito: 0,
      observaciones: '',
      lineas: [{
        descripcion: concepto,
        unidad: unidadInput.value,
        cantidad,
        precio_unitario: pu,
        subtotal,
      }],
    };

    const btn = ov.querySelector('#oc-h-submit');
    btn.disabled = true; btn.textContent = '⏳ Creando…';
    try {
      const r = await api.administracion.crearOCHonorario(payload);
      window.showSuccess?.(`OC ${r.nro_oc || ''} creada${r.autoAprobada ? ' · Auto-aprobada' : ''}`);
      cerrar();
      onCreated && await onCreated();
    } catch (err) {
      showError(err?.error || err?.message || 'Error creando OC');
      btn.disabled = false; btn.textContent = 'Crear OC';
    }
  };

  // Trigger inicial: si hay 1 sola persona, seleccionarla
  if (personas.length === 1) { personaSel.value = personas[0].id_proveedor; personaSel.dispatchEvent(new Event('change')); }
}

// ─── Modal: Nueva persona natural (alta inline desde la OC) ────────────
function abrirModalNuevaPersona(onCreated) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:10px;padding:20px;width:520px;max-width:96vw">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:15px">+ Nueva persona natural</h3>
        <button id="np-cerrar" title="Cerrar" aria-label="Cerrar" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
      </div>
      <form id="form-np" style="display:flex;flex-direction:column;gap:10px">
        <div>
          <label style="font-size:11px;font-weight:600;color:#374151">Nombre completo *</label>
          <input id="np-nombre" required placeholder="Ej: MANUEL ENRIQUE HUARANGA BUSTAMANTE"
            style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-transform:uppercase">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">DNI (8 dígitos)</label>
            <input id="np-dni" maxlength="8" pattern="[0-9]{8}" placeholder="10201757"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#374151">Teléfono</label>
            <input id="np-tel" placeholder="983 098 528"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#374151">Email</label>
          <input id="np-mail" type="email" placeholder="ej@gmail.com"
            style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:8px">
          <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:6px">💰 Tarifa default (opcional, autocompleta en futuras OCs)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:11px;color:#374151">Tarifa por unidad</label>
              <input id="np-tarifa" type="number" step="0.01" min="0" placeholder="100.00"
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
            </div>
            <div>
              <label style="font-size:11px;color:#374151">Unidad</label>
              <select id="np-unidad" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
                <option value="">—</option>
                <option value="DIAS">DIAS</option>
                <option value="HRS">HRS</option>
                <option value="MES">MES</option>
                <option value="GLB">GLB</option>
              </select>
            </div>
          </div>
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:8px">
          <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:6px">🏦 Cuenta bancaria (para depósito)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:11px;color:#374151">Banco</label>
              <input id="np-banco" placeholder="BBVA / BCP / INTERBANK"
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-transform:uppercase">
            </div>
            <div>
              <label style="font-size:11px;color:#374151">Nº cuenta</label>
              <input id="np-cta" placeholder="0011-0814-0262301430"
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
            </div>
          </div>
          <div style="margin-top:8px">
            <label style="font-size:11px;color:#374151">CCI (interbancario, opcional)</label>
            <input id="np-cci" placeholder="01181400026230143011"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
          <button type="button" id="np-cancel" style="padding:9px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer">Cancelar</button>
          <button type="submit" id="np-submit" style="padding:9px 18px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600">Crear persona</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.querySelector('#np-cerrar').onclick = cerrar;
  ov.querySelector('#np-cancel').onclick = cerrar;

  ov.querySelector('#form-np').onsubmit = async (e) => {
    e.preventDefault();
    const dni = (ov.querySelector('#np-dni').value || '').trim();
    if (dni && !/^\d{8}$/.test(dni)) return showError('DNI debe tener 8 dígitos');

    const data = {
      razon_social: (ov.querySelector('#np-nombre').value || '').trim().toUpperCase(),
      dni: dni || undefined,
      telefono: ov.querySelector('#np-tel').value.trim() || undefined,
      email:    ov.querySelector('#np-mail').value.trim() || undefined,
      tarifa_default: ov.querySelector('#np-tarifa').value || undefined,
      unidad_default: ov.querySelector('#np-unidad').value || undefined,
      banco_1_nombre: (ov.querySelector('#np-banco').value || '').trim().toUpperCase() || undefined,
      banco_1_numero: ov.querySelector('#np-cta').value.trim() || undefined,
      banco_1_cci:    ov.querySelector('#np-cci').value.trim() || undefined,
      banco_1_moneda: 'PEN',
    };
    if (!data.razon_social || data.razon_social.length < 3) return showError('Nombre obligatorio (mínimo 3 caracteres)');

    const btn = ov.querySelector('#np-submit');
    btn.disabled = true; btn.textContent = '⏳…';
    try {
      const r = await api.administracion.createPersona(data);
      window.showSuccess?.('Persona creada');
      cerrar();
      onCreated && await onCreated({
        id_proveedor: r.id_proveedor,
        razon_social: data.razon_social,
        dni: data.dni,
        tarifa_default: data.tarifa_default,
        unidad_default: data.unidad_default,
      });
    } catch (err) {
      showError(err?.error || err?.message || 'Error creando persona');
      btn.disabled = false; btn.textContent = 'Crear persona';
    }
  };
}

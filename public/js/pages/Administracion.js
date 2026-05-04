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
    <div id="adm-tab-rendiciones" class="adm-tab-content" style="display:none"></div>
    <div id="adm-tab-dashboard"   class="adm-tab-content" style="display:none"></div>
  `;
};

function initTabs() {
  TabBar({
    container: '#adm-tabbar',
    tabs: [
      { id: 'detalle',     label: '📋 Detalle por mes' },
      { id: 'rendiciones', label: '🧾 Rendiciones de Gastos' },
      { id: 'dashboard',   label: '📊 Dashboard histórico' },
    ],
    defaultTab: 'detalle',
    onChange: async (id) => {
      document.querySelectorAll('.adm-tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('adm-tab-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'detalle'     && !panel.dataset.rendered) await renderDetalle(panel);
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

async function renderRendiciones(panel) {
  panel.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280">⏳ Cargando rendiciones…</div>';
  let lista = [];
  try { lista = await api.rendiciones.list(); } catch (e) { return showError(e?.message || 'Error cargando'); }

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

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 14px">
      <div>
        <h3 style="margin:0;font-size:15px">🧾 Rendiciones de Gastos por OC</h3>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Una OC = una rendición. Adjuntá comprobantes, marcá las firmas y descargá el expediente en PDF.</div>
      </div>
      <button id="btn-nueva-rendicion" style="padding:9px 16px;background:#111827;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">+ Nueva desde OC</button>
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
        <tbody>${filas || `<tr><td colspan="10" style="padding:30px;text-align:center;color:#6b7280">Sin rendiciones — usa "+ Nueva desde OC"</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-nueva-rendicion').onclick = abrirModalNueva;
  panel.querySelectorAll('button[data-abrir-rendicion]').forEach(b => {
    b.onclick = () => abrirModalEditar(Number(b.dataset.abrirRendicion));
  });
  panel.querySelectorAll('button[data-pdf-rendicion]').forEach(b => {
    b.onclick = () => window.open(api.rendiciones.pdfUrl(Number(b.dataset.pdfRendicion)), '_blank');
  });
}

// ─── Modal: Nueva rendición desde OC ──────────────────────────
async function abrirModalNueva() {
  let ocs = [];
  try { ocs = await api.ordenesCompra.list(); } catch (e) { return showError('Error cargando OCs'); }
  // Solo OCs APROBADAS / RECIBIDAS / FACTURADAS / PAGADAS / CERRADA_SIN_FACTURA
  const elegibles = (ocs || []).filter(o =>
    ['APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL', 'RECIBIDA', 'FACTURADA', 'PAGADA', 'CERRADA_SIN_FACTURA'].includes(o.estado)
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
    const cerrar = () => ov.remove();
    box.querySelector('#btn-cerrar-r').onclick = cerrar;
    box.querySelector('#btn-cerrar-r-2').onclick = cerrar;
    box.querySelector('#btn-pdf-r').onclick = () => window.open(api.rendiciones.pdfUrl(id_rendicion), '_blank');
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

    box.querySelector('#btn-guardar-meta').onclick = async () => {
      try {
        await api.rendiciones.editarMetadata(id_rendicion, {
          banco:           box.querySelector('#meta-banco').value,
          nro_operacion:   box.querySelector('#meta-nro-op').value,
          fecha_operacion: box.querySelector('#meta-fecha-op').value || null,
          cargo:           box.querySelector('#meta-cargo').value,
        });
        window.showSuccess?.('Cabecera guardada');
        await reload();
      } catch (e) { showError(e?.message || 'Error'); }
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
    } catch (err) { showError(err?.message || 'Error'); }
  };
}

import { api } from '../services/api.js';
import { showError } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';
import { pill } from '../components/Pill.js';
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
    <div id="adm-tab-detalle"   class="adm-tab-content"></div>
    <div id="adm-tab-dashboard" class="adm-tab-content" style="display:none"></div>
  `;
};

function initTabs() {
  TabBar({
    container: '#adm-tabbar',
    tabs: [
      { id: 'detalle',   label: '📋 Detalle por mes' },
      { id: 'dashboard', label: '📊 Dashboard histórico' },
    ],
    defaultTab: 'detalle',
    onChange: async (id) => {
      document.querySelectorAll('.adm-tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('adm-tab-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'detalle'   && !panel.dataset.rendered) await renderDetalle(panel);
      if (id === 'dashboard') await renderDashboard(panel);
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
          <tbody>${resumenRows || `<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--text-secondary)">Sin datos para el período</td></tr>`}</tbody>
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

/**
 * Alertas.js — página completa de alertas operativas
 * 3 tabs:
 *   - Activas: alertas vigentes agrupadas por módulo
 *   - Histórico: log con timestamps de aparición y resolución
 *   - Dashboard: KPIs sobre cantidad, severidad, tiempos, tendencia
 *
 * Cada usuario ve solo alertas de los módulos que tiene asignados.
 * El GERENTE ve todo (filtro hecho en backend).
 */

import { api } from '../services/api.js';
import { showError } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';

const MODULO_LABEL = {
  ALMACEN:        '📦 Almacén',
  COMERCIAL:      '💼 Comercial',
  FINANZAS:       '💰 Finanzas',
  LOGISTICA:      '🚚 Logística',
  ADMINISTRACION: '👥 Administración',
};

const SEV_COLOR = {
  info:   { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', label: 'Info' },
  warn:   { bg: '#fffbeb', border: '#d97706', text: '#92400e', label: 'Advertencia' },
  danger: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b', label: 'Crítica' },
};

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const Alertas = async () => {
  setTimeout(() => init(), 50);
  return `
    <header class="header">
      <div>
        <h1>🔔 Alertas Operativas</h1>
        <span style="color:var(--text-secondary)">Estado en tiempo real de pendientes críticos. Histórico y métricas.</span>
      </div>
    </header>

    <div id="alertas-tabbar" style="margin-top:18px"></div>

    <div id="tab-activas"  class="tab-content"></div>
    <div id="tab-historico" class="tab-content" style="display:none"></div>
    <div id="tab-dashboard" class="tab-content" style="display:none"></div>
  `;
};

function init() {
  TabBar({
    container: '#alertas-tabbar',
    tabs: [
      { id: 'activas',   label: '🔴 Activas' },
      { id: 'historico', label: '📜 Histórico' },
      { id: 'dashboard', label: '📊 Dashboard' },
    ],
    defaultTab: 'activas',
    onChange: (id) => {
      ['activas', 'historico', 'dashboard'].forEach(t => {
        document.getElementById('tab-' + t).style.display = id === t ? 'block' : 'none';
      });
      if (id === 'activas')   renderActivas();
      if (id === 'historico') renderHistorico();
      if (id === 'dashboard') renderDashboard();
    },
  });
}

// ───────────────────────────────────────────────────────────────
// TAB 1: ACTIVAS
// ───────────────────────────────────────────────────────────────
async function renderActivas() {
  const cont = document.getElementById('tab-activas');
  cont.innerHTML = `<div class="card" style="margin-top:14px;padding:24px;text-align:center;color:var(--text-secondary)">Cargando…</div>`;
  try {
    const alertas = await api.alertas.list();
    if (!alertas.length) {
      cont.innerHTML = `
        <div class="card" style="margin-top:14px;padding:40px;text-align:center">
          <div style="font-size:50px">✅</div>
          <h3 style="margin:8px 0;font-size:16px">Todo en orden</h3>
          <p style="color:var(--text-secondary);font-size:13px;margin:0">No hay alertas activas en los módulos a los que tenés acceso.</p>
        </div>`;
      return;
    }

    // Agrupar por módulo
    const porMod = {};
    for (const a of alertas) {
      if (!porMod[a.modulo]) porMod[a.modulo] = [];
      porMod[a.modulo].push(a);
    }

    // KPIs por severidad
    const sevCount = { danger: 0, warn: 0, info: 0 };
    for (const a of alertas) sevCount[a.severidad] = (sevCount[a.severidad] || 0) + 1;

    cont.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px">
        ${kpiCard('Total', alertas.length, 'TOTAL', '#111')}
        ${kpiCard('Críticas', sevCount.danger, 'DANGER', '#dc2626')}
        ${kpiCard('Advertencias', sevCount.warn, 'WARN', '#d97706')}
        ${kpiCard('Informativas', sevCount.info, 'INFO', '#3b82f6')}
      </div>

      <div style="margin-top:18px;display:flex;flex-direction:column;gap:14px">
        ${Object.keys(porMod).map(modulo => `
          <div class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px">
              <strong style="font-size:14px">${MODULO_LABEL[modulo] || modulo}</strong>
              <span style="background:#f3f4f6;color:#374151;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">${porMod[modulo].length} activa(s)</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${porMod[modulo].map(renderAlertaRow).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    cont.innerHTML = `<div class="card" style="margin-top:14px;color:#dc2626;padding:20px">Error: ${e.message}</div>`;
  }
}

function renderAlertaRow(a) {
  const c = SEV_COLOR[a.severidad] || SEV_COLOR.info;
  const link = a.link ? `onclick="window.location.hash='${a.link.replace('#','')}'" style="cursor:pointer"` : '';
  return `
    <div ${link} style="background:${c.bg};border-left:4px solid ${c.border};padding:10px 12px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:${c.text}">${a.titulo}</div>
        <div style="font-size:11px;color:#374151;margin-top:2px">${a.detalle || ''}</div>
      </div>
      <span style="background:${c.border};color:#fff;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap">${c.label}</span>
    </div>
  `;
}

function kpiCard(label, value, badge, color) {
  return `
    <div class="card" style="padding:14px;border-left:4px solid ${color}">
      <div style="font-size:11px;color:var(--text-secondary);font-weight:600">${label.toUpperCase()}</div>
      <div style="font-size:26px;font-weight:700;color:${color};line-height:1.1;margin-top:2px">${value}</div>
    </div>
  `;
}

// ───────────────────────────────────────────────────────────────
// TAB 2: HISTÓRICO
// ───────────────────────────────────────────────────────────────
async function renderHistorico() {
  const cont = document.getElementById('tab-historico');
  cont.innerHTML = `<div class="card" style="margin-top:14px;padding:24px;text-align:center;color:var(--text-secondary)">Cargando histórico…</div>`;
  try {
    const log = await api.alertas.historial(200);
    if (!log.length) {
      cont.innerHTML = `
        <div class="card" style="margin-top:14px;padding:40px;text-align:center">
          <div style="font-size:50px">📜</div>
          <h3 style="margin:8px 0;font-size:16px">Sin historial todavía</h3>
          <p style="color:var(--text-secondary);font-size:13px;margin:0">El historial se acumula a medida que aparecen y se resuelven alertas.</p>
        </div>`;
      return;
    }

    cont.innerHTML = `
      <div class="card" style="margin-top:14px;padding:0;overflow:hidden">
        <div class="table-container" style="max-height:600px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="background:#f9fafb;position:sticky;top:0;z-index:1">
              <tr>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Estado</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Módulo</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Alerta</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Aparición</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Resolución</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Duración</th>
              </tr>
            </thead>
            <tbody>
              ${log.map(r => renderHistRow(r)).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <p style="margin-top:8px;font-size:11px;color:var(--text-secondary)">
        Mostrando ${log.length} registros (máx 200). Ordenados por fecha de aparición.
      </p>
    `;
  } catch (e) {
    cont.innerHTML = `<div class="card" style="margin-top:14px;color:#dc2626;padding:20px">Error: ${e.message}</div>`;
  }
}

function renderHistRow(r) {
  const c = SEV_COLOR[r.severidad] || SEV_COLOR.info;
  const activa = !r.fecha_resuelta;
  const estadoBadge = activa
    ? `<span style="background:#fef2f2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">● ACTIVA</span>`
    : `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">✓ RESUELTA</span>`;

  let duracion = '—';
  if (r.fecha_resuelta) {
    const ms = new Date(r.fecha_resuelta) - new Date(r.fecha_aparicion);
    const h = ms / 3600000;
    duracion = h < 24 ? `${h.toFixed(1)} h` : `${(h/24).toFixed(1)} d`;
  } else {
    const h = (Date.now() - new Date(r.fecha_aparicion)) / 3600000;
    duracion = h < 24 ? `${h.toFixed(1)} h ↗` : `${(h/24).toFixed(1)} d ↗`;
  }

  return `
    <tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:8px 10px">${estadoBadge}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary)">${MODULO_LABEL[r.modulo] || r.modulo}</td>
      <td style="padding:8px 10px">
        <div style="font-weight:600;font-size:12px;color:${c.text}">${r.titulo}</div>
        <div style="font-size:10px;color:#6b7280">${r.detalle || ''}</div>
      </td>
      <td style="padding:8px 10px;font-size:11px;color:#374151">${fmtDate(r.fecha_aparicion)}</td>
      <td style="padding:8px 10px;font-size:11px;color:#374151">${r.fecha_resuelta ? fmtDate(r.fecha_resuelta) : '—'}</td>
      <td style="padding:8px 10px;font-size:11px;font-weight:600">${duracion}</td>
    </tr>
  `;
}

// ───────────────────────────────────────────────────────────────
// TAB 3: DASHBOARD
// ───────────────────────────────────────────────────────────────
async function renderDashboard() {
  const cont = document.getElementById('tab-dashboard');
  cont.innerHTML = `<div class="card" style="margin-top:14px;padding:24px;text-align:center;color:var(--text-secondary)">Cargando dashboard…</div>`;
  try {
    const d = await api.alertas.dashboard();
    if (!d || !d.totales) {
      cont.innerHTML = `<div class="card" style="margin-top:14px;padding:24px;color:var(--text-secondary)">No hay datos suficientes todavía.</div>`;
      return;
    }

    const { totales, por_severidad, por_modulo, por_tipo, tendencia_30d, tiempo_promedio_resolucion_dias } = d;

    cont.innerHTML = `
      <!-- KPIs principales -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px">
        ${kpiCard('Activas', totales.activas, 'DANGER', '#dc2626')}
        ${kpiCard('Resueltas', totales.resueltas, 'OK', '#16a34a')}
        ${kpiCard('Total Histórico', totales.total_historico, 'TOTAL', '#374151')}
        ${kpiCard('T. Resolución Prom.', tiempo_promedio_resolucion_dias != null ? tiempo_promedio_resolucion_dias + ' d' : '—', 'PROM', '#3b82f6')}
      </div>

      <!-- Por severidad y módulo -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
        <div class="card" style="padding:16px">
          <h3 style="margin:0 0 12px;font-size:14px">🚨 Por severidad (activas)</h3>
          ${renderBarra('Críticas',     por_severidad.danger || 0, totales.activas, '#dc2626')}
          ${renderBarra('Advertencias', por_severidad.warn   || 0, totales.activas, '#d97706')}
          ${renderBarra('Informativas', por_severidad.info   || 0, totales.activas, '#3b82f6')}
        </div>

        <div class="card" style="padding:16px">
          <h3 style="margin:0 0 12px;font-size:14px">📂 Por módulo (activas)</h3>
          ${(por_modulo || []).length === 0
            ? '<p style="color:var(--text-secondary);font-size:12px;margin:0">Sin alertas activas.</p>'
            : por_modulo.map(m => renderBarra(MODULO_LABEL[m.modulo] || m.modulo, m.n, totales.activas, '#676767')).join('')
          }
        </div>
      </div>

      <!-- Tendencia + top tipos -->
      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-top:14px">
        <div class="card" style="padding:16px">
          <h3 style="margin:0 0 12px;font-size:14px">📈 Tendencia últimos 30 días</h3>
          ${renderTendencia(tendencia_30d || [])}
        </div>

        <div class="card" style="padding:16px">
          <h3 style="margin:0 0 12px;font-size:14px">🏆 Tipos más frecuentes</h3>
          ${(por_tipo || []).length === 0
            ? '<p style="color:var(--text-secondary);font-size:12px;margin:0">Sin datos aún.</p>'
            : por_tipo.slice(0, 8).map(t => `
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:12px">
                  <span style="color:#374151">${t.tipo}</span>
                  <span><strong>${t.total}</strong> <span style="color:#dc2626">(${t.activas} act.)</span></span>
                </div>`).join('')
          }
        </div>
      </div>
    `;
  } catch (e) {
    cont.innerHTML = `<div class="card" style="margin-top:14px;color:#dc2626;padding:20px">Error: ${e.message}</div>`;
  }
}

function renderBarra(label, value, total, color) {
  const pct = total > 0 ? (value / total * 100).toFixed(0) : 0;
  return `
    <div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span>${label}</span>
        <span><strong>${value}</strong> <span style="color:#9ca3af">(${pct}%)</span></span>
      </div>
      <div style="background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden">
        <div style="background:${color};height:100%;width:${pct}%;transition:width 0.3s"></div>
      </div>
    </div>
  `;
}

function renderTendencia(serie) {
  if (!serie.length) return '<p style="color:var(--text-secondary);font-size:12px;margin:0">Sin actividad en los últimos 30 días.</p>';
  const max = Math.max(...serie.map(p => p.n), 1);
  return `
    <div style="display:flex;align-items:flex-end;gap:2px;height:120px;margin-top:8px">
      ${serie.map(p => `
        <div title="${p.dia}: ${p.n}" style="flex:1;background:#3b82f6;height:${(p.n / max * 100).toFixed(0)}%;min-height:2px;border-radius:2px 2px 0 0"></div>
      `).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#9ca3af">
      <span>${serie[0]?.dia || ''}</span>
      <span>${serie[serie.length - 1]?.dia || ''}</span>
    </div>
  `;
}

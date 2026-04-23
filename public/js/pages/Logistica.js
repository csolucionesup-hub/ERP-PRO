/**
 * Logistica.js — Módulo 📦 Logística
 *
 * 4 tabs:
 *   🏢 Gastos Generales   — centro_costo = OFICINA CENTRAL (luz, agua, alquiler…)
 *   🔧 Gastos de Servicio — vinculado a un Servicio/Proyecto (flete, honorarios DNI)
 *   📥 Compras Almacén     — ingresa stock (link a módulo Compras que ya existe)
 *   📊 Dashboard          — KPIs por tipo, top proveedores, tendencia 12m
 *
 * Backend existente que consume:
 *   - FinanceService.createGasto / getGastos (tabla Gastos con centro_costo + tipo_gasto_logistica)
 *   - PurchaseService (tabla Compras con centro_costo)
 *   - ConfiguracionService (tasa_igv, aplica_igv)
 */

import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';
import { lineChart, barChart, chartColors, destroyChart } from '../components/charts.js';

const fPEN = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0);
const fmtDate = (d) => d ? String(d).split('T')[0] : '—';

let _cfg = null;
let _servicios = [];
let _proveedores = [];
let _gastos = [];
let _compras = [];
let _chartInstances = {};

export const Logistica = async () => {
  try {
    [_cfg, _servicios, _proveedores, _gastos, _compras] = await Promise.all([
      api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18 })),
      api.services.getServiciosActivos().catch(() => []),
      api.purchases.getProveedores().catch(() => []),
      api.finances.getGastos().catch(() => []),
      api.purchases.getCompras().catch(() => []),
    ]);
  } catch (e) {
    console.error('[Logistica] error cargando:', e);
  }

  setTimeout(() => initTabs(), 60);

  return `
    <header class="header">
      <div>
        <h1>📦 Logística</h1>
        <span style="color:var(--text-secondary)">Gestión de gastos por centro de costo, compras de almacén y OC de servicios.</span>
      </div>
    </header>
    <div id="logi-tabbar" style="margin-top:20px"></div>
    <div id="tab-general"  class="tab-content"></div>
    <div id="tab-servicio" class="tab-content" style="display:none"></div>
    <div id="tab-almacen"  class="tab-content" style="display:none"></div>
    <div id="tab-dash"     class="tab-content" style="display:none"></div>
  `;
};

function initTabs() {
  const resumen = calcularResumen();
  TabBar({
    container: '#logi-tabbar',
    tabs: [
      { id: 'general',  label: `🏢 Gastos Generales`,  badge: resumen.general.count },
      { id: 'servicio', label: `🔧 Gastos de Servicio`, badge: resumen.servicio.count },
      { id: 'almacen',  label: `📥 Compras Almacén`,    badge: resumen.almacen.count },
      { id: 'dash',     label: '📊 Dashboard' },
    ],
    defaultTab: 'general',
    onChange: (id) => {
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('tab-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'general'  && !panel.dataset.rendered) renderGastosGeneral(panel);
      if (id === 'servicio' && !panel.dataset.rendered) renderGastosServicio(panel);
      if (id === 'almacen'  && !panel.dataset.rendered) renderComprasAlmacen(panel);
      if (id === 'dash')                                renderDashboard(panel, resumen);
    },
  });

  // Namespace window para onclick handlers
  window.Logistica = { anularGasto, eliminarGasto };
}

function calcularResumen() {
  const general  = _gastos.filter(g => (g.centro_costo || '').toUpperCase().includes('OFICINA') || g.tipo_gasto_logistica === 'GENERAL');
  const servicio = _gastos.filter(g => g.tipo_gasto_logistica === 'SERVICIO' || g.id_servicio);
  const almacen  = _compras.filter(c => (c.centro_costo || '').toUpperCase().includes('ALMAC'));
  return {
    general:  { count: general.length,  total: general.reduce((s, g) => s + Number(g.total_base || g.monto_base || 0), 0), items: general },
    servicio: { count: servicio.length, total: servicio.reduce((s, g) => s + Number(g.total_base || g.monto_base || 0), 0), items: servicio },
    almacen:  { count: almacen.length,  total: almacen.reduce((s, c) => s + Number(c.total_base || 0), 0), items: almacen },
  };
}

// ─── TAB 1: Gastos Generales ──────────────────────────────────
function renderGastosGeneral(panel) {
  panel.dataset.rendered = '1';
  const r = calcularResumen();
  const hoy = new Date().toISOString().slice(0, 10);

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-top:16px;align-items:start">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:15px">Gastos Generales — Oficina Central</h3>
          <span style="font-size:11px;color:var(--text-secondary)">${r.general.count} registro(s) · ${fPEN(r.general.total)}</span>
        </div>
        ${r.general.items.length ? renderTablaGastos(r.general.items) : emptyState('Sin gastos generales registrados', 'Usa el formulario de la derecha para agregar el primero.')}
      </div>

      <div class="card">
        <h3 style="margin-bottom:14px;font-size:15px">➕ Nuevo Gasto General</h3>
        <form id="form-gasto-general" style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label>Concepto *</label>
            <input name="concepto" required placeholder="Ej: Luz marzo, Alquiler abril">
          </div>
          <div>
            <label>Proveedor *</label>
            <input name="proveedor_nombre" required placeholder="Nombre del proveedor">
          </div>
          <div>
            <label>Centro de Costo</label>
            <input name="centro_costo" value="OFICINA CENTRAL" required>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Fecha *</label><input type="date" name="fecha" value="${hoy}" required></div>
            <div><label>Moneda</label>
              <select name="moneda"><option value="PEN">PEN</option><option value="USD">USD</option></select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Monto base *</label><input type="number" step="0.01" name="monto_base" required></div>
            <div><label>Tipo cambio</label><input type="number" step="0.0001" name="tipo_cambio" value="1.0000"></div>
          </div>
          <label style="display:flex;gap:6px;align-items:center;font-size:12px">
            <input type="checkbox" name="aplica_igv" ${_cfg?.aplica_igv ? 'checked' : ''}> Aplica IGV 18%
          </label>
          <input type="hidden" name="tipo_gasto_logistica" value="GENERAL">
          <button type="submit" style="padding:10px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            Registrar gasto
          </button>
        </form>
      </div>
    </div>
  `;

  bindFormGasto('form-gasto-general');
}

// ─── TAB 2: Gastos de Servicio ────────────────────────────────
function renderGastosServicio(panel) {
  panel.dataset.rendered = '1';
  const r = calcularResumen();
  const hoy = new Date().toISOString().slice(0, 10);
  const servOpts = _servicios.map(s => `<option value="${s.id_servicio}">${s.nro_servicio || ('SRV-' + s.id_servicio)} · ${s.cliente || s.descripcion || '—'}</option>`).join('');

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-top:16px;align-items:start">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:15px">Gastos vinculados a Servicios/Proyectos</h3>
          <span style="font-size:11px;color:var(--text-secondary)">${r.servicio.count} registro(s) · ${fPEN(r.servicio.total)}</span>
        </div>
        ${r.servicio.items.length ? renderTablaGastos(r.servicio.items, true) : emptyState('Sin gastos de servicio todavía', 'Estos gastos afectan la rentabilidad del proyecto al que los vincules.')}
      </div>

      <div class="card">
        <h3 style="margin-bottom:8px;font-size:15px">➕ Nuevo Gasto de Servicio</h3>
        <p style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">
          Honorarios persona natural (con DNI) NO llevan IGV. El monto se inyecta como costo directo del proyecto.
        </p>
        <form id="form-gasto-servicio" style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label>Servicio / Proyecto *</label>
            <select name="id_servicio" required>
              <option value="">— Selecciona un proyecto —</option>
              ${servOpts || '<option value="" disabled>Sin servicios activos</option>'}
            </select>
          </div>
          <div>
            <label>Concepto *</label>
            <input name="concepto" required placeholder="Ej: Flete a Toromocho, Honorarios soldador">
          </div>
          <div>
            <label>Proveedor / Persona *</label>
            <input name="proveedor_nombre" required placeholder="Nombre o razón social">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Fecha *</label><input type="date" name="fecha" value="${hoy}" required></div>
            <div><label>Moneda</label>
              <select name="moneda"><option value="PEN">PEN</option><option value="USD">USD</option></select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Monto base *</label><input type="number" step="0.01" name="monto_base" required></div>
            <div><label>Tipo cambio</label><input type="number" step="0.0001" name="tipo_cambio" value="1.0000"></div>
          </div>
          <label style="display:flex;gap:6px;align-items:center;font-size:12px">
            <input type="checkbox" name="aplica_igv" id="chk-igv-srv"> Aplica IGV 18% (desmarcar si es Recibo por Honorarios)
          </label>
          <input type="hidden" name="centro_costo" value="SERVICIO">
          <input type="hidden" name="tipo_gasto_logistica" value="SERVICIO">
          <button type="submit" style="padding:10px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            Registrar gasto de servicio
          </button>
        </form>
      </div>
    </div>
  `;

  bindFormGasto('form-gasto-servicio');
}

// ─── TAB 3: Compras Almacén ───────────────────────────────────
function renderComprasAlmacen(panel) {
  panel.dataset.rendered = '1';
  const r = calcularResumen();

  panel.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:15px">Compras de Almacén</h3>
        <div style="display:flex;gap:10px;align-items:center">
          <span style="font-size:11px;color:var(--text-secondary)">${r.almacen.count} compra(s) · ${fPEN(r.almacen.total)}</span>
          <a href="#compras" class="btn-primary" style="padding:8px 16px;background:var(--primary-color);color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">
            ➕ Nueva Compra
          </a>
        </div>
      </div>

      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;padding:10px;background:#f9fafb;border-radius:6px">
        📦 <strong>Qué es esto:</strong> compras que ingresan materiales al almacén. El precio queda guardado como costo del insumo para el kárdex (promedio ponderado).
        Los ítems aparecen en <a href="#inventario" style="color:var(--primary-color);font-weight:600">Inventario</a> después de registrar la compra.
      </p>

      ${r.almacen.items.length ? `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
                <th style="padding:10px;text-align:left">N° Compra</th>
                <th style="padding:10px;text-align:left">Fecha</th>
                <th style="padding:10px;text-align:left">Proveedor</th>
                <th style="padding:10px;text-align:left">CC</th>
                <th style="padding:10px;text-align:right">Base</th>
                <th style="padding:10px;text-align:right">IGV</th>
                <th style="padding:10px;text-align:right">Total</th>
                <th style="padding:10px;text-align:center">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${r.almacen.items.map(c => `
                <tr style="border-bottom:1px solid #e5e7eb">
                  <td style="padding:8px;font-weight:600">C-${String(c.id_compra).padStart(4, '0')}</td>
                  <td style="padding:8px">${fmtDate(c.fecha)}</td>
                  <td style="padding:8px">${c.proveedor_nombre || c.proveedor_razon || '—'}</td>
                  <td style="padding:8px"><span style="font-size:10px;background:#e5e7eb;padding:2px 6px;border-radius:4px">${c.centro_costo || '—'}</span></td>
                  <td style="padding:8px;text-align:right">${fPEN(c.monto_base)}</td>
                  <td style="padding:8px;text-align:right;color:var(--text-secondary)">${fPEN(c.igv_base)}</td>
                  <td style="padding:8px;text-align:right;font-weight:700">${fPEN(c.total_base)}</td>
                  <td style="padding:8px;text-align:center">${estadoBadge(c.estado)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : emptyState('Sin compras de almacén',
          'Registra una compra desde <a href="#compras">el módulo Compras</a> con centro de costo "ALMACEN METAL" para que aparezca aquí.')}
    </div>
  `;
}

// ─── TAB 4: Dashboard Logística ───────────────────────────────
function renderDashboard(panel, resumen) {
  const r = resumen;
  const totalAll = r.general.total + r.servicio.total + r.almacen.total;

  // Top proveedores (por monto acumulado en gastos + compras)
  const topProv = buildTopProveedores();
  // Gasto por mes (12 meses rolling)
  const tendencia = buildTendenciaMensual();

  panel.innerHTML = `
    <div style="margin-top:16px">
      ${kpiGrid([
        { label: 'Gasto Total',       value: fPEN(totalAll),        icon: '💰' },
        { label: 'Gasto General',     value: fPEN(r.general.total), icon: '🏢' },
        { label: 'Gasto Servicio',    value: fPEN(r.servicio.total), icon: '🔧' },
        { label: 'Compras Almacén',   value: fPEN(r.almacen.total), icon: '📥' },
      ], 4)}

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:20px">
        <div class="card">
          <h3 style="margin-bottom:14px;font-size:14px">Tendencia mensual últimos 12 meses</h3>
          <div style="height:240px"><canvas id="chart-tendencia-logi"></canvas></div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:14px;font-size:14px">Distribución por tipo</h3>
          <div style="height:240px"><canvas id="chart-distribucion-logi"></canvas></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 style="margin-bottom:14px;font-size:14px">🏆 Top 10 proveedores por monto</h3>
        ${topProv.length ? `
          <div style="height:280px"><canvas id="chart-top-prov"></canvas></div>
        ` : emptyState('Sin proveedores registrados', 'Aparecerán aquí cuando registres gastos o compras.')}
      </div>
    </div>
  `;

  setTimeout(() => {
    destroyChart(_chartInstances.tendencia);
    destroyChart(_chartInstances.dist);
    destroyChart(_chartInstances.topProv);

    _chartInstances.tendencia = lineChart('#chart-tendencia-logi', tendencia, {
      label: 'Gasto total',
      color: chartColors.primary,
      currency: true,
    });

    _chartInstances.dist = (() => {
      const Chart = window.Chart;
      const ctx = document.querySelector('#chart-distribucion-logi');
      if (!Chart || !ctx) return null;
      return new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['General', 'Servicio', 'Almacén'],
          datasets: [{
            data: [r.general.total, r.servicio.total, r.almacen.total],
            backgroundColor: [chartColors.info, chartColors.warning, chartColors.success],
            borderWidth: 2, borderColor: '#fff',
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
      });
    })();

    if (topProv.length) {
      _chartInstances.topProv = barChart('#chart-top-prov', topProv, {
        colors: topProv.map(() => chartColors.primary),
      });
    }
  }, 100);
}

function buildTopProveedores() {
  const agg = {};
  _gastos.forEach(g => {
    const k = (g.proveedor_nombre || 'Sin nombre').trim();
    agg[k] = (agg[k] || 0) + Number(g.total_base || g.monto_base || 0);
  });
  _compras.forEach(c => {
    const k = (c.proveedor_nombre || c.proveedor_razon || 'Sin nombre').trim();
    agg[k] = (agg[k] || 0) + Number(c.total_base || 0);
  });
  return Object.entries(agg)
    .map(([label, valor]) => ({ label: label.slice(0, 22), valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
}

function buildTendenciaMensual() {
  const buckets = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[k] = 0;
  }
  const add = (fecha, monto) => {
    if (!fecha) return;
    const k = String(fecha).slice(0, 7);
    if (k in buckets) buckets[k] += Number(monto || 0);
  };
  _gastos.forEach(g => add(g.fecha, g.total_base || g.monto_base));
  _compras.forEach(c => add(c.fecha, c.total_base));
  return Object.entries(buckets).map(([k, v]) => {
    const [y, m] = k.split('-');
    return { mes: `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][+m-1]} ${y.slice(2)}`, valor: v };
  });
}

// ─── Helpers compartidos ──────────────────────────────────────
function renderTablaGastos(items, mostrarServicio = false) {
  return `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
            <th style="padding:10px;text-align:left">Fecha</th>
            <th style="padding:10px;text-align:left">Concepto</th>
            <th style="padding:10px;text-align:left">Proveedor</th>
            ${mostrarServicio ? '<th style="padding:10px;text-align:left">Servicio</th>' : ''}
            <th style="padding:10px;text-align:right">Base</th>
            <th style="padding:10px;text-align:right">IGV</th>
            <th style="padding:10px;text-align:right">Total</th>
            <th style="padding:10px;text-align:center">Estado</th>
            <th style="padding:10px;text-align:center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(g => `
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px">${fmtDate(g.fecha)}</td>
              <td style="padding:8px;font-weight:500">${g.concepto || '—'}</td>
              <td style="padding:8px">${g.proveedor_nombre || '—'}</td>
              ${mostrarServicio ? `<td style="padding:8px;font-size:11px;color:var(--text-secondary)">${g.id_servicio ? 'SRV-' + g.id_servicio : '—'}</td>` : ''}
              <td style="padding:8px;text-align:right">${fPEN(g.monto_base)}</td>
              <td style="padding:8px;text-align:right;color:var(--text-secondary)">${fPEN(g.igv_base)}</td>
              <td style="padding:8px;text-align:right;font-weight:700">${fPEN(g.total_base)}</td>
              <td style="padding:8px;text-align:center">${estadoBadge(g.estado)}</td>
              <td style="padding:8px;text-align:center;white-space:nowrap">
                ${g.estado !== 'ANULADO' ? `<button onclick="Logistica.anularGasto(${g.id_gasto})" style="padding:3px 8px;border:1px solid #f59e0b;background:transparent;color:#f59e0b;border-radius:4px;cursor:pointer;font-size:11px">Anular</button>` : ''}
                <button onclick="Logistica.eliminarGasto(${g.id_gasto})" style="padding:3px 8px;border:1px solid #dc2626;background:transparent;color:#dc2626;border-radius:4px;cursor:pointer;font-size:11px;margin-left:4px">×</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function estadoBadge(estado) {
  const styles = {
    PENDIENTE: { bg: '#fef3c7', fg: '#92400e' },
    PARCIAL:   { bg: '#dbeafe', fg: '#1e40af' },
    PAGADO:    { bg: '#dcfce7', fg: '#166534' },
    COBRADO:   { bg: '#dcfce7', fg: '#166534' },
    ANULADO:   { bg: '#e5e7eb', fg: '#374151' },
  };
  const s = styles[estado] || styles.PENDIENTE;
  return `<span style="background:${s.bg};color:${s.fg};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${estado || 'PENDIENTE'}</span>`;
}

function emptyState(titulo, subtitulo = '') {
  return `<div style="padding:40px;text-align:center;color:var(--text-secondary)">
    <div style="font-size:32px;margin-bottom:10px">📋</div>
    <div style="font-size:14px;font-weight:600;color:#555">${titulo}</div>
    ${subtitulo ? `<div style="font-size:12px;margin-top:6px">${subtitulo}</div>` : ''}
  </div>`;
}

function bindFormGasto(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const aplicaIgv = fd.get('aplica_igv') === 'on';
    const moneda = fd.get('moneda') || 'PEN';
    const montoBase = Number(fd.get('monto_base')) || 0;
    const tasa = Number(_cfg?.tasa_igv || 18) / 100;
    const igvBase = aplicaIgv ? Number((montoBase * tasa).toFixed(2)) : 0;

    const payload = {
      concepto: fd.get('concepto'),
      proveedor_nombre: fd.get('proveedor_nombre'),
      centro_costo: fd.get('centro_costo') || 'OFICINA CENTRAL',
      tipo_gasto_logistica: fd.get('tipo_gasto_logistica') || 'GENERAL',
      fecha: fd.get('fecha'),
      moneda,
      tipo_cambio: Number(fd.get('tipo_cambio')) || 1,
      monto_base: montoBase,
      igv_base: igvBase,
      total_base: Number((montoBase + igvBase).toFixed(2)),
      id_servicio: fd.get('id_servicio') ? Number(fd.get('id_servicio')) : null,
    };

    try {
      await api.finances.createGasto(payload);
      showSuccess('Gasto registrado');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      showError(err?.error || err?.message || 'Error al registrar');
    }
  };
}

async function anularGasto(id) {
  if (!confirm('¿Anular este gasto? Se revertirán sus costos si estaba vinculado a un servicio.')) return;
  try {
    await api.finances.anularGasto(id);
    showSuccess('Gasto anulado');
    setTimeout(() => location.reload(), 600);
  } catch (err) { showError(err?.error || err?.message || 'Error'); }
}

async function eliminarGasto(id) {
  if (!confirm('¿Eliminar definitivamente este gasto? Esta acción no se puede deshacer.')) return;
  try {
    await api.finances.deleteGasto(id);
    showSuccess('Gasto eliminado');
    setTimeout(() => location.reload(), 600);
  } catch (err) { showError(err?.error || err?.message || 'Error'); }
}

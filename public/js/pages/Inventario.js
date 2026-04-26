import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';
import { kpiGrid } from '../components/KpiCard.js';
import { TabBar } from '../components/TabBar.js';
import { lineChart, barChart, donutChart, chartColors, destroyChart } from '../components/charts.js';

const CATEGORIA_BADGE = {
  Material:    'background:#3b82f6;color:white',
  Consumible:  'background:#f97316;color:white',
  Herramienta: 'background:#6b7280;color:white',
  Equipo:      'background:#8b5cf6;color:white',
  EPP:         'background:#22c55e;color:white',
};

const fPEN = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0);
const fNum = (v) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(v) || 0);
const fDate = (d) => d ? String(d).split('T')[0] : '—';

let _inventario = [];
let _servicios = [];
let _dashData = null;
let _chartInstances = {};

export const Inventario = async () => {
  try {
    [_inventario, _servicios] = await Promise.all([
      api.inventory.getInventario(),
      api.services.getServicios(),
    ]);
    if (!Array.isArray(_inventario)) _inventario = [];
    if (!Array.isArray(_servicios)) _servicios = [];
  } catch (err) {
    console.error('[Inventario] error:', err);
  }

  setTimeout(() => initTabs(), 60);

  return `
    <header class="header">
      <div>
        <h1>📦 Almacén — Control de Inventario</h1>
        <span style="color:var(--text-secondary)">Catálogo, costo móvil promedio, kárdex y análisis de rotación.</span>
      </div>
    </header>
    <div id="inv-tabbar" style="margin-top:20px"></div>
    <div id="inv-tab-catalogo"  class="inv-tab-content"></div>
    <div id="inv-tab-dashboard" class="inv-tab-content" style="display:none"></div>
  `;
};

function initTabs() {
  TabBar({
    container: '#inv-tabbar',
    tabs: [
      { id: 'catalogo',  label: '📋 Catálogo', badge: _inventario.length },
      { id: 'dashboard', label: '📊 Dashboard' },
    ],
    defaultTab: 'catalogo',
    onChange: async (id) => {
      document.querySelectorAll('.inv-tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('inv-tab-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'catalogo'  && !panel.dataset.rendered) renderCatalogo(panel);
      if (id === 'dashboard') await renderDashboard(panel);
    },
  });
  window.Inventario = { verKardex, eliminarItem };
}

// ─── TAB Catálogo ────────────────────────────────────────────────────
function renderCatalogo(panel) {
  panel.dataset.rendered = '1';

  const valorTotal = _inventario.reduce((s, i) => s + Number(i.valorizado || 0), 0);
  const itemsBajoMin = _inventario.filter(i => Number(i.stock_actual) <= Number(i.stock_minimo) && Number(i.stock_actual) > 0).length;
  const itemsSinStock = _inventario.filter(i => Number(i.stock_actual) <= 0).length;

  const rows = _inventario.map(i => {
    const badgeStyle = CATEGORIA_BADGE[i.categoria] || 'background:#6b7280;color:white';
    return `
      <tr data-cat="${i.categoria || ''}">
        <td style="font-size:11px; color:var(--text-secondary)">${i.sku}</td>
        <td><strong>${i.nombre}</strong><br><span style="font-size:10px;padding:2px 6px;border-radius:10px;${badgeStyle}">${i.categoria || 'Material'}</span></td>
        <td><span class="status-badge status-pendiente">${i.unidad}</span></td>
        <td style="text-align:right" class="${i.stock_actual <= i.stock_minimo ? 'color-error' : ''}">
          <strong>${fNum(i.stock_actual)}</strong>
          <br><span style="font-size:10px; color:var(--text-secondary)">Mín: ${fNum(i.stock_minimo)}</span>
        </td>
        <td style="text-align:right">${fPEN(i.costo_promedio || 0)}</td>
        <td style="text-align:right">${fPEN(i.valorizado || 0)}</td>
        <td style="display:flex;gap:4px">
          <button class="action-btn" onclick="window.verKardex(${i.id_item}, '${(i.nombre || '').replace(/'/g, "\\'")}')">Kárdex</button>
          <button class="action-btn" style="background:#ef4444;color:white" onclick="window.eliminarItem(${i.id_item}, '${(i.nombre || '').replace(/'/g, "\\'")}')">×</button>
        </td>
      </tr>
    `;
  }).join('');

  const servicesOptions = _servicios.filter(s => s.estado !== 'COBRADO').map(s => `<option value="${s.id_servicio}">${s.codigo} - ${s.nombre}</option>`).join('');
  const itemOptions = _inventario.filter(i => i.stock_actual > 0).map(i => `<option value="${i.id_item}">${i.nombre} (${i.stock_actual} disp)</option>`).join('');

  const btnStyle = 'padding:6px 12px; border:1px solid var(--border-light); border-radius:4px; cursor:pointer; font-size:12px; background:var(--bg-app)';

  panel.innerHTML = `
    <div style="margin-top:16px">
      ${kpiGrid([
        { label: 'Valor Total Stock', value: fPEN(valorTotal), icon: '💎' },
        { label: 'Ítems Catalogados', value: _inventario.length, icon: '📦' },
        { label: 'Bajo Stock Mínimo', value: itemsBajoMin, icon: '⚠️', changeType: itemsBajoMin > 0 ? 'negative' : 'neutral' },
        { label: 'Sin Stock', value: itemsSinStock, icon: '🚫', changeType: itemsSinStock > 0 ? 'negative' : 'neutral' },
      ], 4)}
    </div>

    <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
      <span style="font-size:12px; color:var(--text-secondary); font-weight:600">Filtrar:</span>
      <button class="btn-filtro-cat" data-cat="" style="${btnStyle}">Todos</button>
      <button class="btn-filtro-cat" data-cat="Material" style="${btnStyle}">Material</button>
      <button class="btn-filtro-cat" data-cat="Consumible" style="${btnStyle}">Consumible</button>
      <button class="btn-filtro-cat" data-cat="Herramienta" style="${btnStyle}">Herramienta</button>
      <button class="btn-filtro-cat" data-cat="Equipo" style="${btnStyle}">Equipo</button>
      <button class="btn-filtro-cat" data-cat="EPP" style="${btnStyle}">EPP</button>
    </div>

    <div style="display:flex; gap:20px; align-items:flex-start; margin-top:16px">
      <div class="table-container" style="flex:2">
        <table>
          <thead>
            <tr>
              <th>SKU</th><th>Insumo / Categoría</th><th>Unidad</th>
              <th style="text-align:right">Stock</th>
              <th style="text-align:right">Costo Und</th>
              <th style="text-align:right">Valoración</th>
              <th>Tracking</th>
            </tr>
          </thead>
          <tbody id="tbody-inv">
            ${rows || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-secondary)">Sin ítems en almacén</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="flex:1; display:flex; flex-direction:column; gap:20px;">
        <div class="card">
          <h3 style="margin-bottom:15px;font-weight:600;font-size:15px">➕ Añadir Insumo Base</h3>
          <form id="form-insumo" style="display:flex;flex-direction:column;gap:10px">
            <select name="categoria" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
              <option value="Material">Material</option>
              <option value="Consumible">Consumible</option>
              <option value="Herramienta">Herramienta</option>
              <option value="Equipo">Equipo</option>
              <option value="EPP">EPP</option>
            </select>
            <input name="nombre" placeholder="Nombre Comercial" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
            <select name="unidad" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
              <option value="UND">UND</option><option value="KG">KG</option><option value="M">M</option>
              <option value="M2">M2</option><option value="M3">M3</option><option value="PAR">PAR</option>
              <option value="LOTE">LOTE</option><option value="HRA">HRA</option><option value="DIA">DIA</option><option value="NIU">NIU</option>
            </select>
            <label style="font-size:12px;color:var(--text-secondary)">Alerta de Stock Mínimo</label>
            <input name="stock_minimo" type="number" step="0.01" value="10" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
            <p style="font-size:11px;color:var(--text-secondary);margin:0">El SKU se genera automáticamente según categoría.</p>
            <button type="submit" style="padding:10px;border:none;background:var(--bg-sidebar);border-radius:6px;cursor:pointer;font-weight:bold;color:black">Crear Catálogo</button>
          </form>
        </div>

        <div class="card" style="border-left:4px solid var(--danger)">
          <h3 style="margin-bottom:15px;font-weight:600;font-size:15px">📤 Retirar Insumos hacia Servicio</h3>
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:15px">Resta stock e imputa costo al servicio para no inflar utilidades.</p>
          <form id="form-consumo" style="display:flex;flex-direction:column;gap:10px">
            <select name="id_servicio" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
              <option value="">— Servicio destino —</option>
              ${servicesOptions}
            </select>
            <select name="id_item" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
              <option value="">— Material utilizado —</option>
              ${itemOptions}
            </select>
            <input name="cantidad" type="number" step="0.01" placeholder="Volumen retirado" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
            <button type="submit" style="padding:12px;border:none;background:var(--danger);color:white;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px">Mermar Material</button>
          </form>
        </div>
      </div>
    </div>
  `;

  // Filtro categoría
  panel.querySelectorAll('.btn-filtro-cat').forEach(btn => {
    btn.onclick = () => {
      panel.querySelectorAll('.btn-filtro-cat').forEach(b => { b.style.background = 'var(--bg-app)'; b.style.color = ''; });
      btn.style.background = 'var(--primary-color)'; btn.style.color = 'white';
      const cat = btn.dataset.cat;
      panel.querySelectorAll('#tbody-inv tr').forEach(tr => {
        tr.style.display = (!cat || tr.dataset.cat === cat) ? '' : 'none';
      });
    };
  });

  // Form Nuevo Insumo
  const formItem = panel.querySelector('#form-insumo');
  if (formItem) formItem.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      nombre: e.target.nombre.value,
      categoria: e.target.categoria.value,
      unidad: e.target.unidad.value,
      stock_minimo: Number(e.target.stock_minimo.value) || 10
    };
    try {
      const res = await api.inventory.createInventarioItem(data);
      showSuccess('Insumo registrado con SKU: ' + res.sku);
      window.location.reload();
    } catch (err) {
      showError(err.detalles?.[0] || err.error || 'Error al registrar insumo');
    }
  };

  // Form Consumo
  const formConsumo = panel.querySelector('#form-consumo');
  if (formConsumo) formConsumo.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      id_servicio: Number(e.target.id_servicio.value),
      detalles: [{ id_item: Number(e.target.id_item.value), cantidad: Number(e.target.cantidad.value) }]
    };
    try {
      await api.inventory.consumirInventario(data);
      showSuccess('Almacén rebajado y costo transferido al servicio');
      window.location.reload();
    } catch (err) {
      showError(err.detalles?.[0] || err.error || 'Error al registrar consumo');
    }
  };
}

// ─── TAB Dashboard ───────────────────────────────────────────────────
async function renderDashboard(panel) {
  Object.values(_chartInstances).forEach(destroyChart);
  _chartInstances = {};

  if (!_dashData) {
    panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Cargando dashboard…</div>';
    try {
      _dashData = await api.inventory.getDashboard();
    } catch (e) {
      panel.innerHTML = `<div style="padding:40px;color:var(--danger)">Error cargando dashboard: ${e.message}</div>`;
      return;
    }
  }

  const d = _dashData;
  const k = d.kpis || {};
  const cm = d.comparativa_mes || {};
  const actEnt = Number(cm.actual?.entradas || 0);
  const actSal = Number(cm.actual?.salidas || 0);
  const prevEnt = Number(cm.anterior?.entradas || 0);
  const prevSal = Number(cm.anterior?.salidas || 0);
  const deltaEnt = prevEnt > 0 ? ((actEnt - prevEnt) / prevEnt * 100) : 0;
  const deltaSal = prevSal > 0 ? ((actSal - prevSal) / prevSal * 100) : 0;
  const fmtDelta = (d) => (d >= 0 ? '+' : '') + d.toFixed(0) + '%';
  const colorDelta = (d) => d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#6b7280';

  panel.innerHTML = `
    <div style="margin-top:16px">
      ${kpiGrid([
        { label: 'Valor Total Stock', value: fPEN(k.valor_total_stock || 0), icon: '💎' },
        { label: 'Ítems Catalogados', value: k.items_catalogados || 0, icon: '📦' },
        { label: 'Bajo Stock Mínimo', value: k.items_bajo_minimo || 0, icon: '⚠️', changeType: (k.items_bajo_minimo > 0) ? 'negative' : 'neutral' },
        { label: 'Sin Stock', value: k.items_sin_stock || 0, icon: '🚫', changeType: (k.items_sin_stock > 0) ? 'negative' : 'neutral' },
      ], 4)}
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 14px;font-size:15px">📅 Comparativa mes a mes — ${cm.anio_mes_actual || ''} vs ${cm.anio_mes_anterior || ''}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div style="padding:12px;background:#f0f9ff;border-left:4px solid #0284c7;border-radius:6px">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;font-weight:600">Entradas (compras al stock)</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${fNum(actEnt)} <span style="font-size:11px;color:var(--text-secondary);font-weight:400">unidades</span></div>
          <div style="font-size:12px;margin-top:4px">vs ${fNum(prevEnt)} mes anterior <span style="color:${colorDelta(deltaEnt)};font-weight:600">${fmtDelta(deltaEnt)}</span></div>
        </div>
        <div style="padding:12px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;font-weight:600">Salidas (consumo a servicios)</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${fNum(actSal)} <span style="font-size:11px;color:var(--text-secondary);font-weight:400">unidades</span></div>
          <div style="font-size:12px;margin-top:4px">vs ${fNum(prevSal)} mes anterior <span style="color:${colorDelta(deltaSal)};font-weight:600">${fmtDelta(deltaSal)}</span></div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-top:20px">
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px">📈 Tendencia 12 meses — Entradas vs Salidas</h3>
        <canvas id="ch-trend" style="max-height:300px"></canvas>
      </div>
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px">🎯 Distribución por categoría</h3>
        <canvas id="ch-cat" style="max-height:300px"></canvas>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px">🔥 Top 10 más rotados (últimos 6 meses)</h3>
        ${renderTopList(d.top_rotados, 'cantidad_total', '', true)}
      </div>
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px">💰 Top 10 más comprados (últimos 6 meses)</h3>
        ${renderTopList(d.top_comprados, 'valor_total', 'S/ ', false)}
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="margin:0 0 14px;font-size:15px">🪦 Inventario muerto — sin movimiento >90 días</h3>
      ${renderInventarioMuerto(d.sin_movimiento)}
    </div>
  `;

  // Render charts
  setTimeout(() => {
    // Tendencia 12m
    const trendData = (d.tendencia_12m || []).map(r => ({
      mes: r.mes,
      entradas: Number(r.entradas) || 0,
      salidas: Number(r.salidas) || 0,
    }));
    const ctxTrend = document.getElementById('ch-trend');
    if (ctxTrend && window.Chart) {
      _chartInstances.trend = new window.Chart(ctxTrend, {
        type: 'line',
        data: {
          labels: trendData.map(r => r.mes),
          datasets: [
            { label: 'Entradas', data: trendData.map(r => r.entradas), borderColor: '#0284c7', backgroundColor: '#0284c733', fill: true, tension: 0.3 },
            { label: 'Salidas',  data: trendData.map(r => r.salidas),  borderColor: '#dc2626', backgroundColor: '#dc262633', fill: true, tension: 0.3 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
      });
    }

    // Distribución categoría
    const catData = (d.por_categoria || []).map(r => ({ label: r.categoria, valor: Number(r.valor) || 0 }));
    if (catData.length > 0) {
      _chartInstances.cat = donutChart('#ch-cat', catData, { currency: true });
    }
  }, 50);
}

function renderTopList(items, valueKey, prefix, showCantOnly) {
  if (!items || items.length === 0) {
    return '<div style="padding:30px;text-align:center;color:var(--text-secondary);font-size:13px">Sin datos en últimos 6 meses</div>';
  }
  const max = Math.max(...items.map(i => Number(i[valueKey]) || 0));
  return items.map((it, i) => {
    const valor = Number(it[valueKey]) || 0;
    const pct = max > 0 ? (valor / max * 100) : 0;
    return `
      <div style="margin-bottom:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px">
          <span><strong>${i + 1}.</strong> ${it.nombre} <span style="color:var(--text-secondary);font-size:11px">(${it.unidad})</span></span>
          <strong>${prefix}${fNum(valor)}</strong>
        </div>
        <div style="background:#f3f4f6;border-radius:3px;height:6px;overflow:hidden">
          <div style="background:var(--primary-color);height:100%;width:${pct}%"></div>
        </div>
        ${showCantOnly && it.num_movimientos ? `<div style="font-size:10px;color:var(--text-secondary)">${it.num_movimientos} movimiento(s)</div>` : ''}
      </div>
    `;
  }).join('');
}

function renderInventarioMuerto(items) {
  if (!items || items.length === 0) {
    return '<div style="padding:20px;text-align:center;color:#16a34a;font-size:13px">✅ Todo el stock con movimiento reciente</div>';
  }
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#fafafa;border-bottom:2px solid #e5e7eb">
        <th style="padding:8px;text-align:left">SKU</th>
        <th style="padding:8px;text-align:left">Item</th>
        <th style="padding:8px;text-align:left">Categoría</th>
        <th style="padding:8px;text-align:right">Stock</th>
        <th style="padding:8px;text-align:right">Valorizado</th>
        <th style="padding:8px;text-align:left">Último movim.</th>
      </tr></thead>
      <tbody>
        ${items.map(it => `
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:8px;color:var(--text-secondary)">${it.sku}</td>
            <td style="padding:8px;font-weight:600">${it.nombre}</td>
            <td style="padding:8px"><span style="font-size:10px;padding:2px 6px;border-radius:8px;${CATEGORIA_BADGE[it.categoria] || ''}">${it.categoria}</span></td>
            <td style="padding:8px;text-align:right">${fNum(it.stock_actual)}</td>
            <td style="padding:8px;text-align:right;color:#dc2626;font-weight:600">${fPEN(it.valorizado || 0)}</td>
            <td style="padding:8px;font-size:11px">${fDate(it.ultimo_movimiento)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ─── Window handlers (kárdex + eliminar) ────────────────────────────
async function verKardex(id, name) {
  try {
    const logs = await api.inventory.getKardex(id);
    const rows = logs.length ? logs.map(l => {
      const esEntrada = l.tipo_movimiento === 'ENTRADA';
      const tipoBadge = `<span style="background:${esEntrada ? '#dcfce7' : '#fee2e2'};color:${esEntrada ? '#166534' : '#991b1b'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${l.tipo_movimiento}</span>`;
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px;font-size:12px">${fDate(l.fecha_movimiento)}</td>
        <td style="padding:8px;text-align:center">${tipoBadge}</td>
        <td style="padding:8px;font-size:11px;color:var(--text-secondary)">${l.referencia_tipo || '—'}#${l.referencia_id || '—'}</td>
        <td style="padding:8px;text-align:right;font-weight:${esEntrada ? '600' : '500'};color:${esEntrada ? '#166534' : '#991b1b'}">${esEntrada ? '+' : '−'} ${fNum(l.cantidad)}</td>
        <td style="padding:8px;text-align:right;font-weight:700">${fNum(l.saldo_posterior)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="padding:40px;text-align:center;color:var(--text-secondary)">Sin movimientos registrados</td></tr>';

    const html = `
      <div id="ov-kardex" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px">
        <div style="background:white;border-radius:12px;padding:28px;width:720px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,0.25)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <div>
              <h3 style="margin:0;font-size:18px">📊 Kárdex de ${name}</h3>
              <p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary)">${logs.length} movimiento(s) registrados</p>
            </div>
            <button onclick="document.getElementById('ov-kardex').remove()" style="background:#f3f4f6;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600">Cerrar</button>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
              <th style="padding:10px;text-align:left">Fecha</th>
              <th style="padding:10px;text-align:center">Tipo</th>
              <th style="padding:10px;text-align:left">Referencia</th>
              <th style="padding:10px;text-align:right">Cantidad</th>
              <th style="padding:10px;text-align:right">Saldo</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) {
    showError('No se pudo extraer Kárdex');
  }
}

async function eliminarItem(id, nombre) {
  if (!confirm(`¿Eliminar permanentemente "${nombre}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    await api.inventory.deleteInventarioItem(id);
    window.location.reload();
  } catch (e) {
    showError(e.error || e.message || 'Error al eliminar');
  }
}

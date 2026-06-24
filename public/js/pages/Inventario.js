import { api } from '../services/api.js';
import { showSuccess, showError, tip, escapeHtml, escapeAttr } from '../services/ui.js';
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

// Mig 070 — badges para marca empresa (Metal Engineers vs Perfotools).
// COMPARTIDO = se imputa según la cotización; default histórico al crear item.
const MARCA_BADGE = {
  METAL:      'background:#000000;color:#fff',
  PERFOTOOLS: 'background:#dc2626;color:#fff',
  COMPARTIDO: 'background:#e5e7eb;color:#374151',
};

const fPEN = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0);
const fNum = (v) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(v) || 0);
const fDate = (d) => d ? String(d).split('T')[0] : '—';

let _inventario = [];
let _cotizacionesFondeadas = [];
let _dashData = null;
let _chartInstances = {};

export const Inventario = async () => {
  try {
    [_inventario, _cotizacionesFondeadas] = await Promise.all([
      api.inventory.getInventario(),
      api.inventory.cotizacionesFondeadas(),
    ]);
    if (!Array.isArray(_inventario)) _inventario = [];
    if (!Array.isArray(_cotizacionesFondeadas)) _cotizacionesFondeadas = [];
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
  window.Inventario = { verKardex, eliminarItem, editarMetadataItem, corregirAsignacionItem };
}

// ─── TAB Catálogo ────────────────────────────────────────────────────
function renderCatalogo(panel) {
  panel.dataset.rendered = '1';

  const valorTotal = _inventario.reduce((s, i) => s + Number(i.valorizado || 0), 0);
  const itemsBajoMin = _inventario.filter(i => Number(i.stock_actual) <= Number(i.stock_minimo) && Number(i.stock_actual) > 0).length;
  const itemsSinStock = _inventario.filter(i => Number(i.stock_actual) <= 0).length;

  // Agrupar items por familia (mig 070). Items con misma familia se renderizan
  // bajo un mismo encabezado para reducir confusión entre variantes (ej:
  // 6 SOLDADURAs distintas se ven como una sola sección agrupada).
  // El orden ya viene "familia asc, nombre asc" del backend.
  const renderRowsAgrupados = (items) => {
    if (!items.length) {
      return '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-secondary)">Sin ítems en almacén</td></tr>';
    }
    let html = '';
    let familiaActual = null;
    items.forEach(i => {
      const fam = i.familia || '(SIN FAMILIA)';
      if (fam !== familiaActual) {
        familiaActual = fam;
        const nItems = items.filter(x => (x.familia || '(SIN FAMILIA)') === fam).length;
        html += `
          <tr class="fam-header" data-fam="${fam}" style="background:#f3f4f6;border-top:2px solid #d1d5db">
            <td colspan="7" style="padding:7px 12px;font-size:11px;font-weight:700;color:#374151;letter-spacing:.4px">
              📂 ${fam} <span style="color:#6b7280;font-weight:500">· ${nItems} variante${nItems !== 1 ? 's' : ''}</span>
            </td>
          </tr>`;
      }
      const badgeStyle  = CATEGORIA_BADGE[i.categoria] || 'background:#6b7280;color:white';
      const marca       = i.marca || 'COMPARTIDO';
      const marcaStyle  = MARCA_BADGE[marca] || MARCA_BADGE.COMPARTIDO;
      const marcaLabel  = marca === 'METAL' ? 'METAL' : marca === 'PERFOTOOLS' ? 'PERFO' : 'COMP';
      html += `
        <tr data-cat="${escapeHtml(i.categoria || '')}" data-marca="${escapeHtml(marca)}" data-fam="${escapeHtml(fam)}">
          <td style="font-size:11px; color:var(--text-secondary)">${escapeHtml(i.sku)}</td>
          <td>
            <strong>${escapeHtml(i.nombre)}</strong>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">
              <span style="font-size:10px;padding:2px 6px;border-radius:10px;${badgeStyle}">${escapeHtml(i.categoria || 'Material')}</span>
              <span title="Marca/empresa contable. COMPARTIDO = se imputa según la cotización al consumir." style="font-size:10px;padding:2px 6px;border-radius:10px;${marcaStyle}">${marcaLabel}</span>
            </div>
          </td>
          <td><span class="status-badge status-pendiente">${escapeHtml(i.unidad)}</span></td>
          <td style="text-align:right" class="${i.stock_actual <= i.stock_minimo ? 'color-error' : ''}">
            <strong>${fNum(i.stock_actual)}</strong>
            <br><span style="font-size:10px; color:var(--text-secondary)">Mín: ${fNum(i.stock_minimo)}</span>
          </td>
          <td style="text-align:right">${fPEN(i.costo_promedio || 0)}</td>
          <td style="text-align:right">${fPEN(i.valorizado || 0)}</td>
          <td style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="action-btn" title="Ver el kárdex completo del ítem: todas las entradas/salidas con fecha, cantidad, precio y saldo. Sirve para auditar el stock o explicar diferencias." onclick="window.Inventario.verKardex(${i.id_item}, '${(i.nombre || '').replace(/'/g, "\\'")}')">Kárdex</button>
            <button class="action-btn" style="background:#fff;color:#3b82f6;border:1px solid #93c5fd" title="Edición segura: corregir nombre, categoría, unidad, stock mínimo, familia o marca. NO toca el stock actual ni el costo promedio." onclick="window.Inventario.editarMetadataItem(${i.id_item}, '${(i.nombre || '').replace(/'/g, "\\'")}')">✎</button>
            <button class="action-btn" style="background:#ef4444;color:white" title="Eliminar el ítem. Modo NORMAL bloquea si tiene stock, compras o costos. Modo FORZADO (solo GERENTE) borra todo en cascada." onclick="window.Inventario.eliminarItem(${i.id_item}, '${(i.nombre || '').replace(/'/g, "\\'")}')">×</button>
          </td>
        </tr>`;
    });
    return html;
  };
  const rows = renderRowsAgrupados(_inventario);

  const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cotsAprobadas = _cotizacionesFondeadas.filter(c => c.estado === 'APROBADA');
  const cotsRiesgo    = _cotizacionesFondeadas.filter(c => c.estado === 'TRABAJO_EN_RIESGO');
  const cotOpt = (c) => `<option value="${c.id_cotizacion}">${escAttr(c.nro_cotizacion)} · ${escAttr(c.cliente || '—')} · ${escAttr(c.proyecto || '')}</option>`;
  const cotizacionesOptions = `
    ${cotsAprobadas.length ? `<optgroup label="✅ APROBADAS (cliente fondeará)">${cotsAprobadas.map(cotOpt).join('')}</optgroup>` : ''}
    ${cotsRiesgo.length ? `<optgroup label="⚠️ TRABAJO EN RIESGO (capital propio)">${cotsRiesgo.map(cotOpt).join('')}</optgroup>` : ''}
  `;
  const itemOptions = _inventario.filter(i => i.stock_actual > 0).map(i => `<option value="${i.id_item}">${escapeHtml(i.nombre)} (${i.stock_actual} disp)</option>`).join('');

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

    <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span style="font-size:12px;color:var(--text-secondary);font-weight:600">Filtrar:</span>
        <button class="btn-filtro-cat" data-cat="" style="${btnStyle}">Todos</button>
        <button class="btn-filtro-cat" data-cat="Material" style="${btnStyle}">Material</button>
        <button class="btn-filtro-cat" data-cat="Consumible" style="${btnStyle}">Consumible</button>
        <button class="btn-filtro-cat" data-cat="Herramienta" style="${btnStyle}">Herramienta</button>
        <button class="btn-filtro-cat" data-cat="Equipo" style="${btnStyle}">Equipo</button>
        <button class="btn-filtro-cat" data-cat="EPP" style="${btnStyle}">EPP</button>
        <select id="inv-filtro-familia" title="Filtrar por familia (agrupa variantes del mismo producto: SOLDADURA, PERNO, TUBO…)"
          style="padding:6px 10px;border:1px solid var(--border-light);border-radius:4px;font-size:12px;margin-left:6px">
          <option value="">Todas las familias</option>
          ${[...new Set(_inventario.map(i => i.familia).filter(Boolean))].sort().map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
        <select id="inv-filtro-marca" title="Filtrar por marca/empresa contable"
          style="padding:6px 10px;border:1px solid var(--border-light);border-radius:4px;font-size:12px">
          <option value="">Todas las marcas</option>
          <option value="METAL">Metal Engineers</option>
          <option value="PERFOTOOLS">Perfotools</option>
          <option value="COMPARTIDO">Compartido</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="btn-nuevo-insumo" type="button" title="Crear un nuevo ítem en el catálogo de almacén." style="padding:8px 14px;background:#7c3aed;color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">➕ Nuevo ítem</button>
        <button id="btn-retirar-insumo" type="button" title="Retirar insumos del almacén e imputar el costo a una cotización fondeada o trabajo en riesgo." style="padding:8px 14px;background:#dc2626;color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">📤 Retirar a servicio</button>
      </div>
    </div>

    <div class="table-container" style="margin-top:14px">
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
  `;

  // Builders de los modales (se invocan al apretar los botones).
  const formInsumoHTML = `
    <form id="form-insumo" style="display:flex;flex-direction:column;gap:10px">
      <label style="font-size:12px;color:var(--text-secondary)">Categoría ${tip('Tipo de ítem.\n• Material: insumo que se consume (acero, soldadura).\n• Consumible: gasto recurrente (guantes, lijas).\n• Herramienta: durable, se reutiliza.\n• Equipo: maquinaria registrable.\n• EPP: protección personal.')}</label>
      <select name="categoria" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
        <option value="Material">Material</option>
        <option value="Consumible">Consumible</option>
        <option value="Herramienta">Herramienta</option>
        <option value="Equipo">Equipo</option>
        <option value="EPP">EPP</option>
      </select>
      <label style="font-size:12px;color:var(--text-secondary)">Nombre comercial ${tip('Cómo lo identificás en tu día a día. Ej: Plancha acero A36 1/4, Soldadura 6011.')}</label>
      <input name="nombre" placeholder="Nombre Comercial" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
      <label style="font-size:12px;color:var(--text-secondary)">Unidad de medida ${tip('Cómo lo medís. UND=unidad, KG=kilo, M=metro lineal, M2=m², M3=m³, PAR=par, LOTE=lote, HRA=hora, DIA=día, NIU=no aplica.')}</label>
      <select name="unidad" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
        <option value="UND">UND</option><option value="KG">KG</option><option value="M">M</option>
        <option value="M2">M2</option><option value="M3">M3</option><option value="PAR">PAR</option>
        <option value="LOTE">LOTE</option><option value="HRA">HRA</option><option value="DIA">DIA</option><option value="NIU">NIU</option>
      </select>
      <label style="font-size:12px;color:var(--text-secondary)">Alerta de Stock Mínimo ${tip('Cuando el stock baje a este número, te llegará una alerta para reponer. Ej: si tu mínimo es 10 y bajás a 8, ⚠️ alerta de stock bajo. Si llega a 0, 🚫 sin stock.')}</label>
      <input name="stock_minimo" type="number" step="0.0001" value="10" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
      <p style="font-size:11px;color:var(--text-secondary);margin:0">El SKU se genera automáticamente según categoría.</p>
      <button type="submit" style="padding:10px;border:none;background:#7c3aed;color:white;border-radius:6px;cursor:pointer;font-weight:bold">Crear Catálogo</button>
    </form>
  `;
  const formConsumoHTML = (!cotsAprobadas.length && !cotsRiesgo.length) ? `
    <div style="background:#fef3c7;color:#92400e;padding:10px 12px;border-radius:6px;font-size:11px;line-height:1.5">
      ⚠️ Sin cotizaciones APROBADAS o TRABAJO_EN_RIESGO.<br>
      Pedí a Comercial que apruebe la cotización primero (o pasala a TRABAJO_EN_RIESGO si vas a trabajar con capital propio).
    </div>
  ` : `
    <form id="form-consumo" style="display:flex;flex-direction:column;gap:10px">
      <select name="id_cotizacion" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
        <option value="">— Cotización destino —</option>
        ${cotizacionesOptions}
      </select>
      <select name="id_item" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
        <option value="">— Material utilizado —</option>
        ${itemOptions}
      </select>
      <input name="cantidad" type="number" step="0.0001" placeholder="Volumen retirado" required style="padding:10px;border-radius:6px;border:1px solid #d1d5db">
      <button type="submit" style="padding:12px;border:none;background:var(--danger);color:white;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px">Mermar Material</button>
    </form>
  `;

  // Helper: abre un modal genérico con título + contenido HTML, retorna el overlay.
  function abrirModalInv(titulo, contenidoHTML, opcionesAdicionales = '') {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:min(540px,95vw);padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:calc(100vh - 80px);overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:16px;font-weight:700">${titulo}</h3>
          <button data-close type="button" style="background:transparent;border:none;font-size:22px;line-height:1;color:#94a3b8;cursor:pointer">×</button>
        </div>
        ${opcionesAdicionales ? `<p style="font-size:12px;color:var(--text-secondary);margin:0 0 14px;line-height:1.5">${opcionesAdicionales}</p>` : ''}
        ${contenidoHTML}
      </div>
    `;
    document.body.appendChild(ov);
    ov.querySelector('[data-close]').onclick = () => ov.remove();
    return ov;
  }

  // Botones que abren los modales
  document.getElementById('btn-nuevo-insumo').onclick = () => {
    const ov = abrirModalInv('➕ Añadir Insumo Base', formInsumoHTML);
    bindFormInsumo(ov);
  };
  document.getElementById('btn-retirar-insumo').onclick = () => {
    const desc = 'Resta stock e imputa costo a la cotización fondeada (o trabajo a riesgo) para no inflar utilidades. Es el insumo del futuro módulo Producción.';
    const ov = abrirModalInv('📤 Retirar Insumos hacia Servicio', formConsumoHTML, desc);
    bindFormConsumo(ov);
  };

  // Filtros combinables: categoría (botones) + familia (select) + marca (select).
  // Cualquier cambio re-aplica los 3 a la vez. Los headers de familia se ocultan
  // cuando no queda ningún item visible debajo.
  const selFamilia = panel.querySelector('#inv-filtro-familia');
  const selMarca   = panel.querySelector('#inv-filtro-marca');
  let _filtroCat = '';

  function aplicarFiltros() {
    const filFamilia = (selFamilia?.value || '').toUpperCase();
    const filMarca   = selMarca?.value || '';
    const filCat     = _filtroCat;
    // Primer pase: mostrar/ocultar filas de items
    const tbody = panel.querySelector('#tbody-inv');
    if (!tbody) return;
    tbody.querySelectorAll('tr:not(.fam-header)').forEach(tr => {
      const okCat = !filCat || tr.dataset.cat === filCat;
      const okFam = !filFamilia || tr.dataset.fam === filFamilia;
      const okMarca = !filMarca || tr.dataset.marca === filMarca;
      tr.style.display = (okCat && okFam && okMarca) ? '' : 'none';
    });
    // Segundo pase: cada header de familia visible solo si tiene al menos
    // un hijo visible debajo.
    tbody.querySelectorAll('tr.fam-header').forEach(header => {
      const fam = header.dataset.fam;
      const hayVisible = [...tbody.querySelectorAll(`tr[data-fam="${fam}"]:not(.fam-header)`)]
        .some(tr => tr.style.display !== 'none');
      header.style.display = hayVisible ? '' : 'none';
    });
  }

  // Filtro categoría (botones)
  panel.querySelectorAll('.btn-filtro-cat').forEach(btn => {
    btn.onclick = () => {
      panel.querySelectorAll('.btn-filtro-cat').forEach(b => { b.style.background = 'var(--bg-app)'; b.style.color = ''; });
      btn.style.background = 'var(--primary-color)'; btn.style.color = 'white';
      _filtroCat = btn.dataset.cat;
      aplicarFiltros();
    };
  });
  // Filtros familia y marca (selects)
  selFamilia?.addEventListener('change', aplicarFiltros);
  selMarca?.addEventListener('change', aplicarFiltros);

  // Bind del form Nuevo Insumo dentro de un overlay
  function bindFormInsumo(ov) {
    const formItem = ov.querySelector('#form-insumo');
    if (!formItem) return;
    formItem.onsubmit = async (e) => {
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
        ov.remove();
        window.navigate('inventario');
      } catch (err) {
        showError(err.detalles?.[0] || err.error || 'Error al registrar insumo');
      }
    };
  }

  // Bind del form Retirar Insumos — imputa contra cotización fondeada
  // (o trabajo a riesgo). Es el insumo del futuro módulo Producción.
  function bindFormConsumo(ov) {
    const formConsumo = ov.querySelector('#form-consumo');
    if (!formConsumo) return;
    formConsumo.onsubmit = async (e) => {
      e.preventDefault();
      const data = {
        id_cotizacion: Number(e.target.id_cotizacion.value),
        detalles: [{ id_item: Number(e.target.id_item.value), cantidad: Number(e.target.cantidad.value) }]
      };
      try {
        await api.inventory.consumirInventario(data);
        showSuccess('Almacén rebajado y costo imputado a la cotización');
        ov.remove();
        window.navigate('inventario');
      } catch (err) {
        showError(err.detalles?.[0] || err.error || 'Error al registrar consumo');
      }
    };
  }
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
          <span><strong>${i + 1}.</strong> ${escapeHtml(it.nombre)} <span style="color:var(--text-secondary);font-size:11px">(${escapeHtml(it.unidad)})</span></span>
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
            <td style="padding:8px;color:var(--text-secondary)">${escapeHtml(it.sku)}</td>
            <td style="padding:8px;font-weight:600">${escapeHtml(it.nombre)}</td>
            <td style="padding:8px"><span style="font-size:10px;padding:2px 6px;border-radius:8px;${CATEGORIA_BADGE[it.categoria] || ''}">${escapeHtml(it.categoria)}</span></td>
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
    // Solo GERENTE puede ofrecer corrección de asignación
    const userRol = (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}').rol; } catch { return null; } })();
    const esGerente = userRol === 'GERENTE';
    const rows = logs.length ? logs.map(l => {
      const esEntrada = l.tipo_movimiento === 'ENTRADA';
      const tipoBadge = `<span style="background:${esEntrada ? '#dcfce7' : '#fee2e2'};color:${esEntrada ? '#166534' : '#991b1b'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${escapeHtml(l.tipo_movimiento)}</span>`;
      // Solo se puede corregir si es ENTRADA + ORDEN_COMPRA + GERENTE.
      const puedeCorregir = esGerente && esEntrada && l.referencia_tipo === 'ORDEN_COMPRA';
      const accion = puedeCorregir
        ? `<button onclick="window.Inventario.corregirAsignacionItem(${l.id_movimiento}, ${id}, '${(name || '').replace(/'/g, "\\'")}')"
            title="Reasignar este movimiento a otro ítem (caso: recibió MIG cuando era FCAW). Reversa stock + recalcula costo promedio + audita."
            style="padding:3px 8px;background:#f59e0b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600">⚠ Corregir</button>`
        : '<span style="color:#d1d5db;font-size:11px">—</span>';
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px;font-size:12px">${fDate(l.fecha_movimiento)}</td>
        <td style="padding:8px;text-align:center">${tipoBadge}</td>
        <td style="padding:8px;font-size:11px;color:var(--text-secondary)">${escapeHtml(l.referencia_tipo || '—')}#${l.referencia_id || '—'}</td>
        <td style="padding:8px;text-align:right;font-weight:${esEntrada ? '600' : '500'};color:${esEntrada ? '#166534' : '#991b1b'}">${esEntrada ? '+' : '−'} ${fNum(l.cantidad)}</td>
        <td style="padding:8px;text-align:right;font-weight:700">${fNum(l.saldo_posterior)}</td>
        <td style="padding:8px;text-align:center">${accion}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--text-secondary)">Sin movimientos registrados</td></tr>';

    const html = `
      <div id="ov-kardex" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px">
        <div style="background:white;border-radius:12px;padding:28px;width:820px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,0.25)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <div>
              <h3 style="margin:0;font-size:18px">📊 Kárdex de ${name}</h3>
              <p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary)">${logs.length} movimiento(s) registrados${esGerente ? ' · ⚠ podés corregir asignaciones de entradas de OC' : ''}</p>
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
              <th style="padding:10px;text-align:center">Acción</th>
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

// Corregir asignación de movimiento mal hecho. Solo GERENTE (backend lo valida
// también). Caso típico: recibió un rollo FCAW cargándolo como MIG.
// Sesión 13/05/2026 — usa POST /inventario/movimientos/:idMov/corregir.
async function corregirAsignacionItem(idMov, idItemActual, nombreItemActual) {
  // 1. Buscar items destino candidatos. Por defecto sugerimos los de la misma
  //    familia (variantes) — pero permitimos elegir cualquiera.
  let inv;
  try { inv = await api.inventory.getInventario(); }
  catch (e) { return showError('Error cargando inventario: ' + (e.message || '')); }
  const actual = (inv || []).find(x => x.id_item === idItemActual);
  const sameFam = actual?.familia
    ? (inv || []).filter(x => x.familia === actual.familia && x.id_item !== idItemActual)
    : [];
  const otros = (inv || []).filter(x => x.id_item !== idItemActual && !sameFam.some(s => s.id_item === x.id_item));

  const v = (s) => escapeHtml(s);
  const optItem = (x) => `<option value="${x.id_item}">${v(x.sku)} · ${v(x.nombre)} (stock ${fNum(x.stock_actual)})</option>`;

  const data = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:560px;max-width:96vw;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 6px;font-size:16px">⚠ Corregir asignación de movimiento #${idMov}</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280;line-height:1.5">
          Este movimiento está cargado como <strong>${v(nombreItemActual)}</strong>.
          Si fue un error (ej: recibió MIG cuando era FCAW), elegí el ítem correcto.<br>
          El sistema va a: revertir el stock + recalcular el costo promedio del ítem actual,
          aplicar la entrada al ítem correcto y dejar audit log.
        </p>
        <div style="display:grid;gap:10px">
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Ítem correcto *</label>
            <select id="cr-item" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
              <option value="">— Seleccioná el ítem real recibido —</option>
              ${sameFam.length ? `<optgroup label="Misma familia (${actual?.familia})">${sameFam.map(optItem).join('')}</optgroup>` : ''}
              <optgroup label="Otros ítems del catálogo">${otros.map(optItem).join('')}</optgroup>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Motivo *</label>
            <textarea id="cr-motivo" rows="3" placeholder="Ej: El logístico Luis cargó como ALAMBRE MIG pero al revisar la factura era ALAMBRE FCAW."
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;resize:vertical"></textarea>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
          <button id="cr-cancel" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="cr-ok" style="padding:8px 22px;background:#f59e0b;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Corregir</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#cr-cancel').onclick = () => close(null);
    ov.querySelector('#cr-ok').onclick = () => {
      const idDest = Number(ov.querySelector('#cr-item').value);
      const motivo = ov.querySelector('#cr-motivo').value.trim();
      if (!idDest) return showError('Elegí el ítem correcto');
      if (!motivo) return showError('Motivo requerido (queda en audit log)');
      close({ id_item_correcto: idDest, motivo });
    };
  });
  if (!data) return;
  try {
    const r = await api.inventory.corregirRecepcion(idMov, data);
    window.showSuccess?.(`✓ Movimiento corregido: ${r.cantidad_movida} ${actual?.unidad || 'und'} pasaron de "${r.item_viejo?.nombre}" a "${r.item_nuevo?.nombre}"`);
    // Cerrar el kárdex y volver a inventario para refrescar todo
    document.getElementById('ov-kardex')?.remove();
    window.navigate('inventario');
  } catch (e) {
    showError(e.error || e.message || 'Error al corregir asignación');
  }
}

async function eliminarItem(id, nombre) {
  // Modo NORMAL primero. Si el backend bloquea por dependencias (stock,
  // compras, costos), ofrecemos al GERENTE el modo FORCE.
  const tipea = prompt(
    `🗑 ELIMINAR ÍTEM "${nombre}"\n\n` +
    `Para confirmar, escribí el nombre exacto del ítem:`
  );
  if (tipea == null) return;
  if (tipea.trim() !== nombre) {
    return showError(`El nombre no coincide. Escribiste "${tipea}" pero el ítem es "${nombre}".`);
  }
  try {
    await api.inventory.deleteInventarioItem(id);
    window.showSuccess?.(`Ítem "${nombre}" eliminado`);
    window.navigate('inventario');
  } catch (e) {
    const msg = e.error || e.message || 'Error al eliminar';
    // Si el bloqueo es por dependencias, ofrecer modo FORCE al GERENTE
    const u = (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })();
    const tieneDeps = /stock|compra|costos|servicios/i.test(msg);
    if (u.rol === 'GERENTE' && tieneDeps) {
      const ok = confirm(
        `${msg}\n\n` +
        `⚠ ELIMINACIÓN FORZADA (solo GERENTE)\n\n` +
        `Esto borrará el ítem junto con TODOS sus registros derivados:\n` +
        `• Movimientos de inventario / kárdex completo\n` +
        `• Líneas de Compras (las Compras se quedan vivas pero con totales recalculados)\n` +
        `• Costos en servicios\n\n` +
        `¿Confirmás la eliminación forzada?`
      );
      if (!ok) return;
      try {
        await api.inventory.deleteInventarioItem(id, { force: true });
        window.showSuccess?.(`Ítem "${nombre}" eliminado con cascada (forzado)`);
        window.navigate('inventario');
      } catch (err2) {
        showError(err2.error || err2.message || 'Error al forzar eliminación');
      }
      return;
    }
    showError(msg);
  }
}

async function editarMetadataItem(id, nombre) {
  // Cargar el item para prefill
  let inv;
  try { inv = await api.inventory.getInventario(); }
  catch (e) { return showError('Error cargando inventario: ' + (e.message || '')); }
  const item = (inv || []).find(x => x.id_item === id);
  if (!item) return showError('Ítem no encontrado');

  const v = (x) => escapeHtml(x);
  const data = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:480px;max-width:96vw;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 6px;font-size:16px">✎ Editar ítem · ${v(item.sku)}</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">
          Edición segura: NO toca stock actual ni costo promedio (eso sale del kárdex automáticamente).
        </p>
        <div style="display:grid;gap:10px">
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600">Nombre</label>
            <input id="ei-nombre" value="${v(item.nombre)}" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600">Categoría</label>
              <select id="ei-cat" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
                ${['Material','Consumible','Herramienta','Equipo','EPP'].map(c =>
                  `<option value="${c}" ${item.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600">Unidad</label>
              <input id="ei-uni" value="${v(item.unidad)}" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600" title="Agrupa variantes del mismo producto (SOLDADURA, PERNO, TUBO…). Editá si la auto-detección quedó mal.">Familia</label>
              <input id="ei-fam" value="${v(item.familia || '')}" list="ei-fam-list" placeholder="SOLDADURA, PERNO, TUBO…"
                style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;text-transform:uppercase">
              <datalist id="ei-fam-list">
                ${[...new Set(_inventario.map(i => i.familia).filter(Boolean))].sort().map(f => `<option value="${v(f)}"></option>`).join('')}
              </datalist>
            </div>
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600" title="A qué empresa se imputa contablemente. COMPARTIDO = se imputa según la cotización al consumir.">Marca</label>
              <select id="ei-marca" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
                ${['COMPARTIDO','METAL','PERFOTOOLS'].map(m =>
                  `<option value="${m}" ${(item.marca || 'COMPARTIDO') === m ? 'selected' : ''}>${m === 'METAL' ? 'Metal Engineers' : m === 'PERFOTOOLS' ? 'Perfotools' : 'Compartido (default)'}</option>`).join('')}
              </select>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600">Stock mínimo</label>
            <input id="ei-min" type="number" min="0" step="0.0001" value="${item.stock_minimo}" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
          <button id="ei-cancel" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="ei-ok" style="padding:8px 22px;background:#3b82f6;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#ei-cancel').onclick = () => close(null);
    ov.querySelector('#ei-ok').onclick = () => {
      close({
        nombre:       ov.querySelector('#ei-nombre').value.trim(),
        categoria:    ov.querySelector('#ei-cat').value,
        unidad:       ov.querySelector('#ei-uni').value.trim(),
        stock_minimo: Number(ov.querySelector('#ei-min').value) || 0,
        familia:      ov.querySelector('#ei-fam').value.trim().toUpperCase(),
        marca:        ov.querySelector('#ei-marca').value || 'COMPARTIDO',
      });
    };
  });
  if (!data) return;
  if (!data.nombre) return showError('El nombre es obligatorio');
  try {
    await api.inventory.editarMetadataItem(id, data);
    window.showSuccess?.(`Ítem actualizado`);
    window.navigate('inventario');
  } catch (e) { showError(e.error || e.message || 'Error al actualizar'); }
}

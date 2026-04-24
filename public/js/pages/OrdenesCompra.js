/**
 * OrdenesCompra.js — Módulo 📋 Órdenes de Compra
 *
 * Workflow estándar ERP mundial (SAP B1 / Odoo / Epicor):
 *   BORRADOR → APROBADA → ENVIADA → RECIBIDA_PARCIAL → RECIBIDA → FACTURADA → PAGADA
 *              (o ANULADA si no llegó a FACTURADA)
 *
 * Vista kanban con columnas por estado para flujo visual.
 */

import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';

const ESTADO_COLOR = {
  BORRADOR:         { bg: '#f3f4f6', fg: '#374151', icon: '📝' },
  APROBADA:         { bg: '#dbeafe', fg: '#1e40af', icon: '✅' },
  ENVIADA:          { bg: '#e0e7ff', fg: '#3730a3', icon: '📤' },
  RECIBIDA_PARCIAL: { bg: '#fef3c7', fg: '#92400e', icon: '📦' },
  RECIBIDA:         { bg: '#dcfce7', fg: '#166534', icon: '📥' },
  FACTURADA:        { bg: '#ede9fe', fg: '#5b21b6', icon: '🧾' },
  PAGADA:           { bg: '#d1fae5', fg: '#065f46', icon: '💰' },
  ANULADA:          { bg: '#fee2e2', fg: '#991b1b', icon: '❌' },
};

const fPEN = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0);
const fUSD = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);
const fmtDate = (d) => d ? String(d).split('T')[0] : '—';

let _ocs = [];
let _proveedores = [];
let _servicios = [];
let _cfg = null;

export const OrdenesCompra = async () => {
  try {
    [_ocs, _proveedores, _servicios, _cfg] = await Promise.all([
      api.ordenesCompra.list().catch(() => []),
      api.purchases.getProveedores().catch(() => []),
      api.services.getServiciosActivos().catch(() => []),
      api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000 })),
    ]);
  } catch (e) { console.error('[OC] error:', e); }

  setTimeout(() => init(), 60);

  return `
    <header class="header">
      <div>
        <h1>📋 Órdenes de Compra</h1>
        <span style="color:var(--text-secondary)">Flujo formal con proveedores: Borrador → Aprobada → Enviada → Recibida → Facturada → Pagada</span>
      </div>
      <button onclick="OC.nuevaOC()" style="padding:10px 22px;background:var(--primary-color);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer">
        ➕ Nueva OC
      </button>
    </header>

    <div id="oc-tabbar" style="margin-top:20px"></div>
    <div id="tab-kanban"   class="tab-content"></div>
    <div id="tab-lista"    class="tab-content" style="display:none"></div>
    <div id="tab-dashboard" class="tab-content" style="display:none"></div>

    <div id="oc-modal"></div>
  `;
};

function init() {
  TabBar({
    container: '#oc-tabbar',
    tabs: [
      { id: 'kanban',    label: '🗂️ Kanban por Estado' },
      { id: 'lista',     label: `📋 Listado completo`, badge: _ocs.length },
      { id: 'dashboard', label: '📊 Dashboard' },
    ],
    defaultTab: 'kanban',
    onChange: (id) => {
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('tab-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'kanban'    && !panel.dataset.rendered) renderKanban(panel);
      if (id === 'lista'     && !panel.dataset.rendered) renderLista(panel);
      if (id === 'dashboard' && !panel.dataset.rendered) renderDashboard(panel);
    },
  });

  window.OC = { nuevaOC, verOC, aprobar, enviar, recibir, facturar, anular };
}

// ──────── Tab Kanban ────────
function renderKanban(panel) {
  panel.dataset.rendered = '1';
  const estadosOrden = ['BORRADOR', 'APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL', 'RECIBIDA', 'FACTURADA', 'PAGADA'];
  const porEstado = {};
  estadosOrden.forEach(e => porEstado[e] = []);
  _ocs.forEach(oc => {
    if (oc.estado !== 'ANULADA' && porEstado[oc.estado]) porEstado[oc.estado].push(oc);
  });

  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-top:16px;overflow-x:auto">
      ${estadosOrden.map(estado => {
        const color = ESTADO_COLOR[estado];
        const ocs = porEstado[estado];
        return `
          <div style="min-width:180px;background:${color.bg};border-radius:10px;padding:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${color.fg}22">
              <strong style="font-size:11px;color:${color.fg};text-transform:uppercase;letter-spacing:0.5px">${color.icon} ${estado.replace('_', ' ')}</strong>
              <span style="background:${color.fg};color:white;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700">${ocs.length}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;min-height:100px">
              ${ocs.length ? ocs.map(oc => kanbanCard(oc, color)).join('') :
                `<div style="padding:30px 10px;text-align:center;color:${color.fg}77;font-size:11px">—</div>`}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:6px;font-size:11px;color:var(--text-secondary)">
      💡 <strong>Auto-aprobación:</strong> OCs ≤ ${fPEN(_cfg.monto_limite_sin_aprobacion)} pasan directo a APROBADA.
      Para cambiarlo ve a ⚙️ Configuración → Preferencias → Monto límite sin aprobación.
    </div>
  `;
}

function kanbanCard(oc, color) {
  const monto = oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total);
  return `
    <div onclick="OC.verOC(${oc.id_oc})" style="background:white;padding:10px;border-radius:8px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.06);border-left:3px solid ${color.fg}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <strong style="font-size:12px">${oc.nro_oc}</strong>
        <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${oc.empresa === 'PT' ? '#16a34a' : '#676767'};color:white">${oc.empresa}</span>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">${(oc.proveedor_nombre || '—').slice(0, 24)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:10px;color:var(--text-secondary)">${fmtDate(oc.fecha_emision)}</span>
        <strong style="font-size:12px">${monto}</strong>
      </div>
    </div>
  `;
}

// ──────── Tab Lista ────────
function renderLista(panel) {
  panel.dataset.rendered = '1';
  if (!_ocs.length) {
    panel.innerHTML = `<div class="card" style="margin-top:16px;padding:40px;text-align:center;color:var(--text-secondary)">
      <div style="font-size:40px;margin-bottom:10px">📋</div>
      <div style="font-size:14px;font-weight:600">Sin órdenes de compra todavía</div>
      <div style="font-size:12px;margin-top:4px">Click en "➕ Nueva OC" para crear la primera.</div>
    </div>`;
    return;
  }

  panel.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
              <th style="padding:10px;text-align:left">N° OC</th>
              <th style="padding:10px;text-align:left">Fecha</th>
              <th style="padding:10px;text-align:left">Proveedor</th>
              <th style="padding:10px;text-align:center">Tipo</th>
              <th style="padding:10px;text-align:center">Empresa</th>
              <th style="padding:10px;text-align:right">Total</th>
              <th style="padding:10px;text-align:center">Estado</th>
              <th style="padding:10px;text-align:center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${_ocs.map(oc => {
              const color = ESTADO_COLOR[oc.estado];
              const monto = oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total);
              return `
                <tr style="border-bottom:1px solid #e5e7eb">
                  <td style="padding:8px;font-weight:700"><a href="#" onclick="event.preventDefault();OC.verOC(${oc.id_oc})" style="color:var(--primary-color);text-decoration:none">${oc.nro_oc}</a></td>
                  <td style="padding:8px">${fmtDate(oc.fecha_emision)}</td>
                  <td style="padding:8px">${oc.proveedor_nombre || '—'}</td>
                  <td style="padding:8px;text-align:center"><span style="font-size:10px;background:#e5e7eb;padding:2px 6px;border-radius:4px">${oc.tipo_oc}</span></td>
                  <td style="padding:8px;text-align:center"><span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${oc.empresa === 'PT' ? '#16a34a' : '#676767'};color:white">${oc.empresa}</span></td>
                  <td style="padding:8px;text-align:right;font-weight:700">${monto}</td>
                  <td style="padding:8px;text-align:center"><span style="background:${color.bg};color:${color.fg};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${color.icon} ${oc.estado.replace('_', ' ')}</span></td>
                  <td style="padding:8px;text-align:center;white-space:nowrap">
                    <button onclick="OC.verOC(${oc.id_oc})" style="padding:4px 10px;background:var(--primary-color);color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px">Ver</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ──────── Tab Dashboard ────────
function renderDashboard(panel) {
  panel.dataset.rendered = '1';
  const ocsActivas = _ocs.filter(o => o.estado !== 'ANULADA');
  const totalPEN = ocsActivas.reduce((s, o) => s + (o.moneda === 'USD' ? Number(o.total) * Number(o.tipo_cambio) : Number(o.total)), 0);
  const pendientesAprobar = _ocs.filter(o => o.estado === 'BORRADOR').length;
  const porRecibir = _ocs.filter(o => ['APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL'].includes(o.estado)).length;
  const porFacturar = _ocs.filter(o => ['RECIBIDA', 'RECIBIDA_PARCIAL'].includes(o.estado)).length;

  panel.innerHTML = `
    <div style="margin-top:16px">
      ${kpiGrid([
        { label: 'OC Activas',        value: ocsActivas.length,    icon: '📋' },
        { label: 'Volumen total (PEN)', value: fPEN(totalPEN),     icon: '💰' },
        { label: 'Pendientes Aprobar', value: pendientesAprobar,   icon: '⏳', changeType: pendientesAprobar > 0 ? 'negative' : 'neutral' },
        { label: 'Por Recibir',        value: porRecibir,          icon: '📦' },
        { label: 'Por Facturar',       value: porFacturar,         icon: '🧾' },
      ], 5)}
      <div class="card" style="margin-top:16px;padding:20px">
        <h3 style="margin-bottom:12px;font-size:14px">Distribución por estado</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${Object.entries(ESTADO_COLOR).map(([estado, c]) => {
            const n = _ocs.filter(o => o.estado === estado).length;
            return `<div style="padding:14px;background:${c.bg};border-radius:8px;text-align:center">
              <div style="font-size:24px;font-weight:700;color:${c.fg}">${n}</div>
              <div style="font-size:10px;color:${c.fg};font-weight:600;margin-top:4px">${c.icon} ${estado.replace('_', ' ')}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ──────── Modal: Ver detalle de OC ────────
async function verOC(id_oc) {
  try {
    const oc = await api.ordenesCompra.get(id_oc);
    const color = ESTADO_COLOR[oc.estado];
    const monto = oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total);

    const botonesAccion = accionesSegunEstado(oc);

    document.getElementById('oc-modal').innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px">
        <div style="background:white;border-radius:12px;width:860px;max-width:95vw;max-height:90vh;overflow:auto;padding:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <div>
              <h2 style="margin:0;font-size:22px">${oc.nro_oc}</h2>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                Emitida ${fmtDate(oc.fecha_emision)} · ${oc.proveedor_nombre} (RUC ${oc.proveedor_ruc || '—'})
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="background:${color.bg};color:${color.fg};padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">${color.icon} ${oc.estado.replace('_', ' ')}</span>
              <button onclick="document.getElementById('oc-modal').innerHTML=''" style="background:#f3f4f6;border:none;border-radius:6px;padding:8px 14px;cursor:pointer">Cerrar</button>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;font-size:12px">
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Empresa:</strong> ${oc.empresa}</div>
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Tipo:</strong> ${oc.tipo_oc}</div>
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Moneda:</strong> ${oc.moneda} (TC ${oc.tipo_cambio})</div>
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Forma pago:</strong> ${oc.forma_pago}${oc.dias_credito ? ` (${oc.dias_credito}d)` : ''}</div>
          </div>

          <h3 style="font-size:14px;margin-bottom:10px">Líneas</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">
            <thead><tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
              <th style="padding:8px;text-align:left">Descripción</th>
              <th style="padding:8px;text-align:center">Unidad</th>
              <th style="padding:8px;text-align:right">Cantidad</th>
              <th style="padding:8px;text-align:right">Recibida</th>
              <th style="padding:8px;text-align:right">P.Unit</th>
              <th style="padding:8px;text-align:right">Subtotal</th>
            </tr></thead>
            <tbody>
              ${(oc.detalle || []).map(l => `
                <tr style="border-bottom:1px solid #e5e7eb">
                  <td style="padding:8px">${l.descripcion}</td>
                  <td style="padding:8px;text-align:center">${l.unidad}</td>
                  <td style="padding:8px;text-align:right">${l.cantidad}</td>
                  <td style="padding:8px;text-align:right;${Number(l.cantidad_recibida) >= Number(l.cantidad) ? 'color:#16a34a;font-weight:700' : ''}">${l.cantidad_recibida}</td>
                  <td style="padding:8px;text-align:right">${Number(l.precio_unitario).toFixed(2)}</td>
                  <td style="padding:8px;text-align:right;font-weight:600">${Number(l.subtotal).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid #d9dad9"><td colspan="5" style="padding:8px;text-align:right">Subtotal</td><td style="padding:8px;text-align:right">${Number(oc.subtotal).toFixed(2)}</td></tr>
              ${Number(oc.descuento) > 0 ? `<tr><td colspan="5" style="padding:8px;text-align:right;color:var(--text-secondary)">Descuento</td><td style="padding:8px;text-align:right;color:var(--text-secondary)">−${Number(oc.descuento).toFixed(2)}</td></tr>` : ''}
              ${oc.aplica_igv ? `<tr><td colspan="5" style="padding:8px;text-align:right;color:var(--text-secondary)">IGV 18%</td><td style="padding:8px;text-align:right;color:var(--text-secondary)">${Number(oc.igv).toFixed(2)}</td></tr>` : ''}
              <tr style="background:#f9fafb"><td colspan="5" style="padding:10px;text-align:right;font-weight:700">TOTAL</td><td style="padding:10px;text-align:right;font-weight:700;font-size:15px">${monto}</td></tr>
            </tfoot>
          </table>

          ${oc.observaciones ? `<div style="padding:10px;background:#fffbeb;border-radius:6px;margin-bottom:16px;font-size:12px"><strong>Observaciones:</strong> ${oc.observaciones}</div>` : ''}

          ${oc.aprobaciones?.length ? `
            <details>
              <summary style="cursor:pointer;font-size:12px;color:var(--primary-color);font-weight:600;margin-bottom:10px">Historial de aprobaciones (${oc.aprobaciones.length})</summary>
              <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px">
                <thead><tr style="background:#f9fafb"><th style="padding:6px;text-align:left">Fecha</th><th style="padding:6px;text-align:left">Acción</th><th style="padding:6px;text-align:left">Comentario</th></tr></thead>
                <tbody>${oc.aprobaciones.map(a => `<tr><td style="padding:6px">${new Date(a.fecha).toLocaleString('es-PE')}</td><td style="padding:6px"><span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:4px">${a.accion}</span></td><td style="padding:6px;color:var(--text-secondary)">${a.comentario || '—'}</td></tr>`).join('')}</tbody>
              </table>
            </details>
          ` : ''}

          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap">
            ${botonesAccion}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    showError('Error cargando OC: ' + (e.message || e));
  }
}

function accionesSegunEstado(oc) {
  const btns = [];
  if (oc.estado === 'BORRADOR') {
    btns.push(`<button onclick="OC.aprobar(${oc.id_oc})" style="padding:10px 18px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">✓ Aprobar</button>`);
  }
  if (oc.estado === 'APROBADA') {
    btns.push(`<button onclick="OC.enviar(${oc.id_oc})" style="padding:10px 18px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">📤 Marcar como Enviada</button>`);
  }
  if (['APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.recibir(${oc.id_oc})" style="padding:10px 18px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">📦 Registrar recepción</button>`);
  }
  if (['RECIBIDA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.facturar(${oc.id_oc})" style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🧾 Recibí factura</button>`);
  }
  if (!['FACTURADA', 'PAGADA', 'ANULADA'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.anular(${oc.id_oc})" style="padding:10px 18px;background:transparent;color:#dc2626;border:1px solid #dc2626;border-radius:6px;cursor:pointer;font-weight:600">Anular</button>`);
  }
  return btns.join('');
}

// ──────── Acciones workflow ────────
async function aprobar(id) {
  const c = prompt('Comentario de aprobación (opcional):');
  if (c === null) return;
  try {
    await api.ordenesCompra.aprobar(id, { comentario: c });
    showSuccess('OC aprobada');
    setTimeout(() => location.reload(), 600);
  } catch (e) { showError(e.message); }
}

async function enviar(id) {
  if (!confirm('¿Marcar como enviada al proveedor?')) return;
  try {
    await api.ordenesCompra.enviar(id);
    showSuccess('OC marcada como enviada');
    setTimeout(() => location.reload(), 600);
  } catch (e) { showError(e.message); }
}

async function recibir(id) {
  const oc = await api.ordenesCompra.get(id);
  const lineas = (oc.detalle || []).map(l => {
    const rest = Number(l.cantidad) - Number(l.cantidad_recibida);
    const r = prompt(`${l.descripcion}\nPedido: ${l.cantidad} · Ya recibido: ${l.cantidad_recibida} · Falta: ${rest}\n¿Cuánto llegó ahora?`, rest);
    if (r === null) return null;
    const cant = Number(r);
    if (isNaN(cant) || cant < 0) return null;
    return { id_detalle: l.id_detalle, cantidad_recibida: cant };
  }).filter(Boolean);
  if (!lineas.length) return;
  try {
    const r = await api.ordenesCompra.recibir(id, lineas);
    showSuccess(`Recepción registrada · Estado: ${r.estado}`);
    setTimeout(() => location.reload(), 600);
  } catch (e) { showError(e.message); }
}

async function facturar(id) {
  const nro = prompt('N° factura del proveedor (ej. F001-00123):');
  if (!nro) return;
  const fecha = prompt('Fecha de la factura (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!fecha) return;
  try {
    await api.ordenesCompra.facturar(id, { nro_factura_proveedor: nro, fecha_factura: fecha });
    showSuccess('OC facturada — se creó registro en Compras');
    setTimeout(() => location.reload(), 800);
  } catch (e) { showError(e.message); }
}

async function anular(id) {
  const motivo = prompt('Motivo de anulación:');
  if (!motivo) return;
  try {
    await api.ordenesCompra.anular(id, motivo);
    showSuccess('OC anulada');
    setTimeout(() => location.reload(), 600);
  } catch (e) { showError(e.message); }
}

// ──────── Modal: Nueva OC ────────
function nuevaOC() {
  const hoy = new Date().toISOString().slice(0, 10);
  const provOpts = _proveedores.map(p => `<option value="${p.id_proveedor}">${p.razon_social} (RUC ${p.ruc || '—'})</option>`).join('');
  const servOpts = _servicios.map(s => `<option value="${s.id_servicio}">${s.codigo || ('SRV-' + s.id_servicio)} · ${s.nombre || s.cliente || ''}</option>`).join('');

  document.getElementById('oc-modal').innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:white;border-radius:12px;width:900px;max-width:95vw;max-height:90vh;overflow:auto;padding:24px">
        <h2 style="margin-bottom:16px">➕ Nueva Orden de Compra</h2>
        <form id="form-oc" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <div><label>Fecha emisión</label><input type="date" name="fecha_emision" value="${hoy}" required></div>
          <div><label>Entrega esperada</label><input type="date" name="fecha_entrega_esperada"></div>
          <div><label>Empresa</label>
            <select name="empresa"><option value="ME">Metal Engineers (PEN)</option><option value="PT">Perfotools (USD)</option></select>
          </div>
          <div style="grid-column:span 2"><label>Proveedor *</label><select name="id_proveedor" required><option value="">— Selecciona —</option>${provOpts}</select></div>
          <div><label>Tipo</label>
            <select name="tipo_oc"><option value="GENERAL">General (oficina)</option><option value="SERVICIO">Servicio (proyecto)</option><option value="ALMACEN">Almacén (stock)</option></select>
          </div>
          <div style="grid-column:span 3"><label>Servicio/Proyecto (si tipo=SERVICIO)</label><select name="id_servicio"><option value="">—</option>${servOpts}</select></div>
          <div><label>Moneda</label><select name="moneda"><option value="PEN">PEN</option><option value="USD">USD</option></select></div>
          <div><label>Tipo cambio</label><input type="number" step="0.0001" name="tipo_cambio" value="1.0000"></div>
          <div><label>Forma pago</label>
            <select name="forma_pago"><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select>
          </div>
          <div><label>Días crédito</label><input type="number" name="dias_credito" value="0"></div>
          <div style="grid-column:span 2"><label>Centro de costo</label><input name="centro_costo" value="OFICINA CENTRAL"></div>
          <div style="grid-column:span 3"><label>Observaciones</label><input name="observaciones" placeholder="Ej: Urgente, entrega en obra Toromocho"></div>
          <div style="grid-column:span 3">
            <label style="font-size:13px;font-weight:700;margin-top:10px;display:block">Líneas</label>
            <div id="oc-lineas" style="display:flex;flex-direction:column;gap:6px"></div>
            <button type="button" onclick="OC._addLinea()" style="margin-top:8px;padding:6px 14px;background:var(--bg-app);border:1px dashed #d9dad9;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar línea</button>
          </div>
          <div style="grid-column:span 3">
            <label style="display:flex;gap:6px;align-items:center;font-size:12px">
              <input type="checkbox" name="aplica_igv" ${_cfg.aplica_igv ? 'checked' : ''}> Aplica IGV 18%
            </label>
          </div>
          <div style="grid-column:span 3;display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <span style="font-size:13px;color:var(--text-secondary)">
              📌 OCs ≤ <strong>${fPEN(_cfg.monto_limite_sin_aprobacion)}</strong> se auto-aprueban
            </span>
            <div style="display:flex;gap:10px">
              <button type="button" onclick="document.getElementById('oc-modal').innerHTML=''" style="padding:10px 18px;background:transparent;border:1px solid #d9dad9;border-radius:6px;cursor:pointer">Cancelar</button>
              <button type="submit" style="padding:10px 24px;background:var(--primary-color);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700">Crear OC</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  const lineas = [];
  window.OC._addLinea = () => {
    lineas.push({ descripcion: '', unidad: 'UND', cantidad: 1, precio_unitario: 0 });
    renderLineas();
  };
  function renderLineas() {
    const cont = document.getElementById('oc-lineas');
    cont.innerHTML = lineas.map((l, i) => `
      <div style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr 40px;gap:6px">
        <input placeholder="Descripción" value="${l.descripcion}" oninput="OC._setL(${i},'descripcion',this.value)">
        <input placeholder="UND" value="${l.unidad}" oninput="OC._setL(${i},'unidad',this.value)">
        <input type="number" step="0.01" placeholder="Cant" value="${l.cantidad}" oninput="OC._setL(${i},'cantidad',Number(this.value))">
        <input type="number" step="0.01" placeholder="P.Unit" value="${l.precio_unitario}" oninput="OC._setL(${i},'precio_unitario',Number(this.value))">
        <button type="button" onclick="OC._delL(${i})" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:18px">×</button>
      </div>
    `).join('');
  }
  window.OC._setL = (i, k, v) => { lineas[i][k] = v; };
  window.OC._delL = (i) => { lineas.splice(i, 1); renderLineas(); };
  window.OC._addLinea(); // primera línea

  document.getElementById('form-oc').onsubmit = async (e) => {
    e.preventDefault();
    if (!lineas.length || lineas.some(l => !l.descripcion || l.cantidad <= 0)) {
      return showError('Agrega al menos una línea con descripción y cantidad > 0');
    }
    const fd = new FormData(e.target);
    try {
      const r = await api.ordenesCompra.create({
        fecha_emision: fd.get('fecha_emision'),
        fecha_entrega_esperada: fd.get('fecha_entrega_esperada') || null,
        id_proveedor: Number(fd.get('id_proveedor')),
        id_servicio: fd.get('id_servicio') ? Number(fd.get('id_servicio')) : null,
        centro_costo: fd.get('centro_costo'),
        tipo_oc: fd.get('tipo_oc'),
        empresa: fd.get('empresa'),
        moneda: fd.get('moneda'),
        tipo_cambio: Number(fd.get('tipo_cambio')),
        aplica_igv: fd.get('aplica_igv') === 'on',
        forma_pago: fd.get('forma_pago'),
        dias_credito: Number(fd.get('dias_credito')),
        observaciones: fd.get('observaciones'),
        lineas,
      });
      showSuccess(`OC ${r.nro_oc} creada · ${r.autoAprobada ? '✓ Auto-aprobada' : 'Pendiente aprobación'}`);
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      showError(err.message || 'Error creando OC');
    }
  };
}

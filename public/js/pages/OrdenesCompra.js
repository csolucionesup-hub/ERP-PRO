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
import { showSuccess, showError, tip } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';
import { pill } from '../components/Pill.js';

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

// ─────────── Modales reutilizables (mismos del módulo Comercial) ───────────
// Confirmación con tipo (warning/danger/info). Solo cierra con botón explícito.
function confirmarAccion({ titulo, mensaje, tipo = 'warning', textoBoton = 'Confirmar' }) {
  return new Promise((resolve) => {
    const stylesPorTipo = {
      warning: { icono: '⚠️', boton: '#d97706' },
      danger:  { icono: '🛑', boton: '#dc2626' },
      info:    { icono: 'ℹ️',  boton: '#2563eb' },
    };
    const { icono, boton } = stylesPorTipo[tipo] || stylesPorTipo.warning;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:white;border-radius:12px;width:480px;max-width:95vw;padding:24px">
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:16px">
          <div style="font-size:32px;line-height:1">${icono}</div>
          <div style="flex:1">
            <h3 style="margin:0 0 8px;font-size:17px">${titulo}</h3>
            <div style="color:#555;font-size:14px;line-height:1.5">${mensaje}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button data-c style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-weight:600">Cancelar</button>
          <button data-ok style="padding:9px 18px;background:${boton};color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${textoBoton}</button>
        </div>
      </div>`;
    ov.querySelector('[data-c]').onclick = () => { ov.remove(); resolve(false); };
    ov.querySelector('[data-ok]').onclick = () => { ov.remove(); resolve(true); };
    document.body.appendChild(ov);
  });
}

// ─────────── Preview de PDF de OC en modal con iframe ───────────
// Helper compartido — Logistica.js también lo usa via window.previewPDFOC.
// Se declara al top-level para que esté disponible apenas se carga el módulo
// OrdenesCompra (importado en app.js), no solo cuando el usuario entra a OC.
async function fetchPDFOC(id) {
  const token = localStorage.getItem('erp_token');
  const r = await fetch(`/api/ordenes-compra/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw new Error(errBody.error || `HTTP ${r.status}`);
  }
  return r.blob();
}

window.previewPDFOC = async (id, nro) => {
  let blobUrl = null;
  let overlay = null;
  try {
    const blob = await fetchPDFOC(id);
    blobUrl = URL.createObjectURL(blob);
    const filename = `OC-${String(nro).replace(/\s+/g, '_')}.pdf`;

    overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9000;' +
      'display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:min(960px,95vw);height:min(92vh,1200px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">
        <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#f9fafb;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="font-size:14px;color:#111">📄 Vista previa</strong>
            <span style="font-size:12px;color:#6b7280;margin-left:10px">OC ${nro}</span>
          </div>
          <div style="display:flex;gap:8px">
            <button data-dl type="button"
              style="padding:7px 14px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">
              📥 Descargar
            </button>
            <button data-close type="button"
              style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:12px">
              Cerrar
            </button>
          </div>
        </div>
        <iframe src="${blobUrl}" style="flex:1;border:none;width:100%;background:#525659" title="Preview OC ${nro}"></iframe>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => {
      if (overlay && overlay.parentNode) overlay.remove();
      if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    };
    overlay.querySelector('[data-dl]').onclick = () => {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    overlay.querySelector('[data-close]').onclick = cleanup;
  } catch (err) {
    if (overlay && overlay.parentNode) overlay.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    if (window.showError) window.showError('Error abriendo vista previa: ' + (err.message || err));
    else alert('Error abriendo vista previa: ' + (err.message || err));
  }
};

// Confirmación destructiva: requiere tipear texto exacto para habilitar el botón.
function confirmarTexto({ titulo, mensaje, textoRequerido }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:white;border-radius:12px;width:480px;max-width:95vw;padding:24px">
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px">
          <div style="font-size:32px;line-height:1">🛑</div>
          <div style="flex:1">
            <h3 style="margin:0 0 8px;font-size:17px;color:#dc2626">${titulo}</h3>
            <div style="color:#555;font-size:14px;line-height:1.5;margin-bottom:14px">${mensaje}</div>
            <div style="font-size:13px;color:#374151;margin-bottom:6px">Para confirmar, escribí exactamente: <strong>${textoRequerido}</strong></div>
            <input type="text" data-input
                   style="width:100%;padding:9px 11px;border:1px solid #d0d0d0;border-radius:5px;font-size:14px;box-sizing:border-box">
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button data-c style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-weight:600">Cancelar</button>
          <button data-ok disabled style="padding:9px 18px;background:#fca5a5;color:white;border:none;border-radius:6px;cursor:not-allowed;font-weight:600">Eliminar</button>
        </div>
      </div>`;
    const input = ov.querySelector('[data-input]');
    const btnOk = ov.querySelector('[data-ok]');
    input.addEventListener('input', () => {
      const ok = input.value === textoRequerido;
      btnOk.disabled = !ok;
      btnOk.style.background = ok ? '#dc2626' : '#fca5a5';
      btnOk.style.cursor = ok ? 'pointer' : 'not-allowed';
    });
    ov.querySelector('[data-c]').onclick = () => { ov.remove(); resolve(false); };
    btnOk.onclick = () => { if (input.value === textoRequerido) { ov.remove(); resolve(true); } };
    document.body.appendChild(ov);
    setTimeout(() => input.focus(), 60);
  });
}

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
      <div style="display:flex;gap:10px">
        <button onclick="OC.reporteROC()" style="padding:10px 18px;background:#065f46;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer" title="Reporte Semanal de OC por centro de costo (Excel)">
          📊 ROC Semanal
        </button>
        <button onclick="OC.nuevaOC()" style="padding:10px 22px;background:var(--primary-color);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer">
          ➕ Nueva OC
        </button>
      </div>
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

  window.OC = { nuevaOC, verOC, aprobar, enviar, recibir, facturar, anular, eliminarOC, editar, descargarPDF, reporteROC };
}

// Helper local: rol del usuario logueado (para mostrar botón Eliminar solo a GERENTE).
function getUserRol() {
  try { return JSON.parse(localStorage.getItem('erp_user') || '{}').rol || ''; }
  catch { return ''; }
}

// ──────── Reporte Semanal ROC (Excel) ────────
function reporteROC() {
  const centros = [
    'OFICINA CENTRAL',
    'ALMACEN CENTRAL',
    'PERFOTOOLS',
    'FABRICACION DE AUGER - PSV',
    'CORE ROLLER DE 800MM',
    'TECHO PARABOLICO',
  ];
  // Detectar centros únicos ya usados en las OCs (por si hay obras nuevas)
  const centrosDesdeData = [...new Set(_ocs.map(oc => (oc.centro_costo || '').toUpperCase().trim()).filter(Boolean))];
  centrosDesdeData.forEach(c => { if (!centros.includes(c)) centros.push(c); });

  const anioActual = new Date().getFullYear();
  const semanaActual = semanaISOHoy();

  const modal = document.getElementById('oc-modal');
  modal.innerHTML = `
    <div id="ov-roc" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center">
      <div style="background:white;padding:26px;border-radius:12px;width:460px;max-width:90vw">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h2 style="margin:0">📊 Generar ROC Semanal</h2>
          <button onclick="document.getElementById('ov-roc').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <p style="color:var(--text-secondary);font-size:13px;margin:0 0 18px">
          Descarga el Reporte de Órdenes de Compra en Excel, agrupado por semanas y con totales en S/ y $, para el centro de costo seleccionado.
        </p>

        <div style="display:flex;flex-direction:column;gap:14px">
          <label style="display:flex;flex-direction:column;gap:6px">
            <span style="font-weight:600;font-size:13px">Centro de costo</span>
            <select id="roc-centro" style="padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
              ${centros.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </label>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label style="display:flex;flex-direction:column;gap:6px">
              <span style="font-weight:600;font-size:13px">Año</span>
              <input id="roc-anio" type="number" value="${anioActual}" min="2020" max="2035"
                     style="padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
            </label>
            <label style="display:flex;flex-direction:column;gap:6px">
              <span style="font-weight:600;font-size:13px">Semana corte (ISO)</span>
              <input id="roc-semana" type="number" value="${semanaActual}" min="1" max="53"
                     style="padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
            </label>
          </div>

          <label style="display:flex;flex-direction:column;gap:6px">
            <span style="font-weight:600;font-size:13px">Marca</span>
            <select id="roc-empresa" style="padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
              <option value="">Ambas (ME + PT)</option>
              <option value="ME" selected>Metal Engineers (ME)</option>
              <option value="PT">Perfotools (PT)</option>
            </select>
          </label>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px">
          <button onclick="document.getElementById('ov-roc').remove()"
                  style="padding:10px 18px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-weight:600;cursor:pointer">
            Cancelar
          </button>
          <button id="roc-btn-descargar" onclick="OC._descargarROC()"
                  style="padding:10px 20px;background:#065f46;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer">
            📥 Descargar Excel
          </button>
        </div>
      </div>
    </div>
  `;

  window.OC._descargarROC = async () => {
    const centro_costo = document.getElementById('roc-centro').value;
    const anio         = Number(document.getElementById('roc-anio').value);
    const semana       = Number(document.getElementById('roc-semana').value);
    const empresa      = document.getElementById('roc-empresa').value;
    const btn          = document.getElementById('roc-btn-descargar');
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = '⏳ Generando...';
    try {
      await api.ordenesCompra.descargarROC({ centro_costo, anio, semana, empresa });
      showSuccess('ROC generado ✓');
      document.getElementById('ov-roc').remove();
    } catch (e) {
      console.error(e);
      showError('No se pudo generar el ROC: ' + (e.message || e));
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  };
}

// ISO week actual, como en el backend
function semanaISOHoy() {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaSem = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - diaSem);
  const anioIni = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - anioIni.getTime()) / 86400000) + 1) / 7);
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
                <tbody>${oc.aprobaciones.map(a => `<tr><td style="padding:6px">${new Date(a.fecha).toLocaleString('es-PE')}</td><td style="padding:6px">${pill(a.accion, 'success')}</td><td style="padding:6px;color:var(--text-secondary)">${a.comentario || '—'}</td></tr>`).join('')}</tbody>
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
  const esGerente = getUserRol() === 'GERENTE';
  const nroSafe = String(oc.nro_oc).replace(/'/g, "\\'");
  // Ver (preview en modal) + Descargar PDF — siempre disponibles.
  btns.push(`<button onclick="window.previewPDFOC(${oc.id_oc}, '${nroSafe}')" style="padding:10px 18px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-weight:600">👁️ Ver</button>`);
  btns.push(`<button onclick="OC.descargarPDF(${oc.id_oc})" style="padding:10px 18px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">📄 Descargar PDF</button>`);
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
  // Editar — hasta ENVIADA inclusive (después la mercadería ya fue recibida).
  if (['BORRADOR', 'APROBADA', 'ENVIADA'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.editar(${oc.id_oc})" style="padding:10px 18px;background:#f59e0b;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">✎ Editar</button>`);
  }
  // Eliminar físico — hasta APROBADA inclusive, solo GERENTE.
  if (['BORRADOR', 'APROBADA'].includes(oc.estado) && esGerente) {
    btns.push(`<button onclick="OC.eliminarOC(${oc.id_oc}, '${nroSafe}')" style="padding:10px 18px;background:transparent;color:#7f1d1d;border:1px solid #7f1d1d;border-radius:6px;cursor:pointer;font-weight:600">🗑 Eliminar</button>`);
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
    setTimeout(() => window.navigate('ordenes-compra'), 600);
  } catch (e) { showError(e.message); }
}

async function enviar(id) {
  // Una vez ENVIADA la OC ya no se puede eliminar: el PDF ya salió al proveedor.
  const ok = await confirmarAccion({
    titulo: '📤 Marcar como Enviada',
    mensaje: 'Una vez marcada como <strong>ENVIADA</strong>, esta OC <strong style="color:#dc2626">ya no podrá eliminarse</strong>. Solo podrás editarla o anularla. ¿Estás seguro?',
    tipo: 'warning',
    textoBoton: 'Sí, marcar como Enviada',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.enviar(id);
    showSuccess('OC marcada como enviada');
    setTimeout(() => window.navigate('ordenes-compra'), 600);
  } catch (e) { showError(e.message); }
}

async function recibir(id) {
  const oc = await api.ordenesCompra.get(id);
  // Solo alertamos en la PRIMERA recepción (cuando aún no es RECIBIDA_PARCIAL).
  // En recepciones siguientes ya pasamos el punto donde se podía editar, así que
  // mostrar otra vez la alerta sería ruido.
  if (['APROBADA', 'ENVIADA'].includes(oc.estado)) {
    const ok = await confirmarAccion({
      titulo: '📦 Registrar primera recepción',
      mensaje: 'Una vez registres recepción (parcial o total), esta OC <strong style="color:#dc2626">ya no podrá editarse</strong>. ¿Estás seguro de continuar?',
      tipo: 'warning',
      textoBoton: 'Sí, registrar recepción',
    });
    if (!ok) return;
  }
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
    setTimeout(() => window.navigate('ordenes-compra'), 600);
  } catch (e) { showError(e.message); }
}

async function facturar(id) {
  // Una vez FACTURADA, ya no se puede anular (debe usarse Nota de Crédito).
  const ok = await confirmarAccion({
    titulo: '🧾 Registrar factura del proveedor',
    mensaje: 'Una vez facturada, esta OC <strong style="color:#dc2626">ya no podrá anularse</strong> — para revertirla deberás emitir una Nota de Crédito. ¿Estás seguro?',
    tipo: 'warning',
    textoBoton: 'Sí, continuar',
  });
  if (!ok) return;
  const nro = prompt('N° factura del proveedor (ej. F001-00123):');
  if (!nro) return;
  const fecha = prompt('Fecha de la factura (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!fecha) return;
  try {
    await api.ordenesCompra.facturar(id, { nro_factura_proveedor: nro, fecha_factura: fecha });
    showSuccess('OC facturada — se creó registro en Compras');
    setTimeout(() => window.navigate('ordenes-compra'), 800);
  } catch (e) { showError(e.message); }
}

async function anular(id) {
  const motivo = prompt('Motivo de anulación:');
  if (!motivo) return;
  try {
    await api.ordenesCompra.anular(id, motivo);
    showSuccess('OC anulada');
    setTimeout(() => window.navigate('ordenes-compra'), 600);
  } catch (e) { showError(e.message); }
}

// Editar OC: trae los datos completos y abre el modal de Nueva OC en modo edición.
async function editar(id) {
  try {
    const oc = await api.ordenesCompra.get(id);
    if (!['BORRADOR', 'APROBADA', 'ENVIADA'].includes(oc.estado)) {
      return showError(`No se puede editar una OC en estado ${oc.estado}`);
    }
    nuevaOC(oc);
  } catch (e) { showError('Error cargando OC: ' + (e.message || e)); }
}

// Eliminar OC físicamente. Solo GERENTE en BORRADOR/APROBADA. Requiere tipear el N° de OC.
async function eliminarOC(id, nro) {
  const ok = await confirmarTexto({
    titulo: '🗑 Eliminar OC permanentemente',
    mensaje: `Estás por eliminar la OC <strong>${nro}</strong> de la base de datos junto con todas sus líneas y aprobaciones. Esta acción es <strong>irreversible</strong> y libera el correlativo para reuso.`,
    textoRequerido: nro,
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.eliminar(id);
    showSuccess('OC eliminada');
    setTimeout(() => window.navigate('ordenes-compra'), 600);
  } catch (e) { showError(e.message); }
}

async function descargarPDF(id) {
  try {
    const r = await api.ordenesCompra.descargarPDF(id);
    showSuccess('PDF abierto en nueva pestaña');
  } catch (e) { showError('Error generando PDF: ' + e.message); }
}

// ──────── Modal: Nueva / Editar OC ────────
// Si recibe `editData` (objeto OC con .detalle), abre en modo edición y al
// guardar llama a `actualizar` en lugar de `create`. Sin argumentos = creación.
function nuevaOC(editData) {
  const esEdit = !!editData;
  const hoy = new Date().toISOString().slice(0, 10);
  const sel = (current, value) => current === value ? 'selected' : '';
  // Helper para prellenar inputs en modo edit (escapa comillas dobles)
  const v = (x) => x == null ? '' : String(x).replace(/"/g, '&quot;');

  const provOpts = _proveedores.map(p =>
    `<option value="${p.id_proveedor}" ${sel(editData?.id_proveedor, p.id_proveedor)}>${p.razon_social} (RUC ${p.ruc || '—'})</option>`
  ).join('');
  const servOpts = _servicios.map(s =>
    `<option value="${s.id_servicio}" ${sel(editData?.id_servicio, s.id_servicio)}>${s.codigo || ('SRV-' + s.id_servicio)} · ${s.nombre || s.cliente || ''}</option>`
  ).join('');

  const fechaEmision   = esEdit ? String(editData.fecha_emision || '').slice(0, 10) : hoy;
  const fechaEntrega   = esEdit ? String(editData.fecha_entrega_esperada || '').slice(0, 10) : '';
  const empresa        = esEdit ? (editData.empresa || 'ME') : 'ME';
  const tipoOC         = esEdit ? (editData.tipo_oc || 'GENERAL') : 'GENERAL';
  const moneda         = esEdit ? (editData.moneda || 'PEN') : 'PEN';
  const tipoCambio     = esEdit ? Number(editData.tipo_cambio || 1).toFixed(4) : '1.0000';
  const formaPago      = esEdit ? (editData.forma_pago || 'CONTADO') : 'CONTADO';
  const diasCredito    = esEdit ? (editData.dias_credito || 0) : 0;
  const centroCosto    = esEdit ? (editData.centro_costo || 'OFICINA CENTRAL') : 'OFICINA CENTRAL';
  const observaciones  = esEdit ? (editData.observaciones || '') : '';
  const aplicaIgv      = esEdit ? !!Number(editData.aplica_igv) : !!_cfg.aplica_igv;
  const tituloModal    = esEdit ? `✎ Editar OC ${editData.nro_oc}` : '➕ Nueva Orden de Compra';
  const textoBotonOk   = esEdit ? 'Guardar cambios' : 'Crear OC';

  document.getElementById('oc-modal').innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:white;border-radius:12px;width:900px;max-width:95vw;max-height:90vh;overflow:auto;padding:24px">
        <h2 style="margin-bottom:16px">${tituloModal}</h2>
        ${esEdit ? `<div style="background:#fef3c7;border:1px solid #fbbf24;color:#92400e;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px">
          Estás editando una OC existente. Los totales se recalculan al guardar. Estado actual: <strong>${editData.estado}</strong>.
        </div>` : ''}
        <form id="form-oc" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <div><label>Fecha emisión ${tip('Fecha en la que emitís esta OC al proveedor.')}</label><input type="date" name="fecha_emision" value="${fechaEmision}" required></div>
          <div><label>Entrega esperada ${tip('Cuándo necesitás recibir el material o servicio. Se usa para alertas de OC vencida.')}</label><input type="date" name="fecha_entrega_esperada" value="${fechaEntrega}"></div>
          <div><label>Empresa ${tip('ME = Metal Engineers (factura en PEN). PT = Perfotools (factura en USD). Define la marca/empresa que emite la OC.')}</label>
            <select name="empresa"><option value="ME" ${sel(empresa,'ME')}>Metal Engineers (PEN)</option><option value="PT" ${sel(empresa,'PT')}>Perfotools (USD)</option></select>
          </div>
          <div style="grid-column:span 2"><label>Proveedor * ${tip('Maestro de proveedores. Si no lo encontrás, creálo primero en Logística → Proveedores.')}</label><select name="id_proveedor" required><option value="">— Selecciona —</option>${provOpts}</select></div>
          <div><label>Tipo ${tip('GENERAL: oficina (luz, agua, internet).\nSERVICIO: vinculado a un proyecto/obra (honorarios, fletes).\nALMACÉN: insumos que entran al inventario valorizado.')}</label>
            <select name="tipo_oc">
              <option value="GENERAL" ${sel(tipoOC,'GENERAL')}>General (oficina)</option>
              <option value="SERVICIO" ${sel(tipoOC,'SERVICIO')}>Servicio (proyecto)</option>
              <option value="ALMACEN" ${sel(tipoOC,'ALMACEN')}>Almacén (stock)</option>
            </select>
          </div>
          <div style="grid-column:span 3"><label>Servicio/Proyecto (si tipo=SERVICIO) ${tip('Solo si tipo=SERVICIO. Vincula la OC al proyecto/obra para que el costo aparezca en su rentabilidad.')}</label><select name="id_servicio"><option value="">—</option>${servOpts}</select></div>
          <div><label>Moneda ${tip('PEN = Soles. USD = Dólares. Si elegís USD, el tipo de cambio se usa para convertir todo a PEN para totales y reportes.')}</label>
            <select name="moneda"><option value="PEN" ${sel(moneda,'PEN')}>PEN</option><option value="USD" ${sel(moneda,'USD')}>USD</option></select>
          </div>
          <div><label>Tipo cambio ${tip('TC del día (USD a PEN). Solo se aplica si moneda=USD. Ej: 3.85 significa 1 USD = S/ 3.85.')}</label><input type="number" step="0.0001" name="tipo_cambio" value="${tipoCambio}"></div>
          <div><label>Forma pago ${tip('CONTADO: pago al recibir factura.\nCRÉDITO: pago a N días después de la factura.')}</label>
            <select name="forma_pago"><option value="CONTADO" ${sel(formaPago,'CONTADO')}>Contado</option><option value="CREDITO" ${sel(formaPago,'CREDITO')}>Crédito</option></select>
          </div>
          <div><label>Días crédito ${tip('Solo aplica si Forma pago = CRÉDITO. Cantidad de días para pagar después de recibir la factura del proveedor.')}</label><input type="number" name="dias_credito" value="${diasCredito}"></div>
          <div style="grid-column:span 2"><label>Centro de costo ${tip('Categoría contable del gasto. Ej: OFICINA CENTRAL para gastos generales, ALMACEN METAL para insumos, o el nombre del proyecto para gastos de servicio.')}</label><input name="centro_costo" value="${v(centroCosto)}"></div>
          <div style="grid-column:span 3"><label>Observaciones ${tip('Comentario libre para el proveedor o nota interna. Aparece en el PDF de la OC.')}</label><input name="observaciones" placeholder="Ej: Urgente, entrega en obra Toromocho" value="${v(observaciones)}"></div>
          <div style="grid-column:span 3">
            <label style="font-size:13px;font-weight:700;margin-top:10px;display:block">Líneas</label>
            <div id="oc-lineas" style="display:flex;flex-direction:column;gap:6px"></div>
            <button type="button" onclick="OC._addLinea()" style="margin-top:8px;padding:6px 14px;background:var(--bg-app);border:1px dashed #d9dad9;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar línea</button>
          </div>
          <div style="grid-column:span 3">
            <label style="display:flex;gap:6px;align-items:center;font-size:12px">
              <input type="checkbox" name="aplica_igv" ${aplicaIgv ? 'checked' : ''}> Aplica IGV 18%
            </label>
          </div>
          <div style="grid-column:span 3;display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <span style="font-size:13px;color:var(--text-secondary)">
              ${esEdit ? '✎ Modo edición — los totales se recalculan al guardar' : `📌 OCs ≤ <strong>${fPEN(_cfg.monto_limite_sin_aprobacion)}</strong> se auto-aprueban`}
            </span>
            <div style="display:flex;gap:10px">
              <button type="button" onclick="document.getElementById('oc-modal').innerHTML=''" style="padding:10px 18px;background:transparent;border:1px solid #d9dad9;border-radius:6px;cursor:pointer">Cancelar</button>
              <button type="submit" style="padding:10px 24px;background:var(--primary-color);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700">${textoBotonOk}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  // Inicializar líneas: si es edit, copiar las del detalle existente
  const lineas = esEdit
    ? (editData.detalle || []).map(d => ({
        descripcion:     d.descripcion || '',
        unidad:          d.unidad || 'UND',
        cantidad:        Number(d.cantidad) || 0,
        precio_unitario: Number(d.precio_unitario) || 0,
        id_item:         d.id_item || null,
        codigo:          d.codigo || null,
      }))
    : [];
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
  // En modo edit ya tenemos las líneas del detalle, solo renderizamos.
  // En modo create arrancamos con una línea vacía.
  if (esEdit) renderLineas();
  else        window.OC._addLinea();

  document.getElementById('form-oc').onsubmit = async (e) => {
    e.preventDefault();
    if (!lineas.length || lineas.some(l => !l.descripcion || l.cantidad <= 0)) {
      return showError('Agrega al menos una línea con descripción y cantidad > 0');
    }
    const fd = new FormData(e.target);
    const payload = {
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
    };
    try {
      if (esEdit) {
        await api.ordenesCompra.actualizar(editData.id_oc, payload);
        showSuccess(`OC ${editData.nro_oc} actualizada`);
      } else {
        const r = await api.ordenesCompra.create(payload);
        showSuccess(`OC ${r.nro_oc} creada · ${r.autoAprobada ? '✓ Auto-aprobada' : 'Pendiente aprobación'}`);
      }
      setTimeout(() => window.navigate('ordenes-compra'), 800);
    } catch (err) {
      showError(err.message || (esEdit ? 'Error actualizando OC' : 'Error creando OC'));
    }
  };
}

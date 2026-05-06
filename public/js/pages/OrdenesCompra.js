/**
 * OrdenesCompra.js — Módulo 📋 Órdenes de Compra (rediseño 2026-05-06)
 *
 * State machine simplificado:
 *   BORRADOR → APROBADA → PAGO → RECEPCION → FACTURACION → TERMINADA
 *                                                       ↘ CERRADA_SIN_FACTURA
 *                                       (o ANULADA en pasos previos a FACTURACION)
 *
 * Card lleva dot semáforo (🔴/🟠/🟢) según fase + badges para problemas heredados.
 * Spec: docs/superpowers/specs/2026-05-06-logistica-kanban-rediseno-design.md
 */

import { api } from '../services/api.js';
import { showSuccess, showError, tip } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';
import { pill } from '../components/Pill.js';

const ESTADO_COLOR = {
  BORRADOR:           { bg: '#f3f4f6', fg: '#374151', icon: '📝', label: 'Borrador' },
  APROBADA:           { bg: '#dbeafe', fg: '#1e3a8a', icon: '✅', label: 'Aprobada' },
  PAGO:               { bg: '#fee2e2', fg: '#991b1b', icon: '💰', label: 'Pago' },
  RECEPCION:          { bg: '#fef9c3', fg: '#713f12', icon: '📦', label: 'Recepción' },
  FACTURACION:        { bg: '#fef3c7', fg: '#854d0e', icon: '🧾', label: 'Facturación' },
  TERMINADA:          { bg: '#dcfce7', fg: '#166534', icon: '✓', label: 'Terminada' },
  CERRADA_SIN_FACTURA:{ bg: '#fce7f3', fg: '#9d174d', icon: '🗂', label: 'Cerrada sin factura' },
  ANULADA:            { bg: '#e5e7eb', fg: '#6b7280', icon: '❌', label: 'Anulada' },
};

const COLUMNAS_KANBAN_PRINCIPALES = [
  'BORRADOR','APROBADA','PAGO','RECEPCION','FACTURACION','TERMINADA'
];
const COLUMNAS_KANBAN_TERMINALES = ['CERRADA_SIN_FACTURA','ANULADA'];

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

// Helper: refresca el listado de OC en su sitio. Si la OC está embebida
// dentro del hub de Logística (#logi-panel-oc), re-renderiza ese panel
// inline para mantener al usuario en la pestaña donde estaba. Si la página
// se está usando standalone, navega normalmente.
async function refreshOC() {
  const logiPanel = document.getElementById('logi-panel-oc');
  if (logiPanel && logiPanel.style.display !== 'none') {
    try {
      const html = await OrdenesCompra();
      logiPanel.innerHTML = html.replace(/<header[\s\S]*?<\/header>/, '');
    } catch (e) {
      logiPanel.innerHTML = `<div style="padding:40px;color:var(--danger)">Error: ${e.message}</div>`;
    }
    return;
  }
  window.navigate('ordenes-compra');
}

export const OrdenesCompra = async () => {
  try {
    [_ocs, _proveedores, _servicios, _cfg] = await Promise.all([
      api.ordenesCompra.list().catch(() => []),
      api.purchases.getProveedores().catch(() => []),
      api.services.getServiciosActivos().catch(() => []),
      api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000, permitir_correlativo_manual: false })),
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
}

// Helper: garantiza que #oc-modal exista en el DOM. Si no está (caso usuario
// invoca OC.verOC desde otro módulo como Logistica → tab Sin facturar),
// lo crea on-demand en document.body.
function ensureOCModal() {
  let modal = document.getElementById('oc-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'oc-modal';
    document.body.appendChild(modal);
  }
  return modal;
}
// Lo expongo en window para que se pueda llamar desde otros módulos si hace falta
window.ensureOCModal = ensureOCModal;

// Exponer handlers globales como side-effect del módulo (no dentro de init()
// porque otros módulos como Logistica → tab "Sin facturar" necesitan llamar
// a OC.verOC sin haber montado el TabBar de OrdenesCompra). Las function
// declarations se hoistean, así que las referencias funcionan aunque estén
// definidas más abajo en el archivo.
window.OC = { nuevaOC, verOC, aprobar, aprobarParaPago, marcarCredito, subirFactura, eliminarFactura, agregarNota, recibir, facturar, registrarPago, cerrarSinFactura, cerrarPagaSinFactura, asociarFactura, anular, reactivar, eliminarOC, editar, editarFecha, editarMetadata: editarMetadataOC, descargarPDF, reporteROC, descargarExcel: () => api.ordenesCompra.descargarExcel().catch(e => showError(e.message || 'Error descargando Excel')) };

// Editar SOLO la fecha de emisión (corregir data histórica) — disponible en
// cualquier estado salvo ANULADA. No toca estado/items/totales/correlativo.
async function editarFecha(id, nro, fechaActual) {
  const nuevaFecha = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:380px;max-width:95vw;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 8px;font-size:15px">📅 Editar fecha · OC ${nro}</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">
          Útil para corregir data histórica. Solo cambia la fecha de emisión; no toca estado, totales ni el correlativo.
        </p>
        <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Nueva fecha de emisión</label>
        <input id="ocf-fecha" type="date" value="${fechaActual || new Date().toISOString().slice(0,10)}"
          style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button id="ocf-cancel" style="padding:7px 14px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:12px">Cancelar</button>
          <button id="ocf-ok" style="padding:7px 18px;background:#2563eb;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#ocf-cancel').onclick = () => close(null);
    ov.querySelector('#ocf-ok').onclick = () => {
      const v = ov.querySelector('#ocf-fecha').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return showError('Fecha inválida');
      close(v);
    };
  });
  if (!nuevaFecha) return;
  try {
    await api.ordenesCompra.editarFecha(id, nuevaFecha);
    showSuccess(`Fecha de OC ${nro} actualizada a ${nuevaFecha}`);
    setTimeout(() => refreshOC(), 600);
  } catch (e) { showError(e.message); }
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
          <button onclick="document.getElementById('ov-roc').remove()" title="Cerrar reporte sin descargar" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
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
let _kanbanFiltros = { cc: '', mes: '', soloProblemas: false };

function renderKanban(panel) {
  panel.dataset.rendered = '1';
  // Calcular opciones para los filtros
  const centrosCosto = [...new Set(_ocs.map(o => o.centro_costo).filter(Boolean))].sort();
  const meses = [...new Set(_ocs.map(o => (o.fecha_emision || '').slice(0,7)).filter(Boolean))].sort().reverse();
  const mesActual = new Date().toISOString().slice(0,7);
  // Default: mes actual si tiene OCs, sino el primero disponible
  if (!_kanbanFiltros.mes) {
    _kanbanFiltros.mes = meses.includes(mesActual) ? mesActual : (meses[0] || '');
  }

  panel.innerHTML = `
    <div class="oc-kanban-filtros">
      <label>Centro de costo:
        <select id="oc-filtro-cc">
          <option value="">Todos</option>
          ${centrosCosto.map(c => `<option value="${escapeHtml(c)}" ${_kanbanFiltros.cc === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </label>
      <label>Mes/Año:
        <select id="oc-filtro-mes">
          <option value="">Todos</option>
          ${meses.map(m => `<option value="${m}" ${_kanbanFiltros.mes === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" id="oc-filtro-problemas" ${_kanbanFiltros.soloProblemas ? 'checked' : ''}>
        Solo problemas
      </label>
      <button id="oc-btn-export" class="btn-secondary" type="button" title="Descargar TODAS las OCs en Excel">📊 Exportar Excel</button>
    </div>
    <div id="oc-kanban-board" class="oc-kanban-board"></div>
    <div style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:6px;font-size:11px;color:var(--text-secondary)">
      💡 <strong>Auto-aprobación:</strong> OCs ≤ ${fPEN(_cfg.monto_limite_sin_aprobacion)} pasan directo a APROBADA.
      Para cambiarlo ve a ⚙️ Configuración → Preferencias → Monto límite sin aprobación.
    </div>
  `;

  // Bind filter handlers
  document.getElementById('oc-filtro-cc').addEventListener('change', e => {
    _kanbanFiltros.cc = e.target.value;
    pintarColumnasKanban();
  });
  document.getElementById('oc-filtro-mes').addEventListener('change', e => {
    _kanbanFiltros.mes = e.target.value;
    pintarColumnasKanban();
  });
  document.getElementById('oc-filtro-problemas').addEventListener('change', e => {
    _kanbanFiltros.soloProblemas = e.target.checked;
    pintarColumnasKanban();
  });
  document.getElementById('oc-btn-export').addEventListener('click', () => {
    const token = localStorage.getItem('erp_token');
    fetch('/api/ordenes-compra/listado/excel', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.blob()).then(b => {
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OCs_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  pintarColumnasKanban();
}

function pintarColumnasKanban() {
  const board = document.getElementById('oc-kanban-board');
  if (!board) return;

  const filtradas = _ocs.filter(oc => {
    if (oc.estado === 'ANULADA') return false;
    if (_kanbanFiltros.cc && oc.centro_costo !== _kanbanFiltros.cc) return false;
    if (_kanbanFiltros.mes && !(oc.fecha_emision || '').startsWith(_kanbanFiltros.mes)) return false;
    if (_kanbanFiltros.soloProblemas && !ocTieneProblema(oc)) return false;
    return true;
  });

  const estadosOrden = ['BORRADOR', 'APROBADA', 'PAGO', 'RECEPCION', 'FACTURACION', 'TERMINADA'];
  const porEstado = {};
  estadosOrden.forEach(e => porEstado[e] = []);
  filtradas.forEach(oc => {
    if (porEstado[oc.estado]) porEstado[oc.estado].push(oc);
  });

  board.innerHTML = estadosOrden.map(estado => {
    const color = ESTADO_COLOR[estado];
    const ocs = porEstado[estado];
    return `
      <div class="oc-kanban-column" data-estado="${estado}" style="background:${color.bg}">
        <div class="oc-kanban-header" style="border-bottom:2px solid ${color.fg}22">
          <strong style="color:${color.fg}">${color.icon} ${estado.replace('_', ' ')}</strong>
          <span class="count" style="background:${color.fg}">${ocs.length}</span>
        </div>
        <div class="oc-kanban-cards">
          ${ocs.length ? ocs.map(oc => kanbanCard(oc, color)).join('') :
            `<div class="oc-kanban-empty" style="color:${color.fg}77">—</div>`}
        </div>
      </div>
    `;
  }).join('');
}

function ocTieneProblema(oc) {
  if (oc.estado_pago === 'PARCIAL' || oc.estado_pago === 'PENDIENTE') return true;
  if (oc.forma_pago === 'CREDITO' && oc.estado_pago !== 'PAGADO') return true;
  if (oc.estado === 'FACTURACION' && oc.estado_factura === 'PENDIENTE') return true;
  return false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function kanbanCard(oc, color) {
  const monto = oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total);
  const dotClass = calcularDotClass(oc);
  const badges = calcularBadges(oc);
  const dotTitle = `Estado: ${oc.estado} · Pago: ${oc.estado_pago || '-'} · Factura: ${oc.estado_factura || '-'}${oc.estado_recepcion ? ' · Recepción: ' + oc.estado_recepcion : ''}`;

  return `
    <div class="oc-card" onclick="OC.verOC(${oc.id_oc})" style="border-left:3px solid ${color.fg}">
      <div class="oc-card-head">
        <span class="oc-dot ${dotClass}" title="${dotTitle}"></span>
        <strong class="oc-nro">${oc.nro_oc}</strong>
        <span class="oc-marca" style="background:${oc.empresa === 'PT' ? '#16a34a' : '#676767'}">${oc.empresa}</span>
      </div>
      <div class="oc-prov">${escapeHtml((oc.proveedor_nombre || '—').slice(0, 32))}</div>
      <div class="oc-row">
        <span class="oc-fecha">${fmtDate(oc.fecha_emision)}</span>
        <strong class="oc-monto">${monto}</strong>
      </div>
      ${badges.map(b => `<div class="oc-badge ${b.tipo}">${b.texto}</div>`).join('')}
    </div>
  `;
}

function calcularDotClass(oc) {
  switch (oc.estado) {
    case 'APROBADA':           return 'dot-neutro';
    case 'PAGO':               return 'dot-rojo';
    case 'RECEPCION': {
      const r = oc.estado_recepcion || 'NO_RECIBIDO';
      if (r === 'RECIBIDO') return 'dot-verde';
      if (r === 'PARCIAL')  return 'dot-naranja';
      return 'dot-rojo';
    }
    case 'FACTURACION':        return oc.estado_factura === 'FACTURADA' ? 'dot-verde' : 'dot-rojo';
    case 'TERMINADA':          return 'dot-verde';
    case 'CERRADA_SIN_FACTURA':return 'dot-gris';
    case 'ANULADA':            return 'dot-gris';
    default:                   return 'dot-neutro';
  }
}

function calcularBadges(oc) {
  const bs = [];
  // Saldo pendiente
  if (oc.estado_pago === 'PARCIAL') {
    const saldo = Number(oc.total) - Number(oc.monto_pagado || 0);
    bs.push({ tipo: 'warn', texto: `⚠ Saldo S/ ${saldo.toFixed(2)} pdte` });
  }
  // Crédito vence
  if (oc.forma_pago === 'CREDITO' && oc.estado_pago !== 'PAGADO' && oc.fecha_credito_vence) {
    const fechaCorta = String(oc.fecha_credito_vence).slice(0, 10);
    bs.push({ tipo: 'warn', texto: `⚠ Crédito vence ${fechaCorta}` });
  }
  // Demora en recepción
  if (oc.estado === 'RECEPCION' && oc.estado_pago === 'PAGADO' && oc.pagada_at) {
    const dias = Math.floor((Date.now() - new Date(oc.pagada_at).getTime()) / 86400000);
    if (dias > 15) bs.push({ tipo: 'danger', texto: `⚠ Sin recibir hace ${dias}d` });
  }
  // Demora en factura
  if (oc.estado === 'FACTURACION' && oc.estado_factura === 'PENDIENTE' && oc.updated_at) {
    const dias = Math.floor((Date.now() - new Date(oc.updated_at).getTime()) / 86400000);
    if (dias > 15) bs.push({ tipo: 'warn', texto: `⚠ Sin factura hace ${dias}d` });
  }
  return bs;
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
    <div style="margin-top:16px;display:flex;justify-content:flex-end;margin-bottom:8px">
      <button onclick="OC.descargarExcel()"
              title="Descargar TODAS las OCs en Excel — incluye estado, pago, factura, fechas, crédito"
              class="btn-secondary">📊 Exportar Excel</button>
    </div>
    <div class="card">
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
              const fechaIso = oc.fecha_emision ? String(oc.fecha_emision).split('T')[0] : '';
              const puedeEditarFecha = oc.estado !== 'ANULADA';
              return `
                <tr style="border-bottom:1px solid #e5e7eb">
                  <td style="padding:8px;font-weight:700"><a href="#" onclick="event.preventDefault();OC.verOC(${oc.id_oc})" style="color:var(--primary-color);text-decoration:none">${oc.nro_oc}</a></td>
                  <td style="padding:8px;white-space:nowrap">
                    ${fmtDate(oc.fecha_emision)}
                    ${puedeEditarFecha ? `<button onclick="OC.editarFecha(${oc.id_oc},'${oc.nro_oc.replace(/'/g, "\\'")}','${fechaIso}')" title="Editar fecha (corregir data histórica)" style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:12px;padding:0 2px;margin-left:4px">📅</button>` : ''}
                  </td>
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
  const porRecibir = _ocs.filter(o => ['PAGO', 'RECEPCION'].includes(o.estado)).length;
  const porFacturar = _ocs.filter(o => o.estado === 'FACTURACION' && o.estado_factura === 'PENDIENTE').length;

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
    const [oc, facturaAdjunta] = await Promise.all([
      api.ordenesCompra.get(id_oc),
      api.ordenesCompra.getFactura(id_oc).catch(() => null),
    ]);
    const color = ESTADO_COLOR[oc.estado];
    const monto = oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total);

    // Inyectar la factura al objeto oc para que accionesSegunEstado la considere
    oc.factura_adjunta = facturaAdjunta;
    const botonesAccion = accionesSegunEstado(oc);

    ensureOCModal().innerHTML = `
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

          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;font-size:12px">
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Empresa:</strong> ${oc.empresa}</div>
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Tipo:</strong> ${oc.tipo_oc}</div>
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Moneda:</strong> ${oc.moneda} (TC ${oc.tipo_cambio})</div>
            <div style="padding:10px;background:#f9fafb;border-radius:6px"><strong>Forma pago:</strong> ${oc.forma_pago}${oc.dias_credito ? ` (${oc.dias_credito}d)` : ''}</div>
          </div>
          <div style="padding:10px 12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;margin-bottom:20px;font-size:13px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <span><strong>📂 Centro de Costo:</strong> ${oc.centro_costo || '<span style="color:#9a3412">— sin asignar</span>'}</span>
            ${oc.id_servicio ? `<span style="font-size:11px;color:#78350f">· id_servicio: ${oc.id_servicio}</span>` : ''}
          </div>

          ${oc.id_cotizacion && oc.cotizacion_nro ? `
          <div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px">
            🔗 <strong>Vinculada a:</strong> ${oc.cotizacion_nro} — ${oc.cotizacion_cliente || ''}${oc.cotizacion_proyecto ? ' · ' + oc.cotizacion_proyecto : ''}
          </div>` : ''}

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

          ${facturaAdjunta ? `
            <div style="padding:12px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;margin-bottom:16px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
              <div>
                📄 <strong>Factura adjunta:</strong>
                ${facturaAdjunta.nro_comprobante} ·
                Emitida ${fmtDate(facturaAdjunta.fecha_emision)} ·
                ${oc.moneda === 'USD' ? '$' : 'S/'} ${Number(facturaAdjunta.monto).toFixed(2)}
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                ${facturaAdjunta.url_pdf ? `
                  <a href="${facturaAdjunta.url_pdf}" target="_blank" rel="noopener" title="Abrir el comprobante subido a Cloudinary en una pestaña nueva" style="background:#16a34a;color:white;padding:6px 14px;border-radius:5px;text-decoration:none;font-weight:600;font-size:12px">📂 Ver comprobante</a>
                ` : '<span style="color:#6b7280;font-size:12px">(sin archivo subido)</span>'}
                ${(JSON.parse(localStorage.getItem('erp_user') || '{}').rol === 'GERENTE') ? `
                  <button onclick="OC.eliminarFactura(${oc.id_oc})" title="Eliminar factura adjunta. Vuelve la OC a estado_factura=PENDIENTE. El archivo en Cloudinary queda huérfano (no se borra). Solo GERENTE." style="background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:5px;padding:5px 9px;cursor:pointer;font-weight:700;font-size:13px">✕</button>
                ` : ''}
              </div>
            </div>
          ` : ''}

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
  btns.push(`<button onclick="window.previewPDFOC(${oc.id_oc}, '${nroSafe}')" title="Previsualizar el PDF de la OC en una ventana modal sin descargarlo." style="padding:10px 18px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-weight:600">👁️ Ver</button>`);
  btns.push(`<button onclick="OC.descargarPDF(${oc.id_oc})" title="Descargar el PDF de la OC con el formato oficial Metal Engineers / Perfotools." style="padding:10px 18px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">📄 Descargar PDF</button>`);
  if (oc.estado === 'BORRADOR') {
    btns.push(`<button onclick="OC.aprobar(${oc.id_oc})" title="Aprobar la OC. Pasa de BORRADOR a APROBADA y queda en revisión hasta que se le dé 'Aprobado para pago'." style="padding:10px 18px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">✓ Aprobar</button>`);
  }
  // APROBADA = puesto de control de revisión. Único avance hacia adelante: "Aprobado para pago" → PAGO.
  // No mostramos Registrar pago / Marcar crédito acá: esas acciones viven en PAGO.
  if (oc.estado === 'APROBADA' && !oc.es_honorario) {
    btns.push(`<button onclick="OC.aprobarParaPago(${oc.id_oc})" title="Marcar la OC como revisada y aprobada para pago. La envía a la bandeja de Finanzas (columna PAGO) para que registren el pago o crédito." style="padding:10px 18px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">✅ Aprobado para pago</button>`);
  }
  // Etiquetas contextuales: las OCs de honorarios (es_honorario=true)
  // representan trabajo de persona natural — NO hay envío ni recepción de
  // mercadería. El comprobante real es Recibo por Honorarios (RxH), no factura.
  const esHon = !!oc.es_honorario;
  const txtRecepcion    = esHon ? '✓ Marcar como realizado' : '📦 Registrar recepción';
  const ttRecepcion     = esHon
    ? 'Confirmar que la persona ya prestó el servicio acordado. Habilita el registro de pago y RxH.'
    : 'Marcar la mercadería/servicio como recibido. Si es OC de ALMACEN: ingresa el stock al inventario y registra el kárdex.';
  const txtFactura      = esHon ? '🧾 Recibí RxH' : '🧾 Recibí factura';
  const ttFactura       = esHon
    ? 'Cargar el N° del Recibo por Honorarios que emitió la persona. Genera el Gasto contable y la Tx en caja.'
    : 'Cargar la factura/boleta del proveedor. Genera la Compra (ALMACEN) o el Gasto (GENERAL/SERVICIO) y la Tx en caja. Después de esto la OC ya no se puede anular.';
  const txtFacturaTardia = esHon ? '🧾 Recibí RxH' : '🧾 Recibí factura';

  // "Marcar como Enviada" eliminado — ENVIADA ya no es un estado del flujo.
  if (['PAGO', 'RECEPCION'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.recibir(${oc.id_oc})" title="${ttRecepcion}" style="padding:10px 18px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${txtRecepcion}</button>`);
  }
  // En honorarios permitimos pagar directo desde APROBADA (atajo común:
  // contraté → trabajó → pagué, todo en el mismo día). Para no-honorarios
  // mantener flujo existente que requiere RECIBIDA primero.
  if (esHon && oc.estado === 'APROBADA') {
    btns.push(`<button onclick="OC.registrarPago(${oc.id_oc}, '${nroSafe}')" title="Pagar directamente al colaborador. Saltea los pasos de envío y recepción (no aplican en honorarios). La OC pasa a 'Pagada · pend. RxH' hasta que entregue el Recibo por Honorarios." style="padding:10px 18px;background:#15803d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💰 Registrar pago</button>`);
  }
  if (oc.estado === 'RECEPCION' && oc.estado_recepcion === 'RECIBIDO') {
    btns.push(`<button onclick="OC.facturar(${oc.id_oc})" title="${ttFactura}" style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${txtFactura}</button>`);
    btns.push(`<button onclick="OC.registrarPago(${oc.id_oc}, '${nroSafe}')" title="Registrar el pago sin haber recibido el comprobante todavía (caso típico: pago primero, comprobante llega después). La OC pasa a 'Pagada · pend. comprobante' y se genera la Tx + movimiento bancario." style="padding:10px 18px;background:#15803d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💰 Registrar pago</button>`);
    // "Cerrar sin facturar" solo aplica a GENERAL/SERVICIO (no ALMACEN).
    // ALMACEN siempre requiere comprobante porque genera stock valorizado.
    if (oc.tipo_oc !== 'ALMACEN') {
      btns.push(`<button onclick="OC.cerrarSinFactura(${oc.id_oc}, '${nroSafe}')" title="Cerrar la OC sin comprobante formal (compra al contado, caja chica, etc). Genera el Gasto contable pero deja la OC en bandeja 'Sin facturar' por si después llega el comprobante." style="padding:10px 18px;background:#ea580c;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🗂 Cerrar sin comprobante</button>`);
    }
  }
  // FACTURACION con factura recibida pero sin pago → ofrecer Registrar pago para cerrar a TERMINADA.
  if (oc.estado === 'FACTURACION' && oc.estado_factura === 'FACTURADA') {
    btns.push(`<button onclick="OC.registrarPago(${oc.id_oc}, '${nroSafe}')" title="Registrar el pago al proveedor de este comprobante. Genera el movimiento bancario y cierra la OC en 'Terminada (pago + comprobante)'." style="padding:10px 18px;background:#15803d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💰 Registrar pago</button>`);
  }
  // FACTURACION con pago registrado pero sin comprobante → ofrecer Recibí factura/RxH,
  // o "Dar por cerrada sin comprobante" si el proveedor nunca lo va a entregar (no aplica a ALMACEN).
  if (oc.estado === 'FACTURACION' && oc.estado_factura === 'PENDIENTE' && oc.estado_pago === 'PAGADO') {
    btns.push(`<button onclick="OC.facturar(${oc.id_oc})" title="Cargar el comprobante (factura, boleta o RxH) que llegó después del pago. Enriquece la Compra/Gasto provisorio con el N° de comprobante y cierra la OC en 'Terminada (pago + comprobante)'." style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${txtFactura}</button>`);
    if (oc.tipo_oc !== 'ALMACEN') {
      btns.push(`<button onclick="OC.cerrarPagaSinFactura(${oc.id_oc}, '${nroSafe}')" title="Dar por cerrada esta OC sin esperar comprobante (el proveedor no lo entregará). El Gasto provisorio que se creó al registrar el pago queda en BD sin nro de comprobante. ALMACEN no permite esta acción." style="padding:10px 18px;background:#ea580c;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🗂 Cerrar sin comprobante</button>`);
    }
  }
  // OC cerrada sin factura — ofrecer asociar factura tardía
  if (oc.estado === 'CERRADA_SIN_FACTURA') {
    btns.push(`<button onclick="OC.asociarFactura(${oc.id_oc}, '${nroSafe}')" title="El proveedor mandó la factura después de cerrar. Vinculala a esta OC y pasa al estado FACTURADA." style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🧾 Asociar factura tardía</button>`);
  }
  // Marcar crédito — solo en PAGO (Finanzas decide si pagar o postergar). En APROBADA no aplica.
  if (oc.estado === 'PAGO') {
    btns.push(`<button onclick="OC.marcarCredito(${oc.id_oc})" title="Registrar días de crédito y fecha de vencimiento para esta OC. Útil cuando el proveedor da plazo de pago." style="padding:10px 18px;background:#0891b2;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💳 Marcar crédito</button>`);
  }
  // Subir factura del proveedor manualmente — en RECEPCION o FACTURACION.
  // Si ya hay una factura adjunta, el botón cambia de etiqueta a "Reemplazar".
  if (['RECEPCION', 'FACTURACION'].includes(oc.estado)) {
    const yaTiene = !!oc.factura_adjunta;
    const etiqueta = yaTiene ? '🔁 Reemplazar factura' : '📄 Subir factura';
    const tip = yaTiene
      ? 'Reemplazar el comprobante actual del proveedor (PDF o imagen) con uno nuevo.'
      : 'Adjuntar la factura o comprobante del proveedor (PDF o imagen) con su N° y monto.';
    btns.push(`<button onclick="OC.subirFactura(${oc.id_oc})" title="${tip}" style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${etiqueta}</button>`);
  }
  // Agregar nota libre — disponible en cualquier estado activo (no ANULADA ni TERMINADA ni CERRADA_SIN_FACTURA).
  if (!['ANULADA', 'TERMINADA', 'CERRADA_SIN_FACTURA'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.agregarNota(${oc.id_oc})" title="Añadir una nota interna a esta OC (seguimiento, acuerdos, observaciones)." style="padding:10px 18px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-weight:600">📝 Nota</button>`);
  }
  // Editar líneas/montos — hasta PAGO inclusive (después la mercadería ya fue recibida).
  if (['BORRADOR', 'APROBADA', 'PAGO'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.editar(${oc.id_oc})" title="Edición completa: cambiar items, cantidades, precios, totales, proveedor. Solo disponible antes de recibir mercadería." style="padding:10px 18px;background:#f59e0b;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">✎ Editar líneas</button>`);
  }
  // Editar metadata segura (centro_costo, concepto, observaciones, contactos) —
  // disponible en CUALQUIER estado salvo ANULADA. No toca números.
  if (oc.estado !== 'ANULADA') {
    btns.push(`<button onclick="OC.editarMetadata(${oc.id_oc}, '${nroSafe}')" title="Edición segura en cualquier estado: corregir centro de costo, concepto, atención, contactos. NO toca números ni inventario." style="padding:10px 18px;background:#fff;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;cursor:pointer;font-weight:600">✎ Editar concepto/CC</button>`);
  }
  // Eliminar físico — disponible en CUALQUIER estado, solo GERENTE.
  // Backend hace cascada completa (Tx, Compras/Gastos, Inventario, CostosServicio).
  if (esGerente) {
    btns.push(`<button onclick="OC.eliminarOC(${oc.id_oc}, '${nroSafe}')" title="Eliminar permanente con cascada total (solo GERENTE). Borra OC + Compra/Gasto generado + Tx caja + Movimientos inventario + reverso de stock. Pide tipear el N° de OC para confirmar." style="padding:10px 18px;background:transparent;color:#7f1d1d;border:1px solid #7f1d1d;border-radius:6px;cursor:pointer;font-weight:600">🗑 Eliminar</button>`);
  }
  if (!['TERMINADA', 'ANULADA', 'CERRADA_SIN_FACTURA'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.anular(${oc.id_oc})" title="Anular la OC (cambia el estado, no borra nada). El correlativo queda quemado y la OC pasa al archivo. Disponible hasta antes de facturar o pagar." style="padding:10px 18px;background:transparent;color:#dc2626;border:1px solid #dc2626;border-radius:6px;cursor:pointer;font-weight:600">Anular</button>`);
  }
  // Reactivar — solo si está ANULADA y eres GERENTE. Vuelve la OC a BORRADOR.
  if (oc.estado === 'ANULADA' && esGerente) {
    btns.push(`<button onclick="OC.reactivar(${oc.id_oc}, '${nroSafe}')" title="Devolver la OC anulada a BORRADOR para retomar su flujo (solo GERENTE)." style="padding:10px 18px;background:#0891b2;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">♻ Reactivar</button>`);
  }
  return btns.join('');
}

// ──────── Acciones workflow ────────
async function aprobar(id) {
  const c = prompt('Comentario de aprobación (opcional):');
  if (c === null) return;
  try {
    await api.ordenesCompra.aprobar(id, { comentario: c });
    showSuccess('OC aprobada — queda en revisión');
    setTimeout(() => refreshOC(), 600);
  } catch (e) { showError(e.message); }
}

async function aprobarParaPago(id) {
  const ok = await confirmarAccion({
    titulo: '✅ Aprobado para pago',
    mensaje: 'La OC pasará de <strong>APROBADA</strong> a <strong>PAGO</strong>, quedando en la bandeja de Finanzas para que registren el pago o crédito. ¿Confirmás?',
    tipo: 'info',
    textoBoton: 'Sí, aprobar para pago',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.aprobarParaPago(id);
    showSuccess('OC aprobada para pago');
    setTimeout(() => refreshOC(), 600);
  } catch (e) { showError(e.message); }
}

// ──────── promptModal: input/textarea genérico en overlay ────────
function promptModal({ titulo, label, defecto = '', textarea = false, requerido = false }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:white;border-radius:12px;width:460px;max-width:95vw;padding:24px">
        <h3 style="margin:0 0 12px;font-size:17px">${titulo}</h3>
        <label style="display:block;margin-bottom:8px;font-size:13px;color:#374151">${label}</label>
        ${textarea
          ? `<textarea id="prompt-input" rows="4" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">${defecto}</textarea>`
          : `<input id="prompt-input" value="${String(defecto).replace(/"/g, '&quot;')}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">`}
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
          <button id="prompt-cancel" style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-weight:600">Cancelar</button>
          <button id="prompt-ok" style="padding:9px 18px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Aceptar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('#prompt-input');
    ov.querySelector('#prompt-cancel').onclick = () => { ov.remove(); resolve(null); };
    ov.querySelector('#prompt-ok').onclick = () => {
      const v = input.value.trim();
      if (requerido && !v) { input.focus(); return; }
      ov.remove();
      resolve(v);
    };
    input.focus();
  });
}

// ──────── Acciones rápidas nuevas ────────

async function marcarCredito(id) {
  const dias = await promptModal({
    titulo: '💳 Marcar crédito',
    label: 'Días de crédito',
    defecto: '30',
    requerido: true,
  });
  if (dias == null) return;
  const numDias = Number(dias);
  if (!numDias || numDias <= 0) { showError('Días debe ser un número positivo'); return; }
  const fecha = new Date(Date.now() + numDias * 86400000).toISOString().slice(0, 10);

  try {
    const token = localStorage.getItem('erp_token');
    const r = await fetch(`/api/ordenes-compra/${id}/marcar-credito`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ dias_credito: numDias, fecha_vence: fecha }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    showSuccess(`Marcada como crédito · vence ${fecha}`);
    setTimeout(() => refreshOC(), 600);
  } catch (e) {
    showError(e.message || 'Error al marcar crédito');
  }
}

async function agregarNota(id) {
  const texto = await promptModal({
    titulo: '📝 Agregar nota',
    label: 'Texto de la nota',
    textarea: true,
    requerido: true,
  });
  if (!texto) return;

  try {
    const token = localStorage.getItem('erp_token');
    const r = await fetch(`/api/ordenes-compra/${id}/notas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ texto }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    showSuccess('Nota guardada');
  } catch (e) {
    showError(e.message || 'Error al guardar nota');
  }
}

async function eliminarFactura(id) {
  const ok = await confirmarAccion({
    titulo: '🗑️ Eliminar factura adjunta',
    mensaje: 'Vas a quitar la factura asociada a esta OC. La OC vuelve a estado_factura <strong>PENDIENTE</strong> y, si estaba en TERMINADA, retrocede a FACTURACION.<br><br>El archivo en Cloudinary <strong>NO se borra</strong> (queda huérfano por seguridad/audit). Esta acción es solo para GERENTE. ¿Confirmás?',
    tipo: 'danger',
    textoBoton: 'Sí, eliminar factura',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.eliminarFactura(id);
    showSuccess('Factura eliminada');
    setTimeout(() => refreshOC(), 600);
  } catch (e) {
    showError(e.message || 'Error al eliminar factura');
  }
}

async function subirFactura(id) {
  // Modal con form para nro_comprobante, fecha_emision, monto, archivo (PDF/imagen)
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:white;border-radius:12px;width:480px;max-width:95vw;padding:24px">
        <h3 style="margin:0 0 16px;font-size:17px">📄 Subir factura del proveedor</h3>
        <form id="oc-form-subir-factura" enctype="multipart/form-data" style="display:flex;flex-direction:column;gap:10px">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
            Nº Comprobante
            <input name="nro_comprobante" required style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
            Fecha de emisión
            <input name="fecha_emision" type="date" required style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
            Monto
            <input name="monto" type="number" step="0.01" min="0.01" required style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
            Archivo PDF/imagen <span style="color:#6b7280;font-size:11px">(opcional)</span>
            <input name="archivo" type="file" accept=".pdf,image/*" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </label>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
            <button type="button" data-cancel style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-weight:600">Cancelar</button>
            <button type="submit" style="padding:9px 18px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Subir</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(ov);

    ov.querySelector('[data-cancel]').onclick = () => { ov.remove(); resolve(false); };
    ov.querySelector('#oc-form-subir-factura').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const token = localStorage.getItem('erp_token');
        const r = await fetch(`/api/ordenes-compra/${id}/factura`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: fd,
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        showSuccess('Factura subida y registrada');
        ov.remove();
        resolve(true);
        setTimeout(() => refreshOC(), 600);
      } catch (err) {
        showError(err.message || 'Error al subir factura');
      }
    };
  });
}

async function recibir(id) {
  const oc = await api.ordenesCompra.get(id);
  if (!oc.detalle || oc.detalle.length === 0) {
    showError('La OC no tiene líneas para recibir');
    return;
  }
  await abrirModalRecepcion(oc);
}

// Modal de recepción: tabla con todas las líneas, input por línea con la
// cantidad a recibir pre-llenada con "lo que falta". El usuario edita las que
// difieran y confirma todas de una. Reemplaza los prompt() nativos del browser.
async function abrirModalRecepcion(oc) {
  const f = (n) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

  // Banner solo en la primera recepción (estados APROBADA/ENVIADA)
  const esPrimera = ['APROBADA', 'PAGO'].includes(oc.estado);
  const banner = esPrimera ? `
    <div style="background:#fef3c7;border:1px solid #fbbf24;color:#92400e;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px">
      ⚠️ Primera recepción: una vez confirmada, esta OC <strong style="color:#dc2626">ya no podrá editarse</strong>.
    </div>` : '';

  const filas = oc.detalle.map((l, idx) => {
    const pedido = Number(l.cantidad);
    const yaRec = Number(l.cantidad_recibida || 0);
    const falta = Math.max(0, pedido - yaRec);
    return `
      <tr style="border-bottom:1px solid #e5e7eb" data-idx="${idx}" data-id="${l.id_detalle}" data-falta="${falta}">
        <td style="padding:10px;font-size:13px">
          <strong>${l.descripcion}</strong>
          ${l.unidad ? `<span style="color:#6b7280;font-size:11px"> · ${l.unidad}</span>` : ''}
        </td>
        <td style="padding:10px;text-align:right;font-size:13px">${f(pedido)}</td>
        <td style="padding:10px;text-align:right;font-size:13px;color:#6b7280">${f(yaRec)}</td>
        <td style="padding:10px;text-align:right;font-size:13px;font-weight:600;color:#92400e">${f(falta)}</td>
        <td style="padding:8px;text-align:right">
          <input type="number" step="0.001" min="0" max="${falta}" value="${falta}"
            data-rec-input="${l.id_detalle}"
            style="width:110px;padding:7px 9px;border:1px solid #d1d5db;border-radius:5px;text-align:right;font-size:13px"
            ${falta === 0 ? 'disabled' : ''}>
        </td>
      </tr>`;
  }).join('');

  return new Promise(async (resolve) => {
    const html = `
      <div id="ov-recepcion" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px">
        <div style="background:white;border-radius:12px;padding:24px;width:820px;max-width:95vw;max-height:90vh;overflow:auto">
          <h3 style="margin:0 0 4px;font-size:18px">📦 Registrar recepción · OC ${oc.nro_oc}</h3>
          <p style="margin:0 0 14px;font-size:13px;color:#6b7280">
            Editá la cantidad recibida por línea (pre-cargada con lo que falta). Las que recibís 0 se ignoran.
          </p>
          ${banner}
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
            <thead><tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
              <th style="padding:10px;text-align:left">Descripción</th>
              <th style="padding:10px;text-align:right">Pedido</th>
              <th style="padding:10px;text-align:right">Ya recibido</th>
              <th style="padding:10px;text-align:right">Falta</th>
              <th style="padding:10px;text-align:right">Recibí ahora</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
          <div id="rec-error" style="display:none;background:#fee2e2;color:#991b1b;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:10px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div style="font-size:12px;color:#6b7280" id="rec-resumen"></div>
            <div style="display:flex;gap:10px">
              <button id="rec-cancelar" style="padding:10px 18px;background:transparent;border:1px solid #d9dad9;border-radius:6px;cursor:pointer">Cancelar</button>
              <button id="rec-confirmar" style="padding:10px 22px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Registrar recepción</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const ov = document.getElementById('ov-recepcion');
    const errBox = document.getElementById('rec-error');
    const resumen = document.getElementById('rec-resumen');

    const recalcResumen = () => {
      const inputs = ov.querySelectorAll('input[data-rec-input]');
      let lineasConCant = 0;
      let total = 0;
      inputs.forEach(i => {
        const v = Number(i.value || 0);
        if (v > 0) { lineasConCant++; total += v; }
      });
      resumen.textContent = lineasConCant > 0
        ? `${lineasConCant} línea(s) con cantidad · ${f(total)} unidades en total`
        : 'Ninguna línea con cantidad mayor a cero';
    };

    ov.querySelectorAll('input[data-rec-input]').forEach(i => {
      i.addEventListener('input', recalcResumen);
    });
    recalcResumen();

    document.getElementById('rec-cancelar').onclick = () => {
      ov.remove();
      resolve(null);
    };

    document.getElementById('rec-confirmar').onclick = async () => {
      errBox.style.display = 'none';
      const inputs = ov.querySelectorAll('input[data-rec-input]');
      const lineas = [];
      for (const inp of inputs) {
        const id_detalle = Number(inp.dataset.recInput);
        const cant = Number(inp.value || 0);
        const falta = Number(inp.closest('tr').dataset.falta);
        if (cant < 0) {
          errBox.textContent = 'Hay cantidades negativas. Corregilas.';
          errBox.style.display = 'block';
          return;
        }
        if (cant > falta + 0.0001) {
          errBox.textContent = `Una línea tiene cantidad ${cant} que excede lo pendiente (${falta}). Corregila.`;
          errBox.style.display = 'block';
          return;
        }
        if (cant > 0) lineas.push({ id_detalle, cantidad_recibida: cant });
      }
      if (!lineas.length) {
        errBox.textContent = 'Indicá al menos una línea con cantidad mayor a cero.';
        errBox.style.display = 'block';
        return;
      }

      // Confirmación dura solo en la primera recepción
      if (esPrimera) {
        const ok = confirm('Una vez confirmada esta recepción, la OC ya no podrá editarse. ¿Continuar?');
        if (!ok) return;
      }

      ov.remove();
      await registrarRecepcionConResolucion(oc.id_oc, lineas);
      resolve(true);
    };
  });
}

// Helper: intenta registrar la recepción y, si el backend responde 422 con
// OC_LINEAS_SIN_ITEM, abre el modal de resolución para asignar/crear ítems
// del catálogo. Tras asignar, reintenta la recepción con las mismas líneas.
async function registrarRecepcionConResolucion(id, lineas) {
  try {
    const r = await api.ordenesCompra.recibir(id, lineas);
    showSuccess(`Recepción registrada · Estado: ${r.estado}`);
    setTimeout(() => refreshOC(), 600);
  } catch (e) {
    if (e?.code === 'OC_LINEAS_SIN_ITEM') {
      const resolvio = await abrirModalResolucionItems(id, e.lineas_pendientes || []);
      if (resolvio) return registrarRecepcionConResolucion(id, lineas);
      return;
    }
    showError(e.message || 'No se pudo registrar la recepción');
  }
}

// Modal: lista las líneas de OC sin id_item y permite asignarlas a un ítem
// existente del catálogo o crear uno nuevo inline. Resuelve true si todas las
// líneas quedaron asignadas, false si el usuario cancela.
async function abrirModalResolucionItems(id_oc, lineasPendientes) {
  // Cargar catálogo actual
  let catalogo = [];
  try {
    catalogo = await api.inventory.getInventario();
  } catch (e) {
    showError('No se pudo cargar el catálogo de inventario: ' + e.message);
    return false;
  }

  return new Promise((resolve) => {
    // Estado local: id_item asignado por id_detalle
    const asignaciones = {};
    const renderOptions = () => catalogo
      .slice()
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
      .map(i => `<option value="${i.id_item}">${i.nombre} (${i.unidad || 'UND'}) — stock: ${Number(i.stock_actual || 0)}</option>`)
      .join('');

    // Helper: escapa HTML para mostrar texto seguro en innerHTML.
    // El onclick inline previo solo escapaba comillas simples y se rompía
    // si la descripción tenía saltos de línea, comillas dobles o backslash
    // (Uncaught SyntaxError: Invalid or unexpected token). Ahora pasamos
    // solo data-id-detalle y resolvemos los argumentos desde lineasPendientes
    // en el wire-up.
    const escHtml = (s) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const renderTabla = () => lineasPendientes.map(l => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px;font-size:13px;vertical-align:top">
          <strong>${escHtml(l.descripcion)}</strong><br>
          <span style="font-size:11px;color:#6b7280">Pedido: ${Number(l.cantidad)} ${escHtml(l.unidad || '')} · ${fPEN(Number(l.precio_unitario))}</span>
        </td>
        <td style="padding:10px;vertical-align:top">
          <select id="asig-item-${l.id_detalle}" data-detalle="${l.id_detalle}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;font-size:12px">
            <option value="">— Seleccionar ítem —</option>
            ${renderOptions()}
          </select>
        </td>
        <td style="padding:10px;vertical-align:top">
          <button type="button" data-crear-item="${l.id_detalle}" style="padding:7px 11px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap">+ Crear nuevo</button>
        </td>
      </tr>
    `).join('');

    const html = `
      <div id="ov-resolver-items" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2100;display:flex;align-items:center;justify-content:center;padding:20px">
        <div style="background:white;border-radius:12px;padding:24px;width:780px;max-width:95vw;max-height:90vh;overflow:auto">
          <h3 style="margin:0 0 6px;font-size:18px">📋 Resolver ítems del catálogo</h3>
          <p style="margin:0 0 14px;font-size:13px;color:#6b7280">
            Esta OC ALMACÉN tiene líneas sin ítem del catálogo asignado. Asigná cada una a un ítem existente o creá uno nuevo. Después se registra la recepción.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
            <thead><tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
              <th style="padding:10px;text-align:left">Descripción de la OC</th>
              <th style="padding:10px;text-align:left">Ítem del catálogo</th>
              <th style="padding:10px"></th>
            </tr></thead>
            <tbody id="resolver-tbody">${renderTabla()}</tbody>
          </table>
          <div style="display:flex;justify-content:flex-end;gap:10px">
            <button id="resolver-cancelar" style="padding:10px 18px;background:transparent;border:1px solid #d9dad9;border-radius:6px;cursor:pointer">Cancelar</button>
            <button id="resolver-confirmar" style="padding:10px 22px;background:var(--primary-color);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Asignar y recibir</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const ov = document.getElementById('ov-resolver-items');

    // "Crear ítem nuevo" inline: abre mini-modal con form (categoría como dropdown
    // del enum exacto del backend para evitar errores de validación Zod).
    window.OC._crearItem = (id_detalle, descSugerida, unidadSugerida) => {
      const id = `crear-${Date.now()}`;
      const html = `
        <div id="ov-${id}" style="position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2200;display:flex;align-items:center;justify-content:center;padding:20px">
          <div style="background:white;border-radius:12px;padding:24px;width:480px;max-width:95vw">
            <h3 style="margin:0 0 16px;font-size:17px">+ Crear ítem nuevo</h3>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div>
                <label style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Nombre *</label>
                <input id="ci-nombre" type="text" value="${(descSugerida || '').replace(/"/g, '&quot;')}" style="width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
                <div style="font-size:11px;color:#6b7280;margin-top:3px">Mínimo 3 caracteres</div>
              </div>
              <div>
                <label style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Categoría *</label>
                <select id="ci-categoria" style="width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:white">
                  <option value="Material" selected>Material</option>
                  <option value="Consumible">Consumible</option>
                  <option value="Herramienta">Herramienta</option>
                  <option value="Equipo">Equipo</option>
                  <option value="EPP">EPP (Equipo de Protección Personal)</option>
                </select>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                  <label style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Unidad</label>
                  <input id="ci-unidad" type="text" value="${(unidadSugerida || 'UND').replace(/"/g, '&quot;')}" style="width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
                </div>
                <div>
                  <label style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Stock mínimo</label>
                  <input id="ci-min" type="number" min="0" step="0.0001" value="10" style="width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
                </div>
              </div>
              <div id="ci-error" style="display:none;background:#fee2e2;color:#991b1b;padding:8px 11px;border-radius:6px;font-size:12px"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
              <button id="ci-cancelar" style="padding:9px 16px;background:transparent;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">Cancelar</button>
              <button id="ci-crear" style="padding:9px 18px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Crear ítem</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const ov = document.getElementById(`ov-${id}`);
      const errBox = document.getElementById('ci-error');
      const inpNombre = document.getElementById('ci-nombre');
      inpNombre.focus();
      inpNombre.select();

      document.getElementById('ci-cancelar').onclick = () => ov.remove();

      document.getElementById('ci-crear').onclick = async () => {
        errBox.style.display = 'none';
        const nombre = inpNombre.value.trim();
        const categoria = document.getElementById('ci-categoria').value;
        const unidad = document.getElementById('ci-unidad').value.trim() || 'UND';
        const stock_minimo = Number(document.getElementById('ci-min').value || 0);

        if (nombre.length < 3) {
          errBox.textContent = 'El nombre debe tener al menos 3 caracteres.';
          errBox.style.display = 'block';
          return;
        }
        try {
          const nuevo = await api.inventory.createInventarioItem({ nombre, categoria, unidad, stock_minimo });
          // Actualizar catálogo local + redibujar tabla
          catalogo.push({ id_item: nuevo.id_item, nombre, unidad, stock_actual: 0 });
          document.getElementById('resolver-tbody').innerHTML = renderTabla();
          // Re-enganchar handlers porque innerHTML reescribe los botones
          wireCrearItemButtons();
          const sel = document.getElementById(`asig-item-${id_detalle}`);
          if (sel) sel.value = String(nuevo.id_item);
          ov.remove();
          showSuccess(`Ítem "${nombre}" creado y asignado`);
        } catch (e) {
          errBox.textContent = 'No se pudo crear: ' + (e.message || 'error desconocido');
          errBox.style.display = 'block';
        }
      };
    };

    // Wire-up de los botones "+ Crear nuevo" (re-engancha tras cada renderTabla
     // porque renderTabla() reescribe el innerHTML de #resolver-tbody).
    const wireCrearItemButtons = () => {
      ov.querySelectorAll('button[data-crear-item]').forEach(btn => {
        btn.onclick = () => {
          const idDet = Number(btn.dataset.crearItem);
          const linea = lineasPendientes.find(x => Number(x.id_detalle) === idDet);
          if (!linea) return;
          window.OC._crearItem(idDet, linea.descripcion || '', linea.unidad || 'UND');
        };
      });
    };
    wireCrearItemButtons();

    document.getElementById('resolver-cancelar').onclick = () => {
      ov.remove();
      resolve(false);
    };

    document.getElementById('resolver-confirmar').onclick = async () => {
      const selects = ov.querySelectorAll('select[data-detalle]');
      const lista = [];
      for (const s of selects) {
        const id_detalle = Number(s.dataset.detalle);
        const id_item = Number(s.value);
        if (!id_item) {
          showError('Faltan ítems por asignar — completá todas las líneas o creá ítems nuevos.');
          return;
        }
        lista.push({ id_detalle, id_item });
      }
      try {
        await api.ordenesCompra.asignarItems(id_oc, lista);
        ov.remove();
        resolve(true);
      } catch (e) {
        showError('Error asignando ítems: ' + e.message);
      }
    };
  });
}

async function facturar(id) {
  // Una vez FACTURADA, el botón Anular desaparece. Para corregir hay dos
  // caminos según ya entró al SIRE de SUNAT o no.
  const ok = await confirmarAccion({
    titulo: '🧾 Registrar factura del proveedor',
    mensaje:
      `Vas a registrar la factura del proveedor sobre esta OC. Después:` +
      `<ul style="margin:8px 0 8px 20px;line-height:1.6;font-size:13px">` +
      `<li>El botón <strong>Anular</strong> desaparece (la factura ya entró a Compras y al cálculo del IGV).</li>` +
      `<li>Si te equivocás: <strong>🗑 Eliminar</strong> sigue disponible para GERENTE — borra todo en cascada (Compra, Gasto, Tx, Inventario).</li>` +
      `<li>Si la factura ya fue declarada al <strong>SIRE de SUNAT</strong>, el ajuste correcto es pedirle al proveedor una <strong>Nota de Crédito</strong> y registrarla cuando llegue (módulo aún por construir).</li>` +
      `</ul>` +
      `¿Continuamos?`,
    tipo: 'warning',
    textoBoton: 'Sí, registrar factura',
  });
  if (!ok) return;
  const nro = prompt('N° factura del proveedor (ej. F001-00123):');
  if (!nro) return;
  const fecha = prompt('Fecha de la factura (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!fecha) return;
  try {
    await api.ordenesCompra.facturar(id, { nro_factura_proveedor: nro, fecha_factura: fecha });
    showSuccess('OC facturada — se creó registro en Compras');
    setTimeout(() => (window.refreshModule || refreshOC)(), 800);
  } catch (e) { showError(e.message); }
}

// Registra el pago al proveedor. Funciona en 2 contextos:
//  - Desde RECIBIDA / RECIBIDA_PARCIAL: pago anticipado (sin factura aún) →
//    OC pasa a PAGADA_PEND_FACTURA. Cuando llegue la factura, se completa con
//    "Recibí factura".
//  - Desde FACTURADA: pago final del comprobante ya registrado → OC pasa a
//    PAGADA (cerrada).
async function registrarPago(id, nro) {
  let cuentas = [];
  try {
    cuentas = await api.cobranzas.getCuentas();
  } catch (e) { return showError('No se pudieron cargar las cuentas: ' + e.message); }
  const cuentasActivas = (cuentas || []).filter(c => c.activo !== false);
  if (cuentasActivas.length === 0) return showError('No hay cuentas bancarias activas. Configurá una en Finanzas → Cuentas.');

  const data = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    const cuentasOpts = cuentasActivas.map(c =>
      `<option value="${c.id_cuenta}">${c.nombre} (${c.moneda || 'PEN'})</option>`
    ).join('');
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:480px;max-width:95vw;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 8px;font-size:16px">💰 Registrar pago · OC ${nro}</h3>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:10px 12px;border-radius:6px;margin-bottom:14px;font-size:12px">
          Esto registra el egreso real en tu cuenta bancaria. Se genera la transacción + el movimiento del libro bancos automáticamente.
        </div>
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Cuenta de la que sale el pago *</label>
        <select id="rp-cuenta" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px">
          ${cuentasOpts}
        </select>
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Fecha del pago *</label>
        <input id="rp-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px">
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">N° operación (opcional)</label>
        <input id="rp-nro" placeholder="Ej. 12345678" maxlength="50"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px;font-family:monospace">
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Observaciones (opcional)</label>
        <input id="rp-obs" placeholder="Comentario interno"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
        <div id="rp-error" style="display:none;margin-top:10px;background:#fee2e2;color:#991b1b;padding:7px 10px;border-radius:5px;font-size:12px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
          <button id="rp-cancel" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="rp-ok" style="padding:8px 22px;background:#15803d;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Confirmar pago</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#rp-cancel').onclick = () => close(null);
    ov.querySelector('#rp-ok').onclick = () => {
      const id_cuenta = Number(ov.querySelector('#rp-cuenta').value);
      const fecha_pago = ov.querySelector('#rp-fecha').value;
      const nro_operacion = ov.querySelector('#rp-nro').value.trim() || undefined;
      const observaciones = ov.querySelector('#rp-obs').value.trim() || undefined;
      if (!id_cuenta || !fecha_pago) {
        const err = ov.querySelector('#rp-error');
        err.textContent = 'Cuenta y fecha son obligatorias';
        err.style.display = 'block';
        return;
      }
      close({ id_cuenta, fecha_pago, nro_operacion, observaciones });
    };
  });
  if (!data) return;
  try {
    const r = await api.ordenesCompra.registrarPago(id, data);
    if (r.estado === 'TERMINADA') {
      showSuccess(`OC ${nro} cerrada — pago + factura registrados`);
    } else {
      showSuccess(`OC ${nro} pagada — esperando factura del proveedor`);
    }
    setTimeout(() => (window.refreshModule || refreshOC)(), 800);
  } catch (e) { showError(e.message); }
}

// Cierra una OC sin factura formal (caja chica). Pide concepto + forma de pago real.
async function cerrarSinFactura(id, nro) {
  const data = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:480px;max-width:95vw;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 8px;font-size:16px">🗂 Cerrar OC ${nro} sin factura</h3>
        <div style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:10px 12px;border-radius:6px;margin-bottom:14px;font-size:12px">
          ⚠️ <strong>Sin comprobante SUNAT</strong> = NO genera crédito fiscal (IGV).<br>
          NO aparece en Libro de Compras. SÍ se descuenta de caja como egreso.<br>
          Solo válido para gastos sin sustento (típicamente caja chica < S/700).
        </div>
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Concepto del gasto *</label>
        <input id="cs-concepto" placeholder="Ej: Gastos varios marketing — caja chica"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px">
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Forma de pago real *</label>
        <select id="cs-fp" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
          <option value="EFECTIVO">Efectivo (caja chica)</option>
          <option value="TRANSFERENCIA">Transferencia bancaria</option>
          <option value="TARJETA_PERSONAL">Tarjeta personal (con reembolso)</option>
          <option value="OTRO">Otro</option>
        </select>
        <div id="cs-error" style="display:none;margin-top:10px;background:#fee2e2;color:#991b1b;padding:7px 10px;border-radius:5px;font-size:12px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
          <button id="cs-cancel" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="cs-ok" style="padding:8px 22px;background:#ea580c;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Confirmar cierre</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#cs-cancel').onclick = () => close(null);
    ov.querySelector('#cs-ok').onclick = () => {
      const concepto = ov.querySelector('#cs-concepto').value.trim();
      const fp = ov.querySelector('#cs-fp').value;
      if (!concepto) {
        const err = ov.querySelector('#cs-error');
        err.textContent = 'El concepto es obligatorio';
        err.style.display = 'block';
        return;
      }
      close({ concepto, forma_pago_real: fp });
    };
  });
  if (!data) return;
  try {
    await api.ordenesCompra.cerrarSinFactura(id, data);
    showSuccess(`OC ${nro} cerrada sin factura — registrada como gasto`);
    // refreshModule() re-renderiza el módulo actual (sea OrdenesCompra o
    // Logística), refreshOC() solo cubre el primero. Esto resuelve el caso
    // de cerrar OC desde el modal abierto dentro del hub de Logística.
    setTimeout(() => (window.refreshModule || refreshOC)(), 600);
  } catch (e) { showError(e.message); }
}

// Cierra una OC que está en PAGADA_PEND_FACTURA cuando el proveedor confirma
// que NO va a entregar factura. La Compra/Gasto provisorio ya existe (creado
// al registrarPago()) — solo cambia el estado de la OC a CERRADA_SIN_FACTURA.
// No pide concepto ni forma de pago: ya están grabados desde el momento del pago.
async function cerrarPagaSinFactura(id, nro) {
  const ok = await confirmarAccion({
    titulo: '🗂 Dar por cerrada sin factura',
    mensaje:
      `Vas a cerrar la OC <strong>${nro}</strong> sin esperar factura del proveedor.` +
      `<ul style="margin:8px 0 8px 20px;line-height:1.6;font-size:13px">` +
      `<li>El Gasto provisorio que se creó al registrar el pago queda como está, <strong>sin N° de comprobante</strong>.</li>` +
      `<li>NO se descuenta IGV ni va a Libro de Compras (no hay sustento documental).</li>` +
      `<li>Si después aparece la factura, podés usar "Asociar factura tardía" para enriquecer el Gasto con el comprobante.</li>` +
      `</ul>` +
      `Usá esta opción solo cuando el proveedor te confirmó que NO va a entregar factura.`,
    tipo: 'warning',
    textoBoton: 'Sí, cerrar sin factura',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.cerrarSinFactura(id, {});
    showSuccess(`OC ${nro} cerrada — gasto registrado sin sustento documental`);
    setTimeout(() => (window.refreshModule || refreshOC)(), 800);
  } catch (e) { showError(e.message); }
}

// Asocia una factura tardía a una OC CERRADA_SIN_FACTURA.
// Enriquece el Gasto con nro_comprobante + fecha. Mueve OC a FACTURADA.
async function asociarFactura(id, nro) {
  const data = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:440px;max-width:95vw;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 8px;font-size:16px">🧾 Asociar factura tardía · OC ${nro}</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">
          La factura del proveedor llegó tarde. Esto enriquece el Gasto existente con el comprobante y mueve la OC a <strong>FACTURADA</strong>. No genera factura electrónica nueva (eso lo hacés desde Comercial si aplica).
        </p>
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">N° comprobante *</label>
        <input id="af-nro" placeholder="F001-00123"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px;font-family:monospace">
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Fecha del comprobante *</label>
        <input id="af-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
        <div id="af-error" style="display:none;margin-top:10px;background:#fee2e2;color:#991b1b;padding:7px 10px;border-radius:5px;font-size:12px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
          <button id="af-cancel" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="af-ok" style="padding:8px 22px;background:#7c3aed;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Asociar factura</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#af-cancel').onclick = () => close(null);
    ov.querySelector('#af-ok').onclick = () => {
      const nroComp = ov.querySelector('#af-nro').value.trim();
      const fecha = ov.querySelector('#af-fecha').value;
      if (!nroComp || !fecha) {
        const err = ov.querySelector('#af-error');
        err.textContent = 'Completá ambos campos';
        err.style.display = 'block';
        return;
      }
      close({ nro_comprobante: nroComp, fecha_factura: fecha });
    };
  });
  if (!data) return;
  try {
    await api.ordenesCompra.asociarFacturaTardia(id, data);
    showSuccess(`Factura ${data.nro_comprobante} asociada — OC pasa a FACTURADA`);
    setTimeout(() => (window.refreshModule || refreshOC)(), 600);
  } catch (e) { showError(e.message); }
}

async function anular(id) {
  const motivo = prompt('Motivo de anulación:');
  if (!motivo) return;
  try {
    await api.ordenesCompra.anular(id, motivo);
    showSuccess('OC anulada');
    setTimeout(() => refreshOC(), 600);
  } catch (e) { showError(e.message); }
}

// Reactivar OC anulada — vuelve a BORRADOR para poder editar y re-flujar.
async function reactivar(id, nro) {
  const ok = await confirmarAccion({
    titulo: '♻ Reactivar OC anulada',
    mensaje: `Vas a reactivar la OC <strong>${nro}</strong>. Volverá al estado <strong>BORRADOR</strong> con el motivo de anulación borrado, y podrás editarla y re-aprobarla desde cero. ¿Continuar?`,
    tipo: 'warning',
    textoBoton: 'Sí, reactivar',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.reactivar(id);
    showSuccess(`OC ${nro} reactivada — está en BORRADOR`);
    const m = document.getElementById('oc-modal'); if (m) m.innerHTML = '';
    setTimeout(() => refreshOC(), 400);
  } catch (e) { showError(e.message); }
}

// Editar OC: trae los datos completos y abre el modal de Nueva OC en modo edición.
async function editar(id) {
  try {
    const oc = await api.ordenesCompra.get(id);
    if (!['BORRADOR', 'APROBADA', 'PAGO'].includes(oc.estado)) {
      return showError(`No se puede editar una OC en estado ${oc.estado}`);
    }
    nuevaOC(oc);
  } catch (e) { showError('Error cargando OC: ' + (e.message || e)); }
}

// Eliminar OC físicamente. Solo GERENTE en BORRADOR/APROBADA. Requiere tipear el N° de OC.
async function eliminarOC(id, nro) {
  const ok = await confirmarTexto({
    titulo: '🗑 Eliminar OC permanentemente',
    mensaje:
      `Estás por eliminar la OC <strong>${nro}</strong> y <strong>TODOS sus registros derivados</strong>:` +
      `<ul style="margin:8px 0 8px 20px;line-height:1.6">` +
      `<li>Líneas y aprobaciones de la OC</li>` +
      `<li>Compras / Gastos generados al facturar (si los hubo)</li>` +
      `<li>Transacciones de caja asociadas</li>` +
      `<li>Movimientos de Inventario y reverso de stock (si era ALMACEN)</li>` +
      `<li>Costos de servicio vinculados</li>` +
      `</ul>` +
      `Esta acción es <strong style="color:#dc2626">irreversible</strong>. Para confirmar, tipeá el número de OC exacto.`,
    textoRequerido: nro,
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.eliminar(id);
    showSuccess('OC eliminada con cascada completa');
    setTimeout(() => (window.refreshModule || refreshOC)(), 600);
  } catch (e) { showError(e.message); }
}

// Editar metadata "segura" en cualquier estado (centro_costo, concepto, etc.)
async function editarMetadataOC(id, nro) {
  // Cargar datos actuales
  let oc;
  try { oc = await api.ordenesCompra.get(id); }
  catch (e) { return showError(e.message); }

  // Lista de centros de costo activos para el datalist
  let centros = [];
  try { centros = await api.centrosCosto.list(true); }
  catch {}

  const data = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    const v = (x) => x == null ? '' : String(x).replace(/"/g, '&quot;');
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:520px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 8px;font-size:16px">✎ Editar concepto / centro de costo · OC ${nro}</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">
          Edición segura: estos campos NO afectan números ni contabilidad.
          Disponible en cualquier estado (excepto ANULADA).
          Si hay un Gasto asociado, se actualiza también automáticamente.
        </p>
        <div style="display:grid;gap:10px">
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Centro de Costo</label>
            <input id="em-cc" list="em-cc-list" value="${v(oc.centro_costo)}"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
            <datalist id="em-cc-list">
              ${centros.map(c => `<option value="${v(c.nombre)}">${c.tipo}</option>`).join('')}
            </datalist>
          </div>
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Concepto / Observaciones</label>
            <textarea id="em-obs" rows="3" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;resize:vertical">${v(oc.observaciones || '')}</textarea>
          </div>
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Atención</label>
            <input id="em-atn" value="${v(oc.atencion)}"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
          <button id="em-cancel" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="em-ok" style="padding:8px 22px;background:#7c3aed;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#em-cancel').onclick = () => close(null);
    ov.querySelector('#em-ok').onclick = () => {
      close({
        centro_costo: ov.querySelector('#em-cc').value.trim() || null,
        observaciones: ov.querySelector('#em-obs').value.trim() || null,
        atencion: ov.querySelector('#em-atn').value.trim() || null,
        // El concepto del Gasto asociado lo igualo a las observaciones
        // (Julio prefiere un solo campo libre que se propague a ambos lados).
        concepto: ov.querySelector('#em-obs').value.trim() || undefined,
      });
    };
  });
  if (!data) return;
  try {
    await api.ordenesCompra.editarMetadata(id, data);
    showSuccess(`OC ${nro} actualizada`);
    setTimeout(() => (window.refreshModule || refreshOC)(), 600);
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
async function nuevaOC(editData) {
  // Lazy-load: si el usuario llegó al modal sin pasar por el init de
  // OrdenesCompra (ej: clickeó "Editar líneas" desde el modal de detalle
  // que se abre en otros módulos como Logística → kanban), las variables
  // _proveedores/_servicios/_cfg quedaron vacías. Cargamos en demanda.
  try {
    const necesitaProv = !_proveedores || _proveedores.length === 0;
    const necesitaSrv  = !_servicios   || _servicios.length === 0;
    const necesitaCfg  = !_cfg         || Object.keys(_cfg).length === 0;
    if (necesitaProv || necesitaSrv || necesitaCfg) {
      const [provs, srvs, cfg] = await Promise.all([
        necesitaProv ? api.purchases.getProveedores().catch(() => []) : Promise.resolve(_proveedores),
        necesitaSrv  ? api.services.getServiciosActivos().catch(() => []) : Promise.resolve(_servicios),
        necesitaCfg  ? api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000, permitir_correlativo_manual: false })) : Promise.resolve(_cfg),
      ]);
      _proveedores = provs;
      _servicios   = srvs;
      _cfg         = cfg;
    }
  } catch (e) { console.error('[OC] lazy-load falló:', e); }

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

  ensureOCModal().innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:white;border-radius:12px;width:900px;max-width:95vw;max-height:90vh;overflow:auto;padding:24px">
        <h2 style="margin-bottom:16px">${tituloModal}</h2>
        ${esEdit ? `<div style="background:#fef3c7;border:1px solid #fbbf24;color:#92400e;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px">
          Estás editando una OC existente. Los totales se recalculan al guardar. Estado actual: <strong>${editData.estado}</strong>.
        </div>` : ''}
        ${(() => {
          if (esEdit) return '';
          const userRol = (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}').rol; } catch { return null; } })();
          if (!_cfg?.permitir_correlativo_manual || userRol !== 'GERENTE') return '';
          return `
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:10px 12px;margin-bottom:14px">
              <div style="font-size:11px;font-weight:700;color:#9a3412;margin-bottom:6px;letter-spacing:.4px">
                🗂 MODO MIGRACIÓN — CARGA HISTÓRICA
              </div>
              <label style="font-size:11px;color:#7c2d12;display:block;margin-bottom:4px">Nº de OC (opcional)</label>
              <input name="nro_oc" placeholder="001 - 2025"
                style="width:200px;padding:8px 10px;border:1px solid #fdba74;border-radius:4px;font-size:13px;font-family:monospace;background:#fff">
              <div style="font-size:10px;color:#7c2d12;margin-top:4px">
                Si lo dejás vacío, el sistema asigna automático. Formato: <strong>NNN - YYYY</strong>. Solo GERENTE.
              </div>
            </div>`;
        })()}
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
          <div style="grid-column:span 3" id="oc-proyecto-block">
            <label>Proyecto / Cotización (si tipo=SERVICIO) ${tip('Solo si tipo=SERVICIO. Vincula la OC a una cotización aprobada del cliente para que el costo aparezca en su rentabilidad. Filtrado automáticamente por moneda. Solo APROBADAS / TERMINADAS / TRABAJO A RIESGO.')}</label>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
              <input type="text" id="oc-proyecto-search" placeholder="🔍 Buscar por cliente o proyecto..."
                style="flex:1;padding:7px 10px;border:1px solid #d9dad9;border-radius:6px;font-size:12px">
              <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);white-space:nowrap">
                <input type="checkbox" id="oc-proyecto-todos"> Ver todos los años
              </label>
            </div>
            <select name="id_cotizacion" id="oc-proyecto-select" style="width:100%">
              <option value="">— Sin proyecto vinculado (solo aplica si tipo=SERVICIO) —</option>
            </select>
            <div id="oc-proyecto-info" style="font-size:11px;color:var(--text-secondary);margin-top:4px"></div>
          </div>
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
              <input type="checkbox" name="aplica_igv" id="oc-aplica-igv" ${aplicaIgv ? 'checked' : ''}> Aplica IGV 18%
              <span style="font-size:10px;color:#6b7280;margin-left:8px">
                ${tip('Mientras el IGV esté apagado, los precios unitarios admiten hasta 4 decimales (útil para cotizaciones precisas). Al marcarlo, los precios y cantidades se redondean a 2 decimales según norma SUNAT/SIRE para facturación.')}
              </span>
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
        <input type="number" step="0.0001" placeholder="Cant" value="${l.cantidad}" oninput="OC._setL(${i},'cantidad',Number(this.value))">
        <input type="number" step="0.0001" placeholder="P.Unit" value="${l.precio_unitario}" oninput="OC._setL(${i},'precio_unitario',Number(this.value))">
        <button type="button" onclick="OC._delL(${i})" title="Quitar esta línea de la OC" aria-label="Quitar línea" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:18px">×</button>
      </div>
    `).join('');
  }
  window.OC._setL = (i, k, v) => { lineas[i][k] = v; };
  window.OC._delL = (i) => { lineas.splice(i, 1); renderLineas(); };
  // En modo edit ya tenemos las líneas del detalle, solo renderizamos.
  // En modo create arrancamos con una línea vacía.
  if (esEdit) renderLineas();
  else        window.OC._addLinea();

  // Pedido Julio (04/05): mientras el IGV esté apagado, los inputs de
  // precio_unitario y cantidad permiten hasta 4 decimales (caso real:
  // proveedor cotiza con S/ 23.7899 por unidad). Cuando el usuario marca
  // "Aplica IGV 18%", el sistema redondea precios y cantidades a 2 decimales
  // — la regla SUNAT/SIRE para facturación electrónica exige 2 decimales en
  // ítems del comprobante. Al desmarcar IGV no se "des-redondea", el usuario
  // puede volver a escribir 4 decimales si lo necesita.
  setTimeout(() => {
    const chkIgv = document.getElementById('oc-aplica-igv');
    if (!chkIgv) return;
    chkIgv.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      let cambios = 0;
      lineas.forEach(l => {
        const pu  = Number(l.precio_unitario) || 0;
        const cnt = Number(l.cantidad) || 0;
        const puR  = Math.round(pu  * 100) / 100;
        const cntR = Math.round(cnt * 100) / 100;
        if (puR  !== pu)  { l.precio_unitario = puR;  cambios++; }
        if (cntR !== cnt) { l.cantidad        = cntR; cambios++; }
      });
      if (cambios > 0) {
        renderLineas();
        try { window.showToast?.('Precios y cantidades redondeados a 2 decimales (norma SUNAT al aplicar IGV)', 'info'); } catch {}
      }
    });
  }, 50);

  // ── Picker de proyecto (cotización vinculada) ─────────────────
  // Carga cotizaciones APROBADAS/TERMINADAS/TRABAJO_EN_RIESGO filtradas por
  // moneda actual de la OC. Se re-carga al cambiar moneda o al tildar
  // "ver todos los años". Searchbox client-side filtra el dropdown ya cargado.
  const proyBlock  = document.getElementById('oc-proyecto-block');
  const proySelect = document.getElementById('oc-proyecto-select');
  const proySearch = document.getElementById('oc-proyecto-search');
  const proyTodos  = document.getElementById('oc-proyecto-todos');
  const proyInfo   = document.getElementById('oc-proyecto-info');
  let _proyectos = [];

  const renderProyectoOptions = (filtro = '') => {
    const f = filtro.trim().toLowerCase();
    const filtrados = !f ? _proyectos : _proyectos.filter(p =>
      String(p.cliente || '').toLowerCase().includes(f) ||
      String(p.proyecto || '').toLowerCase().includes(f) ||
      String(p.nro_cotizacion || '').toLowerCase().includes(f)
    );
    const fmtMoney = (n, m) => (m === 'USD' ? '$ ' : 'S/ ') +
      Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const idPreSelected = esEdit ? Number(editData.id_cotizacion) : null;
    proySelect.innerHTML =
      `<option value="">— Sin proyecto vinculado —</option>` +
      filtrados.map(p => `
        <option value="${p.id_cotizacion}" ${idPreSelected === p.id_cotizacion ? 'selected' : ''}>
          ${p.nro_cotizacion} · ${p.cliente}${p.proyecto ? ' — ' + p.proyecto : ''} · ${fmtMoney(p.total, p.moneda)} (${p.estado})
        </option>
      `).join('');
    proyInfo.textContent = filtrados.length === 0
      ? (_proyectos.length === 0 ? 'No hay cotizaciones aprobadas para esta moneda.' : 'Sin coincidencias para tu búsqueda.')
      : `${filtrados.length} proyecto(s) disponible(s)${_proyectos.length !== filtrados.length ? ` de ${_proyectos.length}` : ''}.`;
  };

  const cargarProyectos = async () => {
    const monedaSel = document.querySelector('#form-oc select[name="moneda"]')?.value || moneda;
    const todos = !!proyTodos?.checked;
    proyInfo.textContent = 'Cargando proyectos...';
    try {
      const lista = await api.cotizaciones.proyectosActivos({ moneda: monedaSel, todos });
      _proyectos = Array.isArray(lista) ? lista : [];
      renderProyectoOptions(proySearch?.value || '');
    } catch (e) {
      _proyectos = [];
      proyInfo.textContent = 'Error cargando proyectos: ' + (e.message || e);
    }
  };

  // Toggle de visibilidad del bloque proyecto según tipo_oc
  const togglePicker = () => {
    const tipo = document.querySelector('#form-oc select[name="tipo_oc"]')?.value;
    if (proyBlock) proyBlock.style.display = (tipo === 'SERVICIO') ? '' : 'none';
  };
  document.querySelector('#form-oc select[name="tipo_oc"]')?.addEventListener('change', togglePicker);
  document.querySelector('#form-oc select[name="moneda"]')?.addEventListener('change', cargarProyectos);
  proySearch?.addEventListener('input', () => renderProyectoOptions(proySearch.value));
  proyTodos?.addEventListener('change', cargarProyectos);

  // Auto-sync Empresa → Moneda + TC (ME=PEN, PT=USD). Dispara recarga del picker.
  const empresaSel = document.querySelector('#form-oc select[name="empresa"]');
  const monedaSel  = document.querySelector('#form-oc select[name="moneda"]');
  const tcInput    = document.querySelector('#form-oc input[name="tipo_cambio"]');
  if (empresaSel && monedaSel) {
    empresaSel.addEventListener('change', () => {
      const nueva = empresaSel.value === 'PT' ? 'USD' : 'PEN';
      if (monedaSel.value !== nueva) {
        monedaSel.value = nueva;
        if (tcInput && nueva === 'PEN') tcInput.value = '1.0000';
        monedaSel.dispatchEvent(new Event('change'));
      }
    });
  }

  togglePicker();
  cargarProyectos();

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
      id_cotizacion: fd.get('id_cotizacion') ? Number(fd.get('id_cotizacion')) : null,
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
    // Modo migración: solo se manda si está en el form (renderizado condicional)
    const ovEl = document.getElementById('oc-modal');
    const nroManualInput = ovEl?.querySelector('input[name="nro_oc"]');
    if (nroManualInput && nroManualInput.value.trim()) {
      payload.nro_oc = nroManualInput.value.trim();
    }
    try {
      if (esEdit) {
        await api.ordenesCompra.actualizar(editData.id_oc, payload);
        showSuccess(`OC ${editData.nro_oc} actualizada`);
      } else {
        const r = await api.ordenesCompra.create(payload);
        showSuccess(`OC ${r.nro_oc} creada · ${r.autoAprobada ? '✓ Auto-aprobada' : 'Pendiente aprobación'}`);
      }
      setTimeout(() => refreshOC(), 800);
    } catch (err) {
      showError(err.message || (esEdit ? 'Error actualizando OC' : 'Error creando OC'));
    }
  };
}

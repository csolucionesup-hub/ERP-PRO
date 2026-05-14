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
  EN_TRANSITO:        { bg: '#e0f2fe', fg: '#075985', icon: '🚢', label: 'En tránsito' },
  RECEPCION:          { bg: '#fef9c3', fg: '#713f12', icon: '📦', label: 'Recepción' },
  FACTURACION:        { bg: '#fef3c7', fg: '#854d0e', icon: '🧾', label: 'Facturación / RH' },
  TERMINADA:          { bg: '#dcfce7', fg: '#166534', icon: '✓', label: 'Terminada' },
  CERRADA_SIN_FACTURA:{ bg: '#fce7f3', fg: '#9d174d', icon: '🗂', label: 'Cerrada sin factura' },
  ANULADA:            { bg: '#e5e7eb', fg: '#6b7280', icon: '❌', label: 'Anulada' },
};

const COLUMNAS_KANBAN_PRINCIPALES = [
  'BORRADOR','APROBADA','PAGO','EN_TRANSITO','RECEPCION','FACTURACION','TERMINADA'
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

// ─────────── Preview de archivos adjuntos vía backend proxy ──
// Cloudinary no permite CORS para fetch desde browser, así que vamos a un
// endpoint del backend que reenvía el archivo. Mantiene preview inline sin
// "Failed to fetch".
async function _previewArchivoBackend(url, titulo) {
  const overlay = abrirOverlayPreview(titulo, null);
  let blobUrl = null;
  const cleanup = () => {
    if (overlay.parentNode) overlay.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };
  overlay.querySelector('[data-close]').onclick = cleanup;
  const content = overlay.querySelector('[data-content]');
  try {
    const token = localStorage.getItem('erp_token');
    const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    blobUrl = URL.createObjectURL(blob);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.startsWith('image/')) {
      content.innerHTML = `<img src="${blobUrl}" alt="${titulo}" style="max-width:100%;max-height:100%;object-fit:contain">`;
    } else {
      content.innerHTML = `<iframe src="${blobUrl}" style="flex:1;border:none;width:100%;height:100%;background:#525659" title="${titulo}"></iframe>`;
    }
  } catch (err) {
    content.innerHTML = `
      <div style="text-align:center;color:#fef3c7;padding:24px;max-width:400px">
        <div style="font-size:36px;margin-bottom:10px">⚠️</div>
        <div style="font-size:14px;margin-bottom:8px;font-weight:600">No se pudo cargar el archivo</div>
        <div style="font-size:12px;color:#d1d5db">${err.message || err}</div>
      </div>
    `;
  }
}

// Preview de la PRIMERA factura de una OC (compat).
window.previewFacturaOC = (id_oc, titulo = 'Factura') =>
  _previewArchivoBackend(`/api/ordenes-compra/${id_oc}/factura/preview`, titulo);

// Preview de UNA factura individual por su id_factura_oc (multi-factura).
window.previewFacturaPorId = (id_factura_oc, titulo = 'Factura') =>
  _previewArchivoBackend(`/api/ordenes-compra/factura/${id_factura_oc}/preview`, titulo);

// Preview del voucher (constancia bancaria) de un pago.
window.previewVoucherPago = (id_pago, titulo = 'Constancia de pago') =>
  _previewArchivoBackend(`/api/ordenes-compra/pago/${id_pago}/voucher`, titulo);

// Helper interno reutilizable para armar el overlay del preview.
function abrirOverlayPreview(titulo, urlExterna) {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9000;' +
    'display:flex;align-items:center;justify-content:center;padding:20px';
  const linkExt = urlExterna
    ? `<a href="${urlExterna}" target="_blank" rel="noopener" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-decoration:none">↗ Abrir en pestaña</a>`
    : '';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:min(960px,95vw);height:min(92vh,1200px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#f9fafb;flex-wrap:wrap;gap:8px">
        <strong style="font-size:14px;color:#111">👁️ ${titulo}</strong>
        <div style="display:flex;gap:8px">
          ${linkExt}
          <button data-close type="button" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:12px">Cerrar</button>
        </div>
      </div>
      <div data-content style="flex:1;display:flex;align-items:center;justify-content:center;background:#525659;overflow:auto">
        <div style="color:#d1d5db;font-size:13px">⏳ Cargando…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// ─────────── Preview genérico de archivo por URL pública ───────────
// Para casos donde la URL no es de Cloudinary o sí permite CORS. Si falla
// el fetch, ofrece fallback "Abrir en pestaña nueva".
window.previewArchivo = async (url, titulo = 'Archivo') => {
  if (!url) return;
  const lower = String(url).toLowerCase().split('?')[0];
  const esImagen = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(lower);

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9000;' +
    'display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:min(960px,95vw);height:min(92vh,1200px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#f9fafb;flex-wrap:wrap;gap:8px">
        <strong style="font-size:14px;color:#111">👁️ ${titulo}</strong>
        <div style="display:flex;gap:8px">
          <a href="${url}" target="_blank" rel="noopener" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-decoration:none">↗ Abrir en pestaña</a>
          <button data-close type="button" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:12px">Cerrar</button>
        </div>
      </div>
      <div data-content style="flex:1;display:flex;align-items:center;justify-content:center;background:#525659;overflow:auto">
        <div style="color:#d1d5db;font-size:13px">⏳ Cargando…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  let blobUrl = null;
  const cleanup = () => {
    if (overlay.parentNode) overlay.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };
  overlay.querySelector('[data-close]').onclick = cleanup;
  const content = overlay.querySelector('[data-content]');

  try {
    if (esImagen) {
      content.innerHTML = `<img src="${url}" alt="${titulo}" style="max-width:100%;max-height:100%;object-fit:contain">`;
    } else {
      // PDF: fetch + blob URL para que el browser lo renderice nativamente
      // (en lugar de que Cloudinary devuelva una imagen estática).
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      blobUrl = URL.createObjectURL(blob);
      content.innerHTML = `<iframe src="${blobUrl}" style="flex:1;border:none;width:100%;height:100%;background:#525659" title="${titulo}"></iframe>`;
    }
  } catch (err) {
    content.innerHTML = `
      <div style="text-align:center;color:#fef3c7;padding:24px;max-width:400px">
        <div style="font-size:36px;margin-bottom:10px">⚠️</div>
        <div style="font-size:14px;margin-bottom:8px;font-weight:600">No se pudo cargar el archivo en línea</div>
        <div style="font-size:12px;color:#d1d5db;margin-bottom:14px">${err.message || err}</div>
        <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:8px 18px;background:#2563eb;color:#fff;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600">Abrir en pestaña nueva</a>
      </div>
    `;
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
let _centrosCosto = []; // activos, con info de cotización vinculada (mig 069)

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
  // El kanban OC vive dentro de Logística — navegamos al sub-tab para
  // mantener el sidebar y los demás tabs accesibles.
  window.location.hash = 'logistica/oc';
}

export const OrdenesCompra = async () => {
  try {
    [_ocs, _proveedores, _servicios, _cfg, _centrosCosto] = await Promise.all([
      api.ordenesCompra.list().catch(() => []),
      api.purchases.getProveedores().catch(() => []),
      api.services.getServiciosActivos().catch(() => []),
      api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000, permitir_correlativo_manual: false })),
      api.centrosCosto.list(true).catch(() => []),
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
window.OC = { nuevaOC, verOC, aprobar, aprobarParaPago, listoParaFacturar, marcarCredito, subirFactura, eliminarFactura, subirVoucherPago, eliminarVoucherPago, firmar, desfirmar, agregarNota, borrarNota, recibir, facturar, registrarPago, cerrarSinFactura, cerrarPagaSinFactura, asociarFactura, anular, reactivar, eliminarOC, mandarABorrador, editar, editarFecha, editarMetadata: editarMetadataOC, descargarPDF, reporteROC, marcarEnTransito, desmarcarTransito, cerrarImportacion, vincularMadre, desvincularMadre, descargarExcel: () => api.ordenesCompra.descargarExcel().catch(e => showError(e.message || 'Error descargando Excel')) };

// ═════════════════════════════════════════════════════════════════════════
// IMPORTACIONES — landed cost (mig 068)
// ═════════════════════════════════════════════════════════════════════════

async function marcarEnTransito(id_oc, nro) {
  if (!confirm(`¿Marcar ${nro} como EN TRÁNSITO?\n\nLa mercadería NO va a entrar al inventario hasta que cierres la importación con todos los gastos asociados (flete, desaduanaje, impuestos).`)) return;
  try {
    await api.ordenesCompra.marcarEnTransito(id_oc);
    showSuccess('OC marcada en tránsito');
    if (document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
    if (window.refreshModule) window.refreshModule();
  } catch (e) { showError(e.message || 'Error'); }
}

async function desmarcarTransito(id_oc, nro) {
  if (!confirm(`¿Desmarcar ${nro} del tránsito?\n\nVuelve al estado anterior (PAGO o APROBADA). No hubo ningún cambio en inventario.`)) return;
  try {
    await api.ordenesCompra.desmarcarTransito(id_oc);
    showSuccess('OC desmarcada');
    if (document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
    if (window.refreshModule) window.refreshModule();
  } catch (e) { showError(e.message || 'Error'); }
}

async function vincularMadre(id_oc, nro) {
  // Pickeamos OCs ALMACEN en EN_TRANSITO de la misma empresa idealmente.
  // Por simplicidad, listamos todas las EN_TRANSITO y el usuario elige.
  try {
    const madres = await api.ordenesCompra.list({ estado: 'EN_TRANSITO' });
    const candidatas = (madres || []).filter(m => m.tipo_oc === 'ALMACEN');
    if (!candidatas.length) {
      showError('No hay OCs ALMACEN en tránsito para vincular. Marcá primero la OC madre como "🚢 En tránsito".');
      return;
    }
    const opciones = candidatas.map(m => `${m.id_oc} — ${m.nro_oc} (${m.proveedor_nombre || 'sin proveedor'})`).join('\n');
    const resp = prompt(`Vincular ${nro} a importación madre.\n\nOpciones disponibles:\n${opciones}\n\nIngresá el ID de la OC madre:`);
    if (!resp) return;
    const idMadre = Number(resp.trim());
    if (!Number.isFinite(idMadre) || idMadre <= 0) { showError('ID inválido'); return; }
    await api.ordenesCompra.vincularMadre(id_oc, idMadre);
    showSuccess(`Vinculada a OC madre #${idMadre}`);
    if (document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
    if (window.refreshModule) window.refreshModule();
  } catch (e) { showError(e.message || 'Error'); }
}

async function desvincularMadre(id_oc, nro) {
  if (!confirm(`¿Desvincular ${nro} de su importación madre?\n\nSus gastos dejarán de formar parte del landed cost.`)) return;
  try {
    await api.ordenesCompra.desvincularMadre(id_oc);
    showSuccess('Desvinculada');
    if (document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
    if (window.refreshModule) window.refreshModule();
  } catch (e) { showError(e.message || 'Error'); }
}

async function cerrarImportacion(id_oc, nro) {
  // Trae el resumen de la importación (madre + satélites + prorrateo sugerido).
  let resumen;
  try {
    resumen = await api.ordenesCompra.importacionResumen(id_oc);
  } catch (e) {
    showError(e.message || 'Error obteniendo resumen de importación');
    return;
  }
  if (!resumen?.items?.length) {
    showError('Esta OC no tiene ítems con id_item asignado — no se puede recibir al inventario.');
    return;
  }

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px 20px;overflow-y:auto';

  const filasSat = resumen.satelites.length
    ? resumen.satelites.map(s => `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:6px 8px;font-size:11px">${s.nro_oc}</td>
          <td style="padding:6px 8px;font-size:11px">${s.proveedor || '—'}</td>
          <td style="padding:6px 8px;font-size:11px;text-align:right">${s.moneda} ${Number(s.total).toFixed(2)}</td>
          <td style="padding:6px 8px;font-size:11px;text-align:right;font-weight:600">S/ ${Number(s.total_pen).toFixed(2)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="padding:14px;text-align:center;color:#9ca3af;font-size:12px;font-style:italic">⚠️ No hay OCs satélite vinculadas. El cierre va a usar SOLO el costo del proveedor (sin gastos adicionales).</td></tr>';

  const filasItems = resumen.items.map(it => `
    <tr style="border-bottom:1px solid #e5e7eb" data-id-detalle="${it.id_detalle}">
      <td style="padding:8px;font-size:12px">${it.descripcion}</td>
      <td style="padding:8px;font-size:11px;text-align:center">${it.cantidad} ${it.unidad || ''}</td>
      <td style="padding:8px;font-size:11px;text-align:right;color:#6b7280">S/ ${Number(it.precio_unitario_orig_pen).toFixed(4)}</td>
      <td style="padding:6px 8px;text-align:right">
        <input type="number" step="0.0001" min="0" value="${Number(it.precio_landed_unit_pen_sugerido).toFixed(4)}"
               data-landed-input
               style="width:110px;padding:5px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;text-align:right;background:#ecfdf5">
      </td>
      <td style="padding:8px;font-size:11px;text-align:right;color:#6b7280" data-subtotal-cell>S/ ${(Number(it.precio_landed_unit_pen_sugerido) * Number(it.cantidad)).toFixed(2)}</td>
    </tr>`).join('');

  ov.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:min(900px,95vw);box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:calc(100vh - 60px);overflow-y:auto;position:relative">
      <button data-close type="button" title="Cerrar sin guardar" aria-label="Cerrar" style="position:absolute;top:14px;right:14px;background:#fff;border:1px solid #d1d5db;border-radius:50%;width:30px;height:30px;font-size:18px;cursor:pointer;color:#64748b;z-index:10;display:flex;align-items:center;justify-content:center;line-height:1">×</button>

      <div style="padding:24px">
        <h3 style="margin:0 0 8px;font-size:18px">🚛 Cerrar importación ${nro}</h3>
        <p style="margin:0 0 16px;font-size:12px;color:#6b7280">El sistema sumó los gastos de las OCs satélite y los prorrateó por valor sobre los productos. Podés ajustar cada precio landed manualmente.</p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:14px;font-size:12px">
          <div style="font-weight:600;margin-bottom:8px">Resumen</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div>Proveedor (madre): <strong>${resumen.madre.moneda} ${Number(resumen.madre.total).toFixed(2)}</strong><br><span style="color:#6b7280;font-size:11px">≈ S/ ${Number(resumen.madre.total_pen).toFixed(2)}</span></div>
            <div>Gastos satélite: <strong>S/ ${Number(resumen.total_gastos_pen).toFixed(2)}</strong><br><span style="color:#6b7280;font-size:11px">${resumen.satelites.length} OC(s) vinculadas</span></div>
            <div>TOTAL LANDED: <strong style="color:#059669">S/ ${Number(resumen.total_landed_pen).toFixed(2)}</strong></div>
          </div>
        </div>

        <details ${resumen.satelites.length ? '' : 'open'} style="margin-bottom:14px;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px">
          <summary style="cursor:pointer;font-size:12px;font-weight:600">📋 Detalle de OCs satélite (${resumen.satelites.length})</summary>
          <table style="width:100%;border-collapse:collapse;margin-top:8px">
            <thead><tr style="background:#f3f4f6">
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase">N° OC</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase">Proveedor</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase">Total original</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase">Total PEN</th>
            </tr></thead>
            <tbody>${filasSat}</tbody>
          </table>
        </details>

        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase">Ítem</th>
            <th style="padding:8px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>
            <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase">P. Orig PEN</th>
            <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase">P. Landed PEN ✎</th>
            <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase">Subtotal</th>
          </tr></thead>
          <tbody id="imp-items-tbody">${filasItems}</tbody>
          <tfoot>
            <tr style="background:#f0fdf4;border-top:2px solid #16a34a">
              <td colspan="4" style="padding:10px;text-align:right;font-weight:700;font-size:12px">TOTAL LANDED al inventario:</td>
              <td style="padding:10px;text-align:right;font-weight:700;font-size:13px;color:#059669" id="imp-total-cell">S/ 0.00</td>
            </tr>
          </tfoot>
        </table>

        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:11px;color:#78350f">
          ⚠️ Al confirmar: los productos entran al inventario con el precio landed indicado, la OC madre pasa a RECEPCION, y se congela un snapshot de los gastos vinculados. <strong>Esta acción no se puede deshacer.</strong>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button data-close type="button" style="padding:10px 18px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">Cancelar</button>
          <button id="imp-confirmar" type="button" style="padding:10px 22px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700">✓ Confirmar y recibir al inventario</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  ov.querySelectorAll('[data-close]').forEach(b => b.onclick = () => ov.remove());

  // Recalcular subtotales + total al editar cualquier input landed.
  const recalcular = () => {
    let total = 0;
    ov.querySelectorAll('tbody#imp-items-tbody tr').forEach(tr => {
      const input = tr.querySelector('[data-landed-input]');
      const cantidad = Number(tr.querySelectorAll('td')[1].textContent.trim().split(' ')[0]) || 0;
      const landed = Number(input.value) || 0;
      const subtotal = cantidad * landed;
      total += subtotal;
      tr.querySelector('[data-subtotal-cell]').textContent = 'S/ ' + subtotal.toFixed(2);
    });
    ov.querySelector('#imp-total-cell').textContent = 'S/ ' + total.toFixed(2);
  };
  ov.querySelectorAll('[data-landed-input]').forEach(inp => inp.addEventListener('input', recalcular));
  recalcular();

  // Submit
  ov.querySelector('#imp-confirmar').onclick = async () => {
    const lineas = [];
    ov.querySelectorAll('tbody#imp-items-tbody tr').forEach(tr => {
      const id_detalle = Number(tr.dataset.idDetalle);
      const precio_landed_unit_pen = Number(tr.querySelector('[data-landed-input]').value);
      lineas.push({ id_detalle, precio_landed_unit_pen });
    });
    try {
      await api.ordenesCompra.cerrarImportacion(id_oc, lineas);
      showSuccess('Importación cerrada — productos en inventario con costo landed');
      ov.remove();
      if (document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
      if (window.refreshModule) window.refreshModule();
    } catch (e) {
      showError(e.message || 'Error cerrando importación');
    }
  };
}

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
// mes: null = aún no inicializado (aplica default mes actual)
//      ''   = el usuario eligió "Todos" explícitamente
//      'YYYY-MM' = mes específico
let _kanbanFiltros = { cc: '', mes: null, soloProblemas: false };

function renderKanban(panel) {
  panel.dataset.rendered = '1';
  // Calcular opciones para los filtros
  const centrosCosto = [...new Set(_ocs.map(o => o.centro_costo).filter(Boolean))].sort();
  const meses = [...new Set(_ocs.map(o => (o.fecha_emision || '').slice(0,7)).filter(Boolean))].sort().reverse();
  const mesActual = new Date().toISOString().slice(0,7);
  // Default sólo la primera vez. Si el usuario eligió "" (Todos), respetarlo.
  if (_kanbanFiltros.mes === null) {
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
      <button id="oc-btn-preview-listado" class="btn-secondary" type="button" title="Previsualizar el listado de OCs en pantalla, con el mismo formato y colores que tendrá el Excel — útil para revisar antes de descargar.">👁️ Vista previa</button>
      <button id="oc-btn-export" class="btn-secondary" type="button" title="Descargar TODAS las OCs en Excel con formato.">📊 Exportar Excel</button>
    </div>
    <div id="oc-kanban-board" class="oc-kanban-board"></div>
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
  document.getElementById('oc-btn-preview-listado').addEventListener('click', () => previewListadoOC());

  pintarColumnasKanban();
}

// Vista previa del listado de OCs con el mismo formato visual que el Excel.
// Reusa _ocs (la data ya cargada por listar()). Aplica filtros activos del
// kanban (centro, mes, solo problemas) para ser coherente con lo visible.
function previewListadoOC() {
  const filtradas = _ocs.filter(oc => {
    if (oc.estado === 'ANULADA' && !_kanbanFiltros.soloProblemas) {/* dejamos pasar — el listado completo las incluye */}
    if (_kanbanFiltros.cc && oc.centro_costo !== _kanbanFiltros.cc) return false;
    if (_kanbanFiltros.mes && !(oc.fecha_emision || '').startsWith(_kanbanFiltros.mes)) return false;
    if (_kanbanFiltros.soloProblemas && !ocTieneProblema(oc)) return false;
    return true;
  });

  // Mapping de colores por estado — matchea el del Excel y el kanban.
  const estColor = {
    BORRADOR:            { bg: '#fef3c7', fg: '#92400e' },
    APROBADA:            { bg: '#dbeafe', fg: '#1e40af' },
    PAGO:                { bg: '#fee2e2', fg: '#991b1b' },
    EN_TRANSITO:         { bg: '#e0f2fe', fg: '#075985' },
    RECEPCION:           { bg: '#fef9c3', fg: '#854d0e' },
    FACTURACION:         { bg: '#fef3c7', fg: '#92400e' },
    TERMINADA:           { bg: '#d1fae5', fg: '#065f46' },
    CERRADA_SIN_FACTURA: { bg: '#fce7f3', fg: '#9d174d' },
    ANULADA:             { bg: '#e5e7eb', fg: '#374151' },
  };
  const pagoColor = (e) => e === 'PAGADO'   ? { bg: '#d1fae5', fg: '#065f46' }
                       : e === 'PARCIAL'    ? { bg: '#fef3c7', fg: '#92400e' }
                       : e === 'PENDIENTE'  ? { bg: '#fee2e2', fg: '#991b1b' }
                       : null;
  const facColor = (e) => e === 'FACTURADA'   ? { bg: '#d1fae5', fg: '#065f46' }
                      : e === 'SIN_FACTURA' ? { bg: '#fce7f3', fg: '#9d174d' }
                      : e === 'PENDIENTE'   ? { bg: '#fee2e2', fg: '#991b1b' }
                      : null;
  const fmt = (n, m) => `${m === 'USD' ? '$' : 'S/'} ${Number(n || 0).toFixed(2)}`;

  const totalPEN = filtradas.filter(o => o.moneda === 'PEN').reduce((s, o) => s + Number(o.total || 0), 0);
  const totalUSD = filtradas.filter(o => o.moneda === 'USD').reduce((s, o) => s + Number(o.total || 0), 0);

  const filas = filtradas.map((oc, i) => {
    const c = estColor[oc.estado] || { bg: '#e5e7eb', fg: '#374151' };
    const pc = pagoColor(oc.estado_pago);
    const fc = facColor(oc.estado_factura);
    const zebra = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const tdBase = `padding:8px 10px;border-bottom:1px solid #e2e8f0;background:${zebra};font-size:12px;color:#1e293b;font-variant-numeric:tabular-nums`;
    return `
      <tr>
        <td style="${tdBase};font-weight:700">${escapeHtml(oc.nro_oc || '')}</td>
        <td style="${tdBase}">${oc.fecha_emision ? String(oc.fecha_emision).slice(0,10) : ''}</td>
        <td style="${tdBase}">${escapeHtml(oc.proveedor_nombre || '—')}</td>
        <td style="${tdBase}">${escapeHtml(oc.centro_costo || '')}</td>
        <td style="${tdBase};text-align:center">${escapeHtml(oc.empresa || '')}</td>
        <td style="${tdBase};text-align:center">${escapeHtml(oc.tipo_oc || '')}</td>
        <td style="${tdBase};text-align:center">${escapeHtml(oc.moneda || '')}</td>
        <td style="${tdBase};text-align:right;font-weight:700">${fmt(oc.total, oc.moneda)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;background:${c.bg};color:${c.fg};font-size:11px;font-weight:700;text-align:center">${escapeHtml(oc.estado || '')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;background:${pc ? pc.bg : zebra};color:${pc ? pc.fg : '#1e293b'};font-size:11px;font-weight:${pc ? 700 : 400};text-align:center">${escapeHtml(oc.estado_pago || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;background:${fc ? fc.bg : zebra};color:${fc ? fc.fg : '#1e293b'};font-size:11px;font-weight:${fc ? 700 : 400};text-align:center">${escapeHtml(oc.estado_factura || '—')}</td>
        <td style="${tdBase};text-align:center">${escapeHtml(oc.forma_pago || '')}</td>
        <td style="${tdBase}">${oc.fecha_credito_vence ? String(oc.fecha_credito_vence).slice(0,10) : ''}</td>
        <td style="${tdBase}">${oc.pagada_at ? new Date(oc.pagada_at).toLocaleDateString('es-PE') : ''}</td>
      </tr>
    `;
  }).join('');

  const headers = ['Nro OC','Fecha','Proveedor','Centro Costo','Marca','Tipo','Moneda','Total','Estado','Pago','Factura','Forma Pago','Crédito Vence','Pagada'];
  const thHtml = headers.map(h => `<th style="padding:10px 12px;background:#1e293b;color:#fff;font-size:11px;font-weight:700;text-align:center;border-bottom:2px solid #0f172a;white-space:nowrap">${h}</th>`).join('');

  const fechaHoy = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:min(1200px,98vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="padding:16px 20px;background:#0f172a;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:16px;font-weight:700">📋 Listado de Órdenes de Compra · Metal Engineers</div>
          <div style="font-size:11px;color:#94a3b8;font-style:italic;margin-top:3px">Generado el ${fechaHoy} · ${filtradas.length} OC${filtradas.length === 1 ? '' : 's'} ${_kanbanFiltros.cc || _kanbanFiltros.mes || _kanbanFiltros.soloProblemas ? '(con filtros activos)' : 'en total'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button data-export type="button" style="padding:7px 14px;background:#15803d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700">📊 Descargar Excel</button>
          <button data-close type="button" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:12px">Cerrar</button>
        </div>
      </div>
      <div style="flex:1;overflow:auto;background:#fff">
        <table style="width:100%;border-collapse:collapse">
          <thead style="position:sticky;top:0;z-index:1">
            <tr>${thHtml}</tr>
          </thead>
          <tbody>${filas || `<tr><td colspan="${headers.length}" style="padding:40px;text-align:center;color:#94a3b8">No hay OCs que coincidan con los filtros.</td></tr>`}</tbody>
          ${filtradas.length > 0 ? `
            <tfoot>
              <tr>
                <td colspan="7" style="padding:10px 12px;text-align:right;font-weight:700;background:#f1f5f9;border-top:2px solid #1e293b;color:#0f172a">TOTAL PEN:</td>
                <td style="padding:10px 12px;text-align:right;font-weight:700;background:#d1fae5;color:#065f46;border-top:2px solid #1e293b;font-variant-numeric:tabular-nums">S/ ${totalPEN.toFixed(2)}</td>
                <td colspan="6" style="background:#f1f5f9;border-top:2px solid #1e293b"></td>
              </tr>
              ${totalUSD > 0 ? `
                <tr>
                  <td colspan="7" style="padding:10px 12px;text-align:right;font-weight:700;background:#f1f5f9;color:#0f172a">TOTAL USD:</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:700;background:#d1fae5;color:#065f46;font-variant-numeric:tabular-nums">$ ${totalUSD.toFixed(2)}</td>
                  <td colspan="6" style="background:#f1f5f9"></td>
                </tr>
              ` : ''}
            </tfoot>
          ` : ''}
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  ov.querySelector('[data-close]').onclick = () => ov.remove();
  ov.querySelector('[data-export]').onclick = () => {
    document.getElementById('oc-btn-export')?.click();
  };
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

  // Mismo array que COLUMNAS_KANBAN_PRINCIPALES — incluye EN_TRANSITO para
  // que la columna sea siempre visible (aunque esté vacía cuando no hay
  // importaciones en curso). EN_TRANSITO va entre PAGO y RECEPCION.
  const estadosOrden = ['BORRADOR', 'APROBADA', 'PAGO', 'EN_TRANSITO', 'RECEPCION', 'FACTURACION', 'TERMINADA'];
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

// Mismo criterio que el backend (_requiereRecepcion en OrdenCompraService.ts).
// Saltan recepción:
//  - GENERAL (cualquiera): gastos administrativos / alquileres, no hay nada físico.
//  - HONORARIO de cualquier tipo_oc: persona natural, el pago YA es el
//    reconocimiento; el RH se sube en FACTURACION sin pasar por recepción.
// Requieren recepción:
//  - ALMACEN: mercadería física que se chequea contra remito.
//  - SERVICIO no-honorario: trabajo externo (técnico tercerizado), confirmar
//    antes de pagar la factura.
function requiereRecepcion(oc) {
  if (oc.es_honorario) return false;
  return oc.tipo_oc === 'ALMACEN' || oc.tipo_oc === 'SERVICIO';
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
  // Demora en recepción — solo aplica si el tipo de OC requiere recepción.
  if (oc.estado === 'RECEPCION' && oc.estado_pago === 'PAGADO' && oc.pagada_at && requiereRecepcion(oc)) {
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
// Filtros del Listado completo. Persisten en module-scope para que al
// re-renderizar (después de aplicar filtros) los valores no se pisen.
let _listaFiltros = {
  anio:    new Date().getFullYear(),
  mes:     'Todos',
  centro:  'Todos',
  marca:   'Todos',
  estado:  'Todos',
};

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

  // Opciones derivadas de los datos
  const aniosDisp = [...new Set(_ocs.map(o => (o.fecha_emision || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const centrosDisp = [...new Set(_ocs.map(o => o.centro_costo).filter(Boolean))].sort();
  const meses = [
    { v: 'Todos', l: 'Todos' }, { v: '01', l: 'Enero' }, { v: '02', l: 'Febrero' },
    { v: '03', l: 'Marzo' }, { v: '04', l: 'Abril' }, { v: '05', l: 'Mayo' },
    { v: '06', l: 'Junio' }, { v: '07', l: 'Julio' }, { v: '08', l: 'Agosto' },
    { v: '09', l: 'Septiembre' }, { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' },
    { v: '12', l: 'Diciembre' },
  ];

  panel.innerHTML = `
    <div style="margin-top:16px">
      <!-- Filtros -->
      <div class="card" style="padding:14px 16px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text-secondary)">
          Año
          <select id="lst-anio" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;min-width:90px">
            ${aniosDisp.map(a => `<option value="${a}" ${String(_listaFiltros.anio) === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text-secondary)">
          Mes
          <select id="lst-mes" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;min-width:130px">
            ${meses.map(m => `<option value="${m.v}" ${_listaFiltros.mes === m.v ? 'selected' : ''}>${m.l}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text-secondary)">
          Centro de costo
          <select id="lst-centro" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;min-width:200px">
            <option value="Todos">Todos</option>
            ${centrosDisp.map(c => `<option value="${escapeHtml(c)}" ${_listaFiltros.centro === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text-secondary)">
          Marca
          <select id="lst-marca" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;min-width:100px">
            <option value="Todos" ${_listaFiltros.marca === 'Todos' ? 'selected' : ''}>Ambas</option>
            <option value="ME"    ${_listaFiltros.marca === 'ME'    ? 'selected' : ''}>Metal Engineers</option>
            <option value="PT"    ${_listaFiltros.marca === 'PT'    ? 'selected' : ''}>Perfotools</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text-secondary)">
          Estado
          <select id="lst-estado" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;min-width:140px">
            <option value="Todos">Todos</option>
            ${Object.keys(ESTADO_COLOR).map(e => `<option value="${e}" ${_listaFiltros.estado === e ? 'selected' : ''}>${e.replace('_', ' ')}</option>`).join('')}
          </select>
        </label>
        <button id="lst-btn-aplicar" class="btn-secondary" style="padding:7px 16px">Aplicar</button>
        <button id="lst-btn-reset" class="btn-secondary" style="padding:7px 14px;background:transparent" title="Limpiar todos los filtros">⟲ Reset</button>
        <div style="flex:1"></div>
        <button id="lst-btn-preview" class="btn-secondary" style="padding:7px 14px" title="Vista previa del listado con formato del Excel">👁️ Vista previa</button>
        <button id="lst-btn-export" class="btn-secondary" style="padding:7px 14px" title="Descargar TODAS las OCs en Excel">📊 Exportar Excel</button>
      </div>
      <div id="lst-cuerpo"></div>
    </div>
  `;

  // Bind filtros
  document.getElementById('lst-btn-aplicar').onclick = () => {
    _listaFiltros.anio   = Number(document.getElementById('lst-anio').value);
    _listaFiltros.mes    = document.getElementById('lst-mes').value;
    _listaFiltros.centro = document.getElementById('lst-centro').value;
    _listaFiltros.marca  = document.getElementById('lst-marca').value;
    _listaFiltros.estado = document.getElementById('lst-estado').value;
    pintarListaCuerpo();
  };
  document.getElementById('lst-btn-reset').onclick = () => {
    _listaFiltros = { anio: new Date().getFullYear(), mes: 'Todos', centro: 'Todos', marca: 'Todos', estado: 'Todos' };
    panel.dataset.rendered = '';
    renderLista(panel);
  };
  document.getElementById('lst-btn-export').onclick = () => OC.descargarExcel();
  document.getElementById('lst-btn-preview').onclick = () => previewListadoOC();

  pintarListaCuerpo();
}

// Aplica filtros + agrupa por centro de costo + pinta KPIs y secciones.
function pintarListaCuerpo() {
  const cont = document.getElementById('lst-cuerpo');
  if (!cont) return;
  const f = _listaFiltros;

  const filtradas = _ocs.filter(oc => {
    const fecha = String(oc.fecha_emision || '');
    if (f.anio   && !fecha.startsWith(String(f.anio))) return false;
    if (f.mes !== 'Todos' && fecha.slice(5, 7) !== f.mes) return false;
    if (f.centro !== 'Todos' && oc.centro_costo !== f.centro) return false;
    if (f.marca  !== 'Todos' && oc.empresa !== f.marca) return false;
    if (f.estado !== 'Todos' && oc.estado !== f.estado) return false;
    return true;
  });

  if (!filtradas.length) {
    cont.innerHTML = `
      <div class="card" style="padding:40px;text-align:center;color:var(--text-secondary)">
        <div style="font-size:36px;margin-bottom:8px">🔍</div>
        <div style="font-size:14px;font-weight:600">No hay OCs con esos filtros</div>
        <div style="font-size:12px;margin-top:4px">Probá ajustar los filtros o presionar ⟲ Reset.</div>
      </div>`;
    return;
  }

  // KPIs en PEN equivalente (USD * tipo_cambio)
  const totalGeneral = filtradas.reduce((s, o) => s + (o.moneda === 'USD' ? Number(o.total) * (Number(o.tipo_cambio) || 1) : Number(o.total || 0)), 0);
  const porTipo = { ALMACEN: 0, GENERAL: 0, SERVICIO: 0 };
  const cntTipo = { ALMACEN: 0, GENERAL: 0, SERVICIO: 0 };
  filtradas.forEach(o => {
    const m = o.moneda === 'USD' ? Number(o.total) * (Number(o.tipo_cambio) || 1) : Number(o.total || 0);
    if (porTipo[o.tipo_oc] !== undefined) { porTipo[o.tipo_oc] += m; cntTipo[o.tipo_oc] += 1; }
  });

  // Agrupar por centro de costo
  const grupos = {};
  filtradas.forEach(oc => {
    const k = oc.centro_costo || 'SIN CENTRO';
    if (!grupos[k]) grupos[k] = { ocs: [], totalPEN: 0, totalUSD: 0 };
    grupos[k].ocs.push(oc);
    if (oc.moneda === 'USD') grupos[k].totalUSD += Number(oc.total || 0);
    else grupos[k].totalPEN += Number(oc.total || 0);
  });
  const centrosOrdenados = Object.keys(grupos).sort();

  // Render
  cont.innerHTML = `
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px">
      ${kpiCard('TOTAL GENERAL (PEN equiv.)', fPEN(totalGeneral), `${filtradas.length} OC${filtradas.length === 1 ? '' : 's'}`, '#0f172a', '#fff')}
      ${kpiCard('ALMACÉN', fPEN(porTipo.ALMACEN), `${cntTipo.ALMACEN} OC${cntTipo.ALMACEN === 1 ? '' : 's'}`, '#1e40af', '#dbeafe')}
      ${kpiCard('GENERAL', fPEN(porTipo.GENERAL), `${cntTipo.GENERAL} OC${cntTipo.GENERAL === 1 ? '' : 's'}`, '#92400e', '#fef3c7')}
      ${kpiCard('SERVICIO', fPEN(porTipo.SERVICIO), `${cntTipo.SERVICIO} OC${cntTipo.SERVICIO === 1 ? '' : 's'}`, '#065f46', '#d1fae5')}
    </div>

    <!-- Secciones por centro de costo -->
    ${centrosOrdenados.map(c => seccionCentro(c, grupos[c])).join('')}
  `;
}

// Helper: card de KPI (usa el patrón de Administración Personal)
function kpiCard(label, value, sub, fgColor, bgColor) {
  return `
    <div style="background:${bgColor};border:1px solid ${fgColor}33;border-left:4px solid ${fgColor};border-radius:6px;padding:12px 14px">
      <div style="font-size:10px;color:${fgColor};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${fgColor};font-variant-numeric:tabular-nums">${value}</div>
      <div style="font-size:11px;color:${fgColor}aa;margin-top:2px">${sub}</div>
    </div>
  `;
}

// Helper: una sección por centro de costo con su tabla y subtotal
function seccionCentro(nombreCentro, grupo) {
  const ocsOrdenadas = grupo.ocs.slice().sort((a, b) => String(b.fecha_emision || '').localeCompare(String(a.fecha_emision || '')));
  const totales = [];
  if (grupo.totalPEN > 0) totales.push(`<span style="color:#065f46">${fPEN(grupo.totalPEN)}</span>`);
  if (grupo.totalUSD > 0) totales.push(`<span style="color:#1e40af">${fUSD(grupo.totalUSD)}</span>`);

  return `
    <div class="card" style="margin-bottom:14px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f1f5f9;border-bottom:2px solid #cbd5e1">
        <div>
          <h3 style="margin:0;font-size:14px;color:#0f172a;display:flex;align-items:center;gap:8px">
            📁 ${escapeHtml(nombreCentro)}
            <span style="background:#cbd5e1;color:#0f172a;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${grupo.ocs.length} OC${grupo.ocs.length === 1 ? '' : 's'}</span>
          </h3>
        </div>
        <div style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums">${totales.join(' · ') || '—'}</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
              <th style="padding:9px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">N° OC</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Fecha</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Proveedor</th>
              <th style="padding:9px 10px;text-align:center;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Tipo</th>
              <th style="padding:9px 10px;text-align:center;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Marca</th>
              <th style="padding:9px 10px;text-align:right;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Total</th>
              <th style="padding:9px 10px;text-align:center;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Estado</th>
              <th style="padding:9px 10px;text-align:center;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${ocsOrdenadas.map(oc => {
              const color = ESTADO_COLOR[oc.estado] || { bg: '#e5e7eb', fg: '#374151', icon: '' };
              const monto = oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total);
              const fechaIso = oc.fecha_emision ? String(oc.fecha_emision).split('T')[0] : '';
              const puedeEditarFecha = oc.estado !== 'ANULADA';
              const nroSafe = String(oc.nro_oc || '').replace(/'/g, "\\'");
              return `
                <tr style="border-bottom:1px solid #e5e7eb">
                  <td style="padding:8px 10px;font-weight:700"><a href="#" onclick="event.preventDefault();OC.verOC(${oc.id_oc})" style="color:var(--primary-color);text-decoration:none">${oc.nro_oc}</a></td>
                  <td style="padding:8px 10px;white-space:nowrap;font-variant-numeric:tabular-nums">
                    ${fmtDate(oc.fecha_emision)}
                    ${puedeEditarFecha ? `<button onclick="OC.editarFecha(${oc.id_oc},'${nroSafe}','${fechaIso}')" title="Editar fecha (corregir data histórica)" style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:12px;padding:0 2px;margin-left:4px">📅</button>` : ''}
                  </td>
                  <td style="padding:8px 10px">${escapeHtml(oc.proveedor_nombre || '—')}</td>
                  <td style="padding:8px 10px;text-align:center"><span style="font-size:10px;background:#e5e7eb;padding:2px 6px;border-radius:4px">${oc.tipo_oc}</span></td>
                  <td style="padding:8px 10px;text-align:center"><span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${oc.empresa === 'PT' ? '#16a34a' : '#676767'};color:white">${oc.empresa}</span></td>
                  <td style="padding:8px 10px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${monto}</td>
                  <td style="padding:8px 10px;text-align:center"><span style="background:${color.bg};color:${color.fg};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap">${color.icon} ${oc.estado.replace('_', ' ')}</span></td>
                  <td style="padding:8px 10px;text-align:center">
                    <button onclick="OC.verOC(${oc.id_oc})" style="padding:4px 10px;background:var(--primary-color);color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px">👁 Ver</button>
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
    // Multi-factura + multi-pago (mig 064). Cargamos las listas en paralelo.
    const [oc, facturasAdjuntas, pagosAdjuntos, notas] = await Promise.all([
      api.ordenesCompra.get(id_oc),
      api.ordenesCompra.listarFacturas(id_oc).catch(() => []),
      api.ordenesCompra.listarPagos(id_oc).catch(() => []),
      api.ordenesCompra.listarNotas(id_oc).catch(() => []),
    ]);
    const color = ESTADO_COLOR[oc.estado];
    const monto = oc.moneda === 'USD' ? fUSD(oc.total) : fPEN(oc.total);

    // Inyectar la PRIMERA factura al objeto oc para que accionesSegunEstado la
    // considere (sigue funcionando como antes — basta con tener al menos una
    // factura para habilitar "Recibí factura"). La lista completa se renderiza
    // más abajo en su propio bloque.
    const facturaAdjunta = facturasAdjuntas[0] || null;
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

          ${oc.oc_madre_id ? `
          <div style="background:#f0f9ff;border:1px solid #bae6fd;color:#075985;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px">
            🚢 <strong>Satélite de importación:</strong> sus gastos forman parte del landed cost de la OC madre #${oc.oc_madre_id}.
          </div>` : ''}
          ${oc.estado === 'EN_TRANSITO' ? `
          <div style="background:#f0f9ff;border:1px solid #bae6fd;color:#075985;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px">
            🚢 <strong>En tránsito:</strong> mercadería pagada al proveedor pero todavía NO entra al inventario. Vinculá las OCs satélite (flete, desaduanaje, impuestos) y después usá "Cerrar importación" para aplicar el landed cost.
          </div>` : ''}
          ${oc.landed_costed_at ? `
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px">
            ✅ <strong>Recibida con landed cost:</strong> el inventario refleja proveedor + gastos asociados prorrateados. Cerrada el ${fmtDate(oc.landed_costed_at)}.
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

          ${(() => {
            // Bloque "Pago" — solo se muestra si la OC ya pasó por aprobación
            // (BORRADOR/APROBADA todavía no aplica). Muestra Total / Ya pagado /
            // Saldo pendiente para que el usuario sepa cuánto debe.
            if (['BORRADOR', 'APROBADA', 'ANULADA'].includes(oc.estado)) return '';
            const _sym = oc.moneda === 'USD' ? '$' : 'S/';
            const _total = Number(oc.total) || 0;
            const _pagado = Number(oc.monto_pagado || 0);
            const _saldo = Math.max(0, _total - _pagado);
            const _pagOk = oc.estado_pago === 'PAGADO';
            const _esCredito = oc.forma_pago === 'CREDITO';
            const _bg = _pagOk ? '#ecfdf5' : '#fef3c7';
            const _border = _pagOk ? '#a7f3d0' : '#fde68a';
            const _txt = _pagOk ? '#065f46' : '#92400e';
            const _label = _pagOk ? '✅ Pago completo' : (_esCredito && _pagado <= 0.01 ? '💳 A crédito (sin pago aún)' : '💰 Pago en curso');
            return `
              <div style="padding:12px 14px;background:${_bg};border:1px solid ${_border};border-radius:6px;margin-bottom:16px;font-size:13px;color:${_txt}">
                <div style="font-weight:700;margin-bottom:6px">${_label}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px">
                  <div>Total OC: <strong>${_sym} ${_total.toFixed(2)}</strong></div>
                  <div>Ya pagado: <strong>${_sym} ${_pagado.toFixed(2)}</strong></div>
                  <div>Saldo pdte: <strong style="${_saldo > 0.01 ? 'color:#b91c1c' : ''}">${_sym} ${_saldo.toFixed(2)}</strong></div>
                </div>
                ${_esCredito && oc.fecha_credito_vence ? `<div style="margin-top:6px;font-size:11px">📅 Vence: ${fmtDate(oc.fecha_credito_vence)}</div>` : ''}
              </div>
            `;
          })()}

          ${(() => {
            // Bloque "Recepción" — solo si la OC ya está en RECEPCION, FACTURACION o TERMINADA.
            // Para honorarios la palabra es "Trabajo realizado" en vez de "Recepción".
            // Las OCs GENERAL no-honorario no tienen recepción — se omite el bloque.
            if (!['RECEPCION', 'FACTURACION', 'TERMINADA'].includes(oc.estado)) return '';
            if (!requiereRecepcion(oc)) return '';
            const _esHon = !!oc.es_honorario;
            const _label_estado = oc.estado_recepcion || 'NO_RECIBIDO';
            let _totalPedido = 0, _totalRecibido = 0;
            for (const l of (oc.detalle || [])) {
              _totalPedido   += Number(l.cantidad) || 0;
              _totalRecibido += Number(l.cantidad_recibida) || 0;
            }
            const _falta = Math.max(0, _totalPedido - _totalRecibido);
            const _bg     = _label_estado === 'RECIBIDO' ? '#ecfdf5' : (_label_estado === 'PARCIAL' ? '#fef3c7' : '#fee2e2');
            const _border = _label_estado === 'RECIBIDO' ? '#a7f3d0' : (_label_estado === 'PARCIAL' ? '#fde68a' : '#fecaca');
            const _txt    = _label_estado === 'RECIBIDO' ? '#065f46' : (_label_estado === 'PARCIAL' ? '#92400e' : '#991b1b');
            const _icono  = _label_estado === 'RECIBIDO' ? '✅' : (_label_estado === 'PARCIAL' ? '📦' : '⚠️');
            const _verbo = _esHon ? 'Trabajo realizado' : 'Recepción';
            const _verboFalta = _esHon ? 'falta confirmar' : 'faltan recibir';
            const _msg = _label_estado === 'RECIBIDO'
              ? `${_verbo} completa`
              : (_label_estado === 'PARCIAL' ? `${_verbo} parcial` : `Sin ${_verbo.toLowerCase()} aún`);
            return `
              <div style="padding:12px 14px;background:${_bg};border:1px solid ${_border};border-radius:6px;margin-bottom:16px;font-size:13px;color:${_txt}">
                <div style="font-weight:700;margin-bottom:6px">${_icono} ${_msg}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px">
                  <div>Total pedido: <strong>${_totalPedido}</strong></div>
                  <div>Ya recibido: <strong>${_totalRecibido}</strong></div>
                  <div>${_verboFalta.charAt(0).toUpperCase() + _verboFalta.slice(1)}: <strong style="${_falta > 0.01 ? 'color:#b91c1c' : ''}">${_falta}</strong></div>
                </div>
              </div>
            `;
          })()}

          ${(() => {
            // Lista de PAGOS (multi-pago, mig 064). Cada uno con su voucher.
            if (!pagosAdjuntos || !pagosAdjuntos.length) return '';
            const _esGer = (JSON.parse(localStorage.getItem('erp_user') || '{}').rol === 'GERENTE');
            const filas = pagosAdjuntos.map(p => {
              const tieneVoucher = !!p.voucher_url;
              const cuentaTxt = p.cuenta_nombre ? `${p.cuenta_nombre} (${p.cuenta_moneda})` : '—';
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid #d1fae5;border-radius:5px;margin-bottom:6px">
                  <div style="font-size:12px;color:#374151;flex:1">
                    <div><strong>${fmtDate(p.fecha_pago)}</strong> · ${cuentaTxt} · ${oc.moneda === 'USD' ? '$' : 'S/'} ${Number(p.monto).toFixed(2)}</div>
                    <div style="color:#6b7280;font-size:11px;margin-top:2px">${p.nro_operacion ? 'Op: ' + escapeHtml(p.nro_operacion) : '<em>sin nº op</em>'}${p.observaciones ? ' · ' + escapeHtml(p.observaciones) : ''}</div>
                  </div>
                  <div style="display:flex;gap:5px;align-items:center">
                    ${tieneVoucher
                      ? `<button onclick="window.previewVoucherPago(${p.id_pago}, 'Constancia ${fmtDate(p.fecha_pago)}')" title="Ver la constancia bancaria de este pago" style="background:#15803d;color:white;border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:11px">👁️ Ver</button>`
                      : `<button onclick="OC.subirVoucherPago(${p.id_pago})" title="Adjuntar la constancia bancaria de este pago — se guarda en Cloudinary" style="background:#fff;color:#15803d;border:1px solid #86efac;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:11px">📎 Subir constancia</button>`
                    }
                    ${tieneVoucher && _esGer
                      ? `<button onclick="OC.eliminarVoucherPago(${p.id_pago}, ${oc.id_oc})" title="Quitar la constancia adjunta. El archivo queda huérfano en Cloudinary." style="background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:5px 8px;cursor:pointer;font-size:11px">✕</button>`
                      : ''
                    }
                  </div>
                </div>
              `;
            }).join('');
            return `
              <div style="padding:12px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;margin-bottom:14px">
                <div style="font-size:11px;font-weight:700;color:#065f46;letter-spacing:.3px;margin-bottom:8px">💸 PAGOS REGISTRADOS (${pagosAdjuntos.length})</div>
                ${filas}
              </div>
            `;
          })()}

          ${(() => {
            // Lista de FACTURAS (multi-factura, mig 064).
            if (!facturasAdjuntas || !facturasAdjuntas.length) return '';
            const _esGer = (JSON.parse(localStorage.getItem('erp_user') || '{}').rol === 'GERENTE');
            const filas = facturasAdjuntas.map(f => {
              const tienePDF = !!f.url_pdf;
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid #a7f3d0;border-radius:5px;margin-bottom:6px">
                  <div style="font-size:12px;color:#374151;flex:1">
                    📄 <strong>${escapeHtml(f.nro_comprobante)}</strong>
                    <span style="color:#6b7280;margin-left:6px">${fmtDate(f.fecha_emision)} · ${oc.moneda === 'USD' ? '$' : 'S/'} ${Number(f.monto).toFixed(2)}</span>
                  </div>
                  <div style="display:flex;gap:5px;align-items:center">
                    ${tienePDF
                      ? `<button onclick="window.previewFacturaPorId(${f.id_factura_oc}, 'Factura ${escapeHtml(f.nro_comprobante)}')" title="Ver el PDF/imagen del comprobante" style="background:#16a34a;color:white;border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:11px">👁️ Ver</button>`
                      : '<span style="color:#9ca3af;font-size:11px;padding:5px">sin pdf</span>'
                    }
                    ${_esGer
                      ? `<button onclick="OC.eliminarFactura(${f.id_factura_oc}, ${oc.id_oc})" title="Eliminar esta factura. Si era la única, la OC vuelve a PENDIENTE. Solo GERENTE." style="background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:5px 8px;cursor:pointer;font-size:11px">✕</button>`
                      : ''
                    }
                  </div>
                </div>
              `;
            }).join('');
            return `
              <div style="padding:12px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;margin-bottom:16px">
                <div style="font-size:11px;font-weight:700;color:#065f46;letter-spacing:.3px;margin-bottom:8px">📑 FACTURAS ADJUNTAS (${facturasAdjuntas.length})</div>
                ${filas}
              </div>
            `;
          })()}

          ${(() => {
            if (!notas || !notas.length) return '';
            const userActual = JSON.parse(localStorage.getItem('erp_user') || '{}');
            const esGer = userActual.rol === 'GERENTE';
            const idUser = userActual.id_usuario;
            return `
              <details open style="margin-bottom:16px;padding:12px 14px;background:#fefce8;border:1px solid #fde68a;border-radius:6px">
                <summary style="cursor:pointer;font-size:13px;color:#713f12;font-weight:700">📝 Notas internas (${notas.length})</summary>
                <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
                  ${notas.map(n => {
                    const puedeBorrar = esGer || n.id_usuario === idUser;
                    const autor = n.nombre_usuario || 'Usuario';
                    const fecha = new Date(n.fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const txt = String(n.texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    return `
                      <div style="background:white;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;font-size:12px;color:#374151">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:11px;color:#6b7280">
                          <strong style="color:#374151">${autor}</strong>
                          <span style="display:flex;gap:8px;align-items:center">
                            <span>${fecha}</span>
                            ${puedeBorrar ? `<button onclick="OC.borrarNota(${oc.id_oc}, ${n.id_nota})" title="Borrar esta nota. Sólo el autor o un GERENTE pueden hacerlo." style="background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px">✕</button>` : ''}
                          </span>
                        </div>
                        <div style="white-space:pre-wrap;line-height:1.5">${txt}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </details>
            `;
          })()}

          ${(() => {
            // Multifirma (mig 065): cards de PREPARADO / REVISADO / AUTORIZADO.
            // BORRADOR es solo armado — sin firmas. Las firmas se hacen en
            // APROBADA, y al cumplir umbral la OC pasa automáticamente a PAGO.
            // En estados posteriores (PAGO/RECEPCION/FACTURACION/TERMINADA)
            // se muestran solo lectura como audit trail.
            if (oc.estado === 'BORRADOR' || oc.estado === 'ANULADA') return '';

            const userActual = JSON.parse(localStorage.getItem('erp_user') || '{}');
            const idUserActual = userActual.id_usuario;
            const rolActual = userActual.rol;
            const esGer = rolActual === 'GERENTE';
            const firmableAhora = oc.estado === 'APROBADA';
            const reqFirmas = Number(oc.firmas_requeridas) || 1;
            const actuales = Number(oc.firmas_actuales) || 0;

            const card = (etiqueta, casillero, idFirmante, nombreFirmante, fechaFirma) => {
              const firmada = !!idFirmante;
              const puedeQuitar = firmada && (idFirmante === idUserActual || esGer) && (oc.estado === 'APROBADA' || oc.estado === 'PAGO');
              const fecha = fechaFirma ? new Date(fechaFirma).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
              return `
                <div style="flex:1;min-width:200px;padding:12px;border:1px solid ${firmada?'#86efac':'#d1d5db'};border-radius:6px;background:${firmada?'#ecfdf5':'#f9fafb'}">
                  <div style="font-size:10px;font-weight:700;color:var(--text-secondary);letter-spacing:.3px;margin-bottom:6px">${etiqueta}</div>
                  ${firmada ? `
                    <div style="font-size:13px;font-weight:600;color:#065f46">${escapeHtml(nombreFirmante || '—')}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px">firmado: ${fecha}</div>
                    ${puedeQuitar ? `<button onclick="OC.desfirmar(${oc.id_oc}, '${casillero}')" title="Quitar tu firma. Si la OC ya estaba en PAGO y al quitar caen las firmas debajo del umbral, vuelve a APROBADA." style="margin-top:8px;background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">Quitar firma</button>` : ''}
                  ` : `
                    <div style="font-size:12px;color:#9ca3af;margin-bottom:8px">Pendiente</div>
                    ${firmableAhora ? `<button onclick="OC.firmar(${oc.id_oc}, '${casillero}')" title="Firmar como ${etiqueta.toLowerCase()}. Si con esta firma se alcanza el umbral configurado, la OC pasa automáticamente a PAGO." style="background:#2563eb;color:white;border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:11px;font-weight:600">✍️ Firmar</button>` : `<span style="color:#9ca3af;font-size:11px">—</span>`}
                  `}
                </div>
              `;
            };

            const colorBarra = actuales >= reqFirmas ? '#16a34a' : '#f59e0b';
            const headerTxt = firmableAhora
              ? `${actuales} / ${reqFirmas} firma${reqFirmas>1?'s':''} requerida${reqFirmas>1?'s':''} para pasar a PAGO`
              : `${actuales} firma${actuales>1?'s':''} registrada${actuales>1?'s':''}`;

            return `
              <div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <h4 style="margin:0;font-size:12px;color:var(--text-secondary);font-weight:700;letter-spacing:.3px">🖊️ FIRMAS DE APROBACIÓN</h4>
                  <span style="font-size:11px;color:${colorBarra};font-weight:600">${headerTxt}</span>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  ${card('PREPARADO POR',  'preparado',  oc.preparado_por_id,  oc.preparado_por_nombre,  oc.preparado_at)}
                  ${card('REVISADO POR',   'revisado',   oc.revisado_por_id,   oc.revisado_por_nombre,   oc.revisado_at)}
                  ${card('AUTORIZADO POR', 'autorizado', oc.autorizado_por_id, oc.autorizado_por_nombre, oc.autorizado_at)}
                </div>
              </div>
            `;
          })()}

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
    btns.push(`<button onclick="OC.aprobar(${oc.id_oc})" title="Marcar la OC como lista para aprobación. Pasa de BORRADOR a APROBADA y queda en revisión hasta que se le dé 'Aprobado para pago'." style="padding:10px 18px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">✓ Lista para aprobación</button>`);
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
  // PAGO = bandeja de Finanzas. Botón principal verde: Registrar pago (total o parcial).
  // Recepción NO va acá: vive en RECEPCION.
  if (oc.estado === 'PAGO') {
    btns.push(`<button onclick="OC.registrarPago(${oc.id_oc}, '${nroSafe}')" title="Registrar el pago al proveedor. Soporta pago total o parcial. Genera Tx EGRESO + movimiento bancario por el monto pagado. La OC pasa a RECEPCIÓN (con badge de saldo pendiente si fue parcial)." style="padding:10px 18px;background:#15803d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💰 Registrar pago</button>`);
  }
  // Importación: marcar OC ALMACEN como EN_TRANSITO (pagada pero la mercadería
  // aún no llegó). Solo aparece en APROBADA o PAGO, y solo para ALMACEN.
  // Recomendado para Perfotools cuando la mercadería viene de China — evita
  // recibir al inventario con costo crudo del proveedor.
  if (oc.tipo_oc === 'ALMACEN' && ['APROBADA', 'PAGO'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.marcarEnTransito(${oc.id_oc}, '${nroSafe}')" title="Marcar la mercadería como EN TRÁNSITO (importación pagada al proveedor, todavía no llegó al país). No entra al inventario hasta cerrar la importación con los gastos asociados (flete, desaduanaje, impuestos). Usá esto para importaciones de Perfotools." style="padding:10px 18px;background:#0ea5e9;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🚢 Marcar en tránsito</button>`);
  }
  // EN_TRANSITO → 2 acciones: Cerrar importación (recibe al inventario con
  // landed cost) o Desmarcar tránsito (volver a PAGO/APROBADA si fue error).
  if (oc.estado === 'EN_TRANSITO') {
    btns.push(`<button onclick="OC.cerrarImportacion(${oc.id_oc}, '${nroSafe}')" title="Cerrar la importación: suma los gastos satélite vinculados (flete, desaduanaje, impuestos), prorratea sobre los productos, y recibe al inventario con el costo landed correcto. Sólo se puede hacer una vez por importación." style="padding:10px 18px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🚛 Cerrar importación</button>`);
    btns.push(`<button onclick="OC.desmarcarTransito(${oc.id_oc}, '${nroSafe}')" title="Volver al estado anterior (PAGO/APROBADA). Útil si marcaste por error." style="padding:10px 18px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-weight:600">↩️ Desmarcar tránsito</button>`);
  }
  // Vincular/desvincular a OC madre — solo para OCs satélite (GENERAL típico:
  // flete, desaduanaje, impuestos). No para ALMACEN (esas son MADRES, no satélites).
  if (oc.tipo_oc !== 'ALMACEN' && !['ANULADA', 'TERMINADA', 'CERRADA_SIN_FACTURA'].includes(oc.estado)) {
    if (oc.oc_madre_id) {
      btns.push(`<button onclick="OC.desvincularMadre(${oc.id_oc}, '${nroSafe}')" title="Desvincular esta OC de su importación madre. Sus gastos dejarán de prorratearse a productos. Sólo se puede hacer si la madre todavía no cerró la importación." style="padding:10px 18px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-weight:600">🔗 Desvincular (madre #${oc.oc_madre_id})</button>`);
    } else {
      btns.push(`<button onclick="OC.vincularMadre(${oc.id_oc}, '${nroSafe}')" title="Vincular esta OC como satélite de una importación (OC ALMACEN en tránsito). Sus gastos van a formar parte del landed cost del producto." style="padding:10px 18px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-weight:600">🔗 Vincular a importación</button>`);
    }
  }
  // RECEPCION → permite registrar recepción de mercadería/servicio.
  // Solo si todavía hay algo pendiente de recibir (estado_recepcion !== RECIBIDO).
  // Las OCs GENERAL no-honorario no requieren este paso.
  if (oc.estado === 'RECEPCION' && oc.estado_recepcion !== 'RECIBIDO' && requiereRecepcion(oc)) {
    btns.push(`<button onclick="OC.recibir(${oc.id_oc})" title="${ttRecepcion}" style="padding:10px 18px;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${txtRecepcion}</button>`);
  }
  // En RECEPCION (sea recibido completo o no), si todavía hay saldo pendiente
  // de pago, ofrecer "Pagar saldo" para terminar de cerrar la fase.
  if (oc.estado === 'RECEPCION' && oc.estado_pago !== 'PAGADO') {
    btns.push(`<button onclick="OC.registrarPago(${oc.id_oc}, '${nroSafe}')" title="Pagar el saldo pendiente del proveedor." style="padding:10px 18px;background:#15803d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💰 Pagar saldo</button>`);
  }
  // En honorarios permitimos pagar directo desde APROBADA (atajo común:
  // contraté → trabajó → pagué, todo en el mismo día). Para no-honorarios
  // hay que pasar por PAGO formalmente.
  if (esHon && oc.estado === 'APROBADA') {
    btns.push(`<button onclick="OC.registrarPago(${oc.id_oc}, '${nroSafe}')" title="Pagar directamente al colaborador. Saltea PAGO/RECEPCIÓN (no aplican en honorarios). La OC pasa a 'Pagada · pend. RxH' hasta que entregue el Recibo por Honorarios." style="padding:10px 18px;background:#15803d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💰 Registrar pago</button>`);
  }
  // RECEPCION + recepción completa + pago completo → habilitar "Listo para facturas/RH"
  // (avanza a FACTURACIÓN sin generar comprobante; recién en esa columna se sube el documento).
  // En RECEPCIÓN ya NO mostramos "Recibí factura" ni "Subir factura": esas acciones viven en FACTURACIÓN.
  // Para OCs GENERAL no-honorario no se exige recepción (no aplica).
  const recepcionOK = oc.estado_recepcion === 'RECIBIDO' || !requiereRecepcion(oc);
  if (oc.estado === 'RECEPCION' && recepcionOK && oc.estado_pago === 'PAGADO') {
    btns.push(`<button onclick="OC.listoParaFacturar(${oc.id_oc})" title="Pago cerrado${requiereRecepcion(oc) ? ' y recepción cerrada' : ''}. Avanzá a FACTURACIÓN/RH para subir el comprobante del proveedor (factura o Recibo por Honorarios)." style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">📤 Listo para subir facturas/RH</button>`);
  }
  // Cerrar sin comprobante: aplica a GENERAL/SERVICIO en RECEPCIÓN (caja chica, sin factura).
  // ALMACEN siempre requiere comprobante porque genera stock valorizado.
  if (oc.estado === 'RECEPCION' && oc.estado_recepcion === 'RECIBIDO' && oc.tipo_oc !== 'ALMACEN') {
    btns.push(`<button onclick="OC.cerrarSinFactura(${oc.id_oc}, '${nroSafe}')" title="Cerrar la OC sin comprobante formal (compra al contado, caja chica, etc). Genera el Gasto contable pero deja la OC en bandeja 'Sin facturar' por si después llega el comprobante." style="padding:10px 18px;background:#ea580c;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🗂 Cerrar sin comprobante</button>`);
  }
  // FACTURACION con factura recibida pero sin pago → ofrecer Registrar pago para cerrar a TERMINADA.
  // Si pago ya estaba PAGADO el backend auto-avanza a TERMINADA al subir la factura
  // (FacturaOCService → checkAutoAvance), así que acá no aparece el botón.
  if (oc.estado === 'FACTURACION' && oc.estado_factura === 'FACTURADA' && oc.estado_pago !== 'PAGADO') {
    btns.push(`<button onclick="OC.registrarPago(${oc.id_oc}, '${nroSafe}')" title="Registrar el pago al proveedor de este comprobante. Genera el movimiento bancario y cierra la OC en 'Terminada (pago + comprobante)'." style="padding:10px 18px;background:#15803d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💰 Registrar pago</button>`);
  }
  // FACTURACION con pago registrado pero sin comprobante → ofrecer Recibí factura/RxH,
  // o "Dar por cerrada sin comprobante" si el proveedor nunca lo va a entregar (no aplica a ALMACEN).
  // El botón "Recibí factura" sólo se habilita si ya hay PDF adjunto: si no, se exige
  // subir primero el comprobante (evita registrar formal sin respaldo).
  if (oc.estado === 'FACTURACION' && oc.estado_factura === 'PENDIENTE' && oc.estado_pago === 'PAGADO') {
    const tienePDF = !!oc.factura_adjunta;
    if (tienePDF) {
      btns.push(`<button onclick="OC.facturar(${oc.id_oc})" title="Cargar el comprobante (factura, boleta o RxH) que llegó después del pago. Enriquece la Compra/Gasto provisorio con el N° de comprobante y cierra la OC en 'Terminada (pago + comprobante)'." style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${txtFactura}</button>`);
    } else {
      btns.push(`<button disabled title="Subí primero el PDF del comprobante con el botón '📄 Subir factura'. Cuando esté adjunto, este botón se habilita." style="padding:10px 18px;background:#e5e7eb;color:#9ca3af;border:1px solid #d1d5db;border-radius:6px;cursor:not-allowed;font-weight:600">${txtFactura} <span style="font-size:11px">(subí el PDF antes)</span></button>`);
    }
    if (oc.tipo_oc !== 'ALMACEN') {
      btns.push(`<button onclick="OC.cerrarPagaSinFactura(${oc.id_oc}, '${nroSafe}')" title="Dar por cerrada esta OC sin esperar comprobante (el proveedor no lo entregará). El Gasto provisorio que se creó al registrar el pago queda en BD sin nro de comprobante. ALMACEN no permite esta acción." style="padding:10px 18px;background:#ea580c;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">🗂 Cerrar sin comprobante</button>`);
    }
  }
  // OC cerrada sin factura — paridad con FACTURACION: subir PDF + Recibí factura.
  // El "Asociar factura tardía" legacy queda como atajo solo-datos sin PDF.
  if (oc.estado === 'CERRADA_SIN_FACTURA') {
    const tienePDF = !!oc.factura_adjunta;
    if (tienePDF) {
      btns.push(`<button onclick="OC.facturar(${oc.id_oc})" title="Confirmar la factura del proveedor con los datos del PDF subido. La OC pasa de 'Cerrada sin factura' a TERMINADA y se enriquece la Compra/Gasto con el N° de comprobante." style="padding:10px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">${txtFactura}</button>`);
    } else {
      btns.push(`<button disabled title="Subí primero el PDF del comprobante con el botón '📄 Subir factura'. Cuando esté adjunto, este botón se habilita." style="padding:10px 18px;background:#e5e7eb;color:#9ca3af;border:1px solid #d1d5db;border-radius:6px;cursor:not-allowed;font-weight:600">${txtFactura} <span style="font-size:11px">(subí el PDF antes)</span></button>`);
    }
    btns.push(`<button onclick="OC.asociarFactura(${oc.id_oc}, '${nroSafe}')" title="Atajo solo-datos: cargar N° y fecha del comprobante sin PDF (no recomendado — preferí 'Subir factura' para tener el respaldo)." style="padding:10px 18px;background:transparent;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;cursor:pointer;font-weight:600">🧾 Asociar sin PDF</button>`);
  }
  // Marcar crédito — solo en PAGO (Finanzas decide si pagar o postergar). En APROBADA no aplica.
  if (oc.estado === 'PAGO') {
    btns.push(`<button onclick="OC.marcarCredito(${oc.id_oc})" title="Registrar días de crédito y fecha de vencimiento para esta OC. Útil cuando el proveedor da plazo de pago." style="padding:10px 18px;background:#0891b2;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">💳 Marcar crédito</button>`);
  }
  // Subir factura del proveedor manualmente — en FACTURACION o CERRADA_SIN_FACTURA.
  // En RECEPCION recién se gestiona pago y recepción; los comprobantes viven aquí.
  // En CERRADA_SIN_FACTURA permite regularizar cuando el proveedor manda el PDF tarde.
  // Si ya hay una factura adjunta, el botón cambia de etiqueta a "Reemplazar".
  if (oc.estado === 'FACTURACION' || oc.estado === 'CERRADA_SIN_FACTURA') {
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
  // Mandar a borrador — disponible en estados activos (no BORRADOR, no ANULADA).
  // Hace la misma cascada que eliminar pero CONSERVA la OC con estado='BORRADOR'.
  // Útil para deshacer sin perder el correlativo. Solo GERENTE.
  if (esGerente && !['BORRADOR', 'ANULADA'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.mandarABorrador(${oc.id_oc}, '${nroSafe}')" title="Volver la OC a BORRADOR conservando el N° (solo GERENTE). Revierte cascada completa: Compras/Gastos, Tx caja, MovBancario, recepción de inventario, factura adjunta. La OC queda lista para re-editarse desde cero sin perder el correlativo." style="padding:10px 18px;background:transparent;color:#0891b2;border:1px solid #0891b2;border-radius:6px;cursor:pointer;font-weight:600">↩ Mandar a borrador</button>`);
  }
  // Eliminar definitivo — disponible en BORRADOR o ANULADA, solo GERENTE.
  // En otros estados se exige primero "Mandar a borrador" para forzar revisión
  // de los efectos de cascada antes del DELETE permanente.
  if (esGerente && ['BORRADOR', 'ANULADA'].includes(oc.estado)) {
    btns.push(`<button onclick="OC.eliminarOC(${oc.id_oc}, '${nroSafe}')" title="Eliminar permanente con cascada total (solo GERENTE). Borra OC + Compra/Gasto generado + Tx caja + Movimientos inventario + reverso de stock. Pide tipear el N° de OC para confirmar." style="padding:10px 18px;background:transparent;color:#7f1d1d;border:1px solid #7f1d1d;border-radius:6px;cursor:pointer;font-weight:600">🗑 Eliminar definitivo</button>`);
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
  const ok = await confirmarAccion({
    titulo: '✓ Lista para aprobación',
    mensaje: 'La OC pasará de <strong>BORRADOR</strong> a <strong>APROBADA</strong> y quedará en revisión hasta que se le dé "Aprobado para pago".<br><br>Si querés dejar contexto, usá el botón <strong>📝 Nota</strong>.',
    tipo: 'info',
    textoBoton: 'Sí, marcar como lista',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.aprobar(id, { comentario: '' });
    showSuccess('OC marcada como lista para aprobación');
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

async function listoParaFacturar(id) {
  const ok = await confirmarAccion({
    titulo: '📤 Listo para subir facturas/RH',
    mensaje: 'Pago y recepción están al 100%. La OC pasará de <strong>RECEPCIÓN</strong> a <strong>FACTURACIÓN/RH</strong>, donde recién se sube el comprobante (factura o Recibo por Honorarios). ¿Confirmás?',
    tipo: 'info',
    textoBoton: 'Sí, avanzar a Facturación/RH',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.listoParaFacturar(id);
    showSuccess('OC avanzada a FACTURACIÓN/RH');
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
    await api.ordenesCompra.agregarNota(id, texto);
    showSuccess('Nota guardada');
    // Recargar el modal para que la nota recién creada se vea sin cerrar/abrir.
    if (document.getElementById('oc-modal')?.innerHTML) {
      verOC(id);
    }
  } catch (e) {
    showError(e.message || 'Error al guardar nota');
  }
}

async function borrarNota(id_oc, id_nota) {
  const ok = await confirmarAccion({
    titulo: 'Borrar nota',
    mensaje: '¿Seguro que querés borrar esta nota? La acción no se puede deshacer.',
    tipo: 'danger',
    textoBoton: 'Borrar',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.borrarNota(id_oc, id_nota);
    showSuccess('Nota borrada');
    if (document.getElementById('oc-modal')?.innerHTML) {
      verOC(id_oc);
    }
  } catch (e) {
    showError(e.message || 'Error al borrar nota');
  }
}

/**
 * Elimina UNA factura individual (multi-factura, mig 064).
 * Recibe id_factura_oc (no id_oc). Si tras el borrado quedan 0 facturas,
 * la OC vuelve a estado_factura=PENDIENTE y retrocede a FACTURACION si
 * estaba TERMINADA. Si quedan ≥1 facturas, no toca estado.
 *
 * id_oc es opcional — solo lo usa el refresh contextual del modal de
 * detalle. Si no se pasa, hace refresh genérico del kanban.
 */
async function eliminarFactura(id_factura_oc, id_oc) {
  const ok = await confirmarAccion({
    titulo: '🗑️ Eliminar factura adjunta',
    mensaje: 'Vas a quitar esta factura. Si era la última de la OC, vuelve a estado_factura <strong>PENDIENTE</strong> y, si estaba en TERMINADA, retrocede a FACTURACION. Si hay otras facturas adjuntas, el estado de la OC no cambia.<br><br>El archivo en Cloudinary <strong>NO se borra</strong> (queda huérfano por seguridad/audit). Solo GERENTE.',
    tipo: 'danger',
    textoBoton: 'Sí, eliminar factura',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.eliminarFactura(id_factura_oc);
    showSuccess('Factura eliminada');
    // Refresh contextual: preservar el lugar donde estaba el usuario.
    if (id_oc && document.getElementById('oc-modal')?.innerHTML) {
      verOC(id_oc);
    } else if (window._logiRefrescarSinFactura &&
               document.getElementById('logi-panel-sin-factura')?.style.display !== 'none') {
      window._logiRefrescarSinFactura();
    } else {
      setTimeout(() => refreshOC(), 600);
    }
  } catch (e) {
    showError(e.message || 'Error al eliminar factura');
  }
}

/**
 * Firma un casillero (preparado / revisado / autorizado) en una OC en BORRADOR.
 * Si tras firmar se alcanza el umbral configurado en OCFirmasReglas, la OC
 * pasa automáticamente a APROBADA. Mig 065.
 */
async function firmar(id_oc, casillero) {
  try {
    const r = await api.ordenesCompra.firmar(id_oc, casillero);
    const msg = r.estado === 'PAGO'
      ? `✓ ${casillero.toUpperCase()} firmada — OC alcanzó ${r.firmas_actuales}/${r.firmas_requeridas} firmas y pasó a PAGO`
      : `✓ ${casillero.toUpperCase()} firmada (${r.firmas_actuales}/${r.firmas_requeridas} firmas)`;
    showSuccess(msg);
    if (document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
    else setTimeout(() => refreshOC(), 600);
  } catch (e) {
    showError(e.message || 'Error al firmar');
  }
}

async function desfirmar(id_oc, casillero) {
  const ok = await confirmarAccion({
    titulo: '🗑️ Quitar firma',
    mensaje: `Vas a quitar la firma del casillero <strong>${casillero.toUpperCase()}</strong>. Si la OC ya estaba en PAGO y al quitar caen las firmas debajo del umbral configurado, vuelve a APROBADA. Solo el firmante o un GERENTE pueden hacerlo.`,
    tipo: 'danger',
    textoBoton: 'Sí, quitar firma',
  });
  if (!ok) return;
  try {
    const r = await api.ordenesCompra.desfirmar(id_oc, casillero);
    const msg = r.estado === 'APROBADA' && r.casillero
      ? `Firma quitada — OC volvió a APROBADA (firmas insuficientes)`
      : `Firma quitada`;
    showSuccess(msg);
    if (document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
    else setTimeout(() => refreshOC(), 600);
  } catch (e) {
    showError(e.message || 'Error al quitar firma');
  }
}

/**
 * Adjunta el voucher (PDF/imagen de constancia bancaria) a un pago ya
 * registrado. Útil cuando la constancia llega después del pago en sí.
 * id_oc se usa solo para el refresh del modal — opcional.
 */
async function subirVoucherPago(id_pago, id_oc) {
  const file = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:white;border-radius:10px;padding:22px;width:420px;max-width:95vw">
        <h3 style="margin:0 0 12px;font-size:15px">📎 Adjuntar constancia de pago</h3>
        <p style="font-size:12px;color:#6b7280;margin:0 0 14px">Subí el PDF/imagen del voucher bancario de este pago. Se guarda en Cloudinary y aparece automáticamente en la rendición de gastos cuando se cree.</p>
        <input type="file" id="voucher-file" accept=".pdf,image/*" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
          <button data-cancel style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-weight:600">Cancelar</button>
          <button data-ok style="padding:9px 18px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Subir</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('[data-cancel]').onclick = () => { ov.remove(); resolve(null); };
    ov.querySelector('[data-ok]').onclick = () => {
      const f = ov.querySelector('#voucher-file').files[0];
      if (!f) { showError('Seleccioná un archivo'); return; }
      ov.remove();
      resolve(f);
    };
  });
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append('archivo', file);
    await api.ordenesCompra.subirVoucherPago(id_pago, fd);
    showSuccess('Constancia adjuntada');
    if (id_oc && document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
  } catch (e) {
    showError(e.message || 'Error subiendo voucher');
  }
}

async function eliminarVoucherPago(id_pago, id_oc) {
  const ok = await confirmarAccion({
    titulo: '🗑️ Quitar constancia',
    mensaje: 'Vas a quitar el archivo de voucher de este pago. El pago en sí <strong>no se borra</strong> — solo se desadjunta el archivo. Solo GERENTE.',
    tipo: 'danger',
    textoBoton: 'Sí, quitar',
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.eliminarVoucherPago(id_pago);
    showSuccess('Constancia removida');
    if (id_oc && document.getElementById('oc-modal')?.innerHTML) verOC(id_oc);
  } catch (e) {
    showError(e.message || 'Error quitando voucher');
  }
}

/**
 * Modal multi-factura: tras cada upload exitoso resetea el form y deja el
 * modal abierto para que el usuario suba otra factura sin re-abrir nada.
 * Una OC puede tener N facturas (mig 064) — proveedor que entrega en
 * varios comprobantes, RH multiples por servicio, etc. La lista de
 * facturas ya cargadas en esta sesión se ve abajo del form.
 */
async function subirFactura(id) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px;overflow:auto';
    ov.innerHTML = `
      <div style="background:white;border-radius:12px;width:520px;max-width:95vw;padding:24px">
        <h3 style="margin:0 0 4px;font-size:17px">📄 Subir factura del proveedor</h3>
        <div style="font-size:11px;color:#6b7280;margin-bottom:14px">Podés subir varias facturas a esta OC — cada upload agrega una nueva sin reemplazar las anteriores.</div>

        <div id="oc-fact-status" style="display:none;padding:10px 12px;border-radius:6px;margin-bottom:12px;font-size:13px"></div>

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
            <button type="button" data-cerrar style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-weight:600">Cerrar</button>
            <button type="submit" style="padding:9px 18px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">📤 Subir</button>
          </div>
        </form>

        <div id="oc-fact-lista" style="margin-top:18px;border-top:1px solid #e5e7eb;padding-top:14px">
          <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.3px;margin-bottom:8px" id="oc-fact-lista-h">FACTURAS YA SUBIDAS</div>
          <div id="oc-fact-lista-body" style="font-size:12px;color:#6b7280">Cargando…</div>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const form = ov.querySelector('#oc-form-subir-factura');
    const statusEl = ov.querySelector('#oc-fact-status');
    const listaBody = ov.querySelector('#oc-fact-lista-body');
    const listaHead = ov.querySelector('#oc-fact-lista-h');
    let huboCambios = false;

    const pintarStatus = (tipo, msg) => {
      const colores = {
        ok:    { bg: '#dcfce7', border: '#86efac', txt: '#166534' },
        error: { bg: '#fee2e2', border: '#fca5a5', txt: '#991b1b' },
      };
      const c = colores[tipo] || colores.ok;
      statusEl.style.cssText = `display:block;padding:10px 12px;border-radius:6px;margin-bottom:12px;font-size:13px;background:${c.bg};border:1px solid ${c.border};color:${c.txt}`;
      statusEl.textContent = msg;
      if (tipo === 'ok') setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
    };

    const recargarLista = async () => {
      try {
        const lista = await api.ordenesCompra.listarFacturas(id);
        listaHead.textContent = `FACTURAS YA SUBIDAS (${lista.length})`;
        if (!lista.length) {
          listaBody.innerHTML = `<div style="color:#9ca3af">Aún no hay facturas adjuntas a esta OC.</div>`;
          return;
        }
        listaBody.innerHTML = lista.map(f => {
          const fecha = (f.fecha_emision || '').slice(0, 10);
          const tienePDF = !!f.url_pdf;
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:5px;margin-bottom:6px">
              <div style="font-size:12px;color:#374151">
                <strong>${f.nro_comprobante}</strong>
                <span style="color:#6b7280;margin-left:6px">${fecha} · S/ ${Number(f.monto).toFixed(2)}</span>
              </div>
              <div style="display:flex;gap:6px">
                ${tienePDF ? `<button data-preview="${f.id_factura_oc}" data-nro="${f.nro_comprobante}" title="Ver el PDF/imagen adjunta" style="background:#16a34a;color:white;border:none;border-radius:4px;padding:4px 9px;cursor:pointer;font-size:11px">👁️</button>` : '<span style="color:#9ca3af;font-size:11px;padding:4px 6px">sin pdf</span>'}
                <button data-eliminar="${f.id_factura_oc}" title="Eliminar esta factura. Solo GERENTE." style="background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:4px 9px;cursor:pointer;font-size:11px">✕</button>
              </div>
            </div>
          `;
        }).join('');

        // Hookup botones
        listaBody.querySelectorAll('[data-preview]').forEach(btn => {
          btn.onclick = () => {
            const idF = btn.getAttribute('data-preview');
            const nro = btn.getAttribute('data-nro') || '';
            window.previewFacturaPorId?.(Number(idF), `Factura ${nro}`);
          };
        });
        listaBody.querySelectorAll('[data-eliminar]').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm('¿Eliminar esta factura? El archivo en Cloudinary queda huérfano.')) return;
            try {
              await api.ordenesCompra.eliminarFactura(Number(btn.getAttribute('data-eliminar')));
              huboCambios = true;
              await recargarLista();
              showSuccess('Factura eliminada');
            } catch (e) { showError(e.message || 'Error eliminando'); }
          };
        });
      } catch (e) {
        listaBody.innerHTML = `<div style="color:#dc2626">Error cargando lista: ${e.message || e}</div>`;
      }
    };

    recargarLista();

    const cerrar = () => {
      ov.remove();
      resolve(huboCambios);
      if (huboCambios) {
        // Refresh contextual — preserva el lugar donde se disparó la acción.
        if (document.getElementById('oc-modal')?.innerHTML) {
          verOC(id);
        } else if (window._logiRefrescarSinFactura &&
                   document.getElementById('logi-panel-sin-factura')?.style.display !== 'none') {
          window._logiRefrescarSinFactura();
        } else {
          setTimeout(() => refreshOC(), 600);
        }
      }
    };

    ov.querySelector('[data-cerrar]').onclick = cerrar;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const submitBtn = form.querySelector('button[type=submit]');
      submitBtn.disabled = true;
      const oldTxt = submitBtn.textContent;
      submitBtn.textContent = '⏳ Subiendo…';
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
        const nro = fd.get('nro_comprobante');
        huboCambios = true;
        pintarStatus('ok', `✓ Factura ${nro} subida. Podés cargar otra o cerrar.`);
        form.reset();
        // Re-poblamos fecha al día actual para no perder el default
        const today = new Date().toISOString().slice(0, 10);
        form.querySelector('input[name=fecha_emision]').value = today;
        form.querySelector('input[name=nro_comprobante]').focus();
        await recargarLista();
      } catch (err) {
        pintarStatus('error', err.message || 'Error al subir factura');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = oldTxt;
      }
    };

    // Pre-fill fecha al día actual para acelerar el primer upload
    form.querySelector('input[name=fecha_emision]').value = new Date().toISOString().slice(0, 10);
  });
}

async function recibir(id) {
  const oc = await api.ordenesCompra.get(id);
  if (!oc.detalle || oc.detalle.length === 0) {
    showError('La OC no tiene líneas para recibir');
    return;
  }
  // Guard: si la recepción ya está al 100%, no abrir el modal — no hay nada que registrar.
  // Esto evita duplicar registros cuando ya está todo recibido.
  if (oc.estado_recepcion === 'RECIBIDO') {
    showError('Esta OC ya tiene la recepción al 100%. No hay líneas pendientes.');
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
          <!-- Mig 070: panel de advertencia cuando una línea tiene variantes
               de la misma familia (ej: MIG vs FCAW). El logístico lo ve antes
               de confirmar la recepción para prevenir errores tipo "pensé que
               era MIG y era FCAW". Se popula async después del render. -->
          <div id="rec-warn-familia" style="display:none;background:#fef3c7;border:1px solid #fbbf24;color:#92400e;padding:10px 12px;border-radius:6px;font-size:12px;margin-bottom:12px;line-height:1.5"></div>
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

    // Mig 070 — chequear familias similares en background, sin bloquear el render.
    // Si alguna línea tiene id_item con variantes en la misma familia, mostrar
    // advertencia arriba para que el logístico confirme que es el correcto.
    (async () => {
      try {
        const lineasConItem = (oc.detalle || []).filter(l => l.id_item);
        if (!lineasConItem.length) return;
        const resultados = await Promise.all(
          lineasConItem.map(l =>
            api.inventory.getFamiliaSimilares(l.id_item)
              .then(sim => ({ linea: l, similares: sim || [] }))
              .catch(() => ({ linea: l, similares: [] }))
          )
        );
        const conRiesgo = resultados.filter(r => r.similares.length > 0);
        if (!conRiesgo.length) return;
        const warnBox = document.getElementById('rec-warn-familia');
        if (!warnBox) return;
        const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const items = conRiesgo.map(r => {
          const otros = r.similares.map(s => escAttr(s.nombre)).join(' · ');
          return `<li><strong>${escAttr(r.linea.descripcion || '(sin descripción)')}</strong> → variantes en almacén: ${otros}</li>`;
        }).join('');
        warnBox.innerHTML = `
          ⚠️ <strong>Atención antes de confirmar:</strong> hay líneas con variantes similares en el almacén.
          Asegurate de que el ítem físico que recibiste coincide con el que vas a registrar — un MIG no
          es lo mismo que un FCAW. Si te equivocaste, después podés corregirlo desde el kárdex pero requiere
          GERENTE.
          <ul style="margin:6px 0 0;padding-left:22px">${items}</ul>`;
        warnBox.style.display = 'block';
      } catch { /* fallo silencioso — la advertencia es ayuda, no requisito */ }
    })();

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
  // Defensa runtime: exigir PDF adjunto antes de registrar la factura formal.
  // El botón ya se renderiza disabled si no hay PDF, pero si se llama desde
  // un onclick legacy o la UI quedó stale, abortamos acá con mensaje claro.
  const adjunta = await api.ordenesCompra.getFactura(id).catch(() => null);
  if (!adjunta) {
    showError('Subí primero el PDF del comprobante con "📄 Subir factura". Después podés registrar la factura formal.');
    return;
  }
  // Reusamos los datos que el usuario ya cargó al subir el PDF (nro_comprobante
  // y fecha_emision viven en OrdenCompraFactura). No le pedimos otra vez lo
  // mismo. Si necesita corregirlos, reemplaza el PDF con "🔁 Reemplazar factura".
  const nro = String(adjunta.nro_comprobante || '').trim();
  const fecha = String(adjunta.fecha_emision || '').slice(0, 10);
  if (!nro || !fecha) {
    showError('La factura adjunta no tiene N° de comprobante o fecha. Reemplazá el PDF con esos datos completos.');
    return;
  }

  // Una vez FACTURADA, el botón Anular desaparece. Para corregir hay dos
  // caminos según ya entró al SIRE de SUNAT o no.
  const ok = await confirmarAccion({
    titulo: '🧾 Registrar factura del proveedor',
    mensaje:
      `Vas a registrar la factura <strong>${escapeHtml(nro)}</strong> (${fecha}) sobre esta OC.` +
      `<ul style="margin:8px 0 8px 20px;line-height:1.6;font-size:13px">` +
      `<li>La OC pasa a <strong>TERMINADA</strong> y queda registrada en Compras / Gastos para SUNAT.</li>` +
      `<li>El botón <strong>Anular</strong> desaparece (la factura ya entró al cálculo del IGV).</li>` +
      `<li>Si te equivocás: <strong>🗑 Eliminar</strong> sigue disponible para GERENTE — borra todo en cascada (Compra, Gasto, Tx, Inventario).</li>` +
      `<li>Si la factura ya fue declarada al <strong>SIRE de SUNAT</strong>, el ajuste correcto es pedirle al proveedor una <strong>Nota de Crédito</strong>.</li>` +
      `</ul>` +
      `¿Continuamos?`,
    tipo: 'warning',
    textoBoton: 'Sí, registrar factura',
  });
  if (!ok) return;
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
  let oc = null;
  try {
    [cuentas, oc] = await Promise.all([
      api.cobranzas.getCuentas(),
      api.ordenesCompra.get(id),
    ]);
  } catch (e) { return showError('No se pudieron cargar datos: ' + e.message); }
  const cuentasActivas = (cuentas || []).filter(c => c.activo !== false);
  if (cuentasActivas.length === 0) return showError('No hay cuentas bancarias activas. Configurá una en Finanzas → Cuentas.');
  if (!oc) return showError('OC no encontrada');

  const totalOC  = Number(oc.total) || 0;
  const yaPagado = Number(oc.monto_pagado || 0);
  const saldoPdte = Math.max(0, totalOC - yaPagado);
  const sym = oc.moneda === 'USD' ? '$' : 'S/';

  if (saldoPdte <= 0.01) {
    return showError('La OC ya está pagada al 100% — no hay saldo pendiente');
  }

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

        <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:8px 12px;border-radius:6px;margin-bottom:14px;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px;color:#374151">
          <div>Total OC: <strong>${sym} ${totalOC.toFixed(2)}</strong></div>
          <div>Ya pagado: <strong>${sym} ${yaPagado.toFixed(2)}</strong></div>
          <div style="grid-column:1/-1;color:#92400e">Saldo pendiente: <strong>${sym} ${saldoPdte.toFixed(2)}</strong></div>
        </div>

        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Cuenta de la que sale el pago *</label>
        <select id="rp-cuenta" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px">
          ${cuentasOpts}
        </select>
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Fecha del pago *</label>
        <input id="rp-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px">

        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Monto a pagar (${oc.moneda}) *</label>
        <input id="rp-monto" type="number" step="0.01" min="0.01" max="${saldoPdte.toFixed(2)}"
          value="${saldoPdte.toFixed(2)}"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:4px;font-family:monospace">
        <div style="font-size:10px;color:#6b7280;margin-bottom:12px">Default: saldo pendiente. Bajá el monto si solo pagás parcial.</div>

        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">N° operación (opcional)</label>
        <input id="rp-nro" placeholder="Ej. 12345678" maxlength="50"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px;font-family:monospace">
        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Observaciones (opcional)</label>
        <input id="rp-obs" placeholder="Comentario interno"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;margin-bottom:12px">

        <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">📎 Constancia bancaria (opcional, PDF/imagen)</label>
        <input id="rp-voucher" type="file" accept=".pdf,image/*"
          style="width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:12px">
        <div style="font-size:10px;color:#6b7280;margin-top:3px">Se guarda en Cloudinary y aparece en la rendición de gastos. Si no la tenés a mano, podés adjuntarla después desde el detalle de la OC.</div>
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
      const err = ov.querySelector('#rp-error');
      const id_cuenta = Number(ov.querySelector('#rp-cuenta').value);
      const fecha_pago = ov.querySelector('#rp-fecha').value;
      const monto = Number(ov.querySelector('#rp-monto').value);
      const nro_operacion = ov.querySelector('#rp-nro').value.trim() || undefined;
      const observaciones = ov.querySelector('#rp-obs').value.trim() || undefined;
      if (!id_cuenta || !fecha_pago) {
        err.textContent = 'Cuenta y fecha son obligatorias';
        err.style.display = 'block';
        return;
      }
      if (!Number.isFinite(monto) || monto <= 0) {
        err.textContent = 'El monto debe ser mayor a 0';
        err.style.display = 'block';
        return;
      }
      if (monto > saldoPdte + 0.01) {
        err.textContent = `El monto no puede exceder el saldo pendiente (${sym} ${saldoPdte.toFixed(2)})`;
        err.style.display = 'block';
        return;
      }
      const voucherFile = ov.querySelector('#rp-voucher').files[0] || null;
      close({ id_cuenta, fecha_pago, monto, nro_operacion, observaciones, voucherFile });
    };
  });
  if (!data) return;
  try {
    const { voucherFile, ...body } = data;
    const r = voucherFile
      ? await api.ordenesCompra.registrarPagoConVoucher(id, body, voucherFile)
      : await api.ordenesCompra.registrarPago(id, body);
    const cierraTotal = r.estado_pago === 'PAGADO';
    let msg;
    if (r.estado === 'TERMINADA') {
      msg = `OC ${nro} cerrada — pago total + factura registrados`;
    } else if (cierraTotal) {
      msg = `OC ${nro} pagada al 100% — esperando recepción/factura`;
    } else {
      msg = `OC ${nro}: pago parcial registrado · saldo pdte ${sym} ${Number(r.saldo_pendiente).toFixed(2)}`;
    }
    showSuccess(msg);
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
  const motivo = await promptModal({
    titulo: '⊘ Anular OC',
    label: 'Motivo de anulación (queda en el historial)',
    textarea: true,
    requerido: true,
  });
  if (!motivo) return;
  try {
    await api.ordenesCompra.anular(id, motivo);
    showSuccess('OC anulada');
    if (document.getElementById('oc-modal')?.innerHTML) {
      verOC(id);
    }
    setTimeout(() => (window.refreshModule || refreshOC)(), 600);
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
    // Cerrar el modal abierto (si lo hay) y refrescar contexto.
    const modal = document.getElementById('oc-modal');
    if (modal) modal.innerHTML = '';
    setTimeout(() => (window.refreshModule || refreshOC)(), 600);
  } catch (e) { showError(e.message); }
}

// Vuelve la OC a BORRADOR conservando el correlativo. Cascada reversiva:
// borra Compras/Gastos/Tx/MovBancario/Inventario/Factura adjunta, pero deja
// la OC en BORRADOR para re-editarse y rearmar.
async function mandarABorrador(id, nro) {
  const ok = await confirmarTexto({
    titulo: '↩ Mandar OC a borrador',
    mensaje:
      `Vas a deshacer la OC <strong>${nro}</strong> y conservarla en <strong>BORRADOR</strong> con su número intacto.` +
      `<ul style="margin:8px 0 8px 20px;line-height:1.6">` +
      `<li>Se revierten Compras / Gastos / Transacciones de caja / Movimientos bancarios</li>` +
      `<li>Se devuelve el stock al inventario (si era ALMACEN)</li>` +
      `<li>Se desadjunta la factura del proveedor (archivo en Cloudinary queda huérfano)</li>` +
      `<li>El correlativo <strong>${nro}</strong> se conserva — la OC queda lista para re-editar desde 0</li>` +
      `</ul>` +
      `Para confirmar, tipeá el número de OC exacto.`,
    textoRequerido: nro,
  });
  if (!ok) return;
  try {
    await api.ordenesCompra.mandarABorrador(id);
    showSuccess('OC mandada a BORRADOR — cascada revertida');
    // Refrescar la lista del kanban / "Sin facturar" detrás (con datos frescos
    // de BD) — sino la card se queda en la columna vieja aunque el estado en
    // BD ya cambió. Si hay modal abierto, también lo recargamos.
    if (window._logiRefrescarSinFactura &&
        document.getElementById('logi-panel-sin-factura')?.style.display !== 'none') {
      window._logiRefrescarSinFactura();
    } else {
      setTimeout(() => (window.refreshModule || refreshOC)(), 600);
    }
    if (document.getElementById('oc-modal')?.innerHTML) {
      verOC(id);
    }
  } catch (e) { showError(e.message || 'Error mandando a borrador'); }
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
            ${(() => {
              // Select real: el datalist viejo le pasaba al browser un dropdown
              // "filter as you type" que con un valor pre-cargado solo muestra
              // las opciones que matchean — confunde porque parece que hay 1
              // sola opción. Acá ofrecemos la lista completa siempre, y si el
              // CC actual no está en el maestro activo lo pinneamos arriba.
              const ccActualEnLista = (centros || []).some(c => c.nombre === oc.centro_costo);
              const pinHTML = oc.centro_costo && !ccActualEnLista
                ? `<option value="${v(oc.centro_costo)}" selected>${v(oc.centro_costo)} (no activo)</option>`
                : '';
              const opts = (centros || []).map(c =>
                `<option value="${v(c.nombre)}" ${c.nombre === oc.centro_costo ? 'selected' : ''}>${v(c.nombre)} · ${v(c.tipo)}</option>`
              ).join('');
              return `<select id="em-cc" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;background:#fff">
                ${pinHTML}
                <option value="">— Sin centro de costo —</option>
                ${opts}
              </select>`;
            })()}
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
    const necesitaProv = !_proveedores  || _proveedores.length === 0;
    const necesitaSrv  = !_servicios    || _servicios.length === 0;
    const necesitaCfg  = !_cfg          || Object.keys(_cfg).length === 0;
    const necesitaCC   = !_centrosCosto || _centrosCosto.length === 0;
    if (necesitaProv || necesitaSrv || necesitaCfg || necesitaCC) {
      const [provs, srvs, cfg, ccs] = await Promise.all([
        necesitaProv ? api.purchases.getProveedores().catch(() => []) : Promise.resolve(_proveedores),
        necesitaSrv  ? api.services.getServiciosActivos().catch(() => []) : Promise.resolve(_servicios),
        necesitaCfg  ? api.config.get().catch(() => ({ aplica_igv: 1, tasa_igv: 18, monto_limite_sin_aprobacion: 5000, permitir_correlativo_manual: false })) : Promise.resolve(_cfg),
        necesitaCC   ? api.centrosCosto.list(true).catch(() => []) : Promise.resolve(_centrosCosto),
      ]);
      _proveedores  = provs;
      _servicios    = srvs;
      _cfg          = cfg;
      _centrosCosto = ccs;
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
          <div style="grid-column:span 2"><label>Centro de costo * ${tip('Categoría contable del gasto. Elegí uno de la lista — para crear uno nuevo andá a Logística → Centros de Costo.')}</label>
            ${(() => {
              // El select sólo lista CCs activos del maestro. En modo edit, si
              // el CC de la OC original no está en la lista (ej: CC desactivado
              // después o un huérfano histórico), lo agregamos como option
              // "pinneada" para no romper la edición.
              const opts = (_centrosCosto || []).map(c =>
                `<option value="${v(c.nombre)}" ${sel(centroCosto, c.nombre)}>${v(c.nombre)} · ${v(c.tipo)}</option>`
              );
              const ccActualEnLista = (_centrosCosto || []).some(c => c.nombre === centroCosto);
              if (esEdit && centroCosto && !ccActualEnLista) {
                opts.unshift(`<option value="${v(centroCosto)}" selected>${v(centroCosto)} (no activo)</option>`);
              }
              return `<select name="centro_costo" required>
                <option value="">— Selecciona centro de costo —</option>
                ${opts.join('')}
              </select>`;
            })()}
          </div>
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

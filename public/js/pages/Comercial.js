import { api } from '../services/api.js';
import { tip } from '../services/ui.js';
import { pillCotizacionEstado } from '../components/Pill.js';
import { kpiCard as kpiCardEnt } from '../components/KpiCard.js';

// ── Marca config (UI): logo, color, moneda por defecto ──────────
const MARCAS = {
  METAL: {
    label:       'Metal Engineers',
    moneda:      'PEN',
    color:       '#000000',
    logoHTML:    `<img src="/img/logo-metal.png" alt="Metal Engineers" style="height:38px">`,
    badgeHTML:   `<span style="background:#000;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">METAL</span>`,
    sufijo:      'MN',
  },
  PERFOTOOLS: {
    label:       'Perfotools',
    moneda:      'USD',
    color:       '#dc2626',
    logoHTML:    `<img src="/img/logo-perfotools.png" alt="Perfotools" style="height:42px"
                    onerror="this.replaceWith(Object.assign(document.createElement('div'),{innerHTML:'<span style=\\'font-weight:800;color:#dc2626;letter-spacing:1px\\'>PERFOTOOLS</span>'}))">`,
    badgeHTML:   `<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">PERFOTOOLS</span>`,
    sufijo:      'ME',
  },
};

const ESTADOS_COLOR = {
  EN_PROCESO:         { bg: '#6b7280', label: 'EN PROCESO' },
  ENVIADA:            { bg: '#3b82f6', label: 'ENVIADA' },
  APROBADA:           { bg: '#22c55e', label: 'APROBADA' },
  NO_APROBADA:        { bg: '#f97316', label: 'NO APROBADA' },
  RECHAZADA:          { bg: '#ef4444', label: 'RECHAZADA' },
  TERMINADA:          { bg: '#8b5cf6', label: 'TERMINADA' },
  A_ESPERA_RESPUESTA: { bg: '#eab308', label: 'EN ESPERA' },
  ANULADA:            { bg: '#374151', label: 'ANULADA' },
};

// Pill semántico enterprise (delegado al helper Pill.js)
// La constante ESTADOS_COLOR sigue usándose en el dashboard interno
// (barras horizontales por estado) — no se borra.
const estadoBadge = (estado) => pillCotizacionEstado(estado);

const fPEN = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0);
const fUSD = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);

const ESTADOS_EDITABLES = ['EN_PROCESO', 'A_ESPERA_RESPUESTA'];

// ── Multiline field helpers (Condiciones Generales) ──────────────
// Cada campo permite agregar/quitar líneas. Al submit se concatenan
// con \n y se guardan en el input hidden con name="<field>".
function _multilineLineHTML(value = '', placeholder = '') {
  const safeVal = String(value || '').replace(/"/g, '&quot;');
  return `
    <div class="multiline-line" style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <input class="multiline-input" value="${safeVal}" placeholder="${placeholder}"
        style="flex:1;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px">
      <button type="button" class="multiline-remove" title="Quitar línea"
        style="width:28px;height:32px;background:transparent;border:1px solid var(--border-light);border-radius:6px;cursor:pointer;color:#999;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center">×</button>
    </div>
  `;
}

function multilineAddLine(fieldEl, value = '') {
  const linesEl = fieldEl.querySelector('.multiline-lines');
  const placeholder = fieldEl.querySelector('.multiline-add')?.dataset.placeholder || '';
  linesEl.insertAdjacentHTML('beforeend', _multilineLineHTML(value, placeholder));
  multilineSync(fieldEl);
}

function multilineSync(fieldEl) {
  const inputs = fieldEl.querySelectorAll('.multiline-input');
  const values = Array.from(inputs).map(i => i.value).filter(v => v.trim() !== '');
  fieldEl.querySelector('input[type=hidden]').value = values.join('\n');
}

function multilinePrefill(fieldEl, rawValue) {
  const linesEl = fieldEl.querySelector('.multiline-lines');
  linesEl.innerHTML = '';
  const placeholder = fieldEl.querySelector('.multiline-add')?.dataset.placeholder || '';
  const lines = String(rawValue || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) {
    linesEl.insertAdjacentHTML('beforeend', _multilineLineHTML('', placeholder));
  } else {
    lines.forEach(v => linesEl.insertAdjacentHTML('beforeend', _multilineLineHTML(v, placeholder)));
  }
  multilineSync(fieldEl);
}

// Wire global de eventos para todos los multiline-field del form.
// Se llama una sola vez por form al render.
function setupMultilineHandlers(formEl) {
  // Inicializar cada field con 1 línea vacía por default
  formEl.querySelectorAll('.multiline-field').forEach(field => {
    if (field.querySelectorAll('.multiline-line').length === 0) {
      multilineAddLine(field);
    }
  });

  // Click en + agrega línea
  formEl.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.multiline-add');
    if (addBtn) {
      const field = addBtn.closest('.multiline-field');
      multilineAddLine(field);
      // foco en la nueva línea
      const lines = field.querySelectorAll('.multiline-input');
      lines[lines.length - 1]?.focus();
      return;
    }
    const removeBtn = e.target.closest('.multiline-remove');
    if (removeBtn) {
      const field = removeBtn.closest('.multiline-field');
      const allLines = field.querySelectorAll('.multiline-line');
      // Si solo queda 1, no permitir borrar — vaciar el input
      if (allLines.length === 1) {
        field.querySelector('.multiline-input').value = '';
      } else {
        removeBtn.closest('.multiline-line').remove();
      }
      multilineSync(field);
    }
  });

  // Cualquier cambio en inputs de multiline → sync
  formEl.addEventListener('input', (e) => {
    if (e.target.classList?.contains('multiline-input')) {
      const field = e.target.closest('.multiline-field');
      multilineSync(field);
    }
  });
}

// ── Modal de confirmación reutilizable ──────────────────────────
function confirmarAccion({ titulo, mensaje, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tipo = 'warning' }) {
  return new Promise((resolve) => {
    const colores = {
      warning: { icono: '⚠️', color: '#f59e0b', btn: '#f59e0b' },
      danger:  { icono: '🚨', color: '#dc2626', btn: '#dc2626' },
      info:    { icono: 'ℹ️', color: '#3b82f6', btn: '#3b82f6' },
    }[tipo] || { icono: '⚠️', color: '#f59e0b', btn: '#f59e0b' };

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;max-width:440px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
        <div style="padding:18px 22px;border-top:4px solid ${colores.color}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="font-size:28px">${colores.icono}</div>
            <h3 style="margin:0;font-size:16px;color:#111">${titulo}</h3>
          </div>
          <div style="font-size:13px;color:#444;line-height:1.5;white-space:pre-wrap">${mensaje}</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <button id="cfm-cancel" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:13px">${cancelLabel}</button>
          <button id="cfm-ok" style="padding:8px 16px;border:none;background:${colores.btn};color:#fff;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#cfm-ok').onclick = () => close(true);
    ov.querySelector('#cfm-cancel').onclick = () => close(false);
    ov.onclick = (e) => { if (e.target === ov) close(false); };
  });
}

// ── Modal de confirmación por texto (acción destructiva) ────────
function confirmarTexto({ titulo, mensaje, textoRequerido, confirmLabel = 'Borrar todo', tipo = 'danger' }) {
  return new Promise((resolve) => {
    const colores = tipo === 'danger'
      ? { icono: '🚨', color: '#dc2626' }
      : { icono: '⚠️', color: '#f59e0b' };

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;max-width:480px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
        <div style="padding:20px 22px;border-top:4px solid ${colores.color}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div style="font-size:30px">${colores.icono}</div>
            <h3 style="margin:0;font-size:16px;color:#111">${titulo}</h3>
          </div>
          <div style="font-size:13px;color:#444;line-height:1.5;white-space:pre-wrap;margin-bottom:14px">${mensaje}</div>
          <div style="background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:6px;margin-bottom:10px">
            <div style="font-size:12px;color:#991b1b;margin-bottom:6px">Escribe <strong>${textoRequerido}</strong> para confirmar:</div>
            <input id="cfm-txt-input" autocomplete="off"
              style="width:100%;padding:8px;border:1px solid #fca5a5;border-radius:4px;font-size:13px;font-family:monospace">
            <div id="cfm-txt-err" style="font-size:11px;color:#dc2626;margin-top:4px;min-height:14px"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <button id="cfm-txt-cancel" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="cfm-txt-ok" disabled style="padding:8px 16px;border:none;background:#9ca3af;color:#fff;border-radius:5px;cursor:not-allowed;font-size:13px;font-weight:600">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    const input = ov.querySelector('#cfm-txt-input');
    const btnOk = ov.querySelector('#cfm-txt-ok');
    const err   = ov.querySelector('#cfm-txt-err');

    input.focus();
    input.oninput = () => {
      const match = input.value === textoRequerido;
      if (match) {
        btnOk.disabled = false;
        btnOk.style.background = colores.color;
        btnOk.style.cursor = 'pointer';
        err.textContent = '';
      } else {
        btnOk.disabled = true;
        btnOk.style.background = '#9ca3af';
        btnOk.style.cursor = 'not-allowed';
        err.textContent = input.value ? `Debe coincidir exactamente con "${textoRequerido}"` : '';
      }
    };
    btnOk.onclick = () => { if (input.value === textoRequerido) close(true); };
    ov.querySelector('#cfm-txt-cancel').onclick = () => close(false);
    ov.onclick = (e) => { if (e.target === ov) close(false); };
  });
}

// ── Template del formulario (parametrizado por marca) ───────────
function formNueva(marca, tcHoy, opts = {}) {
  const cfg    = MARCAS[marca];
  const esUSD  = marca === 'PERFOTOOLS';
  const curSym = esUSD ? '$' : 'S/';
  const idp    = opts.idp || marca.toLowerCase(); // prefijo ids únicos
  const isEdit = !!opts.editData;
  const titulo = isEdit
    ? `Editar cotización · ${opts.editData.nro_cotizacion || cfg.label}`
    : `Nueva cotización · ${cfg.label}`;
  const btnLabel = isEdit ? 'Guardar cambios' : `Generar Cotización ${cfg.sufijo}`;

  return `
    <div class="card" style="border-top:4px solid ${cfg.color}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="margin:0;font-weight:600;font-size:15px">${titulo}</h3>
        ${cfg.logoHTML}
      </div>

      <form id="form-cot-${idp}" data-marca="${marca}" style="display:flex;flex-direction:column;gap:9px">

        <!-- Datos cliente -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="grid-column:span 2">
            <label style="font-size:11px;color:var(--text-secondary)">Razón Social del Cliente *</label>
            <input name="cliente" required list="cli-${idp}"
              style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light)">
            <datalist id="cli-${idp}">
              <option value="DCC S.A.C."><option value="OTOYA S.A.C."><option value="PSV S.A.C.">
              <option value="PDI S.A.C."><option value="SAMAYCA S.A.C."><option value="PROMAFA S.A.C.">
              <option value="VENTURO S.A.C.">
            </datalist>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Atención a</label>
            <input name="atencion" style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light)">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Teléfono</label>
            <input name="telefono" style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light)">
          </div>
          <div style="grid-column:span 2">
            <label style="font-size:11px;color:var(--text-secondary)">Correo</label>
            <input name="correo" type="email" style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light)">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Proyecto</label>
            <input name="proyecto" style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light)">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Ref. (descripción corta)</label>
            <input name="ref" style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light)">
          </div>
        </div>

        <!-- Moneda / TC -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Moneda</label>
            <input value="${esUSD ? '$ Dólares (USD)' : 'S/ Soles (PEN)'}" disabled
              style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light);background:#f3f4f6">
            <input type="hidden" name="moneda" value="${cfg.moneda}">
          </div>
          ${esUSD ? `
          <div>
            <label style="font-size:11px;color:var(--text-secondary)">Tipo de Cambio ${tip('Tipo de cambio venta SBS del día. Convierte el monto USD a PEN para cálculos internos. Auto-completado con el TC oficial pero podés editarlo.')}</label>
            <input name="tipo_cambio" id="tc-${idp}" type="number" step="0.0001"
              value="${tcHoy.valor_venta || 1}"
              style="width:100%;padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light)">
            <span style="font-size:10px;color:var(--text-secondary)">SBS ${tcHoy.es_hoy ? 'hoy' : (tcHoy.fecha || '')}: ${tcHoy.valor_venta}</span>
          </div>
          ` : `<input type="hidden" name="tipo_cambio" value="1">`}
        </div>

        <!-- IGV toggle -->
        <div style="background:var(--bg-app);padding:9px;border-radius:4px">
          <label style="font-size:12px;font-weight:bold;display:flex;gap:8px;align-items:center">
            <input type="checkbox" name="aplica_igv" id="igv-${idp}"> + 18% IGV Tributario
            ${tip('Sumá 18% al monto base si la cotización lleva IGV. Para Régimen RMT/General típicamente sí. Para NRUS no aplica.')}
          </label>
        </div>

        <!-- Condiciones generales -->
        <div style="background:#f8f9fa;padding:12px;border-radius:6px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">
            Condiciones Generales
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Los precios incluyen</label>
              <div class="multiline-field" data-field="precios_incluyen" data-idp="${idp}">
                <input type="hidden" name="precios_incluyen">
                <div class="multiline-lines"></div>
                <button type="button" class="multiline-add" data-placeholder="Mano de obra, materiales…"
                  style="margin-top:4px;font-size:11px;padding:4px 10px;background:transparent;border:1px dashed var(--border-light);border-radius:6px;cursor:pointer;color:var(--text-secondary)">+ Agregar línea</button>
              </div>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Forma de Pago</label>
              <div class="multiline-field" data-field="forma_pago" data-idp="${idp}">
                <input type="hidden" name="forma_pago">
                <div class="multiline-lines"></div>
                <button type="button" class="multiline-add" data-placeholder="100% adelanto con OC…"
                  style="margin-top:4px;font-size:11px;padding:4px 10px;background:transparent;border:1px dashed var(--border-light);border-radius:6px;cursor:pointer;color:var(--text-secondary)">+ Agregar línea</button>
              </div>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Validez de la Oferta ${tip('Cuánto tiempo se mantienen los precios cotizados. Pasado este plazo, la oferta debería re-cotizarse. Aparece en el PDF.')}</label>
              <input name="validez_oferta" placeholder="7 (siete) días calendarios"
                style="width:100%;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Plazo de Entrega ${tip('Cuánto demora la entrega del trabajo/herramienta desde la aprobación. Aparece en el PDF.')}</label>
              <input name="plazo_entrega" placeholder="16 Días hábiles"
                style="width:100%;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Lugar de Entrega de Herramientas</label>
              <input name="lugar_entrega" placeholder="En el taller de Metal Engineers – Puente Piedra"
                style="width:100%;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Lugar de Trabajo de Inspección</label>
              <input name="lugar_trabajo" placeholder="En el taller del cliente"
                style="width:100%;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px">
            </div>
          </div>
        </div>

        <!-- Recordatorio: cuenta bancaria y firma se editan en Configuración -->
        <div style="background:#eef4ff;border:1px solid #93c5fd;padding:10px 12px;border-radius:6px;font-size:11px;color:#1e3a8a">
          🏦 La cuenta bancaria y la firma se toman automáticamente de
          <a href="javascript:void(0)" onclick="window.navigate('configuracion-comercial')" style="color:#1d4ed8;text-decoration:underline">Configuración PDF</a>.
        </div>

        <textarea name="comentarios" placeholder="Comentarios internos (no aparece en el PDF)..." rows="2"
          style="padding:9px;border-radius:var(--radius-sm);border:1px solid var(--border-light);resize:vertical;font-family:inherit"></textarea>

        <!-- Líneas de detalle -->
        <div style="background:#f8f9fa;padding:12px;border-radius:6px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">ÍTEMS COTIZADOS</div>
          <div id="items-${idp}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
            <div style="color:var(--text-secondary);font-size:11px;text-align:center;padding:6px">Sin ítems</div>
          </div>

          <div style="border:1px dashed #d1d5db;padding:10px;border-radius:6px;background:#fff">
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Agregar ítem</div>
            <div id="edit-banner-${idp}" style="display:none;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#fffbeb;border:1px solid #f59e0b;border-radius:5px;margin-bottom:8px">
              <div style="font-size:12px;color:#92400e;font-weight:600">
                ✎ Estás editando un ítem existente
              </div>
              <button type="button" onclick="window.__cancelarEdit_${idp}()"
                style="padding:4px 10px;font-size:11px;background:#fff;border:1px solid #f59e0b;color:#92400e;border-radius:4px;cursor:pointer;font-weight:600">
                Cancelar edición
              </button>
            </div>
            <div id="form-linea-${idp}" style="display:flex;flex-direction:column;gap:6px">
              <input name="descripcion" placeholder="Descripción (obligatoria)*"
                style="padding:7px;border:1px solid #ddd;border-radius:4px;font-size:12px">
              <textarea name="subdescripcion" placeholder="Sub-descripción (multilínea, opcional)" rows="2"
                style="padding:7px;border:1px solid #ddd;border-radius:4px;font-size:12px;resize:vertical;font-family:inherit"></textarea>
              <textarea name="notas" placeholder="Notas / exclusiones del ítem (opcional)" rows="2"
                style="padding:7px;border:1px solid #ddd;border-radius:4px;font-size:12px;resize:vertical;font-family:inherit"></textarea>
              <input type="hidden" name="foto_url">
              <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
                <button type="button" id="btn-foto-${idp}"
                  style="padding:7px 12px;background:#fff;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px">
                  📷 Subir foto
                </button>
                <input type="file" id="file-foto-${idp}" accept="image/*" style="display:none">
                <span id="foto-status-${idp}" style="font-size:11px;color:var(--text-secondary)">Ninguna foto seleccionada</span>
                <img id="foto-preview-${idp}" style="display:none;width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb">
                <button type="button" id="foto-clear-${idp}" style="display:none;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px">✕</button>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:5px;align-items:end">
                <input name="unidad" placeholder="Unidad"
                  style="padding:7px;border:1px solid #ddd;border-radius:4px;font-size:12px;min-width:0">
                <input name="cantidad" type="number" step="0.001" min="0.001" placeholder="Cant.*"
                  style="padding:7px;border:1px solid #ddd;border-radius:4px;font-size:12px;min-width:0">
                <input name="precio_unitario" type="number" step="0.01" min="0" placeholder="P. Unit. (${curSym})*"
                  style="padding:7px;border:1px solid #ddd;border-radius:4px;font-size:12px;min-width:0">
                <button type="button" id="btn-add-${idp}"
                  style="padding:7px 14px;background:${cfg.color};color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap">
                  + Agregar
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Totales -->
        <div style="display:flex;gap:12px;justify-content:flex-end;background:#f0fdf4;padding:10px;border-radius:6px;font-size:13px;font-weight:600">
          <span>Sub: <span id="res-sub-${idp}">${curSym} 0.00</span></span>
          <span>IGV: <span id="res-igv-${idp}">S/ 0.00</span></span>
          <span style="color:${cfg.color}">Total: <span id="res-total-${idp}">S/ 0.00</span></span>
        </div>

        <button type="submit"
          style="padding:12px;border:none;background:${cfg.color};color:#fff;border-radius:var(--radius-sm);cursor:pointer;font-weight:bold;font-size:14px;margin-top:4px">
          ${btnLabel}
        </button>
      </form>
    </div>
  `;
}

// ── Bind de lógica del formulario (una marca) ───────────────────
function bindForm(marca, opts = {}) {
  const idp     = opts.idp || marca.toLowerCase();
  const esUSD   = marca === 'PERFOTOOLS';
  const curSym  = esUSD ? '$' : 'S/';
  const fCur    = esUSD ? fUSD : fPEN;
  const editData = opts.editData || null;
  const onDone   = opts.onDone || (() => setTimeout(() => window.navigate('comercial'), 1200));
  const lineas  = editData?.detalles
    ? editData.detalles.map(d => ({
        descripcion:     d.descripcion,
        subdescripcion:  d.subdescripcion || undefined,
        notas:           d.notas          || undefined,
        foto_url:        d.foto_url       || undefined,
        unidad:          d.unidad         || undefined,
        cantidad:        Number(d.cantidad),
        precio_unitario: Number(d.precio_unitario),
      }))
    : [];

  const el = (id) => document.getElementById(id);

  const renderItems = () => {
    const box = el(`items-${idp}`);
    if (!box) return;
    if (lineas.length === 0) {
      box.innerHTML = `<div style="color:var(--text-secondary);font-size:11px;text-align:center;padding:6px">Sin ítems</div>`;
    } else {
      box.innerHTML = lineas.map((l, i) => {
        const s = Number(l.cantidad) * Number(l.precio_unitario);
        const editing = editingItemIdx === i;
        return `
          <div style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:8px;padding:8px;background:${editing ? '#fffbeb' : '#fff'};border:1px solid ${editing ? '#f59e0b' : '#e5e7eb'};border-radius:5px;align-items:center">
            ${l.foto_url
              ? `<img src="${l.foto_url}" style="width:42px;height:42px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb" onerror="this.style.display='none'">`
              : `<div style="width:42px;height:42px;background:#f3f4f6;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:10px">sin foto</div>`}
            <div style="min-width:0">
              <div style="font-size:12px;font-weight:600">${l.descripcion}${editing ? ' <span style="color:#d97706;font-weight:600">· editando…</span>' : ''}</div>
              ${l.subdescripcion ? `<div style="font-size:11px;color:#4b5563;white-space:pre-wrap">${l.subdescripcion}</div>` : ''}
              ${l.notas ? `<div style="font-size:10px;color:#b45309;font-style:italic;white-space:pre-wrap">${l.notas}</div>` : ''}
              <div style="font-size:10px;color:var(--text-secondary)">${l.cantidad} ${l.unidad || ''} × ${fCur(l.precio_unitario)}</div>
            </div>
            <div style="font-weight:700;font-size:12px">${fCur(s)}</div>
            <button type="button" onclick="window.__editLinea_${idp}(${i})"
              title="Editar este ítem"
              style="background:none;border:1px solid #d1d5db;color:#3b82f6;cursor:pointer;font-size:12px;padding:2px 7px;border-radius:4px">✎</button>
            <button type="button" onclick="window.__removeLinea_${idp}(${i})"
              title="Quitar este ítem"
              style="background:none;border:1px solid #fca5a5;color:#dc2626;cursor:pointer;font-size:12px;padding:2px 7px;border-radius:4px">✕</button>
          </div>`;
      }).join('');
    }
    const subOrig = lineas.reduce((a, l) => a + Number(l.cantidad) * Number(l.precio_unitario), 0);
    const tc      = esUSD ? (Number(el(`tc-${idp}`)?.value) || 1) : 1;
    const subPEN  = esUSD ? subOrig * tc : subOrig;
    const aplica  = el(`igv-${idp}`)?.checked;
    const igv     = aplica ? subPEN * 0.18 : 0;

    if (el(`res-sub-${idp}`))   el(`res-sub-${idp}`).textContent   = fCur(subOrig);
    if (el(`res-igv-${idp}`))   el(`res-igv-${idp}`).textContent   = fPEN(igv);
    if (el(`res-total-${idp}`)) el(`res-total-${idp}`).textContent = fPEN(subPEN + igv);
  };

  // Estado de edición del item dentro del form de "Agregar ítem".
  // null = modo "agregar nuevo". Número = índice del ítem que se está editando.
  let editingItemIdx = null;

  window[`__removeLinea_${idp}`] = (i) => {
    // Si estaba editando este mismo, salir del modo edit
    if (editingItemIdx === i) cancelarEdicionItem();
    else if (editingItemIdx !== null && i < editingItemIdx) editingItemIdx--; // ajustar índice
    lineas.splice(i, 1);
    renderItems();
  };

  // Setea el form de "Agregar ítem" en modo edit con los datos del item i
  window[`__editLinea_${idp}`] = (i) => {
    const l = lineas[i];
    if (!l) return;
    const formLinea = el(`form-linea-${idp}`);
    if (!formLinea) return;
    const q = (name) => formLinea.querySelector(`[name="${name}"]`);

    if (q('descripcion'))     q('descripcion').value     = l.descripcion     || '';
    if (q('subdescripcion'))  q('subdescripcion').value  = l.subdescripcion  || '';
    if (q('notas'))           q('notas').value           = l.notas           || '';
    if (q('unidad'))          q('unidad').value          = l.unidad          || '';
    if (q('cantidad'))        q('cantidad').value        = l.cantidad        ?? '';
    if (q('precio_unitario')) q('precio_unitario').value = l.precio_unitario ?? '';
    if (q('foto_url'))        q('foto_url').value        = l.foto_url        || '';

    // Si tenía foto, preview
    if (l.foto_url) {
      if (prevFoto)   { prevFoto.src = l.foto_url; prevFoto.style.display = 'inline-block'; }
      if (clearFoto)  { clearFoto.style.display = 'inline-block'; }
      if (statusFoto) { statusFoto.textContent = '✓ Foto cargada'; statusFoto.style.color = '#16a34a'; }
      if (btnFoto)    { btnFoto.innerHTML = '📷 Cambiar'; }
    } else {
      resetFoto();
    }

    editingItemIdx = i;
    if (btnAdd)     btnAdd.innerHTML = '💾 Guardar cambios';
    const banner = el(`edit-banner-${idp}`);
    if (banner) banner.style.display = 'flex';

    renderItems();
    // Llevar el form a la vista
    formLinea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelarEdicionItem = () => {
    editingItemIdx = null;
    const formLinea = el(`form-linea-${idp}`);
    if (formLinea) {
      ['descripcion','subdescripcion','notas','unidad','cantidad','precio_unitario','foto_url']
        .forEach(n => { const e = formLinea.querySelector(`[name="${n}"]`); if (e) e.value = ''; });
    }
    resetFoto();
    if (btnAdd) btnAdd.innerHTML = '+ Agregar';
    const banner = el(`edit-banner-${idp}`);
    if (banner) banner.style.display = 'none';
    renderItems();
  };
  window[`__cancelarEdit_${idp}`] = cancelarEdicionItem;

  // Upload de foto a Cloudinary
  const btnFoto    = el(`btn-foto-${idp}`);
  const inpFoto    = el(`file-foto-${idp}`);
  const statusFoto = el(`foto-status-${idp}`);
  const prevFoto   = el(`foto-preview-${idp}`);
  const clearFoto  = el(`foto-clear-${idp}`);

  const resetFoto = () => {
    if (inpFoto) inpFoto.value = '';
    const fotoHidden = document.querySelector(`#form-linea-${idp} [name="foto_url"]`);
    if (fotoHidden) fotoHidden.value = '';
    if (statusFoto) { statusFoto.textContent = 'Ninguna foto seleccionada'; statusFoto.style.color = 'var(--text-secondary)'; }
    if (prevFoto)   { prevFoto.style.display = 'none'; prevFoto.src = ''; }
    if (clearFoto)  { clearFoto.style.display = 'none'; }
    if (btnFoto)    { btnFoto.disabled = false; btnFoto.innerHTML = '📷 Subir foto'; }
  };

  if (btnFoto && inpFoto) {
    btnFoto.onclick = () => inpFoto.click();
    inpFoto.onchange = async () => {
      const file = inpFoto.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        window.showError?.('La foto no debe pesar más de 10 MB. Si es una foto de celular muy pesada, podés reducirla con cualquier app de compresión.');
        inpFoto.value = '';
        return;
      }
      btnFoto.disabled = true;
      btnFoto.innerHTML = '⏳ Subiendo…';
      if (statusFoto) { statusFoto.textContent = 'Subiendo a la nube…'; statusFoto.style.color = '#f59e0b'; }
      try {
        const { url } = await api.cotizaciones.uploadFoto(file);
        const fotoHidden = document.querySelector(`#form-linea-${idp} [name="foto_url"]`);
        if (fotoHidden) fotoHidden.value = url;
        if (prevFoto)   { prevFoto.src = url; prevFoto.style.display = 'inline-block'; }
        if (clearFoto)  { clearFoto.style.display = 'inline-block'; }
        if (statusFoto) { statusFoto.textContent = '✓ Foto lista'; statusFoto.style.color = '#16a34a'; }
        btnFoto.innerHTML = '📷 Cambiar';
        btnFoto.disabled = false;
      } catch (err) {
        window.showError?.('Error subiendo foto: ' + (err.message || err));
        resetFoto();
      }
    };
  }
  if (clearFoto) clearFoto.onclick = resetFoto;

  // Add o Guardar cambios (mismo botón, según editingItemIdx)
  const btnAdd = el(`btn-add-${idp}`);
  const divL   = el(`form-linea-${idp}`);
  if (btnAdd && divL) {
    btnAdd.addEventListener('click', () => {
      const q = (name) => divL.querySelector(`[name="${name}"]`);
      const desc = q('descripcion'), cant = q('cantidad'), prec = q('precio_unitario');
      if (!desc.value || !cant.value || !prec.value) {
        return window.showError?.('Descripción, cantidad y precio son obligatorios.');
      }
      const datos = {
        descripcion:     desc.value,
        subdescripcion:  q('subdescripcion').value || undefined,
        notas:           q('notas').value          || undefined,
        foto_url:        q('foto_url').value       || undefined,
        unidad:          q('unidad').value         || undefined,
        cantidad:        Number(cant.value),
        precio_unitario: Number(prec.value),
      };

      if (editingItemIdx !== null) {
        // Modo edit: reemplazar el ítem en su posición original
        lineas[editingItemIdx] = datos;
        window.showSuccess?.('Ítem actualizado.');
        cancelarEdicionItem();
      } else {
        // Modo agregar nuevo
        lineas.push(datos);
        ['descripcion','subdescripcion','notas','unidad','cantidad','precio_unitario']
          .forEach(n => { const e = q(n); if (e) e.value = ''; });
        resetFoto();
        renderItems();
      }
    });
  }

  // Recalcular cuando cambie TC/IGV
  el(`tc-${idp}`)?.addEventListener('input', renderItems);
  el(`igv-${idp}`)?.addEventListener('change', renderItems);

  // Prefill en modo edición
  const form = el(`form-cot-${idp}`);

  // Inicializar campos multilínea (precios_incluyen, forma_pago) siempre,
  // independiente de si es nueva o edición. Crea 1 línea vacía por default.
  if (form) setupMultilineHandlers(form);

  if (editData && form) {
    const setVal = (name, val) => {
      const f = form.querySelector(`[name="${name}"]`);
      if (f != null && val != null) f.value = val;
    };
    const prefillML = (fieldName, val) => {
      const fieldEl = form.querySelector(`.multiline-field[data-field="${fieldName}"]`);
      if (fieldEl) multilinePrefill(fieldEl, val);
    };
    setVal('cliente',          editData.cliente);
    setVal('atencion',         editData.atencion);
    setVal('telefono',         editData.telefono);
    setVal('correo',           editData.correo);
    setVal('proyecto',         editData.proyecto);
    setVal('ref',              editData.ref);
    prefillML('forma_pago',       editData.forma_pago);
    setVal('validez_oferta',   editData.validez_oferta);
    setVal('plazo_entrega',    editData.plazo_entrega);
    setVal('lugar_entrega',    editData.lugar_entrega);
    setVal('lugar_trabajo',    editData.lugar_trabajo);
    prefillML('precios_incluyen', editData.precios_incluyen);
    setVal('comentarios',      editData.comentarios);
    if (esUSD) setVal('tipo_cambio', editData.tipo_cambio);
    const chkIgv = el(`igv-${idp}`);
    if (chkIgv) chkIgv.checked = Number(editData.igv) > 0 || !!editData.aplica_igv;
  }

  // Submit
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (lineas.length === 0) return window.showError?.('Agrega al menos un ítem.');
      const f = e.target;
      try {
        const payload = {
          marca,
          cliente:          f.cliente.value,
          atencion:         f.atencion.value        || undefined,
          telefono:         f.telefono.value        || undefined,
          correo:           f.correo.value          || undefined,
          proyecto:         f.proyecto.value        || undefined,
          ref:              f.ref.value             || undefined,
          moneda:           f.moneda.value,
          tipo_cambio:      Number(f.tipo_cambio.value) || 1,
          aplica_igv:       f.aplica_igv.checked,
          forma_pago:       f.forma_pago.value       || undefined,
          validez_oferta:   f.validez_oferta.value   || undefined,
          plazo_entrega:    f.plazo_entrega.value    || undefined,
          lugar_entrega:    f.lugar_entrega.value    || undefined,
          lugar_trabajo:    f.lugar_trabajo.value    || undefined,
          precios_incluyen: f.precios_incluyen.value || undefined,
          comentarios:      f.comentarios.value      || undefined,
          detalles:         lineas,
        };
        if (editData) {
          await api.cotizaciones.updateCotizacion(editData.id_cotizacion, payload);
          window.showSuccess?.(`Cotización ${editData.nro_cotizacion} actualizada.`);
        } else {
          const res = await api.cotizaciones.createCotizacion(payload);
          window.showSuccess?.(`Cotización creada: ${res.nro_cotizacion}`);
        }
        onDone();
      } catch (err) {
        window.showError?.('Error: ' + (err.message || JSON.stringify(err)));
      }
    };
  }

  renderItems();
}

// ── Archivo: tabla de cotizaciones con filtro por marca ─────────
function archivoTable(cotizaciones, filtroMarca) {
  const filtradas = filtroMarca
    ? cotizaciones.filter(c => c.marca === filtroMarca)
    : cotizaciones;

  if (filtradas.length === 0) {
    return `<div style="padding:40px;text-align:center;color:var(--text-secondary)">Sin cotizaciones${filtroMarca ? ` para ${MARCAS[filtroMarca].label}` : ''}.</div>`;
  }

  const rows = filtradas.map(c => {
    const esUSD   = c.moneda === 'USD';
    const tc      = Number(c.tipo_cambio) || 1;
    const subOrig = esUSD ? Number(c.subtotal) / tc : Number(c.subtotal);
    const anulada = c.estado === 'ANULADA';
    const marcaBadge = MARCAS[c.marca]?.badgeHTML || '';

    return `
      <tr class="${anulada ? 'row-anulada' : ''}">
        <td>
          ${marcaBadge}
          <div style="font-size:12px;font-weight:700;margin-top:3px">${c.nro_cotizacion}</div>
          <div style="font-size:10px;color:var(--text-secondary)">${c.fecha ? String(c.fecha).split('T')[0] : '—'}</div>
          ${esUSD ? `<span style="font-size:10px;background:#16a34a;color:#fff;padding:1px 5px;border-radius:3px">USD</span>` : ''}
        </td>
        <td>
          <strong>${c.cliente}</strong>
          ${c.proyecto ? `<br><span style="font-size:11px;color:var(--text-secondary)">${c.proyecto}</span>` : ''}
          ${c.atencion ? `<br><span style="font-size:10px;color:var(--text-secondary)">${c.atencion}</span>` : ''}
        </td>
        <td style="text-align:right;font-size:12px;line-height:1.6">
          ${esUSD ? `<div style="color:#16a34a">${fUSD(subOrig)}</div>` : ''}
          <div>Sub: ${fPEN(c.subtotal)}</div>
          ${Number(c.igv) > 0 ? `<div style="color:var(--text-secondary)">IGV: ${fPEN(c.igv)}</div>` : ''}
          <div style="font-weight:bold;border-top:1px solid #e5e7eb;padding-top:2px">Total: ${fPEN(c.total)}</div>
        </td>
        <td style="text-align:center">
          ${estadoBadge(c.estado)}
          ${!anulada ? `
          <div style="margin-top:6px">
            <select class="sel-estado-cot" data-id="${c.id_cotizacion}"
              style="font-size:11px;padding:3px 6px;border:1px solid #ddd;border-radius:4px;width:100%">
              <option value="">— Cambiar —</option>
              <option value="EN_PROCESO">En Proceso</option>
              <option value="ENVIADA">Enviada</option>
              <option value="APROBADA">Aprobada</option>
              <option value="NO_APROBADA">No Aprobada</option>
              <option value="RECHAZADA">Rechazada</option>
              <option value="TERMINADA">Terminada</option>
              <option value="A_ESPERA_RESPUESTA">En Espera</option>
            </select>
          </div>` : ''}
        </td>
        <td style="text-align:center">
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="action-btn" style="background:#dc2626;color:#fff"
              onclick="window.descargarPDFCotizacion(${c.id_cotizacion},'${c.nro_cotizacion.replace(/'/g, "\\'")}')">📄 PDF</button>
            ${!anulada && (c.estado === 'APROBADA' || c.estado === 'TERMINADA') && !c.nro_factura ? `
            <button class="action-btn" style="background:#16a34a;color:#fff;font-weight:600"
              onclick="window.emitirFacturaDesdeCot(${c.id_cotizacion},'${c.nro_cotizacion.replace(/'/g, "\\'")}')">🧾 Emitir Factura</button>
            ` : ''}
            ${c.nro_factura ? `
            <span style="background:#dcfce7;color:#166534;padding:3px 6px;border-radius:4px;font-size:11px;font-weight:600;border:1px solid #86efac">
              ✅ ${c.nro_factura}
            </span>` : ''}
            ${!anulada && ESTADOS_EDITABLES.includes(c.estado) ? `
            <button class="action-btn" style="background:#3b82f6;color:#fff"
              onclick="window.editarCotizacion(${c.id_cotizacion},'${c.nro_cotizacion.replace(/'/g, "\\'")}')">✎ Editar</button>
            ` : ''}
            ${!anulada ? `
            <button class="action-btn action-btn-anular"
              onclick="window.anularCotizacion(${c.id_cotizacion},'${c.nro_cotizacion.replace(/'/g, "\\'")}')">Anular</button>
            ` : `<span style="font-size:11px;color:var(--text-secondary)">Anulada</span>`}
            ${(() => {
              try {
                const u = JSON.parse(localStorage.getItem('erp_user') || '{}');
                if (u.rol === 'GERENTE' && ESTADOS_EDITABLES.includes(c.estado)) {
                  return `<button class="action-btn"
                    style="background:#fff;color:#dc2626;border:1px solid #fca5a5;font-size:11px"
                    title="Eliminar definitivamente (solo duplicados)"
                    onclick="window.eliminarCotizacion(${c.id_cotizacion},'${c.nro_cotizacion.replace(/'/g, "\\'")}')">🗑 Eliminar</button>`;
                }
              } catch {}
              return '';
            })()}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>N° Cotización</th>
          <th>Cliente / Proyecto</th>
          <th style="text-align:right">Montos (PEN)</th>
          <th style="text-align:center">Estado</th>
          <th style="text-align:center">Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Archivo de cotizaciones ANULADAS ────────────────────────────
function renderAnuladasTab(anuladas) {
  if (!anuladas || anuladas.length === 0) {
    return `
      <div class="card" style="padding:40px;text-align:center;color:var(--text-secondary)">
        <div style="font-size:40px;margin-bottom:10px">🗂️</div>
        <div style="font-size:14px;font-weight:600;color:#555">Sin cotizaciones anuladas</div>
        <div style="font-size:12px;margin-top:4px">Las cotizaciones que anules aparecerán aquí.</div>
      </div>`;
  }

  // Agrupado por marca para dar contexto
  const porMarca = anuladas.reduce((acc, c) => {
    acc[c.marca] = (acc[c.marca] || 0) + 1;
    return acc;
  }, {});

  const rows = anuladas.map(c => {
    const esUSD = c.moneda === 'USD';
    const badge = MARCAS[c.marca]?.badgeHTML || '';
    return `
      <tr class="row-anulada">
        <td>
          ${badge}
          <div style="font-size:12px;font-weight:700;margin-top:3px">${c.nro_cotizacion}</div>
          <div style="font-size:10px;color:var(--text-secondary)">${c.fecha ? String(c.fecha).split('T')[0] : '—'}</div>
        </td>
        <td>
          <strong>${c.cliente}</strong>
          ${c.proyecto ? `<br><span style="font-size:11px;color:var(--text-secondary)">${c.proyecto}</span>` : ''}
        </td>
        <td style="text-align:right;font-size:12px">
          ${esUSD ? `<div style="color:#16a34a">${fUSD(Number(c.total) / (Number(c.tipo_cambio) || 1))}</div>` : ''}
          <div style="font-weight:bold">${fPEN(c.total)}</div>
        </td>
        <td style="text-align:center">${estadoBadge('ANULADA')}</td>
        <td style="text-align:center">
          <button class="action-btn" style="background:#dc2626;color:#fff"
            onclick="window.descargarPDFCotizacion(${c.id_cotizacion},'${c.nro_cotizacion.replace(/'/g, "\\'")}')">📄 PDF</button>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:700;color:#555">Archivo de cotizaciones anuladas</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
            Total: ${anuladas.length}
            ${porMarca.METAL      ? ` · ${porMarca.METAL} Metal`          : ''}
            ${porMarca.PERFOTOOLS ? ` · ${porMarca.PERFOTOOLS} Perfotools` : ''}
          </div>
        </div>
        <div style="font-size:11px;color:#92400e;background:#fef3c7;padding:6px 12px;border-radius:6px">
          ⚠ Las anuladas no se cuentan en métricas ni correlativos. El PDF sigue disponible.
        </div>
      </div>
      <div class="table-container" style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>N° Cotización</th>
              <th>Cliente / Proyecto</th>
              <th style="text-align:right">Monto</th>
              <th style="text-align:center">Estado</th>
              <th style="text-align:center">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Dashboard de cotizaciones ───────────────────────────────────
const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function renderDashboardTab(d) {
  if (!d) return `<div style="padding:40px;text-align:center;color:#999">Sin datos de dashboard</div>`;

  const pen = d.totalesPorMoneda.find(r => r.moneda === 'PEN');
  const usd = d.totalesPorMoneda.find(r => r.moneda === 'USD');
  const totalCots = d.totalesPorMoneda.reduce((s, r) => s + Number(r.cantidad), 0);

  // Adapter legacy → helper enterprise. Mantiene la API antigua de la
  // función local: (label, value, sub, borderColor, valueColor).
  const ACCENT_BY_COLOR = {
    '#000':     'primary',
    '#dc2626':  'danger',
    '#f59e0b':  'warning',
    '#22c55e':  'success',
    '#16a34a':  'success',
    '#0284c7':  'info',
    '#6b7280':  '',
  };
  const kpiCard = (label, value, sub, borderColor, _valueColor = '#111') =>
    kpiCardEnt({
      label,
      value,
      change: sub,
      changeType: 'neutral',
      accent: ACCENT_BY_COLOR[borderColor] || '',
    });

  // ── Fila 1: Totales financieros ──────────────────────────────────
  const kpis1 = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
      ${kpiCard('Total PEN', fPEN(pen?.monto || 0), `${pen?.cantidad || 0} cotizaciones`, '#000')}
      ${kpiCard('Total USD', fUSD(usd?.monto || 0), `${usd?.cantidad || 0} cotizaciones`, '#dc2626')}
      ${kpiCard('Prom. por cot. PEN', fPEN(d.promedioPen || 0), 'valor promedio S/', '#6b7280')}
      ${kpiCard('Prom. por cot. USD', fUSD(d.promedioUsd || 0), 'valor promedio $', '#6b7280')}
    </div>`;

  // ── Fila 2: Pipeline y conversión ────────────────────────────────
  const pipeline  = d.pipeline  || { cantidad: 0, monto_pen: 0, monto_usd: 0 };
  const aprobado  = d.aprobado  || { cantidad: 0, monto_pen: 0, monto_usd: 0 };
  const kpis2 = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      ${kpiCard('Pipeline PEN', fPEN(pipeline.monto_pen), `${pipeline.cantidad} activas`, '#f59e0b', '#d97706')}
      ${kpiCard('Pipeline USD', fUSD(pipeline.monto_usd), 'en proceso / espera', '#f59e0b', '#d97706')}
      ${kpiCard('Aprobado PEN', fPEN(aprobado.monto_pen), `${aprobado.cantidad} aprobadas`, '#22c55e', '#16a34a')}
      ${kpiCard('Tasa Aprobación', `${d.tasaAprobacion}%`, `${totalCots} cotizaciones total`, '#22c55e', '#16a34a')}
    </div>`;

  // ── Por estado (barras horizontales con monto) ───────────────────
  const maxEstado = Math.max(...d.porEstado.map(r => Number(r.cantidad)), 1);
  const barrasEstado = d.porEstado.map(r => {
    const c   = ESTADOS_COLOR[r.estado] || { bg: '#9ca3af', label: r.estado };
    const pct = Math.round((Number(r.cantidad) / maxEstado) * 100);
    const montoStr = Number(r.monto_pen) > 0 ? fPEN(r.monto_pen) : (Number(r.monto_usd) > 0 ? fUSD(r.monto_usd) : '');
    return `
      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <div style="width:130px;font-size:12px;color:#444;text-align:right;flex-shrink:0">${c.label}</div>
          <div style="flex:1;background:#f3f4f6;border-radius:4px;height:22px;overflow:hidden">
            <div style="width:${pct}%;background:${c.bg};height:100%;border-radius:4px;
                        display:flex;align-items:center;padding-left:8px;
                        min-width:${Number(r.cantidad) > 0 ? '28px' : '0'}">
              ${Number(r.cantidad) > 0 ? `<span style="color:#fff;font-size:11px;font-weight:600">${r.cantidad}</span>` : ''}
            </div>
          </div>
          <div style="width:32px;font-size:12px;color:#666;text-align:right;flex-shrink:0">${r.cantidad}</div>
        </div>
        ${montoStr ? `<div style="text-align:right;font-size:10px;color:#999;padding-right:40px">${montoStr}</div>` : ''}
      </div>`;
  }).join('');

  // ── Por marca ────────────────────────────────────────────────────
  const barrasMarca = d.porMarca.map(r => {
    const cfg    = MARCAS[r.marca] || { label: r.marca, color: '#666' };
    const aprobM = d.porEstado.filter(e => e.estado === 'APROBADA').reduce((s,e) => s + Number(e.cantidad), 0);
    return `
      <div style="background:#f8f9fa;padding:14px 16px;border-radius:6px;border-left:4px solid ${cfg.color}">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">${cfg.label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px">
          <div>
            <div style="color:#888;font-size:10px;text-transform:uppercase">Cotizaciones</div>
            <div style="font-weight:700;font-size:22px">${r.cantidad}</div>
          </div>
          <div>
            <div style="color:#888;font-size:10px;text-transform:uppercase">Monto PEN</div>
            <div style="font-weight:600;font-size:13px">${fPEN(r.monto_pen)}</div>
          </div>
          <div>
            <div style="color:#888;font-size:10px;text-transform:uppercase">Monto USD</div>
            <div style="font-weight:600;font-size:13px">${fUSD(r.monto_usd)}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // ── Top clientes ─────────────────────────────────────────────────
  const filasClientes = d.topClientes.map((r, i) => {
    const tasaCli = r.cantidad > 0 ? Math.round((Number(r.aprobadas) / Number(r.cantidad)) * 100) : 0;
    const barW    = Math.round(tasaCli);
    return `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 0;font-weight:600;color:#333">${i + 1}. ${r.cliente}</td>
        <td style="text-align:center;padding:8px 4px;font-size:13px">${r.cantidad}</td>
        <td style="text-align:right;padding:8px 4px;font-size:12px">${fPEN(r.monto_pen)}</td>
        <td style="text-align:right;padding:8px 4px;font-size:12px">${fUSD(r.monto_usd)}</td>
        <td style="padding:8px 4px;width:110px">
          <div style="display:flex;align-items:center;gap:4px">
            <div style="flex:1;background:#f3f4f6;border-radius:3px;height:8px;overflow:hidden">
              <div style="width:${barW}%;background:${tasaCli >= 50 ? '#22c55e' : '#f97316'};height:100%"></div>
            </div>
            <span style="font-size:11px;font-weight:600;color:${tasaCli >= 50 ? '#16a34a' : '#ea580c'};width:28px;text-align:right">${tasaCli}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  // ── Tendencia mensual ────────────────────────────────────────────
  const maxMes = Math.max(...d.tendencia.map(r => Number(r.cantidad)), 1);
  const barrasMes = d.tendencia.map(r => {
    const [anio, mes] = r.mes.split('-');
    const label  = `${MESES_ES[Number(mes) - 1]} ${anio.slice(2)}`;
    const h      = Math.max(Math.round((Number(r.cantidad) / maxMes) * 80), 4);
    const aprobM = Number(r.aprobadas);
    const tasaM  = Number(r.cantidad) > 0 ? Math.round((aprobM / Number(r.cantidad)) * 100) : 0;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:60px">
        <div style="font-size:11px;font-weight:700;color:#333">${r.cantidad}</div>
        <div style="width:38px;background:#000;height:${h}px;border-radius:3px 3px 0 0;position:relative">
          ${aprobM > 0 ? `<div style="position:absolute;bottom:0;width:100%;background:#22c55e;height:${Math.round((aprobM/Number(r.cantidad))*h)}px;border-radius:3px 3px 0 0;opacity:.7"></div>` : ''}
        </div>
        <div style="font-size:10px;color:#666">${label}</div>
        <div style="font-size:10px;color:#16a34a;font-weight:600">${tasaM > 0 ? tasaM + '% aprob' : ''}</div>
      </div>`;
  }).join('');

  // ── Comparativa anual + mes a mes ──────────────────────────────
  const comp = d.comparativa || {};
  const ytdAct = comp.ytd_actual || { cantidad: 0, monto_pen: 0, aprobadas: 0, tasa: 0 };
  const ytdPrev = comp.ytd_anterior || { cantidad: 0, monto_pen: 0, aprobadas: 0, tasa: 0 };
  const mesAct = comp.mes_actual || { cantidad: 0, monto_pen: 0 };
  const mesPrev = comp.mes_anterior || { cantidad: 0, monto_pen: 0 };
  const dPct = (a, b) => b > 0 ? ((a - b) / b * 100) : 0;
  const fPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(0) + '%';
  const cPct = (v) => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#6b7280';

  const dMontoYTD = dPct(ytdAct.monto_pen, ytdPrev.monto_pen);
  const dCantYTD  = dPct(ytdAct.cantidad,  ytdPrev.cantidad);
  const dTasaYTD  = ytdAct.tasa - ytdPrev.tasa;
  const dMontoMes = dPct(mesAct.monto_pen, mesPrev.monto_pen);
  const dCantMes  = dPct(mesAct.cantidad,  mesPrev.cantidad);

  const compHTML = `
    <div class="card" style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:14px">📅 Comparativas históricas</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div style="padding:14px;background:#f0f9ff;border-left:4px solid #0284c7;border-radius:6px">
          <div style="font-size:11px;color:#666;font-weight:600;text-transform:uppercase">YTD ${comp.anio_actual} (${comp.meses_transcurridos} meses) vs ${comp.anio_anterior}</div>
          <div style="margin-top:8px;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div>
              <div style="font-size:10px;color:#888">Monto cotizado</div>
              <div style="font-weight:700;font-size:16px">${fPEN(ytdAct.monto_pen)}</div>
              <div style="color:${cPct(dMontoYTD)};font-weight:600;font-size:11px">${fPct(dMontoYTD)} vs ${fPEN(ytdPrev.monto_pen)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:#888">Cantidad</div>
              <div style="font-weight:700;font-size:16px">${ytdAct.cantidad}</div>
              <div style="color:${cPct(dCantYTD)};font-weight:600;font-size:11px">${fPct(dCantYTD)} vs ${ytdPrev.cantidad}</div>
            </div>
            <div>
              <div style="font-size:10px;color:#888">Aprobadas</div>
              <div style="font-weight:700;font-size:16px">${ytdAct.aprobadas} <span style="font-size:11px;color:#888">/ ${ytdAct.cantidad}</span></div>
            </div>
            <div>
              <div style="font-size:10px;color:#888">Tasa cierre</div>
              <div style="font-weight:700;font-size:16px;color:${ytdAct.tasa >= 50 ? '#16a34a' : '#ea580c'}">${ytdAct.tasa}%</div>
              <div style="color:${cPct(dTasaYTD)};font-weight:600;font-size:11px">${dTasaYTD >= 0 ? '+' : ''}${dTasaYTD}pp vs ${ytdPrev.tasa}%</div>
            </div>
          </div>
        </div>
        <div style="padding:14px;background:#fef3c7;border-left:4px solid #d97706;border-radius:6px">
          <div style="font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Mes actual vs mes anterior</div>
          <div style="margin-top:8px;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div>
              <div style="font-size:10px;color:#888">Monto</div>
              <div style="font-weight:700;font-size:16px">${fPEN(mesAct.monto_pen)}</div>
              <div style="color:${cPct(dMontoMes)};font-weight:600;font-size:11px">${fPct(dMontoMes)} vs ${fPEN(mesPrev.monto_pen)}</div>
            </div>
            <div>
              <div style="font-size:10px;color:#888">Cantidad</div>
              <div style="font-weight:700;font-size:16px">${mesAct.cantidad}</div>
              <div style="color:${cPct(dCantMes)};font-weight:600;font-size:11px">${fPct(dCantMes)} vs ${mesPrev.cantidad}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return `
    ${kpis1}
    ${kpis2}
    ${compHTML}

    <!-- Estados y Marcas -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div class="card">
        <div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:14px">Distribución por Estado</div>
        ${barrasEstado || '<div style="color:#999;font-size:13px">Sin datos</div>'}
      </div>
      <div class="card">
        <div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:14px">Por Marca</div>
        <div style="display:flex;flex-direction:column;gap:10px">${barrasMarca || '<div style="color:#999;font-size:13px">Sin datos</div>'}</div>
      </div>
    </div>

    <!-- Tendencia 12 meses con Chart.js -->
    <div class="card" style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:14px">📈 Tendencia 12 meses — Cotizado vs Aprobado (PEN equiv)</div>
      ${d.tendencia.length === 0
        ? '<div style="color:#999;font-size:13px;padding:20px;text-align:center">Sin datos en el período</div>'
        : `<canvas id="ch-cotiz-trend" style="max-height:280px"></canvas>`}
    </div>

    <!-- Top clientes -->
    <div class="card">
      <div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:14px">Top Clientes</div>
      ${d.topClientes.length === 0
        ? '<div style="color:#999;font-size:13px">Sin datos</div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid #e5e7eb">
                <th style="text-align:left;padding:6px 0;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Cliente</th>
                <th style="text-align:center;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Cots.</th>
                <th style="text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">PEN</th>
                <th style="text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">USD</th>
                <th style="text-align:center;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Tasa Aprob.</th>
              </tr>
            </thead>
            <tbody>${filasClientes}</tbody>
          </table>`}
    </div>`;
}

// ── Export principal ────────────────────────────────────────────
export const Comercial = async () => {
  let cotizaciones = [], tcHoy = { valor_venta: 1, es_hoy: false, fecha: '' }, dash = null, anuladas = [];
  try {
    [cotizaciones, tcHoy, dash, anuladas] = await Promise.all([
      api.cotizaciones.getCotizaciones(),
      api.tipoCambio.getHoy('USD').catch(() => ({ valor_venta: 1, es_hoy: false, fecha: '' })),
      api.cotizaciones.getDashboard().catch(() => null),
      api.cotizaciones.getAnuladas().catch((err) => {
        console.error('[Comercial] getAnuladas FALLÓ:', err);
        window.showError?.('No se pudo cargar Anuladas: ' + (err.message || err));
        return [];
      }),
    ]);
    if (!Array.isArray(cotizaciones)) cotizaciones = [];
    if (!Array.isArray(anuladas))     anuladas     = [];
    console.log('[Comercial] Cotizaciones activas:', cotizaciones.length, '— Anuladas:', anuladas.length, anuladas);
  } catch (err) {
    console.error('[Comercial] Error cargando datos:', err);
  }

  // KPIs
  const total     = cotizaciones.length;
  const aprobadas = cotizaciones.filter(c => c.estado === 'APROBADA').length;
  const tasaAprob = total > 0 ? Math.round((aprobadas / total) * 100) : 0;
  const pipeline  = cotizaciones
    .filter(c => ['EN_PROCESO', 'ENVIADA', 'A_ESPERA_RESPUESTA'].includes(c.estado))
    .reduce((acc, c) => acc + Number(c.total), 0);

  // ── Lógica tras render ─────────────────────────────────────────
  setTimeout(() => {
    // Tabs
    const tabs    = document.querySelectorAll('.tab-btn');
    const panels  = document.querySelectorAll('.tab-panel');
    let   bound   = { METAL: false, PERFOTOOLS: false };

    const activar = (tab) => {
      tabs.forEach(t => t.classList.toggle('tab-active', t.dataset.tab === tab));
      panels.forEach(p => p.style.display = p.dataset.tab === tab ? 'block' : 'none');
      if (tab === 'metal'      && !bound.METAL)      { bindForm('METAL');      bound.METAL = true; }
      if (tab === 'perfotools' && !bound.PERFOTOOLS) { bindForm('PERFOTOOLS'); bound.PERFOTOOLS = true; }
      if (tab === 'archivo')                         { bindArchivo(); }
      if (tab === 'dashboard')                       { renderDashboardChart(); }
    };

    // Chart línea para tendencia 12m (Cotizado vs Aprobado)
    let chartCotizTrend = null;
    const renderDashboardChart = () => {
      const ctx = document.getElementById('ch-cotiz-trend');
      if (!ctx || !window.Chart || !dash?.tendencia?.length) return;
      if (chartCotizTrend) return; // ya creado
      const labels = dash.tendencia.map(r => {
        const [a, m] = r.mes.split('-');
        return `${MESES_ES[Number(m) - 1]} ${a.slice(2)}`;
      });
      const dataCot = dash.tendencia.map(r => Number(r.monto_pen) || 0);
      const dataApr = dash.tendencia.map(r => Number(r.aprobadas_pen) || 0);
      chartCotizTrend = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Cotizado (PEN)', data: dataCot, borderColor: '#000', backgroundColor: '#00000022', fill: true, tension: 0.3 },
            { label: 'Aprobado (PEN)', data: dataApr, borderColor: '#16a34a', backgroundColor: '#16a34a22', fill: true, tension: 0.3 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + Number(v).toLocaleString() } } } }
      });
    };
    // Si hay hash #dashboard al cargar, activar ese tab
    const hashTab = window.location.hash === '#comercial-dashboard' ? 'dashboard' : 'metal';
    tabs.forEach(t => t.addEventListener('click', () => activar(t.dataset.tab)));

    // Archivo: filtros + acciones
    const bindArchivo = () => {
      document.querySelectorAll('.filtro-marca').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.filtro-marca').forEach(b => b.classList.toggle('filtro-active', b === btn));
          const marca = btn.dataset.marca || '';
          const cont  = document.getElementById('archivo-tabla');
          if (cont) cont.innerHTML = archivoTable(cotizaciones, marca);
          wireArchivoRows();
        };
      });
      wireArchivoRows();
    };

    const wireArchivoRows = () => {
      document.querySelectorAll('.sel-estado-cot').forEach(sel => {
        sel.onchange = async () => {
          const id = Number(sel.dataset.id);
          const estado = sel.value;
          if (!estado) return;
          try {
            await api.cotizaciones.updateEstado(id, estado);
            window.navigate('comercial');
          } catch (err) {
            window.showError?.('Error: ' + (err.message || JSON.stringify(err)));
            sel.value = '';
          }
        };
      });
    };

    window.descargarPDFCotizacion = async (id, nro) => {
      try {
        const token = localStorage.getItem('erp_token');
        const r = await fetch(`/api/cotizaciones/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err) {
        window.showError?.('Error generando PDF: ' + (err.message || err));
      }
    };

    window.resetComercial = async () => {
      const ok = await confirmarTexto({
        titulo: 'Resetear módulo Comercial',
        mensaje:
          '🚨 ACCIÓN IRREVERSIBLE 🚨\n\n' +
          'Vas a borrar PERMANENTEMENTE:\n' +
          '• Todas las cotizaciones (activas y anuladas)\n' +
          '• Todos los ítems y fotos asociadas\n' +
          '• El correlativo se reinicia desde COT 2026-001\n\n' +
          'Esto NO afecta a Finanzas, Logística ni otros módulos.\n' +
          'Esto NO borra las fotos que ya están en Cloudinary (solo la referencia).\n\n' +
          'Si quieres conservar un respaldo, descarga los PDFs antes de continuar.',
        textoRequerido: 'BORRAR TODO',
        confirmLabel: 'Sí, borrar todo',
        tipo: 'danger',
      });
      if (!ok) return;
      try {
        const r = await api.cotizaciones.resetTodo();
        window.showSuccess?.(`✔ Se eliminaron ${r.eliminadas} cotizaciones. Módulo reseteado.`);
        setTimeout(() => window.navigate('comercial'), 1500);
      } catch (err) {
        window.showError?.('Error reseteando: ' + (err.message || JSON.stringify(err)));
      }
    };

    window.anularCotizacion = async (id, nro) => {
      const ok = await confirmarAccion({
        titulo: 'Anular cotización',
        mensaje: `Estás por anular la cotización ${nro}.\n\nEsto es un cambio importante: el documento pasará al archivo de ANULADAS y no podrá volver a usarse. El número de cotización quedará reservado (no se reutiliza).\n\n¿Estás seguro que quieres continuar?`,
        confirmLabel: 'Sí, anular',
        cancelLabel: 'Cancelar',
        tipo: 'danger',
      });
      if (!ok) return;
      try {
        await api.cotizaciones.anularCotizacion(id);
        window.showSuccess?.(`Cotización ${nro} anulada.`);
        setTimeout(() => window.navigate('comercial'), 1200);
      } catch (err) {
        window.showError?.('Error: ' + (err.message || JSON.stringify(err)));
      }
    };

    window.eliminarCotizacion = async (id, nro) => {
      // Eliminación física de duplicados — solo GERENTE, solo EN_PROCESO/A_ESPERA.
      // Doble barrera: 1) advertencia explícita, 2) tipear el número exacto.
      const ok = await confirmarTexto({
        titulo: '🗑 Eliminar cotización definitivamente',
        mensaje: `Vas a ELIMINAR DEFINITIVAMENTE la cotización ${nro}.\n\nEsta acción NO se puede deshacer. La cotización y sus ítems se borrarán de la base de datos. El número correlativo quedará liberado (puede reutilizarse).\n\nUsá esto SOLO para duplicados creados por error que aún no circulan a clientes. Para todo lo demás, usá Anular.\n\nPara confirmar, escribí el número de cotización exacto:`,
        textoRequerido: nro,
        confirmLabel: 'Sí, eliminar',
        tipo: 'danger',
      });
      if (!ok) return;
      try {
        await api.cotizaciones.deleteCotizacion(id);
        window.showSuccess?.(`Cotización ${nro} eliminada definitivamente.`);
        setTimeout(() => window.navigate('comercial'), 1200);
      } catch (err) {
        window.showError?.('Error: ' + (err.message || JSON.stringify(err)));
      }
    };

    window.emitirFacturaDesdeCot = async (id, nro) => {
      // Chequear modo (STUB vs REAL) para darle la advertencia correcta al usuario
      let diag = null;
      try { diag = await api.facturacion.diagnostico(); } catch {}
      const esReal = diag?.modo === 'REAL';
      const mensaje = esReal
        ? `Vas a emitir la factura electrónica para ${nro}. Se enviará a SUNAT vía ${diag.proveedor} y recibirás el CDR oficial. No se puede deshacer — si hay error, corrige con Nota de Crédito.\n\n¿Continuar?`
        : `Vas a emitir la factura para ${nro} en modo SIMULADO (sin certificado digital configurado). Se generará un correlativo real en BD pero no se enviará a SUNAT.\n\nCuando configures el OSE + certificado, las siguientes facturas irán a SUNAT automáticamente.\n\n¿Continuar?`;
      const ok = await confirmarAccion({
        titulo: esReal ? '🧾 Emitir factura a SUNAT' : '🧾 Emitir factura (modo simulado)',
        mensaje,
        confirmLabel: esReal ? 'Emitir y enviar' : 'Emitir simulada',
        cancelLabel: 'Cancelar',
        tipo: esReal ? 'danger' : 'warning',
      });
      if (!ok) return;
      try {
        const r = await api.facturas.emitirDesdeCotizacion(id, { forma_pago: 'CONTADO' });
        const label = r.simulado ? '🟡 Emisión simulada' : '🟢 Factura aceptada por SUNAT';
        window.showSuccess?.(`${label}: ${r.numero_formateado}`);
        if (r.pdf_url) {
          // En modo REAL abrir el PDF SUNAT
          setTimeout(() => window.open(r.pdf_url, '_blank'), 600);
        }
        setTimeout(() => window.navigate('comercial'), 1500);
      } catch (err) {
        const msg = err?.debugging || err?.error || err?.message || JSON.stringify(err);
        window.showError?.('Error al emitir: ' + msg);
      }
    };

    window.editarCotizacion = async (id, nro) => {
      const ok = await confirmarAccion({
        titulo: 'Editar cotización',
        mensaje: `Vas a editar la cotización ${nro}.\n\nEste es un cambio importante: sobrescribirá los datos, ítems y totales actuales. Revisa bien cada campo antes de guardar.\n\n¿Continuar?`,
        confirmLabel: 'Sí, editar',
        cancelLabel: 'Cancelar',
        tipo: 'warning',
      });
      if (!ok) return;
      let data;
      try {
        data = await api.cotizaciones.getCotizacion(id);
      } catch (err) {
        return window.showError?.('Error cargando cotización: ' + (err.message || err));
      }
      const marca = data.marca;
      // OJO: usar `_` y NO `-` porque el idp se concatena en nombres de
      // funciones globales (window.__removeLinea_${idp}) y atributos id=.
      // El guion provoca que JS interprete `__removeLinea_perfotools-edit`
      // como resta → "edit is not defined".
      const idpEdit = `${marca.toLowerCase()}_edit`;

      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
      ov.innerHTML = `
        <div style="background:#fff;border-radius:8px;max-width:820px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);position:relative;margin:auto">
          <button id="edit-cot-close" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:22px;cursor:pointer;color:#666;z-index:2">✕</button>
          <div style="padding:20px">
            ${formNueva(marca, { valor_venta: data.tipo_cambio, es_hoy: false, fecha: data.fecha }, { editData: data, idp: idpEdit })}
          </div>
        </div>`;
      document.body.appendChild(ov);
      const close = () => ov.remove();
      ov.querySelector('#edit-cot-close').onclick = close;
      ov.onclick = (e) => { if (e.target === ov) close(); };

      bindForm(marca, {
        editData: data,
        idp: idpEdit,
        onDone: () => { close(); setTimeout(() => window.navigate('comercial'), 600); },
      });
    };

    activar(hashTab);
  }, 80);

  return `
    <header class="header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h1>Comercial — Cotizaciones</h1>
        <span style="color:var(--text-secondary)">Gestión independiente por marca: Metal Engineers (PEN) y Perfotools (USD).</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button onclick="window.navigate('configuracion-comercial')"
          style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:13px"
          title="Empresa, cuentas bancarias y firma que aparecen en el PDF">
          ⚙ Configuración PDF
        </button>
        ${(() => {
          try {
            const u = JSON.parse(localStorage.getItem('erp_user') || '{}');
            if (u.rol === 'GERENTE') {
              return `<button onclick="window.resetComercial()"
                style="padding:6px 10px;border:1px dashed #ddd;background:transparent;color:#999;border-radius:4px;cursor:pointer;font-size:11px"
                title="Borra TODAS las cotizaciones. Solo Gerente.">
                ⟲ Reset
              </button>`;
            }
          } catch {}
          return '';
        })()}
      </div>
    </header>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:20px">
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:bold;color:var(--primary-color)">${total}</div>
        <div style="font-size:12px;color:var(--text-secondary)">Total cotizaciones</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#22c55e">${aprobadas}</div>
        <div style="font-size:12px;color:var(--text-secondary)">Aprobadas</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:24px;font-weight:bold;color:var(--primary-color)">${tasaAprob}%</div>
        <div style="font-size:12px;color:var(--text-secondary)">Tasa aprobación</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:16px;font-weight:bold;color:#3b82f6">${fPEN(pipeline)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">Pipeline activo</div>
      </div>
    </div>

    <!-- Tabs -->
    <div style="margin-top:20px;display:flex;gap:4px;border-bottom:2px solid #e5e7eb">
      <button class="tab-btn tab-active" data-tab="metal"
        style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;border-bottom:3px solid transparent">
        Nueva · Metal (PEN)
      </button>
      <button class="tab-btn" data-tab="perfotools"
        style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;border-bottom:3px solid transparent">
        Nueva · Perfotools (USD)
      </button>
      <button class="tab-btn" data-tab="archivo"
        style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;border-bottom:3px solid transparent">
        Archivo y Estado
      </button>
      <button class="tab-btn" data-tab="anuladas"
        style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;border-bottom:3px solid transparent">
        🗂️ Anuladas ${anuladas.length > 0 ? `<span style="background:#374151;color:#fff;padding:1px 7px;border-radius:10px;font-size:10px;margin-left:4px">${anuladas.length}</span>` : ''}
      </button>
      <button class="tab-btn" data-tab="dashboard"
        style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;border-bottom:3px solid transparent;margin-left:auto">
        📊 Dashboard
      </button>
    </div>

    <div class="tab-panel" data-tab="metal"      style="display:block;margin-top:16px">
      ${formNueva('METAL', tcHoy)}
    </div>
    <div class="tab-panel" data-tab="perfotools" style="display:none;margin-top:16px">
      ${formNueva('PERFOTOOLS', tcHoy)}
    </div>
    <div class="tab-panel" data-tab="archivo"    style="display:none;margin-top:16px">
      <div class="card">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
          <strong style="font-size:12px;color:var(--text-secondary)">Filtrar por marca:</strong>
          <button class="filtro-marca filtro-active" data-marca=""
            style="padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:20px;cursor:pointer;font-size:12px">Todas</button>
          <button class="filtro-marca" data-marca="METAL"
            style="padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:20px;cursor:pointer;font-size:12px">Metal</button>
          <button class="filtro-marca" data-marca="PERFOTOOLS"
            style="padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:20px;cursor:pointer;font-size:12px">Perfotools</button>
        </div>
        <div class="table-container" id="archivo-tabla" style="overflow-x:auto">
          ${archivoTable(cotizaciones, '')}
        </div>
      </div>
    </div>

    <div class="tab-panel" data-tab="anuladas" style="display:none;margin-top:16px">
      ${renderAnuladasTab(anuladas)}
    </div>

    <div class="tab-panel" data-tab="dashboard" style="display:none;margin-top:16px">
      ${renderDashboardTab(dash)}
    </div>

    <style>
      .tab-btn { color: var(--text-secondary); }
      .tab-btn.tab-active { color: var(--text-primary); border-bottom-color: var(--primary-color) !important; }
      .filtro-marca.filtro-active { background: var(--primary-color) !important; color: #fff; border-color: var(--primary-color) !important; }
      .row-anulada { opacity: 0.55; }
    </style>
  `;
};

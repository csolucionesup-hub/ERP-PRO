import { api } from '../services/api.js';
import { showSuccess, showError, tip, escapeHtml, escapeAttr } from '../services/ui.js';
import { kpiGrid } from '../components/KpiCard.js';
import { lineChart, barChart, chartColors, destroyChart } from '../components/charts.js';

const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(val) || 0);
const formatUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val) || 0);
const formatDate = (d) => d ? String(d).split('T')[0] : '---';

const ESTADO_STYLE = {
  PENDIENTE: 'status-pendiente',
  PARCIAL:   'status-parcial',
  PAGADO:    'status-pagado',
  COBRADO:   'status-pagado',
  ANULADO:   'status-anulado',
};

const badge = (estado) => `<span class="status-badge ${ESTADO_STYLE[estado] || 'status-pendiente'}">${escapeHtml(estado)}</span>`;

const inputStyle = 'padding:9px; border-radius:var(--radius-sm); border:1px solid var(--border-light); width:100%; box-sizing:border-box';

// ─── MODAL EDITAR ─────────────────────────────────────────────────────────────
const modalEditar = () => `
<div id="modal-editar-prestamo" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;align-items:center;justify-content:center;">
  <div style="background:white;border-radius:10px;padding:28px;width:460px;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.25);">
    <h3 id="modal-titulo" style="margin-bottom:18px;font-size:15px;font-weight:700"></h3>
    <form id="form-editar-prestamo" style="display:flex;flex-direction:column;gap:10px;">
      <input type="hidden" id="edit-id">
      <input type="hidden" id="edit-tipo">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">N° OC</label>
          <input id="edit-nro_oc" placeholder="OC-001" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)" id="edit-label-contraparte">Acreedor</label>
          <input id="edit-contraparte" required style="${inputStyle}">
        </div>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary)">Descripción</label>
        <input id="edit-descripcion" placeholder="Descripción breve" style="${inputStyle}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary)">Comentario</label>
        <textarea id="edit-comentario" rows="2" style="${inputStyle}; resize:vertical"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Fecha Emisión</label>
          <input id="edit-fecha_emision" type="date" required style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Fecha Vencimiento</label>
          <input id="edit-fecha_vencimiento" type="date" style="${inputStyle}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Capital (S/.)</label>
          <input id="edit-monto_capital" type="number" step="0.0001" required style="${inputStyle}" oninput="window.calcEditTotal()">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Interés (S/.)</label>
          <input id="edit-monto_interes" type="number" step="0.0001" value="0" style="${inputStyle}" oninput="window.calcEditTotal()">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Total</label>
          <input id="edit-monto_total" readonly style="${inputStyle};background:#f8f9fa;font-weight:bold">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:6px;">
        <button type="submit" style="flex:1;padding:10px;border:none;background:var(--primary-color);color:white;border-radius:var(--radius-sm);cursor:pointer;font-weight:bold;">Guardar Cambios</button>
        <button type="button" onclick="window.cerrarModalEditar()" style="flex:1;padding:10px;border:1px solid var(--border-light);background:white;border-radius:var(--radius-sm);cursor:pointer;">Cancelar</button>
      </div>
    </form>
  </div>
</div>`;

// ─── FORMULARIO DE CREACIÓN ────────────────────────────────────────────────────
// Mig 071 (14/05/2026): el form pivota sobre el maestro Contrapartes en vez
// de texto libre. Tres campos nuevos visibles:
//   1. Contraparte (select del maestro + botón "+ Nueva" inline)
//   2. Empresa (METAL / PERFOTOOLS — qué empresa toma o da el préstamo)
//   3. Medio de pago (texto libre con autocomplete: banco/cuenta usada)
// `contrapartesCache` se llena al abrir el modal; se refresca después de
// crear una contraparte nueva sin cerrar el modal.
const formCrear = (tipo, tcVenta = 1, tcFecha = '', contrapartes = [], mediosPago = []) => {
  const esTomado = tipo === 'tomado';
  const labelContraparte = esTomado ? 'Acreedor (quién me presta)' : 'Deudor (a quién le presto)';
  const idForm = `form-crear-${tipo}`;
  const opcionesContraparte = (contrapartes || []).filter(c => c.activo !== false).map(c => {
    const doc = c.documento_numero ? ` · ${c.documento_tipo || 'DOC'} ${c.documento_numero}` : '';
    return `<option value="${c.id_contraparte}">${escapeHtml(c.nombre)}${escapeHtml(doc)}</option>`;
  }).join('');
  const opcionesMedio = [...new Set((mediosPago || []).filter(Boolean))].sort()
    .map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
  return `
  <div class="card" style="margin-top:0">
    <h3 style="margin-bottom:15px;font-weight:600;font-size:14px">Registrar Préstamo ${esTomado ? 'Tomado' : 'Otorgado'}</h3>
    <form id="${idForm}" style="display:flex;flex-direction:column;gap:10px;">
      <div id="banner-usd-${tipo}" style="display:none; background:#16a34a; color:white; padding:10px 14px; border-radius:6px; font-size:13px; font-weight:600;">💵 Transacción PerfoTools — Dólares americanos</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">N° de Préstamo ${tip('Se asigna automáticamente al guardar: ' + (esTomado ? 'PT' : 'PO') + '-NNN-' + (new Date().getFullYear()) + '. No se puede editar — el sistema usa el siguiente correlativo del año en curso.')}</label>
          <input name="nro_oc" placeholder="Se asignará automáticamente al guardar (${esTomado ? 'PT' : 'PO'}-NNN-${new Date().getFullYear()})" readonly
            style="${inputStyle};background:#f3f4f6;color:#6b7280;cursor:not-allowed">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Empresa ${tip('Qué empresa ' + (esTomado ? 'toma' : 'otorga') + ' el préstamo. METAL = Metal Engineers (PEN). PERFOTOOLS = Perfotools (USD). Sirve para consolidar saldos por empresa en el dashboard.')}</label>
          <select name="empresa" required style="${inputStyle}">
            <option value="METAL">Metal Engineers</option>
            <option value="PERFOTOOLS">Perfotools</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">${labelContraparte} ${tip('Persona, empresa o banco real. Si tiene varios préstamos, todos se consolidan bajo la misma contraparte. Si no aparece en la lista, hacé click en "+ Nueva".')}</label>
          <div style="display:flex;gap:6px">
            <select name="id_contraparte" required style="${inputStyle};flex:1">
              <option value="">— Seleccionar ${esTomado ? 'acreedor' : 'deudor'} —</option>
              ${opcionesContraparte}
            </select>
            <button type="button" data-act="nueva-contraparte" data-tipo="${tipo}"
              title="Crear nueva contraparte (persona / empresa / banco) sin salir del form"
              style="padding:0 12px;background:#7c3aed;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap">+ Nueva</button>
          </div>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Medio / Banco ${tip('Por dónde ' + (esTomado ? 'entró' : 'salió') + ' la plata. Ej: Interbank, BCP, Falabella, Efectivo. Es texto libre — escribí lo que corresponda.')}</label>
          <input name="medio_pago" list="medios-${tipo}" placeholder="Interbank, BCP, Efectivo…" style="${inputStyle}">
          <datalist id="medios-${tipo}">
            ${opcionesMedio}
          </datalist>
        </div>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary)">Descripción</label>
        <input name="descripcion" placeholder="Motivo del préstamo" style="${inputStyle}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary)">Comentario interno</label>
        <textarea name="comentario" rows="2" placeholder="Notas adicionales..." style="${inputStyle};resize:vertical"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Fecha Emisión</label>
          <input name="fecha_emision" type="date" required style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Fecha Vencimiento ${tip('Cuándo deberías ' + (esTomado ? 'devolver' : 'cobrar') + ' el préstamo. Se usa para generar alertas de vencimiento (próximo a vencer / vencido).')}</label>
          <input name="fecha_vencimiento" type="date" style="${inputStyle}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Moneda ${tip('PEN o USD. Si el préstamo está en dólares, debés también ingresar el tipo de cambio.')}</label>
          <select name="moneda" id="prest-moneda-${tipo}" style="${inputStyle}" onchange="window.toggleMonedaPrestamo(this,'${tipo}')">
            <option value="PEN">S/. Soles (PEN)</option>
            <option value="USD">$ Dólares (USD)</option>
          </select>
        </div>
        <div id="div-tc-${tipo}" style="display:none; flex:1;">
          <label style="font-size:11px;color:var(--text-secondary)">Tipo de Cambio ${tip('Tipo de cambio venta SBS para convertir USD a PEN. Auto-completado con el TC oficial del día.')}</label>
          <input name="tipo_cambio" type="number" step="0.0001" value="${tcVenta}" style="${inputStyle}">
          <span style="font-size:10px;color:var(--text-secondary)">SBS ${tcFecha || 'sin datos'}: ${tcVenta}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Capital ${tip('Monto principal del préstamo (sin intereses).')}</label>
          <input name="monto_capital" type="number" step="0.0001" min="0.01" required placeholder="0.00" style="${inputStyle}" oninput="window.calcTotal_${tipo}(this.form)">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Interés ${tip('Monto total de intereses sobre el capital. Si el préstamo es a S/ 10.000 con S/ 1.200 de intereses, va 1200 acá. 0 si no hay intereses.')}</label>
          <input name="monto_interes" type="number" step="0.0001" value="0" style="${inputStyle}" oninput="window.calcTotal_${tipo}(this.form)">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Total ${tip('Capital + Intereses. Se calcula automáticamente. Es la deuda total a pagar/cobrar.')}</label>
          <input name="monto_total_display" readonly placeholder="0.00" style="${inputStyle};background:#f8f9fa;font-weight:bold">
        </div>
      </div>

      <!-- Carga histórica: si el préstamo ya tuvo abonos antes de cargarse al ERP -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#fefce8;border:1px solid #fde68a;padding:10px;border-radius:6px">
        <div>
          <label style="font-size:11px;color:#92400e;font-weight:600">📅 ${esTomado ? 'Pagado' : 'Cobrado'} a la fecha (opcional) ${tip('Solo para carga HISTÓRICA: si ya ' + (esTomado ? 'pagaste abonos' : 'cobraste cuotas') + ' antes de subir el préstamo al sistema, ponelos acá. El saldo restante se calcula automáticamente. Si es un préstamo nuevo, dejalo en 0.')}</label>
          <input name="monto_pagado_inicial" type="number" step="0.0001" min="0" value="0" placeholder="0.00" style="${inputStyle}" oninput="window.calcSaldoInicial_${tipo}(this.form)">
        </div>
        <div>
          <label style="font-size:11px;color:#92400e;font-weight:600">Saldo restante (al día de hoy)</label>
          <input name="saldo_inicial_display" readonly placeholder="0.00" style="${inputStyle};background:#fff7ed;font-weight:bold;color:#78350f">
        </div>
      </div>

      <button type="submit" style="padding:11px;border:none;background:var(--bg-sidebar);color:white;border-radius:var(--radius-sm);cursor:pointer;font-weight:bold;font-size:13px;margin-top:4px;">
        ${esTomado ? 'Registrar Deuda' : 'Registrar Préstamo'}
      </button>
    </form>
  </div>`;
};

// ─── MODAL "+ Nuevo Préstamo" ─────────────────────────────────────────────────
// Antes el form vivía side-by-side con la tabla (flex 2:1) y se le montaba
// encima cuando la tabla tenía contenido ancho. Mismo patrón que Logística:
// botón "+ Nuevo" arriba a la derecha → modal overlay con el form adentro.
// Se cierra solo con el botón × (no por backdrop click — gotcha #28 CLAUDE.md).
let _tcCache = { valor_venta: 1, es_hoy: false, fecha: '' };

async function abrirModalNuevoPrestamo(tipo) {
  const tcVenta = _tcCache.valor_venta || 1;
  const tcFecha = _tcCache.es_hoy ? 'hoy' : (_tcCache.fecha || '');

  // Cargar contrapartes activas + medios de pago ya usados (autocomplete).
  // Caen-gracefully a [] si el endpoint falla — el form sigue funcionando.
  let contrapartes = [];
  let mediosPago   = [];
  try { contrapartes = await api.prestamos.getContrapartes(true); }
  catch { contrapartes = []; }
  try {
    const [t, o] = await Promise.all([
      api.prestamos.getTomados().catch(() => []),
      api.prestamos.getOtorgados().catch(() => []),
    ]);
    mediosPago = [...new Set([...t, ...o].map(p => p.medio_pago).filter(Boolean))];
  } catch { mediosPago = []; }

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px 20px;overflow-y:auto';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:8px;width:min(720px,95vw);box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:calc(100vh - 60px);overflow-y:auto;position:relative">
      <button data-close type="button" title="Cerrar sin guardar" aria-label="Cerrar" style="position:absolute;top:14px;right:14px;background:#fff;border:1px solid #d1d5db;border-radius:50%;width:30px;height:30px;font-size:18px;cursor:pointer;color:#64748b;z-index:10;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
      <div style="padding:8px">
        ${formCrear(tipo, tcVenta, tcFecha, contrapartes, mediosPago)}
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  ov.querySelector('[data-close]').onclick = () => ov.remove();
  bindFormCrearPrestamo(ov.querySelector(`#form-crear-${tipo}`), tipo, ov);

  // Botón "+ Nueva" abre un sub-modal para crear contraparte sin perder el form.
  ov.querySelector('[data-act="nueva-contraparte"]')?.addEventListener('click', async () => {
    const nueva = await modalNuevaContraparte();
    if (!nueva) return;
    // Refrescar el select del form principal con la nueva contraparte agregada
    // y seleccionarla automáticamente.
    const sel = ov.querySelector(`#form-crear-${tipo} [name=id_contraparte]`);
    if (sel) {
      const doc = nueva.documento_numero ? ` · ${nueva.documento_tipo || 'DOC'} ${nueva.documento_numero}` : '';
      const opt = document.createElement('option');
      opt.value = nueva.id_contraparte;
      opt.textContent = `${nueva.nombre}${doc}`;
      sel.appendChild(opt);
      sel.value = String(nueva.id_contraparte);
    }
  });
}

/**
 * Modal chico para crear contraparte sin salir del flujo del préstamo.
 * Retorna {id_contraparte, nombre, ...} o null si canceló.
 */
function modalNuevaContraparte() {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:22px;width:480px;max-width:96vw;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 6px;font-size:16px">➕ Nueva contraparte</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280;line-height:1.5">
          Se guarda una sola vez en el maestro. Después la podés vincular a múltiples préstamos.
        </p>
        <div style="display:grid;gap:10px">
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Nombre completo *</label>
            <input id="cp-nombre" placeholder="Jorge Roman Hurtado / Banco BCP / Promafa SAC" required
              style="${inputStyle}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Tipo</label>
              <select id="cp-tipo" style="${inputStyle}">
                <option value="PERSONA">Persona física</option>
                <option value="EMPRESA">Empresa</option>
                <option value="BANCO">Banco / Financiera</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Documento</label>
              <div style="display:flex;gap:4px">
                <select id="cp-doc-tipo" style="${inputStyle};max-width:80px">
                  <option value="">—</option>
                  <option value="DNI">DNI</option>
                  <option value="RUC">RUC</option>
                  <option value="CE">CE</option>
                </select>
                <input id="cp-doc-num" placeholder="Número" style="${inputStyle};flex:1">
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Teléfono</label>
              <input id="cp-telefono" style="${inputStyle}">
            </div>
            <div>
              <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Email</label>
              <input id="cp-email" type="email" style="${inputStyle}">
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:#374151;font-weight:600;display:block;margin-bottom:4px">Notas</label>
            <textarea id="cp-notas" rows="2" style="${inputStyle};resize:vertical"></textarea>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
          <button id="cp-cancel" type="button" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="cp-ok" type="button" style="padding:8px 22px;background:#7c3aed;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Crear</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#cp-cancel').onclick = () => close(null);
    ov.querySelector('#cp-ok').onclick = async () => {
      const nombre = ov.querySelector('#cp-nombre').value.trim();
      if (!nombre) return showError('Nombre requerido');
      try {
        const nueva = await api.prestamos.createContraparte({
          nombre,
          tipo:             ov.querySelector('#cp-tipo').value,
          documento_tipo:   ov.querySelector('#cp-doc-tipo').value || null,
          documento_numero: ov.querySelector('#cp-doc-num').value.trim() || null,
          telefono:         ov.querySelector('#cp-telefono').value.trim() || null,
          email:            ov.querySelector('#cp-email').value.trim() || null,
          notas:            ov.querySelector('#cp-notas').value.trim() || null,
        });
        showSuccess(`Contraparte "${nueva.nombre}" creada`);
        close(nueva);
      } catch (err) {
        showError(err.error || err.message || 'Error al crear contraparte');
      }
    };
  });
}

function bindFormCrearPrestamo(form, tipo, overlay) {
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const moneda = f.moneda.value || 'PEN';

    // Mig 071 — resolver nombre de la contraparte desde el select para
    // poblar el campo legacy `acreedor`/`deudor` también (compatibilidad
    // con vistas antiguas que aún leen ese string).
    const idCP = Number(f.id_contraparte.value) || null;
    const optCP = f.id_contraparte.selectedOptions[0];
    const nombreCP = optCP?.text?.split('·')[0].trim() || '';
    if (!idCP) {
      return showError('Elegí una contraparte del desplegable (o creá una nueva con "+ Nueva")');
    }

    const base = {
      nro_oc: f.nro_oc.value || null,
      descripcion: f.descripcion.value,
      comentario: f.comentario.value,
      fecha_emision: f.fecha_emision.value,
      fecha_vencimiento: f.fecha_vencimiento.value || null,
      moneda,
      tipo_cambio: moneda === 'USD' ? Number(f.tipo_cambio?.value) || 1 : 1,
      monto_capital: f.monto_capital.value,
      monto_interes: f.monto_interes.value || 0,
      tasa_interes: 0,
      // Mig 071
      id_contraparte: idCP,
      medio_pago: f.medio_pago?.value?.trim() || null,
      empresa:    f.empresa?.value || 'METAL',
    };
    try {
      if (tipo === 'tomado') {
        await api.prestamos.createTomado({
          ...base,
          acreedor: nombreCP, // legacy: mantenemos texto sincronizado con la contraparte
          monto_pagado_inicial: Number(f.monto_pagado_inicial?.value) || 0,
        });
        showSuccess('Préstamo tomado registrado');
      } else {
        await api.prestamos.createOtorgado({
          ...base,
          deudor: nombreCP,
          monto_cobrado_inicial: Number(f.monto_pagado_inicial?.value) || 0,
        });
        showSuccess('Préstamo otorgado registrado');
      }
      if (overlay) overlay.remove();
      window.navigate('prestamos');
    } catch (err) {
      showError(err.error || 'Error al registrar préstamo');
    }
  };
}

// Expone el opener para que el botón inline lo llame por onclick
window.abrirModalNuevoPrestamo = abrirModalNuevoPrestamo;

// ─── TABLA ─────────────────────────────────────────────────────────────────────
const buildTabla = (lista, tipo) => {
  const esTomado = tipo === 'tomado';
  const colContraparte = esTomado ? 'Acreedor' : 'Deudor';
  const colPagado = esTomado ? 'Pagado' : 'Cobrado';
  const accionPago = esTomado ? 'Pagar' : 'Cobrar';

  if (!lista.length) return `<p style="text-align:center;color:var(--text-secondary);padding:30px">Sin registros</p>`;

  const filas = lista.map(p => {
    const dias = Number(p.dias_transcurridos) || 0;
    const diasStyle = dias > 30 ? 'color:var(--danger);font-weight:bold' : '';
    const saldoStyle = Number(p.saldo) > 0 ? 'color:var(--danger);font-weight:bold' : 'color:var(--success)';
    const esUSD = p.moneda === 'USD';
    const tc = Number(p.tipo_cambio) || 1;
    const fmtCapital = esUSD ? formatUSD(p.monto_capital) : formatCurrency(p.monto_capital);
    const fmtTotal = esUSD ? formatUSD(p.monto_total) : formatCurrency(p.monto_total);
    const fmtSaldo = esUSD ? formatUSD(p.saldo) : formatCurrency(p.saldo);
    const totalPEN = esUSD ? Number(p.monto_total) * tc : null;
    const saldoPEN = esUSD ? Number(p.saldo) * tc : null;
    // Mig 071: el badge de empresa ahora viene del campo `empresa`
    // (METAL/PERFOTOOLS), no del de moneda (que igual puede ser PEN o USD
    // independientemente). Y mostramos contraparte_nombre del JOIN si está,
    // con fallback al texto legacy.
    const empresa     = p.empresa || 'METAL';
    const esPerfo     = empresa === 'PERFOTOOLS';
    const nombreCP    = p.contraparte_nombre || (esTomado ? p.acreedor : p.deudor) || '—';
    const medioPago   = p.medio_pago || '';
    return `
    <tr>
      <td style="font-size:11px;color:var(--text-secondary)">${escapeHtml(p.nro_oc || '---')}
        <br><span style="background:${esPerfo?'#dc2626':'#000'};color:white;padding:1px 6px;border-radius:3px;font-size:10px">${esPerfo?'🔴 Perfotools':'⚫ Metal Engineers'}</span>
      </td>
      <td>
        <strong>${escapeHtml(nombreCP)}</strong>
        ${medioPago ? `<br><span style="font-size:10px;color:#1e40af;background:#dbeafe;padding:1px 6px;border-radius:8px">🏦 ${escapeHtml(medioPago)}</span>` : ''}
        ${p.descripcion ? `<br><span style="font-size:10px;color:var(--text-secondary)">${escapeHtml(p.descripcion)}</span>` : ''}
      </td>
      <td style="font-size:11px">${formatDate(p.fecha_emision)}<br><span style="color:var(--text-secondary)">${p.fecha_vencimiento ? 'Vence: '+formatDate(p.fecha_vencimiento) : ''}</span></td>
      <td style="text-align:center;${diasStyle}">${dias}d</td>
      <td style="text-align:right">${fmtCapital}</td>
      <td style="text-align:right">${esUSD ? formatUSD(p.monto_interes) : formatCurrency(p.monto_interes)}</td>
      <td style="text-align:right;font-weight:bold">
        ${esUSD ? `<span style="color:#16a34a">${fmtTotal}</span>` : fmtTotal}
        ${totalPEN ? `<br><span style="font-size:10px;color:var(--text-secondary)">≈ ${formatCurrency(totalPEN)}</span>` : ''}
      </td>
      <td style="text-align:right">${esUSD ? formatUSD(p.monto_pagado) : formatCurrency(p.monto_pagado)}</td>
      <td style="text-align:right;${saldoStyle}">
        ${esUSD ? `<span style="color:#16a34a">${fmtSaldo}</span>` : fmtSaldo}
        ${saldoPEN ? `<br><span style="font-size:10px;color:var(--text-secondary)">≈ ${formatCurrency(saldoPEN)}</span>` : ''}
      </td>
      <td>${badge(p.estado)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${p.estado !== 'PAGADO' && p.estado !== 'COBRADO' ? `<button class="action-btn" style="background:var(--success);color:white;border:none;font-size:11px" onclick="window.registrarPago('${tipo}',${p.id_prestamo})">${accionPago}</button>` : ''}
          <button class="action-btn" style="font-size:11px" onclick="window.abrirEditar('${tipo}',${JSON.stringify(p).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;')})">Editar</button>
          <button class="action-btn" style="font-size:11px;color:var(--danger)" onclick="window.eliminarPrestamo('${tipo}',${p.id_prestamo})">Eliminar</button>
          ${p.estado !== 'ANULADO' ? `<button class="action-btn action-btn-anular" style="font-size:11px" onclick="window.anularPrestamo('${tipo}',${p.id_prestamo})">Anular</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div style="overflow-x:auto">
    <table style="min-width:900px">
      <thead>
        <tr>
          <th>N° OC</th><th>${colContraparte}</th><th>Fechas</th><th>Días</th>
          <th style="text-align:right">Capital</th><th style="text-align:right">Interés</th>
          <th style="text-align:right">Total</th><th style="text-align:right">${colPagado}</th>
          <th style="text-align:right">Saldo</th><th>Estado</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  </div>`;
};

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export const Prestamos = async () => {
  let tomados = [], otorgados = [], totales = { total_debo: 0, total_me_deben: 0 };
  let tcHoy = { valor_venta: 1, es_hoy: false, fecha: '' };
  try {
    [tomados, otorgados, totales, tcHoy] = await Promise.all([
      api.prestamos.getTomados(),
      api.prestamos.getOtorgados(),
      api.prestamos.getTotales(),
      api.tipoCambio.getHoy('USD').catch(() => ({ valor_venta: 1, es_hoy: false, fecha: '' }))
    ]);
    if (!Array.isArray(tomados)) tomados = [];
    if (!Array.isArray(otorgados)) otorgados = [];
  } catch(err) {
    console.error('[Prestamos] Error:', err);
  }

  // Mirror el TC del día a módulo-scope para que el modal "+ Nuevo" lo lea
  // (el modal se crea bajo demanda y necesita el TC para prefilear).
  _tcCache = tcHoy;

  // Helper compartido: recalcula saldo restante en el bloque de carga histórica
  const recalcSaldoInicial = (form) => {
    const total = Number(form.monto_total_display.value) || 0;
    const pagadoInicial = Math.max(0, Number(form.monto_pagado_inicial?.value) || 0);
    const saldo = Math.max(total - pagadoInicial, 0);
    if (form.saldo_inicial_display) form.saldo_inicial_display.value = saldo.toFixed(2);
  };

  setTimeout(() => {
    // Calcular total en formulario crear tomado
    window.calcTotal_tomado = (form) => {
      const c = Number(form.monto_capital.value) || 0;
      const i = Number(form.monto_interes.value) || 0;
      form.monto_total_display.value = (c + i).toFixed(2);
      recalcSaldoInicial(form);
    };
    window.calcTotal_otorgado = (form) => {
      const c = Number(form.monto_capital.value) || 0;
      const i = Number(form.monto_interes.value) || 0;
      form.monto_total_display.value = (c + i).toFixed(2);
      recalcSaldoInicial(form);
    };
    window.calcSaldoInicial_tomado   = recalcSaldoInicial;
    window.calcSaldoInicial_otorgado = recalcSaldoInicial;

    // Calcular total en modal editar
    window.calcEditTotal = () => {
      const c = Number(document.getElementById('edit-monto_capital').value) || 0;
      const i = Number(document.getElementById('edit-monto_interes').value) || 0;
      document.getElementById('edit-monto_total').value = (c + i).toFixed(2);
    };

    // Tabs
    let _chartInstances = {};
    const tabStyleActive = (bg) => `padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-weight:bold;background:${bg};color:white`;
    const tabStyleInactive = 'padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-weight:500;background:var(--bg-app);color:var(--text-primary)';

    window.showTab = (tab) => {
      document.getElementById('seccion-tomados').style.display   = tab === 'tomados'   ? 'block' : 'none';
      document.getElementById('seccion-otorgados').style.display = tab === 'otorgados' ? 'block' : 'none';
      document.getElementById('seccion-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
      document.getElementById('tab-tomados').style.cssText   = tab === 'tomados'   ? tabStyleActive('var(--danger)')        : tabStyleInactive;
      document.getElementById('tab-otorgados').style.cssText = tab === 'otorgados' ? tabStyleActive('var(--primary-color)') : tabStyleInactive;
      document.getElementById('tab-dashboard').style.cssText = tab === 'dashboard' ? tabStyleActive('#16a34a')              : tabStyleInactive;
      if (tab === 'dashboard') renderPrestamosDashboard();
    };

    async function renderPrestamosDashboard() {
      const panel = document.getElementById('seccion-dashboard');
      if (!panel || panel.dataset.rendered === '1') return;
      panel.dataset.rendered = '1';

      // Mig 071 — Resumen consolidado por contraparte. Lo cargamos primero
      // (async) y lo dejamos como sección destacada arriba del resto del
      // dashboard. Si falla, cae-gracefully sin reventar el dashboard viejo.
      let resumenContrapartes = null;
      try { resumenContrapartes = await api.prestamos.getResumenContrapartes(); }
      catch (e) { console.warn('[prest dashboard] resumen contrapartes falló:', e?.message); }

      // ──── KPIs ────
      const hoy = new Date();
      const ms30 = 30 * 24 * 60 * 60 * 1000;
      const vencidosT = tomados.filter(p => p.fecha_vencimiento && new Date(p.fecha_vencimiento) < hoy && Number(p.saldo) > 0.1);
      const vencidosO = otorgados.filter(p => p.fecha_vencimiento && new Date(p.fecha_vencimiento) < hoy && Number(p.saldo) > 0.1);
      const proximosT = tomados.filter(p => {
        if (!p.fecha_vencimiento || Number(p.saldo) <= 0.1) return false;
        const d = new Date(p.fecha_vencimiento);
        return d >= hoy && d <= new Date(hoy.getTime() + ms30);
      });
      const proximosO = otorgados.filter(p => {
        if (!p.fecha_vencimiento || Number(p.saldo) <= 0.1) return false;
        const d = new Date(p.fecha_vencimiento);
        return d >= hoy && d <= new Date(hoy.getTime() + ms30);
      });
      const deudaNeta = Number(totales.total_debo || 0) - Number(totales.total_me_deben || 0);
      const cumplimientoT = tomados.length > 0
        ? Math.round((tomados.filter(p => p.estado === 'PAGADO').length / tomados.length) * 100)
        : 0;

      // ──── Tendencia mensual 12 meses ────
      const tendencia = buildTendencia12m();
      // ──── Vencimientos 90 días ────
      const proximosTodos = [...proximosT.map(p => ({ ...p, _tipo: 'tomado' })),
                             ...proximosO.map(p => ({ ...p, _tipo: 'otorgado' }))]
        .sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento))
        .slice(0, 10);
      // ──── Top acreedores / deudores ────
      const topAcreedores = Object.entries(tomados.reduce((acc, p) => {
        const k = (p.acreedor || 'Sin nombre').trim();
        acc[k] = (acc[k] || 0) + Number(p.saldo || 0);
        return acc;
      }, {})).map(([label, valor]) => ({ label: label.slice(0, 22), valor }))
        .filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 5);
      const topDeudores = Object.entries(otorgados.reduce((acc, p) => {
        const k = (p.deudor || 'Sin nombre').trim();
        acc[k] = (acc[k] || 0) + Number(p.saldo || 0);
        return acc;
      }, {})).map(([label, valor]) => ({ label: label.slice(0, 22), valor }))
        .filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 5);

      // Render del bloque consolidado por contraparte (mig 071).
      // Top 5 por saldo + tabla detalle expandible por persona.
      const consolidadoHTML = (() => {
        if (!resumenContrapartes || !resumenContrapartes.contrapartes?.length) {
          return `<div class="card" style="margin-top:16px;padding:30px;text-align:center;color:var(--text-secondary);font-size:13px">
            📇 Sin contrapartes con préstamos vinculados todavía. Vinculá uno desde el form al crear / editar.
          </div>`;
        }
        const r = resumenContrapartes;
        const top5 = r.top5 || [];
        const filaTop = (c, idx) => {
          const totalGen = (Number(c.total_tomado) || 0) + (Number(c.total_otorgado) || 0);
          const saldoGen = (Number(c.saldo_tomado) || 0) + (Number(c.saldo_otorgado) || 0);
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #f3f4f6">
              <div style="width:24px;height:24px;border-radius:50%;background:${['#fbbf24','#94a3b8','#d97706','#cbd5e1','#cbd5e1'][idx] || '#cbd5e1'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px">${idx + 1}</div>
              <div style="flex:1">
                <div style="font-weight:600;font-size:13px">${escapeHtml(c.nombre)}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${(c.n_tomados || 0) + (c.n_otorgados || 0)} préstamo(s)</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:13px;font-weight:700;color:#dc2626">${formatCurrency(saldoGen)}</div>
                <div style="font-size:10px;color:var(--text-secondary)">de ${formatCurrency(totalGen)}</div>
              </div>
            </div>`;
        };
        // Tabla detalle expandible: una fila por contraparte; sub-filas con
        // los préstamos individuales (filtrados desde tomados+otorgados).
        const todosLosPrestamos = [
          ...tomados.map(p => ({ ...p, _tipo: 'tomado' })),
          ...otorgados.map(p => ({ ...p, _tipo: 'otorgado' })),
        ];
        const filaDetalle = (c) => {
          const totalGen = (Number(c.total_tomado) || 0) + (Number(c.total_otorgado) || 0);
          const saldoGen = (Number(c.saldo_tomado) || 0) + (Number(c.saldo_otorgado) || 0);
          const prestamos = todosLosPrestamos.filter(p => p.id_contraparte === c.id_contraparte);
          const subFilas = prestamos.map(p => {
            const esT = p._tipo === 'tomado';
            const empresa = p.empresa || 'METAL';
            return `<tr style="background:#fafafa;font-size:11px;color:#374151">
              <td style="padding:5px 10px 5px 38px">${escapeHtml(p.nro_oc || '—')}</td>
              <td style="padding:5px"><span style="background:${esT ? '#fef2f2' : '#ecfdf5'};color:${esT ? '#991b1b' : '#166534'};padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600">${esT ? 'TOMADO' : 'OTORGADO'}</span></td>
              <td style="padding:5px"><span style="font-size:10px">${empresa === 'PERFOTOOLS' ? '🔴 Perfo' : '⚫ Metal'}</span></td>
              <td style="padding:5px">${escapeHtml(p.medio_pago || '—')}</td>
              <td style="padding:5px;text-align:right">${formatCurrency(Number(p.monto_total) * (Number(p.tipo_cambio) || 1))}</td>
              <td style="padding:5px;text-align:right;color:${Number(p.saldo) > 0 ? '#dc2626' : '#16a34a'};font-weight:600">${formatCurrency(Number(p.saldo) * (Number(p.tipo_cambio) || 1))}</td>
              <td style="padding:5px;text-align:center">${badge(p.estado)}</td>
            </tr>`;
          }).join('');
          return `
            <tr data-fila="cp-${c.id_contraparte}" style="cursor:pointer;border-bottom:1px solid #e5e7eb"
                onclick="this.dataset.open=this.dataset.open==='1'?'0':'1';document.querySelectorAll('[data-sub=cp-${c.id_contraparte}]').forEach(r=>r.style.display=this.dataset.open==='1'?'table-row':'none');this.querySelector('.arrow').textContent=this.dataset.open==='1'?'▼':'▶'">
              <td style="padding:9px 10px"><span class="arrow" style="color:#9ca3af;margin-right:6px">▶</span><strong>${escapeHtml(c.nombre)}</strong>
                <span style="background:#e5e7eb;color:#374151;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:6px">${escapeHtml(c.tipo || 'OTRO')}</span>
              </td>
              <td style="padding:9px;text-align:center;font-size:12px">${(c.n_tomados || 0) + (c.n_otorgados || 0)}</td>
              <td style="padding:9px;text-align:right;font-weight:600">${formatCurrency(totalGen)}</td>
              <td style="padding:9px;text-align:right;color:${saldoGen > 0 ? '#dc2626' : '#16a34a'};font-weight:700">${formatCurrency(saldoGen)}</td>
            </tr>
            ${subFilas ? `
              <tr data-sub="cp-${c.id_contraparte}" style="display:none">
                <td colspan="4" style="padding:0;background:#fafafa">
                  <table style="width:100%;border-collapse:collapse;font-size:11px">
                    <thead><tr style="color:var(--text-secondary)">
                      <th style="padding:5px 10px 5px 38px;text-align:left;font-weight:500">N° Préstamo</th>
                      <th style="padding:5px;text-align:left;font-weight:500">Tipo</th>
                      <th style="padding:5px;text-align:left;font-weight:500">Empresa</th>
                      <th style="padding:5px;text-align:left;font-weight:500">Medio</th>
                      <th style="padding:5px;text-align:right;font-weight:500">Total</th>
                      <th style="padding:5px;text-align:right;font-weight:500">Saldo</th>
                      <th style="padding:5px;text-align:center;font-weight:500">Estado</th>
                    </tr></thead>
                    <tbody>${subFilas}</tbody>
                  </table>
                </td>
              </tr>` : ''}
          `;
        };
        return `
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-top:16px">
            <div class="card">
              <h3 style="margin-bottom:6px;font-size:14px">🏆 Top contrapartes por saldo</h3>
              <p style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Quién más debe o a quién más debemos (combinado, ranking por saldo pendiente).</p>
              ${top5.map(filaTop).join('') || '<p style="padding:20px;color:var(--text-secondary);font-size:12px;text-align:center">Sin movimientos</p>'}
            </div>
            <div class="card">
              <h3 style="margin-bottom:6px;font-size:14px">📋 Detalle consolidado por contraparte</h3>
              <p style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Click en cada fila para ver el desglose de préstamos individuales.</p>
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-secondary)">Contraparte</th>
                    <th style="padding:9px;text-align:center;font-size:11px;color:var(--text-secondary)">N° préstamos</th>
                    <th style="padding:9px;text-align:right;font-size:11px;color:var(--text-secondary)">Total</th>
                    <th style="padding:9px;text-align:right;font-size:11px;color:var(--text-secondary)">Saldo pendiente</th>
                  </tr>
                </thead>
                <tbody>${r.contrapartes.map(filaDetalle).join('')}</tbody>
              </table>
            </div>
          </div>`;
      })();

      panel.innerHTML = `
        <div style="margin-top:16px">
          ${consolidadoHTML}

          <h3 style="margin:24px 0 12px;font-size:14px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px">📊 KPIs operativos</h3>
          ${kpiGrid([
            { label: 'Deuda Neta',       value: formatCurrency(deudaNeta), icon: '⚖️', changeType: deudaNeta > 0 ? 'negative' : 'positive' },
            { label: 'Total Debo',       value: formatCurrency(totales.total_debo),       icon: '🔴' },
            { label: 'Total Me Deben',   value: formatCurrency(totales.total_me_deben),   icon: '🟢' },
            { label: 'Préstamos Activos',value: (tomados.length + otorgados.length),      icon: '📋' },
            { label: 'Vencidos',         value: (vencidosT.length + vencidosO.length),    icon: '⚠️', changeType: (vencidosT.length + vencidosO.length) > 0 ? 'negative' : 'neutral' },
            { label: 'Vencen ≤30d',      value: (proximosT.length + proximosO.length),    icon: '📅', changeType: (proximosT.length + proximosO.length) > 0 ? 'negative' : 'neutral' },
            { label: 'Abonos registrados (t)', value: tomados.reduce((s,p) => s + Number(p.monto_pagado||0), 0) > 0 ? formatCurrency(tomados.reduce((s,p) => s + Number(p.monto_pagado||0), 0)) : 'S/ 0.00', icon: '💸' },
            { label: '% Préstamos pagados', value: cumplimientoT + '%', icon: '✅', changeType: cumplimientoT >= 50 ? 'positive' : 'neutral' },
          ], 4)}

          <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:20px">
            <div class="card">
              <h3 style="margin-bottom:14px;font-size:14px">Tendencia mensual (últimos 12 meses)</h3>
              <p style="font-size:11px;color:var(--text-secondary);margin-bottom:12px">Evolución de préstamos TOMADOS (rojo) vs OTORGADOS (verde) registrados por mes.</p>
              <div style="height:260px"><canvas id="chart-tendencia-prest"></canvas></div>
            </div>
            <div class="card">
              <h3 style="margin-bottom:14px;font-size:14px">⚠️ Próximos vencimientos</h3>
              ${proximosTodos.length ? `
                <div style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto">
                  ${proximosTodos.map(p => {
                    const d = new Date(p.fecha_vencimiento);
                    const diasRest = Math.ceil((d - hoy) / (24*60*60*1000));
                    const urgente = diasRest <= 7;
                    const contraparte = p._tipo === 'tomado' ? p.acreedor : p.deudor;
                    return `<div style="padding:10px;border-left:3px solid ${urgente ? '#dc2626' : '#f59e0b'};background:${urgente ? '#fef2f2' : '#fffbeb'};border-radius:4px">
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <strong style="font-size:12px">${escapeHtml(contraparte.slice(0, 24))}</strong>
                        <span style="font-size:10px;padding:1px 6px;border-radius:10px;background:${p._tipo === 'tomado' ? '#dc2626' : '#16a34a'};color:white">${p._tipo === 'tomado' ? 'Pago' : 'Cobro'}</span>
                      </div>
                      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px">
                        <span style="color:var(--text-secondary)">${String(p.fecha_vencimiento).split('T')[0]}</span>
                        <span style="font-weight:700;color:${urgente ? '#dc2626' : '#92400e'}">${formatCurrency(p.saldo)} · ${diasRest}d</span>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              ` : `<p style="padding:30px;text-align:center;color:var(--text-secondary);font-size:12px">Sin vencimientos en los próximos 30 días 🎉</p>`}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
            <div class="card">
              <h3 style="margin-bottom:14px;font-size:14px">🔴 Top 5 Acreedores (a quién le debo)</h3>
              ${topAcreedores.length ? `<div style="height:220px"><canvas id="chart-top-acreedores"></canvas></div>`
                : '<p style="padding:30px;text-align:center;color:var(--text-secondary);font-size:12px">Sin deudas activas.</p>'}
            </div>
            <div class="card">
              <h3 style="margin-bottom:14px;font-size:14px">🟢 Top 5 Deudores (quién me debe)</h3>
              ${topDeudores.length ? `<div style="height:220px"><canvas id="chart-top-deudores"></canvas></div>`
                : '<p style="padding:30px;text-align:center;color:var(--text-secondary);font-size:12px">Sin préstamos otorgados activos.</p>'}
            </div>
          </div>
        </div>
      `;

      setTimeout(() => {
        destroyChart(_chartInstances.tendencia);
        destroyChart(_chartInstances.topAcr);
        destroyChart(_chartInstances.topDeu);

        // Chart línea doble: tomados vs otorgados
        if (window.Chart) {
          const ctx = document.getElementById('chart-tendencia-prest');
          if (ctx) {
            _chartInstances.tendencia = new window.Chart(ctx, {
              type: 'line',
              data: {
                labels: tendencia.map(t => t.mes),
                datasets: [
                  {
                    label: 'Préstamos Tomados',
                    data: tendencia.map(t => t.tomado),
                    borderColor: chartColors.danger,
                    backgroundColor: chartColors.danger + '22',
                    fill: true, tension: 0.3,
                  },
                  {
                    label: 'Préstamos Otorgados',
                    data: tendencia.map(t => t.otorgado),
                    borderColor: chartColors.success,
                    backgroundColor: chartColors.success + '22',
                    fill: true, tension: 0.3,
                  },
                ],
              },
              options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
                scales: { y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + v.toLocaleString() } } },
              },
            });
          }
        }

        if (topAcreedores.length) {
          _chartInstances.topAcr = barChart('#chart-top-acreedores', topAcreedores, {
            colors: topAcreedores.map(() => chartColors.danger),
          });
        }
        if (topDeudores.length) {
          _chartInstances.topDeu = barChart('#chart-top-deudores', topDeudores, {
            colors: topDeudores.map(() => chartColors.success),
          });
        }
      }, 100);
    }

    function buildTendencia12m() {
      const buckets = {};
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        buckets[k] = { tomado: 0, otorgado: 0 };
      }
      tomados.forEach(p => {
        if (!p.fecha_emision) return;
        const k = String(p.fecha_emision).slice(0, 7);
        if (k in buckets) {
          const tc = p.moneda === 'USD' ? Number(p.tipo_cambio) || 1 : 1;
          buckets[k].tomado += Number(p.monto_total || 0) * tc;
        }
      });
      otorgados.forEach(p => {
        if (!p.fecha_emision) return;
        const k = String(p.fecha_emision).slice(0, 7);
        if (k in buckets) {
          const tc = p.moneda === 'USD' ? Number(p.tipo_cambio) || 1 : 1;
          buckets[k].otorgado += Number(p.monto_total || 0) * tc;
        }
      });
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return Object.entries(buckets).map(([k, v]) => {
        const [y, m] = k.split('-');
        return { mes: `${meses[+m - 1]} ${y.slice(2)}`, tomado: Number(v.tomado.toFixed(2)), otorgado: Number(v.otorgado.toFixed(2)) };
      });
    }

    // (El submit de "+ Nuevo Préstamo" ahora se bindea dentro del modal —
    // ver bindFormCrearPrestamo en el módulo-scope.)

    // Pagar / Cobrar
    window.registrarPago = async (tipo, id) => {
      const monto = prompt(tipo === 'tomado' ? 'Monto a pagar (S/.)' : 'Monto cobrado (S/.)');
      if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) return;
      try {
        const res = tipo === 'tomado'
          ? await api.prestamos.pagarTomado(id, Number(monto))
          : await api.prestamos.cobrarOtorgado(id, Number(monto));
        showSuccess('Registrado. Estado: ' + res.estado);
        window.navigate('prestamos');
      } catch(err) { showError(err.error || 'Error al registrar pago'); }
    };

    // Eliminar
    window.eliminarPrestamo = async (tipo, id) => {
      if (!confirm('¿Eliminar este préstamo? Solo es posible si no tiene pagos.')) return;
      try {
        tipo === 'tomado' ? await api.prestamos.deleteTomado(id) : await api.prestamos.deleteOtorgado(id);
        window.navigate('prestamos');
      } catch(err) { showError(err.error || err.message || 'Error al eliminar préstamo'); }
    };

    // Anular
    window.anularPrestamo = async (tipo, id) => {
      if (!confirm('¿Anular este préstamo?')) return;
      try {
        tipo === 'tomado' ? await api.prestamos.anularTomado(id) : await api.prestamos.anularOtorgado(id);
        window.navigate('prestamos');
      } catch(err) { showError(err.error || 'Error al anular'); }
    };

    // Modal editar — abrir
    window.abrirEditar = (tipo, p) => {
      document.getElementById('edit-id').value = p.id_prestamo;
      document.getElementById('edit-tipo').value = tipo;
      document.getElementById('modal-titulo').textContent = 'Editar Préstamo ' + (tipo === 'tomado' ? 'Tomado' : 'Otorgado');
      document.getElementById('edit-label-contraparte').textContent = tipo === 'tomado' ? 'Acreedor' : 'Deudor';
      document.getElementById('edit-nro_oc').value = p.nro_oc || '';
      document.getElementById('edit-contraparte').value = tipo === 'tomado' ? p.acreedor : p.deudor;
      document.getElementById('edit-descripcion').value = p.descripcion || '';
      document.getElementById('edit-comentario').value = p.comentario || '';
      document.getElementById('edit-fecha_emision').value = formatDate(p.fecha_emision);
      document.getElementById('edit-fecha_vencimiento').value = formatDate(p.fecha_vencimiento) === '---' ? '' : formatDate(p.fecha_vencimiento);
      document.getElementById('edit-monto_capital').value = p.monto_capital;
      document.getElementById('edit-monto_interes').value = p.monto_interes;
      document.getElementById('edit-monto_total').value = Number(p.monto_total).toFixed(2);
      document.getElementById('modal-editar-prestamo').style.display = 'flex';
    };

    window.cerrarModalEditar = () => {
      document.getElementById('modal-editar-prestamo').style.display = 'none';
    };

    // Modal editar — guardar
    const formEditar = document.getElementById('form-editar-prestamo');
    if (formEditar) formEditar.onsubmit = async (e) => {
      e.preventDefault();
      const id = Number(document.getElementById('edit-id').value);
      const tipo = document.getElementById('edit-tipo').value;
      const contraparte = document.getElementById('edit-contraparte').value;
      const data = {
        nro_oc: document.getElementById('edit-nro_oc').value || null,
        [tipo === 'tomado' ? 'acreedor' : 'deudor']: contraparte,
        descripcion: document.getElementById('edit-descripcion').value,
        comentario: document.getElementById('edit-comentario').value,
        fecha_emision: document.getElementById('edit-fecha_emision').value,
        fecha_vencimiento: document.getElementById('edit-fecha_vencimiento').value || null,
        monto_capital: Number(document.getElementById('edit-monto_capital').value),
        monto_interes: Number(document.getElementById('edit-monto_interes').value) || 0,
        tasa_interes: 0
      };
      try {
        tipo === 'tomado' ? await api.prestamos.updateTomado(id, data) : await api.prestamos.updateOtorgado(id, data);
        showSuccess('Actualizado correctamente');
        window.navigate('prestamos');
      } catch(err) { showError(err.error || 'Error al actualizar'); }
    };

    // Banner PerfoTools USD en préstamos
    window.toggleMonedaPrestamo = (sel, tipo) => {
      const isUSD = sel.value === 'USD';
      const divTC = document.getElementById('div-tc-' + tipo);
      if (divTC) divTC.style.display = isUSD ? 'block' : 'none';
      const banner = document.getElementById('banner-usd-' + tipo);
      const form = document.getElementById('form-crear-' + tipo);
      if (banner) banner.style.display = isUSD ? 'block' : 'none';
      if (form) form.style.border = isUSD ? '2px solid #16a34a' : '';
    };

    // Namespace por módulo
    window.Prestamos = {
      calcTotal_tomado:    window.calcTotal_tomado,
      calcTotal_otorgado:  window.calcTotal_otorgado,
      calcEditTotal:       window.calcEditTotal,
      showTab:             window.showTab,
      registrarPago:       window.registrarPago,
      eliminarPrestamo:    window.eliminarPrestamo,
      anularPrestamo:      window.anularPrestamo,
      abrirEditar:         window.abrirEditar,
      cerrarModalEditar:   window.cerrarModalEditar,
      toggleMonedaPrestamo: window.toggleMonedaPrestamo,
    };

    // Init tab activo
    window.showTab('tomados');
  }, 100);

  const tabBase = 'padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-weight:bold';

  return `
    ${modalEditar()}

    <header class="header">
      <div>
        <h1>Gestión de Préstamos</h1>
        <span style="color:var(--text-secondary)">Control de deudas y créditos otorgados con seguimiento de pagos y vencimientos.</span>
      </div>
    </header>

    <!-- Tarjetas resumen — usa kpiGrid para consistencia con Logística / Dashboard.
         Antes tenía font-size:28px hardcoded que rompía la consistencia visual
         con el resto del ERP. Ahora hereda los tamaños responsive del kpi system. -->
    ${kpiGrid([
      {
        label: 'Total que Debo',
        value: formatCurrency(totales.total_debo),
        change: 'Saldo pendiente préstamos tomados',
        changeType: 'neutral',
        icon: '🔴',
        accent: Number(totales.total_debo) > 0 ? 'danger' : '',
      },
      {
        label: 'Total que Me Deben',
        value: formatCurrency(totales.total_me_deben),
        change: 'Saldo pendiente préstamos otorgados',
        changeType: 'neutral',
        icon: '🟢',
        accent: Number(totales.total_me_deben) > 0 ? 'success' : '',
      },
    ], 2)}

    <!-- Tabs -->
    <div style="display:flex;gap:10px;margin-top:24px;margin-bottom:0;flex-wrap:wrap">
      <button id="tab-tomados"   onclick="window.showTab('tomados')"   style="${tabBase};background:var(--danger);color:white">🔴 Préstamos Tomados (Lo que debo)</button>
      <button id="tab-otorgados" onclick="window.showTab('otorgados')" style="${tabBase};background:var(--bg-app);color:var(--text-primary)">🟢 Préstamos Otorgados (Lo que me deben)</button>
      <button id="tab-dashboard" onclick="window.showTab('dashboard')" style="${tabBase};background:var(--bg-app);color:var(--text-primary)">📊 Dashboard</button>
    </div>

    <!-- SECCIÓN TOMADOS -->
    <div id="seccion-tomados" style="margin-top:16px">
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button onclick="window.abrirModalNuevoPrestamo('tomado')" title="Registrar una nueva deuda" style="padding:9px 18px;border:none;background:var(--bg-sidebar);color:#fff;border-radius:var(--radius-sm);cursor:pointer;font-weight:600;font-size:13px">+ Nuevo Préstamo Tomado</button>
      </div>
      <div class="table-container">
        ${buildTabla(tomados, 'tomado')}
      </div>
    </div>

    <!-- SECCIÓN OTORGADOS -->
    <div id="seccion-otorgados" style="display:none;margin-top:16px">
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button onclick="window.abrirModalNuevoPrestamo('otorgado')" title="Registrar un nuevo préstamo otorgado" style="padding:9px 18px;border:none;background:var(--bg-sidebar);color:#fff;border-radius:var(--radius-sm);cursor:pointer;font-weight:600;font-size:13px">+ Nuevo Préstamo Otorgado</button>
      </div>
      <div class="table-container">
        ${buildTabla(otorgados, 'otorgado')}
      </div>
    </div>

    <!-- SECCIÓN DASHBOARD -->
    <div id="seccion-dashboard" style="display:none"></div>
  `;
};

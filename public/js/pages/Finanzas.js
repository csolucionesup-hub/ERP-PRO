import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';

// ── Config visual (paralelo a Comercial.js) ──────────────────────
const MARCAS = {
  METAL: {
    label:    'Metal Engineers',
    moneda:   'PEN',
    color:    '#000000',
    sufijo:   'MN',
    logoHTML: `<img src="/img/logo-metal.png" alt="Metal" style="height:32px">`,
  },
  PERFOTOOLS: {
    label:    'Perfotools',
    moneda:   'USD',
    color:    '#dc2626',
    sufijo:   'ME',
    logoHTML: `<img src="/img/logo-perfotools.png" alt="Perfotools" style="height:34px"
                  onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'PERFOTOOLS',style:'font-weight:800;color:#dc2626;letter-spacing:1px'}))">`,
  },
};

const ESTADO_FIN_COLOR = {
  PENDIENTE_DEPOSITO:               { bg: '#6b7280', label: 'PENDIENTE DEPÓSITO' },
  BANCO_PARCIAL:                    { bg: '#f59e0b', label: 'PAGO PARCIAL' },
  BANCO_OK_DETRACCION_PENDIENTE:    { bg: '#eab308', label: 'FALTA DETRACCIÓN' },
  FONDEADA_TOTAL:                   { bg: '#22c55e', label: 'FONDEADA' },
  SIN_DETRACCION_FONDEADA:          { bg: '#22c55e', label: 'FONDEADA' },
  FACTURADA:                        { bg: '#3b82f6', label: 'FACTURADA' },
  COBRADA:                          { bg: '#8b5cf6', label: 'COBRADA' },
};

const fMoney = (v, moneda) => {
  const n = Number(v) || 0;
  return moneda === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
    : new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n);
};

const estadoBadge = (estado) => {
  const c = ESTADO_FIN_COLOR[estado] || { bg: '#9ca3af', label: estado };
  return `<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${c.bg};color:#fff">${c.label}</span>`;
};

const semaforoDias = (dias) => {
  const d = Number(dias) || 0;
  const color = d <= 3 ? '#22c55e' : d <= 10 ? '#f59e0b' : '#dc2626';
  return `<span style="font-weight:600;color:${color}">${d} d</span>`;
};

// ── Render fila de cotización ───────────────────────────────────
function rowCotizacion(c, marca) {
  const cfg = MARCAS[marca];
  const detraccion    = Number(c.monto_detraccion || 0);
  const retencion     = Number(c.monto_retencion  || 0);
  const esperadoBanco = Number(c.total) - detraccion - retencion;
  const cobradoBanco  = Number(c.monto_cobrado_banco) || 0;
  const cobradoDet    = Number(c.monto_cobrado_detraccion) || 0;
  const aplicaDetra   = detraccion > 0;
  const aplicaRet     = retencion > 0;

  const fAprobC = c.fecha_aprobacion_comercial
    ? new Date(c.fecha_aprobacion_comercial).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' })
    : null;

  return `
    <tr data-id="${c.id_cotizacion}">
      <td style="font-weight:600">
        <div>${c.nro_cotizacion || '—'}</div>
        ${fAprobC ? `<div style="font-size:10px;color:#16a34a;font-weight:500" title="Aprobada en Comercial">✓ ${fAprobC}</div>` : ''}
      </td>
      <td>
        <div style="font-weight:600">${c.cliente || '—'}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${c.proyecto || ''}</div>
      </td>
      <td style="text-align:right">${fMoney(c.total, c.moneda)}</td>
      <td style="text-align:right;color:#1e40af">
        <div>${fMoney(c.igv, c.moneda)}</div>
        <div style="font-size:10px;color:#6b7280">IGV 18%</div>
      </td>
      <td style="text-align:right">
        <div>${fMoney(esperadoBanco, c.moneda)}</div>
        ${cobradoBanco + 0.01 >= esperadoBanco && esperadoBanco > 0
          ? `<div style="font-size:10px;color:#16a34a;font-weight:600">✓ Cobrado completo</div>`
          : `<div style="font-size:10px;color:var(--text-secondary)">Cobrado: ${fMoney(cobradoBanco, c.moneda)} · Falta: <span style="color:#dc2626">${fMoney(Math.max(0, esperadoBanco - cobradoBanco), c.moneda)}</span></div>`
        }
      </td>
      <td style="text-align:right">
        ${aplicaDetra ? `<div>${fMoney(detraccion, c.moneda)} <span style="color:#9ca3af">(${Number(c.detraccion_porcentaje)}%)</span></div>
          ${cobradoDet + 0.01 >= detraccion
            ? `<div style="font-size:10px;color:#16a34a;font-weight:600">✓ Cobrado completo</div>`
            : `<div style="font-size:10px;color:var(--text-secondary)">Cobrado: ${fMoney(cobradoDet, c.moneda)} · Falta: <span style="color:#dc2626">${fMoney(detraccion - cobradoDet, c.moneda)}</span></div>`
          }` : '<span style="color:#9ca3af">N/A</span>'}
      </td>
      <td style="text-align:right">
        ${aplicaRet ? `<div style="color:#7c3aed">${fMoney(retencion, c.moneda)}</div>
          <div style="font-size:10px;color:#9ca3af">${Number(c.retencion_porcentaje)}% agente</div>` : '<span style="color:#9ca3af">—</span>'}
      </td>
      <td style="text-align:center">${semaforoDias(c.dias_esperando)}</td>
      <td>${estadoBadge(c.estado_financiero)}</td>
      <td style="text-align:right">
        <button class="btn-registrar" data-id="${c.id_cotizacion}"
          style="padding:6px 12px;background:${cfg.color};color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">
          + Cobranza
        </button>
        <button class="btn-detalle" data-id="${c.id_cotizacion}"
          style="padding:6px 10px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-size:11px;margin-left:4px">
          Detalle
        </button>
      </td>
    </tr>
  `;
}

function renderBandeja(titulo, lista, marca, opciones = {}) {
  const cfg = MARCAS[marca];
  const colDetraccion = opciones.mostrarDetraccion !== false;

  if (!lista.length) {
    return `
      <div class="card" style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px">
        ${opciones.mensajeVacio || 'No hay cotizaciones en esta bandeja'}
      </div>
    `;
  }

  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
        <h3 style="margin:0;font-size:14px;font-weight:600">${titulo}</h3>
        <span style="background:${cfg.color};color:#fff;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600">${lista.length}</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
            <tr style="text-align:left">
              <th style="padding:9px 12px">Nº Cotización</th>
              <th style="padding:9px 12px">Cliente / Proyecto</th>
              <th style="padding:9px 12px;text-align:right">Total</th>
              <th style="padding:9px 12px;text-align:right">IGV</th>
              <th style="padding:9px 12px;text-align:right">Neto al banco</th>
              <th style="padding:9px 12px;text-align:right">Detracción</th>
              <th style="padding:9px 12px;text-align:right">Retención</th>
              <th style="padding:9px 12px;text-align:center">Espera</th>
              <th style="padding:9px 12px">Estado</th>
              <th style="padding:9px 12px;text-align:right">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(c => rowCotizacion(c, marca)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Tab por marca ───────────────────────────────────────────────
function renderTabMarca(marca, data) {
  const cfg = MARCAS[marca];
  const esUSD = marca === 'PERFOTOOLS';

  // Totales
  const sumTotal = (lista, key) => lista.reduce((s, c) => s + (Number(c[key]) || 0), 0);
  const totalPipeline = sumTotal(
    [...data.esperando_pago, ...data.esperando_detraccion],
    'total'
  );
  const detraccionPendiente = data.esperando_detraccion.reduce((s, c) =>
    s + (Number(c.monto_detraccion) - Number(c.monto_cobrado_detraccion || 0)), 0
  );

  return `
    <!-- Header con KPIs -->
    <div class="card" style="border-top:4px solid ${cfg.color};margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          ${cfg.logoHTML}
          <h3 style="margin:0;font-size:15px;font-weight:600">Cobranzas · ${cfg.label}</h3>
        </div>
        <button class="btn-refresh" data-marca="${marca}"
          style="padding:7px 14px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:12px">
          🔄 Refrescar
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div style="padding:10px;background:#f9fafb;border-radius:6px">
          <div style="font-size:11px;color:var(--text-secondary)">Esperando pago</div>
          <div style="font-size:20px;font-weight:700;color:#6b7280">${data.esperando_pago.length}</div>
        </div>
        <div style="padding:10px;background:#fef3c7;border-radius:6px">
          <div style="font-size:11px;color:#92400e">Esperando detracción</div>
          <div style="font-size:20px;font-weight:700;color:#92400e">${data.esperando_detraccion.length}</div>
        </div>
        <div style="padding:10px;background:#dcfce7;border-radius:6px">
          <div style="font-size:11px;color:#166534">Cobradas (período)</div>
          <div style="font-size:20px;font-weight:700;color:#166534">${data.cobradas.length}</div>
        </div>
        <div style="padding:10px;background:#dbeafe;border-radius:6px">
          <div style="font-size:11px;color:#1e40af">Pipeline activo</div>
          <div style="font-size:16px;font-weight:700;color:#1e40af">${fMoney(totalPipeline, cfg.moneda)}</div>
          ${!esUSD && detraccionPendiente > 0
            ? `<div style="font-size:10px;color:#92400e;margin-top:2px">+${fMoney(detraccionPendiente,'PEN')} en BN pendiente</div>`
            : ''}
        </div>
      </div>
    </div>

    <!-- Bandejas -->
    <div style="display:flex;flex-direction:column;gap:14px">
      ${renderBandeja('🔴 Esperando depósito principal', data.esperando_pago, marca,
        { mensajeVacio: 'Sin cotizaciones esperando pago — todo al día ✅' })}
      ${!esUSD ? renderBandeja('🟡 Esperando detracción en Banco de la Nación', data.esperando_detraccion, marca,
        { mensajeVacio: 'No hay detracciones pendientes' }) : ''}
      ${renderBandeja('🟢 Cobradas', data.cobradas, marca,
        { mensajeVacio: 'Aún no hay cobros completos en este período' })}
    </div>
  `;
}

// ── Modal: Registrar cobranza ───────────────────────────────────
async function modalRegistrarCobranza(cot, cuentas) {
  const aplicaDetra = Number(cot.monto_detraccion) > 0;
  const esperadoBanco = Number(cot.total) - Number(cot.monto_detraccion || 0) - Number(cot.monto_retencion || 0);
  const faltaBanco = Math.max(0, esperadoBanco - Number(cot.monto_cobrado_banco || 0));
  const faltaDet   = Math.max(0, Number(cot.monto_detraccion || 0) - Number(cot.monto_cobrado_detraccion || 0));
  const cfg = MARCAS[cot.marca] || MARCAS.METAL;
  // Las cuentas se filtrarán según el tipo de movimiento seleccionado.
  // Reglas:
  //   DEPOSITO_BANCO  → tipo BANCO o EFECTIVO (de la moneda de la cotización)
  //   DETRACCION_BN   → tipo DETRACCION (siempre PEN)
  //   RETENCION       → ninguna (es un certificado, no dinero)
  const cuentasPorTipo = (tipoMov) => {
    if (tipoMov === 'DETRACCION_BN') {
      return cuentas.filter(c => c.tipo === 'DETRACCION');
    }
    if (tipoMov === 'RETENCION') return [];
    return cuentas.filter(c =>
      (c.tipo === 'BANCO' || c.tipo === 'EFECTIVO') && c.moneda === cot.moneda
    );
  };
  const cuentasIniciales = cuentasPorTipo('DEPOSITO_BANCO');

  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px;overflow:auto';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;max-width:560px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
        <div style="padding:18px 22px;border-top:4px solid ${cfg.color};border-bottom:1px solid #e5e7eb">
          <h3 style="margin:0 0 4px 0;font-size:15px">Registrar cobranza</h3>
          <div style="font-size:12px;color:var(--text-secondary)">
            ${cot.nro_cotizacion} · ${cot.cliente} · Total ${fMoney(cot.total, cot.moneda)}
          </div>
        </div>

        <div style="padding:16px 22px">
          <!-- Resumen -->
          <div style="background:#f9fafb;padding:10px;border-radius:6px;margin-bottom:12px;font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div><strong>Neto al banco:</strong> ${fMoney(esperadoBanco, cot.moneda)}</div>
            <div><strong>Cobrado banco:</strong> ${fMoney(cot.monto_cobrado_banco, cot.moneda)} <span style="color:#dc2626">(falta ${fMoney(faltaBanco, cot.moneda)})</span></div>
            ${aplicaDetra ? `
              <div><strong>Detracción:</strong> ${fMoney(cot.monto_detraccion, cot.moneda)} (${cot.detraccion_porcentaje}%)</div>
              <div><strong>Cobrada det:</strong> ${fMoney(cot.monto_cobrado_detraccion, cot.moneda)} <span style="color:#dc2626">(falta ${fMoney(faltaDet, cot.moneda)})</span></div>
            ` : `<div style="grid-column:span 2;color:#16a34a">Esta cotización no aplica detracción</div>`}
          </div>

          <form id="form-cob" style="display:flex;flex-direction:column;gap:10px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary)">Tipo de movimiento *</label>
              <select name="tipo" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px">
                <option value="DEPOSITO_BANCO">Depósito en banco regular</option>
                ${aplicaDetra ? `<option value="DETRACCION_BN">Depósito de detracción (Banco de la Nación)</option>` : ''}
                <option value="RETENCION">Retención (cliente agente)</option>
              </select>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">Fecha *</label>
                <input name="fecha_movimiento" type="date" required value="${new Date().toISOString().slice(0,10)}"
                  style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">Monto (${cot.moneda}) *</label>
                <input name="monto" type="number" step="0.01" required min="0.01" value="${faltaBanco.toFixed(2)}"
                  style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px">
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">Cuenta destino</label>
                <select name="id_cuenta" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px">
                  <option value="">— Sin asignar —</option>
                  ${cuentasIniciales.map(c => `<option value="${c.id_cuenta}">${c.nombre} (${c.moneda})</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">Banco / Operación</label>
                <input name="banco" placeholder="ej: BCP" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px">
              </div>
            </div>

            <div>
              <label style="font-size:11px;color:var(--text-secondary)">Nº de operación / voucher</label>
              <input name="nro_operacion" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px">
            </div>

            <div>
              <label style="font-size:11px;color:var(--text-secondary)">Comentario</label>
              <textarea name="comentario" rows="2" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px;resize:vertical"></textarea>
            </div>
          </form>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <button id="cob-cancel" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="cob-ok" style="padding:8px 18px;border:none;background:${cfg.color};color:#fff;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Registrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    const form = ov.querySelector('#form-cob');

    // Auto-ajuste del monto y del dropdown de cuentas al cambiar el tipo
    form.tipo.addEventListener('change', (e) => {
      const tipo = e.target.value;
      // Monto sugerido
      const sugerido = tipo === 'DETRACCION_BN' ? faltaDet
                      : tipo === 'RETENCION'    ? Number(cot.monto_retencion || 0)
                      : faltaBanco;
      form.monto.value = sugerido.toFixed(2);

      // Cuentas disponibles
      const opts = cuentasPorTipo(tipo);
      form.id_cuenta.innerHTML = `<option value="">— Sin asignar —</option>` +
        opts.map(c => `<option value="${c.id_cuenta}">${c.nombre} (${c.moneda})</option>`).join('');
      form.id_cuenta.disabled = opts.length === 0;
      if (opts.length === 0) {
        form.id_cuenta.innerHTML = `<option value="">— No aplica —</option>`;
      } else if (tipo === 'DETRACCION_BN' && opts.length === 1) {
        // Auto-seleccionar la única cuenta BN
        form.id_cuenta.value = opts[0].id_cuenta;
      }
    });

    ov.querySelector('#cob-cancel').onclick = () => close(null);
    ov.onclick = (e) => { if (e.target === ov) close(null); };
    ov.querySelector('#cob-ok').onclick = () => {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.id_cotizacion = cot.id_cotizacion;
      data.monto = Number(data.monto);
      if (data.id_cuenta === '') delete data.id_cuenta;
      else data.id_cuenta = Number(data.id_cuenta);
      data.moneda = cot.moneda;
      data.tipo_cambio = Number(cot.tipo_cambio) || 1;
      close(data);
    };
  });
}

// ── Modal: Gestión de cuentas bancarias ─────────────────────────
const TIPO_CUENTA_LABEL = {
  EFECTIVO:   { label: 'Efectivo',       color: '#6b7280', bg: '#f3f4f6' },
  BANCO:      { label: 'Banco',          color: '#1e40af', bg: '#dbeafe' },
  DETRACCION: { label: 'Detracción BN',  color: '#92400e', bg: '#fef3c7' },
};

async function modalGestionCuentas() {
  const render = async () => {
    let cuentas;
    try { cuentas = await api.cobranzas.getCuentas(); }
    catch (e) { showError(e.message); return []; }
    return cuentas;
  };

  const cuentas = await render();

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px;overflow:auto';

  const draw = (cts) => {
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;max-width:720px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
        <div style="padding:18px 22px;border-top:4px solid #000;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
          <div>
            <h3 style="margin:0 0 3px 0;font-size:15px">🏦 Gestión de cuentas bancarias</h3>
            <div style="font-size:12px;color:var(--text-secondary)">Catálogo de cuentas disponibles para recibir cobranzas</div>
          </div>
          <button id="gc-x" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af">×</button>
        </div>

        <div style="padding:16px 22px">
          <!-- Formulario para agregar nueva -->
          <div style="background:#f9fafb;padding:12px;border-radius:6px;margin-bottom:14px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;letter-spacing:.3px">➕ AGREGAR NUEVA CUENTA</div>
            <form id="f-nueva" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end">
              <div>
                <label style="font-size:10px;color:var(--text-secondary)">Nombre</label>
                <input name="nombre" required placeholder="ej: BCP Cuenta Corriente" style="width:100%;padding:7px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-secondary)">Tipo</label>
                <select name="tipo" required style="width:100%;padding:7px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
                  <option value="BANCO">Banco</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="DETRACCION">Detracción (BN)</option>
                </select>
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-secondary)">Moneda</label>
                <select name="moneda" required style="width:100%;padding:7px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <button type="submit" style="padding:7px 14px;background:#000;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">Agregar</button>
            </form>
          </div>

          <!-- Tabla de cuentas -->
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
              <tr style="text-align:left">
                <th style="padding:8px 10px">Nombre</th>
                <th style="padding:8px 10px">Tipo</th>
                <th style="padding:8px 10px">Moneda</th>
                <th style="padding:8px 10px;text-align:right">Saldo</th>
                <th style="padding:8px 10px;text-align:right">Acción</th>
              </tr>
            </thead>
            <tbody>
              ${cts.length === 0 ? `<tr><td colspan="5" style="padding:16px;text-align:center;color:#9ca3af">Aún no has dado de alta ninguna cuenta</td></tr>` : ''}
              ${cts.map(c => {
                const t = TIPO_CUENTA_LABEL[c.tipo] || { label: c.tipo, color: '#6b7280', bg: '#f3f4f6' };
                return `
                <tr data-id="${c.id_cuenta}" style="border-top:1px solid #f3f4f6">
                  <td style="padding:9px 10px;font-weight:600">${c.nombre}</td>
                  <td style="padding:9px 10px">
                    <span style="background:${t.bg};color:${t.color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${t.label}</span>
                  </td>
                  <td style="padding:9px 10px">${c.moneda}</td>
                  <td style="padding:9px 10px;text-align:right;font-family:monospace">${fMoney(c.saldo_actual, c.moneda)}</td>
                  <td style="padding:9px 10px;text-align:right">
                    <button class="gc-del" data-id="${c.id_cuenta}" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:11px">Desactivar</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>

          <div style="font-size:11px;color:var(--text-secondary);margin-top:14px;padding:10px;background:#fef3c7;border:1px solid #fde68a;border-radius:5px">
            💡 Las cuentas <strong>Detracción</strong> solo aparecen al registrar un depósito tipo "Detracción BN". Las cuentas <strong>Banco/Efectivo</strong> aparecen al registrar depósitos regulares.
          </div>
        </div>
      </div>
    `;

    ov.querySelector('#gc-x').onclick = () => ov.remove();
    ov.querySelector('#f-nueva').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.cobranzas.createCuenta(Object.fromEntries(fd.entries()));
        showSuccess('Cuenta creada');
        const nuevas = await render();
        draw(nuevas);
      } catch (err) { showError(err.message); }
    };
    ov.querySelectorAll('.gc-del').forEach(b => {
      b.onclick = async () => {
        if (!confirm('¿Desactivar esta cuenta? (Los movimientos existentes se conservan)')) return;
        try {
          await api.cobranzas.deleteCuenta(Number(b.dataset.id));
          showSuccess('Cuenta desactivada');
          const nuevas = await render();
          draw(nuevas);
        } catch (err) { showError(err.message); }
      };
    });
  };

  draw(cuentas);
  document.body.appendChild(ov);
}

// ── Modal: Gastos bancarios (ITF, comisiones, portes) ──────────
const CATEGORIA_GB = {
  ITF:           { label: 'ITF',            color: '#7c3aed' },
  COMISION_MANT: { label: 'Mantenimiento',  color: '#0891b2' },
  COMISION_TC:   { label: 'Comisión TC',    color: '#0ea5e9' },
  PORTES:        { label: 'Portes',         color: '#6b7280' },
  OTROS:         { label: 'Otros',          color: '#6b7280' },
};

async function modalGastosBancarios() {
  const draw = async () => {
    let gastos, cuentas;
    try {
      [gastos, cuentas] = await Promise.all([
        api.cobranzas.getGastosBancarios(),
        api.cobranzas.getCuentas(),
      ]);
    } catch (e) {
      return `<p style="color:#dc2626">Error: ${e.message}</p>`;
    }

    const cuentasBanco = cuentas.filter(c => c.tipo === 'BANCO' || c.tipo === 'EFECTIVO');
    const hoy = new Date().toISOString().slice(0,10);

    const totalPEN = gastos.filter(g=>g.moneda==='PEN').reduce((s,g)=>s+Number(g.monto),0);
    const totalUSD = gastos.filter(g=>g.moneda==='USD').reduce((s,g)=>s+Number(g.monto),0);

    return `
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">💳 Gastos bancarios</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px">ITF, comisiones, portes — descuentan saldo de la cuenta</div>

      <div style="display:flex;gap:10px;margin-bottom:12px">
        <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:6px">
          <div style="font-size:11px;color:#991b1b;font-weight:600">Total PEN gastado</div>
          <div style="font-size:18px;font-weight:700;color:#991b1b">${fMoney(totalPEN,'PEN')}</div>
        </div>
        <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:6px">
          <div style="font-size:11px;color:#991b1b;font-weight:600">Total USD gastado</div>
          <div style="font-size:18px;font-weight:700;color:#991b1b">${fMoney(totalUSD,'USD')}</div>
        </div>
      </div>

      <form id="form-gb" style="background:#f9fafb;padding:12px;border-radius:6px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">➕ Registrar nuevo gasto bancario</div>
        <div style="display:grid;grid-template-columns:110px 150px 1fr 120px;gap:8px;margin-bottom:8px">
          <input type="date" name="fecha" value="${hoy}" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
          <select name="categoria" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
            ${Object.entries(CATEGORIA_GB).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
          <select name="id_cuenta" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
            <option value="">— cuenta —</option>
            ${cuentasBanco.map(c => `<option value="${c.id_cuenta}" data-moneda="${c.moneda}">${c.nombre} (${c.moneda})</option>`).join('')}
          </select>
          <input type="number" step="0.01" name="monto" placeholder="Monto" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
        </div>
        <input type="text" name="concepto" placeholder="Concepto (ej: ITF octubre BCP)" required style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:8px">
        <button type="submit" style="background:#dc2626;color:#fff;border:none;padding:8px 16px;border-radius:4px;font-weight:600;font-size:12px;cursor:pointer">Registrar gasto</button>
      </form>

      <div style="font-size:12px;font-weight:700;margin-bottom:6px">Últimos movimientos</div>
      ${gastos.length === 0 ? '<p style="color:#6b7280;font-size:12px;text-align:center;padding:20px">Sin gastos registrados</p>' : `
      <div style="max-height:300px;overflow:auto;border:1px solid #e5e7eb;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb;position:sticky;top:0">
            <tr>
              <th style="padding:6px;text-align:left">Fecha</th>
              <th style="padding:6px;text-align:left">Categoría</th>
              <th style="padding:6px;text-align:left">Cuenta</th>
              <th style="padding:6px;text-align:left">Concepto</th>
              <th style="padding:6px;text-align:right">Monto</th>
              <th style="padding:6px"></th>
            </tr>
          </thead>
          <tbody>
            ${gastos.map(g => {
              const cat = CATEGORIA_GB[g.categoria] || CATEGORIA_GB.OTROS;
              return `
              <tr style="border-top:1px solid #f1f5f9">
                <td style="padding:6px">${String(g.fecha).slice(0,10)}</td>
                <td style="padding:6px"><span style="background:${cat.color}20;color:${cat.color};padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">${cat.label}</span></td>
                <td style="padding:6px;font-size:11px">${g.cuenta_nombre || '—'}</td>
                <td style="padding:6px">${g.concepto}</td>
                <td style="padding:6px;text-align:right;color:#dc2626;font-weight:600">-${fMoney(g.monto, g.moneda)}</td>
                <td style="padding:6px;text-align:center">
                  <button class="btn-del-gb" data-id="${g.id_gasto_bancario}" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:14px">🗑</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}

      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button id="close-gb" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cerrar</button>
      </div>
    `;
  };

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:820px;width:100%;max-height:90vh;overflow:auto';
  ov.appendChild(box);

  const refresh = async () => {
    box.innerHTML = await draw();
    box.querySelector('#close-gb').onclick = () => ov.remove();

    // Auto-set moneda según cuenta
    const selCuenta = box.querySelector('[name="id_cuenta"]');
    selCuenta.onchange = () => {
      // (moneda se infiere del backend por la cuenta, no necesitamos mantener estado)
    };

    box.querySelector('#form-gb').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const cuentaOpt = selCuenta.options[selCuenta.selectedIndex];
      const moneda = cuentaOpt?.dataset?.moneda || 'PEN';
      try {
        await api.cobranzas.createGastoBancario({
          id_cuenta: Number(fd.get('id_cuenta')),
          fecha:     fd.get('fecha'),
          categoria: fd.get('categoria'),
          concepto:  fd.get('concepto'),
          monto:     Number(fd.get('monto')),
          moneda,
        });
        showSuccess('Gasto bancario registrado');
        refresh();
      } catch (err) { showError('Error: ' + err.message); }
    };

    box.querySelectorAll('.btn-del-gb').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('¿Eliminar este gasto bancario? Se repondrá al saldo de la cuenta.')) return;
        try {
          await api.cobranzas.deleteGastoBancario(Number(btn.dataset.id));
          showSuccess('Gasto eliminado');
          refresh();
        } catch (err) { showError('Error: ' + err.message); }
      };
    });
  };

  document.body.appendChild(ov);
  refresh();
}

// ── Libro Bancos ─────────────────────────────────────────────
async function modalLibroBancos() {
  let cuentas = [];
  try { cuentas = await api.cobranzas.getCuentas(); }
  catch (e) { return showError('Error: ' + e.message); }

  const cuentasBanco = cuentas.filter(c => c.tipo === 'BANCO');
  if (cuentasBanco.length === 0) {
    return showError('No hay cuentas de tipo BANCO registradas');
  }

  const hoy = new Date();
  let idCuentaSel = cuentasBanco[0].id_cuenta;
  let periodoSel  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:1200px;width:100%;max-height:92vh;overflow:auto';
  ov.appendChild(box);

  const fmtDate = (s) => s ? String(s).slice(0,10).split('-').reverse().join('/') : '—';
  const monedaCta = (idC) => (cuentasBanco.find(c => c.id_cuenta == idC) || {}).moneda || 'PEN';
  const estadoBadgeM = (e) => {
    if (e === 'CONCILIADO') return '<span style="background:#dcfce7;color:#166534;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">🟢 Conciliado</span>';
    if (e === 'IGNORADO')   return '<span style="background:#e5e7eb;color:#374151;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">⚪ Ignorado</span>';
    return '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">🟡 Pendiente</span>';
  };
  const fuenteBadge = (f) => {
    if (f === 'AUTO')        return '<span style="color:#6b7280;font-size:10px">🤖 AUTO</span>';
    if (f === 'IMPORT_EECC') return '<span style="color:#3b82f6;font-size:10px">📥 EECC</span>';
    return '<span style="color:#6b7280;font-size:10px">✍️ MAN</span>';
  };

  const render = async () => {
    let data;
    try {
      data = await api.cobranzas.getLibroBancos(idCuentaSel, periodoSel);
    } catch (e) {
      box.innerHTML = `<p style="color:#dc2626">Error: ${e.message}</p>
        <div style="text-align:right"><button id="close-lb" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cerrar</button></div>`;
      box.querySelector('#close-lb').onclick = () => ov.remove();
      return;
    }

    const mon = data.cuenta.moneda || 'PEN';
    const difBadge = data.diferencia == null ? '' : (
      Math.abs(data.diferencia) < 0.01
        ? '<span style="color:#16a34a;font-weight:700">✅ Cuadrado</span>'
        : `<span style="color:#dc2626;font-weight:700">⚠️ Dif ${fMoney(data.diferencia, mon)}</span>`
    );

    const opts = cuentasBanco.map(c =>
      `<option value="${c.id_cuenta}" ${c.id_cuenta == idCuentaSel ? 'selected' : ''}>${c.nombre} (${c.moneda})</option>`
    ).join('');

    const rows = data.movimientos.map(m => {
      const isAbono = m.tipo === 'ABONO';
      const abono = isAbono ? `<span style="color:#16a34a;font-weight:600">${fMoney(m.monto, mon)}</span>` : '';
      const cargo = isAbono ? '' : `<span style="color:#dc2626;font-weight:600">-${fMoney(m.monto, mon)}</span>`;

      // Descripción del banco
      let desc = '';
      if (m.ref_label) {
        desc = `<div style="font-weight:600">${m.tipo_movimiento_banco || m.descripcion_banco}</div>
                <div style="font-size:10px;color:#2563eb">↪ ${m.ref_label}</div>`;
      } else {
        desc = `<div>${m.tipo_movimiento_banco ? `<span style="font-weight:600">${m.tipo_movimiento_banco}</span> ` : ''}${m.descripcion_banco}</div>`;
      }

      // Sugerencia de match (para pendientes)
      const sug = m.sugerencia;
      let sugHtml = '';
      if (sug) {
        sugHtml = `
          <div style="margin-top:4px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:4px;padding:4px 8px;font-size:10px">
            <div style="color:#166534;font-weight:600">💡 Posible match:</div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <div>
                <span style="color:#166534;font-weight:600">${sug.label}</span>
                <span style="color:#6b7280"> · ${sug.fecha_str} · ${fMoney(sug.monto, mon)}</span>
                ${sug.mi_descripcion ? `<div style="color:#374151;font-style:italic">📝 "${sug.mi_descripcion}"</div>` : ''}
              </div>
              <button class="btn-conc-sug" data-id="${m.id_movimiento}" data-ref-tipo="${sug.ref_tipo}" data-ref-id="${sug.id}"
                style="background:#16a34a;color:#fff;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600;white-space:nowrap">
                ✓ Conciliar
              </button>
            </div>
          </div>`;
      } else if (m.estado_conciliacion === 'POR_CONCILIAR') {
        sugHtml = `<div style="margin-top:3px;font-size:10px;color:#9ca3af;font-style:italic">Sin match automático</div>`;
      }

      return `
        <tr style="border-top:1px solid #f1f5f9${m.estado_conciliacion === 'POR_CONCILIAR' ? ';background:#fffbeb' : ''}">
          <td style="padding:6px;white-space:nowrap">${fmtDate(m.fecha)}</td>
          <td style="padding:6px;font-size:11px">${m.nro_operacion || '—'}</td>
          <td style="padding:6px;font-size:11px">${desc}${sugHtml}</td>
          <td style="padding:6px;font-size:10px;color:#6b7280">${m.canal || '—'}</td>
          <td style="padding:6px;text-align:right">${cargo}</td>
          <td style="padding:6px;text-align:right">${abono}</td>
          <td style="padding:6px;text-align:right;font-size:11px;color:#374151">${fMoney(m.saldo_calculado, mon)}</td>
          <td style="padding:6px;text-align:center">${estadoBadgeM(m.estado_conciliacion)}<br>${fuenteBadge(m.fuente)}</td>
          <td style="padding:6px;text-align:center;white-space:nowrap">
            ${m.estado_conciliacion === 'POR_CONCILIAR'
              ? `<button class="btn-conc-m" data-id="${m.id_movimiento}" title="Conciliar manual" style="color:#16a34a;background:none;border:none;cursor:pointer">✓</button>
                 <button class="btn-ign-m" data-id="${m.id_movimiento}" title="Ignorar" style="color:#6b7280;background:none;border:none;cursor:pointer">⊘</button>` : ''}
            ${m.fuente !== 'AUTO'
              ? `<button class="btn-del-m" data-id="${m.id_movimiento}" title="Eliminar" style="color:#dc2626;background:none;border:none;cursor:pointer">🗑</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:18px;font-weight:700">📖 Libro Bancos</div>
          <div style="font-size:12px;color:#6b7280">Extracto del período · ingresos y egresos por cuenta</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="btn-import-eecc" style="padding:8px 14px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">📥 Importar EECC Interbank</button>
          <button id="btn-new-mov" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">➕ Movimiento manual</button>
          <button id="close-lb" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer;font-size:12px">Cerrar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:14px">
        <select id="sel-cuenta" style="padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">${opts}</select>
        <input id="inp-periodo" type="month" value="${periodoSel}" style="padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">
      </div>

      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px">
        <div style="background:#f9fafb;padding:8px;border-radius:6px;border-left:3px solid #6b7280">
          <div style="font-size:10px;color:#6b7280;font-weight:600">SALDO INICIAL</div>
          <div style="font-size:14px;font-weight:700">${fMoney(data.saldo_inicial, mon)}</div>
        </div>
        <div style="background:#ecfdf5;padding:8px;border-radius:6px;border-left:3px solid #16a34a">
          <div style="font-size:10px;color:#166534;font-weight:600">INGRESOS</div>
          <div style="font-size:14px;font-weight:700;color:#166534">+${fMoney(data.ingresos, mon)}</div>
        </div>
        <div style="background:#fef2f2;padding:8px;border-radius:6px;border-left:3px solid #dc2626">
          <div style="font-size:10px;color:#991b1b;font-weight:600">EGRESOS</div>
          <div style="font-size:14px;font-weight:700;color:#991b1b">-${fMoney(data.egresos, mon)}</div>
        </div>
        <div style="background:#fffbeb;padding:8px;border-radius:6px;border-left:3px solid #f59e0b">
          <div style="font-size:10px;color:#92400e;font-weight:600">COMISIONES</div>
          <div style="font-size:14px;font-weight:700;color:#92400e">${fMoney(data.comisiones, mon)}</div>
        </div>
        <div style="background:#eff6ff;padding:8px;border-radius:6px;border-left:3px solid #3b82f6">
          <div style="font-size:10px;color:#1e40af;font-weight:600">SALDO FINAL</div>
          <div style="font-size:14px;font-weight:700;color:#1e40af">${fMoney(data.saldo_final, mon)}</div>
        </div>
        <div style="background:${data.saldo_banco != null ? (Math.abs(data.diferencia || 0) < 0.01 ? '#ecfdf5' : '#fef2f2') : '#f9fafb'};padding:8px;border-radius:6px;border-left:3px solid ${data.saldo_banco != null ? (Math.abs(data.diferencia || 0) < 0.01 ? '#16a34a' : '#dc2626') : '#6b7280'}">
          <div style="font-size:10px;color:#6b7280;font-weight:600">SALDO BANCO (EECC)</div>
          <div style="font-size:14px;font-weight:700">${data.saldo_banco != null ? fMoney(data.saldo_banco, mon) : '—'}</div>
          <div style="font-size:10px">${difBadge}</div>
        </div>
      </div>

      ${data.pendientes_conciliar > 0 ? `<div style="background:#fef3c7;border:1px solid #fcd34d;padding:8px 12px;border-radius:6px;margin-bottom:10px;font-size:12px;color:#92400e">⚠️ <b>${data.pendientes_conciliar}</b> movimiento(s) pendiente(s) de conciliar</div>` : ''}

      ${data.movimientos.length === 0 ? `
        <div style="text-align:center;padding:40px;color:#6b7280;background:#f9fafb;border-radius:6px">
          <div style="font-size:40px">📭</div>
          <div style="margin-top:8px">Sin movimientos en este período</div>
          <div style="font-size:11px;margin-top:4px">Registra cobros/gastos o importa tu EECC</div>
        </div>` : `
        <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:auto;max-height:55vh">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="background:#f9fafb;position:sticky;top:0;z-index:1">
              <tr>
                <th style="padding:8px;text-align:left">Fecha</th>
                <th style="padding:8px;text-align:left">Nº Op</th>
                <th style="padding:8px;text-align:left">Descripción</th>
                <th style="padding:8px;text-align:left">Canal</th>
                <th style="padding:8px;text-align:right">Cargo</th>
                <th style="padding:8px;text-align:right">Abono</th>
                <th style="padding:8px;text-align:right">Saldo</th>
                <th style="padding:8px;text-align:center">Estado</th>
                <th style="padding:8px"></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `}
    `;

    box.querySelector('#close-lb').onclick = () => ov.remove();
    box.querySelector('#sel-cuenta').onchange = (e) => { idCuentaSel = Number(e.target.value); render(); };
    box.querySelector('#inp-periodo').onchange = (e) => { periodoSel = e.target.value; render(); };

    box.querySelector('#btn-import-eecc').onclick = () => importarEECCDialog(idCuentaSel, render);
    box.querySelector('#btn-new-mov').onclick    = () => nuevoMovManual(idCuentaSel, monedaCta(idCuentaSel), render);

    // Conciliar desde sugerencia inline (1-click)
    box.querySelectorAll('.btn-conc-sug').forEach(btn => {
      btn.onclick = async () => {
        try {
          await api.cobranzas.conciliarMovimiento(Number(btn.dataset.id), {
            ref_tipo: btn.dataset.refTipo,
            ref_id: Number(btn.dataset.refId),
          });
          showSuccess('Conciliado');
          render();
        } catch (e) { showError('Error: ' + e.message); }
      };
    });

    box.querySelectorAll('.btn-conc-m').forEach(btn => {
      btn.onclick = async () => {
        try {
          const sug = await api.cobranzas.sugerirConciliacion(Number(btn.dataset.id));
          if (!sug.length) {
            if (!confirm('Sin coincidencias automáticas. ¿Marcar como conciliado manualmente (OTRO)?')) return;
            await api.cobranzas.conciliarMovimiento(Number(btn.dataset.id), { ref_tipo: 'OTRO' });
          } else {
            const op = sug.map((s, i) => `${i + 1}) ${s.ref_tipo} — ${s.nro_cotizacion || s.descripcion || ''} · ${fMoney(s.monto)}`).join('\n');
            const idx = prompt(`Candidatos:\n${op}\n\nElige (1-${sug.length}) o cancela:`);
            if (!idx) return;
            const sel = sug[Number(idx) - 1];
            if (!sel) return;
            await api.cobranzas.conciliarMovimiento(Number(btn.dataset.id), { ref_tipo: sel.ref_tipo, ref_id: sel.id });
          }
          showSuccess('Conciliado');
          render();
        } catch (e) { showError('Error: ' + e.message); }
      };
    });
    box.querySelectorAll('.btn-ign-m').forEach(btn => {
      btn.onclick = async () => {
        try { await api.cobranzas.ignorarMovimiento(Number(btn.dataset.id)); showSuccess('Ignorado'); render(); }
        catch (e) { showError('Error: ' + e.message); }
      };
    });
    box.querySelectorAll('.btn-del-m').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('¿Eliminar este movimiento?')) return;
        try { await api.cobranzas.deleteMovimiento(Number(btn.dataset.id)); showSuccess('Eliminado'); render(); }
        catch (e) { showError('Error: ' + e.message); }
      };
    });
  };

  document.body.appendChild(ov);
  // No cerrar al hacer click fuera — solo con botón "Cerrar"
  render();
}

function importarEECCDialog(idCuenta, onDone) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:760px;width:100%;max-height:85vh;overflow:auto';
  box.innerHTML = `
    <div style="font-size:18px;font-weight:700;margin-bottom:4px">📥 Importar EECC Interbank</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:12px">
      Sube el PDF del estado de cuenta de Interbank. El sistema extrae los movimientos automáticamente.
    </div>

    <div id="drop-zone" style="border:2px dashed #d1d5db;border-radius:8px;padding:30px;text-align:center;cursor:pointer;margin-bottom:14px;transition:all .2s">
      <div style="font-size:36px;margin-bottom:8px">📄</div>
      <div style="font-size:14px;font-weight:600;color:#374151">Arrastra tu PDF aquí o haz click para seleccionar</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px">Formato soportado: Interbank — Consulta de Movimientos de Cuenta Corriente</div>
      <input type="file" id="file-eecc" accept=".pdf" style="display:none">
    </div>

    <div id="pdf-status" style="display:none;background:#ecfdf5;border:1px solid #bbf7d0;padding:10px 12px;border-radius:6px;margin-bottom:10px;font-size:12px;color:#166534"></div>

    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;font-weight:600">Texto extraído del PDF (puedes editar antes de importar):</div>
      <textarea id="eecc-txt" rows="10" placeholder="27/02/2026 27/02/2026 - ITF OPERACION: 0845011 INTERNO S/ -0.05 S/ 810.97..." style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:4px;font-family:monospace;font-size:11px"></textarea>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button id="cancel-eecc" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cancelar</button>
      <button id="ok-eecc" disabled style="padding:8px 16px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;border-radius:4px;cursor:pointer;font-weight:600;opacity:0.5">Importar</button>
    </div>
  `;
  ov.appendChild(box);
  document.body.appendChild(ov);

  const dropZone  = box.querySelector('#drop-zone');
  const fileInput  = box.querySelector('#file-eecc');
  const statusDiv  = box.querySelector('#pdf-status');
  const txtArea    = box.querySelector('#eecc-txt');
  const btnOk      = box.querySelector('#ok-eecc');

  // Cargar pdf.js desde archivos locales
  const loadPdfJs = () => {
    if (window.pdfjsLib) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/lib/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
        resolve();
      };
      s.onerror = () => reject(new Error('No se pudo cargar el lector de PDF'));
      document.head.appendChild(s);
    });
  };

  const extractTextFromPdf = async (arrayBuffer) => {
    await loadPdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Reconstruir líneas respetando posiciones Y
      const items = content.items;
      if (!items.length) continue;
      // Agrupar por posición Y (misma fila)
      const rows = {};
      items.forEach(it => {
        const y = Math.round(it.transform[5]); // posición Y
        if (!rows[y]) rows[y] = [];
        rows[y].push({ x: it.transform[4], text: it.str });
      });
      // Ordenar filas de arriba a abajo, items de izq a derecha
      const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const line = rows[y].sort((a, b) => a.x - b.x).map(it => it.text).join(' ');
        fullText += line.trim() + '\n';
      }
    }
    return fullText;
  };

  const processPdf = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      return showError('Solo se aceptan archivos PDF');
    }
    dropZone.style.borderColor = '#3b82f6';
    dropZone.style.background = '#eff6ff';
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '⏳ Leyendo PDF...';
    btnOk.disabled = true;
    btnOk.style.opacity = '0.5';

    try {
      const buffer = await file.arrayBuffer();
      const texto = await extractTextFromPdf(buffer);
      txtArea.value = texto;
      // Contar líneas con formato de fecha
      const lineas = texto.split('\n').filter(l => /^\d{2}\/\d{2}\/\d{4}/.test(l.trim()));
      statusDiv.innerHTML = `✅ <b>${file.name}</b> leído — ${lineas.length} líneas con movimientos detectadas`;
      dropZone.innerHTML = `<div style="font-size:24px">✅</div><div style="font-weight:600;color:#166534">${file.name}</div><div style="font-size:11px;color:#6b7280">${lineas.length} movimientos · Click para cambiar archivo</div><input type="file" id="file-eecc" accept=".pdf" style="display:none">`;
      box.querySelector('#file-eecc').onchange = (e) => { if (e.target.files[0]) processPdf(e.target.files[0]); };
      dropZone.onclick = () => box.querySelector('#file-eecc').click();
      btnOk.disabled = false;
      btnOk.style.opacity = '1';
    } catch (e) {
      statusDiv.innerHTML = `❌ Error leyendo PDF: ${e.message}`;
      statusDiv.style.background = '#fef2f2';
      statusDiv.style.borderColor = '#fecaca';
      statusDiv.style.color = '#991b1b';
    }
  };

  // Drag & drop
  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = (e) => { if (e.target.files[0]) processPdf(e.target.files[0]); };
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = '#3b82f6'; dropZone.style.background = '#eff6ff'; };
  dropZone.ondragleave = () => { dropZone.style.borderColor = '#d1d5db'; dropZone.style.background = ''; };
  dropZone.ondrop = (e) => { e.preventDefault(); dropZone.style.borderColor = '#d1d5db'; dropZone.style.background = ''; if (e.dataTransfer.files[0]) processPdf(e.dataTransfer.files[0]); };

  // Habilitar botón si se escribe texto manual
  txtArea.oninput = () => {
    const tiene = txtArea.value.trim().length > 0;
    btnOk.disabled = !tiene;
    btnOk.style.opacity = tiene ? '1' : '0.5';
  };

  box.querySelector('#cancel-eecc').onclick = () => ov.remove();
  box.querySelector('#ok-eecc').onclick = async () => {
    const texto = txtArea.value;
    if (!texto.trim()) return showError('Sube un PDF o pega el texto del EECC');
    btnOk.disabled = true;
    btnOk.textContent = 'Importando...';
    try {
      const r = await api.cobranzas.importarEECC(idCuenta, texto);
      showSuccess(`✅ ${r.insertados} insertados · ${r.duplicados} duplicados · ${r.total_lineas} líneas detectadas`);
      ov.remove();
      if (onDone) onDone();
    } catch (e) {
      showError('Error: ' + e.message);
      btnOk.disabled = false;
      btnOk.textContent = 'Importar';
    }
  };
}

function nuevoMovManual(idCuenta, moneda, onDone) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:480px;width:100%';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:10px">➕ Movimiento manual (${moneda})</div>
    <form id="f-mov">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <input type="date" name="fecha" value="${hoy}" required style="padding:8px;border:1px solid #d1d5db;border-radius:4px">
        <select name="tipo" required style="padding:8px;border:1px solid #d1d5db;border-radius:4px">
          <option value="ABONO">ABONO (+)</option>
          <option value="CARGO">CARGO (−)</option>
        </select>
      </div>
      <input type="text" name="descripcion_banco" placeholder="Descripción" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:8px">
      <input type="number" step="0.01" name="monto" placeholder="Monto" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:8px">
      <input type="text" name="comentario" placeholder="Comentario (opcional)" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:12px">
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button type="button" id="cancel-mov" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cancelar</button>
        <button type="submit" style="padding:8px 16px;border:1px solid #111827;background:#111827;color:#fff;border-radius:4px;cursor:pointer;font-weight:600">Registrar</button>
      </div>
    </form>
  `;
  ov.appendChild(box);
  document.body.appendChild(ov);
  box.querySelector('#cancel-mov').onclick = () => ov.remove();
  box.querySelector('#f-mov').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.cobranzas.createMovimiento({
        id_cuenta: idCuenta,
        fecha: fd.get('fecha'),
        descripcion_banco: fd.get('descripcion_banco'),
        monto: Number(fd.get('monto')),
        tipo: fd.get('tipo'),
        comentario: fd.get('comentario') || null,
      });
      showSuccess('Movimiento registrado');
      ov.remove();
      if (onDone) onDone();
    } catch (err) { showError('Error: ' + err.message); }
  };
}

// ── Modal: Conciliación bancaria ──────────────────────────────
async function modalConciliacion() {
  let filtroCuenta = '';
  let filtroEstado = 'POR_CONCILIAR';

  const draw = async () => {
    let movs, cuentas;
    try {
      [movs, cuentas] = await Promise.all([
        api.cobranzas.getMovimientos(filtroCuenta || undefined, filtroEstado || undefined),
        api.cobranzas.getCuentas(),
      ]);
    } catch (e) { return `<p style="color:#dc2626">Error: ${e.message}</p>`; }

    const cuentasBanco = cuentas.filter(c => c.tipo === 'BANCO' || c.tipo === 'DETRACCION');
    const hoy = new Date().toISOString().slice(0,10);

    const estadoBadge = (est) => {
      if (est === 'CONCILIADO') return '<span style="background:#dcfce7;color:#166534;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">✓ CONCILIADO</span>';
      if (est === 'IGNORADO')   return '<span style="background:#f3f4f6;color:#6b7280;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">IGNORADO</span>';
      return '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">POR CONCILIAR</span>';
    };

    return `
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">🧾 Conciliación bancaria</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px">Matchea movimientos del extracto bancario con tus cobranzas/gastos</div>

      <form id="form-mov" style="background:#f9fafb;padding:12px;border-radius:6px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">➕ Cargar movimiento del extracto</div>
        <div style="display:grid;grid-template-columns:110px 90px 1fr 120px;gap:8px;margin-bottom:8px">
          <input type="date" name="fecha" value="${hoy}" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
          <select name="tipo" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
            <option value="ABONO">ABONO (+)</option>
            <option value="CARGO">CARGO (−)</option>
          </select>
          <select name="id_cuenta" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
            <option value="">— cuenta —</option>
            ${cuentasBanco.map(c => `<option value="${c.id_cuenta}">${c.nombre} (${c.moneda})</option>`).join('')}
          </select>
          <input type="number" step="0.01" name="monto" placeholder="Monto" required style="padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
        </div>
        <input type="text" name="descripcion_banco" placeholder="Descripción del extracto (ej: TRANS BCP 00123 YURA SA)" required style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:8px">
        <button type="submit" style="background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:4px;font-weight:600;font-size:12px;cursor:pointer">Cargar movimiento</button>
      </form>

      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
        <span style="font-size:11px;color:#6b7280;font-weight:600">Filtros:</span>
        <select id="filtro-estado" style="padding:4px;font-size:11px;border:1px solid #d1d5db;border-radius:4px">
          <option value="POR_CONCILIAR" ${filtroEstado==='POR_CONCILIAR'?'selected':''}>Por conciliar</option>
          <option value="CONCILIADO" ${filtroEstado==='CONCILIADO'?'selected':''}>Conciliados</option>
          <option value="IGNORADO" ${filtroEstado==='IGNORADO'?'selected':''}>Ignorados</option>
          <option value="" ${filtroEstado===''?'selected':''}>Todos</option>
        </select>
        <select id="filtro-cuenta" style="padding:4px;font-size:11px;border:1px solid #d1d5db;border-radius:4px">
          <option value="">Todas las cuentas</option>
          ${cuentasBanco.map(c => `<option value="${c.id_cuenta}" ${String(filtroCuenta)===String(c.id_cuenta)?'selected':''}>${c.nombre}</option>`).join('')}
        </select>
      </div>

      ${movs.length === 0 ? '<p style="color:#6b7280;font-size:12px;text-align:center;padding:20px">Sin movimientos</p>' : `
      <div style="max-height:360px;overflow:auto;border:1px solid #e5e7eb;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb;position:sticky;top:0">
            <tr>
              <th style="padding:6px;text-align:left">Fecha</th>
              <th style="padding:6px;text-align:left">Cuenta</th>
              <th style="padding:6px;text-align:left">Descripción</th>
              <th style="padding:6px;text-align:right">Monto</th>
              <th style="padding:6px;text-align:center">Estado</th>
              <th style="padding:6px"></th>
            </tr>
          </thead>
          <tbody>
            ${movs.map(m => `
              <tr style="border-top:1px solid #f1f5f9">
                <td style="padding:6px">${String(m.fecha).slice(0,10)}</td>
                <td style="padding:6px;font-size:11px">${m.cuenta_nombre || '—'}</td>
                <td style="padding:6px">${m.descripcion_banco}</td>
                <td style="padding:6px;text-align:right;color:${m.tipo==='ABONO'?'#16a34a':'#dc2626'};font-weight:600">
                  ${m.tipo==='ABONO'?'+':'-'}${fMoney(m.monto, m.cuenta_moneda)}
                </td>
                <td style="padding:6px;text-align:center">${estadoBadge(m.estado_conciliacion)}</td>
                <td style="padding:6px;text-align:center;white-space:nowrap">
                  ${m.estado_conciliacion === 'POR_CONCILIAR' ? `
                    <button class="btn-match" data-id="${m.id_movimiento}" style="background:#16a34a;color:#fff;border:none;padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;margin-right:3px">🔗 Match</button>
                    <button class="btn-ignorar" data-id="${m.id_movimiento}" style="background:#6b7280;color:#fff;border:none;padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer">Ignorar</button>
                  ` : `<button class="btn-del-mov" data-id="${m.id_movimiento}" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:14px">🗑</button>`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`}

      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button id="close-mov" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cerrar</button>
      </div>
    `;
  };

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:960px;width:100%;max-height:92vh;overflow:auto';
  ov.appendChild(box);

  const refresh = async () => {
    box.innerHTML = await draw();
    box.querySelector('#close-mov').onclick = () => ov.remove();

    box.querySelector('#filtro-estado').onchange = (e) => { filtroEstado = e.target.value; refresh(); };
    box.querySelector('#filtro-cuenta').onchange = (e) => { filtroCuenta = e.target.value; refresh(); };

    box.querySelector('#form-mov').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.cobranzas.createMovimiento({
          id_cuenta:         Number(fd.get('id_cuenta')),
          fecha:             fd.get('fecha'),
          tipo:              fd.get('tipo'),
          monto:             Number(fd.get('monto')),
          descripcion_banco: fd.get('descripcion_banco'),
        });
        showSuccess('Movimiento cargado');
        refresh();
      } catch (err) { showError('Error: ' + err.message); }
    };

    box.querySelectorAll('.btn-match').forEach(btn => {
      btn.onclick = () => modalSugerenciasMatch(Number(btn.dataset.id), refresh);
    });
    box.querySelectorAll('.btn-ignorar').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('¿Marcar este movimiento como ignorado?')) return;
        try { await api.cobranzas.ignorarMovimiento(Number(btn.dataset.id)); refresh(); }
        catch (err) { showError('Error: ' + err.message); }
      };
    });
    box.querySelectorAll('.btn-del-mov').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('¿Eliminar este movimiento del extracto?')) return;
        try { await api.cobranzas.deleteMovimiento(Number(btn.dataset.id)); refresh(); }
        catch (err) { showError('Error: ' + err.message); }
      };
    });
  };

  document.body.appendChild(ov);
  refresh();
}

async function modalSugerenciasMatch(idMov, onDone) {
  let sugerencias;
  try { sugerencias = await api.cobranzas.sugerirConciliacion(idMov); }
  catch (e) { return showError('Error: ' + e.message); }

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:620px;width:100%';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:12px">🔗 Sugerencias de match</div>
    ${sugerencias.length === 0 ? `
      <p style="color:#6b7280;font-size:13px;margin-bottom:14px">No se encontraron coincidencias automáticas (mismo monto ±3 días en esa cuenta).</p>
      <button id="conc-manual" style="background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:4px;font-weight:600;cursor:pointer">Conciliar como OTRO</button>
    ` : `
      <p style="color:#6b7280;font-size:12px;margin-bottom:10px">Elige la contraparte correcta:</p>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        ${sugerencias.map(s => `
          <button class="sug" data-ref-tipo="${s.ref_tipo}" data-ref-id="${s.id}"
            style="text-align:left;border:1px solid #d1d5db;background:#fff;padding:10px;border-radius:5px;cursor:pointer">
            <div style="font-size:11px;color:#6b7280">${s.ref_tipo}${s.subtipo?' · '+s.subtipo:''}</div>
            <div style="font-weight:600">${s.nro_cotizacion || s.descripcion || '—'}${s.cliente ? ' · ' + s.cliente : ''}</div>
            <div style="font-size:11px;color:#6b7280">${String(s.fecha).slice(0,10)} · ${fMoney(s.monto,'PEN')}${s.nro_operacion?' · op '+s.nro_operacion:''}</div>
          </button>
        `).join('')}
      </div>
    `}
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button id="sug-cancel" style="padding:7px 14px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cancelar</button>
    </div>
  `;
  ov.appendChild(box);
  document.body.appendChild(ov);
  box.querySelector('#sug-cancel').onclick = () => ov.remove();

  const doConc = async (refTipo, refId) => {
    try {
      await api.cobranzas.conciliarMovimiento(idMov, { ref_tipo: refTipo, ref_id: refId });
      showSuccess('Movimiento conciliado');
      ov.remove();
      onDone && onDone();
    } catch (err) { showError('Error: ' + err.message); }
  };

  const manualBtn = box.querySelector('#conc-manual');
  if (manualBtn) manualBtn.onclick = () => doConc('OTRO', null);

  box.querySelectorAll('.sug').forEach(b => {
    b.onclick = () => doConc(b.dataset.refTipo, Number(b.dataset.refId));
  });
}

// ── Modal: Pago de IGV a SUNAT ─────────────────────────────────
async function modalPagoIGV(dashboard) {
  const draw = async () => {
    let pagos, cuentas;
    try {
      [pagos, cuentas] = await Promise.all([
        api.cobranzas.getPagosImpuestos(),
        api.cobranzas.getCuentas(),
      ]);
    } catch (e) { return `<p style="color:#dc2626">Error: ${e.message}</p>`; }

    const cuentasBanco = cuentas.filter(c => c.tipo === 'BANCO');
    const hoy = new Date().toISOString().slice(0,10);
    const mesActual = hoy.slice(0,7);
    // Mes anterior (SUNAT paga mes vencido)
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const mesAnterior = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

    const igvSugerido = dashboard?.igv_mes || 0;

    return `
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">🏛️ Pago IGV a SUNAT</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px">Declaración mensual · vencimiento día 15 del mes siguiente</div>

      <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:6px;margin-bottom:14px">
        <div style="font-size:11px;color:#991b1b;font-weight:600">IGV devengado en el mes actual (${dashboard?.mes || mesActual})</div>
        <div style="font-size:24px;font-weight:700;color:#991b1b;margin-top:2px">${fMoney(igvSugerido,'PEN')}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px">${dashboard?.igv_cotizaciones_mes || 0} cotizaciones emitidas este mes</div>
      </div>

      <form id="form-igv" style="background:#f9fafb;padding:12px;border-radius:6px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">➕ Registrar pago de IGV</div>
        <div style="display:grid;grid-template-columns:130px 110px 1fr 130px;gap:8px;margin-bottom:8px">
          <div>
            <label style="font-size:10px;color:#6b7280;font-weight:600">Fecha pago</label>
            <input type="date" name="fecha" value="${hoy}" required style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
          </div>
          <div>
            <label style="font-size:10px;color:#6b7280;font-weight:600">Periodo</label>
            <input type="month" name="periodo" value="${mesAnterior}" required style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
          </div>
          <div>
            <label style="font-size:10px;color:#6b7280;font-weight:600">Cuenta origen</label>
            <select name="id_cuenta" required style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
              <option value="">— cuenta banco —</option>
              ${cuentasBanco.filter(c=>c.moneda==='PEN').map(c => `<option value="${c.id_cuenta}">${c.nombre}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:10px;color:#6b7280;font-weight:600">Monto pagado (PEN)</label>
            <input type="number" step="0.01" name="monto" placeholder="0.00" required style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px">
          </div>
        </div>
        <input type="text" name="descripcion" placeholder="Descripción (opcional)" style="width:100%;padding:6px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:8px">
        <button type="submit" style="background:#dc2626;color:#fff;border:none;padding:8px 16px;border-radius:4px;font-weight:600;font-size:12px;cursor:pointer">Registrar pago SUNAT</button>
      </form>

      <div style="font-size:12px;font-weight:700;margin-bottom:6px">Historial de pagos</div>
      ${pagos.length === 0 ? '<p style="color:#6b7280;font-size:12px;text-align:center;padding:20px">Sin pagos registrados</p>' : `
      <div style="max-height:260px;overflow:auto;border:1px solid #e5e7eb;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb;position:sticky;top:0">
            <tr>
              <th style="padding:6px;text-align:left">Fecha pago</th>
              <th style="padding:6px;text-align:left">Periodo</th>
              <th style="padding:6px;text-align:left">Impuesto</th>
              <th style="padding:6px;text-align:left">Cuenta</th>
              <th style="padding:6px;text-align:right">Monto</th>
              <th style="padding:6px"></th>
            </tr>
          </thead>
          <tbody>
            ${pagos.map(p => `
              <tr style="border-top:1px solid #f1f5f9">
                <td style="padding:6px">${String(p.fecha).slice(0,10)}</td>
                <td style="padding:6px"><span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">${p.periodo}</span></td>
                <td style="padding:6px">${p.tipo_impuesto}</td>
                <td style="padding:6px;font-size:11px">${p.cuenta_nombre || '—'}</td>
                <td style="padding:6px;text-align:right;color:#dc2626;font-weight:600">-${fMoney(p.monto, p.moneda)}</td>
                <td style="padding:6px;text-align:center">
                  <button class="btn-del-igv" data-id="${p.id_pago}" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:14px">🗑</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`}

      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button id="close-igv" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cerrar</button>
      </div>
    `;
  };

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:820px;width:100%;max-height:90vh;overflow:auto';
  ov.appendChild(box);

  const refresh = async () => {
    box.innerHTML = await draw();
    box.querySelector('#close-igv').onclick = () => ov.remove();

    box.querySelector('#form-igv').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.cobranzas.registrarPagoIGV({
          fecha:       fd.get('fecha'),
          periodo:     fd.get('periodo'),
          id_cuenta:   Number(fd.get('id_cuenta')),
          monto:       Number(fd.get('monto')),
          descripcion: fd.get('descripcion') || undefined,
        });
        showSuccess('Pago IGV registrado');
        refresh();
      } catch (err) { showError('Error: ' + err.message); }
    };

    box.querySelectorAll('.btn-del-igv').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('¿Eliminar este pago? Se repondrá al saldo de la cuenta.')) return;
        try {
          await api.cobranzas.deletePagoImpuesto(Number(btn.dataset.id));
          showSuccess('Pago eliminado');
          refresh();
        } catch (err) { showError('Error: ' + err.message); }
      };
    });
  };

  document.body.appendChild(ov);
  refresh();
}

// ── Modal: Editar datos tributarios ─────────────────────────────
async function modalEditarTributario(cot) {
  const cfg = MARCAS[cot.marca] || MARCAS.METAL;
  const total = Number(cot.total) || 0;
  const pctActual = Number(cot.detraccion_porcentaje) || 0;
  const pctRetActual = Number(cot.retencion_porcentaje) || 0;

  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:30px;overflow:auto';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;max-width:460px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
        <div style="padding:16px 20px;border-top:4px solid ${cfg.color};border-bottom:1px solid #e5e7eb">
          <h3 style="margin:0 0 3px 0;font-size:15px">Editar detracción / retención</h3>
          <div style="font-size:12px;color:var(--text-secondary)">${cot.nro_cotizacion} · Total ${fMoney(total, cot.moneda)}</div>
        </div>
        <div style="padding:16px 20px">
          <div style="background:#fef3c7;border:1px solid #fde68a;padding:10px;border-radius:6px;font-size:11px;color:#92400e;margin-bottom:14px">
            Finanzas define si el servicio lleva detracción y el %. Al guardar se recalcula el estado automáticamente.
          </div>

          <form id="form-trib" style="display:flex;flex-direction:column;gap:12px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);font-weight:600">% Detracción</label>
              <div style="display:flex;gap:6px;margin-top:4px">
                <select id="pct-preset" style="padding:8px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
                  <option value="">— Preset —</option>
                  <option value="0">Sin detracción</option>
                  <option value="4">4%  (Servicios diversos)</option>
                  <option value="10">10% (Servicios empresariales)</option>
                  <option value="12">12% (Construcción / Transporte bienes)</option>
                  <option value="15">15%</option>
                </select>
                <input name="detraccion_porcentaje" type="number" step="0.01" min="0" max="100"
                  value="${pctActual}" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:5px">
                <span style="align-self:center;font-weight:600">%</span>
              </div>
              <div id="prev-det" style="margin-top:6px;font-size:12px;color:#92400e">
                Monto detracción: <strong>${fMoney(total * pctActual / 100, cot.moneda)}</strong>
              </div>
            </div>

            <div>
              <label style="font-size:11px;color:var(--text-secondary);font-weight:600">% Retención (si el cliente es agente retenedor)</label>
              <div style="display:flex;gap:6px;margin-top:4px">
                <select id="pct-ret-preset" style="padding:8px;border:1px solid #d1d5db;border-radius:5px;font-size:13px">
                  <option value="">— Preset —</option>
                  <option value="0">No retiene</option>
                  <option value="3">3% (agente retenedor)</option>
                </select>
                <input name="retencion_porcentaje" type="number" step="0.01" min="0" max="100"
                  value="${pctRetActual}" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:5px">
                <span style="align-self:center;font-weight:600">%</span>
              </div>
              <div id="prev-ret" style="margin-top:6px;font-size:12px;color:#6b21a8">
                Monto retención: <strong>${fMoney(total * pctRetActual / 100, cot.moneda)}</strong>
              </div>
            </div>
          </form>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <button id="trib-cancel" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:13px">Cancelar</button>
          <button id="trib-ok" style="padding:8px 18px;border:none;background:${cfg.color};color:#fff;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    const form = ov.querySelector('#form-trib');
    const preset = ov.querySelector('#pct-preset');
    const prevDet = ov.querySelector('#prev-det');
    const prevRet = ov.querySelector('#prev-ret');

    const refreshDet = () => {
      const v = Number(form.detraccion_porcentaje.value) || 0;
      prevDet.innerHTML = `Monto detracción: <strong>${fMoney(total * v / 100, cot.moneda)}</strong>`;
    };
    const refreshRet = () => {
      const v = Number(form.retencion_porcentaje.value) || 0;
      prevRet.innerHTML = `Monto retención: <strong>${fMoney(total * v / 100, cot.moneda)}</strong>`;
    };

    preset.onchange = () => {
      if (preset.value !== '') { form.detraccion_porcentaje.value = preset.value; refreshDet(); }
    };
    const presetRet = ov.querySelector('#pct-ret-preset');
    presetRet.onchange = () => {
      if (presetRet.value !== '') { form.retencion_porcentaje.value = presetRet.value; refreshRet(); }
    };
    form.detraccion_porcentaje.oninput = refreshDet;
    form.retencion_porcentaje.oninput = refreshRet;

    ov.querySelector('#trib-cancel').onclick = () => close(null);
    ov.onclick = (e) => { if (e.target === ov) close(null); };
    ov.querySelector('#trib-ok').onclick = () => {
      close({
        detraccion_porcentaje: Number(form.detraccion_porcentaje.value) || 0,
        retencion_porcentaje:  Number(form.retencion_porcentaje.value)  || 0,
      });
    };
  });
}

// ── Modal: Detalle / historial ──────────────────────────────────
// ── Modal: Registrar factura ───────────────────────────────
function modalFacturar(cot) {
  return new Promise(resolve => {
    const hoy = new Date().toISOString().slice(0,10);
    const cfg = MARCAS[cot.marca] || MARCAS.METAL;
    const serie = cot.marca === 'METAL' ? 'F001-' : 'F002-';

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:8px;padding:22px;max-width:480px;width:100%';
    box.innerHTML = `
      <div style="font-size:16px;font-weight:700;margin-bottom:4px">📄 Registrar factura</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:14px">${cot.nro_cotizacion} · ${cot.cliente} · ${fMoney(cot.total, cot.moneda)}</div>
      <form id="form-fac">
        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:#6b7280;font-weight:600">Número de factura</label>
          <input type="text" name="nro_factura" value="${serie}" required style="width:100%;padding:8px;font-size:13px;border:1px solid #d1d5db;border-radius:4px" placeholder="F001-000123">
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:11px;color:#6b7280;font-weight:600">Fecha de emisión</label>
          <input type="date" name="fecha_factura" value="${hoy}" required style="width:100%;padding:8px;font-size:13px;border:1px solid #d1d5db;border-radius:4px">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" id="fac-cancel" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer">Cancelar</button>
          <button type="submit" style="padding:8px 16px;background:${cfg.color};color:#fff;border:none;border-radius:4px;font-weight:600;cursor:pointer">Registrar factura</button>
        </div>
      </form>
    `;
    ov.appendChild(box);
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    ov.onclick = (e) => { if (e.target === ov) close(null); };
    box.querySelector('#fac-cancel').onclick = () => close(null);
    box.querySelector('#form-fac').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      close({
        nro_factura:   String(fd.get('nro_factura')).trim(),
        fecha_factura: fd.get('fecha_factura'),
      });
    };
  });
}

async function modalDetalle(id) {
  let det;
  try {
    det = await api.cobranzas.getDetalle(id);
  } catch (e) {
    showError('No se pudo cargar el detalle: ' + e.message);
    return;
  }
  const c = det.cotizacion;
  const movs = det.movimientos || [];
  const cfg = MARCAS[c.marca] || MARCAS.METAL;

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px;overflow:auto';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:8px;max-width:760px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
      <div style="padding:18px 22px;border-top:4px solid ${cfg.color};border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
        <div>
          <h3 style="margin:0 0 3px 0;font-size:15px">Detalle de cobranza · ${c.nro_cotizacion}</h3>
          <div style="font-size:12px;color:var(--text-secondary)">${c.cliente} · ${c.proyecto || ''}</div>
        </div>
        <button id="det-x" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af">×</button>
      </div>

      <div style="padding:16px 22px">
        <!-- Desglose tributario -->
        <div style="margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:.4px">DESGLOSE TRIBUTARIO</div>
            <button id="btn-edit-tributario" style="padding:4px 10px;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer;font-size:11px">✏️ Editar detracción / retención</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;font-size:12px">
            <div style="padding:10px;background:#f9fafb;border-radius:6px">
              <div style="color:var(--text-secondary);font-size:10px">SUBTOTAL</div>
              <div style="font-weight:700;font-size:14px">${fMoney(c.subtotal, c.moneda)}</div>
            </div>
            <div style="padding:10px;background:#eff6ff;border-radius:6px">
              <div style="color:#1e40af;font-size:10px">IGV 18%</div>
              <div style="font-weight:700;font-size:14px;color:#1e40af">${fMoney(c.igv, c.moneda)}</div>
            </div>
            <div style="padding:10px;background:#fef3c7;border-radius:6px">
              <div style="color:#92400e;font-size:10px">DETRACCIÓN ${Number(c.detraccion_porcentaje) > 0 ? `(${Number(c.detraccion_porcentaje)}%)` : ''}</div>
              <div style="font-weight:700;font-size:14px;color:#92400e">${Number(c.monto_detraccion) > 0 ? fMoney(c.monto_detraccion, c.moneda) : '— no aplica'}</div>
            </div>
            <div style="padding:10px;background:#f3e8ff;border-radius:6px">
              <div style="color:#6b21a8;font-size:10px">RETENCIÓN ${Number(c.retencion_porcentaje) > 0 ? `(${Number(c.retencion_porcentaje)}%)` : ''}</div>
              <div style="font-weight:700;font-size:14px;color:#6b21a8">${Number(c.monto_retencion) > 0 ? fMoney(c.monto_retencion, c.moneda) : '— no aplica'}</div>
            </div>
            <div style="padding:10px;background:#ecfdf5;border-radius:6px">
              <div style="color:#166534;font-size:10px">TOTAL</div>
              <div style="font-weight:700;font-size:14px;color:#166534">${fMoney(c.total, c.moneda)}</div>
            </div>
          </div>
        </div>

        <!-- Avance de cobro -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;font-size:12px">
          <div style="padding:10px;background:#f9fafb;border-radius:6px">
            <div style="color:var(--text-secondary);font-size:10px">NETO AL BANCO</div>
            <div style="font-weight:700;font-size:14px">${fMoney(Number(c.total) - Number(c.monto_detraccion||0) - Number(c.monto_retencion||0), c.moneda)}</div>
          </div>
          <div style="padding:10px;background:#f9fafb;border-radius:6px">
            <div style="color:var(--text-secondary);font-size:10px">COBRADO BANCO</div>
            <div style="font-weight:700;font-size:14px">${fMoney(c.monto_cobrado_banco, c.moneda)}</div>
          </div>
          <div style="padding:10px;background:#f9fafb;border-radius:6px">
            <div style="color:var(--text-secondary);font-size:10px">COBRADO DETRACCIÓN</div>
            <div style="font-weight:700;font-size:14px">${fMoney(c.monto_cobrado_detraccion, c.moneda)}</div>
          </div>
        </div>

        <!-- Facturación -->
        ${(() => {
          const ef = c.estado_financiero;
          const puedeFacturar = ['FONDEADA_TOTAL','SIN_DETRACCION_FONDEADA'].includes(ef);
          const estaFacturada = ef === 'FACTURADA';
          const estaCobrada   = ef === 'COBRADA';
          if (!puedeFacturar && !estaFacturada && !estaCobrada) {
            return `
              <div style="padding:10px;background:#f9fafb;border:1px dashed #d1d5db;border-radius:6px;margin-bottom:14px;font-size:12px;color:#6b7280">
                📄 Facturación: disponible cuando la cotización esté <b>fondeada</b>. Estado actual: <b>${ef}</b>
              </div>
            `;
          }
          return `
            <div style="padding:12px;background:${estaCobrada?'#ecfdf5':estaFacturada?'#eff6ff':'#fffbeb'};border:1px solid ${estaCobrada?'#a7f3d0':estaFacturada?'#bfdbfe':'#fde68a'};border-radius:6px;margin-bottom:14px">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-size:11px;font-weight:700;color:${estaCobrada?'#166534':estaFacturada?'#1e40af':'#92400e'};letter-spacing:.4px">
                    ${estaCobrada?'✅ COBRADA':estaFacturada?'📄 FACTURADA':'💼 LISTA PARA FACTURAR'}
                  </div>
                  ${(estaFacturada||estaCobrada) ? `
                    <div style="font-size:12px;margin-top:4px"><b>Factura:</b> ${c.nro_factura || '—'} · <b>Fecha:</b> ${c.fecha_factura ? String(c.fecha_factura).slice(0,10) : '—'}</div>
                    ${estaCobrada && c.fecha_cobro_total ? `<div style="font-size:11px;color:#6b7280">Cobrada el ${String(c.fecha_cobro_total).slice(0,10)}</div>`:''}
                  ` : `
                    <div style="font-size:12px;color:#92400e;margin-top:4px">Emite la factura y regístrala aquí para continuar al cobro final</div>
                  `}
                </div>
                <div style="display:flex;gap:6px">
                  ${puedeFacturar ? `<button id="btn-facturar" style="background:#2563eb;color:#fff;border:none;padding:7px 14px;border-radius:4px;font-weight:600;font-size:12px;cursor:pointer">📄 Registrar factura</button>` : ''}
                  ${estaFacturada ? `
                    <button id="btn-cobrada" style="background:#16a34a;color:#fff;border:none;padding:7px 14px;border-radius:4px;font-weight:600;font-size:12px;cursor:pointer">💰 Marcar cobrada</button>
                    <button id="btn-revertir-fac" style="background:#fff;color:#dc2626;border:1px solid #fecaca;padding:7px 12px;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer">↶ Revertir</button>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        })()}

        <h4 style="margin:0 0 8px 0;font-size:13px">Movimientos registrados</h4>
        ${movs.length === 0
          ? `<div style="text-align:center;padding:18px;color:var(--text-secondary);font-size:12px">Sin movimientos aún</div>`
          : `<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb">
              <thead style="background:#f9fafb">
                <tr style="text-align:left">
                  <th style="padding:8px 10px">Fecha</th>
                  <th style="padding:8px 10px">Tipo</th>
                  <th style="padding:8px 10px">Cuenta / Banco</th>
                  <th style="padding:8px 10px">Nº Op</th>
                  <th style="padding:8px 10px;text-align:right">Monto</th>
                  <th style="padding:8px 10px"></th>
                </tr>
              </thead>
              <tbody>
                ${movs.map(m => `
                  <tr style="border-top:1px solid #f3f4f6">
                    <td style="padding:8px 10px">${m.fecha_movimiento?.slice(0,10) || ''}</td>
                    <td style="padding:8px 10px">
                      <span style="background:${m.tipo === 'DETRACCION_BN' ? '#fef3c7' : '#dbeafe'};color:${m.tipo === 'DETRACCION_BN' ? '#92400e' : '#1e40af'};padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">${m.tipo.replace('_',' ')}</span>
                    </td>
                    <td style="padding:8px 10px">${m.cuenta_nombre || m.banco || '—'}</td>
                    <td style="padding:8px 10px">${m.nro_operacion || '—'}</td>
                    <td style="padding:8px 10px;text-align:right;font-weight:600">${fMoney(m.monto, m.moneda)}</td>
                    <td style="padding:8px 10px;text-align:right">
                      <button class="cob-del" data-id="${m.id_cobranza}" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:11px">Eliminar</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('#det-x').onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };

  // Editar detracción / retención
  ov.querySelector('#btn-edit-tributario').onclick = async () => {
    const nuevo = await modalEditarTributario(c);
    if (!nuevo) return;
    try {
      await api.cobranzas.actualizarTributario(c.id_cotizacion, nuevo);
      showSuccess('Datos tributarios actualizados');
      close();
      window.dispatchEvent(new Event('hashchange'));
    } catch (e) { showError(e.message); }
  };

  // Facturación
  const btnFac = ov.querySelector('#btn-facturar');
  if (btnFac) btnFac.onclick = async () => {
    const data = await modalFacturar(c);
    if (!data) return;
    try {
      await api.cobranzas.facturar(c.id_cotizacion, data);
      showSuccess('Cotización facturada');
      close();
      window.dispatchEvent(new Event('hashchange'));
    } catch (e) { showError(e.message); }
  };
  const btnCob = ov.querySelector('#btn-cobrada');
  if (btnCob) btnCob.onclick = async () => {
    if (!confirm('¿Marcar esta factura como COBRADA por completo? Cierra el ciclo financiero.')) return;
    try {
      await api.cobranzas.marcarCobrada(c.id_cotizacion);
      showSuccess('Marcada como cobrada');
      close();
      window.dispatchEvent(new Event('hashchange'));
    } catch (e) { showError(e.message); }
  };
  const btnRev = ov.querySelector('#btn-revertir-fac');
  if (btnRev) btnRev.onclick = async () => {
    if (!confirm('¿Revertir la facturación? Volverá al estado fondeado y se borrarán nro/fecha de factura.')) return;
    try {
      await api.cobranzas.revertirFactura(c.id_cotizacion);
      showSuccess('Facturación revertida');
      close();
      window.dispatchEvent(new Event('hashchange'));
    } catch (e) { showError(e.message); }
  };

  ov.querySelectorAll('.cob-del').forEach(b => {
    b.onclick = async () => {
      if (!confirm('¿Eliminar este movimiento? Esto recalcula el estado.')) return;
      try {
        await api.cobranzas.eliminar(Number(b.dataset.id));
        showSuccess('Movimiento eliminado');
        close();
        location.hash = location.hash; // re-render
        window.dispatchEvent(new Event('hashchange'));
      } catch (e) { showError(e.message); }
    };
  });
}

// ── Página principal ────────────────────────────────────────────
function renderDashboard(d) {
  const card = (label, value, sub, color) => `
    <div style="flex:1;min-width:160px;background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:8px;padding:12px 14px">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;letter-spacing:.3px">${label}</div>
      <div style="font-size:20px;font-weight:700;color:#111827;margin-top:4px">${value}</div>
      ${sub ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${sub}</div>` : ''}
    </div>
  `;
  const topList = (d.top_vencidas || []).map(t => `
    <tr>
      <td style="padding:4px 8px;font-size:11px">${t.nro_cotizacion}</td>
      <td style="padding:4px 8px;font-size:11px">${t.cliente}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:right">${fMoney(t.saldo_det, t.moneda)}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">
        <span style="color:${t.dias > 30 ? '#dc2626' : t.dias > 15 ? '#d97706' : '#16a34a'};font-weight:600">${t.dias}d</span>
      </td>
    </tr>
  `).join('');

  return `
    <div style="margin-bottom:18px">
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:600">
        📊 DASHBOARD EJECUTIVO · Mes ${d.mes}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        ${card('Caja Soles', fMoney(d.caja.PEN, 'PEN'), 'depósitos a bancos/caja', '#16a34a')}
        ${card('Caja Dólares', fMoney(d.caja.USD, 'USD'), 'depósitos a bancos/caja', '#0891b2')}
        ${card('Banco de la Nación', fMoney(d.bn, 'PEN'), 'detracciones recibidas', '#7c3aed')}
        ${card('Retenciones', fMoney(d.retenciones, 'PEN'), 'certificados acumulados', '#db2777')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('IGV del mes', fMoney(d.igv_mes, 'PEN'), `${d.igv_cotizaciones_mes} cotiz. · vence día 15`, '#dc2626')}
        ${card('Detracciones pendientes', fMoney(d.detracciones_pendientes.total, 'PEN'),
          `${d.detracciones_pendientes.cantidad} servicios · ${d.detracciones_pendientes.dias_promedio}d prom.`, '#f59e0b')}
        ${card('Depósitos pendientes PEN', fMoney(d.depositos_pendientes.pen, 'PEN'),
          `${d.depositos_pendientes.cantidad} servicios esperando`, '#f59e0b')}
        ${card('Depósitos pendientes USD', fMoney(d.depositos_pendientes.usd, 'USD'),
          'neto al banco pendiente', '#f59e0b')}
      </div>
      ${topList ? `
      <div style="margin-top:12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="padding:8px 12px;background:#fef2f2;font-size:11px;font-weight:700;color:#991b1b;border-bottom:1px solid #fecaca">
          🔴 TOP 5 DETRACCIONES MÁS ANTIGUAS (esperando depósito al BN)
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#6b7280">Nro</th>
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#6b7280">Cliente</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#6b7280">Saldo det.</th>
              <th style="padding:4px 8px;font-size:10px;text-align:center;color:#6b7280">Días</th>
            </tr>
          </thead>
          <tbody>${topList}</tbody>
        </table>
      </div>` : ''}
    </div>
  `;
}

export const Finanzas = async () => {
  let dataMetal, dataPerfo, cuentas, dashboard;
  try {
    [dataMetal, dataPerfo, cuentas, dashboard] = await Promise.all([
      api.cobranzas.getBandejas('METAL'),
      api.cobranzas.getBandejas('PERFOTOOLS'),
      api.cobranzas.getCuentas(),
      api.cobranzas.getDashboard(),
    ]);
  } catch (e) {
    return `<div class="card"><p style="color:#dc2626">Error cargando Finanzas: ${e.message}</p></div>`;
  }

  setTimeout(() => bindHandlers(cuentas, dashboard), 50);

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <h2 style="margin:0;font-size:20px">Finanzas — Cobranzas</h2>
        <div style="font-size:12px;color:var(--text-secondary)">
          Cotizaciones APROBADAS por Comercial · esperando depósito y detracción
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="btn-libro-bancos" style="padding:8px 14px;border:1px solid #111827;background:#111827;color:#fff;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">
          📖 Libro Bancos
        </button>
        <button id="btn-conciliacion" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">
          🧾 Conciliación
        </button>
        <button id="btn-pago-igv" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">
          🏛️ Pago IGV SUNAT
        </button>
        <button id="btn-gastos-bancarios" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">
          💳 Gastos bancarios
        </button>
        <button id="btn-gestion-cuentas" style="padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">
          🏦 Gestionar cuentas
        </button>
      </div>
    </div>

    ${renderDashboard(dashboard)}

    <!-- Tabs PEN / USD -->
    <div style="display:flex;gap:4px;border-bottom:2px solid #e5e7eb">
      <button class="tab-fin tab-fin-active" data-tab="metal"
        style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;border-bottom:3px solid transparent">
        Soles · Metal Engineers
        <span style="background:#000;color:#fff;padding:1px 7px;border-radius:10px;font-size:10px;margin-left:6px">${dataMetal.esperando_pago.length + dataMetal.esperando_detraccion.length}</span>
      </button>
      <button class="tab-fin" data-tab="perfo"
        style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;border-bottom:3px solid transparent">
        Dólares · Perfotools
        <span style="background:#dc2626;color:#fff;padding:1px 7px;border-radius:10px;font-size:10px;margin-left:6px">${dataPerfo.esperando_pago.length + dataPerfo.esperando_detraccion.length}</span>
      </button>
    </div>

    <div class="tab-fin-panel" data-tab="metal" style="display:block;margin-top:16px">
      ${renderTabMarca('METAL', dataMetal)}
    </div>
    <div class="tab-fin-panel" data-tab="perfo" style="display:none;margin-top:16px">
      ${renderTabMarca('PERFOTOOLS', dataPerfo)}
    </div>

    <style>
      .tab-fin { color: var(--text-secondary); }
      .tab-fin.tab-fin-active { color: var(--text-primary); border-bottom-color: var(--primary-color) !important; }
    </style>
  `;
};

// ── Wire handlers después del render ────────────────────────────
function bindHandlers(cuentas, dashboard) {
  // Tabs
  document.querySelectorAll('.tab-fin').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-fin').forEach(b => b.classList.remove('tab-fin-active'));
      btn.classList.add('tab-fin-active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-fin-panel').forEach(p => {
        p.style.display = p.dataset.tab === tab ? 'block' : 'none';
      });
    };
  });

  // Refresh
  document.querySelectorAll('.btn-refresh').forEach(btn => {
    btn.onclick = () => window.dispatchEvent(new Event('hashchange'));
  });

  // Gestión de cuentas
  const btnCuentas = document.getElementById('btn-gestion-cuentas');
  if (btnCuentas) btnCuentas.onclick = () => modalGestionCuentas();

  // Gastos bancarios
  const btnGB = document.getElementById('btn-gastos-bancarios');
  if (btnGB) btnGB.onclick = () => modalGastosBancarios();

  // Pago IGV
  const btnIGV = document.getElementById('btn-pago-igv');
  if (btnIGV) btnIGV.onclick = () => modalPagoIGV(dashboard);

  // Conciliación
  const btnConc = document.getElementById('btn-conciliacion');
  if (btnConc) btnConc.onclick = () => modalConciliacion();

  // Libro Bancos
  const btnLB = document.getElementById('btn-libro-bancos');
  if (btnLB) btnLB.onclick = () => modalLibroBancos();

  // Registrar cobranza
  document.querySelectorAll('.btn-registrar').forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.id);
      // Buscamos la cotización en los datos ya cargados (rowCotizacion sólo tiene básicos)
      // Recargamos detalle para tener los campos completos
      let det;
      try { det = await api.cobranzas.getDetalle(id); }
      catch (e) { return showError(e.message); }
      const data = await modalRegistrarCobranza(det.cotizacion, cuentas);
      if (!data) return;
      try {
        await api.cobranzas.registrar(data);
        showSuccess('Cobranza registrada');
        window.dispatchEvent(new Event('hashchange'));
      } catch (e) {
        showError('Error: ' + e.message);
      }
    };
  });

  // Detalle
  document.querySelectorAll('.btn-detalle').forEach(btn => {
    btn.onclick = () => modalDetalle(Number(btn.dataset.id));
  });
}

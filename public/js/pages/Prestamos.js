import { api } from '../services/api.js';
import { showSuccess, showError, tip } from '../services/ui.js';
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

const badge = (estado) => `<span class="status-badge ${ESTADO_STYLE[estado] || 'status-pendiente'}">${estado}</span>`;

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
          <input id="edit-monto_capital" type="number" step="0.01" required style="${inputStyle}" oninput="window.calcEditTotal()">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Interés (S/.)</label>
          <input id="edit-monto_interes" type="number" step="0.01" value="0" style="${inputStyle}" oninput="window.calcEditTotal()">
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
const formCrear = (tipo, tcVenta = 1, tcFecha = '') => {
  const esTomado = tipo === 'tomado';
  const labelContraparte = esTomado ? 'Acreedor (quién me presta)' : 'Deudor (a quién le presto)';
  const idForm = `form-crear-${tipo}`;
  return `
  <div class="card" style="margin-top:0">
    <h3 style="margin-bottom:15px;font-weight:600;font-size:14px">Registrar Préstamo ${esTomado ? 'Tomado' : 'Otorgado'}</h3>
    <form id="${idForm}" style="display:flex;flex-direction:column;gap:10px;">
      <div id="banner-usd-${tipo}" style="display:none; background:#16a34a; color:white; padding:10px 14px; border-radius:6px; font-size:13px; font-weight:600;">💵 Transacción PerfoTools — Dólares americanos</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">N° OC (opcional)</label>
          <input name="nro_oc" placeholder="OC-001" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">${labelContraparte}</label>
          <input name="contraparte" placeholder="${esTomado ? 'Banco / Socio / Empresa' : 'Trabajador / Cliente / Tercero'}" required style="${inputStyle}">
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
          <input name="monto_capital" type="number" step="0.01" min="0.01" required placeholder="0.00" style="${inputStyle}" oninput="window.calcTotal_${tipo}(this.form)">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Interés ${tip('Monto total de intereses sobre el capital. Si el préstamo es a S/ 10.000 con S/ 1.200 de intereses, va 1200 acá. 0 si no hay intereses.')}</label>
          <input name="monto_interes" type="number" step="0.01" value="0" style="${inputStyle}" oninput="window.calcTotal_${tipo}(this.form)">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary)">Total ${tip('Capital + Intereses. Se calcula automáticamente. Es la deuda total a pagar/cobrar.')}</label>
          <input name="monto_total_display" readonly placeholder="0.00" style="${inputStyle};background:#f8f9fa;font-weight:bold">
        </div>
      </div>
      <button type="submit" style="padding:11px;border:none;background:var(--bg-sidebar);color:white;border-radius:var(--radius-sm);cursor:pointer;font-weight:bold;font-size:13px;margin-top:4px;">
        ${esTomado ? 'Registrar Deuda' : 'Registrar Préstamo'}
      </button>
    </form>
  </div>`;
};

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
    return `
    <tr>
      <td style="font-size:11px;color:var(--text-secondary)">${p.nro_oc || '---'}
        <br><span style="background:${esUSD?'#16a34a':'#6b7280'};color:white;padding:1px 6px;border-radius:3px;font-size:10px">${esUSD?'💵 PerfoTools':'⚙️ Metal Engineers'}</span>
      </td>
      <td>
        <strong>${esTomado ? p.acreedor : p.deudor}</strong>
        ${p.descripcion ? `<br><span style="font-size:10px;color:var(--text-secondary)">${p.descripcion}</span>` : ''}
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
          <button class="action-btn" style="font-size:11px" onclick="window.abrirEditar('${tipo}',${JSON.stringify(p).replace(/"/g,'&quot;')})">Editar</button>
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

  setTimeout(() => {
    // Calcular total en formulario crear tomado
    window.calcTotal_tomado = (form) => {
      const c = Number(form.monto_capital.value) || 0;
      const i = Number(form.monto_interes.value) || 0;
      form.monto_total_display.value = (c + i).toFixed(2);
    };
    window.calcTotal_otorgado = (form) => {
      const c = Number(form.monto_capital.value) || 0;
      const i = Number(form.monto_interes.value) || 0;
      form.monto_total_display.value = (c + i).toFixed(2);
    };

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

    function renderPrestamosDashboard() {
      const panel = document.getElementById('seccion-dashboard');
      if (!panel || panel.dataset.rendered === '1') return;
      panel.dataset.rendered = '1';

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

      panel.innerHTML = `
        <div style="margin-top:16px">
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
                        <strong style="font-size:12px">${contraparte.slice(0, 24)}</strong>
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

    // Form crear tomado
    const formT = document.getElementById('form-crear-tomado');
    if (formT) formT.onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const moneda = f.moneda.value || 'PEN';
      try {
        await api.prestamos.createTomado({
          nro_oc: f.nro_oc.value || null,
          acreedor: f.contraparte.value,
          descripcion: f.descripcion.value,
          comentario: f.comentario.value,
          fecha_emision: f.fecha_emision.value,
          fecha_vencimiento: f.fecha_vencimiento.value || null,
          moneda,
          tipo_cambio: moneda === 'USD' ? Number(f.tipo_cambio?.value) || 1 : 1,
          monto_capital: f.monto_capital.value,
          monto_interes: f.monto_interes.value || 0,
          tasa_interes: 0
        });
        showSuccess('Préstamo tomado registrado');
        window.location.reload();
      } catch(err) { showError(err.error || 'Error al registrar préstamo'); }
    };

    // Form crear otorgado
    const formO = document.getElementById('form-crear-otorgado');
    if (formO) formO.onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const moneda = f.moneda.value || 'PEN';
      try {
        await api.prestamos.createOtorgado({
          nro_oc: f.nro_oc.value || null,
          deudor: f.contraparte.value,
          descripcion: f.descripcion.value,
          comentario: f.comentario.value,
          fecha_emision: f.fecha_emision.value,
          fecha_vencimiento: f.fecha_vencimiento.value || null,
          moneda,
          tipo_cambio: moneda === 'USD' ? Number(f.tipo_cambio?.value) || 1 : 1,
          monto_capital: f.monto_capital.value,
          monto_interes: f.monto_interes.value || 0,
          tasa_interes: 0
        });
        showSuccess('Préstamo otorgado registrado');
        window.location.reload();
      } catch(err) { showError(err.error || 'Error al registrar préstamo'); }
    };

    // Pagar / Cobrar
    window.registrarPago = async (tipo, id) => {
      const monto = prompt(tipo === 'tomado' ? 'Monto a pagar (S/.)' : 'Monto cobrado (S/.)');
      if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) return;
      try {
        const res = tipo === 'tomado'
          ? await api.prestamos.pagarTomado(id, Number(monto))
          : await api.prestamos.cobrarOtorgado(id, Number(monto));
        showSuccess('Registrado. Estado: ' + res.estado);
        window.location.reload();
      } catch(err) { showError(err.error || 'Error al registrar pago'); }
    };

    // Eliminar
    window.eliminarPrestamo = async (tipo, id) => {
      if (!confirm('¿Eliminar este préstamo? Solo es posible si no tiene pagos.')) return;
      try {
        tipo === 'tomado' ? await api.prestamos.deleteTomado(id) : await api.prestamos.deleteOtorgado(id);
        window.location.reload();
      } catch(err) { showError(err.error || err.message || 'Error al eliminar préstamo'); }
    };

    // Anular
    window.anularPrestamo = async (tipo, id) => {
      if (!confirm('¿Anular este préstamo?')) return;
      try {
        tipo === 'tomado' ? await api.prestamos.anularTomado(id) : await api.prestamos.anularOtorgado(id);
        window.location.reload();
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
        window.location.reload();
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

    <!-- Tarjetas resumen -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
      <div class="card" style="border-left:4px solid var(--danger);text-align:center">
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Total que Debo</p>
        <p style="font-size:28px;font-weight:700;color:var(--danger)">${formatCurrency(totales.total_debo)}</p>
        <p style="font-size:11px;color:var(--text-secondary)">Saldo pendiente préstamos tomados</p>
      </div>
      <div class="card" style="border-left:4px solid var(--primary-color);text-align:center">
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Total que Me Deben</p>
        <p style="font-size:28px;font-weight:700;color:var(--primary-color)">${formatCurrency(totales.total_me_deben)}</p>
        <p style="font-size:11px;color:var(--text-secondary)">Saldo pendiente préstamos otorgados</p>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:10px;margin-top:24px;margin-bottom:0;flex-wrap:wrap">
      <button id="tab-tomados"   onclick="window.showTab('tomados')"   style="${tabBase};background:var(--danger);color:white">🔴 Préstamos Tomados (Lo que debo)</button>
      <button id="tab-otorgados" onclick="window.showTab('otorgados')" style="${tabBase};background:var(--bg-app);color:var(--text-primary)">🟢 Préstamos Otorgados (Lo que me deben)</button>
      <button id="tab-dashboard" onclick="window.showTab('dashboard')" style="${tabBase};background:var(--bg-app);color:var(--text-primary)">📊 Dashboard</button>
    </div>

    <!-- SECCIÓN TOMADOS -->
    <div id="seccion-tomados" style="margin-top:16px">
      <div style="display:flex;gap:20px;align-items:flex-start">
        <div class="table-container" style="flex:2">
          ${buildTabla(tomados, 'tomado')}
        </div>
        <div style="flex:1;min-width:300px">
          ${formCrear('tomado', tcHoy.valor_venta, tcHoy.es_hoy ? 'hoy' : tcHoy.fecha)}
        </div>
      </div>
    </div>

    <!-- SECCIÓN OTORGADOS -->
    <div id="seccion-otorgados" style="display:none;margin-top:16px">
      <div style="display:flex;gap:20px;align-items:flex-start">
        <div class="table-container" style="flex:2">
          ${buildTabla(otorgados, 'otorgado')}
        </div>
        <div style="flex:1;min-width:300px">
          ${formCrear('otorgado', tcHoy.valor_venta, tcHoy.es_hoy ? 'hoy' : tcHoy.fecha)}
        </div>
      </div>
    </div>

    <!-- SECCIÓN DASHBOARD -->
    <div id="seccion-dashboard" style="display:none"></div>
  `;
};

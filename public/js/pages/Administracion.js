import { api } from '../services/api.js';
import { showError } from '../services/ui.js';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const fmt = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(val) || 0);

export const Administracion = async () => {
  const anioActual = new Date().getFullYear();
  let data = null;
  let anioSel = anioActual;
  let mesSel = '';

  const cargarDatos = async () => {
    try {
      data = await api.administracion.getGastoPersonal(anioSel, mesSel || undefined);
      renderContenido();
    } catch (err) {
      showError(err.error || 'Error al cargar datos de personal');
    }
  };

  // ── Render principal ──────────────────────────────────────────
  const renderContenido = () => {
    const container = document.getElementById('adm-contenido');
    if (!container || !data) return;

    const { totales, resumen, detalle } = data;
    const t = totales || {};

    // KPI cards
    const kpis = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
        <div class="card" style="border-top:4px solid #676767;text-align:center">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Total Personal</div>
          <div style="font-size:24px;font-weight:700;color:var(--text-primary)">${fmt(t.total_general)}</div>
        </div>
        <div class="card" style="border-top:4px solid #2d7a45;text-align:center">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Oficina Central</div>
          <div style="font-size:24px;font-weight:700;color:#2d7a45">${fmt(t.total_oficina)}</div>
        </div>
        <div class="card" style="border-top:4px solid #b5302a;text-align:center">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Proyectos</div>
          <div style="font-size:24px;font-weight:700;color:#b5302a">${fmt(t.total_proyectos)}</div>
        </div>
      </div>`;

    // Tabla resumen por mes / centro de costo
    const resumenRows = (resumen || []).map(r => `
      <tr>
        <td style="text-align:center">${MESES[r.mes] || r.mes}</td>
        <td>
          <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;
            background:${r.tipo_gasto_logistica === 'GENERAL' ? '#e8f5e9' : '#fff3e0'};
            color:${r.tipo_gasto_logistica === 'GENERAL' ? '#2d7a45' : '#b5302a'}">
            ${r.tipo_gasto_logistica === 'GENERAL' ? 'OFICINA' : 'PROYECTO'}
          </span>
        </td>
        <td>${r.centro_costo || '—'}</td>
        <td style="text-align:center">${r.cantidad}</td>
        <td style="text-align:right;font-weight:600">${fmt(r.total_gasto)}</td>
      </tr>
    `).join('');

    const tablaResumen = `
      <div class="card" style="margin-bottom:24px">
        <h3 style="margin:0 0 16px;font-size:15px;font-weight:600">Resumen por Centro de Costo</h3>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th style="text-align:center">Mes</th>
                <th>Tipo</th>
                <th>Centro de Costo</th>
                <th style="text-align:center">Registros</th>
                <th style="text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${resumenRows || '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary)">Sin datos para el período seleccionado</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    // Tabla detalle
    const detalleRows = (detalle || []).map(d => `
      <tr>
        <td>${String(d.fecha).split('T')[0]}</td>
        <td>${d.proveedor_nombre}</td>
        <td>${d.concepto}</td>
        <td>
          <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;
            background:${d.tipo_gasto_logistica === 'GENERAL' ? '#e8f5e9' : '#fff3e0'};
            color:${d.tipo_gasto_logistica === 'GENERAL' ? '#2d7a45' : '#b5302a'}">
            ${d.tipo_gasto_logistica === 'GENERAL' ? 'OFICINA' : 'PROYECTO'}
          </span>
        </td>
        <td style="font-size:12px;color:var(--text-secondary)">${d.centro_costo || '—'}</td>
        <td style="text-align:right">${fmt(d.monto_base)}</td>
        <td style="text-align:center">
          <span class="status-badge status-${String(d.estado_pago).toLowerCase()}">${d.estado_pago}</span>
        </td>
      </tr>
    `).join('');

    const tablaDetalle = `
      <div class="card">
        <h3 style="margin:0 0 16px;font-size:15px;font-weight:600">Detalle de Gastos de Personal</h3>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor / Persona</th>
                <th>Concepto</th>
                <th>Tipo</th>
                <th>Centro de Costo</th>
                <th style="text-align:right">Monto</th>
                <th style="text-align:center">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${detalleRows || '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary)">Sin registros</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    container.innerHTML = kpis + tablaResumen + tablaDetalle;
  };

  // Render HTML base (filtros + contenedor)
  const anioOpts = [anioActual - 1, anioActual, anioActual + 1]
    .map(a => `<option value="${a}" ${a === anioSel ? 'selected' : ''}>${a}</option>`).join('');

  const mesOpts = '<option value="">Todos los meses</option>' +
    MESES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');

  setTimeout(async () => {
    document.getElementById('adm-anio')?.addEventListener('change', async (e) => {
      anioSel = Number(e.target.value);
      await cargarDatos();
    });
    document.getElementById('adm-mes')?.addEventListener('change', async (e) => {
      mesSel = e.target.value;
      await cargarDatos();
    });
    await cargarDatos();
  }, 50);

  return `
    <header class="header">
      <div>
        <h1>Administración — Gasto en Personal</h1>
        <span style="color:var(--text-secondary)">Consolidado desde Logística. Solo visualización — sin re-digitación.</span>
      </div>
    </header>

    <div style="display:flex;gap:12px;align-items:center;margin:20px 0 0;flex-wrap:wrap">
      <div style="display:flex;gap:8px;align-items:center">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary)">Año:</label>
        <select id="adm-anio" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:var(--radius-sm);font-size:13px">
          ${anioOpts}
        </select>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary)">Mes:</label>
        <select id="adm-mes" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:var(--radius-sm);font-size:13px">
          ${mesOpts}
        </select>
      </div>
      <span style="font-size:12px;color:var(--text-secondary);margin-left:8px">
        ℹ️ Solo muestra gastos de tipo <strong>GENERAL</strong> (Oficina) y <strong>SERVICIO</strong> (Proyectos) registrados en Logística.
      </span>
    </div>

    <div id="adm-contenido" style="margin-top:20px">
      <div style="text-align:center;padding:40px;color:var(--text-secondary)">Cargando datos...</div>
    </div>
  `;
};

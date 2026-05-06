import { api } from '../services/api.js';
import { showError } from '../services/ui.js';

// ─── Helpers ──────────────────────────────────────────────────────────
const fPEN = (v) => 'S/ ' + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fMON = (v, mon) => (mon === 'USD' ? '$ ' : 'S/ ') + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fNum = (v) => Number(v || 0).toLocaleString('es-PE', { maximumFractionDigits: 4 });
const fmtFecha = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s).slice(0, 10);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ESTADO_COLOR = {
  APROBADA:           { bg: '#dcfce7', fg: '#166534', icon: '✅', label: 'APROBADA' },
  TRABAJO_EN_RIESGO:  { bg: '#fed7aa', fg: '#9a3412', icon: '⚠️', label: 'EN RIESGO' },
  TERMINADA:          { bg: '#dbeafe', fg: '#1e40af', icon: '🏁', label: 'TERMINADA' },
  ENVIADA:            { bg: '#dbeafe', fg: '#1e40af', icon: '📤', label: 'ENVIADA' },
  EN_PROCESO:         { bg: '#f3f4f6', fg: '#374151', icon: '✏️', label: 'EN PROCESO' },
  RECHAZADA:          { bg: '#fee2e2', fg: '#991b1b', icon: '✕',  label: 'RECHAZADA' },
  NO_APROBADA:        { bg: '#fee2e2', fg: '#991b1b', icon: '✕',  label: 'NO APROBADA' },
  ANULADA:            { bg: '#fee2e2', fg: '#991b1b', icon: '⊘',  label: 'ANULADA' },
};

const TIPO_COSTO_LABEL = {
  MATERIAL_CONSUMO: '📦 Material consumido del almacén',
  MANO_OBRA_OC:     '👥 Mano de obra (OCs honorario)',
  GASTO_OC:         '📋 Gastos OC facturados',
  OTROS:            '🧾 Otros costos',
};

export const Produccion = async () => {
  setTimeout(() => init(), 60);
  return `
    <header class="header">
      <div>
        <h1>🏭 Producción Metalmecánica</h1>
        <span style="color:var(--text-secondary)">MVP visor de Órdenes de Trabajo · cada cotización fondeada o a riesgo es una OT con sus costos reales imputados.</span>
      </div>
    </header>

    <div style="margin-top:14px;background:#eff6ff;border-left:3px solid #1e40af;padding:10px 14px;border-radius:6px;font-size:12px;color:#1e3a8a;line-height:1.5">
      💡 Esta es la <b>v0 del módulo</b> — visor sólo de lectura. Cada fila muestra una cotización fondeada con sus costos reales (materiales del almacén + honorarios + gastos OC). En la <b>Fase E completa</b> agregaremos: BOM, work centers, partes de producción, QC con foto, trazabilidad de heat numbers y remanentes.
    </div>

    <div class="card" style="margin-top:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="font-size:13px;font-weight:600">Filtros:</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">Estado:
        <select id="prod-estado" style="padding:6px 10px;border-radius:6px;border:1px solid #d1d5db">
          <option value="">Activas (Aprobada + En riesgo + Terminada)</option>
          <option value="APROBADA">✅ APROBADA</option>
          <option value="TRABAJO_EN_RIESGO">⚠️ TRABAJO EN RIESGO</option>
          <option value="TERMINADA">🏁 TERMINADA</option>
          <option value="TODAS">Todas las cotizaciones</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">Cliente:
        <input id="prod-cliente" placeholder="Buscar cliente…" style="padding:6px 10px;border-radius:6px;border:1px solid #d1d5db;width:180px">
      </label>
      <button id="prod-aplicar" style="padding:7px 14px;background:#111827;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Aplicar</button>
    </div>

    <div id="prod-body" style="margin-top:14px">
      <div style="padding:30px;text-align:center;color:#6b7280">⏳ Cargando…</div>
    </div>
  `;
};

async function init() {
  let estado  = '';
  let cliente = '';

  const cargar = async () => {
    const body = document.getElementById('prod-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280">⏳ Cargando…</div>';
    try {
      const ots = await api.produccion.listarOTs({ estado, cliente });
      pintarTabla(body, ots);
    } catch (e) {
      body.innerHTML = `<div style="padding:30px;color:#dc2626">Error: ${e?.message || 'no se pudo cargar'}</div>`;
    }
  };

  const aplicarFiltros = () => {
    estado  = document.getElementById('prod-estado').value;
    cliente = document.getElementById('prod-cliente').value.trim();
    cargar();
  };
  document.getElementById('prod-aplicar').onclick = aplicarFiltros;
  // Auto-aplicar al cambiar el dropdown de estado (UX común — no requiere
  // click adicional en "Aplicar"). El boton sigue util para confirmar el
  // filtro de cliente (input texto).
  document.getElementById('prod-estado').addEventListener('change', aplicarFiltros);
  document.getElementById('prod-cliente').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aplicarFiltros();
  });

  await cargar();
}

function pintarTabla(body, ots) {
  if (!ots || !ots.length) {
    body.innerHTML = `
      <div class="card" style="padding:40px;text-align:center;color:#6b7280">
        <div style="font-size:34px;margin-bottom:8px">🏭</div>
        <div style="font-weight:600;margin-bottom:6px">Sin OTs activas</div>
        <div style="font-size:12px">Aprobá una cotización o pasala a TRABAJO_EN_RIESGO en Comercial para que aparezca aquí.</div>
      </div>`;
    return;
  }

  // Totales agregados
  const totalCotizado = ots.reduce((s, o) => s + Number(o.cotizado_pen || 0), 0);
  const totalCosto    = ots.reduce((s, o) => s + Number(o.costo_imputado || 0), 0);
  const totalMargen   = totalCotizado - totalCosto;
  const totalMargenPct = totalCotizado > 0 ? (totalMargen / totalCotizado * 100) : 0;

  const filas = ots.map(o => {
    const e = ESTADO_COLOR[o.estado] || { bg: '#f3f4f6', fg: '#374151', icon: '?', label: o.estado };
    const margenColor = o.margen_pen >= 0 ? '#16a34a' : '#dc2626';
    const pctColor    = o.margen_pct >= 30 ? '#16a34a' : (o.margen_pct >= 15 ? '#ca8a04' : '#dc2626');
    const sinCostos   = o.cant_movimientos === 0;
    return `
      <tr style="border-bottom:1px solid #f3f4f6;${sinCostos ? 'background:#fafafa' : ''}">
        <td style="padding:8px;font-size:11px;font-weight:600">${escapeHtml(o.nro_cotizacion)}</td>
        <td style="padding:8px;font-size:11px">${fmtFecha(o.fecha)}</td>
        <td style="padding:8px;font-size:11px">${escapeHtml(o.cliente || '—')}</td>
        <td style="padding:8px;font-size:11px;color:#6b7280">${escapeHtml(o.proyecto || '—')}</td>
        <td style="padding:8px;text-align:center"><span style="background:${e.bg};color:${e.fg};padding:2px 7px;border-radius:8px;font-size:10px;font-weight:600">${e.icon} ${e.label}</span></td>
        <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums" title="Cotizado en moneda original: ${fMON(o.cotizado_original, o.moneda)}${o.moneda === 'USD' ? ' (TC ' + Number(o.tipo_cambio).toFixed(4) + ')' : ''}">${fPEN(o.cotizado_pen)}</td>
        <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${sinCostos ? '<span style="color:#9ca3af">—</span>' : fPEN(o.costo_imputado)}</td>
        <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:${margenColor}">${sinCostos ? '<span style="color:#9ca3af">—</span>' : fPEN(o.margen_pen)}</td>
        <td style="padding:8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:${pctColor}">${sinCostos ? '<span style="color:#9ca3af">—</span>' : (o.margen_pct.toFixed(1) + '%')}</td>
        <td style="padding:8px;font-size:11px;text-align:center;color:#6b7280">${o.cant_movimientos}</td>
        <td style="padding:8px;text-align:right;white-space:nowrap">
          <button data-ver-ot="${o.id_cotizacion}" title="Ver detalle de costos imputados a esta OT"
            style="padding:4px 10px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">👁 Ver</button>
        </td>
      </tr>
    `;
  }).join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div class="card" style="padding:12px">
        <div style="font-size:10px;color:#6b7280;font-weight:600">OTs ACTIVAS</div>
        <div style="font-size:22px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums">${ots.length}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid #1e40af">
        <div style="font-size:10px;color:#6b7280;font-weight:600">COTIZADO TOTAL</div>
        <div style="font-size:18px;font-weight:700;color:#1e40af;margin-top:3px;font-variant-numeric:tabular-nums">${fPEN(totalCotizado)}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid #9a3412">
        <div style="font-size:10px;color:#6b7280;font-weight:600">COSTO IMPUTADO</div>
        <div style="font-size:18px;font-weight:700;color:#9a3412;margin-top:3px;font-variant-numeric:tabular-nums">${fPEN(totalCosto)}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid ${totalMargen >= 0 ? '#16a34a' : '#dc2626'}">
        <div style="font-size:10px;color:#6b7280;font-weight:600">MARGEN AGREGADO</div>
        <div style="font-size:18px;font-weight:700;color:${totalMargen >= 0 ? '#16a34a' : '#dc2626'};margin-top:3px;font-variant-numeric:tabular-nums">${fPEN(totalMargen)}</div>
        <div style="font-size:11px;color:#6b7280">${totalMargenPct.toFixed(1)}%</div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead style="background:#f9fafb">
          <tr>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">N° OT</th>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Fecha</th>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Cliente</th>
            <th style="padding:8px;text-align:left;font-size:10px;color:#6b7280;font-weight:600">Proyecto</th>
            <th style="padding:8px;text-align:center;font-size:10px;color:#6b7280;font-weight:600">Estado</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Cotizado (S/)</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Costo real</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Margen</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">%</th>
            <th style="padding:8px;text-align:center;font-size:10px;color:#6b7280;font-weight:600">Mov.</th>
            <th style="padding:8px;text-align:right;font-size:10px;color:#6b7280;font-weight:600">Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div style="font-size:11px;color:#6b7280;margin-top:8px;line-height:1.5">
      💡 Las filas grises no tienen aún costos imputados. Para que una OT muestre costos, registrá retiros de almacén (Inventario → "Retirar Insumos") o creá OCs de honorario en Administración → Personal seleccionando esa cotización.
    </div>
  `;

  body.querySelectorAll('button[data-ver-ot]').forEach(b => {
    b.onclick = () => abrirDetalleOT(Number(b.dataset.verOt));
  });
}

// ─── Modal detalle de OT ──────────────────────────────────────────────
async function abrirDetalleOT(id_cotizacion) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1500;display:flex;align-items:center;justify-content:center;padding:20px';
  // Header con dos divs separados: ot-head-info se actualiza al cargar datos,
  // el botón close queda intacto con su handler original (gotcha histórico:
  // cuando el handler se re-asignaba tras un innerHTML, el closest del overlay
  // fallaba si los estilos venían vía .style.cssText en vez de attr style).
  ov.innerHTML = `
    <div style="background:#fff;border-radius:10px;width:1100px;max-width:98vw;height:90vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;background:#f9fafb;display:flex;justify-content:space-between;align-items:center">
        <div id="ot-head-info"><h3 style="margin:0;font-size:16px">⏳ Cargando OT…</h3></div>
        <button id="ot-close" title="Cerrar" aria-label="Cerrar" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>
      </div>
      <div id="ot-body" style="flex:1;overflow:auto;padding:18px 20px;background:#fafafa">
        <div style="padding:60px;text-align:center;color:#6b7280">⏳ Cargando datos…</div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  document.getElementById('ot-close').onclick = () => ov.remove();

  let data;
  try { data = await api.produccion.obtenerOT(id_cotizacion); }
  catch (e) {
    document.getElementById('ot-body').innerHTML = `<div style="padding:50px;color:#dc2626;text-align:center">Error: ${e?.message || 'no se pudo cargar'}</div>`;
    return;
  }

  pintarDetalle(data);
}

function pintarDetalle(data) {
  const c = data.cotizacion;
  const t = data.totales;
  const e = ESTADO_COLOR[c.estado] || { bg: '#f3f4f6', fg: '#374151', icon: '?', label: c.estado };
  const margenColor = t.margen_pen >= 0 ? '#16a34a' : '#dc2626';
  const pctColor    = t.margen_pct >= 30 ? '#16a34a' : (t.margen_pct >= 15 ? '#ca8a04' : '#dc2626');

  // Solo actualizamos la columna izquierda (info) — el botón close queda
  // intacto con su handler original asignado en abrirDetalleOT.
  document.getElementById('ot-head-info').innerHTML = `
    <h3 style="margin:0;font-size:16px">🏭 OT ${escapeHtml(c.nro_cotizacion)} — ${escapeHtml(c.cliente || '')}</h3>
    <div style="font-size:11px;color:#6b7280;margin-top:3px">
      ${escapeHtml(c.proyecto || '—')} · <span style="background:${e.bg};color:${e.fg};padding:1px 6px;border-radius:6px;font-size:10px;font-weight:600">${e.icon} ${e.label}</span>
      · Fecha cotización: ${fmtFecha(c.fecha)}
    </div>
  `;

  const fechaCorta = (s) => fmtFecha(s);

  // Sección Material
  const seccionMaterial = data.costos.material.length ? `
    <details open style="margin-bottom:12px">
      <summary style="padding:10px 14px;background:#1e40af;color:#fff;border-radius:6px 6px 0 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600">
        <span>${TIPO_COSTO_LABEL.MATERIAL_CONSUMO}</span>
        <span style="font-variant-numeric:tabular-nums">${fPEN(t.material)} · ${data.costos.material.length} mov</span>
      </summary>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;background:#fff;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb">
            <tr>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Fecha</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Concepto</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#6b7280">Total (S/)</th>
            </tr>
          </thead>
          <tbody>
            ${data.costos.material.map(m => `
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:6px 8px;font-size:11px">${fechaCorta(m.fecha)}</td>
                <td style="padding:6px 8px;font-size:11px">${escapeHtml(m.concepto)}</td>
                <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fPEN(m.monto_base)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  ` : '';

  // Detalle de movimientos de inventario (kárdex específico de esta OT)
  const seccionMovInv = data.movimientos_inventario.length ? `
    <details style="margin-bottom:12px">
      <summary style="padding:8px 14px;background:#dbeafe;color:#1e40af;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600">
        🔍 Ver kárdex detallado de los ${data.movimientos_inventario.length} retiros del almacén (cantidades + costo unit.)
      </summary>
      <div style="margin-top:6px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead style="background:#f9fafb">
            <tr>
              <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">Fecha</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">Item</th>
              <th style="padding:5px 8px;text-align:right;font-size:10px;color:#6b7280">Cantidad</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;color:#6b7280">Unidad</th>
              <th style="padding:5px 8px;text-align:right;font-size:10px;color:#6b7280">Costo unit.</th>
            </tr>
          </thead>
          <tbody>
            ${data.movimientos_inventario.map(m => `
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:5px 8px">${fechaCorta(m.fecha_movimiento)}</td>
                <td style="padding:5px 8px">${escapeHtml(m.item_nombre || '—')}</td>
                <td style="padding:5px 8px;text-align:right;font-variant-numeric:tabular-nums">${fNum(m.cantidad)}</td>
                <td style="padding:5px 8px">${escapeHtml(m.unidad || '—')}</td>
                <td style="padding:5px 8px;text-align:right;font-variant-numeric:tabular-nums">${fPEN(m.costo_promedio_unitario)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  ` : '';

  const seccionMO = data.costos.mano_obra.length ? `
    <details open style="margin-bottom:12px">
      <summary style="padding:10px 14px;background:#9a3412;color:#fff;border-radius:6px 6px 0 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600">
        <span>${TIPO_COSTO_LABEL.MANO_OBRA_OC}</span>
        <span style="font-variant-numeric:tabular-nums">${fPEN(t.mano_obra)} · ${data.costos.mano_obra.length} OC(s)</span>
      </summary>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;background:#fff;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb">
            <tr>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Fecha</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Concepto</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#6b7280">Total (S/)</th>
            </tr>
          </thead>
          <tbody>
            ${data.costos.mano_obra.map(m => `
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:6px 8px;font-size:11px">${fechaCorta(m.fecha)}</td>
                <td style="padding:6px 8px;font-size:11px">${escapeHtml(m.concepto)}</td>
                <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fPEN(m.monto_base)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  ` : '';

  const seccionGastoOC = data.costos.gasto_oc.length ? `
    <details style="margin-bottom:12px">
      <summary style="padding:10px 14px;background:#5b21b6;color:#fff;border-radius:6px 6px 0 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600">
        <span>${TIPO_COSTO_LABEL.GASTO_OC}</span>
        <span style="font-variant-numeric:tabular-nums">${fPEN(t.gasto_oc)} · ${data.costos.gasto_oc.length}</span>
      </summary>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;background:#fff;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb">
            <tr>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Fecha</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Concepto</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#6b7280">Total (S/)</th>
            </tr>
          </thead>
          <tbody>
            ${data.costos.gasto_oc.map(m => `
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:6px 8px;font-size:11px">${fechaCorta(m.fecha)}</td>
                <td style="padding:6px 8px;font-size:11px">${escapeHtml(m.concepto)}</td>
                <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fPEN(m.monto_base)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  ` : '';

  const seccionOtros = data.costos.otros.length ? `
    <details style="margin-bottom:12px">
      <summary style="padding:10px 14px;background:#374151;color:#fff;border-radius:6px 6px 0 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600">
        <span>${TIPO_COSTO_LABEL.OTROS}</span>
        <span style="font-variant-numeric:tabular-nums">${fPEN(t.otros)} · ${data.costos.otros.length}</span>
      </summary>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;background:#fff;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f9fafb">
            <tr>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Fecha</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Concepto</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280">Tipo</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#6b7280">Total (S/)</th>
            </tr>
          </thead>
          <tbody>
            ${data.costos.otros.map(m => `
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:6px 8px;font-size:11px">${fechaCorta(m.fecha)}</td>
                <td style="padding:6px 8px;font-size:11px">${escapeHtml(m.concepto)}</td>
                <td style="padding:6px 8px;font-size:10px;color:#6b7280">${escapeHtml(m.tipo_costo || '—')}</td>
                <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fPEN(m.monto_base)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  ` : '';

  const sinCostos = !data.costos.material.length && !data.costos.mano_obra.length && !data.costos.gasto_oc.length && !data.costos.otros.length;

  document.getElementById('ot-body').innerHTML = `
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="card" style="padding:12px;border-left:3px solid #1e40af">
        <div style="font-size:10px;color:#6b7280;font-weight:600">COTIZADO</div>
        <div style="font-size:18px;font-weight:700;color:#1e40af;margin-top:3px;font-variant-numeric:tabular-nums">${fPEN(t.cotizado_pen)}</div>
        ${c.moneda === 'USD' ? `<div style="font-size:10px;color:#6b7280">${fMON(c.total, 'USD')} · TC ${Number(c.tipo_cambio).toFixed(4)}</div>` : '<div style="font-size:10px;color:#6b7280">Moneda PEN</div>'}
      </div>
      <div class="card" style="padding:12px;border-left:3px solid #9a3412">
        <div style="font-size:10px;color:#6b7280;font-weight:600">COSTO REAL</div>
        <div style="font-size:18px;font-weight:700;color:#9a3412;margin-top:3px;font-variant-numeric:tabular-nums">${fPEN(t.costo_total)}</div>
        <div style="font-size:10px;color:#6b7280">Imputado a la fecha</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid ${margenColor}">
        <div style="font-size:10px;color:#6b7280;font-weight:600">MARGEN</div>
        <div style="font-size:18px;font-weight:700;color:${margenColor};margin-top:3px;font-variant-numeric:tabular-nums">${fPEN(t.margen_pen)}</div>
        <div style="font-size:10px;color:#6b7280">Cotizado − Costo</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid ${pctColor}">
        <div style="font-size:10px;color:#6b7280;font-weight:600">% MARGEN</div>
        <div style="font-size:18px;font-weight:700;color:${pctColor};margin-top:3px;font-variant-numeric:tabular-nums">${t.margen_pct.toFixed(1)}%</div>
        <div style="font-size:10px;color:#6b7280">${t.margen_pct >= 30 ? 'Saludable' : t.margen_pct >= 15 ? 'Aceptable' : t.margen_pct >= 0 ? 'Apretado' : '⚠️ Pérdida'}</div>
      </div>
    </div>

    <!-- Mini desglose visual -->
    <div class="card" style="padding:14px;margin-bottom:14px">
      <div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:8px">DESGLOSE DEL COSTO IMPUTADO</div>
      ${t.costo_total === 0 ? '<div style="color:#9ca3af;font-size:12px">Sin costos imputados todavía</div>' : `
        <div style="display:flex;gap:2px;height:18px;border-radius:4px;overflow:hidden;background:#f3f4f6">
          ${t.material   > 0 ? `<div title="Material: ${fPEN(t.material)}"   style="flex:${t.material};background:#1e40af"></div>`   : ''}
          ${t.mano_obra  > 0 ? `<div title="Mano obra: ${fPEN(t.mano_obra)}"  style="flex:${t.mano_obra};background:#9a3412"></div>`  : ''}
          ${t.gasto_oc   > 0 ? `<div title="Gasto OC: ${fPEN(t.gasto_oc)}"    style="flex:${t.gasto_oc};background:#5b21b6"></div>`   : ''}
          ${t.otros      > 0 ? `<div title="Otros: ${fPEN(t.otros)}"          style="flex:${t.otros};background:#374151"></div>`      : ''}
        </div>
        <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;flex-wrap:wrap">
          <span><span style="display:inline-block;width:10px;height:10px;background:#1e40af;border-radius:2px;vertical-align:middle"></span> Material ${fPEN(t.material)} (${((t.material/t.costo_total)*100).toFixed(0)}%)</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#9a3412;border-radius:2px;vertical-align:middle"></span> Mano obra ${fPEN(t.mano_obra)} (${((t.mano_obra/t.costo_total)*100).toFixed(0)}%)</span>
          ${t.gasto_oc > 0 ? `<span><span style="display:inline-block;width:10px;height:10px;background:#5b21b6;border-radius:2px;vertical-align:middle"></span> Gasto OC ${fPEN(t.gasto_oc)} (${((t.gasto_oc/t.costo_total)*100).toFixed(0)}%)</span>` : ''}
          ${t.otros > 0 ? `<span><span style="display:inline-block;width:10px;height:10px;background:#374151;border-radius:2px;vertical-align:middle"></span> Otros ${fPEN(t.otros)} (${((t.otros/t.costo_total)*100).toFixed(0)}%)</span>` : ''}
        </div>
      `}
    </div>

    ${sinCostos ? `
      <div class="card" style="padding:30px;text-align:center;color:#6b7280;background:#fffbeb;border-color:#fde68a">
        <div style="font-size:30px;margin-bottom:6px">📭</div>
        <div style="font-weight:600;margin-bottom:6px">Sin costos imputados a esta OT</div>
        <div style="font-size:12px;line-height:1.5">
          Para que esta OT tenga datos:<br>
          • <b>Inventario</b> → "Retirar Insumos hacia Servicio" → seleccioná esta cotización<br>
          • <b>Administración → Personal</b> → "+ Nueva OC de Honorario" → Servicio → seleccioná esta cotización
        </div>
      </div>
    ` : `
      ${seccionMaterial}
      ${seccionMovInv}
      ${seccionMO}
      ${seccionGastoOC}
      ${seccionOtros}
    `}
  `;
}

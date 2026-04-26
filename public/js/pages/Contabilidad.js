/**
 * Contabilidad.js — Módulo 📘 Contabilidad
 *
 * 3 tabs:
 *   - Libros PLE: descarga TXT formato SUNAT para Ventas 14.1 y Compras 8.1
 *   - Facturas Emitidas: listado con estado SUNAT y link al PDF
 *   - Pack Contable (placeholder Fase D): ZIP con todo el mes
 */

import { api } from '../services/api.js';
import { showSuccess, showError, setupPendienteBanner, esErrorConfigVacia } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const Contabilidad = async () => {
  const user = JSON.parse(localStorage.getItem('erp_user') || '{}');
  const hoy = new Date();
  const mesDefault = hoy.getMonth(); // mes anterior si estamos al inicio; por ahora mes actual - 1 si ya pasó el 5
  const anioDefault = hoy.getFullYear();
  const mesSugerido = hoy.getDate() <= 10 && mesDefault === 0
    ? 12
    : (hoy.getDate() <= 10 ? mesDefault : mesDefault + 1);

  setTimeout(() => initTabs(anioDefault, mesSugerido), 60);

  return `
    <header class="header">
      <div>
        <h1>📘 Contabilidad</h1>
        <span style="color:var(--text-secondary)">Libros Electrónicos PLE, Estados Financieros y Pack Contable mensual.</span>
      </div>
    </header>

    <div id="cont-tabbar" style="margin-top:20px"></div>

    <div id="tab-libros" class="tab-content"></div>
    <div id="tab-facturas" class="tab-content" style="display:none"></div>
    <div id="tab-pack" class="tab-content" style="display:none"></div>
  `;
};

function initTabs(anioDefault, mesDefault) {
  TabBar({
    container: '#cont-tabbar',
    tabs: [
      { id: 'libros',   label: '📚 Libros PLE' },
      { id: 'facturas', label: '🧾 Facturas Emitidas' },
      { id: 'pack',     label: '📦 Pack Contable Mensual' },
    ],
    defaultTab: 'libros',
    onChange: (id) => {
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('tab-' + id);
      if (panel) panel.style.display = 'block';
      if (id === 'libros' && !panel.dataset.rendered)   renderLibros(panel, anioDefault, mesDefault);
      if (id === 'facturas')                            renderFacturas(panel);
      if (id === 'pack'   && !panel.dataset.rendered)   renderPack(panel);
    },
  });

  window.Contabilidad = {
    cambiarPeriodo: actualizarPreviews,
    descargarVentas,
    descargarCompras,
  };
}

// ─── TAB 1: Libros PLE ────────────────────────────────────────
async function renderLibros(panel, anio, mes) {
  panel.dataset.rendered = '1';

  const aniosOpts = [];
  for (let a = 2024; a <= new Date().getFullYear() + 1; a++) aniosOpts.push(a);

  panel.innerHTML = `
    <div class="card" style="margin-top:12px">
      <h3 style="margin-bottom:14px;font-size:15px">Libros Electrónicos SUNAT (PLE)</h3>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px">
        Descarga los libros en formato TXT oficial SUNAT. Súbelos al aplicativo PLE del portal SUNAT
        para tu declaración mensual. El nombre del archivo sigue la convención
        <code style="background:#f5f5f5;padding:1px 5px;border-radius:3px">LE&lt;RUC&gt;&lt;PERIODO&gt;&lt;LIBRO&gt;...txt</code>
      </p>

      <div style="display:flex;gap:12px;align-items:end;margin-bottom:24px;padding:14px;background:#f9fafb;border-radius:8px">
        <div>
          <label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px">PERIODO</label>
          <div style="display:flex;gap:8px">
            <select id="ple-mes" onchange="Contabilidad.cambiarPeriodo()" style="padding:8px 12px;border:1px solid #d9dad9;border-radius:6px;font-size:13px">
              ${MESES.map((m, i) => `<option value="${i+1}" ${i+1 === mes ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <select id="ple-anio" onchange="Contabilidad.cambiarPeriodo()" style="padding:8px 12px;border:1px solid #d9dad9;border-radius:6px;font-size:13px">
              ${aniosOpts.map(a => `<option value="${a}" ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div id="ple-kpis"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
        <div id="libro-ventas-card" style="padding:20px;border:1px solid #d9dad9;border-radius:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h4 style="margin:0;font-size:14px">📗 Registro de Ventas <span style="color:var(--text-secondary);font-weight:normal">(14.1)</span></h4>
            <span id="v-badge" style="font-size:11px;color:var(--text-secondary)">Cargando…</span>
          </div>
          <div id="v-preview" style="font-family:monospace;font-size:10px;background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:14px;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-all">
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">
            Archivo: <strong id="v-filename">—</strong>
          </div>
          <button onclick="Contabilidad.descargarVentas()" style="width:100%;padding:12px;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            ⬇️ Descargar TXT
          </button>
        </div>

        <div id="libro-compras-card" style="padding:20px;border:1px solid #d9dad9;border-radius:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h4 style="margin:0;font-size:14px">📘 Registro de Compras <span style="color:var(--text-secondary);font-weight:normal">(8.1)</span></h4>
            <span id="c-badge" style="font-size:11px;color:var(--text-secondary)">Cargando…</span>
          </div>
          <div id="c-preview" style="font-family:monospace;font-size:10px;background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:14px;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-all">
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">
            Archivo: <strong id="c-filename">—</strong>
          </div>
          <button onclick="Contabilidad.descargarCompras()" style="width:100%;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            ⬇️ Descargar TXT
          </button>
        </div>
      </div>

      <div style="margin-top:20px;padding:12px;background:#fffbeb;border-radius:8px;font-size:12px">
        📌 <strong>Validación SUNAT:</strong> antes de subir el TXT, valídalo con el
        aplicativo <a href="https://www.sunat.gob.pe/descarga/ple/PLE.htm" target="_blank">PLE de SUNAT</a>.
        Si el libro te rechaza, revisa que el contador haya registrado correctamente todas las operaciones.
      </div>
    </div>
  `;

  await actualizarPreviews();
}

async function actualizarPreviews() {
  const anio = parseInt(document.getElementById('ple-anio').value);
  const mes = parseInt(document.getElementById('ple-mes').value);

  try {
    const [vPrev, cPrev] = await Promise.all([
      api.ple.ventasPreview(anio, mes),
      api.ple.comprasPreview(anio, mes),
    ]);

    document.getElementById('v-filename').textContent = vPrev.nombreArchivo;
    document.getElementById('v-badge').innerHTML = vPrev.lineas > 0
      ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-weight:600">${vPrev.lineas} línea(s)</span>`
      : `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px">Sin datos</span>`;
    document.getElementById('v-preview').textContent = vPrev.preview.slice(0, 3).join('\n') || '(sin facturas emitidas en este periodo)';

    document.getElementById('c-filename').textContent = cPrev.nombreArchivo;
    document.getElementById('c-badge').innerHTML = cPrev.lineas > 0
      ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-weight:600">${cPrev.lineas} línea(s)</span>`
      : `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px">Sin datos</span>`;
    document.getElementById('c-preview').textContent = cPrev.preview.slice(0, 3).join('\n') || '(sin compras registradas en este periodo)';

    // KPIs arriba
    document.getElementById('ple-kpis').innerHTML = kpiGrid([
      { label: 'Ventas del periodo', value: vPrev.lineas, icon: '📗' },
      { label: 'Compras del periodo', value: cPrev.lineas, icon: '📘' },
      { label: 'Periodo', value: `${MESES[mes-1]} ${anio}`, icon: '📅' },
    ], 3);
  } catch (e) {
    if (esErrorConfigVacia(e)) {
      // Si la empresa aún no fue configurada, no tiene sentido mostrar previews:
      // reemplazamos el panel completo por un banner accionable.
      const panel = document.getElementById('tab-libros');
      if (panel) panel.innerHTML = setupPendienteBanner('los libros electrónicos PLE');
      return;
    }
    showError('Error cargando previews: ' + e.message);
  }
}

async function descargarVentas() {
  const anio = parseInt(document.getElementById('ple-anio').value);
  const mes = parseInt(document.getElementById('ple-mes').value);
  try {
    const r = await api.ple.descargarVentas(anio, mes);
    showSuccess(`Descargado: ${r.nombre} (${r.lineas} línea${r.lineas !== 1 ? 's' : ''})`);
  } catch (e) { showError('Error: ' + e.message); }
}

async function descargarCompras() {
  const anio = parseInt(document.getElementById('ple-anio').value);
  const mes = parseInt(document.getElementById('ple-mes').value);
  try {
    const r = await api.ple.descargarCompras(anio, mes);
    showSuccess(`Descargado: ${r.nombre} (${r.lineas} línea${r.lineas !== 1 ? 's' : ''})`);
  } catch (e) { showError('Error: ' + e.message); }
}

// ─── TAB 2: Facturas Emitidas ─────────────────────────────────
async function renderFacturas(panel) {
  panel.innerHTML = `<div class="card" style="margin-top:12px"><h3>Cargando facturas…</h3></div>`;

  try {
    const facturas = await api.facturas.list({ limit: 200 });
    if (!facturas?.length) {
      panel.innerHTML = `
        <div class="card" style="margin-top:12px;padding:40px;text-align:center;color:var(--text-secondary)">
          <div style="font-size:40px;margin-bottom:10px">🧾</div>
          <div style="font-size:14px;font-weight:600">Sin facturas emitidas todavía</div>
          <div style="font-size:12px;margin-top:4px">Emite tu primera factura desde Comercial → cotización aprobada → 🧾 Emitir Factura</div>
        </div>`;
      return;
    }

    const rows = facturas.map(f => {
      const estadoBadge = estadoSunatBadge(f.estado_sunat);
      const pdf = f.pdf_url ? `<a href="${f.pdf_url}" target="_blank" style="color:#3b82f6;text-decoration:underline">PDF</a>` : '—';
      const cdr = f.cdr_url ? `<a href="${f.cdr_url}" target="_blank" style="color:#3b82f6;text-decoration:underline">CDR</a>` : '—';
      return `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:10px;font-weight:700">${f.numero_formateado}</td>
          <td style="padding:10px"><span style="font-size:11px;background:${f.tipo === 'FACTURA' ? '#dbeafe' : '#fef3c7'};padding:2px 8px;border-radius:4px">${f.tipo}</span></td>
          <td style="padding:10px">${String(f.fecha_emision).split('T')[0]}</td>
          <td style="padding:10px;font-size:12px">${f.cliente_numero_doc}<br><span style="color:var(--text-secondary)">${f.cliente_razon_social}</span></td>
          <td style="padding:10px;text-align:right;font-weight:600">${f.moneda} ${Number(f.total).toFixed(2)}</td>
          <td style="padding:10px;text-align:center">${estadoBadge}</td>
          <td style="padding:10px;text-align:center;font-size:11px">${pdf} · ${cdr}</td>
        </tr>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="card" style="margin-top:12px">
        <h3 style="margin-bottom:14px;font-size:15px">Comprobantes Electrónicos Emitidos</h3>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f9fafb;border-bottom:2px solid #d9dad9">
                <th style="padding:10px;text-align:left">Comprobante</th>
                <th style="padding:10px;text-align:left">Tipo</th>
                <th style="padding:10px;text-align:left">Fecha</th>
                <th style="padding:10px;text-align:left">Cliente</th>
                <th style="padding:10px;text-align:right">Total</th>
                <th style="padding:10px;text-align:center">Estado SUNAT</th>
                <th style="padding:10px;text-align:center">Enlaces</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p style="margin-top:12px;font-size:11px;color:var(--text-secondary)">Total: ${facturas.length} comprobante(s)</p>
      </div>
    `;
  } catch (e) {
    panel.innerHTML = `<div class="card" style="color:var(--danger);padding:20px">Error: ${e.message}</div>`;
  }
}

function estadoSunatBadge(estado) {
  const styles = {
    SIMULADO:   { bg: '#fef3c7', fg: '#92400e', icon: '🟡' },
    PENDIENTE:  { bg: '#dbeafe', fg: '#1e40af', icon: '⏳' },
    ACEPTADA:   { bg: '#dcfce7', fg: '#166534', icon: '✅' },
    RECHAZADA:  { bg: '#fee2e2', fg: '#991b1b', icon: '❌' },
    OBSERVADA:  { bg: '#fed7aa', fg: '#9a3412', icon: '⚠️' },
    ANULADA:    { bg: '#e5e7eb', fg: '#374151', icon: '🚫' },
    ERROR:      { bg: '#fecaca', fg: '#7f1d1d', icon: '⚠️' },
  };
  const s = styles[estado] || styles.PENDIENTE;
  return `<span style="background:${s.bg};color:${s.fg};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap">${s.icon} ${estado}</span>`;
}

// ─── TAB 3: Pack Contable (placeholder Fase D) ────────────────
function renderPack(panel) {
  panel.dataset.rendered = '1';
  panel.innerHTML = `
    <div class="card" style="margin-top:12px;padding:40px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">📦</div>
      <h3 style="margin-bottom:8px">Pack Contable del Mes</h3>
      <p style="color:var(--text-secondary);font-size:13px;max-width:520px;margin:0 auto 20px">
        El botón estrella: un solo click genera un <strong>ZIP</strong> con todos los libros PLE,
        Estados Financieros, comprobantes emitidos (PDF), conciliación bancaria y checklist para auditoría —
        todo lo que tu contador necesita.
      </p>
      <div style="padding:14px;background:#dbeafe;color:#1e40af;border-radius:8px;max-width:500px;margin:0 auto;font-size:12px">
        🏗️ <strong>Disponible en Fase D del plan maestro</strong><br>
        Ahora puedes descargar manualmente los libros desde la tab "Libros PLE".
      </div>
    </div>
  `;
}

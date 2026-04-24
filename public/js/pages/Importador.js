/**
 * Importador.js — Módulo 📥 Importar Histórico (solo GERENTE)
 *
 * Flujo:
 *   1. Elige entidad (Proveedores / Cotizaciones / Gastos / Compras)
 *   2. Descarga template CSV con headers y 2 filas de ejemplo
 *   3. Llena el CSV con su data histórica en Excel/Sheets
 *   4. Lo sube al importador (botón "Subir CSV")
 *   5. Ve preview con errores por fila (si hay)
 *   6. Si todo OK, confirma commit → bulk insert transaccional
 */

import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';

const ENTIDADES = [
  {
    id: 'proveedores',
    label: '👤 Proveedores',
    desc: 'Maestro de proveedores. Cárgalos primero — las compras históricas los referencian por id_proveedor.',
    soportaMoneda: false,
    columnas: ['nombre', 'ruc', 'tipo (JURIDICO/NATURAL)', 'dni', 'telefono', 'email', 'direccion'],
  },
  {
    id: 'cotizaciones',
    label: '📋 Cotizaciones',
    desc: 'Ventas históricas directamente en estado APROBADA/TERMINADA. Numeración libre (ej. "COT 2022-001-MN").',
    soportaMoneda: true,
    columnas: ['nro_cotizacion', 'fecha', 'marca', 'moneda', 'tipo_cambio', 'cliente', 'cliente_ruc', 'proyecto', 'descripcion_item', 'subtotal', 'igv', 'total', 'estado'],
  },
  {
    id: 'gastos',
    label: '💸 Gastos',
    desc: 'Gastos históricos (General / Servicio). Moneda + tipo_cambio se convierten a PEN para totales.',
    soportaMoneda: true,
    columnas: ['concepto', 'proveedor_nombre', 'fecha', 'moneda', 'tipo_cambio', 'monto_base', 'igv_base', 'total_base', 'centro_costo', 'tipo_gasto_logistica', 'id_servicio'],
  },
  {
    id: 'compras',
    label: '📦 Compras',
    desc: 'Compras históricas. El id_proveedor se saca del maestro — carga Proveedores primero.',
    soportaMoneda: true,
    columnas: ['nro_factura_proveedor', 'id_proveedor', 'fecha', 'moneda', 'tipo_cambio', 'monto_base', 'igv_base', 'total_base', 'centro_costo'],
  },
  {
    id: 'prestamos_tomados',
    label: '🔴 Préstamos Tomados',
    desc: 'Deudas históricas (banco, socios, familia). Si el préstamo ya está pagado, pon monto_pagado = monto_total.',
    soportaMoneda: true,
    columnas: ['nro_oc', 'acreedor', 'descripcion', 'comentario', 'fecha_emision', 'fecha_vencimiento', 'moneda', 'tipo_cambio', 'monto_capital', 'tasa_interes', 'monto_interes', 'monto_pagado'],
  },
  {
    id: 'prestamos_otorgados',
    label: '🟢 Préstamos Otorgados',
    desc: 'Lo que prestaste a otros (trabajadores, clientes, socios). monto_pagado = cuánto ya te devolvieron.',
    soportaMoneda: true,
    columnas: ['nro_oc', 'deudor', 'descripcion', 'comentario', 'fecha_emision', 'fecha_vencimiento', 'moneda', 'tipo_cambio', 'monto_capital', 'tasa_interes', 'monto_interes', 'monto_pagado'],
  },
];

export const Importador = async () => {
  const user = JSON.parse(localStorage.getItem('erp_user') || '{}');
  if (user.rol !== 'GERENTE') {
    return `<div class="placeholder-page"><h2>🔒 Acceso restringido</h2><p>Solo el Gerente puede importar datos históricos.</p></div>`;
  }

  setTimeout(() => bindHandlers(), 60);

  return `
    <header class="header">
      <div>
        <h1>📥 Importar Histórico</h1>
        <span style="color:var(--text-secondary)">Carga masiva de data 2022+ desde CSV. Ideal para migrar años anteriores de un solo golpe.</span>
      </div>
    </header>

    <div class="card" style="margin-top:20px;padding:16px;background:#fffbeb;border-left:4px solid #f59e0b">
      <h3 style="margin:0 0 8px;font-size:14px">📌 Antes de empezar</h3>
      <ol style="font-size:12px;margin:0;padding-left:18px;line-height:1.7;color:var(--text-secondary)">
        <li><strong>Orden recomendado:</strong> Proveedores primero → luego Cotizaciones, Gastos, Compras.</li>
        <li>Descarga el template CSV, ábrelo en Excel, llena las filas con tus datos históricos.</li>
        <li>Guarda como CSV UTF-8 (Excel: "Guardar como... CSV UTF-8").</li>
        <li>Súbelo aquí — verás un preview con errores antes de confirmar.</li>
      </ol>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:20px">
      ${ENTIDADES.map(e => `
        <div class="card" data-entidad="${e.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
            <h3 style="margin:0;font-size:15px">${e.label}</h3>
            ${e.soportaMoneda ? `
              <span title="Acepta PEN y USD con tipo_cambio por fila"
                style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap">
                💱 PEN / USD
              </span>` : ''}
          </div>
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">${e.desc}</p>
          <details style="margin-bottom:12px">
            <summary style="cursor:pointer;font-size:11px;color:var(--primary-color);font-weight:600">Ver columnas esperadas</summary>
            <div style="margin-top:8px;padding:8px;background:#f9fafb;border-radius:6px;font-size:11px;font-family:monospace;line-height:1.6">
              ${e.columnas.join(', ')}
            </div>
          </details>
          <div style="display:flex;gap:8px">
            <button class="btn-template" data-entidad="${e.id}"
              style="flex:1;padding:10px;background:var(--bg-app);border:1px solid #d9dad9;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">
              📄 Descargar template
            </button>
            <label class="btn-upload" data-entidad="${e.id}"
              style="flex:1;padding:10px;background:var(--primary-color);color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;text-align:center">
              ⬆️ Subir CSV
              <input type="file" accept=".csv" data-entidad="${e.id}" style="display:none">
            </label>
          </div>
        </div>
      `).join('')}
    </div>

    <div id="preview-container"></div>
  `;
};

function bindHandlers() {
  // Descarga de templates
  document.querySelectorAll('.btn-template').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entidad = btn.dataset.entidad;
      try {
        const token = localStorage.getItem('erp_token');
        const r = await fetch(`/api/importador/template/${entidad}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `template_${entidad}.csv`; a.click();
        URL.revokeObjectURL(url);
        showSuccess(`Template descargado: template_${entidad}.csv`);
      } catch (e) {
        showError('Error descargando template: ' + e.message);
      }
    });
  });

  // Upload de CSV — preview + commit
  document.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const entidad = e.target.dataset.entidad;
      const texto = await file.text();
      try {
        const token = localStorage.getItem('erp_token');
        const preview = await fetch('/api/importador/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ entidad, csv_texto: texto }),
        }).then(r => r.json());
        renderPreview(entidad, preview);
      } catch (err) {
        showError('Error procesando CSV: ' + err.message);
      }
      e.target.value = ''; // reset
    });
  });
}

function renderPreview(entidad, preview) {
  const container = document.getElementById('preview-container');
  if (!container) return;

  const hayErrores = preview.filasConError > 0;

  // Guardamos los datos para el commit (serializado)
  window.__importPending = { entidad, datos: preview.datosCompletos || [] };

  container.innerHTML = `
    <div class="card" style="margin-top:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:15px">📊 Preview — ${entidad.toUpperCase()}</h3>
        <button onclick="document.getElementById('preview-container').innerHTML=''" style="background:transparent;border:none;font-size:18px;cursor:pointer">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="padding:14px;background:#f9fafb;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-secondary);font-weight:600">TOTAL FILAS</div>
          <div style="font-size:24px;font-weight:700">${preview.totalFilas}</div>
        </div>
        <div style="padding:14px;background:#dcfce7;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#166534;font-weight:600">✓ VÁLIDAS</div>
          <div style="font-size:24px;font-weight:700;color:#166534">${preview.filasValidas}</div>
        </div>
        <div style="padding:14px;background:${hayErrores ? '#fee2e2' : '#f9fafb'};border-radius:8px;text-align:center">
          <div style="font-size:11px;color:${hayErrores ? '#991b1b' : 'var(--text-secondary)'};font-weight:600">✗ CON ERROR</div>
          <div style="font-size:24px;font-weight:700;color:${hayErrores ? '#991b1b' : 'var(--text-secondary)'}">${preview.filasConError}</div>
        </div>
      </div>

      ${preview.errores?.length ? `
        <div style="padding:12px;background:#fef2f2;border-radius:8px;margin-bottom:16px;max-height:200px;overflow-y:auto">
          <strong style="color:#991b1b;font-size:12px">Errores detectados (primeros ${preview.errores.length}):</strong>
          <ul style="margin:6px 0 0;padding-left:20px;font-size:11px">
            ${preview.errores.map(er => `<li>Fila ${er.fila} · campo <code>${er.campo}</code>: ${er.mensaje}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${preview.preview?.length ? `
        <div style="margin-bottom:16px">
          <strong style="font-size:12px">Preview primeras ${preview.preview.length} filas válidas:</strong>
          <div style="overflow-x:auto;margin-top:8px">
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead>
                <tr style="background:#f9fafb;border-bottom:1px solid #d9dad9">
                  ${Object.keys(preview.preview[0]).map(k => `<th style="padding:6px;text-align:left">${k}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${preview.preview.map(row => `
                  <tr style="border-bottom:1px solid #f0f0f0">
                    ${Object.values(row).map(v => `<td style="padding:6px">${v == null ? '—' : String(v).slice(0, 40)}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="document.getElementById('preview-container').innerHTML=''"
          style="padding:10px 20px;background:transparent;border:1px solid #d9dad9;border-radius:6px;cursor:pointer">
          Cancelar
        </button>
        ${preview.filasValidas > 0 ? `
          <button onclick="window.confirmarImportador()"
            style="padding:10px 24px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700">
            ✓ Confirmar e importar ${preview.filasValidas} fila(s)
          </button>
        ` : ''}
      </div>
    </div>
  `;

  window.confirmarImportador = async () => {
    const { entidad, datos } = window.__importPending || {};
    if (!entidad || !datos?.length) return;
    const t = localStorage.getItem('erp_token');
    try {
      const r = await fetch('/api/importador/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ entidad, datos }),
      }).then(r => r.json());
      if (r.success) {
        showSuccess(`✓ ${r.insertados} fila(s) importadas correctamente`);
        document.getElementById('preview-container').innerHTML = '';
        window.__importPending = null;
      } else {
        showError('Error en commit: ' + (r.errores?.join('; ') || 'desconocido'));
      }
    } catch (err) {
      showError('Error: ' + err.message);
    }
  };
}

/**
 * Configuracion.js — Módulo ⚙️ Configuración (solo GERENTE)
 *
 * 6 tabs: Empresa · Régimen · Facturación · Módulos · Periodos · Auditoría
 * + Wizard de setup inicial cuando no existe configuración.
 */

import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';
import { TabBar } from '../components/TabBar.js';

const REGIMENES = {
  NRUS:    { label: 'NRUS',    desc: 'Nuevo RUS — cuota fija S/ 20 o S/ 50 mensual, sin IGV, solo boletas. Ingresos ≤ S/ 96K/año.' },
  RER:     { label: 'RER',     desc: 'Régimen Especial — 1.5% mensual sobre ingresos netos. Ingresos ≤ S/ 525K/año.' },
  RMT:     { label: 'RMT',     desc: 'MYPE Tributario — 1% pago a cuenta hasta 300 UIT. Ingresos ≤ 1,700 UIT/año.' },
  GENERAL: { label: 'General', desc: 'Régimen General — sin límite de ingresos. Lleva todos los libros PLE.' },
};

const MODULOS_LABELS = [
  { key: 'modulo_comercial',     label: '💼 Comercial',     desc: 'Cotizaciones, clientes, PDF' },
  { key: 'modulo_finanzas',      label: '💰 Finanzas',      desc: 'Cobranzas, Libro Bancos, impuestos' },
  { key: 'modulo_logistica',     label: '📦 Logística',     desc: 'Gastos, compras, OC' },
  { key: 'modulo_almacen',       label: '🏭 Almacén',       desc: 'Inventario, kárdex, valorización' },
  { key: 'modulo_administracion',label: '👥 Administración', desc: 'Gasto personal, planillas' },
  { key: 'modulo_prestamos',     label: '💳 Préstamos',     desc: 'Tomados y otorgados' },
  { key: 'modulo_produccion',    label: '⚒️ Producción',    desc: 'OT, BOM, work centers (Fase E)' },
  { key: 'modulo_calidad',       label: '✅ Calidad',       desc: 'QC, no conformidades (Fase E)' },
  { key: 'modulo_contabilidad',  label: '📘 Contabilidad',   desc: 'Libros PLE, Pack Contable (Fase D)' },
];

// ─── Entry point ──────────────────────────────────────────────
export const Configuracion = async () => {
  const user = JSON.parse(localStorage.getItem('erp_user') || '{}');
  if (user.rol !== 'GERENTE') {
    return `<div class="placeholder-page"><h2>🔒 Acceso restringido</h2><p>Solo el Gerente puede acceder a Configuración.</p></div>`;
  }

  // ¿Existe configuración? Si no, mostrar Wizard.
  let existe = false;
  try {
    const r = await api.config.existe();
    existe = !!r?.existe;
  } catch (e) {
    console.error('[Configuracion] existe() falló:', e);
  }

  if (!existe) return renderWizard();

  // Cargar la configuración actual
  let cfg = null;
  let diag = null;
  try {
    [cfg, diag] = await Promise.all([
      api.config.get(),
      api.facturacion.diagnostico().catch(() => null),
    ]);
  } catch (e) {
    return `<div class="placeholder-page" style="color:var(--danger)"><h2>Error cargando configuración</h2><p>${e.message}</p></div>`;
  }

  setTimeout(() => initTabs(cfg, diag), 60);
  return shellHtml();
};

// ─── Shell con TabBar ─────────────────────────────────────────
function shellHtml() {
  return `
    <header class="header">
      <div>
        <h1>⚙️ Configuración de la Empresa</h1>
        <span style="color:var(--text-secondary)">Régimen tributario, facturación, módulos, periodos contables y auditoría.</span>
      </div>
    </header>

    <div id="config-tabbar" style="margin-top:20px"></div>

    <div id="tab-empresa" class="tab-content"></div>
    <div id="tab-regimen" class="tab-content" style="display:none"></div>
    <div id="tab-facturacion" class="tab-content" style="display:none"></div>
    <div id="tab-modulos" class="tab-content" style="display:none"></div>
    <div id="tab-periodos" class="tab-content" style="display:none"></div>
    <div id="tab-auditoria" class="tab-content" style="display:none"></div>
  `;
}

function initTabs(cfg, diag) {
  TabBar({
    container: '#config-tabbar',
    tabs: [
      { id: 'empresa',     label: '🏢 Empresa' },
      { id: 'regimen',     label: '📋 Régimen' },
      { id: 'facturacion', label: '🧾 Facturación' },
      { id: 'modulos',     label: '💼 Módulos' },
      { id: 'periodos',    label: '📅 Periodos' },
      { id: 'auditoria',   label: '🔍 Auditoría' },
    ],
    defaultTab: 'empresa',
    onChange: (id) => {
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      const panel = document.getElementById('tab-' + id);
      if (panel) panel.style.display = 'block';
      // Lazy-render del contenido al cambiar de tab
      if (id === 'empresa'     && !panel.dataset.rendered) renderTabEmpresa(panel, cfg);
      if (id === 'regimen'     && !panel.dataset.rendered) renderTabRegimen(panel, cfg);
      if (id === 'facturacion' && !panel.dataset.rendered) renderTabFacturacion(panel, cfg, diag);
      if (id === 'modulos'     && !panel.dataset.rendered) renderTabModulos(panel, cfg);
      if (id === 'periodos')   renderTabPeriodos(panel);
      if (id === 'auditoria')  renderTabAuditoria(panel);
    },
  });

  // Namespace window para onclick handlers en HTML generado
  window.Configuracion = {
    guardarEmpresa,
    cambiarRegimen,
    guardarFacturacion,
    toggleModulo,
    cerrarPeriodo,
    reabrirPeriodo,
    recargarAuditoria,
  };
}

// ─── TAB 1: Empresa ───────────────────────────────────────────
function renderTabEmpresa(panel, cfg) {
  panel.dataset.rendered = '1';
  panel.innerHTML = `
    <div class="card" style="margin-top:12px">
      <h3 style="margin-bottom:16px;font-size:15px">Datos de la Empresa</h3>
      <form id="form-empresa" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <label>RUC</label>
          <input name="ruc" value="${cfg.ruc || ''}" readonly style="background:#f5f5f5" maxlength="11">
        </div>
        <div>
          <label>Razón Social *</label>
          <input name="razon_social" value="${cfg.razon_social || ''}" required>
        </div>
        <div>
          <label>Nombre Comercial</label>
          <input name="nombre_comercial" value="${cfg.nombre_comercial || ''}">
        </div>
        <div>
          <label>Email Facturación</label>
          <input type="email" name="email_facturacion" value="${cfg.email_facturacion || ''}">
        </div>
        <div>
          <label>Teléfono</label>
          <input name="telefono" value="${cfg.telefono || ''}">
        </div>
        <div>
          <label>Web</label>
          <input name="web" value="${cfg.web || ''}">
        </div>
        <div style="grid-column:span 2">
          <label>Dirección Fiscal</label>
          <input name="direccion_fiscal" value="${cfg.direccion_fiscal || ''}">
        </div>
        <div style="grid-column:span 2">
          <label>Logo URL</label>
          <input name="logo_url" value="${cfg.logo_url || ''}">
        </div>
        <div style="grid-column:span 2;display:flex;justify-content:flex-end">
          <button type="submit" class="btn-primary" style="padding:10px 24px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('form-empresa').onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    delete data.ruc; // no editable
    window.Configuracion.guardarEmpresa(data);
  };
}

async function guardarEmpresa(data) {
  try {
    await api.config.update(data);
    showSuccess('Datos de empresa actualizados');
  } catch (e) { showError(e.message || 'Error al guardar'); }
}

// ─── TAB 2: Régimen ───────────────────────────────────────────
function renderTabRegimen(panel, cfg) {
  panel.dataset.rendered = '1';
  panel.innerHTML = `
    <div class="card" style="margin-top:12px">
      <h3 style="margin-bottom:8px;font-size:15px">Régimen Tributario</h3>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px">
        Determina qué libros electrónicos llevas, si aplicas IGV, y qué comprobantes puedes emitir.
        Al cambiar de régimen, los flags derivados (libros, IGV, comprobantes) se actualizan automáticamente.
      </p>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
        ${Object.entries(REGIMENES).map(([k, v]) => `
          <div class="regimen-card ${cfg.regimen === k ? 'activo' : ''}"
               onclick="Configuracion.cambiarRegimen('${k}')"
               style="padding:18px;border:2px solid ${cfg.regimen === k ? 'var(--primary-color)' : 'var(--border-light)'};
                      border-radius:10px;cursor:pointer;transition:all 0.15s;
                      background:${cfg.regimen === k ? '#f9fafb' : '#fff'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <h4 style="margin:0;font-weight:700;font-size:14px">${v.label}</h4>
              ${cfg.regimen === k ? '<span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">ACTIVO</span>' : ''}
            </div>
            <p style="margin:0;font-size:11px;color:var(--text-secondary);line-height:1.5">${v.desc}</p>
          </div>
        `).join('')}
      </div>

      <div style="margin-top:28px;padding:18px;background:#f9fafb;border-radius:8px">
        <h4 style="margin-bottom:12px;font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Resumen del régimen actual</h4>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;font-size:13px">
          <div><strong>IGV:</strong> ${cfg.aplica_igv ? `${cfg.tasa_igv}% aplicable` : 'No aplica'}</div>
          <div><strong>UIT ${cfg.anio_uit}:</strong> S/ ${Number(cfg.uit_vigente).toLocaleString('es-PE')}</div>
          <div><strong>Pago a cuenta Renta:</strong> ${cfg.tasa_pago_cuenta_renta ?? 0}%</div>
          <div><strong>Cuota fija mensual:</strong> ${cfg.cuota_fija_mensual ? `S/ ${cfg.cuota_fija_mensual}` : '—'}</div>
          <div><strong>Libro Diario Completo:</strong> ${cfg.lleva_libro_diario_completo ? '✓' : '—'}</div>
          <div><strong>Libro Mayor:</strong> ${cfg.lleva_libro_mayor ? '✓' : '—'}</div>
          <div><strong>Libro Caja y Bancos:</strong> ${cfg.lleva_libro_caja_bancos ? '✓' : '—'}</div>
          <div><strong>Inventarios y Balances:</strong> ${cfg.lleva_inventarios_balances ? '✓' : '—'}</div>
          <div><strong>Emite factura:</strong> ${cfg.emite_factura ? '✓' : '—'}</div>
          <div><strong>Emite boleta:</strong> ${cfg.emite_boleta ? '✓' : '—'}</div>
        </div>
      </div>
    </div>
  `;
}

async function cambiarRegimen(reg) {
  const actual = await api.config.get();
  if (actual.regimen === reg) return;
  if (!confirm(`¿Cambiar régimen de ${actual.regimen} a ${reg}?\n\nEsto recalcula los libros PLE obligatorios, IGV y comprobantes permitidos. Queda registrado en auditoría.`)) return;
  try {
    await api.config.update({ regimen: reg });
    showSuccess(`Régimen cambiado a ${reg}`);
    location.reload();
  } catch (e) { showError(e.message || 'Error al cambiar régimen'); }
}

// ─── TAB 3: Facturación ───────────────────────────────────────
function renderTabFacturacion(panel, cfg, diag) {
  panel.dataset.rendered = '1';
  const modoBadge = diag?.modo === 'REAL'
    ? '<span style="background:#16a34a;color:#fff;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">🟢 REAL</span>'
    : '<span style="background:#f59e0b;color:#fff;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">🟡 STUB</span>';

  panel.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:15px">Facturación Electrónica SUNAT</h3>
        ${modoBadge}
      </div>

      <div style="padding:14px;background:${diag?.modo === 'REAL' ? '#f0fdf4' : '#fffbeb'};border-radius:8px;margin-bottom:20px;font-size:13px">
        ${diag?.mensaje || 'Sin diagnóstico disponible.'}
      </div>

      <form id="form-facturacion" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <label>OSE Proveedor</label>
          <select name="ose_proveedor">
            <option value="NONE"     ${cfg.ose_proveedor === 'NONE'     ? 'selected' : ''}>Ninguno (modo STUB)</option>
            <option value="NUBEFACT" ${cfg.ose_proveedor === 'NUBEFACT' ? 'selected' : ''}>Nubefact</option>
            <option value="EFACT"    ${cfg.ose_proveedor === 'EFACT'    ? 'selected' : ''}>EFACT</option>
            <option value="SUNAT"    ${cfg.ose_proveedor === 'SUNAT'    ? 'selected' : ''}>SUNAT Facturador</option>
          </select>
        </div>
        <div>
          <label>Endpoint URL (API OSE)</label>
          <input name="ose_endpoint_url" value="${cfg.ose_endpoint_url || ''}" placeholder="https://api.nubefact.com/api/v1/20610071962">
        </div>
        <div>
          <label>Usuario OSE</label>
          <input name="ose_usuario" value="${cfg.ose_usuario || ''}">
        </div>
        <div>
          <label>Token / API Key</label>
          <input type="password" name="ose_token_hash" placeholder="${cfg.ose_usuario ? '•••••••• (ya guardado)' : 'pegar token aquí'}">
        </div>
        <div>
          <label>Certificado digital (ruta .pfx)</label>
          <input name="cert_digital_ruta" value="${cfg.cert_digital_ruta || ''}" placeholder="./certs/metalengineers.pfx">
        </div>
        <div>
          <label>Password certificado</label>
          <input type="password" name="cert_digital_password_hash" placeholder="${cfg.cert_digital_ruta ? '•••••••• (ya guardado)' : 'password del .pfx'}">
        </div>

        <div style="grid-column:span 2;border-top:1px solid var(--border-light);padding-top:14px;margin-top:6px">
          <h4 style="margin-bottom:10px;font-size:13px">Series de numeración</h4>
        </div>
        <div><label>Serie Factura</label><input name="serie_factura" value="${cfg.serie_factura}" maxlength="4"></div>
        <div><label>Serie Boleta</label><input name="serie_boleta" value="${cfg.serie_boleta}" maxlength="4"></div>
        <div><label>Serie Nota Crédito</label><input name="serie_nota_credito" value="${cfg.serie_nota_credito}" maxlength="4"></div>
        <div><label>Serie Nota Débito</label><input name="serie_nota_debito" value="${cfg.serie_nota_debito}" maxlength="4"></div>
        <div><label>Serie Guía Remisión</label><input name="serie_guia_remision" value="${cfg.serie_guia_remision}" maxlength="4"></div>

        <div style="grid-column:span 2;display:flex;justify-content:flex-end;margin-top:10px">
          <button type="submit" style="padding:10px 24px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            Guardar configuración OSE
          </button>
        </div>
      </form>

      <div style="margin-top:20px;padding:12px;background:#f0f9ff;border-radius:8px;font-size:12px;color:var(--text-secondary)">
        📌 <strong>Nota Fase A:</strong> el sistema está en modo STUB — las emisiones son simuladas. La emisión real vs SUNAT se activa en Fase B cuando el OSE esté configurado y el certificado digital cargado.
      </div>
    </div>
  `;

  document.getElementById('form-facturacion').onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    // No enviamos los campos password si el usuario los dejó vacíos (mantener el valor actual)
    if (!data.ose_token_hash) delete data.ose_token_hash;
    if (!data.cert_digital_password_hash) delete data.cert_digital_password_hash;
    window.Configuracion.guardarFacturacion(data);
  };
}

async function guardarFacturacion(data) {
  try {
    await api.config.update(data);
    showSuccess('Configuración de facturación guardada');
    location.reload();
  } catch (e) { showError(e.message || 'Error al guardar'); }
}

// ─── TAB 4: Módulos ───────────────────────────────────────────
function renderTabModulos(panel, cfg) {
  panel.dataset.rendered = '1';
  panel.innerHTML = `
    <div class="card" style="margin-top:12px">
      <h3 style="margin-bottom:8px;font-size:15px">Módulos Activos</h3>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px">
        Activa o desactiva módulos. Solo los activos aparecen en el sidebar. Los módulos en desarrollo (Producción, Calidad, Contabilidad) están disponibles pero aún no tienen UI completa.
      </p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${MODULOS_LABELS.map(m => `
          <label class="modulo-toggle" style="display:flex;gap:10px;padding:14px;border:1px solid var(--border-light);border-radius:8px;cursor:pointer">
            <input type="checkbox" ${cfg[m.key] ? 'checked' : ''}
                   onchange="Configuracion.toggleModulo('${m.key}', this.checked)"
                   style="width:18px;height:18px;flex-shrink:0">
            <div>
              <div style="font-weight:600;font-size:13px">${m.label}</div>
              <div style="color:var(--text-secondary);font-size:11px;margin-top:2px">${m.desc}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

async function toggleModulo(key, val) {
  try {
    await api.config.update({ [key]: val ? 1 : 0 });
    showSuccess(`Módulo ${val ? 'activado' : 'desactivado'}`);
  } catch (e) { showError(e.message || 'Error'); }
}

// ─── TAB 5: Periodos ──────────────────────────────────────────
async function renderTabPeriodos(panel) {
  panel.innerHTML = `<div class="card" style="margin-top:12px"><h3 style="font-size:15px">Cargando periodos…</h3></div>`;
  try {
    const periodos = await api.periodos.list();
    const anios = [...new Set(periodos.map(p => p.anio))].sort((a, b) => b - a);
    const grid = anios.map(anio => {
      const delAnio = periodos.filter(p => p.anio === anio);
      const cells = delAnio.map(p => {
        const colores = {
          ABIERTO:  { bg: '#dcfce7', fg: '#166534', label: 'Abierto' },
          CERRADO:  { bg: '#fee2e2', fg: '#991b1b', label: 'Cerrado' },
          BLOQUEADO:{ bg: '#fef3c7', fg: '#92400e', label: 'Bloq.' },
        }[p.estado];
        const accion = p.estado === 'ABIERTO'
          ? `<button onclick="Configuracion.cerrarPeriodo(${p.anio},${p.mes})" style="padding:3px 8px;border:1px solid #dc2626;background:transparent;color:#dc2626;border-radius:4px;cursor:pointer;font-size:10px">Cerrar</button>`
          : `<button onclick="Configuracion.reabrirPeriodo(${p.anio},${p.mes})" style="padding:3px 8px;border:1px solid #16a34a;background:transparent;color:#16a34a;border-radius:4px;cursor:pointer;font-size:10px">Reabrir</button>`;
        return `
          <div style="text-align:center;padding:10px;background:${colores.bg};border-radius:6px">
            <div style="font-weight:700;font-size:14px">${String(p.mes).padStart(2, '0')}</div>
            <div style="font-size:10px;color:${colores.fg};margin:4px 0;font-weight:600">${colores.label}</div>
            ${accion}
          </div>
        `;
      }).join('');
      return `
        <div class="card" style="margin-bottom:16px">
          <h4 style="margin-bottom:12px;font-size:14px">${anio}</h4>
          <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:8px">${cells}</div>
        </div>
      `;
    }).join('');
    panel.innerHTML = `
      <div style="margin-top:12px">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
          Al cerrar un periodo, se bloquean las mutaciones (crear/editar/borrar) en documentos de ese mes.
          El GERENTE puede reabrir si necesita corregir algo, queda registrado en auditoría.
        </p>
        ${grid}
      </div>
    `;
  } catch (e) {
    panel.innerHTML = `<div class="card" style="color:var(--danger)">Error cargando periodos: ${e.message}</div>`;
  }
}

async function cerrarPeriodo(anio, mes) {
  const obs = prompt(`¿Cerrar periodo ${anio}-${String(mes).padStart(2, '0')}?\n\nObservaciones (opcional):`);
  if (obs === null) return; // canceló
  try {
    await api.periodos.cerrar(anio, mes, obs);
    showSuccess(`Periodo ${anio}-${String(mes).padStart(2, '0')} cerrado`);
    const panel = document.getElementById('tab-periodos');
    await renderTabPeriodos(panel);
  } catch (e) { showError(e.message || 'Error al cerrar'); }
}

async function reabrirPeriodo(anio, mes) {
  if (!confirm(`¿Reabrir periodo ${anio}-${String(mes).padStart(2, '0')}?\n\nSe permitirán mutaciones nuevamente. Queda en auditoría.`)) return;
  try {
    await api.periodos.reabrir(anio, mes);
    showSuccess(`Periodo ${anio}-${String(mes).padStart(2, '0')} reabierto`);
    const panel = document.getElementById('tab-periodos');
    await renderTabPeriodos(panel);
  } catch (e) { showError(e.message || 'Error al reabrir'); }
}

// ─── TAB 6: Auditoría ─────────────────────────────────────────
async function renderTabAuditoria(panel) {
  panel.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:15px">Registro de Auditoría</h3>
        <div style="display:flex;gap:8px">
          <select id="audit-filter-accion" style="padding:6px 10px;border:1px solid var(--border-light);border-radius:6px">
            <option value="">Todas las acciones</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="ANULAR">ANULAR</option>
            <option value="CONFIG">CONFIG</option>
            <option value="EMIT">EMIT</option>
            <option value="EXPORT">EXPORT</option>
          </select>
          <input id="audit-filter-entidad" placeholder="Entidad (ej. Servicio)"
                 style="padding:6px 10px;border:1px solid var(--border-light);border-radius:6px">
          <button onclick="Configuracion.recargarAuditoria()"
                  style="padding:6px 14px;background:var(--primary-color);color:#fff;border:none;border-radius:6px;cursor:pointer">Filtrar</button>
        </div>
      </div>
      <div id="audit-tabla">Cargando…</div>
    </div>
  `;

  await recargarAuditoria();
}

async function recargarAuditoria() {
  const cont = document.getElementById('audit-tabla');
  if (!cont) return;
  const filtros = {};
  const accion = document.getElementById('audit-filter-accion')?.value;
  const entidad = document.getElementById('audit-filter-entidad')?.value;
  if (accion) filtros.accion = accion;
  if (entidad) filtros.entidad = entidad;
  filtros.limit = 200;

  try {
    const rows = await api.auditoria.list(filtros);
    if (!rows?.length) {
      cont.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:30px">Sin registros de auditoría</p>';
      return;
    }
    cont.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f9fafb;border-bottom:2px solid var(--border-light)">
              <th style="padding:10px;text-align:left">Fecha</th>
              <th style="padding:10px;text-align:left">Usuario</th>
              <th style="padding:10px;text-align:left">Acción</th>
              <th style="padding:10px;text-align:left">Entidad</th>
              <th style="padding:10px;text-align:left">ID</th>
              <th style="padding:10px;text-align:left">IP</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr style="border-bottom:1px solid var(--border-light)">
                <td style="padding:8px 10px;color:var(--text-secondary)">${new Date(r.fecha).toLocaleString('es-PE')}</td>
                <td style="padding:8px 10px">${r.nombre_usuario || '—'}</td>
                <td style="padding:8px 10px"><span style="background:${accionColor(r.accion)};color:#fff;padding:2px 8px;border-radius:4px;font-weight:600">${r.accion}</span></td>
                <td style="padding:8px 10px">${r.entidad}</td>
                <td style="padding:8px 10px;font-family:monospace">${r.entidad_id || ''}</td>
                <td style="padding:8px 10px;color:var(--text-secondary);font-size:11px">${r.ip || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="margin-top:12px;font-size:11px;color:var(--text-secondary)">Mostrando ${rows.length} registros (máx 200). Usa filtros para refinar.</p>
    `;
  } catch (e) {
    cont.innerHTML = `<p style="color:var(--danger);padding:20px">Error: ${e.message}</p>`;
  }
}

function accionColor(accion) {
  return {
    CREATE: '#16a34a', UPDATE: '#3b82f6', DELETE: '#dc2626', ANULAR: '#f59e0b',
    LOGIN:  '#676767', LOGOUT: '#676767', CONFIG: '#8b5cf6', EMIT:  '#0ea5e9', EXPORT: '#64748b',
  }[accion] || '#676767';
}

// ─── WIZARD (cuando no hay configuración) ─────────────────────
function renderWizard() {
  setTimeout(bindWizard, 60);
  return `
    <div class="card" style="max-width:640px;margin:40px auto;padding:32px">
      <h2 style="margin-bottom:8px">🚀 Bienvenido a ERP-PRO</h2>
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:28px">
        No hay configuración inicial. Vamos a crearla en 2 minutos.
      </p>

      <div id="wizard-step" data-step="1"></div>
    </div>
  `;
}

const WIZARD_STATE = {
  ruc: '',
  razon_social: '',
  nombre_comercial: '',
  email_facturacion: '',
  direccion_fiscal: '',
  regimen: 'RMT',
  modulos: {
    modulo_comercial: 1, modulo_finanzas: 1, modulo_logistica: 1,
    modulo_almacen: 1, modulo_administracion: 1, modulo_prestamos: 1,
  },
};

function bindWizard() {
  renderWizardStep(1);
  window.Configuracion = {
    wizardNext: (step) => renderWizardStep(step),
    wizardFinalizar: finalizarWizard,
    wizardSetRegimen: (r) => { WIZARD_STATE.regimen = r; renderWizardStep(2); },
  };
}

function renderWizardStep(step) {
  const cont = document.getElementById('wizard-step');
  if (!cont) return;
  cont.dataset.step = String(step);

  if (step === 1) {
    cont.innerHTML = `
      <h3 style="margin-bottom:14px">Paso 1/4: Datos de la empresa</h3>
      <form id="w-form-1" style="display:grid;gap:12px">
        <div><label>RUC *</label><input name="ruc" required maxlength="11" pattern="[0-9]{11}" value="${WIZARD_STATE.ruc}"></div>
        <div><label>Razón Social *</label><input name="razon_social" required value="${WIZARD_STATE.razon_social}"></div>
        <div><label>Nombre Comercial</label><input name="nombre_comercial" value="${WIZARD_STATE.nombre_comercial}"></div>
        <div><label>Email Facturación</label><input type="email" name="email_facturacion" value="${WIZARD_STATE.email_facturacion}"></div>
        <div><label>Dirección Fiscal</label><input name="direccion_fiscal" value="${WIZARD_STATE.direccion_fiscal}"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:10px">
          <button type="submit" style="padding:10px 24px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
            Siguiente →
          </button>
        </div>
      </form>
    `;
    document.getElementById('w-form-1').onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      Object.assign(WIZARD_STATE, data);
      renderWizardStep(2);
    };
    return;
  }

  if (step === 2) {
    cont.innerHTML = `
      <h3 style="margin-bottom:14px">Paso 2/4: Régimen Tributario</h3>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">
        Si no estás seguro, pregunta a tu contador. La mayoría de PYMEs metalmecánicas están en RMT.
      </p>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px">
        ${Object.entries(REGIMENES).map(([k, v]) => `
          <div onclick="Configuracion.wizardSetRegimen('${k}')"
               style="padding:16px;border:2px solid ${WIZARD_STATE.regimen === k ? 'var(--primary-color)' : 'var(--border-light)'};
                      border-radius:10px;cursor:pointer;background:${WIZARD_STATE.regimen === k ? '#f9fafb' : '#fff'}">
            <h4 style="margin:0 0 6px;font-size:14px">${v.label}</h4>
            <p style="margin:0;font-size:11px;color:var(--text-secondary);line-height:1.5">${v.desc}</p>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:space-between">
        <button onclick="Configuracion.wizardNext(1)" style="padding:10px 20px;background:transparent;border:1px solid var(--border-light);border-radius:8px;cursor:pointer">← Atrás</button>
        <button onclick="Configuracion.wizardNext(3)" style="padding:10px 24px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Siguiente →</button>
      </div>
    `;
    return;
  }

  if (step === 3) {
    cont.innerHTML = `
      <h3 style="margin-bottom:14px">Paso 3/4: Módulos iniciales</h3>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">
        Activa los módulos que vas a usar desde el inicio. Podrás activar más después desde Configuración.
      </p>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px">
        ${MODULOS_LABELS.slice(0, 6).map(m => `
          <label style="display:flex;gap:8px;align-items:center;padding:10px;border:1px solid var(--border-light);border-radius:8px;cursor:pointer">
            <input type="checkbox" ${WIZARD_STATE.modulos[m.key] ? 'checked' : ''}
                   onchange="(${toggleWizardModulo.toString()})('${m.key}', this.checked)">
            <span style="font-size:13px">${m.label}</span>
          </label>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:space-between">
        <button onclick="Configuracion.wizardNext(2)" style="padding:10px 20px;background:transparent;border:1px solid var(--border-light);border-radius:8px;cursor:pointer">← Atrás</button>
        <button onclick="Configuracion.wizardNext(4)" style="padding:10px 24px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Siguiente →</button>
      </div>
    `;
    return;
  }

  if (step === 4) {
    cont.innerHTML = `
      <h3 style="margin-bottom:14px">Paso 4/4: Confirmar</h3>
      <div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:20px;font-size:13px">
        <p><strong>RUC:</strong> ${WIZARD_STATE.ruc}</p>
        <p><strong>Razón Social:</strong> ${WIZARD_STATE.razon_social}</p>
        <p><strong>Régimen:</strong> ${WIZARD_STATE.regimen} — ${REGIMENES[WIZARD_STATE.regimen].label}</p>
        <p><strong>Módulos activos:</strong> ${Object.entries(WIZARD_STATE.modulos).filter(([, v]) => v).length}</p>
      </div>
      <div style="padding:12px;background:#fffbeb;border-radius:8px;font-size:12px;margin-bottom:20px">
        📌 La facturación electrónica SUNAT se configura después, desde ⚙️ Configuración → Facturación, cuando tengas el certificado digital y cuenta en OSE (Nubefact).
      </div>
      <div style="display:flex;justify-content:space-between">
        <button onclick="Configuracion.wizardNext(3)" style="padding:10px 20px;background:transparent;border:1px solid var(--border-light);border-radius:8px;cursor:pointer">← Atrás</button>
        <button onclick="Configuracion.wizardFinalizar()" style="padding:10px 30px;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">✓ Crear configuración</button>
      </div>
    `;
    return;
  }
}

function toggleWizardModulo(key, val) {
  WIZARD_STATE.modulos[key] = val ? 1 : 0;
}

async function finalizarWizard() {
  const payload = {
    ruc: WIZARD_STATE.ruc,
    razon_social: WIZARD_STATE.razon_social,
    nombre_comercial: WIZARD_STATE.nombre_comercial || null,
    email_facturacion: WIZARD_STATE.email_facturacion || null,
    direccion_fiscal: WIZARD_STATE.direccion_fiscal || null,
    regimen: WIZARD_STATE.regimen,
    ...WIZARD_STATE.modulos,
  };
  try {
    await api.config.setup(payload);
    showSuccess('Configuración creada ✓');
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    showError(e.message || 'Error al crear configuración');
  }
}

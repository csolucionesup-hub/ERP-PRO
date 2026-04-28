import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';

let _configs = {};
let _marca   = 'METAL';

function campo(label, name, value, placeholder = '') {
  const v = value == null ? '' : String(value).replace(/"/g, '&quot;');
  return `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#444">
      <span style="font-weight:600">${label}</span>
      <input type="text" name="${name}" value="${v}" placeholder="${placeholder}"
        style="padding:8px 10px;border:1px solid #d0d0d0;border-radius:4px;font-size:13px">
    </label>`;
}

function renderHTML() {
  const c = _configs[_marca] || {};
  const esGerente = (JSON.parse(localStorage.getItem('erp_user') || '{}').rol === 'GERENTE');

  return `
    <div style="padding:20px;max-width:1100px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <h1 style="margin:0;font-size:22px">Configuración de Cotizaciones</h1>
          <p style="margin:4px 0 0;color:#666;font-size:13px">
            Estos datos aparecen automáticamente en los PDFs de cotizaciones. Se mantienen por marca.
          </p>
        </div>
        <button onclick="window.navigate('comercial')"
          style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer">← Volver</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid #e5e5e5">
        ${['METAL', 'PERFOTOOLS'].map(m => `
          <button onclick="cfgComercial.tab('${m}')"
            style="padding:10px 18px;border:none;background:${m === _marca ? '#000' : 'transparent'};
                   color:${m === _marca ? '#fff' : '#555'};font-weight:600;cursor:pointer;
                   border-radius:6px 6px 0 0">${m === 'METAL' ? 'Metal Engineers (MN)' : 'Perfotools (ME)'}</button>
        `).join('')}
      </div>

      ${!esGerente ? `
        <div style="background:#fef3c7;border:1px solid #fbbf24;color:#92400e;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px">
          Modo solo lectura. Solo el Gerente puede modificar esta configuración.
        </div>` : ''}

      <section style="background:#f8f9fa;padding:14px 16px;border-radius:6px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase">Logo de la marca</div>
        <p style="margin:0 0 10px;color:#666;font-size:12px">
          Aparece en la cabecera y la firma del PDF de cotizaciones. Recomendado: PNG con fondo transparente, mínimo 600px de ancho.
        </p>
        <div style="display:flex;align-items:center;gap:16px">
          <div id="logo-preview-${_marca}"
               style="width:200px;height:80px;border:1px dashed #ccc;border-radius:6px;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden">
            ${c.logo_url
              ? `<img src="${c.logo_url}" alt="Logo ${_marca}" style="max-width:100%;max-height:100%;object-fit:contain">`
              : `<span style="color:#999;font-size:12px">Sin logo</span>`}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="logo-input-${_marca}" accept="image/*" style="display:none"
                   onchange="cfgComercial.subirLogo(event)">
            <button type="button" ${!esGerente ? 'disabled' : ''}
              onclick="document.getElementById('logo-input-${_marca}').click()"
              style="padding:8px 14px;border:1px solid #d0d0d0;background:${esGerente ? '#fff' : '#f1f1f1'};
                     border-radius:4px;cursor:${esGerente ? 'pointer' : 'not-allowed'};font-size:13px">
              📁 ${c.logo_url ? 'Reemplazar logo' : 'Subir logo'}
            </button>
            <span id="logo-status-${_marca}" style="font-size:11px;color:#666"></span>
          </div>
        </div>
      </section>

      <form id="cfg-form" onsubmit="cfgComercial.guardar(event)">
        <section style="background:#f8f9fa;padding:14px 16px;border-radius:6px;margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase">Datos de la empresa</div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
            ${campo('Razón social', 'razon_social', c.razon_social)}
            ${campo('RUC',          'ruc',          c.ruc)}
          </div>
          <div style="margin-top:10px">
            ${campo('Dirección', 'direccion', c.direccion)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
            ${campo('Web',   'web',   c.web)}
            ${campo('Email', 'email', c.email)}
          </div>
        </section>

        <section style="background:#f8f9fa;padding:14px 16px;border-radius:6px;margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase">Cuenta bancaria en Soles (PEN)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:10px">
            ${campo('Banco',  'cta_pen_banco',  c.cta_pen_banco,  'Interbank')}
            ${campo('Cuenta', 'cta_pen_numero', c.cta_pen_numero, '200-000000000')}
            ${campo('CCI',    'cta_pen_cci',    c.cta_pen_cci,    '003-200-...')}
          </div>
        </section>

        <section style="background:#f8f9fa;padding:14px 16px;border-radius:6px;margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase">Cuenta bancaria en Dólares (USD)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:10px">
            ${campo('Banco',  'cta_usd_banco',  c.cta_usd_banco,  'Interbank')}
            ${campo('Cuenta', 'cta_usd_numero', c.cta_usd_numero, '200-000000000')}
            ${campo('CCI',    'cta_usd_cci',    c.cta_usd_cci,    '003-200-...')}
          </div>
        </section>

        <section style="background:#f8f9fa;padding:14px 16px;border-radius:6px;margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase">Firma del responsable comercial</div>
          <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:10px">
            ${campo('Nombre', 'firma_nombre',   c.firma_nombre,   'JULIO ROJAS COTRINA')}
            ${campo('Cargo',  'firma_cargo',    c.firma_cargo,    'Gerente Comercial')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:10px">
            ${campo('Teléfono', 'firma_telefono', c.firma_telefono, '933 440 483')}
            ${campo('Email',    'firma_email',    c.firma_email,    'juliorojas@...')}
          </div>
          <div style="margin-top:10px">
            ${campo('Dirección', 'firma_direccion', c.firma_direccion)}
          </div>
        </section>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px">
          <button type="button" onclick="window.navigate('comercial')"
            style="padding:10px 20px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer">Cancelar</button>
          <button type="submit" ${!esGerente ? 'disabled' : ''}
            style="padding:10px 20px;border:none;background:${esGerente ? '#000' : '#999'};color:#fff;
                   border-radius:4px;cursor:${esGerente ? 'pointer' : 'not-allowed'};font-weight:600">
            Guardar — ${_marca === 'METAL' ? 'Metal Engineers' : 'Perfotools'}
          </button>
        </div>
      </form>
    </div>`;
}

// ── Namespace global para los onclick del HTML generado ───────────
window.cfgComercial = {
  tab(marca) {
    _marca = marca;
    document.getElementById('main-content').innerHTML = renderHTML();
  },
  async guardar(ev) {
    ev.preventDefault();
    const data = {};
    for (const el of ev.target.querySelectorAll('input[name]')) {
      data[el.name] = el.value.trim();
    }
    try {
      await api.configuracionMarca.update(_marca, data);
      _configs[_marca] = { ..._configs[_marca], ...data };
      showSuccess(`Configuración ${_marca} guardada`);
    } catch (e) {
      showError('Error al guardar: ' + e.message);
    }
  },
  async subirLogo(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const status  = document.getElementById(`logo-status-${_marca}`);
    const preview = document.getElementById(`logo-preview-${_marca}`);
    if (status) status.textContent = '⏳ Subiendo…';
    try {
      const result = await api.configuracionMarca.uploadLogo(_marca, file);
      // Actualizar el caché local y el preview sin recargar la página
      _configs[_marca] = { ..._configs[_marca], logo_url: result.url, logo_public_id: result.public_id };
      if (preview) preview.innerHTML = `<img src="${result.url}" alt="Logo ${_marca}" style="max-width:100%;max-height:100%;object-fit:contain">`;
      if (status)  status.textContent = '✓ Logo actualizado';
      showSuccess(`Logo de ${_marca} actualizado`);
      // Limpiar el input para que el mismo archivo se pueda re-subir si se quiere
      ev.target.value = '';
    } catch (e) {
      if (status) status.textContent = '';
      showError('Error subiendo logo: ' + e.message);
    }
  },
};

// ── Export para app.js ────────────────────────────────────────────
export async function ConfiguracionComercial() {
  try {
    const list = await api.configuracionMarca.getAll();
    _configs = {};
    for (const c of list) _configs[c.marca] = c;
  } catch (e) {
    showError('Error cargando configuración: ' + e.message);
  }
  return renderHTML();
}

import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';

export const Proveedores = async () => {
  let proveedores = [];
  try {
    proveedores = await api.purchases.getProveedores();
    if (!Array.isArray(proveedores)) proveedores = [];
  } catch (err) {
    console.error('[Proveedores] Error cargando datos:', err);
  }

  const inputStyle = 'padding:8px 10px; border-radius:6px; border:1px solid #d1d5db; width:100%; box-sizing:border-box; font-size:13px';
  const labelStyle = 'font-size:11px;color:var(--text-secondary);margin-bottom:2px;display:block';
  const sectionStyle = 'border-top:1px solid #e5e7eb; padding-top:10px; margin-top:6px';
  const sectionTitle = 'font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px';

  // ─── Tabla con resumen ──────────────────────────────────────
  const rows = proveedores.map(p => {
    const tipoBadge = p.tipo === 'PERSONA_NATURAL'
      ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">PERSONA</span>'
      : '<span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">EMPRESA</span>';
    const doc = p.tipo === 'PERSONA_NATURAL' ? (p.dni || '—') : (p.ruc || '—');
    const docLabel = p.tipo === 'PERSONA_NATURAL' ? 'DNI' : 'RUC';

    // Resumen métodos de pago
    const metodos = [];
    if (p.banco_1_nombre) metodos.push(`${p.banco_1_nombre} ${p.banco_1_numero || ''}`.trim());
    if (p.banco_2_nombre) metodos.push(`${p.banco_2_nombre} ${p.banco_2_numero || ''}`.trim());
    if (p.billetera_digital) metodos.push(`📱 Yape/Plin ${p.billetera_digital}`);
    const metodosHTML = metodos.length
      ? metodos.map(m => `<div style="font-size:11px">• ${m}</div>`).join('')
      : '<span style="color:#e65100;font-size:11px">⚠️ Sin método de pago</span>';

    return `
      <tr data-tipo="${p.tipo === 'PERSONA_NATURAL' ? 'PERSONA' : 'EMPRESA'}">
        <td style="font-size:11px">${tipoBadge}<br><span style="font-weight:600">${docLabel}: ${doc}</span></td>
        <td>
          <strong style="font-size:13px">${p.razon_social}</strong>
          ${p.contacto ? `<br><span style="font-size:11px;color:var(--text-secondary)">👤 ${p.contacto}</span>` : ''}
        </td>
        <td style="font-size:12px">
          ${p.telefono ? `📞 ${p.telefono}` : '<span style="color:var(--text-secondary)">—</span>'}
          ${p.email ? `<br><span style="font-size:11px">📧 ${p.email}</span>` : ''}
        </td>
        <td>${metodosHTML}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="action-btn" style="background:var(--info);color:white" title="Editar datos del proveedor: razón social, RUC, contactos, cuentas bancarias, dirección. Los cambios se ven reflejados en próximas OCs (no toca documentos históricos)." onclick="window.editarProveedor(${p.id_proveedor})">Editar</button>
            <button class="action-btn" style="background:#ef4444;color:white" title="Eliminar proveedor (solo si no tiene OCs, compras o gastos asociados). Si está vinculado, anulalo en sus documentos primero." aria-label="Eliminar proveedor" onclick="window.eliminarProveedor(${p.id_proveedor},'${(p.razon_social || '').replace(/'/g, "\\'")}')">×</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // ─── Form completo (reusable para nuevo y editar) ──────────
  function renderProveedorForm(p = {}, formId = 'form-prov-nuevo') {
    const tipo = p.tipo || 'EMPRESA';
    return `
      <form id="${formId}" style="display:flex;flex-direction:column;gap:8px">
        <div>
          <label style="${labelStyle}">Tipo</label>
          <div style="display:flex;gap:6px">
            <label style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;text-align:center;cursor:pointer;font-size:12px;${tipo === 'EMPRESA' ? 'background:var(--primary-color);color:white;border-color:var(--primary-color)' : ''}">
              <input type="radio" name="tipo" value="EMPRESA" ${tipo === 'EMPRESA' ? 'checked' : ''} style="display:none">
              🏢 Empresa
            </label>
            <label style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;text-align:center;cursor:pointer;font-size:12px;${tipo === 'PERSONA_NATURAL' ? 'background:var(--primary-color);color:white;border-color:var(--primary-color)' : ''}">
              <input type="radio" name="tipo" value="PERSONA_NATURAL" ${tipo === 'PERSONA_NATURAL' ? 'checked' : ''} style="display:none">
              👤 Persona
            </label>
          </div>
        </div>

        <div class="doc-empresa" style="${tipo === 'EMPRESA' ? '' : 'display:none'}">
          <label style="${labelStyle}">RUC * (11 dígitos)</label>
          <input name="ruc" value="${p.ruc || ''}" maxlength="11" pattern="[0-9]{11}" placeholder="20XXXXXXXXX" style="${inputStyle}">
        </div>

        <div class="doc-persona" style="${tipo === 'PERSONA_NATURAL' ? '' : 'display:none'}">
          <label style="${labelStyle}">DNI (8 dígitos)</label>
          <input name="dni" value="${p.dni || ''}" maxlength="8" pattern="[0-9]{8}" placeholder="12345678" style="${inputStyle}">
        </div>

        <div>
          <label style="${labelStyle}">Razón Social / Nombre completo *</label>
          <input name="razon_social" value="${p.razon_social || ''}" required style="${inputStyle}">
        </div>

        <div>
          <label style="${labelStyle}">Persona de contacto</label>
          <input name="contacto" value="${p.contacto || ''}" placeholder="Quien atiende del proveedor" style="${inputStyle}">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="${labelStyle}">Teléfono</label>
            <input name="telefono" value="${p.telefono || ''}" placeholder="9XXXXXXXX" style="${inputStyle}"></div>
          <div><label style="${labelStyle}">Email</label>
            <input name="email" type="email" value="${p.email || ''}" placeholder="ventas@empresa.com" style="${inputStyle}"></div>
        </div>

        <div>
          <label style="${labelStyle}">Dirección</label>
          <input name="direccion" value="${p.direccion || ''}" placeholder="Av. Principal 123 - Distrito" style="${inputStyle}">
        </div>

        <!-- Cuenta 1 -->
        <div style="${sectionStyle}">
          <div style="${sectionTitle}">💰 Cuenta bancaria 1</div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:6px;margin-bottom:6px">
            <div><label style="${labelStyle}">Banco</label>
              <select name="banco_1_nombre" style="${inputStyle}">
                <option value="">— Banco —</option>
                ${['BCP', 'Interbank', 'Scotiabank', 'BBVA', 'Banco de la Nación', 'Banco Pichincha', 'Banbif', 'GNB', 'Mibanco', 'Caja Arequipa', 'Otros'].map(b =>
                  `<option ${p.banco_1_nombre === b ? 'selected' : ''}>${b}</option>`
                ).join('')}
              </select>
            </div>
            <div><label style="${labelStyle}">Moneda</label>
              <select name="banco_1_moneda" style="${inputStyle}">
                <option value="PEN" ${(p.banco_1_moneda || 'PEN') === 'PEN' ? 'selected' : ''}>Soles (PEN)</option>
                <option value="USD" ${p.banco_1_moneda === 'USD' ? 'selected' : ''}>Dólares (USD)</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div><label style="${labelStyle}">Nº cuenta</label>
              <input name="banco_1_numero" value="${p.banco_1_numero || ''}" placeholder="194-12345678-0-12" style="${inputStyle}"></div>
            <div><label style="${labelStyle}">CCI</label>
              <input name="banco_1_cci" value="${p.banco_1_cci || ''}" placeholder="00219412345678012345" maxlength="20" style="${inputStyle}"></div>
          </div>
        </div>

        <!-- Cuenta 2 -->
        <div style="${sectionStyle}">
          <div style="${sectionTitle}">💵 Cuenta bancaria 2 — opcional</div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:6px;margin-bottom:6px">
            <div><label style="${labelStyle}">Banco</label>
              <select name="banco_2_nombre" style="${inputStyle}">
                <option value="">— Banco —</option>
                ${['BCP', 'Interbank', 'Scotiabank', 'BBVA', 'Banco de la Nación', 'Banco Pichincha', 'Banbif', 'GNB', 'Mibanco', 'Caja Arequipa', 'Otros'].map(b =>
                  `<option ${p.banco_2_nombre === b ? 'selected' : ''}>${b}</option>`
                ).join('')}
              </select>
            </div>
            <div><label style="${labelStyle}">Moneda</label>
              <select name="banco_2_moneda" style="${inputStyle}">
                <option value="PEN" ${p.banco_2_moneda === 'PEN' ? 'selected' : ''}>Soles (PEN)</option>
                <option value="USD" ${(p.banco_2_moneda || 'USD') === 'USD' ? 'selected' : ''}>Dólares (USD)</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div><label style="${labelStyle}">Nº cuenta</label>
              <input name="banco_2_numero" value="${p.banco_2_numero || ''}" placeholder="194-9876543-1-87" style="${inputStyle}"></div>
            <div><label style="${labelStyle}">CCI</label>
              <input name="banco_2_cci" value="${p.banco_2_cci || ''}" maxlength="20" style="${inputStyle}"></div>
          </div>
        </div>

        <!-- Billetera digital -->
        <div style="${sectionStyle}">
          <div style="${sectionTitle}">📱 Billetera digital (Yape / Plin)</div>
          <input name="billetera_digital" value="${p.billetera_digital || ''}" placeholder="Número de celular: 987654321" style="${inputStyle}">
        </div>

        <button type="submit" style="margin-top:10px;padding:11px;border:none;background:var(--primary-color);color:white;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">
          ${formId === 'form-prov-nuevo' ? '➕ Guardar Proveedor' : '💾 Guardar Cambios'}
        </button>
      </form>
    `;
  }

  // ─── Recolectar valores del form ──────────────────────────
  function collectForm(form) {
    const f = (n) => form.elements[n]?.value || '';
    return {
      tipo: f('tipo'),
      ruc: f('ruc') || undefined,
      dni: f('dni') || undefined,
      razon_social: f('razon_social'),
      contacto: f('contacto') || undefined,
      telefono: f('telefono') || undefined,
      email: f('email') || undefined,
      direccion: f('direccion') || undefined,
      banco_1_nombre: f('banco_1_nombre') || undefined,
      banco_1_numero: f('banco_1_numero') || undefined,
      banco_1_cci:    f('banco_1_cci') || undefined,
      banco_1_moneda: f('banco_1_moneda') || undefined,
      banco_2_nombre: f('banco_2_nombre') || undefined,
      banco_2_numero: f('banco_2_numero') || undefined,
      banco_2_cci:    f('banco_2_cci') || undefined,
      banco_2_moneda: f('banco_2_moneda') || undefined,
      billetera_digital: f('billetera_digital') || undefined,
    };
  }

  // ─── Toggle EMPRESA/PERSONA en un form ──────────────
  function bindTipoToggle(formEl) {
    const radios = formEl.querySelectorAll('input[name=tipo]');
    const empBlock = formEl.querySelector('.doc-empresa');
    const perBlock = formEl.querySelector('.doc-persona');
    radios.forEach(r => {
      r.addEventListener('change', () => {
        const tipo = formEl.querySelector('input[name=tipo]:checked').value;
        if (empBlock) empBlock.style.display = tipo === 'EMPRESA' ? '' : 'none';
        if (perBlock) perBlock.style.display = tipo === 'PERSONA_NATURAL' ? '' : 'none';
        // Estilo visual del botón
        formEl.querySelectorAll('label[style*="border"]').forEach(lab => {
          const inp = lab.querySelector('input[name=tipo]');
          if (inp) {
            const sel = inp.checked;
            lab.style.background = sel ? 'var(--primary-color)' : 'white';
            lab.style.color = sel ? 'white' : '';
            lab.style.borderColor = sel ? 'var(--primary-color)' : '#d1d5db';
          }
        });
      });
    });
  }

  // ─── Setup post-render ──────────────────────────────────
  setTimeout(() => {
    // Filtro por tipo (Todos / Empresa / Persona) — oculta filas sin tocar la BD.
    document.querySelectorAll('.btn-filtro-prov').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.btn-filtro-prov').forEach(b => {
          b.style.background = 'var(--bg-app)';
          b.style.color = '';
        });
        btn.style.background = 'var(--primary-color)';
        btn.style.color = 'white';
        const tipo = btn.dataset.tipo;
        document.querySelectorAll('#tbody-prov tr').forEach(tr => {
          tr.style.display = (!tipo || tr.dataset.tipo === tipo) ? '' : 'none';
        });
      };
    });

    // Botón "+ Nuevo Proveedor" — abre form en modal (mismo patrón que editar).
    const btnNuevo = document.getElementById('btn-prov-nuevo');
    if (btnNuevo) {
      btnNuevo.onclick = () => {
        const overlay = document.createElement('div');
        overlay.id = 'modal-nuevo-prov';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
        overlay.innerHTML = `
          <div style="background:white;border-radius:10px;padding:24px;width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.25)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 14px">
              <h3 style="margin:0;font-size:15px;font-weight:700">➕ Registrar Proveedor</h3>
              <button data-close type="button" title="Cerrar sin guardar" aria-label="Cerrar" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
            </div>
            ${renderProveedorForm({}, 'form-prov-nuevo')}
          </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('[data-close]').onclick = () => overlay.remove();
        const form = overlay.querySelector('#form-prov-nuevo');
        bindTipoToggle(form);
        form.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api.purchases.createProveedor(collectForm(form));
            showSuccess('Proveedor registrado correctamente');
            overlay.remove();
            window.navigate('proveedores');
          } catch (err) {
            showError(err.detalles?.[0] || err.error || 'Error al registrar proveedor');
          }
        };
      };
    }

    window.editarProveedor = (id) => {
      const p = proveedores.find(x => x.id_proveedor === id);
      if (!p) return;
      const overlay = document.createElement('div');
      overlay.id = 'modal-editar-prov';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:white;border-radius:10px;padding:24px;width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.25)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 14px">
            <h3 style="margin:0;font-size:15px;font-weight:700">Editar Proveedor</h3>
            <button onclick="document.getElementById('modal-editar-prov').remove()" title="Cerrar sin guardar cambios" aria-label="Cerrar" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
          </div>
          ${renderProveedorForm(p, 'form-editar-prov')}
        </div>
      `;
      document.body.appendChild(overlay);
      // No cierra por click backdrop (regla del ERP)
      const editForm = document.getElementById('form-editar-prov');
      bindTipoToggle(editForm);
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api.purchases.updateProveedor(id, collectForm(editForm));
          showSuccess('Proveedor actualizado');
          window.navigate('proveedores');
        } catch (err) {
          showError(err.detalles?.[0] || err.error || 'Error al actualizar');
        }
      };
    };

    window.eliminarProveedor = async (id, nombre) => {
      if (!confirm(`¿Eliminar al proveedor "${nombre}"?\nSolo es posible si no tiene compras registradas.`)) return;
      try {
        await api.purchases.deleteProveedor(id);
        showSuccess('Proveedor eliminado');
        window.navigate('proveedores');
      } catch (err) {
        showError(err.error || err.message || 'Error al eliminar');
      }
    };

    window.Proveedores = {
      editarProveedor: window.editarProveedor,
      eliminarProveedor: window.eliminarProveedor,
    };
  }, 100);

  return `
    <header class="header">
      <div>
        <h1>🤝 Gestión de Proveedores</h1>
        <span style="color:var(--text-secondary)">Maestro completo: cuentas bancarias PEN/USD, Yape/Plin, datos de contacto.</span>
      </div>
    </header>

    <div style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-right:4px">Filtrar:</span>
        <button class="btn-filtro-prov" data-tipo="" style="padding:6px 12px;border:1px solid var(--border-light);border-radius:4px;cursor:pointer;font-size:12px;background:var(--primary-color);color:white">Todos · ${proveedores.length}</button>
        <button class="btn-filtro-prov" data-tipo="EMPRESA" style="padding:6px 12px;border:1px solid var(--border-light);border-radius:4px;cursor:pointer;font-size:12px;background:var(--bg-app)">🏢 Empresa · ${proveedores.filter(p => p.tipo !== 'PERSONA_NATURAL').length}</button>
        <button class="btn-filtro-prov" data-tipo="PERSONA" style="padding:6px 12px;border:1px solid var(--border-light);border-radius:4px;cursor:pointer;font-size:12px;background:var(--bg-app)">👤 Persona · ${proveedores.filter(p => p.tipo === 'PERSONA_NATURAL').length}</button>
      </div>
      <button id="btn-prov-nuevo" type="button" title="Registrar un nuevo proveedor (empresa o persona natural)." style="padding:8px 16px;background:#7c3aed;color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">➕ Nuevo Proveedor</button>
    </div>

    <div class="table-container" style="overflow-x:auto">
      <table style="width:100%">
        <thead>
          <tr>
            <th>Tipo / Doc</th>
            <th>Nombre / Contacto</th>
            <th>Teléfono / Email</th>
            <th>Métodos de pago</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody id="tbody-prov">
          ${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px">Sin proveedores registrados — usá el botón "➕ Nuevo Proveedor" arriba.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
};

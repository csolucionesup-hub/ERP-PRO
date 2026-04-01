import { api } from '../services/api.js';

export const Proveedores = async () => {
  let proveedores = [];
  try {
    proveedores = await api.purchases.getProveedores();
    if (!Array.isArray(proveedores)) proveedores = [];
  } catch(err) {
    console.error('[Proveedores] Error cargando datos:', err);
  }

  const inputStyle = 'padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light); width:100%; box-sizing:border-box';

  const rows = proveedores.map(p => `
    <tr>
      <td style="font-size:12px; font-weight:600">${p.ruc || '---'}</td>
      <td><strong>${p.razon_social}</strong>${p.contacto ? `<br><span style="font-size:11px;color:var(--text-secondary)">${p.contacto}</span>` : ''}</td>
      <td style="font-size:12px">${p.telefono || '<span style="color:var(--text-secondary)">---</span>'}</td>
      <td style="font-size:12px">${p.email || '<span style="color:var(--text-secondary)">---</span>'}</td>
      <td style="font-size:12px">${p.direccion || '<span style="color:var(--text-secondary)">---</span>'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn" style="background:var(--info);color:white" onclick="window.editarProveedor(${p.id_proveedor})">Editar</button>
          <button class="action-btn" style="background:#ef4444;color:white" onclick="window.eliminarProveedor(${p.id_proveedor},'${p.razon_social.replace(/'/g, "\\'")}')">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  setTimeout(() => {
    const form = document.getElementById('form-proveedor-nuevo');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await api.purchases.createProveedor({
            ruc: f.ruc.value,
            razon_social: f.razon_social.value,
            contacto: f.contacto.value || undefined,
            telefono: f.telefono.value || undefined,
            email: f.email.value || undefined,
            direccion: f.direccion.value || undefined
          });
          alert('Proveedor registrado correctamente');
          window.location.reload();
        } catch(err) {
          alert('Error: ' + JSON.stringify(err.detalles || err.error || err));
        }
      };
    }

    window.editarProveedor = (id) => {
      const p = proveedores.find(x => x.id_proveedor === id);
      if (!p) return;
      const overlay = document.createElement('div');
      overlay.id = 'modal-editar-prov';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';
      overlay.innerHTML = `
        <div style="background:white;border-radius:10px;padding:28px;width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.25)">
          <h3 style="margin:0 0 20px;font-size:16px;font-weight:700">Editar Proveedor</h3>
          <form id="form-editar-prov" style="display:flex;flex-direction:column;gap:12px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">RUC</label>
                <input name="ruc" value="${p.ruc||''}" required maxlength="11" style="${inputStyle}">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">Razón Social</label>
                <input name="razon_social" value="${p.razon_social||''}" required style="${inputStyle}">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">Contacto</label>
                <input name="contacto" value="${p.contacto||''}" style="${inputStyle}">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary)">Teléfono</label>
                <input name="telefono" value="${p.telefono||''}" style="${inputStyle}">
              </div>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary)">Email</label>
              <input name="email" type="email" value="${p.email||''}" style="${inputStyle}">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary)">Dirección</label>
              <input name="direccion" value="${p.direccion||''}" style="${inputStyle}">
            </div>
            <div style="display:flex;gap:10px;margin-top:6px">
              <button type="submit" style="flex:1;padding:11px;border:none;background:var(--primary-color);color:white;border-radius:var(--radius-sm);cursor:pointer;font-weight:bold">Guardar Cambios</button>
              <button type="button" onclick="document.getElementById('modal-editar-prov').remove()" style="flex:1;padding:11px;border:1px solid var(--border-light);background:white;border-radius:var(--radius-sm);cursor:pointer">Cancelar</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      document.getElementById('form-editar-prov').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await api.purchases.updateProveedor(id, {
            ruc: f.ruc.value,
            razon_social: f.razon_social.value,
            contacto: f.contacto.value || undefined,
            telefono: f.telefono.value || undefined,
            email: f.email.value || undefined,
            direccion: f.direccion.value || undefined
          });
          alert('Proveedor actualizado');
          window.location.reload();
        } catch(err) { alert('Error: ' + JSON.stringify(err.detalles || err.error || err)); }
      };
    };

    window.eliminarProveedor = async (id, nombre) => {
      if (!confirm(`¿Eliminar al proveedor "${nombre}"?\nSolo es posible si no tiene compras registradas.`)) return;
      try {
        await api.purchases.deleteProveedor(id);
        alert('Proveedor eliminado');
        window.location.reload();
      } catch(err) { alert('Error: ' + (err.error || err.message || JSON.stringify(err))); }
    };
  }, 100);

  return `
    <header class="header">
      <div>
        <h1>Gestión de Proveedores</h1>
        <span style="color:var(--text-secondary)">Maestro de proveedores: datos de contacto, RUC y dirección.</span>
      </div>
    </header>

    <div style="display:flex; gap:20px; align-items:flex-start; margin-top:20px;">

      <div class="table-container" style="flex:3; overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>RUC</th>
              <th>Nombre / Contacto</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Dirección</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Sin proveedores registrados</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="card" style="flex:1; min-width:280px;">
        <h3 style="margin-bottom:15px;font-weight:600;font-size:15px">Registrar Proveedor</h3>
        <form id="form-proveedor-nuevo" style="display:flex;flex-direction:column;gap:10px;">
          <input name="ruc" placeholder="RUC (11 dígitos)" required maxlength="11" pattern="[0-9]{11}" style="${inputStyle}">
          <input name="razon_social" placeholder="Razón Social" required style="${inputStyle}">
          <input name="contacto" placeholder="Nombre de contacto" style="${inputStyle}">
          <input name="telefono" placeholder="Teléfono" style="${inputStyle}">
          <input name="email" type="email" placeholder="Email" style="${inputStyle}">
          <input name="direccion" placeholder="Dirección" style="${inputStyle}">
          <button type="submit" style="padding:10px;border:none;background:var(--primary-color);color:white;border-radius:var(--radius-sm);cursor:pointer;font-weight:bold;">Guardar Proveedor</button>
        </form>
      </div>

    </div>
  `;
};

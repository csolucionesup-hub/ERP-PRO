import { api } from '../services/api.js';

const MODULOS = ['GERENCIA', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ALMACEN', 'ADMINISTRACION'];

export const Usuarios = async () => {
  const erpUser = JSON.parse(localStorage.getItem('erp_user') || '{}');
  if (erpUser.rol !== 'GERENTE') {
    return `<div style="padding:40px;text-align:center;color:var(--danger);">Acceso restringido. Solo el GERENTE puede gestionar usuarios.</div>`;
  }

  let usuarios = [];
  try {
    usuarios = await api.usuarios.getUsuarios();
  } catch (e) {
    return `<div style="padding:40px;text-align:center;color:var(--danger);">Error cargando usuarios: ${e.message}</div>`;
  }

  const renderModulos = (mods, rol) => {
    if (rol === 'GERENTE') return '<span style="color:var(--text-secondary);font-size:12px;font-style:italic;">Acceso Total</span>';
    return mods.length
      ? mods.map(m => `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#f0f0f0;font-size:11px;margin:1px;">${m}</span>`).join('')
      : '<span style="color:var(--text-secondary);font-size:12px;">Sin módulos</span>';
  };

  const rows = usuarios.map(u => `
    <tr data-id="${u.id_usuario}">
      <td style="padding:12px 16px;font-weight:500;">${u.nombre}</td>
      <td style="padding:12px 16px;color:var(--text-secondary);font-size:13px;">${u.email}</td>
      <td style="padding:12px 16px;">
        <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${u.rol === 'GERENTE' ? '#000' : '#676767'};color:#fff;">${u.rol}</span>
      </td>
      <td style="padding:12px 16px;">${renderModulos(u.modulos || [], u.rol)}</td>
      <td style="padding:12px 16px;">
        <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${u.activo ? '#05cd99' : '#ee5d50'};color:#fff;">
          ${u.activo ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td style="padding:12px 16px;white-space:nowrap;">
        ${u.rol !== 'GERENTE' ? `
        <button onclick="editarModulos(${u.id_usuario}, '${u.nombre}', ${JSON.stringify(u.modulos || []).replace(/"/g, '&quot;')})"
          style="padding:5px 12px;border:1.5px solid #676767;background:transparent;border-radius:6px;font-size:12px;cursor:pointer;margin-right:6px;">
          Módulos
        </button>` : ''}
        <button onclick="toggleUsuario(${u.id_usuario})"
          style="padding:5px 12px;border:1.5px solid ${u.activo ? '#ee5d50' : '#05cd99'};
            background:transparent;color:${u.activo ? '#ee5d50' : '#05cd99'};
            border-radius:6px;font-size:12px;cursor:pointer;">
          ${u.activo ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    </tr>
  `).join('');

  const html = `
    <header class="header" style="margin-bottom:20px;">
      <div>
        <h1>Gestión de Usuarios</h1>
        <span style="color:var(--text-secondary)">Administración de accesos y módulos del sistema.</span>
      </div>
      <button onclick="abrirModalNuevoUsuario()" style="
        padding:10px 20px;background:#676767;color:#fff;border:none;
        border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;"
        onmouseover="this.style.background='#000'"
        onmouseout="this.style.background='#676767'">
        + Nuevo Usuario
      </button>
    </header>

    <div class="card" style="overflow:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid var(--border-light);text-align:left;">
            <th style="padding:12px 16px;font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Nombre</th>
            <th style="padding:12px 16px;font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Email</th>
            <th style="padding:12px 16px;font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Rol</th>
            <th style="padding:12px 16px;font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Módulos</th>
            <th style="padding:12px 16px;font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Estado</th>
            <th style="padding:12px 16px;font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--text-secondary);">No hay usuarios registrados.</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- Modal Nuevo Usuario -->
    <div id="modal-usuario" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;">
      <div style="background:#fff;border-radius:16px;padding:36px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">
        <h2 style="margin-bottom:20px;font-size:18px;" id="modal-titulo">Nuevo Usuario</h2>
        <form id="form-usuario" style="display:flex;flex-direction:column;gap:14px;">
          <input id="u-nombre" type="text" placeholder="Nombre completo" required
            style="padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;" />
          <input id="u-email" type="email" placeholder="Correo electrónico" required
            style="padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;" />
          <input id="u-password" type="password" placeholder="Contraseña"
            style="padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;" />
          <select id="u-rol" style="padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;">
            <option value="USUARIO">USUARIO</option>
            <option value="GERENTE">GERENTE</option>
          </select>
          <div>
            <p style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--text-secondary);text-transform:uppercase;">Módulos de acceso</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" id="modulos-check">
              ${MODULOS.map(m => `
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" name="modulo" value="${m}" style="cursor:pointer;" />
                  ${m}
                </label>
              `).join('')}
            </div>
          </div>
          <p id="modal-error" style="color:var(--danger);font-size:13px;display:none;"></p>
          <div style="display:flex;gap:10px;margin-top:4px;">
            <button type="submit" id="modal-submit-btn" style="flex:1;padding:11px;background:#676767;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
              Guardar
            </button>
            <button type="button" onclick="cerrarModal()" style="flex:1;padding:11px;background:transparent;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;cursor:pointer;">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Registrar handlers globales después de renderizar
  setTimeout(() => {
    window._modalMode = null; // 'nuevo' | 'modulos'
    window._modalUserId = null;

    window.abrirModalNuevoUsuario = () => {
      window._modalMode = 'nuevo';
      window._modalUserId = null;
      document.getElementById('modal-titulo').textContent = 'Nuevo Usuario';
      const nombreEl = document.getElementById('u-nombre');
      nombreEl.value = '';
      nombreEl.disabled = false;
      const emailEl = document.getElementById('u-email');
      emailEl.value = '';
      emailEl.style.display = '';
      emailEl.required = true;
      const pwdEl = document.getElementById('u-password');
      pwdEl.value = '';
      pwdEl.style.display = '';
      pwdEl.required = true;
      const rolEl = document.getElementById('u-rol');
      rolEl.style.display = '';
      rolEl.value = 'USUARIO';
      document.querySelectorAll('#modulos-check input[type=checkbox]').forEach(cb => cb.checked = false);
      document.getElementById('modal-error').style.display = 'none';
      const m = document.getElementById('modal-usuario');
      m.style.display = 'flex';
    };

    window.editarModulos = (id, nombre, modulos) => {
      window._modalMode = 'modulos';
      window._modalUserId = id;
      document.getElementById('modal-titulo').textContent = `Módulos — ${nombre}`;
      document.getElementById('u-nombre').value = nombre;
      document.getElementById('u-nombre').disabled = true;
      // ⚠ los inputs ocultos siguen validándose por HTML5: si están 'required'
      // y vacíos, el botón submit falla silenciosamente. Quitamos required al
      // ocultarlos en modo módulos.
      const emailEl = document.getElementById('u-email');
      emailEl.style.display = 'none';
      emailEl.required = false;
      const pwdEl = document.getElementById('u-password');
      pwdEl.style.display = 'none';
      pwdEl.required = false;
      document.getElementById('u-rol').style.display = 'none';
      document.querySelectorAll('#modulos-check input[type=checkbox]').forEach(cb => {
        cb.checked = modulos.includes(cb.value);
      });
      document.getElementById('modal-error').style.display = 'none';
      const m = document.getElementById('modal-usuario');
      m.style.display = 'flex';
    };

    window.cerrarModal = () => {
      document.getElementById('modal-usuario').style.display = 'none';
      document.getElementById('u-nombre').disabled = false;
      document.getElementById('u-email').style.display = '';
      document.getElementById('u-password').style.display = '';
      document.getElementById('u-password').required = true;
      document.getElementById('u-rol').style.display = '';
    };

    window.toggleUsuario = async (id) => {
      try {
        await api.usuarios.toggleActivo(id);
        window.location.hash = 'dashboard';
        setTimeout(() => { window.location.hash = 'usuarios'; }, 50);
      } catch (e) {
        alert('Error: ' + e.message);
      }
    };

    document.getElementById('form-usuario').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('modal-submit-btn');
      const errEl = document.getElementById('modal-error');
      const modulos = [...document.querySelectorAll('#modulos-check input[type=checkbox]:checked')].map(cb => cb.value);
      btn.disabled = true;
      errEl.style.display = 'none';

      try {
        if (window._modalMode === 'modulos') {
          await api.usuarios.asignarModulos(window._modalUserId, modulos);
        } else {
          const data = {
            nombre: document.getElementById('u-nombre').value.trim(),
            email: document.getElementById('u-email').value.trim(),
            password: document.getElementById('u-password').value,
            rol: document.getElementById('u-rol').value,
            modulos
          };
          await api.usuarios.createUsuario(data);
        }
        window.cerrarModal();
        window.location.hash = 'dashboard';
        setTimeout(() => { window.location.hash = 'usuarios'; }, 50);
      } catch (err) {
        errEl.textContent = err.message || 'Error al guardar.';
        errEl.style.display = 'block';
        btn.disabled = false;
      }
    });

    // Cerrar modal al hacer click fuera
    document.getElementById('modal-usuario').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-usuario')) window.cerrarModal();
    });
  }, 100);

  return html;
};

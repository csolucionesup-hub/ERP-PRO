import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';

const MODULOS = ['GERENCIA', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ALMACEN', 'ADMINISTRACION'];
const ROLES = ['USUARIO', 'CONTADOR', 'GERENTE'];

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

  const rolColor = (rol) => {
    if (rol === 'GERENTE')  return '#000';
    if (rol === 'CONTADOR') return '#0ea5e9';
    return '#676767';
  };

  const rows = usuarios.map(u => `
    <tr data-id="${u.id_usuario}">
      <td style="padding:12px 16px;font-weight:500;">${u.nombre}</td>
      <td style="padding:12px 16px;color:var(--text-secondary);font-size:13px;">${u.email}</td>
      <td style="padding:12px 16px;">
        <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${rolColor(u.rol)};color:#fff;">${u.rol}</span>
      </td>
      <td style="padding:12px 16px;">${renderModulos(u.modulos || [], u.rol)}</td>
      <td style="padding:12px 16px;">
        <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${u.activo ? '#05cd99' : '#ee5d50'};color:#fff;">
          ${u.activo ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td style="padding:12px 16px;white-space:nowrap;">
        ${u.id_usuario !== erpUser.id_usuario ? `
        <button onclick='editarUsuario(${JSON.stringify(u).replace(/"/g, "&quot;")})'
          style="padding:5px 12px;border:1.5px solid #676767;background:transparent;border-radius:6px;font-size:12px;cursor:pointer;margin-right:6px;">
          ✎ Editar
        </button>` : `
        <span style="font-size:11px;color:var(--text-secondary);font-style:italic;margin-right:8px;">(es vos)</span>`}
        ${u.id_usuario !== erpUser.id_usuario ? `
        <button onclick="toggleUsuario(${u.id_usuario})"
          style="padding:5px 12px;border:1.5px solid ${u.activo ? '#ee5d50' : '#05cd99'};
            background:transparent;color:${u.activo ? '#ee5d50' : '#05cd99'};
            border-radius:6px;font-size:12px;cursor:pointer;">
          ${u.activo ? 'Desactivar' : 'Activar'}
        </button>` : ''}
      </td>
    </tr>
  `).join('');

  const html = `
    <header class="header" style="margin-bottom:20px;">
      <div>
        <h1>Gestión de Usuarios</h1>
        <span style="color:var(--text-secondary)">Administración de accesos, roles y módulos del sistema.</span>
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
      <table class="table-container" style="width:100%;border-collapse:collapse;">
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

    <!-- Modal Editar / Nuevo Usuario -->
    <div id="modal-usuario" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;">
      <div style="background:#fff;border-radius:16px;padding:32px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">
        <h2 style="margin-bottom:18px;font-size:18px;" id="modal-titulo">Nuevo Usuario</h2>
        <form id="form-usuario" style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="font-size:12px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:4px">Nombre completo *</label>
            <input id="u-nombre" type="text" placeholder="Ej. Juan Pérez" required
              style="width:100%;padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:4px">Email *</label>
            <input id="u-email" type="email" placeholder="usuario@empresa.com" required
              style="width:100%;padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;box-sizing:border-box" />
          </div>
          <div id="u-password-wrap">
            <label style="font-size:12px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:4px">
              <span id="u-password-label">Contraseña *</span>
              <span id="u-password-hint" style="font-style:italic;font-weight:normal;color:var(--text-secondary);font-size:11px;display:none">— dejá vacío para no cambiar la actual</span>
            </label>
            <input id="u-password" type="password" placeholder="Mínimo 6 caracteres"
              style="width:100%;padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:4px">Rol</label>
            <select id="u-rol" style="width:100%;padding:10px 14px;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;background:#fff">
              ${ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            <p id="u-rol-help" style="font-size:11px;color:var(--text-secondary);margin:4px 0 0;line-height:1.4">
              <strong>GERENTE:</strong> acceso total · <strong>CONTADOR:</strong> + Contabilidad · <strong>USUARIO:</strong> solo módulos asignados
            </p>
          </div>
          <div id="u-modulos-wrap">
            <label style="font-size:12px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:6px">Módulos de acceso</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;" id="modulos-check">
              ${MODULOS.map(m => `
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:6px 10px;border:1px solid var(--border-light);border-radius:6px;">
                  <input type="checkbox" name="modulo" value="${m}" style="cursor:pointer;" />
                  ${m}
                </label>
              `).join('')}
            </div>
            <p style="font-size:11px;color:var(--text-secondary);margin:4px 0 0">Si el rol es GERENTE, los módulos se ignoran (tiene todo).</p>
          </div>
          <p id="modal-error" style="color:var(--danger);font-size:13px;display:none;margin:0"></p>
          <div style="display:flex;gap:10px;margin-top:6px;">
            <button type="submit" id="modal-submit-btn" style="flex:1;padding:11px;background:#676767;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
              Guardar
            </button>
            <button type="button" onclick="cerrarModal()" style="flex:1;padding:11px;background:transparent;border:1.5px solid var(--border-light);border-radius:8px;font-size:14px;cursor:pointer;">
              Cancelar
            </button>
          </div>
          <button type="button" id="btn-reset-password" style="display:none;margin-top:6px;padding:10px;background:transparent;color:#dc2626;border:1.5px dashed #dc2626;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
            🔑 Resetear contraseña
          </button>
        </form>
      </div>
    </div>
  `;

  setTimeout(() => {
    const erpUserId = erpUser.id_usuario;

    // Estado del modal
    window._modalMode = null;       // 'nuevo' | 'editar'
    window._modalUserId = null;
    window._modalUserData = null;

    function setModoNuevo() {
      window._modalMode = 'nuevo';
      window._modalUserId = null;
      window._modalUserData = null;
      document.getElementById('modal-titulo').textContent = '+ Nuevo Usuario';
      document.getElementById('u-nombre').value = '';
      document.getElementById('u-nombre').disabled = false;
      document.getElementById('u-email').value = '';
      document.getElementById('u-email').disabled = false;
      document.getElementById('u-password').value = '';
      document.getElementById('u-password').required = true;
      document.getElementById('u-password-label').textContent = 'Contraseña *';
      document.getElementById('u-password-hint').style.display = 'none';
      document.getElementById('u-rol').value = 'USUARIO';
      document.getElementById('u-rol').disabled = false;
      document.querySelectorAll('#modulos-check input[type=checkbox]').forEach(cb => cb.checked = false);
      document.getElementById('btn-reset-password').style.display = 'none';
      document.getElementById('modal-error').style.display = 'none';
    }

    function setModoEditar(u) {
      window._modalMode = 'editar';
      window._modalUserId = u.id_usuario;
      window._modalUserData = u;
      document.getElementById('modal-titulo').textContent = `✎ Editar — ${u.nombre}`;
      document.getElementById('u-nombre').value = u.nombre || '';
      document.getElementById('u-nombre').disabled = false;
      document.getElementById('u-email').value = u.email || '';
      document.getElementById('u-email').disabled = false;
      document.getElementById('u-password').value = '';
      document.getElementById('u-password').required = false;
      document.getElementById('u-password-label').textContent = 'Contraseña';
      document.getElementById('u-password-hint').style.display = '';
      document.getElementById('u-rol').value = u.rol || 'USUARIO';
      // El GERENTE no puede demoterse a sí mismo
      document.getElementById('u-rol').disabled = (u.id_usuario === erpUserId);
      const userMods = u.modulos || [];
      document.querySelectorAll('#modulos-check input[type=checkbox]').forEach(cb => {
        cb.checked = userMods.includes(cb.value);
      });
      document.getElementById('btn-reset-password').style.display = '';
      document.getElementById('modal-error').style.display = 'none';
    }

    window.abrirModalNuevoUsuario = () => {
      setModoNuevo();
      document.getElementById('modal-usuario').style.display = 'flex';
    };

    window.editarUsuario = (u) => {
      setModoEditar(u);
      document.getElementById('modal-usuario').style.display = 'flex';
    };

    window.cerrarModal = () => {
      document.getElementById('modal-usuario').style.display = 'none';
    };

    window.toggleUsuario = async (id) => {
      try {
        await api.usuarios.toggleActivo(id);
        showSuccess('Estado del usuario actualizado');
        recargar();
      } catch (e) {
        showError('Error: ' + e.message);
      }
    };

    function recargar() {
      window.location.hash = 'dashboard';
      setTimeout(() => { window.location.hash = 'usuarios'; }, 50);
    }

    document.getElementById('form-usuario').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('modal-submit-btn');
      const errEl = document.getElementById('modal-error');
      btn.disabled = true;
      errEl.style.display = 'none';

      const modulos = [...document.querySelectorAll('#modulos-check input[type=checkbox]:checked')].map(cb => cb.value);
      const nombre   = document.getElementById('u-nombre').value.trim();
      const email    = document.getElementById('u-email').value.trim();
      const password = document.getElementById('u-password').value;
      const rol      = document.getElementById('u-rol').value;

      try {
        if (window._modalMode === 'nuevo') {
          await api.usuarios.createUsuario({ nombre, email, password, rol, modulos });
          showSuccess('Usuario creado');
        } else {
          // Editar: actualizar datos + módulos
          await api.usuarios.updateUsuario(window._modalUserId, { nombre, email, rol, modulos });
          // Si pusieron contraseña nueva, resetear también
          if (password && password.length > 0) {
            await api.usuarios.resetPassword(window._modalUserId, password);
          }
          showSuccess('Usuario actualizado');
        }
        cerrarModal();
        recargar();
      } catch (err) {
        errEl.textContent = err.message || 'Error al guardar.';
        errEl.style.display = 'block';
        btn.disabled = false;
      }
    });

    // Botón "Resetear contraseña" — pide nueva clave y la setea sin tocar otros campos
    document.getElementById('btn-reset-password').addEventListener('click', async () => {
      if (window._modalMode !== 'editar') return;
      const nueva = prompt('Nueva contraseña (mínimo 6 caracteres):');
      if (!nueva) return;
      if (nueva.length < 6) { showError('La contraseña debe tener al menos 6 caracteres.'); return; }
      try {
        await api.usuarios.resetPassword(window._modalUserId, nueva);
        showSuccess('Contraseña actualizada. Avisá al usuario que use la nueva.');
      } catch (e) {
        showError('Error: ' + e.message);
      }
    });

    // Cerrar modal al hacer click fuera del cuadro
    document.getElementById('modal-usuario').addEventListener('click', (e) => {
      if (e.target.id === 'modal-usuario') cerrarModal();
    });
  }, 80);

  return html;
};

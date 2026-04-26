/**
 * ui.js — Notificaciones centralizadas ERP Metal Engineers
 * Reemplaza alert() con toasts no bloqueantes.
 */

/**
 * Muestra un toast de notificación temporal.
 * @param {string} msg   - Mensaje a mostrar
 * @param {'success'|'error'|'info'} type - Tipo de notificación (default: 'success')
 * @param {number} duration - Duración en ms (default: 3500)
 */
export function showToast(msg, type = 'success', duration = 3500) {
  // Contenedor persistente
  let container = document.getElementById('erp-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'erp-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `erp-toast erp-toast--${type}`;

  // Ícono según tipo
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span class="erp-toast__icon">${icons[type] ?? '•'}</span>
                     <span class="erp-toast__msg">${msg}</span>`;

  container.appendChild(toast);

  // Animación entrada
  requestAnimationFrame(() => toast.classList.add('erp-toast--show'));

  // Auto-cierre
  setTimeout(() => {
    toast.classList.remove('erp-toast--show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

/** Alias semántico para errores */
export function showError(msg) { return showToast(msg, 'error'); }

/** Alias semántico para éxito */
export function showSuccess(msg) { return showToast(msg, 'success'); }

/**
 * HTML de banner para mostrar cuando ConfiguracionEmpresa aún no existe.
 * Devuelve markup que el caller puede inyectar dentro de cualquier panel.
 * @param {string} contexto - Texto corto que describe qué necesitaba el módulo
 *                            (ej. "los libros PLE", "crear órdenes de compra").
 */
export function setupPendienteBanner(contexto = 'esta sección') {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); }
    catch { return {}; }
  })();
  const esGerente = user.rol === 'GERENTE';

  const cta = esGerente
    ? `<button onclick="window.location.hash='configuracion'"
              style="margin-top:14px;padding:10px 20px;background:var(--primary-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">
         🚀 Ir al wizard de configuración
       </button>`
    : `<p style="margin-top:14px;font-size:12px;color:var(--text-secondary)">
         Pídele al <strong>Gerente</strong> que complete la configuración inicial desde
         <em>⚙️ Configuración</em>.
       </p>`;

  return `
    <div class="card" style="max-width:560px;margin:30px auto;padding:28px;text-align:center;border:1px dashed #d97706;background:#fffbeb">
      <div style="font-size:42px;margin-bottom:8px">🛠️</div>
      <h3 style="margin:0 0 6px;font-size:16px">Configuración inicial pendiente</h3>
      <p style="margin:0;color:var(--text-secondary);font-size:13px;line-height:1.5">
        Para usar ${contexto} necesitamos primero los datos de la empresa
        (RUC, razón social, régimen tributario).
      </p>
      ${cta}
    </div>
  `;
}

/** Atajo para detectar si un error vino del flag global de config vacía */
export function esErrorConfigVacia(err) {
  return err?.code === 'CONFIG_VACIA' ||
         (typeof err?.message === 'string' && err.message.includes('ConfiguracionEmpresa vacía'));
}

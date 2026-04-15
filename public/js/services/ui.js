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

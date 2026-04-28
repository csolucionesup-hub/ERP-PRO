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

/**
 * Genera un icono ⓘ con tooltip explicativo. Estilizado por la clase
 * .tip de main.css. Funciona on hover en desktop y tap en mobile (gestionado
 * por un click handler global en app.js).
 *
 * @param {string} texto — Mensaje explicativo (puede tener saltos de línea \n).
 * @returns {string} HTML del icono.
 *
 * Ejemplo:
 *   import { tip } from '../services/ui.js';
 *   `<th>N° piezas ${tip('Cuántas piezas idénticas tiene cada conjunto.')}</th>`
 */
export function tip(texto) {
  // Escape de comillas dobles y < > para meter en atributo data-tip
  const safe = String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<span class="tip" tabindex="0" role="img" aria-label="Ayuda" data-tip="${safe}">ⓘ</span>`;
}

/**
 * Genera el HTML de un icono Lucide del sprite local /lib/icons.svg
 *
 * Uso:
 *   import { icon } from '../services/ui.js';
 *   `<button>${icon('plus', { size: 14 })} Nueva cotización</button>`
 *   `<a class="nav-item">${icon('bell', { label: 'Alertas' })} Alertas</a>`
 *
 * @param {string} name — id del símbolo (ej. 'plus', 'layout-dashboard', 'bell')
 * @param {object} [opts]
 *   @param {number} [opts.size=16]    — tamaño en px (aplica a width y height)
 *   @param {string} [opts.cls='ico']  — clase CSS adicional/override
 *   @param {string} [opts.label]      — aria-label si el icono comunica info
 *   @param {number} [opts.stroke]     — stroke-width override (default: 2)
 * @returns {string} HTML del <svg>
 */
export function icon(name, opts = {}) {
  const { size = 16, cls = 'ico', label, stroke } = opts;
  const safeName = String(name || '').replace(/[^\w-]/g, '');
  const aria = label
    ? `role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true" focusable="false"';
  const strokeAttr = stroke != null ? ` stroke-width="${Number(stroke)}"` : '';
  const w = Number(size) || 16;
  return `<svg class="${cls}" width="${w}" height="${w}" ${aria}${strokeAttr}><use href="/lib/icons.svg#${safeName}"></use></svg>`;
}

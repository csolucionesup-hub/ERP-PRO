/**
 * EmptyState — Estado vacío diseñado (Enterprise)
 *
 * Reemplazo del patrón legacy "Sin datos" plano. Muestra icono + título +
 * descripción + acción opcional. Para tablas/listas/dashboards vacíos.
 *
 * Uso:
 *   import { emptyState } from '../components/EmptyState.js';
 *
 *   tbody.innerHTML = `<tr><td colspan="6">${emptyState({
 *     icon: 'package',
 *     title: 'No hay órdenes de compra',
 *     text: 'Cuando crees tu primera OC, aparecerá acá.',
 *     action: { label: 'Nueva OC', onClick: 'window.OrdenesCompra.nueva()', icon: 'plus' }
 *   })}</td></tr>`;
 */

import { icon as lucideIcon } from '../services/ui.js';

/**
 * @param {object} opts
 *   @param {string} [opts.icon='inbox']   — icono Lucide del sprite
 *   @param {string} opts.title             — título principal
 *   @param {string} [opts.text]            — descripción contextual
 *   @param {object} [opts.action]          — { label, onClick, icon, variant }
 *     @param {string} action.label
 *     @param {string} action.onClick       — JS string (ej. "window.foo()")
 *     @param {string} [action.icon]        — icono Lucide opcional
 *     @param {'primary'|'secondary'} [action.variant='primary']
 *   @param {string} [opts.cls='']          — clase adicional
 * @returns {string} HTML
 */
export function emptyState({ icon = 'inbox', title, text = '', action = null, cls = '' } = {}) {
  const actionHTML = action
    ? `<button
        type="button"
        onclick="${action.onClick || ''}"
        class="${action.variant === 'secondary' ? 'app-btn' : 'app-btn-primary'}"
        style="margin-top:14px">
        ${action.icon ? lucideIcon(action.icon, { size: 14 }) : ''}
        <span>${action.label}</span>
      </button>`
    : '';

  return `
    <div class="app-empty ${cls}">
      <div class="app-empty__icon">${lucideIcon(icon, { size: 32 })}</div>
      <h3 class="app-empty__title">${title}</h3>
      ${text ? `<p class="app-empty__text">${text}</p>` : ''}
      ${actionHTML}
    </div>
  `;
}

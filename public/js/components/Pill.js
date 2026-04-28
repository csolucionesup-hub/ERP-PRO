/**
 * Pill — badge/chip de estado con variantes semánticas (Enterprise)
 *
 * Uso:
 *   import { pill } from '../components/Pill.js';
 *
 *   pill('Aprobada', 'success')
 *   pill('Pendiente', 'warning')
 *   pill('Anulada', 'neutral', { dot: false })
 *   pill('15 días', 'danger', { icon: 'clock' })
 *
 * Variantes: 'success' | 'danger' | 'warning' | 'info' | 'neutral'
 *
 * Mapping rápido para estados comunes del ERP:
 *   APROBADA / COBRADO / PAGADO / TERMINADA → success
 *   ANULADA / RECHAZADA                     → neutral (con tachado opcional)
 *   PENDIENTE / EN_PROCESO / A_ESPERA       → warning
 *   ENVIADA / PARCIAL                       → info
 *   NO_APROBADA / VENCIDA                   → danger
 */

import { icon as lucideIcon } from '../services/ui.js';

const STATE_TO_VARIANT = {
  // Cotizaciones
  APROBADA:           'success',
  TERMINADA:          'success',
  ENVIADA:            'info',
  EN_PROCESO:         'warning',
  A_ESPERA_RESPUESTA: 'warning',
  NO_APROBADA:        'danger',
  RECHAZADA:          'neutral',
  ANULADA:            'neutral',

  // Cobranzas / Compras / OC
  COBRADO:    'success',
  PAGADO:     'success',
  PARCIAL:    'info',
  PENDIENTE:  'warning',
  ANULADO:    'neutral',
  VENCIDO:    'danger',

  // Servicios
  TERMINADO:          'success',
  EN_EJECUCION:       'info',
  NO_INICIADO:        'warning',
  TERMINADO_CON_DEUDA:'warning',

  // Préstamos
  ACTIVO:   'info',
  CUOTA_AL_DIA: 'success',
  EN_MORA:   'danger',
};

/**
 * @param {string} text — texto del pill
 * @param {string} [variantOrState] — variante semántica directa, o estado del ERP que se mapea
 * @param {object} [opts]
 *   @param {boolean} [opts.dot=true] — mostrar el punto decorativo
 *   @param {string}  [opts.icon]      — nombre Lucide del sprite (reemplaza el dot)
 *   @param {boolean} [opts.strike]    — texto con tachado (útil para anulados)
 *   @param {string}  [opts.cls=''] — clase adicional
 * @returns {string} HTML del pill
 */
export function pill(text, variantOrState = 'neutral', opts = {}) {
  const { dot = true, icon = '', strike = false, cls = '' } = opts;

  // Mapear estado a variante si vino un estado del ERP
  const upper = String(variantOrState).toUpperCase();
  const variant = STATE_TO_VARIANT[upper] || variantOrState || 'neutral';

  const classes = [
    'app-pill',
    `app-pill--${variant}`,
    !dot && !icon ? 'no-dot' : '',
    cls,
  ].filter(Boolean).join(' ');

  const iconHTML = icon
    ? lucideIcon(icon, { size: 11 })
    : '';

  // Si el icon viene, sobrescribe el dot. Combinamos con CSS class no-dot para esconder el ::before
  const wrapperStyle = strike ? ' style="text-decoration:line-through"' : '';

  return `<span class="${classes}"${wrapperStyle}>${iconHTML}${text}</span>`;
}

/**
 * Helper específico para estados de cotización (uppercase con underscores → label legible)
 */
export function pillCotizacionEstado(estado) {
  const labels = {
    EN_PROCESO:         'En proceso',
    ENVIADA:            'Enviada',
    APROBADA:           'Aprobada',
    NO_APROBADA:        'No aprobada',
    RECHAZADA:          'Rechazada',
    TERMINADA:          'Terminada',
    A_ESPERA_RESPUESTA: 'En espera',
    ANULADA:            'Anulada',
  };
  return pill(
    labels[estado] || estado,
    estado,
    { strike: estado === 'ANULADA' }
  );
}

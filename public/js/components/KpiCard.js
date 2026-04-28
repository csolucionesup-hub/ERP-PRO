/**
 * KpiCard v2 — tarjeta KPI Enterprise (label uppercase + valor tabular + delta + icono)
 *
 * Uso:
 *   import { kpiCard, kpiGrid } from '../components/KpiCard.js';
 *
 *   el.innerHTML = kpiCard({
 *     label: 'Ventas del mes',
 *     value: 'S/ 120,000',
 *     change: '+25%',
 *     changeType: 'positive',     // 'positive' | 'negative' | 'neutral'
 *     icon: 'dollar-sign',         // Nombre Lucide del sprite (preferido)
 *     // o legacy: icon: '📈'      // Emoji también funciona (compat)
 *     accent: 'success',           // 'success' | 'danger' | 'warning' | 'info' | 'primary'
 *     onClick: "navigate('/finanzas/dashboard')"
 *   });
 *
 *   el.innerHTML = kpiGrid([
 *     { label:'Caja', value:'S/ 85K', change:'+15%', changeType:'positive', icon:'dollar-sign' },
 *     { label:'CxC',  value:'S/ 42K', change:'-8%',  changeType:'negative', icon:'trending-down' },
 *   ], 4);
 *
 * API legacy compatible: change, changeType, icon (emoji o lucide), onClick.
 */

import { icon as lucideIcon } from '../services/ui.js';

/* Heurística simple: si "icon" es una palabra alfanumérica con guiones (ej. "dollar-sign"),
 * lo tratamos como nombre del sprite Lucide. Si tiene caracteres no-ASCII (emoji) o es muy
 * corto/largo, lo dejamos como texto literal. */
function renderIcon(iconValue) {
  if (!iconValue) return '';
  const isLucideName = typeof iconValue === 'string'
    && /^[a-z][a-z0-9-]{1,30}$/.test(iconValue);
  if (isLucideName) {
    return `<span class="kpi-icon">${lucideIcon(iconValue, { size: 16 })}</span>`;
  }
  // Emoji o texto literal (legacy)
  return `<span class="kpi-icon">${iconValue}</span>`;
}

export function kpiCard({
  label,
  value,
  change,
  changeType = 'neutral',
  icon = '',
  accent = '',
  onClick = '',
}) {
  const clickAttr = onClick
    ? `onclick="${onClick}" role="button" tabindex="0"`
    : '';

  const accentClass = accent ? ` accent-${accent}` : '';
  const changeClass = change ? ` ${changeType}` : '';

  const arrow = change && changeType === 'positive' ? '▲ ' :
                change && changeType === 'negative' ? '▼ ' : '';

  return `
    <div class="kpi-card${accentClass}" ${clickAttr}>
      <div class="kpi-header">
        <span class="kpi-label">${label}</span>
        ${renderIcon(icon)}
      </div>
      <div class="kpi-value">${value}</div>
      ${change ? `<div class="kpi-change${changeClass}">${arrow}${change}</div>` : ''}
    </div>
  `;
}

export function kpiGrid(cards, columns = 0) {
  const colsAttr = columns ? ` data-cols="${columns}"` : '';
  return `<div class="kpi-grid"${colsAttr}>
    ${cards.map(kpiCard).join('')}
  </div>`;
}

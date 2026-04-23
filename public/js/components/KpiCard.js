/**
 * KpiCard — tarjeta KPI reutilizable con valor, variación e icono.
 *
 * Uso:
 *   import { kpiCard, kpiGrid } from '../components/KpiCard.js';
 *
 *   el.innerHTML = kpiCard({
 *     label: 'Ventas del mes',
 *     value: 'S/ 120,000',
 *     change: '+25%',
 *     changeType: 'positive',  // 'positive' | 'negative' | 'neutral'
 *     icon: '📈',
 *     onClick: "navigate('/finanzas/dashboard')"
 *   });
 *
 *   // O una grilla completa:
 *   el.innerHTML = kpiGrid([
 *     { label:'Caja', value:'S/ 85K', change:'+15%', changeType:'positive', icon:'💰' },
 *     { label:'CxC', value:'S/ 42K', change:'-8%', changeType:'positive', icon:'📊' },
 *   ], 4);
 */

export function kpiCard({ label, value, change, changeType = 'neutral', icon = '', onClick = '' }) {
  const color = {
    positive: 'var(--success, #16a34a)',
    negative: 'var(--danger, #dc2626)',
    neutral:  'var(--text-secondary, #666)',
  }[changeType] || 'var(--text-secondary, #666)';

  const clickAttr = onClick
    ? `onclick="${onClick}" role="button" tabindex="0" style="cursor:pointer"`
    : '';

  return `
    <div class="kpi-card" ${clickAttr}>
      <div class="kpi-header">
        ${icon ? `<span class="kpi-icon">${icon}</span>` : ''}
        <span class="kpi-label">${label}</span>
      </div>
      <div class="kpi-value">${value}</div>
      ${change ? `<div class="kpi-change" style="color:${color}">${change}</div>` : ''}
    </div>
  `;
}

export function kpiGrid(cards, columns = 4) {
  return `<div class="kpi-grid" style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:14px;margin-bottom:20px">
    ${cards.map(kpiCard).join('')}
  </div>`;
}

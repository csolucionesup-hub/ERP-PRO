/**
 * charts.js — wrapper ligero sobre Chart.js con presets Metal Engineers.
 *
 * Requisitos:
 *   <script src="/lib/chart.min.js"></script>  debe estar cargado en index.html
 *
 * Presets de color alineados con branding Metal Engineers (main.css):
 *   primary   #676767   — gris barra
 *   success   #16a34a   — ingresos / positivo
 *   danger    #dc2626   — egresos / negativo
 *   warning   #f59e0b   — pendiente
 *   info      #3b82f6   — neutro
 *
 * Uso típico:
 *   import { lineChart, barChart, donutChart, chartColors } from '../components/charts.js';
 *   lineChart('#mi-canvas', [{mes:'Ene', valor:1000}, ...], { label:'Ventas' });
 */

export const chartColors = {
  primary:   '#676767',
  secondary: '#a5a5a6',
  success:   '#16a34a',
  danger:    '#dc2626',
  warning:   '#f59e0b',
  info:      '#3b82f6',
  black:     '#000000',
  neutral:   '#94a3b8',
};

function getChart() {
  if (typeof window === 'undefined' || !window.Chart) {
    throw new Error('Chart.js no está cargado. Incluye <script src="/lib/chart.min.js"></script> en index.html antes de usar charts.js');
  }
  return window.Chart;
}

function resolveCanvas(target) {
  if (!target) throw new Error('charts.js: target requerido');
  if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (!el) throw new Error(`charts.js: selector no encontrado: ${target}`);
    return el;
  }
  return target;
}

/**
 * Línea con tendencia.
 * datos: [{mes: 'Ene', valor: 1000}, ...] o [{label:..., valor:...}]
 */
export function lineChart(target, datos, opts = {}) {
  const Chart = getChart();
  const ctx = resolveCanvas(target);
  const color = opts.color || chartColors.primary;
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: datos.map(d => d.mes ?? d.label),
      datasets: [{
        label: opts.label || 'Valor',
        data:  datos.map(d => Number(d.valor) || 0),
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: !!opts.label, position: 'top' },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: { y: { beginAtZero: true, ticks: { callback: v => opts.currency ? `S/ ${v.toLocaleString()}` : v } } },
    },
  });
}

/**
 * Barras verticales simples.
 * datos: [{label:'DCC', valor:45000}, ...]
 */
export function barChart(target, datos, opts = {}) {
  const Chart = getChart();
  const ctx = resolveCanvas(target);
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: datos.map(d => d.label),
      datasets: [{
        label: opts.label || '',
        data:  datos.map(d => Number(d.valor) || 0),
        backgroundColor: opts.colors || datos.map(() => chartColors.primary),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: !!opts.label } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

/**
 * Donut / pie chart.
 */
export function donutChart(target, datos, opts = {}) {
  const Chart = getChart();
  const ctx = resolveCanvas(target);
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: datos.map(d => d.label),
      datasets: [{
        data: datos.map(d => Number(d.valor) || 0),
        backgroundColor: opts.colors || [
          chartColors.primary, chartColors.success, chartColors.info,
          chartColors.warning, chartColors.danger, chartColors.secondary, chartColors.neutral
        ],
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } },
      cutout: '60%',
    },
  });
}

/**
 * Barras apiladas — útil para distribución por mes+categoría.
 * labels: ['Ene','Feb',...]
 * series: [{label:'Servicio', datos:[10,20,...], color:'#..'}, ...]
 */
export function stackedBarChart(target, labels, series, opts = {}) {
  const Chart = getChart();
  const ctx = resolveCanvas(target);
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map(s => ({
        label: s.label,
        data: s.datos,
        backgroundColor: s.color || chartColors.primary,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });
}

/**
 * Destruye un chart de forma segura (útil al re-renderizar pantallas).
 */
export function destroyChart(chart) {
  try { chart?.destroy?.(); } catch { /* noop */ }
}

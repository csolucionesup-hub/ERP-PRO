# Componentes Vanilla JS — ERP-PRO

## Badge de Estado

```css
.badge { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
.badge-pendiente { background: #fef3c7; color: #92400e; }
.badge-parcial    { background: #dbeafe; color: #1e40af; }
.badge-cobrado, .badge-pagado { background: #d1fae5; color: #065f46; }
.badge-anulado    { background: #fee2e2; color: #991b1b; }
```

```javascript
// Uso en template string
`<span class="badge badge-${record.estado.toLowerCase()}">${record.estado}</span>`
```

## Input de Moneda con Selector PEN/USD

```html
<div class="currency-group">
  <select name="moneda" onchange="toggleTipoCambio(this.value)">
    <option value="PEN">S/ PEN</option>
    <option value="USD">$ USD</option>
  </select>
  <input type="number" name="monto_base" step="0.01" min="0" required>
  <div id="tc-row" style="display:none">
    <label>T/C:</label>
    <input type="number" name="tipo_cambio" id="tipo_cambio_input" step="0.0001" value="1">
  </div>
</div>
```

## Formatters Estándar

```javascript
const fmt = {
  money: (n, cur = 'PEN') => `${cur === 'USD' ? '$' : 'S/'} ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`,
  date:  (s) => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-PE') : '-',
  pct:   (n) => `${Number(n || 0).toFixed(2)}%`,
  num:   (n) => Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })
};
```

## Stat Cards del Dashboard

```html
<div class="stats-grid">
  <div class="stat-card" id="card-ingresos">
    <div class="stat-icon">💰</div>
    <div class="stat-value" id="val-ingresos">-</div>
    <div class="stat-label">Ingresos del Mes</div>
  </div>
  <!-- ... -->
</div>
```

```javascript
// Popular stat card
document.getElementById('val-ingresos').textContent = fmt.money(data.ingresos_mes);
```

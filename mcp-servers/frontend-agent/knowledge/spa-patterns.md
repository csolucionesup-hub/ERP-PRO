# Patrones SPA Vanilla JS — ERP-PRO

## Arquitectura

El frontend es una SPA Vanilla JS sin framework. Archivos en `public/`:
- `index.html` — shell HTML único
- `app/pages/*.html` — fragmentos de página (cargados dinámicamente)
- `app/components/` — componentes reutilizables
- `app/lib/` — utilidades (router, fetch wrapper, formatters)

## Navegación SPA

```javascript
// Router basado en hash o data-page
function navigateTo(page) {
  document.querySelectorAll('.module-page').forEach(p => p.style.display = 'none');
  document.getElementById(`${page}-page`).style.display = 'block';
  loadPageData(page);
}

function getCurrentPage() {
  return window.location.hash.replace('#', '') || 'dashboard';
}
```

## Patrón Fetch al API

```javascript
// Siempre async/await, manejo de errores centralizado
async function apiCall(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error de red' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
```

## Patrón Tabla de Datos

```javascript
function renderTable(tbodyId, data, rowTemplate) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = data.length
    ? data.map(rowTemplate).join('')
    : '<tr><td colspan="100%" class="empty-state">Sin registros</td></tr>';
}
```

## Modales

Todos los modales siguen este patrón:
1. `div.modal-overlay` → fondo oscuro
2. `div.modal-container` → contenido
3. Función `openXModal(data?)` → modo crear o editar
4. Función `closeXModal()` → resetea form + oculta
5. Form con `onsubmit="saveX(event)"`

## Toast Notifications

```javascript
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
```

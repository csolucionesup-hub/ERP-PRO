/**
 * TabBar — componente reutilizable con hash routing automático (#/modulo/tab)
 * y soporte responsive.
 *
 * Uso:
 *   import { TabBar } from '../components/TabBar.js';
 *   TabBar({
 *     container: '#mi-contenedor',
 *     tabs: [
 *       { id: 'home',  label: '🏠 Home' },
 *       { id: 'stats', label: '📊 Stats', badge: 3 }
 *     ],
 *     defaultTab: 'home',
 *     onChange: (id) => { ... }
 *   });
 *
 * Comportamiento:
 * - Si la URL tiene #/modulo/tab_id, arranca en ese tab.
 * - Al cambiar de tab, actualiza el hash sin recargar.
 * - Llama onChange inmediatamente con el tab activo (para que la vista se pinte).
 */

export function TabBar({ container, tabs, defaultTab, onChange }) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error('TabBar: container no encontrado');
  if (!Array.isArray(tabs) || tabs.length === 0) throw new Error('TabBar: tabs[] requerido');

  // Extraer tab del hash. El router usa #modulo o #modulo/tab (sin slash inicial).
  const parts = (window.location.hash || '').replace(/^#\/?/, '').split('/');
  const tabFromUrl = parts[1];
  const activeId = tabs.find(t => t.id === tabFromUrl)?.id || defaultTab || tabs[0].id;

  el.innerHTML = `
    <nav class="tabbar" role="tablist">
      ${tabs.map(t => `
        <button class="tabbar-btn ${t.id === activeId ? 'active' : ''}"
                data-tab="${t.id}" role="tab" type="button">
          <span>${t.label}</span>
          ${t.badge != null ? `<span class="tabbar-badge">${t.badge}</span>` : ''}
        </button>
      `).join('')}
    </nav>
  `;

  el.querySelectorAll('.tabbar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab;
      el.querySelectorAll('.tabbar-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === id);
      });
      // Conservar el módulo actual y agregar /tab sin duplicar el #.
      const modulo = (window.location.hash || '').replace(/^#\/?/, '').split('/')[0];
      if (modulo) history.replaceState(null, '', `#${modulo}/${id}`);
      onChange?.(id);
    });
  });

  // Disparar onChange inicial para pintar el tab activo
  queueMicrotask(() => onChange?.(activeId));
}

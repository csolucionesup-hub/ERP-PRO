import { Sidebar } from './components/Sidebar.js';
import { Dashboard } from './pages/Dashboard.js';
import { Compras } from './pages/Compras.js';
import { Servicios } from './pages/Servicios.js';
import { Finanzas } from './pages/Finanzas.js';
import { Inventario } from './pages/Inventario.js';

const routes = {
  '/': Dashboard,
  '/dashboard': Dashboard,
  '/compras': Compras,
  '/servicios': Servicios,
  '/finanzas': Finanzas,
  '/inventario': Inventario
};

class Router {
  constructor() {
    this.root = document.getElementById('root');
    this.currentPath = window.location.hash.replace('#', '') || '/';
    
    window.addEventListener('hashchange', () => {
      this.currentPath = window.location.hash.replace('#', '') || '/';
      this.render();
    });

    document.addEventListener('click', (e) => {
      const navItem = e.target.closest('[data-path]');
      if (navItem) {
        window.location.hash = navItem.dataset.path;
      }
    });

    this.render();
  }

  async render() {
    this.root.innerHTML = `
      <div class="app-container">
        ${Sidebar(this.currentPath)}
        <main class="main-content" id="main-content">
          <div style="padding: 50px; text-align: center; color: var(--text-secondary);">Cargando módulo...</div>
        </main>
      </div>
    `;

    const mainContent = document.getElementById('main-content');
    const Component = routes[this.currentPath] || Dashboard;
    
    try {
      const html = await Component();
      mainContent.innerHTML = html;
    } catch (error) {
      console.error("View Error:", error);
      mainContent.innerHTML = `<div class="text-danger">Error cargando el módulo.</div>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Router();
});

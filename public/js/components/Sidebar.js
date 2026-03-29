export const Sidebar = (activePath) => `
  <aside class="sidebar">
    <div class="sidebar-logo">ERP <span>PRO</span></div>
    <nav class="sidebar-nav">
      <div class="nav-item ${activePath === '/' ? 'active' : ''}" data-path="/">Dashboard</div>
      <div class="nav-item ${activePath === '/servicios' ? 'active' : ''}" data-path="/servicios">Ventas y Servicios</div>
      <div class="nav-item ${activePath === '/finanzas' ? 'active' : ''}" data-path="/finanzas">Finanzas y Flujo</div>
      <div class="nav-item ${activePath === '/compras' ? 'active' : ''}" data-path="/compras">Compras</div>
      <div class="nav-item ${activePath === '/inventario' ? 'active' : ''}" data-path="/inventario">Inventario</div>
    </nav>
    <div class="sidebar-footer" style="padding: 20px; border-top: 1px solid var(--border-light); margin-top: auto;">
      <p style="font-size: 11px; color: var(--text-secondary); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Acciones Rápidas</p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="action-btn" data-path="/compras" style="width: 100%; text-align: left; padding: 8px 12px; font-size: 12px; background: var(--success); color: white; border: none; border-radius: 4px; cursor: pointer;">+ Nueva Compra</button>
        <button class="action-btn" data-path="/inventario" style="width: 100%; text-align: left; padding: 8px 12px; font-size: 12px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer;">- Registrar Consumo</button>
        <button class="action-btn" data-path="/servicios" style="width: 100%; text-align: left; padding: 8px 12px; font-size: 12px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">$ Cobrar Servicio</button>
      </div>
    </div>
  </aside>
`;

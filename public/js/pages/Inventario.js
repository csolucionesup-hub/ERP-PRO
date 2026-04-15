import { api } from '../services/api.js';
import { showSuccess, showError, showToast } from '../services/ui.js';

const CATEGORIA_BADGE = {
  Material:    'background:#3b82f6;color:white',
  Consumible:  'background:#f97316;color:white',
  Herramienta: 'background:#6b7280;color:white',
  Equipo:      'background:#8b5cf6;color:white',
  EPP:         'background:#22c55e;color:white',
};

export const Inventario = async () => {
  let inventario = [], servicios = [];
  try {
    [inventario, servicios] = await Promise.all([
      api.inventory.getInventario(),
      api.services.getServicios()
    ]);
    if (!Array.isArray(inventario)) inventario = [];
    if (!Array.isArray(servicios)) servicios = [];
  } catch(err) {
    console.error('[Inventario] Error cargando datos:', err);
  }

  const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);

  const buildRows = (lista) => lista.map(i => {
    const badgeStyle = CATEGORIA_BADGE[i.categoria] || 'background:#6b7280;color:white';
    return `
    <tr data-cat="${i.categoria || ''}">
      <td style="font-size:11px; color:var(--text-secondary)">${i.sku}</td>
      <td><strong>${i.nombre}</strong><br><span style="font-size:10px;padding:2px 6px;border-radius:10px;${badgeStyle}">${i.categoria || 'Material'}</span></td>
      <td><span class="status-badge status-pendiente">${i.unidad}</span></td>
      <td style="text-align:right" class="${i.stock_actual <= i.stock_minimo ? 'color-error' : ''}">
        <strong>${i.stock_actual}</strong>
        <br><span style="font-size:10px; color:var(--text-secondary)">Mín: ${i.stock_minimo}</span>
      </td>
      <td style="text-align:right">${formatCurrency(i.costo_promedio || 0)}</td>
      <td style="text-align:right">${formatCurrency(i.valorizado || 0)}</td>
      <td style="display:flex;gap:4px">
         <button class="action-btn" onclick="window.verKardex(${i.id_item}, '${i.nombre}')">Kárdex</button>
         <button class="action-btn" style="background:#ef4444;color:white" onclick="window.eliminarItem(${i.id_item}, '${i.nombre}')">Eliminar</button>
      </td>
    </tr>
  `}).join('');

  const rows = buildRows(inventario);

  const servicesOptions = servicios.filter(s => s.estado !== 'COBRADO').map(s => `<option value="${s.id_servicio}">${s.codigo} - ${s.nombre}</option>`).join('');
  const itemOptions = inventario.filter(i => i.stock_actual > 0).map(i => `<option value="${i.id_item}">${i.nombre} (${i.stock_actual} disp)</option>`).join('');

  setTimeout(() => {
     // Filtro por categoría
     document.querySelectorAll('.btn-filtro-cat').forEach(btn => {
       btn.addEventListener('click', () => {
         document.querySelectorAll('.btn-filtro-cat').forEach(b => b.style.background = 'var(--bg-app)');
         btn.style.background = 'var(--primary-color)';
         btn.style.color = 'white';
         const cat = btn.dataset.cat;
         document.querySelectorAll('#tbody-inv tr').forEach(tr => {
           tr.style.display = (!cat || tr.dataset.cat === cat) ? '' : 'none';
         });
       });
     });

     // Form Nuevo Insumo
     const formItem = document.getElementById('form-insumo');
     if(formItem) {
       formItem.onsubmit = async (e) => {
         e.preventDefault();
         const data = {
             nombre: e.target.nombre.value,
             categoria: e.target.categoria.value,
             unidad: e.target.unidad.value,
             stock_minimo: Number(e.target.stock_minimo.value) || 10
         };
         try {
             const res = await api.inventory.createInventarioItem(data);
             showSuccess('Insumo registrado con SKU: ' + res.sku);
             window.location.reload();
         } catch(err) {
             showError(err.detalles?.[0] || err.error || 'Error al registrar insumo');
         }
       };
     }

     // Form Consumo
     const formConsumo = document.getElementById('form-consumo');
     if(formConsumo) {
       formConsumo.onsubmit = async (e) => {
         e.preventDefault();
         const data = {
             id_servicio: Number(e.target.id_servicio.value),
             detalles: [{
                 id_item: Number(e.target.id_item.value),
                 cantidad: Number(e.target.cantidad.value)
             }]
         };
         try {
             await api.inventory.consumirInventario(data);
             showSuccess('Almacén rebajado y costo transferido al servicio');
             window.location.reload();
         } catch(err) {
             showError(err.detalles?.[0] || err.error || 'Error al registrar consumo');
         }
       };
     }

     window.verKardex = async (id, name) => {
         try {
            const logs = await api.inventory.getKardex(id);
            let logInfo = `KÁRDEX - ${name}\n\n`;
            logs.forEach(l => {
               logInfo += `[${l.fecha_movimiento.split('T')[0]}] ${l.tipo_movimiento} | Ref: ${l.referencia_tipo}#${l.referencia_id} | Cant: ${l.cantidad} | Saldo: ${l.saldo_posterior}\n`;
            });
            if(logs.length === 0) logInfo += "Sin movimientos aún.";
            showToast(logInfo, 'info', 8000);
         } catch(e) {
            showError('No se pudo extraer Kárdex');
         }
     };

     window.eliminarItem = async (id, nombre) => {
         if (!confirm(`¿Eliminar permanentemente "${nombre}"?\nEsta acción no se puede deshacer.`)) return;
         try {
            await api.inventory.deleteInventarioItem(id);
            window.location.reload();
         } catch(e) {
            showError(e.error || e.message || 'Error al eliminar');
         }
     };
     // Namespace por módulo
     window.Inventario = {
       verKardex:    window.verKardex,
       eliminarItem: window.eliminarItem,
     };
  }, 100);

  const btnStyle = 'padding:6px 12px; border:1px solid var(--border-light); border-radius:4px; cursor:pointer; font-size:12px; background:var(--bg-app)';

  return `
    <header class="header">
      <div>
         <h1>Control de Almacén (Valorizado Ponderado)</h1>
         <span style="color:var(--text-secondary)">Gestiona insumos, revisa costos móviles y merma inventario afectando los márgenes de servicios.</span>
      </div>
    </header>

    <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
      <span style="font-size:12px; color:var(--text-secondary); font-weight:600">Filtrar:</span>
      <button class="btn-filtro-cat" data-cat="" style="${btnStyle}">Todos</button>
      <button class="btn-filtro-cat" data-cat="Material" style="${btnStyle}">Material</button>
      <button class="btn-filtro-cat" data-cat="Consumible" style="${btnStyle}">Consumible</button>
      <button class="btn-filtro-cat" data-cat="Herramienta" style="${btnStyle}">Herramienta</button>
      <button class="btn-filtro-cat" data-cat="Equipo" style="${btnStyle}">Equipo</button>
      <button class="btn-filtro-cat" data-cat="EPP" style="${btnStyle}">EPP</button>
    </div>

    <div style="display:flex; gap: 20px; align-items:flex-start; margin-top: 16px;">

       <div class="table-container" style="flex:2;">
         <table>
           <thead>
             <tr>
               <th>SKU</th>
               <th>Insumo / Categoría</th>
               <th>Unidad</th>
               <th style="text-align:right">Stock Vigente</th>
               <th style="text-align:right">Costo Und (Promedio)</th>
               <th style="text-align:right">Valoración Patrimonio</th>
               <th>Tracking</th>
             </tr>
           </thead>
           <tbody id="tbody-inv">
             ${rows || '<tr><td colspan="7" style="text-align:center">Sin ítems en almacén</td></tr>'}
           </tbody>
         </table>
       </div>

       <div style="flex:1; display:flex; flex-direction:column; gap: 20px;">

          <div class="card">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Añadir Insumo Base</h3>
              <form id="form-insumo" style="display:flex; flex-direction:column; gap:10px;">
                 <select name="categoria" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <option value="Material">Material</option>
                    <option value="Consumible">Consumible</option>
                    <option value="Herramienta">Herramienta</option>
                    <option value="Equipo">Equipo</option>
                    <option value="EPP">EPP</option>
                 </select>
                 <input name="nombre" placeholder="Nombre Comercial" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <select name="unidad" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <option value="UND">UND (Unidad)</option>
                    <option value="KG">KG (Kilogramos)</option>
                    <option value="M">M (Metro)</option>
                    <option value="M2">M2 (Metro cuadrado)</option>
                    <option value="M3">M3 (Metro cúbico)</option>
                    <option value="PAR">PAR</option>
                    <option value="LOTE">LOTE</option>
                    <option value="HRA">HRA (Hora)</option>
                    <option value="DIA">DIA</option>
                    <option value="SERV">SERV (Servicio)</option>
                 </select>
                 <label style="font-size:12px; color:var(--text-secondary)">Alerta de Stock Mínimo</label>
                 <input name="stock_minimo" type="number" step="0.01" value="10" placeholder="Stock Mínimo" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <p style="font-size:11px; color:var(--text-secondary); margin:0">El SKU se genera automáticamente según la categoría.</p>
                 <button type="submit" style="padding:10px; border:none; background:var(--bg-sidebar); border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; color:black">Crear Catálogo</button>
              </form>
          </div>

          <div class="card" style="border-left: 4px solid var(--danger)">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Retirar Insumos hacia un Servicio</h3>
              <p style="font-size:12px; color:var(--text-secondary); margin-bottom:15px">Esta acción restará el stock e imputará el costo a las finanzas del Servicio seleccionado impidiendo inflar utilidades irreales.</p>
              <form id="form-consumo" style="display:flex; flex-direction:column; gap:10px;">
                 <select name="id_servicio" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <option value="">-- Servicio Atendido (Destino Costo) --</option>
                    ${servicesOptions}
                 </select>
                 <select name="id_item" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <option value="">-- Material Utilizado --</option>
                    ${itemOptions}
                 </select>
                 <input name="cantidad" type="number" step="0.01" placeholder="Volumen Retirado" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <button type="submit" style="padding:12px; border:none; background:var(--danger); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; font-size:14px;">Mermar Material</button>
              </form>
          </div>

       </div>
    </div>
  `;
};

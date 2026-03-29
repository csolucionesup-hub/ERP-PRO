import { api } from '../services/api.js';

export const Inventario = async () => {
  // Fetch lists
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

  const rows = inventario.map(i => `
    <tr>
      <td>${i.sku}</td>
      <td><strong>${i.nombre}</strong></td>
      <td><span class="status-badge status-pendiente">${i.unidad}</span></td>
      <td style="text-align:right" class="${i.stock_actual <= i.stock_minimo ? 'color-error' : ''}">
        <strong>${i.stock_actual}</strong>
        <br><span style="font-size:10px; color:var(--text-secondary)">Mín: ${i.stock_minimo}</span>
      </td>
      <td style="text-align:right">${formatCurrency(i.costo_promedio || 0)}</td>
      <td style="text-align:right">${formatCurrency(i.valorizado || 0)}</td>
      <td>
         <button class="action-btn" onclick="window.verKardex(${i.id_item}, '${i.nombre}')">Kárdex</button>
      </td>
    </tr>
  `).join('');

  const servicesOptions = servicios.filter(s => s.estado !== 'COBRADO').map(s => `<option value="${s.id_servicio}">${s.codigo} - ${s.nombre}</option>`).join('');
  const itemOptions = inventario.filter(i => i.stock_actual > 0).map(i => `<option value="${i.id_item}">${i.nombre} (${i.stock_actual} disp)</option>`).join('');

  setTimeout(() => {
     // Lógica Form Nuevo Insumo
     const formItem = document.getElementById('form-insumo');
     if(formItem) {
       formItem.onsubmit = async (e) => {
         e.preventDefault();
          const data = {
              sku: e.target.sku.value,
              nombre: e.target.nombre.value,
              unidad: e.target.unidad.value,
              stock_minimo: Number(e.target.stock_minimo.value) || 10
          };
         try {
             await api.inventory.createInventarioItem(data);
             alert('Insumo Registrado');
             window.location.reload();
         } catch(err) {
             alert('Error: ' + JSON.stringify(err.detalles || err.error || err));
         }
       };
     }

     // Lógica Form Consumo
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
             alert('Almacén Rebajado y Costo Transferido al Servicio Correctamente');
             window.location.reload();
         } catch(err) {
             // Retorna error 400 controlado que atrapa la regla de NO vender en negativo.
             alert('Error: ' + JSON.stringify(err.detalles || err.error || err));
         }
       };
     }

     window.verKardex = async (id, name) => {
         try {
            const logs = await api.inventory.getKardex(id);
            let logInfo = `KÁRDEX - ${name}\n\n`;
            logs.forEach(l => {
               logInfo += `[${l.fecha_movimiento.split('T')[0]}] ${l.tipo_movimiento} | Referencia:: ${l.referencia_tipo}#${l.referencia_id} | Cantidad Modificada: ${l.cantidad} | Saldo Residual: ${l.saldo_posterior}\n`;
            });
            if(logs.length === 0) logInfo += "Sin movimientos aún.";
            alert(logInfo);
         } catch(e) {
            console.error(e);
            alert("No se pudo extraer Kárdex");
         }
     }
  }, 100);

  return `
    <header class="header">
      <div>
         <h1>Control de Almacén (Valorizado Ponderado)</h1>
         <span style="color:var(--text-secondary)">Gestiona insumos, revisa costos móviles y merma inventario afectando los márgenes de servicios.</span>
      </div>
    </header>
    
    <div style="display:flex; gap: 20px; align-items:flex-start; margin-top: 20px;">
       
       <!-- Layout Izquierdo: Kardex -->
       <div class="table-container" style="flex:2;">
         <table>
           <thead>
             <tr>
               <th>SKU</th>
               <th>Insumo</th>
               <th>Unidad</th>
               <th style="text-align:right">Stock Vigente</th>
               <th style="text-align:right">Costo Und (Promedio)</th>
               <th style="text-align:right">Valoración Patrimonio</th>
               <th>Tracking</th>
             </tr>
           </thead>
           <tbody>
             ${rows}
           </tbody>
         </table>
       </div>


       <!-- Layout Derecho: Transacciones -->
       <div style="flex:1; display:flex; flex-direction:column; gap: 20px;">
          
          <div class="card">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Añadir Insumo Base</h3>
              <form id="form-insumo" style="display:flex; flex-direction:column; gap:10px;">
                 <input name="sku" placeholder="Código SKU" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="nombre" placeholder="Nombre Comercial" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                  <select name="unidad" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                     <option value="UNIDAD">UNIDAD (Suelto)</option>
                     <option value="KG">KILOGRAMOS (KG)</option>
                     <option value="BOTELLA">BOTELLA</option>
                     <option value="LITRO">LITRO</option>
                     <option value="CAJA">CAJA</option>
                  </select>
                  <label style="font-size:12px; color:var(--text-secondary)">Alerta de Stock Mínimo</label>
                  <input name="stock_minimo" type="number" step="0.01" value="10" placeholder="Stock Mínimo" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
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

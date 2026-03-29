import { api } from '../services/api.js';

export const Compras = async () => {
  // Fetch lists con manejo de errores defensivo
  let compras = [], proveedores = [], inventario = [];
  try {
    [compras, proveedores, inventario] = await Promise.all([
      api.purchases.getCompras(),
      api.purchases.getProveedores(),
      api.inventory.getInventario()
    ]);
    // Garantía de que son arrays planos (nunca [rows, fields])
    if (!Array.isArray(compras)) compras = [];
    if (!Array.isArray(proveedores)) proveedores = [];
    if (!Array.isArray(inventario)) inventario = [];
  } catch(err) {
    console.error('[Compras] Error cargando datos:', err);
  }

  const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);

  const getStatusBadge = (estado) => {
    return `<span class="status-badge status-${estado?.toLowerCase()}">${estado}</span>`;
  };

  // Lógica delegada de UI para modales y eventos
  setTimeout(() => {
     const btnNewItemLine = document.getElementById('btn-new-item-line');
     const formProv = document.getElementById('form-proveedor');
     const formCompra = document.getElementById('form-compra');

     // Manejo de Líneas Dinámicas de Compra
     let lineas = [];
     const renderLineas = () => {
         const tbody = document.getElementById('tbody-detalles');
         if (!tbody) return;
         let html = '';
         let sub = 0;
         lineas.forEach((l, i) => {
            const rowSubtotal = l.cantidad * l.precio;
            sub += rowSubtotal;
            html += `<tr>
                <td style="font-size:11px">${l.nombre}</td>
                <td>${l.cantidad}</td>
                <td style="text-align:right">${formatCurrency(l.precio || 0)}</td>
                <td style="text-align:right">${formatCurrency(rowSubtotal || 0)}</td>
                <td><button type="button" class="action-btn" style="color:red; border:none" onclick="window.removeLinea(${i})">X</button></td>
            </tr>`;
         });
         tbody.innerHTML = html;
         
         const igv = sub * 0.18;
         const total = sub + igv;
         document.getElementById('monto_base').value = sub.toFixed(2);
         document.getElementById('igv_base').value = igv.toFixed(2);
         document.getElementById('total_base').value = total.toFixed(2);
     };

     window.removeLinea = (idx) => { lineas.splice(idx,1); renderLineas(); };

     if(btnNewItemLine) {
        btnNewItemLine.onclick = () => {
           const id = document.getElementById('item-select').value;
           const nb = document.getElementById('item-select').selectedOptions[0].text;
           const qty = Number(document.getElementById('item-qty').value);
           const p = Number(document.getElementById('item-price').value);
           if(id && qty > 0 && p >= 0) {
              lineas.push({id_item: Number(id), nombre: nb, cantidad: qty, precio: p});
              renderLineas();
           }
        }
     }

     if(formProv) {
       formProv.onsubmit = async (e) => {
         e.preventDefault();
         const data = {
             ruc: e.target.ruc.value,
             razon_social: e.target.razon_social.value,
             contacto: e.target.contacto.value || undefined,
         };
         try {
             await api.purchases.createProveedor(data);
             alert('Proveedor Registrado Correctamente');
             window.location.reload();
         } catch(err) {
             alert('Error: ' + JSON.stringify(err.detalles || err.error));
         }
       };
     }

     if(formCompra) {
       formCompra.onsubmit = async (e) => {
         e.preventDefault();
         if(lineas.length === 0) return alert('Debes agregar al menos un ítem al detalle.');
         
         const data = {
             id_proveedor: Number(e.target.id_proveedor.value),
             fecha: e.target.fecha.value,
             nro_comprobante: e.target.nro_comprobante.value,
             moneda: 'PEN',
             tipo_cambio: 1,
             monto_base: Number(document.getElementById('monto_base').value),
             igv_base: Number(document.getElementById('igv_base').value),
             total_base: Number(document.getElementById('total_base').value),
             estado_pago: e.target.estado_pago.value,
             detalles: lineas.map(l => ({
                id_item: l.id_item,
                cantidad: l.cantidad,
                precio_unitario: l.precio,
                subtotal: l.cantidad * l.precio
             }))
         };
         try {
             await api.purchases.createCompra(data);
             alert('Compra Procesada y Stock Actualizado');
             window.location.reload();
         } catch(err) {
             alert('Error: ' + JSON.stringify(err.detalles || err.error));
         }
       };
     }

     window.anularCompra = async (id, doc) => {
        if(confirm(`¡ALERTA DE SEGURIDAD!\\n\\n¿Deseas ANULAR la compra ${doc}?\\n\\nEsta acción afectará inventario y finanzas (reversando el stock ingresado y anulando egresos).`)) {
            try {
               await api.purchases.anularCompra(id);
               alert('Operación Revertida con Éxito');
               window.location.reload();
            } catch (e) {
               alert('No se pudo anular: ' + (e.message || JSON.stringify(e)));
            }
        }
     }

  }, 100);

  const compraRows = compras.map(c => `
    <tr class="${c.estado_pago === 'ANULADO' ? 'row-anulada' : ''}">
      <td>${c.id_compra}</td>
      <td>${c.fecha ? c.fecha.split('T')[0] : '---'}</td>
      <td><strong>${c.proveedor_nombre || 'N/A'}</strong></td>
      <td>${c.nro_comprobante}</td>
      <td>${formatCurrency(c.total_base || 0)}</td>
      <td>${getStatusBadge(c.estado_pago)}</td>
      <td>
        ${c.estado_pago !== 'ANULADO' ? `<button class="action-btn action-btn-anular" onclick="window.anularCompra(${c.id_compra}, '${c.nro_comprobante}')">Anular</button>` : ''}
      </td>
    </tr>
  `).join('');

  const provOptions = proveedores.map(p => `<option value="${p.id_proveedor}">${p.razon_social} (RUC: ${p.ruc})</option>`).join('');
  const itemOptions = inventario.map(i => `<option value="${i.id_item}">${i.nombre} [${i.sku}]</option>`).join('');

  return `
    <header class="header">
      <div>
         <h1>Gestión de Compras (Egresos Logísticos)</h1>
         <span style="color:var(--text-secondary)">Control profesional de suministros. Afectación directa a Inventario y Caja.</span>
      </div>
    </header>
    
    <div style="display:flex; gap: 20px; align-items:flex-start; margin-top: 20px;">
       
       <div class="table-container" style="flex:2;">
         <table>
           <thead>
             <tr>
               <th>ID</th>
               <th>Fecha</th>
               <th>Proveedor</th>
               <th>Doc</th>
               <th>Total</th>
               <th>Estado</th>
               <th>Acciones</th>
             </tr>
           </thead>
           <tbody>
             ${compraRows || '<tr><td colspan="7" style="text-align:center">No hay registros</td></tr>'}
           </tbody>
         </table>
       </div>


       <div style="flex:1; display:flex; flex-direction:column; gap: 20px;">
          
          <div class="card">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Alta Proveedor Mestro</h3>
              <form id="form-proveedor" style="display:flex; flex-direction:column; gap:10px;">
                 <input name="ruc" placeholder="RUC (11 dígitos)" required pattern="[0-9]{11}" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="razon_social" placeholder="Razón Social Completa" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="contacto" placeholder="Contacto (Opcional)" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <button type="submit" style="padding:10px; border:none; background:var(--primary-color); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold;">Guardar</button>
              </form>
          </div>

          <div class="card">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Registrar Factura/Compra</h3>
              <form id="form-compra" style="display:flex; flex-direction:column; gap:10px;">
                 <select name="id_proveedor" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <option value="">-- Seleccionar Proveedor --</option>
                    ${provOptions}
                 </select>
                 <div style="display:flex; gap:10px;">
                    <input name="nro_comprobante" placeholder="F001-XXXXXX" required style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <input name="fecha" type="date" required style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 </div>
                 
                 <div style="background:var(--bg-app); padding:10px; border-radius:var(--radius-sm); margin-top:10px;">
                    <h4 style="font-size:11px; margin-bottom:10px; color:var(--text-secondary)">Añadir Ítem</h4>
                    <select id="item-select" style="width:100%; padding:8px; margin-bottom:8px;">${itemOptions}</select>
                    <div style="display:flex; gap:10px;">
                       <input id="item-qty" type="number" step="0.01" placeholder="Cant." style="flex:1; padding:8px;">
                       <input id="item-price" type="number" step="0.01" placeholder="P.Unit." style="flex:1; padding:8px;">
                       <button type="button" id="btn-new-item-line" style="background:var(--success); color:white; border:none; padding:8px; border-radius:4px; font-weight:bold">+</button>
                    </div>
                    <table style="width:100%; margin-top:10px; font-size:11px; border-collapse:collapse;" border="0">
                       <thead style="background:#eee"><tr><th>Item</th><th>Cant</th><th>PU</th><th>Sub</th><th></th></tr></thead>
                       <tbody id="tbody-detalles"></tbody>
                    </table>
                 </div>

                 <div style="display:flex; flex-direction:column; gap:5px; margin-top:10px; font-size:12px;">
                    <div style="display:flex; justify-content:space-between"><span>Base:</span> <input id="monto_base" readonly style="width:80px; text-align:right" value="0.00"></div>
                    <div style="display:flex; justify-content:space-between"><span>IGV:</span>  <input id="igv_base" readonly style="width:80px; text-align:right" value="0.00"></div>
                    <div style="display:flex; justify-content:space-between; font-weight:bold"><span>Total:</span> <input id="total_base" readonly style="width:80px; text-align:right" value="0.00"></div>
                 </div>

                 <select name="estado_pago" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light); margin-top:10px;">
                    <option value="PENDIENTE">PENDIENTE (Deuda)</option>
                    <option value="PAGADO">PAGADO (Contado)</option>
                 </select>
                 
                 <button type="submit" style="padding:12px; border:none; background:var(--bg-sidebar); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; font-size:14px; margin-top:5px;">Operar Compra</button>
              </form>
          </div>

       </div>
    </div>
  `;
};

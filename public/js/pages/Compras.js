import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';
import { emptyState } from '../components/EmptyState.js';

export const Compras = async () => {
  let compras = [], proveedores = [], inventario = [], tcHoy = { valor_venta: 1, es_hoy: false, fecha: '' };
  try {
    [compras, proveedores, inventario, tcHoy] = await Promise.all([
      api.purchases.getCompras(),
      api.purchases.getProveedores(),
      api.inventory.getInventario(),
      api.tipoCambio.getHoy('USD').catch(() => ({ valor_venta: 1, es_hoy: false, fecha: '' }))
    ]);
    if (!Array.isArray(compras)) compras = [];
    if (!Array.isArray(proveedores)) proveedores = [];
    if (!Array.isArray(inventario)) inventario = [];
  } catch(err) {
    console.error('[Compras] Error cargando datos:', err);
  }

  const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);
  const formatUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val) || 0);
  const getStatusBadge = (estado) => `<span class="status-badge status-${estado?.toLowerCase()}">${estado}</span>`;

  setTimeout(() => {
     const btnNewItemLine = document.getElementById('btn-new-item-line');
     const formCompra = document.getElementById('form-compra');

     // Autocomplete proveedor al seleccionar del dropdown
     const selProv = document.getElementById('sel-proveedor');
     if (selProv) {
       selProv.onchange = () => {
         const id = Number(selProv.value);
         const p = proveedores.find(x => x.id_proveedor === id);
         const info = document.getElementById('prov-info');
         if (info) info.innerHTML = p
           ? `<span style="font-size:11px;color:var(--text-secondary)">RUC: <strong>${p.ruc}</strong>${p.telefono ? ' · Tel: ' + p.telefono : ''}${p.email ? ' · ' + p.email : ''}</span>`
           : '';
       };
     }

     let lineas = [];

     const recalcular = () => {
       const aplicaIgv = document.getElementById('chk-igv') && document.getElementById('chk-igv').checked;
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

       const igv = aplicaIgv ? sub * 0.18 : 0;
       const total = sub + igv;
       document.getElementById('monto_base').value = sub.toFixed(2);
       document.getElementById('igv_base').value = igv.toFixed(2);
       document.getElementById('total_base').value = total.toFixed(2);
     };

     window.removeLinea = (idx) => { lineas.splice(idx, 1); recalcular(); };

     // Recalcular cuando cambia el checkbox IGV
     const chkIgv = document.getElementById('chk-igv');
     if (chkIgv) chkIgv.addEventListener('change', recalcular);

     // Banner PerfoTools USD en compras
     const compraMonedaSel = document.getElementById('compra-moneda');
     if (compraMonedaSel) {
       compraMonedaSel.onchange = () => {
         const isUSD = compraMonedaSel.value === 'USD';
         const divTC = document.getElementById('div-tc-compra');
         if (divTC) divTC.style.display = isUSD ? 'flex' : 'none';
         const banner = document.getElementById('banner-usd-compra');
         const form = document.getElementById('form-compra');
         if (banner) banner.style.display = isUSD ? 'block' : 'none';
         if (form) form.style.border = isUSD ? '2px solid #16a34a' : '';
       };
     }

     if(btnNewItemLine) {
        btnNewItemLine.onclick = () => {
           const sel = document.getElementById('item-select');
           const id = sel.value;
           const nb = sel.selectedOptions[0] ? sel.selectedOptions[0].text : '';
           const qty = Number(document.getElementById('item-qty').value);
           const p = Number(document.getElementById('item-price').value);
           if(id && qty > 0 && p >= 0) {
              lineas.push({ id_item: Number(id), nombre: nb, cantidad: qty, precio: p });
              recalcular();
           }
        };
     }

     // Modal "Crear Nuevo Ítem al vuelo"
     window.crearItemAlVuelo = () => {
       const modal = document.getElementById('modal-nuevo-item');
       if (modal) modal.style.display = 'flex';
     };
     window.cerrarModalItem = () => {
       const modal = document.getElementById('modal-nuevo-item');
       if (modal) modal.style.display = 'none';
     };

     const formNuevoItem = document.getElementById('form-nuevo-item');
     if (formNuevoItem) {
       formNuevoItem.onsubmit = async (e) => {
         e.preventDefault();
         const data = {
           nombre: e.target.ni_nombre.value,
           categoria: e.target.ni_categoria.value,
           unidad: e.target.ni_unidad.value,
           stock_minimo: 0
         };
         try {
           const res = await api.inventory.createInventarioItem(data);
           // Agregar al select de ítems
           const sel = document.getElementById('item-select');
           const opt = document.createElement('option');
           opt.value = res.id_item;
           opt.text = res.nombre + ' [' + res.sku + ']';
           sel.appendChild(opt);
           sel.value = res.id_item;
           showSuccess('Ítem creado con SKU: ' + res.sku);
           window.cerrarModalItem();
           formNuevoItem.reset();
         } catch(err) {
           showError(err.detalles?.[0] || err.error || 'Error al crear ítem');
         }
       };
     }

     if(formCompra) {
       formCompra.onsubmit = async (e) => {
         e.preventDefault();
         if(lineas.length === 0) return showError('Debes agregar al menos un ítem al detalle.');
         const aplicaIgv = document.getElementById('chk-igv').checked;
         const moneda = e.target.moneda.value || 'PEN';
         const tipo_cambio = moneda === 'USD' ? Number(e.target.tipo_cambio?.value) || 1 : 1;
         const data = {
             nro_oc: e.target.nro_oc.value,
             id_proveedor: Number(e.target.id_proveedor.value),
             fecha: e.target.fecha.value,
             nro_comprobante: e.target.nro_comprobante.value,
             moneda,
             tipo_cambio,
             aplica_igv: aplicaIgv,
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
             showSuccess('Compra procesada y stock actualizado');
             window.navigate('compras');
         } catch(err) {
             showError(err.detalles?.[0] || err.error || 'Error al registrar compra');
         }
       };
     }

     window.editarCompra = async (id) => {
       let detalle;
       try {
         detalle = await api.purchases.getCompraDetalle(id);
       } catch(e) {
         showError(e.error || e.message || 'Error cargando detalle');
         return;
       }

       const iStyle = 'padding:9px; border-radius:4px; border:1px solid var(--border-light); width:100%; box-sizing:border-box';
       const provOpts = proveedores.map(p => `<option value="${p.id_proveedor}" ${p.id_proveedor === detalle.id_proveedor ? 'selected' : ''}>${p.razon_social} (${p.ruc})</option>`).join('');
       const itemOpts = inventario.map(i => `<option value="${i.id_item}">${i.nombre} [${i.sku}]</option>`).join('');

       const overlay = document.createElement('div');
       overlay.id = 'modal-editar-compra';
       overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 0';
       overlay.innerHTML = `
         <div style="background:white;border-radius:10px;padding:28px;width:660px;box-shadow:0 12px 40px rgba(0,0,0,0.25)">
           <h3 style="margin:0 0 18px;font-size:16px;font-weight:700">Editar Compra — ${detalle.nro_comprobante}</h3>
           <form id="form-editar-compra" style="display:flex;flex-direction:column;gap:12px">
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
               <div>
                 <label style="font-size:11px;color:var(--text-secondary)">Proveedor</label>
                 <select name="id_proveedor" style="${iStyle}" required>${provOpts}</select>
               </div>
               <div>
                 <label style="font-size:11px;color:var(--text-secondary)">Fecha</label>
                 <input name="fecha" type="date" value="${detalle.fecha ? detalle.fecha.split('T')[0] : ''}" required style="${iStyle}">
               </div>
             </div>
             <div>
               <label style="font-size:11px;color:var(--text-secondary)">N° Comprobante</label>
               <input name="nro_comprobante" value="${detalle.nro_comprobante || ''}" required style="${iStyle}">
             </div>
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
               <div>
                 <label style="font-size:11px;color:var(--text-secondary)">Moneda</label>
                 <select name="moneda" id="edit-compra-moneda" style="${iStyle}">
                   <option value="PEN" ${detalle.moneda !== 'USD' ? 'selected' : ''}>S/. Soles (PEN)</option>
                   <option value="USD" ${detalle.moneda === 'USD' ? 'selected' : ''}>$ Dólares (USD)</option>
                 </select>
               </div>
               <div id="edit-div-tc" style="${detalle.moneda === 'USD' ? '' : 'display:none'}">
                 <label style="font-size:11px;color:var(--text-secondary)">Tipo de Cambio</label>
                 <input name="tipo_cambio" type="number" step="0.0001" value="${detalle.tipo_cambio || 1}" style="${iStyle}">
               </div>
             </div>
             <label style="font-size:12px;display:flex;gap:8px;align-items:center;cursor:pointer;background:#f8f9fa;padding:10px;border-radius:4px">
               <input type="checkbox" id="edit-chk-igv" ${detalle.aplica_igv ? 'checked' : ''}> Afecto IGV 18%
             </label>
             <div style="background:#f8f9fa;padding:12px;border-radius:6px">
               <h4 style="margin:0 0 8px;font-size:12px;color:var(--text-secondary)">Ítems de la Compra</h4>
               <table style="width:100%;font-size:11px;border-collapse:collapse">
                 <thead><tr style="background:#e5e7eb"><th style="padding:4px;text-align:left">Ítem</th><th>Cant</th><th>P.Unit</th><th>Subtotal</th><th></th></tr></thead>
                 <tbody id="edit-tbody-detalles"></tbody>
               </table>
               <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
                 <select id="edit-item-select" style="flex:3;padding:7px;border:1px solid var(--border-light);border-radius:4px;font-size:12px">${itemOpts}</select>
                 <input id="edit-item-qty" type="number" step="0.01" placeholder="Cant." style="flex:1;padding:7px;border:1px solid var(--border-light);border-radius:4px;font-size:12px">
                 <input id="edit-item-price" type="number" step="0.01" placeholder="P.Unit" style="flex:1.5;padding:7px;border:1px solid var(--border-light);border-radius:4px;font-size:12px">
                 <button type="button" id="edit-btn-add-item" style="background:var(--primary-color);color:white;border:none;padding:7px 12px;border-radius:4px;cursor:pointer;font-weight:bold">+</button>
               </div>
             </div>
             <div style="display:flex;flex-direction:column;gap:4px;font-size:12px">
               <div style="display:flex;justify-content:space-between"><span>Base:</span><input id="edit-monto_base" readonly style="width:90px;text-align:right;padding:4px;border:1px solid var(--border-light);border-radius:4px" value="0.00"></div>
               <div style="display:flex;justify-content:space-between"><span>IGV:</span><input id="edit-igv_base" readonly style="width:90px;text-align:right;padding:4px;border:1px solid var(--border-light);border-radius:4px" value="0.00"></div>
               <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Total:</span><input id="edit-total_base" readonly style="width:90px;text-align:right;padding:4px;border:1px solid var(--border-light);border-radius:4px" value="0.00"></div>
             </div>
             <div>
               <label style="font-size:11px;color:var(--text-secondary)">Estado de Pago</label>
               <select name="estado_pago" style="${iStyle}" required>
                 <option value="PENDIENTE" ${detalle.estado_pago === 'PENDIENTE' ? 'selected' : ''}>PENDIENTE</option>
                 <option value="PAGADO" ${detalle.estado_pago === 'PAGADO' ? 'selected' : ''}>PAGADO</option>
               </select>
             </div>
             <div style="display:flex;gap:10px;margin-top:4px">
               <button type="submit" style="flex:1;padding:11px;border:none;background:var(--primary-color);color:white;border-radius:4px;cursor:pointer;font-weight:bold">Guardar Cambios</button>
               <button type="button" onclick="document.getElementById('modal-editar-compra').remove()" style="flex:1;padding:11px;border:1px solid var(--border-light);background:white;border-radius:4px;cursor:pointer">Cancelar</button>
             </div>
           </form>
         </div>`;

       document.body.appendChild(overlay);
       overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

       document.getElementById('edit-compra-moneda').onchange = (e) => {
         document.getElementById('edit-div-tc').style.display = e.target.value === 'USD' ? '' : 'none';
       };

       let editLineas = detalle.detalles.map(d => ({
         id_item: d.id_item,
         nombre: d.item_nombre + ' [' + d.sku + ']',
         cantidad: Number(d.cantidad),
         precio: Number(d.precio_unitario)
       }));

       const editRecalcular = () => {
         const aplicaIgv = document.getElementById('edit-chk-igv').checked;
         const tbody = document.getElementById('edit-tbody-detalles');
         if (!tbody) return;
         let html = '', sub = 0;
         editLineas.forEach((l, i) => {
           const rowSub = l.cantidad * l.precio;
           sub += rowSub;
           html += `<tr>
             <td style="padding:3px">${l.nombre}</td>
             <td style="text-align:center">${l.cantidad}</td>
             <td style="text-align:right">${formatCurrency(l.precio)}</td>
             <td style="text-align:right">${formatCurrency(rowSub)}</td>
             <td><button type="button" style="background:none;border:none;color:red;cursor:pointer;font-size:12px;padding:2px 6px" onclick="window.editRemoveLinea(${i})">✕</button></td>
           </tr>`;
         });
         tbody.innerHTML = html;
         const igv = aplicaIgv ? sub * 0.18 : 0;
         const total = sub + igv;
         document.getElementById('edit-monto_base').value = sub.toFixed(2);
         document.getElementById('edit-igv_base').value = igv.toFixed(2);
         document.getElementById('edit-total_base').value = total.toFixed(2);
       };

       window.editRemoveLinea = (idx) => { editLineas.splice(idx, 1); editRecalcular(); };
       document.getElementById('edit-chk-igv').addEventListener('change', editRecalcular);

       document.getElementById('edit-btn-add-item').onclick = () => {
         const sel = document.getElementById('edit-item-select');
         const id_item = Number(sel.value);
         const nombre = sel.selectedOptions[0] ? sel.selectedOptions[0].text : '';
         const qty = Number(document.getElementById('edit-item-qty').value);
         const precio = Number(document.getElementById('edit-item-price').value);
         if (id_item && qty > 0 && precio >= 0) {
           editLineas.push({ id_item, nombre, cantidad: qty, precio });
           editRecalcular();
         }
       };

       editRecalcular();

       document.getElementById('form-editar-compra').onsubmit = async (e) => {
         e.preventDefault();
         if (editLineas.length === 0) return showError('Debes agregar al menos un ítem.');
         const f = e.target;
         const moneda = f.moneda.value;
         const tipo_cambio = moneda === 'USD' ? Number(f.tipo_cambio?.value) || 1 : 1;
         const aplicaIgv = document.getElementById('edit-chk-igv').checked;
         const data = {
           id_proveedor: Number(f.id_proveedor.value),
           fecha: f.fecha.value,
           nro_comprobante: f.nro_comprobante.value,
           moneda,
           tipo_cambio,
           aplica_igv: aplicaIgv,
           monto_base: Number(document.getElementById('edit-monto_base').value),
           igv_base: Number(document.getElementById('edit-igv_base').value),
           total_base: Number(document.getElementById('edit-total_base').value),
           estado_pago: f.estado_pago.value,
           detalles: editLineas.map(l => ({
             id_item: l.id_item,
             cantidad: l.cantidad,
             precio_unitario: l.precio,
             subtotal: +(l.cantidad * l.precio).toFixed(2)
           }))
         };
         try {
           await api.purchases.updateCompra(id, data);
           showSuccess('Compra actualizada correctamente');
           overlay.remove();
           window.navigate('compras');
         } catch(err) {
           showError(err.detalles?.[0] || err.error || 'Error al actualizar');
         }
       };
     };

     window.anularCompra = async (id, doc) => {
        if(confirm(`¡ALERTA DE SEGURIDAD!\n\n¿Deseas ANULAR la compra ${doc}?\n\nEsta acción revertirá el stock y anulará el egreso financiero.`)) {
            try {
               await api.purchases.anularCompra(id);
               showSuccess('Compra anulada y stock revertido');
               window.navigate('compras');
            } catch (e) {
               showError(e.error || e.message || 'No se pudo anular');
            }
        }
     };

     window.eliminarCompra = async (id, doc) => {
       if (!confirm(`¿Eliminar permanentemente la compra ${doc}?\nEsta acción no se puede deshacer.`)) return;
       try {
         await api.purchases.deleteCompra(id);
         showSuccess('Compra eliminada');
         window.navigate('compras');
       } catch(e) { showError(e.error || e.message || 'Error al eliminar'); }
     };
     // Namespace por módulo
     window.Compras = {
       removeLinea:    window.removeLinea,
       crearItemAlVuelo: window.crearItemAlVuelo,
       cerrarModalItem: window.cerrarModalItem,
       editarCompra:   window.editarCompra,
       anularCompra:   window.anularCompra,
       eliminarCompra: window.eliminarCompra,
     };

  }, 100);

  const compraRows = compras.map(c => {
    const esUSD = c.moneda === 'USD';
    const tc = Number(c.tipo_cambio) || 1;
    const total = Number(c.total_base) || 0;
    const totalPEN = esUSD ? total * tc : total;
    return `
    <tr class="${c.estado_pago === 'ANULADO' ? 'row-anulada' : ''}">
      <td style="font-size:11px; color:var(--text-secondary)">${c.nro_oc || '---'}
        <br><span style="background:${esUSD?'#16a34a':'#6b7280'};color:white;padding:1px 6px;border-radius:3px;font-size:10px">${esUSD?'💵 PerfoTools':'⚙️ Metal Engineers'}</span>
      </td>
      <td>${c.fecha ? c.fecha.split('T')[0] : '---'}</td>
      <td><strong>${c.proveedor_nombre || 'N/A'}</strong></td>
      <td>${c.nro_comprobante}</td>
      <td style="text-align:right">
        ${esUSD
          ? `<strong style="color:#16a34a">${formatUSD(total)}</strong><br><span style="font-size:10px;color:var(--text-secondary)">≈ ${formatCurrency(totalPEN)}</span>`
          : formatCurrency(total)}
      </td>
      <td>${getStatusBadge(c.estado_pago)}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        ${c.estado_pago !== 'ANULADO' ? `<button class="action-btn" style="background:var(--info);color:white" onclick="window.editarCompra(${c.id_compra})">Editar</button>` : ''}
        ${c.estado_pago !== 'ANULADO' ? `<button class="action-btn action-btn-anular" onclick="window.anularCompra(${c.id_compra}, '${c.nro_comprobante}')">Anular</button>` : ''}
        <button class="action-btn" style="background:#ef4444;color:white" onclick="window.eliminarCompra(${c.id_compra}, '${c.nro_comprobante}')">Eliminar</button>
      </td>
    </tr>
  `;
  }).join('');

  const provOptions = proveedores.map(p => `<option value="${p.id_proveedor}">${p.razon_social} (RUC: ${p.ruc})</option>`).join('');
  const itemOptions = inventario.map(i => `<option value="${i.id_item}">${i.nombre} [${i.sku}]</option>`).join('');

  const inputStyle = 'padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)';

  return `
    <!-- Modal Crear Nuevo Ítem al vuelo -->
    <div id="modal-nuevo-item" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
      <div style="background:white; border-radius:8px; padding:24px; width:340px; box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <h3 style="margin-bottom:16px; font-size:15px; font-weight:700">Crear Nuevo Ítem de Inventario</h3>
        <form id="form-nuevo-item" style="display:flex; flex-direction:column; gap:10px;">
          <input name="ni_nombre" placeholder="Nombre del producto" required style="${inputStyle}">
          <select name="ni_categoria" required style="${inputStyle}">
            <option value="Material">Material</option>
            <option value="Consumible">Consumible</option>
            <option value="Herramienta">Herramienta</option>
            <option value="Equipo">Equipo</option>
            <option value="EPP">EPP</option>
          </select>
          <select name="ni_unidad" required style="${inputStyle}">
            <option value="UND">UND (Unidad)</option>
            <option value="KG">KG</option>
            <option value="M">M (Metro)</option>
            <option value="M2">M2</option>
            <option value="M3">M3</option>
            <option value="PAR">PAR</option>
            <option value="LOTE">LOTE</option>
            <option value="HRA">HRA (Hora)</option>
            <option value="DIA">DIA</option>
            <option value="SERV">SERV</option>
          </select>
          <p style="font-size:11px; color:var(--text-secondary); margin:0">El SKU se genera automáticamente.</p>
          <div style="display:flex; gap:10px; margin-top:4px;">
            <button type="submit" style="flex:1; padding:10px; border:none; background:var(--success); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold;">Crear y Agregar</button>
            <button type="button" onclick="window.cerrarModalItem()" style="flex:1; padding:10px; border:1px solid var(--border-light); background:white; border-radius:var(--radius-sm); cursor:pointer;">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

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
               <th>N° OC</th>
               <th>Fecha</th>
               <th>Proveedor</th>
               <th>Doc</th>
               <th>Total</th>
               <th>Estado</th>
               <th>Acciones</th>
             </tr>
           </thead>
           <tbody>
             ${compraRows || `<tr><td colspan="7" style="padding:0">${emptyState({
               icon: 'package',
               title: 'No hay compras registradas',
               text: 'Las compras aparecerán acá cuando registres facturas de proveedores.',
             })}</td></tr>`}
           </tbody>
         </table>
       </div>

       <div style="flex:1; display:flex; flex-direction:column; gap: 20px;">

          <div class="card">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Registrar Factura/Compra</h3>
              <form id="form-compra" style="display:flex; flex-direction:column; gap:10px;">
                 <div id="banner-usd-compra" style="display:none; background:#16a34a; color:white; padding:10px 14px; border-radius:6px; font-size:13px; font-weight:600;">💵 Transacción PerfoTools — Dólares americanos</div>

                 <input name="nro_oc" placeholder="N° OC (Ej: OC-001)" required style="${inputStyle}">

                 <select name="id_proveedor" id="sel-proveedor" required style="${inputStyle}">
                    <option value="">-- Seleccionar Proveedor --</option>
                    ${provOptions}
                 </select>
                 <div id="prov-info"></div>
                 <div style="display:flex; gap:10px;">
                    <input name="nro_comprobante" placeholder="F001-XXXXXX" required style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <input name="fecha" type="date" required style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 </div>

                 <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Moneda</label>
                       <select name="moneda" id="compra-moneda" style="${inputStyle}; width:100%">
                          <option value="PEN">S/. Soles (PEN)</option>
                          <option value="USD">$ Dólares (USD)</option>
                       </select>
                    </div>
                    <div id="div-tc-compra" style="flex:1; display:none;">
                       <label style="font-size:11px; color:var(--text-secondary)">Tipo de Cambio (venta)</label>
                       <input name="tipo_cambio" type="number" step="0.0001" value="${tcHoy.valor_venta || 1}" style="${inputStyle}; width:100%">
                       <span style="font-size:10px;color:var(--text-secondary)">SBS ${tcHoy.es_hoy ? 'hoy' : (tcHoy.fecha || 'sin datos')}: ${tcHoy.valor_venta}</span>
                    </div>
                 </div>

                 <div style="display:flex; gap:10px; align-items:center; background:#f8f9fa; padding:10px; border-radius:4px">
                    <label style="font-size:12px; font-weight:bold; display:flex; gap:8px; align-items:center; cursor:pointer">
                       <input type="checkbox" id="chk-igv" checked> Afecto IGV 18%
                    </label>
                 </div>

                 <div style="background:var(--bg-app); padding:10px; border-radius:var(--radius-sm); margin-top:4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                      <h4 style="font-size:11px; color:var(--text-secondary); margin:0">Añadir Ítem</h4>
                      <button type="button" onclick="window.crearItemAlVuelo()" style="background:var(--success);color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px">+ Nuevo Ítem</button>
                    </div>
                    <select id="item-select" style="width:100%; padding:8px; margin-bottom:8px; border-radius:4px; border:1px solid var(--border-light)">${itemOptions}</select>
                    <div style="display:flex; gap:10px;">
                       <input id="item-qty" type="number" step="0.01" placeholder="Cant." style="flex:1; padding:8px; border-radius:4px; border:1px solid var(--border-light)">
                       <input id="item-price" type="number" step="0.01" placeholder="P.Unit (sin IGV)" style="flex:2; padding:8px; border-radius:4px; border:1px solid var(--border-light)">
                       <button type="button" id="btn-new-item-line" style="background:var(--primary-color); color:white; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer">+</button>
                    </div>
                    <table style="width:100%; margin-top:10px; font-size:11px; border-collapse:collapse;" border="0">
                       <thead style="background:#eee"><tr><th>Item</th><th>Cant</th><th>PU</th><th>Sub</th><th></th></tr></thead>
                       <tbody id="tbody-detalles"></tbody>
                    </table>
                 </div>

                 <div style="display:flex; flex-direction:column; gap:5px; margin-top:4px; font-size:12px;">
                    <div style="display:flex; justify-content:space-between"><span>Base:</span> <input id="monto_base" readonly style="width:90px; text-align:right; padding:4px; border:1px solid var(--border-light); border-radius:4px" value="0.00"></div>
                    <div style="display:flex; justify-content:space-between"><span>IGV:</span>  <input id="igv_base" readonly style="width:90px; text-align:right; padding:4px; border:1px solid var(--border-light); border-radius:4px" value="0.00"></div>
                    <div style="display:flex; justify-content:space-between; font-weight:bold"><span>Total:</span> <input id="total_base" readonly style="width:90px; text-align:right; padding:4px; border:1px solid var(--border-light); border-radius:4px" value="0.00"></div>
                 </div>

                 <select name="estado_pago" required style="${inputStyle}; margin-top:6px;">
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

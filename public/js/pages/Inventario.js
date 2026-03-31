import { api } from '../services/api.js';

const CATEGORIA_BADGE = {
  Material:    'background:#3b82f6;color:white',
  Consumible:  'background:#f97316;color:white',
  Herramienta: 'background:#6b7280;color:white',
  Equipo:      'background:#8b5cf6;color:white',
  EPP:         'background:#22c55e;color:white',
};

const TIPO_BADGE = {
  MATERIAL:    'background:#1d4ed8;color:white',
  CONSUMIBLE:  'background:#ea580c;color:white',
  HERRAMIENTA: 'background:#4b5563;color:white',
  EQUIPO:      'background:#7c3aed;color:white',
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
    const tipoStyle  = TIPO_BADGE[i.tipo_item] || 'background:#4b5563;color:white';
    return `
    <tr data-cat="${i.categoria || ''}">
      <td style="font-size:11px; color:var(--text-secondary)">${i.sku}</td>
      <td>
        <strong>${i.nombre}</strong><br>
        <span style="font-size:10px;padding:2px 6px;border-radius:10px;${badgeStyle};margin-right:4px">${i.categoria || 'Material'}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:10px;${tipoStyle}">${i.tipo_item || 'MATERIAL'}</span>
      </td>
      <td><span class="status-badge status-pendiente">${i.unidad}</span></td>
      <td style="text-align:right" class="${Number(i.stock_actual) <= Number(i.stock_minimo) ? 'color-error' : ''}">
        <strong>${i.stock_actual}</strong>
        <br><span style="font-size:10px; color:var(--text-secondary)">Mín: ${i.stock_minimo}</span>
      </td>
      <td style="text-align:right">${formatCurrency(i.costo_promedio || 0)}</td>
      <td style="text-align:right">${formatCurrency(i.valorizado || 0)}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
         <button class="action-btn" onclick="window.editarItem(${i.id_item})">Editar</button>
         <button class="action-btn" onclick="window.verKardex(${i.id_item}, '${i.nombre}')">Kárdex</button>
      </td>
    </tr>
  `}).join('');

  const rows = buildRows(inventario);

  const servicesOptions = servicios.filter(s => s.estado !== 'COBRADO').map(s => `<option value="${s.id_servicio}">${s.codigo} - ${s.nombre}</option>`).join('');
  const itemOptions = inventario.filter(i => Number(i.stock_actual) > 0).map(i => `<option value="${i.id_item}">${i.nombre} (${i.stock_actual} disp)</option>`).join('');

  // Modal de edición (inline, oculto por defecto)
  const editModal = `
    <div id="modal-editar" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
      <div class="card" style="width:380px; max-width:95vw; position:relative">
        <button onclick="document.getElementById('modal-editar').style.display='none'"
          style="position:absolute;top:10px;right:12px;border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-secondary)">✕</button>
        <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Editar Producto</h3>
        <form id="form-editar" style="display:flex; flex-direction:column; gap:10px;">
          <input type="hidden" name="id_item">
          <label style="font-size:12px;color:var(--text-secondary)">Nombre</label>
          <input name="nombre" placeholder="Nombre Comercial" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
          <label style="font-size:12px;color:var(--text-secondary)">Categoría</label>
          <select name="categoria" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
            <option value="Material">Material</option>
            <option value="Consumible">Consumible</option>
            <option value="Herramienta">Herramienta</option>
            <option value="Equipo">Equipo</option>
            <option value="EPP">EPP</option>
          </select>
          <label style="font-size:12px;color:var(--text-secondary)">Tipo de Ítem</label>
          <select name="tipo_item" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
            <option value="MATERIAL">MATERIAL</option>
            <option value="CONSUMIBLE">CONSUMIBLE</option>
            <option value="HERRAMIENTA">HERRAMIENTA</option>
            <option value="EQUIPO">EQUIPO</option>
          </select>
          <label style="font-size:12px;color:var(--text-secondary)">Unidad</label>
          <select name="unidad" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
            <option value="UND">UND</option>
            <option value="KG">KG</option>
            <option value="M">M</option>
            <option value="M2">M2</option>
            <option value="M3">M3</option>
            <option value="PAR">PAR</option>
            <option value="LOTE">LOTE</option>
            <option value="HRA">HRA</option>
            <option value="DIA">DIA</option>
            <option value="SERV">SERV</option>
          </select>
          <label style="font-size:12px;color:var(--text-secondary)">Stock Mínimo</label>
          <input name="stock_minimo" type="number" step="0.01" placeholder="Stock Mínimo" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
          <button type="submit" style="padding:10px; border:none; background:var(--bg-sidebar); border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; color:black">Guardar Cambios</button>
        </form>
      </div>
    </div>
  `;

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
             tipo_item: e.target.tipo_item.value,
             unidad: e.target.unidad.value,
             stock_minimo: Number(e.target.stock_minimo.value) || 10
         };
         try {
             const res = await api.inventory.createInventarioItem(data);
             alert('Insumo Registrado con SKU: ' + res.sku);
             window.location.reload();
         } catch(err) {
             alert('Error: ' + JSON.stringify(err.detalles || err.error || err));
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
             alert('Almacén Rebajado y Costo Transferido al Servicio Correctamente');
             window.location.reload();
         } catch(err) {
             alert('Error: ' + JSON.stringify(err.detalles || err.error || err));
         }
       };
     }

     // Form Editar
     const formEditar = document.getElementById('form-editar');
     if(formEditar) {
       formEditar.onsubmit = async (e) => {
         e.preventDefault();
         const id = Number(e.target.id_item.value);
         const data = {
           nombre: e.target.nombre.value,
           categoria: e.target.categoria.value,
           tipo_item: e.target.tipo_item.value,
           unidad: e.target.unidad.value,
           stock_minimo: Number(e.target.stock_minimo.value)
         };
         try {
           await api.inventory.updateInventarioItem(id, data);
           document.getElementById('modal-editar').style.display = 'none';
           window.location.reload();
         } catch(err) {
           alert('Error al guardar: ' + JSON.stringify(err.detalles || err.error || err));
         }
       };
     }

     window.editarItem = (id) => {
       const inv = window.__inventarioData__ || [];
       const it = inv.find(x => x.id_item == id);
       if (!it) { alert('Item no encontrado'); return; }
       const form = document.getElementById('form-editar');
       form.id_item.value = it.id_item;
       form.nombre.value = it.nombre;
       form.categoria.value = it.categoria;
       form.tipo_item.value = it.tipo_item || 'MATERIAL';
       form.unidad.value = it.unidad;
       form.stock_minimo.value = it.stock_minimo;
       document.getElementById('modal-editar').style.display = 'flex';
     };

     window.verKardex = async (id, name) => {
         try {
            const logs = await api.inventory.getKardex(id);
            let logInfo = `KÁRDEX - ${name}\n\n`;
            logs.forEach(l => {
               logInfo += `[${l.fecha_movimiento.split('T')[0]}] ${l.tipo_movimiento} | Ref: ${l.referencia_tipo}#${l.referencia_id} | Cant: ${l.cantidad} | Saldo: ${l.saldo_posterior}\n`;
            });
            if(logs.length === 0) logInfo += "Sin movimientos aún.";
            alert(logInfo);
         } catch(e) {
            alert("No se pudo extraer Kárdex");
         }
     }
  }, 100);

  // Exponer datos de inventario para el modal de edición
  window.__inventarioData__ = inventario;

  const btnStyle = 'padding:6px 12px; border:1px solid var(--border-light); border-radius:4px; cursor:pointer; font-size:12px; background:var(--bg-app)';

  return `
    ${editModal}
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
               <th>Insumo / Tipo</th>
               <th>Unidad</th>
               <th style="text-align:right">Stock Vigente</th>
               <th style="text-align:right">Costo Und (Promedio)</th>
               <th style="text-align:right">Valoración Patrimonio</th>
               <th>Acciones</th>
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
                 <select name="tipo_item" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <option value="MATERIAL">MATERIAL</option>
                    <option value="CONSUMIBLE">CONSUMIBLE</option>
                    <option value="HERRAMIENTA">HERRAMIENTA</option>
                    <option value="EQUIPO">EQUIPO</option>
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
                    ${itemOptions || '<option disabled>Sin stock disponible</option>'}
                 </select>
                 <input name="cantidad" type="number" step="0.01" placeholder="Volumen Retirado" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <button type="submit" style="padding:12px; border:none; background:var(--danger); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; font-size:14px;">Mermar Material</button>
              </form>
          </div>

       </div>
    </div>
  `;
};

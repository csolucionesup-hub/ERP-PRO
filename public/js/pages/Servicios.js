import { api } from '../services/api.js';

export const Servicios = async () => {
  let servicios = [];
  try {
    servicios = await api.services.getServicios();
    if (!Array.isArray(servicios)) servicios = [];
  } catch(err) {
    console.error('[Servicios] Error cargando datos:', err);
  }
  const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);

  const getStatusBadge = (estado) => {
    return `<span class="status-badge status-${estado?.toLowerCase()}">${estado}</span>`;
  };

  const getMarginBadge = (porcentaje) => {
    const val = porcentaje * 100;
    let color = 'var(--success)'; // > 30%
    if (val < 0) color = 'var(--danger)';
    else if (val < 30) color = '#eab308';
    return `<span style="color: ${color}; font-weight: bold">${val.toFixed(1)}%</span>`;
  };

  const rows = servicios.map(s => {
    const deudaNetaReal = (Number(s.total_base) - Number(s.monto_detraccion)) - Number(s.cobrado_liquido);
    
    return `
    <tr class="${s.estado === 'ANULADO' ? 'row-anulada' : ''}">
      <td>${s.codigo || '---'}</td>
      <td><strong>${s.cliente || '---'}</strong><br><span style="font-size:11px; color:var(--text-secondary)">${s.fecha_servicio ? s.fecha_servicio.split('T')[0] : '---'}</span></td>
      <td style="text-align:right"><strong>${formatCurrency(Number(s.ingreso_neto) || 0)}</strong><br><span style="font-size:10px">(Monto Base)</span></td>
      <td style="text-align:right; color:var(--danger)">${formatCurrency(Number(s.costos_ejecutados) || 0)}</td>
      <td style="text-align:right; font-weight:bold; color:var(--primary-color)">${formatCurrency(Number(s.utilidad_neta) || 0)}</td>
      <td style="text-align:center">${getMarginBadge(Number(s.margen_porcentual) || 0)}</td>
      
      <td style="text-align:right; background: var(--bg-app)">
         ${formatCurrency(Number(s.total_base) || 0)}<br>
         <em style="font-size:10px; color:var(--danger)">- ${formatCurrency(Number(s.monto_detraccion) || 0)} (Detracción)</em><br>
         <strong style="color:var(--success)">${formatCurrency(Number(s.cobrado_liquido) || 0)} Cobrado</strong>
      </td>
      <td style="text-align:center">
         ${getStatusBadge(s.estado)}<br>
         <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
            ${s.estado !== 'COBRADO' && s.estado !== 'ANULADO' ? `<button class="action-btn" onclick="window.modalCobrar(${s.id_servicio}, '${s.codigo}', ${deudaNetaReal})">Abonar</button>` : ''}
            ${s.estado !== 'ANULADO' ? `<button class="action-btn action-btn-anular" onclick="window.anularServicio(${s.id_servicio}, '${s.codigo}')">Anular</button>` : ''}
         </div>
      </td>
    </tr>
  `}).join('');

  setTimeout(() => {
     const formServicio = document.getElementById('form-servicio');
     if(formServicio) {
       formServicio.onsubmit = async (e) => {
         e.preventDefault();
         const data = {
             nombre: e.target.nombre.value,
             cliente: e.target.cliente.value,
             descripcion: e.target.descripcion.value,
             fecha_servicio: e.target.fecha.value,
             fecha_vencimiento: e.target.fecha_vencimiento.value || undefined,
             monto_base: Number(e.target.monto_base.value),
             aplica_igv: e.target.aplica_igv.checked,
             detraccion_porcentaje: Number(e.target.detraccion.value) || 0
         };
         try {
             await api.services.createServicio(data);
             alert('Servicio Creado Exitosamente');
             window.location.reload();
         } catch(err) {
             alert('Error: ' + JSON.stringify(err.detalles || err.error || err));
         }
       };
     }

     window.modalCobrar = async (id, codigo, maximoSugerido) => {
         const monto = prompt('Cobranza para ' + codigo + '\\nDeuda neta pendiente (Sin Detracción): S/ ' + maximoSugerido + '\\n\\nIngresa el Monto Líquido Depósitado:', maximoSugerido);
         if(monto && !isNaN(monto) && Number(monto) > 0) {
             try {
                const res = await api.services.cobrarServicio(id, Number(monto));
                alert('Cobranza Registrada. Nuevo Estado: ' + res.estado_actualizado);
                window.location.reload();
             } catch (e) {
                alert('Error al liquidar: ' + JSON.stringify(e.detalles || e.error || e));
             }
         }
     }

     window.anularServicio = async (id, codigo) => {
        if(confirm(`¡CRÍTICO!\\n¿Seguro que deseas ANULAR el servicio ${codigo}?\\n\\nSi existen suministros consumidos, estos VOLVERÁN al inventario automáticamente.`)) {
            try {
               await api.services.anularServicio(id);
               alert('Servicio Anulado y Stock Reintegrado');
               window.location.reload();
            } catch (e) {
               alert('Error al anular: ' + (e.message || JSON.stringify(e)));
            }
        }
     }
  }, 100);

  return `
    <header class="header">
      <div>
         <h1>Facturación de Servicios y Utilidad Real</h1>
         <span style="color:var(--text-secondary)">Control profesional de rentabilidad operativa y cobranzas.</span>
      </div>
    </header>
    
    <div style="display:flex; gap: 20px; align-items:flex-start; margin-top: 20px;">
       
       <div style="flex:1; display:flex; flex-direction:column; gap: 20px;">
          <div class="card" style="border-top: 4px solid var(--primary-color)">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Emitir Venta de Servicio</h3>
              <form id="form-servicio" style="display:flex; flex-direction:column; gap:12px;">
                 <input name="cliente" placeholder="Razón Social Cliente" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="nombre" placeholder="Concepto del Servicio" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 
                 <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Fecha Proforma</label>
                       <input name="fecha" type="date" required style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Monto Neto (Base)</label>
                       <input name="monto_base" type="number" step="0.01" required style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                 </div>

                 <div style="display:flex; gap:10px; align-items:center; background:var(--bg-app); padding:10px; border-radius:4px;">
                    <label style="font-size:12px; font-weight:bold; display:flex; gap:8px; align-items:center;">
                       <input type="checkbox" name="aplica_igv"> + 18% IGV Tributario
                    </label>
                 </div>

                 <div style="display:flex; flex-direction:column; gap:5px;">
                    <label style="font-size:11px; color:var(--text-secondary)">Detracción Gubernamental (%)</label>
                    <select name="detraccion" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                       <option value="0">0% - Sin Detracción</option>
                       <option value="12">12% - Mantenimiento</option>
                       <option value="10">10% - Otros</option>
                    </select>
                 </div>

                 <button type="submit" style="padding:12px; border:none; background:var(--primary-color); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; font-size:14px; margin-top:5px;">Generar Obligación</button>
              </form>
          </div>
       </div>

       <div class="table-container" style="flex:3; overflow-x: auto;">
         <table>
           <thead>
             <tr>
               <th>TICKET</th>
               <th>Cliente / Fecha</th>
               <th style="text-align:right">Base Neto</th>
               <th style="text-align:right">(-) Costos</th>
               <th style="text-align:right">Utilidad</th>
               <th style="text-align:center">Margen</th>
               <th style="text-align:right">Liquidación</th>
               <th style="text-align:center">Acciones</th>
             </tr>
           </thead>
           <tbody>
             ${rows || '<tr><td colspan="8" style="text-align:center">Sin datos</td></tr>'}
           </tbody>
         </table>
       </div>
    </div>
  `;
};

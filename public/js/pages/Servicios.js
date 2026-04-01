import { api } from '../services/api.js';

export const Servicios = async () => {
  let servicios = [], tcHoy = { valor_venta: 1, es_hoy: false, fecha: '' };
  try {
    [servicios, tcHoy] = await Promise.all([
      api.services.getServicios(),
      api.tipoCambio.getHoy('USD').catch(() => ({ valor_venta: 1, es_hoy: false, fecha: '' }))
    ]);
    if (!Array.isArray(servicios)) servicios = [];
  } catch(err) {
    console.error('[Servicios] Error cargando datos:', err);
  }
  const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);
  const formatUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

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
    const netoACobrar = Number(s.total_base) - Number(s.monto_detraccion) - Number(s.monto_retencion || 0);
    const deudaNetaReal = netoACobrar - Number(s.cobrado_liquido);
    const esUSD = s.moneda === 'USD';
    const tc = Number(s.tipo_cambio) || 1;
    const montoBaseOriginal = Number(s.ingreso_neto) || 0;
    const montoBasePEN = esUSD ? montoBaseOriginal * tc : montoBaseOriginal;

    return `
    <tr class="${s.estado === 'ANULADO' ? 'row-anulada' : ''}">
      <td>${s.codigo || '---'}${s.nro_cotizacion ? `<br><span style="font-size:11px; color:var(--text-secondary)">${s.nro_cotizacion}</span>` : ''}
        ${esUSD ? `<br><span style="font-size:10px;background:#1d4ed8;color:white;padding:1px 5px;border-radius:3px">USD</span>` : ''}
      </td>
      <td><strong>${s.cliente || '---'}</strong><br><span style="font-size:11px; color:var(--text-secondary)">${s.fecha_servicio ? s.fecha_servicio.split('T')[0] : '---'}</span></td>
      <td style="text-align:right">
        <strong>${esUSD ? formatUSD(montoBaseOriginal) : formatCurrency(montoBaseOriginal)}</strong>
        ${esUSD ? `<br><span style="font-size:10px;color:var(--text-secondary)">${formatCurrency(montoBasePEN)} (TC ${tc})</span>` : '<br><span style="font-size:10px">(Monto Base)</span>'}
      </td>
      <td style="text-align:right; color:var(--danger)">${formatCurrency(Number(s.costos_ejecutados) || 0)}</td>
      <td style="text-align:right; font-weight:bold; color:var(--primary-color)">${formatCurrency(Number(s.utilidad_neta) || 0)}</td>
      <td style="text-align:center">${getMarginBadge(Number(s.margen_porcentual) || 0)}</td>
      
      <td style="text-align:right; background:var(--bg-app); font-size:12px; line-height:1.8; padding:8px">
         <div>Factura: <strong>${formatCurrency(Number(s.total_base))}</strong></div>
         <div style="color:var(--text-secondary)">IGV: ${formatCurrency(Number(s.igv_base))}</div>
         ${Number(s.monto_detraccion) > 0 ? `<div style="color:#e67e22">Detrac. ${Number(s.detraccion_porcentaje)}%: -${formatCurrency(Number(s.monto_detraccion))} <span style="font-size:10px;cursor:pointer;text-decoration:underline" onclick="window.toggleDetraccion(${s.id_servicio})">[${s.detraccion_depositada === 'SI' ? 'Depositado ✓' : 'Pend. depósito'}]</span></div>` : ''}
         ${Number(s.monto_retencion) > 0 ? `<div style="color:#e67e22">Retenc. ${Number(s.retencion_porcentaje)}%: -${formatCurrency(Number(s.monto_retencion))}</div>` : ''}
         <div style="border-top:1px solid var(--border-light); margin-top:4px; padding-top:4px">
            Neto: <strong>${formatCurrency(netoACobrar)}</strong>
         </div>
         <div style="color:var(--success)">Cobrado: ${formatCurrency(Number(s.cobrado_liquido))}</div>
         ${deudaNetaReal > 0.5 ? `<div style="color:var(--danger)">Pend: ${formatCurrency(deudaNetaReal)}</div>` : ''}
      </td>
      <td style="text-align:center">
         ${getStatusBadge(s.estado)}<br>
         <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
            ${s.estado !== 'COBRADO' && s.estado !== 'ANULADO' ? `<button class="action-btn" onclick="window.modalCobrar(${s.id_servicio}, '${s.codigo}', ${deudaNetaReal})">Abonar</button>` : ''}
            ${s.estado !== 'ANULADO' && s.estado !== 'COBRADO' ? `<button class="action-btn" style="background:var(--info);color:white" onclick="window.editarServicio(${s.id_servicio})">Editar</button>` : ''}
            ${s.estado === 'PENDIENTE' ? `<button class="action-btn" style="background:#ef4444;color:white" onclick="window.eliminarServicio(${s.id_servicio}, '${s.codigo}')">Eliminar</button>` : ''}
            ${s.estado_trabajo === 'ACTIVO' ? `<button class="action-btn" style="background:#22c55e;color:white;font-size:11px" onclick="window.terminarServicio(${s.id_servicio})">Terminado</button>` : `<span style="font-size:11px;color:var(--text-secondary)">Terminado ✓</span>`}
            ${s.estado !== 'ANULADO' ? `<button class="action-btn action-btn-anular" onclick="window.anularServicio(${s.id_servicio}, '${s.codigo}')">Anular</button>` : ''}
         </div>
      </td>
    </tr>
  `}).join('');

  setTimeout(() => {
     const formServicio = document.getElementById('form-servicio');
     if(formServicio) {
       // Mostrar/ocultar campo tipo cambio según moneda
       const srvMonedaSel = document.getElementById('srv-moneda');
       const divTCSrv = document.getElementById('div-tc-srv');
       if (srvMonedaSel && divTCSrv) {
         srvMonedaSel.onchange = () => {
           divTCSrv.style.display = srvMonedaSel.value === 'USD' ? 'block' : 'none';
         };
       }

       formServicio.onsubmit = async (e) => {
         e.preventDefault();
         const moneda = e.target.moneda.value || 'PEN';
         const data = {
             nro_cotizacion: e.target.nro_cotizacion.value || '',
             nombre: e.target.nombre.value,
             cliente: e.target.cliente.value,
             descripcion: e.target.descripcion.value,
             fecha_servicio: e.target.fecha.value,
             fecha_vencimiento: e.target.fecha_vencimiento?.value || undefined,
             moneda,
             tipo_cambio: moneda === 'USD' ? Number(e.target.tipo_cambio.value) || 1 : 1,
             monto_base: Number(e.target.monto_base.value),
             aplica_igv: e.target.aplica_igv.checked,
             detraccion_porcentaje: Number(e.target.detraccion.value) || 0,
             retencion_porcentaje: Number(e.target.retencion.value) || 0
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

     window.modalCobrar = async (id, codigo, pendiente) => {
         const monto = prompt(
             'COBRO — ' + codigo +
             '\nPendiente: S/ ' + pendiente.toFixed(2) +
             '\nIngresa monto depositado:', pendiente.toFixed(2)
         );
         if (monto && !isNaN(monto) && Number(monto) > 0) {
             try {
                 const res = await api.services.cobrarServicio(id, Number(monto));
                 alert(res.estado_actualizado === 'COBRADO' ? '¡Factura 100% cobrada!' : 'Adelanto registrado (PARCIAL)');
                 window.location.reload();
             } catch (e) { alert('Error: ' + JSON.stringify(e.detalles||e.error||e)); }
         }
     };

     window.editarServicio = (id) => {
         const srv = servicios.find(s => s.id_servicio === id);
         if (!srv) return alert('No encontrado');

         const overlay = document.createElement('div');
         overlay.id = 'modal-editar-overlay';
         overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';

         overlay.innerHTML = `
           <div style="background:white;border-radius:12px;padding:30px;width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
             <h3 style="margin:0 0 20px;font-size:18px">Editar Servicio ${srv.codigo}</h3>
             <form id="form-editar" style="display:flex;flex-direction:column;gap:12px">
               <label style="font-size:12px;color:var(--text-secondary)">N° Cotización</label>
               <input name="nro_cotizacion" value="${srv.nro_cotizacion || ''}" style="padding:10px;border:1px solid #ddd;border-radius:6px">
               <label style="font-size:12px;color:var(--text-secondary)">Cliente</label>
               <input name="cliente" value="${srv.cliente || ''}" required style="padding:10px;border:1px solid #ddd;border-radius:6px">
               <label style="font-size:12px;color:var(--text-secondary)">Concepto del Servicio</label>
               <input name="nombre" value="${srv.nombre || ''}" required style="padding:10px;border:1px solid #ddd;border-radius:6px">
               <label style="font-size:12px;color:var(--text-secondary)">Descripción</label>
               <textarea name="descripcion" rows="2" style="padding:10px;border:1px solid #ddd;border-radius:6px;resize:vertical">${srv.descripcion || ''}</textarea>
               <div style="display:flex;gap:10px">
                 <div style="flex:1">
                   <label style="font-size:12px;color:var(--text-secondary)">Fecha Servicio</label>
                   <input name="fecha_servicio" type="date" value="${srv.fecha_servicio ? srv.fecha_servicio.split('T')[0] : ''}" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px">
                 </div>
                 <div style="flex:1">
                   <label style="font-size:12px;color:var(--text-secondary)">Monto Base (sin IGV)</label>
                   <input name="monto_base" type="number" step="0.01" value="${srv.ingreso_neto || 0}" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px">
                 </div>
               </div>
               <div style="display:flex;gap:10px;align-items:center;background:#f8f9fa;padding:10px;border-radius:6px">
                 <label style="font-size:12px;font-weight:bold;display:flex;gap:8px;align-items:center">
                   <input type="checkbox" name="aplica_igv" ${Number(srv.igv_base) > 0 ? 'checked' : ''}> + 18% IGV
                 </label>
               </div>
               <div style="display:flex;gap:10px">
                 <div style="flex:1">
                   <label style="font-size:12px;color:var(--text-secondary)">Detracción %</label>
                   <select name="detraccion_porcentaje" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px">
                     <option value="0" ${Number(srv.detraccion_porcentaje)==0?'selected':''}>0%</option>
                     <option value="3" ${Number(srv.detraccion_porcentaje)==3?'selected':''}>3%</option>
                     <option value="4" ${Number(srv.detraccion_porcentaje)==4?'selected':''}>4%</option>
                     <option value="10" ${Number(srv.detraccion_porcentaje)==10?'selected':''}>10%</option>
                     <option value="12" ${Number(srv.detraccion_porcentaje)==12?'selected':''}>12%</option>
                   </select>
                 </div>
                 <div style="flex:1">
                   <label style="font-size:12px;color:var(--text-secondary)">Retención %</label>
                   <select name="retencion_porcentaje" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px">
                     <option value="0" ${Number(srv.retencion_porcentaje)==0?'selected':''}>0%</option>
                     <option value="3" ${Number(srv.retencion_porcentaje)==3?'selected':''}>3%</option>
                   </select>
                 </div>
               </div>
               <div style="display:flex;gap:10px;margin-top:10px">
                 <button type="submit" style="flex:1;padding:12px;border:none;background:var(--primary-color);color:white;border-radius:6px;cursor:pointer;font-weight:bold">Guardar Cambios</button>
                 <button type="button" onclick="document.getElementById('modal-editar-overlay').remove()" style="flex:1;padding:12px;border:1px solid #ddd;background:white;border-radius:6px;cursor:pointer">Cancelar</button>
               </div>
             </form>
           </div>
         `;

         document.body.appendChild(overlay);
         overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

         document.getElementById('form-editar').onsubmit = async (e) => {
             e.preventDefault();
             const f = e.target;
             try {
                 await api.services.updateServicio(id, {
                     nro_cotizacion: f.nro_cotizacion.value,
                     nombre: f.nombre.value,
                     cliente: f.cliente.value,
                     descripcion: f.descripcion.value,
                     fecha_servicio: f.fecha_servicio.value,
                     monto_base: Number(f.monto_base.value),
                     aplica_igv: f.aplica_igv.checked,
                     detraccion_porcentaje: Number(f.detraccion_porcentaje.value),
                     retencion_porcentaje: Number(f.retencion_porcentaje.value)
                 });
                 alert('Servicio actualizado');
                 window.location.reload();
             } catch(err) { alert('Error: ' + JSON.stringify(err.detalles||err.error||err)); }
         };
     };

     window.terminarServicio = async (id) => {
         if (confirm('¿Marcar servicio como TERMINADO? Ya no aparecerá en la lista de gastos.')) {
             try {
                 await fetch('/api/servicios/' + id + '/terminar', { method: 'POST' });
                 alert('Servicio marcado como terminado');
                 window.location.reload();
             } catch(e) { alert('Error: ' + JSON.stringify(e)); }
         }
     };

     window.toggleDetraccion = async (idServicio) => {
         if (confirm('¿El cliente ya depositó la detracción en la cuenta del Banco de la Nación?')) {
             try {
                 const res = await fetch('/api/servicios/' + idServicio + '/detraccion-deposito', {
                     method: 'POST', headers: {'Content-Type': 'application/json'}
                 });
                 if (!res.ok) throw await res.json();
                 alert('Detracción marcada como depositada');
                 window.location.reload();
             } catch(e) { alert('Error: ' + JSON.stringify(e)); }
         }
     };

     window.eliminarServicio = async (id, codigo) => {
         if (confirm('¿Eliminar ' + codigo + ' permanentemente?\nSolo funciona si está PENDIENTE y sin cobros.')) {
             try {
                 await api.services.deleteServicio(id);
                 alert('Eliminado');
                 window.location.reload();
             } catch(e) { alert('Error: ' + JSON.stringify(e.detalles||e.error||e)); }
         }
     };

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
                 <input name="nro_cotizacion" placeholder="N° Cotización (Ej: COT 101)" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="cliente" placeholder="Razón Social Cliente" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="nombre" placeholder="Concepto del Servicio" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <textarea name="descripcion" placeholder="Descripción del servicio (opcional)" rows="2" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light); resize:vertical; font-family:inherit"></textarea>
                 
                 <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Fecha Proforma</label>
                       <input name="fecha" type="date" required style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Fecha Vencimiento (opcional)</label>
                       <input name="fecha_vencimiento" type="date" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                 </div>

                 <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Moneda</label>
                       <select name="moneda" id="srv-moneda" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                          <option value="PEN">S/. Soles (PEN)</option>
                          <option value="USD">$ Dólares (USD)</option>
                       </select>
                    </div>
                    <div id="div-tc-srv" style="flex:1; display:none;">
                       <label style="font-size:11px; color:var(--text-secondary)">Tipo de Cambio (venta)</label>
                       <input name="tipo_cambio" id="srv-tipo-cambio" type="number" step="0.0001" value="${tcHoy.valor_venta || 1}" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                       <span style="font-size:10px;color:var(--text-secondary)">SBS ${tcHoy.es_hoy ? 'hoy' : (tcHoy.fecha || 'sin datos')}: ${tcHoy.valor_venta}</span>
                    </div>
                 </div>

                 <div style="display:flex; gap:10px;">
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

                 <div style="display:flex; gap:10px;">
                   <div style="flex:1">
                     <label style="font-size:11px; color:var(--text-secondary)">Detracción (%)</label>
                     <select name="detraccion" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light); width:100%">
                        <option value="0">0% - Sin Detracción</option>
                        <option value="3">3% - Especial</option>
                        <option value="4">4% - Especial</option>
                        <option value="10">10% - Otros servicios</option>
                        <option value="12">12% - Construcción</option>
                     </select>
                   </div>
                   <div style="flex:1">
                     <label style="font-size:11px; color:var(--text-secondary)">Retención (%)</label>
                     <select name="retencion" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light); width:100%">
                        <option value="0">0% - Sin Retención</option>
                        <option value="3">3% - Agente Retención</option>
                     </select>
                   </div>
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

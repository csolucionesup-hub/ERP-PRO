import { api } from '../services/api.js';

export const Finanzas = async () => {
  let gastos = [], cxp = [], serviciosActivos = [], tcHoy = { valor_venta: 1, es_hoy: false, fecha: '' };
  try {
    [gastos, cxp, serviciosActivos, tcHoy] = await Promise.all([
      api.finances.getGastos(),
      api.finances.getCxP(),
      api.services.getServiciosActivos(),
      api.tipoCambio.getHoy('USD').catch(() => ({ valor_venta: 1, es_hoy: false, fecha: '' }))
    ]);
    if (!Array.isArray(gastos)) gastos = [];
    if (!Array.isArray(cxp)) cxp = [];
    if (!Array.isArray(serviciosActivos)) serviciosActivos = [];
  } catch(err) {
    console.error('[Finanzas] Error cargando datos:', err);
  }

  const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);
  const formatUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val) || 0);

  const gastosRows = gastos.map(g => {
    const pendiente = Number(g.total_base) - Number(g.pagado || 0);
    const esUSD = g.moneda === 'USD';
    const tc = Number(g.tipo_cambio) || 1;
    const totalOriginal = Number(g.total_base);
    const totalPEN = esUSD ? totalOriginal * tc : totalOriginal;
    return `
    <tr>
      <td>${g.nro_oc || '---'}<br><span style="font-size:10px;color:var(--text-secondary)">${g.codigo_contador || ''}</span></td>
      <td>${g.fecha ? g.fecha.split('T')[0] : '---'}</td>
      <td><strong>${g.concepto}</strong><br><span style="font-size:11px;color:var(--text-secondary)">${g.proveedor_nombre || '---'}</span></td>
      <td>${g.servicio_codigo ? '<span style="background:var(--primary-color);color:white;padding:2px 8px;border-radius:10px;font-size:11px">' + g.servicio_codigo + '</span>' : '<span style="color:var(--text-secondary)">Operativo</span>'}</td>
      <td style="text-align:right">
        ${esUSD ? `<strong>${formatUSD(totalOriginal)}</strong><br><span style="font-size:10px;color:var(--text-secondary)">${formatCurrency(totalPEN)} (TC ${tc})</span>` : formatCurrency(totalOriginal)}
      </td>
      <td style="text-align:right;color:var(--success)">${formatCurrency(Number(g.pagado || 0))}</td>
      <td style="text-align:center"><span class="status-badge status-${(g.estado_pago||'pendiente').toLowerCase()}">${g.estado_pago}</span></td>
      <td>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${g.estado_pago !== 'PAGADO' && g.estado !== 'ANULADO' ? '<button class="action-btn" onclick="window.modalPagarGasto(' + g.id_gasto + ',\'' + g.concepto + '\',' + pendiente + ')">Pagar</button>' : ''}
          ${g.estado_pago === 'PENDIENTE' ? '<button class="action-btn" style="background:var(--info);color:white" onclick="window.editarGasto(' + g.id_gasto + ')">Editar</button>' : ''}
          ${g.estado_pago === 'PENDIENTE' ? '<button class="action-btn" style="background:#ef4444;color:white" onclick="window.eliminarGasto(' + g.id_gasto + ')">Eliminar</button>' : ''}
          ${g.estado !== 'ANULADO' && g.estado_pago !== 'PENDIENTE' ? '<button class="action-btn action-btn-anular" onclick="window.anularGasto(' + g.id_gasto + ',\'' + g.concepto + '\')">Anular</button>' : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  const cxpRows = cxp.map(c => `
    <tr class="${c.estado === 'ANULADO' ? 'row-anulada' : ''}">
      <td>${c.tipo || '---'}</td>
      <td><strong>${c.acreedor || '---'}</strong><br><span style="font-size:11px; color:var(--text-secondary)">Doc: ${c.doc || 'S/N'}</span></td>
      <td>${c.fecha ? c.fecha.split('T')[0] : '---'}</td>
      <td style="text-align:right"><strong>${formatCurrency(Number(c.total_base) || 0)}</strong></td>
      <td style="text-align:right" class="color-error">- ${formatCurrency(Number(c.deuda_activa) || 0)}</td>
      <td style="text-align:center">
         <span class="status-badge status-${(c.estado || 'pendiente').toLowerCase()}">${c.estado || '---'}</span><br>
         <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
            ${c.tipo === 'GASTO' && c.estado !== 'PAGADO' && c.estado !== 'ANULADO' ? `<button class="action-btn" onclick="window.modalPagarGasto(${c.id}, '${c.acreedor}', ${Number(c.deuda_activa) || 0})">Lograr Pago</button>` : ''}
            ${c.tipo === 'GASTO' && c.estado !== 'ANULADO' ? `<button class="action-btn action-btn-anular" onclick="window.anularGasto(${c.id}, '${c.acreedor}')">Anular</button>` : ''}
         </div>
      </td>
    </tr>
  `).join('');

  setTimeout(() => {
     const formGasto = document.getElementById('form-gasto');
     if(formGasto) {
       const selTipo = document.getElementById('select-tipo-gasto');
       if (selTipo) {
           selTipo.onchange = () => {
               document.getElementById('div-servicio').style.display = selTipo.value === 'SERVICIO' ? 'block' : 'none';
               document.getElementById('div-detraccion-gasto').style.display = selTipo.value === 'SERVICIO' ? 'block' : 'none';
           };
       }

       // Mostrar/ocultar tipo cambio
       const gastoMonedaSel = document.getElementById('gasto-moneda');
       const divTCGasto = document.getElementById('div-tc-gasto');
       if (gastoMonedaSel && divTCGasto) {
         gastoMonedaSel.onchange = () => {
           divTCGasto.style.display = gastoMonedaSel.value === 'USD' ? 'block' : 'none';
         };
       }

       formGasto.onsubmit = async (e) => {
         e.preventDefault();
         const moneda = e.target.moneda.value || 'PEN';
         const data = {
             nro_oc: e.target.nro_oc.value || '',
             codigo_contador: e.target.codigo_contador.value || '',
             tipo_gasto: e.target.tipo_gasto.value,
             id_servicio: e.target.id_servicio?.value ? parseInt(e.target.id_servicio.value) : null,
             concepto: e.target.concepto.value,
             proveedor_nombre: e.target.proveedor_nombre.value,
             fecha: e.target.fecha.value,
             nro_comprobante: e.target.nro_comprobante?.value || '',
             moneda,
             tipo_cambio: moneda === 'USD' ? Number(e.target.tipo_cambio?.value) || 1 : 1,
             monto_base: Number(e.target.monto_base.value),
             aplica_igv: e.target.aplica_igv.checked,
             detraccion_porcentaje: Number(e.target.detraccion?.value || 0)
         };
         try {
             await api.finances.createGasto(data);
             alert('Gasto Registrado con Éxito');
             window.location.reload();
         } catch(err) {
             alert('Error: ' + JSON.stringify(err.detalles || err.error || err));
         }
       };
     }

     window.modalPagarGasto = async (id, nombre, deuda) => {
         const monto = prompt('Pago para ' + nombre + '\\nDeuda neta pendiente: S/ ' + deuda + '\\n\\nIngresa el Monto Depósitado:', deuda);
         if(monto && !isNaN(monto) && Number(monto) > 0) {
             try {
                const res = await api.finances.pagarGasto(id, Number(monto));
                alert('Libro de Caja Actualizado. Estado: ' + res.nwStatus);
                window.location.reload();
             } catch (e) {
                alert('Error al liquidar: ' + JSON.stringify(e.detalles || e.error || e));
             }
         }
     }

     window.editarGasto = (id) => {
         const g = gastos.find(x => x.id_gasto === id);
         if (!g) return alert('No encontrado');
         const overlay = document.createElement('div');
         overlay.id = 'modal-editar-gasto';
         overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';
         overlay.innerHTML = `
           <div style="background:white;border-radius:12px;padding:30px;width:480px;max-height:90vh;overflow-y:auto">
             <h3 style="margin:0 0 20px">Editar Gasto</h3>
             <form id="form-editar-gasto" style="display:flex;flex-direction:column;gap:12px">
               <div style="display:flex;gap:10px">
                 <div style="flex:1"><label style="font-size:11px">N° OC</label>
                   <input name="nro_oc" value="${g.nro_oc||''}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px"></div>
                 <div style="flex:1"><label style="font-size:11px">Cód. Contador</label>
                   <input name="codigo_contador" value="${g.codigo_contador||''}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px"></div>
               </div>
               <label style="font-size:11px">Proveedor</label>
               <input name="proveedor_nombre" value="${g.proveedor_nombre||''}" required style="padding:10px;border:1px solid #ddd;border-radius:6px">
               <label style="font-size:11px">Concepto</label>
               <input name="concepto" value="${g.concepto||''}" required style="padding:10px;border:1px solid #ddd;border-radius:6px">
               <div style="display:flex;gap:10px">
                 <div style="flex:1"><label style="font-size:11px">Fecha</label>
                   <input name="fecha" type="date" value="${g.fecha?g.fecha.split('T')[0]:''}" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px"></div>
                 <div style="flex:1"><label style="font-size:11px">Monto Base</label>
                   <input name="monto_base" type="number" step="0.01" value="${g.monto_base||0}" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px"></div>
               </div>
               <label style="display:flex;gap:8px;align-items:center;font-size:12px"><input type="checkbox" name="aplica_igv" ${g.aplica_igv?'checked':''}> + IGV 18%</label>
               <div style="display:flex;gap:10px;margin-top:10px">
                 <button type="submit" style="flex:1;padding:12px;border:none;background:var(--primary-color);color:white;border-radius:6px;cursor:pointer;font-weight:bold">Guardar</button>
                 <button type="button" onclick="document.getElementById('modal-editar-gasto').remove()" style="flex:1;padding:12px;border:1px solid #ddd;background:white;border-radius:6px;cursor:pointer">Cancelar</button>
               </div>
             </form>
           </div>`;
         document.body.appendChild(overlay);
         overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
         document.getElementById('form-editar-gasto').onsubmit = async (e) => {
             e.preventDefault();
             const f = e.target;
             try {
                 const res = await fetch('/api/gastos/' + id, {
                     method: 'PUT', headers: {'Content-Type': 'application/json'},
                     body: JSON.stringify({
                         nro_oc: f.nro_oc.value, codigo_contador: f.codigo_contador.value,
                         proveedor_nombre: f.proveedor_nombre.value, concepto: f.concepto.value,
                         fecha: f.fecha.value, monto_base: Number(f.monto_base.value),
                         aplica_igv: f.aplica_igv.checked
                     })
                 });
                 if (!res.ok) throw await res.json();
                 alert('Gasto actualizado');
                 window.location.reload();
             } catch(err) { alert('Error: ' + JSON.stringify(err)); }
         };
     };

     window.eliminarGasto = async (id) => {
         if (confirm('¿Eliminar este gasto permanentemente?')) {
             try {
                 const res = await fetch('/api/gastos/' + id, { method: 'DELETE' });
                 if (!res.ok) throw await res.json();
                 alert('Eliminado');
                 window.location.reload();
             } catch(e) { alert('Error: ' + JSON.stringify(e.detalles||e.error||e)); }
         }
     };

     window.anularGasto = async (id, nombre) => {
        if(confirm(`¡ADVERTENCIA!\\n¿Seguro que deseas ANULAR el gasto: ${nombre}?\\n\\nEsta acción reversará la obligación y anulará cualquier pago financiero asociado.`)) {
            try {
               await api.finances.anularGasto(id);
               alert('Gasto Anulado Correctamente');
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
         <h1>Gastos y Cuentas por Pagar (AP)</h1>
         <span style="color:var(--text-secondary)">Gestión profesional de pasivos y costos fijos operativos.</span>
      </div>
    </header>
    
    <div style="display:flex; gap: 20px; align-items:flex-start; margin-top: 20px;">
       
       <div style="flex:1; display:flex; flex-direction:column; gap: 20px;">
          <div class="card" style="border-top: 4px solid var(--danger)">
              <h3 style="margin-bottom:15px; font-weight:600; font-size:15px">Registrar Nuevo Gasto</h3>
              <form id="form-gasto" style="display:flex; flex-direction:column; gap:12px;">

                 <select name="tipo_gasto" id="select-tipo-gasto" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    <option value="OPERATIVO">Gasto Operativo (general)</option>
                    <option value="SERVICIO">Gasto de Servicio (proyecto)</option>
                 </select>

                 <div id="div-servicio" style="display:none">
                    <label style="font-size:11px; color:var(--text-secondary)">Servicio activo</label>
                    <select name="id_servicio" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light); width:100%">
                       <option value="">-- Seleccionar servicio --</option>
                       ${serviciosActivos.map(s => '<option value="' + s.id_servicio + '">' + (s.nro_cotizacion || s.codigo) + ' - ' + s.cliente + ' (' + s.nombre + ')</option>').join('')}
                    </select>
                 </div>

                 <div style="display:flex; gap:10px">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">N° Orden de Compra</label>
                       <input name="nro_oc" placeholder="Ej: OC 159" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Código Contador</label>
                       <input name="codigo_contador" placeholder="Código asignado" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                 </div>
                 <input name="proveedor_nombre" placeholder="Proveedor / Entidad" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="concepto" placeholder="Concepto (Ej: Alquiler, Soldadura)" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">

                 <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Fecha</label>
                       <input name="fecha" type="date" required style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Importe SIN IGV</label>
                       <input name="monto_base" type="number" step="0.01" required style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                 </div>

                 <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Moneda</label>
                       <select name="moneda" id="gasto-moneda" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                          <option value="PEN">S/. Soles (PEN)</option>
                          <option value="USD">$ Dólares (USD)</option>
                       </select>
                    </div>
                    <div style="flex:1" id="div-tc-gasto" style="display:none">
                       <label style="font-size:11px; color:var(--text-secondary)">Tipo de Cambio (venta)</label>
                       <input name="tipo_cambio" id="gasto-tipo-cambio" type="number" step="0.0001" value="${tcHoy.valor_venta || 1}" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                       <span style="font-size:10px;color:var(--text-secondary)">SBS ${tcHoy.es_hoy ? 'hoy' : (tcHoy.fecha || 'sin datos')}: ${tcHoy.valor_venta}</span>
                    </div>
                 </div>

                 <input name="nro_comprobante" placeholder="Nro Factura / Recibo" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">

                 <div style="display:flex; gap:15px; align-items:center; background:var(--bg-app); padding:10px; border-radius:4px;">
                    <label style="font-size:12px; font-weight:bold; display:flex; gap:8px; align-items:center;">
                       <input type="checkbox" name="aplica_igv"> + IGV 18%
                    </label>
                 </div>

                 <div id="div-detraccion-gasto" style="display:none">
                    <label style="font-size:11px; color:var(--text-secondary)">Detracción a retener al proveedor (%)</label>
                    <select name="detraccion" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light); width:100%">
                       <option value="0">0% - Sin Detracción</option>
                       <option value="3">3%</option>
                       <option value="4">4%</option>
                       <option value="10">10%</option>
                       <option value="12">12%</option>
                    </select>
                    <span style="font-size:10px; color:var(--danger)">Nosotros retenemos este % y debemos depositarlo en la cuenta BN del proveedor</span>
                 </div>

                 <button type="submit" style="padding:12px; border:none; background:var(--danger); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; margin-top:5px;">Registrar Gasto</button>
              </form>
          </div>
       </div>

       <div class="table-container" style="flex:2.5; overflow-x: auto;">
         <table>
           <thead>
             <tr>
               <th>TIPO</th>
               <th>Acreedor</th>
               <th>Fecha</th>
               <th style="text-align:right">Total</th>
               <th style="text-align:right">Pendiente</th>
               <th style="text-align:center">Acciones</th>
             </tr>
           </thead>
           <tbody>
             ${cxpRows || '<tr><td colspan="6" style="text-align:center">Historial Limpio</td></tr>'}
           </tbody>
         </table>
       </div>
    </div>

    <h2 style="font-size:16px; margin:35px 0 15px; text-transform:uppercase; letter-spacing:1px; color:var(--text-primary)">Historial de Gastos</h2>
    <div class="table-container" style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>OC / Cód</th><th>Fecha</th><th>Concepto / Proveedor</th><th>Servicio</th>
          <th style="text-align:right">Total</th><th style="text-align:right">Pagado</th>
          <th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody>${gastosRows || '<tr><td colspan="8" style="text-align:center">Sin gastos</td></tr>'}</tbody>
      </table>
    </div>
  `;
};

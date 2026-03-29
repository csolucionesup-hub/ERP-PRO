import { api } from '../services/api.js';

export const Finanzas = async () => {
  let gastos = [], cxp = [];
  try {
    [gastos, cxp] = await Promise.all([
      api.finances.getGastos(),
      api.finances.getCxP()
    ]);
    if (!Array.isArray(gastos)) gastos = [];
    if (!Array.isArray(cxp)) cxp = [];
  } catch(err) {
    console.error('[Finanzas] Error cargando datos:', err);
  }

  const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);

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
       formGasto.onsubmit = async (e) => {
         e.preventDefault();
         const data = {
             concepto: e.target.concepto.value,
             proveedor_nombre: e.target.proveedor_nombre.value,
             fecha: e.target.fecha.value,
             nro_comprobante: e.target.nro_comprobante.value,
             monto_base: Number(e.target.monto_base.value),
             aplica_igv: e.target.aplica_igv.checked
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
                 <input name="proveedor_nombre" placeholder="Proveedor / Entidad" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 <input name="concepto" placeholder="Concepto (Ej: Alquiler, Luz)" required style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                 
                 <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Fecha Punteo</label>
                       <input name="fecha" type="date" required style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                    <div style="flex:1">
                       <label style="font-size:11px; color:var(--text-secondary)">Importe SIN IGV</label>
                       <input name="monto_base" type="number" step="0.01" required style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">
                    </div>
                 </div>

                 <input name="nro_comprobante" placeholder="Nro Correlativo / Recibo" style="padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light)">

                 <div style="display:flex; gap:15px; align-items:center; background:var(--bg-app); padding:10px; border-radius:4px;">
                    <label style="font-size:12px; font-weight:bold; display:flex; gap:8px; align-items:center;">
                       <input type="checkbox" name="aplica_igv"> + IGV Fiscalizable
                    </label>
                 </div>

                 <button type="submit" style="padding:12px; border:none; background:var(--danger); color:white; border-radius:var(--radius-sm); cursor:pointer; font-weight:bold; margin-top:5px;">Registrar Pasivo</button>
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
  `;
};

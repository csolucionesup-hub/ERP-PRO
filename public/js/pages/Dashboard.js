import { api } from '../services/api.js';

export const Dashboard = async () => {
  try {
    const [dataMaster, dataOperativa, dataBN, dataIGV, prestamosTotales, prestamosTomados, prestamosOtorgados] = await Promise.all([
      api.finances.getDashboard(),
      api.finances.getResumenOperativo(),
      api.tributario.getCuentaBN(),
      api.tributario.getControlIGV(),
      api.prestamos.getTotales(),
      api.prestamos.getTomados(),
      api.prestamos.getOtorgados()
    ]);

    const formatCurrency = (val) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);

    const ingresosBase = Number(dataMaster.caja.ingresos_base) || 0;
    const egresosBase = Number(dataMaster.caja.egresos_base) || 0;
    const utilidadTotal = ingresosBase - egresosBase;
    const margenPromedio = ingresosBase > 0 ? ((utilidadTotal / ingresosBase) * 100).toFixed(2) : '0.00';

    let rentabilidadColor = 'var(--text-color)';
    if (utilidadTotal > 0) rentabilidadColor = 'var(--success)';
    else if (utilidadTotal < 0) rentabilidadColor = 'var(--danger)';

    const criticos = [];
    const advertencias = [];
    let totalPerdida = 0;
    let totalRiesgo = 0;

    if (dataOperativa.caja_diaria.saldo_global < 0) {
      criticos.push({
        icon: '(!)',
        title: 'CAJA ROJA',
        text: `Déficit operativo de <strong>${formatCurrency(Math.abs(dataOperativa.caja_diaria.saldo_global))}</strong>.`
      });
    }

    if (dataOperativa.alertas.perdidas) {
      dataOperativa.alertas.perdidas.forEach(s => {
        const perdida = Number(s.costos) - Number(s.monto_base);
        totalPerdida += perdida;
        criticos.push({
           icon: '[-]',
           title: 'PÉRDIDA',
           text: `Servicio ${s.codigo} pierde <strong>${formatCurrency(perdida)}</strong>`
        });
      });
    }

    if (dataOperativa.alertas.morosos) {
      dataOperativa.alertas.morosos.forEach(m => {
        const deuda = Number(m.deuda);
        totalRiesgo += deuda;
        criticos.push({
           icon: '[X]',
           title: 'VENCIDO',
           text: `${m.cliente} debe <strong>${formatCurrency(deuda)}</strong> (TKT: ${m.codigo})`
        });
      });
    }

    if (dataOperativa.alertas.margen_bajo) {
      dataOperativa.alertas.margen_bajo.forEach(s => {
        const utilidad = Number(s.monto_base) - Number(s.costos);
        const margen = ((utilidad/Number(s.monto_base)) * 100).toFixed(1);
        advertencias.push({
           icon: '[!]',
           title: 'MARGEN BAJO',
           text: `Srv ${s.codigo} con utilidad de <strong>${margen}%</strong> (${formatCurrency(utilidad)})`
        });
      });
    }

    if (dataOperativa.alertas.por_vencer) {
      dataOperativa.alertas.por_vencer.forEach(m => {
        const deuda = Number(m.deuda);
        advertencias.push({
           icon: '[/]',
           title: 'POR VENCER',
           text: `${m.cliente} debe <strong>${formatCurrency(deuda)}</strong> (en ${m.dias_restantes} días)`
        });
      });
    }

    if (dataOperativa.alertas.stock_bajo) {
      dataOperativa.alertas.stock_bajo.forEach(i => {
        advertencias.push({
           icon: '[I]',
           title: 'STOCK',
           text: `${i.nombre} al límite: <strong>${i.stock_actual} unid</strong>`
        });
      });
    }

    // Alertas préstamos tomados vencidos
    if (prestamosTomados && prestamosTomados.length > 0) {
      prestamosTomados.forEach(p => {
        if (p.estado === 'PENDIENTE' || p.estado === 'PARCIAL') {
          const dias = Number(p.dias_transcurridos) || 0;
          if (p.fecha_vencimiento && new Date(p.fecha_vencimiento) < new Date()) {
            criticos.push({
              icon: '[$]',
              title: 'PRÉSTAMO VENCIDO',
              text: 'Debo a <strong>' + p.acreedor + '</strong>: ' + formatCurrency(Number(p.saldo)) + ' (' + dias + ' días)'
            });
          } else if (dias > 60) {
            advertencias.push({
              icon: '[$]',
              title: 'DEUDA ANTIGUA',
              text: 'Debo a <strong>' + p.acreedor + '</strong>: ' + formatCurrency(Number(p.saldo)) + ' (' + dias + ' días)'
            });
          }
        }
      });
    }

    // Alertas préstamos otorgados sin cobrar
    if (prestamosOtorgados && prestamosOtorgados.length > 0) {
      prestamosOtorgados.forEach(p => {
        if (p.estado === 'PENDIENTE' || p.estado === 'PARCIAL') {
          const dias = Number(p.dias_transcurridos) || 0;
          if (dias > 30) {
            advertencias.push({
              icon: '[!]',
              title: 'DEUDOR MOROSO',
              text: '<strong>' + p.deudor + '</strong> me debe ' + formatCurrency(Number(p.saldo)) + ' (' + dias + ' días)'
            });
          }
        }
      });
    }

    const renderAlert = (item, isCritical) => `
      <div style="background:${isCritical ? '#fef2f2' : '#fffbeb'}; border-left:4px solid ${isCritical ? 'var(--danger)' : '#eab308'}; padding:12px; margin-bottom:8px; border-radius:var(--radius-sm); font-size:13px; display:flex; align-items:flex-start; box-shadow:0 1px 3px rgba(0,0,0,0.02)">
        <span style="font-size:16px; margin-right:10px; margin-top:2px; font-weight:bold; color:${isCritical ? 'red' : 'orange'}">${item.icon}</span>
        <div>
          <strong style="color:${isCritical ? '#b91c1c' : '#b45309'}">${item.title}:</strong> <span style="color:var(--text-primary)">${item.text}</span>
        </div>
      </div>
    `;

    const noAlerts = `<div style="padding:40px 20px; text-align:center; color:var(--text-secondary)">
      <div style="font-size:40px; margin-bottom:10px;">OK</div>
      <h3 style="font-size:16px; font-weight:600">Todo en Orden</h3>
      <p style="font-size:13px">No hay alertas críticas ni advertencias actuales.</p>
    </div>`;

    const alertHTML = [...criticos.map(c => renderAlert(c, true)), ...advertencias.map(a => renderAlert(a, false))].join('');

    setTimeout(() => {
      window.marcarDeposito = async (idDetraccion, montoSugerido) => {
        const monto = prompt('Monto depositado por el cliente en BN:', montoSugerido.toFixed(2));
        if (!monto || isNaN(monto) || Number(monto) <= 0) return;
        const fecha = prompt('Fecha de depósito (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        if (!fecha) return;
        try {
          await api.tributario.marcarDeposito(idDetraccion, { monto_depositado: Number(monto), fecha_deposito: fecha });
          alert('Depósito registrado correctamente');
          window.location.reload();
        } catch (e) { alert('Error: ' + JSON.stringify(e.error || e)); }
      };
    }, 100);

    return `
      <header class="header" style="margin-bottom:20px;">
        <div>
           <h1>Dashboard Gerencial</h1>
           <span style="color:var(--text-secondary)">Panel de control unificado: Liquidez, rentabilidad y alertas operativas.</span>
        </div>
      </header>
      
      <h2 style="font-size:16px; margin: 25px 0 15px; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">A. Tesorería Diaria</h2>
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
         <div class="card" style="border-left: 4px solid var(--info); background: linear-gradient(to right, #ffffff, #f4f7fe);">
            <h3 class="card-title">Saldo Actual en Caja</h3>
            <h2 class="card-value" style="color:var(--info); font-size:32px;">${formatCurrency(dataOperativa.caja_diaria.saldo_global)}</h2>
         </div>
         <div class="card" style="border-top: 3px solid var(--success)">
            <h3 class="card-title">Ingresos HOY</h3>
            <h2 class="card-value text-success">+ ${formatCurrency(dataOperativa.caja_diaria.ingresos_hoy)}</h2>
         </div>
         <div class="card" style="border-top: 3px solid var(--danger)">
            <h3 class="card-title">Egresos HOY</h3>
            <h2 class="card-value text-danger">- ${formatCurrency(dataOperativa.caja_diaria.egresos_hoy)}</h2>
         </div>
      </div>

      <h2 style="font-size:16px; margin: 35px 0 15px; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">B. Rentabilidad Acumulada</h2>
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
         <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h3 class="card-title">Utilidad Neta (Ingresos Base - Costos Reales)</h3>
              <h2 class="card-value" style="color:${rentabilidadColor}; font-size:36px;">
                 ${utilidadTotal > 0 ? '+' : ''} ${formatCurrency(utilidadTotal)}
              </h2>
            </div>
            <div style="opacity:0.2; font-size:60px;">+</div>
         </div>
         <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h3 class="card-title">Margen de Rentabilidad Promedio</h3>
              <h2 class="card-value" style="color:${rentabilidadColor}; font-size:36px;">${margenPromedio}%</h2>
              <span style="font-size:12px; color:var(--text-secondary)">Sobre ingresos netos (sin impuestos)</span>
            </div>
            <div style="opacity:0.2; font-size:60px;">%</div>
         </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:35px;">
        <div>
          <h2 style="font-size:16px; margin-bottom: 15px; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">C. Centro de Monitoreo</h2>
          <div class="card" style="padding:15px; border: ${criticos.length > 0 ? '2px solid var(--danger)' : '1px solid var(--border-light)'}">
              <div style="display:flex; justify-content:space-between; margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid var(--border-light)">
                  <div style="flex:1; text-align:center; border-right:1px solid var(--border-light)">
                     <h3 style="font-size:24px; color:${criticos.length > 0 ? 'var(--danger)' : 'var(--text-secondary)'}">${criticos.length}</h3>
                     <span style="font-size:11px; color:var(--text-secondary); text-transform:uppercase; font-weight:600">Críticas</span>
                  </div>
                  <div style="flex:1; text-align:center; border-right:1px solid var(--border-light)">
                     <h3 style="font-size:24px; color:${advertencias.length > 0 ? '#eab308' : 'var(--text-secondary)'}">${advertencias.length}</h3>
                     <span style="font-size:11px; color:var(--text-secondary); text-transform:uppercase; font-weight:600">Advertencias</span>
                  </div>
                  <div style="flex:1.5; text-align:right; padding-left:15px;">
                     <div style="margin-bottom:5px;">
                       <span style="font-size:10px; color:var(--text-secondary); text-transform:uppercase; font-weight:600">Capital en Riesgo</span><br>
                       <strong style="color:var(--danger); font-size:14px;">${formatCurrency(totalRiesgo)}</strong>
                     </div>
                     <div>
                       <span style="font-size:10px; color:var(--text-secondary); text-transform:uppercase; font-weight:600">Impacto x Pérdida</span><br>
                       <strong style="color:var(--danger); font-size:14px;">${formatCurrency(totalPerdida)}</strong>
                     </div>
                  </div>
              </div>
              <div style="max-height:350px; overflow-y:auto; overflow-x:hidden; padding-right:5px;">
                  ${alertHTML || noAlerts}
              </div>
          </div>
        </div>

        <div>
          <h2 style="font-size:16px; margin-bottom: 15px; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">D. Finanzas Estructurales</h2>
          <div style="display:flex; flex-direction:column; gap:15px;">
            <div class="card" style="border-left: 4px solid var(--primary-color);">
               <h3 class="card-title">Cuentas por Cobrar (AR - Clientes)</h3>
               <h2 class="card-value" style="color:var(--primary-color)">${formatCurrency(dataMaster.indicadores.por_cobrar)}</h2>
               <p style="font-size:13px; color:var(--text-secondary); margin-top:5px;">Flujo de caja pendiente de ingreso o en morosidad.</p>
            </div>
            <div class="card" style="border-left: 4px solid #f97316;">
               <h3 class="card-title">Cuentas por Pagar (AP - Logística & Fijos)</h3>
               <h2 class="card-value" style="color:#f97316">- ${formatCurrency(dataMaster.indicadores.por_pagar)}</h2>
               <p style="font-size:13px; color:var(--text-secondary); margin-top:5px;">Obligaciones y pasivos activos pendientes de liquidar.</p>
            </div>
            <div class="card" style="background-color: var(--bg-sidebar); border:none; margin-top: 5px;">
               <h3 class="card-title" style="color:rgba(255,255,255,0.7)">Liquidez Proyectada (Caja + CxC + Me Deben − CxP − Debo)</h3>
               <h2 class="card-value" style="color:${dataMaster.indicadores.liquidez_proyectada >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(dataMaster.indicadores.liquidez_proyectada)}</h2>
               <p style="font-size:11px; color:rgba(255,255,255,0.5); margin-top:4px">Incluye préstamos tomados (−${formatCurrency(dataMaster.indicadores.prestamos_debo)}) y otorgados (+${formatCurrency(dataMaster.indicadores.prestamos_me_deben)})</p>
            </div>
          </div>
        </div>
      </div>

      <h2 style="font-size:16px; margin: 35px 0 15px; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">E. Control Tributario</h2>
      <div style="display:grid; grid-template-columns: repeat(3,1fr); gap:20px; margin-bottom:20px;">
        <div class="card" style="border-left:4px solid #3b82f6">
          <h3 class="card-title">Saldo Cuenta BN</h3>
          <h2 class="card-value" style="color:#3b82f6">${formatCurrency(dataBN.saldo_bn)}</h2>
          <p style="font-size:12px; color:var(--text-secondary)">Depositado: ${formatCurrency(dataBN.total_depositado)} — Pagado: ${formatCurrency(dataBN.total_pagado_impuestos)}</p>
        </div>
        <div class="card" style="border-left:4px solid #e67e22">
          <h3 class="card-title">Detracciones Pendientes Depósito</h3>
          <h2 class="card-value" style="color:#e67e22">${formatCurrency(dataBN.pendiente_deposito)}</h2>
          <p style="font-size:12px; color:var(--text-secondary)">${dataBN.detracciones_pendientes.length} cliente(s) aún no depositaron</p>
        </div>
        <div class="card" style="border-left:4px solid ${dataIGV.reduce((s,m)=>s+m.igv_neto,0)>=0?'var(--success)':'var(--danger)'}">
          <h3 class="card-title">IGV Neto Acumulado del Año</h3>
          <h2 class="card-value" style="color:${dataIGV.reduce((s,m)=>s+m.igv_neto,0)>=0?'var(--danger)':'var(--success)'}">
            ${formatCurrency(dataIGV.reduce((s,m)=>s+m.igv_neto,0))}
          </h2>
          <p style="font-size:12px; color:var(--text-secondary)">Positivo = debes pagar al fisco</p>
        </div>
      </div>

      <h2 style="font-size:16px; margin: 35px 0 15px; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">F. Préstamos y Obligaciones</h2>
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:20px; margin-bottom:20px">
        <div class="card" style="border-left:4px solid var(--danger)">
          <h3 class="card-title">Total que DEBO (Préstamos Tomados)</h3>
          <h2 class="card-value" style="color:var(--danger)">${formatCurrency(prestamosTotales.total_debo)}</h2>
          <span style="font-size:12px; color:var(--text-secondary)">${prestamosTomados.filter(p => p.estado !== 'PAGADO' && p.estado !== 'ANULADO').length} préstamo(s) activos</span>
        </div>
        <div class="card" style="border-left:4px solid var(--primary-color)">
          <h3 class="card-title">Total que ME DEBEN (Préstamos Otorgados)</h3>
          <h2 class="card-value" style="color:var(--primary-color)">${formatCurrency(prestamosTotales.total_me_deben)}</h2>
          <span style="font-size:12px; color:var(--text-secondary)">${prestamosOtorgados.filter(p => p.estado !== 'COBRADO' && p.estado !== 'ANULADO').length} deudor(es) activos</span>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
        <div>
          <h3 style="font-size:13px; font-weight:600; margin-bottom:10px; text-transform:uppercase; color:var(--text-secondary)">Detracciones Pendientes de Depósito</h3>
          <div class="table-container">
            <table>
              <thead><tr><th>Ticket</th><th>Cliente</th><th style="text-align:right">Monto</th><th>Fecha</th><th></th></tr></thead>
              <tbody>
                ${dataBN.detracciones_pendientes.length === 0
                  ? '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary)">Sin pendientes</td></tr>'
                  : dataBN.detracciones_pendientes.map(d => `
                    <tr>
                      <td>${d.codigo}</td>
                      <td>${d.cliente || '---'}</td>
                      <td style="text-align:right; color:#e67e22"><strong>${formatCurrency(d.monto)}</strong></td>
                      <td style="font-size:11px">${d.fecha_servicio?.split('T')[0] || '---'}</td>
                      <td><button class="action-btn" onclick="window.marcarDeposito(${d.id_detraccion}, ${d.monto})">Depositar</button></td>
                    </tr>`).join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 style="font-size:13px; font-weight:600; margin-bottom:10px; text-transform:uppercase; color:var(--text-secondary)">IGV Mensual</h3>
          <div class="table-container">
            <table>
              <thead><tr><th>Mes</th><th style="text-align:right">IGV Ventas</th><th style="text-align:right">IGV Compras</th><th style="text-align:right">Neto</th><th>Estado</th></tr></thead>
              <tbody>
                ${dataIGV.length === 0
                  ? '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary)">Sin datos</td></tr>'
                  : dataIGV.map(m => {
                      const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                      const color = m.igv_neto > 0 ? 'var(--danger)' : 'var(--success)';
                      return `<tr>
                        <td><strong>${meses[m.mes]}</strong></td>
                        <td style="text-align:right; color:var(--danger)">${formatCurrency(m.igv_ventas)}</td>
                        <td style="text-align:right; color:var(--success)">${formatCurrency(m.igv_compras)}</td>
                        <td style="text-align:right; color:${color}"><strong>${formatCurrency(m.igv_neto)}</strong></td>
                        <td style="font-size:11px; color:${color}">${m.igv_neto > 0 ? 'Por pagar' : 'A favor'}</td>
                      </tr>`;
                    }).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Dashboard Render Error:", error);
    return `<div style="padding:50px; color:red;">Error de Renderizado: ${error.message}</div>`;
  }

};

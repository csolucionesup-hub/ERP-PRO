import { api } from '../services/api.js';
import { TabBar } from '../components/TabBar.js';
import { kpiGrid } from '../components/KpiCard.js';
import { lineChart, barChart, donutChart, chartColors, destroyChart } from '../components/charts.js';

export const Dashboard = async () => {
  try {
    const [dataMaster, dataOperativa, dataBN, dataIGV, prestamosTotales, prestamosTomados, prestamosOtorgados, tcHoy,
           hist_cotizaciones, hist_gastos, hist_compras] = await Promise.all([
      api.finances.getDashboard(),
      api.finances.getResumenOperativo(),
      api.tributario.getCuentaBN(),
      api.tributario.getControlIGV(),
      api.prestamos.getTotales(),
      api.prestamos.getTomados(),
      api.prestamos.getOtorgados(),
      api.tipoCambio.getHoy('USD').catch(() => ({ valor_venta: 1, es_hoy: false, fecha: '' })),
      // Para gráficas análisis
      api.cotizaciones.getCotizaciones().catch(() => []),
      api.finances.getGastos().catch(() => []),
      api.purchases.getCompras().catch(() => [])
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
      window.resetearBD = async () => {
        const confirmado = confirm('¿Estás seguro? Esta acción borrará TODOS los datos del sistema. Esta acción no se puede deshacer.');
        if (!confirmado) return;
        try {
          const res = await fetch('/api/admin/reset-db', { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error desconocido');
          alert('✅ Base de datos reseteada correctamente.');
          window.navigate('dashboard');
        } catch (e) {
          alert('Error al resetear: ' + e.message);
        }
      };

      // Toggle panel saldo inicial
      window.toggleSaldoPanel = () => {
        const panel = document.getElementById('panel-saldo-inicial');
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'block';
      };

      // Cargar saldos actuales de BD y mostrarlos (panel + botón resumen)
      const cargarSaldosActuales = async () => {
        try {
          const res = await fetch('/api/admin/cuentas-saldo');
          const cuentas = await res.json();
          const pen = cuentas.find(c => c.id_cuenta === 1);
          const usd = cuentas.find(c => c.id_cuenta === 2);
          const penVal = pen ? Number(pen.saldo_actual) : 0;
          const usdVal = usd ? Number(usd.saldo_actual) : 0;
          const fmt = (v) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2 }).format(v);

          // Dentro del panel expandible
          const elPen = document.getElementById('saldo-actual-pen');
          const elUsd = document.getElementById('saldo-actual-usd');
          if (elPen) elPen.textContent = `Actual: S/ ${fmt(penVal)}`;
          if (elUsd) elUsd.textContent = usd ? `Actual: $ ${fmt(usdVal)}` : 'No configurada';

          // Resumen junto al botón (visible cuando el panel está cerrado)
          const elResumenPen = document.getElementById('resumen-saldo-pen');
          const elResumenUsd = document.getElementById('resumen-saldo-usd');
          if (elResumenPen) elResumenPen.textContent = `S/ ${fmt(penVal)}`;
          if (elResumenUsd) elResumenUsd.textContent = `$ ${fmt(usdVal)}`;
        } catch(e) { /* silencioso */ }
      };
      cargarSaldosActuales();

      window.aplicarSaldoInicial = async () => {
        const saldo_pen = Number(document.getElementById('saldo-inicial-pen')?.value) || 0;
        const saldo_usd = Number(document.getElementById('saldo-inicial-usd')?.value) || 0;
        const tipo_cambio = Number(document.getElementById('saldo-inicial-tc')?.value) || 1;
        if (!confirm(`¿Sobrescribir saldo de cuentas?\n\nCaja Soles → S/ ${saldo_pen.toFixed(2)}\nCaja Dólares → $ ${saldo_usd.toFixed(2)} (≈ S/ ${(saldo_usd * tipo_cambio).toFixed(2)})\n\nSin registrar transacciones.`)) return;
        const btn = document.getElementById('btn-aplicar-saldo');
        try {
          if (btn) { btn.textContent = 'Aplicando...'; btn.disabled = true; }
          const res = await fetch('/api/admin/saldo-inicial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saldo_pen, saldo_usd, tipo_cambio })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error desconocido');
          window.navigate('dashboard');
        } catch (e) {
          if (btn) { btn.textContent = 'Aplicar'; btn.disabled = false; }
          alert('Error: ' + e.message);
        }
      };

      // Conversión en tiempo real USD → PEN
      const actualizarConversion = () => {
        const usd = Number(document.getElementById('saldo-inicial-usd')?.value) || 0;
        const tc  = Number(document.getElementById('saldo-inicial-tc')?.value) || 1;
        const el  = document.getElementById('saldo-usd-conversion');
        if (el) el.textContent = `≈ S/ ${(usd * tc).toFixed(2)}`;
      };
      document.getElementById('saldo-inicial-usd')?.addEventListener('input', actualizarConversion);
      document.getElementById('saldo-inicial-tc')?.addEventListener('input', actualizarConversion);

      window.marcarDeposito = async (idDetraccion, montoSugerido) => {
        const monto = prompt('Monto depositado por el cliente en BN:', montoSugerido.toFixed(2));
        if (!monto || isNaN(monto) || Number(monto) <= 0) return;
        const fecha = prompt('Fecha de depósito (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        if (!fecha) return;
        try {
          await api.tributario.marcarDeposito(idDetraccion, { monto_depositado: Number(monto), fecha_deposito: fecha });
          alert('Depósito registrado correctamente');
          window.navigate('dashboard');
        } catch (e) { alert('Error: ' + JSON.stringify(e.error || e)); }
      };
    }, 100);

    // Setup handler para las gráficas (se ejecuta cuando se carga la vista)
    setTimeout(() => {
      let _charts = {};
      // TabBar con 2 tabs
      TabBar({
        container: '#dashboard-tabbar',
        tabs: [
          { id: 'ejecutivo', label: '🏛️ Vista Ejecutiva' },
          { id: 'analisis',  label: '📊 Análisis Gráfico' },
        ],
        defaultTab: 'ejecutivo',
        onChange: (id) => {
          document.getElementById('tab-ejecutivo').style.display = id === 'ejecutivo' ? 'block' : 'none';
          document.getElementById('tab-analisis').style.display  = id === 'analisis'  ? 'block' : 'none';
          if (id === 'analisis') renderAnalisisGrafico();
        },
      });

      // Estado del rango elegido — persistente mientras dura la sesión
      let _rangoMeses = 12; // default 12 meses

      window.cambiarRangoDash = (meses) => {
        _rangoMeses = Number(meses);
        document.querySelectorAll('.btn-rango').forEach(b => {
          b.style.background = b.dataset.rango == meses ? 'var(--primary-color)' : 'var(--bg-app)';
          b.style.color      = b.dataset.rango == meses ? 'white' : 'var(--text-primary)';
        });
        // Resetear panel y re-renderizar
        const panel = document.getElementById('tab-analisis');
        panel.dataset.rendered = '';
        panel.innerHTML = '';
        renderAnalisisGrafico();
      };

      function renderAnalisisGrafico() {
        const panel = document.getElementById('tab-analisis');
        if (panel.dataset.rendered === '1') return;
        panel.dataset.rendered = '1';

        // Construir data agregada mensual — N meses según rango elegido
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const now = new Date();
        const buckets = {};
        for (let i = _rangoMeses - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          buckets[k] = { label: `${meses[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, ventas: 0, gastos: 0, compras: 0 };
        }

        // Ventas = cotizaciones aprobadas/terminadas
        (hist_cotizaciones || []).forEach(c => {
          if (!c.fecha) return;
          const k = String(c.fecha).slice(0, 7);
          if (k in buckets && ['APROBADA', 'TERMINADA'].includes(c.estado)) {
            const tc = c.moneda === 'USD' ? Number(c.tipo_cambio) || 1 : 1;
            buckets[k].ventas += Number(c.total || 0) * tc;
          }
        });
        // Gastos
        (hist_gastos || []).forEach(g => {
          if (!g.fecha) return;
          const k = String(g.fecha).slice(0, 7);
          if (k in buckets && g.estado !== 'ANULADO') {
            buckets[k].gastos += Number(g.total_base || g.monto_base || 0);
          }
        });
        // Compras
        (hist_compras || []).forEach(c => {
          if (!c.fecha) return;
          const k = String(c.fecha).slice(0, 7);
          if (k in buckets && c.estado !== 'ANULADO') {
            buckets[k].compras += Number(c.total_base || 0);
          }
        });

        const tendencia = Object.values(buckets);
        const totalVentas   = tendencia.reduce((s, b) => s + b.ventas, 0);
        const totalEgresos  = tendencia.reduce((s, b) => s + b.gastos + b.compras, 0);
        const utilidadAcum  = totalVentas - totalEgresos;
        const mejorMes      = tendencia.slice().sort((a,b) => (b.ventas - b.gastos - b.compras) - (a.ventas - a.gastos - a.compras))[0];

        // Distribución gastos por tipo (gastos + compras)
        const distGastos = { general: 0, servicio: 0, almacen: 0 };
        (hist_gastos || []).forEach(g => {
          if (g.estado === 'ANULADO') return;
          const monto = Number(g.total_base || g.monto_base || 0);
          const tipo = (g.tipo_gasto_logistica || '').toUpperCase();
          if (tipo === 'SERVICIO' || g.id_servicio) distGastos.servicio += monto;
          else distGastos.general += monto;
        });
        (hist_compras || []).forEach(c => {
          if (c.estado === 'ANULADO') return;
          const monto = Number(c.total_base || 0);
          if ((c.centro_costo || '').toUpperCase().includes('ALMAC')) distGastos.almacen += monto;
          else distGastos.general += monto;
        });

        // Top 5 clientes (por cotizaciones aprobadas)
        const topCli = {};
        (hist_cotizaciones || []).forEach(c => {
          if (!['APROBADA', 'TERMINADA'].includes(c.estado)) return;
          const k = (c.cliente || 'Sin cliente').trim();
          const tc = c.moneda === 'USD' ? Number(c.tipo_cambio) || 1 : 1;
          topCli[k] = (topCli[k] || 0) + Number(c.total || 0) * tc;
        });
        const topClientes = Object.entries(topCli)
          .map(([label, valor]) => ({ label: label.slice(0, 22), valor }))
          .sort((a, b) => b.valor - a.valor).slice(0, 5);

        // Construir comparativa año vs año — todos los años con data detectados
        const comparativa = buildComparativaAnual();
        const etiquetaRango = {
          12:  'últimos 12 meses', 24: 'últimos 24 meses', 36: 'últimos 36 meses',
          60:  'últimos 5 años',   120: 'últimos 10 años', 999: 'toda la historia',
        }[_rangoMeses] || `últimos ${_rangoMeses} meses`;

        panel.innerHTML = `
          <div style="margin-top:16px">
            <div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
              <strong style="font-size:13px">📅 Rango:</strong>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${[
                  { m: 12,  lbl: '12 meses' },
                  { m: 24,  lbl: '24 meses' },
                  { m: 36,  lbl: '36 meses' },
                  { m: 60,  lbl: '5 años' },
                  { m: 120, lbl: '10 años' },
                  { m: 999, lbl: 'Todo' },
                ].map(r => `
                  <button class="btn-rango" data-rango="${r.m}" onclick="cambiarRangoDash(${r.m})"
                    style="padding:6px 14px;border:1px solid #d9dad9;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
                           background:${_rangoMeses === r.m ? 'var(--primary-color)' : 'var(--bg-app)'};
                           color:${_rangoMeses === r.m ? 'white' : 'var(--text-primary)'}">${r.lbl}</button>
                `).join('')}
              </div>
              <span style="font-size:11px;color:var(--text-secondary);margin-left:auto">Mostrando ${etiquetaRango}</span>
            </div>

            ${kpiGrid([
              { label: `Ventas ${etiquetaRango}`,   value: formatCurrency(totalVentas),  icon: '📈', changeType: 'positive' },
              { label: `Egresos ${etiquetaRango}`,  value: formatCurrency(totalEgresos), icon: '📉', changeType: 'neutral' },
              { label: `Utilidad Acumulada`,         value: formatCurrency(utilidadAcum), icon: '💎', changeType: utilidadAcum >= 0 ? 'positive' : 'negative' },
              { label: 'Mejor mes',                  value: mejorMes?.label || '—',       icon: '🏆' },
            ], 4)}

            <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:20px">
              <div class="card">
                <h3 style="margin-bottom:6px;font-size:14px">📊 Ingresos vs Egresos — ${etiquetaRango}</h3>
                <p style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">Verde = ventas aprobadas · Rojo = gastos + compras</p>
                <div style="height:280px"><canvas id="dash-chart-tendencia"></canvas></div>
              </div>
              <div class="card">
                <h3 style="margin-bottom:6px;font-size:14px">🥧 Distribución de egresos</h3>
                <p style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">Por centro de costo</p>
                <div style="height:280px"><canvas id="dash-chart-dist"></canvas></div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
              <div class="card">
                <h3 style="margin-bottom:6px;font-size:14px">💰 Utilidad neta mensual</h3>
                <p style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">Ventas − (gastos + compras) por mes</p>
                <div style="height:240px"><canvas id="dash-chart-utilidad"></canvas></div>
              </div>
              <div class="card">
                <h3 style="margin-bottom:6px;font-size:14px">🏆 Top 5 clientes</h3>
                <p style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">Por cotizaciones aprobadas/terminadas (${etiquetaRango})</p>
                ${topClientes.length ? `<div style="height:240px"><canvas id="dash-chart-topcli"></canvas></div>`
                  : `<div style="padding:40px;text-align:center;color:var(--text-secondary);font-size:12px">Aún no hay cotizaciones aprobadas en este rango.</div>`}
              </div>
            </div>

            ${comparativa.anios.length >= 2 ? `
              <div class="card" style="margin-top:16px">
                <h3 style="margin-bottom:6px;font-size:14px">📅 Comparativa anual — Ventas por mes</h3>
                <p style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">
                  ${comparativa.anios.join(' · ')} — una línea por año para ver evolución de la empresa.
                </p>
                <div style="height:300px"><canvas id="dash-chart-comparativa"></canvas></div>
                <div style="display:grid;grid-template-columns:repeat(${comparativa.anios.length},1fr);gap:10px;margin-top:14px">
                  ${comparativa.anios.map((a, i) => {
                    const totalA = comparativa.serie[i].data.reduce((s, v) => s + v, 0);
                    const prev   = i > 0 ? comparativa.serie[i - 1].data.reduce((s, v) => s + v, 0) : null;
                    const delta  = prev ? ((totalA - prev) / prev * 100).toFixed(1) : null;
                    const deltaColor = delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#676767';
                    return `<div style="padding:12px;background:#f9fafb;border-radius:8px;text-align:center">
                      <div style="font-size:11px;color:var(--text-secondary);font-weight:600">${a}</div>
                      <div style="font-size:18px;font-weight:700;margin:4px 0">${formatCurrency(totalA)}</div>
                      ${delta !== null ? `<div style="font-size:11px;color:${deltaColor};font-weight:600">${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${Math.abs(delta)}% vs ${comparativa.anios[i-1]}</div>` : '<div style="font-size:11px;color:var(--text-secondary)">año base</div>'}
                    </div>`;
                  }).join('')}
                </div>
              </div>
            ` : `
              <div class="card" style="margin-top:16px;padding:30px;text-align:center;color:var(--text-secondary);font-size:12px">
                La comparativa anual aparecerá cuando tengas ventas en al menos 2 años distintos.
              </div>
            `}
          </div>
        `;

        setTimeout(() => {
          destroyChart(_charts.tendencia); destroyChart(_charts.dist);
          destroyChart(_charts.utilidad);  destroyChart(_charts.topCli);
          destroyChart(_charts.comparativa);

          // Ingresos vs Egresos (línea doble)
          if (window.Chart) {
            const ctx = document.getElementById('dash-chart-tendencia');
            if (ctx) {
              _charts.tendencia = new window.Chart(ctx, {
                type: 'line',
                data: {
                  labels: tendencia.map(t => t.label),
                  datasets: [
                    { label: 'Ventas',  data: tendencia.map(t => t.ventas),  borderColor: chartColors.success, backgroundColor: chartColors.success + '22', fill: true, tension: 0.3 },
                    { label: 'Egresos', data: tendencia.map(t => t.gastos + t.compras), borderColor: chartColors.danger, backgroundColor: chartColors.danger + '22', fill: true, tension: 0.3 },
                  ],
                },
                options: {
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
                  scales: { y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + v.toLocaleString() } } },
                },
              });
            }
          }

          // Distribución egresos donut
          _charts.dist = donutChart('#dash-chart-dist', [
            { label: 'General (Oficina)', valor: distGastos.general },
            { label: 'Servicio/Proyecto', valor: distGastos.servicio },
            { label: 'Almacén (Insumos)', valor: distGastos.almacen },
          ], {
            colors: [chartColors.info, chartColors.warning, chartColors.primary],
          });

          // Utilidad por mes (barras)
          const utilData = tendencia.map(t => ({ label: t.label, valor: Number((t.ventas - t.gastos - t.compras).toFixed(2)) }));
          _charts.utilidad = barChart('#dash-chart-utilidad', utilData, {
            colors: utilData.map(d => d.valor >= 0 ? chartColors.success : chartColors.danger),
          });

          // Top clientes
          if (topClientes.length) {
            _charts.topCli = barChart('#dash-chart-topcli', topClientes, {
              colors: topClientes.map(() => chartColors.info),
            });
          }

          // Comparativa anual (una línea por año con los 12 meses)
          if (comparativa.anios.length >= 2 && window.Chart) {
            const ctx = document.getElementById('dash-chart-comparativa');
            if (ctx) {
              const paleta = ['#dc2626','#f59e0b','#3b82f6','#16a34a','#8b5cf6','#ec4899','#0ea5e9','#64748b'];
              _charts.comparativa = new window.Chart(ctx, {
                type: 'line',
                data: {
                  labels: meses,
                  datasets: comparativa.serie.map((s, i) => ({
                    label: String(s.anio),
                    data: s.data,
                    borderColor: paleta[i % paleta.length],
                    backgroundColor: paleta[i % paleta.length] + '11',
                    fill: false, tension: 0.3, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6,
                  })),
                },
                options: {
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
                  scales: { y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + v.toLocaleString() } } },
                },
              });
            }
          }
        }, 100);
      }

      // Construye la data agregada por año-mes para la comparativa anual
      function buildComparativaAnual() {
        const porAnio = {};
        (hist_cotizaciones || []).forEach(c => {
          if (!c.fecha || !['APROBADA', 'TERMINADA'].includes(c.estado)) return;
          const y = String(c.fecha).slice(0, 4);
          const m = parseInt(String(c.fecha).slice(5, 7), 10) - 1;
          const tc = c.moneda === 'USD' ? Number(c.tipo_cambio) || 1 : 1;
          if (!porAnio[y]) porAnio[y] = new Array(12).fill(0);
          porAnio[y][m] += Number(c.total || 0) * tc;
        });
        const anios = Object.keys(porAnio).sort();
        return {
          anios,
          serie: anios.map(a => ({ anio: a, data: porAnio[a] })),
        };
      }
    }, 80);

    return `
      <header class="header" style="margin-bottom:20px;">
        <div>
           <h1>Dashboard Gerencial</h1>
           <span style="color:var(--text-secondary)">Panel de control unificado: Liquidez, rentabilidad y alertas operativas.</span>
        </div>
      </header>

      <div id="dashboard-tabbar" style="margin-bottom:10px"></div>

      <div id="tab-analisis" style="display:none"></div>

      <div id="tab-ejecutivo">
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

      <div style="margin-top:50px; padding-top:20px; border-top:1px solid var(--border-light);">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
          <p style="font-size:11px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:1px; margin:0;">Zona de Administración</p>
          <button onclick="window.toggleSaldoPanel()" style="padding:4px 10px; background:none; border:1px solid #16a34a; color:#16a34a; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">⚙ Configurar Saldos Iniciales</button>
          <span style="font-size:11px; color:var(--text-secondary); display:flex; gap:8px; align-items:center;">
            <span id="resumen-saldo-pen" style="font-weight:600; color:#15803d;">S/ 0.00</span>
            <span style="color:var(--border-light)">|</span>
            <span id="resumen-saldo-usd" style="font-weight:600; color:#1d4ed8;">$ 0.00</span>
          </span>
          <button onclick="window.resetearBD()" style="padding:4px 10px; background:none; border:1px solid #ef4444; color:#ef4444; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">⚠️ Resetear BD</button>
        </div>

        <div id="panel-saldo-inicial" style="display:none; background:#f8fdf9; border:1px solid #bbf7d0; border-radius:8px; padding:16px; margin-top:4px;">
          <p style="font-size:11px; color:#15803d; margin:0 0 12px; font-weight:600;">Sobrescribe el saldo actual de cada cuenta (sin registrar transacciones). Úsalo para correcciones o carga inicial.</p>
          <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">

            <div style="flex:1; min-width:140px;">
              <label style="font-size:10px; color:var(--text-secondary); display:block; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.5px;">Caja Soles (PEN)</label>
              <input id="saldo-inicial-pen" type="number" step="0.01" min="0" placeholder="0.00"
                style="width:100%; padding:7px 9px; border:1px solid #86efac; border-radius:4px; box-sizing:border-box; font-size:13px;">
              <span id="saldo-actual-pen" style="font-size:10px; color:var(--text-secondary); margin-top:2px; display:block;">Cargando...</span>
            </div>

            <div style="flex:1; min-width:140px;">
              <label style="font-size:10px; color:var(--text-secondary); display:block; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.5px;">Caja Dólares (USD)</label>
              <input id="saldo-inicial-usd" type="number" step="0.01" min="0" placeholder="0.00"
                style="width:100%; padding:7px 9px; border:1px solid #86efac; border-radius:4px; box-sizing:border-box; font-size:13px;">
              <span id="saldo-actual-usd" style="font-size:10px; color:var(--text-secondary); margin-top:2px; display:block;">Cargando...</span>
            </div>

            <div style="flex:0; min-width:110px;">
              <label style="font-size:10px; color:var(--text-secondary); display:block; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.5px;">T/C (S/ x USD)</label>
              <input id="saldo-inicial-tc" type="number" step="0.0001" min="0.01" value="${tcHoy?.valor_venta || 1}"
                style="width:100%; padding:7px 9px; border:1px solid #86efac; border-radius:4px; box-sizing:border-box; font-size:13px;">
              <span id="saldo-usd-conversion" style="font-size:10px; color:#16a34a; margin-top:2px; display:block;">≈ S/ 0.00</span>
            </div>

            <div style="flex:0; padding-bottom:18px;">
              <button id="btn-aplicar-saldo" onclick="window.aplicarSaldoInicial()"
                style="padding:7px 14px; background:#16a34a; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:600; white-space:nowrap;">
                Aplicar
              </button>
            </div>

          </div>
        </div>
      </div>
      </div><!-- /#tab-ejecutivo -->
    `;
  } catch (error) {
    console.error("Dashboard Render Error:", error);
    return `<div style="padding:50px; color:red;">Error de Renderizado: ${error.message}</div>`;
  }

};

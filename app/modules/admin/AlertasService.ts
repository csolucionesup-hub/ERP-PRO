import { db } from '../../../database/connection';

/**
 * AlertasService — agrega notificaciones/alertas activas del ERP.
 * Cada alerta tiene: tipo, severidad (info/warn/danger), titulo, detalle, link.
 * El usuario las ve en el panel campana del header (sidebar 🔔 Alertas).
 *
 * Reglas de filtrado:
 * - GERENTE ve TODAS las alertas (de todos los módulos).
 * - Cada usuario ve solo alertas de los módulos que tiene asignados.
 *
 * Las queries usan sintaxis Postgres nativa (CURRENT_DATE, INTERVAL, EXTRACT)
 * para evitar dependencia del adapter MySQL→Postgres.
 */

export interface Alerta {
  id: string;          // hash único para que cliente no duplique
  tipo:
    | 'STOCK' | 'OC_VENCIDA' | 'COBRANZA_VENCIDA' | 'CUENTA_PAGAR_VENCIDA'
    | 'COTIZACION_PENDIENTE' | 'DETRACCION_PENDIENTE'
    | 'PRESTAMO_OTORGADO_VENCIDO' | 'PRESTAMO_TOMADO_PROXIMO'
    | 'CAJA_BAJA' | 'IGV_PROXIMO'
    | 'COTIZACION_SIN_FACTURAR' | 'TRABAJO_NO_INICIADO'
    | 'OC_BORRADOR_OLVIDADA' | 'INVENTARIO_MUERTO';
  severidad: 'info' | 'warn' | 'danger';
  titulo: string;
  detalle: string;
  link?: string;
  fecha?: string;
}

class AlertasService {

  async listar(modulosUsuario: string[] = [], rol: string = 'USUARIO'): Promise<Alerta[]> {
    const alertas: Alerta[] = [];
    // El GERENTE ve TODO sin importar sus módulos asignados
    const esGerente = rol === 'GERENTE';
    const tieneModulo = (m: string) => esGerente || modulosUsuario.includes(m);

    const tieneAlmacen        = tieneModulo('ALMACEN');
    const tieneFinanzas       = tieneModulo('FINANZAS');
    const tieneComercial      = tieneModulo('COMERCIAL');
    const tieneLogistica      = tieneModulo('LOGISTICA');

    // ═══════════════════════════════════════════════════════════
    // ALMACEN
    // ═══════════════════════════════════════════════════════════

    // 1. Items con stock bajo o agotado
    if (tieneAlmacen) {
      const [bajo]: any = await db.query(`
        SELECT id_item, sku, nombre, stock_actual, stock_minimo
        FROM Inventario
        WHERE stock_actual <= stock_minimo
        ORDER BY (stock_actual - stock_minimo) ASC
        LIMIT 5
      `);
      for (const r of (bajo as any[])) {
        const sinStock = Number(r.stock_actual) === 0;
        alertas.push({
          id: `stock-${r.id_item}`,
          tipo: 'STOCK',
          severidad: sinStock ? 'danger' : 'warn',
          titulo: sinStock ? `🚫 ${r.nombre} sin stock` : `⚠️ Stock bajo: ${r.nombre}`,
          detalle: `${r.sku} · ${r.stock_actual} / mín ${r.stock_minimo}`,
          link: '#inventario',
        });
      }

      // 2. Inventario muerto: ítems con stock > 0 que no tuvieron movimientos en 90 días
      try {
        const [muerto]: any = await db.query(`
          SELECT i.id_item, i.sku, i.nombre, i.stock_actual, i.costo_promedio_unitario,
                 (SELECT MAX(m.fecha_movimiento) FROM MovimientosInventario m WHERE m.id_item = i.id_item) AS ultimo_mov
          FROM Inventario i
          WHERE i.stock_actual > 0
            AND (
              (SELECT MAX(m.fecha_movimiento) FROM MovimientosInventario m WHERE m.id_item = i.id_item) < (CURRENT_DATE - INTERVAL '90 days')
              OR (SELECT MAX(m.fecha_movimiento) FROM MovimientosInventario m WHERE m.id_item = i.id_item) IS NULL
            )
          ORDER BY i.stock_actual * i.costo_promedio_unitario DESC
          LIMIT 3
        `);
        for (const r of (muerto as any[])) {
          const valor = Number(r.stock_actual) * Number(r.costo_promedio_unitario);
          alertas.push({
            id: `muerto-${r.id_item}`,
            tipo: 'INVENTARIO_MUERTO',
            severidad: 'info',
            titulo: `📦 Inventario sin rotar: ${r.nombre}`,
            detalle: `${r.sku} · ${r.stock_actual} und · S/ ${valor.toFixed(2)} valorizado`,
            link: '#inventario',
          });
        }
      } catch (_) { /* tabla puede no existir aún */ }
    }

    // ═══════════════════════════════════════════════════════════
    // COMERCIAL
    // ═══════════════════════════════════════════════════════════

    if (tieneComercial) {
      // 3. Cotizaciones pendientes de aprobar (>5 días en EN_PROCESO o ENVIADA)
      const [cotizPend]: any = await db.query(`
        SELECT id_cotizacion, nro_cotizacion, cliente, estado, fecha
        FROM Cotizaciones
        WHERE estado IN ('EN_PROCESO','ENVIADA','A_ESPERA_RESPUESTA')
          AND fecha < (CURRENT_DATE - INTERVAL '5 days')
        ORDER BY fecha ASC
        LIMIT 5
      `);
      for (const r of (cotizPend as any[])) {
        alertas.push({
          id: `cot-${r.id_cotizacion}`,
          tipo: 'COTIZACION_PENDIENTE',
          severidad: 'warn',
          titulo: `📋 Cotización sin definir: ${r.nro_cotizacion}`,
          detalle: `${r.cliente} · ${r.estado} desde ${String(r.fecha).slice(0, 10)}`,
          link: '#comercial',
          fecha: String(r.fecha).slice(0, 10),
        });
      }

      // 4. Cotizaciones APROBADAS hace >10 días sin nro_factura → emitir factura
      const [sinFact]: any = await db.query(`
        SELECT id_cotizacion, nro_cotizacion, cliente, total, moneda, fecha_aprobacion_comercial
        FROM Cotizaciones
        WHERE estado = 'APROBADA'
          AND nro_factura IS NULL
          AND fecha_aprobacion_comercial IS NOT NULL
          AND fecha_aprobacion_comercial < (CURRENT_DATE - INTERVAL '10 days')
        ORDER BY fecha_aprobacion_comercial ASC
        LIMIT 5
      `);
      for (const r of (sinFact as any[])) {
        const moneda = r.moneda === 'USD' ? '$' : 'S/';
        alertas.push({
          id: `cotsf-${r.id_cotizacion}`,
          tipo: 'COTIZACION_SIN_FACTURAR',
          severidad: 'warn',
          titulo: `🧾 Aprobada sin facturar: ${r.nro_cotizacion}`,
          detalle: `${r.cliente} · ${moneda} ${Number(r.total).toFixed(2)}`,
          link: '#comercial',
        });
      }

      // 5. Trabajos APROBADOS sin iniciar hace >7 días
      const [trabajos]: any = await db.query(`
        SELECT id_cotizacion, nro_cotizacion, cliente, fecha_aprobacion_comercial
        FROM Cotizaciones
        WHERE estado = 'APROBADA'
          AND estado_trabajo = 'NO_INICIADO'
          AND fecha_aprobacion_comercial IS NOT NULL
          AND fecha_aprobacion_comercial < (CURRENT_DATE - INTERVAL '7 days')
        ORDER BY fecha_aprobacion_comercial ASC
        LIMIT 3
      `);
      for (const r of (trabajos as any[])) {
        alertas.push({
          id: `trab-${r.id_cotizacion}`,
          tipo: 'TRABAJO_NO_INICIADO',
          severidad: 'info',
          titulo: `🔧 Trabajo sin iniciar: ${r.nro_cotizacion}`,
          detalle: `${r.cliente} · aprobado y sin avanzar`,
          link: '#comercial',
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FINANZAS
    // ═══════════════════════════════════════════════════════════

    if (tieneFinanzas) {
      // 6. Cobranzas vencidas
      const [cobVenc]: any = await db.query(`
        SELECT s.id_servicio, s.codigo, s.cliente, s.fecha_vencimiento, s.total_base
        FROM Servicios s
        WHERE s.estado IN ('PENDIENTE','PARCIAL')
          AND s.fecha_vencimiento IS NOT NULL
          AND s.fecha_vencimiento < CURRENT_DATE
        ORDER BY s.fecha_vencimiento ASC
        LIMIT 5
      `);
      for (const r of (cobVenc as any[])) {
        const dias = Math.floor((Date.now() - new Date(r.fecha_vencimiento).getTime()) / 86400000);
        alertas.push({
          id: `cobv-${r.id_servicio}`,
          tipo: 'COBRANZA_VENCIDA',
          severidad: dias > 30 ? 'danger' : 'warn',
          titulo: `💰 Cobranza vencida: ${r.codigo}`,
          detalle: `${r.cliente} · ${dias} día(s) de mora`,
          link: '#finanzas',
        });
      }

      // 7. Detracciones pendientes
      try {
        const [detPend]: any = await db.query(`
          SELECT d.id_detraccion, d.cliente, d.monto, d.created_at
          FROM Detracciones d
          WHERE d.cliente_deposito IN ('NO','PARCIAL')
            AND d.estado = 'PENDIENTE'
            AND d.created_at < (CURRENT_DATE - INTERVAL '7 days')
          ORDER BY d.created_at ASC
          LIMIT 3
        `);
        for (const r of (detPend as any[])) {
          alertas.push({
            id: `det-${r.id_detraccion}`,
            tipo: 'DETRACCION_PENDIENTE',
            severidad: 'warn',
            titulo: `📦 Detracción pendiente: ${r.cliente}`,
            detalle: `S/ ${Number(r.monto).toFixed(2)}`,
            link: '#finanzas',
          });
        }
      } catch (_) { /* tabla puede no existir aún */ }

      // 8. Préstamos OTORGADOS con fecha_vencimiento pasada y aún no cobrados
      try {
        const [prestO]: any = await db.query(`
          SELECT id_prestamo, deudor, saldo, monto_total, moneda, fecha_vencimiento
          FROM PrestamosOtorgados
          WHERE estado IN ('PENDIENTE','PARCIAL')
            AND fecha_vencimiento IS NOT NULL
            AND fecha_vencimiento < CURRENT_DATE
            AND saldo > 0
          ORDER BY fecha_vencimiento ASC
          LIMIT 5
        `);
        for (const r of (prestO as any[])) {
          const dias = Math.floor((Date.now() - new Date(r.fecha_vencimiento).getTime()) / 86400000);
          const moneda = r.moneda === 'USD' ? '$' : 'S/';
          alertas.push({
            id: `presto-${r.id_prestamo}`,
            tipo: 'PRESTAMO_OTORGADO_VENCIDO',
            severidad: dias > 30 ? 'danger' : 'warn',
            titulo: `💳 Cobro vencido: ${r.deudor}`,
            detalle: `${moneda} ${Number(r.saldo).toFixed(2)} pendiente · ${dias} día(s) tarde`,
            link: '#prestamos',
          });
        }
      } catch (_) { /* tabla puede no existir */ }

      // 9. Préstamos TOMADOS próximos a vencer (en 7 días o menos)
      try {
        const [prestT]: any = await db.query(`
          SELECT id_prestamo, acreedor, saldo, moneda, fecha_vencimiento
          FROM PrestamosTomados
          WHERE estado IN ('PENDIENTE','PARCIAL')
            AND fecha_vencimiento IS NOT NULL
            AND fecha_vencimiento >= CURRENT_DATE
            AND fecha_vencimiento <= (CURRENT_DATE + INTERVAL '7 days')
            AND saldo > 0
          ORDER BY fecha_vencimiento ASC
          LIMIT 5
        `);
        for (const r of (prestT as any[])) {
          const dias = Math.ceil((new Date(r.fecha_vencimiento).getTime() - Date.now()) / 86400000);
          const moneda = r.moneda === 'USD' ? '$' : 'S/';
          alertas.push({
            id: `prestt-${r.id_prestamo}`,
            tipo: 'PRESTAMO_TOMADO_PROXIMO',
            severidad: dias <= 2 ? 'danger' : 'warn',
            titulo: `💳 Préstamo a pagar pronto: ${r.acreedor}`,
            detalle: `${moneda} ${Number(r.saldo).toFixed(2)} · vence en ${dias} día(s)`,
            link: '#prestamos',
          });
        }
      } catch (_) { /* tabla puede no existir */ }

      // 10. Caja con saldo bajo (cuentas activas)
      try {
        const [cajas]: any = await db.query(`
          SELECT id_cuenta, nombre, tipo, moneda, saldo_actual
          FROM Cuentas
          WHERE estado = 'ACTIVA'
            AND (
              (moneda = 'PEN' AND saldo_actual < 1000)
              OR (moneda = 'USD' AND saldo_actual < 300)
            )
          ORDER BY saldo_actual ASC
          LIMIT 5
        `);
        for (const r of (cajas as any[])) {
          const sym = r.moneda === 'USD' ? '$' : 'S/';
          const saldo = Number(r.saldo_actual);
          const limite = r.moneda === 'USD' ? 300 : 1000;
          alertas.push({
            id: `caja-${r.id_cuenta}`,
            tipo: 'CAJA_BAJA',
            severidad: saldo < limite / 2 ? 'danger' : 'warn',
            titulo: `🏦 Saldo bajo: ${r.nombre}`,
            detalle: `${sym} ${saldo.toFixed(2)} · recargar caja`,
            link: '#finanzas',
          });
        }
      } catch (_) { /* schema cuentas puede variar */ }

      // 11. IGV próximo a vencer: día 11+ del mes y sin pago de IGV registrado
      //    para el periodo del mes anterior. Vence el día 15 del mes siguiente.
      try {
        const hoy = new Date();
        const diaDelMes = hoy.getDate();
        if (diaDelMes >= 8) {
          // Periodo a declarar = mes anterior
          const periodoAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
          const periodoStr = `${periodoAnt.getFullYear()}-${String(periodoAnt.getMonth() + 1).padStart(2, '0')}`;
          const [pagos]: any = await db.query(
            `SELECT COUNT(*)::int AS n FROM PagosImpuestos
             WHERE tipo_impuesto = 'IGV' AND periodo = ?`,
            [periodoStr]
          );
          const yaPago = Number((pagos as any[])[0]?.n || 0) > 0;
          if (!yaPago) {
            const diasParaVencer = 15 - diaDelMes;
            const sev: 'danger' | 'warn' | 'info' =
              diasParaVencer < 0 ? 'danger' : (diasParaVencer <= 3 ? 'danger' : 'warn');
            const titulo = diasParaVencer < 0
              ? `🏛️ IGV ${periodoStr} ¡VENCIDO!`
              : `🏛️ Pago IGV ${periodoStr} pronto`;
            const detalle = diasParaVencer < 0
              ? `Vencía hace ${-diasParaVencer} día(s) · regularizar`
              : `Vence el 15 · ${diasParaVencer} día(s) restantes`;
            alertas.push({
              id: `igv-${periodoStr}`,
              tipo: 'IGV_PROXIMO',
              severidad: sev,
              titulo,
              detalle,
              link: '#finanzas',
            });
          }
        }
      } catch (_) { /* PagosImpuestos puede no existir */ }
    }

    // ═══════════════════════════════════════════════════════════
    // LOGISTICA
    // ═══════════════════════════════════════════════════════════

    if (tieneLogistica) {
      // 12. OCs sin facturar (ENVIADA/RECIBIDA hace >15 días)
      const [ocPend]: any = await db.query(`
        SELECT id_oc, nro_oc, fecha_emision, estado, total
        FROM OrdenesCompra
        WHERE estado IN ('ENVIADA','RECIBIDA','RECIBIDA_PARCIAL')
          AND fecha_emision < (CURRENT_DATE - INTERVAL '15 days')
        ORDER BY fecha_emision ASC
        LIMIT 5
      `);
      for (const r of (ocPend as any[])) {
        alertas.push({
          id: `oc-${r.id_oc}`,
          tipo: 'OC_VENCIDA',
          severidad: 'info',
          titulo: `📋 OC sin facturar: ${r.nro_oc}`,
          detalle: `${r.estado} desde ${String(r.fecha_emision).slice(0, 10)}`,
          link: '#logistica',
        });
      }

      // 13. OCs en BORRADOR olvidadas (>3 días sin aprobar)
      const [borr]: any = await db.query(`
        SELECT id_oc, nro_oc, fecha_emision, total, moneda
        FROM OrdenesCompra
        WHERE estado = 'BORRADOR'
          AND fecha_emision < (CURRENT_DATE - INTERVAL '3 days')
        ORDER BY fecha_emision ASC
        LIMIT 5
      `);
      for (const r of (borr as any[])) {
        const sym = r.moneda === 'USD' ? '$' : 'S/';
        alertas.push({
          id: `ocbor-${r.id_oc}`,
          tipo: 'OC_BORRADOR_OLVIDADA',
          severidad: 'info',
          titulo: `📝 OC en borrador: ${r.nro_oc}`,
          detalle: `${sym} ${Number(r.total).toFixed(2)} · sin aprobar/enviar`,
          link: '#logistica',
        });
      }
    }

    return alertas;
  }
}

export default new AlertasService();

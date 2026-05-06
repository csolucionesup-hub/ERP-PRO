import { db } from '../../../database/connection';
import CobranzasService from '../finance/CobranzasService';

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

export type ModuloAlerta = 'ALMACEN' | 'COMERCIAL' | 'FINANZAS' | 'LOGISTICA' | 'ADMINISTRACION';

export interface Alerta {
  id: string;          // hash único para que cliente no duplique
  modulo: ModuloAlerta;
  tipo:
    | 'STOCK' | 'OC_VENCIDA' | 'COBRANZA_VENCIDA' | 'CUENTA_PAGAR_VENCIDA'
    | 'COTIZACION_PENDIENTE' | 'DETRACCION_PENDIENTE'
    | 'PRESTAMO_OTORGADO_VENCIDO' | 'PRESTAMO_TOMADO_PROXIMO'
    | 'CAJA_BAJA' | 'IGV_PROXIMO'
    | 'COTIZACION_SIN_FACTURAR' | 'TRABAJO_NO_INICIADO'
    | 'OC_BORRADOR_OLVIDADA' | 'INVENTARIO_MUERTO'
    // Nuevas (mig 062 — rediseño kanban OC)
    | 'OC_DEUDA_PROVEEDOR'
    | 'OC_PAGO_SIN_RECEPCION'
    | 'OC_CREDITO_POR_VENCER'
    | 'OC_SIN_FACTURA_PROVEEDOR'
    | 'OC_CERRADAS_SIN_FACT_MES';
  severidad: 'info' | 'warn' | 'danger';
  titulo: string;
  detalle: string;
  link?: string;
  fecha?: string;
}

class AlertasService {

  /**
   * Devuelve las alertas filtradas según el rol y los módulos del usuario.
   * Internamente computa SIEMPRE todas las alertas (para mantener un snapshot
   * histórico fidedigno) y luego filtra el resultado.
   */
  async listar(modulosUsuario: string[] = [], rol: string = 'USUARIO'): Promise<Alerta[]> {
    const todas = await this._computeAll();
    // Snapshot best-effort (no falla si la migración aún no aplicó)
    await this.snapshot(todas);

    const esGerente = rol === 'GERENTE';
    if (esGerente) return todas;
    return todas.filter(a => modulosUsuario.includes(a.modulo));
  }

  /** Cómputo completo de todas las alertas activas, sin filtrar por usuario. */
  private async _computeAll(): Promise<Alerta[]> {
    const alertas: Alerta[] = [];
    // Computamos SIEMPRE todas; el filtro por permisos lo hace listar()
    const tieneAlmacen   = true;
    const tieneFinanzas  = true;
    const tieneComercial = true;
    const tieneLogistica = true;

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
          modulo: 'ALMACEN',
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
            modulo: 'ALMACEN',
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
          modulo: 'COMERCIAL',
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
          modulo: 'COMERCIAL',
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
          modulo: 'COMERCIAL',
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
          modulo: 'FINANZAS',
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
            modulo: 'FINANZAS',
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
            modulo: 'FINANZAS',
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
            modulo: 'FINANZAS',
            tipo: 'PRESTAMO_TOMADO_PROXIMO',
            severidad: dias <= 2 ? 'danger' : 'warn',
            titulo: `💳 Préstamo a pagar pronto: ${r.acreedor}`,
            detalle: `${moneda} ${Number(r.saldo).toFixed(2)} · vence en ${dias} día(s)`,
            link: '#prestamos',
          });
        }
      } catch (_) { /* tabla puede no existir */ }

      // 10. Caja con saldo bajo — saldo neto (cobranzas - gastos bancarios - pagos IGV).
      //     Usa misma fórmula que el KPI "Caja" del dashboard de Finanzas (fuente única).
      try {
        const saldos = await CobranzasService.calcularSaldosNetos();
        const monedas: Array<{ moneda: 'PEN'|'USD'; nombre: string; sym: string; limite: number }> = [
          { moneda: 'PEN', nombre: 'Caja General Soles',  sym: 'S/', limite: 1000 },
          { moneda: 'USD', nombre: 'Caja General Dólares', sym: '$',  limite: 300  },
        ];
        for (const m of monedas) {
          const neto = saldos[m.moneda].neto;
          if (neto < m.limite) {
            alertas.push({
              id: `caja-${m.moneda}`,
              modulo: 'FINANZAS',
              tipo: 'CAJA_BAJA',
              severidad: neto < m.limite / 2 ? 'danger' : 'warn',
              titulo: `🏦 Saldo bajo: ${m.nombre}`,
              detalle: `${m.sym} ${neto.toFixed(2)} · recargar caja`,
              link: '#finanzas',
            });
          }
        }
      } catch (e) {
        console.warn('[AlertasService] CAJA_BAJA falló:', (e as Error).message);
      }

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
              modulo: 'FINANZAS',
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
      // 12. OCs sin facturar (PAGO/RECEPCION hace >15 días)
      const [ocPend]: any = await db.query(`
        SELECT id_oc, nro_oc, fecha_emision, estado, total
        FROM OrdenesCompra
        WHERE estado IN ('PAGO','RECEPCION')
          AND fecha_emision < (CURRENT_DATE - INTERVAL '15 days')
        ORDER BY fecha_emision ASC
        LIMIT 5
      `);
      for (const r of (ocPend as any[])) {
        alertas.push({
          id: `oc-${r.id_oc}`,
          modulo: 'LOGISTICA',
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
          modulo: 'LOGISTICA',
          tipo: 'OC_BORRADOR_OLVIDADA',
          severidad: 'info',
          titulo: `📝 OC en borrador: ${r.nro_oc}`,
          detalle: `${sym} ${Number(r.total).toFixed(2)} · sin aprobar/enviar`,
          link: '#logistica',
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LOGISTICA — Alertas del rediseño kanban (mig 062)
    // ═══════════════════════════════════════════════════════════
    if (tieneLogistica) {
      const UMBRAL = 15;

      // 1. Deudas a proveedor sin pagar > 15 días
      try {
        const [deudas]: any = await db.query(`
          SELECT oc.id_oc, oc.nro_oc, p.razon_social,
                 (oc.total - COALESCE(oc.monto_pagado, 0)) AS saldo,
                 oc.created_at
            FROM OrdenesCompra oc
            JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
           WHERE oc.estado_pago IN ('PENDIENTE','PARCIAL')
             AND oc.estado NOT IN ('BORRADOR','ANULADA','TERMINADA','CERRADA_SIN_FACTURA')
             AND oc.created_at < (CURRENT_TIMESTAMP - INTERVAL '${UMBRAL} days')
           ORDER BY oc.created_at ASC
           LIMIT 10
        `);
        for (const r of deudas as any[]) {
          alertas.push({
            id: `oc-deuda-${r.id_oc}`,
            modulo: 'LOGISTICA',
            tipo: 'OC_DEUDA_PROVEEDOR',
            severidad: 'danger',
            titulo: `💸 Deuda con ${r.razon_social}`,
            detalle: `OC ${r.nro_oc} · saldo S/ ${Number(r.saldo).toFixed(2)} · creada hace +${UMBRAL}d`,
            link: `#logistica/oc?id=${r.id_oc}`,
          });
        }
      } catch (_) { /* tabla puede no existir aún */ }

      // 2. Pago hecho sin recepción > 15 días
      try {
        const [pagosSinRec]: any = await db.query(`
          SELECT oc.id_oc, oc.nro_oc, p.razon_social, oc.total, oc.pagada_at,
                 SUM(d.cantidad_recibida) AS recibido,
                 SUM(d.cantidad) AS pedido
            FROM OrdenesCompra oc
            JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
            JOIN DetalleOrdenCompra d ON d.id_oc = oc.id_oc
           WHERE oc.estado_pago='PAGADO'
             AND oc.pagada_at < (CURRENT_TIMESTAMP - INTERVAL '${UMBRAL} days')
             AND oc.estado NOT IN ('TERMINADA','CERRADA_SIN_FACTURA','ANULADA')
           GROUP BY oc.id_oc, oc.nro_oc, p.razon_social, oc.total, oc.pagada_at
           HAVING SUM(d.cantidad_recibida) < SUM(d.cantidad)
           LIMIT 10
        `);
        for (const r of pagosSinRec as any[]) {
          alertas.push({
            id: `oc-pago-sin-rec-${r.id_oc}`,
            modulo: 'LOGISTICA',
            tipo: 'OC_PAGO_SIN_RECEPCION',
            severidad: 'danger',
            titulo: `📦❌ Pagamos pero no recibimos`,
            detalle: `OC ${r.nro_oc} · ${r.razon_social} · S/ ${Number(r.total).toFixed(2)} pagada hace +${UMBRAL}d`,
            link: `#logistica/oc?id=${r.id_oc}`,
          });
        }
      } catch (_) { /* tabla puede no existir aún */ }

      // 3. Crédito por vencer (en los próximos 15 días)
      try {
        const [credPorVenc]: any = await db.query(`
          SELECT oc.id_oc, oc.nro_oc, p.razon_social, oc.total, oc.fecha_credito_vence
            FROM OrdenesCompra oc
            JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
           WHERE oc.forma_pago='CREDITO'
             AND oc.estado_pago <> 'PAGADO'
             AND oc.fecha_credito_vence IS NOT NULL
             AND oc.fecha_credito_vence <= (CURRENT_DATE + INTERVAL '${UMBRAL} days')
           ORDER BY oc.fecha_credito_vence ASC
           LIMIT 10
        `);
        for (const r of credPorVenc as any[]) {
          alertas.push({
            id: `oc-cred-${r.id_oc}`,
            modulo: 'LOGISTICA',
            tipo: 'OC_CREDITO_POR_VENCER',
            severidad: 'warn',
            titulo: `📅 Crédito vence ${r.fecha_credito_vence}`,
            detalle: `OC ${r.nro_oc} · ${r.razon_social} · S/ ${Number(r.total).toFixed(2)}`,
            link: `#logistica/oc?id=${r.id_oc}`,
          });
        }
      } catch (_) { /* col fecha_credito_vence puede no existir aún */ }

      // 4. OCs en facturación sin factura del proveedor > 15 días
      try {
        const [sinFact]: any = await db.query(`
          SELECT oc.id_oc, oc.nro_oc, p.razon_social, oc.updated_at
            FROM OrdenesCompra oc
            JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
           WHERE oc.estado='FACTURACION'
             AND oc.estado_factura='PENDIENTE'
             AND oc.updated_at < (CURRENT_TIMESTAMP - INTERVAL '${UMBRAL} days')
           ORDER BY oc.updated_at ASC
           LIMIT 10
        `);
        for (const r of sinFact as any[]) {
          alertas.push({
            id: `oc-sin-fact-${r.id_oc}`,
            modulo: 'LOGISTICA',
            tipo: 'OC_SIN_FACTURA_PROVEEDOR',
            severidad: 'warn',
            titulo: `📄❌ Falta factura del proveedor`,
            detalle: `OC ${r.nro_oc} · ${r.razon_social} · esperando hace +${UMBRAL}d`,
            link: `#logistica/oc?id=${r.id_oc}`,
          });
        }
      } catch (_) { /* col estado_factura puede no existir aún */ }

      // 5. OCs cerradas sin factura este mes (info para Gerencia)
      try {
        const [cerradasMes]: any = await db.query(`
          SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS monto
            FROM OrdenesCompra
           WHERE estado='CERRADA_SIN_FACTURA'
             AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE)
        `);
        const cnt = Number(cerradasMes[0]?.cnt || 0);
        if (cnt > 0) {
          alertas.push({
            id: `oc-cerradas-sin-fact-mes`,
            modulo: 'LOGISTICA',
            tipo: 'OC_CERRADAS_SIN_FACT_MES',
            severidad: 'info',
            titulo: `📊 ${cnt} OCs cerradas sin factura este mes`,
            detalle: `Monto total S/ ${Number(cerradasMes[0].monto).toFixed(2)} · IGV no recuperable`,
            link: `#logistica/oc?filtro=cerradas_sin_factura`,
          });
        }
      } catch (_) { /* */ }
    }

    return alertas;
  }

  /**
   * Persiste el ciclo de vida de las alertas en AlertasHistorial.
   * Llamado desde listar() después de calcular las activas.
   * - Inserta nuevas (alerta_id que no estaba activa)
   * - Cierra resueltas (estaban activas y ya no aparecen)
   *
   * Importante: el log es GLOBAL, no por usuario. La consulta de historial
   * filtra después por módulo según los permisos del usuario.
   */
  async snapshot(activasGlobal: Alerta[]): Promise<void> {
    try {
      // 1. ¿Cuáles están actualmente abiertas en BD?
      const [abiertas]: any = await db.query(
        `SELECT alerta_id FROM AlertasHistorial WHERE fecha_resuelta IS NULL`
      );
      const abiertasSet = new Set((abiertas as any[]).map(r => r.alerta_id));
      const activasSet  = new Set(activasGlobal.map(a => a.id));

      // 2. Las que están activas ahora pero NO en BD → INSERT
      for (const a of activasGlobal) {
        if (!abiertasSet.has(a.id)) {
          await db.query(
            `INSERT INTO AlertasHistorial
              (alerta_id, modulo, tipo, severidad, titulo, detalle, link, fecha_aparicion)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [a.id, a.modulo, a.tipo, a.severidad, a.titulo, a.detalle ?? null, a.link ?? null]
          );
        }
      }

      // 3. Las que están abiertas en BD pero ya no aparecen → UPDATE resuelta
      for (const idAbierta of abiertasSet) {
        if (!activasSet.has(idAbierta)) {
          await db.query(
            `UPDATE AlertasHistorial SET fecha_resuelta = NOW()
             WHERE alerta_id = ? AND fecha_resuelta IS NULL`,
            [idAbierta]
          );
        }
      }
    } catch (e) {
      // El snapshot es best-effort. Si la tabla aún no existe, no rompemos /alertas
      console.warn('[AlertasService] snapshot falló (migración 035 aplicada?):', (e as Error).message);
    }
  }

  /**
   * Listado para el endpoint /alertas/historial — incluye resueltas y activas.
   * Filtra por módulos del usuario (GERENTE ve todos los módulos).
   * Devuelve hasta `limite` registros ordenados por fecha_aparicion DESC.
   */
  async historial(modulosUsuario: string[], rol: string, limite = 100): Promise<any[]> {
    const esGerente = rol === 'GERENTE';
    const modulosPermitidos: string[] = esGerente
      ? ['ALMACEN', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ADMINISTRACION']
      : modulosUsuario.filter(m => ['ALMACEN', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ADMINISTRACION'].includes(m));

      if (modulosPermitidos.length === 0) return [];

      const placeholders = modulosPermitidos.map(() => '?').join(',');
      try {
        const [rows]: any = await db.query(
          `SELECT id_log, alerta_id, modulo, tipo, severidad, titulo, detalle, link,
                  fecha_aparicion, fecha_resuelta,
                  CASE WHEN fecha_resuelta IS NULL THEN 1 ELSE 0 END AS activa
            FROM AlertasHistorial
            WHERE modulo IN (${placeholders})
            ORDER BY fecha_aparicion DESC
            LIMIT ?`,
          [...modulosPermitidos, limite]
        );
        return rows as any[];
      } catch (e) {
        console.warn('[AlertasService] historial falló:', (e as Error).message);
        return [];
      }
  }

  /**
   * KPIs y agregados para el dashboard de alertas.
   * Filtra por módulos del usuario.
   */
  async dashboard(modulosUsuario: string[], rol: string): Promise<any> {
    const esGerente = rol === 'GERENTE';
    const modulosPermitidos: string[] = esGerente
      ? ['ALMACEN', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ADMINISTRACION']
      : modulosUsuario.filter(m => ['ALMACEN', 'COMERCIAL', 'FINANZAS', 'LOGISTICA', 'ADMINISTRACION'].includes(m));

      if (modulosPermitidos.length === 0) {
        return {
          totales: { activas: 0, resueltas: 0, total_historico: 0 },
          por_severidad: { info: 0, warn: 0, danger: 0 },
          por_modulo: [],
          por_tipo: [],
          tendencia_30d: [],
          tiempo_promedio_resolucion_dias: null,
        };
      }

      const ph = modulosPermitidos.map(() => '?').join(',');

      try {
        // Totales
        const [totRows]: any = await db.query(
          `SELECT
              COUNT(*) FILTER (WHERE fecha_resuelta IS NULL)::int AS activas,
              COUNT(*) FILTER (WHERE fecha_resuelta IS NOT NULL)::int AS resueltas,
              COUNT(*)::int AS total
           FROM AlertasHistorial WHERE modulo IN (${ph})`,
          modulosPermitidos
        );
        const tot = (totRows as any[])[0] || { activas: 0, resueltas: 0, total: 0 };

        // Por severidad (solo activas)
        const [sevRows]: any = await db.query(
          `SELECT severidad, COUNT(*)::int AS n
            FROM AlertasHistorial
            WHERE fecha_resuelta IS NULL AND modulo IN (${ph})
            GROUP BY severidad`,
          modulosPermitidos
        );
        const por_severidad: any = { info: 0, warn: 0, danger: 0 };
        for (const r of (sevRows as any[])) por_severidad[r.severidad] = Number(r.n);

        // Por módulo (activas)
        const [modRows]: any = await db.query(
          `SELECT modulo, COUNT(*)::int AS n
            FROM AlertasHistorial
            WHERE fecha_resuelta IS NULL AND modulo IN (${ph})
            GROUP BY modulo
            ORDER BY n DESC`,
          modulosPermitidos
        );

        // Top tipos (totalidad histórica)
        const [tipoRows]: any = await db.query(
          `SELECT tipo, COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE fecha_resuelta IS NULL)::int AS activas
            FROM AlertasHistorial
            WHERE modulo IN (${ph})
            GROUP BY tipo
            ORDER BY total DESC
            LIMIT 10`,
          modulosPermitidos
        );

        // Tendencia últimos 30 días (alertas nuevas por día)
        const [tendRows]: any = await db.query(
          `SELECT DATE(fecha_aparicion)::text AS dia, COUNT(*)::int AS n
            FROM AlertasHistorial
            WHERE fecha_aparicion >= (CURRENT_DATE - INTERVAL '30 days')
              AND modulo IN (${ph})
            GROUP BY DATE(fecha_aparicion)
            ORDER BY dia ASC`,
          modulosPermitidos
        );

        // Tiempo promedio de resolución
        const [tprRows]: any = await db.query(
          `SELECT AVG(EXTRACT(EPOCH FROM (fecha_resuelta - fecha_aparicion)) / 86400.0) AS dias_prom
            FROM AlertasHistorial
            WHERE fecha_resuelta IS NOT NULL AND modulo IN (${ph})`,
          modulosPermitidos
        );

        return {
          totales: {
            activas: Number(tot.activas || 0),
            resueltas: Number(tot.resueltas || 0),
            total_historico: Number(tot.total || 0),
          },
          por_severidad,
          por_modulo: modRows,
          por_tipo: tipoRows,
          tendencia_30d: tendRows,
          tiempo_promedio_resolucion_dias: tprRows[0]?.dias_prom != null
            ? Number(Number(tprRows[0].dias_prom).toFixed(1))
            : null,
        };
      } catch (e) {
        console.warn('[AlertasService] dashboard falló:', (e as Error).message);
        return null;
      }
  }
}

export default new AlertasService();

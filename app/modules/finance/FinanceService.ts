import { db } from '../../../database/connection';

class FinanceService {
  /**
   * FOTO DEL DÍA: Resumen Operativo y Alertas Tempranas (UX Command Center)
   */
  async getResumenOperativo() {
    // 1. Finanzas del Día
    const [rowsTransaccionesHoy] = await db.query(`
      SELECT 
        SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN total_base ELSE 0 END) AS ingresos_hoy,
        SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN total_base ELSE 0 END) AS egresos_hoy
      FROM Transacciones
      WHERE DATE(fecha) = CURDATE()
    `);
    const th = (rowsTransaccionesHoy as any)[0];

    const [rowsCaja] = await db.query(`
      SELECT 
        SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN total_base ELSE 0 END) -
        SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN total_base ELSE 0 END) AS saldo_actual
      FROM Transacciones
    `);
    const saldo = Number((rowsCaja as any)[0].saldo_actual || 0);

    // 2. Alerta: Servicios con Pérdida (CRÍTICO)
    const [rowsPerdida] = await db.query(`
      SELECT s.codigo, s.nombre, s.monto_base, 
      IFNULL((SELECT SUM(monto_base) FROM CostosServicio WHERE id_servicio = s.id_servicio), 0) AS costos
      FROM Servicios s
      HAVING (monto_base - costos) < 0
    `);

    // 2b. Alerta: Servicios con Margen Bajo < 20% (ADVERTENCIA)
    const [rowsMargenBajo] = await db.query(`
      SELECT s.codigo, s.nombre, s.monto_base, 
      IFNULL((SELECT SUM(monto_base) FROM CostosServicio WHERE id_servicio = s.id_servicio), 0) AS costos
      FROM Servicios s
      HAVING (monto_base - costos) >= 0 AND monto_base > 0 AND ((monto_base - costos) / monto_base) < 0.20
    `);

    // 3. Alerta: Stock Bajo (ADVERTENCIA)
    const [rowsStockBajo] = await db.query(`
      SELECT sku, nombre, stock_actual, stock_minimo, unidad
      FROM Inventario
      WHERE stock_actual <= stock_minimo
    `);

    // 4. Alerta: Clientes Morosos Vencidos (CRÍTICO)
    const [rowsMorosos] = await db.query(`
      SELECT codigo, cliente, fecha_vencimiento,
      (total_base - monto_detraccion - IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='SERVICIO' AND referencia_id = id_servicio AND tipo_movimiento='INGRESO'), 0)) as deuda
      FROM Servicios
      WHERE estado IN ('PENDIENTE', 'PARCIAL') AND fecha_vencimiento < CURDATE()
    `);

    // 4b. Alerta: Clientes Por Vencer (<= 5 días) (ADVERTENCIA)
    const [rowsPorVencer] = await db.query(`
      SELECT codigo, cliente, fecha_vencimiento,
      (total_base - monto_detraccion - IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='SERVICIO' AND referencia_id = id_servicio AND tipo_movimiento='INGRESO'), 0)) as deuda,
      DATEDIFF(fecha_vencimiento, CURDATE()) as dias_restantes
      FROM Servicios
      WHERE estado IN ('PENDIENTE', 'PARCIAL') AND fecha_vencimiento >= CURDATE() AND DATEDIFF(fecha_vencimiento, CURDATE()) <= 5
    `);

    return {
      caja_diaria: {
        saldo_global: saldo,
        ingresos_hoy: Number(th.ingresos_hoy || 0),
        egresos_hoy: Number(th.egresos_hoy || 0)
      },
      alertas: {
        perdidas: rowsPerdida,
        margen_bajo: rowsMargenBajo,
        stock_bajo: rowsStockBajo,
        morosos: rowsMorosos,
        por_vencer: rowsPorVencer
      }
    };
  }

  /**
   * PANÓPTICO GLOBAL: KPIs principales para Dashboard
   */
  async getDashboardMaster() {
    // 1. Caja Real (Todo Ingreso vs Todo Egreso en tabla Transacciones)
    const [rowsCaja] = await db.query(`
      SELECT 
        SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN total_base ELSE 0 END) AS ingresos_caja,
        SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN total_base ELSE 0 END) AS egresos_caja,
        SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto_base ELSE 0 END) AS ingresos_base,
        SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN monto_base ELSE 0 END) AS egresos_base
      FROM Transacciones
    `);
    const caja = (rowsCaja as any)[0];
    const saldo_actual = Number(caja.ingresos_caja) - Number(caja.egresos_caja);

    // 2. Sangría y Deuda: CxP y CxC consolidadas globales
    const [rowsCxC] = await db.query(`
      SELECT SUM(total_base) - IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='SERVICIO' AND tipo_movimiento='INGRESO'), 0) as deuda_clientes
      FROM Servicios WHERE estado IN ('PENDIENTE', 'PARCIAL')
    `);
    const cxcGlobal = Number((rowsCxC as any)[0].deuda_clientes || 0);

    const [rowsCxP_Compras] = await db.query(`
      SELECT SUM(total_base) - IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='COMPRA' AND tipo_movimiento='EGRESO'), 0) as deuda_prov
      FROM Compras WHERE estado_pago IN ('PENDIENTE', 'PARCIAL')
    `);
    const [rowsCxP_Gastos] = await db.query(`
      SELECT SUM(total_base) - IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='GASTO' AND tipo_movimiento='EGRESO'), 0) as deuda_gastos
      FROM Gastos WHERE estado_pago IN ('PENDIENTE', 'PARCIAL')
    `);
    const cxpGlobal = Number((rowsCxP_Compras as any)[0]?.deuda_prov || 0) + Number((rowsCxP_Gastos as any)[0]?.deuda_gastos || 0);

    return {
      caja: {
        ingresos: Number(caja.ingresos_caja || 0),
        egresos: Number(caja.egresos_caja || 0),
        saldo_actual: saldo_actual,
        ingresos_base: Number(caja.ingresos_base || 0),
        egresos_base: Number(caja.egresos_base || 0)
      },
      indicadores: {
        por_cobrar: cxcGlobal,
        por_pagar: cxpGlobal,
        liquidez_proyectada: saldo_actual + cxcGlobal - cxpGlobal
      }
    };
  }

  /**
   * ALGORITMO DE MORA: Cuentas Por Cobrar detalladas
   */
  async getCuentasPorCobrar() {
    const query = `
      SELECT 
        s.id_servicio, s.codigo, s.cliente, s.fecha_servicio, s.fecha_vencimiento,
        s.total_base, s.monto_detraccion, s.estado,
        IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='SERVICIO' AND referencia_id = s.id_servicio AND tipo_movimiento='INGRESO'), 0) AS cobrado,
        DATEDIFF(s.fecha_vencimiento, CURDATE()) as dias_mora
      FROM Servicios s
      WHERE s.estado IN ('PENDIENTE', 'PARCIAL')
      ORDER BY s.fecha_vencimiento ASC
    `;
    const [rows] = await db.query(query);
    
    return (rows as any[]).map(r => {
      const deudaNeta = Number(r.total_base) - Number(r.monto_detraccion) - Number(r.cobrado);
      let semaforo = 'NORMAL';
      if (r.dias_mora < 0) semaforo = 'VENCIDO';
      else if (r.dias_mora <= 5) semaforo = 'POR_VENCER';

      return {
        ...r,
        deuda_activa: deudaNeta,
        alerta: semaforo
      };
    });
  }

  /**
   * ALGORITMO DE PASIVO: Cuentas Por Pagar detalladas (Logística y Operativa)
   */
  async getCuentasPorPagar() {
    const queryCompras = `
      SELECT 
        'COMPRA' as tipo, c.id_compra as id, c.nro_comprobante as doc, p.razon_social as acreedor, c.fecha,
        c.total_base, c.estado_pago as estado,
        IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='COMPRA' AND referencia_id=c.id_compra AND tipo_movimiento='EGRESO'), 0) AS pagado
      FROM Compras c
      JOIN Proveedores p ON c.id_proveedor = p.id_proveedor
      WHERE c.estado_pago IN ('PENDIENTE', 'PARCIAL')
    `;
    const queryGastos = `
      SELECT 
        'GASTO' as tipo, g.id_gasto as id, g.concepto as doc, g.proveedor_nombre as acreedor, g.fecha,
        g.total_base, g.estado_pago as estado,
        IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='GASTO' AND referencia_id=g.id_gasto AND tipo_movimiento='EGRESO'), 0) AS pagado
      FROM Gastos g
      WHERE g.estado_pago IN ('PENDIENTE', 'PARCIAL')
    `;

    const [compras] = await db.query(queryCompras);
    const [gastos] = await db.query(queryGastos);

    const pool = [...(compras as any[]), ...(gastos as any[])].map(r => {
       return {
          ...r,
          deuda_activa: Number(r.total_base) - Number(r.pagado) 
       };
    });

    pool.sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    return pool;
  }

  /**
   * CRUD GASTOS FIJOS
   */
  async getGastos() {
    const [rows] = await db.query(`
      SELECT g.*,
        s.codigo as servicio_codigo, s.cliente as servicio_cliente,
        IFNULL((SELECT SUM(monto_base) FROM Transacciones
          WHERE referencia_tipo='GASTO' AND referencia_id=g.id_gasto
          AND tipo_movimiento='EGRESO' AND estado != 'ANULADO'), 0) as pagado
      FROM Gastos g
      LEFT JOIN Servicios s ON g.id_servicio = s.id_servicio
      WHERE g.estado != 'ANULADO'
      ORDER BY g.fecha DESC
    `);
    return rows;
  }

  async createGasto(data: any) {
    const aplica_igv = !!data.aplica_igv;
    const monto_base = Number(data.monto_base);
    const igv_base = aplica_igv ? (monto_base * 0.18) : 0;
    const total_base = monto_base + igv_base;
    const detraccion_pct = Number(data.detraccion_porcentaje || 0);
    const monto_detraccion = detraccion_pct > 0 ? (monto_base * detraccion_pct / 100) : 0;
    const detraccion_depositada = detraccion_pct > 0 ? 'NO' : 'NA';

    const [res] = await db.query(`
      INSERT INTO Gastos (nro_oc, codigo_contador, id_servicio, tipo_gasto, fecha, concepto, proveedor_nombre, nro_comprobante,
        monto_base, aplica_igv, igv_base, total_base,
        detraccion_porcentaje, monto_detraccion, detraccion_depositada,
        estado, estado_pago)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADO', 'PENDIENTE')
    `, [data.nro_oc || null, data.codigo_contador || null,
        data.id_servicio || null, data.tipo_gasto || 'OPERATIVO',
        data.fecha, data.concepto, data.proveedor_nombre,
        data.nro_comprobante || 'S/N', monto_base, aplica_igv, igv_base, total_base,
        detraccion_pct, monto_detraccion, detraccion_depositada]);

    if (data.id_servicio) {
      await db.query(`
        INSERT INTO CostosServicio (id_servicio, concepto, monto_original, monto_base, tipo_costo, fecha)
        VALUES (?, ?, ?, ?, 'GASTO', ?)
      `, [data.id_servicio, data.concepto, monto_base, monto_base, data.fecha]);
    }

    return { success: true, id_gasto: (res as any).insertId };
  }

  async registrarPagoGasto(id_gasto: number, abono: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
        const [rows] = await conn.query("SELECT total_base, estado_pago FROM Gastos WHERE id_gasto = ? FOR UPDATE", [id_gasto]);
        const g = (rows as any)[0];
        if (!g) throw new Error("Gasto no mapeado");

        await conn.query(`
           INSERT INTO Transacciones (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento, monto_original, igv_original, total_original, monto_base, igv_base, total_base, fecha, descripcion)
           VALUES (1, 'GASTO', ?, 'EGRESO', ?, 0, ?, ?, 0, ?, NOW(), 'Pago Gasto Operativo')
        `, [id_gasto, abono, abono, abono, abono]);

        const [rowsPagos] = await conn.query("SELECT IFNULL(SUM(monto_base), 0) as liquidado FROM Transacciones WHERE referencia_tipo='GASTO' AND referencia_id = ? AND tipo_movimiento='EGRESO'", [id_gasto]);
        const depositoAcumulado = Number((rowsPagos as any)[0].liquidado);
        
        let nwStatus = 'PARCIAL';
        if (Math.abs(Number(g.total_base) - depositoAcumulado) < 0.1) nwStatus = 'PAGADO';

        await conn.query("UPDATE Gastos SET estado_pago = ? WHERE id_gasto = ?", [nwStatus, id_gasto]);
        
        await conn.commit();
        return { success: true, nwStatus };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
  }

  /**
   * ANULACIÓN PROFESIONAL: Revierte el impacto en el Flujo de Caja.
   */
  async anularGasto(idGasto: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Verificar estado actual
      const [rows] = await conn.query('SELECT estado, concepto FROM Gastos WHERE id_gasto = ? FOR UPDATE', [idGasto]);
      const gasto = (rows as any)[0];
      if (!gasto) throw new Error('Gasto no encontrado.');
      if (gasto.estado === 'ANULADO') throw new Error('Este gasto ya se encuentra anulado.');

      // 2. Anular Cabecera y Transacciones Financieras
      await conn.query("UPDATE Gastos SET estado = 'ANULADO', estado_pago = 'ANULADO', tipo_ultima_accion = 'ANULACION' WHERE id_gasto = ?", [idGasto]);
      await conn.query("UPDATE Transacciones SET estado = 'ANULADO' WHERE referencia_tipo = 'GASTO' AND referencia_id = ?", [idGasto]);

      await conn.commit();
      return { success: true, msg: 'Gasto anulado y transacciones revertidas correctamente.' };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

}

export default new FinanceService();

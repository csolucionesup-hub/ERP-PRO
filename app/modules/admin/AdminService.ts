import { db } from '../../../database/connection';

class AdminService {
  async resetDb() {
    const conn = await (db as any).getConnection();
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS=0');
      const tables = [
        'Transacciones', 'CostosServicio', 'MovimientosInventario',
        'DetalleCompra', 'Detracciones', 'PagosImpuestos',
        'Servicios', 'Compras', 'Gastos', 'Inventario',
        'Proveedores', 'PrestamosTomados', 'PrestamosOtorgados', 'TipoCambio'
      ];
      for (const t of tables) {
        await conn.query(`TRUNCATE TABLE \`${t}\``);
      }
      await conn.query('DELETE FROM Cuentas WHERE id_cuenta != 1');
      const [rows] = await conn.query('SELECT id_cuenta FROM Cuentas WHERE id_cuenta = 1');
      if ((rows as any[]).length === 0) {
        await conn.query(
          "INSERT INTO Cuentas (nombre, tipo, saldo_actual) VALUES ('Caja General Soles', 'EFECTIVO', 0.00)"
        );
      }
      await conn.query('SET FOREIGN_KEY_CHECKS=1');
      console.log('[ADMIN] Base de datos reseteada exitosamente');
      return { success: true, mensaje: 'Base de datos reseteada correctamente' };
    } catch (err: any) {
      await conn.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
      console.error('[ADMIN] Error en reset-db:', err);
      throw err;
    } finally {
      conn.release();
    }
  }

  async getCuentasSaldo() {
    const [rows] = await db.query(
      'SELECT id_cuenta, nombre, moneda, saldo_actual FROM Cuentas WHERE id_cuenta IN (1, 2)'
    );
    return rows;
  }

  /**
   * Consolidado de gasto en personal desde Logística:
   * - Tipo GENERAL  → centro_costo = 'OFICINA CENTRAL' (personal oficina)
   * - Tipo SERVICIO → centro_costo = nombre del proyecto (personal en obra)
   * Solo gastos CONFIRMADOS, no anulados.
   */
  async getGastoPersonal(anio: number, mes?: number) {
    const params: any[] = [anio];
    const mesFiltro = mes ? 'AND MONTH(g.fecha) = ?' : '';
    if (mes) params.push(mes);

    // 1. Totales por centro de costo y mes
    const [resumen] = await db.query(`
      SELECT
        g.centro_costo,
        g.tipo_gasto_logistica,
        MONTH(g.fecha) AS mes,
        SUM(g.monto_base) AS total_gasto,
        COUNT(*) AS cantidad
      FROM Gastos g
      WHERE g.estado != 'ANULADO'
        AND g.tipo_gasto_logistica IN ('GENERAL', 'SERVICIO')
        AND YEAR(g.fecha) = ?
        ${mesFiltro}
      GROUP BY g.centro_costo, g.tipo_gasto_logistica, MONTH(g.fecha)
      ORDER BY MONTH(g.fecha), g.tipo_gasto_logistica, g.centro_costo
    `, params);

    // 2. Detalle individual
    const [detalle] = await db.query(`
      SELECT
        g.id_gasto,
        g.fecha,
        g.proveedor_nombre,
        g.concepto,
        g.monto_base,
        g.total_base,
        g.aplica_igv,
        g.centro_costo,
        g.tipo_gasto_logistica,
        g.estado_pago
      FROM Gastos g
      WHERE g.estado != 'ANULADO'
        AND g.tipo_gasto_logistica IN ('GENERAL', 'SERVICIO')
        AND YEAR(g.fecha) = ?
        ${mesFiltro}
      ORDER BY g.fecha DESC
    `, params);

    // 3. Total global del período
    const [totales] = await db.query(`
      SELECT
        SUM(CASE WHEN g.tipo_gasto_logistica = 'GENERAL'  THEN g.monto_base ELSE 0 END) AS total_oficina,
        SUM(CASE WHEN g.tipo_gasto_logistica = 'SERVICIO' THEN g.monto_base ELSE 0 END) AS total_proyectos,
        SUM(g.monto_base) AS total_general
      FROM Gastos g
      WHERE g.estado != 'ANULADO'
        AND g.tipo_gasto_logistica IN ('GENERAL', 'SERVICIO')
        AND YEAR(g.fecha) = ?
        ${mesFiltro}
    `, params);

    return {
      anio,
      mes: mes || null,
      totales: (totales as any[])[0],
      resumen: resumen,
      detalle: detalle
    };
  }

  async setSaldoInicial(data: { saldo_pen: number; saldo_usd: number; tipo_cambio: number }) {
    const conn = await (db as any).getConnection();
    try {
      await conn.query('UPDATE Cuentas SET saldo_actual = ? WHERE id_cuenta = 1', [data.saldo_pen]);
      const [rows] = await conn.query('SELECT id_cuenta FROM Cuentas WHERE id_cuenta = 2');
      if ((rows as any[]).length === 0) {
        await conn.query(
          "INSERT INTO Cuentas (id_cuenta, nombre, tipo, moneda, saldo_actual) VALUES (2, 'Caja General Dólares', 'EFECTIVO', 'USD', ?)",
          [data.saldo_usd]
        );
      } else {
        await conn.query('UPDATE Cuentas SET saldo_actual = ? WHERE id_cuenta = 2', [data.saldo_usd]);
      }
      console.log(`[ADMIN] Saldo inicial configurado — PEN: ${data.saldo_pen}, USD: ${data.saldo_usd} (TC: ${data.tipo_cambio})`);
      return { success: true, mensaje: 'Saldo inicial aplicado correctamente' };
    } catch (err: any) {
      console.error('[ADMIN] Error en saldo-inicial:', err);
      throw err;
    } finally {
      conn.release();
    }
  }
}

export default new AdminService();

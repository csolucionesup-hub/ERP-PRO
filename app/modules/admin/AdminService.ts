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
    // Duplicamos params porque los queries hacen UNION ALL (Gastos legacy + OrdenesCompra nueva)
    const mesFiltroGastos = mes ? 'AND MONTH(g.fecha) = ?' : '';
    const mesFiltroOCs    = mes ? 'AND MONTH(oc.fecha_emision) = ?' : '';
    const paramsGastos: any[] = mes ? [anio, mes] : [anio];
    const paramsOCs:    any[] = mes ? [anio, mes] : [anio];
    const paramsUnion = [...paramsGastos, ...paramsOCs];

    // 1. Totales por centro de costo y mes — UNION Gastos legacy + OrdenesCompra
    const [resumen] = await db.query(`
      SELECT centro_costo, tipo_gasto_logistica, mes, SUM(total_gasto) AS total_gasto, SUM(cantidad) AS cantidad
      FROM (
        SELECT g.centro_costo, g.tipo_gasto_logistica, MONTH(g.fecha) AS mes,
               SUM(g.monto_base) AS total_gasto, COUNT(*) AS cantidad
          FROM Gastos g
         WHERE g.estado != 'ANULADO'
           AND g.tipo_gasto_logistica IN ('GENERAL', 'SERVICIO')
           AND YEAR(g.fecha) = ?
           ${mesFiltroGastos}
         GROUP BY g.centro_costo, g.tipo_gasto_logistica, MONTH(g.fecha)
        UNION ALL
        SELECT oc.centro_costo, oc.tipo_oc AS tipo_gasto_logistica, MONTH(oc.fecha_emision) AS mes,
               SUM(CASE WHEN oc.moneda='PEN' THEN oc.total ELSE oc.total * oc.tipo_cambio END) AS total_gasto,
               COUNT(*) AS cantidad
          FROM OrdenesCompra oc
         WHERE oc.estado != 'ANULADA'
           AND oc.tipo_oc IN ('GENERAL', 'SERVICIO')
           AND YEAR(oc.fecha_emision) = ?
           ${mesFiltroOCs}
         GROUP BY oc.centro_costo, oc.tipo_oc, MONTH(oc.fecha_emision)
      ) t
      GROUP BY centro_costo, tipo_gasto_logistica, mes
      ORDER BY mes, tipo_gasto_logistica, centro_costo
    `, paramsUnion);

    // 2. Detalle individual (Gastos + OCs)
    const [detalle] = await db.query(`
      SELECT id_ref, fuente, fecha, proveedor_nombre, concepto, monto_base, total_base,
             aplica_igv, centro_costo, tipo_gasto_logistica, estado_pago
      FROM (
        SELECT g.id_gasto AS id_ref, 'GASTO' AS fuente, g.fecha, g.proveedor_nombre,
               g.concepto, g.monto_base, g.total_base, g.aplica_igv,
               g.centro_costo, g.tipo_gasto_logistica, g.estado_pago
          FROM Gastos g
         WHERE g.estado != 'ANULADO'
           AND g.tipo_gasto_logistica IN ('GENERAL', 'SERVICIO')
           AND YEAR(g.fecha) = ?
           ${mesFiltroGastos}
        UNION ALL
        SELECT oc.id_oc AS id_ref, 'OC' AS fuente, oc.fecha_emision AS fecha,
               p.razon_social AS proveedor_nombre, oc.nro_oc AS concepto,
               (CASE WHEN oc.moneda='PEN' THEN oc.subtotal ELSE oc.subtotal * oc.tipo_cambio END) AS monto_base,
               (CASE WHEN oc.moneda='PEN' THEN oc.total    ELSE oc.total    * oc.tipo_cambio END) AS total_base,
               oc.aplica_igv, oc.centro_costo, oc.tipo_oc AS tipo_gasto_logistica,
               (CASE WHEN oc.estado='PAGADA' THEN 'PAGADO' ELSE 'PENDIENTE' END) AS estado_pago
          FROM OrdenesCompra oc
          LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
         WHERE oc.estado != 'ANULADA'
           AND oc.tipo_oc IN ('GENERAL', 'SERVICIO')
           AND YEAR(oc.fecha_emision) = ?
           ${mesFiltroOCs}
      ) u
      ORDER BY fecha DESC
    `, paramsUnion);

    // 3. Total global del período (Gastos + OCs)
    const [totales] = await db.query(`
      SELECT
        SUM(CASE WHEN tipo = 'GENERAL'  THEN monto ELSE 0 END) AS total_oficina,
        SUM(CASE WHEN tipo = 'SERVICIO' THEN monto ELSE 0 END) AS total_proyectos,
        SUM(monto) AS total_general
      FROM (
        SELECT g.tipo_gasto_logistica AS tipo, g.monto_base AS monto
          FROM Gastos g
         WHERE g.estado != 'ANULADO'
           AND g.tipo_gasto_logistica IN ('GENERAL', 'SERVICIO')
           AND YEAR(g.fecha) = ?
           ${mesFiltroGastos}
        UNION ALL
        SELECT oc.tipo_oc AS tipo,
               (CASE WHEN oc.moneda='PEN' THEN oc.total ELSE oc.total * oc.tipo_cambio END) AS monto
          FROM OrdenesCompra oc
         WHERE oc.estado != 'ANULADA'
           AND oc.tipo_oc IN ('GENERAL', 'SERVICIO')
           AND YEAR(oc.fecha_emision) = ?
           ${mesFiltroOCs}
      ) u
    `, paramsUnion);

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

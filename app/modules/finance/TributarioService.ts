import { db } from '../../../database/connection';

class TributarioService {
  async getCuentaBN() {
    const [depRows] = await db.query(`
      SELECT IFNULL(SUM(d.monto_depositado), 0) as depositado
      FROM Detracciones d
      JOIN Servicios s ON s.id_servicio = d.id_servicio
      WHERE d.cliente_deposito IN ('SI','PARCIAL') AND d.estado != 'ANULADO'
    `);
    const [pracRows] = await db.query(`
      SELECT IFNULL(SUM(d.monto), 0) as practicado
      FROM Detracciones d
      JOIN Servicios s ON s.id_servicio = d.id_servicio
      WHERE d.estado != 'ANULADO'
    `);
    const [pagRows] = await db.query(`
      SELECT IFNULL(SUM(monto), 0) as pagado FROM PagosImpuestos
    `);
    const depositado = Number((depRows as any)[0].depositado);
    const practicado = Number((pracRows as any)[0].practicado);
    const pagado = Number((pagRows as any)[0].pagado);

    const [pendientes] = await db.query(`
      SELECT d.*, s.codigo, s.cliente, s.total_base, s.fecha_servicio
      FROM Detracciones d
      JOIN Servicios s ON s.id_servicio = d.id_servicio
      WHERE d.cliente_deposito = 'NO' AND d.monto > 0 AND d.estado != 'ANULADO'
      ORDER BY s.fecha_servicio DESC
    `);
    const [pagos] = await db.query(
      `SELECT * FROM PagosImpuestos ORDER BY fecha DESC`
    );

    return {
      saldo_bn: depositado - pagado,
      total_depositado: depositado,
      total_practicado: practicado,
      pendiente_deposito: practicado - depositado,
      total_pagado_impuestos: pagado,
      detracciones_pendientes: pendientes,
      historial_pagos: pagos
    };
  }

  async marcarDepositado(idDetraccion: number, data: any) {
    const monto = Number(data.monto_depositado);
    const [rows] = await db.query(
      'SELECT monto, estado FROM Detracciones WHERE id_detraccion = ?',
      [idDetraccion]
    );
    const det = (rows as any)[0];
    if (!det) throw new Error('Detracción no encontrada');
    if (det.estado === 'ANULADO') throw new Error('No se puede depositar una detracción anulada');
    const estado = monto >= Number(det.monto) ? 'SI' : 'PARCIAL';
    await db.query(`
      UPDATE Detracciones SET cliente_deposito = ?, monto_depositado = ?,
      fecha_deposito = ?, estado = 'PAGADO'
      WHERE id_detraccion = ?
    `, [estado, monto, data.fecha_deposito || new Date(), idDetraccion]);
    return { success: true, estado_deposito: estado };
  }

  async marcarDetraccionPorServicio(idServicio: number, data: any) {
    const [rows] = await db.query(
      'SELECT id_detraccion FROM Detracciones WHERE id_servicio = ?',
      [idServicio]
    );
    const det = (rows as any)[0];
    if (!det) throw new Error('No existe detracción registrada para este servicio');
    return this.marcarDepositado(det.id_detraccion, data);
  }

  async registrarPagoImpuesto(data: any) {
    const [r] = await db.query(`
      INSERT INTO PagosImpuestos (fecha, tipo_impuesto, periodo, monto, descripcion)
      VALUES (?, ?, ?, ?, ?)
    `, [data.fecha, data.tipo_impuesto, data.periodo || '', Number(data.monto), data.descripcion || '']);
    return { success: true, id: (r as any).insertId };
  }

  async getControlIGV(anio?: number) {
    const ejercicio = anio || new Date().getFullYear();
    const [ventas] = await db.query(`
      SELECT MONTH(fecha_servicio) as mes, SUM(igv_base) as igv_ventas
      FROM Servicios WHERE estado!='ANULADO' AND aplica_igv=1
      AND YEAR(fecha_servicio) = ?
      GROUP BY YEAR(fecha_servicio), MONTH(fecha_servicio)
    `, [ejercicio]);
    const [compras] = await db.query(`
      SELECT MONTH(fecha) as mes, SUM(igv_base) as igv_compras
      FROM Compras WHERE estado!='ANULADO'
      AND YEAR(fecha) = ?
      GROUP BY YEAR(fecha), MONTH(fecha)
    `, [ejercicio]);
    const [gastos] = await db.query(`
      SELECT MONTH(fecha) as mes, SUM(igv_base) as igv_gastos
      FROM Gastos WHERE estado!='ANULADO' AND aplica_igv=1
      AND YEAR(fecha) = ?
      GROUP BY YEAR(fecha), MONTH(fecha)
    `, [ejercicio]);
    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const v = Number((ventas as any[]).find(r => r.mes === m)?.igv_ventas || 0);
      const c = Number((compras as any[]).find(r => r.mes === m)?.igv_compras || 0)
              + Number((gastos as any[]).find(r => r.mes === m)?.igv_gastos || 0);
      if (v > 0 || c > 0) meses.push({ anio: ejercicio, mes: m, igv_ventas: v, igv_compras: c, igv_neto: v - c });
    }
    return meses;
  }
}

export default new TributarioService();

import { db } from '../../../database/connection';

class PrestamosService {

  // ===== PRÉSTAMOS TOMADOS (lo que debo) =====

  async getTomados() {
    const [rows] = await db.query(`
      SELECT *, DATEDIFF(CURDATE(), fecha_emision) as dias_transcurridos
      FROM PrestamosTomados WHERE estado != 'ANULADO'
      ORDER BY fecha_emision DESC
    `);
    return rows;
  }

  async createTomado(data: any) {
    const capital = Number(data.monto_capital);
    const interes = Number(data.monto_interes || 0);
    const total = capital + interes;
    const moneda = (data.moneda || 'PEN').toUpperCase();
    const tipo_cambio = moneda === 'USD' ? Number(data.tipo_cambio) || 1 : 1;
    const [res] = await db.query(`
      INSERT INTO PrestamosTomados (nro_oc, acreedor, descripcion, comentario,
        fecha_emision, fecha_vencimiento, moneda, tipo_cambio,
        monto_capital, tasa_interes, monto_interes, monto_total, monto_pagado, saldo, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDIENTE')
    `, [data.nro_oc || null, data.acreedor, data.descripcion || '', data.comentario || '',
        data.fecha_emision, data.fecha_vencimiento || null, moneda, tipo_cambio,
        capital, Number(data.tasa_interes || 0), interes, total, total]);
    return { success: true, id: (res as any).insertId };
  }

  async pagarTomado(id: number, data: any) {
    const abono = Number(data.monto);
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        'SELECT monto_total, monto_pagado, estado FROM PrestamosTomados WHERE id_prestamo = ? FOR UPDATE',
        [id]
      );
      const p = (rows as any)[0];
      if (!p) throw new Error('Préstamo no encontrado');
      if (['PAGADO', 'ANULADO'].includes(p.estado)) throw new Error('No se puede abonar a un préstamo con estado ' + p.estado);
      const nuevoPagado = Number(p.monto_pagado) + abono;
      const nuevoSaldo = Number(p.monto_total) - nuevoPagado;
      const estado = nuevoSaldo <= 0.1 ? 'PAGADO' : 'PARCIAL';
      await conn.query(
        'UPDATE PrestamosTomados SET monto_pagado=?, saldo=?, estado=? WHERE id_prestamo=?',
        [nuevoPagado, Math.max(nuevoSaldo, 0), estado, id]
      );
      await conn.commit();
      return { success: true, estado };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async updateTomado(id: number, data: any) {
    const capital = Number(data.monto_capital);
    const interes = Number(data.monto_interes || 0);
    const total = capital + interes;
    const [rows] = await db.query('SELECT monto_pagado FROM PrestamosTomados WHERE id_prestamo = ?', [id]);
    const p = (rows as any)[0];
    if (!p) throw new Error('No encontrado');
    const saldo = Math.max(total - Number(p.monto_pagado), 0);
    await db.query(`UPDATE PrestamosTomados SET nro_oc=?, acreedor=?, descripcion=?,
      comentario=?, fecha_emision=?, fecha_vencimiento=?, monto_capital=?,
      tasa_interes=?, monto_interes=?, monto_total=?, saldo=? WHERE id_prestamo=?`,
      [data.nro_oc || null, data.acreedor, data.descripcion || '', data.comentario || '',
       data.fecha_emision, data.fecha_vencimiento || null, capital,
       Number(data.tasa_interes || 0), interes, total, saldo, id]);
    return { success: true };
  }

  async deleteTomado(id: number) {
    const [rows] = await db.query('SELECT estado FROM PrestamosTomados WHERE id_prestamo = ?', [id]);
    const p = (rows as any)[0];
    if (!p) throw new Error('Préstamo no encontrado');
    if (p.estado !== 'PENDIENTE') throw new Error('Solo se pueden eliminar préstamos sin abonos (estado PENDIENTE). Use anular para los demás.');
    await db.query('DELETE FROM PrestamosTomados WHERE id_prestamo = ?', [id]);
    return { success: true };
  }

  async anularTomado(id: number) {
    const [rows] = await db.query('SELECT estado FROM PrestamosTomados WHERE id_prestamo = ?', [id]);
    const p = (rows as any)[0];
    if (!p) throw new Error('Préstamo no encontrado');
    if (p.estado === 'ANULADO') throw new Error('Este préstamo ya se encuentra anulado');
    if (p.estado === 'PAGADO') throw new Error('No se puede anular un préstamo ya pagado');
    await db.query("UPDATE PrestamosTomados SET estado='ANULADO' WHERE id_prestamo=?", [id]);
    return { success: true };
  }

  // ===== PRÉSTAMOS OTORGADOS (lo que me deben) =====

  async getOtorgados() {
    const [rows] = await db.query(`
      SELECT *, DATEDIFF(CURDATE(), fecha_emision) as dias_transcurridos
      FROM PrestamosOtorgados WHERE estado != 'ANULADO'
      ORDER BY fecha_emision DESC
    `);
    return rows;
  }

  async createOtorgado(data: any) {
    const capital = Number(data.monto_capital);
    const interes = Number(data.monto_interes || 0);
    const total = capital + interes;
    const moneda = (data.moneda || 'PEN').toUpperCase();
    const tipo_cambio = moneda === 'USD' ? Number(data.tipo_cambio) || 1 : 1;
    const [res] = await db.query(`
      INSERT INTO PrestamosOtorgados (nro_oc, deudor, descripcion, comentario,
        fecha_emision, fecha_vencimiento, moneda, tipo_cambio,
        monto_capital, tasa_interes, monto_interes, monto_total, monto_pagado, saldo, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDIENTE')
    `, [data.nro_oc || null, data.deudor, data.descripcion || '', data.comentario || '',
        data.fecha_emision, data.fecha_vencimiento || null, moneda, tipo_cambio,
        capital, Number(data.tasa_interes || 0), interes, total, total]);
    return { success: true, id: (res as any).insertId };
  }

  async cobrarOtorgado(id: number, data: any) {
    const abono = Number(data.monto);
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        'SELECT monto_total, monto_pagado, estado FROM PrestamosOtorgados WHERE id_prestamo = ? FOR UPDATE',
        [id]
      );
      const p = (rows as any)[0];
      if (!p) throw new Error('Préstamo no encontrado');
      if (['COBRADO', 'ANULADO'].includes(p.estado)) throw new Error('No se puede cobrar un préstamo con estado ' + p.estado);
      const nuevoPagado = Number(p.monto_pagado) + abono;
      const nuevoSaldo = Number(p.monto_total) - nuevoPagado;
      const estado = nuevoSaldo <= 0.1 ? 'COBRADO' : 'PARCIAL';
      await conn.query(
        'UPDATE PrestamosOtorgados SET monto_pagado=?, saldo=?, estado=? WHERE id_prestamo=?',
        [nuevoPagado, Math.max(nuevoSaldo, 0), estado, id]
      );
      await conn.commit();
      return { success: true, estado };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async updateOtorgado(id: number, data: any) {
    const capital = Number(data.monto_capital);
    const interes = Number(data.monto_interes || 0);
    const total = capital + interes;
    const [rows] = await db.query('SELECT monto_pagado FROM PrestamosOtorgados WHERE id_prestamo = ?', [id]);
    const p = (rows as any)[0];
    if (!p) throw new Error('No encontrado');
    const saldo = Math.max(total - Number(p.monto_pagado), 0);
    await db.query(`UPDATE PrestamosOtorgados SET nro_oc=?, deudor=?, descripcion=?,
      comentario=?, fecha_emision=?, fecha_vencimiento=?, monto_capital=?,
      tasa_interes=?, monto_interes=?, monto_total=?, saldo=? WHERE id_prestamo=?`,
      [data.nro_oc || null, data.deudor, data.descripcion || '', data.comentario || '',
       data.fecha_emision, data.fecha_vencimiento || null, capital,
       Number(data.tasa_interes || 0), interes, total, saldo, id]);
    return { success: true };
  }

  async deleteOtorgado(id: number) {
    const [rows] = await db.query('SELECT estado FROM PrestamosOtorgados WHERE id_prestamo = ?', [id]);
    const p = (rows as any)[0];
    if (!p) throw new Error('Préstamo no encontrado');
    if (p.estado !== 'PENDIENTE') throw new Error('Solo se pueden eliminar préstamos sin abonos (estado PENDIENTE). Use anular para los demás.');
    await db.query('DELETE FROM PrestamosOtorgados WHERE id_prestamo = ?', [id]);
    return { success: true };
  }

  async anularOtorgado(id: number) {
    const [rows] = await db.query('SELECT estado FROM PrestamosOtorgados WHERE id_prestamo = ?', [id]);
    const p = (rows as any)[0];
    if (!p) throw new Error('Préstamo no encontrado');
    if (p.estado === 'ANULADO') throw new Error('Este préstamo ya se encuentra anulado');
    if (p.estado === 'COBRADO') throw new Error('No se puede anular un préstamo ya cobrado');
    await db.query("UPDATE PrestamosOtorgados SET estado='ANULADO' WHERE id_prestamo=?", [id]);
    return { success: true };
  }

  async getTotales() {
    const [t] = await db.query("SELECT IFNULL(SUM(saldo),0) as total FROM PrestamosTomados WHERE estado IN ('PENDIENTE','PARCIAL')");
    const [o] = await db.query("SELECT IFNULL(SUM(saldo),0) as total FROM PrestamosOtorgados WHERE estado IN ('PENDIENTE','PARCIAL')");
    return {
      total_debo: Number((t as any)[0].total),
      total_me_deben: Number((o as any)[0].total)
    };
  }
}

export default new PrestamosService();

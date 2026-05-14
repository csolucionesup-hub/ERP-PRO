import { db } from '../../../database/connection';

class PrestamosService {

  /**
   * Genera el siguiente correlativo de N° préstamo para el año en curso.
   * Sesión 13/05/2026: pedido de Julio — el campo nro_oc debe asignarse
   * automáticamente en vez de tipearlo manual.
   *
   * Formato:
   *   - Tomados (lo que debo):      PT-NNN-YYYY  (PT = Préstamo Tomado)
   *   - Otorgados (lo que me deben): PO-NNN-YYYY  (PO = Préstamo Otorgado)
   *
   * Busca el último correlativo del año por prefijo + año y devuelve +1
   * con padding a 3 dígitos. Si el usuario ya envió un nro_oc no vacío,
   * NO lo pisamos (soporta carga histórica con números externos).
   */
  private async generarNroPrestamo(
    conn: any,
    tabla: 'PrestamosTomados' | 'PrestamosOtorgados',
    prefijo: 'PT' | 'PO',
  ): Promise<string> {
    const anio = new Date().getFullYear();
    const patron = `${prefijo}-%-${anio}`;
    // FOR UPDATE en el último registro evita colisión bajo concurrencia
    // (dos creates simultáneos del mismo prefijo+año).
    const [rows]: any = await conn.query(
      `SELECT nro_oc FROM ${tabla}
        WHERE nro_oc LIKE ?
        ORDER BY id_prestamo DESC
        LIMIT 1
        FOR UPDATE`,
      [patron]
    );
    const ultimo = (rows as any[])[0];
    let siguiente = 1;
    if (ultimo?.nro_oc) {
      // PT-007-2026 → 007 → 7 → +1
      const partes = String(ultimo.nro_oc).split('-');
      const num = parseInt(partes[1], 10);
      if (!isNaN(num)) siguiente = num + 1;
    }
    return `${prefijo}-${String(siguiente).padStart(3, '0')}-${anio}`;
  }

  // ===== PRÉSTAMOS TOMADOS (lo que debo) =====

  async getTomados() {
    // Mig 071: incluimos nombre de la contraparte (si está vinculada),
    // medio_pago y empresa para que el frontend pueda mostrarlos en la
    // tabla y filtrar/agrupar sin queries extra.
    const [rows] = await db.query(`
      SELECT p.*,
             DATEDIFF(CURDATE(), p.fecha_emision) AS dias_transcurridos,
             c.nombre AS contraparte_nombre,
             c.tipo   AS contraparte_tipo
        FROM PrestamosTomados p
        LEFT JOIN Contrapartes c ON c.id_contraparte = p.id_contraparte
       WHERE p.estado <> 'ANULADO'
       ORDER BY p.fecha_emision DESC
    `);
    return rows;
  }

  async createTomado(data: any) {
    const capital = Number(data.monto_capital);
    const interes = Number(data.monto_interes || 0);
    const total = capital + interes;
    const moneda = (data.moneda || 'PEN').toUpperCase();
    const tipo_cambio = moneda === 'USD' ? Number(data.tipo_cambio) || 1 : 1;

    // Carga histórica: si el préstamo viene con abonos previos ya hechos,
    // se acepta `monto_pagado_inicial` opcional. Caso típico: préstamos
    // del 2023-2024 que se cargan ahora con saldo actual reflejado.
    const pagadoInicial = Math.max(0, Number(data.monto_pagado_inicial || 0));
    if (pagadoInicial > total + 0.01) {
      throw new Error(`El monto pagado a la fecha (${pagadoInicial}) no puede exceder el total del préstamo (${total}).`);
    }
    const saldo = Math.max(total - pagadoInicial, 0);
    const estado =
      pagadoInicial <= 0.01      ? 'PENDIENTE' :
      saldo        <= 0.01       ? 'PAGADO'    :
      'PARCIAL';

    // Mig 071 — empresa obligatoria (METAL o PERFOTOOLS). Default METAL.
    const empresa = (data.empresa || 'METAL').toUpperCase();
    if (!['METAL', 'PERFOTOOLS'].includes(empresa)) {
      throw new Error("empresa debe ser METAL o PERFOTOOLS");
    }
    const idContraparte = data.id_contraparte ? Number(data.id_contraparte) : null;
    const medioPago     = data.medio_pago ? String(data.medio_pago).trim() : null;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // Auto-asignar correlativo si el frontend no lo manda. Si llega
      // explícito (carga histórica con N° externo), lo respetamos.
      const nroOC = (data.nro_oc && String(data.nro_oc).trim())
        ? String(data.nro_oc).trim()
        : await this.generarNroPrestamo(conn, 'PrestamosTomados', 'PT');

      const [res] = await conn.query(`
        INSERT INTO PrestamosTomados (nro_oc, acreedor, descripcion, comentario,
          fecha_emision, fecha_vencimiento, moneda, tipo_cambio,
          monto_capital, tasa_interes, monto_interes, monto_total, monto_pagado, saldo, estado,
          id_contraparte, medio_pago, empresa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [nroOC, data.acreedor, data.descripcion || '', data.comentario || '',
          data.fecha_emision, data.fecha_vencimiento || null, moneda, tipo_cambio,
          capital, Number(data.tasa_interes || 0), interes, total, pagadoInicial, saldo, estado,
          idContraparte, medioPago, empresa]);
      await conn.commit();
      return { success: true, id: (res as any).insertId, nro_oc: nroOC };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
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
    // Mig 071 — campos nuevos editables solo si vienen explícitos
    const idContraparte = data.id_contraparte !== undefined
      ? (data.id_contraparte ? Number(data.id_contraparte) : null)
      : undefined;
    const medioPago = data.medio_pago !== undefined
      ? (data.medio_pago ? String(data.medio_pago).trim() : null)
      : undefined;
    const empresa = data.empresa !== undefined
      ? String(data.empresa).toUpperCase()
      : undefined;
    if (empresa !== undefined && !['METAL', 'PERFOTOOLS'].includes(empresa)) {
      throw new Error("empresa debe ser METAL o PERFOTOOLS");
    }

    // Construyo UPDATE dinámico para no pisar campos que el caller no manda.
    const sets: string[] = [
      'nro_oc=?', 'acreedor=?', 'descripcion=?', 'comentario=?',
      'fecha_emision=?', 'fecha_vencimiento=?', 'monto_capital=?',
      'tasa_interes=?', 'monto_interes=?', 'monto_total=?', 'saldo=?',
    ];
    const vals: any[] = [
      data.nro_oc || null, data.acreedor, data.descripcion || '', data.comentario || '',
      data.fecha_emision, data.fecha_vencimiento || null, capital,
      Number(data.tasa_interes || 0), interes, total, saldo,
    ];
    if (idContraparte !== undefined) { sets.push('id_contraparte=?'); vals.push(idContraparte); }
    if (medioPago     !== undefined) { sets.push('medio_pago=?');     vals.push(medioPago); }
    if (empresa       !== undefined) { sets.push('empresa=?');        vals.push(empresa); }
    vals.push(id);

    await db.query(`UPDATE PrestamosTomados SET ${sets.join(', ')} WHERE id_prestamo=?`, vals);
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
    // Mig 071: incluye contraparte_nombre, medio_pago, empresa.
    const [rows] = await db.query(`
      SELECT p.*,
             DATEDIFF(CURDATE(), p.fecha_emision) AS dias_transcurridos,
             c.nombre AS contraparte_nombre,
             c.tipo   AS contraparte_tipo
        FROM PrestamosOtorgados p
        LEFT JOIN Contrapartes c ON c.id_contraparte = p.id_contraparte
       WHERE p.estado <> 'ANULADO'
       ORDER BY p.fecha_emision DESC
    `);
    return rows;
  }

  async createOtorgado(data: any) {
    const capital = Number(data.monto_capital);
    const interes = Number(data.monto_interes || 0);
    const total = capital + interes;
    const moneda = (data.moneda || 'PEN').toUpperCase();
    const tipo_cambio = moneda === 'USD' ? Number(data.tipo_cambio) || 1 : 1;

    // Carga histórica: si el préstamo otorgado ya tuvo cobros parciales,
    // aceptar `monto_cobrado_inicial` para reflejar el saldo real al día.
    const cobradoInicial = Math.max(0, Number(data.monto_cobrado_inicial || data.monto_pagado_inicial || 0));
    if (cobradoInicial > total + 0.01) {
      throw new Error(`El monto cobrado a la fecha (${cobradoInicial}) no puede exceder el total del préstamo (${total}).`);
    }
    const saldo = Math.max(total - cobradoInicial, 0);
    const estado =
      cobradoInicial <= 0.01     ? 'PENDIENTE' :
      saldo          <= 0.01     ? 'PAGADO'    :
      'PARCIAL';

    // Mig 071
    const empresa = (data.empresa || 'METAL').toUpperCase();
    if (!['METAL', 'PERFOTOOLS'].includes(empresa)) {
      throw new Error("empresa debe ser METAL o PERFOTOOLS");
    }
    const idContraparte = data.id_contraparte ? Number(data.id_contraparte) : null;
    const medioPago     = data.medio_pago ? String(data.medio_pago).trim() : null;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // Auto-asignar correlativo si el frontend no lo manda.
      const nroOC = (data.nro_oc && String(data.nro_oc).trim())
        ? String(data.nro_oc).trim()
        : await this.generarNroPrestamo(conn, 'PrestamosOtorgados', 'PO');

      const [res] = await conn.query(`
        INSERT INTO PrestamosOtorgados (nro_oc, deudor, descripcion, comentario,
          fecha_emision, fecha_vencimiento, moneda, tipo_cambio,
          monto_capital, tasa_interes, monto_interes, monto_total, monto_pagado, saldo, estado,
          id_contraparte, medio_pago, empresa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [nroOC, data.deudor, data.descripcion || '', data.comentario || '',
          data.fecha_emision, data.fecha_vencimiento || null, moneda, tipo_cambio,
          capital, Number(data.tasa_interes || 0), interes, total, cobradoInicial, saldo, estado,
          idContraparte, medioPago, empresa]);
      await conn.commit();
      return { success: true, id: (res as any).insertId, nro_oc: nroOC };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
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
    // Mig 071
    const idContraparte = data.id_contraparte !== undefined
      ? (data.id_contraparte ? Number(data.id_contraparte) : null) : undefined;
    const medioPago = data.medio_pago !== undefined
      ? (data.medio_pago ? String(data.medio_pago).trim() : null) : undefined;
    const empresa = data.empresa !== undefined
      ? String(data.empresa).toUpperCase() : undefined;
    if (empresa !== undefined && !['METAL', 'PERFOTOOLS'].includes(empresa)) {
      throw new Error("empresa debe ser METAL o PERFOTOOLS");
    }

    const sets: string[] = [
      'nro_oc=?', 'deudor=?', 'descripcion=?', 'comentario=?',
      'fecha_emision=?', 'fecha_vencimiento=?', 'monto_capital=?',
      'tasa_interes=?', 'monto_interes=?', 'monto_total=?', 'saldo=?',
    ];
    const vals: any[] = [
      data.nro_oc || null, data.deudor, data.descripcion || '', data.comentario || '',
      data.fecha_emision, data.fecha_vencimiento || null, capital,
      Number(data.tasa_interes || 0), interes, total, saldo,
    ];
    if (idContraparte !== undefined) { sets.push('id_contraparte=?'); vals.push(idContraparte); }
    if (medioPago     !== undefined) { sets.push('medio_pago=?');     vals.push(medioPago); }
    if (empresa       !== undefined) { sets.push('empresa=?');        vals.push(empresa); }
    vals.push(id);

    await db.query(`UPDATE PrestamosOtorgados SET ${sets.join(', ')} WHERE id_prestamo=?`, vals);
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

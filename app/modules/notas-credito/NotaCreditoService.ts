import { db } from '../../../database/connection';

/**
 * NotaCreditoService — gestión de Notas de Crédito.
 *
 * Cobertura actual:
 *   - NCs RECIBIDAS del proveedor: registrarEntrante() ajusta la Compra/Gasto
 *     vinculado y recalcula su estado_pago. eliminarEntrante() revierte.
 *   - listar() con filtros, obtener() ficha completa.
 *
 * NCs SALIENTES (que Metal Engineers emite hacia SUNAT vía Nubefact) tienen
 * estructura ya soportada en la tabla pero el flujo de emisión no está
 * construido — bloqueado por certificado digital + Usuario Secundario SOL.
 * Cuando se desbloquee, agregar emitir() en este mismo Service.
 */

export type Moneda = 'PEN' | 'USD';

export interface NCDetalleInput {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  igv: number;
  total: number;
  unidad_sunat?: string;
  codigo_item?: string;
}

export interface NCEntranteInput {
  // Identificación de la NC del proveedor
  serie: string;
  numero: number;
  fecha_emision: string; // YYYY-MM-DD

  // Documento del proveedor que ajusta (la factura del proveedor que ya
  // registramos como Compra o Gasto)
  tipo_doc_referencia?: 'FACTURA' | 'BOLETA';
  serie_referencia: string;
  numero_referencia: number;

  // Vínculo a la Compra o Gasto local (uno de los dos, no ambos)
  vincular_a: { tipo: 'COMPRA' | 'GASTO'; id: number };

  // Motivo SUNAT
  motivo_codigo: string;          // '01'..'10'
  motivo_descripcion: string;

  // Snapshot del proveedor emisor (RUC obligatorio)
  proveedor_ruc: string;
  proveedor_razon_social: string;

  // Montos (positivos)
  moneda?: Moneda;
  tipo_cambio?: number;
  subtotal: number;
  igv: number;
  total: number;

  observaciones?: string;
  detalles?: NCDetalleInput[];
}

class NotaCreditoService {

  /** Listar NCs con filtros. Default: todas; pasar direccion para filtrar. */
  async listar(filtros: {
    direccion?: 'EMITIDA' | 'RECIBIDA';
    desde?: string;
    hasta?: string;
    proveedor_ruc?: string;
    estado_sunat?: string;
    limit?: number;
  } = {}) {
    const where: string[] = [];
    const vals: any[] = [];
    if (filtros.direccion)    { where.push('direccion = ?');      vals.push(filtros.direccion); }
    if (filtros.desde)        { where.push('fecha_emision >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta)        { where.push('fecha_emision <= ?'); vals.push(filtros.hasta); }
    if (filtros.proveedor_ruc){ where.push('proveedor_ruc = ?');  vals.push(filtros.proveedor_ruc); }
    if (filtros.estado_sunat) { where.push('estado_sunat = ?');   vals.push(filtros.estado_sunat); }

    const sql = `
      SELECT id_nota, direccion, serie, numero,
             CONCAT(serie, '-', LPAD(numero::text, 6, '0')) AS numero_formateado,
             fecha_emision,
             tipo_doc_referencia, serie_referencia, numero_referencia,
             motivo_codigo, motivo_descripcion,
             cliente_numero_doc, cliente_razon_social,
             proveedor_ruc, proveedor_razon_social,
             id_factura_referencia, id_compra_referencia, id_gasto_referencia,
             moneda, tipo_cambio, subtotal, igv, total,
             estado_sunat, observaciones, created_at
      FROM NotasCredito
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY fecha_emision DESC, id_nota DESC
      LIMIT ?`;
    vals.push(filtros.limit ?? 200);
    const [rows] = await db.query(sql, vals);
    return rows;
  }

  async obtener(id_nota: number) {
    const [rows]: any = await db.query(
      'SELECT * FROM NotasCredito WHERE id_nota = ?',
      [id_nota]
    );
    if (!rows.length) throw new Error('Nota de crédito no encontrada');
    const [det] = await db.query(
      'SELECT * FROM DetalleNotaCredito WHERE id_nota = ? ORDER BY orden',
      [id_nota]
    );
    return { ...rows[0], detalles: det };
  }

  /**
   * Registrar una NC RECIBIDA del proveedor.
   * Ajusta el documento vinculado (Compra o Gasto) bajando su total_base
   * en una transacción atómica. NO crea Transacción financiera — el reembolso
   * (si aplica) se registra aparte como cobranza manual.
   */
  async registrarEntrante(data: NCEntranteInput, opts: { id_usuario_emisor?: number } = {}) {
    if (!data.vincular_a || !data.vincular_a.tipo || !data.vincular_a.id) {
      throw new Error('Falta vínculo a Compra o Gasto.');
    }
    if (data.total <= 0) throw new Error('El total debe ser positivo.');
    if (!data.proveedor_ruc || !data.proveedor_razon_social) {
      throw new Error('Falta RUC y/o razón social del proveedor.');
    }

    const moneda: Moneda = data.moneda ?? 'PEN';
    const tipo_cambio = data.tipo_cambio ?? 1;
    const tipo_doc_ref = data.tipo_doc_referencia ?? 'FACTURA';

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Validar y bloquear el documento referenciado
      let docCompra: any = null;
      let docGasto:  any = null;

      if (data.vincular_a.tipo === 'COMPRA') {
        const [r]: any = await conn.query(
          'SELECT id_compra, total_base, estado, estado_pago, moneda, proveedor_nombre FROM Compras WHERE id_compra = ? FOR UPDATE',
          [data.vincular_a.id]
        );
        docCompra = r[0];
        if (!docCompra) throw new Error(`Compra #${data.vincular_a.id} no existe.`);
        if (docCompra.estado === 'ANULADA' || docCompra.estado === 'ANULADO') {
          throw new Error('No se puede emitir NC contra una Compra anulada.');
        }
      } else if (data.vincular_a.tipo === 'GASTO') {
        const [r]: any = await conn.query(
          'SELECT id_gasto, total_base, estado, estado_pago, moneda, proveedor_nombre FROM Gastos WHERE id_gasto = ? FOR UPDATE',
          [data.vincular_a.id]
        );
        docGasto = r[0];
        if (!docGasto) throw new Error(`Gasto #${data.vincular_a.id} no existe.`);
        if (docGasto.estado === 'ANULADO') {
          throw new Error('No se puede emitir NC contra un Gasto anulado.');
        }
      } else {
        throw new Error(`Tipo de vínculo inválido: ${data.vincular_a.tipo}`);
      }

      // 2. Validar que la NC no exceda el total del documento
      const totalRefBase = Number((docCompra ?? docGasto).total_base);
      if (Number(data.total) > totalRefBase + 0.01) {
        throw new Error(
          `El total de la NC (${data.total}) excede el total del ${data.vincular_a.tipo.toLowerCase()} (${totalRefBase}).`
        );
      }

      // 3. INSERT cabecera NotasCredito
      const [insRes]: any = await conn.query(`
        INSERT INTO NotasCredito (
          serie, numero, fecha_emision,
          tipo_doc_referencia, serie_referencia, numero_referencia,
          motivo_codigo, motivo_descripcion,
          cliente_tipo_doc, cliente_numero_doc, cliente_razon_social,
          moneda, tipo_cambio, subtotal, igv, total,
          estado_sunat,
          id_usuario_emisor, observaciones,
          direccion, proveedor_ruc, proveedor_razon_social,
          id_compra_referencia, id_gasto_referencia
        ) VALUES (
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          'RUC', ?, ?,
          ?, ?, ?, ?, ?,
          'REGISTRADA',
          ?, ?,
          'RECIBIDA', ?, ?,
          ?, ?
        )
      `, [
        data.serie, data.numero, data.fecha_emision,
        tipo_doc_ref, data.serie_referencia, data.numero_referencia,
        data.motivo_codigo, data.motivo_descripcion,
        // En NC RECIBIDA el "cliente" SUNAT del esquema original somos
        // nosotros (Metal Engineers) — guardamos placeholder para
        // mantener NOT NULL del schema original. La identidad real del
        // emisor vive en proveedor_*.
        '20610071962', 'METAL ENGINEERS S.A.C.',
        moneda, tipo_cambio, data.subtotal, data.igv, data.total,
        opts.id_usuario_emisor ?? null, data.observaciones ?? null,
        data.proveedor_ruc, data.proveedor_razon_social,
        docCompra?.id_compra ?? null, docGasto?.id_gasto ?? null,
      ]);
      const id_nota = insRes.insertId;

      // 4. INSERT detalle. Si no llegó, sintetizamos uno con los totales.
      const detalles = data.detalles && data.detalles.length > 0
        ? data.detalles
        : [{
            descripcion: data.motivo_descripcion || 'Ajuste',
            cantidad: 1,
            precio_unitario: Number(data.subtotal),
            subtotal: Number(data.subtotal),
            igv: Number(data.igv),
            total: Number(data.total),
          }];
      let orden = 1;
      for (const d of detalles) {
        await conn.query(`
          INSERT INTO DetalleNotaCredito (
            id_nota, orden, codigo_item, descripcion, unidad_sunat,
            cantidad, precio_unitario, subtotal, igv, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id_nota, orden++,
          d.codigo_item ?? null,
          d.descripcion,
          d.unidad_sunat ?? 'NIU',
          d.cantidad, d.precio_unitario, d.subtotal, d.igv, d.total,
        ]);
      }

      // 5. Ajustar el documento vinculado (rebajar total_base + recalc estado_pago)
      if (docCompra) {
        await this._ajustarCompra(conn, docCompra.id_compra, -Number(data.total));
      } else if (docGasto) {
        await this._ajustarGasto(conn, docGasto.id_gasto, -Number(data.total));
      }

      await conn.commit();
      return { success: true, id_nota };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Eliminar NC RECIBIDA con cascada inversa: revierte el ajuste al
   * Compra/Gasto que había bajado su total_base.
   * Solo GERENTE (validado en ruta).
   */
  async eliminarEntrante(id_nota: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        'SELECT * FROM NotasCredito WHERE id_nota = ? FOR UPDATE',
        [id_nota]
      );
      const nota = rows[0];
      if (!nota) throw new Error('Nota de crédito no encontrada.');
      if (nota.direccion !== 'RECIBIDA') {
        throw new Error('Solo se eliminan NCs RECIBIDAS por esta vía. Las EMITIDAS requieren NC de anulación SUNAT.');
      }

      // Revertir ajuste (sumar de vuelta el total)
      const total = Number(nota.total);
      if (nota.id_compra_referencia) {
        await this._ajustarCompra(conn, nota.id_compra_referencia, +total);
      } else if (nota.id_gasto_referencia) {
        await this._ajustarGasto(conn, nota.id_gasto_referencia, +total);
      }

      await conn.query('DELETE FROM DetalleNotaCredito WHERE id_nota = ?', [id_nota]);
      await conn.query('DELETE FROM NotasCredito WHERE id_nota = ?', [id_nota]);

      await conn.commit();
      return { success: true };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Ajusta Compra.total_base sumando un delta (negativo al crear NC,
   * positivo al revertirla) y recalcula estado_pago según lo ya pagado.
   */
  private async _ajustarCompra(conn: any, id_compra: number, delta: number) {
    await conn.query(
      'UPDATE Compras SET total_base = total_base + ? WHERE id_compra = ?',
      [delta, id_compra]
    );
    const [r]: any = await conn.query(`
      SELECT total_base,
        IFNULL((SELECT SUM(monto_base) FROM Transacciones
                WHERE referencia_tipo='COMPRA' AND referencia_id=? AND tipo_movimiento='EGRESO' AND estado != 'ANULADO'), 0) AS pagado
      FROM Compras WHERE id_compra = ?
    `, [id_compra, id_compra]);
    const total = Number(r[0].total_base);
    const pagado = Number(r[0].pagado);
    const nuevoEstadoPago =
      total <= 0.01 ? 'PAGADO' :
      pagado <= 0.01 ? 'PENDIENTE' :
      pagado >= total - 0.01 ? 'PAGADO' :
      'PARCIAL';
    await conn.query(
      'UPDATE Compras SET estado_pago = ? WHERE id_compra = ?',
      [nuevoEstadoPago, id_compra]
    );
  }

  private async _ajustarGasto(conn: any, id_gasto: number, delta: number) {
    await conn.query(
      'UPDATE Gastos SET total_base = total_base + ? WHERE id_gasto = ?',
      [delta, id_gasto]
    );
    const [r]: any = await conn.query(`
      SELECT total_base,
        IFNULL((SELECT SUM(monto_base) FROM Transacciones
                WHERE referencia_tipo='GASTO' AND referencia_id=? AND tipo_movimiento='EGRESO' AND estado != 'ANULADO'), 0) AS pagado
      FROM Gastos WHERE id_gasto = ?
    `, [id_gasto, id_gasto]);
    const total = Number(r[0].total_base);
    const pagado = Number(r[0].pagado);
    const nuevoEstadoPago =
      total <= 0.01 ? 'PAGADO' :
      pagado <= 0.01 ? 'PENDIENTE' :
      pagado >= total - 0.01 ? 'PAGADO' :
      'PARCIAL';
    await conn.query(
      'UPDATE Gastos SET estado_pago = ? WHERE id_gasto = ?',
      [nuevoEstadoPago, id_gasto]
    );
  }
}

export default new NotaCreditoService();

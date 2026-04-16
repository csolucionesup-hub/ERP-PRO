import { db } from '../../../database/connection';

/**
 * Servicio de Cobranzas — Finanzas v2
 *
 * Maneja el flujo de cobro de cotizaciones APROBADAS:
 *  - Lista bandejas (esperando depósito, esperando detracción, cobradas)
 *  - Registra movimientos de cobranza (depósito banco regular, detracción BN)
 *  - Recalcula estado_financiero según los montos acumulados
 */

type Marca = 'METAL' | 'PERFOTOOLS';

interface CobranzaInput {
  id_cotizacion:    number;
  tipo:             'DEPOSITO_BANCO' | 'DETRACCION_BN' | 'RETENCION';
  fecha_movimiento: string;             // YYYY-MM-DD
  id_cuenta?:       number | null;
  banco?:           string;
  nro_operacion?:   string;
  monto:            number;
  moneda?:          'PEN' | 'USD';
  tipo_cambio?:     number;
  voucher_url?:     string;
  comentario?:      string;
}

class CobranzasService {

  // ── Bandejas ───────────────────────────────────────────────

  /** Cotizaciones APROBADAS (o avanzadas) por marca, con su estado financiero. */
  async getBandejas(marca?: Marca) {
    const params: any[] = [];
    let whereMarca = '';
    if (marca) { whereMarca = 'AND c.marca = ?'; params.push(marca); }

    const [rows] = await db.query(`
      SELECT
        c.id_cotizacion,
        c.nro_cotizacion,
        c.marca,
        c.cliente,
        c.proyecto,
        c.atencion,
        c.telefono,
        c.correo,
        c.moneda,
        c.tipo_cambio,
        c.subtotal,
        c.igv,
        c.total,
        (c.igv > 0)              AS aplica_igv,
        c.detraccion_porcentaje,
        c.monto_detraccion,
        c.retencion_porcentaje,
        c.monto_retencion,
        c.estado          AS estado_comercial,
        c.estado_financiero,
        c.monto_cobrado_banco,
        c.monto_cobrado_detraccion,
        c.nro_factura,
        c.fecha_factura,
        c.fecha_cobro_total,
        c.fecha_aprobacion_comercial,
        c.fecha_aprobacion_finanzas,
        c.created_at,
        c.updated_at,
        DATEDIFF(CURDATE(), DATE(c.updated_at)) AS dias_esperando
      FROM Cotizaciones c
      WHERE c.estado_financiero <> 'NA'
        AND c.estado <> 'ANULADA'
        ${whereMarca}
      ORDER BY c.updated_at DESC
    `, params);

    const all = rows as any[];

    // Clasificación por bandeja
    const esperando_pago = all.filter(c =>
      c.estado_financiero === 'PENDIENTE_DEPOSITO' ||
      c.estado_financiero === 'BANCO_PARCIAL'
    );

    const esperando_detraccion = all.filter(c =>
      c.estado_financiero === 'BANCO_OK_DETRACCION_PENDIENTE'
    );

    const cobradas = all.filter(c =>
      c.estado_financiero === 'FONDEADA_TOTAL' ||
      c.estado_financiero === 'SIN_DETRACCION_FONDEADA' ||
      c.estado_financiero === 'FACTURADA' ||
      c.estado_financiero === 'COBRADA'
    );

    return {
      esperando_pago,
      esperando_detraccion,
      cobradas,
      totales: {
        esperando_pago_count:       esperando_pago.length,
        esperando_detraccion_count: esperando_detraccion.length,
        cobradas_count:             cobradas.length,
      },
    };
  }

  /** Detalle de una cotización + sus movimientos de cobranza */
  async getDetalle(id: number) {
    const [cot] = await db.query(`
      SELECT * FROM Cotizaciones WHERE id_cotizacion = ?
    `, [id]);
    if (!(cot as any[]).length) throw new Error('Cotización no encontrada');

    const [movs] = await db.query(`
      SELECT cb.*, cu.nombre AS cuenta_nombre, u.nombre AS usuario_nombre
        FROM CobranzasCotizacion cb
        LEFT JOIN Cuentas  cu ON cu.id_cuenta  = cb.id_cuenta
        LEFT JOIN Usuarios u  ON u.id_usuario  = cb.registrado_por
       WHERE cb.id_cotizacion = ?
       ORDER BY cb.fecha_movimiento ASC, cb.id_cobranza ASC
    `, [id]);

    return { cotizacion: (cot as any[])[0], movimientos: movs };
  }

  // ── Registro de cobranza ───────────────────────────────────

  async registrarCobranza(data: CobranzaInput, userId?: number) {
    if (!['DEPOSITO_BANCO', 'DETRACCION_BN', 'RETENCION'].includes(data.tipo)) {
      throw new Error('tipo de cobranza inválido');
    }
    if (!data.monto || data.monto <= 0) throw new Error('monto debe ser > 0');
    if (!data.fecha_movimiento) throw new Error('fecha_movimiento requerida');

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [cotRows] = await conn.query(
        `SELECT * FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [data.id_cotizacion]
      );
      const cot = (cotRows as any[])[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (cot.estado === 'ANULADA') throw new Error('Cotización anulada');
      if (cot.estado_financiero === 'NA') {
        throw new Error('Cotización aún no aprobada por Comercial');
      }

      // Insertar movimiento
      const [cobIns]: any = await conn.query(`
        INSERT INTO CobranzasCotizacion
          (id_cotizacion, tipo, fecha_movimiento, id_cuenta,
           banco, nro_operacion, monto, moneda, tipo_cambio,
           voucher_url, comentario, registrado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.id_cotizacion,
        data.tipo,
        data.fecha_movimiento,
        data.id_cuenta || null,
        data.banco || null,
        data.nro_operacion || null,
        data.monto,
        data.moneda || cot.moneda || 'PEN',
        data.tipo_cambio ?? cot.tipo_cambio ?? 1,
        data.voucher_url || null,
        data.comentario || null,
        userId || null,
      ]);

      // Auto-crear movimiento bancario (Libro Bancos) asociado
      if (data.id_cuenta) {
        const desc = `Cobranza ${data.tipo === 'DEPOSITO_BANCO' ? 'depósito' : data.tipo === 'DETRACCION_BN' ? 'detracción BN' : 'retención'} — Cot ${cot.nro_cotizacion || cot.id_cotizacion}`;
        await conn.query(`
          INSERT INTO MovimientoBancario
            (id_cuenta, fecha, nro_operacion, descripcion_banco, monto, tipo,
             estado_conciliacion, ref_tipo, ref_id, fuente,
             conciliado_por, conciliado_at, comentario)
          VALUES (?, ?, ?, ?, ?, 'ABONO', 'CONCILIADO', 'COBRANZA', ?, 'AUTO', ?, NOW(), ?)
        `, [
          data.id_cuenta, data.fecha_movimiento, data.nro_operacion || null,
          desc, data.monto, cobIns.insertId, userId || null, data.comentario || null,
        ]);
      }

      // Recalcular acumulados
      await this.recomputeEstado(conn, data.id_cotizacion);

      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /** Borra un movimiento de cobranza y recalcula. */
  async eliminarCobranza(id_cobranza: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        `SELECT id_cotizacion FROM CobranzasCotizacion WHERE id_cobranza = ?`,
        [id_cobranza]
      );
      const r = (rows as any[])[0];
      if (!r) throw new Error('Movimiento no encontrado');

      // Eliminar movimiento bancario auto asociado
      await conn.query(
        `DELETE FROM MovimientoBancario WHERE ref_tipo='COBRANZA' AND ref_id=? AND fuente='AUTO'`,
        [id_cobranza]
      );
      await conn.query(`DELETE FROM CobranzasCotizacion WHERE id_cobranza = ?`, [id_cobranza]);
      await this.recomputeEstado(conn, r.id_cotizacion);

      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ── Lógica de recálculo ────────────────────────────────────

  /** Recalcula montos acumulados y estado_financiero a partir de los movimientos. */
  private async recomputeEstado(conn: any, id_cotizacion: number) {
    const [cotRows] = await conn.query(
      `SELECT total, monto_detraccion, monto_retencion FROM Cotizaciones WHERE id_cotizacion = ?`,
      [id_cotizacion]
    );
    const cot = (cotRows as any[])[0];
    const total       = Number(cot.total)            || 0;
    const detraccion  = Number(cot.monto_detraccion) || 0;
    const retencion   = Number(cot.monto_retencion)  || 0;
    const aplicaDetra = detraccion > 0;

    const [agg] = await conn.query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo='DEPOSITO_BANCO'  THEN monto END),0) AS banco,
        COALESCE(SUM(CASE WHEN tipo='DETRACCION_BN'   THEN monto END),0) AS det,
        MIN(fecha_movimiento) AS primera_fecha
      FROM CobranzasCotizacion
      WHERE id_cotizacion = ?
    `, [id_cotizacion]);
    const banco = Number((agg as any[])[0].banco) || 0;
    const det   = Number((agg as any[])[0].det)   || 0;

    // Decidir estado_financiero
    // esperado al banco regular = total − detracción (va a BN) − retención (la cliente retiene)
    let estado = 'PENDIENTE_DEPOSITO';
    const esperadoBanco = total - (aplicaDetra ? detraccion : 0) - retencion;
    const bancoCompleto = banco + 0.01 >= esperadoBanco;       // tolerancia 1 céntimo
    const detraCompleta = !aplicaDetra || (det + 0.01 >= detraccion);

    if (banco === 0 && det === 0) {
      estado = 'PENDIENTE_DEPOSITO';
    } else if (bancoCompleto && detraCompleta) {
      estado = aplicaDetra ? 'FONDEADA_TOTAL' : 'SIN_DETRACCION_FONDEADA';
    } else if (bancoCompleto && !detraCompleta) {
      estado = 'BANCO_OK_DETRACCION_PENDIENTE';
    } else {
      estado = 'BANCO_PARCIAL';
    }

    const fechaAprob = (estado === 'FONDEADA_TOTAL' || estado === 'SIN_DETRACCION_FONDEADA')
      ? new Date()
      : null;

    await conn.query(`
      UPDATE Cotizaciones
         SET monto_cobrado_banco      = ?,
             monto_cobrado_detraccion = ?,
             estado_financiero        = ?,
             fecha_aprobacion_finanzas = COALESCE(fecha_aprobacion_finanzas, ?)
       WHERE id_cotizacion = ?
    `, [banco, det, estado, fechaAprob, id_cotizacion]);
  }

  // ── Edición de datos tributarios (detracción / retención) ────
  /**
   * Finanzas completa los datos tributarios al recibir la cotización.
   * Comercial NO pide % detracción — se define aquí según el servicio.
   */
  async actualizarTributario(
    id_cotizacion: number,
    data: { detraccion_porcentaje?: number; retencion_porcentaje?: number }
  ) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        `SELECT total FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [id_cotizacion]
      );
      const cot = (rows as any[])[0];
      if (!cot) throw new Error('Cotización no encontrada');

      const pctDet = Number(data.detraccion_porcentaje ?? 0);
      const pctRet = Number(data.retencion_porcentaje   ?? 0);
      if (pctDet < 0 || pctDet > 100) throw new Error('% detracción inválido');
      if (pctRet < 0 || pctRet > 100) throw new Error('% retención inválido');

      const total      = Number(cot.total) || 0;
      const montoDet   = +(total * pctDet / 100).toFixed(2);
      const montoRet   = +(total * pctRet / 100).toFixed(2);

      await conn.query(`
        UPDATE Cotizaciones
           SET detraccion_porcentaje = ?,
               monto_detraccion      = ?,
               retencion_porcentaje  = ?,
               monto_retencion       = ?
         WHERE id_cotizacion = ?
      `, [pctDet, montoDet, pctRet, montoRet, id_cotizacion]);

      // Recalcular estado con los nuevos montos
      await this.recomputeEstado(conn, id_cotizacion);

      await conn.commit();
      return { ok: true, monto_detraccion: montoDet, monto_retencion: montoRet };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ── Dashboard ejecutivo de Finanzas ───────────────────────
  async getDashboardFinanzas() {
    const now = new Date();
    const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Caja real por moneda (lo cobrado a cuentas regulares)
    const [cajaRows] = await db.query(`
      SELECT moneda, COALESCE(SUM(monto),0) AS total
        FROM CobranzasCotizacion
       WHERE tipo = 'DEPOSITO_BANCO'
       GROUP BY moneda
    `);
    const caja: Record<'PEN'|'USD', number> = { PEN: 0, USD: 0 };
    for (const r of (cajaRows as any[])) {
      caja[r.moneda as 'PEN'|'USD'] = Number(r.total) || 0;
    }

    // Banco de la Nación (detracciones recibidas)
    const [[bnRow]]: any = await db.query(`
      SELECT COALESCE(SUM(monto),0) AS total FROM CobranzasCotizacion WHERE tipo='DETRACCION_BN'
    `);
    const bn = Number(bnRow.total) || 0;

    // Retenciones (certificados SUNAT)
    const [[retRow]]: any = await db.query(`
      SELECT COALESCE(SUM(monto),0) AS total FROM CobranzasCotizacion WHERE tipo='RETENCION'
    `);
    const retenciones = Number(retRow.total) || 0;

    // IGV del mes actual (por devengo de la cotización)
    const [[igvRow]]: any = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN moneda='PEN' THEN igv END),0) AS igv_pen,
        COALESCE(SUM(CASE WHEN moneda='USD' THEN igv * tipo_cambio END),0) AS igv_usd_en_pen,
        COUNT(*) AS cotizaciones_mes
      FROM Cotizaciones
      WHERE DATE_FORMAT(fecha, '%Y-%m') = ?
        AND estado NOT IN ('ANULADA','RECHAZADA')
    `, [mesActual]);
    const igvMes = Number(igvRow.igv_pen) + Number(igvRow.igv_usd_en_pen);

    // Detracciones pendientes por cobrar
    const [[detPendRow]]: any = await db.query(`
      SELECT
        COALESCE(SUM(monto_detraccion - monto_cobrado_detraccion),0) AS total,
        COUNT(*) AS cantidad,
        COALESCE(AVG(DATEDIFF(CURDATE(), DATE(updated_at))),0) AS dias_promedio
      FROM Cotizaciones
      WHERE monto_detraccion > monto_cobrado_detraccion
        AND estado <> 'ANULADA'
        AND estado_financiero IN ('BANCO_OK_DETRACCION_PENDIENTE','BANCO_PARCIAL','PENDIENTE_DEPOSITO')
    `);

    // Depósitos pendientes (neto al banco que aún no entra)
    const [[depPendRow]]: any = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN moneda='PEN' THEN (total - monto_detraccion - monto_retencion - monto_cobrado_banco) END),0) AS pen,
        COALESCE(SUM(CASE WHEN moneda='USD' THEN (total - monto_detraccion - monto_retencion - monto_cobrado_banco) END),0) AS usd,
        SUM(CASE WHEN estado_financiero IN ('PENDIENTE_DEPOSITO','BANCO_PARCIAL') THEN 1 ELSE 0 END) AS cantidad
      FROM Cotizaciones
      WHERE estado_financiero IN ('PENDIENTE_DEPOSITO','BANCO_PARCIAL','BANCO_OK_DETRACCION_PENDIENTE')
        AND estado <> 'ANULADA'
    `);

    // Top detracciones más antiguas
    const [topVencidas] = await db.query(`
      SELECT id_cotizacion, nro_cotizacion, cliente, moneda,
             (monto_detraccion - monto_cobrado_detraccion) AS saldo_det,
             DATEDIFF(CURDATE(), DATE(updated_at)) AS dias
      FROM Cotizaciones
      WHERE monto_detraccion > monto_cobrado_detraccion
        AND estado_financiero = 'BANCO_OK_DETRACCION_PENDIENTE'
        AND estado <> 'ANULADA'
      ORDER BY updated_at ASC
      LIMIT 5
    `);

    return {
      mes: mesActual,
      caja,
      bn,
      retenciones,
      igv_mes: +igvMes.toFixed(2),
      igv_cotizaciones_mes: Number(igvRow.cotizaciones_mes) || 0,
      detracciones_pendientes: {
        total: +Number(detPendRow.total).toFixed(2),
        cantidad: Number(detPendRow.cantidad) || 0,
        dias_promedio: Math.round(Number(detPendRow.dias_promedio) || 0),
      },
      depositos_pendientes: {
        pen: +Number(depPendRow.pen).toFixed(2),
        usd: +Number(depPendRow.usd).toFixed(2),
        cantidad: Number(depPendRow.cantidad) || 0,
      },
      top_vencidas: topVencidas,
    };
  }

  async getCuentas() {
    const [rows] = await db.query(`
      SELECT id_cuenta, nombre, tipo, moneda, saldo_actual
        FROM Cuentas
       WHERE estado = 'ACTIVA'
       ORDER BY
         FIELD(tipo,'DETRACCION','BANCO','EFECTIVO'),
         moneda, nombre
    `);
    return rows;
  }

  async createCuenta(data: { nombre: string; tipo: string; moneda: 'PEN'|'USD' }) {
    if (!data.nombre) throw new Error('nombre requerido');
    if (!['EFECTIVO','BANCO','DETRACCION'].includes(data.tipo)) throw new Error('tipo inválido');
    if (!['PEN','USD'].includes(data.moneda)) throw new Error('moneda inválida');
    const [r]: any = await db.query(
      `INSERT INTO Cuentas (nombre, tipo, moneda, saldo_actual, estado) VALUES (?, ?, ?, 0, 'ACTIVA')`,
      [data.nombre, data.tipo, data.moneda]
    );
    return { id_cuenta: r.insertId };
  }

  async updateCuenta(id: number, data: { nombre?: string; tipo?: string; moneda?: 'PEN'|'USD'; estado?: 'ACTIVA'|'INACTIVA' }) {
    const fields: string[] = [];
    const vals: any[] = [];
    if (data.nombre !== undefined) { fields.push('nombre = ?'); vals.push(data.nombre); }
    if (data.tipo !== undefined)   { fields.push('tipo = ?');   vals.push(data.tipo); }
    if (data.moneda !== undefined) { fields.push('moneda = ?'); vals.push(data.moneda); }
    if (data.estado !== undefined) { fields.push('estado = ?'); vals.push(data.estado); }
    if (!fields.length) return { ok: true };
    vals.push(id);
    await db.query(`UPDATE Cuentas SET ${fields.join(', ')} WHERE id_cuenta = ?`, vals);
    return { ok: true };
  }

  async deleteCuenta(id: number) {
    // Soft-delete (no borramos para preservar historial de movimientos)
    await db.query(`UPDATE Cuentas SET estado = 'INACTIVA' WHERE id_cuenta = ?`, [id]);
    return { ok: true };
  }

  // ── Gastos bancarios (ITF, comisiones, portes) ─────────────
  async getGastosBancarios(limit = 100) {
    const [rows] = await db.query(`
      SELECT g.id_gasto_bancario, g.id_cuenta, g.fecha, g.categoria,
             g.concepto, g.monto, g.moneda, g.tipo_cambio, g.comentario,
             g.created_at, cu.nombre AS cuenta_nombre, cu.tipo AS cuenta_tipo
        FROM GastoBancario g
        LEFT JOIN Cuentas cu ON cu.id_cuenta = g.id_cuenta
       ORDER BY g.fecha DESC, g.id_gasto_bancario DESC
       LIMIT ?
    `, [limit]);
    return rows;
  }

  async createGastoBancario(data: {
    id_cuenta: number;
    fecha: string;
    categoria: 'ITF'|'COMISION_MANT'|'COMISION_TC'|'PORTES'|'OTROS';
    concepto: string;
    monto: number;
    moneda?: 'PEN'|'USD';
    tipo_cambio?: number;
    comentario?: string;
  }, userId?: number) {
    if (!data.id_cuenta) throw new Error('id_cuenta requerido');
    if (!data.fecha)     throw new Error('fecha requerida');
    if (!data.categoria) throw new Error('categoria requerida');
    if (!data.concepto)  throw new Error('concepto requerido');
    if (!(Number(data.monto) > 0)) throw new Error('monto debe ser > 0');

    const [r]: any = await db.query(
      `INSERT INTO GastoBancario
         (id_cuenta, fecha, categoria, concepto, monto, moneda, tipo_cambio, comentario, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id_cuenta, data.fecha, data.categoria, data.concepto,
        Number(data.monto), data.moneda || 'PEN', Number(data.tipo_cambio) || 1.0,
        data.comentario || null, userId || null,
      ]
    );
    // Descontar del saldo de la cuenta
    await db.query(
      `UPDATE Cuentas SET saldo_actual = saldo_actual - ? WHERE id_cuenta = ?`,
      [Number(data.monto), data.id_cuenta]
    );
    // Auto-crear movimiento bancario asociado (CARGO)
    await db.query(`
      INSERT INTO MovimientoBancario
        (id_cuenta, fecha, descripcion_banco, monto, tipo,
         estado_conciliacion, ref_tipo, ref_id, fuente,
         conciliado_por, conciliado_at, comentario)
      VALUES (?, ?, ?, ?, 'CARGO', 'CONCILIADO', 'GASTO_BANCARIO', ?, 'AUTO', ?, NOW(), ?)
    `, [
      data.id_cuenta, data.fecha, `${data.categoria}: ${data.concepto}`,
      Number(data.monto), r.insertId, userId || null, data.comentario || null,
    ]);
    return { id_gasto_bancario: r.insertId };
  }

  // ── Pago de IGV a SUNAT ──────────────────────────────────
  async getPagosImpuestos(limit = 50) {
    const [rows] = await db.query(`
      SELECT p.id_pago, p.fecha, p.tipo_impuesto, p.periodo, p.monto,
             p.moneda, p.tipo_cambio, p.descripcion, p.id_cuenta,
             cu.nombre AS cuenta_nombre
        FROM PagosImpuestos p
        LEFT JOIN Cuentas cu ON cu.id_cuenta = p.id_cuenta
       ORDER BY p.fecha DESC, p.id_pago DESC
       LIMIT ?
    `, [limit]);
    return rows;
  }

  async registrarPagoIGV(data: {
    fecha: string;
    periodo: string;        // 'YYYY-MM'
    monto: number;
    id_cuenta: number;
    moneda?: 'PEN'|'USD';
    tipo_cambio?: number;
    descripcion?: string;
  }) {
    if (!data.fecha)     throw new Error('fecha requerida');
    if (!data.periodo)   throw new Error('periodo requerido (YYYY-MM)');
    if (!data.id_cuenta) throw new Error('id_cuenta requerido');
    if (!(Number(data.monto) > 0)) throw new Error('monto debe ser > 0');

    const [r]: any = await db.query(
      `INSERT INTO PagosImpuestos (fecha, tipo_impuesto, periodo, monto, id_cuenta, moneda, tipo_cambio, descripcion)
       VALUES (?, 'IGV', ?, ?, ?, ?, ?, ?)`,
      [
        data.fecha, data.periodo, Number(data.monto),
        data.id_cuenta, data.moneda || 'PEN', Number(data.tipo_cambio) || 1.0,
        data.descripcion || `IGV ${data.periodo}`,
      ]
    );
    // Descontar del saldo de la cuenta
    await db.query(
      `UPDATE Cuentas SET saldo_actual = saldo_actual - ? WHERE id_cuenta = ?`,
      [Number(data.monto), data.id_cuenta]
    );
    // Auto-crear movimiento bancario (CARGO)
    await db.query(`
      INSERT INTO MovimientoBancario
        (id_cuenta, fecha, descripcion_banco, monto, tipo,
         estado_conciliacion, ref_tipo, ref_id, fuente,
         conciliado_at, comentario)
      VALUES (?, ?, ?, ?, 'CARGO', 'CONCILIADO', 'PAGO_IMPUESTO', ?, 'AUTO', NOW(), ?)
    `, [
      data.id_cuenta, data.fecha, `IGV SUNAT — Período ${data.periodo}`,
      Number(data.monto), r.insertId, data.descripcion || null,
    ]);
    return { id_pago: r.insertId };
  }

  async deletePagoImpuesto(id: number) {
    const [[p]]: any = await db.query(
      `SELECT id_cuenta, monto FROM PagosImpuestos WHERE id_pago = ?`, [id]
    );
    if (!p) throw new Error('Pago no encontrado');
    await db.query(
      `DELETE FROM MovimientoBancario WHERE ref_tipo='PAGO_IMPUESTO' AND ref_id=? AND fuente='AUTO'`,
      [id]
    );
    await db.query(`DELETE FROM PagosImpuestos WHERE id_pago = ?`, [id]);
    if (p.id_cuenta) {
      await db.query(
        `UPDATE Cuentas SET saldo_actual = saldo_actual + ? WHERE id_cuenta = ?`,
        [Number(p.monto), p.id_cuenta]
      );
    }
    return { ok: true };
  }

  // ── Conciliación bancaria ─────────────────────────────────
  async getMovimientosBancarios(idCuenta?: number, estado?: string) {
    const params: any[] = [];
    const wh: string[] = [];
    if (idCuenta) { wh.push('m.id_cuenta = ?'); params.push(idCuenta); }
    if (estado)   { wh.push('m.estado_conciliacion = ?'); params.push(estado); }
    const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';

    const [rows] = await db.query(`
      SELECT m.id_movimiento, m.id_cuenta, m.fecha, m.descripcion_banco,
             m.monto, m.tipo, m.estado_conciliacion, m.ref_tipo, m.ref_id,
             m.comentario, m.conciliado_at,
             cu.nombre AS cuenta_nombre, cu.moneda AS cuenta_moneda
        FROM MovimientoBancario m
        LEFT JOIN Cuentas cu ON cu.id_cuenta = m.id_cuenta
       ${where}
       ORDER BY m.fecha DESC, m.id_movimiento DESC
       LIMIT 500
    `, params);
    return rows;
  }

  async createMovimientoBancario(data: {
    id_cuenta: number;
    fecha: string;
    descripcion_banco: string;
    monto: number;
    tipo: 'ABONO'|'CARGO';
    comentario?: string;
  }) {
    if (!data.id_cuenta) throw new Error('id_cuenta requerido');
    if (!data.fecha)     throw new Error('fecha requerida');
    if (!data.descripcion_banco) throw new Error('descripción requerida');
    if (!['ABONO','CARGO'].includes(data.tipo)) throw new Error('tipo inválido');
    if (!(Number(data.monto) > 0)) throw new Error('monto debe ser > 0');

    const [r]: any = await db.query(
      `INSERT INTO MovimientoBancario
         (id_cuenta, fecha, descripcion_banco, monto, tipo, comentario)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.id_cuenta, data.fecha, data.descripcion_banco, Number(data.monto), data.tipo, data.comentario || null]
    );
    return { id_movimiento: r.insertId };
  }

  async sugerirConciliacion(idMovimiento: number) {
    const [[m]]: any = await db.query(
      `SELECT id_cuenta, fecha, monto, tipo FROM MovimientoBancario WHERE id_movimiento = ?`,
      [idMovimiento]
    );
    if (!m) throw new Error('Movimiento no encontrado');

    // ±3 días, monto exacto
    const candidatos: any[] = [];
    if (m.tipo === 'ABONO') {
      // Buscar CobranzasCotizacion que calcen
      const [cob] = await db.query(`
        SELECT cb.id_cobranza AS id, 'COBRANZA' AS ref_tipo,
               c.nro_cotizacion, c.cliente, cb.monto, cb.fecha_movimiento AS fecha,
               cb.tipo AS subtipo, cb.nro_operacion
          FROM CobranzasCotizacion cb
          JOIN Cotizaciones c ON c.id_cotizacion = cb.id_cotizacion
         WHERE cb.id_cuenta = ?
           AND ABS(cb.monto - ?) < 0.01
           AND ABS(DATEDIFF(cb.fecha_movimiento, ?)) <= 3
         ORDER BY ABS(DATEDIFF(cb.fecha_movimiento, ?))
         LIMIT 5
      `, [m.id_cuenta, m.monto, m.fecha, m.fecha]);
      candidatos.push(...(cob as any[]));
    } else {
      // CARGO: gastos bancarios o pagos de impuestos
      const [gb] = await db.query(`
        SELECT id_gasto_bancario AS id, 'GASTO_BANCARIO' AS ref_tipo,
               concepto AS descripcion, monto, fecha, categoria AS subtipo
          FROM GastoBancario
         WHERE id_cuenta = ?
           AND ABS(monto - ?) < 0.01
           AND ABS(DATEDIFF(fecha, ?)) <= 3
         ORDER BY ABS(DATEDIFF(fecha, ?))
         LIMIT 5
      `, [m.id_cuenta, m.monto, m.fecha, m.fecha]);
      candidatos.push(...(gb as any[]));
      const [pi] = await db.query(`
        SELECT id_pago AS id, 'PAGO_IMPUESTO' AS ref_tipo,
               descripcion, monto, fecha, tipo_impuesto AS subtipo
          FROM PagosImpuestos
         WHERE id_cuenta = ?
           AND ABS(monto - ?) < 0.01
           AND ABS(DATEDIFF(fecha, ?)) <= 3
         ORDER BY ABS(DATEDIFF(fecha, ?))
         LIMIT 5
      `, [m.id_cuenta, m.monto, m.fecha, m.fecha]);
      candidatos.push(...(pi as any[]));
    }
    return candidatos;
  }

  async conciliarMovimiento(idMovimiento: number, data: {
    ref_tipo: 'COBRANZA'|'GASTO_BANCARIO'|'PAGO_IMPUESTO'|'OTRO';
    ref_id?: number;
    comentario?: string;
  }, userId?: number) {
    const refMap: Record<string,string> = {
      COBRANZA: 'COBRANZA', GASTO_BANCARIO: 'GASTO_BANCARIO',
      PAGO_IMPUESTO: 'OTRO', OTRO: 'OTRO',
    };
    await db.query(
      `UPDATE MovimientoBancario
          SET estado_conciliacion = 'CONCILIADO',
              ref_tipo = ?, ref_id = ?, comentario = COALESCE(?, comentario),
              conciliado_por = ?, conciliado_at = NOW()
        WHERE id_movimiento = ?`,
      [refMap[data.ref_tipo] || 'OTRO', data.ref_id || null, data.comentario || null, userId || null, idMovimiento]
    );
    return { ok: true };
  }

  async ignorarMovimiento(idMovimiento: number) {
    await db.query(
      `UPDATE MovimientoBancario SET estado_conciliacion = 'IGNORADO' WHERE id_movimiento = ?`,
      [idMovimiento]
    );
    return { ok: true };
  }

  async deleteMovimientoBancario(idMovimiento: number) {
    await db.query(`DELETE FROM MovimientoBancario WHERE id_movimiento = ?`, [idMovimiento]);
    return { ok: true };
  }

  // ── Facturación (APROBADA → FACTURADA → COBRADA) ──────────
  async marcarFacturada(idCotizacion: number, data: {
    nro_factura: string;
    fecha_factura: string;
  }) {
    if (!data.nro_factura)   throw new Error('nro_factura requerido');
    if (!data.fecha_factura) throw new Error('fecha_factura requerida');

    const [[cot]]: any = await db.query(
      `SELECT estado, estado_financiero FROM Cotizaciones WHERE id_cotizacion = ?`,
      [idCotizacion]
    );
    if (!cot) throw new Error('Cotización no encontrada');
    if (cot.estado === 'ANULADA') throw new Error('Cotización anulada');
    if (!['FONDEADA_TOTAL','SIN_DETRACCION_FONDEADA','FACTURADA','COBRADA'].includes(cot.estado_financiero)) {
      throw new Error(`No se puede facturar aún (estado: ${cot.estado_financiero}). Debe estar fondeada.`);
    }

    await db.query(
      `UPDATE Cotizaciones
          SET nro_factura = ?, fecha_factura = ?, estado_financiero = 'FACTURADA'
        WHERE id_cotizacion = ?`,
      [data.nro_factura, data.fecha_factura, idCotizacion]
    );
    return { ok: true };
  }

  async marcarCobrada(idCotizacion: number) {
    const [[cot]]: any = await db.query(
      `SELECT estado_financiero FROM Cotizaciones WHERE id_cotizacion = ?`,
      [idCotizacion]
    );
    if (!cot) throw new Error('Cotización no encontrada');
    if (cot.estado_financiero !== 'FACTURADA') {
      throw new Error(`Solo se pueden marcar cobradas cotizaciones facturadas (estado: ${cot.estado_financiero})`);
    }
    await db.query(
      `UPDATE Cotizaciones
          SET estado_financiero = 'COBRADA', fecha_cobro_total = NOW()
        WHERE id_cotizacion = ?`,
      [idCotizacion]
    );
    return { ok: true };
  }

  async revertirFacturacion(idCotizacion: number) {
    // Vuelve FACTURADA → FONDEADA_TOTAL (u otro estado fondeado)
    const [[cot]]: any = await db.query(
      `SELECT monto_detraccion, total, monto_retencion, monto_cobrado_banco, monto_cobrado_detraccion
         FROM Cotizaciones WHERE id_cotizacion = ?`,
      [idCotizacion]
    );
    if (!cot) throw new Error('Cotización no encontrada');
    const nuevo = Number(cot.monto_detraccion) > 0 ? 'FONDEADA_TOTAL' : 'SIN_DETRACCION_FONDEADA';
    await db.query(
      `UPDATE Cotizaciones
          SET estado_financiero = ?, nro_factura = NULL, fecha_factura = NULL, fecha_cobro_total = NULL
        WHERE id_cotizacion = ?`,
      [nuevo, idCotizacion]
    );
    return { ok: true };
  }

  async deleteGastoBancario(id: number) {
    const [[g]]: any = await db.query(
      `SELECT id_cuenta, monto FROM GastoBancario WHERE id_gasto_bancario = ?`, [id]
    );
    if (!g) throw new Error('Gasto bancario no encontrado');
    await db.query(
      `DELETE FROM MovimientoBancario WHERE ref_tipo='GASTO_BANCARIO' AND ref_id=? AND fuente='AUTO'`,
      [id]
    );
    await db.query(`DELETE FROM GastoBancario WHERE id_gasto_bancario = ?`, [id]);
    await db.query(
      `UPDATE Cuentas SET saldo_actual = saldo_actual + ? WHERE id_cuenta = ?`,
      [Number(g.monto), g.id_cuenta]
    );
    return { ok: true };
  }

  // ── Libro Bancos ──────────────────────────────────────────
  /**
   * Devuelve movimientos del período para una cuenta, con KPIs.
   * periodo: 'YYYY-MM'. Si no se pasa, usa el mes actual.
   */
  async getLibroBancos(idCuenta: number, periodo?: string) {
    if (!idCuenta) throw new Error('id_cuenta requerido');

    const now = new Date();
    const per = periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [anio, mes] = per.split('-').map(Number);
    const desde = `${per}-01`;
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${new Date(anio, mes, 0).getDate()}`;

    // Datos de la cuenta
    const [[cuenta]]: any = await db.query(
      `SELECT id_cuenta, nombre, moneda, tipo, saldo_actual
         FROM Cuentas WHERE id_cuenta = ?`,
      [idCuenta]
    );
    if (!cuenta) throw new Error('Cuenta no encontrada');

    // Saldo inicial: preferir saldo_contable del EECC importado (más preciso)
    // Buscar el movimiento más antiguo del período que tenga saldo_contable
    // y calcular hacia atrás: saldo_antes = saldo_contable ∓ monto
    const [[eeccIniRow]]: any = await db.query(`
      SELECT saldo_contable, monto, tipo
        FROM MovimientoBancario
       WHERE id_cuenta = ? AND fecha BETWEEN ? AND ?
         AND saldo_contable IS NOT NULL AND fuente = 'IMPORT_EECC'
       ORDER BY fecha ASC, id_movimiento ASC
       LIMIT 1
    `, [idCuenta, desde, hasta]);

    let saldo_inicial: number;
    if (eeccIniRow && eeccIniRow.saldo_contable != null) {
      // Primer mov del EECC: saldo_antes = saldo_contable - (abono) o + (cargo)
      const sc = Number(eeccIniRow.saldo_contable);
      const m  = Number(eeccIniRow.monto);
      saldo_inicial = eeccIniRow.tipo === 'ABONO' ? +(sc - m).toFixed(2) : +(sc + m).toFixed(2);
    } else {
      // Fallback: suma de movimientos previos
      const [[iniRow]]: any = await db.query(`
        SELECT COALESCE(SUM(CASE WHEN tipo='ABONO' THEN monto ELSE -monto END),0) AS saldo_ini
          FROM MovimientoBancario WHERE id_cuenta = ? AND fecha < ?
      `, [idCuenta, desde]);
      saldo_inicial = Number(iniRow.saldo_ini) || 0;
    }

    // Movimientos del período
    const [movs] = await db.query(`
      SELECT m.id_movimiento, m.id_cuenta, m.fecha, m.fecha_proceso,
             m.nro_operacion, m.canal, m.tipo_movimiento_banco,
             m.descripcion_banco, m.monto, m.tipo, m.saldo_contable,
             m.estado_conciliacion, m.ref_tipo, m.ref_id, m.fuente,
             m.comentario, m.created_at,
             CASE m.ref_tipo
               WHEN 'COBRANZA' THEN (
                 SELECT CONCAT(c.nro_cotizacion, ' — ', c.cliente)
                   FROM CobranzasCotizacion cb
                   JOIN Cotizaciones c ON c.id_cotizacion = cb.id_cotizacion
                  WHERE cb.id_cobranza = m.ref_id)
               WHEN 'GASTO_BANCARIO' THEN (
                 SELECT CONCAT(categoria, ': ', concepto)
                   FROM GastoBancario WHERE id_gasto_bancario = m.ref_id)
               WHEN 'PAGO_IMPUESTO' THEN (
                 SELECT CONCAT(tipo_impuesto, ' ', periodo)
                   FROM PagosImpuestos WHERE id_pago = m.ref_id)
               ELSE NULL
             END AS ref_label
        FROM MovimientoBancario m
       WHERE m.id_cuenta = ? AND m.fecha BETWEEN ? AND ?
       ORDER BY m.fecha ASC, m.id_movimiento ASC
    `, [idCuenta, desde, hasta]);

    // Saldo corrido (calculado) y KPIs
    const lista = (movs as any[]).map(m => ({ ...m, monto: Number(m.monto) }));
    let saldo = saldo_inicial;
    let ingresos = 0, egresos = 0, pendientes = 0, comisiones = 0;
    for (const m of lista) {
      if (m.tipo === 'ABONO') { saldo += m.monto; ingresos += m.monto; }
      else                    { saldo -= m.monto; egresos  += m.monto; }
      m.saldo_calculado = +saldo.toFixed(2);
      if (m.estado_conciliacion === 'POR_CONCILIAR') pendientes++;
      if (m.ref_tipo === 'GASTO_BANCARIO') comisiones += m.monto;
    }
    const saldo_final = saldo;

    // Auto-sugerencias para movimientos pendientes (top 1 por cada uno)
    for (const m of lista) {
      if (m.estado_conciliacion !== 'POR_CONCILIAR') continue;
      m.sugerencia = null;
      try {
        if (m.tipo === 'ABONO') {
          // Buscar cobranzas: ±5 días, monto similar (±5%)
          const [cob] = await db.query(`
            SELECT cb.id_cobranza AS id, 'COBRANZA' AS ref_tipo,
                   c.nro_cotizacion, c.cliente, c.proyecto,
                   cb.monto, cb.fecha_movimiento AS fecha, cb.tipo AS subtipo,
                   cb.nro_operacion, cb.comentario AS mi_descripcion
              FROM CobranzasCotizacion cb
              JOIN Cotizaciones c ON c.id_cotizacion = cb.id_cotizacion
             WHERE cb.id_cuenta = ?
               AND ABS(cb.monto - ?) / GREATEST(cb.monto, 0.01) < 0.05
               AND ABS(DATEDIFF(cb.fecha_movimiento, ?)) <= 5
             ORDER BY ABS(cb.monto - ?) ASC, ABS(DATEDIFF(cb.fecha_movimiento, ?))
             LIMIT 1
          `, [idCuenta, m.monto, m.fecha, m.monto, m.fecha]);
          if ((cob as any[]).length) {
            const s = (cob as any[])[0];
            m.sugerencia = {
              ...s,
              label: `${s.nro_cotizacion} — ${s.cliente}${s.proyecto ? ' · ' + s.proyecto : ''}`,
              fecha_str: String(s.fecha).slice(0, 10),
            };
          }
        } else {
          // CARGO: buscar en gastos, pagos impuestos, compras
          const [gb] = await db.query(`
            SELECT id_gasto_bancario AS id, 'GASTO_BANCARIO' AS ref_tipo,
                   CONCAT(categoria, ': ', concepto) AS label,
                   monto, fecha, comentario AS mi_descripcion
              FROM GastoBancario
             WHERE id_cuenta = ?
               AND ABS(monto - ?) / GREATEST(monto, 0.01) < 0.05
               AND ABS(DATEDIFF(fecha, ?)) <= 5
             ORDER BY ABS(monto - ?) ASC, ABS(DATEDIFF(fecha, ?))
             LIMIT 1
          `, [idCuenta, m.monto, m.fecha, m.monto, m.fecha]);
          if ((gb as any[]).length) {
            const s = (gb as any[])[0];
            m.sugerencia = { ...s, fecha_str: String(s.fecha).slice(0, 10) };
          } else {
            const [pi] = await db.query(`
              SELECT id_pago AS id, 'PAGO_IMPUESTO' AS ref_tipo,
                     CONCAT(tipo_impuesto, ' ', periodo) AS label,
                     monto, fecha, descripcion AS mi_descripcion
                FROM PagosImpuestos
               WHERE id_cuenta = ?
                 AND ABS(monto - ?) / GREATEST(monto, 0.01) < 0.05
                 AND ABS(DATEDIFF(fecha, ?)) <= 5
               ORDER BY ABS(monto - ?) ASC, ABS(DATEDIFF(fecha, ?))
               LIMIT 1
            `, [idCuenta, m.monto, m.fecha, m.monto, m.fecha]);
            if ((pi as any[]).length) {
              const s = (pi as any[])[0];
              m.sugerencia = { ...s, fecha_str: String(s.fecha).slice(0, 10) };
            }
          }
        }
      } catch (_) { /* silencioso si falla sugerencia */ }
    }

    // Si el último mov tiene saldo_contable (del EECC), comparar
    const ultimoConSaldo = [...lista].reverse().find(m => m.saldo_contable != null);
    const saldo_banco = ultimoConSaldo ? Number(ultimoConSaldo.saldo_contable) : null;
    const diferencia = saldo_banco != null ? +(saldo_banco - saldo_final).toFixed(2) : null;

    return {
      cuenta,
      periodo: per,
      saldo_inicial: +saldo_inicial.toFixed(2),
      saldo_final: +saldo_final.toFixed(2),
      saldo_banco,
      diferencia,
      ingresos: +ingresos.toFixed(2),
      egresos:  +egresos.toFixed(2),
      comisiones: +comisiones.toFixed(2),
      pendientes_conciliar: pendientes,
      movimientos: lista,
    };
  }

  // ── Importador EECC (Interbank — copiar/pegar texto del PDF) ──
  /**
   * Parsea texto plano de un EECC de Interbank e inserta movimientos.
   * Detecta duplicados por (id_cuenta, nro_operacion, fecha, monto).
   * Auto-clasifica ITF/Comisiones como CONCILIADO con ref GASTO_BANCARIO (virtual).
   */
  async importarEECCInterbank(idCuenta: number, texto: string, userId?: number) {
    if (!idCuenta) throw new Error('id_cuenta requerido');
    if (!texto || !texto.trim()) throw new Error('Texto EECC vacío');

    // Normalizar: todo en una sola línea continua para parsear por bloques
    const fullText = texto.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');

    const parseFecha = (s: string) => {
      const [d, m, y] = s.split('/');
      return `${y}-${m}-${d}`;
    };
    const parseMonto = (s: string) => Number(s.replace(/[,\s]/g, ''));

    const esComisionOItf = (desc: string) => {
      const m = desc.toUpperCase();
      return m.includes('ITF') || m.includes('N/D') || m.includes('COM.') || m.includes('PORTE');
    };

    // Estrategia: buscar cada segmento que empieza con DD/MM/YYYY DD/MM/YYYY
    // y contiene S/ MONTO S/ SALDO al final
    const reFechaPar = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/g;
    const fechaPairs: { idx: number; fOp: string; fProc: string }[] = [];
    let fm;
    while ((fm = reFechaPar.exec(fullText)) !== null) {
      // Ignorar fechas del header (Rango de fechas, Fecha de consulta, etc.)
      const antes = fullText.slice(Math.max(0, fm.index - 30), fm.index);
      if (/Desde|Hasta|consulta|Rango|Fecha de Fecha/i.test(antes)) continue;
      fechaPairs.push({ idx: fm.index, fOp: fm[1], fProc: fm[2] });
    }

    console.log('[EECC] Pares de fecha encontrados:', fechaPairs.length);

    const items: any[] = [];
    for (let i = 0; i < fechaPairs.length; i++) {
      const fp = fechaPairs[i];
      // Segmento: desde después de la fecha hasta el inicio del siguiente par (o fin del texto)
      const startAfterDates = fp.idx + fp.fOp.length + 1 + fp.fProc.length;
      const endIdx = i + 1 < fechaPairs.length ? fechaPairs[i + 1].idx : fullText.length;
      const segment = fullText.slice(startAfterDates, endIdx).trim();

      // Buscar los últimos dos S/ MONTO en el segmento (importe + saldo)
      const reSoles = /S\s*\/\s*(-?[\d,]+\.\d{2})/g;
      const montos: { val: string; end: number }[] = [];
      let sm;
      while ((sm = reSoles.exec(segment)) !== null) {
        montos.push({ val: sm[1], end: sm.index + sm[0].length });
      }
      if (montos.length < 2) {
        console.log('[EECC] Segmento sin 2 montos:', segment.slice(0, 80));
        continue;
      }

      const saldoStr = montos[montos.length - 1].val;
      const impStr   = montos[montos.length - 2].val;
      // Texto antes del primer S/ monto = nro_op + movimiento + descripción + canal
      const firstMontoIdx = segment.indexOf('S');
      let middle = segment.slice(0, segment.search(/S\s*\//)).trim();

      // Extraer nro_operacion (primer token: número o -)
      const tokMatch = middle.match(/^(\S+)\s+([\s\S]*)/);
      let nroOp = '-';
      let movDesc = middle;
      if (tokMatch) {
        nroOp = tokMatch[1];
        movDesc = tokMatch[2].trim();
        // Quitar nroOp duplicado del inicio de movDesc (artefacto PDF)
        if (nroOp !== '-' && movDesc.startsWith(nroOp)) {
          movDesc = movDesc.slice(nroOp.length).trim();
        }
      }

      // Extraer canal si existe al final del movDesc
      let canal: string | null = null;
      const canalMatch = movDesc.match(/\s+(INTERNO|WEB|VENTANILLA|CAJERO|APP)\s*$/i);
      if (canalMatch) {
        canal = canalMatch[1].toUpperCase();
        movDesc = movDesc.slice(0, canalMatch.index).trim();
      }

      // Extraer tipo de movimiento
      const tipoMatch = movDesc.match(/^(ITF|N\/D[^\s]*|ABONO\s*TRANSFERENCIA|CARGO\s*TRANSFERENCIA|TRAN\s*TIL|PAGO\s*DE\s*SERVICIOS|TRANSFERENCIA|DEPOSITO|RETIRO)/i);
      const tipoMov = tipoMatch ? tipoMatch[1].toUpperCase().replace(/\s+/g, ' ') : movDesc.split(' ')[0].toUpperCase();
      const descripcion = tipoMatch ? movDesc.slice(tipoMatch[0].length).trim() : movDesc;

      const monto = parseMonto(impStr);
      items.push({
        fecha_op: parseFecha(fp.fOp),
        fecha_proc: parseFecha(fp.fProc),
        nro_operacion: nroOp === '-' ? null : nroOp,
        tipo_mov: tipoMov,
        descripcion: descripcion.replace(/\s+/g, ' ').trim(),
        canal,
        monto: Math.abs(monto),
        tipo: monto >= 0 ? 'ABONO' as const : 'CARGO' as const,
        saldo_contable: parseMonto(saldoStr),
        es_comision: esComisionOItf(tipoMov + ' ' + descripcion),
      });
    }

    console.log('[EECC] Items parseados:', items.length);
    if (items.length) items.slice(0, 3).forEach((it, i) => console.log(`[EECC] Item${i}:`, JSON.stringify(it)));
    if (!items.length) {
      throw new Error(`No se detectaron movimientos (${fechaPairs.length} fechas encontradas). Verifica el formato del PDF.`);
    }

    // Insertar (detectando duplicados)
    let insertados = 0, duplicados = 0;
    for (const it of items) {
      // Dedupe: misma cuenta + nro_operacion + fecha + monto
      let dup: any[];
      if (it.nro_operacion) {
        [dup] = await db.query(
          `SELECT id_movimiento FROM MovimientoBancario
            WHERE id_cuenta=? AND nro_operacion=? AND fecha=? AND monto=?`,
          [idCuenta, it.nro_operacion, it.fecha_op, it.monto]
        ) as any;
      } else {
        [dup] = await db.query(
          `SELECT id_movimiento FROM MovimientoBancario
            WHERE id_cuenta=? AND fecha=? AND monto=? AND tipo=? AND tipo_movimiento_banco=?`,
          [idCuenta, it.fecha_op, it.monto, it.tipo, it.tipo_mov]
        ) as any;
      }
      if ((dup as any[]).length) { duplicados++; continue; }

      const estado = it.es_comision ? 'CONCILIADO' : 'POR_CONCILIAR';
      await db.query(`
        INSERT INTO MovimientoBancario
          (id_cuenta, fecha, fecha_proceso, nro_operacion, canal,
           tipo_movimiento_banco, descripcion_banco, monto, tipo,
           saldo_contable, estado_conciliacion, fuente,
           conciliado_at, conciliado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IMPORT_EECC', ?, ?)
      `, [
        idCuenta, it.fecha_op, it.fecha_proc, it.nro_operacion, it.canal,
        it.tipo_mov, it.descripcion, it.monto, it.tipo,
        it.saldo_contable, estado,
        it.es_comision ? new Date() : null,
        it.es_comision ? (userId || null) : null,
      ]);
      insertados++;
    }

    return {
      total_lineas: items.length,
      insertados,
      duplicados,
    };
  }
}

export default new CobranzasService();

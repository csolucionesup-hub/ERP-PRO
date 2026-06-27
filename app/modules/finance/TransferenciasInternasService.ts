import { db } from '../../../database/connection';

/**
 * TransferenciasInternasService — Movimientos entre Metal Engineers y Perfotools.
 *
 * Caso real (Julio, 14/05/2026): la empresa opera con 2 marcas bajo el mismo
 * RUC (Metal Engineers en PEN, Perfotools en USD). Cada marca tiene su caja
 * independiente y mutuamente se prestan plata. Cuando Metal le presta a
 * Perfotools, sale PEN de la caja Metal y entra USD a la caja Perfotools
 * (al TC del día). El banco aplica su propio TC, así que el monto destino
 * real puede diferir del esperado — eso es DIFERENCIA DE CAMBIO.
 *
 * Reglas:
 *  - PRESTAMO_INTERNO: deuda viva. Saldo_pendiente_pen > 0.
 *  - DEVOLUCION: enlazada a una transferencia original via es_devolucion_de.
 *    Al registrarla, descuenta saldo de la original (valorado en PEN al TC
 *    de la original — ese es el principio del préstamo).
 *  - APORTE_CAPITAL: aporte sin devolución. Estado='APORTE', saldo=0.
 *  - Una transferencia se anula sólo si estado IN (PENDIENTE, PARCIAL, APORTE)
 *    y no tiene devoluciones. Las DEVOLUCIONES se anulan independientemente.
 */

type Empresa = 'METAL' | 'PERFOTOOLS';
type TipoMovTransf = 'PRESTAMO_INTERNO' | 'DEVOLUCION' | 'APORTE_CAPITAL';

interface CrearTransferenciaInput {
  fecha: string;                 // YYYY-MM-DD
  empresa_origen: Empresa;
  empresa_destino: Empresa;
  tipo_movimiento: TipoMovTransf;
  es_devolucion_de?: number | null;
  moneda_origen: 'PEN' | 'USD';
  monto_origen: number;
  moneda_destino: 'PEN' | 'USD';
  tipo_cambio_referencia: number;
  monto_destino_estimado: number;
  monto_destino_real?: number | null;
  comentario?: string;
  id_usuario_registra?: number | null;
}

class TransferenciasInternasService {

  /**
   * Listado con filtros operativos. Incluye datos calculados al vuelo
   * (diferencia_cambio, días desde emisión) y nombre de empresa original
   * para las DEVOLUCIONES.
   */
  async listar(filtros: {
    desde?: string;
    hasta?: string;
    empresa?: Empresa;
    estado?: string;
    tipo?: TipoMovTransf;
  } = {}) {
    const where: string[] = [];
    const vals: any[] = [];

    if (filtros.desde)   { where.push('t.fecha >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta)   { where.push('t.fecha <= ?'); vals.push(filtros.hasta); }
    if (filtros.empresa) {
      // Filtra cuando esa empresa fue origen O destino
      where.push('(t.empresa_origen = ? OR t.empresa_destino = ?)');
      vals.push(filtros.empresa, filtros.empresa);
    }
    if (filtros.estado)  { where.push('t.estado = ?'); vals.push(filtros.estado); }
    if (filtros.tipo)    { where.push('t.tipo_movimiento = ?'); vals.push(filtros.tipo); }

    const sql = `
      SELECT t.*,
             DATEDIFF(CURDATE(), t.fecha) AS dias_desde_emision,
             orig.fecha AS fecha_original,
             orig.monto_origen AS monto_original_origen,
             orig.moneda_origen AS moneda_original_origen
        FROM TransferenciasInternas t
        LEFT JOIN TransferenciasInternas orig
               ON orig.id_transferencia = t.es_devolucion_de
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY t.fecha DESC, t.id_transferencia DESC
    `;
    const [rows] = await db.query(sql, vals);
    return rows;
  }

  async obtener(id: number) {
    const [rows]: any = await db.query(
      `SELECT * FROM TransferenciasInternas WHERE id_transferencia = ?`,
      [id]
    );
    const t = (rows as any[])[0];
    if (!t) throw new Error('Transferencia no encontrada');

    // Devoluciones asociadas (si es un préstamo)
    const [devs]: any = await db.query(
      `SELECT id_transferencia, fecha, monto_origen, moneda_origen,
              monto_destino_real, monto_destino_estimado, estado, comentario
         FROM TransferenciasInternas
        WHERE es_devolucion_de = ?
        ORDER BY fecha, id_transferencia`,
      [id]
    );
    return { transferencia: t, devoluciones: devs };
  }

  /**
   * Calcula la diferencia de cambio en PEN.
   *
   * Caso típico: Metal envía S/ 10,000 (origen) con TC 3.78 → estimado $2,645.50.
   * Banco aplicó TC 3.79 → real $2,638.50.
   * Diferencia = (estimado − real) × TC_referencia = 7 × 3.78 ≈ S/ 26.46 (pérdida).
   *
   * Si la transferencia es PEN→PEN o USD→USD (raro pero posible si solo se
   * mueve plata sin cambiar moneda), la diferencia es simplemente
   * (estimado − real) sin multiplicar por TC.
   */
  private calcularDiferenciaCambio(input: {
    moneda_origen: string;
    moneda_destino: string;
    monto_destino_estimado: number;
    monto_destino_real: number | null;
    tipo_cambio_referencia: number;
  }): number {
    if (input.monto_destino_real == null) return 0;
    const diffDestino = input.monto_destino_estimado - input.monto_destino_real;
    if (input.moneda_destino === 'PEN') {
      return Number(diffDestino.toFixed(2));
    }
    // Diferencia en moneda destino → convertir a PEN
    return Number((diffDestino * input.tipo_cambio_referencia).toFixed(2));
  }

  /**
   * Convierte el monto_origen a PEN equivalente para el cálculo de saldo.
   * El saldo siempre se lleva en PEN para poder agregar transferencias en
   * monedas distintas.
   */
  private montoEnPEN(monto: number, moneda: string, tc: number): number {
    if (moneda === 'PEN') return monto;
    return Number((monto * tc).toFixed(2));
  }

  async crear(input: CrearTransferenciaInput) {
    if (input.empresa_origen === input.empresa_destino) {
      throw new Error('La empresa de origen y destino deben ser distintas');
    }
    if (!['METAL','PERFOTOOLS'].includes(input.empresa_origen) ||
        !['METAL','PERFOTOOLS'].includes(input.empresa_destino)) {
      throw new Error('empresa_origen y empresa_destino deben ser METAL o PERFOTOOLS');
    }
    if (!['PRESTAMO_INTERNO','DEVOLUCION','APORTE_CAPITAL'].includes(input.tipo_movimiento)) {
      throw new Error('tipo_movimiento inválido');
    }
    if (input.monto_origen <= 0) throw new Error('monto_origen debe ser > 0');
    if (input.monto_destino_estimado <= 0) throw new Error('monto_destino_estimado debe ser > 0');

    // Reglas específicas por tipo
    if (input.tipo_movimiento === 'DEVOLUCION') {
      if (!input.es_devolucion_de) {
        throw new Error('DEVOLUCION requiere es_devolucion_de (id del préstamo original)');
      }
    } else if (input.es_devolucion_de) {
      throw new Error('Solo DEVOLUCION puede tener es_devolucion_de');
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // Validar y bloquear el préstamo original si es DEVOLUCION
      let original: any = null;
      if (input.tipo_movimiento === 'DEVOLUCION') {
        const [origRows]: any = await conn.query(
          `SELECT * FROM TransferenciasInternas
            WHERE id_transferencia = ? FOR UPDATE`,
          [input.es_devolucion_de]
        );
        original = (origRows as any[])[0];
        if (!original) throw new Error('Transferencia original no encontrada');
        if (original.tipo_movimiento !== 'PRESTAMO_INTERNO') {
          throw new Error('Solo se pueden registrar devoluciones sobre PRESTAMO_INTERNO');
        }
        if (['DEVUELTA','ANULADA'].includes(original.estado)) {
          throw new Error(`Préstamo original en estado ${original.estado} — no acepta devoluciones`);
        }
        // La devolución va en sentido inverso al préstamo
        if (input.empresa_origen !== original.empresa_destino ||
            input.empresa_destino !== original.empresa_origen) {
          throw new Error(
            'La devolución debe ir en sentido inverso al préstamo original ' +
            `(${original.empresa_destino} → ${original.empresa_origen})`
          );
        }
      }

      // Calcular diferencia de cambio (puede ser 0 si monto_destino_real no se cargó aún)
      const diferenciaCambio = this.calcularDiferenciaCambio({
        moneda_origen: input.moneda_origen,
        moneda_destino: input.moneda_destino,
        monto_destino_estimado: Number(input.monto_destino_estimado),
        monto_destino_real: input.monto_destino_real ?? null,
        tipo_cambio_referencia: Number(input.tipo_cambio_referencia),
      });

      // TC real derivado (si hay monto real)
      const tcReal = input.monto_destino_real
        ? Number((Number(input.monto_origen) / Number(input.monto_destino_real)).toFixed(4))
        : null;

      // Determinar estado inicial + saldo
      let estado = 'PENDIENTE';
      let saldoPendientePEN = 0;
      if (input.tipo_movimiento === 'PRESTAMO_INTERNO') {
        estado = 'PENDIENTE';
        saldoPendientePEN = this.montoEnPEN(
          Number(input.monto_origen),
          input.moneda_origen,
          Number(input.tipo_cambio_referencia),
        );
      } else if (input.tipo_movimiento === 'APORTE_CAPITAL') {
        estado = 'APORTE';
        saldoPendientePEN = 0;
      }
      // Para DEVOLUCION el saldo_pendiente_pen queda 0 (la devolución en sí
      // no es deuda; ajusta el saldo del préstamo original más abajo).

      // Insertar la transferencia
      const [res]: any = await conn.query(
        `INSERT INTO TransferenciasInternas
          (fecha, empresa_origen, empresa_destino, tipo_movimiento, es_devolucion_de,
           moneda_origen, monto_origen,
           moneda_destino, tipo_cambio_referencia, monto_destino_estimado,
           monto_destino_real, tipo_cambio_real, diferencia_cambio,
           saldo_pendiente_pen, estado, comentario, id_usuario_registra)
         VALUES (?, ?, ?, ?, ?,
                 ?, ?,
                 ?, ?, ?,
                 ?, ?, ?,
                 ?, ?, ?, ?)
         RETURNING id_transferencia`,
        [
          input.fecha, input.empresa_origen, input.empresa_destino,
          input.tipo_movimiento, input.es_devolucion_de || null,
          input.moneda_origen, input.monto_origen,
          input.moneda_destino, input.tipo_cambio_referencia, input.monto_destino_estimado,
          input.monto_destino_real ?? null, tcReal, diferenciaCambio,
          saldoPendientePEN, estado, input.comentario || null,
          input.id_usuario_registra || null,
        ]
      );
      const idNueva = (res as any).rows?.[0]?.id_transferencia || (res as any).insertId;

      // Si es DEVOLUCION, actualizar saldo del préstamo original.
      if (input.tipo_movimiento === 'DEVOLUCION' && original) {
        const montoDevueltoPEN = this.montoEnPEN(
          Number(input.monto_origen),
          input.moneda_origen,
          Number(original.tipo_cambio_referencia),  // valuamos al TC del préstamo original
        );
        const nuevoSaldoPEN = Math.max(
          0,
          Number(original.saldo_pendiente_pen) - montoDevueltoPEN
        );
        const nuevoEstado = nuevoSaldoPEN <= 0.5 ? 'DEVUELTA' : 'PARCIAL';
        await conn.query(
          `UPDATE TransferenciasInternas
              SET saldo_pendiente_pen = ?, estado = ?, updated_at = NOW()
            WHERE id_transferencia = ?`,
          [nuevoSaldoPEN, nuevoEstado, original.id_transferencia]
        );
      }

      await conn.commit();
      return { id_transferencia: idNueva, estado, saldo_pendiente_pen: saldoPendientePEN };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Actualiza una transferencia existente. Solo permite editar campos
   * "blandos": monto_destino_real (para conciliación), comentario, fecha.
   * NO permite cambiar montos/TC originales ni tipo — esos serían anular y
   * recrear.
   */
  async actualizar(id: number, data: {
    monto_destino_real?: number;
    comentario?: string;
    fecha?: string;
  }) {
    const [rows]: any = await db.query(
      `SELECT * FROM TransferenciasInternas WHERE id_transferencia = ?`,
      [id]
    );
    const t = (rows as any[])[0];
    if (!t) throw new Error('Transferencia no encontrada');
    if (t.estado === 'ANULADA') throw new Error('No se puede editar una transferencia anulada');

    const sets: string[] = [];
    const vals: any[] = [];

    if (data.monto_destino_real !== undefined) {
      const real = Number(data.monto_destino_real);
      if (real <= 0) throw new Error('monto_destino_real debe ser > 0');
      const diff = this.calcularDiferenciaCambio({
        moneda_origen:          t.moneda_origen,
        moneda_destino:         t.moneda_destino,
        monto_destino_estimado: Number(t.monto_destino_estimado),
        monto_destino_real:     real,
        tipo_cambio_referencia: Number(t.tipo_cambio_referencia),
      });
      const tcReal = Number((Number(t.monto_origen) / real).toFixed(4));
      sets.push('monto_destino_real = ?'); vals.push(real);
      sets.push('tipo_cambio_real = ?');   vals.push(tcReal);
      sets.push('diferencia_cambio = ?');  vals.push(diff);
    }
    if (data.comentario !== undefined) {
      sets.push('comentario = ?');
      vals.push(data.comentario || null);
    }
    if (data.fecha !== undefined && data.fecha) {
      sets.push('fecha = ?');
      vals.push(data.fecha);
    }

    if (!sets.length) return { success: true, sin_cambios: true };
    sets.push('updated_at = NOW()');
    vals.push(id);
    await db.query(
      `UPDATE TransferenciasInternas SET ${sets.join(', ')} WHERE id_transferencia = ?`,
      vals
    );
    return { success: true };
  }

  /**
   * Anula una transferencia. Si es DEVOLUCION, restaura el saldo del
   * préstamo original. Si es PRESTAMO_INTERNO, valida que no tenga
   * devoluciones (sino habría inconsistencia — el usuario debe anular las
   * devoluciones primero).
   */
  async anular(id: number, motivo?: string) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT * FROM TransferenciasInternas
          WHERE id_transferencia = ? FOR UPDATE`,
        [id]
      );
      const t = (rows as any[])[0];
      if (!t) throw new Error('Transferencia no encontrada');
      if (t.estado === 'ANULADA') throw new Error('Ya está anulada');

      if (t.tipo_movimiento === 'PRESTAMO_INTERNO') {
        // No anular si tiene devoluciones vivas
        const [devs]: any = await conn.query(
          `SELECT COUNT(*)::int AS n FROM TransferenciasInternas
            WHERE es_devolucion_de = ? AND estado <> 'ANULADA'`,
          [id]
        );
        if ((devs as any[])[0]?.n > 0) {
          throw new Error('Este préstamo tiene devoluciones vivas. Anulá primero las devoluciones.');
        }
      }

      if (t.tipo_movimiento === 'DEVOLUCION' && t.es_devolucion_de) {
        // Restaurar saldo del préstamo original
        const [origRows]: any = await conn.query(
          `SELECT * FROM TransferenciasInternas
            WHERE id_transferencia = ? FOR UPDATE`,
          [t.es_devolucion_de]
        );
        const orig = (origRows as any[])[0];
        if (orig && orig.estado !== 'ANULADA') {
          const montoDevPEN = this.montoEnPEN(
            Number(t.monto_origen),
            t.moneda_origen,
            Number(orig.tipo_cambio_referencia),
          );
          const nuevoSaldo = Number(orig.saldo_pendiente_pen) + montoDevPEN;
          const nuevoEstado = nuevoSaldo > 0.5 ? (orig.estado === 'DEVUELTA' ? 'PARCIAL' : orig.estado) : orig.estado;
          await conn.query(
            `UPDATE TransferenciasInternas
                SET saldo_pendiente_pen = ?, estado = ?, updated_at = NOW()
              WHERE id_transferencia = ?`,
            [nuevoSaldo, nuevoEstado, orig.id_transferencia]
          );
        }
      }

      await conn.query(
        `UPDATE TransferenciasInternas
            SET estado = 'ANULADA',
                comentario = COALESCE(comentario,'') || ?,
                updated_at = NOW()
          WHERE id_transferencia = ?`,
        [motivo ? `\n[ANULADA] ${motivo}` : '\n[ANULADA]', id]
      );

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
   * Elimina DEFINITIVAMENTE una transferencia (hard delete). A diferencia de
   * anular (que solo cambia estado a ANULADA), borra la fila. Pensado para
   * corregir errores de carga sin dejar registros ANULADA colgando.
   *
   * En una transacción:
   *  1. Bloquea si tiene devoluciones vivas (no anuladas) — hay que sacarlas primero.
   *  2. Si es DEVOLUCION aún viva, restaura el saldo del préstamo original.
   *  3. Desvincula los movimientos bancarios conciliados con ella → vuelven a
   *     POR_CONCILIAR (el FK ON DELETE SET NULL limpia el id, pero NO revierte
   *     ref_tipo/estado — eso hay que hacerlo a mano).
   *  4. Borra la fila.
   */
  async eliminar(id: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT * FROM TransferenciasInternas WHERE id_transferencia = ? FOR UPDATE`,
        [id]
      );
      const t = (rows as any[])[0];
      if (!t) throw new Error('Transferencia no encontrada');

      // 1. No borrar préstamo con devoluciones vivas
      if (t.tipo_movimiento === 'PRESTAMO_INTERNO') {
        const [devs]: any = await conn.query(
          `SELECT COUNT(*)::int AS n FROM TransferenciasInternas
            WHERE es_devolucion_de = ? AND estado <> 'ANULADA'`,
          [id]
        );
        if ((devs as any[])[0]?.n > 0) {
          throw new Error('Esta transferencia tiene devoluciones registradas. Eliminá primero las devoluciones.');
        }
      }

      // 2. Si es una DEVOLUCION viva, restaurar saldo del préstamo original
      if (t.tipo_movimiento === 'DEVOLUCION' && t.es_devolucion_de && t.estado !== 'ANULADA') {
        const [origRows]: any = await conn.query(
          `SELECT * FROM TransferenciasInternas WHERE id_transferencia = ? FOR UPDATE`,
          [t.es_devolucion_de]
        );
        const orig = (origRows as any[])[0];
        if (orig && orig.estado !== 'ANULADA') {
          const montoDevPEN = this.montoEnPEN(
            Number(t.monto_origen),
            t.moneda_origen,
            Number(orig.tipo_cambio_referencia),
          );
          const nuevoSaldo = Number(orig.saldo_pendiente_pen) + montoDevPEN;
          const nuevoEstado = nuevoSaldo > 0.5 ? (orig.estado === 'DEVUELTA' ? 'PARCIAL' : orig.estado) : orig.estado;
          await conn.query(
            `UPDATE TransferenciasInternas
                SET saldo_pendiente_pen = ?, estado = ?, updated_at = NOW()
              WHERE id_transferencia = ?`,
            [nuevoSaldo, nuevoEstado, orig.id_transferencia]
          );
        }
      }

      // 3. Desvincular movimientos bancarios conciliados con esta transferencia
      await conn.query(
        `UPDATE MovimientoBancario
            SET id_transferencia_interna = NULL,
                ref_tipo = NULL,
                ref_id = NULL,
                estado_conciliacion = 'POR_CONCILIAR',
                conciliado_at = NULL,
                comentario = COALESCE(comentario,'') || ?
          WHERE id_transferencia_interna = ?`,
        [`\n[Desvinculado: transferencia interna #${id} eliminada]`, id]
      );

      // 4. Borrar la fila
      await conn.query(
        `DELETE FROM TransferenciasInternas WHERE id_transferencia = ?`,
        [id]
      );

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
   * Balance neto entre Metal y Perfotools. Devuelve cuánto le debe cada
   * empresa a la otra (valorado en PEN equivalente) + serie temporal para
   * el gráfico del dashboard.
   *
   * Lógica:
   *  - Suma saldo_pendiente_pen de PRESTAMOS_INTERNOS donde origen=METAL
   *    → "Perfotools le debe a Metal" (Metal le prestó y aún no le devolvieron).
   *  - Suma saldo_pendiente_pen de PRESTAMOS_INTERNOS donde origen=PERFOTOOLS
   *    → "Metal le debe a Perfotools".
   *  - Neto = la diferencia (positivo a favor de Metal, negativo a favor de Perfo).
   */
  async getBalance() {
    const [rows]: any = await db.query(`
      SELECT empresa_origen, COUNT(*)::int AS n,
             SUM(saldo_pendiente_pen)::numeric(14,2) AS saldo_pendiente_pen
        FROM TransferenciasInternas
       WHERE tipo_movimiento = 'PRESTAMO_INTERNO'
         AND estado IN ('PENDIENTE','PARCIAL')
       GROUP BY empresa_origen
    `);
    const data = rows as any[];
    const metalLePresto    = data.find(r => r.empresa_origen === 'METAL');
    const perfoLePresto    = data.find(r => r.empresa_origen === 'PERFOTOOLS');

    const perfo_debe_a_metal = Number(metalLePresto?.saldo_pendiente_pen || 0);
    const metal_debe_a_perfo = Number(perfoLePresto?.saldo_pendiente_pen || 0);
    const neto_pen = perfo_debe_a_metal - metal_debe_a_perfo;

    // Resumen de aportes (sin retorno) por dirección
    const [aportes]: any = await db.query(`
      SELECT empresa_origen,
             SUM(
               CASE WHEN moneda_origen = 'USD'
                    THEN monto_origen::numeric * COALESCE(tipo_cambio_referencia,1)
                    ELSE monto_origen::numeric
               END
             )::numeric(14,2) AS total_pen,
             COUNT(*)::int AS n
        FROM TransferenciasInternas
       WHERE tipo_movimiento = 'APORTE_CAPITAL'
         AND estado <> 'ANULADA'
       GROUP BY empresa_origen
    `);

    // Serie temporal: flujo mensual (PRESTAMOS NETOS por mes, últimos 12)
    const [serieRows]: any = await db.query(`
      SELECT TO_CHAR(fecha, 'YYYY-MM') AS mes,
             empresa_origen,
             SUM(
               CASE WHEN moneda_origen = 'USD'
                    THEN monto_origen::numeric * COALESCE(tipo_cambio_referencia,1)
                    ELSE monto_origen::numeric
               END
             )::numeric(14,2) AS total_pen
        FROM TransferenciasInternas
       WHERE estado <> 'ANULADA'
         AND tipo_movimiento <> 'DEVOLUCION'
         AND fecha >= (CURRENT_DATE - INTERVAL '12 months')
       GROUP BY 1, 2
       ORDER BY 1, 2
    `);

    // Total diferencia de cambio acumulada (ganancia/pérdida histórica)
    const [difRow]: any = await db.query(`
      SELECT COALESCE(SUM(diferencia_cambio), 0)::numeric(14,2) AS total_diferencia_cambio_pen,
             COUNT(*) FILTER (WHERE ABS(diferencia_cambio) > 0)::int AS n_con_diferencia
        FROM TransferenciasInternas
       WHERE estado <> 'ANULADA'
    `);

    return {
      // Saldos vivos
      perfo_debe_a_metal,
      metal_debe_a_perfo,
      neto_pen,                  // > 0 = Perfo neto debe a Metal; < 0 = Metal neto debe a Perfo
      direccion_neta: neto_pen > 0.5 ? 'PERFO_DEBE_A_METAL' : neto_pen < -0.5 ? 'METAL_DEBE_A_PERFO' : 'EQUILIBRADO',

      // Aportes definitivos
      aportes: {
        metal_a_perfo: Number((aportes as any[]).find(a => a.empresa_origen === 'METAL')?.total_pen || 0),
        perfo_a_metal: Number((aportes as any[]).find(a => a.empresa_origen === 'PERFOTOOLS')?.total_pen || 0),
      },

      // Serie temporal por mes
      serie_mensual: serieRows,

      // Diferencias cambiarias acumuladas
      diferencia_cambio_acumulada: Number((difRow as any[])[0]?.total_diferencia_cambio_pen || 0),
      n_con_diferencia:            Number((difRow as any[])[0]?.n_con_diferencia || 0),
    };
  }
}

export default new TransferenciasInternasService();

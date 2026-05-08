import { db } from '../../../database/connection';

export type Casillero = 'preparado' | 'revisado' | 'autorizado';

export interface FirmaReglaInput {
  centro_costo?: string | null;
  monto_min?: number;
  monto_max?: number | null;
  firmas_requeridas: number;
  prioridad?: number;
  activo?: boolean;
  observaciones?: string | null;
}

const COLUMNAS_FIRMA: Record<Casillero, [string, string]> = {
  preparado:  ['preparado_por_id',  'preparado_at'],
  revisado:   ['revisado_por_id',   'revisado_at'],
  autorizado: ['autorizado_por_id', 'autorizado_at'],
};

/**
 * OCFirmasService — multifirma para Órdenes de Compra (mig 065).
 *
 * Flujo:
 *   BORRADOR  → (botón "Lista para aprobación") → APROBADA
 *   APROBADA  → (3 casilleros se firman) → al cumplir umbral → PAGO
 *
 * Tres casilleros: PREPARADO POR / REVISADO POR / AUTORIZADO POR. La OC
 * vive en APROBADA mientras se reúnen firmas; cuando se alcanza el umbral
 * (resuelto contra OCFirmasReglas según monto + centro de costo), se
 * mueve automáticamente a PAGO.
 *
 * BORRADOR es el sandbox de armado (líneas, totales, proveedor) — sin
 * firmas. Recién al pasar a APROBADA aparecen las cards de firma.
 *
 * Por defecto la regla #1 dice "1 firma para todo" (preserva el
 * comportamiento previo). Julio puede agregar reglas más específicas
 * desde Configuración → Reglas de firmas OC.
 */
class OCFirmasService {
  /**
   * Resuelve cuántas firmas requiere una OC según su monto + centro_costo.
   * Algoritmo: filtra reglas activas que matcheen monto y centro (=al de la
   * OC o NULL=cualquiera), ordena por prioridad descendente, devuelve la
   * primera. Si no matchea ninguna, default = 1.
   */
  async getFirmasRequeridas(id_oc: number): Promise<number> {
    const [rows]: any = await db.query(
      `SELECT total, centro_costo FROM OrdenesCompra WHERE id_oc = ?`,
      [id_oc]
    );
    const oc = rows[0];
    if (!oc) throw new Error('OC no encontrada');
    return this._resolverFirmasRequeridas(Number(oc.total), oc.centro_costo);
  }

  private async _resolverFirmasRequeridas(monto: number, centro_costo: string | null): Promise<number> {
    const [rows]: any = await db.query(
      `SELECT firmas_requeridas
         FROM OCFirmasReglas
        WHERE activo = TRUE
          AND ? >= monto_min
          AND (monto_max IS NULL OR ? <= monto_max)
          AND (centro_costo IS NULL OR centro_costo = ?)
        ORDER BY prioridad DESC, id_regla ASC
        LIMIT 1`,
      [monto, monto, centro_costo || null]
    );
    return rows[0]?.firmas_requeridas ?? 1;
  }

  /**
   * Cuenta firmas presentes en la OC.
   */
  private _contarFirmas(oc: any): number {
    let n = 0;
    if (oc.preparado_por_id)  n++;
    if (oc.revisado_por_id)   n++;
    if (oc.autorizado_por_id) n++;
    return n;
  }

  /**
   * Firma un casillero. Si tras firmar se alcanza el umbral, mueve la OC
   * automáticamente a PAGO (siguiente estado del kanban).
   *
   * Solo válido en APROBADA — en BORRADOR la OC todavía se está armando y
   * en PAGO ya se aprobó (refirmar después no tiene sentido; si se quiere
   * cambiar firmas hay que mandar a borrador primero).
   *
   * Reglas de rol por casillero:
   *   - GERENTE / APROBADOR: pueden firmar cualquier casillero (auto-aprobación válida).
   *   - USUARIO regular: solo PREPARADO POR (típico autor de la OC).
   *   - Refirmar el mismo casillero (con nuevo usuario) sobreescribe el anterior.
   */
  async firmar(id_oc: number, casillero: Casillero, id_usuario: number, rol: string, comentario?: string) {
    const [colId, colAt] = COLUMNAS_FIRMA[casillero] || [];
    if (!colId) throw new Error(`Casillero inválido: ${casillero}`);

    // Reglas de rol por casillero
    if (casillero === 'autorizado' && !['GERENTE', 'APROBADOR'].includes(rol)) {
      throw new Error('Solo GERENTE o APROBADOR pueden firmar como AUTORIZADO POR');
    }
    if (casillero === 'revisado' && !['GERENTE', 'APROBADOR'].includes(rol)) {
      throw new Error('Solo GERENTE o APROBADOR pueden firmar como REVISADO POR');
    }
    // PREPARADO POR: cualquier usuario con permiso al módulo (autor)

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT id_oc, nro_oc, estado, total, centro_costo, moneda,
                preparado_por_id, revisado_por_id, autorizado_por_id
           FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE`,
        [id_oc]
      );
      const oc = rows[0];
      if (!oc) throw new Error('OC no encontrada');
      if (oc.estado !== 'APROBADA') {
        throw new Error(`No se puede firmar — OC está en ${oc.estado}. Las firmas se hacen solo en APROBADA. Si está en BORRADOR, primero "Lista para aprobación".`);
      }

      // Setear el casillero
      await conn.query(
        `UPDATE OrdenesCompra SET ${colId} = ?, ${colAt} = NOW() WHERE id_oc = ?`,
        [id_usuario, id_oc]
      );

      // Audit log en AprobacionesOC
      const accion = `FIRMAR_${casillero.toUpperCase()}`;
      await conn.query(
        `INSERT INTO AprobacionesOC (id_oc, id_usuario, accion, comentario, monto_total_aprobado, moneda)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id_oc, id_usuario, accion, comentario || null, oc.total, oc.moneda]
      );

      // Refrescar OC para contar firmas actualizadas + ver si pasamos a PAGO
      const [fresh]: any = await conn.query(
        `SELECT preparado_por_id, revisado_por_id, autorizado_por_id, total, centro_costo
           FROM OrdenesCompra WHERE id_oc = ?`,
        [id_oc]
      );
      const fresca = fresh[0];
      const firmasActuales = this._contarFirmas(fresca);
      const firmasReq = await this._resolverFirmasRequeridas(Number(fresca.total), fresca.centro_costo);

      let estadoNuevo = 'APROBADA';
      if (firmasActuales >= firmasReq) {
        // Alcanzó umbral → PAGO. id_usuario_aprueba = último firmante.
        await conn.query(
          `UPDATE OrdenesCompra
              SET estado = 'PAGO',
                  id_usuario_aprueba = ?,
                  fecha_aprobacion = COALESCE(fecha_aprobacion, NOW())
            WHERE id_oc = ?`,
          [id_usuario, id_oc]
        );
        estadoNuevo = 'PAGO';

        // Registrar transición en historial. Best-effort (no bloquea si la
        // tabla no existe).
        try {
          await conn.query(
            `INSERT INTO OrdenCompraHistorial (id_oc, estado_anterior, estado_nuevo, id_usuario, comentario)
             VALUES (?, 'APROBADA', 'PAGO', ?, ?)`,
            [id_oc, id_usuario, `Auto: ${firmasActuales}/${firmasReq} firmas alcanzadas`]
          );
        } catch (_e) { /* tabla quizá no existe en algunos entornos */ }
      }

      await conn.commit();
      return {
        success: true,
        casillero,
        firmas_actuales: firmasActuales,
        firmas_requeridas: firmasReq,
        estado: estadoNuevo,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Quita una firma. Solo el firmante mismo o un GERENTE pueden hacerlo.
   *
   * Permitido en APROBADA y PAGO (estados donde las firmas tienen efecto).
   * Si en PAGO y al quitar caen las firmas debajo del umbral, la OC
   * retrocede a APROBADA (no a BORRADOR — el armado ya estaba completo,
   * solo falta firma faltante). En APROBADA simplemente se borra el
   * casillero sin cambiar de estado (la OC está esperando todavía firmas).
   *
   * Para estados posteriores a PAGO (RECEPCION/FACTURACION/TERMINADA): no
   * permitido — primero hay que `mandarABorrador` (que limpia firmas) o
   * volver al estado anterior con otro mecanismo.
   */
  async desfirmar(id_oc: number, casillero: Casillero, id_usuario_actor: number, rolActor: string) {
    const [colId, colAt] = COLUMNAS_FIRMA[casillero] || [];
    if (!colId) throw new Error(`Casillero inválido: ${casillero}`);

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT id_oc, estado, total, centro_costo, moneda,
                preparado_por_id, revisado_por_id, autorizado_por_id, ${colId} AS firma_id
           FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE`,
        [id_oc]
      );
      const oc = rows[0];
      if (!oc) throw new Error('OC no encontrada');
      if (!['APROBADA', 'PAGO'].includes(oc.estado)) {
        throw new Error(`No se puede quitar firma — OC en ${oc.estado}. Primero mandar a borrador.`);
      }
      if (oc.firma_id == null) {
        return { success: true, sin_cambios: true };
      }
      if (oc.firma_id !== id_usuario_actor && rolActor !== 'GERENTE') {
        throw new Error('Solo el firmante o un GERENTE puede quitar la firma');
      }

      // Limpiar el casillero
      await conn.query(
        `UPDATE OrdenesCompra SET ${colId} = NULL, ${colAt} = NULL WHERE id_oc = ?`,
        [id_oc]
      );

      await conn.query(
        `INSERT INTO AprobacionesOC (id_oc, id_usuario, accion, comentario, monto_total_aprobado, moneda)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [id_oc, id_usuario_actor, `DESFIRMAR_${casillero.toUpperCase()}`, oc.total, oc.moneda]
      );

      // Si la OC estaba en PAGO, recalcular si sigue cumpliendo umbral.
      // Si caen las firmas, retrocede a APROBADA (no a BORRADOR — el armado
      // ya estaba completo, solo falta firma).
      let estadoNuevo = oc.estado;
      if (oc.estado === 'PAGO') {
        const [fresh]: any = await conn.query(
          `SELECT preparado_por_id, revisado_por_id, autorizado_por_id, total, centro_costo
             FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]
        );
        const fresca = fresh[0];
        const firmasActuales = this._contarFirmas(fresca);
        const firmasReq = await this._resolverFirmasRequeridas(Number(fresca.total), fresca.centro_costo);
        if (firmasActuales < firmasReq) {
          await conn.query(
            `UPDATE OrdenesCompra
                SET estado = 'APROBADA',
                    id_usuario_aprueba = NULL,
                    fecha_aprobacion = NULL
              WHERE id_oc = ?`,
            [id_oc]
          );
          estadoNuevo = 'APROBADA';
          try {
            await conn.query(
              `INSERT INTO OrdenCompraHistorial (id_oc, estado_anterior, estado_nuevo, id_usuario, comentario)
               VALUES (?, 'PAGO', 'APROBADA', ?, ?)`,
              [id_oc, id_usuario_actor, `Auto: firmas cayeron a ${firmasActuales}/${firmasReq}`]
            );
          } catch (_e) {}
        }
      }

      await conn.commit();
      return { success: true, casillero, estado: estadoNuevo };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ── CRUD de reglas (solo GERENTE) ───────────────────────────────

  async listarReglas() {
    const [rows]: any = await db.query(
      `SELECT * FROM OCFirmasReglas ORDER BY prioridad DESC, id_regla ASC`
    );
    return rows;
  }

  async crearRegla(data: FirmaReglaInput) {
    if (!data.firmas_requeridas || data.firmas_requeridas < 1 || data.firmas_requeridas > 3) {
      throw new Error('firmas_requeridas debe ser 1, 2 o 3');
    }
    const [r]: any = await db.query(
      `INSERT INTO OCFirmasReglas
         (centro_costo, monto_min, monto_max, firmas_requeridas, prioridad, activo, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id_regla`,
      [
        data.centro_costo || null,
        data.monto_min ?? 0,
        data.monto_max ?? null,
        data.firmas_requeridas,
        data.prioridad ?? 0,
        data.activo !== false,
        data.observaciones || null,
      ]
    );
    return { success: true, id_regla: r[0]?.id_regla || r.insertId };
  }

  async editarRegla(id_regla: number, data: FirmaReglaInput) {
    if (data.firmas_requeridas != null && (data.firmas_requeridas < 1 || data.firmas_requeridas > 3)) {
      throw new Error('firmas_requeridas debe ser 1, 2 o 3');
    }
    const sets: string[] = [];
    const vals: any[] = [];
    const FIELDS: (keyof FirmaReglaInput)[] = [
      'centro_costo', 'monto_min', 'monto_max',
      'firmas_requeridas', 'prioridad', 'activo', 'observaciones',
    ];
    for (const f of FIELDS) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(data[f] === '' ? null : data[f]);
      }
    }
    if (!sets.length) return { success: true, sin_cambios: true };
    sets.push(`updated_at = NOW()`);
    vals.push(id_regla);
    await db.query(
      `UPDATE OCFirmasReglas SET ${sets.join(', ')} WHERE id_regla = ?`,
      vals
    );
    return { success: true };
  }

  async eliminarRegla(id_regla: number) {
    await db.query(`DELETE FROM OCFirmasReglas WHERE id_regla = ?`, [id_regla]);
    return { success: true };
  }
}

export default new OCFirmasService();

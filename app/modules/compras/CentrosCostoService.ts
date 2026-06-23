import { db } from '../../../database/connection';

// Largo máximo del nombre de un centro de costo. El nombre se propaga como
// `centro_costo` a OrdenesCompra, Gastos, Compras, Rendiciones y OCFirmasReglas,
// todas VARCHAR(100) (ver migración 074). Si el nombre lo supera, se guarda en
// el maestro pero revienta al crear la OC con "value too long for varchar". Lo
// limitamos acá para dar un error claro en vez del críptico de Postgres.
export const CC_NOMBRE_MAX = 100;

/**
 * CentrosCostoService — maestro de centros de costo.
 * Tipos: OFICINA (Oficina Central, Marketing) / PROYECTO (proyectos cliente)
 *        ALMACEN (almacenes físicos) / OTRO.
 */
class CentrosCostoService {

  async listar(soloActivos = false) {
    const where = soloActivos ? "WHERE cc.activo = TRUE" : '';
    const [rows] = await db.query(`
      SELECT cc.id_centro_costo, cc.nombre, cc.tipo, cc.descripcion, cc.activo,
             cc.created_at, cc.updated_at,
             cc.id_cotizacion,
             cot.nro_cotizacion AS cotizacion_nro,
             cot.cliente         AS cotizacion_cliente,
             cot.proyecto        AS cotizacion_proyecto,
             cot.estado          AS cotizacion_estado,
             cot.marca           AS cotizacion_marca,
             cot.moneda          AS cotizacion_moneda,
             cot.tipo_cambio     AS cotizacion_tc
      FROM CentrosCosto cc
      LEFT JOIN Cotizaciones cot ON cot.id_cotizacion = cc.id_cotizacion
      ${where}
      ORDER BY cc.tipo, cc.nombre
    `);
    return rows;
  }

  async crear(data: { nombre?: string; tipo?: string; descripcion?: string; id_cotizacion?: number | null }) {
    const tipo = (data.tipo || 'OTRO').toUpperCase();
    if (!['OFICINA', 'PROYECTO', 'ALMACEN', 'OTRO'].includes(tipo)) {
      throw new Error('Tipo inválido. Debe ser OFICINA, PROYECTO, ALMACEN u OTRO');
    }

    let nombre = (data.nombre || '').trim().toUpperCase();
    const nombreEsManual = nombre.length > 0;
    let id_cotizacion: number | null = data.id_cotizacion ? Number(data.id_cotizacion) : null;

    // Si viene una cotización vinculada, auto-armar el nombre desde sus datos
    // (formato: "<PROYECTO> · <CLIENTE>" o "<NRO_COT> · <CLIENTE>" si no hay proyecto).
    if (id_cotizacion) {
      const [c]: any = await db.query(
        `SELECT nro_cotizacion, cliente, proyecto, estado FROM Cotizaciones WHERE id_cotizacion = ?`,
        [id_cotizacion]
      );
      const cot = (c as any[])[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (!['APROBADA', 'TRABAJO_EN_RIESGO'].includes(cot.estado)) {
        throw new Error('Solo se puede vincular cotizaciones APROBADAS o TRABAJO_EN_RIESGO');
      }
      // Si el usuario NO envió nombre, lo generamos. Si envió uno, respetamos su decisión.
      if (!nombre) {
        const cliente = (cot.cliente || '').trim();
        const proyecto = (cot.proyecto || '').trim();
        nombre = proyecto
          ? `${proyecto} · ${cliente}`.toUpperCase()
          : `${cot.nro_cotizacion} · ${cliente}`.toUpperCase();
      }
    }

    if (!nombre) throw new Error('Nombre de centro de costo requerido (o vincular una cotización con proyecto definido)');

    // Guard de longitud (ver CC_NOMBRE_MAX). Si el usuario tipeó un nombre muy
    // largo, error claro. Si es auto-generado desde la cotización, truncamos
    // para no bloquear el flujo (el nombre largo igual no cabe en la OC).
    if (nombre.length > CC_NOMBRE_MAX) {
      if (nombreEsManual) {
        throw new Error(`El nombre del centro de costo no puede superar ${CC_NOMBRE_MAX} caracteres (tiene ${nombre.length}). Acortalo — se usa como referencia en cada orden de compra.`);
      }
      nombre = nombre.slice(0, CC_NOMBRE_MAX).trim();
    }

    const [res]: any = await db.query(
      `INSERT INTO CentrosCosto (nombre, tipo, descripcion, id_cotizacion)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (nombre) DO UPDATE SET
         tipo          = EXCLUDED.tipo,
         descripcion   = COALESCE(EXCLUDED.descripcion, CentrosCosto.descripcion),
         id_cotizacion = COALESCE(EXCLUDED.id_cotizacion, CentrosCosto.id_cotizacion),
         updated_at    = NOW()
       RETURNING id_centro_costo, nombre, tipo, descripcion, id_cotizacion, activo`,
      [nombre, tipo, data.descripcion || null, id_cotizacion]
    );
    return (res as any).rows?.[0] || { id_centro_costo: (res as any).insertId, nombre, tipo };
  }

  // ─── Picker: cotizaciones aptas para vincular a un centro de costo ────
  // Regla de negocio (sesión 13/05/2026):
  //   - Las APROBADAS solo aparecen si YA tienen cobranza > 0 (fondeada
  //     parcial o total). Sin cobranza = todavía no es "trabajo real".
  //   - Las TRABAJO_EN_RIESGO siempre aparecen (asumimos costos sin tener
  //     pago confirmado del cliente).
  //   - Excluye TERMINADA, ANULADA, RECHAZADA, NO_APROBADA y las ya
  //     vinculadas a otro centro de costo.
  // Fuente de la regla: Finanzas dicta qué proyectos están "activos para
  // gastar". Logística solo crea CCs sobre proyectos validados acá.
  async getCotizacionesDisponibles() {
    const [rows] = await db.query(`
      SELECT c.id_cotizacion, c.nro_cotizacion, c.cliente, c.proyecto,
             c.estado, c.moneda, c.total, c.marca,
             COALESCE(c.monto_cobrado_banco, 0) + COALESCE(c.monto_cobrado_detraccion, 0) AS cobrado_total
      FROM Cotizaciones c
      WHERE c.estado NOT IN ('ANULADA', 'RECHAZADA', 'NO_APROBADA', 'TERMINADA')
        AND (
          c.estado = 'TRABAJO_EN_RIESGO'
          OR (COALESCE(c.monto_cobrado_banco, 0) + COALESCE(c.monto_cobrado_detraccion, 0)) > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM CentrosCosto cc WHERE cc.id_cotizacion = c.id_cotizacion
        )
      ORDER BY c.fecha DESC, c.id_cotizacion DESC
    `);
    return rows;
  }

  // ─── Rename con propagación a OCs/Gastos/Compras ──────────────────────
  // Preview: cuántos registros se verían afectados si renombramos.
  async getImpactoRename(id: number, nombreNuevo: string) {
    const [info]: any = await db.query(
      'SELECT nombre FROM CentrosCosto WHERE id_centro_costo = ?', [id]
    );
    const fila = (info as any[])[0];
    if (!fila) throw new Error('Centro de costo no encontrado');
    const nombreActual = fila.nombre;
    const nombreFinal = (nombreNuevo || '').trim().toUpperCase();
    if (!nombreFinal) throw new Error('El nombre nuevo no puede estar vacío');
    if (nombreFinal.length > CC_NOMBRE_MAX) {
      throw new Error(`El nombre del centro de costo no puede superar ${CC_NOMBRE_MAX} caracteres (tiene ${nombreFinal.length}). Acortalo — se usa como referencia en cada orden de compra.`);
    }

    // ¿Existe otro centro con el nombre destino? (Colisión)
    const [col]: any = await db.query(
      'SELECT id_centro_costo FROM CentrosCosto WHERE UPPER(nombre) = ? AND id_centro_costo <> ?',
      [nombreFinal, id]
    );
    if ((col as any[]).length > 0) {
      throw new Error(`Ya existe otro centro de costo con el nombre "${nombreFinal}". Elegí otro nombre.`);
    }

    const [oc]: any = await db.query(
      'SELECT COUNT(*)::int AS n FROM OrdenesCompra WHERE UPPER(centro_costo) = ?', [nombreActual]
    );
    const [gs]: any = await db.query(
      'SELECT COUNT(*)::int AS n FROM Gastos WHERE UPPER(centro_costo) = ?', [nombreActual]
    );
    const [co]: any = await db.query(
      'SELECT COUNT(*)::int AS n FROM Compras WHERE UPPER(centro_costo) = ?', [nombreActual]
    );

    return {
      nombre_actual: nombreActual,
      nombre_nuevo: nombreFinal,
      cambio: nombreActual !== nombreFinal,
      afectados_oc:      (oc as any[])[0]?.n || 0,
      afectados_gastos:  (gs as any[])[0]?.n || 0,
      afectados_compras: (co as any[])[0]?.n || 0,
    };
  }

  /**
   * Renombra el centro y propaga a las 3 tablas que guardan el nombre como
   * texto libre. Transacción atómica — todo o nada. Captura el estado previo
   * en log para audit/rollback manual si hiciera falta.
   */
  async renombrarConPropagacion(id: number, nombreNuevo: string, id_usuario: number | null = null) {
    const impacto = await this.getImpactoRename(id, nombreNuevo);
    if (!impacto.cambio) {
      return { success: true, sin_cambios: true, ...impacto };
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Renombrar el centro en su propia tabla
      await conn.query(
        `UPDATE CentrosCosto SET nombre = ?, updated_at = NOW() WHERE id_centro_costo = ?`,
        [impacto.nombre_nuevo, id]
      );

      // 2. Propagar a OrdenesCompra, Gastos y Compras
      await conn.query(
        `UPDATE OrdenesCompra SET centro_costo = ? WHERE UPPER(centro_costo) = ?`,
        [impacto.nombre_nuevo, impacto.nombre_actual]
      );
      await conn.query(
        `UPDATE Gastos SET centro_costo = ? WHERE UPPER(centro_costo) = ?`,
        [impacto.nombre_nuevo, impacto.nombre_actual]
      );
      await conn.query(
        `UPDATE Compras SET centro_costo = ? WHERE UPPER(centro_costo) = ?`,
        [impacto.nombre_nuevo, impacto.nombre_actual]
      );

      // 3. Audit log (best-effort — si la tabla Auditoria no existe, no romper).
      // La tabla Auditoria NO tiene columna `descripcion`; el detalle va en
      // datos_despues (JSON) y el id del CC en entidad_id.
      try {
        await conn.query(
          `INSERT INTO Auditoria (id_usuario, entidad, entidad_id, accion, datos_despues)
           VALUES (?, 'CentroCosto', ?, 'UPDATE', ?)`,
          [
            id_usuario,
            String(id),
            JSON.stringify({
              accion: 'renombrar',
              nombre_anterior: impacto.nombre_actual,
              nombre_nuevo: impacto.nombre_nuevo,
              propagado: {
                ocs: impacto.afectados_oc,
                gastos: impacto.afectados_gastos,
                compras: impacto.afectados_compras,
              },
            }),
          ]
        );
      } catch (_) { /* tabla puede no existir */ }

      await conn.commit();
      return { success: true, ...impacto };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ─── Huérfanos: centro_costo en OCs que NO existe en CentrosCosto ─────
  async getHuerfanos() {
    const [rows] = await db.query(`
      SELECT centro_costo AS nombre, SUM(usos)::int AS usos, MIN(fuente) AS fuente_ejemplo
      FROM (
        SELECT centro_costo, COUNT(*)::int AS usos, 'OC'::text AS fuente FROM OrdenesCompra
          WHERE centro_costo IS NOT NULL AND centro_costo <> ''
            AND NOT EXISTS (SELECT 1 FROM CentrosCosto cc WHERE UPPER(cc.nombre) = UPPER(centro_costo))
          GROUP BY centro_costo
        UNION ALL
        SELECT centro_costo, COUNT(*)::int, 'Gastos' FROM Gastos
          WHERE centro_costo IS NOT NULL AND centro_costo <> ''
            AND NOT EXISTS (SELECT 1 FROM CentrosCosto cc WHERE UPPER(cc.nombre) = UPPER(centro_costo))
          GROUP BY centro_costo
        UNION ALL
        SELECT centro_costo, COUNT(*)::int, 'Compras' FROM Compras
          WHERE centro_costo IS NOT NULL AND centro_costo <> ''
            AND NOT EXISTS (SELECT 1 FROM CentrosCosto cc WHERE UPPER(cc.nombre) = UPPER(centro_costo))
          GROUP BY centro_costo
      ) x
      GROUP BY centro_costo
      ORDER BY usos DESC, centro_costo
    `);
    return rows;
  }

  /**
   * Regulariza un huérfano: crea un registro formal en CentrosCosto con ese
   * nombre. El tipo por defecto es PROYECTO (caso típico). Opcionalmente se
   * puede vincular a una cotización al mismo tiempo.
   */
  async regularizarHuerfano(data: { nombre: string; tipo?: string; id_cotizacion?: number | null; descripcion?: string }) {
    const nombre = (data.nombre || '').trim().toUpperCase();
    if (!nombre) throw new Error('Nombre del huérfano requerido');
    // Verificar que efectivamente sea huérfano
    const [existe]: any = await db.query(
      `SELECT id_centro_costo FROM CentrosCosto WHERE UPPER(nombre) = ?`, [nombre]
    );
    if ((existe as any[]).length > 0) {
      throw new Error(`Ya existe un centro de costo con ese nombre. No es huérfano.`);
    }
    // Crear (reutiliza la lógica de crear, no auto-genera nombre)
    return this.crear({
      nombre,
      tipo: data.tipo || 'PROYECTO',
      descripcion: data.descripcion || 'Regularizado desde uso suelto en OCs',
      id_cotizacion: data.id_cotizacion || null,
    });
  }

  async actualizar(id: number, data: { nombre?: string; tipo?: string; descripcion?: string; activo?: boolean }) {
    const cur: any = await db.query('SELECT nombre, tipo, descripcion, activo FROM CentrosCosto WHERE id_centro_costo = ?', [id]);
    const fila = (cur[0] as any[])[0];
    if (!fila) throw new Error('Centro de costo no encontrado');
    await db.query(
      `UPDATE CentrosCosto
         SET nombre = ?, tipo = ?, descripcion = ?, activo = ?, updated_at = NOW()
       WHERE id_centro_costo = ?`,
      [
        (data.nombre ?? fila.nombre).trim().toUpperCase(),
        (data.tipo ?? fila.tipo).toUpperCase(),
        data.descripcion !== undefined ? data.descripcion : fila.descripcion,
        data.activo !== undefined ? !!data.activo : fila.activo,
        id,
      ]
    );
    return { success: true };
  }

  async eliminar(id: number) {
    // Verificar uso en OrdenesCompra y Gastos antes de borrar
    const [info]: any = await db.query('SELECT nombre FROM CentrosCosto WHERE id_centro_costo = ?', [id]);
    const fila = (info as any[])[0];
    if (!fila) throw new Error('Centro de costo no encontrado');

    const [usoOC]: any = await db.query(
      'SELECT COUNT(*)::int AS n FROM OrdenesCompra WHERE UPPER(centro_costo) = ?',
      [fila.nombre]
    );
    const [usoGastos]: any = await db.query(
      'SELECT COUNT(*)::int AS n FROM Gastos WHERE UPPER(centro_costo) = ?',
      [fila.nombre]
    );
    const usado = ((usoOC as any[])[0]?.n || 0) + ((usoGastos as any[])[0]?.n || 0);
    if (usado > 0) {
      // No se puede borrar — desactivar en su lugar
      await db.query(
        'UPDATE CentrosCosto SET activo = FALSE, updated_at = NOW() WHERE id_centro_costo = ?',
        [id]
      );
      return { success: true, desactivado: true, registros_asociados: usado };
    }
    await db.query('DELETE FROM CentrosCosto WHERE id_centro_costo = ?', [id]);
    return { success: true, eliminado: true };
  }

  /**
   * Resumen por centro de costo: cantidad de OCs y monto consumido.
   * Útil para dashboards y para decidir prioridades.
   */
  async resumen(anio?: number) {
    const filtroAnio = anio ? `AND EXTRACT(YEAR FROM oc.fecha_emision) = ${anio}` : '';
    const [rows] = await db.query(`
      SELECT cc.id_centro_costo, cc.nombre, cc.tipo, cc.activo,
        COALESCE(stats.cantidad_ocs, 0)::int AS cantidad_ocs,
        COALESCE(stats.monto_total, 0)::numeric(14,2) AS monto_total,
        stats.ultima_fecha
      FROM CentrosCosto cc
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cantidad_ocs,
               SUM(CASE WHEN oc.moneda='PEN' THEN oc.total ELSE oc.total * oc.tipo_cambio END) AS monto_total,
               MAX(oc.fecha_emision) AS ultima_fecha
        FROM OrdenesCompra oc
        WHERE UPPER(oc.centro_costo) = cc.nombre
          AND oc.estado != 'ANULADA'
          ${filtroAnio}
      ) stats ON TRUE
      ORDER BY cc.tipo, cc.nombre
    `);
    return rows;
  }
}

export default new CentrosCostoService();

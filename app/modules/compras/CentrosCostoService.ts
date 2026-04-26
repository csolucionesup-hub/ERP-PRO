import { db } from '../../../database/connection';

/**
 * CentrosCostoService — maestro de centros de costo.
 * Tipos: OFICINA (Oficina Central, Marketing) / PROYECTO (proyectos cliente)
 *        ALMACEN (almacenes físicos) / OTRO.
 */
class CentrosCostoService {

  async listar(soloActivos = false) {
    const where = soloActivos ? "WHERE activo = TRUE" : '';
    const [rows] = await db.query(`
      SELECT id_centro_costo, nombre, tipo, descripcion, activo, created_at, updated_at
      FROM CentrosCosto
      ${where}
      ORDER BY tipo, nombre
    `);
    return rows;
  }

  async crear(data: { nombre: string; tipo?: string; descripcion?: string }) {
    const nombre = data.nombre.trim().toUpperCase();
    if (!nombre) throw new Error('Nombre de centro de costo requerido');
    const tipo = (data.tipo || 'OTRO').toUpperCase();
    if (!['OFICINA', 'PROYECTO', 'ALMACEN', 'OTRO'].includes(tipo)) {
      throw new Error('Tipo inválido. Debe ser OFICINA, PROYECTO, ALMACEN u OTRO');
    }
    const [res]: any = await db.query(
      `INSERT INTO CentrosCosto (nombre, tipo, descripcion)
       VALUES (?, ?, ?)
       ON CONFLICT (nombre) DO UPDATE SET
         tipo        = EXCLUDED.tipo,
         descripcion = COALESCE(EXCLUDED.descripcion, CentrosCosto.descripcion),
         updated_at  = NOW()
       RETURNING id_centro_costo, nombre, tipo, descripcion, activo`,
      [nombre, tipo, data.descripcion || null]
    );
    return (res as any).rows?.[0] || { id_centro_costo: (res as any).insertId, nombre, tipo };
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

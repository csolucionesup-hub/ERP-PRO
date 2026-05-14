import { db } from '../../../database/connection';

/**
 * ContraparteService — maestro único de contrapartes para préstamos.
 *
 * Una contraparte es una persona, empresa o banco con quien la empresa
 * tiene relación financiera. Pensada inicialmente para Préstamos (mig 071)
 * pero está modelada de forma reutilizable: a futuro puede usarse como
 * base de Clientes / Proveedores externos sin duplicar entradas.
 *
 * Casos típicos:
 *   - Jorge Roman Hurtado (PERSONA, DNI) — toma prestado de la empresa
 *   - Banco BCP (BANCO, RUC) — fuente de financiamiento corporativo
 *   - Promafa SAC (EMPRESA, RUC) — cliente que también pide adelantos
 *
 * Sesión 14/05/2026. Mig 071.
 */
class ContraparteService {
  /**
   * Listado completo, opcionalmente solo activos.
   * Incluye stats agregadas de préstamos para tooltips/dashboard:
   *   - n_tomados / total_tomado (en PEN equivalente)
   *   - n_otorgados / total_otorgado
   */
  async listar(soloActivos = false) {
    const where = soloActivos ? 'WHERE c.activo = TRUE' : '';
    const [rows] = await db.query(`
      SELECT c.id_contraparte, c.nombre, c.tipo, c.documento_tipo, c.documento_numero,
             c.telefono, c.email, c.notas, c.activo, c.created_at,
             COALESCE(t.n_tomados, 0)::int        AS n_tomados,
             COALESCE(t.total_tomado, 0)::numeric AS total_tomado,
             COALESCE(t.saldo_tomado, 0)::numeric AS saldo_tomado,
             COALESCE(o.n_otorgados, 0)::int        AS n_otorgados,
             COALESCE(o.total_otorgado, 0)::numeric AS total_otorgado,
             COALESCE(o.saldo_otorgado, 0)::numeric AS saldo_otorgado
        FROM Contrapartes c
        LEFT JOIN (
          SELECT id_contraparte,
                 COUNT(*)                                                     AS n_tomados,
                 SUM(monto_total::numeric * COALESCE(tipo_cambio,1))          AS total_tomado,
                 SUM(saldo::numeric       * COALESCE(tipo_cambio,1))          AS saldo_tomado
            FROM PrestamosTomados
           WHERE estado <> 'ANULADO' AND id_contraparte IS NOT NULL
           GROUP BY id_contraparte
        ) t ON t.id_contraparte = c.id_contraparte
        LEFT JOIN (
          SELECT id_contraparte,
                 COUNT(*)                                                     AS n_otorgados,
                 SUM(monto_total::numeric * COALESCE(tipo_cambio,1))          AS total_otorgado,
                 SUM(saldo::numeric       * COALESCE(tipo_cambio,1))          AS saldo_otorgado
            FROM PrestamosOtorgados
           WHERE estado <> 'ANULADO' AND id_contraparte IS NOT NULL
           GROUP BY id_contraparte
        ) o ON o.id_contraparte = c.id_contraparte
        ${where}
       ORDER BY c.nombre
    `);
    return rows;
  }

  async obtener(id: number) {
    const [rows]: any = await db.query(
      `SELECT * FROM Contrapartes WHERE id_contraparte = ?`, [id]
    );
    const c = (rows as any[])[0];
    if (!c) throw new Error('Contraparte no encontrada');
    return c;
  }

  async crear(data: {
    nombre: string;
    tipo?: 'PERSONA' | 'EMPRESA' | 'BANCO' | 'OTRO';
    documento_tipo?: string;
    documento_numero?: string;
    telefono?: string;
    email?: string;
    notas?: string;
  }) {
    const nombre = String(data.nombre || '').trim();
    if (!nombre) throw new Error('Nombre requerido');
    const tipo = (data.tipo || 'OTRO').toUpperCase();
    if (!['PERSONA','EMPRESA','BANCO','OTRO'].includes(tipo)) {
      throw new Error('tipo inválido. Usar: PERSONA, EMPRESA, BANCO, OTRO');
    }

    // Defensa contra duplicado por nombre normalizado (el UNIQUE INDEX también
    // lo bloquea, pero acá damos error legible antes).
    const [exist]: any = await db.query(
      `SELECT id_contraparte, nombre FROM Contrapartes WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(?))`,
      [nombre]
    );
    if ((exist as any[]).length) {
      const e = (exist as any[])[0];
      throw new Error(`Ya existe una contraparte con ese nombre: "${e.nombre}" (id ${e.id_contraparte})`);
    }

    const [res]: any = await db.query(
      `INSERT INTO Contrapartes
         (nombre, tipo, documento_tipo, documento_numero, telefono, email, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id_contraparte, nombre, tipo`,
      [nombre, tipo,
       data.documento_tipo || null, data.documento_numero || null,
       data.telefono || null, data.email || null, data.notas || null]
    );
    return (res as any).rows?.[0] || { id_contraparte: (res as any).insertId, nombre, tipo };
  }

  async actualizar(id: number, data: {
    nombre?: string;
    tipo?: string;
    documento_tipo?: string;
    documento_numero?: string;
    telefono?: string;
    email?: string;
    notas?: string;
    activo?: boolean;
  }) {
    const fields: (keyof typeof data)[] = [
      'nombre', 'tipo', 'documento_tipo', 'documento_numero',
      'telefono', 'email', 'notas', 'activo'
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(data[f] === '' ? null : data[f]);
      }
    }
    if (!sets.length) return { success: true, sin_cambios: true };
    sets.push('updated_at = NOW()');
    vals.push(id);
    await db.query(`UPDATE Contrapartes SET ${sets.join(', ')} WHERE id_contraparte = ?`, vals);
    return { success: true };
  }

  async eliminar(id: number) {
    // Bloquear si tiene préstamos vinculados (ON DELETE SET NULL los desvincula,
    // pero perdemos trazabilidad — preferimos error explícito que el usuario
    // resuelva manualmente).
    const [usos]: any = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM PrestamosTomados   WHERE id_contraparte = ?) AS n_tomados,
         (SELECT COUNT(*)::int FROM PrestamosOtorgados WHERE id_contraparte = ?) AS n_otorgados`,
      [id, id]
    );
    const u = (usos as any[])[0] || { n_tomados: 0, n_otorgados: 0 };
    if (u.n_tomados > 0 || u.n_otorgados > 0) {
      throw new Error(
        `No se puede eliminar: tiene ${u.n_tomados} préstamo(s) tomado(s) y ` +
        `${u.n_otorgados} préstamo(s) otorgado(s) vinculados. Desactivá en su lugar.`
      );
    }
    await db.query(`DELETE FROM Contrapartes WHERE id_contraparte = ?`, [id]);
    return { success: true };
  }

  /**
   * Dashboard agregado por contraparte — fuente de los gráficos del
   * módulo Préstamos. Devuelve top contrapartes en montos + breakdown
   * de préstamos individuales para vista detalle expandible.
   *
   * Filtro opcional por empresa (METAL/PERFOTOOLS) para "cuánto debe Metal
   * a esta persona".
   */
  async getResumenContrapartes(filtros: {
    empresa?: 'METAL' | 'PERFOTOOLS';
    tipo?: 'tomados' | 'otorgados';
  } = {}) {
    const empresaCond = filtros.empresa
      ? `AND empresa = '${filtros.empresa}'`
      : '';

    // Resumen por contraparte: total y saldo (en PEN equivalente)
    // Si filtro tipo no se pasa, se calculan los 2 lados separados.
    const incluirTomados   = !filtros.tipo || filtros.tipo === 'tomados';
    const incluirOtorgados = !filtros.tipo || filtros.tipo === 'otorgados';

    const [rows]: any = await db.query(`
      SELECT c.id_contraparte, c.nombre, c.tipo, c.documento_tipo, c.documento_numero,
             ${incluirTomados ? `
             COALESCE((
               SELECT SUM(monto_total::numeric * COALESCE(tipo_cambio,1))
                 FROM PrestamosTomados
                WHERE id_contraparte = c.id_contraparte
                  AND estado <> 'ANULADO' ${empresaCond}
             ), 0)::numeric AS total_tomado,
             COALESCE((
               SELECT SUM(saldo::numeric * COALESCE(tipo_cambio,1))
                 FROM PrestamosTomados
                WHERE id_contraparte = c.id_contraparte
                  AND estado <> 'ANULADO' ${empresaCond}
             ), 0)::numeric AS saldo_tomado,
             COALESCE((
               SELECT COUNT(*)::int
                 FROM PrestamosTomados
                WHERE id_contraparte = c.id_contraparte
                  AND estado <> 'ANULADO' ${empresaCond}
             ), 0) AS n_tomados,
             ` : '0 AS total_tomado, 0 AS saldo_tomado, 0 AS n_tomados,'}
             ${incluirOtorgados ? `
             COALESCE((
               SELECT SUM(monto_total::numeric * COALESCE(tipo_cambio,1))
                 FROM PrestamosOtorgados
                WHERE id_contraparte = c.id_contraparte
                  AND estado <> 'ANULADO' ${empresaCond}
             ), 0)::numeric AS total_otorgado,
             COALESCE((
               SELECT SUM(saldo::numeric * COALESCE(tipo_cambio,1))
                 FROM PrestamosOtorgados
                WHERE id_contraparte = c.id_contraparte
                  AND estado <> 'ANULADO' ${empresaCond}
             ), 0)::numeric AS saldo_otorgado,
             COALESCE((
               SELECT COUNT(*)::int
                 FROM PrestamosOtorgados
                WHERE id_contraparte = c.id_contraparte
                  AND estado <> 'ANULADO' ${empresaCond}
             ), 0) AS n_otorgados
             ` : '0 AS total_otorgado, 0 AS saldo_otorgado, 0 AS n_otorgados'}
        FROM Contrapartes c
       WHERE c.activo = TRUE
       ORDER BY c.nombre
    `);

    const all = (rows as any[])
      .map(r => ({
        ...r,
        total_tomado:   Number(r.total_tomado)   || 0,
        saldo_tomado:   Number(r.saldo_tomado)   || 0,
        total_otorgado: Number(r.total_otorgado) || 0,
        saldo_otorgado: Number(r.saldo_otorgado) || 0,
        total_general:  (Number(r.total_tomado) || 0) + (Number(r.total_otorgado) || 0),
        saldo_general:  (Number(r.saldo_tomado) || 0) + (Number(r.saldo_otorgado) || 0),
      }))
      // Solo contrapartes que efectivamente tienen al menos 1 préstamo
      .filter(r => r.n_tomados + r.n_otorgados > 0);

    // Top 5 por saldo pendiente (más relevante operativamente que total)
    const top5 = [...all]
      .sort((a, b) => b.saldo_general - a.saldo_general)
      .slice(0, 5);

    return {
      contrapartes: all,
      top5,
      totales: {
        n_contrapartes:     all.length,
        total_tomado:       all.reduce((s, r) => s + r.total_tomado, 0),
        saldo_tomado:       all.reduce((s, r) => s + r.saldo_tomado, 0),
        total_otorgado:     all.reduce((s, r) => s + r.total_otorgado, 0),
        saldo_otorgado:     all.reduce((s, r) => s + r.saldo_otorgado, 0),
      },
    };
  }
}

export default new ContraparteService();

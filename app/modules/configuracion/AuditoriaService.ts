import { db } from '../../../database/connection';

export type AuditAccion =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'ANULAR'
  | 'LOGIN' | 'LOGOUT' | 'CONFIG' | 'EXPORT' | 'EMIT';

export interface LogEntry {
  id_usuario?: number;
  nombre_usuario?: string;
  accion: AuditAccion;
  entidad: string;
  entidad_id?: string | number | null;
  datos_antes?: any;
  datos_despues?: any;
  ip?: string;
  user_agent?: string;
}

export interface AuditoriaFiltro {
  entidad?: string;
  entidad_id?: string;
  id_usuario?: number;
  accion?: AuditAccion;
  desde?: string; // YYYY-MM-DD
  hasta?: string;
  limit?: number;
}

class AuditoriaService {
  /**
   * Fire-and-forget: si falla, NO rompe la operación principal — solo log a consola.
   */
  async log(entry: LogEntry): Promise<void> {
    try {
      await db.query(
        `INSERT INTO Auditoria
         (id_usuario, nombre_usuario, accion, entidad, entidad_id, datos_antes, datos_despues, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id_usuario ?? null,
          entry.nombre_usuario ?? null,
          entry.accion,
          entry.entidad,
          entry.entidad_id != null ? String(entry.entidad_id) : null,
          entry.datos_antes ? JSON.stringify(entry.datos_antes) : null,
          entry.datos_despues ? JSON.stringify(entry.datos_despues) : null,
          entry.ip ?? null,
          entry.user_agent ? entry.user_agent.slice(0, 300) : null,
        ]
      );
    } catch (e) {
      console.error('[AuditoriaService.log] fallo silencioso:', (e as Error).message);
    }
  }

  async query(f: AuditoriaFiltro = {}): Promise<any[]> {
    const where: string[] = [];
    const vals: any[] = [];
    if (f.entidad)    { where.push('entidad = ?');    vals.push(f.entidad); }
    if (f.entidad_id) { where.push('entidad_id = ?'); vals.push(f.entidad_id); }
    if (f.id_usuario) { where.push('id_usuario = ?'); vals.push(f.id_usuario); }
    if (f.accion)     { where.push('accion = ?');     vals.push(f.accion); }
    if (f.desde)      { where.push('fecha >= ?');     vals.push(f.desde); }
    if (f.hasta)      { where.push('fecha <= ?');     vals.push(f.hasta); }
    const sql =
      `SELECT * FROM Auditoria ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY fecha DESC LIMIT ?`;
    vals.push(f.limit ?? 200);
    const [rows] = await db.query(sql, vals);
    return rows as any[];
  }
}

export default new AuditoriaService();

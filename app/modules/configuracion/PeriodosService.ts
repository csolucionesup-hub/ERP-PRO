import { db } from '../../../database/connection';

export type EstadoPeriodo = 'ABIERTO' | 'CERRADO' | 'BLOQUEADO';

export interface PeriodoContable {
  id: number;
  anio: number;
  mes: number;
  estado: EstadoPeriodo;
  fecha_cierre: string | null;
  id_usuario_cierre: number | null;
  observaciones: string | null;
}

/**
 * PeriodosService — gestión de periodos contables abiertos/cerrados.
 *
 * Regla: no se deben permitir mutaciones en periodos cerrados, salvo que
 * el GERENTE reabra el periodo explícitamente (lo cual queda en Auditoría).
 */
class PeriodosService {
  /**
   * Obtiene el estado del periodo correspondiente a una fecha.
   * Si no existe en BD, devuelve ABIERTO (fail-safe).
   */
  async getEstado(fecha: string): Promise<EstadoPeriodo> {
    if (!fecha || typeof fecha !== 'string') return 'ABIERTO';
    const parts = fecha.split('-');
    if (parts.length < 2) return 'ABIERTO';
    const anio = Number(parts[0]);
    const mes  = Number(parts[1]);
    if (!anio || !mes || mes < 1 || mes > 12) return 'ABIERTO';
    const [rows] = await db.query(
      'SELECT estado FROM PeriodosContables WHERE anio=? AND mes=?', [anio, mes]
    );
    const p = (rows as any[])[0];
    return (p?.estado as EstadoPeriodo) ?? 'ABIERTO';
  }

  async cerrar(anio: number, mes: number, id_usuario: number, observaciones?: string) {
    await db.query(
      `UPDATE PeriodosContables SET estado='CERRADO', fecha_cierre=NOW(),
       id_usuario_cierre=?, observaciones=? WHERE anio=? AND mes=?`,
      [id_usuario, observaciones ?? null, anio, mes]
    );
    return { success: true };
  }

  async reabrir(anio: number, mes: number, id_usuario: number) {
    await db.query(
      `UPDATE PeriodosContables SET estado='ABIERTO', fecha_cierre=NULL,
       id_usuario_cierre=? WHERE anio=? AND mes=?`,
      [id_usuario, anio, mes]
    );
    return { success: true };
  }

  async list(anio?: number): Promise<PeriodoContable[]> {
    const [rows] = await db.query(
      `SELECT * FROM PeriodosContables ${anio ? 'WHERE anio=?' : ''} ORDER BY anio DESC, mes DESC`,
      anio ? [anio] : []
    );
    return rows as PeriodoContable[];
  }
}

export default new PeriodosService();

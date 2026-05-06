import { db } from '../../../database/connection';

export interface HistorialEntry {
  id_historial: number;
  id_oc: number;
  estado_anterior: string | null;
  estado_nuevo: string;
  id_usuario: number | null;
  nombre_usuario?: string;
  fecha: string;
  comentario: string | null;
}

class HistorialOCService {
  async listar(id_oc: number): Promise<HistorialEntry[]> {
    const [rows]: any = await db.query(`
      SELECT h.id_historial, h.id_oc, h.estado_anterior, h.estado_nuevo,
             h.id_usuario, u.nombre AS nombre_usuario, h.fecha, h.comentario
        FROM OrdenCompraHistorial h
        LEFT JOIN Usuarios u ON u.id_usuario = h.id_usuario
       WHERE h.id_oc = ?
       ORDER BY h.fecha ASC
    `, [id_oc]);
    return rows as HistorialEntry[];
  }

  /**
   * Tiempo (en horas) que la OC pasó en cada estado. Útil para KPIs.
   */
  async tiemposPorFase(id_oc: number): Promise<Record<string, number>> {
    const entries = await this.listar(id_oc);
    const tiempos: Record<string, number> = {};
    for (let i = 0; i < entries.length - 1; i++) {
      const e = entries[i];
      const next = entries[i + 1];
      const horas = (new Date(next.fecha).getTime() - new Date(e.fecha).getTime()) / 3600000;
      tiempos[e.estado_nuevo] = (tiempos[e.estado_nuevo] || 0) + horas;
    }
    return tiempos;
  }
}

export default new HistorialOCService();

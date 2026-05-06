import { db } from '../../../database/connection';

export interface NotaOC {
  id_nota: number;
  id_oc: number;
  id_usuario: number | null;
  nombre_usuario?: string;
  fecha: string;
  texto: string;
}

class NotaOCService {
  async crear(id_oc: number, id_usuario: number, texto: string): Promise<{ id_nota: number }> {
    const t = (texto || '').trim();
    if (!t) throw new Error('La nota no puede estar vacía');
    if (t.length > 2000) throw new Error('La nota excede 2000 caracteres');

    const [r]: any = await db.query(
      `INSERT INTO OrdenCompraNota (id_oc, id_usuario, texto) VALUES (?, ?, ?)`,
      [id_oc, id_usuario, t]
    );
    return { id_nota: r.insertId || r.lastID || 0 };
  }

  async listar(id_oc: number): Promise<NotaOC[]> {
    const [rows]: any = await db.query(`
      SELECT n.id_nota, n.id_oc, n.id_usuario, u.nombre AS nombre_usuario,
             n.fecha, n.texto
        FROM OrdenCompraNota n
        LEFT JOIN Usuarios u ON u.id_usuario = n.id_usuario
       WHERE n.id_oc = ?
       ORDER BY n.fecha DESC
    `, [id_oc]);
    return rows as NotaOC[];
  }

  async eliminar(id_nota: number, id_usuario: number, esGerente: boolean): Promise<void> {
    // Solo el autor o GERENTE puede borrar.
    const [rows]: any = await db.query(
      `SELECT id_usuario FROM OrdenCompraNota WHERE id_nota = ?`,
      [id_nota]
    );
    if (!rows[0]) throw new Error('Nota no encontrada');
    if (!esGerente && rows[0].id_usuario !== id_usuario) {
      throw new Error('No tienes permiso para borrar esta nota');
    }
    await db.query(`DELETE FROM OrdenCompraNota WHERE id_nota = ?`, [id_nota]);
  }
}

export default new NotaOCService();

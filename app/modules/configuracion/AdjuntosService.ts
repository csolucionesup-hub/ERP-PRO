import { db } from '../../../database/connection';
import { CloudinaryService } from '../comercial/CloudinaryService';

export interface Adjunto {
  id: number;
  ref_tipo: string;
  ref_id: number;
  nombre_original: string | null;
  url: string;
  cloudinary_public_id: string | null;
  mimetype: string | null;
  tamano_bytes: number | null;
  id_usuario_subio: number | null;
  created_at: string;
}

export interface SubirParams {
  ref_tipo: string;
  ref_id: number;
  buffer: Buffer;
  nombre: string;
  mimetype: string;
  id_usuario: number;
}

/**
 * AdjuntosService — CRUD de archivos genéricos vinculados a cualquier documento.
 * Almacenamiento: Cloudinary (ya configurado en CloudinaryService).
 */
class AdjuntosService {
  async subir(p: SubirParams): Promise<{ id: number; url: string; public_id: string }> {
    const carpeta = `metalengineers/${p.ref_tipo.toLowerCase()}`;
    const up = await CloudinaryService.subirArchivoGenerico(p.buffer, p.nombre, carpeta);
    const [res] = await db.query(
      `INSERT INTO Adjuntos
       (ref_tipo, ref_id, nombre_original, url, cloudinary_public_id, mimetype, tamano_bytes, id_usuario_subio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.ref_tipo, p.ref_id, p.nombre, up.url, up.public_id,
       p.mimetype, p.buffer.length, p.id_usuario]
    );
    return { id: (res as any).insertId, url: up.url, public_id: up.public_id };
  }

  async listar(ref_tipo: string, ref_id: number): Promise<Adjunto[]> {
    const [rows] = await db.query(
      'SELECT * FROM Adjuntos WHERE ref_tipo=? AND ref_id=? ORDER BY created_at DESC',
      [ref_tipo, ref_id]
    );
    return rows as Adjunto[];
  }

  async obtener(id: number): Promise<Adjunto | null> {
    const [rows] = await db.query('SELECT * FROM Adjuntos WHERE id=?', [id]);
    return (rows as Adjunto[])[0] ?? null;
  }

  async eliminar(id: number): Promise<{ success: true }> {
    const adj = await this.obtener(id);
    if (!adj) throw new Error('Adjunto no encontrado');
    if (adj.cloudinary_public_id) {
      try {
        // Intentar como image primero, luego raw (PDFs generalmente son 'raw')
        const rt = (adj.mimetype?.startsWith('image/')) ? 'image' : 'raw';
        await CloudinaryService.eliminarRecurso(adj.cloudinary_public_id, rt);
      } catch (e) {
        console.error('[AdjuntosService] error eliminando de Cloudinary:', (e as Error).message);
      }
    }
    await db.query('DELETE FROM Adjuntos WHERE id=?', [id]);
    return { success: true };
  }
}

export default new AdjuntosService();

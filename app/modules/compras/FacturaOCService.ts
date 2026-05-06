import { db } from '../../../database/connection';
import { CloudinaryService } from '../comercial/CloudinaryService';

export interface FacturaOC {
  id_factura_oc: number;
  id_oc: number;
  nro_comprobante: string;
  fecha_emision: string;
  monto: number;
  url_pdf: string | null;
  cloudinary_id: string | null;
}

class FacturaOCService {
  async subir(params: {
    id_oc: number;
    nro_comprobante: string;
    fecha_emision: string;
    monto: number;
    archivo?: { buffer: Buffer; originalname: string };
    id_usuario: number;
  }): Promise<{ id_factura_oc: number; url_pdf: string | null }> {
    if (!params.nro_comprobante?.trim()) throw new Error('Nro de comprobante requerido');
    if (!params.fecha_emision) throw new Error('Fecha de emisión requerida');
    if (!params.monto || params.monto <= 0) throw new Error('Monto debe ser mayor a 0');

    let url: string | null = null;
    let cloudId: string | null = null;
    if (params.archivo?.buffer) {
      const r = await CloudinaryService.subirFacturaOC(params.archivo.buffer, params.archivo.originalname);
      url = r.url;
      cloudId = r.public_id;
    }

    const [r]: any = await db.query(`
      INSERT INTO OrdenCompraFactura
        (id_oc, nro_comprobante, fecha_emision, monto, url_pdf, cloudinary_id, id_usuario_sube)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [params.id_oc, params.nro_comprobante.trim(), params.fecha_emision, params.monto, url, cloudId, params.id_usuario]);

    // Marcar OC como facturada
    await db.query(
      `UPDATE OrdenesCompra SET estado_factura='FACTURADA', facturada_at=NOW() WHERE id_oc=?`,
      [params.id_oc]
    );

    return { id_factura_oc: r.insertId || r.lastID || 0, url_pdf: url };
  }

  async getDeOC(id_oc: number): Promise<FacturaOC | null> {
    const [rows]: any = await db.query(
      `SELECT * FROM OrdenCompraFactura WHERE id_oc = ?`,
      [id_oc]
    );
    return rows[0] || null;
  }
}

export default new FacturaOCService();

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

    // Upsert por id_oc (UNIQUE constraint). Si ya existe, reemplaza datos.
    // Si no había archivo nuevo, conservar el url_pdf y cloudinary_id existentes.
    const sql = `
      INSERT INTO OrdenCompraFactura
        (id_oc, nro_comprobante, fecha_emision, monto, url_pdf, cloudinary_id, id_usuario_sube)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id_oc) DO UPDATE SET
        nro_comprobante = EXCLUDED.nro_comprobante,
        fecha_emision   = EXCLUDED.fecha_emision,
        monto           = EXCLUDED.monto,
        url_pdf         = COALESCE(EXCLUDED.url_pdf, OrdenCompraFactura.url_pdf),
        cloudinary_id   = COALESCE(EXCLUDED.cloudinary_id, OrdenCompraFactura.cloudinary_id),
        id_usuario_sube = EXCLUDED.id_usuario_sube
      RETURNING id_factura_oc
    `;
    const [r]: any = await db.query(sql, [
      params.id_oc, params.nro_comprobante.trim(), params.fecha_emision,
      params.monto, url, cloudId, params.id_usuario,
    ]);

    // Subir el PDF SOLO adjunta el archivo. NO marca estado_factura='FACTURADA'
    // ni avanza la OC a TERMINADA. El cierre formal lo dispara el usuario con
    // el botón "🧾 Recibí factura" cuando considera que ya subió todos los
    // comprobantes (algunas OCs vienen partidas en varias facturas).

    const idFactura = r[0]?.id_factura_oc || r.insertId || 0;
    return { id_factura_oc: idFactura, url_pdf: url };
  }

  async getDeOC(id_oc: number): Promise<FacturaOC | null> {
    const [rows]: any = await db.query(
      `SELECT * FROM OrdenCompraFactura WHERE id_oc = ?`,
      [id_oc]
    );
    return rows[0] || null;
  }

  /**
   * Elimina la factura adjunta de una OC. Solo GERENTE.
   * - Borra fila de OrdenCompraFactura
   * - Setea OC.estado_factura = 'PENDIENTE'
   * - Si la OC estaba en TERMINADA, retrocede a FACTURACION
   * - El archivo de Cloudinary NO se borra (queda huérfano, evitable cleanup posterior)
   */
  async eliminar(id_oc: number, esGerente: boolean): Promise<{ success: true; estado_oc: string }> {
    if (!esGerente) throw new Error('Solo GERENTE puede eliminar una factura adjunta');

    await db.query(`DELETE FROM OrdenCompraFactura WHERE id_oc = ?`, [id_oc]);

    // Volver estado_factura a PENDIENTE
    await db.query(
      `UPDATE OrdenesCompra SET estado_factura='PENDIENTE', facturada_at=NULL WHERE id_oc=?`,
      [id_oc]
    );

    // Si la OC estaba TERMINADA porque tenía todo verde, retroceder a FACTURACION
    const [rows]: any = await db.query(
      `SELECT estado FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]
    );
    const estadoActual = rows[0]?.estado;
    let estadoFinal = estadoActual;
    if (estadoActual === 'TERMINADA') {
      await db.query(
        `UPDATE OrdenesCompra SET estado='FACTURACION' WHERE id_oc=?`,
        [id_oc]
      );
      estadoFinal = 'FACTURACION';
    }

    return { success: true, estado_oc: estadoFinal };
  }
}

export default new FacturaOCService();

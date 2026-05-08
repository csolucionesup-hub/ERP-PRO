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

/**
 * FacturaOCService — facturas/RH del proveedor adjuntas a una OC.
 *
 * Modelo (mig 064): N facturas por OC. Antes era 1:1 (UNIQUE en id_oc) pero
 * el proveedor puede entregar varios comprobantes para una misma orden
 * (split por items, fechas distintas). Cada `subir()` agrega una fila;
 * para reemplazar hay que eliminar y volver a subir.
 *
 * El cierre formal (estado_factura='FACTURADA' en OrdenesCompra) lo dispara
 * el usuario con el botón "🧾 Recibí factura" cuando considera que ya
 * subió todos los comprobantes — no se cierra automáticamente al primer
 * upload.
 */
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

    // INSERT puro — multi-factura por OC. Sin ON CONFLICT.
    const [r]: any = await db.query(
      `INSERT INTO OrdenCompraFactura
        (id_oc, nro_comprobante, fecha_emision, monto, url_pdf, cloudinary_id, id_usuario_sube)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id_factura_oc`,
      [
        params.id_oc, params.nro_comprobante.trim(), params.fecha_emision,
        params.monto, url, cloudId, params.id_usuario,
      ]
    );

    const idFactura = r[0]?.id_factura_oc || r.insertId || 0;
    return { id_factura_oc: idFactura, url_pdf: url };
  }

  /** Devuelve todas las facturas adjuntas a una OC ordenadas por fecha+id ascendente. */
  async listarDeOC(id_oc: number): Promise<FacturaOC[]> {
    const [rows]: any = await db.query(
      `SELECT * FROM OrdenCompraFactura
        WHERE id_oc = ?
        ORDER BY fecha_emision ASC, id_factura_oc ASC`,
      [id_oc]
    );
    return rows as FacturaOC[];
  }

  /**
   * Compat: devuelve la primera factura adjunta a una OC, o null.
   * Para nuevos consumidores usar `listarDeOC`. Mantenido para no romper
   * código transitorio.
   */
  async getDeOC(id_oc: number): Promise<FacturaOC | null> {
    const list = await this.listarDeOC(id_oc);
    return list[0] || null;
  }

  /** Devuelve una factura individual por su id propio. */
  async getPorId(id_factura_oc: number): Promise<FacturaOC | null> {
    const [rows]: any = await db.query(
      `SELECT * FROM OrdenCompraFactura WHERE id_factura_oc = ?`,
      [id_factura_oc]
    );
    return rows[0] || null;
  }

  /**
   * Elimina UNA factura adjunta. Solo GERENTE.
   * - Borra fila de OrdenCompraFactura.
   * - Si tras el borrado quedan 0 facturas en la OC: estado_factura → PENDIENTE,
   *   y si la OC estaba en TERMINADA, retrocede a FACTURACION (para que el
   *   usuario pueda subir una nueva sin quedar atascado).
   * - Si quedan ≥1 facturas: NO toca estado_factura ni estado de la OC.
   * - El archivo en Cloudinary queda huérfano (mismo criterio que antes —
   *   el cleanup automático rompe casos donde Julio reusa la URL).
   */
  async eliminar(id_factura_oc: number, esGerente: boolean): Promise<{ success: true; estado_oc: string; facturas_restantes: number }> {
    if (!esGerente) throw new Error('Solo GERENTE puede eliminar una factura adjunta');

    const factura = await this.getPorId(id_factura_oc);
    if (!factura) throw new Error('Factura no encontrada');
    const id_oc = factura.id_oc;

    await db.query(`DELETE FROM OrdenCompraFactura WHERE id_factura_oc = ?`, [id_factura_oc]);

    const [restRows]: any = await db.query(
      `SELECT COUNT(*)::int AS c FROM OrdenCompraFactura WHERE id_oc = ?`,
      [id_oc]
    );
    const restantes = Number(restRows[0]?.c) || 0;

    let estadoFinal = '';
    if (restantes === 0) {
      // No quedan facturas: revertir cierre formal de facturación
      await db.query(
        `UPDATE OrdenesCompra SET estado_factura='PENDIENTE', facturada_at=NULL WHERE id_oc=?`,
        [id_oc]
      );
      const [rows]: any = await db.query(
        `SELECT estado FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]
      );
      const estadoActual = rows[0]?.estado;
      estadoFinal = estadoActual;
      if (estadoActual === 'TERMINADA') {
        await db.query(
          `UPDATE OrdenesCompra SET estado='FACTURACION' WHERE id_oc=?`,
          [id_oc]
        );
        estadoFinal = 'FACTURACION';
      }
    } else {
      const [rows]: any = await db.query(
        `SELECT estado FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]
      );
      estadoFinal = rows[0]?.estado || '';
    }

    return { success: true, estado_oc: estadoFinal, facturas_restantes: restantes };
  }
}

export default new FacturaOCService();

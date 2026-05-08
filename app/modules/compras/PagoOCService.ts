import { db } from '../../../database/connection';
import { CloudinaryService } from '../comercial/CloudinaryService';

export interface PagoOC {
  id_pago: number;
  id_oc: number;
  id_cuenta: number;
  fecha_pago: string;
  nro_operacion: string | null;
  monto: number;
  monto_pen: number;
  observaciones: string | null;
  voucher_url: string | null;
  voucher_cloudinary_id: string | null;
  id_movimiento_bancario: number | null;
  id_usuario_registra: number | null;
  created_at: string;
}

/**
 * PagoOCService — pagos individuales contra una OC (multi-pago).
 *
 * El INSERT en OrdenCompraPago lo dispara `OrdenCompraService.registrarPago`
 * (porque está en la misma transacción que crea Compra/Gasto + Tx + MovBancario).
 * Acá solo viven las consultas y operaciones individuales (listar, eliminar
 * voucher, etc.).
 *
 * El modelo soporta voucher PDF/imagen por cada pago — se sube a Cloudinary
 * y la URL se guarda en `voucher_url`. Esto desbloquea el bridge OC → Rendición
 * donde cada constancia bancaria del flujo aparece pre-poblada.
 */
class PagoOCService {
  /** Lista todos los pagos de una OC ordenados por fecha+id ascendente. */
  async listarDeOC(id_oc: number): Promise<(PagoOC & { cuenta_nombre?: string })[]> {
    const [rows]: any = await db.query(
      `SELECT p.*, c.nombre AS cuenta_nombre, c.moneda AS cuenta_moneda
         FROM OrdenCompraPago p
         LEFT JOIN Cuentas c ON c.id_cuenta = p.id_cuenta
        WHERE p.id_oc = ?
        ORDER BY p.fecha_pago ASC, p.id_pago ASC`,
      [id_oc]
    );
    return rows;
  }

  async getPorId(id_pago: number): Promise<PagoOC | null> {
    const [rows]: any = await db.query(
      `SELECT * FROM OrdenCompraPago WHERE id_pago = ?`,
      [id_pago]
    );
    return rows[0] || null;
  }

  /**
   * Sube un voucher (PDF/imagen de constancia bancaria) a un pago ya
   * registrado y guarda la URL/public_id. Permite asociar un voucher
   * después del registro inicial sin tener que rehacer el pago.
   */
  async adjuntarVoucher(id_pago: number, archivo: { buffer: Buffer; originalname: string }) {
    const pago = await this.getPorId(id_pago);
    if (!pago) throw new Error('Pago no encontrado');

    const upload = await CloudinaryService.subirArchivoGenerico(
      archivo.buffer, archivo.originalname,
      `metalengineers/oc-vouchers/${pago.id_oc}`
    );

    await db.query(
      `UPDATE OrdenCompraPago
          SET voucher_url = ?, voucher_cloudinary_id = ?
        WHERE id_pago = ?`,
      [upload.url, upload.public_id, id_pago]
    );

    return { success: true, voucher_url: upload.url };
  }

  /** Elimina solo el voucher (no el pago). Solo GERENTE. */
  async eliminarVoucher(id_pago: number, esGerente: boolean) {
    if (!esGerente) throw new Error('Solo GERENTE puede eliminar el voucher de un pago');
    await db.query(
      `UPDATE OrdenCompraPago
          SET voucher_url = NULL, voucher_cloudinary_id = NULL
        WHERE id_pago = ?`,
      [id_pago]
    );
    return { success: true };
  }
}

export default new PagoOCService();

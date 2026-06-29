import { db } from '../../../database/connection';
import { calcularCuadre, esPrimeraFactura, parseNroFactura } from './facturaVentaHelpers';

export interface FacturaVentaInput {
  id_cotizacion: number;
  tipo?: 'FACTURA' | 'BOLETA';
  serie: string;
  numero: number;
  fecha_emision: string;
  moneda?: 'PEN' | 'USD';
  tipo_cambio?: number;
  base_imponible?: number;
  igv?: number;
  total: number;
  aplica_detraccion?: boolean;
  porcentaje_detraccion?: number;
  monto_detraccion?: number;
  aplica_retencion?: boolean;
  monto_retencion?: number;
  cliente_razon_social?: string;
  cliente_num_doc?: string;
  observaciones?: string;
}

class FacturaVentaService {
  /** Pre-llena el form desde la cotizacion (no persiste). */
  async previewDesdeCotizacion(idCotizacion: number) {
    const [[c]]: any = await db.query(
      `SELECT id_cotizacion, cliente, moneda, tipo_cambio,
              subtotal, igv, total,
              detraccion_porcentaje, monto_detraccion, monto_retencion, nro_factura, fecha_factura
         FROM Cotizaciones WHERE id_cotizacion = ?`,
      [idCotizacion]
    );
    if (!c) throw new Error('Cotizacion no encontrada');
    const parsed = c.nro_factura ? parseNroFactura(c.nro_factura) : { serie: '', numero: null };
    return {
      id_cotizacion: c.id_cotizacion,
      tipo: 'FACTURA',
      serie: parsed.serie, numero: parsed.numero,
      fecha_emision: c.fecha_factura || null,
      moneda: c.moneda || 'PEN',
      tipo_cambio: Number(c.tipo_cambio || 1),
      base_imponible: Number(c.subtotal || 0),
      igv: Number(c.igv || 0),
      total: Number(c.total || 0),
      aplica_detraccion: Number(c.monto_detraccion || 0) > 0,
      porcentaje_detraccion: Number(c.detraccion_porcentaje || 0),
      monto_detraccion: Number(c.monto_detraccion || 0),
      aplica_retencion: Number(c.monto_retencion || 0) > 0,
      monto_retencion: Number(c.monto_retencion || 0),
      cliente_razon_social: c.cliente || '',
      cliente_num_doc: '',
    };
  }

  async listarPorCotizacion(idCotizacion: number) {
    const [rows]: any = await db.query(
      `SELECT * FROM FacturaVenta WHERE id_cotizacion = ? ORDER BY created_at ASC`,
      [idCotizacion]
    );
    const [[cot]]: any = await db.query(
      `SELECT total FROM Cotizaciones WHERE id_cotizacion = ?`, [idCotizacion]
    );
    const cuadre = calcularCuadre(rows as any[], Number(cot?.total || 0));
    return { facturas: rows, cuadre };
  }

  async crear(input: FacturaVentaInput, idUsuario: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [existentes]: any = await conn.query(
        `SELECT estado FROM FacturaVenta WHERE id_cotizacion = ?`, [input.id_cotizacion]
      );
      const primera = esPrimeraFactura(existentes as any[]);

      const [res]: any = await conn.query(
        `INSERT INTO FacturaVenta
           (id_cotizacion, tipo, serie, numero, fecha_emision, moneda, tipo_cambio,
            base_imponible, igv, total, aplica_detraccion, porcentaje_detraccion, monto_detraccion,
            aplica_retencion, monto_retencion, cliente_razon_social, cliente_num_doc,
            observaciones, id_usuario_registro, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VIGENTE')`,
        [input.id_cotizacion, input.tipo || 'FACTURA', input.serie, input.numero, input.fecha_emision,
         input.moneda || 'PEN', input.tipo_cambio || 1, input.base_imponible || 0, input.igv || 0, input.total,
         input.aplica_detraccion ? 1 : 0, input.porcentaje_detraccion || 0, input.monto_detraccion || 0,
         input.aplica_retencion ? 1 : 0, input.monto_retencion || 0,
         input.cliente_razon_social || null, input.cliente_num_doc || null,
         input.observaciones || null, idUsuario]
      );
      const id = (res as any).insertId;

      if (primera) {
        const nro = `${input.serie}-${input.numero}`;
        const [[cot]]: any = await conn.query(
          `SELECT estado, estado_financiero FROM Cotizaciones WHERE id_cotizacion = ?`, [input.id_cotizacion]
        );
        if (cot && cot.estado !== 'ANULADA' &&
            ['FONDEADA_TOTAL','SIN_DETRACCION_FONDEADA','FACTURADA','COBRADA'].includes(cot.estado_financiero)) {
          await conn.query(
            `UPDATE Cotizaciones
                SET nro_factura = ?, fecha_factura = ?, estado_financiero = 'FACTURADA'
              WHERE id_cotizacion = ?`,
            [nro, input.fecha_emision, input.id_cotizacion]
          );
        } else {
          await conn.query(
            `UPDATE Cotizaciones SET nro_factura = ?, fecha_factura = ? WHERE id_cotizacion = ?`,
            [nro, input.fecha_emision, input.id_cotizacion]
          );
        }
      }

      await conn.commit();
      return { id, primera };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async editar(id: number, input: Partial<FacturaVentaInput>) {
    const campos: string[] = [];
    const vals: any[] = [];
    const seteable: (keyof FacturaVentaInput)[] = [
      'tipo','serie','numero','fecha_emision','moneda','tipo_cambio','base_imponible','igv','total',
      'aplica_detraccion','porcentaje_detraccion','monto_detraccion','aplica_retencion','monto_retencion',
      'cliente_razon_social','cliente_num_doc','observaciones'
    ];
    for (const k of seteable) {
      if (input[k] !== undefined) {
        campos.push(`${k} = ?`);
        const v = input[k];
        vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
      }
    }
    if (campos.length === 0) return { ok: true };
    vals.push(id);
    await db.query(`UPDATE FacturaVenta SET ${campos.join(', ')}, updated_at = NOW() WHERE id_factura_venta = ?`, vals);
    return { ok: true };
  }

  async anular(id: number) {
    const [[fv]]: any = await db.query(`SELECT id_cotizacion, estado FROM FacturaVenta WHERE id_factura_venta = ?`, [id]);
    if (!fv) throw new Error('Factura no encontrada');
    if (fv.estado === 'ANULADA') throw new Error('La factura ya esta anulada');
    await db.query(`UPDATE FacturaVenta SET estado = 'ANULADA', updated_at = NOW() WHERE id_factura_venta = ?`, [id]);
    const [restantes]: any = await db.query(
      `SELECT COUNT(*) AS n FROM FacturaVenta WHERE id_cotizacion = ? AND estado = 'VIGENTE'`, [fv.id_cotizacion]
    );
    if (Number((restantes as any)[0].n) === 0) {
      const { default: CobranzasService } = await import('../finance/CobranzasService');
      await CobranzasService.revertirFacturacion(fv.id_cotizacion);
    }
    return { ok: true };
  }
}

export default new FacturaVentaService();

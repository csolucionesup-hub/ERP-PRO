/**
 * FacturaService — emisión, consulta y anulación de Facturas y Boletas electrónicas.
 *
 * Flujo estrella: emitirDesdeCotizacion(id_cotizacion)
 *   1. Lee la cotización APROBADA (o TERMINADA).
 *   2. Verifica que no esté ya facturada.
 *   3. Mapea cliente + items + totales a estructura de Factura.
 *   4. Toma el siguiente número correlativo de la serie configurada.
 *   5. Llama a NubefactService.emitir() — modo STUB o REAL según configuración.
 *   6. Inserta Factura + DetalleFactura en transacción.
 *   7. Actualiza la cotización con id_factura + estado_factura.
 */

import { db } from '../../../database/connection';
import ConfiguracionService from '../configuracion/ConfiguracionService';
import NubefactService from './NubefactService';
import { NubefactPayloadBuilder } from './NubefactPayloadBuilder';

export interface EmitirDesdeCotizacionOpts {
  forma_pago?: 'CONTADO' | 'CREDITO';
  dias_credito?: number;
  observaciones?: string;
  id_usuario_emisor?: number;
  /** Si es boleta (cliente sin RUC), forzar tipo 'BOLETA'. Default: FACTURA si cliente tiene RUC. */
  forzar_tipo?: 'FACTURA' | 'BOLETA';
}

class FacturaService {
  /**
   * El flujo principal del negocio.
   */
  async emitirDesdeCotizacion(id_cotizacion: number, opts: EmitirDesdeCotizacionOpts = {}) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Cargar cotización + detalles
      const [cotRows]: any = await conn.query(
        'SELECT * FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE',
        [id_cotizacion]
      );
      const cot = cotRows[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (!['APROBADA', 'TERMINADA'].includes(cot.estado)) {
        throw new Error(`Solo se factura sobre APROBADA/TERMINADA. Estado actual: ${cot.estado}`);
      }

      // 2. Verificar que no esté ya facturada (por la FK id_cotizacion en Facturas)
      const [yaFact]: any = await conn.query(
        "SELECT id_factura, tipo, serie, numero FROM Facturas WHERE id_cotizacion = ? AND estado_sunat NOT IN ('RECHAZADA','ERROR','ANULADA') LIMIT 1",
        [id_cotizacion]
      );
      if (yaFact.length > 0) {
        const f = yaFact[0];
        throw new Error(`La cotización ya tiene factura ${f.tipo} ${f.serie}-${String(f.numero).padStart(6, '0')}`);
      }

      const [detRows]: any = await conn.query(
        'SELECT * FROM DetalleCotizacion WHERE id_cotizacion = ? ORDER BY id_detalle',
        [id_cotizacion]
      );
      if (!detRows.length) throw new Error('Cotización sin detalles');

      // 3. Config + validar que puede emitir
      const cfg = await ConfiguracionService.getActual();
      ConfiguracionService.validarPuedeEmitirFactura(cfg);

      // 4. Decidir tipo de comprobante
      const clienteTipoDoc = this.inferirTipoDoc(cot.cliente_ruc);
      const tipo: 'FACTURA' | 'BOLETA' = opts.forzar_tipo ??
        (clienteTipoDoc === 'RUC' ? 'FACTURA' : 'BOLETA');

      const serie = tipo === 'FACTURA' ? cfg.serie_factura : cfg.serie_boleta;

      // 5. Siguiente correlativo (serie + numero único por uk_factura_serie_nro)
      const [maxRows]: any = await conn.query(
        'SELECT COALESCE(MAX(numero), 0) + 1 AS next FROM Facturas WHERE tipo = ? AND serie = ?',
        [tipo, serie]
      );
      const numero = maxRows[0].next as number;

      // 6. Preparar datos de la factura
      const hoy = new Date().toISOString().slice(0, 10);
      const moneda = (cot.moneda || cfg.moneda_base) as 'PEN' | 'USD';
      const tipo_cambio = Number(cot.tipo_cambio) || 1;
      const subtotal = Number(cot.subtotal || cot.monto_base || 0);
      const igv = Number(cot.igv || (cfg.aplica_igv ? subtotal * 0.18 : 0));
      const total = Number(cot.total || subtotal + igv);

      const detallesMapped = detRows.map((d: any, i: number) => {
        const cant = Number(d.cantidad);
        const pu = Number(d.precio_unitario);
        const sub = Number((cant * pu).toFixed(2));
        const dIgv = cfg.aplica_igv ? Number((sub * 0.18).toFixed(2)) : 0;
        return {
          orden: i + 1,
          codigo_item: d.codigo || null,
          descripcion: d.descripcion || '-',
          unidad_sunat: d.unidad || 'NIU',
          cantidad: cant,
          precio_unitario: pu,
          subtotal: sub,
          igv: dIgv,
          total: Number((sub + dIgv).toFixed(2)),
        };
      });

      // 7. Llamar al OSE (Nubefact) — en modo STUB si no hay cert
      const resp = await NubefactService.emitir({
        tipo,
        serie,
        numero,
        fecha_emision: hoy,
        cliente: {
          tipo_documento: this.tipoDocToNubefactCode(clienteTipoDoc),
          numero_documento: cot.cliente_ruc || '',
          razon_social: cot.cliente_razon_social || cot.cliente_nombre || 'CLIENTE',
          direccion: cot.cliente_direccion,
          email: cot.cliente_email,
        },
        moneda,
        tipo_cambio,
        subtotal,
        igv,
        total,
        detalles: detallesMapped.map((d: any) => ({
          codigo: d.codigo_item,
          descripcion: d.descripcion,
          unidad: d.unidad_sunat,
          cantidad: d.cantidad,
          precio_unitario: d.precio_unitario,
          total: d.total,
        })),
        observaciones: opts.observaciones,
        forma_pago: opts.forma_pago,
        dias_credito: opts.dias_credito,
      });

      // 8. Persistir Factura + Detalle en la misma transacción
      const [insFact]: any = await conn.query(
        `INSERT INTO Facturas
          (tipo, serie, numero, fecha_emision,
           cliente_tipo_doc, cliente_numero_doc, cliente_razon_social, cliente_direccion, cliente_email,
           moneda, tipo_cambio, subtotal, descuento_global, igv, total,
           forma_pago, dias_credito,
           id_cotizacion, estado_sunat, codigo_sunat, descripcion_sunat,
           xml_url, pdf_url, cdr_url, cadena_qr,
           id_usuario_emisor, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tipo, serie, numero, hoy,
          clienteTipoDoc, cot.cliente_ruc || '', cot.cliente_razon_social || cot.cliente_nombre || 'CLIENTE',
          cot.cliente_direccion || null, cot.cliente_email || null,
          moneda, tipo_cambio, subtotal, 0, igv, total,
          opts.forma_pago || 'CONTADO', opts.dias_credito || 0,
          id_cotizacion, resp.estado, resp.codigo_sunat || null, resp.descripcion || null,
          resp.enlace_del_xml || null, resp.enlace_del_pdf || null, resp.enlace_del_cdr || null,
          resp.cadena_para_codigo_qr || null,
          opts.id_usuario_emisor || null, opts.observaciones || null,
        ]
      );
      const id_factura = insFact.insertId as number;

      for (const d of detallesMapped) {
        await conn.query(
          `INSERT INTO DetalleFactura
            (id_factura, orden, codigo_item, descripcion, unidad_sunat, cantidad, precio_unitario, subtotal, igv, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id_factura, d.orden, d.codigo_item, d.descripcion, d.unidad_sunat,
           d.cantidad, d.precio_unitario, d.subtotal, d.igv, d.total]
        );
      }

      // 9. Marcar la cotización como facturada (usa las columnas existentes de migración 016)
      await conn.query(
        `UPDATE Cotizaciones SET nro_factura = ?, fecha_factura = ? WHERE id_cotizacion = ?`,
        [`${serie}-${String(numero).padStart(6, '0')}`, hoy, id_cotizacion]
      );

      await conn.commit();

      return {
        success: true,
        id_factura,
        tipo,
        serie,
        numero,
        numero_formateado: `${serie}-${String(numero).padStart(6, '0')}`,
        estado_sunat: resp.estado,
        simulado: resp.simulado,
        mensaje: resp.descripcion || resp.mensaje,
        pdf_url: resp.enlace_del_pdf,
        xml_url: resp.enlace_del_xml,
        cdr_url: resp.enlace_del_cdr,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Listar facturas con filtros.
   */
  async listar(filtros: {
    desde?: string; hasta?: string;
    tipo?: 'FACTURA' | 'BOLETA';
    estado?: string;
    cliente_numero_doc?: string;
    limit?: number;
  } = {}) {
    const where: string[] = [];
    const vals: any[] = [];
    if (filtros.desde)  { where.push('fecha_emision >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta)  { where.push('fecha_emision <= ?'); vals.push(filtros.hasta); }
    if (filtros.tipo)   { where.push('tipo = ?');           vals.push(filtros.tipo); }
    if (filtros.estado) { where.push('estado_sunat = ?');   vals.push(filtros.estado); }
    if (filtros.cliente_numero_doc) {
      where.push('cliente_numero_doc = ?');
      vals.push(filtros.cliente_numero_doc);
    }
    // LPAD en Postgres exige text como primer argumento → cast explícito.
    const sql = `
      SELECT id_factura, tipo, serie, numero,
        CONCAT(serie, '-', LPAD(numero::text, 6, '0')) AS numero_formateado,
        fecha_emision, cliente_numero_doc, cliente_razon_social,
        moneda, total, estado_sunat, pdf_url, cdr_url,
        id_cotizacion
      FROM Facturas
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY fecha_emision DESC, numero DESC
      LIMIT ?`;
    vals.push(filtros.limit ?? 200);
    const [rows] = await db.query(sql, vals);
    return rows;
  }

  async obtener(id_factura: number) {
    const [fRows]: any = await db.query('SELECT * FROM Facturas WHERE id_factura = ?', [id_factura]);
    const factura = fRows[0];
    if (!factura) throw new Error('Factura no encontrada');
    const [detRows] = await db.query(
      'SELECT * FROM DetalleFactura WHERE id_factura = ? ORDER BY orden',
      [id_factura]
    );
    return { ...factura, detalles: detRows };
  }

  /**
   * Consulta el estado actualizado en Nubefact (para comprobantes PENDIENTE o ERROR).
   */
  async consultarEstado(id_factura: number) {
    const f = await this.obtener(id_factura);
    const nuevoEstado = await NubefactService.consultarEstado(f.tipo, f.serie, f.numero);
    if (nuevoEstado !== f.estado_sunat) {
      await db.query(
        'UPDATE Facturas SET estado_sunat = ? WHERE id_factura = ?',
        [nuevoEstado, id_factura]
      );
    }
    return { estado: nuevoEstado, cambió: nuevoEstado !== f.estado_sunat };
  }

  // ───────── helpers ─────────

  private inferirTipoDoc(ruc?: string | null): 'DNI' | 'CE' | 'RUC' | 'PASAPORTE' {
    if (!ruc) return 'DNI';
    const s = ruc.replace(/\D/g, '');
    if (s.length === 11) return 'RUC';
    if (s.length === 8)  return 'DNI';
    if (s.length === 9)  return 'CE';
    return 'PASAPORTE';
  }

  private tipoDocToNubefactCode(tipo: 'DNI'|'CE'|'RUC'|'PASAPORTE'): '1'|'4'|'6'|'7' {
    return { DNI: '1', CE: '4', RUC: '6', PASAPORTE: '7' }[tipo] as any;
  }
}

export default new FacturaService();

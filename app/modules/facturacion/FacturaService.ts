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

export interface DetalleFacturaInput {
  codigo_item?: string | null;
  descripcion: string;
  unidad_sunat?: string;       // NIU, ZZ, KGM, etc. Default 'NIU'
  cantidad: number;
  precio_unitario: number;     // sin IGV (valor venta)
}

/**
 * Datos completos para emitir factura/boleta. Usado por el form multi-item:
 * el frontend pre-llena desde cotización (preview-cotizacion) pero permite
 * editar todo antes de emitir.
 */
export interface CrearFacturaInput {
  tipo?: 'FACTURA' | 'BOLETA';   // default FACTURA si cliente RUC, BOLETA sino
  marca?: 'METAL' | 'PERFOTOOLS'; // determina la serie
  fecha_emision?: string;        // YYYY-MM-DD, default hoy
  fecha_vencimiento?: string | null;

  cliente_tipo_doc?: 'DNI' | 'CE' | 'RUC' | 'PASAPORTE';
  cliente_numero_doc: string;
  cliente_razon_social: string;
  cliente_direccion?: string | null;
  cliente_email?: string | null;

  moneda?: 'PEN' | 'USD';
  tipo_cambio?: number;
  aplica_igv?: boolean;
  descuento_global?: number;

  forma_pago?: 'CONTADO' | 'CREDITO';
  dias_credito?: number;

  aplica_detraccion?: boolean;
  porcentaje_detraccion?: number;
  codigo_servicio_spot?: string;

  observaciones?: string | null;
  id_cotizacion?: number | null;  // origen opcional

  detalles: DetalleFacturaInput[];
}

class FacturaService {

  /**
   * Determina la serie de factura/boleta según marca y tipo.
   * Prioriza ConfiguracionMarca.serie_factura si está poblada, sino fallback
   * a ConfiguracionEmpresa.serie_factura (legacy).
   */
  private async resolverSerie(
    conn: any,
    tipo: 'FACTURA' | 'BOLETA',
    marca: 'METAL' | 'PERFOTOOLS' = 'METAL'
  ): Promise<string> {
    const [marcaRows]: any = await conn.query(
      `SELECT serie_factura, serie_boleta FROM ConfiguracionMarca WHERE marca = ?`,
      [marca]
    );
    const m = marcaRows[0];
    if (tipo === 'FACTURA' && m?.serie_factura) return m.serie_factura;
    if (tipo === 'BOLETA'  && m?.serie_boleta)  return m.serie_boleta;
    // Fallback legacy a config_empresa
    const cfg = await ConfiguracionService.getActual();
    return tipo === 'FACTURA' ? cfg.serie_factura : cfg.serie_boleta;
  }

  /**
   * Toma el siguiente correlativo atómicamente desde CorrelativosFactura.
   * Patrón UPDATE-then-SELECT con row-lock implícito de Postgres garantiza
   * que dos transacciones concurrentes obtienen números distintos.
   */
  private async nextCorrelativo(conn: any, serie: string): Promise<number> {
    // 1. Intentar incrementar
    const [updRes]: any = await conn.query(
      `UPDATE CorrelativosFactura SET ultimo = ultimo + 1, updated_at = NOW() WHERE serie = ?`,
      [serie]
    );
    if (!updRes || !updRes.affectedRows) {
      // Primera factura para esta serie — INSERT inicial
      try {
        await conn.query(
          `INSERT INTO CorrelativosFactura (serie, ultimo) VALUES (?, 1)`,
          [serie]
        );
        return 1;
      } catch (e: any) {
        // Race: otra tx insertó primero. Reintentar UPDATE.
        const isDup = e?.code === '23505' || /duplicate key|already exists/i.test(e?.message || '');
        if (!isDup) throw e;
      }
    }
    // 2. Leer el valor incrementado
    const [rows]: any = await conn.query(
      `SELECT ultimo FROM CorrelativosFactura WHERE serie = ?`,
      [serie]
    );
    return Number(rows[0].ultimo);
  }

  /**
   * Crea y emite una factura/boleta desde un payload completo (form multi-item).
   * Es el método núcleo. emitirDesdeCotizacion() arma el payload y delega aquí.
   *
   * Pasos:
   *   1. Resolver serie por marca + tipo.
   *   2. Calcular totales por línea + IGV global.
   *   3. Tomar correlativo atómico.
   *   4. Llamar a NubefactService (modo STUB o REAL según cert).
   *   5. INSERT Factura + DetalleFactura en transacción.
   *   6. Si tiene id_cotizacion, marcar la cotización como facturada.
   */
  async crearYEmitir(data: CrearFacturaInput, opts: { id_usuario_emisor?: number } = {}) {
    if (!data.cliente_numero_doc) throw new Error('cliente_numero_doc requerido');
    if (!data.cliente_razon_social) throw new Error('cliente_razon_social requerido');
    if (!Array.isArray(data.detalles) || data.detalles.length === 0) {
      throw new Error('Debe incluir al menos un ítem');
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const cfg = await ConfiguracionService.getActual();
      ConfiguracionService.validarPuedeEmitirFactura(cfg);

      // Defaults
      const tipoDoc = data.cliente_tipo_doc || this.inferirTipoDoc(data.cliente_numero_doc);
      const tipo: 'FACTURA' | 'BOLETA' = data.tipo
        || (tipoDoc === 'RUC' ? 'FACTURA' : 'BOLETA');
      const marca = data.marca || 'METAL';
      const serie = await this.resolverSerie(conn, tipo, marca);
      const fecha_emision = data.fecha_emision || new Date().toISOString().slice(0, 10);
      const moneda = (data.moneda || cfg.moneda_base || 'PEN') as 'PEN' | 'USD';
      const tipo_cambio = Number(data.tipo_cambio) || 1;
      const aplica_igv = data.aplica_igv ?? cfg.aplica_igv ?? true;
      const descuento_global = Number(data.descuento_global) || 0;

      // Validar duplicado: si viene id_cotizacion, no debe estar ya facturada
      if (data.id_cotizacion) {
        const [yaFact]: any = await conn.query(
          `SELECT serie, numero FROM Facturas
            WHERE id_cotizacion = ? AND estado_sunat NOT IN ('RECHAZADA','ERROR','ANULADA') LIMIT 1`,
          [data.id_cotizacion]
        );
        if (yaFact.length > 0) {
          const f = yaFact[0];
          throw new Error(`La cotización ya tiene factura ${f.serie}-${String(f.numero).padStart(6,'0')}`);
        }
      }

      // Calcular totales por línea
      const detallesCalc = data.detalles.map((d, i) => {
        const cant = Number(d.cantidad);
        const pu = Number(d.precio_unitario);
        if (!Number.isFinite(cant) || cant <= 0) throw new Error(`Línea ${i+1}: cantidad inválida`);
        if (!Number.isFinite(pu) || pu < 0)      throw new Error(`Línea ${i+1}: precio inválido`);
        const sub = Number((cant * pu).toFixed(2));
        const dIgv = aplica_igv ? Number((sub * 0.18).toFixed(2)) : 0;
        return {
          orden: i + 1,
          codigo_item: d.codigo_item || null,
          descripcion: d.descripcion?.trim() || '-',
          unidad_sunat: d.unidad_sunat || 'NIU',
          cantidad: cant,
          precio_unitario: pu,
          subtotal: sub,
          igv: dIgv,
          total: Number((sub + dIgv).toFixed(2)),
        };
      });

      const subtotal = Number(detallesCalc.reduce((s, d) => s + d.subtotal, 0).toFixed(2));
      const igv = Number(detallesCalc.reduce((s, d) => s + d.igv, 0).toFixed(2));
      const total = Number((subtotal + igv - descuento_global).toFixed(2));

      // Detracción (opcional)
      const aplicaDet = !!data.aplica_detraccion;
      const pctDet = aplicaDet ? Number(data.porcentaje_detraccion || 0) : null;
      const montoDet = aplicaDet && pctDet ? Number((total * pctDet / 100).toFixed(2)) : null;

      // Correlativo atómico
      const numero = await this.nextCorrelativo(conn, serie);

      // Llamar Nubefact (STUB o REAL)
      const resp = await NubefactService.emitir({
        tipo, serie, numero, fecha_emision,
        cliente: {
          tipo_documento: this.tipoDocToNubefactCode(tipoDoc),
          numero_documento: data.cliente_numero_doc,
          razon_social: data.cliente_razon_social,
          direccion: data.cliente_direccion || undefined,
          email: data.cliente_email || undefined,
        },
        moneda, tipo_cambio,
        subtotal, igv, total,
        detalles: detallesCalc.map(d => ({
          codigo: d.codigo_item || undefined,
          descripcion: d.descripcion, unidad: d.unidad_sunat,
          cantidad: d.cantidad, precio_unitario: d.precio_unitario, total: d.total,
        })),
        observaciones: data.observaciones || undefined,
        forma_pago: data.forma_pago,
        dias_credito: data.dias_credito,
      });

      // Persistir factura
      const [insFact]: any = await conn.query(
        `INSERT INTO Facturas
          (tipo, serie, numero, fecha_emision, fecha_vencimiento,
           cliente_tipo_doc, cliente_numero_doc, cliente_razon_social, cliente_direccion, cliente_email,
           moneda, tipo_cambio, subtotal, descuento_global, igv, total,
           forma_pago, dias_credito,
           aplica_detraccion, porcentaje_detraccion, monto_detraccion, codigo_servicio_spot,
           id_cotizacion, estado_sunat, codigo_sunat, descripcion_sunat,
           xml_url, pdf_url, cdr_url, cadena_qr,
           id_usuario_emisor, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tipo, serie, numero, fecha_emision, data.fecha_vencimiento || null,
          tipoDoc, data.cliente_numero_doc, data.cliente_razon_social,
          data.cliente_direccion || null, data.cliente_email || null,
          moneda, tipo_cambio, subtotal, descuento_global, igv, total,
          data.forma_pago || 'CONTADO', data.dias_credito || 0,
          aplicaDet, pctDet, montoDet, data.codigo_servicio_spot || null,
          data.id_cotizacion || null,
          resp.estado, resp.codigo_sunat || null, resp.descripcion || null,
          resp.enlace_del_xml || null, resp.enlace_del_pdf || null, resp.enlace_del_cdr || null,
          resp.cadena_para_codigo_qr || null,
          opts.id_usuario_emisor || null, data.observaciones || null,
        ]
      );
      const id_factura = insFact.insertId as number;

      for (const d of detallesCalc) {
        await conn.query(
          `INSERT INTO DetalleFactura
            (id_factura, orden, codigo_item, descripcion, unidad_sunat, cantidad, precio_unitario, subtotal, igv, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id_factura, d.orden, d.codigo_item, d.descripcion, d.unidad_sunat,
           d.cantidad, d.precio_unitario, d.subtotal, d.igv, d.total]
        );
      }

      // Si origen es cotización, marcarla como facturada
      if (data.id_cotizacion) {
        await conn.query(
          `UPDATE Cotizaciones SET nro_factura = ?, fecha_factura = ? WHERE id_cotizacion = ?`,
          [`${serie}-${String(numero).padStart(6, '0')}`, fecha_emision, data.id_cotizacion]
        );
      }

      await conn.commit();

      return {
        success: true,
        id_factura,
        tipo, serie, numero,
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
   * Pre-llena datos de factura desde una cotización para mostrar en el form
   * antes de emitir. NO persiste nada — solo arma el payload sugerido.
   */
  async previewDesdeCotizacion(id_cotizacion: number): Promise<CrearFacturaInput> {
    const [cotRows]: any = await db.query(
      'SELECT * FROM Cotizaciones WHERE id_cotizacion = ?',
      [id_cotizacion]
    );
    const cot = cotRows[0];
    if (!cot) throw new Error('Cotización no encontrada');
    if (!['APROBADA', 'TERMINADA'].includes(cot.estado)) {
      throw new Error(`Solo se factura sobre APROBADA/TERMINADA. Estado actual: ${cot.estado}`);
    }
    const [detRows]: any = await db.query(
      'SELECT * FROM DetalleCotizacion WHERE id_cotizacion = ? ORDER BY id_detalle',
      [id_cotizacion]
    );

    return {
      tipo: cot.cliente_ruc && cot.cliente_ruc.length === 11 ? 'FACTURA' : undefined,
      marca: cot.marca || 'METAL',
      fecha_emision: new Date().toISOString().slice(0, 10),
      cliente_numero_doc: cot.cliente_ruc || '',
      cliente_razon_social: cot.cliente_razon_social || cot.cliente || '',
      cliente_direccion: cot.cliente_direccion || null,
      cliente_email: cot.correo || null,
      moneda: cot.moneda || 'PEN',
      tipo_cambio: Number(cot.tipo_cambio) || 1,
      aplica_igv: Number(cot.igv) > 0,
      forma_pago: 'CONTADO',
      dias_credito: 0,
      observaciones: cot.proyecto ? `OC ${cot.proyecto}` : null,
      id_cotizacion,
      detalles: (detRows as any[]).map(d => ({
        codigo_item: d.codigo || null,
        descripcion: [d.descripcion, d.subdescripcion].filter(Boolean).join(' — '),
        unidad_sunat: d.unidad || 'NIU',
        cantidad: Number(d.cantidad),
        precio_unitario: Number(d.precio_unitario),
      })),
    };
  }

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

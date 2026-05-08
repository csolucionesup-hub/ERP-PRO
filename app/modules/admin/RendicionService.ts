import { db } from '../../../database/connection';
import { CloudinaryService } from '../comercial/CloudinaryService';

/**
 * RendicionService — Rendiciones de Gastos por OC.
 *
 * Caso de uso: tras pagar una OC (típicamente reembolso a colaborador
 * para que compre items en efectivo), el responsable arma un expediente
 * consolidado con los comprobantes, firmas y resumen. Sale como PDF.
 *
 * Decisiones (Fase 1, MVP — definidas con Julio el 04/05):
 *  - 1 OC = 1 rendición (id_oc UNIQUE).
 *  - Cualquier usuario puede firmar cualquier casillero (auditado).
 *  - Adjuntos como referencia visual — NO crean Compras/Gastos automáticos.
 *  - Numeración: usa el N° de la OC (no correlativo propio).
 */

export type FirmaTipo = 'preparado' | 'revisado' | 'autorizado';
export type AdjuntoTipo = 'CONSTANCIA' | 'FACTURA' | 'BOLETA' | 'OC' | 'COMPROBANTE' | 'OTRO';

export interface ItemInput {
  fecha: string;                     // YYYY-MM-DD
  nro_documento?: string;
  beneficiario?: string;
  concepto: string;
  subtotal?: number;
  igv?: number;
  importe_total: number;
  observaciones?: string;
  id_compra_referencia?: number | null;
  id_gasto_referencia?: number | null;
}

export interface CrearRendicionInput {
  id_oc: number;
  banco?: string;
  nro_operacion?: string;
  fecha_operacion?: string;
  cuenta_a_cargo_de_id?: number;
  cargo?: string;
  fecha_rendicion?: string;
  saldo_anterior?: number;
  observaciones?: string;
}

class RendicionService {

  // ── Listar (con filtros simples) ──────────────────────────────
  async listar(filtros: { estado?: string; desde?: string; hasta?: string; limit?: number } = {}) {
    const where: string[] = [];
    const vals: any[] = [];
    if (filtros.estado) { where.push('r.estado = ?');         vals.push(filtros.estado); }
    if (filtros.desde)  { where.push('r.fecha_rendicion >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta)  { where.push('r.fecha_rendicion <= ?'); vals.push(filtros.hasta); }
    // OrdenesCompra solo guarda id_proveedor — el nombre vive en Proveedores.razon_social.
    const sql = `
      SELECT r.id_rendicion, r.id_oc, r.nro_oc_referencia, r.centro_costo, r.proyecto,
             r.importe_recibido, r.moneda, r.fecha_rendicion,
             r.fondo_asignado, r.total_gastos, r.saldo_disponible,
             r.estado, r.cargo,
             u_cargo.nombre AS cuenta_a_cargo_de_nombre,
             u_prep.nombre  AS preparado_por_nombre,
             u_rev.nombre   AS revisado_por_nombre,
             u_aut.nombre   AS autorizado_por_nombre,
             r.preparado_at, r.revisado_at, r.autorizado_at,
             r.created_at, r.updated_at,
             oc.estado AS oc_estado,
             prov.razon_social AS proveedor_nombre,
             prov.ruc AS proveedor_ruc
      FROM Rendiciones r
      LEFT JOIN Usuarios u_cargo ON u_cargo.id_usuario = r.cuenta_a_cargo_de_id
      LEFT JOIN Usuarios u_prep  ON u_prep.id_usuario  = r.preparado_por_id
      LEFT JOIN Usuarios u_rev   ON u_rev.id_usuario   = r.revisado_por_id
      LEFT JOIN Usuarios u_aut   ON u_aut.id_usuario   = r.autorizado_por_id
      LEFT JOIN OrdenesCompra oc ON oc.id_oc = r.id_oc
      LEFT JOIN Proveedores prov ON prov.id_proveedor = oc.id_proveedor
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.fecha_rendicion DESC, r.id_rendicion DESC
      LIMIT ?`;
    vals.push(filtros.limit ?? 200);
    const [rows] = await db.query(sql, vals);
    return rows;
  }

  // ── Obtener ficha completa con items + adjuntos ──────────────
  async obtener(id_rendicion: number) {
    const [rows]: any = await db.query(`
      SELECT r.*,
             u_cargo.nombre AS cuenta_a_cargo_de_nombre,
             u_cargo.email  AS cuenta_a_cargo_de_email,
             u_prep.nombre  AS preparado_por_nombre,
             u_rev.nombre   AS revisado_por_nombre,
             u_aut.nombre   AS autorizado_por_nombre,
             oc.estado AS oc_estado,
             prov.razon_social AS proveedor_nombre,
             prov.ruc AS proveedor_ruc,
             oc.empresa AS oc_empresa,
             oc.fecha_emision AS oc_fecha_emision,
             oc.subtotal AS oc_subtotal,
             oc.igv AS oc_igv,
             oc.total AS oc_total
      FROM Rendiciones r
      LEFT JOIN Usuarios u_cargo ON u_cargo.id_usuario = r.cuenta_a_cargo_de_id
      LEFT JOIN Usuarios u_prep  ON u_prep.id_usuario  = r.preparado_por_id
      LEFT JOIN Usuarios u_rev   ON u_rev.id_usuario   = r.revisado_por_id
      LEFT JOIN Usuarios u_aut   ON u_aut.id_usuario   = r.autorizado_por_id
      LEFT JOIN OrdenesCompra oc ON oc.id_oc = r.id_oc
      LEFT JOIN Proveedores prov ON prov.id_proveedor = oc.id_proveedor
      WHERE r.id_rendicion = ?`, [id_rendicion]);
    const r = rows[0];
    if (!r) throw new Error('Rendición no encontrada');

    const [items]: any = await db.query(
      `SELECT * FROM RendicionItems WHERE id_rendicion = ? ORDER BY orden, id_item`,
      [id_rendicion]
    );

    const [adjs]: any = await db.query(`
      SELECT a.*, u.nombre AS subido_por_nombre
      FROM RendicionAdjuntos a
      LEFT JOIN Usuarios u ON u.id_usuario = a.subido_por_id
      WHERE a.id_rendicion = ? ORDER BY a.subido_at`, [id_rendicion]);

    return { ...r, items, adjuntos: adjs };
  }

  // ── Buscar rendición existente para una OC ────────────────────
  async obtenerPorOC(id_oc: number) {
    const [rows]: any = await db.query(
      `SELECT id_rendicion FROM Rendiciones WHERE id_oc = ?`,
      [id_oc]
    );
    return (rows as any[])[0] || null;
  }

  // ── OCs candidatas a rendición (PAGADA / CERRADA_SIN_FACTURA sin rendición ya creada) ──
  // Lógica acordada con Julio (04/05): solo OCs que ya consumieron caja real.
  // FACTURADA aún no pagada NO entra (todavía no hubo desembolso).
  async listarOCsPendientesDeRendir() {
    const sql = `
      SELECT oc.id_oc, oc.nro_oc, oc.fecha_emision, oc.total, oc.moneda,
             oc.estado, oc.centro_costo, oc.empresa,
             prov.razon_social AS proveedor_nombre,
             prov.ruc          AS proveedor_ruc
      FROM OrdenesCompra oc
      LEFT JOIN Proveedores prov ON prov.id_proveedor = oc.id_proveedor
      LEFT JOIN Rendiciones r    ON r.id_oc = oc.id_oc
      WHERE oc.estado IN ('PAGADA', 'CERRADA_SIN_FACTURA')
        AND r.id_rendicion IS NULL
      ORDER BY oc.fecha_emision DESC, oc.id_oc DESC`;
    const [rows] = await db.query(sql);
    return rows;
  }

  // ── Crear rendición desde OC ──────────────────────────────────
  /**
   * Crea una rendición desde una OC pre-poblando lo que ya exista en el flujo:
   *  - Cabecera: nro_operacion + fecha_operacion del primer pago (si Julio no
   *    los manda explícitos en el body) y cuenta_a_cargo_de_id = usuario que
   *    registró ese pago.
   *  - 1 RendicionItem por cada OrdenCompraFactura. Importe = monto de la
   *    factura. Subtotal/IGV se derivan de oc.aplica_igv (18%). Beneficiario =
   *    proveedor_nombre. Concepto = "Compra OC <nro>" (Julio puede editarlo).
   *  - 1 RendicionAdjunto FACTURA por cada factura con url_pdf, y 1 CONSTANCIA
   *    por cada pago con voucher_url. public_id queda NULL para que al borrar
   *    la rendición NO se borren los archivos originales de la OC en
   *    Cloudinary (los siguen referenciando OC y eventuales otras rendiciones
   *    futuras tras un re-crear).
   *
   * Si Julio quiere rendir desde cero (sin pre-llenado), simplemente edita
   * o elimina los items/adjuntos generados.
   */
  async crearDesdeOC(data: CrearRendicionInput) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Validar OC y traer datos snapshot — extendemos campos para bridge.
      const [ocRows]: any = await conn.query(`
        SELECT oc.id_oc, oc.nro_oc, oc.centro_costo, oc.total, oc.moneda, oc.estado,
               oc.empresa, oc.aplica_igv, oc.tipo_cambio,
               p.razon_social AS proveedor_nombre
          FROM OrdenesCompra oc
          LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
         WHERE oc.id_oc = ? FOR UPDATE`,
        [data.id_oc]
      );
      const oc = ocRows[0];
      if (!oc) throw new Error('OC no encontrada.');
      if (oc.estado === 'ANULADA') throw new Error('No se puede crear rendición de una OC ANULADA.');

      // 2. Verificar que no exista una ya
      const existing = await this.obtenerPorOC(data.id_oc);
      if (existing) throw new Error(`Ya existe una rendición para esta OC (id ${existing.id_rendicion}).`);

      // 3. Cargar pagos + facturas de la OC para pre-poblar.
      const [pagos]: any = await conn.query(
        `SELECT * FROM OrdenCompraPago WHERE id_oc = ? ORDER BY fecha_pago ASC, id_pago ASC`,
        [data.id_oc]
      );
      const [facturas]: any = await conn.query(
        `SELECT * FROM OrdenCompraFactura WHERE id_oc = ? ORDER BY fecha_emision ASC, id_factura_oc ASC`,
        [data.id_oc]
      );
      const primerPago = (pagos as any[])[0] || null;

      // 4. Defaults inteligentes para cabecera (Julio puede sobreescribir).
      const nroOpFinal   = data.nro_operacion   ?? primerPago?.nro_operacion   ?? null;
      const fechaOpFinal = data.fecha_operacion ?? primerPago?.fecha_pago      ?? null;
      const cuentaCargoFinal = data.cuenta_a_cargo_de_id ?? primerPago?.id_usuario_registra ?? null;

      const importe = Number(oc.total);
      const saldoAnterior = Number(data.saldo_anterior || 0);
      const fondoAsignado = importe + saldoAnterior;

      const [insRes]: any = await conn.query(`
        INSERT INTO Rendiciones (
          id_oc, nro_oc_referencia, centro_costo, proyecto,
          importe_recibido, moneda,
          banco, nro_operacion, fecha_operacion,
          cuenta_a_cargo_de_id, cargo, fecha_rendicion,
          saldo_anterior, fondo_asignado, total_gastos, saldo_disponible,
          estado, observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'BORRADOR', ?)
      `, [
        data.id_oc, oc.nro_oc, oc.centro_costo, oc.centro_costo,
        importe, oc.moneda || 'PEN',
        data.banco ?? null, nroOpFinal, fechaOpFinal,
        cuentaCargoFinal, data.cargo ?? null,
        data.fecha_rendicion ?? new Date().toISOString().slice(0, 10),
        saldoAnterior, fondoAsignado, fondoAsignado,
        data.observaciones ?? null,
      ]);
      const id_rendicion: number = insRes.insertId;

      // 5. Pre-poblar RendicionItems desde las facturas adjuntas a la OC.
      const aplicaIgv = !!oc.aplica_igv;
      const proveedor = oc.proveedor_nombre || null;
      let totalItems = 0;
      for (let i = 0; i < (facturas as any[]).length; i++) {
        const f = (facturas as any[])[i];
        const importeTotal = Number(f.monto);
        const subtotal = aplicaIgv ? +(importeTotal / 1.18).toFixed(2) : importeTotal;
        const igv      = aplicaIgv ? +(importeTotal - subtotal).toFixed(2) : 0;
        await conn.query(`
          INSERT INTO RendicionItems (
            id_rendicion, orden, fecha, nro_documento, beneficiario, concepto,
            subtotal, igv, importe_total, observaciones,
            id_compra_referencia, id_gasto_referencia
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id_rendicion, i + 1, f.fecha_emision,
          f.nro_comprobante, proveedor, `Compra OC ${oc.nro_oc}`,
          subtotal, igv, importeTotal, null,
          null, null,
        ]);
        totalItems += importeTotal;
      }

      // 6. Pre-poblar RendicionAdjuntos:
      //    - 1 FACTURA por cada factura con url_pdf
      //    - 1 CONSTANCIA por cada pago con voucher_url
      //    public_id queda NULL en ambos casos: la rendición es solo "espejo"
      //    de los archivos de la OC, no dueña. Si Julio elimina la rendición,
      //    los archivos siguen vivos en Cloudinary (referenciados por la OC).
      for (const f of (facturas as any[])) {
        if (!f.url_pdf) continue;
        await conn.query(`
          INSERT INTO RendicionAdjuntos (
            id_rendicion, tipo, url, public_id, nombre_archivo,
            mime_type, tamano_bytes, subido_por_id
          ) VALUES (?, 'FACTURA', ?, NULL, ?, NULL, NULL, NULL)
        `, [id_rendicion, f.url_pdf, `Factura ${f.nro_comprobante}`]);
      }
      for (const p of (pagos as any[])) {
        if (!p.voucher_url) continue;
        await conn.query(`
          INSERT INTO RendicionAdjuntos (
            id_rendicion, tipo, url, public_id, nombre_archivo,
            mime_type, tamano_bytes, subido_por_id
          ) VALUES (?, 'CONSTANCIA', ?, NULL, ?, NULL, NULL, NULL)
        `, [id_rendicion, p.voucher_url, `Constancia ${p.fecha_pago} OC ${oc.nro_oc}`]);
      }

      // 7. Recalcular totales (ya con los items insertados).
      if (totalItems > 0) {
        const saldoDisp = fondoAsignado - totalItems;
        await conn.query(`
          UPDATE Rendiciones
             SET total_gastos = ?, saldo_disponible = ?, updated_at = NOW()
           WHERE id_rendicion = ?`,
          [totalItems, saldoDisp, id_rendicion]
        );
      }

      await conn.commit();
      return {
        success: true,
        id_rendicion,
        items_creados: (facturas as any[]).length,
        adjuntos_facturas: (facturas as any[]).filter(f => f.url_pdf).length,
        adjuntos_constancias: (pagos as any[]).filter(p => p.voucher_url).length,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ── Editar metadata (campos seguros) ──────────────────────────
  async editarMetadata(id_rendicion: number, data: any) {
    const FIELDS = [
      'banco', 'nro_operacion', 'fecha_operacion',
      'cuenta_a_cargo_de_id', 'cargo', 'fecha_rendicion',
      'saldo_anterior', 'observaciones',
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const f of FIELDS) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(data[f] === '' ? null : data[f]);
      }
    }
    if (!sets.length) return { success: true, sin_cambios: true };

    sets.push(`updated_at = NOW()`);
    vals.push(id_rendicion);
    await db.query(`UPDATE Rendiciones SET ${sets.join(', ')} WHERE id_rendicion = ?`, vals);

    // Si cambió saldo_anterior, recalcular fondo + saldo
    if (data.saldo_anterior !== undefined) await this.recalcularTotales(id_rendicion);

    return { success: true };
  }

  // ── Items: CRUD ───────────────────────────────────────────────
  async agregarItem(id_rendicion: number, item: ItemInput) {
    await this.assertExiste(id_rendicion);
    const [maxRows]: any = await db.query(
      `SELECT COALESCE(MAX(orden), 0) AS max_orden FROM RendicionItems WHERE id_rendicion = ?`,
      [id_rendicion]
    );
    const orden = Number(maxRows[0].max_orden || 0) + 1;
    const [res]: any = await db.query(`
      INSERT INTO RendicionItems (
        id_rendicion, orden, fecha, nro_documento, beneficiario, concepto,
        subtotal, igv, importe_total, observaciones,
        id_compra_referencia, id_gasto_referencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id_rendicion, orden, item.fecha,
      item.nro_documento ?? null, item.beneficiario ?? null, item.concepto,
      item.subtotal ?? 0, item.igv ?? 0, item.importe_total,
      item.observaciones ?? null,
      item.id_compra_referencia ?? null, item.id_gasto_referencia ?? null,
    ]);
    await this.recalcularTotales(id_rendicion);
    return { success: true, id_item: res.insertId };
  }

  async editarItem(id_rendicion: number, id_item: number, item: ItemInput) {
    await this.assertExiste(id_rendicion);
    await db.query(`
      UPDATE RendicionItems
      SET fecha = ?, nro_documento = ?, beneficiario = ?, concepto = ?,
          subtotal = ?, igv = ?, importe_total = ?, observaciones = ?
      WHERE id_item = ? AND id_rendicion = ?
    `, [
      item.fecha, item.nro_documento ?? null, item.beneficiario ?? null, item.concepto,
      item.subtotal ?? 0, item.igv ?? 0, item.importe_total,
      item.observaciones ?? null,
      id_item, id_rendicion,
    ]);
    await this.recalcularTotales(id_rendicion);
    return { success: true };
  }

  async eliminarItem(id_rendicion: number, id_item: number) {
    await db.query(`DELETE FROM RendicionItems WHERE id_item = ? AND id_rendicion = ?`, [id_item, id_rendicion]);
    await this.recalcularTotales(id_rendicion);
    return { success: true };
  }

  // ── Adjuntos (Cloudinary) ─────────────────────────────────────
  async subirAdjunto(id_rendicion: number, params: {
    buffer: Buffer; nombre_archivo: string; mime_type?: string;
    tipo: AdjuntoTipo; subido_por_id?: number;
  }) {
    await this.assertExiste(id_rendicion);

    const safeName = params.nombre_archivo.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
    const folder = `metalengineers/rendiciones/${id_rendicion}`;
    // Cloudinary acepta "auto" para PDFs/imágenes
    const upload = await CloudinaryService.subirArchivoGenerico(
      params.buffer, safeName, folder
    );

    const [res]: any = await db.query(`
      INSERT INTO RendicionAdjuntos (
        id_rendicion, tipo, url, public_id, nombre_archivo,
        mime_type, tamano_bytes, subido_por_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id_rendicion, params.tipo, upload.url, upload.public_id ?? null,
      params.nombre_archivo, params.mime_type ?? null,
      params.buffer.length,
      params.subido_por_id ?? null,
    ]);

    return { success: true, id_adjunto: res.insertId, url: upload.url };
  }

  async eliminarAdjunto(id_rendicion: number, id_adjunto: number) {
    const [rows]: any = await db.query(
      `SELECT public_id FROM RendicionAdjuntos WHERE id_adjunto = ? AND id_rendicion = ?`,
      [id_adjunto, id_rendicion]
    );
    const adj = rows[0];
    if (!adj) throw new Error('Adjunto no encontrado.');

    // Best-effort: borrar de Cloudinary si tenemos public_id (no bloquea si falla)
    if (adj.public_id) {
      try { await CloudinaryService.eliminarRecurso(adj.public_id); }
      catch (e: any) { console.warn('[Rendicion] No se pudo borrar de Cloudinary:', e?.message); }
    }
    await db.query(`DELETE FROM RendicionAdjuntos WHERE id_adjunto = ?`, [id_adjunto]);
    return { success: true };
  }

  // ── Firmas ────────────────────────────────────────────────────
  async firmar(id_rendicion: number, tipo: FirmaTipo, id_usuario: number) {
    const camposPorTipo: Record<FirmaTipo, [string, string]> = {
      preparado:  ['preparado_por_id',  'preparado_at'],
      revisado:   ['revisado_por_id',   'revisado_at'],
      autorizado: ['autorizado_por_id', 'autorizado_at'],
    };
    const [colId, colAt] = camposPorTipo[tipo];
    if (!colId) throw new Error(`Tipo de firma inválido: ${tipo}`);

    await db.query(
      `UPDATE Rendiciones SET ${colId} = ?, ${colAt} = NOW(), updated_at = NOW() WHERE id_rendicion = ?`,
      [id_usuario, id_rendicion]
    );

    // Actualizar estado lógico: si tiene 3 firmas -> AUTORIZADA; si tiene 2 -> EN_REVISION
    const r = await this.obtener(id_rendicion);
    let nuevoEstado = r.estado;
    if (r.preparado_por_id && r.revisado_por_id && r.autorizado_por_id) {
      nuevoEstado = 'AUTORIZADA';
    } else if (r.preparado_por_id && r.revisado_por_id) {
      nuevoEstado = 'EN_REVISION';
    } else if (r.preparado_por_id) {
      nuevoEstado = 'EN_REVISION';
    }
    if (nuevoEstado !== r.estado) {
      await db.query(`UPDATE Rendiciones SET estado = ? WHERE id_rendicion = ?`, [nuevoEstado, id_rendicion]);
    }
    return { success: true, estado: nuevoEstado };
  }

  async desfirmar(id_rendicion: number, tipo: FirmaTipo, id_usuario_actor: number, rolActor: string) {
    const camposPorTipo: Record<FirmaTipo, [string, string]> = {
      preparado:  ['preparado_por_id',  'preparado_at'],
      revisado:   ['revisado_por_id',   'revisado_at'],
      autorizado: ['autorizado_por_id', 'autorizado_at'],
    };
    const [colId, colAt] = camposPorTipo[tipo];

    // Solo la propia persona o un GERENTE puede sacar su firma.
    const [rows]: any = await db.query(
      `SELECT ${colId} AS firma_id FROM Rendiciones WHERE id_rendicion = ?`,
      [id_rendicion]
    );
    const r = rows[0];
    if (!r) throw new Error('Rendición no encontrada.');
    if (r.firma_id == null) return { success: true, sin_cambios: true };
    if (r.firma_id !== id_usuario_actor && rolActor !== 'GERENTE') {
      throw new Error('Solo el firmante o un GERENTE puede quitar la firma.');
    }

    await db.query(
      `UPDATE Rendiciones SET ${colId} = NULL, ${colAt} = NULL, updated_at = NOW() WHERE id_rendicion = ?`,
      [id_rendicion]
    );
    return { success: true };
  }

  // ── Eliminar rendición (cascada) ──────────────────────────────
  async eliminar(id_rendicion: number) {
    // Cargar adjuntos para borrar de Cloudinary best-effort
    const [adjs]: any = await db.query(
      `SELECT public_id FROM RendicionAdjuntos WHERE id_rendicion = ? AND public_id IS NOT NULL`,
      [id_rendicion]
    );
    for (const a of (adjs as any[])) {
      try { await CloudinaryService.eliminarRecurso(a.public_id); }
      catch (e: any) { console.warn('[Rendicion] Cloudinary delete falló:', e?.message); }
    }
    await db.query(`DELETE FROM Rendiciones WHERE id_rendicion = ?`, [id_rendicion]);
    return { success: true };
  }

  // ── Internos ──────────────────────────────────────────────────
  private async assertExiste(id_rendicion: number) {
    const [rows]: any = await db.query(
      `SELECT 1 FROM Rendiciones WHERE id_rendicion = ?`,
      [id_rendicion]
    );
    if (!rows[0]) throw new Error('Rendición no encontrada.');
  }

  private async recalcularTotales(id_rendicion: number) {
    const [rows]: any = await db.query(`
      SELECT
        COALESCE(SUM(importe_total), 0) AS total_gastos,
        (SELECT COALESCE(saldo_anterior, 0) + COALESCE(importe_recibido, 0) FROM Rendiciones WHERE id_rendicion = ?) AS fondo_asignado
      FROM RendicionItems WHERE id_rendicion = ?`,
      [id_rendicion, id_rendicion]
    );
    const r = rows[0];
    const totalGastos = Number(r.total_gastos);
    const fondo = Number(r.fondo_asignado);
    const saldo = fondo - totalGastos;
    await db.query(`
      UPDATE Rendiciones
      SET total_gastos = ?, fondo_asignado = ?, saldo_disponible = ?, updated_at = NOW()
      WHERE id_rendicion = ?`,
      [totalGastos, fondo, saldo, id_rendicion]
    );
  }
}

export default new RendicionService();

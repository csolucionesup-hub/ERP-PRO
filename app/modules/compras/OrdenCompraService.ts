/**
 * OrdenCompraService — gestión de Órdenes de Compra.
 *
 * Flujo (estándar mundial, inspirado en SAP B1 / Odoo / Epicor):
 *
 *   BORRADOR   → creada pero no enviada
 *   APROBADA   → aprobada por GERENTE (auto si monto ≤ umbral configurable)
 *   ENVIADA    → enviada al proveedor (estado operativo)
 *   RECIBIDA_PARCIAL → recibió algunas líneas, faltan otras
 *   RECIBIDA   → todas las líneas recibidas, falta factura
 *   FACTURADA  → llegó factura del proveedor, se generó registro en Compras
 *   PAGADA     → pago registrado (estado final)
 *   ANULADA    → descartada antes de facturar
 *
 * Reglas:
 *   - Si total > monto_limite_sin_aprobacion (config) → requiere APROBAR explícito
 *   - Solo quien tiene rol GERENTE o APROBADOR puede aprobar
 *   - No se puede facturar si estado != RECIBIDA o RECIBIDA_PARCIAL
 *   - Al facturar, se crea un registro en Compras con id_oc_origen
 */

import { db } from '../../../database/connection';
import ConfiguracionService from '../configuracion/ConfiguracionService';

export type EstadoOC =
  | 'BORRADOR' | 'APROBADA' | 'ENVIADA'
  | 'RECIBIDA_PARCIAL' | 'RECIBIDA'
  | 'FACTURADA' | 'PAGADA' | 'ANULADA';

export interface LineaOC {
  orden?: number;
  id_item?: number | null;
  codigo?: string | null;
  descripcion: string;
  unidad?: string;
  cantidad: number;
  precio_unitario: number;
}

export interface CrearOCParams {
  fecha_emision: string;
  fecha_entrega_esperada?: string | null;
  id_proveedor: number;
  id_servicio?: number | null;
  centro_costo?: string;
  tipo_oc?: 'GENERAL' | 'SERVICIO' | 'ALMACEN';
  empresa?: 'ME' | 'PT';
  moneda?: 'PEN' | 'USD';
  tipo_cambio?: number;
  aplica_igv?: boolean;
  descuento?: number;
  forma_pago?: 'CONTADO' | 'CREDITO';
  dias_credito?: number;
  condiciones_entrega?: string;
  observaciones?: string;
  lineas: LineaOC[];
  id_usuario?: number;
}

class OrdenCompraService {
  /**
   * Siguiente correlativo por empresa. Formato: OC-YYYY-NNN
   */
  private async proximoNumero(empresa: 'ME' | 'PT', anio: number): Promise<string> {
    const [rows]: any = await db.query(
      `SELECT nro_oc FROM OrdenesCompra WHERE empresa = ?
         AND nro_oc LIKE ?
       ORDER BY id_oc DESC LIMIT 1`,
      [empresa, `OC-${anio}-%`]
    );
    const ultimo = rows[0];
    let siguiente = 1;
    if (ultimo) {
      const partes = ultimo.nro_oc.split('-');
      siguiente = (parseInt(partes[2], 10) || 0) + 1;
    }
    return `OC-${anio}-${String(siguiente).padStart(3, '0')}`;
  }

  /**
   * Crear OC. Si total ≤ monto_limite_sin_aprobacion, auto-aprueba.
   */
  async crear(params: CrearOCParams) {
    const cfg = await ConfiguracionService.getActual();
    const anio = new Date(params.fecha_emision).getFullYear();
    const empresa = params.empresa || 'ME';
    const moneda = params.moneda || 'PEN';
    const tc = Number(params.tipo_cambio) || 1;

    const subtotal = params.lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    const descuento = Number(params.descuento) || 0;
    const baseImponible = Math.max(subtotal - descuento, 0);
    const aplicaIgv = params.aplica_igv !== false && cfg.aplica_igv === 1;
    const igv = aplicaIgv ? Number((baseImponible * (cfg.tasa_igv / 100)).toFixed(2)) : 0;
    const total = Number((baseImponible + igv).toFixed(2));

    // Conversión a PEN para validación contra el umbral
    const totalPEN = moneda === 'PEN' ? total : total * tc;
    const umbral = Number(cfg.monto_limite_sin_aprobacion) || 5000;
    const autoAprobar = totalPEN <= umbral;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const nro_oc = await this.proximoNumero(empresa, anio);
      const estado: EstadoOC = autoAprobar ? 'APROBADA' : 'BORRADOR';

      const [res]: any = await conn.query(
        `INSERT INTO OrdenesCompra
          (nro_oc, fecha_emision, fecha_entrega_esperada, id_proveedor, id_servicio,
           centro_costo, tipo_oc, empresa, moneda, tipo_cambio,
           subtotal, descuento, aplica_igv, igv, total,
           forma_pago, dias_credito, condiciones_entrega, observaciones,
           estado, id_usuario_crea, id_usuario_aprueba, fecha_aprobacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nro_oc, params.fecha_emision, params.fecha_entrega_esperada || null,
         params.id_proveedor, params.id_servicio || null,
         params.centro_costo || 'OFICINA CENTRAL', params.tipo_oc || 'GENERAL',
         empresa, moneda, tc,
         subtotal, descuento, aplicaIgv ? 1 : 0, igv, total,
         params.forma_pago || 'CONTADO', params.dias_credito || 0,
         params.condiciones_entrega || null, params.observaciones || null,
         estado, params.id_usuario || null,
         autoAprobar ? (params.id_usuario || null) : null,
         autoAprobar ? new Date() : null]
      );
      const id_oc = res.insertId;

      // Detalle
      for (let i = 0; i < params.lineas.length; i++) {
        const l = params.lineas[i];
        const lineSub = Number((l.cantidad * l.precio_unitario).toFixed(2));
        await conn.query(
          `INSERT INTO DetalleOrdenCompra
            (id_oc, orden, id_item, codigo, descripcion, unidad, cantidad, precio_unitario, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id_oc, l.orden || (i + 1), l.id_item || null, l.codigo || null,
           l.descripcion, l.unidad || 'UND', l.cantidad, l.precio_unitario, lineSub]
        );
      }

      if (autoAprobar) {
        await conn.query(
          `INSERT INTO AprobacionesOC (id_oc, id_usuario, accion, comentario, monto_total_aprobado, moneda)
           VALUES (?, ?, 'APROBAR', 'Auto-aprobada (monto bajo umbral)', ?, ?)`,
          [id_oc, params.id_usuario || 0, total, moneda]
        );
      }

      await conn.commit();
      return { success: true, id_oc, nro_oc, estado, total, moneda, autoAprobada: autoAprobar };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Aprobar OC (solo GERENTE o APROBADOR).
   */
  async aprobar(id_oc: number, id_usuario: number, rol: string, comentario?: string) {
    if (!['GERENTE', 'APROBADOR'].includes(rol)) {
      throw new Error('Solo GERENTE o APROBADOR pueden aprobar OC');
    }
    const [rows]: any = await db.query('SELECT estado, total, moneda FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    const oc = rows[0];
    if (!oc) throw new Error('OC no encontrada');
    if (oc.estado !== 'BORRADOR') throw new Error(`OC no está en BORRADOR (estado actual: ${oc.estado})`);

    await db.query(
      `UPDATE OrdenesCompra SET estado='APROBADA', id_usuario_aprueba=?, fecha_aprobacion=NOW() WHERE id_oc=?`,
      [id_usuario, id_oc]
    );
    await db.query(
      `INSERT INTO AprobacionesOC (id_oc, id_usuario, accion, comentario, monto_total_aprobado, moneda)
       VALUES (?, ?, 'APROBAR', ?, ?, ?)`,
      [id_oc, id_usuario, comentario || null, oc.total, oc.moneda]
    );
    return { success: true, estado: 'APROBADA' };
  }

  /**
   * Marca la OC como ENVIADA al proveedor (estado logístico).
   */
  async marcarEnviada(id_oc: number) {
    const [rows]: any = await db.query('SELECT estado FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    if (!rows[0]) throw new Error('OC no encontrada');
    if (rows[0].estado !== 'APROBADA') throw new Error(`OC debe estar APROBADA (actual: ${rows[0].estado})`);
    await db.query("UPDATE OrdenesCompra SET estado='ENVIADA' WHERE id_oc=?", [id_oc]);
    return { success: true, estado: 'ENVIADA' };
  }

  /**
   * Registra recepción parcial/total. Si todas las líneas están recibidas → RECIBIDA.
   */
  async recibir(id_oc: number, lineasRecibidas: { id_detalle: number; cantidad_recibida: number }[]) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      for (const l of lineasRecibidas) {
        await conn.query(
          `UPDATE DetalleOrdenCompra SET cantidad_recibida = cantidad_recibida + ? WHERE id_detalle = ?`,
          [l.cantidad_recibida, l.id_detalle]
        );
      }
      // Determinar nuevo estado
      const [rowsDet]: any = await conn.query(
        `SELECT SUM(cantidad) AS total_pedido, SUM(cantidad_recibida) AS total_recibido
         FROM DetalleOrdenCompra WHERE id_oc = ?`, [id_oc]
      );
      const { total_pedido, total_recibido } = rowsDet[0];
      let nuevoEstado: EstadoOC = 'RECIBIDA_PARCIAL';
      if (Number(total_recibido) >= Number(total_pedido) - 0.0001) nuevoEstado = 'RECIBIDA';

      await conn.query(`UPDATE OrdenesCompra SET estado=? WHERE id_oc=?`, [nuevoEstado, id_oc]);
      await conn.commit();
      return { success: true, estado: nuevoEstado };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Convierte la OC en una Compra facturada. Crea el registro en tabla Compras
   * con los datos de la OC. Se llama cuando llega la factura física del proveedor.
   */
  async facturar(id_oc: number, nro_factura_proveedor: string, fecha_factura: string) {
    const [rows]: any = await db.query('SELECT * FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    const oc = rows[0];
    if (!oc) throw new Error('OC no encontrada');
    if (!['RECIBIDA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
      throw new Error(`OC debe estar RECIBIDA para facturar (actual: ${oc.estado})`);
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // Insert en Compras
      const [comp]: any = await conn.query(
        `INSERT INTO Compras
          (nro_factura_proveedor, id_proveedor, fecha, moneda, tipo_cambio,
           monto_base, igv_base, total_base, centro_costo, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADO')`,
        [nro_factura_proveedor, oc.id_proveedor, fecha_factura, oc.moneda, oc.tipo_cambio,
         oc.subtotal - oc.descuento, oc.igv, oc.total, oc.centro_costo]
      );
      const id_compra = comp.insertId;

      await conn.query(
        `UPDATE OrdenesCompra SET estado='FACTURADA', id_compra_generada=? WHERE id_oc=?`,
        [id_compra, id_oc]
      );

      await conn.commit();
      return { success: true, estado: 'FACTURADA', id_compra };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async anular(id_oc: number, motivo: string) {
    const [rows]: any = await db.query('SELECT estado FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    if (!rows[0]) throw new Error('OC no encontrada');
    if (['FACTURADA', 'PAGADA'].includes(rows[0].estado)) {
      throw new Error(`No se puede anular una OC ${rows[0].estado}. Usa Nota de Crédito en su lugar.`);
    }
    await db.query(
      `UPDATE OrdenesCompra SET estado='ANULADA', motivo_anulacion=? WHERE id_oc=?`,
      [motivo, id_oc]
    );
    return { success: true, estado: 'ANULADA' };
  }

  async listar(filtros: {
    estado?: EstadoOC; desde?: string; hasta?: string;
    id_proveedor?: number; empresa?: 'ME' | 'PT'; limit?: number;
  } = {}) {
    const where: string[] = [];
    const vals: any[] = [];
    if (filtros.estado)       { where.push('oc.estado = ?'); vals.push(filtros.estado); }
    if (filtros.desde)        { where.push('oc.fecha_emision >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta)        { where.push('oc.fecha_emision <= ?'); vals.push(filtros.hasta); }
    if (filtros.id_proveedor) { where.push('oc.id_proveedor = ?'); vals.push(filtros.id_proveedor); }
    if (filtros.empresa)      { where.push('oc.empresa = ?'); vals.push(filtros.empresa); }
    const sql = `
      SELECT oc.*, p.razon_social AS proveedor_nombre, s.codigo AS servicio_codigo
      FROM OrdenesCompra oc
      LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
      LEFT JOIN Servicios s ON s.id_servicio = oc.id_servicio
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY oc.fecha_emision DESC, oc.id_oc DESC
      LIMIT ?`;
    vals.push(filtros.limit || 200);
    const [rows] = await db.query(sql, vals);
    return rows;
  }

  async obtener(id_oc: number) {
    const [rows]: any = await db.query(
      `SELECT oc.*, p.razon_social AS proveedor_nombre, p.ruc AS proveedor_ruc
       FROM OrdenesCompra oc
       LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
       WHERE oc.id_oc = ?`,
      [id_oc]
    );
    const oc = rows[0];
    if (!oc) throw new Error('OC no encontrada');
    const [det] = await db.query(
      'SELECT * FROM DetalleOrdenCompra WHERE id_oc = ? ORDER BY orden',
      [id_oc]
    );
    const [apro] = await db.query(
      'SELECT * FROM AprobacionesOC WHERE id_oc = ? ORDER BY fecha DESC',
      [id_oc]
    );
    return { ...oc, detalle: det, aprobaciones: apro };
  }
}

export default new OrdenCompraService();

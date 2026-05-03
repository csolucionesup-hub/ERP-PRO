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

import { db, DEFAULT_ACCOUNT_ID } from '../../../database/connection';
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
  aplica_igv?: boolean | number | string;
  descuento?: number;
  forma_pago?: 'CONTADO' | 'CREDITO';
  dias_credito?: number;
  condiciones_entrega?: string;
  observaciones?: string;
  lineas: LineaOC[];
  id_usuario?: number;

  // Campos PDF (todos opcionales, se autocompletan desde ConfiguracionEmpresa)
  atencion?: string;
  contacto_interno?: string;
  contacto_telefono?: string;
  solicitado_por?: string;
  revisado_por?: string;
  autorizado_por?: string;
  cuenta_bancaria_pago?: string;
  lugar_entrega?: string;
}

class OrdenCompraService {
  /**
   * Siguiente correlativo por (empresa + centro_costo + año). Formato: "NNN - YYYY"
   * Cada centro de costo lleva su propia numeración desde 001.
   * Ejemplo: con CC "ALMACEN METAL" → "001 - 2026", "002 - 2026"...
   *          con CC "OFICINA CENTRAL" → "001 - 2026", "002 - 2026"... (independiente)
   * El UNIQUE constraint en BD es (nro_oc, empresa, centro_costo) para permitir esto.
   */
  private async proximoNumero(empresa: 'ME' | 'PT', centro_costo: string, anio: number): Promise<string> {
    const [rows]: any = await db.query(
      `SELECT nro_oc FROM OrdenesCompra
       WHERE empresa = ? AND centro_costo = ? AND nro_oc LIKE ?
       ORDER BY id_oc DESC LIMIT 1`,
      [empresa, centro_costo, `%- ${anio}`]
    );
    const ultimo = rows[0];
    let siguiente = 1;
    if (ultimo) {
      // Formato "NNN - YYYY" → primer segmento es el número
      const partes = String(ultimo.nro_oc).split('-').map((s: string) => s.trim());
      siguiente = (parseInt(partes[0], 10) || 0) + 1;
    }
    return `${String(siguiente).padStart(3, '0')} - ${anio}`;
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
    // El usuario decide en la UI si aplica IGV (checkbox). La config global solo
    // dicta el default visual del checkbox. Aceptamos true/1/'on'/'true' por
    // tolerancia entre payloads JSON, FormData y drivers de BD.
    const aplicaIgv = params.aplica_igv === true
                   || params.aplica_igv === 1
                   || params.aplica_igv === 'on'
                   || params.aplica_igv === 'true';
    const igv = aplicaIgv ? Number((baseImponible * (Number(cfg.tasa_igv) / 100)).toFixed(2)) : 0;
    const total = Number((baseImponible + igv).toFixed(2));

    // Conversión a PEN para validación contra el umbral
    const totalPEN = moneda === 'PEN' ? total : total * tc;
    const umbral = Number(cfg.monto_limite_sin_aprobacion) || 5000;
    const autoAprobar = totalPEN <= umbral;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const cc = params.centro_costo || 'OFICINA CENTRAL';
      const nro_oc = await this.proximoNumero(empresa, cc, anio);
      const estado: EstadoOC = autoAprobar ? 'APROBADA' : 'BORRADOR';

      // Las firmas y contacto se leen dinámicamente desde Configuración
      // al renderizar el PDF (con fallback al snapshot per-OC si existe).
      // Solo guardamos override explícito por OC; si no, NULL → cfg vivo.
      const solicitado   = params.solicitado_por   || null;
      const revisado     = params.revisado_por     || null;
      const autorizado   = params.autorizado_por   || null;
      const ctactoNombre = params.contacto_interno || null;
      const ctactoTel    = params.contacto_telefono|| null;

      const [res]: any = await conn.query(
        `INSERT INTO OrdenesCompra
          (nro_oc, fecha_emision, fecha_entrega_esperada, id_proveedor, id_servicio,
           centro_costo, tipo_oc, empresa, moneda, tipo_cambio,
           subtotal, descuento, aplica_igv, igv, total,
           forma_pago, dias_credito, condiciones_entrega, observaciones,
           estado, id_usuario_crea, id_usuario_aprueba, fecha_aprobacion,
           atencion, contacto_interno, contacto_telefono,
           solicitado_por, revisado_por, autorizado_por,
           cuenta_bancaria_pago, lugar_entrega)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nro_oc, params.fecha_emision, params.fecha_entrega_esperada || null,
         params.id_proveedor, params.id_servicio || null,
         cc, params.tipo_oc || 'GENERAL',
         empresa, moneda, tc,
         subtotal, descuento, aplicaIgv ? 1 : 0, igv, total,
         params.forma_pago || 'CONTADO', params.dias_credito || 0,
         params.condiciones_entrega || null, params.observaciones || null,
         estado, params.id_usuario || null,
         autoAprobar ? (params.id_usuario || null) : null,
         autoAprobar ? new Date() : null,
         params.atencion || null, ctactoNombre, ctactoTel,
         solicitado, revisado, autorizado,
         params.cuenta_bancaria_pago || null, params.lugar_entrega || 'Lima']
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
   *
   * Para tipo_oc='ALMACEN':
   *   - Valida que toda línea a recibir tenga id_item (sino lanza OC_LINEAS_SIN_ITEM
   *     para que el frontend abra el modal de resolución).
   *   - Por cada línea con id_item: lock pesimista en Inventario, recalcula costo
   *     promedio ponderado (en PEN), actualiza stock y registra ENTRADA en kárdex.
   *   - El precio de la OC se convierte a PEN si moneda='USD' (Inventario almacena
   *     costo en moneda nativa PEN siempre, para consistencia contable).
   *
   * Para tipo_oc='GENERAL' o 'SERVICIO': solo se actualiza cantidad_recibida y el
   * estado de la OC. La afectación financiera ocurre en facturar().
   */
  async recibir(id_oc: number, lineasRecibidas: { id_detalle: number; cantidad_recibida: number }[]) {
    if (!Array.isArray(lineasRecibidas) || lineasRecibidas.length === 0) {
      throw new Error('Debe indicar al menos una línea con cantidad recibida');
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Cabecera OC con lock — necesitamos tipo_oc, moneda y tipo_cambio
      const [ocRows]: any = await conn.query(
        `SELECT id_oc, tipo_oc, moneda, tipo_cambio, estado
         FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE`,
        [id_oc]
      );
      const oc = ocRows[0];
      if (!oc) throw new Error('OC no encontrada');
      if (!['APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
        throw new Error(`OC en estado ${oc.estado} no acepta recepción`);
      }

      const esAlmacen = oc.tipo_oc === 'ALMACEN';
      const tcOC = Number(oc.tipo_cambio) || 1;

      // 2. Si es ALMACEN, validar que todas las líneas tienen id_item asignado
      if (esAlmacen) {
        const idsDetalle = lineasRecibidas.map(l => l.id_detalle);
        const placeholders = idsDetalle.map(() => '?').join(',');
        const [pendientes]: any = await conn.query(
          `SELECT id_detalle, descripcion, unidad, cantidad, precio_unitario
           FROM DetalleOrdenCompra
           WHERE id_oc = ? AND id_detalle IN (${placeholders}) AND id_item IS NULL`,
          [id_oc, ...idsDetalle]
        );
        if ((pendientes as any[]).length > 0) {
          const err: any = new Error(
            `Hay ${(pendientes as any[]).length} línea(s) sin ítem del catálogo asignado. Resolvé antes de recibir.`
          );
          err.code = 'OC_LINEAS_SIN_ITEM';
          err.lineas_pendientes = pendientes;
          err.id_oc = id_oc;
          throw err;
        }
      }

      // 3. Para cada línea: actualizar cantidad_recibida + (si ALMACEN) afectar stock+kárdex
      for (const l of lineasRecibidas) {
        const aRecibir = Number(l.cantidad_recibida);
        if (!aRecibir || aRecibir <= 0) continue;

        const [detRows]: any = await conn.query(
          `SELECT id_detalle, id_item, descripcion, cantidad, cantidad_recibida, precio_unitario
           FROM DetalleOrdenCompra WHERE id_detalle = ? AND id_oc = ?`,
          [l.id_detalle, id_oc]
        );
        const det = detRows[0];
        if (!det) throw new Error(`Detalle ${l.id_detalle} no pertenece a OC ${id_oc}`);

        const yaRecibido = Number(det.cantidad_recibida);
        const pedido = Number(det.cantidad);
        if (yaRecibido + aRecibir > pedido + 0.0001) {
          throw new Error(
            `Línea "${det.descripcion}": pedís recibir ${aRecibir} pero solo quedan ${(pedido - yaRecibido).toFixed(4)}`
          );
        }

        await conn.query(
          `UPDATE DetalleOrdenCompra SET cantidad_recibida = cantidad_recibida + ? WHERE id_detalle = ?`,
          [aRecibir, l.id_detalle]
        );

        if (esAlmacen && det.id_item) {
          // Lock pesimista del ítem
          const [invRows]: any = await conn.query(
            `SELECT stock_actual, costo_promedio_unitario FROM Inventario WHERE id_item = ? FOR UPDATE`,
            [det.id_item]
          );
          const inv = invRows[0];
          if (!inv) throw new Error(`Item id=${det.id_item} no existe en catálogo`);

          const stockActual = Number(inv.stock_actual);
          const cppActual = Number(inv.costo_promedio_unitario);
          const precio = Number(det.precio_unitario);
          // Inventario almacena costo en PEN — convertir si la OC es USD
          const precioPEN = oc.moneda === 'USD' ? precio * tcOC : precio;

          const stockNuevo = stockActual + aRecibir;
          const cppNuevo = stockNuevo > 0
            ? (stockActual * cppActual + aRecibir * precioPEN) / stockNuevo
            : precioPEN;

          await conn.query(
            `UPDATE Inventario SET stock_actual = ?, costo_promedio_unitario = ?, updated_at = NOW() WHERE id_item = ?`,
            [stockNuevo, cppNuevo.toFixed(4), det.id_item]
          );

          await conn.query(
            `INSERT INTO MovimientosInventario
              (id_item, referencia_tipo, referencia_id, tipo_movimiento, cantidad, saldo_posterior, fecha_movimiento)
             VALUES (?, 'ORDEN_COMPRA', ?, 'ENTRADA', ?, ?, NOW())`,
            [det.id_item, id_oc, aRecibir, stockNuevo]
          );
        }
      }

      // 4. Determinar nuevo estado por totales
      const [totRows]: any = await conn.query(
        `SELECT COALESCE(SUM(cantidad), 0) AS total_pedido,
                COALESCE(SUM(cantidad_recibida), 0) AS total_recibido
         FROM DetalleOrdenCompra WHERE id_oc = ?`,
        [id_oc]
      );
      const { total_pedido, total_recibido } = totRows[0];
      const nuevoEstado: EstadoOC =
        Number(total_recibido) >= Number(total_pedido) - 0.0001 ? 'RECIBIDA' : 'RECIBIDA_PARCIAL';

      await conn.query(`UPDATE OrdenesCompra SET estado = ? WHERE id_oc = ?`, [nuevoEstado, id_oc]);
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
   * Convierte la OC en factura recibida. El comportamiento depende del tipo_oc:
   *
   *   ALMACEN  → INSERT Compras + DetalleCompra (id_item, cantidad recibida) +
   *              Transaccion EGRESO. El stock e Inventario YA fueron afectados
   *              en recibir(); aquí solo se registra el documento contable.
   *
   *   SERVICIO → INSERT Gastos (tipo_gasto_logistica='SERVICIO', id_servicio) +
   *              Transaccion EGRESO + INSERT CostosServicio (para que el costo
   *              aparezca en la rentabilidad del proyecto).
   *
   *   GENERAL  → INSERT Gastos (tipo_gasto_logistica='GENERAL') + Transaccion
   *              EGRESO. Centro de costo OFICINA CENTRAL u otro definido en OC.
   *
   * En los tres casos OC pasa a estado FACTURADA. Solo ALMACEN setea
   * id_compra_generada (para los otros, la referencia es vía nro_oc en Gastos).
   */
  async facturar(id_oc: number, nro_factura_proveedor: string, fecha_factura: string) {
    const [rows]: any = await db.query(
      `SELECT oc.*, p.razon_social AS proveedor_nombre
         FROM OrdenesCompra oc
         LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
        WHERE oc.id_oc = ?`,
      [id_oc]
    );
    const oc = rows[0];
    if (!oc) throw new Error('OC no encontrada');
    if (!['RECIBIDA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
      throw new Error(`OC debe estar RECIBIDA para facturar (actual: ${oc.estado})`);
    }

    const tcOC = Number(oc.tipo_cambio) || 1;
    const monto_base_pen = (Number(oc.subtotal) - Number(oc.descuento || 0)) * tcOC;
    const igv_base_pen = Number(oc.igv) * tcOC;
    const total_base_pen = Number(oc.total) * tcOC;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      let id_compra: number | null = null;
      let id_gasto: number | null = null;

      if (oc.tipo_oc === 'ALMACEN') {
        // 1. Compras (cabecera)
        const [comp]: any = await conn.query(
          `INSERT INTO Compras
            (nro_oc, nro_comprobante, id_proveedor, fecha, moneda, tipo_cambio,
             aplica_igv, monto_base, igv_base, total_base, centro_costo,
             estado, estado_pago)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADA', ?)`,
          [
            oc.nro_oc, nro_factura_proveedor, oc.id_proveedor, fecha_factura,
            oc.moneda, tcOC, !!oc.aplica_igv,
            monto_base_pen, igv_base_pen, total_base_pen,
            oc.centro_costo,
            oc.forma_pago === 'CONTADO' ? 'PAGADO' : 'PENDIENTE',
          ]
        );
        id_compra = comp.insertId;

        // 2. DetalleCompra desde DetalleOrdenCompra (solo líneas con id_item y cantidad recibida)
        const [detalles]: any = await conn.query(
          `SELECT id_item, cantidad_recibida, precio_unitario
             FROM DetalleOrdenCompra
            WHERE id_oc = ? AND id_item IS NOT NULL AND cantidad_recibida > 0`,
          [id_oc]
        );
        for (const d of (detalles as any[])) {
          const cant = Number(d.cantidad_recibida);
          const precio = Number(d.precio_unitario);
          await conn.query(
            `INSERT INTO DetalleCompra (id_compra, id_item, cantidad, precio_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?)`,
            [id_compra, d.id_item, cant, precio, cant * precio]
          );
        }

        // 3. Transaccion EGRESO
        await conn.query(
          `INSERT INTO Transacciones
            (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento,
             moneda, tipo_cambio, aplica_igv,
             monto_original, igv_original, total_original,
             monto_base, igv_base, total_base,
             fecha, descripcion, estado)
           VALUES (?, 'COMPRA', ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            DEFAULT_ACCOUNT_ID, id_compra, oc.moneda, tcOC, !!oc.aplica_igv,
            Number(oc.subtotal) - Number(oc.descuento || 0), Number(oc.igv), Number(oc.total),
            monto_base_pen, igv_base_pen, total_base_pen,
            fecha_factura, `Compra OC ${oc.nro_oc} · Fact ${nro_factura_proveedor}`,
            oc.forma_pago === 'CONTADO' ? 'REALIZADO' : 'PENDIENTE',
          ]
        );
      } else {
        // SERVICIO o GENERAL → Gastos
        const tipo_logi = oc.tipo_oc === 'SERVICIO' ? 'SERVICIO' : 'GENERAL';
        const concepto = `Factura por OC ${oc.nro_oc}`;

        const [gastoRes]: any = await conn.query(
          `INSERT INTO Gastos
            (nro_oc, id_servicio, tipo_gasto, centro_costo, tipo_gasto_logistica,
             fecha, concepto, proveedor_nombre, nro_comprobante,
             moneda, tipo_cambio, aplica_igv,
             monto_base, igv_base, total_base, estado, estado_pago)
           VALUES (?, ?, 'OPERATIVO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADO', ?)`,
          [
            oc.nro_oc, oc.id_servicio || null,
            oc.centro_costo, tipo_logi,
            fecha_factura, concepto,
            oc.proveedor_nombre || null, nro_factura_proveedor,
            oc.moneda, tcOC, !!oc.aplica_igv,
            monto_base_pen, igv_base_pen, total_base_pen,
            oc.forma_pago === 'CONTADO' ? 'PAGADO' : 'PENDIENTE',
          ]
        );
        id_gasto = gastoRes.insertId;

        // Transaccion EGRESO
        await conn.query(
          `INSERT INTO Transacciones
            (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento,
             moneda, tipo_cambio, aplica_igv,
             monto_original, igv_original, total_original,
             monto_base, igv_base, total_base,
             fecha, descripcion, estado)
           VALUES (?, 'GASTO', ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            DEFAULT_ACCOUNT_ID, id_gasto, oc.moneda, tcOC, !!oc.aplica_igv,
            Number(oc.subtotal) - Number(oc.descuento || 0), Number(oc.igv), Number(oc.total),
            monto_base_pen, igv_base_pen, total_base_pen,
            fecha_factura, `Gasto OC ${oc.nro_oc} · Fact ${nro_factura_proveedor}`,
            oc.forma_pago === 'CONTADO' ? 'REALIZADO' : 'PENDIENTE',
          ]
        );

        // Si SERVICIO, registrar en CostosServicio para rentabilidad de proyecto
        if (oc.tipo_oc === 'SERVICIO' && oc.id_servicio) {
          await conn.query(
            `INSERT INTO CostosServicio
              (id_servicio, concepto, moneda, monto_original, tipo_cambio, monto_base, tipo_costo, fecha)
             VALUES (?, ?, ?, ?, ?, ?, 'GASTO_OC', ?)`,
            [
              oc.id_servicio, `OC ${oc.nro_oc} · Fact ${nro_factura_proveedor}`,
              oc.moneda, Number(oc.total), tcOC, total_base_pen, fecha_factura,
            ]
          );
        }
      }

      await conn.query(
        `UPDATE OrdenesCompra SET estado = 'FACTURADA', id_compra_generada = ? WHERE id_oc = ?`,
        [id_compra, id_oc]
      );

      await conn.commit();
      return { success: true, estado: 'FACTURADA', id_compra, id_gasto, tipo_oc: oc.tipo_oc };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Elimina físicamente una OC. Solo permitido en BORRADOR o APROBADA — en
   * estados posteriores ya hay compromiso operativo (PDF enviado al proveedor,
   * mercadería entrante, factura recibida) y debe usarse `anular()`.
   *
   * BD: tanto DetalleOrdenCompra como AprobacionesOC tienen FK con ON DELETE
   * CASCADE, así que un solo DELETE limpia el árbol entero. Como no permitimos
   * eliminar después de APROBADA, garantiza que `id_compra_generada` es NULL
   * (recién se setea al facturar) — no hay nada que revertir en Compras.
   */
  /**
   * Actualiza SOLO la fecha de emisión de una OC. Para corregir data histórica
   * sin disparar hooks de estado, sin re-asignar correlativo, sin re-calcular
   * totales ni nada.
   *
   * Disponible en cualquier estado excepto ANULADA. El correlativo `nro_oc`
   * (`NNN - YYYY`) se mantiene aunque cambies el año de la fecha — si querés
   * corregir el correlativo también es un caso aparte, no se hace acá.
   */
  async actualizarFecha(id_oc: number, fecha_emision: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_emision)) {
      throw new Error('Fecha inválida — debe ser YYYY-MM-DD');
    }
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT estado FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE`,
        [id_oc]
      );
      const oc = rows[0];
      if (!oc) throw new Error('OC no encontrada');
      if (oc.estado === 'ANULADA') {
        throw new Error('No se puede editar la fecha de una OC anulada');
      }
      await conn.query(
        `UPDATE OrdenesCompra SET fecha_emision = ? WHERE id_oc = ?`,
        [fecha_emision, id_oc]
      );
      await conn.commit();
      return { ok: true, fecha_emision };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async eliminar(id_oc: number) {
    const [rows]: any = await db.query('SELECT estado FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    if (!rows[0]) throw new Error('OC no encontrada');
    const estado: EstadoOC = rows[0].estado;
    if (!['BORRADOR', 'APROBADA'].includes(estado)) {
      throw new Error(
        `Solo se puede eliminar una OC en BORRADOR o APROBADA (actual: ${estado}). ` +
        `Para estados posteriores, usá Anular.`
      );
    }
    await db.query('DELETE FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    return { success: true };
  }

  /**
   * Actualiza una OC existente. Permitido en BORRADOR / APROBADA / ENVIADA —
   * después la mercadería ya fue recibida y editar cambiaría datos contables.
   *
   * Recalcula totales desde las líneas, usa transacción y reemplaza el detalle
   * (DELETE + INSERT) — mismo patrón que `updateCotizacion`.
   */
  async actualizar(id_oc: number, params: CrearOCParams) {
    const [rows]: any = await db.query('SELECT estado FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    if (!rows[0]) throw new Error('OC no encontrada');
    const estado: EstadoOC = rows[0].estado;
    if (!['BORRADOR', 'APROBADA', 'ENVIADA'].includes(estado)) {
      throw new Error(
        `Solo se puede editar una OC en BORRADOR, APROBADA o ENVIADA (actual: ${estado}). ` +
        `Para estados posteriores, anulá y creá una nueva.`
      );
    }

    const cfg = await ConfiguracionService.getActual();
    const moneda = params.moneda || 'PEN';
    const tc = Number(params.tipo_cambio) || 1;
    const subtotal = params.lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    const descuento = Number(params.descuento) || 0;
    const baseImponible = Math.max(subtotal - descuento, 0);
    const aplicaIgv = params.aplica_igv === true
                   || params.aplica_igv === 1
                   || params.aplica_igv === 'on'
                   || params.aplica_igv === 'true';
    const igv = aplicaIgv ? Number((baseImponible * (Number(cfg.tasa_igv) / 100)).toFixed(2)) : 0;
    const total = Number((baseImponible + igv).toFixed(2));

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query(
        `UPDATE OrdenesCompra SET
           fecha_emision = ?, fecha_entrega_esperada = ?,
           id_proveedor = ?, id_servicio = ?, centro_costo = ?, tipo_oc = ?,
           empresa = ?, moneda = ?, tipo_cambio = ?,
           subtotal = ?, descuento = ?, aplica_igv = ?, igv = ?, total = ?,
           forma_pago = ?, dias_credito = ?, condiciones_entrega = ?, observaciones = ?,
           atencion = ?, contacto_interno = ?, contacto_telefono = ?,
           solicitado_por = ?, revisado_por = ?, autorizado_por = ?,
           cuenta_bancaria_pago = ?, lugar_entrega = ?
         WHERE id_oc = ?`,
        [params.fecha_emision, params.fecha_entrega_esperada || null,
         params.id_proveedor, params.id_servicio || null,
         params.centro_costo || 'OFICINA CENTRAL', params.tipo_oc || 'GENERAL',
         params.empresa || 'ME', moneda, tc,
         subtotal, descuento, aplicaIgv ? 1 : 0, igv, total,
         params.forma_pago || 'CONTADO', params.dias_credito || 0,
         params.condiciones_entrega || null, params.observaciones || null,
         params.atencion || null, params.contacto_interno || null, params.contacto_telefono || null,
         params.solicitado_por || null, params.revisado_por || null, params.autorizado_por || null,
         params.cuenta_bancaria_pago || null, params.lugar_entrega || 'Lima',
         id_oc]
      );

      // Reemplazar detalle: el FK con CASCADE simplifica esto a un DELETE + N inserts.
      await conn.query('DELETE FROM DetalleOrdenCompra WHERE id_oc = ?', [id_oc]);
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

      await conn.commit();
      return { success: true, id_oc, estado, total, moneda };
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

  /**
   * Revertir una anulación accidental: vuelve la OC a BORRADOR para que
   * pueda editarse y re-aprobarse. Solo aplica si la OC está ANULADA.
   * Limpia motivo_anulacion para no dejar traza fantasma.
   */
  async reactivar(id_oc: number) {
    const [rows]: any = await db.query('SELECT estado FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
    if (!rows[0]) throw new Error('OC no encontrada');
    if (rows[0].estado !== 'ANULADA') {
      throw new Error(`Solo se puede reactivar una OC ANULADA (actual: ${rows[0].estado}).`);
    }
    await db.query(
      `UPDATE OrdenesCompra SET estado='BORRADOR', motivo_anulacion=NULL WHERE id_oc=?`,
      [id_oc]
    );
    return { success: true, estado: 'BORRADOR' };
  }

  async listar(filtros: {
    estado?: EstadoOC; desde?: string; hasta?: string;
    id_proveedor?: number; empresa?: 'ME' | 'PT'; limit?: number;
    tipo_oc?: 'GENERAL' | 'SERVICIO' | 'ALMACEN';
    centro_costo?: string;
    id_servicio?: number;
  } = {}) {
    const where: string[] = [];
    const vals: any[] = [];
    if (filtros.estado)       { where.push('oc.estado = ?'); vals.push(filtros.estado); }
    if (filtros.desde)        { where.push('oc.fecha_emision >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta)        { where.push('oc.fecha_emision <= ?'); vals.push(filtros.hasta); }
    if (filtros.id_proveedor) { where.push('oc.id_proveedor = ?'); vals.push(filtros.id_proveedor); }
    if (filtros.empresa)      { where.push('oc.empresa = ?'); vals.push(filtros.empresa); }
    if (filtros.tipo_oc)      { where.push('oc.tipo_oc = ?'); vals.push(filtros.tipo_oc); }
    if (filtros.centro_costo) { where.push('oc.centro_costo = ?'); vals.push(filtros.centro_costo); }
    if (filtros.id_servicio)  { where.push('oc.id_servicio = ?'); vals.push(filtros.id_servicio); }
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
      `SELECT oc.*,
              p.razon_social AS proveedor_nombre,
              p.ruc          AS proveedor_ruc,
              p.tipo         AS proveedor_tipo,
              p.dni          AS proveedor_dni,
              p.direccion    AS proveedor_direccion,
              p.telefono     AS proveedor_telefono,
              p.email        AS proveedor_email,
              p.banco_1_nombre AS proveedor_banco_1_nombre,
              p.banco_1_numero AS proveedor_banco_1_numero,
              p.banco_1_cci    AS proveedor_banco_1_cci,
              p.banco_1_moneda AS proveedor_banco_1_moneda,
              p.banco_2_nombre AS proveedor_banco_2_nombre,
              p.banco_2_numero AS proveedor_banco_2_numero,
              p.banco_2_cci    AS proveedor_banco_2_cci,
              p.banco_2_moneda AS proveedor_banco_2_moneda
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

  /**
   * Asigna ítems del catálogo Inventario a líneas de DetalleOrdenCompra.
   * Usado por el modal de resolución cuando recibir() devuelve OC_LINEAS_SIN_ITEM.
   *
   * Solo permite la asignación si la OC todavía no tiene cantidad_recibida en
   * la línea (sino la afectación de inventario sería ambigua). Verifica que el
   * id_item exista en Inventario.
   */
  async asignarItemsALineas(id_oc: number, asignaciones: { id_detalle: number; id_item: number }[]) {
    if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
      throw new Error('Debe indicar al menos una asignación id_detalle → id_item');
    }
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // Verificar que la OC existe y está en estado editable de detalle
      const [ocRows]: any = await conn.query(
        `SELECT estado FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE`, [id_oc]
      );
      if (!ocRows[0]) throw new Error('OC no encontrada');

      for (const a of asignaciones) {
        // Validar que el item existe
        const [invRows]: any = await conn.query(
          `SELECT id_item FROM Inventario WHERE id_item = ?`, [a.id_item]
        );
        if (!invRows[0]) throw new Error(`Ítem ${a.id_item} no existe en Inventario`);

        // Validar que la línea existe en la OC y no tiene cantidad_recibida
        const [detRows]: any = await conn.query(
          `SELECT cantidad_recibida FROM DetalleOrdenCompra
            WHERE id_detalle = ? AND id_oc = ?`,
          [a.id_detalle, id_oc]
        );
        if (!detRows[0]) throw new Error(`Línea ${a.id_detalle} no pertenece a la OC ${id_oc}`);
        if (Number(detRows[0].cantidad_recibida) > 0) {
          throw new Error(
            `Línea ${a.id_detalle} ya tiene cantidad recibida — no se puede reasignar item`
          );
        }

        await conn.query(
          `UPDATE DetalleOrdenCompra SET id_item = ? WHERE id_detalle = ? AND id_oc = ?`,
          [a.id_item, a.id_detalle, id_oc]
        );
      }
      await conn.commit();
      return { success: true, asignados: asignaciones.length };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default new OrdenCompraService();

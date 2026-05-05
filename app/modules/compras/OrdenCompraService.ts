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
  | 'FACTURADA' | 'PAGADA_PEND_FACTURA' | 'PAGADA' | 'ANULADA'
  | 'CERRADA_SIN_FACTURA';

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
  /**
   * Cotización vinculada (caso típico OC SERVICIO). Reemplaza el rol que
   * tenía id_servicio cuando el "proyecto" para vos es una cotización
   * aprobada del cliente. Picker en el form filtra por moneda + año.
   */
  id_cotizacion?: number | null;
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

  /**
   * Correlativo manual (OPCIONAL). Solo se respeta si:
   *   - permitir_correlativo_manual está ON en ConfiguracionEmpresa
   *   - El usuario es GERENTE
   *   - Formato: "NNN - YYYY"
   *   - Año coincide con año de fecha_emision
   *   - Fecha en ventana válida (24m + año actual)
   *   - No existe ya en (empresa, centro_costo)
   */
  nro_oc?: string;

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
   * Valida un correlativo manual de OC en modo migración.
   * Lanza Error si alguna validación falla.
   */
  private async validarNroOcManual(
    runner: any,
    nroManual: string,
    fechaEmision: string,
    empresa: string,
    centroCosto: string,
    rolUsuario: string
  ): Promise<void> {
    if (rolUsuario !== 'GERENTE') {
      throw new Error('Solo el GERENTE puede usar correlativos manuales (modo migración)');
    }
    const cfg = await ConfiguracionService.getActual();
    if (!cfg.permitir_correlativo_manual) {
      throw new Error(
        'El modo migración no está activo. Activálo en Configuración → Empresa para tipear correlativos manualmente.'
      );
    }
    const formatoOK = /^\d{3}\s*-\s*\d{4}$/.test(nroManual);
    if (!formatoOK) {
      throw new Error('Formato inválido. Esperado: "NNN - YYYY". Ejemplo: 001 - 2025');
    }
    const partes = nroManual.split('-').map(s => s.trim());
    const anioCorr = parseInt(partes[1], 10);
    const anioFecha = parseInt(fechaEmision.split('-')[0], 10);
    if (anioCorr !== anioFecha) {
      throw new Error(
        `El año del correlativo (${anioCorr}) no coincide con el año de fecha_emision (${anioFecha})`
      );
    }
    // Ventana: 24 meses hacia atrás + año actual
    const today = new Date();
    const min = new Date(today);
    min.setMonth(min.getMonth() - 24);
    const max = new Date(today.getFullYear(), 11, 31);
    const f = new Date(fechaEmision);
    if (isNaN(f.getTime()) || f < min || f > max) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      throw new Error(
        `Fecha ${fechaEmision} fuera de la ventana de carga histórica permitida. Rango válido: ${fmt(min)} → ${fmt(max)}`
      );
    }
    // No duplicado dentro del mismo (empresa, centro_costo) — el contador es por CC
    const nroNormal = `${partes[0]} - ${partes[1]}`;
    const [dupRows]: any = await runner.query(
      `SELECT id_oc, id_proveedor FROM OrdenesCompra
        WHERE empresa = ? AND centro_costo = ? AND nro_oc = ? LIMIT 1`,
      [empresa, centroCosto, nroNormal]
    );
    if ((dupRows as any[]).length > 0) {
      throw new Error(
        `El correlativo "${nroNormal}" ya está en uso para empresa ${empresa} / centro de costo "${centroCosto}". Verificá el número o dejá el campo vacío para asignación automática.`
      );
    }
  }

  /**
   * Crear OC. Si total ≤ monto_limite_sin_aprobacion, auto-aprueba.
   * `params.es_honorario` (opcional) marca la OC como honorario por trabajo
   * realizado de persona natural — solo se setea desde el flujo dedicado en
   * Administración. Default FALSE para todas las OCs creadas desde Logística.
   */
  async crear(params: CrearOCParams & { es_honorario?: boolean }, opts: { rol?: string } = {}) {
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

      // Decidir correlativo: manual (modo migración) o automático
      let nro_oc: string;
      const nroManual = (params.nro_oc || '').trim();
      if (nroManual) {
        await this.validarNroOcManual(conn, nroManual, params.fecha_emision, empresa, cc, opts.rol || '');
        // Normalizar formato (espacios consistentes)
        const partes = nroManual.split('-').map(s => s.trim());
        nro_oc = `${partes[0]} - ${partes[1]}`;
      } else {
        nro_oc = await this.proximoNumero(empresa, cc, anio);
      }
      const estado: EstadoOC = autoAprobar ? 'APROBADA' : 'BORRADOR';

      // Las firmas y contacto se leen dinámicamente desde Configuración
      // al renderizar el PDF (con fallback al snapshot per-OC si existe).
      // Solo guardamos override explícito por OC; si no, NULL → cfg vivo.
      const solicitado   = params.solicitado_por   || null;
      const revisado     = params.revisado_por     || null;
      const autorizado   = params.autorizado_por   || null;
      const ctactoNombre = params.contacto_interno || null;
      const ctactoTel    = params.contacto_telefono|| null;

      const esHonorario = (params as any).es_honorario === true;
      const [res]: any = await conn.query(
        `INSERT INTO OrdenesCompra
          (nro_oc, fecha_emision, fecha_entrega_esperada, id_proveedor, id_servicio, id_cotizacion,
           centro_costo, tipo_oc, empresa, moneda, tipo_cambio,
           subtotal, descuento, aplica_igv, igv, total,
           forma_pago, dias_credito, condiciones_entrega, observaciones,
           estado, id_usuario_crea, id_usuario_aprueba, fecha_aprobacion,
           atencion, contacto_interno, contacto_telefono,
           solicitado_por, revisado_por, autorizado_por,
           cuenta_bancaria_pago, lugar_entrega, es_honorario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nro_oc, params.fecha_emision, params.fecha_entrega_esperada || null,
         params.id_proveedor, params.id_servicio || null, params.id_cotizacion || null,
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
         params.cuenta_bancaria_pago || null, params.lugar_entrega || 'Lima',
         esHonorario]
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

      // Snapshot de costo de mano de obra para OCs honorario con cotización.
      // Permite que el dashboard de rentabilidad de la cotización vea el costo
      // INMEDIATAMENTE al crear la OC, sin esperar a la facturación. Cubre
      // también el caso CERRADA_SIN_FACTURA (típico de personas naturales
      // que no facturan, solo dan recibo por honorarios).
      // facturar() detecta este snapshot y NO duplica el insert.
      if (esHonorario && params.id_cotizacion) {
        const totalPEN = moneda === 'PEN' ? total : Number((total * tc).toFixed(2));
        // Resolver nombre del proveedor para concepto descriptivo.
        const [provRows]: any = await conn.query(
          `SELECT razon_social FROM Proveedores WHERE id_proveedor = ?`,
          [params.id_proveedor]
        );
        const personaNombre = (provRows[0]?.razon_social || 'persona').toUpperCase();
        await conn.query(
          `INSERT INTO CostosServicio
            (id_servicio, id_cotizacion, concepto, moneda,
             monto_original, tipo_cambio, monto_base, tipo_costo, fecha)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'MANO_OBRA_OC', ?)`,
          [
            null, params.id_cotizacion,
            `Honorario ${personaNombre} · OC ${nro_oc}`,
            moneda, total, tc, totalPEN, params.fecha_emision,
          ]
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
    if (!['RECIBIDA', 'RECIBIDA_PARCIAL', 'PAGADA_PEND_FACTURA'].includes(oc.estado)) {
      throw new Error(`OC debe estar RECIBIDA o PAGADA_PEND_FACTURA para facturar (actual: ${oc.estado})`);
    }

    // Caso B: OC ya pagada (PAGADA_PEND_FACTURA) — solo enriquecer comprobante
    // existente con nro_factura + transición a PAGADA. NO se crea Compra/Gasto/Tx
    // ni MovimientoBancario porque ya se hicieron en registrarPago().
    if (oc.estado === 'PAGADA_PEND_FACTURA') {
      const conn = await db.getConnection();
      await conn.beginTransaction();
      try {
        if (oc.tipo_oc === 'ALMACEN' && oc.id_compra_generada) {
          await conn.query(
            `UPDATE Compras SET nro_comprobante = ?, fecha = ? WHERE id_compra = ?`,
            [nro_factura_proveedor, fecha_factura, oc.id_compra_generada]
          );
        } else {
          await conn.query(
            `UPDATE Gastos SET nro_comprobante = ?, fecha = ? WHERE nro_oc = ? AND estado <> 'ANULADO'`,
            [nro_factura_proveedor, fecha_factura, oc.nro_oc]
          );
        }
        await conn.query(
          `UPDATE OrdenesCompra SET estado = 'PAGADA', facturada_at = NOW() WHERE id_oc = ?`,
          [id_oc]
        );
        await conn.commit();
        return { success: true, estado: 'PAGADA' as const, id_compra: oc.id_compra_generada, id_gasto: null, tipo_oc: oc.tipo_oc };
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
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

        // Si SERVICIO, registrar en CostosServicio para rentabilidad de proyecto.
        // Nuevo flujo: vincula por id_cotizacion (preferido). Legacy: id_servicio.
        // CHECK constraint exige que al menos uno de los dos esté poblado.
        // Skip si es OC honorario: ya hay snapshot insertado en crear() con
        // tipo_costo='MANO_OBRA_OC'. Insertar acá duplicaría el costo.
        if (oc.tipo_oc === 'SERVICIO' && !oc.es_honorario && (oc.id_cotizacion || oc.id_servicio)) {
          await conn.query(
            `INSERT INTO CostosServicio
              (id_servicio, id_cotizacion, concepto, moneda, monto_original,
               tipo_cambio, monto_base, tipo_costo, fecha)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'GASTO_OC', ?)`,
            [
              oc.id_servicio || null,
              oc.id_cotizacion || null,
              `OC ${oc.nro_oc} · Fact ${nro_factura_proveedor}`,
              oc.moneda, Number(oc.total), tcOC, total_base_pen, fecha_factura,
            ]
          );
        }
      }

      await conn.query(
        `UPDATE OrdenesCompra SET estado = 'FACTURADA', facturada_at = NOW(), id_compra_generada = ? WHERE id_oc = ?`,
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
   * Registra el pago al proveedor. Soporta dos casos:
   *
   * A) Desde estado FACTURADA: la factura ya fue ingresada. Solo se registra
   *    el movimiento bancario (CARGO), se actualiza estado_pago de Compra/Gasto
   *    a PAGADO, se marca la Tx EGRESO como REALIZADO y la OC pasa a PAGADA.
   *
   * B) Desde estado RECIBIDA o RECIBIDA_PARCIAL: pago anticipado sin factura
   *    todavía (caso típico Perú). Se crea Compra/Gasto provisorio con
   *    nro_comprobante=NULL, DetalleCompra (si ALMACEN), Tx EGRESO REALIZADO,
   *    MovBancario, CostosServicio si aplica. La OC pasa a PAGADA_PEND_FACTURA.
   *    Cuando llegue la factura, se llama a facturar() para enriquecer el
   *    comprobante con nro_comprobante y mover OC a PAGADA.
   */
  async registrarPago(id_oc: number, datos: {
    id_cuenta: number;
    fecha_pago: string;
    nro_operacion?: string;
    observaciones?: string;
  }) {
    const [rows]: any = await db.query(
      `SELECT oc.*, p.razon_social AS proveedor_nombre
         FROM OrdenesCompra oc
         LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
        WHERE oc.id_oc = ?`,
      [id_oc]
    );
    const oc = rows[0];
    if (!oc) throw new Error('OC no encontrada');
    if (!['RECIBIDA', 'RECIBIDA_PARCIAL', 'FACTURADA'].includes(oc.estado)) {
      throw new Error(`OC debe estar RECIBIDA o FACTURADA para registrar pago (actual: ${oc.estado})`);
    }

    const tcOC = Number(oc.tipo_cambio) || 1;
    const total_base_pen = Number(oc.total) * tcOC;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // ── CASO A: ya estaba FACTURADA → cerrar a PAGADA ──────────────────
      if (oc.estado === 'FACTURADA') {
        if (oc.tipo_oc === 'ALMACEN' && oc.id_compra_generada) {
          await conn.query(
            `UPDATE Compras SET estado_pago = 'PAGADO' WHERE id_compra = ?`,
            [oc.id_compra_generada]
          );
          await conn.query(
            `UPDATE Transacciones SET estado = 'REALIZADO', id_cuenta = ?
              WHERE referencia_tipo = 'COMPRA' AND referencia_id = ? AND estado = 'PENDIENTE'`,
            [datos.id_cuenta, oc.id_compra_generada]
          );
        } else {
          await conn.query(
            `UPDATE Gastos SET estado_pago = 'PAGADO' WHERE nro_oc = ? AND estado <> 'ANULADO'`,
            [oc.nro_oc]
          );
          await conn.query(
            `UPDATE Transacciones SET estado = 'REALIZADO', id_cuenta = ?
              WHERE referencia_tipo = 'GASTO'
                AND referencia_id IN (SELECT id_gasto FROM Gastos WHERE nro_oc = ? AND estado <> 'ANULADO')
                AND estado = 'PENDIENTE'`,
            [datos.id_cuenta, oc.nro_oc]
          );
        }

        const refTipo = oc.tipo_oc === 'ALMACEN' ? 'COMPRA' : 'GASTO';
        const refId = oc.tipo_oc === 'ALMACEN' ? oc.id_compra_generada : null;
        await conn.query(
          `INSERT INTO MovimientoBancario
             (id_cuenta, fecha, fecha_proceso, nro_operacion, descripcion_banco,
              monto, tipo, fuente, estado_conciliacion, ref_tipo, ref_id, comentario)
           VALUES (?, ?, ?, ?, ?, ?, 'CARGO', 'MANUAL', 'CONCILIADO', ?, ?, ?)`,
          [
            datos.id_cuenta, datos.fecha_pago, datos.fecha_pago,
            datos.nro_operacion || null,
            `Pago OC ${oc.nro_oc} · ${oc.proveedor_nombre || ''}`,
            total_base_pen, refTipo, refId, datos.observaciones || null,
          ]
        );

        await conn.query(
          `UPDATE OrdenesCompra SET estado = 'PAGADA', pagada_at = ? WHERE id_oc = ?`,
          [datos.fecha_pago, id_oc]
        );

        await conn.commit();
        return { success: true, estado: 'PAGADA' as const, id_oc };
      }

      // ── CASO B: RECIBIDA / RECIBIDA_PARCIAL → pago sin factura aún ─────
      const monto_base_pen = (Number(oc.subtotal) - Number(oc.descuento || 0)) * tcOC;
      const igv_base_pen = Number(oc.igv) * tcOC;

      let id_compra: number | null = null;
      let id_gasto: number | null = null;

      if (oc.tipo_oc === 'ALMACEN') {
        const [comp]: any = await conn.query(
          `INSERT INTO Compras
            (nro_oc, nro_comprobante, id_proveedor, fecha, moneda, tipo_cambio,
             aplica_igv, monto_base, igv_base, total_base, centro_costo,
             estado, estado_pago)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADA', 'PAGADO')`,
          [
            oc.nro_oc, oc.id_proveedor, datos.fecha_pago,
            oc.moneda, tcOC, !!oc.aplica_igv,
            monto_base_pen, igv_base_pen, total_base_pen,
            oc.centro_costo,
          ]
        );
        id_compra = comp.insertId;

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

        await conn.query(
          `INSERT INTO Transacciones
            (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento,
             moneda, tipo_cambio, aplica_igv,
             monto_original, igv_original, total_original,
             monto_base, igv_base, total_base,
             fecha, descripcion, estado)
           VALUES (?, 'COMPRA', ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REALIZADO')`,
          [
            datos.id_cuenta, id_compra, oc.moneda, tcOC, !!oc.aplica_igv,
            Number(oc.subtotal) - Number(oc.descuento || 0), Number(oc.igv), Number(oc.total),
            monto_base_pen, igv_base_pen, total_base_pen,
            datos.fecha_pago, `Pago anticipado OC ${oc.nro_oc} (sin factura aún)`,
          ]
        );

        await conn.query(
          `UPDATE OrdenesCompra SET id_compra_generada = ? WHERE id_oc = ?`,
          [id_compra, id_oc]
        );
      } else {
        // SERVICIO / GENERAL → Gasto provisorio
        const tipo_logi = oc.tipo_oc === 'SERVICIO' ? 'SERVICIO' : 'GENERAL';
        const concepto = `Pago anticipado OC ${oc.nro_oc} (sin factura aún)`;

        const [gastoRes]: any = await conn.query(
          `INSERT INTO Gastos
            (nro_oc, id_servicio, tipo_gasto, centro_costo, tipo_gasto_logistica,
             fecha, concepto, proveedor_nombre, nro_comprobante,
             moneda, tipo_cambio, aplica_igv,
             monto_base, igv_base, total_base, estado, estado_pago)
           VALUES (?, ?, 'OPERATIVO', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'CONFIRMADO', 'PAGADO')`,
          [
            oc.nro_oc, oc.id_servicio || null,
            oc.centro_costo, tipo_logi,
            datos.fecha_pago, concepto,
            oc.proveedor_nombre || null,
            oc.moneda, tcOC, !!oc.aplica_igv,
            monto_base_pen, igv_base_pen, total_base_pen,
          ]
        );
        id_gasto = gastoRes.insertId;

        await conn.query(
          `INSERT INTO Transacciones
            (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento,
             moneda, tipo_cambio, aplica_igv,
             monto_original, igv_original, total_original,
             monto_base, igv_base, total_base,
             fecha, descripcion, estado)
           VALUES (?, 'GASTO', ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REALIZADO')`,
          [
            datos.id_cuenta, id_gasto, oc.moneda, tcOC, !!oc.aplica_igv,
            Number(oc.subtotal) - Number(oc.descuento || 0), Number(oc.igv), Number(oc.total),
            monto_base_pen, igv_base_pen, total_base_pen,
            datos.fecha_pago, `Pago anticipado OC ${oc.nro_oc} (sin factura aún)`,
          ]
        );

        if (oc.tipo_oc === 'SERVICIO' && !oc.es_honorario && (oc.id_cotizacion || oc.id_servicio)) {
          await conn.query(
            `INSERT INTO CostosServicio
              (id_servicio, id_cotizacion, concepto, moneda, monto_original,
               tipo_cambio, monto_base, tipo_costo, fecha)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'GASTO_OC', ?)`,
            [
              oc.id_servicio || null,
              oc.id_cotizacion || null,
              `Pago anticipado OC ${oc.nro_oc}`,
              oc.moneda, Number(oc.total), tcOC, total_base_pen, datos.fecha_pago,
            ]
          );
        }
      }

      // MovBancario para ambos casos
      const refTipo = oc.tipo_oc === 'ALMACEN' ? 'COMPRA' : 'GASTO';
      const refId = oc.tipo_oc === 'ALMACEN' ? id_compra : id_gasto;
      await conn.query(
        `INSERT INTO MovimientoBancario
           (id_cuenta, fecha, fecha_proceso, nro_operacion, descripcion_banco,
            monto, tipo, fuente, estado_conciliacion, ref_tipo, ref_id, comentario)
         VALUES (?, ?, ?, ?, ?, ?, 'CARGO', 'MANUAL', 'CONCILIADO', ?, ?, ?)`,
        [
          datos.id_cuenta, datos.fecha_pago, datos.fecha_pago,
          datos.nro_operacion || null,
          `Pago anticipado OC ${oc.nro_oc} · ${oc.proveedor_nombre || ''} (sin factura aún)`,
          total_base_pen, refTipo, refId, datos.observaciones || null,
        ]
      );

      await conn.query(
        `UPDATE OrdenesCompra SET estado = 'PAGADA_PEND_FACTURA', pagada_at = ? WHERE id_oc = ?`,
        [datos.fecha_pago, id_oc]
      );

      await conn.commit();
      return { success: true, estado: 'PAGADA_PEND_FACTURA' as const, id_oc, id_compra, id_gasto };
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

  /**
   * Editar metadata "segura" de una OC en cualquier estado (excepto ANULADA).
   * Cubre campos que NO afectan números/contabilidad: centro_costo, observaciones,
   * atencion, contactos, firmas, lugar de entrega, fecha entrega esperada.
   *
   * No toca: líneas, montos, proveedor, moneda, tipo_oc, total. Para esos
   * cambios usar actualizar() (que requiere reverso de Tx/Compras/Gastos).
   *
   * Si la OC tiene un Gasto asociado (CERRADA_SIN_FACTURA / FACTURADA con Gasto),
   * propaga centro_costo y concepto al Gasto para mantener consistencia en
   * los reportes contables.
   */
  async editarMetadata(id_oc: number, data: {
    centro_costo?: string;
    observaciones?: string;
    atencion?: string;
    contacto_interno?: string;
    contacto_telefono?: string;
    solicitado_por?: string;
    revisado_por?: string;
    autorizado_por?: string;
    cuenta_bancaria_pago?: string;
    lugar_entrega?: string;
    fecha_entrega_esperada?: string | null;
    concepto?: string;  // alias para concepto del Gasto si aplica
  }) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        'SELECT estado, nro_oc, centro_costo FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE',
        [id_oc]
      );
      const oc = rows[0];
      if (!oc) throw new Error('OC no encontrada');
      if (oc.estado === 'ANULADA') {
        throw new Error('No se puede editar una OC anulada');
      }

      // Construir UPDATE solo con campos enviados
      const FIELDS_OC: (keyof typeof data)[] = [
        'centro_costo', 'observaciones', 'atencion',
        'contacto_interno', 'contacto_telefono',
        'solicitado_por', 'revisado_por', 'autorizado_por',
        'cuenta_bancaria_pago', 'lugar_entrega', 'fecha_entrega_esperada',
      ];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const f of FIELDS_OC) {
        if (data[f] !== undefined) {
          sets.push(`${f} = ?`);
          vals.push(data[f] === '' ? null : data[f]);
        }
      }
      if (sets.length) {
        vals.push(id_oc);
        await conn.query(
          `UPDATE OrdenesCompra SET ${sets.join(', ')} WHERE id_oc = ?`,
          vals
        );
      }

      // Si hay Gasto asociado, propagar centro_costo + concepto. Buscamos
      // por nro_oc (relación implícita).
      if (data.centro_costo !== undefined || data.concepto !== undefined) {
        const setsGasto: string[] = [];
        const valsGasto: any[] = [];
        if (data.centro_costo !== undefined) {
          setsGasto.push('centro_costo = ?');
          valsGasto.push(data.centro_costo || null);
        }
        if (data.concepto !== undefined && data.concepto.trim()) {
          setsGasto.push('concepto = ?');
          valsGasto.push(data.concepto.trim());
        }
        if (setsGasto.length) {
          valsGasto.push(oc.nro_oc);
          await conn.query(
            `UPDATE Gastos SET ${setsGasto.join(', ')} WHERE nro_oc = ?`,
            valsGasto
          );
        }
      }

      await conn.commit();
      return { success: true };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Elimina FÍSICAMENTE una OC en CUALQUIER estado, con cascada completa de
   * todos los registros derivados. Solo GERENTE (validado en ruta).
   *
   * Reverso por estado:
   *   - ANULADA / BORRADOR / APROBADA / ENVIADA → DELETE OC (cascade FK
   *     a DetalleOrdenCompra y AprobacionesOC ya configurado).
   *   - RECIBIDA / RECIBIDA_PARCIAL → si tipo=ALMACEN, revertir stock e
   *     inventario por cada movimiento ENTRADA + DELETE movimientos.
   *   - CERRADA_SIN_FACTURA → DELETE Gasto + Tx asociados.
   *   - FACTURADA → DELETE Compra/Gasto + DetalleCompra + Tx + (si ALMACEN)
   *     reverso de Inventario + (si SERVICIO) DELETE CostosServicio.
   *   - PAGADA → mismo que FACTURADA.
   *
   * Para data del 2025/2026 que se cargó mal y querés borrar limpio.
   */
  async eliminar(id_oc: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT id_oc, nro_oc, estado, tipo_oc, id_compra_generada
           FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE`,
        [id_oc]
      );
      const oc = rows[0];
      if (!oc) throw new Error('OC no encontrada');

      // 1. Revertir Inventario si la OC ALMACEN registró stock
      if (oc.tipo_oc === 'ALMACEN') {
        const [movs]: any = await conn.query(
          `SELECT id_movimiento, id_item, cantidad
             FROM MovimientosInventario
            WHERE referencia_tipo = 'ORDEN_COMPRA' AND referencia_id = ?`,
          [id_oc]
        );
        for (const m of (movs as any[])) {
          // Lock pesimista del ítem
          const [invRows]: any = await conn.query(
            `SELECT stock_actual, costo_promedio_unitario
               FROM Inventario WHERE id_item = ? FOR UPDATE`,
            [m.id_item]
          );
          const inv = invRows[0];
          if (!inv) continue;
          const stockActual = Number(inv.stock_actual);
          const cppActual = Number(inv.costo_promedio_unitario);
          const cantRev = Number(m.cantidad);
          // Restamos lo que la entrada agregó
          const stockNuevo = Math.max(0, stockActual - cantRev);
          // Para el costo promedio: revertir aproximadamente — fórmula inversa.
          // No es perfecto porque depende del orden histórico, pero mantiene
          // consistencia razonable. Si el stock queda en 0, dejamos cpp tal cual.
          await conn.query(
            `UPDATE Inventario SET stock_actual = ?, updated_at = NOW() WHERE id_item = ?`,
            [stockNuevo, m.id_item]
          );
        }
        // DELETE de los movimientos de kárdex
        await conn.query(
          `DELETE FROM MovimientosInventario
            WHERE referencia_tipo = 'ORDEN_COMPRA' AND referencia_id = ?`,
          [id_oc]
        );
      }

      // 2. Si la OC generó Compra (ALMACEN facturada), borrar Compra +
      //    DetalleCompra + Transacciones COMPRA asociadas
      if (oc.id_compra_generada) {
        await conn.query(
          `DELETE FROM Transacciones
            WHERE referencia_tipo = 'COMPRA' AND referencia_id = ?`,
          [oc.id_compra_generada]
        );
        await conn.query(
          `DELETE FROM DetalleCompra WHERE id_compra = ?`,
          [oc.id_compra_generada]
        );
        await conn.query(
          `DELETE FROM Compras WHERE id_compra = ?`,
          [oc.id_compra_generada]
        );
      }

      // 3. Si hay Gastos asociados (CERRADA_SIN_FACTURA o FACTURADA tipo
      //    GENERAL/SERVICIO), borrarlos + sus Transacciones GASTO.
      const [gastos]: any = await conn.query(
        `SELECT id_gasto FROM Gastos WHERE nro_oc = ?`,
        [oc.nro_oc]
      );
      for (const g of (gastos as any[])) {
        await conn.query(
          `DELETE FROM Transacciones
            WHERE referencia_tipo = 'GASTO' AND referencia_id = ?`,
          [g.id_gasto]
        );
        await conn.query(
          `DELETE FROM Gastos WHERE id_gasto = ?`,
          [g.id_gasto]
        );
      }

      // 4. CostosServicio asociados (caso SERVICIO con cotización vinculada).
      //    Match por concepto que contiene el nro_oc — heurística conservadora.
      await conn.query(
        `DELETE FROM CostosServicio
          WHERE concepto LIKE ?`,
        [`%${oc.nro_oc}%`]
      );

      // 5. Finalmente DELETE de la OC. DetalleOrdenCompra y AprobacionesOC
      //    tienen FK ON DELETE CASCADE — se limpian solos.
      await conn.query(`DELETE FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]);

      await conn.commit();
      return { success: true, estado_previo: oc.estado, nro_oc: oc.nro_oc };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Actualiza una OC existente. Permitido en BORRADOR / APROBADA / ENVIADA —
   * después la mercadería ya fue recibida y editar cambiaría datos contables.
   *
   * Recalcula totales desde las líneas, usa transacción y reemplaza el detalle
   * (DELETE + INSERT) — mismo patrón que `updateCotizacion`.
   */
  async actualizar(id_oc: number, params: CrearOCParams) {
    const [rows]: any = await db.query(
      `SELECT estado, nro_oc, es_honorario FROM OrdenesCompra WHERE id_oc = ?`,
      [id_oc]
    );
    if (!rows[0]) throw new Error('OC no encontrada');
    const estado: EstadoOC = rows[0].estado;
    const nroOcAnterior: string = rows[0].nro_oc;
    const eraHonorario: boolean = !!rows[0].es_honorario;
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
           id_proveedor = ?, id_servicio = ?, id_cotizacion = ?, centro_costo = ?, tipo_oc = ?,
           empresa = ?, moneda = ?, tipo_cambio = ?,
           subtotal = ?, descuento = ?, aplica_igv = ?, igv = ?, total = ?,
           forma_pago = ?, dias_credito = ?, condiciones_entrega = ?, observaciones = ?,
           atencion = ?, contacto_interno = ?, contacto_telefono = ?,
           solicitado_por = ?, revisado_por = ?, autorizado_por = ?,
           cuenta_bancaria_pago = ?, lugar_entrega = ?
         WHERE id_oc = ?`,
        [params.fecha_emision, params.fecha_entrega_esperada || null,
         params.id_proveedor, params.id_servicio || null, params.id_cotizacion || null,
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

      // Si la OC era honorario, refrescar el snapshot de CostosServicio para
      // que refleje el nuevo monto. Defensivo: borra cualquier snapshot previo
      // por id_cotizacion + nro_oc (vivo o anulado) antes de re-insertar.
      if (eraHonorario && params.id_cotizacion) {
        await conn.query(
          `DELETE FROM CostosServicio
            WHERE id_cotizacion = ?
              AND tipo_costo = 'MANO_OBRA_OC'
              AND concepto LIKE ?`,
          [params.id_cotizacion, `%OC ${nroOcAnterior}%`]
        );
        const totalPEN = moneda === 'PEN' ? total : Number((total * tc).toFixed(2));
        const [provRows]: any = await conn.query(
          `SELECT razon_social FROM Proveedores WHERE id_proveedor = ?`,
          [params.id_proveedor]
        );
        const personaNombre = (provRows[0]?.razon_social || 'persona').toUpperCase();
        await conn.query(
          `INSERT INTO CostosServicio
            (id_servicio, id_cotizacion, concepto, moneda,
             monto_original, tipo_cambio, monto_base, tipo_costo, fecha)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'MANO_OBRA_OC', ?)`,
          [
            null, params.id_cotizacion,
            `Honorario ${personaNombre} · OC ${nroOcAnterior}`,
            moneda, total, tc, totalPEN, params.fecha_emision,
          ]
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
    const [rows]: any = await db.query(
      `SELECT estado, nro_oc, es_honorario, id_cotizacion FROM OrdenesCompra WHERE id_oc = ?`,
      [id_oc]
    );
    if (!rows[0]) throw new Error('OC no encontrada');
    if (['FACTURADA', 'PAGADA'].includes(rows[0].estado)) {
      throw new Error(`No se puede anular una OC ${rows[0].estado}. Usa Nota de Crédito en su lugar.`);
    }
    await db.query(
      `UPDATE OrdenesCompra SET estado='ANULADA', motivo_anulacion=? WHERE id_oc=?`,
      [motivo, id_oc]
    );
    // Si era honorario, revertir el snapshot de costo en CostosServicio.
    // Match por concepto que contiene el nro_oc — mismo patrón que eliminar().
    if (rows[0].es_honorario && rows[0].id_cotizacion) {
      await db.query(
        `DELETE FROM CostosServicio
          WHERE id_cotizacion = ?
            AND tipo_costo = 'MANO_OBRA_OC'
            AND concepto LIKE ?`,
        [rows[0].id_cotizacion, `%OC ${rows[0].nro_oc}%`]
      );
    }
    return { success: true, estado: 'ANULADA' };
  }

  /**
   * Revertir una anulación accidental: vuelve la OC a BORRADOR para que
   * pueda editarse y re-aprobarse. Solo aplica si la OC está ANULADA.
   * Limpia motivo_anulacion para no dejar traza fantasma.
   */
  async reactivar(id_oc: number) {
    const [rows]: any = await db.query(
      `SELECT oc.estado, oc.nro_oc, oc.es_honorario, oc.id_cotizacion,
              oc.id_proveedor, oc.fecha_emision, oc.moneda, oc.tipo_cambio, oc.total,
              p.razon_social
         FROM OrdenesCompra oc
         LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
        WHERE oc.id_oc = ?`,
      [id_oc]
    );
    const oc = rows[0];
    if (!oc) throw new Error('OC no encontrada');
    if (oc.estado !== 'ANULADA') {
      throw new Error(`Solo se puede reactivar una OC ANULADA (actual: ${oc.estado}).`);
    }
    await db.query(
      `UPDATE OrdenesCompra SET estado='BORRADOR', motivo_anulacion=NULL WHERE id_oc=?`,
      [id_oc]
    );
    // Si era honorario, recrear el snapshot de costo en CostosServicio (que se
    // borró al anular). Defensivo contra duplicados con DELETE previo.
    if (oc.es_honorario && oc.id_cotizacion) {
      await db.query(
        `DELETE FROM CostosServicio
          WHERE id_cotizacion = ? AND tipo_costo = 'MANO_OBRA_OC' AND concepto LIKE ?`,
        [oc.id_cotizacion, `%OC ${oc.nro_oc}%`]
      );
      const tc = Number(oc.tipo_cambio) || 1;
      const total = Number(oc.total);
      const totalPEN = oc.moneda === 'PEN' ? total : Number((total * tc).toFixed(2));
      const persona = (oc.razon_social || 'persona').toUpperCase();
      await db.query(
        `INSERT INTO CostosServicio
          (id_servicio, id_cotizacion, concepto, moneda,
           monto_original, tipo_cambio, monto_base, tipo_costo, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'MANO_OBRA_OC', ?)`,
        [
          null, oc.id_cotizacion,
          `Honorario ${persona} · OC ${oc.nro_oc}`,
          oc.moneda, total, tc, totalPEN, oc.fecha_emision,
        ]
      );
    }
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

  /**
   * Cierra una OC sin factura formal del proveedor (caja chica, gastos
   * menores). Genera Gasto + Transacción EGRESO + (si SERVICIO) CostosServicio.
   * NO crea Factura. La OC queda en CERRADA_SIN_FACTURA con estado_pago=PAGADO.
   *
   * Si la factura aparece tarde, usar asociarFacturaTardia() para enriquecer
   * el Gasto existente con el nro_comprobante.
   */
  async cerrarSinFactura(
    id_oc: number,
    data: { concepto?: string; forma_pago_real?: string },
    opts: { id_usuario?: number } = {}
  ) {
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
      throw new Error(`OC debe estar RECIBIDA para cerrar sin factura (actual: ${oc.estado})`);
    }
    if (oc.tipo_oc === 'ALMACEN') {
      throw new Error('OC ALMACEN NO puede cerrarse sin factura — las compras de stock requieren comprobante');
    }

    const tcOC = Number(oc.tipo_cambio) || 1;
    const monto_base_pen = (Number(oc.subtotal) - Number(oc.descuento || 0)) * tcOC;
    const igv_base_pen = Number(oc.igv) * tcOC;
    const total_base_pen = Number(oc.total) * tcOC;
    const fechaCierre = new Date().toISOString().slice(0, 10);
    const conceptoFinal = (data.concepto || '').trim() || `Gasto sin factura — OC ${oc.nro_oc}`;
    const formaPagoReal = (data.forma_pago_real || 'EFECTIVO').toUpperCase();

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Insertar Gasto sin nro_comprobante
      const tipo_logi = oc.tipo_oc === 'SERVICIO' ? 'SERVICIO' : 'GENERAL';
      const [gastoRes]: any = await conn.query(
        `INSERT INTO Gastos
          (nro_oc, id_servicio, tipo_gasto, centro_costo, tipo_gasto_logistica,
           fecha, concepto, proveedor_nombre, nro_comprobante,
           moneda, tipo_cambio, aplica_igv,
           monto_base, igv_base, total_base, estado, estado_pago)
         VALUES (?, ?, 'OPERATIVO', ?, ?, ?, ?, ?, NULL,
                 ?, ?, ?, ?, ?, ?, 'CONFIRMADO', 'PAGADO')`,
        [
          oc.nro_oc, oc.id_servicio || null,
          oc.centro_costo, tipo_logi,
          fechaCierre, conceptoFinal,
          oc.proveedor_nombre || null,
          oc.moneda, tcOC, !!oc.aplica_igv,
          monto_base_pen, igv_base_pen, total_base_pen,
        ]
      );
      const id_gasto = gastoRes.insertId;

      // 2. Transacción EGRESO (estado REALIZADO porque ya se pagó)
      await conn.query(
        `INSERT INTO Transacciones
          (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento,
           moneda, tipo_cambio, aplica_igv,
           monto_original, igv_original, total_original,
           monto_base, igv_base, total_base,
           fecha, descripcion, estado)
         VALUES (?, 'GASTO', ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REALIZADO')`,
        [
          DEFAULT_ACCOUNT_ID, id_gasto, oc.moneda, tcOC, !!oc.aplica_igv,
          Number(oc.subtotal) - Number(oc.descuento || 0), Number(oc.igv), Number(oc.total),
          monto_base_pen, igv_base_pen, total_base_pen,
          fechaCierre, `OC ${oc.nro_oc} cerrada sin factura · ${formaPagoReal}`,
        ]
      );

      // 3. Si SERVICIO con vínculo a cotización → CostosServicio
      if (oc.tipo_oc === 'SERVICIO' && (oc.id_cotizacion || oc.id_servicio)) {
        await conn.query(
          `INSERT INTO CostosServicio
            (id_servicio, id_cotizacion, concepto, moneda, monto_original,
             tipo_cambio, monto_base, tipo_costo, fecha)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'GASTO_OC_SIN_FACTURA', ?)`,
          [
            oc.id_servicio || null,
            oc.id_cotizacion || null,
            `OC ${oc.nro_oc} sin factura — ${conceptoFinal}`,
            oc.moneda, Number(oc.total), tcOC, total_base_pen, fechaCierre,
          ]
        );
      }

      // 4. UPDATE OC. OrdenesCompra NO tiene columna estado_pago — el estado
      // terminal "pagado" se refleja con estado='CERRADA_SIN_FACTURA' (la
      // tabla Gastos sí tiene estado_pago='PAGADO' que ya seteamos arriba).
      await conn.query(
        `UPDATE OrdenesCompra
            SET estado = 'CERRADA_SIN_FACTURA',
                observaciones = COALESCE(?, observaciones)
          WHERE id_oc = ?`,
        [
          (oc.observaciones ? oc.observaciones + ' · ' : '') +
          `[Cerrada sin factura · ${formaPagoReal}] ${conceptoFinal}`,
          id_oc,
        ]
      );

      await conn.commit();
      return {
        success: true,
        estado: 'CERRADA_SIN_FACTURA',
        id_gasto,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Asocia una factura tardía a una OC que estaba CERRADA_SIN_FACTURA.
   * Enriquece el Gasto existente con nro_comprobante + fecha_factura, mueve
   * la OC a FACTURADA. NO crea Factura nueva — solo agrega el dato del
   * comprobante al Gasto que ya existe.
   *
   * Sirve para casos donde el proveedor entrega la factura semanas después
   * y querés mantener trazabilidad de gastos sin perder el registro original.
   */
  async asociarFacturaTardia(
    id_oc: number,
    data: { nro_comprobante: string; fecha_factura: string }
  ) {
    const nroComp = (data.nro_comprobante || '').trim();
    if (!nroComp) throw new Error('nro_comprobante requerido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_factura || '')) {
      throw new Error('fecha_factura debe ser YYYY-MM-DD');
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT id_oc, estado, nro_oc FROM OrdenesCompra WHERE id_oc = ? FOR UPDATE`,
        [id_oc]
      );
      const oc = rows[0];
      if (!oc) throw new Error('OC no encontrada');
      if (oc.estado !== 'CERRADA_SIN_FACTURA') {
        throw new Error(`Solo OCs en CERRADA_SIN_FACTURA pueden asociar factura tardía (actual: ${oc.estado})`);
      }

      // Buscar el Gasto generado al cerrar (vía nro_oc — único entre Gastos)
      const [gastosRows]: any = await conn.query(
        `SELECT id_gasto FROM Gastos WHERE nro_oc = ? AND nro_comprobante IS NULL ORDER BY id_gasto DESC LIMIT 1`,
        [oc.nro_oc]
      );
      const idGasto = gastosRows[0]?.id_gasto;
      if (!idGasto) {
        throw new Error('No se encontró el Gasto asociado al cierre de la OC. Contactá soporte.');
      }

      // Enriquecer el Gasto con el comprobante
      await conn.query(
        `UPDATE Gastos
            SET nro_comprobante = ?, fecha = ?, tipo_ultima_accion = 'FACTURA_TARDIA'
          WHERE id_gasto = ?`,
        [nroComp, data.fecha_factura, idGasto]
      );

      // Mover OC a FACTURADA
      await conn.query(
        `UPDATE OrdenesCompra SET estado = 'FACTURADA' WHERE id_oc = ?`,
        [id_oc]
      );

      await conn.commit();
      return { success: true, estado: 'FACTURADA', id_gasto: idGasto };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
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
              p.banco_2_moneda AS proveedor_banco_2_moneda,
              cot.nro_cotizacion AS cotizacion_nro,
              cot.cliente        AS cotizacion_cliente,
              cot.proyecto       AS cotizacion_proyecto,
              cot.moneda         AS cotizacion_moneda,
              cot.total          AS cotizacion_total
       FROM OrdenesCompra oc
       LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
       LEFT JOIN Cotizaciones cot ON cot.id_cotizacion = oc.id_cotizacion
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

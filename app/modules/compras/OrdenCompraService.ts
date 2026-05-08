/**
 * OrdenCompraService — gestión de Órdenes de Compra.
 *
 * Flujo (estándar mundial, inspirado en SAP B1 / Odoo / Epicor):
 *
 *   BORRADOR    → creada pero no aprobada
 *   APROBADA    → aprobada por GERENTE (auto si monto ≤ umbral configurable)
 *   PAGO        → bandeja de Finanzas, esperando primer pago/crédito
 *   RECEPCION   → ya hay pago/parcial/crédito; se está recibiendo mercadería
 *   FACTURACION → recepción y/o pago listos; falta factura del proveedor
 *   TERMINADA   → todo cerrado (pagado + recibido + facturado)
 *   CERRADA_SIN_FACTURA → cerrada sin comprobante formal
 *   ANULADA     → descartada antes de facturar
 *
 * Reglas:
 *   - Toda OC nueva arranca en BORRADOR; pasa a APROBADA al darle "Lista para aprobación"
 *   - Solo quien tiene rol GERENTE o APROBADOR puede aprobar
 *   - No se puede facturar si estado != RECEPCION o FACTURACION
 *   - Al facturar, se crea un registro en Compras con id_oc_origen
 */

import { db, DEFAULT_ACCOUNT_ID } from '../../../database/connection';
import ConfiguracionService from '../configuracion/ConfiguracionService';

export type EstadoOC =
  | 'BORRADOR' | 'APROBADA' | 'PAGO' | 'RECEPCION' | 'FACTURACION'
  | 'TERMINADA' | 'CERRADA_SIN_FACTURA' | 'ANULADA';

export type EstadoFactura = 'PENDIENTE' | 'FACTURADA' | 'SIN_FACTURA';
export type EstadoRecepcion = 'NO_RECIBIDO' | 'PARCIAL' | 'RECIBIDO';

/** Constante única — todos los umbrales de alertas de OC en días. */
export const UMBRAL_ALERTA_DIAS = 15;

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
   * Crear OC. Toda OC nueva arranca en BORRADOR — el revisor decide cuándo
   * marcarla "lista para aprobación" desde el kanban.
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

    // Toda OC nueva arranca en BORRADOR — el revisor decide cuándo dejarla
    // "lista para aprobación". La auto-aprobación por monto se removió 07/05/2026
    // a pedido de Julio (vaciaba la columna BORRADOR del kanban).
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
      const estado: EstadoOC = 'BORRADOR';

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
         null,
         null,
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
      return { success: true, id_oc, nro_oc, estado, total, moneda, autoAprobada: false };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Aprobar OC (solo GERENTE o APROBADOR).
   * BORRADOR → APROBADA. La card se queda en APROBADA esperando que alguien
   * dé el "Aprobado para pago" (puesto de control de revisión humana).
   */
  /**
   * Aprobar OC — atajo "todo en uno" para GERENTE/APROBADOR.
   *
   * Mig 065 introdujo multifirma (3 casilleros: PREPARADO/REVISADO/AUTORIZADO).
   * Este método queda como wrapper de compat: firma los 3 casilleros con el
   * mismo usuario en cascada, lo que garantiza que se alcance cualquier umbral
   * configurado en OCFirmasReglas (1, 2 o 3 firmas) y la OC pase a APROBADA.
   *
   * Si Julio quiere aprobación más estricta, usa el modal de firmas individual
   * (firmar/desfirmar) en lugar de este atajo.
   */
  async aprobar(id_oc: number, id_usuario_aprueba: number, rol: string, comentario?: string) {
    if (!['GERENTE', 'APROBADOR'].includes(rol)) {
      throw new Error('Solo GERENTE o APROBADOR pueden aprobar OC');
    }
    // Import lazy para evitar ciclo de imports entre los dos services.
    const OCFirmasService = (await import('./OCFirmasService')).default;
    let resultado: any = null;
    for (const cas of ['preparado', 'revisado', 'autorizado'] as const) {
      resultado = await OCFirmasService.firmar(id_oc, cas, id_usuario_aprueba, rol, comentario);
      // Si tras firmar uno la OC ya pasó a APROBADA (umbral=1 o 2), cortamos
      // el bucle — los siguientes firmar() rechazarían porque la OC ya no
      // está en BORRADOR.
      if (resultado.estado === 'APROBADA') break;
    }
    return { success: true, estado: resultado?.estado || 'BORRADOR' };
  }

  /**
   * Pasar de APROBADA a PAGO ("Aprobado para pago").
   * Es el segundo gate de control: alguien revisó la OC ya aprobada y la
   * despacha a la bandeja de Finanzas para que registre el pago o crédito.
   */
  async aprobarParaPago(id_oc: number, id_usuario: number) {
    const [rows]: any = await db.query(
      'SELECT estado FROM OrdenesCompra WHERE id_oc = ?', [id_oc]
    );
    if (!rows[0]) throw new Error('OC no encontrada');
    if (rows[0].estado !== 'APROBADA') {
      throw new Error(`OC no está en APROBADA (estado actual: ${rows[0].estado})`);
    }

    await db.query(`UPDATE OrdenesCompra SET estado='PAGO' WHERE id_oc=?`, [id_oc]);
    await this._registrarTransicion(id_oc, 'APROBADA', 'PAGO', id_usuario, 'Aprobado para pago — bandeja Finanzas');

    return { success: true, estado: 'PAGO' as const };
  }

  /**
   * Pasar de RECEPCION a FACTURACION ("Listo para subir facturas/RH").
   * Tercer gate: en RECEPCION se cierran pago y recepción. Una vez ambas
   * al 100%, este método mueve la card a FACTURACION donde recién se sube
   * el comprobante.
   *
   * Reglas duras:
   *   - estado === 'RECEPCION'
   *   - estado_pago === 'PAGADO' (saldo cerrado)
   *   - todas las líneas con cantidad_recibida = cantidad
   */
  async marcarListoParaFacturar(id_oc: number, id_usuario: number) {
    const [rows]: any = await db.query(
      `SELECT estado, estado_pago, tipo_oc, es_honorario FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]
    );
    if (!rows[0]) throw new Error('OC no encontrada');
    const oc = rows[0];
    if (oc.estado !== 'RECEPCION') {
      throw new Error(`OC no está en RECEPCION (actual: ${oc.estado})`);
    }
    if (oc.estado_pago !== 'PAGADO') {
      throw new Error('El pago no está cerrado al 100%. Termine de pagar antes de avanzar a facturación.');
    }

    // Solo se valida recepción si el tipo de OC la requiere (ALMACEN o servicios/honorarios).
    // Las OCs GENERAL no-honorario no tienen mercadería ni trabajo a recibir.
    if (this._requiereRecepcion(oc.tipo_oc, oc.es_honorario)) {
      const [det]: any = await db.query(`
        SELECT SUM(cantidad) AS pedido, SUM(cantidad_recibida) AS recibido
          FROM DetalleOrdenCompra
         WHERE id_oc = ?
      `, [id_oc]);
      const pedido = Number(det[0]?.pedido || 0);
      const recibido = Number(det[0]?.recibido || 0);
      if (recibido < pedido - 0.0001) {
        throw new Error(`Recepción incompleta (${recibido}/${pedido}). Termine de recibir antes de avanzar a facturación.`);
      }
    }

    await db.query(`UPDATE OrdenesCompra SET estado='FACTURACION' WHERE id_oc=?`, [id_oc]);
    await this._registrarTransicion(id_oc, 'RECEPCION', 'FACTURACION', id_usuario, 'Listo para subir facturas/RH');

    return { success: true, estado: 'FACTURACION' as const };
  }

  /**
   * Marca la OC como crédito al proveedor. Setea forma_pago=CREDITO y calcula
   * fecha_credito_vence desde dias_credito (o desde el body). Mueve la card de
   * PAGO a RECEPCION inmediatamente.
   */
  async marcarCredito(id_oc: number, params: { dias_credito?: number; fecha_vence?: string; id_usuario?: number | null }) {
    const [rows]: any = await db.query(
      'SELECT estado, dias_credito FROM OrdenesCompra WHERE id_oc = ?',
      [id_oc]
    );
    if (!rows[0]) throw new Error('OC no encontrada');
    if (!['APROBADA', 'PAGO'].includes(rows[0].estado)) {
      throw new Error(`OC en estado ${rows[0].estado} no puede marcarse como crédito`);
    }

    const dias = params.dias_credito ?? rows[0].dias_credito ?? 30;
    const fechaVence = params.fecha_vence
      ? params.fecha_vence
      : new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

    await db.query(
      `UPDATE OrdenesCompra
          SET forma_pago='CREDITO', dias_credito=?, fecha_credito_vence=?, estado='RECEPCION'
        WHERE id_oc=?`,
      [dias, fechaVence, id_oc]
    );
    await this._registrarTransicion(
      id_oc, 'PAGO', 'RECEPCION', params.id_usuario || null,
      `Marcada como crédito (vence ${fechaVence})`
    );

    return { success: true, estado: 'RECEPCION' as const, fecha_credito_vence: fechaVence };
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
      if (!['PAGO', 'RECEPCION'].includes(oc.estado)) {
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

      // 4. La card siempre permanece en RECEPCION — _checkAutoAvance avanza si corresponde
      const nuevoEstado: EstadoOC = 'RECEPCION';

      await conn.query(`UPDATE OrdenesCompra SET estado = ? WHERE id_oc = ?`, [nuevoEstado, id_oc]);
      await this._checkAutoAvance(conn, id_oc);
      await conn.commit();
      await this._registrarTransicion(id_oc, oc.estado, 'RECEPCION', null, 'Recepción registrada');
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
    if (!['RECEPCION', 'FACTURACION', 'CERRADA_SIN_FACTURA'].includes(oc.estado)) {
      throw new Error(`OC debe estar RECEPCION, FACTURACION o CERRADA_SIN_FACTURA para facturar (actual: ${oc.estado})`);
    }

    // Caso B: OC ya pagada (FACTURACION) o ya cerrada sin comprobante
    // (CERRADA_SIN_FACTURA) — solo enriquecer comprobante existente con
    // nro_factura + transición a TERMINADA. NO se crea Compra/Gasto/Tx ni
    // MovimientoBancario porque ya se hicieron en registrarPago() o cerrarSinFactura().
    if (oc.estado === 'FACTURACION' || oc.estado === 'CERRADA_SIN_FACTURA') {
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
          `UPDATE OrdenesCompra
              SET estado='TERMINADA', estado_factura='FACTURADA', facturada_at=NOW()
            WHERE id_oc=?`,
          [id_oc]
        );
        await conn.commit();
        return { success: true, estado: 'TERMINADA' as const, id_compra: oc.id_compra_generada, id_gasto: null, tipo_oc: oc.tipo_oc };
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
        `UPDATE OrdenesCompra
            SET estado='FACTURACION', estado_factura='FACTURADA',
                facturada_at=NOW(), id_compra_generada=?
          WHERE id_oc=?`,
        [id_compra, id_oc]
      );
      await this._checkAutoAvance(conn, id_oc);

      await conn.commit();
      return { success: true, estado: 'FACTURACION' as const, id_compra, id_gasto, tipo_oc: oc.tipo_oc };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Registra el pago al proveedor. State machine nuevo (mig 062):
   *
   * Estados de origen válidos: PAGO, RECEPCION, FACTURACION (+ APROBADA si es
   * OC de honorarios — atajo "contraté → trabajó → pagué mismo día").
   *
   * A) Si es PRIMER pago (yaPagado=0): se crea Compra (ALMACEN) o Gasto
   *    (GENERAL/SERVICIO) provisorio con nro_comprobante=NULL, Tx EGRESO,
   *    MovBancario, CostosServicio si aplica.
   *
   * B) Si NO es primer pago: solo se actualiza estado_pago en la Compra/Gasto
   *    existente y se agrega Tx + MovBancario por el monto del pago.
   *
   * Avance de estado:
   *   - Desde PAGO/APROBADA → la OC pasa a RECEPCION (o FACTURACION directo
   *     si tipo_oc='GENERAL' no-honorario que saltean recepción).
   *   - Si cierra el saldo Y es OC GENERAL no-honorario, va directo a FACTURACION.
   *   - Si la OC ya estaba en RECEPCION o FACTURACION, queda donde está
   *     (el avance lo decide _checkAutoAvance si recepción + pago + factura).
   *
   * Cuando llegue la factura, se llama a facturar() (botón "Recibí factura")
   * para enriquecer el comprobante con nro_comprobante y mover OC a TERMINADA.
   */
  async registrarPago(id_oc: number, datos: {
    id_cuenta: number;
    fecha_pago: string;
    nro_operacion?: string;
    observaciones?: string;
    monto?: number;  // monto a pagar en moneda original (si se omite = saldo pendiente)
    voucher_url?: string | null;
    voucher_cloudinary_id?: string | null;
    id_usuario?: number;
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
    // Estados válidos para registrar pago: PAGO/RECEPCION/FACTURACION.
    // Excepción: OCs de honorarios (es_honorario=TRUE) pueden pagarse desde
    // APROBADA directamente (atajo: contraté → trabajó → pagué mismo día).
    const estadosValidosPago = ['PAGO', 'RECEPCION', 'FACTURACION'];
    if (oc.es_honorario) estadosValidosPago.push('APROBADA');
    if (!estadosValidosPago.includes(oc.estado)) {
      throw new Error(`OC debe estar PAGO, RECEPCION o FACTURACION para registrar pago (actual: ${oc.estado})`);
    }

    const tcOC = Number(oc.tipo_cambio) || 1;
    const totalOC = Number(oc.total);
    const yaPagado = Number(oc.monto_pagado || 0);
    const saldoPendiente = Math.max(0, totalOC - yaPagado);
    if (saldoPendiente <= 0.01) {
      throw new Error('La OC ya está pagada al 100% — no hay saldo pendiente');
    }

    // Monto de este pago: lo que mande el body, sino saldo pendiente. Validar rangos.
    const montoEstePago = datos.monto != null ? Number(datos.monto) : saldoPendiente;
    if (!Number.isFinite(montoEstePago) || montoEstePago <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }
    if (montoEstePago > saldoPendiente + 0.01) {
      throw new Error(`El monto (${montoEstePago.toFixed(2)}) excede el saldo pendiente (${saldoPendiente.toFixed(2)})`);
    }

    const nuevoMontoPagado = yaPagado + montoEstePago;
    const cierraTotal = nuevoMontoPagado >= totalOC - 0.01;
    const nuevoEstadoPago = cierraTotal ? 'PAGADO' : 'PARCIAL';

    // Conversiones a base PEN
    const montoEstePagoPEN = montoEstePago * tcOC;
    const total_base_pen = totalOC * tcOC;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // ── CASO A: ya estaba FACTURACION → registrar pago contra factura recibida.
      //    Si cierra el saldo total, marca PAGADO y avanza a TERMINADA. Si es
      //    parcial, queda en FACTURACION con estado_pago=PARCIAL.
      if (oc.estado === 'FACTURACION') {
        // Solo marcar Compras/Gastos como PAGADO si este pago cierra el saldo total
        if (cierraTotal) {
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
        } else {
          // Pago parcial sobre factura recibida: marcar Compra/Gasto como PARCIAL
          if (oc.tipo_oc === 'ALMACEN' && oc.id_compra_generada) {
            await conn.query(
              `UPDATE Compras SET estado_pago = 'PARCIAL' WHERE id_compra = ?`,
              [oc.id_compra_generada]
            );
          } else {
            await conn.query(
              `UPDATE Gastos SET estado_pago = 'PARCIAL' WHERE nro_oc = ? AND estado <> 'ANULADO'`,
              [oc.nro_oc]
            );
          }
        }

        const refTipo = oc.tipo_oc === 'ALMACEN' ? 'COMPRA' : 'GASTO';
        const refId = oc.tipo_oc === 'ALMACEN' ? oc.id_compra_generada : null;
        const descPago = cierraTotal ? `Pago OC ${oc.nro_oc}` : `Pago parcial OC ${oc.nro_oc} (${montoEstePago.toFixed(2)} de ${totalOC.toFixed(2)})`;
        const [movRes]: any = await conn.query(
          `INSERT INTO MovimientoBancario
             (id_cuenta, fecha, fecha_proceso, nro_operacion, descripcion_banco,
              monto, tipo, fuente, estado_conciliacion, ref_tipo, ref_id, comentario)
           VALUES (?, ?, ?, ?, ?, ?, 'CARGO', 'MANUAL', 'CONCILIADO', ?, ?, ?)`,
          [
            datos.id_cuenta, datos.fecha_pago, datos.fecha_pago,
            datos.nro_operacion || null,
            `${descPago} · ${oc.proveedor_nombre || ''}`,
            montoEstePagoPEN, refTipo, refId, datos.observaciones || null,
          ]
        );

        // Trackear este pago individualmente en OrdenCompraPago (mig 064).
        // Permite multi-pago + voucher (PDF de constancia bancaria) por cada uno.
        await conn.query(
          `INSERT INTO OrdenCompraPago
             (id_oc, id_cuenta, fecha_pago, nro_operacion, monto, monto_pen,
              observaciones, voucher_url, voucher_cloudinary_id,
              id_movimiento_bancario, id_usuario_registra)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id_oc, datos.id_cuenta, datos.fecha_pago,
            datos.nro_operacion || null,
            montoEstePago, montoEstePagoPEN,
            datos.observaciones || null,
            datos.voucher_url || null,
            datos.voucher_cloudinary_id || null,
            movRes?.insertId || null,
            datos.id_usuario || null,
          ]
        );

        const [factRows]: any = await conn.query(
          `SELECT estado_factura FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]
        );
        const proximoEstado = (cierraTotal && factRows[0]?.estado_factura === 'FACTURADA') ? 'TERMINADA' : 'FACTURACION';
        await conn.query(
          `UPDATE OrdenesCompra
              SET estado = ?, monto_pagado = ?, estado_pago = ?,
                  pagada_at = COALESCE(pagada_at, ?)
            WHERE id_oc = ?`,
          [proximoEstado, nuevoMontoPagado, nuevoEstadoPago, datos.fecha_pago, id_oc]
        );

        await conn.commit();
        return { success: true, estado: proximoEstado as 'TERMINADA' | 'FACTURACION', id_oc, monto_pagado: nuevoMontoPagado, estado_pago: nuevoEstadoPago };
      }

      // ── CASO B: PAGO / RECEPCION → pago sin factura aún ────────────────
      // La Compra/Gasto provisorio se crea SOLO la primera vez (con monto TOTAL,
      // estado_pago=PARCIAL si el primer pago no cubre todo). En pagos
      // siguientes solo agregamos Tx + MovBancario complementarios.
      const monto_base_pen = (Number(oc.subtotal) - Number(oc.descuento || 0)) * tcOC;
      const igv_base_pen = Number(oc.igv) * tcOC;

      let id_compra: number | null = oc.id_compra_generada || null;
      let id_gasto: number | null = null;
      const esPrimerPago = !id_compra && yaPagado <= 0.01;

      // Localizar gasto previo si existe (caso GENERAL/SERVICIO con pago previo)
      if (!esPrimerPago && oc.tipo_oc !== 'ALMACEN') {
        const [gastoExistente]: any = await conn.query(
          `SELECT id_gasto FROM Gastos WHERE nro_oc = ? AND estado <> 'ANULADO' LIMIT 1`,
          [oc.nro_oc]
        );
        if (gastoExistente[0]) id_gasto = gastoExistente[0].id_gasto;
      }

      // Crear Compra/Gasto provisorio SOLO si es el primer pago (no había nada).
      // El estado_pago de la Compra/Gasto refleja si este pago cierra el saldo.
      const estadoPagoCompraGasto = cierraTotal ? 'PAGADO' : 'PARCIAL';

      if (esPrimerPago && oc.tipo_oc === 'ALMACEN') {
        const [comp]: any = await conn.query(
          `INSERT INTO Compras
            (nro_oc, nro_comprobante, id_proveedor, fecha, moneda, tipo_cambio,
             aplica_igv, monto_base, igv_base, total_base, centro_costo,
             estado, estado_pago)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADA', ?)`,
          [
            oc.nro_oc, oc.id_proveedor, datos.fecha_pago,
            oc.moneda, tcOC, !!oc.aplica_igv,
            monto_base_pen, igv_base_pen, total_base_pen,
            oc.centro_costo, estadoPagoCompraGasto,
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
          `UPDATE OrdenesCompra SET id_compra_generada = ? WHERE id_oc = ?`,
          [id_compra, id_oc]
        );
      } else if (esPrimerPago) {
        // SERVICIO / GENERAL → Gasto provisorio (primer pago)
        const tipo_logi = oc.tipo_oc === 'SERVICIO' ? 'SERVICIO' : 'GENERAL';
        const concepto = `Pago OC ${oc.nro_oc} (sin factura aún)`;

        const [gastoRes]: any = await conn.query(
          `INSERT INTO Gastos
            (nro_oc, id_servicio, tipo_gasto, centro_costo, tipo_gasto_logistica,
             fecha, concepto, proveedor_nombre, nro_comprobante,
             moneda, tipo_cambio, aplica_igv,
             monto_base, igv_base, total_base, estado, estado_pago)
           VALUES (?, ?, 'OPERATIVO', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'CONFIRMADO', ?)`,
          [
            oc.nro_oc, oc.id_servicio || null,
            oc.centro_costo, tipo_logi,
            datos.fecha_pago, concepto,
            oc.proveedor_nombre || null,
            oc.moneda, tcOC, !!oc.aplica_igv,
            monto_base_pen, igv_base_pen, total_base_pen,
            estadoPagoCompraGasto,
          ]
        );
        id_gasto = gastoRes.insertId;

        if (oc.tipo_oc === 'SERVICIO' && !oc.es_honorario && (oc.id_cotizacion || oc.id_servicio)) {
          await conn.query(
            `INSERT INTO CostosServicio
              (id_servicio, id_cotizacion, concepto, moneda, monto_original,
               tipo_cambio, monto_base, tipo_costo, fecha)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'GASTO_OC', ?)`,
            [
              oc.id_servicio || null,
              oc.id_cotizacion || null,
              `Pago OC ${oc.nro_oc}`,
              oc.moneda, Number(oc.total), tcOC, total_base_pen, datos.fecha_pago,
            ]
          );
        }
      } else {
        // No es primer pago: actualizar estado_pago de Compra/Gasto preexistente
        if (oc.tipo_oc === 'ALMACEN' && id_compra) {
          await conn.query(
            `UPDATE Compras SET estado_pago = ? WHERE id_compra = ?`,
            [estadoPagoCompraGasto, id_compra]
          );
        } else if (id_gasto) {
          await conn.query(
            `UPDATE Gastos SET estado_pago = ? WHERE id_gasto = ?`,
            [estadoPagoCompraGasto, id_gasto]
          );
        }
      }

      // Tx EGRESO + MovBancario por el monto del pago (no por el total)
      const refTipo = oc.tipo_oc === 'ALMACEN' ? 'COMPRA' : 'GASTO';
      const refId = oc.tipo_oc === 'ALMACEN' ? id_compra : id_gasto;
      const descTx = cierraTotal
        ? `Pago OC ${oc.nro_oc} (sin factura aún)`
        : `Pago parcial OC ${oc.nro_oc} (${montoEstePago.toFixed(2)} de ${totalOC.toFixed(2)})`;

      await conn.query(
        `INSERT INTO Transacciones
          (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento,
           moneda, tipo_cambio, aplica_igv,
           monto_original, igv_original, total_original,
           monto_base, igv_base, total_base,
           fecha, descripcion, estado)
         VALUES (?, ?, ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REALIZADO')`,
        [
          datos.id_cuenta, refTipo, refId,
          oc.moneda, tcOC, !!oc.aplica_igv,
          montoEstePago, 0, montoEstePago,
          montoEstePagoPEN, 0, montoEstePagoPEN,
          datos.fecha_pago, descTx,
        ]
      );

      const [movResB]: any = await conn.query(
        `INSERT INTO MovimientoBancario
           (id_cuenta, fecha, fecha_proceso, nro_operacion, descripcion_banco,
            monto, tipo, fuente, estado_conciliacion, ref_tipo, ref_id, comentario)
         VALUES (?, ?, ?, ?, ?, ?, 'CARGO', 'MANUAL', 'CONCILIADO', ?, ?, ?)`,
        [
          datos.id_cuenta, datos.fecha_pago, datos.fecha_pago,
          datos.nro_operacion || null,
          `${descTx} · ${oc.proveedor_nombre || ''}`,
          montoEstePagoPEN, refTipo, refId, datos.observaciones || null,
        ]
      );

      // Trackear este pago individualmente en OrdenCompraPago (mig 064).
      await conn.query(
        `INSERT INTO OrdenCompraPago
           (id_oc, id_cuenta, fecha_pago, nro_operacion, monto, monto_pen,
            observaciones, voucher_url, voucher_cloudinary_id,
            id_movimiento_bancario, id_usuario_registra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_oc, datos.id_cuenta, datos.fecha_pago,
          datos.nro_operacion || null,
          montoEstePago, montoEstePagoPEN,
          datos.observaciones || null,
          datos.voucher_url || null,
          datos.voucher_cloudinary_id || null,
          movResB?.insertId || null,
          datos.id_usuario || null,
        ]
      );

      // Cualquier pago (total o parcial) saca la card de PAGO o de APROBADA
      // (caso honorarios). La card va a RECEPCION. Si venía de RECEPCION se
      // queda ahí (el avance lo decide _checkAutoAvance si recepción está completa).
      // Excepción: OCs GENERAL no-honorario saltan recepción y van directo a
      // FACTURACION cuando el pago cierra al 100%.
      const saltaRecepcion = !this._requiereRecepcion(oc.tipo_oc, oc.es_honorario) && cierraTotal;
      const proximoEstadoOC = ['PAGO', 'APROBADA'].includes(oc.estado)
        ? (saltaRecepcion ? 'FACTURACION' : 'RECEPCION')
        : oc.estado;
      await conn.query(
        `UPDATE OrdenesCompra
            SET estado = ?, monto_pagado = ?, estado_pago = ?,
                pagada_at = COALESCE(pagada_at, ?)
          WHERE id_oc = ?`,
        [proximoEstadoOC, nuevoMontoPagado, nuevoEstadoPago, datos.fecha_pago, id_oc]
      );

      // Si la recepción ya estaba completa antes de pagar, intentar auto-avance
      if (oc.estado === 'RECEPCION' && cierraTotal) {
        await this._checkAutoAvance(conn, id_oc);
      }

      await this._registrarTransicion(
        id_oc, oc.estado, proximoEstadoOC, null,
        cierraTotal ? `Pago total registrado (${montoEstePago.toFixed(2)})`
                    : `Pago parcial registrado (${montoEstePago.toFixed(2)} de ${totalOC.toFixed(2)} — saldo pdte ${(totalOC - nuevoMontoPagado).toFixed(2)})`
      );

      await conn.commit();
      return {
        success: true,
        estado: proximoEstadoOC,
        estado_pago: nuevoEstadoPago,
        monto_pagado: nuevoMontoPagado,
        saldo_pendiente: Math.max(0, totalOC - nuevoMontoPagado),
        id_oc, id_compra, id_gasto,
      };
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
   *   - ANULADA / BORRADOR / APROBADA / PAGO → DELETE OC (cascade FK
   *     a DetalleOrdenCompra y AprobacionesOC ya configurado).
   *   - RECEPCION → si tipo=ALMACEN, revertir stock e
   *     inventario por cada movimiento ENTRADA + DELETE movimientos.
   *   - CERRADA_SIN_FACTURA → DELETE Gasto + Tx asociados.
   *   - FACTURACION → DELETE Compra/Gasto + DetalleCompra + Tx + (si ALMACEN)
   *     reverso de Inventario + (si SERVICIO) DELETE CostosServicio.
   *   - TERMINADA → mismo que FACTURACION.
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

      // Cascada reversiva (Inventario, Compras, Gastos, Tx, MovBancario,
      // CostosServicio, factura adjunta) — compartida con mandarABorrador().
      await this._revertirCascada(conn, oc, id_oc);

      // Finalmente DELETE de la OC. DetalleOrdenCompra y AprobacionesOC
      // tienen FK ON DELETE CASCADE — se limpian solos.
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
   * Cascada reversiva compartida — revierte Inventario, Compras, Gastos,
   * Transacciones, MovimientoBancario, CostosServicio y factura adjunta.
   * NO toca OrdenesCompra ni DetalleOrdenCompra — el caller decide si borra
   * la OC (eliminar) o resetea sus campos (mandarABorrador).
   */
  private async _revertirCascada(conn: any, oc: any, id_oc: number) {
    // 1. Revertir Inventario si la OC ALMACEN registró stock
    if (oc.tipo_oc === 'ALMACEN') {
      const [movs]: any = await conn.query(
        `SELECT id_movimiento, id_item, cantidad
           FROM MovimientosInventario
          WHERE referencia_tipo = 'ORDEN_COMPRA' AND referencia_id = ?`,
        [id_oc]
      );
      for (const m of (movs as any[])) {
        const [invRows]: any = await conn.query(
          `SELECT stock_actual FROM Inventario WHERE id_item = ? FOR UPDATE`,
          [m.id_item]
        );
        const inv = invRows[0];
        if (!inv) continue;
        const stockNuevo = Math.max(0, Number(inv.stock_actual) - Number(m.cantidad));
        await conn.query(
          `UPDATE Inventario SET stock_actual = ?, updated_at = NOW() WHERE id_item = ?`,
          [stockNuevo, m.id_item]
        );
      }
      await conn.query(
        `DELETE FROM MovimientosInventario
          WHERE referencia_tipo = 'ORDEN_COMPRA' AND referencia_id = ?`,
        [id_oc]
      );
    }

    // 2. Si generó Compra, borrar Compra + DetalleCompra + Tx + MovBancario.
    if (oc.id_compra_generada) {
      await conn.query(`DELETE FROM MovimientoBancario WHERE ref_tipo = 'COMPRA' AND ref_id = ?`, [oc.id_compra_generada]);
      await conn.query(`DELETE FROM Transacciones WHERE referencia_tipo = 'COMPRA' AND referencia_id = ?`, [oc.id_compra_generada]);
      await conn.query(`DELETE FROM DetalleCompra WHERE id_compra = ?`, [oc.id_compra_generada]);
      await conn.query(`DELETE FROM Compras WHERE id_compra = ?`, [oc.id_compra_generada]);
    }

    // 3. Gastos asociados al nro_oc + sus Tx y MovBancario.
    const [gastos]: any = await conn.query(
      `SELECT id_gasto FROM Gastos WHERE nro_oc = ?`,
      [oc.nro_oc]
    );
    for (const g of (gastos as any[])) {
      await conn.query(`DELETE FROM MovimientoBancario WHERE ref_tipo = 'GASTO' AND ref_id = ?`, [g.id_gasto]);
      await conn.query(`DELETE FROM Transacciones WHERE referencia_tipo = 'GASTO' AND referencia_id = ?`, [g.id_gasto]);
      await conn.query(`DELETE FROM Gastos WHERE id_gasto = ?`, [g.id_gasto]);
    }

    // 4. CostosServicio (caso SERVICIO/honorario con cotización vinculada).
    await conn.query(`DELETE FROM CostosServicio WHERE concepto LIKE ?`, [`%${oc.nro_oc}%`]);

    // 5. Factura adjunta — el archivo en Cloudinary queda huérfano (mismo
    //    criterio que eliminarFactura individual).
    await conn.query(`DELETE FROM OrdenCompraFactura WHERE id_oc = ?`, [id_oc]);

    // 6. Defensa: limpiar MovimientoBancario huérfanos cuyo ref_id apunta a
    //    una Compra/Gasto ya borrada. Filtro por descripción que contenga el
    //    nro_oc — la descripción siempre incluye "OC <nro>" según el formato
    //    de registrarPago(). Esto cubre datos sucios de ciclos previos.
    await conn.query(
      `DELETE FROM MovimientoBancario WHERE descripcion_banco LIKE ?`,
      [`%OC ${oc.nro_oc}%`]
    );
    // 7. Defensa: limpiar Transacciones huérfanas con descripción del nro_oc.
    await conn.query(
      `DELETE FROM Transacciones WHERE descripcion LIKE ?`,
      [`%OC ${oc.nro_oc}%`]
    );
  }

  /**
   * Vuelve la OC a BORRADOR conservando el correlativo. Hace la misma cascada
   * reversiva que eliminar() pero NO borra la OC: resetea estado, monto_pagado,
   * estado_factura, etc. Útil para "deshacer" en el kanban sin perder el N°.
   *
   * No aplica si la OC ya está en BORRADOR (no hay nada que revertir) o ANULADA
   * (para esa hay un botón "♻ Reactivar" dedicado que es más simple).
   */
  async mandarABorrador(id_oc: number, id_usuario: number | null = null) {
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
      if (oc.estado === 'BORRADOR') {
        throw new Error('La OC ya está en BORRADOR');
      }
      if (oc.estado === 'ANULADA') {
        throw new Error('Para retomar una OC anulada, usá el botón "♻ Reactivar"');
      }

      const estadoPrevio = oc.estado;

      await this._revertirCascada(conn, oc, id_oc);

      // Reset campos en OrdenesCompra. Conserva: nro_oc, fecha_emision,
      // proveedor, líneas, totales, centro_costo, observaciones, etc.
      await conn.query(
        `UPDATE OrdenesCompra
            SET estado = 'BORRADOR',
                estado_pago = 'PENDIENTE',
                estado_factura = 'PENDIENTE',
                monto_pagado = 0,
                pagada_at = NULL,
                facturada_at = NULL,
                id_compra_generada = NULL,
                fecha_credito_vence = NULL
          WHERE id_oc = ?`,
        [id_oc]
      );

      // Reset cantidad_recibida en líneas — sino el estado_recepcion calculado
      // sigue mostrando cantidades viejas.
      await conn.query(
        `UPDATE DetalleOrdenCompra SET cantidad_recibida = 0 WHERE id_oc = ?`,
        [id_oc]
      );

      await conn.commit();

      // Best-effort: registrar la transición en historial. Si la tabla no
      // existe (mig no aplicada) no rompe.
      try {
        await this._registrarTransicion(id_oc, estadoPrevio, 'BORRADOR', id_usuario, 'Mandada a borrador (cascada reversiva)');
      } catch (_) { /* no romper si falla */ }

      return { success: true, estado_previo: estadoPrevio, nro_oc: oc.nro_oc };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Actualiza una OC existente. Permitido en BORRADOR / APROBADA / PAGO —
   * después la mercadería ya fue recibida o se facturó y editar cambiaría
   * datos contables.
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
    if (!['BORRADOR', 'APROBADA', 'PAGO'].includes(estado)) {
      throw new Error(
        `Solo se puede editar una OC en BORRADOR, APROBADA o PAGO (actual: ${estado}). ` +
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
    if (['FACTURACION', 'TERMINADA'].includes(rows[0].estado)) {
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
    // Mig 064 → multi-factura: ya no hay 1:1 con OrdenCompraFactura. El JOIN
    // anterior duplicaba filas cuando una OC tenía varias facturas; ahora
    // exponemos solo conteos (count) más datos de la PRIMERA factura como
    // muestra para el badge del kanban. El detalle completo viene en /facturas.
    const sql = `
      SELECT oc.*, p.razon_social AS proveedor_nombre, s.codigo AS servicio_codigo,
             CASE
               WHEN COALESCE(d.recibido, 0) <= 0.0001 THEN 'NO_RECIBIDO'
               WHEN COALESCE(d.recibido, 0) >= COALESCE(d.pedido, 0) - 0.0001 THEN 'RECIBIDO'
               ELSE 'PARCIAL'
             END AS estado_recepcion,
             COALESCE(fcnt.c, 0)            AS factura_adjunta_count,
             ffirst.id_factura_oc           AS factura_adjunta_id,
             ffirst.nro_comprobante         AS factura_adjunta_nro,
             ffirst.fecha_emision           AS factura_adjunta_fecha,
             COALESCE(pcnt.c, 0)            AS pago_count
      FROM OrdenesCompra oc
      LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
      LEFT JOIN Servicios s ON s.id_servicio = oc.id_servicio
      LEFT JOIN (
        SELECT id_oc,
               SUM(cantidad) AS pedido,
               SUM(cantidad_recibida) AS recibido
          FROM DetalleOrdenCompra
         GROUP BY id_oc
      ) d ON d.id_oc = oc.id_oc
      LEFT JOIN (
        SELECT id_oc, COUNT(*) AS c FROM OrdenCompraFactura GROUP BY id_oc
      ) fcnt ON fcnt.id_oc = oc.id_oc
      LEFT JOIN LATERAL (
        SELECT id_factura_oc, nro_comprobante, fecha_emision
          FROM OrdenCompraFactura
         WHERE id_oc = oc.id_oc
         ORDER BY fecha_emision ASC, id_factura_oc ASC
         LIMIT 1
      ) ffirst ON true
      LEFT JOIN (
        SELECT id_oc, COUNT(*) AS c FROM OrdenCompraPago GROUP BY id_oc
      ) pcnt ON pcnt.id_oc = oc.id_oc
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
    if (!['RECEPCION', 'FACTURACION'].includes(oc.estado)) {
      throw new Error(`OC debe estar RECEPCION o FACTURACION para cerrar sin factura (actual: ${oc.estado})`);
    }
    if (oc.tipo_oc === 'ALMACEN') {
      throw new Error('OC ALMACEN NO puede cerrarse sin factura — las compras de stock requieren comprobante');
    }

    // Caso: ya estaba pagada y esperando factura (FACTURACION). La Compra/Gasto provisorio
    // ya existe (creado en registrarPago()) con nro_comprobante=NULL. Solo
    // cambiamos el estado de la OC — todo lo contable y bancario ya está.
    if (oc.estado === 'FACTURACION') {
      await db.query(
        `UPDATE OrdenesCompra
            SET estado='CERRADA_SIN_FACTURA', estado_factura='SIN_FACTURA', estado_pago='PAGADO'
          WHERE id_oc=?`,
        [id_oc]
      );
      return { success: true, estado: 'CERRADA_SIN_FACTURA' as const, id_oc, sin_movimientos_nuevos: true };
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

      // 4. UPDATE OC. Estado terminal con estado_factura y estado_pago explícitos.
      await conn.query(
        `UPDATE OrdenesCompra
            SET estado='CERRADA_SIN_FACTURA', estado_factura='SIN_FACTURA', estado_pago='PAGADO',
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

      // Mover OC a TERMINADA + estado_factura=FACTURADA. El estado 'FACTURADA'
      // del state machine viejo fue reemplazado por TERMINADA en mig 062.
      await conn.query(
        `UPDATE OrdenesCompra
            SET estado = 'TERMINADA', estado_factura = 'FACTURADA', facturada_at = NOW()
          WHERE id_oc = ?`,
        [id_oc]
      );

      await conn.commit();
      return { success: true, estado: 'TERMINADA', id_gasto: idGasto };
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
              cot.total          AS cotizacion_total,
              u_prep.nombre  AS preparado_por_nombre,
              u_rev.nombre   AS revisado_por_nombre,
              u_aut.nombre   AS autorizado_por_nombre
       FROM OrdenesCompra oc
       LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
       LEFT JOIN Cotizaciones cot ON cot.id_cotizacion = oc.id_cotizacion
       LEFT JOIN Usuarios u_prep ON u_prep.id_usuario = oc.preparado_por_id
       LEFT JOIN Usuarios u_rev  ON u_rev.id_usuario  = oc.revisado_por_id
       LEFT JOIN Usuarios u_aut  ON u_aut.id_usuario  = oc.autorizado_por_id
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

    // Lista de pagos individuales registrados — viene del libro bancos.
    // Filtramos por ref_tipo + ref_id (no por descripción) para evitar matches
    // con OCs anteriores que reusen el correlativo después de un eliminar.
    // Pagos ALMACEN: ref_tipo='COMPRA' + ref_id=id_compra_generada.
    // Pagos GENERAL/SERVICIO: ref_tipo='GASTO' + ref_id IN (gastos con nro_oc).
    const [pagos] = await db.query(`
      SELECT mb.id_movimiento, mb.fecha, mb.nro_operacion, mb.descripcion_banco,
             mb.monto, mb.comentario, mb.id_cuenta, c.nombre AS cuenta_nombre, c.moneda AS cuenta_moneda
        FROM MovimientoBancario mb
        LEFT JOIN Cuentas c ON c.id_cuenta = mb.id_cuenta
       WHERE mb.tipo = 'CARGO'
         AND (
              (mb.ref_tipo = 'COMPRA' AND mb.ref_id = ?)
           OR (mb.ref_tipo = 'GASTO' AND mb.ref_id IN (SELECT id_gasto FROM Gastos WHERE nro_oc = ?))
         )
       ORDER BY mb.fecha, mb.id_movimiento
    `, [oc.id_compra_generada || -1, oc.nro_oc]);

    // Calcular estado_recepcion en runtime desde el detalle.
    // (listar() ya lo devuelve via SELECT, pero obtener() no lo hacía.)
    const detalle = det as any[];
    let pedido = 0, recibido = 0;
    for (const d of detalle) {
      pedido   += Number(d.cantidad)            || 0;
      recibido += Number(d.cantidad_recibida)   || 0;
    }
    let estado_recepcion: 'NO_RECIBIDO' | 'PARCIAL' | 'RECIBIDO' = 'NO_RECIBIDO';
    if (recibido >= pedido - 0.0001 && pedido > 0) estado_recepcion = 'RECIBIDO';
    else if (recibido > 0.0001) estado_recepcion = 'PARCIAL';

    // Multifirma (mig 065): cuántas firmas requiere esta OC y cuántas tiene.
    let firmas_requeridas = 1;
    try {
      const OCFirmasService = (await import('./OCFirmasService')).default;
      firmas_requeridas = await OCFirmasService.getFirmasRequeridas(id_oc);
    } catch (_e) { /* tabla aún no migrada en algún entorno: default 1 */ }
    let firmas_actuales = 0;
    if (oc.preparado_por_id)  firmas_actuales++;
    if (oc.revisado_por_id)   firmas_actuales++;
    if (oc.autorizado_por_id) firmas_actuales++;

    return {
      ...oc, detalle, aprobaciones: apro, pagos, estado_recepcion,
      firmas_requeridas, firmas_actuales,
    };
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

  /**
   * Wrapper público del auto-avance — para llamarlo desde otros services
   * que no estén dentro de una transacción (ej. FacturaOCService).
   */
  async checkAutoAvance(id_oc: number): Promise<void> {
    return this._checkAutoAvance(db, id_oc);
  }

  /**
   * ¿La OC requiere paso explícito de RECEPCION antes de pasar a FACTURACION?
   *
   * SÍ:
   *  - ALMACEN: siempre. Mercadería física que hay que chequear contra remito.
   *  - SERVICIO no-honorario: trabajo externo (ej. técnico tercerizado). Hay
   *    que confirmar que vino y dejó listo lo que se contrató antes de pagar
   *    la factura formal.
   *
   * NO (saltan PAGO -> FACTURACION directo):
   *  - GENERAL: gastos administrativos, alquileres, servicios públicos. No hay
   *    paquete ni trabajo discreto que "recibir" — el pago mismo cierra.
   *  - HONORARIO (cualquier tipo_oc con es_honorario=TRUE): persona natural
   *    cobrando por horas/trabajo. El pago YA es el reconocimiento del trabajo
   *    y el RH se sube en FACTURACION. Recepción no agrega nada.
   *
   * Antes del fix (08/05/2026 noche): se requería recepción para SERVICIO y
   * cualquier honorario, lo cual atascaba el flujo en RECEPCION sin nada que
   * recibir realmente.
   */
  private _requiereRecepcion(tipo_oc?: string | null, es_honorario?: boolean | number): boolean {
    if (es_honorario) return false;
    return tipo_oc === 'ALMACEN' || tipo_oc === 'SERVICIO';
  }

  /**
   * Auto-avance del estado: si recepción al 100% y pago al 100% y factura OK, mueve a TERMINADA.
   * Si recepción al 100% y pago al 100% pero falta factura, mueve a FACTURACION.
   * Si recepción no completa, deja como esté.
   * OCs GENERAL no-honorario consideran recepción implícitamente completa.
   */
  private async _checkAutoAvance(conn: any, id_oc: number) {
    const [r]: any = await conn.query(`
      SELECT oc.estado, oc.estado_pago, oc.estado_factura, oc.tipo_oc, oc.es_honorario,
             SUM(d.cantidad) AS total_pedido,
             SUM(d.cantidad_recibida) AS total_recibido
        FROM OrdenesCompra oc
        JOIN DetalleOrdenCompra d ON d.id_oc = oc.id_oc
       WHERE oc.id_oc = ?
       GROUP BY oc.id_oc, oc.estado, oc.estado_pago, oc.estado_factura, oc.tipo_oc, oc.es_honorario
    `, [id_oc]);
    const row = r[0];
    if (!row) return;

    const requiereRec = this._requiereRecepcion(row.tipo_oc, row.es_honorario);
    const recibidoCompleto = !requiereRec || (Number(row.total_recibido) >= Number(row.total_pedido) - 0.0001);
    const pagoCompleto = row.estado_pago === 'PAGADO';
    const facturaOK = row.estado_factura === 'FACTURADA';

    if (recibidoCompleto && pagoCompleto && facturaOK && row.estado !== 'TERMINADA') {
      await conn.query(`UPDATE OrdenesCompra SET estado='TERMINADA' WHERE id_oc=?`, [id_oc]);
      await this._registrarTransicion(id_oc, row.estado, 'TERMINADA', null, 'Auto: todo cerrado');
    } else if (recibidoCompleto && pagoCompleto && row.estado === 'RECEPCION') {
      await conn.query(`UPDATE OrdenesCompra SET estado='FACTURACION' WHERE id_oc=?`, [id_oc]);
      await this._registrarTransicion(id_oc, 'RECEPCION', 'FACTURACION', null, 'Auto: recepción completa + pago al día');
    }
    // Otherwise: stays where it is. RECEPCION with pago incompleto stays bloqueada.
  }

  /**
   * Registra una transición en OrdenCompraHistorial. Best-effort —
   * si la tabla no existe (mig no aplicada) no rompe.
   */
  private async _registrarTransicion(
    id_oc: number,
    estado_anterior: string | null,
    estado_nuevo: string,
    id_usuario: number | null,
    comentario: string | null
  ) {
    try {
      await db.query(
        `INSERT INTO OrdenCompraHistorial (id_oc, estado_anterior, estado_nuevo, id_usuario, comentario)
         VALUES (?, ?, ?, ?, ?)`,
        [id_oc, estado_anterior, estado_nuevo, id_usuario, comentario]
      );
    } catch (_) { /* tabla puede no existir aún */ }
  }

  /**
   * Calcula estado_recepcion en runtime desde DetalleOrdenCompra.
   */
  async getEstadoRecepcion(id_oc: number): Promise<EstadoRecepcion> {
    const [r]: any = await db.query(`
      SELECT SUM(cantidad) AS total, SUM(cantidad_recibida) AS recibido
      FROM DetalleOrdenCompra WHERE id_oc=?
    `, [id_oc]);
    const total = Number(r[0]?.total || 0);
    const recibido = Number(r[0]?.recibido || 0);
    if (recibido <= 0.0001) return 'NO_RECIBIDO';
    if (recibido >= total - 0.0001) return 'RECIBIDO';
    return 'PARCIAL';
  }
}

export default new OrdenCompraService();

import { db } from '../../../database/connection';

/**
 * ProductionService — Fase E v0 (MVP visor).
 *
 * Las "Órdenes de Trabajo" en este MVP son cotizaciones en estado
 * APROBADA / TRABAJO_EN_RIESGO / TERMINADA — toda cotización fondeada o
 * a riesgo es una OT implícita. Los costos imputados vienen de
 * `CostosServicio` (materiales del almacén, mano de obra de OCs honorario,
 * gastos OC facturados, etc.) ya enlazados via id_cotizacion.
 *
 * El módulo full (Fase E completa, 5 semanas) creará tablas dedicadas
 * `OrdenesTrabajo`, `BOM`, `WorkCenters`, `Rutas`, `PartesProduccion`, etc.
 * Por ahora este service solo lee y agrega.
 */
class ProductionService {

  // Convierte un total cotizado a PEN según moneda + tipo_cambio. Las
  // cotizaciones USD se multiplican por su TC para comparar contra los
  // costos imputados (que siempre se almacenan en monto_base PEN).
  private totalCotizadoPEN(row: any): number {
    const total = Number(row.total) || 0;
    if ((row.moneda || 'PEN') === 'PEN') return total;
    const tc = Number(row.tipo_cambio) || 0;
    return Number((total * tc).toFixed(2));
  }

  // ── Listar OTs (cotizaciones fondeadas + sus costos imputados) ────────
  async listarOTs(filtros: { estado?: string; cliente?: string; desde?: string; hasta?: string } = {}) {
    const where: string[] = [];
    const vals: any[] = [];

    if (filtros.estado && filtros.estado !== 'TODAS') {
      where.push('c.estado = ?');
      vals.push(filtros.estado);
    } else {
      // Default: estados activos de producción
      where.push("c.estado IN ('APROBADA','TRABAJO_EN_RIESGO','TERMINADA')");
    }
    if (filtros.cliente) {
      where.push('LOWER(c.cliente) LIKE ?');
      vals.push('%' + String(filtros.cliente).toLowerCase() + '%');
    }
    if (filtros.desde) { where.push('c.fecha >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta) { where.push('c.fecha <= ?'); vals.push(filtros.hasta); }

    const sql = `
      SELECT c.id_cotizacion, c.nro_cotizacion, c.cliente, c.proyecto, c.marca,
             c.moneda, c.tipo_cambio, c.total, c.estado, c.fecha,
             c.estado_financiero,
             COALESCE(cs.costo_total, 0) AS costo_imputado,
             COALESCE(cs.cant_movimientos, 0) AS cant_movimientos,
             COALESCE(cs.costo_material, 0) AS costo_material,
             COALESCE(cs.costo_mano_obra, 0) AS costo_mano_obra,
             COALESCE(cs.costo_gasto_oc, 0) AS costo_gasto_oc,
             COALESCE(cs.costo_otros, 0) AS costo_otros
      FROM Cotizaciones c
      LEFT JOIN (
        SELECT id_cotizacion,
               COUNT(*)                                                    AS cant_movimientos,
               SUM(monto_base)                                              AS costo_total,
               SUM(CASE WHEN tipo_costo = 'MATERIAL_CONSUMO' THEN monto_base ELSE 0 END) AS costo_material,
               SUM(CASE WHEN tipo_costo = 'MANO_OBRA_OC'    THEN monto_base ELSE 0 END) AS costo_mano_obra,
               SUM(CASE WHEN tipo_costo = 'GASTO_OC'        THEN monto_base ELSE 0 END) AS costo_gasto_oc,
               SUM(CASE WHEN tipo_costo NOT IN ('MATERIAL_CONSUMO','MANO_OBRA_OC','GASTO_OC')
                        THEN monto_base ELSE 0 END)                                     AS costo_otros
          FROM CostosServicio
         WHERE id_cotizacion IS NOT NULL
         GROUP BY id_cotizacion
      ) cs ON cs.id_cotizacion = c.id_cotizacion
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY c.fecha DESC, c.id_cotizacion DESC`;
    const [rows]: any = await db.query(sql, vals);

    return (rows as any[]).map(r => {
      const cotizadoPEN = this.totalCotizadoPEN(r);
      const costo = Number(r.costo_imputado);
      const margen = Number((cotizadoPEN - costo).toFixed(2));
      const margenPct = cotizadoPEN > 0 ? Number(((margen / cotizadoPEN) * 100).toFixed(1)) : 0;
      return {
        id_cotizacion:    r.id_cotizacion,
        nro_cotizacion:   r.nro_cotizacion,
        cliente:          r.cliente,
        proyecto:         r.proyecto,
        marca:            r.marca,
        moneda:           r.moneda,
        tipo_cambio:      Number(r.tipo_cambio) || 1,
        estado:           r.estado,
        estado_financiero: r.estado_financiero,
        fecha:            r.fecha,
        cotizado_original: Number(r.total) || 0,
        cotizado_pen:     cotizadoPEN,
        costo_imputado:   costo,
        costo_material:   Number(r.costo_material),
        costo_mano_obra:  Number(r.costo_mano_obra),
        costo_gasto_oc:   Number(r.costo_gasto_oc),
        costo_otros:      Number(r.costo_otros),
        margen_pen:       margen,
        margen_pct:       margenPct,
        cant_movimientos: Number(r.cant_movimientos),
      };
    });
  }

  // ── Detalle de una OT con desglose de costos por categoría ────────────
  async obtenerOT(id_cotizacion: number) {
    const [cotRows]: any = await db.query(
      `SELECT c.id_cotizacion, c.nro_cotizacion, c.cliente, c.proyecto, c.marca,
              c.moneda, c.tipo_cambio, c.total, c.subtotal, c.igv, c.estado,
              c.fecha, c.estado_financiero, c.atencion, c.telefono, c.correo,
              c.forma_pago, c.plazo_entrega, c.lugar_entrega, c.comentarios
         FROM Cotizaciones c
        WHERE c.id_cotizacion = ?`,
      [id_cotizacion]
    );
    const cot = (cotRows as any[])[0];
    if (!cot) throw new Error('Cotización no encontrada');

    // Detalle de items cotizados (precio venta)
    const [items]: any = await db.query(
      `SELECT id_detalle, descripcion, unidad, cantidad, precio_unitario, subtotal
         FROM DetalleCotizacion
        WHERE id_cotizacion = ?
        ORDER BY id_detalle`,
      [id_cotizacion]
    );

    // Desglose de costos imputados
    const [costos]: any = await db.query(
      `SELECT id_costo, concepto, moneda, monto_original, tipo_cambio, monto_base,
              tipo_costo, fecha, created_at
         FROM CostosServicio
        WHERE id_cotizacion = ?
        ORDER BY fecha, id_costo`,
      [id_cotizacion]
    );

    // Movimientos de inventario que tocan esta cotización (para detalle de
    // materiales con item, cantidad y kárdex completo)
    const [movInv]: any = await db.query(
      `SELECT mi.id_movimiento, mi.id_item, mi.tipo_movimiento, mi.cantidad,
              mi.fecha_movimiento,
              i.nombre AS item_nombre, i.unidad, i.costo_promedio_unitario
         FROM MovimientosInventario mi
         LEFT JOIN Inventario i ON i.id_item = mi.id_item
        WHERE mi.referencia_tipo = 'COTIZACION' AND mi.referencia_id = ?
        ORDER BY mi.fecha_movimiento, mi.id_movimiento`,
      [id_cotizacion]
    );

    // Agrupar costos por categoría
    const grupos = {
      MATERIAL_CONSUMO: [] as any[],
      MANO_OBRA_OC:     [] as any[],
      GASTO_OC:         [] as any[],
      OTROS:            [] as any[],
    };
    for (const c of (costos as any[])) {
      const t = c.tipo_costo as keyof typeof grupos;
      if (grupos[t]) grupos[t].push(c);
      else grupos.OTROS.push(c);
    }

    const sumar = (arr: any[]) => arr.reduce((s, x) => s + Number(x.monto_base || 0), 0);
    const totales = {
      material:   Number(sumar(grupos.MATERIAL_CONSUMO).toFixed(2)),
      mano_obra:  Number(sumar(grupos.MANO_OBRA_OC).toFixed(2)),
      gasto_oc:   Number(sumar(grupos.GASTO_OC).toFixed(2)),
      otros:      Number(sumar(grupos.OTROS).toFixed(2)),
    };
    const costoTotal = Number((totales.material + totales.mano_obra + totales.gasto_oc + totales.otros).toFixed(2));
    const cotizadoPEN = this.totalCotizadoPEN(cot);
    const margen = Number((cotizadoPEN - costoTotal).toFixed(2));
    const margenPct = cotizadoPEN > 0 ? Number(((margen / cotizadoPEN) * 100).toFixed(1)) : 0;

    return {
      cotizacion: {
        ...cot,
        cotizado_pen: cotizadoPEN,
      },
      items,
      costos: {
        material:   grupos.MATERIAL_CONSUMO,
        mano_obra:  grupos.MANO_OBRA_OC,
        gasto_oc:   grupos.GASTO_OC,
        otros:      grupos.OTROS,
      },
      movimientos_inventario: movInv,
      totales: {
        ...totales,
        costo_total: costoTotal,
        cotizado_pen: cotizadoPEN,
        margen_pen: margen,
        margen_pct: margenPct,
      },
    };
  }
}

export default new ProductionService();

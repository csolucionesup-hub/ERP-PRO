import { db } from '../../../database/connection';
import { nowSQL } from '../../lib/dateUtils';

class InventoryService {
  /**
   * Obtiene el listado de Catálogo de Almacén Valorado Históricamente.
   * Sesión 13/05/2026 (mig 070): incluye `familia` y `marca` para agrupar
   * variantes (SOLDADURA × 6, ALAMBRE × 2, etc.) y separar items por
   * empresa (METAL/PERFOTOOLS/COMPARTIDO).
   */
  async getInventario() {
    const query = `
      SELECT
        id_item, sku, categoria, nombre, unidad, stock_actual, stock_minimo,
        costo_promedio_unitario AS costo_promedio,
        (stock_actual * costo_promedio_unitario) as valorizado,
        familia, marca
      FROM Inventario
      ORDER BY COALESCE(familia, nombre) ASC, nombre ASC
    `;
    const [rows] = await db.query(query);
    return rows;
  }

  /**
   * Crea un producto/insumo logístico con SKU autogenerado por categoría
   */
  async createItem(data: { nombre: string; categoria: string; unidad: string; stock_minimo?: number }) {
     const prefijos: Record<string, string> = {
       Material: 'MAT', Consumible: 'CON', Herramienta: 'HER', Equipo: 'EQU', EPP: 'EPP'
     };
     const prefijo = prefijos[data.categoria] || 'MAT';

     const conn = await db.getConnection();
     await conn.beginTransaction();
     try {
       // FOR UPDATE: lock pesimista — previene colisión de SKU en concurrencia
       const [rows] = await conn.query(
         `SELECT sku FROM Inventario WHERE sku LIKE ? ORDER BY id_item DESC LIMIT 1 FOR UPDATE`,
         [prefijo + '-%']
       );
       const ultimo = (rows as any[])[0];
       let siguiente = 1;
       if (ultimo) {
         const partes = ultimo.sku.split('-');
         siguiente = (parseInt(partes[1], 10) || 0) + 1;
       }
       const sku = `${prefijo}-${String(siguiente).padStart(3, '0')}`;

       const min_stock = data.stock_minimo !== undefined ? data.stock_minimo : 10.00;
       const [result] = await conn.query(
         'INSERT INTO Inventario (sku, categoria, nombre, unidad, stock_minimo) VALUES (?, ?, ?, ?, ?)',
         [sku, data.categoria, data.nombre, data.unidad || 'UND', min_stock]
       );
       await conn.commit();
       return { id_item: (result as any).insertId, sku, categoria: data.categoria, nombre: data.nombre, unidad: data.unidad, stock_actual: 0, stock_minimo: min_stock };
     } catch (e) {
       await conn.rollback();
       throw e;
     } finally {
       conn.release();
     }
  }

  /**
   * Dashboard de almacén — KPIs + gráficos para análisis gerencial.
   * Incluye comparativas históricas y mes vs mes anterior.
   */
  async getDashboard() {
    const ahora = new Date();
    const anioActual = ahora.getFullYear();
    const mesActual = ahora.getMonth() + 1;
    const mesAnterior = mesActual === 1 ? 12 : mesActual - 1;
    const anioMesAnterior = mesActual === 1 ? anioActual - 1 : anioActual;

    // 1. KPIs generales
    const [kpis]: any = await db.query(`
      SELECT
        COUNT(*)::int AS items_catalogados,
        SUM(stock_actual * costo_promedio_unitario)::numeric(14,2) AS valor_total_stock,
        SUM(CASE WHEN stock_actual <= stock_minimo AND stock_actual > 0 THEN 1 ELSE 0 END)::int AS items_bajo_minimo,
        SUM(CASE WHEN stock_actual = 0 THEN 1 ELSE 0 END)::int AS items_sin_stock
      FROM Inventario
    `);

    // 2. Distribución por categoría
    const [porCategoria]: any = await db.query(`
      SELECT categoria,
             COUNT(*)::int AS cantidad,
             SUM(stock_actual * costo_promedio_unitario)::numeric(14,2) AS valor
      FROM Inventario
      GROUP BY categoria
      ORDER BY valor DESC NULLS LAST
    `);

    // 3. Top 10 productos más usados (SALIDAS últimos 6 meses)
    const [topRotados]: any = await db.query(`
      SELECT i.sku, i.nombre, i.unidad,
             SUM(m.cantidad)::numeric(14,2) AS cantidad_total,
             COUNT(*)::int AS num_movimientos
      FROM MovimientosInventario m
      JOIN Inventario i ON i.id_item = m.id_item
      WHERE m.tipo_movimiento = 'SALIDA'
        AND m.fecha_movimiento >= (CURRENT_DATE - INTERVAL '6 months')
      GROUP BY i.id_item, i.sku, i.nombre, i.unidad
      ORDER BY cantidad_total DESC
      LIMIT 10
    `);

    // 4. Top 10 productos más comprados (mayor inversión últimos 6 meses)
    const [topComprados]: any = await db.query(`
      SELECT i.sku, i.nombre, i.unidad,
             SUM(dc.cantidad)::numeric(14,2) AS cantidad_total,
             SUM(dc.subtotal)::numeric(14,2) AS valor_total
      FROM DetalleCompra dc
      JOIN Inventario i ON i.id_item = dc.id_item
      JOIN Compras c ON c.id_compra = dc.id_compra
      WHERE c.estado != 'ANULADO'
        AND c.fecha >= (CURRENT_DATE - INTERVAL '6 months')
      GROUP BY i.id_item, i.sku, i.nombre, i.unidad
      ORDER BY valor_total DESC
      LIMIT 10
    `);

    // 5. Tendencia mensual entradas vs salidas (últimos 12 meses)
    const [tendencia]: any = await db.query(`
      SELECT TO_CHAR(fecha_movimiento, 'YYYY-MM') AS mes,
             SUM(CASE WHEN tipo_movimiento = 'ENTRADA' THEN cantidad ELSE 0 END)::numeric(14,2) AS entradas,
             SUM(CASE WHEN tipo_movimiento = 'SALIDA' THEN cantidad ELSE 0 END)::numeric(14,2) AS salidas
      FROM MovimientosInventario
      WHERE fecha_movimiento >= (CURRENT_DATE - INTERVAL '12 months')
      GROUP BY TO_CHAR(fecha_movimiento, 'YYYY-MM')
      ORDER BY mes ASC
    `);

    // 6. Items sin movimiento en >90 días (inventario muerto)
    const [sinMovimiento]: any = await db.query(`
      SELECT i.sku, i.nombre, i.categoria, i.stock_actual,
             (i.stock_actual * i.costo_promedio_unitario)::numeric(14,2) AS valorizado,
             (SELECT MAX(m.fecha_movimiento) FROM MovimientosInventario m WHERE m.id_item = i.id_item) AS ultimo_movimiento
      FROM Inventario i
      WHERE i.stock_actual > 0
        AND NOT EXISTS (
          SELECT 1 FROM MovimientosInventario m
          WHERE m.id_item = i.id_item
            AND m.fecha_movimiento >= (CURRENT_DATE - INTERVAL '90 days')
        )
      ORDER BY valorizado DESC NULLS LAST
      LIMIT 10
    `);

    // 7. Comparativa mes actual vs mes anterior
    const [compMesActual]: any = await db.query(`
      SELECT
        SUM(CASE WHEN tipo_movimiento = 'ENTRADA' THEN cantidad ELSE 0 END)::numeric(14,2) AS entradas,
        SUM(CASE WHEN tipo_movimiento = 'SALIDA' THEN cantidad ELSE 0 END)::numeric(14,2) AS salidas
      FROM MovimientosInventario
      WHERE EXTRACT(YEAR FROM fecha_movimiento) = ?
        AND EXTRACT(MONTH FROM fecha_movimiento) = ?
    `, [anioActual, mesActual]);

    const [compMesPrev]: any = await db.query(`
      SELECT
        SUM(CASE WHEN tipo_movimiento = 'ENTRADA' THEN cantidad ELSE 0 END)::numeric(14,2) AS entradas,
        SUM(CASE WHEN tipo_movimiento = 'SALIDA' THEN cantidad ELSE 0 END)::numeric(14,2) AS salidas
      FROM MovimientosInventario
      WHERE EXTRACT(YEAR FROM fecha_movimiento) = ?
        AND EXTRACT(MONTH FROM fecha_movimiento) = ?
    `, [anioMesAnterior, mesAnterior]);

    return {
      kpis: (kpis as any[])[0] || { items_catalogados: 0, valor_total_stock: 0, items_bajo_minimo: 0, items_sin_stock: 0 },
      por_categoria:    porCategoria,
      top_rotados:      topRotados,
      top_comprados:    topComprados,
      tendencia_12m:    tendencia,
      sin_movimiento:   sinMovimiento,
      comparativa_mes: {
        actual:   (compMesActual as any[])[0]   || { entradas: 0, salidas: 0 },
        anterior: (compMesPrev as any[])[0]     || { entradas: 0, salidas: 0 },
        anio_mes_actual:   `${anioActual}-${String(mesActual).padStart(2, '0')}`,
        anio_mes_anterior: `${anioMesAnterior}-${String(mesAnterior).padStart(2, '0')}`,
      },
    };
  }

  /**
   * Extraer trazabilidad Kárdex por Ítem
   */
  async getKardex(id_item: number) {
     const [rows] = await db.query(
        "SELECT * FROM MovimientosInventario WHERE id_item = ? ORDER BY fecha_movimiento DESC, id_movimiento DESC",
        [id_item] 
     );
     return rows;
  }

  /**
   * Transactor Estricto de Merma (Salida Logística hacia Ventas/Servicios)
   */
  async registrarConsumoServicio(data: {
    id_servicio?: number | null;
    id_cotizacion?: number | null;
    detalles: { id_item: number, cantidad: number }[];
  }) {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
      // Validar destino: aceptar id_cotizacion (preferido, post-Camino A)
      // o id_servicio (legacy). Al menos uno requerido.
      const idCotizacion = data.id_cotizacion ? Number(data.id_cotizacion) : null;
      const idServicio   = data.id_servicio   ? Number(data.id_servicio)   : null;
      if (!idCotizacion && !idServicio) {
        throw new Error('Falta destino del consumo: indicá id_cotizacion (cotización fondeada) o id_servicio (legacy).');
      }

      // Validar destino existe y está en estado válido
      let referenciaTipo: 'COTIZACION' | 'SERVICIO';
      let referenciaId: number;
      if (idCotizacion) {
        const [cotRows] = await conn.query(
          'SELECT id_cotizacion, estado, nro_cotizacion FROM Cotizaciones WHERE id_cotizacion = ?',
          [idCotizacion]
        );
        const cot = (cotRows as any)[0];
        if (!cot) throw new Error('Cotización no encontrada');
        if (!['APROBADA', 'TRABAJO_EN_RIESGO'].includes(cot.estado)) {
          throw new Error(`Solo se puede consumir contra cotizaciones APROBADA o TRABAJO_EN_RIESGO. Estado actual: ${cot.estado}`);
        }
        referenciaTipo = 'COTIZACION';
        referenciaId = idCotizacion;
      } else {
        const [srvRows] = await conn.query('SELECT id_servicio, estado FROM Servicios WHERE id_servicio = ?', [idServicio]);
        const srv = (srvRows as any)[0];
        if (!srv) throw new Error('Servicio no encontrado');
        if (['COBRADO', 'ANULADO'].includes(srv.estado)) throw new Error('No se puede registrar consumo en un servicio ' + srv.estado);
        referenciaTipo = 'SERVICIO';
        referenciaId = idServicio!;
      }

      const fechaConsumo = nowSQL();

      for (const item of data.detalles) {
         // Bloquear lectura por Concurrencia FOR UPDATE
         const [rows] = await conn.query("SELECT stock_actual, costo_promedio_unitario, nombre FROM Inventario WHERE id_item = ? FOR UPDATE", [item.id_item]);
         const insumo = (rows as any)[0];
         if (!insumo) throw new Error('El ítem ' + item.id_item + ' no reside en la base de datos logística.');

         const stock = Number(insumo.stock_actual);
         const costoUnitario = Number(insumo.costo_promedio_unitario);

         // REGLA DE NEGOCIO DURA: No vender Cero (Merma Inválida)
         if (stock < item.cantidad) {
            throw new Error('FALTA DE STOCK ESTRICTO. Pides ' + item.cantidad + ' de ' + insumo.nombre + ', solo posees ' + stock);
         }

         // Afectamos Disminución
         const saldoRestante = stock - item.cantidad;
         await conn.query("UPDATE Inventario SET stock_actual = ? WHERE id_item = ?", [saldoRestante, item.id_item]);

         // Trazabilidad Kárdex de Egreso (Salida)
         await conn.query(`
            INSERT INTO MovimientosInventario (id_item, referencia_tipo, referencia_id, tipo_movimiento, cantidad, saldo_posterior, fecha_movimiento)
            VALUES (?, ?, ?, 'SALIDA', ?, ?, ?)
         `, [item.id_item, referenciaTipo, referenciaId, item.cantidad, saldoRestante, fechaConsumo]);

         // === PUENTE FINANCIERO ===
         // Inyectamos esto como Costo Directo logrando Utilidades Reales.
         // CHECK chk_costoservicio_origen exige id_servicio OR id_cotizacion.
         const costoTotalValorizado = parseFloat((item.cantidad * costoUnitario).toFixed(2));

         await conn.query(`
            INSERT INTO CostosServicio (id_servicio, id_cotizacion, concepto, moneda, monto_original, tipo_cambio, monto_base, tipo_costo, fecha)
            VALUES (?, ?, ?, 'PEN', ?, 1.0000, ?, 'MATERIAL_CONSUMO', ?)
         `, [
            idServicio,
            idCotizacion,
            'Consumo Inventario [Ítem ' + insumo.nombre + ']',
            costoTotalValorizado, costoTotalValorizado,
            fechaConsumo.split(' ')[0]
         ]);
      }

      await conn.commit();
      return { success: true, message: 'Inventario depletado y costos inyectados con éxito' };
    } catch (error) {
       await conn.rollback();
       throw error;
    } finally {
       conn.release();
    }
  }
  /**
   * Editar metadata "segura" de un ítem en cualquier momento. Cubre campos
   * que NO afectan stock ni costos: nombre, categoria, unidad, stock_minimo.
   * NO toca: stock_actual (eso es kárdex), costo_promedio_unitario (cálculo
   * automático), sku (correlativo).
   */
  async editarMetadata(idItem: number, data: {
    nombre?: string;
    categoria?: string;
    unidad?: string;
    stock_minimo?: number;
    familia?: string;
    marca?: 'METAL' | 'PERFOTOOLS' | 'COMPARTIDO';
  }) {
    const [rows] = await db.query(
      'SELECT id_item FROM Inventario WHERE id_item = ?',
      [idItem]
    );
    if (!(rows as any)[0]) throw new Error('Ítem no encontrado.');

    // Validación de marca — el CHECK constraint también lo valida en BD,
    // pero acá damos un error más legible.
    if (data.marca !== undefined && !['METAL', 'PERFOTOOLS', 'COMPARTIDO'].includes(data.marca)) {
      throw new Error("marca debe ser uno de: METAL, PERFOTOOLS, COMPARTIDO");
    }

    const FIELDS: (keyof typeof data)[] = ['nombre', 'categoria', 'unidad', 'stock_minimo', 'familia', 'marca'];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const f of FIELDS) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`);
        // Familia vacía → null (permite "ungroupear" un item).
        // Marca vacía → default 'COMPARTIDO'.
        if (data[f] === '' && f === 'familia') vals.push(null);
        else if (data[f] === '' && f === 'marca') vals.push('COMPARTIDO');
        else vals.push(data[f]);
      }
    }
    if (!sets.length) return { success: true, sin_cambios: true };
    vals.push(idItem);
    await db.query(`UPDATE Inventario SET ${sets.join(', ')} WHERE id_item = ?`, vals);
    return { success: true };
  }

  /**
   * Items de la misma familia que el item dado, excluyéndolo. Se usa para
   * mostrar advertencias en el modal de recepción de OC ALMACÉN — si el
   * logístico va a recibir contra "ALAMBRE MIG" y existe "ALAMBRE FCAW"
   * en la misma familia, le mostramos el aviso para que confirme.
   *
   * Sesión 13/05/2026: motivado por un caso real donde se recibió un
   * rollo FCAW cargándolo como MIG (variantes visualmente similares).
   */
  async getFamiliaSimilares(idItem: number) {
    const [rows]: any = await db.query(
      `SELECT id_item, sku, nombre, unidad, stock_actual, costo_promedio_unitario
         FROM Inventario
        WHERE familia = (SELECT familia FROM Inventario WHERE id_item = ?)
          AND familia IS NOT NULL
          AND id_item <> ?
        ORDER BY nombre`,
      [idItem, idItem]
    );
    return rows;
  }

  /**
   * Corrige una entrada de inventario mal asignada (recepción al item
   * equivocado). Caso típico: el logístico recibió un rollo FCAW pero lo
   * cargó como MIG — stock incorrecto en MIG, costo promedio contaminado.
   *
   * Operación atómica:
   *  1. Revertir el movimiento original (borrar entry o crear ajuste negativo).
   *  2. Re-aplicar el movimiento sobre el item correcto (entrada + costo).
   *  3. Recalcular costo_promedio_unitario de ambos items.
   *  4. Audit log en tabla Auditoria.
   *
   * Solo permitido sobre MovimientosInventario de tipo ENTRADA + referencia
   * ORDEN_COMPRA. Movimientos de SALIDA (consumo a proyecto) no se corrigen
   * por acá — primero corregís la entrada y luego rehacés el retiro.
   *
   * Solo GERENTE — la decisión política se aplica en la capa de routes.
   */
  async corregirRecepcion(params: {
    id_movimiento: number;
    id_item_correcto: number;
    motivo: string;
    id_usuario: number | null;
    nombre_usuario?: string;
  }) {
    const { id_movimiento, id_item_correcto, motivo } = params;
    if (!motivo || !motivo.trim()) {
      throw new Error('motivo de corrección requerido (auditable)');
    }
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Cargar el movimiento original con lock
      const [movRows]: any = await conn.query(
        `SELECT mi.id_movimiento, mi.id_item, mi.cantidad, mi.referencia_tipo,
                mi.referencia_id, mi.tipo_movimiento, mi.fecha_movimiento,
                inv.nombre AS nombre_item_actual,
                inv.costo_promedio_unitario AS costo_actual,
                inv.stock_actual AS stock_actual
           FROM MovimientosInventario mi
           JOIN Inventario inv ON inv.id_item = mi.id_item
          WHERE mi.id_movimiento = ?
          FOR UPDATE`,
        [id_movimiento]
      );
      const mov = movRows[0];
      if (!mov) throw new Error('Movimiento no encontrado');
      if (mov.tipo_movimiento !== 'ENTRADA') {
        throw new Error('Solo se pueden corregir movimientos de tipo ENTRADA');
      }
      if (mov.referencia_tipo !== 'ORDEN_COMPRA') {
        throw new Error('Solo se pueden corregir entradas vinculadas a Orden de Compra');
      }
      if (Number(mov.cantidad) <= 0) {
        throw new Error('Movimiento original con cantidad inválida');
      }
      if (Number(mov.id_item) === Number(id_item_correcto)) {
        throw new Error('El item destino es el mismo que el actual — sin cambio');
      }

      const cantidad      = Number(mov.cantidad);
      const idItemViejo   = Number(mov.id_item);
      const idItemNuevo   = Number(id_item_correcto);

      // 2. Cargar el item destino con lock + recuperar la línea de OC
      // (DetalleOrdenCompra) que originó este movimiento para sacar el costo
      // unitario real con el que se cargó originalmente.
      const [destRows]: any = await conn.query(
        `SELECT id_item, nombre, stock_actual, costo_promedio_unitario
           FROM Inventario WHERE id_item = ? FOR UPDATE`,
        [idItemNuevo]
      );
      const dest = destRows[0];
      if (!dest) throw new Error('Item destino no encontrado');

      // Recuperar costo unitario del DetalleOrdenCompra (la fuente real).
      // Como un MovimientoInventario referencia una OC pero no una línea
      // específica, asumimos que es la primera línea de esa OC con el item
      // viejo. Si hay ambigüedad por múltiples líneas del mismo item en la
      // misma OC, usamos el promedio ponderado.
      const [detRows]: any = await conn.query(
        `SELECT cantidad_recibida, precio_unitario
           FROM DetalleOrdenCompra
          WHERE id_oc = ? AND id_item = ? AND cantidad_recibida > 0`,
        [mov.referencia_id, idItemViejo]
      );
      let costoUnitario = Number(mov.costo_actual) || 0;
      if (detRows.length === 1) {
        costoUnitario = Number(detRows[0].precio_unitario) || costoUnitario;
      } else if (detRows.length > 1) {
        let totMonto = 0, totCant = 0;
        for (const d of detRows) {
          totMonto += Number(d.precio_unitario) * Number(d.cantidad_recibida);
          totCant  += Number(d.cantidad_recibida);
        }
        costoUnitario = totCant > 0 ? totMonto / totCant : costoUnitario;
      }
      const valorTotal = cantidad * costoUnitario;

      // 3. REVERSAR sobre el item VIEJO ─────────────────────────────────
      // Restamos stock + recalculamos costo promedio sacando el lote.
      const stockViejoActual  = Number(mov.stock_actual);
      const costoViejoActual  = Number(mov.costo_actual);
      const stockViejoDespues = stockViejoActual - cantidad;
      let costoViejoDespues = costoViejoActual;
      // Si después de quitar este lote queda stock, recalculamos el promedio.
      // Si queda 0 o negativo, no podemos calcular promedio → lo dejamos en 0.
      const valorViejoActual  = stockViejoActual * costoViejoActual;
      const valorRestanteViejo = valorViejoActual - valorTotal;
      if (stockViejoDespues > 0) {
        costoViejoDespues = Math.max(0, valorRestanteViejo / stockViejoDespues);
      } else {
        costoViejoDespues = 0;
      }

      await conn.query(
        `UPDATE Inventario
            SET stock_actual = ?,
                costo_promedio_unitario = ?,
                updated_at = NOW()
          WHERE id_item = ?`,
        [Math.max(0, stockViejoDespues), costoViejoDespues, idItemViejo]
      );

      // 4. APLICAR sobre el item NUEVO ──────────────────────────────────
      // Sumamos stock + recalculamos costo promedio ponderado.
      const stockNuevoActual  = Number(dest.stock_actual);
      const costoNuevoActual  = Number(dest.costo_promedio_unitario);
      const stockNuevoDespues = stockNuevoActual + cantidad;
      const valorNuevoActual  = stockNuevoActual * costoNuevoActual;
      const valorNuevoDespues = valorNuevoActual + valorTotal;
      const costoNuevoDespues = stockNuevoDespues > 0
        ? valorNuevoDespues / stockNuevoDespues
        : costoUnitario;

      await conn.query(
        `UPDATE Inventario
            SET stock_actual = ?,
                costo_promedio_unitario = ?,
                updated_at = NOW()
          WHERE id_item = ?`,
        [stockNuevoDespues, costoNuevoDespues, idItemNuevo]
      );

      // 5. Mover el MovimientoInventario al item correcto + actualizar saldo
      // (no creamos uno nuevo — mantenemos el id_movimiento original para no
      // duplicar el kárdex y dejar trazabilidad limpia).
      await conn.query(
        `UPDATE MovimientosInventario
            SET id_item = ?,
                saldo_posterior = ?,
                updated_at = NOW()
          WHERE id_movimiento = ?`,
        [idItemNuevo, stockNuevoDespues, id_movimiento]
      );

      // 6. Si la OC original tenía DetalleOrdenCompra apuntando al item viejo,
      // también lo movemos al item correcto (la línea representa lo que se
      // recibió físicamente, no lo que se pidió).
      await conn.query(
        `UPDATE DetalleOrdenCompra
            SET id_item = ?
          WHERE id_oc = ? AND id_item = ?`,
        [idItemNuevo, mov.referencia_id, idItemViejo]
      );

      // 7. Audit log
      await conn.query(
        `INSERT INTO Auditoria
           (fecha, id_usuario, nombre_usuario, accion, entidad, entidad_id,
            datos_antes, datos_despues)
         VALUES (NOW(), ?, ?, 'UPDATE', 'MovimientoInventario', ?, ?, ?)`,
        [
          params.id_usuario || null,
          params.nombre_usuario || 'sistema',
          String(id_movimiento),
          JSON.stringify({
            id_item:       idItemViejo,
            nombre_item:   mov.nombre_item_actual,
            cantidad,
            costo_unitario: costoUnitario,
            stock_resultante_viejo: stockViejoDespues,
          }),
          JSON.stringify({
            id_item:       idItemNuevo,
            nombre_item:   dest.nombre,
            cantidad,
            costo_unitario: costoUnitario,
            stock_resultante_nuevo: stockNuevoDespues,
            motivo,
          }),
        ]
      );

      await conn.commit();
      return {
        success: true,
        item_viejo: {
          id: idItemViejo,
          nombre: mov.nombre_item_actual,
          stock_nuevo: Math.max(0, stockViejoDespues),
          costo_promedio_nuevo: costoViejoDespues,
        },
        item_nuevo: {
          id: idItemNuevo,
          nombre: dest.nombre,
          stock_nuevo: stockNuevoDespues,
          costo_promedio_nuevo: costoNuevoDespues,
        },
        cantidad_movida: cantidad,
        costo_unitario: costoUnitario,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Elimina un ítem del catálogo con guards de integridad.
   *
   * Modo NORMAL (cualquier usuario): bloquea si:
   *   - stock_actual > 0
   *   - tiene compras activas (no anuladas) referenciándolo
   *   - tiene costos en servicios
   *
   * Modo FORZADO (force=true, solo GERENTE): bypassa guards y arrasa con todo:
   *   - DELETE MovimientosInventario para el ítem (kárdex completo)
   *   - DELETE CostosServicio (costos huérfanos del ítem)
   *   - DELETE DetalleCompra → recalcula totales de Compras afectadas
   *   - DELETE Inventario
   *   - Si tiene compras vivas: borra los detalles. La Compra sigue viva
   *     pero con totales recalculados desde el resto de ítems.
   *
   * Solo usar force=true para limpiar data corrupta o duplicados con kárdex
   * histórico. Genera inconsistencias contables si se aplica a items reales
   * con kárdex válido.
   */
  async deleteItem(idItem: number, opts: { force?: boolean } = {}) {
    const [rows] = await db.query(
      'SELECT id_item, stock_actual, nombre FROM Inventario WHERE id_item = ?',
      [idItem]
    );
    const item = (rows as any)[0];
    if (!item) throw new Error('Ítem no encontrado.');

    if (!opts.force) {
      if (Number(item.stock_actual) > 0) {
        throw new Error(`No se puede eliminar "${item.nombre}" porque tiene ${item.stock_actual} unidades en stock. Consuma o ajuste el stock primero, o usá Eliminación forzada (GERENTE).`);
      }
      const [comprasRows] = await db.query(`
        SELECT COUNT(*) as total FROM DetalleCompra dc
        JOIN Compras c ON c.id_compra = dc.id_compra
        WHERE dc.id_item = ? AND c.estado != 'ANULADO'
      `, [idItem]);
      const comprasActivas = Number((comprasRows as any)[0].total);
      if (comprasActivas > 0) {
        throw new Error(`No se puede eliminar "${item.nombre}" porque tiene ${comprasActivas} compra(s) activa(s) asociada(s). Anula esas compras o usá Eliminación forzada (GERENTE).`);
      }
      const [costos] = await db.query(
        'SELECT COUNT(*) as n FROM CostosServicio WHERE id_item = ?', [idItem]
      );
      if ((costos as any)[0].n > 0) {
        throw new Error(`No se puede eliminar "${item.nombre}" porque tiene costos registrados en servicios activos. Usá Eliminación forzada (GERENTE) para arrasar.`);
      }
    }

    // FORCE o sin dependencias: borrado completo
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // Capturar compras afectadas para recalcular totales después
      const [comprasAfectadas]: any = await conn.query(
        `SELECT DISTINCT id_compra FROM DetalleCompra WHERE id_item = ?`,
        [idItem]
      );
      await conn.query('DELETE FROM CostosServicio WHERE id_item = ?', [idItem]);
      await conn.query('DELETE FROM DetalleCompra WHERE id_item = ?', [idItem]);
      await conn.query('DELETE FROM MovimientosInventario WHERE id_item = ?', [idItem]);
      await conn.query('DELETE FROM Inventario WHERE id_item = ?', [idItem]);

      // Recalcular totales de las Compras afectadas (sumar lo que quede en
      // DetalleCompra). Si la compra queda sin detalles, total=0.
      for (const c of (comprasAfectadas as any[])) {
        const [agg]: any = await conn.query(
          `SELECT COALESCE(SUM(subtotal), 0) AS sub FROM DetalleCompra WHERE id_compra = ?`,
          [c.id_compra]
        );
        const subtotal = Number(agg[0].sub);
        await conn.query(
          `UPDATE Compras SET monto_base = ?, igv_base = ROUND(? * 0.18, 2),
                  total_base = ROUND(? * 1.18, 2)
            WHERE id_compra = ? AND aplica_igv = TRUE`,
          [subtotal, subtotal, subtotal, c.id_compra]
        );
        await conn.query(
          `UPDATE Compras SET monto_base = ?, igv_base = 0, total_base = ?
            WHERE id_compra = ? AND aplica_igv = FALSE`,
          [subtotal, subtotal, c.id_compra]
        );
      }

      await conn.commit();
      return {
        success: true,
        nombre: item.nombre,
        forzado: !!opts.force,
        compras_afectadas: (comprasAfectadas as any[]).length,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default new InventoryService();

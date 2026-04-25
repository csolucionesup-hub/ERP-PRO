import { db } from '../../../database/connection';
import { nowSQL } from '../../lib/dateUtils';

class InventoryService {
  /**
   * Obtiene el listado de Catálogo de Almacén Valorado Históricamente.
   */
  async getInventario() {
    const query = `
      SELECT
        id_item, sku, categoria, nombre, unidad, stock_actual, stock_minimo,
        costo_promedio_unitario AS costo_promedio,
        (stock_actual * costo_promedio_unitario) as valorizado
      FROM Inventario
      ORDER BY nombre ASC
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
  async registrarConsumoServicio(data: { id_servicio: number, detalles: { id_item: number, cantidad: number }[] }) {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
      const [srvRows] = await conn.query('SELECT id_servicio, estado FROM Servicios WHERE id_servicio = ?', [data.id_servicio]);
      const srv = (srvRows as any)[0];
      if (!srv) throw new Error('Servicio no encontrado');
      if (['COBRADO', 'ANULADO'].includes(srv.estado)) throw new Error('No se puede registrar consumo en un servicio ' + srv.estado);

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

         // Ingresamos Trazabilidad Kárdex de Egreso (Salida)
         await conn.query(`
            INSERT INTO MovimientosInventario (id_item, referencia_tipo, referencia_id, tipo_movimiento, cantidad, saldo_posterior, fecha_movimiento)
            VALUES (?, 'SERVICIO', ?, 'SALIDA', ?, ?, ?)
         `, [item.id_item, data.id_servicio, item.cantidad, saldoRestante, fechaConsumo]);

         // === PUENTE FINANCIERO ===
         // Inyectamos esto como Costo Directo de Servicio logrando Matemáticamente Utilidades Reales
         const costoTotalValorizado = parseFloat((item.cantidad * costoUnitario).toFixed(2));
         
         await conn.query(`
            INSERT INTO CostosServicio (id_servicio, concepto, moneda, monto_original, tipo_cambio, monto_base, tipo_costo, fecha)
            VALUES (?, ?, 'PEN', ?, 1.0000, ?, 'MATERIAL_CONSUMO', ?)
         `, [
            data.id_servicio, 
            'Consumo Inventario [Ítem ' + insumo.nombre + ']', 
            costoTotalValorizado, costoTotalValorizado, // Original y Base
            fechaConsumo.split(' ')[0] // Extrae el DATE
         ]);
      }

      await conn.commit();
      return { success: true, message: 'Inventario depletado y costos inyectados a servicio con éxito' };
    } catch (error) {
       await conn.rollback();
       throw error;
    } finally {
       conn.release();
    }
  }
  async deleteItem(idItem: number) {
    const [rows] = await db.query(
      'SELECT id_item, stock_actual, nombre FROM Inventario WHERE id_item = ?',
      [idItem]
    );
    const item = (rows as any)[0];
    if (!item) throw new Error('Ítem no encontrado.');
    if (Number(item.stock_actual) > 0) {
      throw new Error(`No se puede eliminar "${item.nombre}" porque tiene ${item.stock_actual} unidades en stock. Consuma o ajuste el stock primero.`);
    }

    // Verificar que no tenga compras activas referenciando este ítem
    const [comprasRows] = await db.query(`
      SELECT COUNT(*) as total FROM DetalleCompra dc
      JOIN Compras c ON c.id_compra = dc.id_compra
      WHERE dc.id_item = ? AND c.estado != 'ANULADO'
    `, [idItem]);
    const comprasActivas = Number((comprasRows as any)[0].total);
    if (comprasActivas > 0) {
      throw new Error(`No se puede eliminar "${item.nombre}" porque tiene ${comprasActivas} compra(s) activa(s) asociada(s).`);
    }

    const [costos] = await db.query(
      'SELECT COUNT(*) as n FROM CostosServicio WHERE id_item = ?', [idItem]
    );
    if ((costos as any)[0].n > 0) {
      throw new Error('No se puede eliminar el ítem porque tiene costos registrados en servicios activos.');
    }

    await db.query('DELETE FROM MovimientosInventario WHERE id_item = ?', [idItem]);
    await db.query('DELETE FROM Inventario WHERE id_item = ?', [idItem]);
    return { success: true };
  }
}

export default new InventoryService();

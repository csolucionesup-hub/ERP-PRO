import { db } from '../../../database/connection';

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

     // Obtener el último SKU de esa categoría
     const [rows] = await db.query(
       `SELECT sku FROM Inventario WHERE sku LIKE ? ORDER BY id_item DESC LIMIT 1`,
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
     const [result] = await db.query(
       'INSERT INTO Inventario (sku, categoria, nombre, unidad, stock_minimo) VALUES (?, ?, ?, ?, ?)',
       [sku, data.categoria, data.nombre, data.unidad || 'UND', min_stock]
     );
     return { id_item: (result as any).insertId, sku, categoria: data.categoria, nombre: data.nombre, unidad: data.unidad, stock_actual: 0, stock_minimo: min_stock };
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
      const fechaConsumo = new Date().toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:MM:SS local db

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
    const [rows] = await db.query('SELECT id_item FROM Inventario WHERE id_item = ?', [idItem]);
    if (!(rows as any)[0]) throw new Error('Ítem no encontrado.');
    await db.query('DELETE FROM MovimientosInventario WHERE id_item = ?', [idItem]);
    await db.query('DELETE FROM Inventario WHERE id_item = ?', [idItem]);
    return { success: true };
  }
}

export default new InventoryService();

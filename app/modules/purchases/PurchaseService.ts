import { db } from '../../../database/connection';

class PurchaseService {
  /**
   * Obtiene la vista rápida del historial (Con JOIN para nombre del proveedor)
   */
  async getCompras() {
    const query = `
      SELECT
        c.id_compra,
        c.nro_oc,
        c.fecha,
        p.razon_social AS proveedor_nombre,
        c.nro_comprobante,
        c.estado_pago,
        c.aplica_igv,
        c.total_base
      FROM Compras c
      INNER JOIN Proveedores p ON p.id_proveedor = c.id_proveedor
      WHERE c.estado != 'ANULADA'
      ORDER BY c.fecha DESC
    `;
    const [rows] = await db.query(query);
    return rows;
  }

  /**
   * Motor Transaccional: Inserta la orden, el detalle, transfiere fondos (Transacciones) y suma Inventario.
   */
  async registrarCompra(data: any) {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
      // Calcular IGV según aplica_igv
      const aplicaIgv = data.aplica_igv !== false;
      const igvBase = aplicaIgv ? data.igv_base : 0;
      const totalBase = data.monto_base + igvBase;

      // 1. Cabecera Compras
      const [compraRes] = await conn.query(`
        INSERT INTO Compras (nro_oc, id_proveedor, fecha, nro_comprobante, moneda, tipo_cambio, monto_base, igv_base, total_base, aplica_igv, estado_pago)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.nro_oc, data.id_proveedor, data.fecha, data.nro_comprobante, data.moneda,
        data.tipo_cambio, data.monto_base, igvBase, totalBase, aplicaIgv, data.estado_pago
      ]);
      const idCompra = (compraRes as any).insertId;

      // 2. Detalle Compras (Iteración sobre ítems)
      const detallesValues = data.detalles.map((d: any) => [
         idCompra, d.id_item, d.cantidad, d.precio_unitario, d.subtotal
      ]);
      await conn.query(`
        INSERT INTO DetalleCompra (id_compra, id_item, cantidad, precio_unitario, subtotal)
        VALUES ?
      `, [detallesValues]);

      // 3. Crear el Asiento Contable Genuino (EGRESO Financiero)
      // Asumiendo la cuenta ID = 1 por defecto logístico
      await conn.query(`
        INSERT INTO Transacciones (
          id_cuenta, referencia_tipo, referencia_id, tipo_movimiento,
          moneda, tipo_cambio, aplica_igv, monto_original, igv_original, total_original,
          monto_base, igv_base, total_base, fecha, descripcion
        ) VALUES (?, 'COMPRA', ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        1, idCompra, data.moneda, data.tipo_cambio, aplicaIgv,
        data.monto_base, igvBase, totalBase,
        data.monto_base * data.tipo_cambio, igvBase * data.tipo_cambio, totalBase * data.tipo_cambio,
        data.fecha, 'Pago por Factura Compra ' + data.nro_comprobante
      ]);

      // 4. Afectación de Módulo Interactivo (Inventarios con Costeo Promedio Directo)
      for (const item of data.detalles) {

        // Extraer Stock Vigente y Costo Promedio Histórico
        const [rowsInv] = await conn.query('SELECT stock_actual, costo_promedio_unitario FROM Inventario WHERE id_item = ? FOR UPDATE', [item.id_item]);
        const m = (rowsInv as any)[0];
        if (!m) throw new Error('Ítem de catálogo ID ' + item.id_item + ' inexistente en registro.');

        const stockVigente = Number(m.stock_actual);
        const costoHist = Number(m.costo_promedio_unitario);
        
        // Matemática Ponderada
        const nuevoStock = stockVigente + item.cantidad;
        const baseHistorica = stockVigente * costoHist;
        const baseAdquirida = item.cantidad * item.precio_unitario; // Asumiendo que el precio_unitario es sin IGV
        
        // Prevenir división x cero. Si nuevoStock=0 (inusual adición 0), retiene costo histórico.
        const nuevoCostoPromedio = nuevoStock > 0 ? (baseHistorica + baseAdquirida) / nuevoStock : costoHist;

        // Actualizamos Kardex Mínimo Logístico
        await conn.query(`
           UPDATE Inventario 
           SET stock_actual = ?, costo_promedio_unitario = ?
           WHERE id_item = ?
        `, [nuevoStock, nuevoCostoPromedio.toFixed(4), item.id_item]);

        // Guardamos el Log Transaccional del Kárdex (Income)
        await conn.query(`
          INSERT INTO MovimientosInventario (
            id_item, referencia_tipo, referencia_id, tipo_movimiento, cantidad, saldo_posterior, fecha_movimiento
          ) VALUES (?, 'COMPRA', ?, 'INGRESO', ?, ?, ?)
        `, [item.id_item, idCompra, item.cantidad, nuevoStock, data.fecha]);
      }

      await conn.commit();
      return { msg: 'Transacción multi-fase operada exitosamente', id_compra: idCompra };
      
    } catch (e) {
      // Bloqueamos inconsistencias
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  /**
   * ANULACIÓN PROFESIONAL: Revierte el impacto en Inventario y Finanzas.
   */
  async anularCompra(idCompra: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Verificar estado actual y detalles
      const [rows] = await conn.query('SELECT estado, nro_comprobante FROM Compras WHERE id_compra = ? FOR UPDATE', [idCompra]);
      const compra = (rows as any)[0];
      if (!compra) throw new Error('Compra no encontrada.');
      if (compra.estado === 'ANULADA') throw new Error('Esta compra ya se encuentra anulada.');

      const [detalles] = await conn.query('SELECT id_item, cantidad FROM DetalleCompra WHERE id_compra = ?', [idCompra]);
      
      // 2. Reversión de Inventario (Validar stock para evitar negativos si ya hubo consumos)
      for (const item of (detalles as any[])) {
        const [invRows] = await conn.query('SELECT stock_actual, nombre FROM Inventario WHERE id_item = ? FOR UPDATE', [item.id_item]);
        const inv = (invRows as any)[0];
        
        if (inv.stock_actual < item.cantidad) {
          throw new Error(`Imposible anular: El stock de "${inv.nombre}" (${inv.stock_actual}) es insuficiente para revertir la entrada de ${item.cantidad} unidades.`);
        }

        const nuevoStock = Number(inv.stock_actual) - Number(item.cantidad);
        
        await conn.query('UPDATE Inventario SET stock_actual = ? WHERE id_item = ?', [nuevoStock, item.id_item]);
        
        // Log de Reversión
        await conn.query(`
          INSERT INTO MovimientosInventario (
            id_item, referencia_tipo, referencia_id, tipo_movimiento, cantidad, saldo_posterior, fecha_movimiento
          ) VALUES (?, 'COMPRA', ?, 'ANULACION_EGRESO', ?, ?, NOW())
        `, [item.id_item, idCompra, -item.cantidad, nuevoStock]);
      }

      // 3. Anular Cabecera y Transacciones
      await conn.query("UPDATE Compras SET estado = 'ANULADA', estado_pago = 'ANULADO', tipo_ultima_accion = 'ANULACION' WHERE id_compra = ?", [idCompra]);
      await conn.query("UPDATE Transacciones SET estado = 'ANULADO' WHERE referencia_tipo = 'COMPRA' AND referencia_id = ?", [idCompra]);

      await conn.commit();
      return { success: true, msg: 'Compra anulada y stock revertido correctamente.' };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default new PurchaseService();

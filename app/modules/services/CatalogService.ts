import { db } from '../../../database/connection';

class CatalogService {
  /**
   * Extrae el Listado Histórico de Servicios con Matemática Financiera (Cross-Query)
   */
  async getServicios() {
    const query = `
      SELECT
        s.id_servicio, s.codigo, s.nombre, s.cliente, s.fecha_servicio, s.moneda, s.tipo_cambio,
        s.nro_cotizacion, s.monto_base as ingreso_neto, s.igv_base, s.total_base,
        s.detraccion_porcentaje, s.monto_detraccion, s.retencion_porcentaje, s.monto_retencion, s.estado, s.estado_trabajo, s.fecha_vencimiento,
        DATEDIFF(s.fecha_vencimiento, CURDATE()) as dias_restantes,
        IFNULL((SELECT cliente_deposito FROM Detracciones WHERE id_servicio = s.id_servicio LIMIT 1), 'NA') as detraccion_depositada,

        IFNULL((SELECT SUM(monto_base) FROM CostosServicio WHERE id_servicio = s.id_servicio), 0) AS costos_ejecutados,
        IFNULL((SELECT SUM(monto_base) FROM Transacciones WHERE referencia_tipo='SERVICIO' AND referencia_id = s.id_servicio AND tipo_movimiento='INGRESO'), 0) AS cobrado_liquido

      FROM Servicios s
      WHERE s.estado != 'ANULADO'
      ORDER BY s.fecha_servicio DESC, s.id_servicio DESC
    `;
    const [rows] = await db.query(query);
    
    // Parseo JS para derivar porcentajes de rentabilidad (Costo vs Ingreso Neto)
    return (rows as any[]).map(r => {
       const ingresoNeto = Number(r.ingreso_neto);
       const costo = Number(r.costos_ejecutados);
       const utilidadReala = ingresoNeto - costo;
       const margenReal = ingresoNeto > 0 ? (utilidadReala / ingresoNeto) : 0;
       
       return {
           ...r,
           utilidad_neta: utilidadReala,
           margen_porcentual: margenReal
       };
    });
  }

  /**
   * Emite una Nueva Factura / Proforma de Servicio Integrando IGV y Ley de Detracciones
   */
  async createServicio(data: any) {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
       // Moneda y tipo de cambio — siempre primero para que todos los montos queden en PEN
       const moneda = (data.moneda || 'PEN').toUpperCase();
       const tipo_cambio = moneda === 'USD' ? Number(data.tipo_cambio) || 1 : 1;

       // Calcular Matemática — monto_base siempre en PEN (USD × TC)
       const aplica_igv = !!data.aplica_igv;
       const monto_base = Number(data.monto_base) * tipo_cambio;
       const igv_base = aplica_igv ? (monto_base * 0.18) : 0;
       const total_base = monto_base + igv_base;

       const detraccion_porcentaje = Number(data.detraccion_porcentaje || 0);
       const monto_detraccion = detraccion_porcentaje > 0 ? (monto_base * (detraccion_porcentaje / 100)) : 0;
       const retencion_porcentaje = Number(data.retencion_porcentaje || 0);
       const monto_retencion = retencion_porcentaje > 0 ? (monto_base * (retencion_porcentaje / 100)) : 0;

       let fecha_venc = data.fecha_vencimiento;
       if (!fecha_venc) {
          const d = new Date(data.fecha_servicio);
          d.setDate(d.getDate() + 30);
          fecha_venc = d.toISOString().split('T')[0];
       }

       // Generar Código Único
       const codigo = 'SRV-' + new Date().getTime().toString().slice(-6);

       const queryInsert = `
         INSERT INTO Servicios (
            codigo, nro_cotizacion, nombre, cliente, descripcion, fecha_servicio, moneda, tipo_cambio, monto_base,
            aplica_igv, igv_base, total_base, detraccion_porcentaje, monto_detraccion,
            retencion_porcentaje, monto_retencion, estado, fecha_vencimiento
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
       `;

       const [res] = await conn.query(queryInsert, [
          codigo, data.nro_cotizacion || null, data.nombre, data.cliente, data.descripcion || '', data.fecha_servicio,
          moneda, tipo_cambio,
          monto_base, aplica_igv, igv_base, total_base, detraccion_porcentaje, monto_detraccion,
          retencion_porcentaje, monto_retencion, fecha_venc
       ]);

       const idServicio = (res as any).insertId;

       // Insertar Deuda Retenida (Solo si hay detracción)
       if (monto_detraccion > 0) {
           await conn.query(`
               INSERT INTO Detracciones (id_servicio, cliente, porcentaje, monto, estado, cliente_deposito)
               VALUES (?, ?, ?, ?, 'PENDIENTE', 'NO')
           `, [idServicio, data.cliente, detraccion_porcentaje, monto_detraccion]);
       }

       await conn.commit();
       return { success: true, id_servicio: idServicio, codigo };

    } catch (e) {
       await conn.rollback();
       throw e;
    } finally {
       conn.release();
    }
  }

  /**
   * Efectúa Cobro Liquidado a Caja y actualiza Status de Factura
   */
  async registrarCobro(id_servicio: number, monto_pagado_liquido: number, descripcion: string = 'Pago de Cliente') {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // Bloqueo Optimista
        const [rows] = await conn.query("SELECT total_base, monto_detraccion, monto_retencion, estado FROM Servicios WHERE id_servicio = ? FOR UPDATE", [id_servicio]);
        const srv = (rows as any)[0];
        if (!srv) throw new Error('Servicio no encontrado');
        if (srv.estado === 'COBRADO') throw new Error('Factura ya se encuentra 100% Cobrada');

        // Sumar lo depositado históricamente en Caja
        const [rowsCobros] = await conn.query("SELECT IFNULL(SUM(monto_base), 0) as liquidado FROM Transacciones WHERE referencia_tipo='SERVICIO' AND referencia_id = ? AND tipo_movimiento='INGRESO'", [id_servicio]);
        const historialCobrado = Number((rowsCobros as any)[0].liquidado);

        const totalFactura = Number(srv.total_base);
        const detencionLegal = Number(srv.monto_detraccion);
        const retencionLegal = Number(srv.monto_retencion || 0);

        const cobrarMaximoLiquido = totalFactura - detencionLegal - retencionLegal;
        const cobroProyectado = historialCobrado + monto_pagado_liquido;

        // Regla: No se puede cobrar líquido más del remanente (Evasión de dinero fantasma)
        if (cobroProyectado > cobrarMaximoLiquido + 0.1) {
            throw new Error('Monto excede el neto a cobrar permitido excluyendo detención legal (' + cobrarMaximoLiquido + ')');
        }

        // Inyectar Ingreso Líquido a Flujo Real
        const fechaCobro = new Date().toISOString().slice(0, 19).replace('T', ' ');
        // Nota: Asumimos 'id_cuenta=1' como Banco Principal Temporalmente
        await conn.query(`
           INSERT INTO Transacciones (id_cuenta, referencia_tipo, referencia_id, tipo_movimiento, monto_original, igv_original, total_original, monto_base, igv_base, total_base, fecha, descripcion)
           VALUES (1, 'SERVICIO', ?, 'INGRESO', ?, 0, ?, ?, 0, ?, ?, ?)
        `, [
           id_servicio, 
           monto_pagado_liquido, monto_pagado_liquido, monto_pagado_liquido, monto_pagado_liquido,  // original = base asumiendo PEN 1:1, IGV 0 para flujo neto efectivo.
           fechaCobro, descripcion
        ]);

        // Decidir Nuevo Status
        let nuevoEstado = 'PARCIAL';
        // Checkeo con ligero umbral de céntimos para redondeos
        if (Math.abs(cobrarMaximoLiquido - cobroProyectado) < 0.1) {
            nuevoEstado = 'COBRADO';
        }

        await conn.query("UPDATE Servicios SET estado = ? WHERE id_servicio = ?", [nuevoEstado, id_servicio]);

        await conn.commit();
        return { success: true, estado_actualizado: nuevoEstado, abono: monto_pagado_liquido };

    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
  }
  /**
   * ANULACIÓN PROFESIONAL: Revierte el impacto en el Flujo de Caja.
   */
  async anularServicio(idServicio: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Verificar estado actual
      const [rows] = await conn.query('SELECT estado, codigo FROM Servicios WHERE id_servicio = ? FOR UPDATE', [idServicio]);
      const srv = (rows as any)[0];
      if (!srv) throw new Error('Servicio no encontrado.');
      if (srv.estado === 'ANULADO') throw new Error('Este servicio ya se encuentra anulado.');

      // 2. Revertir Inventario si hubo consumos asociados
      const [movimientos] = await conn.query("SELECT id_item, cantidad FROM MovimientosInventario WHERE referencia_tipo = 'SERVICIO' AND referencia_id = ?", [idServicio]);
      for (const mov of (movimientos as any[])) {
        await conn.query('UPDATE Inventario SET stock_actual = stock_actual + ? WHERE id_item = ?', [Math.abs(mov.cantidad), mov.id_item]);
        
        await conn.query(`
          INSERT INTO MovimientosInventario (
            id_item, referencia_tipo, referencia_id, tipo_movimiento, cantidad, saldo_posterior, fecha_movimiento
          ) SELECT id_item, 'SERVICIO', ?, 'ANULACION_INGRESO', ?, stock_actual, NOW() FROM Inventario WHERE id_item = ?
        `, [idServicio, Math.abs(mov.cantidad), mov.id_item]);
      }

      // 3. Anular Cabecera y Transacciones Financieras
      await conn.query("UPDATE Servicios SET estado = 'ANULADO', tipo_ultima_accion = 'ANULACION' WHERE id_servicio = ?", [idServicio]);
      await conn.query("UPDATE Transacciones SET estado = 'ANULADO' WHERE referencia_tipo = 'SERVICIO' AND referencia_id = ?", [idServicio]);
      await conn.query("UPDATE Detracciones SET estado = 'ANULADO' WHERE id_servicio = ?", [idServicio]);

      await conn.commit();
      return { success: true, msg: 'Servicio anulado y consumos revertidos correctamente.' };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async updateServicio(idServicio: number, data: any) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query('SELECT estado FROM Servicios WHERE id_servicio = ? FOR UPDATE', [idServicio]);
      const srv = (rows as any)[0];
      if (!srv) throw new Error('Servicio no encontrado.');
      if (srv.estado === 'ANULADO') throw new Error('No se puede editar un servicio anulado.');
      if (srv.estado === 'COBRADO') throw new Error('No se puede editar un servicio ya cobrado al 100%.');

      const monto_base = Number(data.monto_base);
      const aplica_igv = !!data.aplica_igv;
      const igv_base = aplica_igv ? (monto_base * 0.18) : 0;
      const total_base = monto_base + igv_base;
      const detraccion_porcentaje = Number(data.detraccion_porcentaje || 0);
      const monto_detraccion = detraccion_porcentaje > 0 ? (monto_base * (detraccion_porcentaje / 100)) : 0;
      const retencion_porcentaje = Number(data.retencion_porcentaje || 0);
      const monto_retencion = retencion_porcentaje > 0 ? (monto_base * (retencion_porcentaje / 100)) : 0;

      await conn.query(`
        UPDATE Servicios SET
          nro_cotizacion = ?, nombre = ?, cliente = ?, descripcion = ?,
          fecha_servicio = ?, fecha_vencimiento = ?,
          monto_base = ?, aplica_igv = ?, igv_base = ?, total_base = ?,
          detraccion_porcentaje = ?, monto_detraccion = ?,
          retencion_porcentaje = ?, monto_retencion = ?,
          tipo_ultima_accion = 'EDICION'
        WHERE id_servicio = ?
      `, [
        data.nro_cotizacion || null, data.nombre, data.cliente, data.descripcion || '',
        data.fecha_servicio, data.fecha_vencimiento || null,
        monto_base, aplica_igv, igv_base, total_base,
        detraccion_porcentaje, monto_detraccion,
        retencion_porcentaje, monto_retencion,
        idServicio
      ]);

      if (monto_detraccion > 0) {
        const [detRows] = await conn.query('SELECT id_detraccion FROM Detracciones WHERE id_servicio = ?', [idServicio]);
        if ((detRows as any).length > 0) {
          await conn.query('UPDATE Detracciones SET porcentaje = ?, monto = ?, cliente = ? WHERE id_servicio = ?',
            [detraccion_porcentaje, monto_detraccion, data.cliente, idServicio]);
        } else {
          await conn.query(`INSERT INTO Detracciones (id_servicio, cliente, porcentaje, monto, estado, cliente_deposito)
            VALUES (?, ?, ?, ?, 'PENDIENTE', 'NO')`, [idServicio, data.cliente, detraccion_porcentaje, monto_detraccion]);
        }
      }

      await conn.commit();
      return { success: true, msg: 'Servicio actualizado.' };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async deleteServicio(idServicio: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query('SELECT estado FROM Servicios WHERE id_servicio = ? FOR UPDATE', [idServicio]);
      const srv = (rows as any)[0];
      if (!srv) throw new Error('Servicio no encontrado.');

      await conn.query("DELETE FROM Detracciones WHERE id_servicio = ?", [idServicio]);
      await conn.query("DELETE FROM CostosServicio WHERE id_servicio = ?", [idServicio]);
      await conn.query("DELETE FROM Servicios WHERE id_servicio = ?", [idServicio]);

      await conn.commit();
      return { success: true, msg: 'Servicio eliminado.' };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default new CatalogService();

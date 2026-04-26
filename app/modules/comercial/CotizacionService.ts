import { db } from '../../../database/connection';

const ESTADOS_VALIDOS = [
  'EN_PROCESO',
  'ENVIADA',
  'APROBADA',
  'NO_APROBADA',
  'RECHAZADA',
  'TERMINADA',
  'A_ESPERA_RESPUESTA',
] as const;

type EstadoCotizacion = typeof ESTADOS_VALIDOS[number];
type Marca = 'METAL' | 'PERFOTOOLS';

// MN = Moneda Nacional (Metal Engineers) · ME = Moneda Extranjera (Perfotools)
const SUFIJO_MARCA: Record<Marca, string> = {
  METAL:      'MN',
  PERFOTOOLS: 'ME',
};

interface DetalleCotizacionInput {
  descripcion: string;
  subdescripcion?: string;
  notas?: string;
  foto_url?: string;
  unidad?: string;
  cantidad: number;
  precio_unitario: number;
}

interface CotizacionInput {
  marca?: Marca;
  cliente: string;
  atencion?: string;
  telefono?: string;
  correo?: string;
  proyecto?: string;
  ref?: string;
  moneda?: 'PEN' | 'USD';
  tipo_cambio?: number;
  aplica_igv?: boolean;
  forma_pago?: string;
  validez_oferta?: string;
  plazo_entrega?: string;
  lugar_entrega?: string;
  lugar_trabajo?: string;
  precios_incluyen?: string;
  comentarios?: string;
  detalles: DetalleCotizacionInput[];
}

class CotizacionService {

  /**
   * Correlativo independiente por marca dentro del año — ATÓMICO.
   * COT 2026-001-MN (Metal), COT 2026-001-ME (Perfotools) — secuencias separadas.
   *
   * Usa tabla Correlativos con INSERT ... ON DUPLICATE KEY UPDATE para
   * garantizar que dos inserts concurrentes no obtengan el mismo número.
   * Corre dentro de la transacción de createCotizacion (conn opcional).
   */
  private async generarCorrelativo(marca: Marca, conn?: any): Promise<string> {
    const anio = new Date().getFullYear();
    const sufijo = SUFIJO_MARCA[marca];
    const runner = conn || db;

    await runner.query(
      `INSERT INTO Correlativos (anio, marca, ultimo)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ultimo = ultimo + 1`,
      [anio, marca]
    );

    const [rows] = await runner.query(
      `SELECT ultimo FROM Correlativos WHERE anio = ? AND marca = ?`,
      [anio, marca]
    );
    const secuencia = Number((rows as any)[0].ultimo);
    const nnn = String(secuencia).padStart(3, '0');

    return `COT ${anio}-${nnn}-${sufijo}`;
  }

  private calcularTotales(
    detalles: DetalleCotizacionInput[],
    moneda: 'PEN' | 'USD',
    tipo_cambio: number,
    aplica_igv: boolean
  ) {
    const subtotalOriginal = detalles.reduce(
      (acc, d) => acc + Number(d.cantidad) * Number(d.precio_unitario),
      0
    );
    const subtotal = moneda === 'USD'
      ? Number((subtotalOriginal * tipo_cambio).toFixed(2))
      : Number(subtotalOriginal.toFixed(2));
    const igv = aplica_igv ? Number((subtotal * 0.18).toFixed(2)) : 0;
    const total = Number((subtotal + igv).toFixed(2));
    return { subtotal, igv, total };
  }

  // ─── DASHBOARD ───────────────────────────────────────────────────────────────

  async getDashboard() {
    // Totales por moneda (excluye ANULADAS)
    const [totalesPorMoneda] = await db.query(
      `SELECT moneda, COUNT(*) AS cantidad, SUM(total) AS monto
       FROM Cotizaciones
       WHERE estado != 'ANULADA'
       GROUP BY moneda`
    );

    // Distribución por estado (con montos para calcular pipeline)
    const [porEstado] = await db.query(
      `SELECT estado,
              COUNT(*) AS cantidad,
              SUM(CASE WHEN moneda='PEN' THEN total ELSE 0 END) AS monto_pen,
              SUM(CASE WHEN moneda='USD' THEN total ELSE 0 END) AS monto_usd
       FROM Cotizaciones
       WHERE estado != 'ANULADA'
       GROUP BY estado
       ORDER BY cantidad DESC`
    );

    // Por marca
    const [porMarca] = await db.query(
      `SELECT marca, COUNT(*) AS cantidad,
              SUM(CASE WHEN moneda='PEN' THEN total ELSE 0 END) AS monto_pen,
              SUM(CASE WHEN moneda='USD' THEN total ELSE 0 END) AS monto_usd
       FROM Cotizaciones
       WHERE estado != 'ANULADA'
       GROUP BY marca`
    );

    // Top 5 clientes (por cantidad de cotizaciones + monto PEN + monto USD)
    const [topClientes] = await db.query(
      `SELECT cliente,
              COUNT(*) AS cantidad,
              SUM(CASE WHEN moneda='PEN' THEN total ELSE 0 END) AS monto_pen,
              SUM(CASE WHEN moneda='USD' THEN total ELSE 0 END) AS monto_usd,
              SUM(CASE WHEN estado='APROBADA' THEN 1 ELSE 0 END) AS aprobadas
       FROM Cotizaciones
       WHERE estado != 'ANULADA'
       GROUP BY cliente
       ORDER BY cantidad DESC
       LIMIT 8`
    );

    // Tendencia mensual últimos 12 meses (extendido de 6)
    const [tendencia] = await db.query(
      `SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes,
              COUNT(*) AS cantidad,
              SUM(CASE WHEN moneda='PEN' THEN total ELSE 0 END) AS monto_pen,
              SUM(CASE WHEN moneda='USD' THEN total ELSE 0 END) AS monto_usd,
              SUM(CASE WHEN estado='APROBADA' THEN 1 ELSE 0 END) AS aprobadas,
              SUM(CASE WHEN estado='APROBADA' AND moneda='PEN' THEN total ELSE 0 END) AS aprobadas_pen
       FROM Cotizaciones
       WHERE estado != 'ANULADA'
         AND fecha >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY DATE_FORMAT(fecha, '%Y-%m')
       ORDER BY mes ASC`
    );

    // Comparativa anual: YTD año actual vs YTD año anterior
    const ahora = new Date();
    const anioActual   = ahora.getFullYear();
    const anioAnterior = anioActual - 1;
    const mesActual    = ahora.getMonth() + 1;
    const mesAnterior  = mesActual === 1 ? 12 : mesActual - 1;
    const anioMesPrev  = mesActual === 1 ? anioActual - 1 : anioActual;

    const [ytdAct]: any = await db.query(`
      SELECT
        COUNT(*) AS cantidad,
        COALESCE(SUM(CASE WHEN moneda='PEN' THEN total ELSE total * tipo_cambio END), 0) AS monto_pen_eq,
        SUM(CASE WHEN estado='APROBADA' THEN 1 ELSE 0 END) AS aprobadas
      FROM Cotizaciones
      WHERE estado != 'ANULADA' AND YEAR(fecha) = ?
    `, [anioActual]);

    const [ytdPrev]: any = await db.query(`
      SELECT
        COUNT(*) AS cantidad,
        COALESCE(SUM(CASE WHEN moneda='PEN' THEN total ELSE total * tipo_cambio END), 0) AS monto_pen_eq,
        SUM(CASE WHEN estado='APROBADA' THEN 1 ELSE 0 END) AS aprobadas
      FROM Cotizaciones
      WHERE estado != 'ANULADA' AND YEAR(fecha) = ? AND MONTH(fecha) <= ?
    `, [anioAnterior, mesActual]);

    const [mesAct]: any = await db.query(`
      SELECT
        COUNT(*) AS cantidad,
        COALESCE(SUM(CASE WHEN moneda='PEN' THEN total ELSE total * tipo_cambio END), 0) AS monto_pen_eq
      FROM Cotizaciones
      WHERE estado != 'ANULADA' AND YEAR(fecha) = ? AND MONTH(fecha) = ?
    `, [anioActual, mesActual]);

    const [mesPrev]: any = await db.query(`
      SELECT
        COUNT(*) AS cantidad,
        COALESCE(SUM(CASE WHEN moneda='PEN' THEN total ELSE total * tipo_cambio END), 0) AS monto_pen_eq
      FROM Cotizaciones
      WHERE estado != 'ANULADA' AND YEAR(fecha) = ? AND MONTH(fecha) = ?
    `, [anioMesPrev, mesAnterior]);

    // Tasa aprobación global
    const todos   = (porEstado as any[]).reduce((s: number, r: any) => s + Number(r.cantidad), 0);
    const aprob   = (porEstado as any[]).find((r: any) => r.estado === 'APROBADA');
    const tasaApr = todos > 0 ? Math.round(((Number(aprob?.cantidad) || 0) / todos) * 100) : 0;

    // Pipeline: cotizaciones activas (EN_PROCESO + ENVIADA + A_ESPERA_RESPUESTA)
    const ESTADOS_PIPELINE = ['EN_PROCESO', 'ENVIADA', 'A_ESPERA_RESPUESTA'];
    const pipeline = (porEstado as any[])
      .filter((r: any) => ESTADOS_PIPELINE.includes(r.estado))
      .reduce((acc: any, r: any) => ({
        cantidad: acc.cantidad + Number(r.cantidad),
        monto_pen: acc.monto_pen + Number(r.monto_pen),
        monto_usd: acc.monto_usd + Number(r.monto_usd),
      }), { cantidad: 0, monto_pen: 0, monto_usd: 0 });

    // Monto aprobado (APROBADA + TERMINADA)
    const aprobado = (porEstado as any[])
      .filter((r: any) => ['APROBADA', 'TERMINADA'].includes(r.estado))
      .reduce((acc: any, r: any) => ({
        cantidad: acc.cantidad + Number(r.cantidad),
        monto_pen: acc.monto_pen + Number(r.monto_pen),
        monto_usd: acc.monto_usd + Number(r.monto_usd),
      }), { cantidad: 0, monto_pen: 0, monto_usd: 0 });

    // Promedios por moneda
    const pen = (totalesPorMoneda as any[]).find((r: any) => r.moneda === 'PEN');
    const usd = (totalesPorMoneda as any[]).find((r: any) => r.moneda === 'USD');
    const promedioPen = pen && Number(pen.cantidad) > 0
      ? Number((Number(pen.monto) / Number(pen.cantidad)).toFixed(2)) : 0;
    const promedioUsd = usd && Number(usd.cantidad) > 0
      ? Number((Number(usd.monto) / Number(usd.cantidad)).toFixed(2)) : 0;

    // Tasa aprobación YTD comparada
    const tasaYtdAct  = Number(ytdAct[0]?.cantidad) > 0
      ? Math.round((Number(ytdAct[0]?.aprobadas)  / Number(ytdAct[0]?.cantidad))  * 100) : 0;
    const tasaYtdPrev = Number(ytdPrev[0]?.cantidad) > 0
      ? Math.round((Number(ytdPrev[0]?.aprobadas) / Number(ytdPrev[0]?.cantidad)) * 100) : 0;

    return {
      totalesPorMoneda: totalesPorMoneda as any[],
      porEstado:        porEstado        as any[],
      porMarca:         porMarca         as any[],
      topClientes:      topClientes      as any[],
      tendencia:        tendencia        as any[],
      tasaAprobacion:   tasaApr,
      pipeline,
      aprobado,
      promedioPen,
      promedioUsd,
      comparativa: {
        anio_actual:   anioActual,
        anio_anterior: anioAnterior,
        meses_transcurridos: mesActual,
        ytd_actual: {
          cantidad:    Number(ytdAct[0]?.cantidad)     || 0,
          monto_pen:   Number(ytdAct[0]?.monto_pen_eq) || 0,
          aprobadas:   Number(ytdAct[0]?.aprobadas)    || 0,
          tasa:        tasaYtdAct,
        },
        ytd_anterior: {
          cantidad:    Number(ytdPrev[0]?.cantidad)     || 0,
          monto_pen:   Number(ytdPrev[0]?.monto_pen_eq) || 0,
          aprobadas:   Number(ytdPrev[0]?.aprobadas)    || 0,
          tasa:        tasaYtdPrev,
        },
        mes_actual: {
          cantidad:  Number(mesAct[0]?.cantidad)     || 0,
          monto_pen: Number(mesAct[0]?.monto_pen_eq) || 0,
        },
        mes_anterior: {
          cantidad:  Number(mesPrev[0]?.cantidad)     || 0,
          monto_pen: Number(mesPrev[0]?.monto_pen_eq) || 0,
        },
      },
    };
  }

  // ─── READ ────────────────────────────────────────────────────────────────────

  async getCotizaciones(marca?: Marca) {
    const where = marca
      ? `WHERE estado != 'ANULADA' AND marca = ?`
      : `WHERE estado != 'ANULADA'`;
    const params = marca ? [marca] : [];

    const [cots] = await db.query(
      `SELECT * FROM Cotizaciones ${where} ORDER BY fecha DESC, id_cotizacion DESC`,
      params
    );

    if ((cots as any[]).length === 0) return [];

    const [dets] = await db.query(
      `SELECT d.*
       FROM DetalleCotizacion d
       INNER JOIN Cotizaciones c ON d.id_cotizacion = c.id_cotizacion
       WHERE c.estado != 'ANULADA'
       ORDER BY d.id_cotizacion, d.id_detalle`
    );

    const detallesPorId = new Map<number, any[]>();
    for (const det of dets as any[]) {
      if (!detallesPorId.has(det.id_cotizacion)) {
        detallesPorId.set(det.id_cotizacion, []);
      }
      detallesPorId.get(det.id_cotizacion)!.push(det);
    }

    return (cots as any[]).map(c => ({
      ...c,
      detalles: detallesPorId.get(c.id_cotizacion) ?? [],
    }));
  }

  async getAnuladas() {
    const [cots] = await db.query(
      `SELECT * FROM Cotizaciones
       WHERE estado = 'ANULADA'
       ORDER BY fecha DESC, id_cotizacion DESC`
    );
    return cots as any[];
  }

  async guardarDriveInfo(id: number, fileId: string, url: string) {
    await db.query(
      `UPDATE Cotizaciones SET drive_file_id = ?, drive_url = ? WHERE id_cotizacion = ?`,
      [fileId, url, id]
    );
  }

  async resetTodo() {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [[{ total }]] = await conn.query(
        `SELECT COUNT(*) AS total FROM Cotizaciones`
      ) as any;
      await conn.query(`DELETE FROM DetalleCotizacion`);
      await conn.query(`DELETE FROM Cotizaciones`);
      await conn.query(`ALTER TABLE Cotizaciones AUTO_INCREMENT = 1`);
      await conn.query(`ALTER TABLE DetalleCotizacion AUTO_INCREMENT = 1`);
      await conn.commit();
      return { eliminadas: Number(total) };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async getCotizacionById(id: number) {
    const [rows] = await db.query(
      `SELECT * FROM Cotizaciones WHERE id_cotizacion = ?`,
      [id]
    );
    const cot = (rows as any)[0];
    if (!cot) throw new Error('Cotización no encontrada');

    const [dets] = await db.query(
      `SELECT * FROM DetalleCotizacion WHERE id_cotizacion = ? ORDER BY id_detalle`,
      [id]
    );

    return { ...cot, detalles: dets as any[] };
  }

  // ─── WRITE ───────────────────────────────────────────────────────────────────

  async createCotizacion(data: CotizacionInput) {
    const {
      marca = 'METAL',
      cliente, atencion, telefono, correo, proyecto, ref,
      moneda = 'PEN', tipo_cambio = 1, aplica_igv = false,
      forma_pago, validez_oferta, plazo_entrega, lugar_entrega, lugar_trabajo,
      precios_incluyen, comentarios,
      detalles,
    } = data;

    const { subtotal, igv, total } = this.calcularTotales(
      detalles, moneda, tipo_cambio, aplica_igv
    );

    const fecha = new Date().toISOString().split('T')[0];

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const nro_cotizacion = await this.generarCorrelativo(marca, conn);
      const [res] = await conn.query(
        `INSERT INTO Cotizaciones
           (nro_cotizacion, marca, fecha, cliente, atencion, telefono, correo, proyecto, ref,
            moneda, tipo_cambio, subtotal, igv, total,
            forma_pago, validez_oferta, plazo_entrega, lugar_entrega, lugar_trabajo,
            comentarios, precios_incluyen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nro_cotizacion, marca, fecha, cliente,
          atencion ?? null, telefono ?? null, correo ?? null,
          proyecto ?? null, ref ?? null,
          moneda, tipo_cambio, subtotal, igv, total,
          forma_pago ?? null, validez_oferta ?? null,
          plazo_entrega ?? null, lugar_entrega ?? null, lugar_trabajo ?? null,
          comentarios ?? null, precios_incluyen ?? null,
        ]
      );

      const id_cotizacion = (res as any).insertId;

      for (const det of detalles) {
        await conn.query(
          `INSERT INTO DetalleCotizacion
             (id_cotizacion, descripcion, subdescripcion, notas, foto_url,
              unidad, cantidad, precio_unitario)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id_cotizacion,
            det.descripcion,
            det.subdescripcion ?? null,
            det.notas ?? null,
            det.foto_url ?? null,
            det.unidad ?? null,
            det.cantidad,
            det.precio_unitario,
          ]
        );
      }

      await conn.commit();
      return { id_cotizacion, nro_cotizacion };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async updateEstado(id: number, estado: string) {
    if (!ESTADOS_VALIDOS.includes(estado as EstadoCotizacion)) {
      throw new Error(
        `Estado inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`
      );
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        `SELECT estado FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [id]
      );
      const cot = (rows as any)[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (cot.estado === 'ANULADA') {
        throw new Error('No se puede cambiar el estado de una cotización ANULADA');
      }

      await conn.query(
        `UPDATE Cotizaciones SET estado = ? WHERE id_cotizacion = ?`,
        [estado, id]
      );

      // Hook a Finanzas: al APROBAR, abrir seguimiento de cobranza
      // (solo si todavía está en NA, para no pisar un avance posterior)
      if (estado === 'APROBADA') {
        await conn.query(
          `UPDATE Cotizaciones
              SET estado_financiero = 'PENDIENTE_DEPOSITO',
                  fecha_aprobacion_comercial = COALESCE(fecha_aprobacion_comercial, NOW())
            WHERE id_cotizacion = ?
              AND estado_financiero = 'NA'`,
          [id]
        );
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async updateCotizacion(id: number, data: CotizacionInput) {
    const ESTADOS_EDITABLES = ['EN_PROCESO', 'A_ESPERA_RESPUESTA'];

    const {
      cliente, atencion, telefono, correo, proyecto, ref,
      moneda = 'PEN', tipo_cambio = 1, aplica_igv = false,
      forma_pago, validez_oferta, plazo_entrega, lugar_entrega, lugar_trabajo,
      precios_incluyen, comentarios,
      detalles,
    } = data;

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        `SELECT estado FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [id]
      );
      const cot = (rows as any)[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (!ESTADOS_EDITABLES.includes(cot.estado)) {
        throw new Error(
          'Solo se pueden editar cotizaciones en estado EN_PROCESO o A_ESPERA_RESPUESTA'
        );
      }

      const { subtotal, igv, total } = this.calcularTotales(
        detalles, moneda, tipo_cambio, aplica_igv
      );

      // marca NO se modifica en update: el correlativo ya fue asignado.
      await conn.query(
        `UPDATE Cotizaciones SET
           cliente = ?, atencion = ?, telefono = ?, correo = ?, proyecto = ?, ref = ?,
           moneda = ?, tipo_cambio = ?, subtotal = ?, igv = ?, total = ?,
           forma_pago = ?, validez_oferta = ?, plazo_entrega = ?,
           lugar_entrega = ?, lugar_trabajo = ?, comentarios = ?, precios_incluyen = ?
         WHERE id_cotizacion = ?`,
        [
          cliente, atencion ?? null, telefono ?? null, correo ?? null,
          proyecto ?? null, ref ?? null,
          moneda, tipo_cambio, subtotal, igv, total,
          forma_pago ?? null, validez_oferta ?? null,
          plazo_entrega ?? null, lugar_entrega ?? null, lugar_trabajo ?? null,
          comentarios ?? null, precios_incluyen ?? null,
          id,
        ]
      );

      await conn.query(
        `DELETE FROM DetalleCotizacion WHERE id_cotizacion = ?`,
        [id]
      );

      for (const det of detalles) {
        await conn.query(
          `INSERT INTO DetalleCotizacion
             (id_cotizacion, descripcion, subdescripcion, notas, foto_url,
              unidad, cantidad, precio_unitario)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            det.descripcion,
            det.subdescripcion ?? null,
            det.notas ?? null,
            det.foto_url ?? null,
            det.unidad ?? null,
            det.cantidad,
            det.precio_unitario,
          ]
        );
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async anularCotizacion(id: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        `SELECT estado FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [id]
      );
      const cot = (rows as any)[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (cot.estado === 'ANULADA') throw new Error('La cotización ya está ANULADA');

      await conn.query(
        `UPDATE Cotizaciones SET estado = 'ANULADA' WHERE id_cotizacion = ?`,
        [id]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default new CotizacionService();

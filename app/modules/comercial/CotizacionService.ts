import { db } from '../../../database/connection';
import ConfiguracionService from '../configuracion/ConfiguracionService';

const ESTADOS_VALIDOS = [
  'EN_PROCESO',
  'ENVIADA',
  'APROBADA',
  'NO_APROBADA',
  'RECHAZADA',
  'TERMINADA',
  'A_ESPERA_RESPUESTA',
  // Trabajo iniciado a riesgo sin compromiso firme de cobro: se cargan gastos
  // contra el cliente pero NO aparece en Finanzas/CxC. Si después el cliente
  // formaliza, se pasa a APROBADA (se reabre el flujo financiero).
  'TRABAJO_EN_RIESGO',
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
  /**
   * Fecha de la cotización en formato YYYY-MM-DD. Si no viene, se usa hoy.
   * Útil cuando se carga data histórica (Julio cargando enero/2025 hoy).
   */
  fecha?: string;
  /**
   * Correlativo manual (OPCIONAL). Solo se respeta si:
   *   - permitir_correlativo_manual está ON en ConfiguracionEmpresa
   *   - El usuario que crea es GERENTE
   *   - Formato: COT YYYY-NNN-MN (o -ME)
   *   - Año del correlativo coincide con año de la fecha
   *   - Fecha está en la ventana válida (24m + año actual)
   *   - No existe ya en BD
   * Si no viene o falla la validación, el sistema cae al modo automático.
   */
  nro_cotizacion?: string;
  detalles: DetalleCotizacionInput[];
}

class CotizacionService {

  /**
   * Correlativo independiente por marca dentro del año.
   * COT 2026-001-MN (Metal), COT 2026-001-ME (Perfotools) — secuencias separadas.
   *
   * Concurrencia: la tabla Correlativos tiene PRIMARY KEY (anio, marca).
   * - UPDATE incrementa atómicamente con row-lock cuando la fila existe.
   * - Si la fila NO existe (primer correlativo del año/marca), se intenta INSERT.
   *   Si dos transacciones cargan la misma combinación al mismo tiempo, una
   *   gana el INSERT y la otra recibe duplicate-key error → reintentamos UPDATE
   *   en el siguiente loop, donde ya existe y se incrementa normal.
   *
   * Si se pasa `anioFecha`, el correlativo usa ese año (útil para cargar
   * cotizaciones históricas con fecha 2025 → COT 2025-N en vez de COT 2026-N).
   * Cada (año, marca) tiene su propia secuencia independiente.
   */
  /**
   * Sincroniza Correlativos.ultimo con MAX(numero) que efectivamente existe
   * en Cotizaciones para esa (año, marca). Cubre el caso del modo migración:
   * si Julio cargó manualmente COT 2025-007-MN, queremos que el siguiente
   * automático sea COT 2025-008-MN aunque la tabla Correlativos esté en 0.
   */
  private async sincronizarCorrelativo(runner: any, marca: Marca, anio: number): Promise<void> {
    const sufijo = SUFIJO_MARCA[marca];
    const [cots]: any = await runner.query(
      `SELECT nro_cotizacion FROM Cotizaciones
       WHERE marca = ? AND nro_cotizacion LIKE ?`,
      [marca, `COT ${anio}-%-${sufijo}`]
    );
    const re = new RegExp(`^COT \\d{4}-(\\d{3})-${sufijo}$`);
    const nums = (cots as any[])
      .map(c => {
        const m = String(c.nro_cotizacion).match(re);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => n > 0);
    if (!nums.length) return;
    const maxExistente = Math.max(...nums);

    // UPDATE para forzar que Correlativos.ultimo no quede atrás del MAX real
    const [upd]: any = await runner.query(
      `UPDATE Correlativos SET ultimo = GREATEST(ultimo, ?) WHERE anio = ? AND marca = ?`,
      [maxExistente, anio, marca]
    );
    if (upd?.affectedRows) return;

    // No existía la fila en Correlativos: crearla con maxExistente
    try {
      await runner.query(
        `INSERT INTO Correlativos (anio, marca, ultimo) VALUES (?, ?, ?)`,
        [anio, marca, maxExistente]
      );
    } catch (e: any) {
      const isDup = e?.code === '23505' || /duplicate|already exists/i.test(e?.message || '');
      if (!isDup) throw e;
      await runner.query(
        `UPDATE Correlativos SET ultimo = GREATEST(ultimo, ?) WHERE anio = ? AND marca = ?`,
        [maxExistente, anio, marca]
      );
    }
  }

  private async generarCorrelativo(marca: Marca, conn?: any, anioFecha?: number): Promise<string> {
    const anio = (anioFecha && anioFecha >= 2000 && anioFecha <= 2100)
      ? anioFecha
      : new Date().getFullYear();
    const sufijo = SUFIJO_MARCA[marca];
    const runner = conn || db;
    const MAX_RETRIES = 5;

    // Sincronizar con MAX existente antes de generar — protege contra el caso
    // de cargas manuales previas que dejaron el contador atrás.
    await this.sincronizarCorrelativo(runner, marca, anio);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // 1. Intentar incrementar si la fila ya existe (caso normal)
      const [updRes]: any = await runner.query(
        `UPDATE Correlativos SET ultimo = ultimo + 1 WHERE anio = ? AND marca = ?`,
        [anio, marca]
      );

      if (updRes && updRes.affectedRows) {
        const [rows] = await runner.query(
          `SELECT ultimo FROM Correlativos WHERE anio = ? AND marca = ?`,
          [anio, marca]
        );
        const secuencia = Number((rows as any)[0].ultimo);
        return `COT ${anio}-${String(secuencia).padStart(3, '0')}-${sufijo}`;
      }

      // 2. La fila no existía. Intentar INSERT inicial.
      try {
        await runner.query(
          `INSERT INTO Correlativos (anio, marca, ultimo) VALUES (?, ?, 1)`,
          [anio, marca]
        );
        return `COT ${anio}-001-${sufijo}`;
      } catch (e: any) {
        const isDup =
          e?.code === '23505' ||
          e?.code === 'ER_DUP_ENTRY' ||
          /duplicate key|already exists|UNIQUE constraint|PRIMARY KEY/i.test(e?.message || '');
        if (!isDup) throw e;
        // Otra tx ganó el INSERT — el próximo loop hará UPDATE exitoso.
      }
    }

    throw new Error(
      `No se pudo generar correlativo para ${marca} ${anio} tras ${MAX_RETRIES} intentos (concurrencia anormal).`
    );
  }

  /**
   * Valida un correlativo manual ingresado por el usuario en modo migración.
   * Lanza Error con mensaje explicativo si alguna validación falla. Si pasa,
   * la creación procede con el número tipeado tal cual (sin tocar la tabla
   * Correlativos — el siguiente automático se sincronizará con MAX en BD).
   */
  private async validarCorrelativoManual(
    runner: any,
    nroManual: string,
    fecha: string,
    marca: Marca,
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

    const sufijo = SUFIJO_MARCA[marca];
    const formatoOK = new RegExp(`^COT \\d{4}-\\d{3}-${sufijo}$`).test(nroManual);
    if (!formatoOK) {
      throw new Error(
        `Formato inválido. Esperado: COT AAAA-NNN-${sufijo}. Ejemplo: COT 2025-001-${sufijo}`
      );
    }

    // Año en correlativo debe coincidir con año en fecha
    const anioCorr = parseInt(nroManual.match(/^COT (\d{4})-/)![1], 10);
    const anioFecha = parseInt(fecha.split('-')[0], 10);
    if (anioCorr !== anioFecha) {
      throw new Error(
        `El año del correlativo (${anioCorr}) no coincide con el año de la fecha (${anioFecha})`
      );
    }

    // Ventana válida: 24 meses hacia atrás + año actual completo
    const today = new Date();
    const min = new Date(today);
    min.setMonth(min.getMonth() - 24);
    const max = new Date(today.getFullYear(), 11, 31);  // 31 dic año actual
    const f = new Date(fecha);
    if (isNaN(f.getTime()) || f < min || f > max) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      throw new Error(
        `Fecha ${fecha} fuera de la ventana de carga histórica permitida. Rango válido: ${fmt(min)} → ${fmt(max)}`
      );
    }

    // No duplicado
    const [dupRows]: any = await runner.query(
      `SELECT id_cotizacion, cliente, fecha FROM Cotizaciones WHERE nro_cotizacion = ? LIMIT 1`,
      [nroManual]
    );
    if ((dupRows as any[]).length > 0) {
      const d = (dupRows as any[])[0];
      throw new Error(
        `El correlativo ${nroManual} ya está en uso (cliente: ${d.cliente}, fecha: ${String(d.fecha).slice(0, 10)}). Verificá el número correcto en tu sistema viejo o dejá el campo vacío para asignación automática.`
      );
    }
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

    // Tendencia mensual últimos 24 meses (extendido de 12 para incluir
    // data histórica cargada — Julio cargando enero/2025 desde mayo/2026).
    const [tendencia] = await db.query(
      `SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes,
              COUNT(*) AS cantidad,
              SUM(CASE WHEN moneda='PEN' THEN total ELSE total * tipo_cambio END) AS monto_pen,
              SUM(CASE WHEN moneda='USD' THEN total ELSE 0 END) AS monto_usd,
              SUM(CASE WHEN estado='APROBADA' THEN 1 ELSE 0 END) AS aprobadas,
              SUM(CASE WHEN estado='APROBADA' AND moneda='PEN' THEN total
                       WHEN estado='APROBADA' AND moneda='USD' THEN total * tipo_cambio
                       ELSE 0 END) AS aprobadas_pen
       FROM Cotizaciones
       WHERE estado != 'ANULADA'
         AND fecha >= DATE_SUB(CURDATE(), INTERVAL 24 MONTH)
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

  /**
   * Lista cotizaciones que pueden actuar como "proyecto/servicio" para
   * vincular OCs SERVICIO. Sirve al picker del form de OC.
   *
   * Filtros opcionales:
   *   - moneda: 'PEN' | 'USD' (auto-coincide con la moneda de la OC)
   *   - anio:   limitar a un año específico
   *   - desde:  cuántos meses hacia atrás (default 12)
   *   - search: substring en cliente o proyecto (case-insensitive)
   *   - todos:  si true, ignora el filtro de fecha (mostrar histórico completo)
   */
  async getProyectosActivos(filtros: {
    moneda?: 'PEN' | 'USD';
    anio?: number;
    search?: string;
    todos?: boolean;
    solo_con_cc?: boolean;
  } = {}) {
    const where: string[] = [`c.estado IN ('APROBADA','TERMINADA','TRABAJO_EN_RIESGO')`];
    const params: any[] = [];

    if (filtros.moneda) {
      where.push(`c.moneda = ?`);
      params.push(filtros.moneda);
    }
    if (filtros.anio) {
      where.push(`YEAR(c.fecha) = ?`);
      params.push(filtros.anio);
    } else if (!filtros.todos) {
      // Default: últimos 12 meses + año actual completo
      where.push(`c.fecha >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`);
    }
    if (filtros.search && filtros.search.trim()) {
      where.push(`(LOWER(c.cliente) LIKE LOWER(?) OR LOWER(COALESCE(c.proyecto,'')) LIKE LOWER(?))`);
      const term = `%${filtros.search.trim()}%`;
      params.push(term, term);
    }
    // Cuando el caller solo necesita proyectos "ya gobernados" por un CC
    // (típicamente: form de OC SERVICIO con Opción B, que pivota sobre el
    // CC y derivar la cotización es lectura), filtramos por la existencia
    // del vínculo en CentrosCosto.
    if (filtros.solo_con_cc) {
      where.push(`cc.id_centro_costo IS NOT NULL`);
    }

    const [rows] = await db.query(
      `SELECT c.id_cotizacion, c.nro_cotizacion, c.marca, c.fecha,
              c.cliente, c.proyecto, c.moneda, c.total, c.estado,
              c.tipo_cambio,
              cc.id_centro_costo,
              cc.nombre AS cc_nombre,
              cc.tipo   AS cc_tipo,
              cc.activo AS cc_activo
         FROM Cotizaciones c
         LEFT JOIN CentrosCosto cc ON cc.id_cotizacion = c.id_cotizacion
        WHERE ${where.join(' AND ')}
        ORDER BY c.fecha DESC, c.id_cotizacion DESC`,
      params
    );
    return rows;
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

  async createCotizacion(data: CotizacionInput, opts: { rol?: string } = {}) {
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

    // Fecha editable (default hoy) — clave para cargar data histórica.
    // Validamos formato YYYY-MM-DD para evitar SQL malformado.
    const fechaInput = (data.fecha || '').trim();
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaInput)
      ? fechaInput
      : new Date().toISOString().split('T')[0];

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // ── Decidir correlativo: manual (si modo migración) o automático
      let nro_cotizacion: string;
      const nroManual = (data.nro_cotizacion || '').trim();
      if (nroManual) {
        await this.validarCorrelativoManual(conn, nroManual, fecha, marca, opts.rol || '');
        nro_cotizacion = nroManual;
        // No actualizo Correlativos.ultimo: la próxima auto-generación
        // sincronizará con MAX en BD vía sincronizarCorrelativo().
      } else {
        // El correlativo respeta el año de la fecha cargada (no el año del sistema).
        // Útil para data histórica: COT 2025-001 si fecha=2025-01-15.
        const anioFecha = parseInt(fecha.split('-')[0], 10);
        nro_cotizacion = await this.generarCorrelativo(marca, conn, anioFecha);
      }
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

      // Hook inverso: al pasar a estado terminal negativo o TRABAJO_EN_RIESGO,
      // cerrar seguimiento financiero (volver a 'NA') para que la cotización
      // deje de aparecer en Finanzas. Solo si NO hay cobranzas registradas —
      // si las hay, hay datos contables y se requiere reverso manual.
      if (['RECHAZADA', 'NO_APROBADA', 'TRABAJO_EN_RIESGO'].includes(estado)) {
        const [cobs]: any = await conn.query(
          `SELECT COUNT(*) AS n FROM CobranzasCotizacion WHERE id_cotizacion = ?`,
          [id]
        );
        if (Number(cobs[0].n) === 0) {
          await conn.query(
            `UPDATE Cotizaciones SET estado_financiero = 'NA' WHERE id_cotizacion = ?`,
            [id]
          );
        }
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

      // Fecha: si viene válida en YYYY-MM-DD se actualiza; sino se preserva la actual.
      const fechaInput = (data.fecha || '').trim();
      const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaInput) ? fechaInput : null;

      // marca NO se modifica en update: el correlativo ya fue asignado.
      await conn.query(
        `UPDATE Cotizaciones SET
           cliente = ?, atencion = ?, telefono = ?, correo = ?, proyecto = ?, ref = ?,
           moneda = ?, tipo_cambio = ?, subtotal = ?, igv = ?, total = ?,
           forma_pago = ?, validez_oferta = ?, plazo_entrega = ?,
           lugar_entrega = ?, lugar_trabajo = ?, comentarios = ?, precios_incluyen = ?,
           fecha = COALESCE(?, fecha)
         WHERE id_cotizacion = ?`,
        [
          cliente, atencion ?? null, telefono ?? null, correo ?? null,
          proyecto ?? null, ref ?? null,
          moneda, tipo_cambio, subtotal, igv, total,
          forma_pago ?? null, validez_oferta ?? null,
          plazo_entrega ?? null, lugar_entrega ?? null, lugar_trabajo ?? null,
          comentarios ?? null, precios_incluyen ?? null,
          fechaValida,
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

  /**
   * Actualiza SOLO la fecha de una cotización. Útil para corregir data
   * histórica mal cargada sin disparar los hooks de cambio de estado
   * (estado_financiero, fecha_aprobacion_comercial, etc.).
   *
   * Disponible en cualquier estado excepto ANULADA. No cambia el correlativo,
   * ni los items, ni el cliente, ni los totales. Solo `fecha`.
   */
  async actualizarFecha(id: number, fecha: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Fecha inválida — debe ser YYYY-MM-DD');
    }
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT estado FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [id]
      );
      const cot = rows[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (cot.estado === 'ANULADA') {
        throw new Error('No se puede editar la fecha de una cotización anulada');
      }
      await conn.query(
        `UPDATE Cotizaciones SET fecha = ? WHERE id_cotizacion = ?`,
        [fecha, id]
      );
      await conn.commit();
      return { ok: true, fecha };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Actualiza SOLO la fecha de aprobación comercial. Útil para corregir
   * data histórica donde el estado se cambió a APROBADA en una fecha
   * distinta a la real (típicamente al cargar cotizaciones viejas).
   * Solo aplica si la cotización está APROBADA o TERMINADA.
   */
  async actualizarFechaAprobacion(id: number, fecha: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Fecha inválida — debe ser YYYY-MM-DD');
    }
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT estado FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [id]
      );
      const cot = rows[0];
      if (!cot) throw new Error('Cotización no encontrada');
      if (!['APROBADA', 'TERMINADA', 'TRABAJO_EN_RIESGO'].includes(cot.estado)) {
        throw new Error('Solo se puede editar la fecha de aprobación de cotizaciones APROBADAS o TERMINADAS');
      }
      await conn.query(
        `UPDATE Cotizaciones SET fecha_aprobacion_comercial = ? WHERE id_cotizacion = ?`,
        [fecha, id]
      );
      await conn.commit();
      return { ok: true, fecha };
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

      // Cerrar seguimiento financiero solo si no hay cobranzas — sino requiere
      // reverso manual (anular cobros antes de anular la cotización).
      const [cobs]: any = await conn.query(
        `SELECT COUNT(*) AS n FROM CobranzasCotizacion WHERE id_cotizacion = ?`,
        [id]
      );
      const reset = Number(cobs[0].n) === 0
        ? `, estado_financiero = 'NA'`
        : '';

      await conn.query(
        `UPDATE Cotizaciones SET estado = 'ANULADA' ${reset} WHERE id_cotizacion = ?`,
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

  /**
   * Editar metadata "segura" de una cotización en cualquier estado salvo
   * ANULADA. Cubre campos que NO afectan números, correlativo, estado ni
   * cobranzas: cliente (display), atencion, contactos, proyecto, condiciones
   * comerciales (forma_pago, plazo, validez, lugar de entrega), referencias
   * externas (nro_oc_cliente, nro_factura) y comentarios libres.
   *
   * Para cambiar montos/items se usa updateCotizacion() en estados editables.
   * Para corregir fecha histórica, actualizarFecha(). Para estado, updateEstado().
   */
  async editarMetadata(id: number, data: {
    cliente?: string;
    atencion?: string;
    telefono?: string;
    correo?: string;
    proyecto?: string;
    forma_pago?: string;
    validez_oferta?: string;
    plazo_entrega?: string;
    lugar_entrega?: string;
    nro_oc_cliente?: string;
    nro_factura?: string;
    comentarios?: string;
  }) {
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
        throw new Error('No se puede editar una cotización ANULADA. Reactivala primero si querés tocarla.');
      }

      const FIELDS: (keyof typeof data)[] = [
        'cliente', 'atencion', 'telefono', 'correo', 'proyecto',
        'forma_pago', 'validez_oferta', 'plazo_entrega', 'lugar_entrega',
        'nro_oc_cliente', 'nro_factura', 'comentarios',
      ];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const f of FIELDS) {
        if (data[f] !== undefined) {
          sets.push(`${f} = ?`);
          vals.push(data[f] === '' ? null : data[f]);
        }
      }
      if (!sets.length) {
        await conn.commit();
        return { id, sin_cambios: true };
      }
      vals.push(id);
      await conn.query(
        `UPDATE Cotizaciones SET ${sets.join(', ')} WHERE id_cotizacion = ?`,
        vals
      );

      await conn.commit();
      return { id };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Elimina FÍSICAMENTE una cotización en CUALQUIER estado, con cascada
   * completa de todos los registros derivados. Solo GERENTE (validado en ruta).
   *
   * Cascada:
   *   1. Cobranzas: DELETE Transacciones COBRANZA + DELETE MovimientoBancario
   *      AUTO de cada cobranza (por ref_tipo='COBRANZA' + ref_id). Después
   *      DELETE CobranzasCotizacion (también haría CASCADE solo, pero lo
   *      hacemos explícito para auditar).
   *   2. CostosServicio que solo tenían id_cotizacion (id_servicio NULL):
   *      DELETE explícito porque el CHECK constraint chk_costoservicio_origen
   *      bloquearía SET NULL automático. Los CostosServicio que tenían
   *      id_servicio se quedan vivos con id_cotizacion=NULL.
   *   3. OrdenesCompra vinculadas (id_cotizacion): el FK ON DELETE SET NULL
   *      las desvincula automáticamente. Las OCs siguen vivas — pueden
   *      tener su propio ciclo (ya recibidas, facturadas).
   *   4. DetalleCotizacion: FK ON DELETE CASCADE.
   *   5. DELETE de Cotizaciones.
   *
   * Drive file: NO se borra (queda huérfano en el Shared Drive). Decisión
   * coherente con resetTodo() — fotos/PDFs en CDN/Drive no se limpian al
   * borrar registros de BD.
   *
   * Libera el correlativo solo si era el último (AUTO_INCREMENT no se
   * resetea acá, queda gap).
   */
  async deleteCotizacion(id: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(
        `SELECT estado, nro_cotizacion FROM Cotizaciones WHERE id_cotizacion = ? FOR UPDATE`,
        [id]
      );
      const cot = (rows as any)[0];
      if (!cot) throw new Error('Cotización no encontrada');

      // 1. Cobranzas: limpiar Tx + MovBancario AUTO antes del CASCADE
      const [cobranzas]: any = await conn.query(
        `SELECT id_cobranza FROM CobranzasCotizacion WHERE id_cotizacion = ?`,
        [id]
      );
      const cobIds = (cobranzas as any[]).map(c => c.id_cobranza);
      if (cobIds.length) {
        const placeholders = cobIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM Transacciones
            WHERE referencia_tipo = 'COBRANZA' AND referencia_id IN (${placeholders})`,
          cobIds
        );
        await conn.query(
          `DELETE FROM MovimientoBancario
            WHERE ref_tipo = 'COBRANZA' AND ref_id IN (${placeholders}) AND fuente = 'AUTO'`,
          cobIds
        );
        await conn.query(
          `DELETE FROM CobranzasCotizacion WHERE id_cotizacion = ?`,
          [id]
        );
      }

      // 2. CostosServicio que dependían SOLO de la cotización: el SET NULL
      //    automático rompería el CHECK constraint, así que borramos a mano.
      await conn.query(
        `DELETE FROM CostosServicio
          WHERE id_cotizacion = ? AND id_servicio IS NULL`,
        [id]
      );

      // 3-5. DELETE Cotización: arrastra DetalleCotizacion (CASCADE), pone
      //      en NULL id_cotizacion en OrdenesCompra y CostosServicio
      //      restantes (SET NULL).
      await conn.query(`DELETE FROM Cotizaciones WHERE id_cotizacion = ?`, [id]);

      await conn.commit();
      return {
        id,
        nro_cotizacion: cot.nro_cotizacion,
        estado_previo: cot.estado,
        cobranzas_eliminadas: cobIds.length,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default new CotizacionService();

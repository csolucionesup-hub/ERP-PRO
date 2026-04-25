import { db } from '../../../database/connection';
import * as https from 'https';
import { todaySQL } from '../../lib/dateUtils';

// Fuente: API pública basada en datos oficiales SBS/SUNAT (Perú)
// Endpoint alternativo si falla: se usa el último tipo de cambio registrado en BD
const SBS_API_URL = 'https://api.apis.net.pe/v1/tipo-cambio-sunat';

interface SBSResponse {
  fecha: string;
  compra: string | number;
  venta: string | number;
  origen?: string;
}

function fetchJSON(url: string): Promise<SBSResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'ERP-PRO/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Respuesta SBS no es JSON válido')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout conectando a SBS')); });
  });
}

class TipoCambioService {

  // Obtiene tipo de cambio de hoy. Si no hay, toma el último disponible.
  async getTipoCambioHoy(moneda: string = 'USD'): Promise<{ fecha: string; valor_compra: number; valor_venta: number; fuente: string; es_hoy: boolean }> {
    const [rows] = await db.query(
      `SELECT fecha, valor_compra, valor_venta, fuente
       FROM TipoCambio WHERE moneda = ?
       ORDER BY fecha DESC LIMIT 1`,
      [moneda.toUpperCase()]
    );
    const today = todaySQL();
    const last = (rows as any[])[0];
    if (!last) {
      // Sin datos en BD, intentar sincronizar
      const sinc = await this.sincronizarDesdeSBS(moneda);
      return { ...sinc, es_hoy: true };
    }
    const fechaStr = String(last.fecha).split('T')[0];
    return {
      fecha: fechaStr,
      valor_compra: Number(last.valor_compra),
      valor_venta: Number(last.valor_venta),
      fuente: last.fuente,
      es_hoy: fechaStr === today
    };
  }

  // Consulta la API SBS y guarda en BD. Retorna el tipo de cambio guardado.
  async sincronizarDesdeSBS(moneda: string = 'USD'): Promise<{ fecha: string; valor_compra: number; valor_venta: number; fuente: string }> {
    let data: SBSResponse;
    try {
      data = await fetchJSON(SBS_API_URL);
    } catch (err) {
      throw new Error(`No se pudo conectar con la API SBS: ${(err as Error).message}`);
    }

    const compra = Number(data.compra);
    const venta = Number(data.venta);
    if (!compra || !venta || isNaN(compra) || isNaN(venta)) {
      throw new Error('Respuesta SBS con valores inválidos: ' + JSON.stringify(data));
    }

    // La fecha de la API puede ser string "DD/MM/YYYY" o "YYYY-MM-DD"
    let fechaISO: string;
    const rawFecha = String(data.fecha || '');
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawFecha)) {
      const [d, m, y] = rawFecha.split('/');
      fechaISO = `${y}-${m}-${d}`;
    } else {
      fechaISO = rawFecha || todaySQL();
    }

    // Upsert: si ya existe para esa fecha/moneda, actualizar (Postgres ON CONFLICT)
    // Constraint name viene del unique key uk_tipocambio_fecha_moneda definido en schema.
    await db.query(
      `INSERT INTO TipoCambio (fecha, moneda, valor_compra, valor_venta, fuente)
       VALUES (?, ?, ?, ?, 'SBS')
       ON CONFLICT (fecha, moneda) DO UPDATE SET
         valor_compra = EXCLUDED.valor_compra,
         valor_venta = EXCLUDED.valor_venta,
         updated_at = NOW()`,
      [fechaISO, moneda.toUpperCase(), compra, venta]
    );

    return { fecha: fechaISO, valor_compra: compra, valor_venta: venta, fuente: 'SBS' };
  }

  // Lista historial de tipos de cambio
  async getTiposCambio(moneda: string = 'USD', limit: number = 30) {
    const [rows] = await db.query(
      `SELECT fecha, moneda, valor_compra, valor_venta, fuente, created_at
       FROM TipoCambio WHERE moneda = ?
       ORDER BY fecha DESC LIMIT ?`,
      [moneda.toUpperCase(), limit]
    );
    return rows;
  }

  // Registro manual (para días sin conexión o correcciones)
  async setTipoCambioManual(fecha: string, moneda: string, valor_compra: number, valor_venta: number) {
    await db.query(
      `INSERT INTO TipoCambio (fecha, moneda, valor_compra, valor_venta, fuente)
       VALUES (?, ?, ?, ?, 'MANUAL')
       ON CONFLICT (fecha, moneda) DO UPDATE SET
         valor_compra = EXCLUDED.valor_compra,
         valor_venta = EXCLUDED.valor_venta,
         fuente = 'MANUAL',
         updated_at = NOW()`,
      [fecha, moneda.toUpperCase(), Number(valor_compra), Number(valor_venta)]
    );
    return { success: true, fecha, moneda: moneda.toUpperCase(), valor_compra, valor_venta };
  }

  // Convierte monto en moneda extranjera a PEN usando tipo de cambio venta
  async convertirAPEN(monto: number, moneda: string, fecha?: string): Promise<{ monto_pen: number; tipo_cambio: number }> {
    if (moneda === 'PEN') return { monto_pen: monto, tipo_cambio: 1 };

    let query = `SELECT valor_venta FROM TipoCambio WHERE moneda = ?`;
    const params: any[] = [moneda.toUpperCase()];
    if (fecha) {
      query += ` AND fecha <= ? ORDER BY fecha DESC LIMIT 1`;
      params.push(fecha);
    } else {
      query += ` ORDER BY fecha DESC LIMIT 1`;
    }

    const [rows] = await db.query(query, params);
    const tc = (rows as any[])[0];
    if (!tc) throw new Error(`Sin tipo de cambio disponible para ${moneda}`);
    const tipo_cambio = Number(tc.valor_venta);
    return { monto_pen: parseFloat((monto * tipo_cambio).toFixed(2)), tipo_cambio };
  }
}

export default new TipoCambioService();

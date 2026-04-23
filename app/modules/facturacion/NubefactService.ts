/**
 * NubefactService — integración con OSE Nubefact para facturación electrónica SUNAT.
 *
 * ⚠ ESTADO: STUB (Fase A). La lógica real se completa en Fase B.
 *
 * Diseño:
 * - Lee credenciales de ConfiguracionEmpresa en cada llamada (no hardcodea).
 * - En modo "stub" (sin credenciales o sin certificado), devuelve estructuras
 *   simuladas con estado SIMULADO, marcadas claramente. No se envía nada real.
 * - Cuando Julio entregue el certificado y setee credenciales Nubefact en
 *   Configuración → el mismo service pasa a modo "real" sin cambios de código
 *   en el resto del ERP.
 *
 * Endpoints Nubefact v1 (para referencia cuando se active):
 *   POST  https://api.nubefact.com/api/v1/<RUC>  (emisión y consulta)
 *   Header: Authorization: Token token="<API_TOKEN>"
 *   Body: JSON con estructura definida en https://nubefact.com/documentation
 */

import ConfiguracionService from '../configuracion/ConfiguracionService';
import { NubefactPayloadBuilder } from './NubefactPayloadBuilder';

export type TipoComprobante =
  | 'FACTURA'        // 01
  | 'BOLETA'         // 03
  | 'NOTA_CREDITO'   // 07
  | 'NOTA_DEBITO'    // 08
  | 'GUIA_REMISION'; // 09

export type EstadoSunat =
  | 'SIMULADO'    // Stub sin conexión real
  | 'PENDIENTE'   // Enviado, esperando CDR
  | 'ACEPTADA'    // CDR afirmativo
  | 'RECHAZADA'   // CDR rechazo
  | 'OBSERVADA'   // CDR con observaciones
  | 'ANULADA'     // Comunicada de baja
  | 'ERROR';      // Error de conexión / timeout

export interface DetalleComprobante {
  codigo?: string;
  descripcion: string;
  unidad: string;           // 'NIU' (unidad), 'ZZ' (servicio), etc.
  cantidad: number;
  precio_unitario: number;  // sin IGV
  total: number;            // con IGV
}

export interface EmitirParams {
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  fecha_emision: string;    // YYYY-MM-DD
  cliente: {
    tipo_documento: '1' | '4' | '6' | '7';  // DNI / CE / RUC / Pasaporte
    numero_documento: string;
    razon_social: string;
    direccion?: string;
    email?: string;
  };
  moneda: 'PEN' | 'USD';
  tipo_cambio?: number;
  subtotal: number;         // base imponible
  igv: number;
  total: number;
  detalles: DetalleComprobante[];
  observaciones?: string;
  forma_pago?: 'CONTADO' | 'CREDITO';
  dias_credito?: number;
}

export interface EmitirResult {
  estado: EstadoSunat;
  aceptada_por_sunat: boolean;
  codigo_sunat?: string;
  descripcion?: string;
  mensaje?: string;
  cadena_para_codigo_qr?: string;
  enlace_del_pdf?: string;
  enlace_del_xml?: string;
  enlace_del_cdr?: string;
  errors?: string[];
  /** Si el stub estuvo activo, este flag es true y ninguna llamada externa ocurrió. */
  simulado: boolean;
}

class NubefactService {
  /**
   * Determina si el service puede operar en modo real.
   * Falla silenciosamente (retorna false) si falta configuración.
   */
  async puedeOperarReal(): Promise<boolean> {
    try {
      const cfg = await ConfiguracionService.getActual();
      return (
        cfg.ose_proveedor === 'NUBEFACT' &&
        !!cfg.ose_endpoint_url &&
        !!cfg.ose_usuario &&
        !!cfg.cert_digital_ruta
      );
    } catch {
      return false;
    }
  }

  /**
   * Emite un comprobante electrónico.
   * - Si el sistema no está configurado: devuelve estado SIMULADO (stub).
   * - Cuando Fase B esté implementada: arma el payload UBL, firma con cert,
   *   envía a Nubefact, recibe CDR y devuelve el resultado.
   */
  async emitir(params: EmitirParams): Promise<EmitirResult> {
    const real = await this.puedeOperarReal();

    if (!real) {
      // STUB — no envía nada real, solo simula una respuesta aceptada.
      const pseudoId = `${params.serie}-${String(params.numero).padStart(6, '0')}`;
      return {
        estado: 'SIMULADO',
        aceptada_por_sunat: false,
        codigo_sunat: '0',
        descripcion: `[STUB] ${params.tipo} ${pseudoId} simulada. Configurar Nubefact + certificado en ⚙️ Configuración para emitir real.`,
        mensaje: 'Modo stub: no se envió a SUNAT',
        cadena_para_codigo_qr: `20610071962|${params.tipo}|${pseudoId}|${params.total}|${params.fecha_emision}`,
        simulado: true,
      };
    }

    // ──────────────────────────────────────────────────────────
    // MODO REAL — Fase B activa
    // ──────────────────────────────────────────────────────────
    const cfg = await ConfiguracionService.getActual();
    const payload = (params.tipo === 'FACTURA' || params.tipo === 'BOLETA')
      ? NubefactPayloadBuilder.buildFactura(
          {
            tipo: params.tipo,
            serie: params.serie,
            numero: params.numero,
            fecha_emision: params.fecha_emision,
            fecha_vencimiento: null,
            cliente_tipo_doc: this.mapClienteTipoDoc(params.cliente.tipo_documento),
            cliente_numero_doc: params.cliente.numero_documento,
            cliente_razon_social: params.cliente.razon_social,
            cliente_direccion: params.cliente.direccion ?? null,
            cliente_email: params.cliente.email ?? null,
            moneda: params.moneda,
            tipo_cambio: params.tipo_cambio ?? 1,
            subtotal: params.subtotal,
            igv: params.igv,
            total: params.total,
            forma_pago: params.forma_pago ?? 'CONTADO',
            dias_credito: params.dias_credito,
            observaciones: params.observaciones,
          },
          params.detalles.map(d => ({
            codigo_item: d.codigo ?? null,
            descripcion: d.descripcion,
            unidad_sunat: d.unidad,
            cantidad: d.cantidad,
            precio_unitario: d.precio_unitario,
            subtotal: Number((d.cantidad * d.precio_unitario).toFixed(2)),
            igv: Number((d.cantidad * d.precio_unitario * 0.18).toFixed(2)),
            total: d.total,
          }))
        )
      : (() => { throw new Error('Tipo ' + params.tipo + ' no soportado por buildFactura'); })();

    // POST a Nubefact con retry exponencial (3 intentos)
    const data = await this.fetchWithRetry(cfg.ose_endpoint_url!, cfg.ose_token_hash!, payload);
    const mapped = NubefactPayloadBuilder.mapResponse(data);

    return {
      estado: mapped.estado,
      aceptada_por_sunat: mapped.estado === 'ACEPTADA',
      codigo_sunat: mapped.codigo_sunat,
      descripcion: mapped.descripcion,
      mensaje: mapped.descripcion,
      cadena_para_codigo_qr: mapped.cadena_qr,
      enlace_del_pdf: mapped.pdf_url,
      enlace_del_xml: mapped.xml_url,
      enlace_del_cdr: mapped.cdr_url,
      errors: mapped.errors,
      simulado: false,
    };
  }

  /** POST con hasta 3 reintentos y backoff exponencial. */
  private async fetchWithRetry(url: string, token: string, payload: any, attempt = 1): Promise<any> {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token token="${token}"`,
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok && resp.status >= 500 && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        return this.fetchWithRetry(url, token, payload, attempt + 1);
      }
      return await resp.json();
    } catch (e) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        return this.fetchWithRetry(url, token, payload, attempt + 1);
      }
      throw e;
    }
  }

  private mapClienteTipoDoc(code: string): 'DNI' | 'CE' | 'RUC' | 'PASAPORTE' {
    const map: Record<string, 'DNI' | 'CE' | 'RUC' | 'PASAPORTE'> = {
      '1': 'DNI', '4': 'CE', '6': 'RUC', '7': 'PASAPORTE',
    };
    return map[code] ?? 'RUC';
  }

  /**
   * Consulta el estado SUNAT de un comprobante previamente emitido.
   */
  async consultarEstado(tipo: TipoComprobante, serie: string, numero: number): Promise<EstadoSunat> {
    const real = await this.puedeOperarReal();
    if (!real) return 'SIMULADO';
    // Fase B: GET a Nubefact con query de comprobante
    throw new Error('consultarEstado: se activa en Fase B.');
  }

  /**
   * Anula un comprobante previamente emitido (nota de crédito + comunicación de baja).
   */
  async anular(tipo: TipoComprobante, serie: string, numero: number, motivo: string): Promise<EmitirResult> {
    const real = await this.puedeOperarReal();
    if (!real) {
      return {
        estado: 'SIMULADO',
        aceptada_por_sunat: false,
        descripcion: `[STUB] Anulación de ${tipo} ${serie}-${numero} simulada: ${motivo}`,
        simulado: true,
      };
    }
    throw new Error('anular: se activa en Fase B.');
  }

  /**
   * Devuelve un resumen para diagnóstico — útil en pantalla de Configuración.
   */
  async diagnostico(): Promise<{
    configurado: boolean;
    modo: 'REAL' | 'STUB';
    proveedor: string;
    endpoint_configurado: boolean;
    certificado_configurado: boolean;
    mensaje: string;
  }> {
    const cfg = await ConfiguracionService.getActual().catch(() => null);
    const real = await this.puedeOperarReal();
    return {
      configurado: real,
      modo: real ? 'REAL' : 'STUB',
      proveedor: cfg?.ose_proveedor ?? 'NONE',
      endpoint_configurado: !!cfg?.ose_endpoint_url,
      certificado_configurado: !!cfg?.cert_digital_ruta,
      mensaje: real
        ? 'Facturación electrónica activa — los comprobantes se envían a SUNAT vía Nubefact.'
        : 'Modo STUB — falta OSE/certificado. Las emisiones son simuladas. Configurar en ⚙️ Configuración → Facturación.',
    };
  }
}

export default new NubefactService();

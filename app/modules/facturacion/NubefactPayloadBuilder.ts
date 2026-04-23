/**
 * NubefactPayloadBuilder
 *
 * Mapea datos internos del ERP → JSON que espera la API Nubefact v1.
 * Referencia: https://www.nubefact.com/documentation/
 *
 * La estructura no es trivial — Nubefact usa códigos numéricos SUNAT
 * (tipo_de_comprobante, tipo_de_igv, etc.) y el payload debe incluir
 * tanto los totales globales como los totales por ítem.
 */

export interface FacturaInput {
  tipo: 'FACTURA' | 'BOLETA';
  serie: string;
  numero: number;
  fecha_emision: string;          // YYYY-MM-DD
  fecha_vencimiento?: string | null;

  cliente_tipo_doc: 'DNI' | 'CE' | 'RUC' | 'PASAPORTE';
  cliente_numero_doc: string;
  cliente_razon_social: string;
  cliente_direccion?: string | null;
  cliente_email?: string | null;

  moneda: 'PEN' | 'USD';
  tipo_cambio: number;
  subtotal: number;
  igv: number;
  total: number;
  descuento_global?: number;

  forma_pago: 'CONTADO' | 'CREDITO';
  dias_credito?: number;
  fecha_vencimiento_credito?: string | null;

  observaciones?: string | null;
}

export interface DetalleInput {
  codigo_item?: string | null;
  descripcion: string;
  unidad_sunat: string;           // 'NIU' unidad, 'ZZ' servicio, 'KGM' kilogramos
  cantidad: number;
  precio_unitario: number;        // sin IGV
  subtotal: number;               // cantidad * precio_unitario
  igv: number;
  total: number;                  // subtotal + igv
}

export interface NotaCreditoInput {
  serie: string;
  numero: number;
  fecha_emision: string;
  tipo_doc_referencia: 'FACTURA' | 'BOLETA';
  serie_referencia: string;
  numero_referencia: number;
  motivo_codigo: string;          // '01' a '10'
  motivo_descripcion: string;

  cliente_tipo_doc: 'DNI' | 'CE' | 'RUC' | 'PASAPORTE';
  cliente_numero_doc: string;
  cliente_razon_social: string;

  moneda: 'PEN' | 'USD';
  tipo_cambio: number;
  subtotal: number;
  igv: number;
  total: number;
}

const TIPO_DOC_SUNAT: Record<string, number> = {
  DNI: 1,
  CE: 4,
  RUC: 6,
  PASAPORTE: 7,
};

const TIPO_COMPROBANTE_SUNAT: Record<string, number> = {
  FACTURA: 1,
  BOLETA: 2,
  NOTA_CREDITO: 3,
  NOTA_DEBITO: 4,
  GUIA_REMISION: 7,
};

const MONEDA_NUBEFACT: Record<string, number> = {
  PEN: 1,
  USD: 2,
};

export class NubefactPayloadBuilder {
  /**
   * Genera el payload para emitir una Factura/Boleta.
   */
  static buildFactura(factura: FacturaInput, detalles: DetalleInput[]): Record<string, any> {
    if (!detalles.length) throw new Error('Factura sin detalles');

    return {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: TIPO_COMPROBANTE_SUNAT[factura.tipo],
      serie: factura.serie,
      numero: factura.numero,
      sunat_transaction: 1, // Venta interna

      cliente_tipo_de_documento: TIPO_DOC_SUNAT[factura.cliente_tipo_doc],
      cliente_numero_de_documento: factura.cliente_numero_doc,
      cliente_denominacion: factura.cliente_razon_social,
      cliente_direccion: factura.cliente_direccion || '-',
      cliente_email: factura.cliente_email || '',

      fecha_de_emision: factura.fecha_emision,
      fecha_de_vencimiento:
        factura.fecha_vencimiento_credito ??
        factura.fecha_vencimiento ??
        undefined,

      moneda: MONEDA_NUBEFACT[factura.moneda],
      tipo_de_cambio: factura.tipo_cambio,
      porcentaje_de_igv: 18.0,

      total_gravada: factura.subtotal,
      total_igv: factura.igv,
      total: factura.total,
      descuento_global: factura.descuento_global ?? 0,

      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: false,
      formato_de_pdf: '',

      condiciones_de_pago: factura.forma_pago === 'CREDITO'
        ? `CRÉDITO A ${factura.dias_credito ?? 30} DÍAS`
        : 'CONTADO',
      medio_de_pago: factura.forma_pago === 'CREDITO' ? 'Credito' : 'Efectivo',

      observaciones: factura.observaciones || '',

      items: detalles.map((d, i) => ({
        unidad_de_medida: d.unidad_sunat,
        codigo: d.codigo_item || `ITEM-${i + 1}`,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        valor_unitario: d.precio_unitario,
        precio_unitario: Number((d.precio_unitario * 1.18).toFixed(4)),
        tipo_de_igv: 1, // Gravado - Operación Onerosa
        total_base_igv: d.subtotal,
        porcentaje_de_igv: 18.0,
        total_igv: d.igv,
        total: d.total,
      })),
    };
  }

  /**
   * Genera el payload para una Nota de Crédito que modifica una factura.
   */
  static buildNotaCredito(nota: NotaCreditoInput, detalles: DetalleInput[]): Record<string, any> {
    return {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: TIPO_COMPROBANTE_SUNAT.NOTA_CREDITO,
      serie: nota.serie,
      numero: nota.numero,
      sunat_transaction: 1,

      cliente_tipo_de_documento: TIPO_DOC_SUNAT[nota.cliente_tipo_doc],
      cliente_numero_de_documento: nota.cliente_numero_doc,
      cliente_denominacion: nota.cliente_razon_social,
      cliente_direccion: '-',

      fecha_de_emision: nota.fecha_emision,
      moneda: MONEDA_NUBEFACT[nota.moneda],
      tipo_de_cambio: nota.tipo_cambio,
      porcentaje_de_igv: 18.0,

      total_gravada: nota.subtotal,
      total_igv: nota.igv,
      total: nota.total,

      documento_que_se_modifica_tipo: TIPO_COMPROBANTE_SUNAT[nota.tipo_doc_referencia],
      documento_que_se_modifica_serie: nota.serie_referencia,
      documento_que_se_modifica_numero: nota.numero_referencia,
      tipo_de_nota_de_credito: parseInt(nota.motivo_codigo, 10),
      motivo_o_descripcion_de_la_nota: nota.motivo_descripcion,

      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: false,

      items: detalles.map((d, i) => ({
        unidad_de_medida: d.unidad_sunat,
        codigo: d.codigo_item || `ITEM-${i + 1}`,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        valor_unitario: d.precio_unitario,
        precio_unitario: Number((d.precio_unitario * 1.18).toFixed(4)),
        tipo_de_igv: 1,
        total_base_igv: d.subtotal,
        porcentaje_de_igv: 18.0,
        total_igv: d.igv,
        total: d.total,
      })),
    };
  }

  /**
   * Mapea la respuesta de Nubefact a nuestro modelo interno de EstadoSunat.
   */
  static mapResponse(data: any): {
    estado: 'ACEPTADA' | 'RECHAZADA' | 'OBSERVADA' | 'ERROR';
    codigo_sunat?: string;
    descripcion?: string;
    xml_url?: string;
    pdf_url?: string;
    cdr_url?: string;
    cadena_qr?: string;
    errors?: string[];
  } {
    if (data.errors) {
      return {
        estado: 'ERROR',
        descripcion: typeof data.errors === 'string' ? data.errors : JSON.stringify(data.errors),
        errors: Array.isArray(data.errors) ? data.errors : [String(data.errors)],
      };
    }
    if (data.aceptada_por_sunat === false) {
      return {
        estado: 'RECHAZADA',
        codigo_sunat: String(data.sunat_ticket_numero || data.codigo_sunat || ''),
        descripcion: data.sunat_description || data.sunat_soap_error || 'Rechazada por SUNAT',
      };
    }
    return {
      estado: 'ACEPTADA',
      codigo_sunat: String(data.sunat_ticket_numero || data.codigo_sunat || ''),
      descripcion: data.sunat_description || 'Aceptada',
      xml_url: data.enlace_del_xml,
      pdf_url: data.enlace_del_pdf,
      cdr_url: data.enlace_del_cdr,
      cadena_qr: data.cadena_para_codigo_qr,
    };
  }
}

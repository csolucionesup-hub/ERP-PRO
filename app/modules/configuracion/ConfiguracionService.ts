import { db } from '../../../database/connection';

export type Regimen = 'NRUS' | 'RER' | 'RMT' | 'GENERAL';
export type OseProveedor = 'NUBEFACT' | 'EFACT' | 'SUNAT' | 'NONE';

export interface ConfiguracionEmpresa {
  id: number;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion_fiscal: string | null;
  telefono: string | null;
  email_facturacion: string | null;
  web: string | null;
  logo_url: string | null;

  regimen: Regimen;
  fecha_cambio_regimen: string | null;

  aplica_igv: number;
  tasa_igv: number;
  es_agente_retencion: number;
  es_agente_percepcion: number;

  tasa_pago_cuenta_renta: number | null;
  cuota_fija_mensual: number | null;

  lleva_libro_diario_completo: number;
  lleva_libro_mayor: number;
  lleva_libro_caja_bancos: number;
  lleva_inventarios_balances: number;

  emite_factura: number;
  emite_boleta: number;
  ose_proveedor: OseProveedor;
  ose_endpoint_url: string | null;
  ose_usuario: string | null;
  serie_factura: string;
  serie_boleta: string;
  serie_nota_credito: string;
  serie_nota_debito: string;
  serie_guia_remision: string;

  uit_vigente: number;
  anio_uit: number;
  moneda_base: 'PEN' | 'USD';
  metodo_costeo: 'PROMEDIO' | 'PEPS' | 'UEPS';
  dias_credito_default: number;
  monto_limite_sin_aprobacion: number;

  modulo_comercial: number;
  modulo_finanzas: number;
  modulo_logistica: number;
  modulo_almacen: number;
  modulo_administracion: number;
  modulo_prestamos: number;
  modulo_produccion: number;
  modulo_calidad: number;
  modulo_contabilidad: number;

  meta_ventas_anual: number | null;
  meta_utilidad_anual: number | null;

  [key: string]: any;
}

/**
 * ConfiguracionService — cache in-memory con TTL de 60s.
 * Toda la app lee la configuración por acá. Al hacer update(), se invalida cache.
 *
 * Regla de oro: las flags derivadas del régimen (libros, IGV, comprobantes)
 * se recalculan al setear 'regimen'. Nunca se deberían setear a mano.
 */
class ConfiguracionService {
  private cache: ConfiguracionEmpresa | null = null;
  private cacheTs = 0;
  private readonly TTL_MS = 60_000;

  invalidateCache(): void {
    this.cache = null;
    this.cacheTs = 0;
  }

  async getActual(): Promise<ConfiguracionEmpresa> {
    if (this.cache && Date.now() - this.cacheTs < this.TTL_MS) return this.cache;
    const [rows] = await db.query('SELECT * FROM ConfiguracionEmpresa LIMIT 1');
    const c = (rows as any)[0];
    if (!c) throw new Error('ConfiguracionEmpresa vacía — ejecutar wizard de setup');
    // Normalizar tipos numéricos (MySQL DECIMAL llega como string a veces)
    c.tasa_igv = Number(c.tasa_igv);
    c.uit_vigente = Number(c.uit_vigente);
    c.monto_limite_sin_aprobacion = Number(c.monto_limite_sin_aprobacion);
    this.cache = c;
    this.cacheTs = Date.now();
    return c;
  }

  /**
   * Actualiza campos sueltos. Si incluye 'regimen', recalcula flags derivados.
   */
  async update(patch: Partial<ConfiguracionEmpresa>): Promise<void> {
    const actual = await this.getActual();
    const merged: Partial<ConfiguracionEmpresa> = { ...patch };

    if (patch.regimen) {
      const r = patch.regimen as Regimen;
      merged.aplica_igv = r === 'NRUS' ? 0 : 1;
      merged.emite_factura = r === 'NRUS' ? 0 : 1;
      merged.emite_boleta = 1; // todos pueden emitir boleta
      merged.lleva_libro_diario_completo = r === 'GENERAL' ? 1 : 0;
      merged.lleva_libro_mayor = r === 'GENERAL' ? 1 : 0;
      merged.lleva_inventarios_balances = (r === 'GENERAL' || r === 'RMT') ? 1 : 0;
      merged.lleva_libro_caja_bancos = r === 'NRUS' ? 0 : 1;
      merged.tasa_pago_cuenta_renta =
        r === 'RER' ? 1.5 :
        r === 'RMT' ? 1.0 :
        r === 'GENERAL' ? 1.5 : 0;
      merged.cuota_fija_mensual = r === 'NRUS' ? 20 : null;
      merged.fecha_cambio_regimen = new Date().toISOString().slice(0, 10);
    }

    const keys = Object.keys(merged).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');
    if (keys.length === 0) return;
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const vals = keys.map(k => (merged as any)[k]);
    await db.query(`UPDATE ConfiguracionEmpresa SET ${sets} WHERE id = ?`, [...vals, actual.id]);
    this.invalidateCache();
  }

  /**
   * Devuelve los libros PLE obligatorios según el régimen y tamaño.
   */
  async librosObligatorios(): Promise<string[]> {
    const c = await this.getActual();
    if (c.regimen === 'NRUS') return [];
    const libros: string[] = ['REGISTRO_VENTAS', 'REGISTRO_COMPRAS'];
    if (c.lleva_libro_diario_completo) libros.push('LIBRO_DIARIO_COMPLETO');
    else if (c.regimen === 'RMT') libros.push('LIBRO_DIARIO_SIMPLIFICADO');
    if (c.lleva_libro_mayor) libros.push('LIBRO_MAYOR');
    if (c.lleva_libro_caja_bancos) libros.push('LIBRO_CAJA_BANCOS');
    if (c.lleva_inventarios_balances) libros.push('LIBRO_INVENTARIOS_BALANCES');
    return libros;
  }

  /**
   * Throws si el régimen no permite emitir factura.
   * Llamar SIEMPRE antes de emitir una factura electrónica.
   */
  /**
   * Valida que el régimen y las flags permitan emitir factura.
   * NO valida la existencia del OSE — eso lo maneja NubefactService,
   * que en modo STUB simula respuesta y en modo REAL envía a SUNAT.
   */
  validarPuedeEmitirFactura(c: ConfiguracionEmpresa): void {
    if (c.regimen === 'NRUS') {
      throw new Error('Tu régimen NRUS no permite emitir facturas. Solo boletas de venta.');
    }
    if (!c.emite_factura) {
      throw new Error('Facturación no habilitada. Configúrala en ⚙️ Configuración → Facturación.');
    }
  }

  /**
   * Primer setup — crea la fila si no existe (usado por wizard).
   */
  async setupInicial(data: Partial<ConfiguracionEmpresa>): Promise<{ id: number }> {
    const [existente] = await db.query('SELECT id FROM ConfiguracionEmpresa LIMIT 1');
    if ((existente as any[])[0]) {
      throw new Error('Ya existe configuración — usa update()');
    }
    if (!data.ruc || !data.razon_social) {
      throw new Error('RUC y razón social son obligatorios');
    }
    const keys = Object.keys(data).filter(k => k !== 'id');
    const placeholders = keys.map(() => '?').join(', ');
    const vals = keys.map(k => (data as any)[k]);
    const [res] = await db.query(
      `INSERT INTO ConfiguracionEmpresa (${keys.join(', ')}) VALUES (${placeholders})`,
      vals
    );
    this.invalidateCache();
    const id = (res as any).insertId;
    // Aplicar flags derivados del régimen recién seteado
    if (data.regimen) await this.update({ regimen: data.regimen });
    return { id };
  }

  async existeConfiguracion(): Promise<boolean> {
    const [rows] = await db.query('SELECT id FROM ConfiguracionEmpresa LIMIT 1');
    return (rows as any[]).length > 0;
  }
}

export default new ConfiguracionService();

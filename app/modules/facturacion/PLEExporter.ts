/**
 * PLEExporter — Generadores de Libros Electrónicos SUNAT (PLE).
 *
 * Formato oficial:
 *   - Archivos TXT planos, encoding UTF-8 sin BOM.
 *   - Separador de campos: pipe '|'.
 *   - Cada línea termina con '|' + salto de línea.
 *   - Sin cabecera. SUNAT rechaza archivos con headers.
 *   - Nombre de archivo sigue convención:
 *       LE<RUC><PERIODO><LIBRO><IND_OPER><IND_CONTENIDO><IND_MONEDA><IND_OPORTUNIDAD>.txt
 *     Ejemplo: LE206100719622026040014010000111.txt
 *       20610071962 = RUC
 *       202604      = periodo AAAAMM (+00 si anual)
 *       140100      = código libro 14.1 (Registro de Ventas)
 *       00          = indicador de operaciones (00=sin, 11=operación)
 *       1           = indicador de contenido (1=con info, 0=sin info)
 *       1           = indicador de moneda (1=Soles)
 *       1           = indicador de oportunidad (1=definitivo)
 *
 * Referencia: Resolución de Superintendencia N° 286-2009/SUNAT y modif.
 */

import { db } from '../../../database/connection';
import ConfiguracionService from '../configuracion/ConfiguracionService';

export type Periodo = { anio: number; mes: number };

export interface PLEArchivo {
  nombreArchivo: string;
  contenido: string;
  cantidadLineas: number;
}

class PLEExporter {
  /**
   * Libro 14.1 — Registro de Ventas e Ingresos.
   * 35 campos por línea según estructura SUNAT.
   */
  async registroVentas(periodo: Periodo): Promise<PLEArchivo> {
    const cfg = await ConfiguracionService.getActual();
    const periodoStr = this.periodoToAAAAMM00(periodo);

    const [rows] = await db.query(
      `SELECT f.*,
              DATE_FORMAT(f.fecha_emision, '%d/%m/%Y') AS fecha_fmt,
              DATE_FORMAT(f.fecha_vencimiento, '%d/%m/%Y') AS fecha_vto_fmt
       FROM Facturas f
       WHERE YEAR(f.fecha_emision) = ? AND MONTH(f.fecha_emision) = ?
         AND f.estado_sunat IN ('ACEPTADA','SIMULADO','OBSERVADA')
       ORDER BY f.fecha_emision, f.tipo, f.serie, f.numero`,
      [periodo.anio, periodo.mes]
    );

    const facturas = rows as any[];
    const lineas: string[] = [];

    for (const f of facturas) {
      // Estructura oficial Campo por Campo (SUNAT PLE 14.1):
      // 1  Periodo (AAAAMM00)
      // 2  CUO - Código Único de Operación (correlativo interno)
      // 3  Correlativo del período
      // 4  Fecha de emisión (DD/MM/YYYY)
      // 5  Fecha de vencimiento (DD/MM/YYYY, opcional)
      // 6  Tipo comprobante SUNAT (01=Factura, 03=Boleta, 07=NC, 08=ND)
      // 7  Serie
      // 8  Número
      // 9  Número final del rango (vacío, aplica solo a resúmenes)
      // 10 Tipo documento del cliente (1=DNI, 6=RUC, etc.)
      // 11 Número documento del cliente
      // 12 Apellidos y Nombres / Razón Social
      // 13 Valor facturado exportación (normalmente 0)
      // 14 Base imponible operación gravada
      // 15 Descuento de la base (vacío o 0)
      // 16 IGV e IPM
      // 17 Descuento de IGV (vacío o 0)
      // 18 Base imponible operación exonerada (0)
      // 19 Base imponible operación inafecta (0)
      // 20 ISC (0)
      // 21 Base imponible arroz pilado IVAP (0)
      // 22 Impuesto arroz pilado IVAP (0)
      // 23 Otros tributos/cargos (0)
      // 24 Importe total
      // 25 Código moneda (PEN, USD)
      // 26 Tipo de cambio
      // 27 Fecha emisión doc original (para NC/ND)
      // 28 Tipo de comprobante original
      // 29 Serie original
      // 30 Número original
      // 31 Proyecto de FISE (vacío)
      // 32 Indicador en caso no hay contacto (1=sí, 0=no)
      // 33 Indicador en caso no domiciliado (1=sí, 0=no)
      // 34 Referencia vínculo con sector público
      // 35 Estado del comprobante (1=válido, 2=anulado, 8=corregido, 9=modificado en periodo)

      const tipoSunat = this.mapTipoComprobanteSunat(f.tipo);
      const tipoDocCli = this.mapTipoDocSunat(f.cliente_tipo_doc);
      const estado = f.estado_sunat === 'ANULADA' ? '2' : '1';
      const cuo = `M${String(f.id_factura).padStart(9, '0')}`;

      const line = [
        periodoStr,                                       // 1
        cuo,                                              // 2
        String(f.id_factura),                             // 3
        f.fecha_fmt || '',                                // 4
        f.fecha_vto_fmt || '',                            // 5
        tipoSunat,                                        // 6
        f.serie,                                          // 7
        String(f.numero),                                 // 8
        '',                                               // 9
        tipoDocCli,                                       // 10
        f.cliente_numero_doc || '-',                      // 11
        (f.cliente_razon_social || '').toUpperCase(),     // 12
        '0.00',                                           // 13
        this.n(f.subtotal),                               // 14
        '',                                               // 15
        this.n(f.igv),                                    // 16
        '',                                               // 17
        '0.00',                                           // 18
        '0.00',                                           // 19
        '0.00',                                           // 20
        '0.00',                                           // 21
        '0.00',                                           // 22
        '0.00',                                           // 23
        this.n(f.total),                                  // 24
        f.moneda || 'PEN',                                // 25
        Number(f.tipo_cambio || 1).toFixed(3),            // 26
        '',                                               // 27
        '',                                               // 28
        '',                                               // 29
        '',                                               // 30
        '',                                               // 31
        '2',                                              // 32 (no aplica contacto)
        '2',                                              // 33 (no aplica no-domiciliado)
        '',                                               // 34
        estado,                                           // 35
      ].join('|') + '|';

      lineas.push(line);
    }

    const contenido = lineas.join('\r\n') + (lineas.length > 0 ? '\r\n' : '');
    const nombre = this.nombreArchivo(cfg.ruc, periodo, '140100', lineas.length > 0);

    return {
      nombreArchivo: nombre,
      contenido,
      cantidadLineas: lineas.length,
    };
  }

  /**
   * Libro 8.1 — Registro de Compras.
   * 42 campos por línea según estructura SUNAT.
   */
  async registroCompras(periodo: Periodo): Promise<PLEArchivo> {
    const cfg = await ConfiguracionService.getActual();
    const periodoStr = this.periodoToAAAAMM00(periodo);

    // Las compras del ERP viven en tabla Compras. La relación con fecha_emision
    // del documento del proveedor está en Compras.fecha.
    const [rows] = await db.query(
      `SELECT c.*,
              DATE_FORMAT(c.fecha, '%d/%m/%Y') AS fecha_fmt,
              p.ruc AS proveedor_ruc,
              p.razon_social AS proveedor_razon
       FROM Compras c
       LEFT JOIN Proveedores p ON p.id_proveedor = c.id_proveedor
       WHERE YEAR(c.fecha) = ? AND MONTH(c.fecha) = ?
         AND c.estado != 'ANULADO'
       ORDER BY c.fecha, c.id_compra`,
      [periodo.anio, periodo.mes]
    );

    const compras = rows as any[];
    const lineas: string[] = [];

    for (const c of compras) {
      // Estructura PLE 8.1 (simplificada — campos mínimos obligatorios):
      // 1  Periodo
      // 2  CUO
      // 3  Correlativo
      // 4  Fecha emisión doc proveedor
      // 5  Fecha de vencimiento (opcional)
      // 6  Tipo doc proveedor (01=Factura, etc.)
      // 7  Serie
      // 8  Año emisión DUA/DSI (vacío)
      // 9  Número doc proveedor
      // 10 Número final rango (vacío)
      // 11 Tipo documento proveedor
      // 12 Número documento proveedor
      // 13 Razón social proveedor
      // 14 Base imponible adquisición gravada destinada a oper. gravadas (dest. G)
      // 15 IGV y/o IPM oper. gravadas dest. G
      // 16 Base imponible dest. conjunto G y NG
      // 17 IGV dest. conjunto
      // 18 Base imponible dest. NG
      // 19 IGV NG
      // 20 Valor adquisiciones NO gravadas
      // 21 ISC
      // 22 IVAP
      // 23 ICBPER (bolsas plásticas)
      // 24 Otros tributos/cargos
      // 25 Importe total
      // 26 Moneda
      // 27 Tipo de cambio
      // 28-31 Detracciones / retenciones (ver docs SUNAT)
      // 32-42 Referencias / estado

      const tipoDocProv = c.proveedor_ruc ? '6' : '1';
      const numeroDocProv = (c.nro_factura_proveedor || '').split('-');
      const serieProv = numeroDocProv[0] || '';
      const nroProv   = numeroDocProv[1] || String(c.id_compra);

      const line = [
        periodoStr,                                           // 1
        `M${String(c.id_compra).padStart(9, '0')}`,           // 2 CUO
        String(c.id_compra),                                  // 3 Correlativo
        c.fecha_fmt || '',                                    // 4 Fecha emisión doc
        '',                                                   // 5 Fecha vencimiento
        '01',                                                 // 6 Tipo doc (01=Factura)
        serieProv,                                            // 7 Serie
        '',                                                   // 8 Año DUA
        nroProv,                                              // 9 Número
        '',                                                   // 10 Número final
        tipoDocProv,                                          // 11 Tipo doc prov
        c.proveedor_ruc || '-',                               // 12 Num doc prov
        (c.proveedor_razon || '-').toUpperCase(),             // 13 Razón social
        this.n(c.monto_base),                                 // 14 Base imp G
        this.n(c.igv_base),                                   // 15 IGV G
        '0.00',                                               // 16 Base conjunto
        '0.00',                                               // 17 IGV conjunto
        '0.00',                                               // 18 Base NG
        '0.00',                                               // 19 IGV NG
        '0.00',                                               // 20 No gravadas
        '0.00',                                               // 21 ISC
        '0.00',                                               // 22 IVAP
        '0.00',                                               // 23 ICBPER
        '0.00',                                               // 24 Otros tributos
        this.n(c.total_base),                                 // 25 Importe total
        c.moneda || 'PEN',                                    // 26 Moneda
        Number(c.tipo_cambio || 1).toFixed(3),                // 27 TC
        '',                                                   // 28 Fecha emisión doc ref
        '',                                                   // 29 Tipo doc ref
        '',                                                   // 30 Serie doc ref
        '',                                                   // 31 Número doc ref
        '',                                                   // 32 Código dependencia aduanera
        '',                                                   // 33 Fecha de emisión constancia depósito detracción
        '',                                                   // 34 Número constancia detracción
        '',                                                   // 35 Marca retención agente
        '',                                                   // 36 Clasificación bienes y servicios
        '',                                                   // 37 Identificación contrato de colaboración
        '',                                                   // 38 Error tipo (1,2,3)
        '',                                                   // 39 Indicador comprobante IPM (campo vacío usado raramente)
        '',                                                   // 40 Referencia al documento origen
        '',                                                   // 41 Tipo operación
        '1',                                                  // 42 Estado (1=válido)
      ].join('|') + '|';

      lineas.push(line);
    }

    const contenido = lineas.join('\r\n') + (lineas.length > 0 ? '\r\n' : '');
    const nombre = this.nombreArchivo(cfg.ruc, periodo, '080100', lineas.length > 0);

    return {
      nombreArchivo: nombre,
      contenido,
      cantidadLineas: lineas.length,
    };
  }

  // ───────── helpers ─────────

  /** Formato nombre PLE oficial. */
  private nombreArchivo(ruc: string, periodo: Periodo, codigoLibro: string, conDatos: boolean): string {
    const periodoStr = `${periodo.anio}${String(periodo.mes).padStart(2, '0')}00`;
    const indOperaciones = conDatos ? '00' : '00';
    const indContenido = conDatos ? '1' : '0';
    const indMoneda = '1'; // siempre soles para el libro (los USD llevan TC)
    const indOportunidad = '1'; // definitivo
    return `LE${ruc}${periodoStr}${codigoLibro}${indOperaciones}${indContenido}${indMoneda}${indOportunidad}.txt`;
  }

  private periodoToAAAAMM00(p: Periodo): string {
    return `${p.anio}${String(p.mes).padStart(2, '0')}00`;
  }

  private mapTipoComprobanteSunat(tipo: string): string {
    return { FACTURA: '01', BOLETA: '03', NOTA_CREDITO: '07', NOTA_DEBITO: '08' }[tipo] ?? '01';
  }

  private mapTipoDocSunat(tipo: string): string {
    return { DNI: '1', CE: '4', RUC: '6', PASAPORTE: '7' }[tipo] ?? '0';
  }

  private n(v: any): string {
    return Number(v || 0).toFixed(2);
  }
}

export default new PLEExporter();

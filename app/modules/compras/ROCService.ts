/**
 * ROCService — genera el Reporte de Órdenes de Compra (ROC) semanal en Excel,
 * replicando el formato real que Metal Engineers usa hoy.
 *
 * Formato destino (analizado de ROC - SEMANA 15 - OFICINA CENTRAL.xlsx):
 *   Filas 1-6:  Metadata (título, versión, fecha, proyecto, ubicación, semana, TC)
 *   Fila 7:     Headers agrupados: SOLES | DOLARES | ESTADO DE LA OC
 *   Fila 8:     Headers de columna (19)
 *   Fila 9:     Totales acumulados en S/ y $
 *   Fila 10+:   Datos agrupados por "SEMANA NN"
 *   Final:      TOTALES | SOLES | monto | DOLARES | monto
 *
 * Uso:
 *   const buffer = await ROCService.generar({
 *     centro_costo: 'OFICINA CENTRAL',
 *     anio: 2026,
 *     semana_corte: 15,
 *     empresa: 'ME',
 *   });
 *   res.send(buffer); // Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 */

import ExcelJS from 'exceljs';
import { db } from '../../../database/connection';

export interface ROCParams {
  centro_costo: string;          // 'OFICINA CENTRAL', 'ALMACEN CENTRAL', 'PERFOTOOLS', etc.
  anio: number;                  // 2026
  semana_corte?: number;         // hasta qué semana ISO. Si no, toma la semana actual.
  empresa?: 'ME' | 'PT';         // filtra por marca
  fecha_reporte?: string;        // opcional ISO yyyy-mm-dd
}

interface OCRow {
  id_oc: number;
  nro_oc: string;
  fecha_emision: Date | string;
  tipo_oc: 'GENERAL' | 'SERVICIO' | 'ALMACEN';
  proveedor_nombre: string;
  descripcion_resumen: string;
  moneda: 'PEN' | 'USD';
  subtotal: number;
  igv: number;
  total: number;
  aplica_igv: number;
  estado: string;
  centro_costo: string;
  empresa: 'ME' | 'PT';
  // Campos de pago (para columnas APROBADA/PAGADA/Fechas/Factura/Banco)
  aprobada_marca: string;
  pagada_marca: string;
  fecha_estimada_pago: string;
  fecha_real_pago: string;
  estado_rendicion: string;
  nro_factura: string;
  banco: string;
}

class ROCService {
  /**
   * ISO-week (ISO-8601): la semana 01 es la que contiene el primer jueves del año.
   * Retorna [1..53].
   */
  private semanaISO(fecha: Date): number {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    // Día de la semana (lunes=1..domingo=7)
    const diaSem = d.getUTCDay() || 7;
    // Trasladamos al jueves más cercano (el ISO usa el jueves como referencia)
    d.setUTCDate(d.getUTCDate() + 4 - diaSem);
    const anioIni = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - anioIni.getTime()) / 86400000) + 1) / 7);
  }

  /** Construye descripción resumen tomando las primeras 3 líneas del detalle. */
  private async resumenDescripcion(id_oc: number): Promise<string> {
    const [rows]: any = await db.query(
      `SELECT descripcion FROM DetalleOrdenCompra WHERE id_oc = ? ORDER BY orden LIMIT 3`,
      [id_oc]
    );
    if (!rows.length) return '';
    return rows.map((r: any) => r.descripcion).join(' // ').toUpperCase();
  }

  /**
   * Obtiene las OC del año filtradas por centro_costo y empresa, hasta la semana corte.
   */
  private async getOCs(params: ROCParams): Promise<OCRow[]> {
    const { centro_costo, anio, empresa } = params;
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;

    const vals: any[] = [desde, hasta, centro_costo];
    let extraWhere = '';
    if (empresa) {
      extraWhere += ' AND oc.empresa = ?';
      vals.push(empresa);
    }

    const [rows]: any = await db.query(
      `SELECT
         oc.id_oc, oc.nro_oc, oc.fecha_emision, oc.tipo_oc,
         oc.moneda, oc.subtotal, oc.igv, oc.total, oc.aplica_igv,
         oc.estado, oc.centro_costo, oc.empresa,
         COALESCE(p.razon_social, '') AS proveedor_nombre,
         COALESCE(oc.observaciones, '') AS observaciones,
         COALESCE(c.nro_comprobante, '') AS nro_factura,
         COALESCE(c.estado, '') AS estado_compra,
         c.fecha AS fecha_factura
       FROM OrdenesCompra oc
       LEFT JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
       LEFT JOIN Compras c ON c.id_compra = oc.id_compra_generada
       WHERE oc.fecha_emision BETWEEN ? AND ?
         AND oc.centro_costo = ?
         ${extraWhere}
       ORDER BY oc.fecha_emision, oc.id_oc`,
      vals
    );

    const out: OCRow[] = [];
    for (const r of rows) {
      const resumen = (await this.resumenDescripcion(r.id_oc)) || r.observaciones || '';
      const estado = String(r.estado);
      const aprobada = ['APROBADA','ENVIADA','RECIBIDA','RECIBIDA_PARCIAL','FACTURADA','PAGADA'].includes(estado) ? 'X' : '';
      const pagada   = estado === 'PAGADA' ? 'X' : '';

      out.push({
        id_oc: r.id_oc,
        nro_oc: r.nro_oc,
        fecha_emision: r.fecha_emision,
        tipo_oc: r.tipo_oc,
        proveedor_nombre: r.proveedor_nombre || '',
        descripcion_resumen: resumen.length > 120 ? resumen.slice(0, 117) + '…' : resumen,
        moneda: r.moneda,
        subtotal: Number(r.subtotal) || 0,
        igv: Number(r.igv) || 0,
        total: Number(r.total) || 0,
        aplica_igv: Number(r.aplica_igv) || 0,
        estado: estado,
        centro_costo: r.centro_costo,
        empresa: r.empresa,
        aprobada_marca: aprobada,
        pagada_marca: pagada,
        fecha_estimada_pago: '',                   // usaremos fecha_factura si existe
        fecha_real_pago: r.fecha_factura ? this.fmtFechaCorta(r.fecha_factura) : '',
        estado_rendicion: estado === 'PAGADA' ? 'RENDIDO' : (estado === 'ANULADA' ? 'ANULADA' : 'PENDIENTE'),
        nro_factura: r.nro_factura || '',
        banco: 'INTERBANK',
      });
    }
    return out;
  }

  private fmtFechaCorta(f: Date | string): string {
    const d = f instanceof Date ? f : new Date(f);
    if (isNaN(d.getTime())) return '';
    const dd = d.getDate();
    const mm = d.getMonth() + 1;
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`; // Mantiene formato observado en archivo original (M/D/YY)
  }

  private fmtFechaLarga(f: Date | string): string {
    const meses = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = f instanceof Date ? f : new Date(f);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate()}-${meses[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
  }

  /**
   * Genera el archivo Excel como Buffer. Listo para enviar como descarga.
   */
  async generar(params: ROCParams): Promise<Buffer> {
    const { centro_costo, anio, empresa } = params;
    const semanaCorte = params.semana_corte || this.semanaISO(new Date());
    const fechaReporte = params.fecha_reporte ? new Date(params.fecha_reporte) : new Date();

    // Config empresa (para título, RUC, etc.)
    const [cfgRows]: any = await db.query(
      `SELECT razon_social, ruc, direccion_fiscal FROM ConfiguracionEmpresa WHERE id = 1`
    );
    const cfg = cfgRows[0] || { razon_social: 'METAL ENGINEERS SAC', ruc: '20610071962', direccion_fiscal: '' };

    // TC vigente (opcional)
    let tipoCambio = 0;
    try {
      const [tcRows]: any = await db.query(
        `SELECT valor_venta FROM TipoCambio WHERE moneda='USD' ORDER BY fecha DESC LIMIT 1`
      );
      if (tcRows[0]) tipoCambio = Number(tcRows[0].valor_venta) || 0;
    } catch { /* tabla puede no existir en algunos setups */ }

    const ocs = await this.getOCs(params);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ERP-PRO';
    wb.created = new Date();

    const ws = wb.addWorksheet('ROC', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    // Anchos de columna (A..S = 19)
    const widths = [7, 12, 11, 36, 50, 9, 13, 12, 13, 13, 12, 13, 10, 9, 16, 16, 12, 20, 12];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // ====== HEADER (filas 1-7) ======
    // Fila 1: Título + Versión
    ws.mergeCells('A1:N1'); ws.mergeCells('O1:P1'); ws.mergeCells('Q1:S1');
    const t1 = ws.getCell('A1');
    t1.value = 'REPORTE  DE ORDENES Y SERVICIOS';
    t1.alignment = { vertical: 'middle', horizontal: 'center' };
    t1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    ws.getCell('O1').value = 'Versión';
    ws.getCell('O1').alignment = { horizontal: 'center' };
    ws.getCell('O1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } };
    ws.getCell('O1').font = { bold: true };
    ws.getCell('Q1').value = 'Rev_0';
    ws.getCell('Q1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Fila 2: Fecha
    ws.mergeCells('A2:N2'); ws.mergeCells('O2:P2'); ws.mergeCells('Q2:S2');
    ws.getCell('O2').value = 'Fecha';
    ws.getCell('O2').alignment = { horizontal: 'center' };
    ws.getCell('O2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } };
    ws.getCell('O2').font = { bold: true };
    ws.getCell('Q2').value = this.fmtFechaLarga(fechaReporte);
    ws.getCell('Q2').alignment = { horizontal: 'center' };

    // Fila 3: PROYECTO / RESPONSABLE
    ws.getCell('A3').value = 'PROYECTO:'; ws.getCell('A3').font = { bold: true };
    ws.mergeCells('B3:H3'); ws.getCell('B3').value = centro_costo;
    ws.getCell('B3').alignment = { horizontal: 'left' };
    ws.getCell('I3').value = 'IRO/ RESPONSABLE:'; ws.getCell('I3').font = { bold: true };
    ws.mergeCells('J3:S3');

    // Fila 4: UBICACIÓN / ADM. DE OBRA
    ws.getCell('A4').value = 'UBICACIÓN:'; ws.getCell('A4').font = { bold: true };
    ws.mergeCells('B4:H4'); ws.getCell('B4').value = 'PUENTE PIEDRA - LIMA';
    ws.getCell('I4').value = 'ADM. DE OBRA:'; ws.getCell('I4').font = { bold: true };
    ws.mergeCells('J4:S4');

    // Fila 5: SEMANA / FECHA DE REPORTE
    ws.getCell('A5').value = `SEMANA: ${String(semanaCorte).padStart(2,'0')}`;
    ws.getCell('A5').font = { bold: true };
    ws.getCell('I5').value = 'FECHA DE REPORTE:'; ws.getCell('I5').font = { bold: true };
    ws.mergeCells('J5:S5'); ws.getCell('J5').value = this.fmtFechaLarga(fechaReporte);

    // Fila 6: TC
    ws.getCell('A6').value = 'TC:'; ws.getCell('A6').font = { bold: true };
    ws.getCell('B6').value = tipoCambio > 0 ? tipoCambio : '';
    ws.getCell('B6').numFmt = '0.0000';

    // Fila 7: Sub-headers agrupados
    ws.mergeCells('G7:I7');
    ws.getCell('G7').value = 'SOLES';
    ws.mergeCells('J7:L7');
    ws.getCell('J7').value = 'DOLARES';
    ws.mergeCells('M7:S7');
    ws.getCell('M7').value = 'ESTADO DE LA OC A LA FECHA DE REPORTE';
    ['G7','J7','M7'].forEach(c => {
      ws.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF305496' } };
    });

    // Fila 8: Headers de columna
    const headers = [
      'OC/OS', 'Nº', 'FECHA', 'PROVEEDOR', 'DESCRIPCIÓN GENERAL', 'MONEDA',
      'SUB TOTAL', 'IGV/ IVA', 'TOTAL',
      'SUB TOTAL', 'IGV/ IVA', 'TOTAL',
      'APROBADA*', 'PAGADA*', 'FECHA ESTIMADA DE PAGO', 'FECHA REAL DE PAGO',
      'ESTADO', 'FACT. Nº', 'BANCO',
    ];
    headers.forEach((h, i) => {
      const cell = ws.getCell(8, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
    ws.getRow(8).height = 36;

    // Fila 9: Totales acumulados (fórmula; se llenan más abajo con SUMA dinámica)
    // Lo dejamos vacío en primera pasada; el placeholder se actualiza luego con fórmula.
    const fila9 = ws.getRow(9);
    fila9.getCell(7).value = { formula: 'SUM(G11:G1000)' };
    fila9.getCell(7).numFmt = '"S/ "#,##0.00';
    fila9.getCell(10).value = { formula: 'SUM(J11:J1000)' };
    fila9.getCell(10).numFmt = '"$"#,##0.00';
    fila9.getCell(7).font = { bold: true };
    fila9.getCell(10).font = { bold: true };
    fila9.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
    fila9.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };

    // ====== DATOS: agrupados por semana desde 1 hasta semanaCorte ======
    let fila = 10;
    const ocPorSemana: Map<number, OCRow[]> = new Map();
    for (const oc of ocs) {
      const d = oc.fecha_emision instanceof Date ? oc.fecha_emision : new Date(oc.fecha_emision);
      const s = this.semanaISO(d);
      if (!ocPorSemana.has(s)) ocPorSemana.set(s, []);
      ocPorSemana.get(s)!.push(oc);
    }

    for (let sem = 1; sem <= semanaCorte; sem++) {
      // Subencabezado SEMANA NN
      ws.mergeCells(fila, 1, fila, 19);
      const h = ws.getCell(fila, 1);
      h.value = `SEMANA ${String(sem).padStart(2, '0')}`;
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF808080' } };
      h.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(fila).height = 20;
      fila++;

      const lista = ocPorSemana.get(sem) || [];
      for (const oc of lista) {
        const r = ws.getRow(fila);
        const esSoles = oc.moneda === 'PEN';
        const esOS = oc.tipo_oc === 'SERVICIO';

        r.getCell(1).value = esOS ? 'OS' : 'OC';
        r.getCell(2).value = oc.nro_oc;
        r.getCell(3).value = this.fmtFechaLarga(oc.fecha_emision);
        r.getCell(4).value = oc.proveedor_nombre;
        r.getCell(5).value = oc.descripcion_resumen;
        r.getCell(6).value = esSoles ? 'MN' : 'ME';

        if (esSoles) {
          r.getCell(7).value = oc.subtotal - (oc.aplica_igv ? 0 : 0); // subtotal puro
          r.getCell(7).numFmt = '"S/ "#,##0.00';
          if (oc.aplica_igv && oc.igv > 0) {
            r.getCell(8).value = oc.igv;
            r.getCell(8).numFmt = '"S/ "#,##0.00';
          }
          r.getCell(9).value = oc.total;
          r.getCell(9).numFmt = '#,##0.00';
        } else {
          r.getCell(10).value = oc.subtotal;
          r.getCell(10).numFmt = '"$"#,##0.00';
          if (oc.aplica_igv && oc.igv > 0) {
            r.getCell(11).value = oc.igv;
            r.getCell(11).numFmt = '"$"#,##0.00';
          }
          r.getCell(12).value = oc.total;
          r.getCell(12).numFmt = '#,##0.00';
        }

        r.getCell(13).value = oc.aprobada_marca;
        r.getCell(14).value = oc.pagada_marca;
        r.getCell(15).value = oc.fecha_estimada_pago;
        r.getCell(16).value = oc.fecha_real_pago;
        r.getCell(17).value = oc.estado_rendicion;
        r.getCell(18).value = oc.nro_factura;
        r.getCell(19).value = oc.banco;

        // Centrar columnas X/X/fechas/estado
        [6,13,14,15,16,17].forEach(c => {
          r.getCell(c).alignment = { horizontal: 'center' };
        });
        r.getCell(5).alignment = { wrapText: true, vertical: 'middle' };

        // Bordes suaves
        for (let c = 1; c <= 19; c++) {
          r.getCell(c).border = {
            top: { style: 'hair', color: { argb: 'FFBFBFBF' } },
            bottom: { style: 'hair', color: { argb: 'FFBFBFBF' } },
            left: { style: 'hair', color: { argb: 'FFBFBFBF' } },
            right: { style: 'hair', color: { argb: 'FFBFBFBF' } },
          };
        }

        // Color semáforo por estado
        if (oc.estado === 'ANULADA') {
          for (let c = 1; c <= 19; c++) {
            r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
            r.getCell(c).font = { color: { argb: 'FF9C0006' }, italic: true };
          }
        } else if (oc.estado === 'PAGADA') {
          for (let c = 1; c <= 19; c++) {
            r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
          }
        } else if (oc.estado === 'BORRADOR') {
          for (let c = 1; c <= 19; c++) {
            r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
          }
        }

        fila++;
      }
    }

    // ====== TOTALES FINALES ======
    ws.mergeCells(fila, 1, fila, 6);
    const tot = ws.getCell(fila, 1);
    tot.value = 'TOTALES';
    tot.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    tot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    tot.alignment = { horizontal: 'right', vertical: 'middle' };

    ws.getCell(fila, 7).value = 'SOLES'; ws.getCell(fila, 7).font = { bold: true };
    ws.getCell(fila, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
    ws.getCell(fila, 8).value = { formula: `SUM(I11:I${fila - 1})` };
    ws.getCell(fila, 8).numFmt = '"S/ "#,##0.00';
    ws.getCell(fila, 8).font = { bold: true };
    ws.getCell(fila, 8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };

    ws.getCell(fila, 10).value = 'DOLARES'; ws.getCell(fila, 10).font = { bold: true };
    ws.getCell(fila, 10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
    ws.getCell(fila, 11).value = { formula: `SUM(L11:L${fila - 1})` };
    ws.getCell(fila, 11).numFmt = '"$"#,##0.00';
    ws.getCell(fila, 11).font = { bold: true };
    ws.getCell(fila, 11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };

    // Corregir la fila 9 con la fórmula real usando el rango final
    ws.getCell(9, 7).value = { formula: `SUM(I11:I${fila - 1})` };
    ws.getCell(9, 10).value = { formula: `SUM(L11:L${fila - 1})` };

    ws.getRow(fila).height = 24;

    // Congelar encabezados
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }];

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

export default new ROCService();

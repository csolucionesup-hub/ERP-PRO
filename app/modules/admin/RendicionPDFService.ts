/**
 * RendicionPDFService — genera el PDF de la Hoja de Rendición de Gastos.
 *
 * Replica el formato físico que Metal Engineers ya usa (ver PDF de referencia
 * en `RENDICION OC N° 013 - 2026...`):
 *   - Cabecera con logo + datos generales (centro de costo, banco, importe).
 *   - Sub-cabecera: proyecto, cuenta a cargo de, cargo, fecha rendición.
 *   - Tabla de items con columnas: ITEM, FECHA, Nº DOCUMENTO, BENEFICIARIOS,
 *     CONCEPTO, SUBTOTAL, IGV, IMPORTE S/, OBSERVACIONES.
 *   - Resumen al pie: Saldo Anterior, Fondo Asignado, Total Gastos, Saldo.
 *   - 3 firmas: PREPARADO POR / REVISADO POR / AUTORIZADO POR (en Fase 2 se
 *     embeberán las firmas escaneadas; por ahora solo el nombre + fecha).
 *
 * NO incluye los anexos (constancia bancaria, OC, comprobantes). Eso queda
 * para la Fase 3 cuando se haga el merge de PDFs con pdf-lib.
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import RendicionService from './RendicionService';

class RendicionPDFService {

  async generar(id_rendicion: number): Promise<Buffer> {
    const r = await RendicionService.obtener(id_rendicion);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape', // el formato actual del cliente es horizontal
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fmt = (n: any) => Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtDate = (d: any) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
      const monedaSym = r.moneda === 'USD' ? '$' : 'S/';

      // ── Logo + título ──
      try {
        const logoPath = path.join(process.cwd(), 'public', 'img', 'logo-metal.png');
        doc.image(logoPath, 30, 25, { width: 110 });
      } catch { /* no romper si no hay logo */ }

      doc.font('Helvetica-Bold').fontSize(16)
        .text('RENDICION DE GASTOS - METAL ENGINEERS SAC', 150, 38, { align: 'center', width: 600 });

      // ── Cabecera dos columnas ──
      const yCab = 85;
      const labelCol = 32;
      const valueCol1 = 130;
      const labelCol2 = 430;
      const valueCol2 = 540;

      doc.font('Helvetica-Bold').fontSize(8.5);
      const lblLeft = [
        ['CENTRO DE COSTOS:', r.centro_costo || '—'],
        ['BANCO:',             r.banco || '—'],
        ['NRO OPERACIÓN:',     r.nro_operacion || '—'],
        ['REFERENCIA:',        `OC N° ${r.nro_oc_referencia} — ${r.proveedor_nombre || ''}`],
        ['FECHA DE OPERACIÓN:', fmtDate(r.fecha_operacion)],
        ['IMPORTE:',           fmt(r.importe_recibido)],
        ['MONEDA:',            r.moneda === 'USD' ? 'USD' : 'MN'],
      ];
      const lblRight = [
        ['PROYECTO:',          r.proyecto || r.centro_costo || '—'],
        ['CUENTA A CARGO DE:', (r.cuenta_a_cargo_de_nombre || '—').toUpperCase()],
        ['CARGO:',             (r.cargo || '—').toUpperCase()],
        ['FECHA DE RENDICIÓN:', fmtDate(r.fecha_rendicion)],
      ];

      let y = yCab;
      lblLeft.forEach(([label, val]) => {
        doc.font('Helvetica-Bold').fontSize(8.5).text(label, labelCol, y);
        doc.font('Helvetica').fontSize(9).text(String(val), valueCol1, y, { width: 280 });
        y += 14;
      });

      let yR = yCab;
      lblRight.forEach(([label, val]) => {
        doc.font('Helvetica-Bold').fontSize(8.5).text(label, labelCol2, yR);
        doc.font('Helvetica').fontSize(9).text(String(val), valueCol2, yR, { width: 240 });
        yR += 14;
      });

      // ── Tabla de items ──
      const yTabla = Math.max(y, yR) + 18;
      const cols = [
        { w: 32,  label: 'ITEM',         align: 'center' as const },
        { w: 60,  label: 'FECHA',        align: 'center' as const },
        { w: 90,  label: 'Nº DOCUMENTO', align: 'left'   as const },
        { w: 150, label: 'BENEFICIARIOS', align: 'left'  as const },
        { w: 110, label: 'CONCEPTO',     align: 'left'   as const },
        { w: 65,  label: 'SUBTOTAL',     align: 'right'  as const },
        { w: 50,  label: 'IGV',          align: 'right'  as const },
        { w: 70,  label: 'IMPORTE S/',   align: 'right'  as const },
        { w: 165, label: 'OBSERVACIONES', align: 'left'  as const },
      ];
      const tablaX = 32;

      // Header
      doc.rect(tablaX, yTabla, cols.reduce((s, c) => s + c.w, 0), 18).fill('#f3f4f6').stroke();
      let cx = tablaX;
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8);
      cols.forEach(c => {
        doc.text(c.label, cx + 2, yTabla + 5, { width: c.w - 4, align: c.align });
        cx += c.w;
      });

      // Filas
      let yRow = yTabla + 18;
      const items = (r.items || []) as any[];
      items.forEach((it, i) => {
        cx = tablaX;
        doc.font('Helvetica').fontSize(8.5);
        const cells = [
          String(i + 1),
          fmtDate(it.fecha),
          it.nro_documento || '',
          it.beneficiario || '',
          it.concepto || '',
          fmt(it.subtotal),
          fmt(it.igv),
          fmt(it.importe_total),
          it.observaciones || '',
        ];
        // Dibujar bordes
        doc.rect(tablaX, yRow, cols.reduce((s, c) => s + c.w, 0), 18).stroke('#d1d5db');
        cells.forEach((val, idx) => {
          const c = cols[idx];
          doc.text(String(val), cx + 2, yRow + 5, { width: c.w - 4, align: c.align });
          cx += c.w;
        });
        yRow += 18;
      });

      if (items.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#6b7280')
          .text('— Sin gastos cargados —', tablaX, yRow + 6, { width: cols.reduce((s, c) => s + c.w, 0), align: 'center' });
        yRow += 24;
      }

      // ── Resumen ──
      const yResumen = yRow + 14;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000').text('RESUMEN', tablaX, yResumen);
      const lblsR = [
        ['Saldo Anterior:',  fmt(r.saldo_anterior)],
        ['Fondo Asignado:',  fmt(r.fondo_asignado)],
        [`Total Gastos ${monedaSym}:`, fmt(r.total_gastos)],
        ['Saldo disponible:', fmt(r.saldo_disponible)],
      ];
      let yRes = yResumen + 16;
      lblsR.forEach(([lbl, v]) => {
        doc.font('Helvetica-Bold').fontSize(8.5).text(lbl, tablaX, yRes);
        doc.font('Helvetica').fontSize(9).text(v, tablaX + 100, yRes, { width: 80, align: 'right' });
        yRes += 14;
      });

      // ── Firmas ──
      const yFirmas = Math.max(yRes + 24, 460);
      const firmaW = 220;
      const gap = 30;
      const totalFirmasW = (firmaW * 3) + (gap * 2);
      const xFirmas = (doc.page.width - totalFirmasW) / 2;

      const dibujarFirma = (x: number, label: string, nombre: string | null, fecha: string | null) => {
        // Línea para firma
        doc.moveTo(x, yFirmas + 30).lineTo(x + firmaW, yFirmas + 30).stroke('#000');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
          .text(label.toUpperCase(), x, yFirmas + 36, { width: firmaW, align: 'center' });
        if (nombre) {
          doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
            .text(nombre, x, yFirmas + 50, { width: firmaW, align: 'center' });
          if (fecha) {
            doc.font('Helvetica-Oblique').fontSize(7).fillColor('#6b7280')
              .text(`firmado: ${fmtDate(fecha)}`, x, yFirmas + 64, { width: firmaW, align: 'center' });
          }
        } else {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor('#9ca3af')
            .text('Sin firmar', x, yFirmas + 50, { width: firmaW, align: 'center' });
        }
      };

      dibujarFirma(xFirmas,                      'Preparado por', r.preparado_por_nombre,  r.preparado_at);
      dibujarFirma(xFirmas + firmaW + gap,        'Revisado por',  r.revisado_por_nombre,   r.revisado_at);
      dibujarFirma(xFirmas + (firmaW + gap) * 2,  'Autorizado por', r.autorizado_por_nombre, r.autorizado_at);

      // ── Nota al pie ──
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#6b7280')
        .text('NOTA: Adjuntar Facturas y/o boletas. De no existir factura o boleta, se deberá adjuntar el COMPROBANTE DE GASTOS con el detalle correspondiente.',
          32, doc.page.height - 50, { width: doc.page.width - 64 });

      doc.end();
    });
  }
}

export default new RendicionPDFService();

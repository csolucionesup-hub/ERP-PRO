/**
 * RendicionPDFService — genera el expediente PDF de la Rendición de Gastos.
 *
 * El expediente es un único PDF que concatena:
 *   1. Hoja de rendición (cabecera + items + resumen + 3 firmas) — pdfkit.
 *   2. Anexos: cada adjunto cargado en Cloudinary (constancia bancaria,
 *      facturas, boletas, OC, comprobantes) embebido como páginas. PDFs se
 *      copian tal cual; imágenes (JPG/PNG/HEIC/WEBP) se renderizan como
 *      página A4. HEIC/WEBP se piden a Cloudinary con `f_jpg` para que
 *      pdf-lib los procese sin trasformación local.
 *
 * Si un adjunto falla al descargarse o procesarse, se loguea y se sigue con
 * el resto — el expediente nunca rompe la respuesta HTTP.
 */

import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import path from 'path';
import RendicionService from './RendicionService';

class RendicionPDFService {

  /**
   * Devuelve el expediente completo: hoja + adjuntos mergeados.
   */
  async generar(id_rendicion: number): Promise<Buffer> {
    const hojaBuf = await this.generarHoja(id_rendicion);
    const r: any = await RendicionService.obtener(id_rendicion);
    const adjuntos: any[] = r.adjuntos || [];
    if (adjuntos.length === 0) return hojaBuf;

    const masterDoc = await PDFLibDocument.load(hojaBuf);

    for (const adj of adjuntos) {
      try {
        await this.embeberAdjunto(masterDoc, adj);
      } catch (err: any) {
        console.error(`[RendicionPDF] Error mergeando adjunto id=${adj.id_adjunto} (${adj.nombre_archivo}):`, err?.message || err);
        // No propagar — seguir con los demás
      }
    }

    const finalBytes = await masterDoc.save();
    return Buffer.from(finalBytes);
  }

  /**
   * Descarga un adjunto desde Cloudinary y lo agrega al PDF maestro.
   */
  private async embeberAdjunto(masterDoc: any, adj: any): Promise<void> {
    const url: string = adj.url;
    const nombre: string = adj.nombre_archivo || '';
    const lower = (nombre || url).toLowerCase();

    const isPdf = lower.endsWith('.pdf')
      || /\.pdf(\?|$)/.test(url)
      || (adj.mime_type || '').toLowerCase() === 'application/pdf';

    // Cloudinary: forzar JPG cuando el formato no es nativamente soportado por pdf-lib.
    const necesitaConversion = /\.(heic|heif|webp|tif|tiff|bmp|gif)$/i.test(lower);
    let downloadUrl = url;
    if (!isPdf && necesitaConversion && url.includes('/upload/')) {
      downloadUrl = url.replace('/upload/', '/upload/f_jpg/');
    }

    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${downloadUrl}`);
    const buf = Buffer.from(await res.arrayBuffer());

    if (isPdf) {
      const srcDoc = await PDFLibDocument.load(buf, { ignoreEncryption: true });
      const pages = await masterDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      pages.forEach((p: any) => masterDoc.addPage(p));
      return;
    }

    // Imagen → página A4 portrait con la imagen escalada y centrada.
    let img: any;
    if (lower.endsWith('.png')) {
      img = await masterDoc.embedPng(buf);
    } else {
      // jpg, jpeg, heic→jpg, webp→jpg, etc.
      img = await masterDoc.embedJpg(buf);
    }
    const A4_W = 595.28, A4_H = 841.89;
    const margin = 36;
    const maxW = A4_W - 2 * margin;
    const maxH = A4_H - 2 * margin;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = masterDoc.addPage([A4_W, A4_H]);
    page.drawImage(img, {
      x: (A4_W - w) / 2,
      y: (A4_H - h) / 2,
      width: w,
      height: h,
    });
  }

  /**
   * Genera SOLO la hoja de rendición (1 página landscape A4) usando pdfkit.
   * Replica el formato físico que Metal Engineers ya usa.
   */
  private async generarHoja(id_rendicion: number): Promise<Buffer> {
    const r = await RendicionService.obtener(id_rendicion);

    // Pre-descargar las 3 firmas escaneadas (mig 067) en paralelo. Si una
    // falla o no existe, queda null y el PDF muestra solo nombre+fecha o
    // "Sin firmar". Best-effort — nunca rompe la generación del PDF.
    const descargarFirma = async (url: string | null): Promise<Buffer | null> => {
      if (!url) return null;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        return Buffer.from(await resp.arrayBuffer());
      } catch { return null; }
    };
    const [firmaPrep, firmaRev, firmaAut] = await Promise.all([
      descargarFirma(r.preparado_por_firma),
      descargarFirma(r.revisado_por_firma),
      descargarFirma(r.autorizado_por_firma),
    ]);

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

      const dibujarFirma = (
        x: number, label: string, nombre: string | null,
        fecha: string | null, imgBuf: Buffer | null
      ) => {
        // Si hay firma escaneada, embeber la imagen ARRIBA de la línea
        // (zona de 25px de alto, centrada horizontalmente). Si no, queda
        // espacio en blanco como antes — la línea + nombre+fecha o "Sin firmar".
        if (imgBuf) {
          try {
            doc.image(imgBuf, x + 30, yFirmas, {
              fit: [firmaW - 60, 28],
              align: 'center',
              valign: 'bottom',
            });
          } catch { /* si la imagen es inválida, fallback a solo texto */ }
        }
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

      dibujarFirma(xFirmas,                      'Preparado por', r.preparado_por_nombre,  r.preparado_at,  firmaPrep);
      dibujarFirma(xFirmas + firmaW + gap,        'Revisado por',  r.revisado_por_nombre,   r.revisado_at,   firmaRev);
      dibujarFirma(xFirmas + (firmaW + gap) * 2,  'Autorizado por', r.autorizado_por_nombre, r.autorizado_at, firmaAut);

      // ── Nota al pie ──
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#6b7280')
        .text('NOTA: Adjuntar Facturas y/o boletas. De no existir factura o boleta, se deberá adjuntar el COMPROBANTE DE GASTOS con el detalle correspondiente.',
          32, doc.page.height - 50, { width: doc.page.width - 64 });

      doc.end();
    });
  }
}

export default new RendicionPDFService();

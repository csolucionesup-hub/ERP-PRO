/**
 * OrdenCompraPDFService — genera el PDF de una OC replicando el formato
 * físico actual de Metal Engineers (analizado de 4 OCs reales 2026).
 *
 * Estructura (matcheando los PDFs analizados):
 *   1. Logo Metal Engineers arriba izquierda
 *   2. Ciudad + fecha arriba derecha
 *   3. Título centrado: "ORDEN DE COMPRA Nº NNN - YYYY - CENTRO_COSTO"
 *   4. Bloque proveedor: Señores / RUC o DNI / Dirección / Teléfono / Email / Atención
 *   5. "Mediante la presente solicitamos se sirvan atendernos con lo siguiente:"
 *   6. Tabla de líneas: Item · Descripción · Und · Cant · P/U · Sub Total · IGV · Total S/ o $
 *   7. Total global + "SON: [letras] SOLES/DOLARES AMERICANOS"
 *   8. Caja "Condiciones y Forma de Pago":
 *      Forma pago · Fecha entrega · Lugar · Cuenta bancaria prov ·
 *      "Facturar a ME SAC, RUC 20610071962" · "Enviar factura a admin@..."
 *   9. "CENTRO COSTO:" + Contacto interno + teléfono
 *   10. 3 firmas: Solicitado / Revisado / Autorizado
 *   11. Pie: dirección ME + teléfono + email + web
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { numeroALetras, formatoMontoPeru } from '../../lib/numeroALetras';

interface OCData {
  nro_oc: string;
  empresa: 'ME' | 'PT';
  fecha_emision: string;
  fecha_entrega_esperada?: string | null;
  centro_costo: string;
  moneda: 'PEN' | 'USD';
  tipo_cambio: number;
  subtotal: number;
  descuento: number;
  aplica_igv: number;
  igv: number;
  total: number;
  forma_pago: string;
  dias_credito: number;
  observaciones?: string | null;
  atencion?: string | null;
  contacto_interno?: string | null;
  contacto_telefono?: string | null;
  solicitado_por?: string | null;
  revisado_por?: string | null;
  autorizado_por?: string | null;
  cuenta_bancaria_pago?: string | null;
  lugar_entrega?: string | null;
  // El service trae estos alias desde el JOIN con Proveedores
  proveedor_razon?: string;
  proveedor_nombre?: string;        // alias principal del JOIN
  proveedor_ruc?: string;
  proveedor_tipo?: 'JURIDICO' | 'NATURAL';
  proveedor_dni?: string;
  proveedor_direccion?: string;
  proveedor_telefono?: string;
  proveedor_email?: string;
  detalle: Array<{
    orden: number;
    descripcion: string;
    unidad: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }>;
}

interface ConfigEmpresa {
  ruc: string;
  razon_social: string;
  direccion_fiscal?: string | null;
  email_facturacion?: string | null;
  telefono?: string | null;
  web?: string | null;
  oc_ciudad_emision?: string | null;
  tasa_igv?: number;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  // MySQL puede devolver "2026-01-09T00:00:00.000Z" o Date. Normalizar a YYYY-MM-DD local.
  const s = String(v).slice(0, 10);
  return new Date(s + 'T12:00:00');
}

function fechaEspanol(v: any): string {
  const d = toDate(v);
  const dia = d.getDate();
  const mes = MESES[d.getMonth()];
  const año = d.getFullYear();
  return `${String(dia).padStart(2, '0')} de ${mes} del ${año}`;
}

function fechaCorta(v: any): string {
  const d = toDate(v);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export class OrdenCompraPDFService {
  /** Genera el PDF de una OC y devuelve un Buffer listo para enviar al cliente. */
  static async generar(oc: OCData, cfg: ConfigEmpresa): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        OrdenCompraPDFService.render(doc, oc, cfg);
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  private static render(doc: PDFKit.PDFDocument, oc: OCData, cfg: ConfigEmpresa) {
    const pageW = doc.page.width;
    const marginL = 45;
    const marginR = 45;
    const contentW = pageW - marginL - marginR;

    // ── 1. Logo (arriba izquierda) ─────────────────────────
    // process.cwd() (no __dirname) porque tras `tsc` el __dirname queda en
    // dist/app/modules/compras y ../../../public no existe en producción.
    // Marca PT usa logo Perfotools, marca ME (default) usa Metal Engineers.
    const logoFile = oc.empresa === 'PT' ? 'logo-perfotools.png' : 'logo-metal.png';
    const logoPath = path.join(process.cwd(), 'public', 'img', logoFile);
    try {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, marginL, 35, { width: 140 });
      }
    } catch {}

    // ── 2. Ciudad + fecha (arriba derecha) ─────────────────
    const ciudad = cfg.oc_ciudad_emision || 'Puente Piedra';
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    doc.text(`${ciudad}, ${fechaEspanol(oc.fecha_emision)}`, marginL, 120, {
      width: contentW, align: 'right',
    });

    // ── 3. Título (centrado) ───────────────────────────────
    const titulo = `ORDEN DE COMPRA Nº ${oc.nro_oc} - ${oc.centro_costo}`;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000');
    doc.text(titulo, marginL, 145, { width: contentW, align: 'center' });

    // ── 4. Bloque proveedor ────────────────────────────────
    const provRazon = oc.proveedor_razon || oc.proveedor_nombre || '—';
    let y = 180;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Señores : ${provRazon}`, marginL, y);
    y += 14;
    doc.font('Helvetica').fontSize(9.5);
    if (oc.proveedor_tipo === 'NATURAL' && oc.proveedor_dni) {
      doc.font('Helvetica-Bold').text('Dni: ', marginL, y, { continued: true });
      doc.font('Helvetica').text(oc.proveedor_dni);
    } else if (oc.proveedor_ruc) {
      doc.font('Helvetica-Bold').text('RUC: ', marginL, y, { continued: true });
      doc.font('Helvetica').text(oc.proveedor_ruc);
    }
    y += 14;
    if (oc.proveedor_direccion) {
      doc.font('Helvetica').fontSize(9);
      doc.text(`Dirección : ${oc.proveedor_direccion}`, marginL, y, { width: contentW });
      y += 14;
    }
    doc.fontSize(9).text(`Telefono : ${oc.proveedor_telefono || ''}   E-mail : ${oc.proveedor_email || ''}`, marginL, y);
    y += 12;
    doc.text(`Atención : ${oc.atencion || ''}`, marginL, y);
    y += 12;
    doc.text('Presente .-', marginL, y);
    y += 18;
    doc.fontSize(9.5).text('Mediante la presente solicitamos se sirvan atendernos con lo siguiente :', marginL + 20, y);
    y += 18;

    // ── 5. Tabla de ítems ──────────────────────────────────
    // Columnas dinámicas: si la OC no aplica IGV, omitimos las columnas IGV
    // y Total (Sub Total = Total efectivo) para que el grid no quede con
    // una columna vacía visualmente confusa. Total content width = 505pt.
    const aplicaIgv = !!Number(oc.aplica_igv);
    const totLabel = 'Total ' + (oc.moneda === 'USD' ? '$' : 'S/');
    type Cell = { x: number; w: number; label: string };
    const col: { item: Cell; desc: Cell; und: Cell; cant: Cell; pu: Cell; sub: Cell; igv?: Cell; tot?: Cell } = aplicaIgv
      ? {
          item: { x: marginL,        w: 30,  label: 'Item' },
          desc: { x: marginL + 30,   w: 200, label: 'Descripción' },
          und:  { x: marginL + 230,  w: 35,  label: 'Und' },
          cant: { x: marginL + 265,  w: 40,  label: 'Cant' },
          pu:   { x: marginL + 305,  w: 50,  label: 'P/U' },
          sub:  { x: marginL + 355,  w: 55,  label: 'Sub Total' },
          igv:  { x: marginL + 410,  w: 40,  label: 'IGV' },
          tot:  { x: marginL + 450,  w: 55,  label: totLabel },
        }
      : {
          item: { x: marginL,        w: 30,  label: 'Item' },
          desc: { x: marginL + 30,   w: 250, label: 'Descripción' },
          und:  { x: marginL + 280,  w: 40,  label: 'Und' },
          cant: { x: marginL + 320,  w: 50,  label: 'Cant' },
          pu:   { x: marginL + 370,  w: 60,  label: 'P/U' },
          sub:  { x: marginL + 430,  w: 75,  label: totLabel },
        };
    const cols: Cell[] = Object.values(col).filter(Boolean) as Cell[];
    const headerH = 18;
    const rowMin  = 18;
    const tableTop = y;

    // Header con altura fija
    doc.font('Helvetica-Bold').fontSize(9);
    cols.forEach(c => {
      doc.rect(c.x, tableTop, c.w, headerH).stroke();
      doc.text(c.label, c.x + 2, tableTop + 5, { width: c.w - 4, align: 'center' });
    });

    // Filas con altura dinámica según el largo de la descripción
    y = tableTop + headerH;
    doc.font('Helvetica').fontSize(8.5);
    const maxLineas = Math.max(oc.detalle.length, 2); // mínimo 2 filas visibles
    for (let i = 0; i < maxLineas; i++) {
      const l = oc.detalle[i];
      doc.font('Helvetica').fontSize(8.5);
      const descTexto = l ? (l.descripcion || '') : '';
      const descH = descTexto ? doc.heightOfString(descTexto, { width: col.desc.w - 6 }) : 0;
      const rowH = Math.max(rowMin, descH + 10); // 5pt padding top + 5pt bottom

      // Bordes con la altura calculada
      cols.forEach(c => doc.rect(c.x, y, c.w, rowH).stroke());

      if (l) {
        const sub = Number(l.subtotal) || 0;
        const cant = Number(l.cantidad) || 0;
        const pu = Number(l.precio_unitario) || 0;
        doc.text(String(l.orden || (i + 1)), col.item.x + 2, y + 5, { width: col.item.w - 4, align: 'center' });
        doc.text(descTexto, col.desc.x + 3, y + 5, { width: col.desc.w - 6 });
        doc.text(l.unidad || '', col.und.x + 2, y + 5, { width: col.und.w - 4, align: 'center' });
        doc.text(cant.toFixed(2), col.cant.x + 2, y + 5, { width: col.cant.w - 6, align: 'right' });
        doc.text(pu.toFixed(2), col.pu.x + 2, y + 5, { width: col.pu.w - 6, align: 'right' });
        doc.text(sub.toFixed(2), col.sub.x + 2, y + 5, { width: col.sub.w - 6, align: 'right' });
        if (aplicaIgv && col.igv && col.tot) {
          const igvL = Number((sub * (cfg.tasa_igv || 18) / 100).toFixed(2));
          doc.text(igvL.toFixed(2), col.igv.x + 2, y + 5, { width: col.igv.w - 6, align: 'right' });
          const totalL = Number((sub + igvL).toFixed(2));
          doc.text(totalL.toFixed(2), col.tot.x + 2, y + 5, { width: col.tot.w - 6, align: 'right' });
        }
      }
      y += rowH;
    }

    // Fila de Total general — la última columna numérica recibe el monto.
    doc.font('Helvetica-Bold').fontSize(10);
    const simbolo = oc.moneda === 'USD' ? '$' : 'S/.';
    const totalCell = aplicaIgv ? col.tot! : col.sub;
    const labelEnd = totalCell.x; // hasta donde llega la celda de etiqueta
    doc.rect(col.item.x, y, labelEnd - col.item.x, rowMin).stroke();
    doc.rect(totalCell.x, y, totalCell.w, rowMin).stroke();
    doc.text(simbolo, totalCell.x - 60, y + 5, { width: 56, align: 'right' });
    doc.text(Number(oc.total).toFixed(2), totalCell.x + 2, y + 5, { width: totalCell.w - 6, align: 'right' });
    y += rowMin;

    // "SON: ..."
    doc.rect(col.item.x, y, contentW, rowMin).stroke();
    doc.font('Helvetica').fontSize(9);
    doc.text(`SON: ${numeroALetras(oc.total, oc.moneda)}`, col.item.x + 5, y + 5, { width: contentW - 10 });
    y += rowMin + 18;

    // ── 6. Condiciones y Forma de Pago ─────────────────────
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Condiciones y Forma de Pago :', marginL + 40, y);
    y += 14;

    const condW = contentW - 80;
    const condX = marginL + 40;
    const condRowH = 15;

    const condiciones: Array<[string, string?]> = [
      [`- Forma de pago : ${oc.forma_pago === 'CREDITO' ? 'Crédito ' + (oc.dias_credito || 0) + ' días' : 'Deposito en cuenta'}`, `${simbolo} ${Number(oc.total).toFixed(2)}`],
      [`- Fecha de entrega : ${oc.fecha_entrega_esperada ? fechaCorta(oc.fecha_entrega_esperada) : fechaCorta(oc.fecha_emision)}`],
      [`- Lugar de Entrega : ${oc.lugar_entrega || 'Lima'}`],
    ];
    if (oc.cuenta_bancaria_pago) {
      condiciones.push([`- ${oc.cuenta_bancaria_pago}`]);
    }
    condiciones.push([`- Facturar a nombre de ${cfg.razon_social} , RUC ${cfg.ruc}`]);
    condiciones.push([`- Enviar factura a ${cfg.email_facturacion || ''}`]);

    doc.font('Helvetica').fontSize(9);
    condiciones.forEach(([left, right]) => {
      doc.rect(condX, y, condW, condRowH).stroke();
      const esPrincipal = left.startsWith('- Forma de pago') || left.startsWith('- Cta') || left.startsWith('- Cuenta') || left.startsWith('- Facturar');
      if (esPrincipal) doc.font('Helvetica-Bold');
      doc.text(left, condX + 4, y + 4, { width: condW - 100 });
      doc.font('Helvetica');
      if (right) {
        doc.font('Helvetica-Bold').text(right, condX + condW - 90, y + 4, { width: 86, align: 'right' });
        doc.font('Helvetica');
      }
      y += condRowH;
    });
    y += 10;

    // ── 7. Centro de costo + contacto ──────────────────────
    doc.font('Helvetica').fontSize(9);
    doc.text(`CENTRO COSTO: ${oc.centro_costo}`, marginL, y);
    y += 14;
    if (oc.contacto_interno) {
      doc.text(`Contacto : ${oc.contacto_interno}   Celular : ${oc.contacto_telefono || ''}`, marginL, y);
      y += 14;
    }

    // ── 8. Firmas (3 columnas) ─────────────────────────────
    y += 40;
    const firmaW = contentW / 3;
    const firma = (x: number, cargo: string, nombre?: string | null) => {
      doc.font('Helvetica').fontSize(9);
      doc.moveTo(x + 20, y).lineTo(x + firmaW - 20, y).stroke();
      doc.text(cargo, x, y + 4, { width: firmaW, align: 'center' });
      if (nombre) {
        doc.font('Helvetica').fontSize(9.5).text(nombre, x, y + 18, { width: firmaW, align: 'center' });
      }
    };
    firma(marginL,                    'Solicitado Por :', oc.solicitado_por);
    firma(marginL + firmaW,           'Revisado Por :',   oc.revisado_por);
    firma(marginL + firmaW * 2,       'Autorizado Por :', oc.autorizado_por);

    // ── 9. Pie de página: reducir margen inferior para que las 3 líneas quepan ─
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 10;
    const pieY = doc.page.height - 58;
    doc.font('Helvetica').fontSize(8).fillColor('#444');
    doc.text(cfg.direccion_fiscal || '', marginL, pieY, { width: contentW, align: 'center', lineBreak: false });
    doc.text(`E-mail : ${cfg.email_facturacion || ''}`, marginL, pieY + 12, { width: contentW, align: 'center', lineBreak: false });
    doc.text(`página web : ${cfg.web || ''}`, marginL, pieY + 24, { width: contentW, align: 'center', lineBreak: false });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

export default OrdenCompraPDFService;

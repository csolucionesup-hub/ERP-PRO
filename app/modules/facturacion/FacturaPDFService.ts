/**
 * FacturaPDFService — genera el PDF de Factura/Boleta electrónica con layout
 * SUNAT estándar. Cuando se conecte Nubefact REAL, este PDF queda como preview
 * interno y el oficial es el que devuelve Nubefact en la URL.
 *
 * Layout (referencia: ejemplo de Metal Engineers · E001-70):
 *   - Caja superior izquierda: razón social, dirección fiscal, contacto
 *   - Caja superior derecha: tipo comprobante, RUC, serie-correlativo
 *   - Bloque datos del cliente (fecha, señor(es), RUC, dirección, moneda, observación, forma pago)
 *   - Tabla de ítems: Cantidad / Unidad / Descripción / Valor Unitario / ICBPER
 *   - Caja de totales a la derecha (Sub Total, Descuentos, Valor Venta, IGV, Importe Total)
 *   - Importe en letras
 *   - Pie de "representación impresa de la factura electrónica"
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import FacturaService from './FacturaService';
import ConfiguracionService from '../configuracion/ConfiguracionService';
import ConfiguracionMarcaService from '../comercial/ConfiguracionMarcaService';

const MARCA_VISUAL = {
  METAL:      { logo: path.join(process.cwd(), 'public/img/logo-metal.png'),      color: '#000000' },
  PERFOTOOLS: { logo: path.join(process.cwd(), 'public/img/logo-perfotools.png'), color: '#dc2626' },
} as const;

// Reutiliza numeroALetras de CotizacionPDFService — duplicado intencional para
// no crear dependencia cruzada entre módulos.
const UNI = ['', 'UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
             'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE'];
const DEC = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CEN = ['', 'CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
             'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
function centenaEnLetras(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let out = CEN[c];
  if (r <= 20) out += (out && r ? ' ' : '') + UNI[r];
  else {
    const d = Math.floor(r / 10), u = r % 10;
    if (d === 2) out += (out ? ' ' : '') + 'VEINTI' + (UNI[u] || '').toLowerCase();
    else out += (out ? ' ' : '') + DEC[d] + (u ? ' Y ' + UNI[u] : '');
  }
  return out.trim().toUpperCase();
}
function numeroALetras(n: number): string {
  const entero = Math.floor(n);
  const cent   = Math.round((n - entero) * 100);
  if (entero === 0) return `CERO Y ${String(cent).padStart(2,'0')}/100`;
  const millones = Math.floor(entero / 1_000_000);
  const miles    = Math.floor((entero % 1_000_000) / 1000);
  const resto    = entero % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLON' : `${centenaEnLetras(millones)} MILLONES`);
  if (miles)    partes.push(miles === 1 ? 'MIL' : `${centenaEnLetras(miles)} MIL`);
  if (resto)    partes.push(centenaEnLetras(resto));
  return `${partes.join(' ')} Y ${String(cent).padStart(2,'0')}/100`;
}

const fmt = (n: number) => Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

class FacturaPDFService {
  async generar(idFactura: number): Promise<Buffer> {
    const f = await FacturaService.obtener(idFactura);
    const marca: keyof typeof MARCA_VISUAL = (() => {
      // La factura no guarda marca explícita. Si tiene id_cotizacion, podríamos
      // resolverla. Por ahora usamos heurística: serie F001=METAL, F002=PERFOTOOLS.
      if (f.serie === 'F002') return 'PERFOTOOLS';
      return 'METAL';
    })();
    const visual = MARCA_VISUAL[marca];

    const cfgEmpresa = await ConfiguracionService.getActual().catch(() => null);
    let cfgMarca: any = null;
    try { cfgMarca = await ConfiguracionMarcaService.getByMarca(marca); }
    catch { /* fallback a defaults */ }

    // Datos del emisor — fiscal SUNAT obligatorio en factura
    const empresa = {
      razon_social: cfgMarca?.razon_social || 'METAL ENGINEERS S.A.C.',
      ruc:          cfgEmpresa?.ruc || cfgMarca?.ruc || '20610071962',
      direccion:    cfgEmpresa?.direccion_fiscal_sunat
                    || 'AV. JAVIER PRADO ESTE 2813 INT. 502 CRUCE JAVIER PRADO CON SAN LUIS, SAN BORJA - LIMA - LIMA',
      web:          cfgMarca?.web || cfgEmpresa?.web,
      email:        cfgMarca?.email || cfgEmpresa?.email_facturacion,
    };

    // Logo: prioridad Cloudinary configurado en ConfiguracionMarca, fallback PNG local
    let logoSrc: string | Buffer = visual.logo;
    if (cfgMarca?.logo_url) {
      try {
        const r = await fetch(cfgMarca.logo_url);
        if (r.ok) logoSrc = Buffer.from(await r.arrayBuffer());
      } catch { /* fallback al local */ }
    }

    const moneda    = f.moneda || 'PEN';
    const monedaSim = moneda === 'USD' ? 'US$' : 'S/';
    const monedaTxt = moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES';
    const tipoLabel = f.tipo === 'BOLETA' ? 'BOLETA DE VENTA ELECTRÓNICA' : 'FACTURA ELECTRÓNICA';
    const numeroFmt = `${f.serie}-${String(f.numero).padStart(6, '0')}`;

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const L = 40;
    const R = doc.page.width - 40;
    const W = R - L;
    let y = 40;

    // ── Encabezado: 2 cajas (empresa | tipo comprobante) ───────────
    const headerH = 95;
    const boxLeftW = W * 0.62;
    const boxRightW = W - boxLeftW - 10;

    // Caja izquierda (empresa)
    doc.rect(L, y, boxLeftW, headerH).lineWidth(0.5).strokeColor('#000').stroke();
    let yL = y + 8;
    // Logo a la izq
    try {
      doc.image(logoSrc, L + 8, yL, { fit: [55, 50] });
    } catch { /* sin logo */ }
    const textX = L + 75;
    const textW = boxLeftW - 80;
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11)
       .text(empresa.razon_social, textX, yL, { width: textW });
    yL = doc.y + 2;
    doc.font('Helvetica').fontSize(8)
       .text(empresa.direccion, textX, yL, { width: textW });
    yL = doc.y + 1;
    if (empresa.web)   doc.text(`Web: ${empresa.web}`,   textX, yL, { width: textW });
    if (empresa.email) doc.text(`Email: ${empresa.email}`, textX, doc.y, { width: textW });

    // Caja derecha (tipo comprobante)
    const xR = L + boxLeftW + 10;
    doc.rect(xR, y, boxRightW, headerH).lineWidth(0.5).strokeColor(visual.color).stroke();
    doc.fillColor(visual.color).font('Helvetica-Bold').fontSize(10)
       .text(tipoLabel, xR, y + 14, { width: boxRightW, align: 'center' });
    doc.fillColor('#000').font('Helvetica').fontSize(9)
       .text(`RUC: ${empresa.ruc}`, xR, y + 38, { width: boxRightW, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(15)
       .text(numeroFmt, xR, y + 58, { width: boxRightW, align: 'center' });

    y += headerH + 10;

    // ── Bloque datos del cliente ──────────────────────────────────
    const labelW = 110;
    const lineH = 14;
    const drawRow = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(8.5).fillColor('#555')
         .text(`${label}:`, L, y, { width: labelW });
      doc.font('Helvetica').fontSize(9).fillColor('#000')
         .text(value || '—', L + labelW, y, { width: W - labelW });
      y += lineH;
    };
    const fechaEmision = String(f.fecha_emision).slice(0, 10);
    const fechaFmt = (() => {
      const [Y, M, D] = fechaEmision.split('-');
      return `${D}/${M}/${Y}`;
    })();

    drawRow('Fecha de Emisión', fechaFmt);
    drawRow('Señor(es)',         f.cliente_razon_social || '');
    drawRow(f.cliente_tipo_doc === 'RUC' ? 'RUC' : f.cliente_tipo_doc, f.cliente_numero_doc || '');
    if (f.cliente_direccion) drawRow('Dirección del Cliente', f.cliente_direccion);
    drawRow('Tipo de Moneda',    monedaTxt);
    if (f.observaciones)         drawRow('Observación', String(f.observaciones));
    drawRow('Forma de pago',
      f.forma_pago === 'CREDITO' ? `Crédito ${f.dias_credito || 0} días` : 'Contado');

    y += 4;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.4).strokeColor('#999').stroke();
    y += 6;

    // ── Tabla de ítems ────────────────────────────────────────────
    const cols = {
      cant:   { x: L,        w: 50,  align: 'center' as const, label: 'Cantidad' },
      unidad: { x: L + 50,   w: 60,  align: 'center' as const, label: 'Unidad Medida' },
      desc:   { x: L + 110,  w: W - 110 - 80 - 50,             align: 'left'  as const, label: 'Descripción' },
      precio: { x: 0,        w: 80,  align: 'right' as const, label: 'Valor Unitario' },
      icbper: { x: 0,        w: 50,  align: 'right' as const, label: 'ICBPER' },
    };
    cols.precio.x = cols.desc.x + cols.desc.w;
    cols.icbper.x = cols.precio.x + cols.precio.w;

    // Header tabla
    const headerY = y;
    const headerH2 = 22;
    doc.rect(L, headerY, W, headerH2).fillColor('#f5f5f5').fill().fillColor('#000');
    doc.lineWidth(0.5).strokeColor('#bbb').rect(L, headerY, W, headerH2).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333');
    Object.values(cols).forEach(c => {
      doc.text(c.label, c.x + 2, headerY + 7, { width: c.w - 4, align: c.align });
    });
    y = headerY + headerH2;

    // Filas
    doc.font('Helvetica').fontSize(9).fillColor('#000');
    for (const d of (f.detalles || [])) {
      // Calcular alto requerido por la descripción
      const descText = d.descripcion || '';
      const descH = doc.heightOfString(descText, { width: cols.desc.w - 4 });
      const rowH = Math.max(descH + 8, 22);

      // page break si excede
      if (y + rowH > doc.page.height - 200) {
        doc.addPage();
        y = 40;
      }

      doc.lineWidth(0.3).strokeColor('#e5e5e5').moveTo(L, y + rowH).lineTo(R, y + rowH).stroke();
      doc.text(fmt(Number(d.cantidad)),         cols.cant.x   + 2, y + 6, { width: cols.cant.w   - 4, align: cols.cant.align });
      doc.text(d.unidad_sunat || 'UNIDAD',      cols.unidad.x + 2, y + 6, { width: cols.unidad.w - 4, align: cols.unidad.align });
      doc.text(descText,                        cols.desc.x   + 2, y + 4, { width: cols.desc.w   - 4, align: cols.desc.align });
      doc.text(fmt(Number(d.precio_unitario)),  cols.precio.x + 2, y + 6, { width: cols.precio.w - 4, align: cols.precio.align });
      doc.text('0.00',                          cols.icbper.x + 2, y + 6, { width: cols.icbper.w - 4, align: cols.icbper.align });
      y += rowH;
    }

    y += 8;

    // ── Bloque inferior: leyenda + totales ─────────────────────────
    // Caja de totales a la derecha
    const totalsX = R - 230;
    const totalsW = 230;
    const labelTotW = 130;
    const valTotW = totalsW - labelTotW - 6;
    const drawTotal = (label: string, value: string, opts: { bold?: boolean } = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor('#000');
      doc.text(label, totalsX, y, { width: labelTotW, align: 'right' });
      doc.text(value, totalsX + labelTotW + 6, y, { width: valTotW, align: 'right' });
      y += 12;
    };

    const subtotal = Number(f.subtotal) || 0;
    const descGlobal = Number(f.descuento_global) || 0;
    const igv = Number(f.igv) || 0;
    const total = Number(f.total) || 0;

    drawTotal('Sub Total Ventas',  `${monedaSim} ${fmt(subtotal)}`);
    drawTotal('Anticipos',         `${monedaSim} 0.00`);
    drawTotal('Descuentos',        `${monedaSim} ${fmt(descGlobal)}`);
    drawTotal('Valor Venta',       `${monedaSim} ${fmt(subtotal - descGlobal)}`);
    drawTotal('ISC',               `${monedaSim} 0.00`);
    drawTotal('IGV',               `${monedaSim} ${fmt(igv)}`);
    drawTotal('ICBPER',            `${monedaSim} 0.00`);
    drawTotal('Otros Cargos',      `${monedaSim} 0.00`);
    drawTotal('Otros Tributos',    `${monedaSim} 0.00`);
    drawTotal('Monto de redondeo', `${monedaSim} 0.00`);
    drawTotal('Importe Total',     `${monedaSim} ${fmt(total)}`, { bold: true });

    y += 8;

    // Importe en letras
    const enLetras = `SON: ${numeroALetras(total)} ${monedaTxt}`;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
       .text(enLetras, L, y, { width: W });
    y = doc.y + 8;

    // Detracción si aplica
    if (f.aplica_detraccion) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#92400e')
         .text(
           `Operación sujeta a detracción (${f.porcentaje_detraccion}%): ${monedaSim} ${fmt(Number(f.monto_detraccion) || 0)}` +
           (f.codigo_servicio_spot ? ` · Código SPOT: ${f.codigo_servicio_spot}` : ''),
           L, y, { width: W }
         );
      y = doc.y + 6;
    }

    // ── Pie ───────────────────────────────────────────────────────
    const footY = doc.page.height - 70;
    if (y < footY) y = footY;
    doc.lineWidth(0.4).strokeColor('#999').moveTo(L, y).lineTo(R, y).stroke();
    y += 6;
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555')
       .text(
         f.estado_sunat === 'ACEPTADA'
           ? 'Esta es una representación impresa de la factura electrónica, generada en el Sistema de SUNAT. Puede verificarla utilizando su clave SOL.'
           : f.estado_sunat === 'PENDIENTE' || f.estado_sunat === 'SIMULADO'
           ? 'PREVIEW INTERNO — Este documento aún no fue enviado a SUNAT (modo simulado). Una vez configurado el OSE, las facturas siguientes serán oficiales.'
           : `Estado SUNAT: ${f.estado_sunat}.`,
         L, y, { width: W, align: 'center' }
       );

    doc.end();
    return done;
  }
}

export default new FacturaPDFService();

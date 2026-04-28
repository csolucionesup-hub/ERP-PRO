import PDFDocument from 'pdfkit';
import path from 'path';
import CotizacionService from './CotizacionService';
import ConfiguracionMarcaService from './ConfiguracionMarcaService';

// Logo y color sí son visuales y se mantienen en código.
// Usamos process.cwd() (no __dirname) porque tras `tsc` el __dirname queda en
// dist/app/modules/comercial y ../../../public no existe en producción —
// process.cwd() apunta a /app (raíz del proyecto) tanto en dev como en Railway.
const MARCA_VISUAL = {
  METAL:      { logo: path.join(process.cwd(), 'public/img/logo-metal.png'),      color: '#000000' },
  PERFOTOOLS: { logo: path.join(process.cwd(), 'public/img/logo-perfotools.png'), color: '#dc2626' },
} as const;

type Marca = keyof typeof MARCA_VISUAL;

// ── Fecha "Lima, DD de MMMM del YYYY" ────────────────────────────
const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','setiembre','octubre','noviembre','diciembre'];
function fechaLarga(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return '';
  return `Lima, ${String(d).padStart(2,'0')} de ${MESES[m-1]} del ${y}`;
}

// ── Número a letras (español, montos peruanos) ───────────────────
const UNI = ['', 'UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
             'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE',
             'VEINTE'];
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
  if (entero === 0) return `CERO CON ${String(cent).padStart(2,'0')}/100`;

  const millones = Math.floor(entero / 1_000_000);
  const miles    = Math.floor((entero % 1_000_000) / 1000);
  const resto    = entero % 1000;

  let partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLON' : `${centenaEnLetras(millones)} MILLONES`);
  if (miles)    partes.push(miles === 1 ? 'MIL' : `${centenaEnLetras(miles)} MIL`);
  if (resto)    partes.push(centenaEnLetras(resto));

  return `${partes.join(' ')} CON ${String(cent).padStart(2,'0')}/100`;
}

// Defaults usados cuando la fila de ConfiguracionMarca falta (no debería
// pasar en producción, pero si pasa no queremos que el PDF tire 500). Mantienen
// los datos reales de Metal Engineers al 2026-04-28; si cambian, actualizar
// también la migración 011 y el row en producción.
const DEFAULT_CFG_BY_MARCA = {
  METAL: {
    razon_social: 'METAL ENGINEERS S.A.C.',
    ruc: '20610071962',
    direccion: 'Av. San Juan 500-598, Asoc. Independencia, Puente Piedra, Lima, Perú',
    web: 'www.metalengineers.com.pe',
    email: 'proyectos@metalengineers.com.pe',
    cta_pen_banco: 'Interbank', cta_pen_numero: '200-3004523324', cta_pen_cci: '003-200-003004523324-31',
    cta_usd_banco: null, cta_usd_numero: null, cta_usd_cci: null,
    firma_nombre: 'JULIO ROJAS COTRINA', firma_cargo: 'Gerente Comercial',
    firma_telefono: '984 327 588', firma_email: 'proyectos@metalengineers.com.pe',
    firma_direccion: 'Av. San Juan 500-598, Asoc. Independencia, Puente Piedra',
  },
  PERFOTOOLS: {
    razon_social: 'PERFOTOOLS — METAL ENGINEERS S.A.C.',
    ruc: '20610071962',
    direccion: 'Av. San Juan 500-598, Asoc. Independencia, Puente Piedra, Lima, Perú',
    web: 'www.metalengineers.com.pe',
    email: 'proyectos@metalengineers.com.pe',
    cta_pen_banco: null, cta_pen_numero: null, cta_pen_cci: null,
    cta_usd_banco: 'Interbank', cta_usd_numero: '200-3007027785', cta_usd_cci: '003-200-003007027785-37',
    firma_nombre: 'JULIO ROJAS COTRINA', firma_cargo: 'Gerente Comercial',
    firma_telefono: '984 327 588', firma_email: 'proyectos@metalengineers.com.pe',
    firma_direccion: 'Av. San Juan 500-598, Asoc. Independencia, Puente Piedra',
  },
} as const;

// ─────────────────────────────────────────────────────────────────
class CotizacionPDFService {
  async generar(idCotizacion: number): Promise<Buffer> {
    const cot = await CotizacionService.getCotizacionById(idCotizacion);
    const marca: Marca = (cot.marca || 'METAL') as Marca;
    const visual = MARCA_VISUAL[marca];
    let cfg: any;
    try {
      cfg = await ConfiguracionMarcaService.getByMarca(marca);
    } catch (err) {
      console.warn(`[PDF] ConfiguracionMarca falta para ${marca} — usando defaults hardcoded:`, err);
      cfg = DEFAULT_CFG_BY_MARCA[marca];
    }
    // Resolver el logo: prioridad URL de Cloudinary (subida desde Configuración),
    // fallback al PNG local en public/img/, fallback final al texto (en el catch
    // de doc.image más abajo). pdfkit acepta tanto string path como Buffer.
    let logoFuente: string | Buffer = visual.logo;
    if (cfg.logo_url) {
      try {
        const r = await fetch(cfg.logo_url);
        if (r.ok) {
          const ab = await r.arrayBuffer();
          logoFuente = Buffer.from(ab);
        }
      } catch (err) {
        console.warn(`[PDF] No se pudo bajar logo_url de Cloudinary, uso fallback local:`, err);
      }
    }

    const meta   = {
      razon:     cfg.razon_social,
      ruc:       cfg.ruc,
      direccion: cfg.direccion,
      web:       cfg.web,
      email:     cfg.email,
      logo:      logoFuente,
      color:     visual.color,
    };
    const esUSD  = cot.moneda === 'USD';
    const curSym = esUSD ? 'US$' : 'S/';
    const curWord= esUSD ? 'DOLARES AMERICANOS' : 'SOLES';
    const tc     = Number(cot.tipo_cambio) || 1;
    const aplicaIGV = Number(cot.igv) > 0;

    // bottom: 20 → maxY=821, footer a y=786 entra sin que pdfkit auto-cree páginas
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 20, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const L = 50;                              // left margin
    const R = doc.page.width - 50;             // right edge
    const pageW = R - L;

    // ── Pie de página (posición absoluta, no empuja cursor) ─────
    // FOOTER_Y=70pt desde el fondo. Con margen bottom=20pt, maxY=821pt.
    // 4 líneas × 10pt + fontHeight ≈ 50pt, última línea termina en FOOTER_Y+30+9 = FOOTER_Y+39.
    // Para que NO pase 821: FOOTER_Y + 39 ≤ 821 → FOOTER_Y ≤ 782. Usamos 771 (page.height-70) por seguridad.
    const FOOTER_Y = doc.page.height - 70;
    const drawFooter = () => {
      const saved = (doc as any)._y;
      doc.fontSize(7.5).fillColor('#666').font('Helvetica')
        .text(`${meta.razon}   |   RUC: ${meta.ruc}`, L, FOOTER_Y,      { width: pageW, align: 'center', lineBreak: false });
      doc.text(meta.direccion,                        L, FOOTER_Y + 10, { width: pageW, align: 'center', lineBreak: false });
      doc.fillColor('#1d4ed8')
        .text(meta.web,                               L, FOOTER_Y + 20, { width: pageW, align: 'center', link: `https://${meta.web}`, underline: true, lineBreak: false });
      doc.fillColor('#666')
        .text(meta.email, L, FOOTER_Y + 30, { width: pageW, align: 'center', lineBreak: false });
      doc.moveTo(L, FOOTER_Y - 4).lineTo(R, FOOTER_Y - 4).lineWidth(0.4).strokeColor('#ccc').stroke();
      (doc as any)._y = saved;
    };

    // ── Cabecera ────────────────────────────────────────────────
    try { doc.image(meta.logo, L, 38, { height: 50 }); }
    catch { doc.fontSize(16).fillColor(meta.color).text(meta.razon, L, 45); }

    doc.fontSize(10).fillColor('#000').font('Helvetica')
      .text(fechaLarga(cot.fecha), L, 48, { width: pageW, align: 'right' });

    let y = 110;

    // Título centrado
    doc.fontSize(14).fillColor('#000').font('Helvetica-Bold')
      .text(`COTIZACIÓN N° ${cot.nro_cotizacion.replace(/^COT\s*/, '')}`,
            L, y, { width: pageW, align: 'center' });
    y += 24;

    // ── Datos del cliente (label:value) ─────────────────────────
    const LBL_W = 70;
    const lineField = (label: string, value: any, bold = false, link?: string) => {
      if (!value) return;
      doc.font('Helvetica').fontSize(10).fillColor('#000')
        .text(`${label}:`, L, y, { width: LBL_W });
      if (link) {
        doc.fillColor('#1d4ed8').font('Helvetica').text(String(value), L + LBL_W, y,
          { width: pageW - LBL_W, link, underline: true });
        doc.fillColor('#000');
      } else {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
           .text(String(value), L + LBL_W, y, { width: pageW - LBL_W });
      }
      y += doc.heightOfString(String(value), { width: pageW - LBL_W });
      y += 2;
    };

    // Cliente arriba (razón social)
    doc.font('Helvetica-Bold').fontSize(10).text('Señores:', L, y);
    doc.font('Helvetica').text(cot.cliente || '', L + LBL_W, y, { width: pageW - LBL_W });
    y += 14;

    lineField('Atención', cot.atencion);
    lineField('Teléfono', cot.telefono);
    if (cot.correo) lineField('Correo', cot.correo, false, `mailto:${cot.correo}`);
    lineField('Proyecto', cot.proyecto, true);
    lineField('Ref.',     cot.ref,      true);
    y += 16;

    // ── Saludo ──────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(10).fillColor('#000')
      .text('Estimados señores:', L, y); y += 14;
    doc.text('En atención a su solicitud, nos es grato cotizarle:', L, y); y += 24;

    // ── Tabla de ítems ──────────────────────────────────────────
    // Columnas (A4 = 595pt, L=50, R=545, pageW=495)
    // Ítem | Descripción | Unidad | Cantidad | P.Unit | SubTotal+Foto
    //   28 |         205 |     38 |       45 |     70 |        109 = 495 ✓
    // wPU 55→70 para que "Precio Unit. S/" no quede apiñado contra el borde.
    // La foto va DEBAJO del precio en la columna SubTotal (estilo PDF Excel referencia).
    const cIT = L,        wIT = 28;
    const cDE = L + 28,   wDE = 205;
    const cUN = L + 233,  wUN = 38;
    const cCA = L + 271,  wCA = 45;
    const cPU = L + 316,  wPU = 70;
    const cST = L + 386,  wST = R - (L + 386); // = 109pt

    const drawTableHeader = () => {
      // Header con fondo de color de marca (rojo Perfotools / negro Metal).
      // Banda 32pt: título en línea 1 y moneda (S/ o US$) en línea 2 para
      // que "Precio Unit. US$" no se corte en Perfotools y todo respire.
      doc.rect(L, y, pageW, 32).fillColor(visual.color).fill();
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      // Columnas sin moneda: centradas verticalmente en la banda
      const hY = y + 11;
      doc.text('Ítem',        cIT, hY, { width: wIT, align: 'center' });
      doc.text('Descripción', cDE + 4, hY, { width: wDE - 4, align: 'left' });
      doc.text('Unidad',      cUN, hY, { width: wUN, align: 'center' });
      doc.text('Cantidad',    cCA, hY, { width: wCA, align: 'center' });
      // Columnas con moneda: dos líneas (label + moneda)
      const hY1 = y + 5, hY2 = y + 18;
      doc.text('Precio Unit.', cPU, hY1, { width: wPU - 4, align: 'right' });
      doc.text(curSym,         cPU, hY2, { width: wPU - 4, align: 'right' });
      doc.text('Sub Total',    cST, hY1, { width: wST - 4, align: 'right' });
      doc.text(curSym,         cST, hY2, { width: wST - 4, align: 'right' });
      y += 32 + 4; // banda + 4pt de aire antes de la primera fila
      doc.fillColor('#000');
    };

    // withHeader=true solo dentro del loop de ítems; fuera de la tabla NO se redibuja cabecera
    const ensureSpace = (needed: number, withHeader = false) => {
      if (y + needed > FOOTER_Y - 10) {
        drawFooter();
        doc.addPage();
        y = 50;
        if (withHeader) drawTableHeader();
      }
    };

    drawTableHeader();

    const detalles = (cot.detalles || []) as any[];
    let subtotalOrig = 0;

    // ── Pre-fetch de fotos: pdfkit no descarga URLs HTTPS, hay que pasarle Buffer ──
    // Las URLs Cloudinary se bajan en paralelo antes de renderizar la tabla.
    const fotoUrlsUnicas = Array.from(new Set(
      detalles.map(d => d.foto_url).filter(Boolean) as string[]
    ));
    const fotoBuffers = new Map<string, Buffer>();
    await Promise.all(fotoUrlsUnicas.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const ab  = await res.arrayBuffer();
        fotoBuffers.set(url, Buffer.from(ab));
      } catch { /* foto inalcanzable: el PDF sale sin imagen */ }
    }));

    const FOTO_SIZE = 60; // ancho/alto máximo de la foto debajo del subtotal
    const PRECIO_LINE_H = 14;

    detalles.forEach((d, i) => {
      const nro  = String(i + 1).padStart(2, '0');
      const cant = Number(d.cantidad) || 0;
      const pu   = Number(d.precio_unitario) || 0;
      const sub  = cant * pu;
      subtotalOrig += sub;

      const fotoBuf = d.foto_url ? fotoBuffers.get(d.foto_url) : null;

      // Medir alto del bloque texto (descripción)
      doc.font('Helvetica-Bold').fontSize(10);
      const hTitulo = doc.heightOfString(d.descripcion || '-', { width: wDE });
      doc.font('Helvetica').fontSize(9);
      const hSub    = d.subdescripcion
        ? doc.heightOfString(d.subdescripcion, { width: wDE }) + 4 : 0;
      doc.font('Helvetica-BoldOblique').fontSize(9);
      const hNotas  = d.notas ? doc.heightOfString(d.notas, { width: wDE }) + 4 : 0;

      const hTextoCol = hTitulo + hSub + hNotas + 10;
      const hPrecioCol = PRECIO_LINE_H + (fotoBuf ? FOTO_SIZE + 6 : 0);
      const rowH = Math.max(hTextoCol, hPrecioCol, 40);

      ensureSpace(rowH + 6, true);

      // Ítem
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
        .text(nro, cIT, y, { width: wIT });

      // Descripción: título + sub + notas
      let dy = y;
      doc.font('Helvetica-Bold').fontSize(10)
        .text(d.descripcion || '-', cDE, dy, { width: wDE });
      dy += hTitulo + 2;
      if (d.subdescripcion) {
        doc.font('Helvetica').fontSize(9).fillColor('#333')
          .text(d.subdescripcion, cDE, dy, { width: wDE });
        dy += hSub;
      }
      if (d.notas) {
        doc.font('Helvetica-BoldOblique').fontSize(9).fillColor('#000')
          .text(d.notas, cDE, dy, { width: wDE });
      }
      doc.fillColor('#000').font('Helvetica');

      // Celdas numéricas alineadas al top de la fila
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      doc.text('UND.',                      cUN, y, { width: wUN, align: 'center' });
      doc.text(cant.toFixed(2),              cCA, y, { width: wCA, align: 'center' });
      doc.text(pu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                             cPU, y, { width: wPU, align: 'right' });
      doc.text(sub.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                             cST, y, { width: wST, align: 'right' });

      // Foto: debajo del subtotal, centrada en la columna (estilo PDF Excel referencia)
      if (fotoBuf) {
        const fotoX = cST + (wST - FOTO_SIZE) / 2;
        const fotoY = y + PRECIO_LINE_H + 4;
        try {
          doc.image(fotoBuf, fotoX, fotoY, { fit: [FOTO_SIZE, FOTO_SIZE], align: 'center', valign: 'center' });
        } catch { /* imagen corrupta: ignorar */ }
      }

      y += rowH;
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.3).strokeColor('#d1d5db').stroke();
      y += 4;
    });

    // ── Totales (derecha) ───────────────────────────────────────
    y += 6;
    ensureSpace(80);

    const tot = (label: string, value: string, bold = false, pct?: string) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000');
      doc.text(label, cUN, y, { width: (cPU + wPU) - cUN - 20, align: 'right' });
      if (pct) doc.text(pct, cPU - 30, y, { width: 30, align: 'right' });
      doc.text(value, cST, y, { width: wST, align: 'right' });
      y += 14;
    };
    tot('SUB TOTAL', subtotalOrig.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    if (aplicaIGV) {
      const igvOrig = esUSD ? Number(cot.igv) / tc : Number(cot.igv);
      tot('IGV', igvOrig.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), false, '18%');
    }
    doc.moveTo(cUN, y).lineTo(R, y).lineWidth(0.8).strokeColor('#000').stroke(); y += 5;
    const totalOrig = esUSD ? Number(cot.total) / tc : Number(cot.total);
    tot(`Total ${curSym}`, totalOrig.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), true);
    y += 16;

    // ── "SON: ..." ──────────────────────────────────────────────
    ensureSpace(30);
    const letras = numeroALetras(totalOrig);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
      .text(`SON: ${letras} ${curWord}${aplicaIGV ? ' INCLUIDO IGV' : ''}`,
            L, y, { width: pageW, align: 'center' });
    y += 26;

    // ── Condiciones generales ───────────────────────────────────
    ensureSpace(140);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('CONDICIONES GENERALES', L, y); y += 14;

    // Línea simple (sin label:value)
    const condLine = (text: string) => {
      doc.font('Helvetica').fontSize(9.5).fillColor('#000').text(text, L, y, { width: pageW });
      y += doc.heightOfString(text, { width: pageW }) + 3;
    };
    // Línea con label en negrita + valor en normal (x separados para alineamiento perfecto)
    const COND_LBL = 148; // ancho columna label
    const condPar = (label: string, value: any) => {
      if (!value) return;
      const val = String(value);
      const ySnap = y;
      doc.font('Helvetica').fontSize(9.5).fillColor('#000')
        .text(label, L, ySnap, { width: COND_LBL });
      doc.font('Helvetica').fontSize(9.5).fillColor('#000')
        .text(val, L + COND_LBL, ySnap, { width: pageW - COND_LBL });
      y += Math.max(
        doc.heightOfString(label, { width: COND_LBL }),
        doc.heightOfString(val,   { width: pageW - COND_LBL })
      ) + 3;
    };

    // Si un valor tiene 2+ líneas (separadas por \n), renderiza cada línea con bullet "• ".
    const formatMultiline = (value: any): string => {
      const v = String(value || '');
      const lines = v.split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length <= 1) return v;
      return lines.map(l => `• ${l}`).join('\n');
    };

    condLine(`Los precios han sido expresados en ${curWord}`);
    if (cot.precios_incluyen) condPar('Los precios incluyen:', formatMultiline(cot.precios_incluyen));
    condLine('No incluye aquello que no sea explícitamente mencionado en la presente cotización.');
    condPar('Forma de Pago:',        formatMultiline(cot.forma_pago));
    condPar('Validez de la Oferta:', cot.validez_oferta);
    condPar('Plazo de entrega:',     cot.plazo_entrega);
    condPar('Lugar de Entrega de herramientas:', cot.lugar_entrega);
    condPar('Lugar de trabajo de Inspección:',   cot.lugar_trabajo);
    y += 8;

    // Cuenta bancaria (una, según moneda) — desde configuración
    const cuentaLabel = esUSD ? 'Dólares' : 'Soles';
    const cuentaBanco = esUSD ? cfg.cta_usd_banco  : cfg.cta_pen_banco;
    const cuentaNro   = esUSD ? cfg.cta_usd_numero : cfg.cta_pen_numero;
    const cuentaCci   = esUSD ? cfg.cta_usd_cci    : cfg.cta_pen_cci;
    if (cuentaBanco && cuentaNro) {
      doc.font('Helvetica').fontSize(9.5)
        .text(`Cuentas corrientes a nombre de ${cfg.razon_social}:`, L, y); y += 12;
      doc.font('Helvetica-Bold').text(
        `Cta. ${cuentaLabel} Banco ${cuentaBanco} ${cuentaNro}${cuentaCci ? ` / CCI ${cuentaCci}` : ''}`, L, y);
      y += 16;
    }

    doc.font('Helvetica').fontSize(9.5).fillColor('#000')
      .text('Sin otro particular y esperando vernos favorecidos con sus gratas órdenes, nos suscribimos de ustedes. Atentamente,',
        L, y, { width: pageW }); y += 28;

    // ── Firma ───────────────────────────────────────────────────
    ensureSpace(80);
    try { doc.image(meta.logo, L, y, { height: 42 }); } catch {}
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(cfg.firma_nombre, L + 110, y);
    doc.font('Helvetica-Bold').fontSize(10).text(cfg.firma_cargo, L + 110, y + 12);
    if (cfg.firma_telefono) doc.font('Helvetica').fontSize(9).text(`Telf. ${cfg.firma_telefono}`, L + 110, y + 26);
    if (cfg.firma_email) {
      doc.fillColor('#1d4ed8').fontSize(9).text(cfg.firma_email, L + 110, y + 38,
        { link: `mailto:${cfg.firma_email}`, underline: true });
    }
    if (cfg.firma_direccion) doc.fillColor('#000').fontSize(8).text(cfg.firma_direccion, L + 110, y + 50);
    y += 72;

    // Footer última página y cierre
    drawFooter();
    doc.end();
    return done;
  }
}

export default new CotizacionPDFService();

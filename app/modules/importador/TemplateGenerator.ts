/**
 * TemplateGenerator — genera plantillas XLSX con branding Metal Engineers
 * para el importador histórico. Las plantillas tienen:
 *   - Logo y título corporativo
 *   - Headers formateados (negro / blanco / negrita)
 *   - Filas de ejemplo en gris itálico
 *   - Columnas con anchos calibrados
 *   - Hoja "Instrucciones" con descripción de cada campo
 *   - Freeze panes para que los headers siempre estén visibles
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

export type EntidadImportable =
  | 'proveedores' | 'cotizaciones' | 'gastos' | 'compras'
  | 'prestamos_tomados' | 'prestamos_otorgados';

interface ColumnaConfig {
  key: string;
  titulo: string;
  width: number;
  requerido: boolean;
  formato: string;       // tipo o restricción para hoja Instrucciones
  desc: string;          // descripción larga para Instrucciones
  ejemplo1: string | number;
  ejemplo2: string | number;
}

interface TemplateConfig {
  titulo: string;
  subtitulo: string;
  columnas: ColumnaConfig[];
}

const COLOR_PRIMARY = 'FF111111';   // negro
const COLOR_HEADER  = 'FF676767';   // gris primario Metal Engineers
const COLOR_HEADER_TEXT = 'FFFFFFFF';
const COLOR_REQ     = 'FFDC2626';   // rojo para "SÍ" requerido
const COLOR_EJEMPLO_TEXT = 'FF9CA3AF'; // gris claro para ejemplos
const COLOR_INFO_BG = 'FFFFFBEB';   // amarillo suave para banner

const TEMPLATES: Record<EntidadImportable, TemplateConfig> = {
  proveedores: {
    titulo:    'Plantilla — Proveedores',
    subtitulo: 'Maestro de proveedores. Cargá esto antes de importar Compras (las compras los referencian por id_proveedor).',
    columnas: [
      { key: 'nombre',    titulo: 'Nombre / Razón Social *', width: 38, requerido: true,  formato: 'Texto',
        desc: 'Razón social completa (empresa) o nombre y apellido (persona natural).',
        ejemplo1: 'DCC Ingeniería SAC', ejemplo2: 'Juan Pérez Soldador' },
      { key: 'ruc',       titulo: 'RUC (11 dígitos)',        width: 16, requerido: false, formato: 'Numérico 11 dígitos',
        desc: 'Solo para EMPRESA. Vacío si es persona natural.',
        ejemplo1: '20123456789', ejemplo2: '' },
      { key: 'tipo',      titulo: 'Tipo Persona',            width: 14, requerido: false, formato: 'JURIDICO o NATURAL',
        desc: 'JURIDICO = empresa con RUC, NATURAL = persona con DNI.',
        ejemplo1: 'JURIDICO', ejemplo2: 'NATURAL' },
      { key: 'dni',       titulo: 'DNI (8 dígitos)',         width: 12, requerido: false, formato: 'Numérico 8 dígitos',
        desc: 'Solo si tipo = NATURAL.',
        ejemplo1: '', ejemplo2: '12345678' },
      { key: 'telefono',  titulo: 'Teléfono',                width: 14, requerido: false, formato: 'Texto',
        desc: 'Número de contacto principal.',
        ejemplo1: '014567890', ejemplo2: '987654321' },
      { key: 'email',     titulo: 'Email',                   width: 28, requerido: false, formato: 'Email',
        desc: 'Email comercial / facturación.',
        ejemplo1: 'contacto@dcc.pe', ejemplo2: '' },
      { key: 'direccion', titulo: 'Dirección',               width: 40, requerido: false, formato: 'Texto',
        desc: 'Dirección fiscal o de contacto.',
        ejemplo1: 'Av. Los Incas 123 Lima', ejemplo2: '' },
    ],
  },

  cotizaciones: {
    titulo:    'Plantilla — Cotizaciones Históricas',
    subtitulo: 'Cotizaciones que ya están APROBADAS o TERMINADAS (no cargues acá las activas — esas se gestionan desde Comercial).',
    columnas: [
      { key: 'nro_cotizacion', titulo: 'N° Cotización *', width: 18, requerido: true,  formato: 'Texto único',
        desc: 'Numeración libre (ej. "COT 2022-001-MN"). Debe ser única.',
        ejemplo1: 'COT 2022-001-MN', ejemplo2: 'COT 2022-001-ME' },
      { key: 'fecha',          titulo: 'Fecha *',         width: 12, requerido: true,  formato: 'YYYY-MM-DD',
        desc: 'Fecha de emisión en formato ISO.',
        ejemplo1: '2022-03-15', ejemplo2: '2022-05-10' },
      { key: 'marca',          titulo: 'Marca',           width: 16, requerido: false, formato: 'METAL / PERFOTOOLS',
        desc: 'METAL = Metal Engineers (PEN), PERFOTOOLS = Perfotools (USD).',
        ejemplo1: 'METAL', ejemplo2: 'PERFOTOOLS' },
      { key: 'moneda',         titulo: 'Moneda',          width: 10, requerido: false, formato: 'PEN / USD',
        desc: 'PEN o USD. Default PEN.',
        ejemplo1: 'PEN', ejemplo2: 'USD' },
      { key: 'tipo_cambio',    titulo: 'Tipo Cambio',     width: 12, requerido: false, formato: 'Numérico',
        desc: 'Si moneda=USD, el TC del día. PEN siempre 1.',
        ejemplo1: 1, ejemplo2: 3.85 },
      { key: 'cliente',        titulo: 'Cliente *',       width: 30, requerido: true,  formato: 'Texto',
        desc: 'Razón social del cliente.',
        ejemplo1: 'DCC', ejemplo2: 'SAMAYCA' },
      { key: 'cliente_ruc',    titulo: 'RUC Cliente',     width: 14, requerido: false, formato: 'Numérico 11',
        desc: 'RUC del cliente si lo tenés.',
        ejemplo1: '20123456789', ejemplo2: '20987654321' },
      { key: 'proyecto',       titulo: 'Proyecto / Obra', width: 28, requerido: false, formato: 'Texto',
        desc: 'Nombre del proyecto u obra.',
        ejemplo1: 'Obra Toromocho', ejemplo2: 'Las Bambas' },
      { key: 'descripcion_item', titulo: 'Descripción Item', width: 32, requerido: false, formato: 'Texto',
        desc: 'Resumen de lo cotizado (se inserta como única línea de detalle).',
        ejemplo1: 'Herramientas cimentación', ejemplo2: 'Perforadoras' },
      { key: 'subtotal',       titulo: 'Subtotal *',      width: 12, requerido: true,  formato: 'Numérico',
        desc: 'Monto sin IGV.',
        ejemplo1: 10000, ejemplo2: 5000 },
      { key: 'igv',            titulo: 'IGV (18%)',       width: 12, requerido: false, formato: 'Numérico',
        desc: '18% del subtotal. 0 si no aplica.',
        ejemplo1: 1800, ejemplo2: 900 },
      { key: 'total',          titulo: 'Total *',         width: 12, requerido: true,  formato: 'Numérico',
        desc: 'Subtotal + IGV.',
        ejemplo1: 11800, ejemplo2: 5900 },
      { key: 'estado',         titulo: 'Estado',          width: 14, requerido: false, formato: 'APROBADA / TERMINADA',
        desc: 'Estado actual de la cotización.',
        ejemplo1: 'APROBADA', ejemplo2: 'TERMINADA' },
    ],
  },

  gastos: {
    titulo:    'Plantilla — Gastos Históricos',
    subtitulo: 'Gastos generales de oficina y de servicios. La moneda + tipo_cambio convierte automáticamente a PEN para totales.',
    columnas: [
      { key: 'concepto',         titulo: 'Concepto *',           width: 32, requerido: true,  formato: 'Texto',
        desc: 'Qué se pagó.',
        ejemplo1: 'Alquiler oficina marzo 2022', ejemplo2: 'Flete a Toromocho' },
      { key: 'proveedor_nombre', titulo: 'Proveedor',            width: 24, requerido: false, formato: 'Texto',
        desc: 'Nombre del proveedor (texto libre).',
        ejemplo1: 'Inmobiliaria Lima', ejemplo2: 'Olva Courier' },
      { key: 'fecha',            titulo: 'Fecha *',              width: 12, requerido: true,  formato: 'YYYY-MM-DD',
        desc: 'Fecha del gasto.',
        ejemplo1: '2022-03-01', ejemplo2: '2022-03-20' },
      { key: 'moneda',           titulo: 'Moneda',               width: 10, requerido: false, formato: 'PEN / USD',
        desc: 'PEN o USD.',
        ejemplo1: 'PEN', ejemplo2: 'PEN' },
      { key: 'tipo_cambio',      titulo: 'Tipo Cambio',          width: 12, requerido: false, formato: 'Numérico',
        desc: 'Si moneda=USD.',
        ejemplo1: 1, ejemplo2: 1 },
      { key: 'monto_base',       titulo: 'Monto Base *',         width: 14, requerido: true,  formato: 'Numérico',
        desc: 'Monto sin IGV.',
        ejemplo1: 3000, ejemplo2: 800 },
      { key: 'igv_base',         titulo: 'IGV',                  width: 12, requerido: false, formato: 'Numérico',
        desc: '18% del monto si aplica.',
        ejemplo1: 540, ejemplo2: 144 },
      { key: 'total_base',       titulo: 'Total *',              width: 14, requerido: true,  formato: 'Numérico',
        desc: 'Monto + IGV.',
        ejemplo1: 3540, ejemplo2: 944 },
      { key: 'centro_costo',     titulo: 'Centro de Costo',      width: 22, requerido: false, formato: 'Texto',
        desc: 'OFICINA CENTRAL, ALMACEN METAL, o nombre del proyecto.',
        ejemplo1: 'OFICINA CENTRAL', ejemplo2: 'SERVICIO Toromocho' },
      { key: 'tipo_gasto_logistica', titulo: 'Tipo Logística',   width: 16, requerido: false, formato: 'GENERAL / SERVICIO / ALMACEN',
        desc: 'Clasificación logística.',
        ejemplo1: 'GENERAL', ejemplo2: 'SERVICIO' },
      { key: 'id_servicio',      titulo: 'ID Servicio',          width: 12, requerido: false, formato: 'Numérico',
        desc: 'Si es gasto de servicio, el ID del servicio. Vacío si general.',
        ejemplo1: '', ejemplo2: '' },
    ],
  },

  compras: {
    titulo:    'Plantilla — Compras Históricas',
    subtitulo: 'Compras a proveedores. Importante: cargá Proveedores PRIMERO; acá usás id_proveedor (el ID que se generó en ese maestro).',
    columnas: [
      { key: 'nro_factura_proveedor', titulo: 'N° Factura Proveedor', width: 22, requerido: false, formato: 'Texto',
        desc: 'Serie y número de la factura del proveedor.',
        ejemplo1: 'F001-00123', ejemplo2: 'B001-00045' },
      { key: 'id_proveedor',     titulo: 'ID Proveedor *',  width: 14, requerido: true,  formato: 'Numérico',
        desc: 'ID del proveedor en el maestro (ver pestaña Logística → Proveedores).',
        ejemplo1: 1, ejemplo2: 2 },
      { key: 'fecha',            titulo: 'Fecha *',          width: 12, requerido: true,  formato: 'YYYY-MM-DD',
        desc: 'Fecha de la compra.',
        ejemplo1: '2022-04-05', ejemplo2: '2022-04-10' },
      { key: 'moneda',           titulo: 'Moneda',           width: 10, requerido: false, formato: 'PEN / USD',
        desc: 'PEN o USD.',
        ejemplo1: 'PEN', ejemplo2: 'PEN' },
      { key: 'tipo_cambio',      titulo: 'Tipo Cambio',      width: 12, requerido: false, formato: 'Numérico',
        desc: 'Si moneda=USD.',
        ejemplo1: 1, ejemplo2: 1 },
      { key: 'monto_base',       titulo: 'Monto Base *',     width: 14, requerido: true,  formato: 'Numérico',
        desc: 'Monto sin IGV.',
        ejemplo1: 8500, ejemplo2: 450 },
      { key: 'igv_base',         titulo: 'IGV',              width: 12, requerido: false, formato: 'Numérico',
        desc: '18% del monto.',
        ejemplo1: 1530, ejemplo2: 81 },
      { key: 'total_base',       titulo: 'Total *',          width: 14, requerido: true,  formato: 'Numérico',
        desc: 'Monto + IGV.',
        ejemplo1: 10030, ejemplo2: 531 },
      { key: 'centro_costo',     titulo: 'Centro de Costo',  width: 22, requerido: false, formato: 'Texto',
        desc: 'ALMACEN METAL, OFICINA CENTRAL, o nombre proyecto.',
        ejemplo1: 'ALMACEN METAL', ejemplo2: 'OFICINA CENTRAL' },
    ],
  },

  prestamos_tomados: {
    titulo:    'Plantilla — Préstamos Tomados',
    subtitulo: 'Deudas históricas con bancos, socios o familia. Si ya está pagado, poné monto_pagado = monto_total.',
    columnas: [
      { key: 'nro_oc',            titulo: 'N° / Identificador',  width: 18, requerido: false, formato: 'Texto',
        desc: 'Identificador único del préstamo.',
        ejemplo1: 'PREST-BCP-001', ejemplo2: 'PREST-SOCIO-001' },
      { key: 'acreedor',          titulo: 'Acreedor *',          width: 30, requerido: true,  formato: 'Texto',
        desc: 'Nombre del banco, socio o persona que prestó.',
        ejemplo1: 'BCP - Capital trabajo', ejemplo2: 'Carlos M - socio' },
      { key: 'descripcion',       titulo: 'Descripción',         width: 28, requerido: false, formato: 'Texto',
        desc: 'Concepto del préstamo.',
        ejemplo1: 'Préstamo Q1 2022', ejemplo2: 'Capital en USD' },
      { key: 'comentario',        titulo: 'Comentario',          width: 28, requerido: false, formato: 'Texto',
        desc: 'Cronograma, condiciones especiales, notas.',
        ejemplo1: 'Cronograma 12 cuotas', ejemplo2: 'Devolución flexible' },
      { key: 'fecha_emision',     titulo: 'Fecha Emisión *',     width: 14, requerido: true,  formato: 'YYYY-MM-DD',
        desc: 'Cuándo se recibió el dinero.',
        ejemplo1: '2022-01-15', ejemplo2: '2022-06-10' },
      { key: 'fecha_vencimiento', titulo: 'Fecha Vencimiento',   width: 14, requerido: false, formato: 'YYYY-MM-DD',
        desc: 'Cuándo había que pagar.',
        ejemplo1: '2023-01-15', ejemplo2: '2023-06-10' },
      { key: 'moneda',            titulo: 'Moneda',              width: 10, requerido: false, formato: 'PEN / USD',
        desc: 'PEN o USD.',
        ejemplo1: 'PEN', ejemplo2: 'USD' },
      { key: 'tipo_cambio',       titulo: 'Tipo Cambio',         width: 12, requerido: false, formato: 'Numérico',
        desc: 'Si moneda=USD.',
        ejemplo1: 1, ejemplo2: 3.85 },
      { key: 'monto_capital',     titulo: 'Monto Capital *',     width: 14, requerido: true,  formato: 'Numérico',
        desc: 'Capital prestado (sin intereses).',
        ejemplo1: 30000, ejemplo2: 5000 },
      { key: 'tasa_interes',      titulo: 'Tasa Interés (%)',    width: 12, requerido: false, formato: 'Numérico',
        desc: 'Tasa anual %.',
        ejemplo1: 0, ejemplo2: 0 },
      { key: 'monto_interes',     titulo: 'Monto Interés',       width: 14, requerido: false, formato: 'Numérico',
        desc: 'Total de intereses.',
        ejemplo1: 3600, ejemplo2: 0 },
      { key: 'monto_pagado',      titulo: 'Monto Pagado',        width: 14, requerido: false, formato: 'Numérico',
        desc: 'Cuánto ya devolviste. Si está totalmente pagado, monto_pagado = capital + intereses.',
        ejemplo1: 33600, ejemplo2: 2000 },
    ],
  },

  prestamos_otorgados: {
    titulo:    'Plantilla — Préstamos Otorgados',
    subtitulo: 'Lo que prestaste a otros (trabajadores, clientes, socios). monto_pagado = cuánto ya te devolvieron.',
    columnas: [
      { key: 'nro_oc',            titulo: 'N° / Identificador',  width: 18, requerido: false, formato: 'Texto',
        desc: 'Identificador único.',
        ejemplo1: 'ADEL-001', ejemplo2: 'PREST-SAM-001' },
      { key: 'deudor',            titulo: 'Deudor *',            width: 30, requerido: true,  formato: 'Texto',
        desc: 'A quién le prestaste.',
        ejemplo1: 'Juan Pérez - soldador', ejemplo2: 'SAMAYCA - adelanto material' },
      { key: 'descripcion',       titulo: 'Descripción',         width: 28, requerido: false, formato: 'Texto',
        desc: 'Concepto.',
        ejemplo1: 'Adelanto sueldo', ejemplo2: '50kg acero urgencia' },
      { key: 'comentario',        titulo: 'Comentario',          width: 28, requerido: false, formato: 'Texto',
        desc: 'Cómo se devuelve.',
        ejemplo1: 'Se descuenta en recibos', ejemplo2: 'Regulariza en factura' },
      { key: 'fecha_emision',     titulo: 'Fecha Emisión *',     width: 14, requerido: true,  formato: 'YYYY-MM-DD',
        desc: 'Cuándo se entregó.',
        ejemplo1: '2022-05-01', ejemplo2: '2023-08-15' },
      { key: 'fecha_vencimiento', titulo: 'Fecha Vencimiento',   width: 14, requerido: false, formato: 'YYYY-MM-DD',
        desc: 'Cuándo te lo iban a devolver.',
        ejemplo1: '2022-05-31', ejemplo2: '2023-09-15' },
      { key: 'moneda',            titulo: 'Moneda',              width: 10, requerido: false, formato: 'PEN / USD',
        desc: 'PEN o USD.',
        ejemplo1: 'PEN', ejemplo2: 'PEN' },
      { key: 'tipo_cambio',       titulo: 'Tipo Cambio',         width: 12, requerido: false, formato: 'Numérico',
        desc: 'Si moneda=USD.',
        ejemplo1: 1, ejemplo2: 1 },
      { key: 'monto_capital',     titulo: 'Monto Capital *',     width: 14, requerido: true,  formato: 'Numérico',
        desc: 'Cuánto prestaste.',
        ejemplo1: 800, ejemplo2: 3200 },
      { key: 'tasa_interes',      titulo: 'Tasa Interés (%)',    width: 12, requerido: false, formato: 'Numérico',
        desc: 'Si cobrás interés.',
        ejemplo1: 0, ejemplo2: 0 },
      { key: 'monto_interes',     titulo: 'Monto Interés',       width: 14, requerido: false, formato: 'Numérico',
        desc: 'Total de intereses.',
        ejemplo1: 0, ejemplo2: 0 },
      { key: 'monto_pagado',      titulo: 'Monto Pagado',        width: 14, requerido: false, formato: 'Numérico',
        desc: 'Cuánto te devolvieron.',
        ejemplo1: 800, ejemplo2: 3200 },
    ],
  },
};

/**
 * Genera el Buffer XLSX con branding Metal Engineers para una entidad.
 */
export async function generarTemplateXLSX(entidad: EntidadImportable): Promise<Buffer> {
  const cfg = TEMPLATES[entidad];
  if (!cfg) throw new Error(`Entidad no soportada: ${entidad}`);

  const wb = new ExcelJS.Workbook();
  wb.creator   = 'Metal Engineers ERP';
  wb.company   = 'Metal Engineers SAC';
  wb.created   = new Date();
  wb.modified  = new Date();

  // ─── HOJA 1: Datos ───────────────────────────────────────────
  const ws = wb.addWorksheet('Datos', {
    views: [{ state: 'frozen', ySplit: 6 }],
    properties: { defaultRowHeight: 18 },
  });

  // Logo (si el archivo existe)
  try {
    const logoPath = path.join(process.cwd(), 'public', 'img', 'logo-metal.png');
    if (fs.existsSync(logoPath)) {
      const logoId = wb.addImage({ filename: logoPath, extension: 'png' });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 70 } });
    }
  } catch { /* ignorar si no carga el logo */ }

  // Header rows: 1-3 reservadas para logo + título + subtítulo
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 28;
  ws.getRow(3).height = 22;
  ws.getRow(4).height = 8;       // espaciador
  ws.getRow(5).height = 8;       // espaciador

  // Título
  ws.mergeCells(1, 3, 2, cfg.columnas.length);
  const cellTitulo = ws.getCell(1, 3);
  cellTitulo.value = cfg.titulo;
  cellTitulo.font = { size: 18, bold: true, color: { argb: COLOR_PRIMARY } };
  cellTitulo.alignment = { vertical: 'middle' };

  // Subtítulo
  ws.mergeCells(3, 3, 3, cfg.columnas.length);
  const cellSub = ws.getCell(3, 3);
  cellSub.value = cfg.subtitulo;
  cellSub.font = { size: 11, color: { argb: 'FF6B7280' } };
  cellSub.alignment = { vertical: 'middle', wrapText: true };

  // Fila 6: HEADERS
  const headerRow = ws.getRow(6);
  cfg.columnas.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: COLOR_PRIMARY } },
      bottom: { style: 'thin', color: { argb: COLOR_PRIMARY } },
      left: { style: 'thin', color: { argb: COLOR_PRIMARY } },
      right: { style: 'thin', color: { argb: COLOR_PRIMARY } },
    };
  });
  headerRow.height = 36;

  // Anchos de columna
  cfg.columnas.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  // Filas 7-8: ejemplos en gris itálico
  for (let ej = 0; ej < 2; ej++) {
    const fila = ws.getRow(7 + ej);
    cfg.columnas.forEach((c, i) => {
      const cell = fila.getCell(i + 1);
      const valor = ej === 0 ? c.ejemplo1 : c.ejemplo2;
      cell.value = valor === '' ? null : valor;
      cell.font = { italic: true, color: { argb: COLOR_EJEMPLO_TEXT }, size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: false };
      // Formato numérico para columnas obvias
      if (typeof valor === 'number') {
        cell.numFmt = c.key.startsWith('tipo_cambio') ? '#,##0.0000' : '#,##0.00';
      }
    });
    fila.height = 22;
  }

  // Fila 9: instrucción para empezar a tipear
  ws.mergeCells(9, 1, 9, cfg.columnas.length);
  const cellInst = ws.getCell(9, 1);
  cellInst.value = '↓ Empezá a llenar tus datos en la fila 10. Borrá las 2 filas de ejemplo de arriba antes de subir.';
  cellInst.font = { italic: true, size: 10, color: { argb: 'FFB45309' } };
  cellInst.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_INFO_BG } };
  cellInst.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(9).height = 22;

  // ─── HOJA 2: Instrucciones ───────────────────────────────────
  const ws2 = wb.addWorksheet('Instrucciones');
  ws2.columns = [
    { header: 'Columna',      key: 'col',  width: 32 },
    { header: '¿Requerido?',  key: 'req',  width: 14 },
    { header: 'Formato',      key: 'fmt',  width: 24 },
    { header: 'Ejemplo',      key: 'ej',   width: 26 },
    { header: 'Descripción',  key: 'desc', width: 70 },
  ];
  // Estilo del header de Instrucciones
  const hdr2 = ws2.getRow(1);
  hdr2.eachCell(cell => {
    cell.font = { bold: true, color: { argb: COLOR_HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  hdr2.height = 28;

  // Filas con cada columna del template
  cfg.columnas.forEach(c => {
    const row = ws2.addRow({
      col:  c.titulo,
      req:  c.requerido ? 'SÍ' : 'No',
      fmt:  c.formato,
      ej:   String(c.ejemplo1 || ''),
      desc: c.desc,
    });
    if (c.requerido) {
      row.getCell('req').font = { bold: true, color: { argb: COLOR_REQ } };
    }
    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = 22;
  });
  ws2.views = [{ state: 'frozen', ySplit: 1 }];

  // Footer en hoja Instrucciones
  ws2.addRow([]);
  const footerRow = ws2.addRow(['📌 Una vez completado, vovlé al portal y subí este archivo .xlsx (también acepta CSV). Verás un preview con los errores antes de confirmar la importación.']);
  ws2.mergeCells(footerRow.number, 1, footerRow.number, 5);
  footerRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
  footerRow.getCell(1).alignment = { wrapText: true };
  footerRow.height = 36;

  // exceljs devuelve un Buffer compatible con ArrayBuffer; lo convertimos a Buffer Node
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

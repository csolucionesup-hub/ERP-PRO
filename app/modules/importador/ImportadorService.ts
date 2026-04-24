/**
 * ImportadorService — bulk import de data histórica desde CSV.
 *
 * Entidades soportadas:
 *   - proveedores  → maestro de proveedores
 *   - clientes     → maestro de clientes (viven en Cotizaciones como texto, así que
 *                    este importer solo los usa como referencia al crear cotizaciones)
 *   - cotizaciones → cotizaciones históricas (con estado directo APROBADA/TERMINADA)
 *   - gastos       → gastos Logística (General / Servicio)
 *   - compras      → compras (Almacén o General)
 *   - cobranzas    → registros de cobranza vinculadas a cotizaciones
 *
 * Flujo: upload CSV → parsearlo en servidor → validar fila por fila →
 * devolver preview con errores → si el usuario confirma, hacer bulk insert
 * transaccional con rollback si algo falla.
 *
 * Formato CSV: UTF-8, separador coma, primera fila = headers.
 */

import { db } from '../../../database/connection';

export type EntidadImportable = 'proveedores' | 'cotizaciones' | 'gastos' | 'compras' | 'prestamos_tomados' | 'prestamos_otorgados';

export interface ParseResult {
  entidad: EntidadImportable;
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  preview: any[];          // primeras 10 filas normalizadas
  errores: { fila: number; campo: string; mensaje: string }[];
  datosCompletos: any[];   // todas las filas normalizadas (para commit posterior)
}

export interface CommitResult {
  success: boolean;
  insertados: number;
  errores?: string[];
}

/**
 * Parser CSV minimalista — soporta comillas dobles y comas dentro de campos.
 * No dependemos de csv-parser para evitar npm install nuevo.
 */
function parseCSV(texto: string): string[][] {
  const lineas: string[][] = [];
  const filas = texto.replace(/\r\n/g, '\n').split('\n');
  for (const linea of filas) {
    if (!linea.trim()) continue;
    const campos: string[] = [];
    let actual = '';
    let enComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (ch === '"') {
        if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
        else enComillas = !enComillas;
      } else if (ch === ',' && !enComillas) {
        campos.push(actual); actual = '';
      } else {
        actual += ch;
      }
    }
    campos.push(actual);
    lineas.push(campos.map(c => c.trim()));
  }
  return lineas;
}

class ImportadorService {
  /**
   * Parsea y valida sin persistir. Devuelve preview + errores.
   */
  async parsear(entidad: EntidadImportable, csvTexto: string): Promise<ParseResult> {
    const lineas = parseCSV(csvTexto);
    if (lineas.length < 2) {
      return { entidad, totalFilas: 0, filasValidas: 0, filasConError: 0,
        preview: [], errores: [{ fila: 0, campo: '', mensaje: 'CSV vacío o sin headers' }], datosCompletos: [] };
    }
    const [headers, ...filas] = lineas;

    const validadores: Record<EntidadImportable, (h: string[], f: string[], i: number) => { ok: boolean; data?: any; errores?: any[] }> = {
      proveedores:        validarProveedor,
      cotizaciones:       validarCotizacion,
      gastos:             validarGasto,
      compras:            validarCompra,
      prestamos_tomados:  (h, f, i) => validarPrestamo(h, f, i, 'tomado'),
      prestamos_otorgados:(h, f, i) => validarPrestamo(h, f, i, 'otorgado'),
    };
    const validador = validadores[entidad];
    if (!validador) throw new Error(`Entidad no soportada: ${entidad}`);

    const errores: { fila: number; campo: string; mensaje: string }[] = [];
    const datos: any[] = [];

    filas.forEach((f, idx) => {
      const fila = idx + 2; // +1 por 0-indexed, +1 por header
      if (!f.some(c => c !== '')) return; // fila vacía
      const { ok, data, errores: errsFila } = validador(headers, f, fila);
      if (ok && data) datos.push(data);
      if (errsFila) errores.push(...errsFila);
    });

    return {
      entidad,
      totalFilas: filas.filter(f => f.some(c => c !== '')).length,
      filasValidas: datos.length,
      filasConError: errores.length,
      preview: datos.slice(0, 10),
      errores: errores.slice(0, 50),
      datosCompletos: datos,
    };
  }

  /**
   * Persiste en BD los datos ya validados. Transaccional.
   */
  async commit(entidad: EntidadImportable, datos: any[]): Promise<CommitResult> {
    if (!datos.length) return { success: true, insertados: 0 };
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      let insertados = 0;
      for (const d of datos) {
        if (entidad === 'proveedores') {
          await conn.query(
            `INSERT IGNORE INTO Proveedores (nombre, ruc, tipo, dni, telefono, email, direccion)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [d.nombre, d.ruc, d.tipo || 'JURIDICO', d.dni || null, d.telefono || null, d.email || null, d.direccion || null]
          );
        } else if (entidad === 'cotizaciones') {
          const [res]: any = await conn.query(
            `INSERT INTO Cotizaciones (nro_cotizacion, fecha, marca, moneda, tipo_cambio,
              cliente, cliente_ruc, proyecto, subtotal, igv, total, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [d.nro_cotizacion, d.fecha, d.marca || 'METAL_ENGINEERS', d.moneda || 'PEN', d.tipo_cambio || 1,
             d.cliente, d.cliente_ruc || null, d.proyecto || null,
             d.subtotal, d.igv, d.total, d.estado || 'APROBADA']
          );
          // Si hay una sola línea de detalle en el CSV, inserta un detalle genérico
          if (d.descripcion_item) {
            await conn.query(
              `INSERT INTO DetalleCotizacion (id_cotizacion, descripcion, cantidad, precio_unitario, subtotal)
               VALUES (?, ?, 1, ?, ?)`,
              [(res as any).insertId, d.descripcion_item, d.subtotal, d.subtotal]
            );
          }
        } else if (entidad === 'gastos') {
          await conn.query(
            `INSERT INTO Gastos (concepto, proveedor_nombre, fecha, moneda, tipo_cambio,
              monto_base, igv_base, total_base, centro_costo, tipo_gasto_logistica, id_servicio, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADO')`,
            [d.concepto, d.proveedor_nombre, d.fecha, d.moneda || 'PEN', d.tipo_cambio || 1,
             d.monto_base, d.igv_base || 0, d.total_base,
             d.centro_costo || 'OFICINA CENTRAL', d.tipo_gasto_logistica || 'GENERAL', d.id_servicio || null]
          );
        } else if (entidad === 'compras') {
          await conn.query(
            `INSERT INTO Compras (nro_factura_proveedor, id_proveedor, fecha, moneda, tipo_cambio,
              monto_base, igv_base, total_base, centro_costo, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADO')`,
            [d.nro_factura_proveedor || null, d.id_proveedor || null, d.fecha, d.moneda || 'PEN', d.tipo_cambio || 1,
             d.monto_base, d.igv_base || 0, d.total_base, d.centro_costo || 'OFICINA CENTRAL']
          );
        } else if (entidad === 'prestamos_tomados') {
          const capital = Number(d.monto_capital) || 0;
          const interes = Number(d.monto_interes) || 0;
          const total = capital + interes;
          const pagado = Number(d.monto_pagado) || 0;
          const saldo = Math.max(total - pagado, 0);
          const estado = saldo <= 0.1 ? 'PAGADO' : (pagado > 0 ? 'PARCIAL' : 'PENDIENTE');
          await conn.query(
            `INSERT INTO PrestamosTomados
              (nro_oc, acreedor, descripcion, comentario, fecha_emision, fecha_vencimiento,
               moneda, tipo_cambio, monto_capital, tasa_interes, monto_interes,
               monto_total, monto_pagado, saldo, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [d.nro_oc || null, d.acreedor, d.descripcion || '', d.comentario || '',
             d.fecha_emision, d.fecha_vencimiento || null,
             d.moneda || 'PEN', d.tipo_cambio || 1,
             capital, Number(d.tasa_interes) || 0, interes,
             total, pagado, saldo, estado]
          );
        } else if (entidad === 'prestamos_otorgados') {
          const capital = Number(d.monto_capital) || 0;
          const interes = Number(d.monto_interes) || 0;
          const total = capital + interes;
          const cobrado = Number(d.monto_pagado) || 0;
          const saldo = Math.max(total - cobrado, 0);
          const estado = saldo <= 0.1 ? 'COBRADO' : (cobrado > 0 ? 'PARCIAL' : 'PENDIENTE');
          await conn.query(
            `INSERT INTO PrestamosOtorgados
              (nro_oc, deudor, descripcion, comentario, fecha_emision, fecha_vencimiento,
               moneda, tipo_cambio, monto_capital, tasa_interes, monto_interes,
               monto_total, monto_pagado, saldo, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [d.nro_oc || null, d.deudor, d.descripcion || '', d.comentario || '',
             d.fecha_emision, d.fecha_vencimiento || null,
             d.moneda || 'PEN', d.tipo_cambio || 1,
             capital, Number(d.tasa_interes) || 0, interes,
             total, cobrado, saldo, estado]
          );
        }
        insertados++;
      }
      await conn.commit();
      return { success: true, insertados };
    } catch (e) {
      await conn.rollback();
      return { success: false, insertados: 0, errores: [(e as Error).message] };
    } finally {
      conn.release();
    }
  }

  /**
   * Devuelve el template CSV de una entidad (para descargar).
   */
  getTemplate(entidad: EntidadImportable): string {
    const templates: Record<EntidadImportable, string> = {
      proveedores: 'nombre,ruc,tipo,dni,telefono,email,direccion\n' +
                   'DCC Ingeniería SAC,20123456789,JURIDICO,,014567890,contacto@dcc.pe,Av. Los Incas 123 Lima\n' +
                   'Juan Pérez,,NATURAL,12345678,987654321,,\n',
      cotizaciones: 'nro_cotizacion,fecha,marca,moneda,tipo_cambio,cliente,cliente_ruc,proyecto,descripcion_item,subtotal,igv,total,estado\n' +
                    'COT 2022-001-MN,2022-03-15,METAL_ENGINEERS,PEN,1.0000,DCC,20123456789,Obra Toromocho,Herramientas cimentación,10000.00,1800.00,11800.00,APROBADA\n' +
                    'COT 2022-001-ME,2022-05-10,PERFOTOOLS,USD,3.8500,SAMAYCA,20987654321,Proyecto Las Bambas,Perforadoras,5000.00,900.00,5900.00,TERMINADA\n',
      gastos: 'concepto,proveedor_nombre,fecha,moneda,tipo_cambio,monto_base,igv_base,total_base,centro_costo,tipo_gasto_logistica,id_servicio\n' +
              'Alquiler oficina marzo 2022,Inmobiliaria Lima,2022-03-01,PEN,1,3000.00,540.00,3540.00,OFICINA CENTRAL,GENERAL,\n' +
              'Flete a Toromocho,Olva Courier,2022-03-20,PEN,1,800.00,144.00,944.00,SERVICIO,SERVICIO,\n',
      compras: 'nro_factura_proveedor,id_proveedor,fecha,moneda,tipo_cambio,monto_base,igv_base,total_base,centro_costo\n' +
               'F001-00123,1,2022-04-05,PEN,1,8500.00,1530.00,10030.00,ALMACEN METAL\n' +
               'B001-00045,2,2022-04-10,PEN,1,450.00,81.00,531.00,OFICINA CENTRAL\n',
      prestamos_tomados:
              'nro_oc,acreedor,descripcion,comentario,fecha_emision,fecha_vencimiento,moneda,tipo_cambio,monto_capital,tasa_interes,monto_interes,monto_pagado\n' +
              'PREST-BCP-001,BCP - Capital trabajo,Pr\u00e9stamo Q1 2022,Cronograma 12 cuotas,2022-01-15,2023-01-15,PEN,1,30000.00,0,3600.00,33600.00\n' +
              'PREST-SOCIO-001,Carlos M - socio,Capital en USD,Devoluci\u00f3n flexible,2022-06-10,2023-06-10,USD,3.8500,5000.00,0,0,2000.00\n',
      prestamos_otorgados:
              'nro_oc,deudor,descripcion,comentario,fecha_emision,fecha_vencimiento,moneda,tipo_cambio,monto_capital,tasa_interes,monto_interes,monto_pagado\n' +
              'ADEL-001,Juan P\u00e9rez - soldador,Adelanto sueldo,Se descuenta en recibos,2022-05-01,2022-05-31,PEN,1,800.00,0,0,800.00\n' +
              'PREST-SAM-001,SAMAYCA - adelanto material,50kg acero urgencia,Regulariza en factura,2023-08-15,2023-09-15,PEN,1,3200.00,0,0,3200.00\n',
    };
    return templates[entidad] || '';
  }
}

// ──────── Validadores por entidad ────────

function findIndex(headers: string[], nombre: string): number {
  return headers.findIndex(h => h.toLowerCase().trim() === nombre.toLowerCase());
}

function validarProveedor(headers: string[], fila: string[], nroFila: number) {
  const errores: any[] = [];
  const nombre = fila[findIndex(headers, 'nombre')];
  if (!nombre || nombre.length < 2) errores.push({ fila: nroFila, campo: 'nombre', mensaje: 'nombre requerido' });
  return errores.length ? { ok: false, errores } : {
    ok: true,
    data: {
      nombre,
      ruc: fila[findIndex(headers, 'ruc')] || null,
      tipo: fila[findIndex(headers, 'tipo')] || 'JURIDICO',
      dni: fila[findIndex(headers, 'dni')] || null,
      telefono: fila[findIndex(headers, 'telefono')] || null,
      email: fila[findIndex(headers, 'email')] || null,
      direccion: fila[findIndex(headers, 'direccion')] || null,
    },
  };
}

function validarCotizacion(headers: string[], fila: string[], nroFila: number) {
  const errores: any[] = [];
  const nro = fila[findIndex(headers, 'nro_cotizacion')];
  const fecha = fila[findIndex(headers, 'fecha')];
  const cliente = fila[findIndex(headers, 'cliente')];
  const total = parseFloat(fila[findIndex(headers, 'total')] || '0');
  if (!nro) errores.push({ fila: nroFila, campo: 'nro_cotizacion', mensaje: 'requerido' });
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push({ fila: nroFila, campo: 'fecha', mensaje: 'formato YYYY-MM-DD requerido' });
  if (!cliente) errores.push({ fila: nroFila, campo: 'cliente', mensaje: 'requerido' });
  if (isNaN(total) || total <= 0) errores.push({ fila: nroFila, campo: 'total', mensaje: 'total numérico > 0 requerido' });
  return errores.length ? { ok: false, errores } : {
    ok: true,
    data: {
      nro_cotizacion: nro,
      fecha,
      marca: fila[findIndex(headers, 'marca')] || 'METAL_ENGINEERS',
      moneda: fila[findIndex(headers, 'moneda')] || 'PEN',
      tipo_cambio: parseFloat(fila[findIndex(headers, 'tipo_cambio')] || '1'),
      cliente,
      cliente_ruc: fila[findIndex(headers, 'cliente_ruc')] || null,
      proyecto: fila[findIndex(headers, 'proyecto')] || null,
      descripcion_item: fila[findIndex(headers, 'descripcion_item')] || null,
      subtotal: parseFloat(fila[findIndex(headers, 'subtotal')] || '0'),
      igv: parseFloat(fila[findIndex(headers, 'igv')] || '0'),
      total,
      estado: fila[findIndex(headers, 'estado')] || 'APROBADA',
    },
  };
}

function validarGasto(headers: string[], fila: string[], nroFila: number) {
  const errores: any[] = [];
  const concepto = fila[findIndex(headers, 'concepto')];
  const fecha = fila[findIndex(headers, 'fecha')];
  const montoBase = parseFloat(fila[findIndex(headers, 'monto_base')] || '0');
  if (!concepto) errores.push({ fila: nroFila, campo: 'concepto', mensaje: 'requerido' });
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push({ fila: nroFila, campo: 'fecha', mensaje: 'formato YYYY-MM-DD' });
  if (isNaN(montoBase) || montoBase <= 0) errores.push({ fila: nroFila, campo: 'monto_base', mensaje: '> 0 requerido' });
  return errores.length ? { ok: false, errores } : {
    ok: true,
    data: {
      concepto,
      proveedor_nombre: fila[findIndex(headers, 'proveedor_nombre')] || 'Sin nombre',
      fecha,
      moneda: fila[findIndex(headers, 'moneda')] || 'PEN',
      tipo_cambio: parseFloat(fila[findIndex(headers, 'tipo_cambio')] || '1'),
      monto_base: montoBase,
      igv_base: parseFloat(fila[findIndex(headers, 'igv_base')] || '0'),
      total_base: parseFloat(fila[findIndex(headers, 'total_base')] || String(montoBase)),
      centro_costo: fila[findIndex(headers, 'centro_costo')] || 'OFICINA CENTRAL',
      tipo_gasto_logistica: fila[findIndex(headers, 'tipo_gasto_logistica')] || 'GENERAL',
      id_servicio: fila[findIndex(headers, 'id_servicio')] ? parseInt(fila[findIndex(headers, 'id_servicio')], 10) : null,
    },
  };
}

function validarPrestamo(headers: string[], fila: string[], nroFila: number, tipo: 'tomado' | 'otorgado') {
  const errores: any[] = [];
  const contraparteCampo = tipo === 'tomado' ? 'acreedor' : 'deudor';
  const contraparte = fila[findIndex(headers, contraparteCampo)];
  const fechaEmision = fila[findIndex(headers, 'fecha_emision')];
  const capital = parseFloat(fila[findIndex(headers, 'monto_capital')] || '0');
  const moneda = (fila[findIndex(headers, 'moneda')] || 'PEN').toUpperCase();

  if (!contraparte) errores.push({ fila: nroFila, campo: contraparteCampo, mensaje: 'requerido' });
  if (!fechaEmision || !/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) errores.push({ fila: nroFila, campo: 'fecha_emision', mensaje: 'formato YYYY-MM-DD requerido' });
  if (isNaN(capital) || capital <= 0) errores.push({ fila: nroFila, campo: 'monto_capital', mensaje: 'capital > 0 requerido' });
  if (!['PEN', 'USD'].includes(moneda)) errores.push({ fila: nroFila, campo: 'moneda', mensaje: 'debe ser PEN o USD' });

  return errores.length ? { ok: false, errores } : {
    ok: true,
    data: {
      nro_oc: fila[findIndex(headers, 'nro_oc')] || null,
      [contraparteCampo]: contraparte,
      descripcion: fila[findIndex(headers, 'descripcion')] || null,
      comentario: fila[findIndex(headers, 'comentario')] || null,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fila[findIndex(headers, 'fecha_vencimiento')] || null,
      moneda,
      tipo_cambio: parseFloat(fila[findIndex(headers, 'tipo_cambio')] || '1') || 1,
      monto_capital: capital,
      tasa_interes: parseFloat(fila[findIndex(headers, 'tasa_interes')] || '0') || 0,
      monto_interes: parseFloat(fila[findIndex(headers, 'monto_interes')] || '0') || 0,
      monto_pagado: parseFloat(fila[findIndex(headers, 'monto_pagado')] || '0') || 0,
    },
  };
}

function validarCompra(headers: string[], fila: string[], nroFila: number) {
  const errores: any[] = [];
  const fecha = fila[findIndex(headers, 'fecha')];
  const montoBase = parseFloat(fila[findIndex(headers, 'monto_base')] || '0');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push({ fila: nroFila, campo: 'fecha', mensaje: 'formato YYYY-MM-DD' });
  if (isNaN(montoBase) || montoBase <= 0) errores.push({ fila: nroFila, campo: 'monto_base', mensaje: '> 0 requerido' });
  return errores.length ? { ok: false, errores } : {
    ok: true,
    data: {
      nro_factura_proveedor: fila[findIndex(headers, 'nro_factura_proveedor')] || null,
      id_proveedor: fila[findIndex(headers, 'id_proveedor')] ? parseInt(fila[findIndex(headers, 'id_proveedor')], 10) : null,
      fecha,
      moneda: fila[findIndex(headers, 'moneda')] || 'PEN',
      tipo_cambio: parseFloat(fila[findIndex(headers, 'tipo_cambio')] || '1'),
      monto_base: montoBase,
      igv_base: parseFloat(fila[findIndex(headers, 'igv_base')] || '0'),
      total_base: parseFloat(fila[findIndex(headers, 'total_base')] || String(montoBase)),
      centro_costo: fila[findIndex(headers, 'centro_costo')] || 'OFICINA CENTRAL',
    },
  };
}

export default new ImportadorService();

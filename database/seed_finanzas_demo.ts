/**
 * Seed Finanzas Demo — crea 6 cotizaciones APROBADAS (3 PEN + 3 USD)
 * con distintos estados financieros para probar el flujo completo.
 *
 * Escenarios:
 *   METAL (PEN):
 *     1. PENDIENTE_DEPOSITO        — recién aprobada, nada cobrado
 *     2. BANCO_OK_DETRACCION_PEND. — ya depositó el neto, falta detracción en BN
 *     3. FONDEADA_TOTAL            — todo cobrado (banco + detracción)
 *   PERFOTOOLS (USD):
 *     4. PENDIENTE_DEPOSITO        — recién aprobada
 *     5. BANCO_PARCIAL             — pagó una parte, falta el resto
 *     6. SIN_DETRACCION_FONDEADA   — sin detracción, pagado completo
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

interface Item {
  descripcion: string;
  subdescripcion?: string;
  unidad: string;
  cantidad: number;
  precio: number;
}

interface Escenario {
  marca: 'METAL' | 'PERFOTOOLS';
  cliente: string;
  atencion: string;
  proyecto: string;
  telefono: string;
  correo: string;
  items: Item[];
  detraccion_pct: number;        // 0 si no aplica
  fechaOffset: number;           // días atrás desde hoy
  // Cobranzas a generar (para forzar estado financiero)
  cobranzas: Array<{
    tipo: 'DEPOSITO_BANCO' | 'DETRACCION_BN';
    monto: number;                // si viene como fracción <=1 se interpreta como %
    banco?: string;
    nro_operacion?: string;
    diasDespues: number;
  }>;
}

const HOY = new Date();
const fecha = (offset: number) => {
  const d = new Date(HOY);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const ESCENARIOS: Escenario[] = [
  // ═══ METAL (PEN) ═══════════════════════════════════════════
  {
    marca: 'METAL',
    cliente: 'MINERA VOLCAN S.A.',
    atencion: 'Ing. Luis Paredes',
    proyecto: 'Reparación de bombas hidráulicas planta Cerro de Pasco',
    telefono: '987-654-321',
    correo: 'luis.paredes@volcan.com.pe',
    items: [
      { descripcion: 'Rebobinado de motor eléctrico 150 HP', unidad: 'UND', cantidad: 2, precio: 3800 },
      { descripcion: 'Alineación láser de ejes', unidad: 'SERV', cantidad: 1, precio: 1450 },
      { descripcion: 'Cambio de rodamientos SKF', unidad: 'UND', cantidad: 4, precio: 380 },
    ],
    detraccion_pct: 12,
    fechaOffset: -3,
    cobranzas: [], // PENDIENTE_DEPOSITO
  },
  {
    marca: 'METAL',
    cliente: 'SOUTHERN PERU COPPER',
    atencion: 'Sra. Mariana Loayza',
    proyecto: 'Mantenimiento preventivo compresores de aire',
    telefono: '999-112-233',
    correo: 'mloayza@southernperu.com',
    items: [
      { descripcion: 'Overhaul compresor Atlas Copco GA-75', subdescripcion: 'Incluye repuestos originales', unidad: 'UND', cantidad: 1, precio: 18500 },
      { descripcion: 'Kit de filtros y lubricantes', unidad: 'KIT', cantidad: 2, precio: 850 },
    ],
    detraccion_pct: 12,
    fechaOffset: -15,
    cobranzas: [
      // Ya pagó el neto al banco, falta detracción
      { tipo: 'DEPOSITO_BANCO', monto: 1.0 /* % del esperado_banco */, banco: 'BCP', nro_operacion: 'OP-778841', diasDespues: 7 },
    ],
  },
  {
    marca: 'METAL',
    cliente: 'YURA S.A.',
    atencion: 'Ing. Carlos Benavides',
    proyecto: 'Reparación integral de molino de bolas',
    telefono: '954-887-221',
    correo: 'cbenavides@yura.com.pe',
    items: [
      { descripcion: 'Reparación de eje principal', unidad: 'SERV', cantidad: 1, precio: 22000 },
      { descripcion: 'Fabricación de forros internos', unidad: 'UND', cantidad: 6, precio: 1200 },
      { descripcion: 'Servicio de torno CNC', unidad: 'HR', cantidad: 18, precio: 180 },
    ],
    detraccion_pct: 12,
    fechaOffset: -30,
    cobranzas: [
      // Completamente cobrada
      { tipo: 'DEPOSITO_BANCO', monto: 1.0, banco: 'BBVA', nro_operacion: 'OP-990012', diasDespues: 5 },
      { tipo: 'DETRACCION_BN',  monto: 1.0, banco: 'BN',   nro_operacion: 'BN-447711', diasDespues: 18 },
    ],
  },

  // ═══ PERFOTOOLS (USD) ══════════════════════════════════════
  {
    marca: 'PERFOTOOLS',
    cliente: 'ANGLO AMERICAN QUELLAVECO',
    atencion: 'Mr. Peter Hammond',
    proyecto: 'Supply of drilling tools — Q2 batch',
    telefono: '998-332-110',
    correo: 'peter.hammond@angloamerican.com',
    items: [
      { descripcion: 'Tricone bit IADC-437 12¼"', unidad: 'UND', cantidad: 3, precio: 2800 },
      { descripcion: 'PDC drag bit 8½"', unidad: 'UND', cantidad: 2, precio: 4100 },
      { descripcion: 'Drill rod 4½" API IF (9m)', unidad: 'UND', cantidad: 10, precio: 685 },
    ],
    detraccion_pct: 0, // exportación / USD → no aplica
    fechaOffset: -2,
    cobranzas: [],  // PENDIENTE_DEPOSITO
  },
  {
    marca: 'PERFOTOOLS',
    cliente: 'FREEPORT-MCMORAN',
    atencion: 'Ms. Jennifer Collins',
    proyecto: 'Wear parts — emergency replacement',
    telefono: '987-554-021',
    correo: 'jcollins@fcx.com',
    items: [
      { descripcion: 'Hardened steel bushings', unidad: 'UND', cantidad: 20, precio: 95 },
      { descripcion: 'Tungsten carbide inserts', unidad: 'SET', cantidad: 8, precio: 340 },
      { descripcion: 'Custom machining service', unidad: 'HR', cantidad: 12, precio: 75 },
    ],
    detraccion_pct: 0,
    fechaOffset: -10,
    cobranzas: [
      // Pagó parcialmente (40%)
      { tipo: 'DEPOSITO_BANCO', monto: 0.4, banco: 'Interbank', nro_operacion: 'OP-IB-3351', diasDespues: 4 },
    ],
  },
  {
    marca: 'PERFOTOOLS',
    cliente: 'MINERA LAS BAMBAS',
    atencion: 'Ing. Rodrigo Santillán',
    proyecto: 'Specialized perforation equipment',
    telefono: '976-223-881',
    correo: 'rsantillan@lasbambas.com',
    items: [
      { descripcion: 'DTH hammer 6" COP-64', unidad: 'UND', cantidad: 2, precio: 3850 },
      { descripcion: 'Button bits 6" retrac', unidad: 'UND', cantidad: 5, precio: 420 },
    ],
    detraccion_pct: 0,
    fechaOffset: -22,
    cobranzas: [
      // Cobrada completa
      { tipo: 'DEPOSITO_BANCO', monto: 1.0, banco: 'BCP USD', nro_operacion: 'OP-USD-7788', diasDespues: 8 },
    ],
  },
];

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'erp_pro',
  });

  console.log(`\n🌱 Sembrando 6 cotizaciones demo en ${process.env.DB_NAME || 'erp_pro'}\n`);

  // Contadores por marca para generar nro_cotizacion
  const year = HOY.getFullYear();
  const counters: Record<string, number> = { METAL: 0, PERFOTOOLS: 0 };

  // Tomar el max actual (por si se corre sin reset)
  for (const marca of ['METAL', 'PERFOTOOLS']) {
    const [r]: any = await conn.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(nro_cotizacion,'-',2),'-',-1) AS UNSIGNED)) AS n
         FROM cotizaciones WHERE marca = ?`, [marca]
    );
    counters[marca] = Number(r[0].n) || 0;
  }

  const tipoCambio = 3.75;

  for (const esc of ESCENARIOS) {
    counters[esc.marca]++;
    const sufijo = esc.marca === 'METAL' ? 'MN' : 'ME';
    const nro = `COT ${year}-${String(counters[esc.marca]).padStart(3, '0')}-${sufijo}`;

    // Calcular totales
    const subtotal = esc.items.reduce((s, it) => s + it.cantidad * it.precio, 0);
    const igv      = +(subtotal * 0.18).toFixed(2);
    const total    = +(subtotal + igv).toFixed(2);
    const montoDet = +(total * esc.detraccion_pct / 100).toFixed(2);
    const fechaCot = fecha(esc.fechaOffset);

    const [ins]: any = await conn.query(`
      INSERT INTO cotizaciones (
        nro_cotizacion, marca, fecha, cliente, atencion, telefono, correo, proyecto,
        estado, estado_trabajo, moneda, tipo_cambio,
        subtotal, igv, detraccion_porcentaje, monto_detraccion, total,
        forma_pago, validez_oferta, plazo_entrega, lugar_entrega,
        estado_financiero, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APROBADA', 'EN_EJECUCION', ?, ?,
                ?, ?, ?, ?, ?, '50% adelanto / 50% entrega', '30 días', '15 días hábiles', 'Planta cliente',
                'PENDIENTE_DEPOSITO', ?, ?)
    `, [
      nro, esc.marca, fechaCot, esc.cliente, esc.atencion, esc.telefono, esc.correo, esc.proyecto,
      esc.marca === 'METAL' ? 'PEN' : 'USD',
      esc.marca === 'METAL' ? 1 : tipoCambio,
      subtotal, igv, esc.detraccion_pct, montoDet, total,
      fechaCot + ' 09:00:00', fechaCot + ' 09:00:00',
    ]);
    const idCot = ins.insertId;

    for (const it of esc.items) {
      await conn.query(`
        INSERT INTO detallecotizacion (id_cotizacion, descripcion, subdescripcion, unidad, cantidad, precio_unitario)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [idCot, it.descripcion, it.subdescripcion || null, it.unidad, it.cantidad, it.precio]);
    }

    // Generar cobranzas
    const esperadoBanco = +(total - montoDet).toFixed(2);
    for (const cb of esc.cobranzas) {
      let monto: number;
      if (cb.tipo === 'DEPOSITO_BANCO') {
        monto = cb.monto <= 1 ? +(esperadoBanco * cb.monto).toFixed(2) : cb.monto;
      } else {
        monto = cb.monto <= 1 ? +(montoDet * cb.monto).toFixed(2) : cb.monto;
      }
      const fechaMov = fecha(esc.fechaOffset + cb.diasDespues);
      await conn.query(`
        INSERT INTO cobranzascotizacion
          (id_cotizacion, tipo, fecha_movimiento, banco, nro_operacion, monto, moneda, tipo_cambio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        idCot, cb.tipo, fechaMov, cb.banco || null, cb.nro_operacion || null,
        monto, esc.marca === 'METAL' ? 'PEN' : 'USD',
        esc.marca === 'METAL' ? 1 : tipoCambio,
      ]);
    }

    // Recalcular estado con base en cobranzas
    const [aggRows]: any = await conn.query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo='DEPOSITO_BANCO' THEN monto END),0) AS banco,
        COALESCE(SUM(CASE WHEN tipo='DETRACCION_BN'  THEN monto END),0) AS det
      FROM cobranzascotizacion WHERE id_cotizacion = ?
    `, [idCot]);
    const banco = Number(aggRows[0].banco) || 0;
    const det   = Number(aggRows[0].det) || 0;
    const aplicaDet = montoDet > 0;
    const bancoCompleto = banco + 0.01 >= esperadoBanco;
    const detCompleto = !aplicaDet || det + 0.01 >= montoDet;

    let estado = 'PENDIENTE_DEPOSITO';
    if (banco === 0 && det === 0) estado = 'PENDIENTE_DEPOSITO';
    else if (bancoCompleto && detCompleto) estado = aplicaDet ? 'FONDEADA_TOTAL' : 'SIN_DETRACCION_FONDEADA';
    else if (bancoCompleto && !detCompleto) estado = 'BANCO_OK_DETRACCION_PENDIENTE';
    else estado = 'BANCO_PARCIAL';

    const fechaFond = (estado === 'FONDEADA_TOTAL' || estado === 'SIN_DETRACCION_FONDEADA')
      ? fecha(esc.fechaOffset + 15) + ' 10:00:00'
      : null;

    await conn.query(`
      UPDATE cotizaciones
         SET monto_cobrado_banco = ?, monto_cobrado_detraccion = ?,
             estado_financiero = ?, fecha_aprobacion_finanzas = ?
       WHERE id_cotizacion = ?
    `, [banco, det, estado, fechaFond, idCot]);

    const moneda = esc.marca === 'METAL' ? 'S/' : 'US$';
    console.log(`  ✓ ${nro.padEnd(24)} ${esc.cliente.padEnd(30)} ${moneda} ${total.toFixed(2).padStart(10)} → ${estado}`);
  }

  await conn.end();
  console.log(`\n✅ 6 cotizaciones sembradas. Entra a Finanzas y revisa cada bandeja.\n`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });

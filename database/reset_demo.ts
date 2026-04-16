/**
 * Reset Demo — borra TODA la data transaccional y maestros de prueba
 * para empezar de cero. NO toca esquema ni migraciones.
 *
 * Mantiene:
 *   - Usuarios (login sigue funcionando)
 *   - UsuarioModulos
 *   - ConfiguracionMarca
 *   - TipoCambio (histórico de TC)
 *   - _migrations
 *
 * Borra todo lo demás y resetea AUTO_INCREMENT a 1.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const KEEP = new Set([
  '_migrations',
  'usuarios',
  'usuariomodulos',
  'configuracionmarca',
  'tipocambio',
]);

// Orden de borrado: hijas → padres (para no pelear con FKs)
const WIPE_ORDER = [
  // Cobranzas y movimientos
  'cobranzascotizacion',
  'gastobancario',
  'movimientobancario',
  'pagosimpuestos',
  'detracciones',
  'transacciones',

  // Cotizaciones
  'detallecotizacion',
  'cotizaciones',

  // Compras
  'detallecompra',
  'compras',

  // Servicios
  'costosservicio',
  'servicios',

  // Gastos
  'gastos',

  // Préstamos
  'prestamostomados',
  'prestamosotorgados',

  // Inventario
  'movimientosinventario',
  'inventario',

  // Maestros de prueba
  'proveedores',
];

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'erp_pro',
    multipleStatements: true,
  });

  console.log(`\n🔄 Reset Demo → ${process.env.DB_NAME || 'erp_pro'}@${process.env.DB_HOST}\n`);

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const t of WIPE_ORDER) {
    if (KEEP.has(t)) continue;
    try {
      const [r]: any = await conn.query(`SELECT COUNT(*) AS n FROM ${t}`);
      const n = r[0].n;
      await conn.query(`TRUNCATE TABLE ${t}`);
      console.log(`  ✓ ${t.padEnd(30)} ${n} filas borradas`);
    } catch (e: any) {
      console.log(`  ⚠ ${t.padEnd(30)} ${e.message}`);
    }
  }

  // Reset saldos de cuentas (no borramos el catálogo)
  const [rc]: any = await conn.query('UPDATE cuentas SET saldo_actual = 0');
  console.log(`\n  ✓ cuentas                      saldo → 0 (${rc.affectedRows} cuentas preservadas)`);

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // Verificar preservados
  const [[u]]: any = await conn.query('SELECT COUNT(*) AS n FROM usuarios');
  const [[cm]]: any = await conn.query('SELECT COUNT(*) AS n FROM configuracionmarca');
  const [[cu]]: any = await conn.query('SELECT COUNT(*) AS n FROM cuentas');

  console.log(`\n📦 Preservado:`);
  console.log(`   Usuarios:           ${u.n}`);
  console.log(`   ConfiguracionMarca: ${cm.n}`);
  console.log(`   Cuentas (catálogo): ${cu.n}`);

  await conn.end();
  console.log(`\n✅ Reset completo. Login y configuración intactos. Todo lo demás en blanco.\n`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });

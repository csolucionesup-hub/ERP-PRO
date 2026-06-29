// scripts/test_factura_venta.ts — unit test de helpers puros (sin BD)
// Correr: npx ts-node scripts/test_factura_venta.ts
import { parseNroFactura, calcularCuadre, esPrimeraFactura } from '../app/modules/facturacion/facturaVentaHelpers';

let fallos = 0;
function eq(actual: any, esperado: any, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(esperado);
  if (a !== e) { console.error(`✗ ${msg}\n   esperado ${e}\n   obtuvo   ${a}`); fallos++; }
  else console.log(`✓ ${msg}`);
}

eq(parseNroFactura('F001-1234'), { serie: 'F001', numero: 1234 }, 'parse F001-1234');
eq(parseNroFactura('E001-00000045'), { serie: 'E001', numero: 45 }, 'parse con ceros');
eq(parseNroFactura('SIN-GUION-RARO'), { serie: 'SIN', numero: null }, 'parse no numerico -> numero null');
eq(parseNroFactura(''), { serie: '', numero: null }, 'parse vacio');

eq(calcularCuadre([{ total: 100, estado: 'VIGENTE' }, { total: 50, estado: 'ANULADA' }], 100),
   { sumaFacturado: 100, totalCotizacion: 100, diferencia: 0, cuadra: true }, 'cuadre exacto ignora anuladas');
eq(calcularCuadre([{ total: 60, estado: 'VIGENTE' }], 100),
   { sumaFacturado: 60, totalCotizacion: 100, diferencia: 40, cuadra: false }, 'cuadre parcial');

eq(esPrimeraFactura([]), true, 'sin facturas -> primera');
eq(esPrimeraFactura([{ estado: 'ANULADA' }]), true, 'solo anuladas -> primera');
eq(esPrimeraFactura([{ estado: 'VIGENTE' }]), false, 'ya hay vigente -> no primera');

if (fallos > 0) { console.error(`\n${fallos} test(s) fallaron`); process.exit(1); }
console.log('\nTodos los tests pasaron');

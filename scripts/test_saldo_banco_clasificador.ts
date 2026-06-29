// Unit test de clasificarSaldoBanco (función pura, sin BD).
// Correr: npx ts-node scripts/test_saldo_banco_clasificador.ts
import { clasificarSaldoBanco, MovimientoSaldo } from '../app/modules/finance/saldoBancoClasificador';

let pass = 0, fail = 0;
function check(nombre: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${nombre}`); }
  else { fail++; console.log(`  ✗ ${nombre} ${extra}`); }
}

// Helper para construir filas EECC sintéticas.
function eecc(id: number, tipo: 'CARGO' | 'ABONO', monto: number, saldo: number, fecha = '2026-03-10'): MovimientoSaldo {
  return { id_movimiento: id, fuente: 'IMPORT_EECC', tipo, monto, saldo_contable: saldo, fecha_proceso: fecha, fecha };
}

// (a) Cadena completa, dif=0 → CUADRADO.
{
  const r = clasificarSaldoBanco([eecc(1, 'CARGO', 30, 70)], 100, 70);
  check('(a) cadena completa dif=0 → CUADRADO', r.estado === 'CUADRADO', JSON.stringify(r));
}
// (b) Cadena completa, dif≠0 → DIF.
{
  const r = clasificarSaldoBanco([eecc(1, 'CARGO', 30, 70)], 100, 60);
  check('(b) cadena completa dif≠0 → DIF', r.estado === 'DIF' && r.diferencia === 10, JSON.stringify(r));
}
// (c) Cadena fragmentada (2 terminales), dif≠0 → PARCIAL.
{
  const r = clasificarSaldoBanco(
    [eecc(1, 'CARGO', 50, 50, '2026-03-05'), eecc(2, 'CARGO', 20, 200, '2026-03-20')],
    100, 30
  );
  check('(c) cadena fragmentada dif≠0 → PARCIAL', r.estado === 'PARCIAL' && r.diferencia === null, JSON.stringify(r));
}
// (d) Sin filas EECC → SIN_EECC.
{
  const manual: MovimientoSaldo = { id_movimiento: 9, fuente: 'MANUAL', tipo: 'CARGO', monto: 40, saldo_contable: null, fecha_proceso: '2026-03-10', fecha: '2026-03-10' };
  const r = clasificarSaldoBanco([manual], 100, 60);
  check('(d) sin EECC → SIN_EECC', r.estado === 'SIN_EECC' && r.saldo_banco === null, JSON.stringify(r));
}
// (e) 1 terminal pero NO arranca en saldo_inicial → PARCIAL.
{
  const r = clasificarSaldoBanco([eecc(1, 'CARGO', 30, 470)], 100, 460);
  check('(e) 1 terminal pero no arranca en inicial → PARCIAL', r.estado === 'PARCIAL' && r.diferencia === null, JSON.stringify(r));
}
// (f) Array vacío → SIN_EECC.
{
  const r = clasificarSaldoBanco([], 100, 100);
  check('(f) array vacío → SIN_EECC', r.estado === 'SIN_EECC' && r.saldo_banco === null, JSON.stringify(r));
}
// (g) Filas EECC sin saldo_contable usable → PARCIAL.
{
  const sinSaldo: MovimientoSaldo = { id_movimiento: 5, fuente: 'IMPORT_EECC', tipo: 'CARGO', monto: 10, saldo_contable: null, fecha_proceso: '2026-03-10', fecha: '2026-03-10' };
  const r = clasificarSaldoBanco([sinSaldo], 100, 90);
  check('(g) EECC sin saldo_contable usable → PARCIAL', r.estado === 'PARCIAL' && r.saldo_banco === null, JSON.stringify(r));
}

console.log(`\n${pass}/${pass + fail} casos OK`);
if (fail > 0) process.exit(1);

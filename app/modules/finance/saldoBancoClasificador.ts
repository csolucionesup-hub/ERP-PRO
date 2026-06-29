// Clasificador del indicador "Saldo Banco (EECC)" del Libro Bancos.
// Función pura (sin BD/HTTP): dada la lista de movimientos del período, el
// saldo inicial y el saldo final del ERP, decide si el cierre del banco
// (derivado de la cadena de saldo_contable de las filas IMPORT_EECC) cuadra,
// difiere de verdad, es parcial (cadena incompleta por movimientos manuales),
// o no hay EECC importado. Ver spec 2026-06-29.

export type EstadoSaldoBanco = 'CUADRADO' | 'DIF' | 'PARCIAL' | 'SIN_EECC';

export interface MovimientoSaldo {
  fuente: string;                          // 'IMPORT_EECC' | 'MANUAL' | 'AUTO'
  saldo_contable: number | string | null;
  monto: number;
  tipo: string;                            // 'ABONO' | 'CARGO'
  fecha_proceso?: any;
  fecha?: any;
  id_movimiento: number;
}

export interface ResultadoSaldoBanco {
  saldo_banco: number | null;
  diferencia: number | null;
  estado: EstadoSaldoBanco;
}

const TOL_CENTS = 1; // tolerancia 0.01

const cents = (n: number): number => Math.round(Number(n) * 100);

// Normaliza fecha (Date del driver pg, o string) a 'YYYY-MM-DD'. String(Date)
// da "Wed Jan 07..." y ordenar por eso compara por nombre de día (bug histórico
// del Saldo Banco) — por eso normalizamos antes de ordenar la cadena.
const isoDay = (v: any): string => {
  if (!v) return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
};

// "saldo antes" de una fila = su saldo_contable revertido por su importe.
const antesDe = (m: MovimientoSaldo): number =>
  cents(Number(m.saldo_contable) - (m.tipo === 'ABONO' ? Number(m.monto) : -Number(m.monto)));

export function clasificarSaldoBanco(
  movimientos: MovimientoSaldo[],
  saldo_inicial: number,
  saldo_final: number
): ResultadoSaldoBanco {
  const eeccRows = movimientos.filter((m) => m.fuente === 'IMPORT_EECC');
  if (eeccRows.length === 0) {
    return { saldo_banco: null, diferencia: null, estado: 'SIN_EECC' };
  }

  const eeccSaldo = eeccRows.filter((m) => m.saldo_contable != null);
  if (eeccSaldo.length === 0) {
    // Hay EECC pero sin saldo_contable usable: no se puede armar la cadena.
    return { saldo_banco: null, diferencia: null, estado: 'PARCIAL' };
  }

  const antesSet = new Set(eeccSaldo.map(antesDe));
  const saldoSet = new Set(eeccSaldo.map((m) => cents(Number(m.saldo_contable))));

  // Terminal = fila cuyo saldo_contable no es el "antes" de ninguna otra (fin de cadena).
  const terminales = eeccSaldo.filter((m) => !antesSet.has(cents(Number(m.saldo_contable))));
  // Inicio = fila cuyo "antes" no es el saldo_contable de ninguna otra (arranque de cadena).
  const inicios = eeccSaldo.filter((m) => !saldoSet.has(antesDe(m)));

  if (terminales.length === 0) {
    // Cadena en bucle: cierre indeterminable.
    return { saldo_banco: null, diferencia: null, estado: 'PARCIAL' };
  }

  // saldo_banco = terminal de mayor fecha_proceso (desempate por id_movimiento).
  const ordenados = [...terminales].sort((a, b) => {
    const pa = isoDay(a.fecha_proceso || a.fecha);
    const pb = isoDay(b.fecha_proceso || b.fecha);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return Number(a.id_movimiento) - Number(b.id_movimiento);
  });
  const saldo_banco = Number(ordenados[ordenados.length - 1].saldo_contable);
  const dif = +(saldo_banco - saldo_final).toFixed(2);

  // Regla de oro: si los números coinciden, siempre CUADRADO (sin importar manuales).
  if (Math.abs(cents(dif)) <= TOL_CENTS) {
    return { saldo_banco, diferencia: dif, estado: 'CUADRADO' };
  }

  // No cuadra: ¿la cadena es completa (1 inicio que arranca en saldo_inicial, 1 terminal)?
  const cadenaCompleta =
    terminales.length === 1 &&
    inicios.length === 1 &&
    Math.abs(antesDe(inicios[0]) - cents(saldo_inicial)) <= TOL_CENTS;

  if (cadenaCompleta) {
    return { saldo_banco, diferencia: dif, estado: 'DIF' }; // descalce real
  }
  return { saldo_banco, diferencia: null, estado: 'PARCIAL' }; // no exponer Dif engañoso
}

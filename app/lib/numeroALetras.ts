/**
 * numeroALetras — convierte un monto numérico a texto en español.
 * Formato SUNAT: "CIEN CON 00/100 SOLES" o "MIL SEISCIENTOS CON 99/100 DOLARES AMERICANOS"
 *
 * Ejemplos:
 *   numeroALetras(100, 'PEN')     → "CIEN CON 00/100 SOLES"
 *   numeroALetras(1600, 'PEN')    → "MIL SEISCIENTOS CON 00/100 SOLES"
 *   numeroALetras(450.99, 'USD')  → "CUATROCIENTOS CINCUENTA CON 99/100 DOLARES AMERICANOS"
 *   numeroALetras(0, 'PEN')       → "CERO CON 00/100 SOLES"
 */

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES_10_19 = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
];
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
                  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function centenasAletras(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES_10_19[n - 10];
  if (n < 30) {
    const u = n - 20;
    if (u === 0) return 'VEINTE';
    return 'VEINTI' + (UNIDADES[u] === 'UN' ? 'UNO' : UNIDADES[u]).toLowerCase().toUpperCase();
  }
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return DECENAS[d];
    return `${DECENAS[d]} Y ${UNIDADES[u] === 'UN' ? 'UNO' : UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (resto === 0) return CENTENAS[c];
  return `${CENTENAS[c]} ${centenasAletras(resto)}`;
}

function milesAletras(n: number): string {
  if (n === 0) return '';
  if (n < 1000) return centenasAletras(n);
  if (n === 1000) return 'MIL';
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const milesTxt = miles === 1 ? 'MIL' : `${centenasAletras(miles)} MIL`;
  return resto === 0 ? milesTxt : `${milesTxt} ${centenasAletras(resto)}`;
}

function millonesAletras(n: number): string {
  if (n < 1_000_000) return milesAletras(n);
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const millonesTxt = millones === 1 ? 'UN MILLON' : `${milesAletras(millones)} MILLONES`;
  return resto === 0 ? millonesTxt : `${millonesTxt} ${milesAletras(resto)}`;
}

function enteroAletras(entero: number): string {
  if (entero === 0) return 'CERO';
  return millonesAletras(entero).trim();
}

export function numeroALetras(monto: number, moneda: 'PEN' | 'USD' = 'PEN'): string {
  const absMonto = Math.abs(Number(monto) || 0);
  const entero = Math.floor(absMonto);
  const centavos = Math.round((absMonto - entero) * 100);

  const letras = enteroAletras(entero);
  const centStr = String(centavos).padStart(2, '0');
  const monedaTxt = moneda === 'USD' ? 'DOLARES AMERICANOS' : 'SOLES';

  return `${letras} CON ${centStr}/100 ${monedaTxt}`;
}

// Formato alternativo con símbolo y coma
export function formatoMontoPeru(monto: number, moneda: 'PEN' | 'USD' = 'PEN'): string {
  const simbolo = moneda === 'USD' ? '$' : 'S/.';
  const formateado = Number(monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${simbolo} ${formateado}`;
}

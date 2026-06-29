// Helpers PUROS de facturacion de venta — sin acceso a BD, testeables aislados.

export interface NroParsed { serie: string; numero: number | null; }

/** "F001-1234" -> { serie:'F001', numero:1234 }. Si la 2da parte no es numerica, numero=null. */
export function parseNroFactura(nro: string): NroParsed {
  const raw = (nro || '').trim();
  const dash = raw.indexOf('-');
  if (dash === -1) {
    const soloDigitos = raw.replace(/\D/g, '');
    return { serie: raw, numero: soloDigitos ? Number(soloDigitos) : null };
  }
  const serie = raw.slice(0, dash);
  const restoDigitos = raw.slice(dash + 1).replace(/\D/g, '');
  return { serie, numero: restoDigitos ? Number(restoDigitos) : null };
}

export interface CuadreInput { total: number | string; estado: string; }
export interface Cuadre {
  sumaFacturado: number; totalCotizacion: number; diferencia: number; cuadra: boolean;
}

/** Suma facturas VIGENTES vs total de la cotizacion. diferencia >0 = falta facturar. */
export function calcularCuadre(facturas: CuadreInput[], totalCotizacion: number): Cuadre {
  const sumaFacturado = facturas
    .filter(f => f.estado === 'VIGENTE')
    .reduce((acc, f) => acc + Number(f.total || 0), 0);
  const total = Number(totalCotizacion || 0);
  const diferencia = Math.round((total - sumaFacturado) * 100) / 100;
  return { sumaFacturado: Math.round(sumaFacturado * 100) / 100, totalCotizacion: total, diferencia, cuadra: Math.abs(diferencia) < 0.01 };
}

/** True si no hay ninguna factura VIGENTE (la nueva seria la primera -> dispara FACTURADA). */
export function esPrimeraFactura(facturas: { estado: string }[]): boolean {
  return !facturas.some(f => f.estado === 'VIGENTE');
}

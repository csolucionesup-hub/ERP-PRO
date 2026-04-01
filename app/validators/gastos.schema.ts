import { z } from 'zod';

// Helper reutilizable: acepta YYYY-MM-DD o DD/MM/YYYY y normaliza a YYYY-MM-DD
const fechaField = z.preprocess((arg) => {
  if (typeof arg !== 'string') return arg;
  if (arg.includes('/')) {
    const parts = arg.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return arg;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'));

export const gastoCreateSchema = z.object({
  body: z.object({
    nro_oc: z.string().optional(),
    codigo_contador: z.string().optional(),
    concepto: z.string().min(3, 'Concepto Obligatorio'),
    proveedor_nombre: z.string().min(2, 'Acreedor Obligatorio'),
    fecha: fechaField,
    nro_comprobante: z.string().optional(),
    monto_base: z.number().positive('El gasto debe tener un monto base lícito'),
    aplica_igv: z.boolean().default(false),
    tipo_gasto: z.enum(['OPERATIVO', 'SERVICIO']).default('OPERATIVO'),
    id_servicio: z.number().nullable().optional(),
    detraccion_porcentaje: z.number().min(0).max(100).default(0),
    moneda: z.enum(['PEN', 'USD']).default('PEN'),
    tipo_cambio: z.number().positive().default(1)
  })
});

export const gastoPaymentSchema = z.object({
  body: z.object({
    abono: z.number().positive('El abono cajeable debe ser estrictamente positivo')
  })
});

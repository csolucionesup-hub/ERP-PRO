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

export const purchaseCreateSchema = z.object({
  body: z.object({
    id_proveedor: z.number().int().positive(),
    fecha: fechaField,
    nro_comprobante: z.string().min(3, 'Comprobante requerido'),
    moneda: z.enum(['PEN', 'USD']),
    tipo_cambio: z.number().positive().default(1),
    monto_base: z.number().positive(),
    igv_base: z.number().nonnegative(),
    total_base: z.number().positive(),
    estado_pago: z.enum(['PENDIENTE', 'PARCIAL', 'PAGADO']).default('PENDIENTE'),
    detalles: z.array(z.object({
      id_item: z.number().int().positive(),
      cantidad: z.number().positive(),
      precio_unitario: z.number().positive(),
      subtotal: z.number().positive()
    })).min(1, 'La compra debe tener al menos 1 ítem asociado')
  })
});

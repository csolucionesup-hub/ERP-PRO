import { z } from 'zod';

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

export const depositoDetraccionSchema = z.object({
  body: z.object({
    monto_depositado: z.number().positive().optional(),
    fecha_deposito:   fechaField.optional(),
  })
});

export const pagoImpuestoSchema = z.object({
  body: z.object({
    fecha:         fechaField,
    tipo_impuesto: z.string().min(1, 'Tipo de impuesto obligatorio'),
    periodo:       z.string().min(1, 'Periodo obligatorio'),
    monto:         z.number().positive('El monto debe ser positivo'),
    descripcion:   z.string().optional(),
  })
});

export const tipoCambioManualSchema = z.object({
  body: z.object({
    fecha:        fechaField,
    moneda:       z.string().min(1).default('USD'),
    valor_compra: z.number().positive('valor_compra debe ser positivo'),
    valor_venta:  z.number().positive('valor_venta debe ser positivo'),
  })
});

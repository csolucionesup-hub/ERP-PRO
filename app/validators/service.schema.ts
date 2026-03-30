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

export const serviceCreateSchema = z.object({
  body: z.object({
    nombre: z.string().min(3, 'Nombre Obligatorio'),
    cliente: z.string().min(2, 'Cliente Obligatorio'),
    descripcion: z.string().optional(),
    fecha_servicio: fechaField,
    fecha_vencimiento: fechaField.optional(),
    monto_base: z.number().positive('El servicio debe tener un monto base lícito'),
    aplica_igv: z.boolean().default(false),
    detraccion_porcentaje: z.number().min(0).max(100).default(0),
    retencion_porcentaje: z.number().min(0).max(100).default(0)
  })
});

export const servicePaymentSchema = z.object({
  body: z.object({
    monto_pagado_liquido: z.number().positive('El abono cajeable debe ser estrictamente positivo'),
    descripcion: z.string().optional()
  })
});

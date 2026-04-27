import { z } from 'zod';
import { fechaField } from './shared';

/**
 * Schemas de Préstamos (Tomados y Otorgados).
 *
 * Los formularios HTML envían números como strings ("500" vs 500). Usamos
 * `z.coerce.number()` para que Zod convierta automáticamente. Si el frontend
 * ya envía números, también se aceptan sin conversión.
 */

export const prestamoTomadoCreateSchema = z.object({
  body: z.object({
    acreedor:          z.string().min(2, 'Acreedor obligatorio'),
    monto_capital:     z.coerce.number().positive('El capital debe ser positivo'),
    fecha_emision:     fechaField,
    fecha_vencimiento: fechaField.optional(),
    tasa_interes:      z.coerce.number().min(0).default(0),
    monto_interes:     z.coerce.number().min(0).default(0),
    moneda:            z.enum(['PEN', 'USD']).default('PEN'),
    tipo_cambio:       z.coerce.number().positive().default(1),
    nro_oc:            z.string().optional(),
    descripcion:       z.string().optional(),
    comentario:        z.string().optional(),
  })
});

export const prestamoTomadoUpdateSchema = z.object({
  body: z.object({
    acreedor:          z.string().min(2).optional(),
    monto_capital:     z.coerce.number().positive().optional(),
    fecha_emision:     fechaField.optional(),
    fecha_vencimiento: fechaField.optional(),
    tasa_interes:      z.coerce.number().min(0).optional(),
    monto_interes:     z.coerce.number().min(0).optional(),
    moneda:            z.enum(['PEN', 'USD']).optional(),
    tipo_cambio:       z.coerce.number().positive().optional(),
    nro_oc:            z.string().optional(),
    descripcion:       z.string().optional(),
    comentario:        z.string().optional(),
  })
});

export const pagoPrestamSchema = z.object({
  body: z.object({
    monto:       z.coerce.number().positive('El monto de pago debe ser positivo'),
    descripcion: z.string().optional(),
  })
});

export const prestamoOtorgadoCreateSchema = z.object({
  body: z.object({
    deudor:            z.string().min(2, 'Deudor obligatorio'),
    monto_capital:     z.coerce.number().positive('El capital debe ser positivo'),
    fecha_emision:     fechaField,
    fecha_vencimiento: fechaField.optional(),
    tasa_interes:      z.coerce.number().min(0).default(0),
    monto_interes:     z.coerce.number().min(0).default(0),
    moneda:            z.enum(['PEN', 'USD']).default('PEN'),
    tipo_cambio:       z.coerce.number().positive().default(1),
    nro_oc:            z.string().optional(),
    descripcion:       z.string().optional(),
    comentario:        z.string().optional(),
  })
});

export const prestamoOtorgadoUpdateSchema = z.object({
  body: z.object({
    deudor:            z.string().min(2).optional(),
    monto_capital:     z.coerce.number().positive().optional(),
    fecha_emision:     fechaField.optional(),
    fecha_vencimiento: fechaField.optional(),
    tasa_interes:      z.coerce.number().min(0).optional(),
    monto_interes:     z.coerce.number().min(0).optional(),
    moneda:            z.enum(['PEN', 'USD']).optional(),
    tipo_cambio:       z.coerce.number().positive().optional(),
    nro_oc:            z.string().optional(),
    descripcion:       z.string().optional(),
    comentario:        z.string().optional(),
  })
});

export const cobroPrestamoSchema = z.object({
  body: z.object({
    monto:       z.coerce.number().positive('El monto de cobro debe ser positivo'),
    descripcion: z.string().optional(),
  })
});

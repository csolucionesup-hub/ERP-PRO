import { z } from 'zod';
import { fechaField } from './shared';

/**
 * Schemas de Préstamos (Tomados y Otorgados).
 *
 * Los formularios HTML envían números como strings ("500" vs 500). Usamos
 * `z.coerce.number()` para que Zod convierta automáticamente. Si el frontend
 * ya envía números, también se aceptan sin conversión.
 */

// NOTA (.nullish vs .optional): el frontend manda `null` para los campos
// opcionales vacíos (ej. `f.nro_oc.value || null`, `fecha_vencimiento || null`).
// `.optional()` SOLO acepta `undefined`, no `null` → Zod 4 rebotaba con
// "Validación de datos fallida" en TODO préstamo nuevo (el N° se asigna en el
// Service, el campo va siempre null). Usamos `.nullish()` para tolerar ambos.
export const prestamoTomadoCreateSchema = z.object({
  body: z.object({
    acreedor:          z.string().min(2, 'Acreedor obligatorio'),
    monto_capital:     z.coerce.number().positive('El capital debe ser positivo'),
    fecha_emision:     fechaField,
    fecha_vencimiento: fechaField.nullish(),
    tasa_interes:      z.coerce.number().min(0).default(0),
    monto_interes:     z.coerce.number().min(0).default(0),
    moneda:            z.enum(['PEN', 'USD']).default('PEN'),
    tipo_cambio:       z.coerce.number().positive().default(1),
    nro_oc:            z.string().nullish(),
    descripcion:       z.string().nullish(),
    comentario:        z.string().nullish(),
    // Carga histórica: si el préstamo viene con abonos previos. Default 0.
    // Validación adicional contra `total` se hace en createTomado del Service.
    monto_pagado_inicial: z.coerce.number().min(0).default(0).optional(),
  })
});

export const prestamoTomadoUpdateSchema = z.object({
  body: z.object({
    acreedor:          z.string().min(2).optional(),
    monto_capital:     z.coerce.number().positive().optional(),
    fecha_emision:     fechaField.optional(),
    fecha_vencimiento: fechaField.nullish(),
    tasa_interes:      z.coerce.number().min(0).optional(),
    monto_interes:     z.coerce.number().min(0).optional(),
    moneda:            z.enum(['PEN', 'USD']).optional(),
    tipo_cambio:       z.coerce.number().positive().optional(),
    nro_oc:            z.string().nullish(),
    descripcion:       z.string().nullish(),
    comentario:        z.string().nullish(),
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
    fecha_vencimiento: fechaField.nullish(),
    tasa_interes:      z.coerce.number().min(0).default(0),
    monto_interes:     z.coerce.number().min(0).default(0),
    moneda:            z.enum(['PEN', 'USD']).default('PEN'),
    tipo_cambio:       z.coerce.number().positive().default(1),
    nro_oc:            z.string().nullish(),
    descripcion:       z.string().nullish(),
    comentario:        z.string().nullish(),
    // Carga histórica: si el préstamo otorgado ya tuvo cobros previos.
    // El Service acepta tanto `monto_cobrado_inicial` como `monto_pagado_inicial`.
    monto_cobrado_inicial: z.coerce.number().min(0).default(0).optional(),
    monto_pagado_inicial:  z.coerce.number().min(0).default(0).optional(),
  })
});

export const prestamoOtorgadoUpdateSchema = z.object({
  body: z.object({
    deudor:            z.string().min(2).optional(),
    monto_capital:     z.coerce.number().positive().optional(),
    fecha_emision:     fechaField.optional(),
    fecha_vencimiento: fechaField.nullish(),
    tasa_interes:      z.coerce.number().min(0).optional(),
    monto_interes:     z.coerce.number().min(0).optional(),
    moneda:            z.enum(['PEN', 'USD']).optional(),
    tipo_cambio:       z.coerce.number().positive().optional(),
    nro_oc:            z.string().nullish(),
    descripcion:       z.string().nullish(),
    comentario:        z.string().nullish(),
  })
});

export const cobroPrestamoSchema = z.object({
  body: z.object({
    monto:       z.coerce.number().positive('El monto de cobro debe ser positivo'),
    descripcion: z.string().optional(),
  })
});

import { z } from 'zod';
import { fechaField } from './shared';

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
    retencion_porcentaje: z.number().min(0).max(100).default(0),
    moneda: z.enum(['PEN', 'USD']).default('PEN'),
    tipo_cambio: z.number().positive().default(1),
    nro_cotizacion: z.string().optional(),
  })
});

export const servicePaymentSchema = z.object({
  body: z.object({
    monto_pagado_liquido: z.number().positive('El abono cajeable debe ser estrictamente positivo'),
    descripcion: z.string().max(255).optional()
  })
});

export const serviceUpdateSchema = z.object({
  body: z.object({
    nombre:                z.string().min(3).optional(),
    cliente:               z.string().min(2).optional(),
    descripcion:           z.string().optional(),
    fecha_servicio:        fechaField.optional(),
    fecha_vencimiento:     fechaField.optional(),
    monto_base:            z.number().positive().optional(),
    aplica_igv:            z.boolean().optional(),
    detraccion_porcentaje: z.number().min(0).max(100).optional(),
    retencion_porcentaje:  z.number().min(0).max(100).optional(),
    moneda:                z.enum(['PEN', 'USD']).optional(),
    tipo_cambio:           z.number().positive().optional(),
    nro_cotizacion:        z.string().optional(),
  })
});

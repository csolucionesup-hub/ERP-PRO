import { z } from 'zod';
import { fechaField } from './shared';

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
    centro_costo: z.string().min(2, 'Centro de costo obligatorio'),
    tipo_gasto_logistica: z.enum(['GENERAL', 'SERVICIO', 'ALMACEN']).default('GENERAL'),
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

export const gastoUpdateSchema = z.object({
  body: z.object({
    nro_oc:                z.string().optional(),
    codigo_contador:       z.string().optional(),
    concepto:              z.string().min(3).optional(),
    proveedor_nombre:      z.string().min(2).optional(),
    fecha:                 fechaField.optional(),
    nro_comprobante:       z.string().optional(),
    monto_base:            z.number().positive().optional(),
    aplica_igv:            z.boolean().optional(),
    tipo_gasto:            z.enum(['OPERATIVO', 'SERVICIO']).optional(),
    centro_costo:          z.string().min(2).optional(),
    tipo_gasto_logistica:  z.enum(['GENERAL', 'SERVICIO', 'ALMACEN']).optional(),
    id_servicio:           z.number().nullable().optional(),
    detraccion_porcentaje: z.number().min(0).max(100).optional(),
    moneda:                z.enum(['PEN', 'USD']).optional(),
    tipo_cambio:           z.number().positive().optional(),
  })
});

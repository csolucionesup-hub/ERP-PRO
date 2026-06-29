import { z } from 'zod';

// Zod 4: usar `error:` (no `required_error:`).
export const facturaVentaCreateSchema = z.object({
  id_cotizacion: z.coerce.number({ error: 'id_cotizacion requerido' }).int().positive(),
  tipo: z.enum(['FACTURA', 'BOLETA']).default('FACTURA'),
  serie: z.string().min(1, { error: 'serie requerida' }).max(8),
  numero: z.coerce.number({ error: 'numero requerido' }).int().positive(),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'fecha_emision YYYY-MM-DD' }),
  moneda: z.enum(['PEN', 'USD']).default('PEN'),
  tipo_cambio: z.coerce.number().positive().default(1),
  base_imponible: z.coerce.number().min(0).default(0),
  igv: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
  aplica_detraccion: z.coerce.boolean().default(false),
  porcentaje_detraccion: z.coerce.number().min(0).max(100).default(0),
  monto_detraccion: z.coerce.number().min(0).default(0),
  aplica_retencion: z.coerce.boolean().default(false),
  monto_retencion: z.coerce.number().min(0).default(0),
  cliente_razon_social: z.string().max(200).optional(),
  cliente_num_doc: z.string().max(15).optional(),
  observaciones: z.string().max(500).optional(),
});

// Editar: todo opcional salvo que no se puede cambiar la cotización.
export const facturaVentaUpdateSchema = facturaVentaCreateSchema
  .omit({ id_cotizacion: true })
  .partial();

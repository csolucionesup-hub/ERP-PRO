import { z } from 'zod';

// Zod 4: usar `error:` (no `required_error:`).
// Shape `z.object({ body: ... })` porque validateParams parsea { body, query, params }
// y mergea parsed.body en req.body (ver app/validators/validateRequest.ts).
// Booleans en z.boolean() (no z.coerce.boolean — "false" string coercionaria a true).
export const facturaVentaCreateSchema = z.object({
  body: z.object({
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
    aplica_detraccion: z.boolean().default(false),
    porcentaje_detraccion: z.coerce.number().min(0).max(100).default(0),
    monto_detraccion: z.coerce.number().min(0).default(0),
    aplica_retencion: z.boolean().default(false),
    monto_retencion: z.coerce.number().min(0).default(0),
    cliente_razon_social: z.string().max(200).optional(),
    cliente_num_doc: z.string().max(15).optional(),
    observaciones: z.string().max(500).optional(),
  }),
});

// Editar: cada campo OPCIONAL y SIN defaults (a diferencia de create). Si se usaran
// los defaults del create vía .partial(), un edit de un solo campo resetearia los
// demas (tipo->FACTURA, moneda->PEN, montos->0). El service solo aplica las claves
// presentes, asi que aca solo deben llegar las que el usuario realmente envio.
export const facturaVentaUpdateSchema = z.object({
  body: z.object({
    tipo: z.enum(['FACTURA', 'BOLETA']).optional(),
    serie: z.string().min(1).max(8).optional(),
    numero: z.coerce.number().int().positive().optional(),
    fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    moneda: z.enum(['PEN', 'USD']).optional(),
    tipo_cambio: z.coerce.number().positive().optional(),
    base_imponible: z.coerce.number().min(0).optional(),
    igv: z.coerce.number().min(0).optional(),
    total: z.coerce.number().min(0).optional(),
    aplica_detraccion: z.boolean().optional(),
    porcentaje_detraccion: z.coerce.number().min(0).max(100).optional(),
    monto_detraccion: z.coerce.number().min(0).optional(),
    aplica_retencion: z.boolean().optional(),
    monto_retencion: z.coerce.number().min(0).optional(),
    cliente_razon_social: z.string().max(200).optional(),
    cliente_num_doc: z.string().max(15).optional(),
    observaciones: z.string().max(500).optional(),
  }),
});

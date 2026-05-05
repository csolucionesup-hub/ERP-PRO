import { z } from 'zod';

export const inventoryCreateSchema = z.object({
  body: z.object({
    nombre: z.string().min(3, 'Nombre Obligatorio'),
    categoria: z.enum(['Material', 'Consumible', 'Herramienta', 'Equipo', 'EPP']).default('Material'),
    unidad: z.string().default('UND'),
    stock_minimo: z.number().min(0).optional()
  })
});

// Acepta id_cotizacion (nuevo, post-Camino A) o id_servicio (legacy).
// Al menos uno requerido — se valida en el Service.
export const inventoryConsumeSchema = z.object({
  body: z.object({
    id_cotizacion: z.number().int().positive().optional().nullable(),
    id_servicio:   z.number().int().positive().optional().nullable(),
    detalles: z.array(z.object({
      id_item: z.number().int().positive(),
      cantidad: z.number().positive('El volumen consumido debe ser numérico positivo')
    })).min(1, 'El reporte de consumo debe tener al menos 1 Insumo')
  }).refine(d => d.id_cotizacion || d.id_servicio, {
    message: 'Falta destino: indicá id_cotizacion (cotización fondeada) o id_servicio (legacy)',
  })
});

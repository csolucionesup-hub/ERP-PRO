import { z } from 'zod';

export const inventoryCreateSchema = z.object({
  body: z.object({
    nombre: z.string().min(3, 'Nombre Obligatorio'),
    categoria: z.enum(['Material', 'Consumible', 'Herramienta', 'Equipo', 'EPP']).default('Material'),
    unidad: z.string().default('UND'),
    stock_minimo: z.number().min(0).optional()
  })
});

export const inventoryConsumeSchema = z.object({
  body: z.object({
    id_servicio: z.number().int().positive('Debe designarse un ID de Servicio (Destino Logístico) válido'),
    detalles: z.array(z.object({
      id_item: z.number().int().positive(),
      cantidad: z.number().positive('El volumen consumido debe ser numérico positivo')
    })).min(1, 'El reporte de consumo debe tener al menos 1 Insumo')
  })
});

import { z } from 'zod';

export const inventoryCreateSchema = z.object({
  body: z.object({
    sku: z.string().min(2, 'SKU muy corto'),
    nombre: z.string().min(3, 'Nombre Obligatorio'),
    unidad: z.string().default('UNIDAD'),
    stock_minimo: z.number().min(1, 'El Stock de Alerta no puede ser Cero/Negativo').optional()
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

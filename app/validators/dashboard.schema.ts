import { z } from 'zod';

// Esquema para validar los filtros del Dashboard
export const dashboardQuerySchema = z.object({
  query: z.object({
    // Permite pasar opcionalmente YY-MM-DD
    fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato Inválido. Debe ser YYYY-MM-DD.').optional(),
    fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato Inválido. Debe ser YYYY-MM-DD.').optional(),
  })
});

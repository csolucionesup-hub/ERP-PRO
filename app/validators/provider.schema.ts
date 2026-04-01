import { z } from 'zod';

export const providerCreateSchema = z.object({
  body: z.object({
    ruc: z.string().length(11, 'El RUC debe tener 11 dígitos'),
    razon_social: z.string().min(3, 'La Razón Social debe tener al menos 3 caracteres'),
    contacto: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().email('Debe ser un email válido').optional().or(z.literal('')),
    direccion: z.string().optional()
  })
});

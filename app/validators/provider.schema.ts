import { z } from 'zod';

const bancoCampos = {
  banco_1_nombre:    z.string().optional(),
  banco_1_numero:    z.string().optional(),
  banco_1_cci:       z.string().optional(),
  banco_2_nombre:    z.string().optional(),
  banco_2_numero:    z.string().optional(),
  banco_2_cci:       z.string().optional(),
  billetera_digital: z.string().optional(),
};

export const providerCreateSchema = z.object({
  body: z.object({
    ruc:          z.string().length(11, 'El RUC debe tener 11 dígitos').optional(),
    dni:          z.string().length(8, 'El DNI debe tener 8 dígitos').optional(),
    tipo:         z.enum(['EMPRESA', 'PERSONA_NATURAL']).default('EMPRESA'),
    razon_social: z.string().min(3, 'La Razón Social debe tener al menos 3 caracteres'),
    contacto:     z.string().optional(),
    telefono:     z.string().optional(),
    email:        z.string().email('Debe ser un email válido').optional().or(z.literal('')),
    direccion:    z.string().optional(),
    ...bancoCampos,
  })
});

export const providerUpdateSchema = z.object({
  body: z.object({
    ruc:          z.string().length(11).optional(),
    dni:          z.string().length(8).optional(),
    tipo:         z.enum(['EMPRESA', 'PERSONA_NATURAL']).optional(),
    razon_social: z.string().min(3).optional(),
    contacto:     z.string().optional(),
    telefono:     z.string().optional(),
    email:        z.string().email().optional().or(z.literal('')),
    direccion:    z.string().optional(),
    ...bancoCampos,
  })
});

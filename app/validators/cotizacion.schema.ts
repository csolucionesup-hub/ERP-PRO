import { z } from 'zod';

const detalleSchema = z.object({
  descripcion:     z.string().min(1, 'Descripción obligatoria'),
  subdescripcion:  z.string().optional(),
  notas:           z.string().optional(),
  foto_url:        z.string().optional(),
  unidad:          z.string().optional(),
  cantidad:        z.number().positive('Cantidad debe ser positiva'),
  precio_unitario: z.number().nonnegative('Precio unitario no puede ser negativo'),
});

const baseCotizacion = z.object({
  marca:            z.enum(['METAL', 'PERFOTOOLS']).default('METAL'),
  cliente:          z.string().min(2, 'Cliente obligatorio'),
  atencion:         z.string().optional(),
  telefono:         z.string().optional(),
  correo:           z.string().optional(),
  proyecto:         z.string().optional(),
  ref:              z.string().optional(),
  moneda:           z.enum(['PEN', 'USD']).default('PEN'),
  tipo_cambio:      z.number().positive().default(1),
  aplica_igv:       z.boolean().default(false),
  forma_pago:       z.string().optional(),
  validez_oferta:   z.string().optional(),
  plazo_entrega:    z.string().optional(),
  lugar_entrega:    z.string().optional(),
  lugar_trabajo:    z.string().optional(),
  precios_incluyen: z.string().optional(),
  comentarios:      z.string().optional(),
  detalles:         z.array(detalleSchema).min(1, 'Debe incluir al menos un detalle'),
});

export const cotizacionCreateSchema = z.object({
  body: baseCotizacion,
});

export const cotizacionUpdateSchema = z.object({
  body: baseCotizacion.omit({ marca: true }),
});

export const cotizacionEstadoSchema = z.object({
  body: z.object({
    estado: z.enum([
      'EN_PROCESO',
      'ENVIADA',
      'APROBADA',
      'NO_APROBADA',
      'RECHAZADA',
      'TERMINADA',
      'A_ESPERA_RESPUESTA',
    ]),
  }),
});

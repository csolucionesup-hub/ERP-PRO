import { z } from 'zod';

export const adminSaldoSchema = z.object({
  body: z.object({
    saldo_pen:   z.number({ error: 'saldo_pen es obligatorio' }),
    saldo_usd:   z.number({ error: 'saldo_usd es obligatorio' }),
    tipo_cambio: z.number().positive('tipo_cambio debe ser positivo'),
  })
});

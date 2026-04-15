import { z } from 'zod';

// Helper reutilizable: acepta YYYY-MM-DD o DD/MM/YYYY y normaliza a YYYY-MM-DD
export const fechaField = z.preprocess((arg) => {
  if (typeof arg !== 'string') return arg;
  if (arg.includes('/')) {
    const parts = arg.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return arg;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'));

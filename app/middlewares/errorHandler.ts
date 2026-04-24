import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Manejo de errores específicos de validación de Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validación de datos fallida',
      detalles: err.issues // Lista de campos y razones exactas
    });
  }

  // Logger global de errores inesperados (ocultos al front-end)
  console.error(`[CRITICAL ERROR] Error procesando [${req.method}] ${req.originalUrl}:`, err);

  // Respuesta controlada hacia UI
  // Incluimos el message del error — útil para debugging y para que la UI
  // pueda mostrar algo más específico que "error interno". El stack se queda
  // en logs del servidor. Los schemas de validación de Zod ya devolvieron 400 arriba.
  res.status(500).json({
    error: err.message || 'Ocurrió un error interno procesando la solicitud en el servidor. Revise los registros operativos.',
    // debugging extra en dev
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

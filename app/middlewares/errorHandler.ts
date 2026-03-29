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
  // No emitimos \`err.stack\` ni \`err.message\` en producción para no filtrar inyecciones
  res.status(500).json({
    error: 'Ocurrió un error interno procesando la solicitud en el servidor. Revise los registros operativos.',
    // Solo emitir mensajes de error si corremos en entorno local dev
    ...(process.env.NODE_ENV === 'development' && { debugging: err.message })
  });
}

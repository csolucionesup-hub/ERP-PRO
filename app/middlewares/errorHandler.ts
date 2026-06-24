import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Manejador global de errores.
 *
 * Convención del proyecto: los services lanzan `new Error('mensaje amigable')`
 * con texto que la UI muestra tal cual (`err.error`). Por eso NO genericizamos
 * los mensajes de los errores de aplicación — se romperían los mensajes útiles.
 *
 * Lo que SÍ blindamos: los errores crudos del driver Postgres (traen `severity`
 * y campos de schema como table/column/detail). Esos NUNCA se exponen al cliente
 * — filtran estructura de la BD y dan pistas a un atacante. Defensa en capas:
 * `TxConnection.query`/`db.query` ya los envuelven; esto es el segundo cinturón.
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Errores de validación de Zod → 400 con el detalle de campos.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validación de datos fallida',
      detalles: err.issues,
    });
  }

  // Log completo del lado del servidor (incluido el error crudo de BD si lo hay).
  console.error(`[CRITICAL ERROR] [${req.method}] ${req.originalUrl}:`, err);

  const isProd = process.env.NODE_ENV === 'production';

  // ¿Es un error crudo del driver de Postgres? pg setea `severity` ('ERROR'…) y
  // a veces un SQLSTATE de 5 chars + `routine`. No confundir con los `code` de
  // negocio de la app (ej. 'CONFIG_VACIA', 'STOCK_INSUFICIENTE').
  const sqlState = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code);
  const esErrorDb = !!err?.severity || (sqlState && (err?.routine || err?.table || err?.column));

  const status = Number(err?.statusCode || err?.status) || 500;

  const mensaje = esErrorDb
    ? 'Error procesando la operación en la base de datos.'
    : (err?.message || 'Ocurrió un error interno procesando la solicitud en el servidor. Revise los registros operativos.');

  res.status(status).json({
    error: mensaje,
    // Campos del contrato que el frontend consume. Sólo reenviamos `code` si es
    // un código de negocio (no un SQLSTATE de Postgres).
    ...(!esErrorDb && typeof err?.code === 'string' && !sqlState && { code: err.code }),
    ...(err?.lineas_pendientes && { lineas_pendientes: err.lineas_pendientes }),
    ...(err?.detalles && { detalles: err.detalles }),
    // Stack sólo en desarrollo.
    ...(!isProd && { stack: err?.stack }),
  });
}

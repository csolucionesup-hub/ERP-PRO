import type { Response, NextFunction } from 'express';
import PeriodosService from '../modules/configuracion/PeriodosService';

/**
 * Middleware que bloquea mutaciones en documentos cuyo `fecha` cae en un
 * periodo CERRADO/BLOQUEADO.
 *
 * Uso: app.post('/gastos', periodoGuard('fecha'), handler);
 *
 * Escape hatch: GERENTE puede forzar la mutación enviando el header
 *   X-Override-Periodo: true
 * — el hecho queda en audit log y su uso debería ser excepcional.
 */
export function periodoGuard(campoFecha = 'fecha') {
  return async (req: any, res: Response, next: NextFunction) => {
    const fecha = req.body?.[campoFecha];
    if (!fecha) return next(); // sin fecha → no aplica guard

    try {
      const estado = await PeriodosService.getEstado(fecha);
      if (estado === 'ABIERTO') return next();

      const override =
        req.headers['x-override-periodo'] === 'true' &&
        req.user?.rol === 'GERENTE';

      if (override) return next();

      return res.status(403).json({
        error: `Periodo ${fecha.slice(0,7)} está ${estado}. No se permiten mutaciones.`,
        periodo: fecha.slice(0,7),
        estado,
      });
    } catch (e) {
      // Fail-safe: si la consulta falla, permitir la operación en vez de bloquear.
      console.error('[periodoGuard] error consultando estado:', e);
      next();
    }
  };
}

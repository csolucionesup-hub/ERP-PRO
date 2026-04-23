import type { Request, Response, NextFunction } from 'express';
import AuditoriaService, { AuditAccion } from '../modules/configuracion/AuditoriaService';

/**
 * Middleware que registra la acción en Auditoria tras respuesta 2xx.
 *
 * Uso:
 *   app.post('/servicios', auditLog('Servicio','CREATE'), handler);
 *
 * - Sanitiza campos sensibles (password, token, secret, cert).
 * - Fire-and-forget: nunca rompe la request.
 */
export function auditLog(entidad: string, accion: AuditAccion) {
  return (req: any, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entidadId =
          req.params?.id ??
          body?.id ??
          body?.insertId ??
          body?.id_prestamo ??
          body?.id_servicio ??
          body?.id_gasto ??
          null;

        AuditoriaService.log({
          id_usuario: req.user?.id_usuario,
          nombre_usuario: req.user?.nombre,
          accion,
          entidad,
          entidad_id: entidadId,
          datos_despues: (['CREATE','UPDATE','CONFIG','EMIT'] as AuditAccion[]).includes(accion)
            ? sanitize(req.body)
            : undefined,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        });
      }
      return originalJson(body);
    };
    next();
  };
}

const SENSITIVE_KEY = /password|token|secret|cert|api_key/i;

function sanitize(body: any): any {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(sanitize);
  const clone: any = {};
  for (const [k, v] of Object.entries(body)) {
    clone[k] = SENSITIVE_KEY.test(k) ? '***' : (typeof v === 'object' ? sanitize(v) : v);
  }
  return clone;
}

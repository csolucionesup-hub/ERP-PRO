import { ZodObject } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Middleware constructor que inyecta esquemas Zod en Express.
export const validateParams = (schema: ZodObject<any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Valida Y limpia los inputs. ANTES se descartaba el resultado y los
      // handlers leían el `req.body` crudo (sin defaults, coerción ni transforms
      // de Zod). Ahora aplicamos el body parseado por merge: los handlers reciben
      // los valores normalizados + defaults. Merge (no reemplazo) a propósito —
      // no removemos claves extra para no romper handlers que lean campos que el
      // schema no declara (el stripping fuerte queda cubierto por las whitelists
      // de columnas en los services).
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed && typeof parsed === 'object' && parsed.body && typeof parsed.body === 'object') {
        req.body = { ...req.body, ...parsed.body };
      }
      return next();
    } catch (error) {
      // Si falla `parseAsync`, emite ZodError directo al `errorHandler.ts`.
      return next(error);
    }
  };

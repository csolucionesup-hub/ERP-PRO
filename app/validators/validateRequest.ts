import { ZodObject } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Middleware constructor que inyecta esquemas Zod en Express
export const validateParams = (schema: ZodObject<any>) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Intenta limpiar y mutar los inputs entrantes pasándolos por Zod Schema
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      // Si falla `parseAsync`, emite ZodError directo al `errorHandler.ts`
      return next(error);
    }
  };

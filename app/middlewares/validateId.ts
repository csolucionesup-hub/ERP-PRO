import { Request, Response, NextFunction } from 'express';

export function validateIdParam(req: Request, res: Response, next: NextFunction): void {
  const id = parseInt(req.params.id as string);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: 'ID inválido. Debe ser un número entero positivo.' });
    return;
  }
  (req as any).parsedId = id;
  next();
}

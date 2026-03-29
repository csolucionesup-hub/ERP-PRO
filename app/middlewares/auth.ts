import { Request, Response, NextFunction } from 'express';

/**
 * Filtro de Seguridad de Requests (Proxy JWT)
 * TODO: Integrar jsonwebtoken (jwt) y la lógica de base de datos para sessions.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  // Scaffolding preparado para JWT:
  /*
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso Denegado. Token requerido.' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
     const payload = jwt.verify(token, process.env.JWT_SECRET);
     req.user = payload; // Injectamos la sesión autenticada
  } catch (err) {
     return res.status(401).json({ error: 'Token Inválido o expirado.' });
  }
  */

  // Mock provisional: passthrough silente de momento
  next();
}

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// En producción este fallback NO se usa: index.ts hace process.exit(1) si
// JWT_SECRET falta antes de llegar aquí. El fallback solo cubre dev local.
const JWT_SECRET = process.env.JWT_SECRET || 'erp_dev_only_DO_NOT_USE_IN_PROD';

export interface JwtPayload {
  id_usuario: number;
  nombre: string;
  email: string;
  rol: string;
  modulos: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

export function requireModulo(modulo: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (req.user.rol === 'GERENTE' || req.user.modulos.includes(modulo)) {
      return next();
    }
    return res.status(403).json({ error: `Acceso denegado. Se requiere el módulo '${modulo}'.` });
  };
}

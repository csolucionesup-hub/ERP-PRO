import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'erp_token';

// Opciones de la cookie de auth. Pura (sin Express) para poder testearla.
// Secure solo en producción: en dev local (http://localhost) una cookie Secure
// no viaja y rompería el login.
export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8h, alineado con JWT_EXPIRES
    path: '/',
  };
}

// IMPORTANT: JWT_SECRET debe setearse ANTES de importar auth (que captura el valor al cargar)
process.env.JWT_SECRET = 'test_secret_para_unit';

import assert from 'assert';
import jwt from 'jsonwebtoken';
import { authCookieOptions, AUTH_COOKIE_NAME } from '../app/modules/auth/cookieOptions';
import { requireAuth } from '../app/middlewares/auth';

// ── Task 2: authCookieOptions ──────────────────────────────────────────────

process.env.NODE_ENV = 'production';
const prod = authCookieOptions();
assert.strictEqual(prod.httpOnly, true, 'httpOnly debe ser true');
assert.strictEqual(prod.sameSite, 'strict', 'sameSite debe ser strict');
assert.strictEqual(prod.secure, true, 'secure debe ser true en producción');
assert.strictEqual(prod.path, '/', 'path debe ser /');
assert.strictEqual(prod.maxAge, 8 * 60 * 60 * 1000, 'maxAge debe ser 8h en ms');

process.env.NODE_ENV = 'development';
const dev = authCookieOptions();
assert.strictEqual(dev.secure, false, 'secure debe ser false fuera de producción');

assert.strictEqual(AUTH_COOKIE_NAME, 'erp_token', 'el nombre de cookie debe ser erp_token');

console.log('OK: authCookieOptions 6/6');

// ── Task 3: requireAuth ────────────────────────────────────────────────────

const token = jwt.sign(
  { id_usuario: 1, nombre: 'Test', email: 't@t.com', rol: 'GERENTE', modulos: [] },
  'test_secret_para_unit'
);

function fakeRes() {
  return {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
}

let nextCalled = false;
const reqOk: any = { cookies: { erp_token: token }, headers: {} };
requireAuth(reqOk, fakeRes() as any, () => { nextCalled = true; });
assert.strictEqual(nextCalled, true, 'cookie válida debe llamar next()');
assert.strictEqual(reqOk.user?.rol, 'GERENTE', 'req.user debe quedar seteado');

const resNoCookie = fakeRes();
requireAuth({ cookies: {}, headers: {} } as any, resNoCookie as any, () => {
  throw new Error('no debería llamar next sin cookie');
});
assert.strictEqual(resNoCookie.statusCode, 401, 'sin cookie debe dar 401');

const resBad = fakeRes();
requireAuth({ cookies: { erp_token: 'basura' }, headers: {} } as any, resBad as any, () => {
  throw new Error('no debería llamar next con token inválido');
});
assert.strictEqual(resBad.statusCode, 401, 'token inválido debe dar 401');

console.log('OK: requireAuth 3/3');

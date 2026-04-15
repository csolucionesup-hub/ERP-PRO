import { db } from '../../../database/connection';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'erp_dev_secret_change_in_prod';
const JWT_EXPIRES = '8h';

class AuthService {
  async login(email: string, password: string) {
    const [rows] = await db.query(
      'SELECT id_usuario, nombre, email, password_hash, rol, activo FROM Usuarios WHERE email = ?',
      [email]
    );
    const user = (rows as any)[0];
    if (!user) throw new Error('Credenciales inválidas.');
    if (!user.activo) throw new Error('Usuario desactivado. Contacte al administrador.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new Error('Credenciales inválidas.');

    const [modRows] = await db.query(
      'SELECT modulo FROM UsuarioModulos WHERE id_usuario = ?',
      [user.id_usuario]
    );
    const modulos = (modRows as any[]).map(r => r.modulo);

    await db.query('UPDATE Usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?', [user.id_usuario]);

    const payload = {
      id_usuario: user.id_usuario,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      modulos
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return { token, usuario: payload };
  }

  async crearUsuario(data: { nombre: string; email: string; password: string; rol?: string; modulos?: string[] }, actorRol: string) {
    if (actorRol !== 'GERENTE') throw new Error('Solo el GERENTE puede crear usuarios.');

    const [existing] = await db.query('SELECT id_usuario FROM Usuarios WHERE email = ?', [data.email]);
    if ((existing as any[]).length > 0) throw new Error('Ya existe un usuario con ese email.');

    const password_hash = await bcrypt.hash(data.password, 10);
    const rol = data.rol || 'USUARIO';

    const [res] = await db.query(
      'INSERT INTO Usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
      [data.nombre, data.email, password_hash, rol]
    );
    const id_usuario = (res as any).insertId;

    if (data.modulos && data.modulos.length > 0) {
      await this.asignarModulos(id_usuario, data.modulos);
    }

    return { success: true, id_usuario };
  }

  async getUsuarios() {
    const [rows] = await db.query(`
      SELECT u.id_usuario, u.nombre, u.email, u.rol, u.activo, u.ultimo_acceso, u.created_at,
        GROUP_CONCAT(um.modulo ORDER BY um.modulo SEPARATOR ',') as modulos_raw
      FROM Usuarios u
      LEFT JOIN UsuarioModulos um ON um.id_usuario = u.id_usuario
      GROUP BY u.id_usuario
      ORDER BY u.nombre ASC
    `);
    return (rows as any[]).map(u => ({
      ...u,
      modulos: u.modulos_raw ? u.modulos_raw.split(',') : [],
      modulos_raw: undefined
    }));
  }

  async asignarModulos(id_usuario: number, modulos: string[]) {
    const [check] = await db.query('SELECT id_usuario FROM Usuarios WHERE id_usuario = ?', [id_usuario]);
    if ((check as any[]).length === 0) throw new Error('Usuario no encontrado.');

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query('DELETE FROM UsuarioModulos WHERE id_usuario = ?', [id_usuario]);
      if (modulos.length > 0) {
        const values = modulos.map(m => [id_usuario, m]);
        await conn.query('INSERT INTO UsuarioModulos (id_usuario, modulo) VALUES ?', [values]);
      }
      await conn.commit();
      return { success: true, modulos };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async toggleActivo(id_usuario: number) {
    const [rows] = await db.query('SELECT activo FROM Usuarios WHERE id_usuario = ?', [id_usuario]);
    const user = (rows as any)[0];
    if (!user) throw new Error('Usuario no encontrado.');
    const nuevoEstado = !user.activo;
    await db.query('UPDATE Usuarios SET activo = ? WHERE id_usuario = ?', [nuevoEstado, id_usuario]);
    return { success: true, activo: nuevoEstado };
  }
}

export default new AuthService();

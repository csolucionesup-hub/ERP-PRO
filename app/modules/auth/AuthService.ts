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
    // Portable a MySQL y Postgres: dos queries en lugar de GROUP_CONCAT con
    // ORDER BY interno (que el adapter Postgres no traduce correctamente).
    const [users] = await db.query(`
      SELECT id_usuario, nombre, email, rol, activo, ultimo_acceso, created_at
      FROM Usuarios
      ORDER BY nombre ASC
    `);
    const [allModulos] = await db.query(`
      SELECT id_usuario, modulo
      FROM UsuarioModulos
      ORDER BY id_usuario, modulo ASC
    `);

    // Agrupar módulos por id_usuario
    const modulosByUser = new Map<number, string[]>();
    for (const m of (allModulos as any[])) {
      const arr = modulosByUser.get(m.id_usuario) || [];
      arr.push(m.modulo);
      modulosByUser.set(m.id_usuario, arr);
    }

    return (users as any[]).map(u => ({
      ...u,
      modulos: modulosByUser.get(u.id_usuario) || [],
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
        // INSERT por fila (portable MySQL ↔ Postgres). El bulk de mysql2
        // 'INSERT ... VALUES ?' no funciona en Postgres.
        for (const m of modulos) {
          await conn.query(
            'INSERT INTO UsuarioModulos (id_usuario, modulo) VALUES (?, ?)',
            [id_usuario, m]
          );
        }
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

  /**
   * Actualiza nombre / email / rol / módulos de un usuario existente.
   * Solo GERENTE puede llamarla. Anti-lockout: el GERENTE no puede demoter
   * su propio rol (eso evita que se quede sin admin).
   *
   * Acepta updates parciales — solo los campos enviados se actualizan.
   */
  async actualizar(
    id_usuario: number,
    data: { nombre?: string; email?: string; rol?: string; modulos?: string[] },
    actorRol: string,
    actorId: number
  ) {
    if (actorRol !== 'GERENTE') throw new Error('Solo el GERENTE puede editar usuarios.');

    // Anti-lockout: el GERENTE actual no puede demoterarse a sí mismo.
    if (id_usuario === actorId && data.rol && data.rol !== 'GERENTE') {
      throw new Error('No podés cambiar tu propio rol. Pedí a otro GERENTE que lo haga.');
    }

    // Validar rol válido
    if (data.rol && !['GERENTE', 'CONTADOR', 'USUARIO'].includes(data.rol)) {
      throw new Error('Rol inválido. Valores permitidos: GERENTE, CONTADOR, USUARIO.');
    }

    // Validar email único si cambia
    if (data.email) {
      const [exist] = await db.query(
        'SELECT id_usuario FROM Usuarios WHERE email = ? AND id_usuario != ?',
        [data.email, id_usuario]
      );
      if ((exist as any[])[0]) throw new Error('Ese email ya está en uso por otro usuario.');
    }

    // Verificar que el usuario existe
    const [check] = await db.query('SELECT id_usuario FROM Usuarios WHERE id_usuario = ?', [id_usuario]);
    if ((check as any[]).length === 0) throw new Error('Usuario no encontrado.');

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const updates: string[] = [];
      const vals: any[] = [];
      if (data.nombre !== undefined) { updates.push('nombre = ?'); vals.push(data.nombre); }
      if (data.email !== undefined)  { updates.push('email = ?');  vals.push(data.email); }
      if (data.rol !== undefined)    { updates.push('rol = ?');    vals.push(data.rol); }

      if (updates.length > 0) {
        vals.push(id_usuario);
        await conn.query(`UPDATE Usuarios SET ${updates.join(', ')} WHERE id_usuario = ?`, vals);
      }

      // Actualizar módulos si vienen (replace completo del set)
      if (data.modulos !== undefined) {
        await conn.query('DELETE FROM UsuarioModulos WHERE id_usuario = ?', [id_usuario]);
        if (Array.isArray(data.modulos) && data.modulos.length > 0) {
          for (const m of data.modulos) {
            await conn.query(
              'INSERT INTO UsuarioModulos (id_usuario, modulo) VALUES (?, ?)',
              [id_usuario, m]
            );
          }
        }
      }

      await conn.commit();
      return { success: true };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Resetea la contraseña de un usuario. Solo GERENTE puede hacerlo.
   * No requiere la contraseña antigua (es un override admin).
   */
  async resetearPassword(id_usuario: number, nuevaPassword: string, actorRol: string) {
    if (actorRol !== 'GERENTE') throw new Error('Solo el GERENTE puede resetear contraseñas.');
    if (!nuevaPassword || nuevaPassword.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }
    const [check] = await db.query('SELECT id_usuario FROM Usuarios WHERE id_usuario = ?', [id_usuario]);
    if ((check as any[]).length === 0) throw new Error('Usuario no encontrado.');

    const password_hash = await bcrypt.hash(nuevaPassword, 10);
    await db.query(
      'UPDATE Usuarios SET password_hash = ? WHERE id_usuario = ?',
      [password_hash, id_usuario]
    );
    return { success: true };
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

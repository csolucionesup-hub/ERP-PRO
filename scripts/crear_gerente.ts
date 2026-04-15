import bcrypt from 'bcryptjs';
import { db } from '../database/connection';

async function crearGerente() {
  const password = 'Metal2026!';
  const hash = await bcrypt.hash(password, 10);

  await db.query(`
    INSERT INTO Usuarios (nombre, email, password_hash, rol, activo)
    VALUES (?, ?, ?, 'GERENTE', TRUE)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
  `, ['Julio Rojas Cotrina', 'julio@metalengineers.com.pe', hash]);

  console.log('Usuario gerente creado exitosamente');
  console.log('Email: julio@metalengineers.com.pe');
  console.log('Password: Metal2026!');
  process.exit(0);
}

crearGerente().catch(console.error);

import { db } from '../../../database/connection';

class ProvidersService {
  async getProveedores() {
    const [rows] = await db.query(
      `SELECT id_proveedor, ruc, dni, tipo, razon_social, contacto, telefono, email, direccion,
              banco_1_nombre, banco_1_numero, banco_1_cci,
              banco_2_nombre, banco_2_numero, banco_2_cci,
              billetera_digital
       FROM Proveedores ORDER BY razon_social ASC`
    );
    return rows;
  }

  async createProveedor(data: any) {
    const [result] = await db.query(
      `INSERT INTO Proveedores
        (ruc, dni, tipo, razon_social, contacto, telefono, email, direccion,
         banco_1_nombre, banco_1_numero, banco_1_cci,
         banco_2_nombre, banco_2_numero, banco_2_cci,
         billetera_digital)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.ruc || null, data.dni || null, data.tipo || 'EMPRESA',
        data.razon_social,
        data.contacto || null, data.telefono || null, data.email || null, data.direccion || null,
        data.banco_1_nombre || null, data.banco_1_numero || null, data.banco_1_cci || null,
        data.banco_2_nombre || null, data.banco_2_numero || null, data.banco_2_cci || null,
        data.billetera_digital || null,
      ]
    );
    return { id_proveedor: (result as any).insertId, ...data };
  }

  async updateProveedor(id: number, data: any) {
    await db.query(
      `UPDATE Proveedores SET
        ruc=?, dni=?, tipo=?, razon_social=?, contacto=?, telefono=?, email=?, direccion=?,
        banco_1_nombre=?, banco_1_numero=?, banco_1_cci=?,
        banco_2_nombre=?, banco_2_numero=?, banco_2_cci=?,
        billetera_digital=?
       WHERE id_proveedor=?`,
      [
        data.ruc || null, data.dni || null, data.tipo || 'EMPRESA',
        data.razon_social,
        data.contacto || null, data.telefono || null, data.email || null, data.direccion || null,
        data.banco_1_nombre || null, data.banco_1_numero || null, data.banco_1_cci || null,
        data.banco_2_nombre || null, data.banco_2_numero || null, data.banco_2_cci || null,
        data.billetera_digital || null,
        id,
      ]
    );
    return { success: true };
  }

  async deleteProveedor(id: number) {
    const [compras] = await db.query('SELECT id_compra FROM Compras WHERE id_proveedor = ? LIMIT 1', [id]);
    if ((compras as any[]).length > 0) throw new Error('No se puede eliminar: el proveedor tiene compras asociadas.');
    await db.query('DELETE FROM Proveedores WHERE id_proveedor = ?', [id]);
    return { success: true };
  }
}

export default new ProvidersService();

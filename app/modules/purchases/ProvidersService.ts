import { db } from '../../../database/connection';

class ProvidersService {
  async getProveedores() {
    const [rows] = await db.query(
      'SELECT id_proveedor, ruc, razon_social, contacto, telefono, email, direccion FROM Proveedores ORDER BY razon_social ASC'
    );
    return rows;
  }

  async createProveedor(data: { ruc: string; razon_social: string; contacto?: string; telefono?: string; email?: string; direccion?: string }) {
    const [result] = await db.query(
      'INSERT INTO Proveedores (ruc, razon_social, contacto, telefono, email, direccion) VALUES (?, ?, ?, ?, ?, ?)',
      [data.ruc, data.razon_social, data.contacto || null, data.telefono || null, data.email || null, data.direccion || null]
    );
    return { id_proveedor: (result as any).insertId, ...data };
  }

  async updateProveedor(id: number, data: { ruc: string; razon_social: string; contacto?: string; telefono?: string; email?: string; direccion?: string }) {
    await db.query(
      'UPDATE Proveedores SET ruc=?, razon_social=?, contacto=?, telefono=?, email=?, direccion=? WHERE id_proveedor=?',
      [data.ruc, data.razon_social, data.contacto || null, data.telefono || null, data.email || null, data.direccion || null, id]
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

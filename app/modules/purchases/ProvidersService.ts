import { db } from '../../../database/connection';

class ProvidersService {
  async getProveedores() {
    const query = `
      SELECT id_proveedor, ruc, razon_social, contacto, telefono, email 
      FROM Proveedores 
      ORDER BY razon_social ASC
    `;
    const [rows] = await db.query(query);
    return rows;
  }

  async createProveedor(data: { ruc: string; razon_social: string; contacto?: string; telefono?: string; email?: string }) {
    const query = `
      INSERT INTO Proveedores (ruc, razon_social, contacto, telefono, email) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(query, [data.ruc, data.razon_social, data.contacto || null, data.telefono || null, data.email || null]);
    return { id_proveedor: (result as any).insertId, ...data };
  }
}

export default new ProvidersService();

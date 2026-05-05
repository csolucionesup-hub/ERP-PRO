import { db } from '../../../database/connection';

class ProvidersService {
  async getProveedores(filtros: { tipo?: string } = {}) {
    const where: string[] = [];
    const vals: any[] = [];
    if (filtros.tipo) { where.push('tipo = ?'); vals.push(filtros.tipo); }
    const [rows] = await db.query(
      `SELECT id_proveedor, ruc, dni, tipo, razon_social, contacto, telefono, email, direccion,
              banco_1_nombre, banco_1_numero, banco_1_cci, banco_1_moneda,
              banco_2_nombre, banco_2_numero, banco_2_cci, banco_2_moneda,
              billetera_digital, tarifa_default, unidad_default
       FROM Proveedores
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY razon_social ASC`,
      vals
    );
    return rows;
  }

  async createProveedor(data: any) {
    const [result] = await db.query(
      `INSERT INTO Proveedores
        (ruc, dni, tipo, razon_social, contacto, telefono, email, direccion,
         banco_1_nombre, banco_1_numero, banco_1_cci, banco_1_moneda,
         banco_2_nombre, banco_2_numero, banco_2_cci, banco_2_moneda,
         billetera_digital, tarifa_default, unidad_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.ruc || null, data.dni || null, data.tipo || 'EMPRESA',
        data.razon_social,
        data.contacto || null, data.telefono || null, data.email || null, data.direccion || null,
        data.banco_1_nombre || null, data.banco_1_numero || null, data.banco_1_cci || null, data.banco_1_moneda || 'PEN',
        data.banco_2_nombre || null, data.banco_2_numero || null, data.banco_2_cci || null, data.banco_2_moneda || 'USD',
        data.billetera_digital || null,
        data.tarifa_default != null && data.tarifa_default !== '' ? Number(data.tarifa_default) : null,
        data.unidad_default || null,
      ]
    );
    return { id_proveedor: (result as any).insertId, ...data };
  }

  async updateProveedor(id: number, data: any) {
    await db.query(
      `UPDATE Proveedores SET
        ruc=?, dni=?, tipo=?, razon_social=?, contacto=?, telefono=?, email=?, direccion=?,
        banco_1_nombre=?, banco_1_numero=?, banco_1_cci=?, banco_1_moneda=?,
        banco_2_nombre=?, banco_2_numero=?, banco_2_cci=?, banco_2_moneda=?,
        billetera_digital=?, tarifa_default=?, unidad_default=?
       WHERE id_proveedor=?`,
      [
        data.ruc || null, data.dni || null, data.tipo || 'EMPRESA',
        data.razon_social,
        data.contacto || null, data.telefono || null, data.email || null, data.direccion || null,
        data.banco_1_nombre || null, data.banco_1_numero || null, data.banco_1_cci || null, data.banco_1_moneda || 'PEN',
        data.banco_2_nombre || null, data.banco_2_numero || null, data.banco_2_cci || null, data.banco_2_moneda || 'USD',
        data.billetera_digital || null,
        data.tarifa_default != null && data.tarifa_default !== '' ? Number(data.tarifa_default) : null,
        data.unidad_default || null,
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

import { db } from '../../../database/connection';

export type Marca = 'METAL' | 'PERFOTOOLS';

export interface ConfiguracionMarca {
  marca: Marca;
  razon_social: string;
  ruc: string;
  direccion: string;
  web: string;
  email: string;
  cta_pen_banco: string | null;
  cta_pen_numero: string | null;
  cta_pen_cci: string | null;
  cta_usd_banco: string | null;
  cta_usd_numero: string | null;
  cta_usd_cci: string | null;
  firma_nombre: string;
  firma_cargo: string;
  firma_telefono: string | null;
  firma_email: string | null;
  firma_direccion: string | null;
}

const MARCAS_VALIDAS: Marca[] = ['METAL', 'PERFOTOOLS'];

const CAMPOS_EDITABLES = [
  'razon_social', 'ruc', 'direccion', 'web', 'email',
  'cta_pen_banco', 'cta_pen_numero', 'cta_pen_cci',
  'cta_usd_banco', 'cta_usd_numero', 'cta_usd_cci',
  'firma_nombre', 'firma_cargo', 'firma_telefono', 'firma_email', 'firma_direccion',
] as const;

class ConfiguracionMarcaService {
  async getAll(): Promise<ConfiguracionMarca[]> {
    const [rows] = await db.query(`SELECT * FROM ConfiguracionMarca ORDER BY marca`);
    return rows as ConfiguracionMarca[];
  }

  async getByMarca(marca: Marca): Promise<ConfiguracionMarca> {
    if (!MARCAS_VALIDAS.includes(marca)) {
      throw new Error(`Marca inválida: ${marca}`);
    }
    const [rows] = await db.query(
      `SELECT * FROM ConfiguracionMarca WHERE marca = ?`, [marca]
    );
    const cfg = (rows as any[])[0];
    if (!cfg) throw new Error(`Configuración no encontrada para la marca ${marca}`);
    return cfg as ConfiguracionMarca;
  }

  async update(marca: Marca, data: Partial<ConfiguracionMarca>): Promise<void> {
    if (!MARCAS_VALIDAS.includes(marca)) {
      throw new Error(`Marca inválida: ${marca}`);
    }

    const sets: string[] = [];
    const params: any[] = [];

    for (const campo of CAMPOS_EDITABLES) {
      if (campo in data) {
        sets.push(`${campo} = ?`);
        const v = (data as any)[campo];
        params.push(v === '' ? null : v);
      }
    }

    if (sets.length === 0) return;

    params.push(marca);
    await db.query(
      `UPDATE ConfiguracionMarca SET ${sets.join(', ')} WHERE marca = ?`,
      params
    );
  }
}

export default new ConfiguracionMarcaService();

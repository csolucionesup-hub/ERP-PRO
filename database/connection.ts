import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Crear pool de conexiones manejable y reutilizable
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'erp_db',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Wrapper para inyectar logs o manejo de errores general
export const db = {
  async query(sql: string, values?: any[]) {
    const start = process.hrtime();
    try {
      const result = await pool.query(sql, values);
      
      // Cálculo de micro-performance
      const diff = process.hrtime(start);
      const time = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      
      // Logger Gerencial (Puede deshabilitarse o canalizarse a Winston en producción intensiva)
      console.log(`[DB Query | ${time}ms] ${sql.replace(/[\n\s]+/g, ' ').trim().slice(0, 150)}...`);
      
      return result; // Devuelve [rows, fields] para compatibilidad con desestructuración [rows]
    } catch (error: any) {
      console.error(`[DATABASE ERROR] ${error.message} - Faltó instrucción: ${sql.slice(0, 50)}`);
      throw new Error('Error ejecutando consulta en BD. Revise conexión o sintaxis.');
    }
  },
  
  async getConnection() {
    return await pool.getConnection();
  }
};

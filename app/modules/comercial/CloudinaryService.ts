/**
 * Cloudinary Service — Upload de fotos de cotizaciones
 *
 * Las credenciales pueden venir en cualquiera de los 2 formatos en .env:
 *   A) CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
 *   B) CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 *
 * Si están las 3 separadas, las usamos explícitamente. Si no, dejamos que
 * el SDK auto-detecte de CLOUDINARY_URL (su comportamiento por default).
 *
 * Carpeta destino: metalengineers/cotizaciones/
 */

import { v2 as cloudinary } from 'cloudinary';

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
  });
} else if (process.env.CLOUDINARY_URL) {
  // El SDK lee CLOUDINARY_URL automáticamente. Solo forzamos secure:true.
  cloudinary.config({ secure: true });
}
// Si NO hay credenciales: el SDK queda sin config y el endpoint
// /cotizaciones/upload-foto devolverá 503 antes de llamarlo.

export const CloudinaryService = {
  async subirFotoCotizacion(buffer: Buffer, originalName: string) {
    return new Promise<{ url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'metalengineers/cotizaciones',
          resource_type: 'image',
          // Optimizaciones automáticas
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' }, // máx 1200x1200
            { quality: 'auto:good' },                      // compresión inteligente
            { fetch_format: 'auto' },                      // webp si el browser lo soporta
          ],
        },
        (err, result) => {
          if (err) return reject(err);
          if (!result) return reject(new Error('Cloudinary devolvió respuesta vacía'));
          resolve({ url: result.secure_url, public_id: result.public_id });
        }
      );
      stream.end(buffer);
    });
  },

  async eliminarFoto(public_id: string) {
    await cloudinary.uploader.destroy(public_id);
  },

  /**
   * Sube un archivo genérico (PDF, imagen, etc.) a una carpeta dada.
   * No aplica las transformaciones de foto — conserva el archivo tal cual.
   * Usado por AdjuntosService para facturas, gastos, recibos, etc.
   */
  async subirArchivoGenerico(buffer: Buffer, originalName: string, folder: string) {
    return new Promise<{ url: string; public_id: string; resource_type: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto', // auto-detecta image/pdf/raw
          use_filename: true,
          unique_filename: true,
        },
        (err, result) => {
          if (err) return reject(err);
          if (!result) return reject(new Error('Cloudinary devolvió respuesta vacía'));
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: result.resource_type,
          });
        }
      );
      stream.end(buffer);
    });
  },

  /**
   * Elimina un recurso (foto, PDF, etc.) por public_id.
   * Requiere resource_type correcto ('image' default, 'raw' para PDFs subidos como raw).
   */
  async eliminarRecurso(public_id: string, resource_type: 'image' | 'raw' | 'video' = 'image') {
    await cloudinary.uploader.destroy(public_id, { resource_type });
  },
};

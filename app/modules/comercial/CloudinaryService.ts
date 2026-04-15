/**
 * Cloudinary Service — Upload de fotos de cotizaciones
 *
 * Las credenciales viven en .env:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Carpeta destino: metalengineers/cotizaciones/
 */

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

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
};

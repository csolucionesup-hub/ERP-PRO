/**
 * Script de diagnóstico — test de conexión con Google Drive
 * Ejecutar: ts-node scripts/test_drive.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { GoogleDriveService } from '../app/modules/comercial/GoogleDriveService';

async function main() {
  console.log('=== TEST GOOGLE DRIVE ===\n');
  console.log('GOOGLE_DRIVE_FOLDER_ID:', process.env.GOOGLE_DRIVE_FOLDER_ID);
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  console.log('');

  // PDF mínimo de prueba
  const { PDFDocument } = await import('pdf-lib').catch(() => { throw new Error('pdf-lib no instalado, usa un buffer cualquiera'); });
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText('TEST PDF - Metal Engineers Drive', { x: 50, y: 750, size: 20 });
  const pdfBytes = await doc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  console.log('Subiendo PDF de prueba...');
  try {
    const result = await GoogleDriveService.subirPDF({
      pdfBuffer,
      nroCotizacion: 'TEST 2026-000-MN',
      marca: 'METAL',
      estado: 'EN_PROCESO',
    });
    console.log('✅ ¡Éxito!');
    console.log('   fileId:      ', result.fileId);
    console.log('   webViewLink: ', result.webViewLink);
  } catch (err: any) {
    console.error('❌ Error:', err.message || err);
    if (err.response?.data) {
      console.error('   Detalle:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();

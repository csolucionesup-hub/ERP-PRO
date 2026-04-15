/**
 * GoogleDriveService — Archivo de PDFs de cotizaciones en Google Drive (Shared Drive)
 *
 * Estructura de carpetas en el Shared Drive "Metal Engineers ERP":
 *   ├── METAL ENGINEERS/
 *   │   ├── EN PROCESO/
 *   │   ├── APROBADAS/
 *   │   ├── ENVIADAS/
 *   │   ├── EN ESPERA/
 *   │   ├── NO APROBADAS/
 *   │   ├── RECHAZADAS/
 *   │   ├── TERMINADAS/
 *   │   └── ANULADAS/
 *   └── PERFOTOOLS/
 *       └── (misma estructura)
 *
 * Variables de entorno requeridas:
 *   GOOGLE_DRIVE_FOLDER_ID          — ID del Shared Drive "Metal Engineers ERP"
 *   GOOGLE_APPLICATION_CREDENTIALS  — ruta al JSON de service account
 */

import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import path from 'path';

// Caché de IDs de subcarpetas para no buscarlas en cada upload
const folderCache = new Map<string, string>();

function getDriveClient(): drive_v3.Drive {
  const keyFile = path.resolve(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || './google-drive-credentials.json'
  );
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

const MARCA_FOLDER: Record<string, string> = {
  METAL:      'METAL ENGINEERS',
  PERFOTOOLS: 'PERFOTOOLS',
};

const ESTADO_FOLDER: Record<string, string> = {
  EN_PROCESO:         'EN PROCESO',
  ENVIADA:            'ENVIADAS',
  APROBADA:           'APROBADAS',
  NO_APROBADA:        'NO APROBADAS',
  RECHAZADA:          'RECHAZADAS',
  TERMINADA:          'TERMINADAS',
  A_ESPERA_RESPUESTA: 'EN ESPERA',
  ANULADA:            'ANULADAS',
};

/** Busca o crea una subcarpeta dentro de parentId (compatible con Shared Drive) */
async function getOrCreateFolder(
  drive: drive_v3.Drive,
  nombre: string,
  parentId: string
): Promise<string> {
  const cacheKey = `${parentId}/${nombre}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)!;

  // Buscar existente en Shared Drive
  const { data } = await drive.files.list({
    q: `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives:          true,
    includeItemsFromAllDrives:  true,
    corpora:                    'drive',
    driveId:                    process.env.GOOGLE_DRIVE_FOLDER_ID!,
  });

  if (data.files && data.files.length > 0) {
    const id = data.files[0].id!;
    folderCache.set(cacheKey, id);
    return id;
  }

  // Crear nueva carpeta en Shared Drive
  const { data: created } = await drive.files.create({
    requestBody: {
      name:    nombre,
      mimeType:'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields:            'id',
    supportsAllDrives: true,
  });
  const id = created.id!;
  folderCache.set(cacheKey, id);
  return id;
}

export interface SubirPDFParams {
  pdfBuffer:      Buffer;
  nroCotizacion:  string;   // e.g. "COT 2026-005-MN"
  marca:          string;   // "METAL" | "PERFOTOOLS"
  estado:         string;   // e.g. "EN_PROCESO"
  driveFileId?:   string;   // Si ya existe, reemplazar
}

export const GoogleDriveService = {
  /**
   * Sube (o reemplaza) un PDF en la carpeta correspondiente a su marca + estado.
   * Devuelve el fileId y el webViewLink del archivo en Drive.
   */
  async subirPDF({ pdfBuffer, nroCotizacion, marca, estado, driveFileId }: SubirPDFParams) {
    const drive  = getDriveClient();
    const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID!;

    const marcaNombre  = MARCA_FOLDER[marca]  || marca;
    const estadoNombre = ESTADO_FOLDER[estado] || estado;

    // Obtener/crear carpeta Marca → Estado dentro del Shared Drive
    const marcaId   = await getOrCreateFolder(drive, marcaNombre,  rootId);
    const estadoId  = await getOrCreateFolder(drive, estadoNombre, marcaId);

    const fileName = `${nroCotizacion}.pdf`;
    const media    = {
      mimeType: 'application/pdf',
      body:     Readable.from(pdfBuffer),
    };

    let fileId: string;
    let webViewLink: string;

    if (driveFileId) {
      // Actualizar contenido del archivo existente
      const { data } = await drive.files.update({
        fileId:            driveFileId,
        media,
        fields:            'id, webViewLink',
        supportsAllDrives: true,
      });
      fileId      = data.id!;
      webViewLink = data.webViewLink || '';
    } else {
      // Crear archivo nuevo en Shared Drive
      const { data } = await drive.files.create({
        requestBody: {
          name:    fileName,
          parents: [estadoId],
        },
        media,
        fields:            'id, webViewLink',
        supportsAllDrives: true,
      });
      fileId      = data.id!;
      webViewLink = data.webViewLink || '';
    }

    return { fileId, webViewLink };
  },

  /**
   * Mueve el archivo a la carpeta del nuevo estado.
   */
  async moverAEstado(fileId: string, marca: string, nuevoEstado: string) {
    const drive  = getDriveClient();
    const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID!;

    const marcaNombre   = MARCA_FOLDER[marca]       || marca;
    const estadoNombre  = ESTADO_FOLDER[nuevoEstado] || nuevoEstado;

    const marcaId       = await getOrCreateFolder(drive, marcaNombre,  rootId);
    const nuevoEstadoId = await getOrCreateFolder(drive, estadoNombre, marcaId);

    // Obtener carpeta actual del archivo
    const { data } = await drive.files.get({
      fileId,
      fields:            'parents',
      supportsAllDrives: true,
    });
    const currentParents = (data.parents || []).join(',');

    await drive.files.update({
      fileId,
      addParents:        nuevoEstadoId,
      removeParents:     currentParents,
      fields:            'id, parents',
      supportsAllDrives: true,
    });
  },

  /**
   * Elimina un archivo de Drive.
   */
  async eliminar(fileId: string) {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  },
};

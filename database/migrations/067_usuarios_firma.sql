-- MIGRACIÓN 067: Firma escaneada del usuario para rendiciones (Fase 2)
-- Fecha: 2026-05-08
-- Motivo: Hoy las firmas en el PDF de rendiciones se muestran solo como
--         texto (nombre + fecha). Para que sean validables visualmente,
--         cada usuario sube una imagen de su firma manuscrita (PNG/JPG)
--         que se embebe en el PDF arriba del nombre.
--
-- La imagen vive en Cloudinary (carpeta metalengineers/firmas/<id_usuario>).
-- Solo el dueño puede subir/cambiar/eliminar su propia firma; GERENTE
-- también puede gestionar las de otros (caso baja de personal).
--
-- Postgres (Supabase). Aplicar vía MCP.

ALTER TABLE Usuarios
  ADD COLUMN IF NOT EXISTS firma_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS firma_cloudinary_id VARCHAR(200);

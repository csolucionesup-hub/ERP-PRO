-- 042_oc_unique_por_centro_costo.sql
-- Permite que cada centro de costo tenga su propia numeración correlativa desde 001.
--
-- Antes: UNIQUE (nro_oc, empresa) — todos los CCs comparten secuencia
-- Después: UNIQUE (nro_oc, empresa, centro_costo) — cada CC arranca en 001
--
-- Reportado por Luis (28/04/2026): "las OC por cada centro de costo deben
-- comenzar con el número 1 y sucesivamente, así para cada OC de cada CC distinto"
--
-- Datos existentes: las OCs creadas antes de esta migración no se renumeran.
-- El nuevo UNIQUE incluye centro_costo, así que no hay colisión retroactiva.
-- Las nuevas OCs respetan la regla.
--
-- ─── BD PRODUCTIVA (Supabase Postgres) ────────────────────────────────────────
-- Ya aplicada manualmente el 28/04/2026 vía scripts/apply_042_supabase.ts.
-- Sintaxis Postgres usada:
--   ALTER TABLE ordenescompra DROP CONSTRAINT IF EXISTS ordenescompra_uk_oc_nro_uk;
--   ALTER TABLE ordenescompra ADD CONSTRAINT ordenescompra_uk_oc_nro_uk
--     UNIQUE (nro_oc, empresa, centro_costo);
-- Registrado en _migrations.
--
-- ─── BD LOCAL (MySQL, legacy) ────────────────────────────────────────────────
-- Si alguna instalación local usa MySQL (legacy), aplicar:

ALTER TABLE OrdenesCompra DROP INDEX uk_oc_nro;
ALTER TABLE OrdenesCompra ADD UNIQUE KEY uk_oc_nro (nro_oc, empresa, centro_costo);

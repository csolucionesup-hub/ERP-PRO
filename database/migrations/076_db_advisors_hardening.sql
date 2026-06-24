-- 076_db_advisors_hardening.sql
-- Fixes de los Supabase database advisors (auditoría 2026-06-23).
-- Postgres NATIVO (Supabase project fhlrxlsscerfiuuyiejw) — NO pasa por el
-- adapter MySQL→PG. Idempotente. NO aplicada aún (gate de BD de Julio).
--
-- Aplicar con:  npx ts-node database/apply_migrations.ts --env=railway
--          o:  MCP Supabase apply_migration.
--
-- Cubre:
--   1) SECURITY (WARN): function_search_path_mutable en trigger_set_updated_at.
--   2) PERFORMANCE (INFO): 20 foreign keys sin índice de cobertura.
-- NO toca los "unused_index" del advisor: en una BD joven "sin uso" ≠ inútil;
-- dropearlos es riesgoso y se decidirá cuando haya más volumen.

-- ── 1) Seguridad: fijar search_path de la función de trigger ──────────────────
-- Sin search_path fijo, un rol podría alterar la resolución de nombres dentro de
-- la función. El cuerpo solo usa now() (pg_catalog, siempre disponible), así que
-- un search_path vacío es seguro.
ALTER FUNCTION public.trigger_set_updated_at() SET search_path = '';

-- ── 2) Performance: índices de cobertura para foreign keys ───────────────────
-- Sin índice en la columna FK, los DELETE/UPDATE de la tabla referenciada y los
-- JOINs por esa FK hacen seq scan. CREATE INDEX IF NOT EXISTS = idempotente.
CREATE INDEX IF NOT EXISTS idx_importaciongastosnapshot_id_oc_satelite     ON public.importaciongastosnapshot (id_oc_satelite);
CREATE INDEX IF NOT EXISTS idx_ordencomprafactura_id_usuario_sube          ON public.ordencomprafactura (id_usuario_sube);
CREATE INDEX IF NOT EXISTS idx_ordencomprahistorial_id_usuario             ON public.ordencomprahistorial (id_usuario);
CREATE INDEX IF NOT EXISTS idx_ordencompranota_id_usuario                  ON public.ordencompranota (id_usuario);
CREATE INDEX IF NOT EXISTS idx_ordencomprapago_id_cuenta                   ON public.ordencomprapago (id_cuenta);
CREATE INDEX IF NOT EXISTS idx_ordencomprapago_id_movimiento_bancario      ON public.ordencomprapago (id_movimiento_bancario);
CREATE INDEX IF NOT EXISTS idx_ordencomprapago_id_usuario_registra         ON public.ordencomprapago (id_usuario_registra);
CREATE INDEX IF NOT EXISTS idx_ordenescompra_autorizado_por_id             ON public.ordenescompra (autorizado_por_id);
CREATE INDEX IF NOT EXISTS idx_ordenescompra_preparado_por_id              ON public.ordenescompra (preparado_por_id);
CREATE INDEX IF NOT EXISTS idx_ordenescompra_revisado_por_id               ON public.ordenescompra (revisado_por_id);
CREATE INDEX IF NOT EXISTS idx_rendicionadjuntos_subido_por_id             ON public.rendicionadjuntos (subido_por_id);
CREATE INDEX IF NOT EXISTS idx_rendiciones_autorizado_por_id               ON public.rendiciones (autorizado_por_id);
CREATE INDEX IF NOT EXISTS idx_rendiciones_cuenta_a_cargo_de_id            ON public.rendiciones (cuenta_a_cargo_de_id);
CREATE INDEX IF NOT EXISTS idx_rendiciones_preparado_por_id                ON public.rendiciones (preparado_por_id);
CREATE INDEX IF NOT EXISTS idx_rendiciones_revisado_por_id                 ON public.rendiciones (revisado_por_id);
CREATE INDEX IF NOT EXISTS idx_rendicionitems_id_compra_referencia         ON public.rendicionitems (id_compra_referencia);
CREATE INDEX IF NOT EXISTS idx_rendicionitems_id_gasto_referencia          ON public.rendicionitems (id_gasto_referencia);
CREATE INDEX IF NOT EXISTS idx_transferenciasinternas_id_mov_bancario_destino ON public.transferenciasinternas (id_mov_bancario_destino);
CREATE INDEX IF NOT EXISTS idx_transferenciasinternas_id_mov_bancario_origen  ON public.transferenciasinternas (id_mov_bancario_origen);
CREATE INDEX IF NOT EXISTS idx_transferenciasinternas_id_usuario_registra     ON public.transferenciasinternas (id_usuario_registra);

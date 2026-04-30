-- 044_proveedores_moneda_cuentas.sql
-- Marca explícita de la moneda (PEN / USD) de cada cuenta bancaria del
-- proveedor, para que en el PDF de OC se sepa cuál usar al pagar.
--
-- La UI de Proveedores ya separaba banco_1=Soles y banco_2=Dólares por
-- convención visual, pero NO había columna en BD que lo enforce. Si un
-- proveedor tiene 2 cuentas en la misma moneda, el slot quedaba ambiguo.

ALTER TABLE Proveedores
  ADD COLUMN banco_1_moneda VARCHAR(3) NULL DEFAULT 'PEN' AFTER banco_1_cci,
  ADD COLUMN banco_2_moneda VARCHAR(3) NULL DEFAULT 'USD' AFTER banco_2_cci;

-- Equivalente Postgres (Supabase) — aplicar manualmente vía MCP:
-- ALTER TABLE proveedores
--   ADD COLUMN banco_1_moneda VARCHAR(3) DEFAULT 'PEN',
--   ADD COLUMN banco_2_moneda VARCHAR(3) DEFAULT 'USD';

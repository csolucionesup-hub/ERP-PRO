-- MIGRACIÓN: direccion_fiscal_sunat en ConfiguracionEmpresa
-- Fecha: 2026-05-02
-- Motivo: La dirección operativa de Metal Engineers (Puente Piedra) es la que
--         se imprime en cotizaciones y OCs. La dirección fiscal registrada
--         ante SUNAT es otra (Av. Javier Prado Este 2813, San Borja). Las
--         facturas electrónicas DEBEN llevar la dirección fiscal SUNAT.
--
-- Antes: configuracionempresa.direccion_fiscal contenía la operativa porque
-- todo el sistema la usaba para cotizaciones/OC. Ahora se mantiene así (no
-- rompemos lo existente) y agregamos un campo aparte SOLO para facturas.
-- Si está poblada, FacturaPDFService usa esta. Sino, fallback a direccion_fiscal.
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-02. Idempotente.

ALTER TABLE ConfiguracionEmpresa
  ADD COLUMN IF NOT EXISTS direccion_fiscal_sunat VARCHAR(300);

UPDATE ConfiguracionEmpresa
   SET direccion_fiscal_sunat = 'AV. JAVIER PRADO ESTE 2813 INT. 502 CRUCE JAVIER PRADO CON SAN LUIS, SAN BORJA - LIMA - LIMA'
 WHERE direccion_fiscal_sunat IS NULL;

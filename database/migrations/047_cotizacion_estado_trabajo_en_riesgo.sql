-- MIGRACIÓN: Agregar estado 'TRABAJO_EN_RIESGO' al CHECK de cotizaciones.estado
-- Fecha: 2026-05-02
-- Motivo: Caso de negocio real (Metal Engineers): cliente pide trabajo
--         informalmente sin formalizar pago. Julio empieza el trabajo a
--         riesgo y gasta dinero en OCs/insumos pero el cliente nunca confirma
--         ni paga. Antes la única opción era marcar la cotización APROBADA
--         (lo que la hace aparecer en Cobranzas, CxC y le proyecta IGV) o
--         dejarla EN_PROCESO (no hay distinción visual de que ya hay costos
--         incurridos).
--
-- TRABAJO_EN_RIESGO indica: "el trabajo se hizo o se está haciendo, hay gastos
-- reales, pero NO hay compromiso firme de cobro". Comportamiento:
--   - Backend: getBandejas() de Cobranzas la excluye (no aparece como
--     pendiente de depósito).
--   - updateEstado() resetea estado_financiero='NA' al pasar a este estado
--     (mismo guard que RECHAZADA/NO_APROBADA: solo si no hay cobranzas).
--   - Frontend: badge naranja distintivo en la lista de cotizaciones.
--   - Las OCs/gastos NO dependen del estado de cotización (vinculan por
--     centro_costo o id_servicio independiente), así que cargar costos
--     sigue funcionando normal.
--
-- Postgres (Supabase): aplicada vía MCP el 2026-05-02. Idempotente.
-- MySQL: la columna es VARCHAR sin enum nativo — sin alter necesario.

ALTER TABLE Cotizaciones
  DROP CONSTRAINT IF EXISTS cotizaciones_estado_check;

ALTER TABLE Cotizaciones
  ADD CONSTRAINT cotizaciones_estado_check
  CHECK (estado IN (
    'EN_PROCESO',
    'ENVIADA',
    'APROBADA',
    'NO_APROBADA',
    'RECHAZADA',
    'TERMINADA',
    'A_ESPERA_RESPUESTA',
    'ANULADA',
    'TRABAJO_EN_RIESGO'
  ));

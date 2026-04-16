-- ============================================================
-- Migración 018: Back-fill Libro Bancos
--   Genera movimientos bancarios para registros existentes
--   (cobranzas, gastos bancarios, pagos de impuestos) que fueron
--   creados antes de la auto-generación.
-- ============================================================

-- 1. Cobranzas (ABONO)
INSERT INTO MovimientoBancario
  (id_cuenta, fecha, nro_operacion, descripcion_banco, monto, tipo,
   estado_conciliacion, ref_tipo, ref_id, fuente, conciliado_at, conciliado_por, comentario)
SELECT
  cb.id_cuenta,
  cb.fecha_movimiento,
  cb.nro_operacion,
  CONCAT(
    'Cobranza ',
    CASE cb.tipo
      WHEN 'DEPOSITO_BANCO' THEN 'depósito'
      WHEN 'DETRACCION_BN'  THEN 'detracción BN'
      ELSE 'retención'
    END,
    ' — Cot ', c.nro_cotizacion
  ) AS descripcion_banco,
  cb.monto,
  'ABONO',
  'CONCILIADO',
  'COBRANZA',
  cb.id_cobranza,
  'AUTO',
  cb.created_at,
  cb.registrado_por,
  cb.comentario
FROM CobranzasCotizacion cb
JOIN Cotizaciones c ON c.id_cotizacion = cb.id_cotizacion
WHERE cb.id_cuenta IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM MovimientoBancario m
    WHERE m.ref_tipo = 'COBRANZA' AND m.ref_id = cb.id_cobranza
  );

-- 2. Gastos bancarios (CARGO)
INSERT INTO MovimientoBancario
  (id_cuenta, fecha, descripcion_banco, monto, tipo,
   estado_conciliacion, ref_tipo, ref_id, fuente, conciliado_at, conciliado_por, comentario)
SELECT
  g.id_cuenta,
  g.fecha,
  CONCAT(g.categoria, ': ', g.concepto),
  g.monto,
  'CARGO',
  'CONCILIADO',
  'GASTO_BANCARIO',
  g.id_gasto_bancario,
  'AUTO',
  g.created_at,
  g.registrado_por,
  g.comentario
FROM GastoBancario g
WHERE NOT EXISTS (
  SELECT 1 FROM MovimientoBancario m
  WHERE m.ref_tipo = 'GASTO_BANCARIO' AND m.ref_id = g.id_gasto_bancario
);

-- 3. Pagos de impuestos (CARGO)
INSERT INTO MovimientoBancario
  (id_cuenta, fecha, descripcion_banco, monto, tipo,
   estado_conciliacion, ref_tipo, ref_id, fuente, conciliado_at, comentario)
SELECT
  p.id_cuenta,
  p.fecha,
  CONCAT('IGV SUNAT — Período ', p.periodo),
  p.monto,
  'CARGO',
  'CONCILIADO',
  'PAGO_IMPUESTO',
  p.id_pago,
  'AUTO',
  COALESCE(p.fecha, NOW()),
  p.descripcion
FROM PagosImpuestos p
WHERE p.id_cuenta IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM MovimientoBancario m
    WHERE m.ref_tipo = 'PAGO_IMPUESTO' AND m.ref_id = p.id_pago
  );

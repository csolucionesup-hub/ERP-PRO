-- Migración 006: Índices de optimización para columnas de filtro frecuente
-- Auditoría V3 — B01
-- Fecha: 2026-04-09

CREATE INDEX idx_servicios_cliente ON Servicios(cliente);
CREATE INDEX idx_servicios_vencimiento ON Servicios(fecha_vencimiento);
CREATE INDEX idx_compras_estado_pago ON Compras(estado_pago);
CREATE INDEX idx_gastos_fecha ON Gastos(fecha_gasto);
CREATE INDEX idx_transacciones_fecha ON Transacciones(fecha);

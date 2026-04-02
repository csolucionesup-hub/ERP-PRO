# Optimización de Queries — ERP-PRO

## Queries Críticos del Dashboard

El endpoint `/api/dashboard` agrega datos de múltiples tablas. Patrones usados:

```sql
-- Saldo de cuentas (simple, usa índice PK)
SELECT * FROM Cuentas WHERE estado = 'ACTIVA';

-- Flujo por período (usa idx_transacciones_fecha)
SELECT tipo, SUM(total_base) FROM Transacciones
WHERE fecha >= ? AND fecha <= ? AND estado = 'REALIZADO'
GROUP BY tipo;

-- Liquidez proyectada — une servicios pendientes + préstamos
SELECT 'SERVICIO' as tipo, fecha_vencimiento, (total_base - ...) as monto_pendiente
FROM Servicios WHERE estado IN ('PENDIENTE','PARCIAL') AND fecha_vencimiento IS NOT NULL
UNION ALL
SELECT 'PRESTAMO_OTORGADO', fecha_vencimiento, saldo
FROM PrestamosOtorgados WHERE estado IN ('PENDIENTE','PARCIAL');
```

## Reglas de Performance

1. **Siempre filtrar por estado** cuando la tabla tiene campo estado — usa `idx_servicios_estado`
2. **Joins con Transacciones**: filtrar por `referencia_tipo` primero (usa `idx_transacciones_ref`)
3. **Aggregations**: usar `IFNULL(SUM(...), 0)` para evitar NULL en totales vacíos
4. **Fechas**: comparar con `DATE_FORMAT(fecha, '%Y-%m')` para agrupación mensual
5. **UNION ALL** (no UNION) cuando se sabe que no hay duplicados — más rápido

## Anti-patterns a Evitar

```sql
-- ❌ MAL: SELECT * en tablas grandes sin filtro
SELECT * FROM Transacciones;

-- ✓ BIEN: filtrar siempre
SELECT * FROM Transacciones WHERE referencia_tipo = ? AND fecha >= ?;

-- ❌ MAL: N+1 queries (cargar servicio y luego sus detracciones por separado en loop)
-- ✓ BIEN: JOIN único
SELECT s.*, d.monto as detraccion
FROM Servicios s
LEFT JOIN Detracciones d ON d.id_servicio = s.id_servicio AND d.estado != 'ANULADO';
```

## mysql2 con TypeScript — Patrón Correcto

```typescript
// Parámetros seguros (previene SQL injection)
const [rows] = await db.query('SELECT * FROM Tabla WHERE id = ? AND estado != ?', [id, 'ANULADO']);

// Cast correcto del resultado
const items = rows as any[];
const single = (rows as any[])[0];

// Query con múltiples resultados (ej: UNION)
const [result] = await db.query<any[]>(complexQuery, params);
```

# Schema MySQL — ERP-PRO

## Tablas Principales

| Tabla | PK | Descripción |
|-------|----|-------------|
| `Cuentas` | id_cuenta | Cuentas bancarias y caja. Estado: ACTIVA/INACTIVA/SUSPENDIDA |
| `Servicios` | id_servicio | Servicios prestados. Maneja IGV, detracción, retención |
| `CostosServicio` | id_costo | Costos internos de un servicio (FK: id_servicio) |
| `Compras` | id_compra | Compras a proveedores con N° OC |
| `DetalleCompras` | id_detalle | Items de una compra (FK: id_compra, id_item) |
| `Gastos` | id_gasto | Gastos operativos sin proveedor obligatorio |
| `Inventario` | id_item | Stock. SKU UNIQUE autogenerado |
| `Proveedores` | id_proveedor | RUC UNIQUE |
| `Transacciones` | id_transaccion | Registro contable polimórfico (INGRESO/EGRESO) |
| `MovimientosInventario` | id_movimiento | Trazabilidad de stock, polimórfico |
| `PrestamosTomados` | id_prestamo | Deudas de la empresa |
| `PrestamosOtorgados` | id_prestamo | Créditos otorgados |
| `Detracciones` | id_detraccion | Detracciones SUNAT (FK: id_servicio) |
| `PagosImpuestos` | id_pago | Pagos a SUNAT |
| `TipoCambio` | id_tipo_cambio | Historial PEN/USD |

## Polimorfismo: referencia_tipo + referencia_id

Las tablas `Transacciones` y `MovimientosInventario` usan FK polimórfica:
- `referencia_tipo ENUM('SERVICIO','COMPRA','GASTO','PRESTAMO')`
- `referencia_id INT` → FK lógica validada por TRIGGER (no FK física)

**IMPORTANTE**: Hay triggers que validan la integridad referencial en INSERT y UPDATE.

## Convenciones de Nombres

- PKs: `id_{tabla_snake_case}` → ej: `id_tipo_cambio`, `id_prestamo`
- FKs: mismo nombre que el PK referenciado
- Fechas: `DATE` para fecha pura, `DATETIME` para timestamp
- Montos: `DECIMAL(12,2)` para importes, `DECIMAL(10,4)` para tipo de cambio y porcentajes de tasas
- Estados: siempre `ENUM` con valores en MAYÚSCULAS
- Auditoría: `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, `updated_at ... ON UPDATE CURRENT_TIMESTAMP`

## Índices Existentes

```sql
idx_transacciones_ref    → (referencia_tipo, referencia_id)
idx_transacciones_fecha  → (fecha)
idx_movimientos_ref      → (referencia_tipo, referencia_id)
idx_movimientos_fecha    → (fecha_movimiento)
idx_compras_fecha        → (fecha)
idx_gastos_fecha         → (fecha)
idx_servicios_estado     → (estado)
idx_costos_fecha         → (fecha)
```

## Campos de Moneda

Patrón estándar en tablas con multi-moneda:
```sql
moneda VARCHAR(3) DEFAULT 'PEN',          -- 'PEN' o 'USD'
tipo_cambio DECIMAL(10,4) DEFAULT 1.0000, -- TC al momento de la operación
monto_base DECIMAL(12,2),                 -- Monto en PEN (canónico)
```

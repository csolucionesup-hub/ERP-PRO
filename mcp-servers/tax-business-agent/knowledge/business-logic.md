# Lógica de Negocio — ERP-PRO

## Flujo de un Servicio Prestado

```
1. Crear Servicio (CatalogService.create)
   ├── Calcular: igv_base = monto_base * 0.18 (si aplica_igv)
   ├── Calcular: total_base = monto_base + igv_base
   ├── Calcular: monto_detraccion = total_base * detraccion_pct/100
   ├── Calcular: monto_retencion = total_base * retencion_pct/100
   ├── INSERT Servicios
   └── Si detraccion_pct > 0: INSERT Detracciones

2. Registrar Cobro (CatalogService.registrarPago)
   ├── Validar: monto_pagado_liquido > 0
   ├── Calcular nuevo saldo
   ├── UPDATE Servicios: estado = PARCIAL o COBRADO
   └── INSERT Transacciones: tipo=INGRESO, id_cuenta (caja/banco)

3. Detracción depositada
   ├── UPDATE Detracciones: cliente_deposito = SI/PARCIAL
   └── Saldo BN aumenta (calculado en TributarioService)
```

## Flujo de una Compra

```
1. Crear Compra (PurchaseService.create)
   ├── Calcular IGV si aplica_igv
   ├── INSERT Compras
   ├── INSERT DetalleCompras (array de items)
   └── Para cada item: UPDATE Inventario stock_actual += cantidad

2. Registrar Pago (PurchaseService.registrarPago)
   ├── UPDATE Compras: monto_pagado +=, saldo -=, estado
   └── INSERT Transacciones: tipo=EGRESO
```

## Flujo de Inventario

```
Ingreso (via Compra):
  INSERT MovimientosInventario: tipo_movimiento='ENTRADA', referencia_tipo='COMPRA'
  UPDATE Inventario: stock_actual += cantidad, recalcular costo_promedio_unitario

Consumo (via Servicio o directo):
  INSERT MovimientosInventario: tipo_movimiento='SALIDA', referencia_tipo='SERVICIO'
  UPDATE Inventario: stock_actual -= cantidad
  Verificar: si stock_actual < stock_minimo → alerta en dashboard
```

## Cálculo del Dashboard

El Dashboard consolida:
1. **Saldos de cuentas**: `SELECT * FROM Cuentas WHERE estado='ACTIVA'`
2. **Flujo del mes**: Transacciones INGRESO/EGRESO del mes actual
3. **Liquidez proyectada**: Servicios pendientes + PrestamosOtorgados pendientes (ingresos futuros)
4. **Obligaciones**: PrestamosOtorgados + Compras pendientes + Detracciones sin depositar
5. **Alertas**: stock crítico, servicios por vencer, préstamos vencidos, detracciones pendientes

## Reglas de Negocio Críticas

1. **Nunca DELETE físico**: todos los módulos usan `estado = 'ANULADO'`
2. **Saldo no negativo**: al registrar pago, `saldo = MAX(0, saldo - monto_pagado)`
3. **Trazabilidad contable**: todo movimiento de dinero → registro en `Transacciones`
4. **Trazabilidad de stock**: todo movimiento de inventario → registro en `MovimientosInventario`
5. **SKU autogenerado**: formato `CAT-NNN` (3 letras categoría + número secuencial)
6. **Tipo de cambio requerido en USD**: validar `tipo_cambio > 0` antes de insertar

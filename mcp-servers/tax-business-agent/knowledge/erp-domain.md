# Dominio ERP — Módulos y Flujos

## Módulos del Sistema

### 1. Servicios (módulo central)
Gestiona servicios prestados a clientes. Es el módulo más complejo:
- Múltiples monedas (PEN/USD)
- IGV opcional
- Detracciones automáticas al crear
- Retenciones
- Pagos parciales con trazabilidad
- Costos internos asociados (CostosServicio)

### 2. Compras
Compras a proveedores con N° de OC:
- N° Orden de Compra (nro_oc)
- IGV opcional (compras exoneradas)
- Detalle de items con vinculación a Inventario
- Pagos parciales

### 3. Gastos
Gastos operativos (sin proveedor obligatorio):
- Similar a Compras pero más simple
- Ejemplos: alquiler, servicios básicos, viáticos

### 4. Inventario
Control de stock:
- Categorías: Material, Consumible, Herramienta, Equipo, EPP
- SKU autogenerado por categoría
- Stock mínimo → alertas automáticas
- Costo promedio ponderado

### 5. Proveedores
CRUD de proveedores con RUC:
- RUC UNIQUE (11 dígitos)
- Vinculados a Compras

### 6. Finanzas / Cuentas
Gestión de cuentas bancarias y caja:
- Múltiples cuentas (CAJA, BANCO)
- Saldo actualizado via Transacciones
- Historial de tipo de cambio

### 7. Tributario
Módulo SUNAT-específico:
- Detracciones pendientes de depositar
- Cuenta BN (Banco de la Nación)
- Pagos de impuestos (IGV, Renta, etc.)
- Cálculo de saldo disponible en BN

### 8. Préstamos
Dual: tomados y otorgados:
- PrestamosTomados: deudas de la empresa
- PrestamosOtorgados: créditos que la empresa da
- Pagos parciales, tasa de interés, vencimientos
- Integrados en dashboard (liquidez y alertas)

### 9. Dashboard
Vista consolidada gerencial:
- Saldos en tiempo real
- Flujo de caja del mes
- Liquidez proyectada (próximos cobros)
- Obligaciones pendientes
- Alertas críticas

## Entidad que opera el sistema

Empresa peruana (Persona Jurídica o Natural con Negocio) que:
- Presta servicios y cobra con detracciones SUNAT
- Compra materiales/servicios a proveedores
- Gestiona inventario físico
- Tiene préstamos bancarios y otorga créditos
- Declara IGV mensualmente a SUNAT

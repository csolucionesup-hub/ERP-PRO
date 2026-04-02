# Reglas Tributarias Perú — ERP-PRO

## IGV (Impuesto General a las Ventas)

- **Tasa**: 18% (16% IGV + 2% IPM) — vigente desde 2011
- **Base legal**: TUO Ley del IGV, D.S. 055-99-EF
- **Cálculo base→total**: `total = base * 1.18`
- **Extracción de IGV**: `base = total / 1.18; igv = total - base`
- En ERP: campo `aplica_igv BOOLEAN` — servicios no siempre están gravados
- **Exonerados**: algunos servicios de educación, salud, exportaciones

## Sistema de Detracciones (SPOT)

El cliente retiene un porcentaje y lo deposita en la **Cuenta de Detracciones BN** del proveedor.

### Porcentajes por tipo (Anexo 3 — Servicios):

| Tipo de Servicio | Porcentaje |
|-----------------|-----------|
| Intermediación laboral y tercerización | 10% |
| Arrendamiento de bienes | 10% |
| Mantenimiento y reparación de bienes muebles | 4% |
| Movimiento de carga | 4% |
| Otros servicios empresariales | 12% |
| Comisión mercantil | 12% |
| Fabricación de bienes por encargo | 12% |
| Servicio de transporte de personas | 10% |

### Reglas:
- Umbral: operaciones > S/ 700 (sujetas a detracción)
- El saldo BN **solo puede usarse para pagar obligaciones tributarias SUNAT**
- El proveedor puede solicitar liberación de fondos

### En ERP-PRO:
- Tabla `Detracciones` vinculada a `Servicios`
- `cliente_deposito ENUM('SI','NO','PARCIAL')`
- Saldo BN = `SUM(monto_depositado) - SUM(PagosImpuestos.monto)`

## Sistema de Retenciones

- **Tasa**: 3% del precio de venta (con IGV)
- Solo aplica cuando el comprador es **Agente de Retención** designado por SUNAT
- El vendedor descuenta la retención sufrida de su IGV mensual
- En ERP: `retencion_porcentaje DECIMAL(5,2)` en Servicios

## Renta de 4ta Categoría

- Servicios independientes (honorarios profesionales)
- **Retención**: 8% si el recibo supera S/ 1,500
- Suspensión de retenciones si ingresos proyectados < S/ 37,625 (2024)
- Comprobante: Recibo por Honorarios (electrónico en SUNAT)

## Tipo de Cambio

- Para declaraciones tributarias: usar TC SBS del día de la operación
- Fuente oficial: SUNAT/SBS
- En ERP: tabla `TipoCambio` con historial. Endpoint `/api/tipo-cambio/latest`

## Plazos de Declaración y Pago

| Obligación | Plazo |
|-----------|-------|
| IGV mensual (PDT 621) | Hasta el 20° día hábil del mes siguiente |
| Detracciones | Hasta el 5° día hábil del mes siguiente |
| Renta mensual | Hasta el 20° día hábil del mes siguiente |
| Retenciones (PDT 626) | Mismo plazo que IGV |

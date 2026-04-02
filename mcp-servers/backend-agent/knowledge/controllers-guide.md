# Guía de Servicios/Controladores — ERP-PRO

## Patrón: Clase Service con `db` de MySQL2

Todos los servicios del ERP siguen este patrón:

```typescript
import { db } from '../../../database/connection';

class ModuloService {
  async getAll(filters: any = {}) { ... }
  async getById(id: number) { ... }
  async create(data: any) { ... }
  async update(id: number, data: any) { ... }
  // Soft delete — nunca DELETE físico
  async delete(id: number) {
    await db.query('UPDATE Tabla SET estado = ? WHERE id = ?', ['ANULADO', id]);
  }
  // Opcional: pago parcial
  async registrarPago(id: number, data: any) { ... }
}

export default new ModuloService(); // Singleton
```

## Reglas de db.query()

- `mysql2/promise` — siempre desestructurar: `const [rows] = await db.query(...)`
- Parámetros posicionales `?` para evitar SQL injection
- Los resultados son `unknown` — castear con `(rows as any)[0]`
- Las fechas se insertan como `Date` o string `'YYYY-MM-DD'`

## Patrón de Pago Parcial (Préstamos, Compras, Servicios)

```typescript
async registrarPago(id: number, data: { monto_pagado: number }) {
  const [rows] = await db.query('SELECT saldo, estado FROM Tabla WHERE id = ?', [id]);
  const record = (rows as any)[0];
  if (!record) throw new Error('Registro no encontrado');

  const nuevoSaldo = Number(record.saldo) - data.monto_pagado;
  const estado = nuevoSaldo <= 0 ? 'PAGADO' : 'PARCIAL';

  await db.query(
    'UPDATE Tabla SET monto_pagado = monto_pagado + ?, saldo = ?, estado = ? WHERE id = ?',
    [data.monto_pagado, Math.max(0, nuevoSaldo), estado, id]
  );

  // SIEMPRE registrar en Transacciones (trazabilidad contable)
  await db.query(`INSERT INTO Transacciones (...) VALUES (...)`, [...]);

  return { success: true, nuevo_saldo: nuevoSaldo, estado };
}
```

## Manejo de Monedas PEN/USD

- Los montos se almacenan en PEN (`monto_base`) usando el `tipo_cambio`
- `monto_base_pen = monto_original_usd * tipo_cambio`
- Las Transacciones siempre registran en PEN
- El campo `moneda` y `tipo_cambio` se guardan para auditoría

## Servicios Existentes

| Archivo | Responsabilidad |
|---------|----------------|
| `FinanceService.ts` | Dashboard, cuentas, transacciones, gastos, tipo cambio |
| `TributarioService.ts` | Detracciones, pagos SUNAT, saldo BN |
| `PrestamosService.ts` | PrestamosTomados y PrestamosOtorgados, pagos |
| `CatalogService.ts` | Servicios prestados, costos, pagos de servicios |
| `PurchaseService.ts` | Compras, pagos de compras, detalles |
| `ProvidersService.ts` | CRUD Proveedores |
| `InventoryService.ts` | Inventario, movimientos, consumos |

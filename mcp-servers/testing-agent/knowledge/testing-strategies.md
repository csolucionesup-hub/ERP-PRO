# Estrategias de Testing — ERP-PRO

## Stack de Testing

El proyecto usa Node.js built-in test runner (node:test, disponible desde Node 18+):

```bash
node --test tests/**/*.test.js
node --test --reporter=spec tests/servicios.test.js
```

No hay framework externo instalado (sin Jest/Mocha). Usar:
- `node:test` → describe, test
- `node:assert/strict` → aserciones
- `fetch` nativo (Node 18+) para tests de integración

## Tipos de Tests

### 1. Tests de Integración API (recomendados para este proyecto)
Prueban el endpoint completo: Express → Service → MySQL.
Requieren DB de prueba corriendo.

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:3000';

describe('Servicios API', async () => {
  test('POST /api/servicios crea con IGV', async () => {
    const res = await fetch(`${BASE}/api/servicios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Test', cliente: 'CLI', fecha_servicio: '2025-01-15',
        monto_base: 1000, aplica_igv: true,
        detraccion_porcentaje: 0, retencion_porcentaje: 0
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
  });
});
```

### 2. Tests Unitarios de Services
Prueban la lógica sin DB (con mock de db).

```javascript
// Mock del módulo db
const mockDb = {
  query: async (sql, params) => {
    if (sql.includes('SELECT')) return [[{ id: 1, saldo: 5000, estado: 'PENDIENTE' }]];
    return [{ insertId: 1, affectedRows: 1 }];
  }
};
```

### 3. Tests de Validación Zod
Prueban los schemas de validación:

```javascript
test('purchaseCreateSchema rechaza sin items', () => {
  const result = purchaseCreateSchema.safeParse({ body: { nro_oc: 'OC-001', /* sin detalles */ } });
  assert.equal(result.success, false);
});
```

## Casos Críticos a Testear

### Calculadora Tributaria
- IGV: `1000 * 0.18 = 180` → total = 1180
- Detracción 12%: `1180 * 0.12 = 141.6` → cobro líquido = 1038.4
- Retención 3%: `1180 * 0.03 = 35.4`

### Flujos de Estado
- PENDIENTE → PARCIAL → PAGADO/COBRADO
- Intentar pago en ANULADO → debe fallar o ignorar
- Pago > saldo → saldo queda en 0, no negativo

### Integridad Referencial
- Transacciones con referencia_tipo='SERVICIO' y id_servicio inexistente → trigger falla
- Movimiento inventario con item inexistente → error FK

## Setup de DB de Prueba

```bash
# Crear DB de prueba (separada de producción)
mysql -u root -p -e "CREATE DATABASE erp_test;"
mysql -u root -p erp_test < database/schema.sql
mysql -u root -p erp_test < tests/fixtures/minimal.sql

# .env.test
DB_NAME=erp_test
PORT=3001
```

## Convenciones

- Un archivo por módulo: `tests/servicios.test.js`, `tests/compras.test.js`
- Fixtures SQL en: `tests/fixtures/`
- Limpiar datos después de cada test con `TRUNCATE` o `DELETE WHERE`
- No usar datos de producción en tests

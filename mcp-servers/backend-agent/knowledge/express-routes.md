# Patrones de Rutas Express - ERP-PRO

## Estructura Estándar

Todas las rutas en ERP-PRO siguen este patrón:

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { ServiceClass } from '../services/entity.service';
import { validateEntity } from '../validators/entity.validator';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();
const service = new ServiceClass();
```

## Reglas Obligatorias

### 1. Manejo de Errores
**SIEMPRE** usar try-catch en cada ruta:

```typescript
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await service.getById(parseInt(req.params.id));
    if (!result) {
      return res.status(404).json({ error: 'Entidad no encontrada' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 2. Service Layer
**NUNCA** hacer queries directamente en rutas. SIEMPRE usar servicios:

```typescript
// ❌ MAL
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM servicios');
  res.json(rows);
});

// ✅ BIEN
router.get('/', async (req, res) => {
  const result = await service.getAll(req.query);
  res.json(result);
});
```

### 3. Validación
Usar middleware de validación Zod en POST/PUT:

```typescript
router.post('/', authenticateToken, validateServicio, async (req, res) => {
  try {
    const result = await service.create(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

### 4. Soft Delete
**SIEMPRE** usar soft delete (estado ANULADO), NUNCA DELETE físico:

```typescript
// ❌ MAL
router.delete('/:id', async (req, res) => {
  await service.delete(parseInt(req.params.id));
  res.status(204).send();
});

// ✅ BIEN
router.delete('/:id', async (req, res) => {
  await service.softDelete(parseInt(req.params.id));
  res.status(204).send();
});
```

### 5. Type Safety
Siempre usar tipos TypeScript:

```typescript
router.get('/:id', async (req: Request, res: Response) => {
  // Código aquí
});
```

## Códigos de Estado HTTP

- `200` - OK (GET, PUT exitosos)
- `201` - Created (POST exitoso)
- `204` - No Content (DELETE exitoso)
- `400` - Bad Request (validación fallida)
- `404` - Not Found (entidad no existe)
- `500` - Internal Server Error (error del servidor)

## Ejemplos por Módulo

### Servicios
```typescript
router.get('/activos', async (req: Request, res: Response) => {
  try {
    const servicios = await service.getByEstado('ACTIVO');
    res.json(servicios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Compras (con detracción)
```typescript
router.post('/', validateCompra, async (req: Request, res: Response) => {
  try {
    const compra = await service.create(req.body);
    // Si aplica detracción, calcular automáticamente
    if (compra.aplica_detraccion) {
      await detraccionService.calcularYRegistrar(compra.id);
    }
    res.status(201).json(compra);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Filtros y Queries

Pasar queries al servicio:

```typescript
router.get('/', async (req: Request, res: Response) => {
  try {
    const { empresa_id, fecha_inicio, fecha_fin, estado } = req.query;
    const result = await service.getAll({
      empresa_id: empresa_id ? parseInt(empresa_id as string) : undefined,
      fecha_inicio: fecha_inicio as string,
      fecha_fin: fecha_fin as string,
      estado: estado as string
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Nomenclatura

- Rutas en plural: `/servicios`, `/gastos`, `/compras`
- Métodos de servicio en singular: `service.getServicio(id)`
- IDs siempre como número: `parseInt(req.params.id)`

# Patrones de Servicios TypeScript - ERP-PRO

## Estructura Base

```typescript
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import type { EntityType } from '../types/entity.types';

export class EntityService {
  // Métodos aquí
}
```

## Reglas Obligatorias

### 1. Transacciones
**SIEMPRE** usar transacciones para operaciones de escritura:

```typescript
async create(data: CreateEntityInput): Promise<Entity> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Operaciones aquí
    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO entities SET ?',
      data
    );

    await connection.commit();
    return { id: result.insertId, ...data };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

### 2. Connection Management
**SIEMPRE** liberar conexiones en `finally`:

```typescript
async getAll(): Promise<Entity[]> {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM entities WHERE estado != "ANULADO"'
    );
    return rows as Entity[];
  } finally {
    connection.release(); // ← CRÍTICO
  }
}
```

### 3. Soft Delete
Nunca DELETE físico, siempre UPDATE a ANULADO:

```typescript
async softDelete(id: number): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Marcar como anulado
    await connection.query(
      'UPDATE entities SET estado = "ANULADO", fecha_anulacion = NOW() WHERE id = ?',
      [id]
    );

    // Si hay registros relacionados, también anularlos
    await connection.query(
      'UPDATE related_entities SET estado = "ANULADO" WHERE entity_id = ?',
      [id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

### 4. Type Safety
Usar tipos MySQL2 correctamente:

```typescript
// Para SELECT
const [rows] = await connection.query<RowDataPacket[]>(sql, params);
return rows as Entity[];

// Para INSERT
const [result] = await connection.query<ResultSetHeader>(sql, params);
return result.insertId;

// Para UPDATE/DELETE
const [result] = await connection.query<ResultSetHeader>(sql, params);
return result.affectedRows;
```

## Patrones Específicos ERP-PRO

### Servicios con Detracciones

```typescript
async create(data: ServicioInput): Promise<Servicio> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Crear servicio
    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO servicios SET ?',
      {
        ...data,
        monto_base: data.monto_base,
        igv: data.monto_base * 0.18,
        total: data.monto_base * 1.18,
        estado: 'PENDIENTE'
      }
    );

    const servicioId = result.insertId;

    // 2. Si aplica detracción, calcular
    if (data.aplica_detraccion) {
      const montoDetraccion = data.monto_base * (data.porcentaje_detraccion / 100);
      
      await connection.query(
        'INSERT INTO detracciones SET ?',
        {
          servicio_id: servicioId,
          tipo: 'CLIENTE_RETIENE',
          monto_base: data.monto_base,
          porcentaje: data.porcentaje_detraccion,
          monto_detraccion: montoDetraccion,
          estado: 'PENDIENTE'
        }
      );
    }

    await connection.commit();

    // 3. Retornar servicio completo
    return this.getById(servicioId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

### Compras con Inventario

```typescript
async createCompra(data: CompraInput): Promise<Compra> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Registrar compra
    const [compraResult] = await connection.query<ResultSetHeader>(
      'INSERT INTO compras SET ?',
      {
        ...data,
        estado: 'PENDIENTE'
      }
    );

    const compraId = compraResult.insertId;

    // 2. Registrar en inventario (sin asignar a servicio)
    await connection.query(
      'INSERT INTO inventario SET ?',
      {
        compra_id: compraId,
        empresa_id: data.empresa_id,
        descripcion: data.descripcion,
        cantidad: data.cantidad,
        unidad: data.unidad,
        precio_unitario: data.precio_unitario,
        cantidad_disponible: data.cantidad,
        estado: 'DISPONIBLE'
      }
    );

    await connection.commit();
    return this.getById(compraId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

### Filtros Dinámicos

```typescript
async getAll(filters?: {
  empresa_id?: number;
  estado?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
}): Promise<Entity[]> {
  const connection = await pool.getConnection();
  try {
    let sql = 'SELECT * FROM entities WHERE estado != "ANULADO"';
    const params: any[] = [];

    if (filters?.empresa_id) {
      sql += ' AND empresa_id = ?';
      params.push(filters.empresa_id);
    }

    if (filters?.estado) {
      sql += ' AND estado = ?';
      params.push(filters.estado);
    }

    if (filters?.fecha_inicio) {
      sql += ' AND fecha >= ?';
      params.push(filters.fecha_inicio);
    }

    if (filters?.fecha_fin) {
      sql += ' AND fecha <= ?';
      params.push(filters.fecha_fin);
    }

    sql += ' ORDER BY id DESC';

    const [rows] = await connection.query<RowDataPacket[]>(sql, params);
    return rows as Entity[];
  } finally {
    connection.release();
  }
}
```

## Validación de Negocio

Validar en el servicio, NO en la ruta:

```typescript
async update(id: number, data: UpdateEntityInput): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validar que existe y no está anulado
    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM entities WHERE id = ? AND estado != "ANULADO"',
      [id]
    );

    if (existing.length === 0) {
      throw new Error('Entidad no encontrada o anulada');
    }

    // Validar reglas de negocio
    if (data.estado === 'TERMINADO' && existing[0].estado === 'ANULADO') {
      throw new Error('No se puede terminar un servicio anulado');
    }

    await connection.query(
      'UPDATE entities SET ? WHERE id = ?',
      [data, id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

## Error Handling

Lanzar errores descriptivos:

```typescript
if (!entity) {
  throw new Error('Servicio no encontrado');
}

if (entity.estado === 'TERMINADO') {
  throw new Error('No se puede modificar un servicio terminado');
}

if (monto <= 0) {
  throw new Error('El monto debe ser mayor a cero');
}
```

## Nomenclatura

- Clases: `ServicioService`, `CompraService`
- Métodos CRUD: `getAll()`, `getById()`, `create()`, `update()`, `softDelete()`
- Métodos específicos: `getByEstado()`, `calcularDetraccion()`, `asignarInventario()`

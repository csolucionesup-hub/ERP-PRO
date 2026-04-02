# Guía de Migraciones — ERP-PRO

## Sistema Actual

No hay sistema de migraciones formal (sin Flyway/Liquibase). Las migraciones se aplican manualmente.

Archivos clave:
- `database/schema.sql` — schema completo (fuente de verdad)
- `database/setup_db.ts` — crea tablas desde schema.sql
- `database/clean_db.ts` — limpia datos, preserva cuenta base
- `database/relations.sql` — FK relations adicionales

## Cómo Aplicar una Migración

1. Modificar `database/schema.sql` con el cambio
2. Probar el ALTER en desarrollo: `mysql -u root -p erp_db < migration.sql`
3. Si es nuevo módulo: agregar también a `setup_db.ts`
4. En producción: ejecutar el ALTER directamente (no hay rollback automático)

## Plantilla de Migración

```sql
-- Migración: descripción breve
-- Fecha: YYYY-MM-DD
-- Tabla afectada: NombreTabla

-- VALIDAR que no existe antes de agregar:
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_NAME='NombreTabla' AND COLUMN_NAME='nuevo_campo';

ALTER TABLE NombreTabla ADD COLUMN nuevo_campo TIPO [NOT NULL] [DEFAULT valor] [AFTER campo_anterior];

-- Si necesita índice:
CREATE INDEX idx_tabla_campo ON NombreTabla(nuevo_campo);
```

## Migraciones Frecuentes en este Proyecto

### Agregar campo a tabla existente
```sql
ALTER TABLE Servicios ADD COLUMN nro_factura VARCHAR(50) AFTER codigo;
```

### Ampliar ENUM
```sql
ALTER TABLE Compras MODIFY COLUMN estado ENUM('BORRADOR','CONFIRMADA','ANULADA','DEVUELTA') DEFAULT 'CONFIRMADA';
```

### Nueva tabla vinculada a Servicios
```sql
CREATE TABLE NuevaTabla (
  id_nueva INT PRIMARY KEY AUTO_INCREMENT,
  id_servicio INT NOT NULL,
  -- campos...
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio)
);
```

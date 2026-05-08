# Rediseño Kanban Logística — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el kanban de Órdenes de Compra al state machine simplificado (BORRADOR → APROBADA → PAGO → RECEPCIÓN → FACTURACIÓN → TERMINADA + CERRADA_SIN_FACTURA + ANULADA), agregar visibilidad de los 3 ejes (pago/recepción/factura) con dot semáforo + badges, cascadear alertas críticas al dashboard del Gerente, y soportar subida de facturas del proveedor.

**Architecture:** Migración SQL única que reescribe el ENUM `estado`, agrega columnas (`estado_factura`, `fecha_credito_vence`) y crea 3 tablas auxiliares (`OrdenCompraHistorial`, `OrdenCompraNota`, `OrdenCompraFactura`). Backend refactoriza `OrdenCompraService` para usar los estados nuevos en una sola pasada (sin compatibilidad hacia atrás). Frontend reescribe el kanban en `OrdenesCompra.js` (módulo cargado por Logistica.js vía `renderTabOC`) con filtros, sticky headers y cards rediseñadas. Alertas se calculan on-demand en `AlertasService` (auto-resuelven). Cloudinary reusa el wrapper de cotizaciones para subir facturas.

**Tech Stack:** TypeScript 5 + Express 5 + Postgres (Supabase) vía adapter MySQL2; Vanilla JS frontend; Cloudinary para storage; ExcelJS para export.

---

## Pre-requisitos y convenciones

- **Sin tests automáticos.** El proyecto no tiene framework de tests. Cada tarea verifica con: `npx tsc --noEmit` (regla 37 CLAUDE.md), inspección manual del kanban en preview, y SQL queries de verificación.
- **Backup obligatorio antes de migration:** `npm run db:backup` (memoria `project_backup_plan_a`).
- **Cache buster JS:** versión nueva = `20260506r1`. Cualquier cambio en `public/js/` requiere bumpear el sufijo `?v=20260506r1` en TODOS los imports de `public/js/app.js` Y en el `<script>` de `public/index.html` (regla 36 CLAUDE.md).
- **Postgres + adapter:** todas las queries SQL usan placeholders `?` (estilo MySQL); el adapter en `database/connection.ts` los traduce. Sin try/catch manual en rutas (Express 5 maneja async errors).
- **Sin `alert()`:** usar `showSuccess`/`showError` de `public/js/services/ui.js` (regla 16 CLAUDE.md).
- **Modales no cierran por backdrop click:** solo botón "Cerrar" explícito (regla 28 CLAUDE.md).
- **Auditoría:** todas las rutas que mutan OC pasan por `auditLog('OrdenCompra', accion)`. El type `AuditAccion` puede necesitar extensión.

---

## Task 0: Pre-trabajo — backup, branch, baseline

**Files:**
- N/A (solo comandos git/db)

- [ ] **Step 1:** Verificar que estamos en el worktree correcto y que el árbol está limpio:

```bash
git status
git branch --show-current
```

Esperado: branch `claude/reverent-curran-216a6e`, working tree clean (al menos lo relacionado a los archivos del plan).

- [ ] **Step 2:** Backup de BD productiva:

```bash
npm run db:backup
```

Esperado: archivo `database/backups/<timestamp>.sql` creado.

- [ ] **Step 3:** Verificar tipos TS limpios antes de empezar:

```bash
npx tsc --noEmit
```

Esperado: sin errores. Si hay errores, frenar y arreglar antes de tocar nada.

- [ ] **Step 4:** Confirmar que `npm run dev` levanta sin errores:

```bash
npm run dev
```

Esperado: servidor en `http://localhost:3000`. Detener con Ctrl+C antes de seguir.

---

## FASE A — Base de datos

### Task A1: Crear migration 062 (rediseño completo)

**Files:**
- Create: `database/migrations/062_kanban_oc_rediseno.sql`

- [ ] **Step 1: Escribir el SQL de la migration**

Crear `database/migrations/062_kanban_oc_rediseno.sql` con este contenido exacto:

```sql
-- MIGRACIÓN: Rediseño del kanban de Órdenes de Compra
-- Fecha: 2026-05-06
-- Spec: docs/superpowers/specs/2026-05-06-logistica-kanban-rediseno-design.md
-- Motivo: Brainstorm con Julio. ENVIADA no se usa. Comprimimos pago/recepción/factura
--         como ejes independientes (forma_pago, estado_pago, estado_recepcion calculado,
--         estado_factura nuevo). Cascada de alertas a Gerencia.
--
-- Cambios:
--   1. Agrega `fecha_credito_vence` DATE NULL.
--   2. Agrega `estado_factura` ENUM('PENDIENTE','FACTURADA','SIN_FACTURA') NOT NULL DEFAULT 'PENDIENTE'.
--   3. Reescribe ENUM `estado`: agrega 'PAGO','RECEPCION','FACTURACION','TERMINADA';
--      mantiene 'BORRADOR','APROBADA','CERRADA_SIN_FACTURA','ANULADA'.
--      Migra valores viejos a nuevos según mapping (ver más abajo).
--   4. Crea tabla OrdenCompraHistorial — log de transiciones de estado.
--   5. Crea tabla OrdenCompraNota — comentarios libres por OC.
--   6. Crea tabla OrdenCompraFactura — facturas del proveedor subidas a Cloudinary.
--   7. Inserta registro sintético en OrdenCompraHistorial para cada OC existente
--      (estado_anterior=NULL, estado_nuevo=<estado_actual>, fecha=created_at).
--
-- Mapping de estados viejos → nuevos:
--   BORRADOR              → BORRADOR
--   APROBADA              → APROBADA
--   ENVIADA               → APROBADA (ENVIADA no existe más)
--   RECIBIDA_PARCIAL      → RECEPCION
--   RECIBIDA              → RECEPCION
--   FACTURADA             → FACTURACION  (estado_factura=FACTURADA)
--   PAGADA_PEND_FACTURA   → FACTURACION  (estado_pago=PAGADO, estado_factura=PENDIENTE)
--   PAGADA                → TERMINADA    (estado_factura=FACTURADA, estado_pago=PAGADO)
--   CERRADA_SIN_FACTURA   → CERRADA_SIN_FACTURA (estado_factura=SIN_FACTURA, estado_pago=PAGADO)
--   ANULADA               → ANULADA
--
-- Postgres (Supabase). Idempotente.

-- 1. Columnas nuevas en OrdenesCompra
ALTER TABLE OrdenesCompra
  ADD COLUMN IF NOT EXISTS fecha_credito_vence DATE NULL,
  ADD COLUMN IF NOT EXISTS estado_factura VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_factura IN ('PENDIENTE','FACTURADA','SIN_FACTURA'));

-- 2. Drop del check constraint viejo
ALTER TABLE OrdenesCompra
  DROP CONSTRAINT IF EXISTS ordenescompra_estado_check;

-- 3. Migración de los valores existentes (orden importa: primero PAGADA_PEND_FACTURA antes de FACTURADA)
UPDATE OrdenesCompra SET estado_factura='FACTURADA' WHERE estado IN ('FACTURADA','PAGADA');
UPDATE OrdenesCompra SET estado_factura='SIN_FACTURA' WHERE estado='CERRADA_SIN_FACTURA';

UPDATE OrdenesCompra SET estado='APROBADA'    WHERE estado='ENVIADA';
UPDATE OrdenesCompra SET estado='RECEPCION'   WHERE estado IN ('RECIBIDA_PARCIAL','RECIBIDA');
UPDATE OrdenesCompra SET estado='FACTURACION' WHERE estado IN ('FACTURADA','PAGADA_PEND_FACTURA');
UPDATE OrdenesCompra SET estado='TERMINADA'   WHERE estado='PAGADA';

-- 4. Nuevo check constraint
ALTER TABLE OrdenesCompra
  ADD CONSTRAINT ordenescompra_estado_check
  CHECK (estado IN (
    'BORRADOR','APROBADA','PAGO','RECEPCION','FACTURACION','TERMINADA',
    'CERRADA_SIN_FACTURA','ANULADA'
  ));

-- 5. Índice para fecha_credito_vence (alertas usan este filtro)
CREATE INDEX IF NOT EXISTS idx_oc_credito_vence
  ON OrdenesCompra(fecha_credito_vence)
  WHERE forma_pago = 'CREDITO' AND estado_pago <> 'PAGADO';

-- 6. Tabla OrdenCompraHistorial
CREATE TABLE IF NOT EXISTS OrdenCompraHistorial (
  id_historial    SERIAL PRIMARY KEY,
  id_oc           INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  estado_anterior VARCHAR(30),
  estado_nuevo    VARCHAR(30) NOT NULL,
  id_usuario      INT REFERENCES Usuarios(id_usuario),
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comentario      VARCHAR(500)
);
CREATE INDEX IF NOT EXISTS idx_historial_oc    ON OrdenCompraHistorial(id_oc);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON OrdenCompraHistorial(fecha DESC);

-- 7. Tabla OrdenCompraNota
CREATE TABLE IF NOT EXISTS OrdenCompraNota (
  id_nota    SERIAL PRIMARY KEY,
  id_oc      INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  id_usuario INT REFERENCES Usuarios(id_usuario),
  fecha      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  texto      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nota_oc ON OrdenCompraNota(id_oc, fecha DESC);

-- 8. Tabla OrdenCompraFactura
CREATE TABLE IF NOT EXISTS OrdenCompraFactura (
  id_factura_oc   SERIAL PRIMARY KEY,
  id_oc           INT NOT NULL UNIQUE REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  nro_comprobante VARCHAR(30) NOT NULL,
  fecha_emision   DATE NOT NULL,
  monto           DECIMAL(14,2) NOT NULL,
  url_pdf         VARCHAR(500),
  cloudinary_id   VARCHAR(200),
  id_usuario_sube INT REFERENCES Usuarios(id_usuario),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_factura_oc ON OrdenCompraFactura(id_oc);

-- 9. Backfill de OrdenCompraHistorial con un registro sintético por OC
INSERT INTO OrdenCompraHistorial (id_oc, estado_anterior, estado_nuevo, fecha, comentario)
SELECT id_oc, NULL, estado, COALESCE(created_at, CURRENT_TIMESTAMP), 'Backfill mig 062'
FROM OrdenesCompra
WHERE NOT EXISTS (
  SELECT 1 FROM OrdenCompraHistorial h WHERE h.id_oc = OrdenesCompra.id_oc
);
```

- [ ] **Step 2: Aplicar la migration en local**

```bash
npx ts-node database/apply_migrations.ts
```

Esperado: log `[migrations] aplicando 062_kanban_oc_rediseno.sql`.

- [ ] **Step 3: Verificar la migración con queries SQL**

Conectar al MySQL/Postgres local (usar `mysql` CLI o cliente Supabase) y correr:

```sql
SELECT estado, COUNT(*) FROM OrdenesCompra GROUP BY estado;
SELECT estado_factura, COUNT(*) FROM OrdenesCompra GROUP BY estado_factura;
SELECT COUNT(*) FROM OrdenCompraHistorial;
SELECT column_name FROM information_schema.columns WHERE table_name='ordenescompra' AND column_name IN ('fecha_credito_vence','estado_factura');
```

Esperado:
- estados solo en `{BORRADOR,APROBADA,PAGO,RECEPCION,FACTURACION,TERMINADA,CERRADA_SIN_FACTURA,ANULADA}`.
- estado_factura solo en `{PENDIENTE,FACTURADA,SIN_FACTURA}`.
- COUNT historial ≥ COUNT OCs (1 sintético por cada OC).
- Las 2 columnas nuevas existen.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/062_kanban_oc_rediseno.sql
git commit -m "feat(db): mig 062 — rediseño kanban OC (estado_factura, fecha_credito_vence, tablas auxiliares)

Spec: docs/superpowers/specs/2026-05-06-logistica-kanban-rediseno-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## FASE B — Backend tipos y state machine

### Task B1: Actualizar type EstadoOC y AuditAccion

**Files:**
- Modify: `app/modules/compras/OrdenCompraService.ts:25-29` (type EstadoOC)
- Modify: `app/middlewares/auditLog.ts` (buscar AuditAccion type — ubicación a confirmar con grep)

- [ ] **Step 1: Localizar el archivo del type AuditAccion**

```bash
grep -rn "type AuditAccion\|type Accion =" app/middlewares/ app/modules/
```

Anotar la ruta y línea.

- [ ] **Step 2: Reescribir EstadoOC en OrdenCompraService.ts líneas 25-29**

Reemplazar:
```typescript
export type EstadoOC =
  | 'BORRADOR' | 'APROBADA' | 'ENVIADA'
  | 'RECIBIDA_PARCIAL' | 'RECIBIDA'
  | 'FACTURADA' | 'PAGADA_PEND_FACTURA' | 'PAGADA' | 'ANULADA'
  | 'CERRADA_SIN_FACTURA';
```

Por:
```typescript
export type EstadoOC =
  | 'BORRADOR' | 'APROBADA' | 'PAGO' | 'RECEPCION' | 'FACTURACION'
  | 'TERMINADA' | 'CERRADA_SIN_FACTURA' | 'ANULADA';

export type EstadoFactura = 'PENDIENTE' | 'FACTURADA' | 'SIN_FACTURA';
export type EstadoRecepcion = 'NO_RECIBIDO' | 'PARCIAL' | 'RECIBIDO';

/** Constante única — todos los umbrales de alertas de OC en días. */
export const UMBRAL_ALERTA_DIAS = 15;
```

También actualizar el doc-comment en líneas 4-19 para reflejar el state machine nuevo.

- [ ] **Step 3: Extender AuditAccion**

En el archivo donde está `type AuditAccion`, agregar las acciones nuevas que vamos a usar:
```typescript
export type AuditAccion =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'ANULAR' | 'REACTIVAR'
  | 'MARCAR_CREDITO' | 'AGREGAR_NOTA' | 'SUBIR_FACTURA' | 'CERRAR_SIN_FACTURA';
```

(Mantener todos los valores existentes que ya estén ahí — solo agregar.)

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: **muchos errores** ahora — todas las referencias a estados viejos en OrdenCompraService.ts, FinanceService.ts, ROCService.ts, AlertasService.ts. Eso lo arreglamos en B2 y siguientes. **No commitear todavía.**

---

### Task B2: Refactor OrdenCompraService — métodos de transición

**Files:**
- Modify: `app/modules/compras/OrdenCompraService.ts` (múltiples secciones)

- [ ] **Step 1: Eliminar `marcarEnviada` y reemplazar con auto-advance APROBADA→PAGO**

En `OrdenCompraService.ts`, eliminar el método `marcarEnviada` (líneas ~341-350). Reemplazar `aprobar` (~líneas 320-340) para que después del UPDATE setee directo `estado='PAGO'`:

```typescript
async aprobar(id_oc: number, id_usuario_aprueba: number) {
  const [rows]: any = await db.query('SELECT estado, total, moneda FROM OrdenesCompra WHERE id_oc = ?', [id_oc]);
  if (!rows[0]) throw new Error('OC no encontrada');
  const oc = rows[0];
  if (oc.estado !== 'BORRADOR') throw new Error(`OC no está en BORRADOR (estado actual: ${oc.estado})`);

  // BORRADOR → APROBADA → (transient) → PAGO en una sola operación.
  await db.query(
    `UPDATE OrdenesCompra
        SET estado='PAGO', id_usuario_aprueba=?, fecha_aprobacion=NOW()
      WHERE id_oc=?`,
    [id_usuario_aprueba, id_oc]
  );
  await this._registrarTransicion(id_oc, 'BORRADOR', 'PAGO', id_usuario_aprueba, 'Aprobada y enviada a fase de pago');

  return { success: true, estado: 'PAGO' as const };
}
```

- [ ] **Step 2: Agregar método `marcarCredito`**

Agregar después de `aprobar`:

```typescript
/**
 * Marca la OC como crédito al proveedor. Setea forma_pago=CREDITO y calcula
 * fecha_credito_vence desde dias_credito (o desde el body). Mueve la card de
 * PAGO a RECEPCION inmediatamente.
 */
async marcarCredito(id_oc: number, params: { dias_credito?: number; fecha_vence?: string; id_usuario?: number }) {
  const [rows]: any = await db.query(
    'SELECT estado, dias_credito FROM OrdenesCompra WHERE id_oc = ?',
    [id_oc]
  );
  if (!rows[0]) throw new Error('OC no encontrada');
  if (!['APROBADA', 'PAGO'].includes(rows[0].estado)) {
    throw new Error(`OC en estado ${rows[0].estado} no puede marcarse como crédito`);
  }

  const dias = params.dias_credito ?? rows[0].dias_credito ?? 30;
  const fechaVence = params.fecha_vence
    ? params.fecha_vence
    : new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

  await db.query(
    `UPDATE OrdenesCompra
        SET forma_pago='CREDITO', dias_credito=?, fecha_credito_vence=?, estado='RECEPCION'
      WHERE id_oc=?`,
    [dias, fechaVence, id_oc]
  );
  await this._registrarTransicion(
    id_oc, 'PAGO', 'RECEPCION', params.id_usuario || null,
    `Marcada como crédito (vence ${fechaVence})`
  );

  return { success: true, estado: 'RECEPCION' as const, fecha_credito_vence: fechaVence };
}
```

- [ ] **Step 3: Refactor `recibir` (~línea 366)**

Cambiar el guard en línea ~382 de:
```typescript
if (!['APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
```
Por:
```typescript
if (!['PAGO', 'RECEPCION'].includes(oc.estado)) {
```

Cambiar la lógica del nuevo estado en línea ~479:
```typescript
const nuevoEstado: EstadoOC =
  Number(total_recibido) >= Number(total_pedido) - 0.0001 ? 'RECEPCION' : 'RECEPCION';
// (siempre RECEPCION — el dot interno indica si total/parcial; auto-advance a FACTURACION
//  ocurre en _checkAutoAvance al final si pago=PAGADO)
```

Después del UPDATE de estado en línea ~481-482, llamar al helper de auto-avance:
```typescript
await this._checkAutoAvance(conn, id_oc);
await this._registrarTransicion(id_oc, oc.estado, 'RECEPCION', null, 'Recepción registrada');
```

- [ ] **Step 4: Refactor `registrarPago` (~línea 700)**

Cambiar el guard en línea ~725 de:
```typescript
if (!['RECIBIDA', 'RECIBIDA_PARCIAL', 'FACTURADA'].includes(oc.estado)) {
```
Por:
```typescript
if (!['PAGO', 'RECEPCION', 'FACTURACION'].includes(oc.estado)) {
```

En el case A (línea ~736 — antes `oc.estado === 'FACTURADA'`):
```typescript
if (oc.estado === 'FACTURACION') {
  // Pago contra factura ya recibida: estado_factura debe ser FACTURADA.
  // Si es PENDIENTE seguimos cobrando contra "PAGADA_PEND_FACTURA equivalente"
  // ... (mantener lógica existente, solo cambiando el match y los UPDATE de estado)
```

Cambiar el UPDATE final cuando llega a pago total:
```typescript
// (línea ~777)
await conn.query(
  `UPDATE OrdenesCompra SET estado = 'TERMINADA', pagada_at = ? WHERE id_oc = ?`,
  [fechaPago, id_oc]
);
```
Cambiar a:
```typescript
// Solo pasa a TERMINADA si estado_factura=FACTURADA. Sino se queda en FACTURACION
// con estado_pago=PAGADO esperando que llegue la factura.
const [factRows]: any = await conn.query(
  `SELECT estado_factura FROM OrdenesCompra WHERE id_oc = ?`, [id_oc]
);
const proximoEstado = factRows[0]?.estado_factura === 'FACTURADA' ? 'TERMINADA' : 'FACTURACION';
await conn.query(
  `UPDATE OrdenesCompra SET estado = ?, pagada_at = ? WHERE id_oc = ?`,
  [proximoEstado, fechaPago, id_oc]
);
```

En el case B (línea ~785 — antes RECIBIDA/RECIBIDA_PARCIAL → PAGADA_PEND_FACTURA):
```typescript
// (línea ~916)
await conn.query(
  `UPDATE OrdenesCompra SET estado = 'PAGADA_PEND_FACTURA', pagada_at = ? WHERE id_oc = ?`,
  [fechaPago, id_oc]
);
```
Cambiar a:
```typescript
await conn.query(
  `UPDATE OrdenesCompra SET estado = 'FACTURACION', pagada_at = ? WHERE id_oc = ?`,
  [fechaPago, id_oc]
);
```

(Adaptar también todos los `return { ..., estado: 'PAGADA_PEND_FACTURA' }` y `'PAGADA'` para devolver `'FACTURACION'` y `'TERMINADA'` respectivamente.)

- [ ] **Step 5: Refactor `facturar` (~línea 506)**

Cambiar el guard en línea ~519:
```typescript
if (!['RECIBIDA', 'RECIBIDA_PARCIAL', 'PAGADA_PEND_FACTURA'].includes(oc.estado)) {
```
Por:
```typescript
if (!['RECEPCION', 'FACTURACION'].includes(oc.estado)) {
```

Si `oc.estado==='FACTURACION'` (antes era PAGADA_PEND_FACTURA): solo enriquece comprobante, marca `estado_factura='FACTURADA'`, y verifica si pasa a TERMINADA:
```typescript
// (línea ~542 antes)
await conn.query(
  `UPDATE OrdenesCompra
      SET estado='TERMINADA', estado_factura='FACTURADA', facturada_at=NOW()
    WHERE id_oc=?`,
  [id_oc]
);
```

Si `oc.estado==='RECEPCION'`: igual flujo de antes pero al final:
```typescript
// (línea ~682 antes)
await conn.query(
  `UPDATE OrdenesCompra
      SET estado='FACTURACION', estado_factura='FACTURADA',
          facturada_at=NOW(), id_compra_generada=?
    WHERE id_oc=?`,
  [id_compra, id_oc]
);
// Después llamar auto-avance: si estado_pago=PAGADO → TERMINADA
await this._checkAutoAvance(conn, id_oc);
```

- [ ] **Step 6: Refactor `anular` (~línea 1213)**

Cambiar:
```typescript
if (!['BORRADOR', 'APROBADA', 'ENVIADA'].includes(estado)) {
```
Por:
```typescript
if (!['BORRADOR', 'APROBADA', 'PAGO'].includes(estado)) {
```

- [ ] **Step 7: Refactor `cerrarSinFactura` (~línea 1444)**

Cambiar:
```typescript
if (!['RECIBIDA', 'RECIBIDA_PARCIAL', 'PAGADA_PEND_FACTURA'].includes(oc.estado)) {
```
Por:
```typescript
if (!['RECEPCION', 'FACTURACION'].includes(oc.estado)) {
```

Cambiar el UPDATE final:
```sql
UPDATE OrdenesCompra
   SET estado='CERRADA_SIN_FACTURA', estado_factura='SIN_FACTURA', estado_pago='PAGADO'
 WHERE id_oc=?
```

- [ ] **Step 8: Refactor `reactivar` (~línea 1320)**

Cambiar:
```typescript
if (['FACTURADA', 'PAGADA'].includes(rows[0].estado)) {
```
Por:
```typescript
if (['FACTURACION', 'TERMINADA'].includes(rows[0].estado)) {
```

(El reactivar tira error si la OC ya pasó por facturación — esa regla se mantiene.)

- [ ] **Step 9: Agregar helpers privados al final de la clase**

Antes del cierre `}` de `class OrdenCompraService`:

```typescript
/**
 * Auto-avance del estado: si recepción al 100% y pago al 100%, mueve a TERMINADA.
 * Si recepción al 100% y pago no, deja en FACTURACION (esperando pago).
 * Si recepción no completa, deja como esté.
 */
private async _checkAutoAvance(conn: any, id_oc: number) {
  const [r]: any = await conn.query(`
    SELECT oc.estado, oc.estado_pago, oc.estado_factura,
           SUM(d.cantidad) AS total_pedido,
           SUM(d.cantidad_recibida) AS total_recibido
      FROM OrdenesCompra oc
      JOIN DetalleOrdenCompra d ON d.id_oc = oc.id_oc
     WHERE oc.id_oc = ?
     GROUP BY oc.id_oc
  `, [id_oc]);
  const row = r[0];
  if (!row) return;

  const recibidoCompleto = Number(row.total_recibido) >= Number(row.total_pedido) - 0.0001;
  const pagoCompleto = row.estado_pago === 'PAGADO';
  const facturaOK = row.estado_factura === 'FACTURADA';

  if (recibidoCompleto && pagoCompleto && facturaOK) {
    await conn.query(`UPDATE OrdenesCompra SET estado='TERMINADA' WHERE id_oc=?`, [id_oc]);
    await this._registrarTransicion(id_oc, row.estado, 'TERMINADA', null, 'Auto: todo cerrado');
  } else if (recibidoCompleto && row.estado === 'RECEPCION') {
    // Solo avanza a FACTURACION si pago está OK; si no, queda bloqueada en RECEPCION.
    if (pagoCompleto) {
      await conn.query(`UPDATE OrdenesCompra SET estado='FACTURACION' WHERE id_oc=?`, [id_oc]);
      await this._registrarTransicion(id_oc, 'RECEPCION', 'FACTURACION', null, 'Auto: recepción completa + pago al día');
    }
    // sino: queda en RECEPCION (bloqueada con badge de saldo pendiente)
  }
}

/**
 * Registra una transición en OrdenCompraHistorial. Best-effort —
 * si la tabla no existe (mig no aplicada) no rompe.
 */
private async _registrarTransicion(
  id_oc: number,
  estado_anterior: string | null,
  estado_nuevo: string,
  id_usuario: number | null,
  comentario: string | null
) {
  try {
    await db.query(
      `INSERT INTO OrdenCompraHistorial (id_oc, estado_anterior, estado_nuevo, id_usuario, comentario)
       VALUES (?, ?, ?, ?, ?)`,
      [id_oc, estado_anterior, estado_nuevo, id_usuario, comentario]
    );
  } catch (_) { /* tabla puede no existir aún */ }
}

/**
 * Calcula estado_recepcion en runtime desde DetalleOrdenCompra.
 */
async getEstadoRecepcion(id_oc: number): Promise<EstadoRecepcion> {
  const [r]: any = await db.query(`
    SELECT SUM(cantidad) AS total, SUM(cantidad_recibida) AS recibido
    FROM DetalleOrdenCompra WHERE id_oc=?
  `, [id_oc]);
  const total = Number(r[0]?.total || 0);
  const recibido = Number(r[0]?.recibido || 0);
  if (recibido <= 0.0001) return 'NO_RECIBIDO';
  if (recibido >= total - 0.0001) return 'RECIBIDO';
  return 'PARCIAL';
}
```

- [ ] **Step 10: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: errores SOLO en `app/modules/finance/FinanceService.ts`, `app/modules/compras/ROCService.ts`, `app/modules/admin/AlertasService.ts` y rutas en `index.ts`. Si hay errores en `OrdenCompraService.ts` mismo, arreglarlos antes de seguir.

- [ ] **Step 11: Commit**

```bash
git add app/modules/compras/OrdenCompraService.ts app/middlewares/auditLog.ts
git commit -m "refactor(oc): state machine nuevo (PAGO/RECEPCION/FACTURACION/TERMINADA) + marcarCredito + helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B3: Adaptar referencias en otros services

**Files:**
- Modify: `app/modules/finance/FinanceService.ts:128, 221`
- Modify: `app/modules/compras/ROCService.ts:123, 124, 145, 431`
- Modify: `app/modules/admin/AlertasService.ts:373` (la otra referencia de línea 126 es de Cotizaciones, no tocar)

- [ ] **Step 1: FinanceService.ts líneas 128 y 221**

Cambiar:
```typescript
WHERE estado IN ('APROBADA','ENVIADA','RECIBIDA_PARCIAL','RECIBIDA')
```
Por (las dos ocurrencias):
```typescript
WHERE estado IN ('APROBADA','PAGO','RECEPCION')
```

- [ ] **Step 2: ROCService.ts líneas 123-124, 145, 431**

Cambiar las listas y comparaciones de estado para reflejar el state machine nuevo:

Línea 123-124:
```typescript
const aprobada = ['APROBADA','PAGO','RECEPCION','FACTURACION','TERMINADA'].includes(estado) ? 'X' : '';
const pagada   = ['TERMINADA','FACTURACION'].includes(estado) && row.estado_pago==='PAGADO' ? 'X' : '';
```

Línea 145:
```typescript
estado_rendicion: estado === 'TERMINADA' ? 'RENDIDO' : (estado === 'ANULADA' ? 'ANULADA' : 'PENDIENTE'),
```

Línea 431:
```typescript
} else if (oc.estado === 'TERMINADA') {
```

(Verificar que `row.estado_pago` está disponible; si la query no la trae, agregarla al SELECT.)

- [ ] **Step 3: AlertasService.ts línea 373**

Cambiar:
```typescript
WHERE estado IN ('ENVIADA','RECIBIDA','RECIBIDA_PARCIAL')
```
Por:
```typescript
WHERE estado IN ('PAGO','RECEPCION')
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: errores solo en `index.ts` (rutas) y posiblemente en algún archivo restante. Si hay otros, repetir el patrón.

- [ ] **Step 5: Commit**

```bash
git add app/modules/finance/FinanceService.ts app/modules/compras/ROCService.ts app/modules/admin/AlertasService.ts
git commit -m "refactor(oc): adapta FinanceService/ROCService/AlertasService a estados nuevos

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## FASE C — Servicios para tablas auxiliares

### Task C1: HistorialOCService

**Files:**
- Create: `app/modules/compras/HistorialOCService.ts`

- [ ] **Step 1: Escribir el service**

Crear `app/modules/compras/HistorialOCService.ts`:

```typescript
import { db } from '../../../database/connection';

export interface HistorialEntry {
  id_historial: number;
  id_oc: number;
  estado_anterior: string | null;
  estado_nuevo: string;
  id_usuario: number | null;
  nombre_usuario?: string;
  fecha: string;
  comentario: string | null;
}

class HistorialOCService {
  async listar(id_oc: number): Promise<HistorialEntry[]> {
    const [rows]: any = await db.query(`
      SELECT h.id_historial, h.id_oc, h.estado_anterior, h.estado_nuevo,
             h.id_usuario, u.nombre AS nombre_usuario, h.fecha, h.comentario
        FROM OrdenCompraHistorial h
        LEFT JOIN Usuarios u ON u.id_usuario = h.id_usuario
       WHERE h.id_oc = ?
       ORDER BY h.fecha ASC
    `, [id_oc]);
    return rows as HistorialEntry[];
  }

  /**
   * Tiempo (en horas) que la OC pasó en cada estado. Útil para KPIs.
   */
  async tiemposPorFase(id_oc: number): Promise<Record<string, number>> {
    const entries = await this.listar(id_oc);
    const tiempos: Record<string, number> = {};
    for (let i = 0; i < entries.length - 1; i++) {
      const e = entries[i];
      const next = entries[i + 1];
      const horas = (new Date(next.fecha).getTime() - new Date(e.fecha).getTime()) / 3600000;
      tiempos[e.estado_nuevo] = (tiempos[e.estado_nuevo] || 0) + horas;
    }
    return tiempos;
  }
}

export default new HistorialOCService();
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: archivo nuevo compila sin errores propios.

- [ ] **Step 3: Commit**

```bash
git add app/modules/compras/HistorialOCService.ts
git commit -m "feat(oc): HistorialOCService — listar transiciones y calcular tiempos por fase

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C2: NotaOCService

**Files:**
- Create: `app/modules/compras/NotaOCService.ts`

- [ ] **Step 1: Escribir el service**

```typescript
import { db } from '../../../database/connection';

export interface NotaOC {
  id_nota: number;
  id_oc: number;
  id_usuario: number | null;
  nombre_usuario?: string;
  fecha: string;
  texto: string;
}

class NotaOCService {
  async crear(id_oc: number, id_usuario: number, texto: string): Promise<{ id_nota: number }> {
    const t = (texto || '').trim();
    if (!t) throw new Error('La nota no puede estar vacía');
    if (t.length > 2000) throw new Error('La nota excede 2000 caracteres');

    const [r]: any = await db.query(
      `INSERT INTO OrdenCompraNota (id_oc, id_usuario, texto) VALUES (?, ?, ?)`,
      [id_oc, id_usuario, t]
    );
    return { id_nota: r.insertId || r.lastID || 0 };
  }

  async listar(id_oc: number): Promise<NotaOC[]> {
    const [rows]: any = await db.query(`
      SELECT n.id_nota, n.id_oc, n.id_usuario, u.nombre AS nombre_usuario,
             n.fecha, n.texto
        FROM OrdenCompraNota n
        LEFT JOIN Usuarios u ON u.id_usuario = n.id_usuario
       WHERE n.id_oc = ?
       ORDER BY n.fecha DESC
    `, [id_oc]);
    return rows as NotaOC[];
  }

  async eliminar(id_nota: number, id_usuario: number, esGerente: boolean): Promise<void> {
    // Solo el autor o GERENTE puede borrar.
    const [rows]: any = await db.query(
      `SELECT id_usuario FROM OrdenCompraNota WHERE id_nota = ?`,
      [id_nota]
    );
    if (!rows[0]) throw new Error('Nota no encontrada');
    if (!esGerente && rows[0].id_usuario !== id_usuario) {
      throw new Error('No tienes permiso para borrar esta nota');
    }
    await db.query(`DELETE FROM OrdenCompraNota WHERE id_nota = ?`, [id_nota]);
  }
}

export default new NotaOCService();
```

- [ ] **Step 2: Verificar tipos + commit**

```bash
npx tsc --noEmit
git add app/modules/compras/NotaOCService.ts
git commit -m "feat(oc): NotaOCService — comentarios libres por OC con permisos

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C3: FacturaOCService — subida de comprobantes a Cloudinary

**Files:**
- Create: `app/modules/compras/FacturaOCService.ts`
- Modify: `app/modules/comercial/CloudinaryService.ts` — agregar método `subirFacturaOC` (si no existe ya un método genérico)

- [ ] **Step 1: Agregar método en CloudinaryService.ts**

Después de `subirFotoCotizacion`, agregar:

```typescript
async subirFacturaOC(buffer: Buffer, originalName: string): Promise<{ url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'metalengineers/oc-facturas/',
        resource_type: 'auto',  // soporta PDF e imágenes
        public_id: `factura_${Date.now()}_${originalName.replace(/\.[^.]+$/, '')}`,
      },
      (err, result) => {
        if (err || !result) return reject(err || new Error('Upload falló'));
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}
```

- [ ] **Step 2: Crear FacturaOCService**

```typescript
import { db } from '../../../database/connection';
import CloudinaryService from '../comercial/CloudinaryService';

export interface FacturaOC {
  id_factura_oc: number;
  id_oc: number;
  nro_comprobante: string;
  fecha_emision: string;
  monto: number;
  url_pdf: string | null;
  cloudinary_id: string | null;
}

class FacturaOCService {
  async subir(params: {
    id_oc: number;
    nro_comprobante: string;
    fecha_emision: string;
    monto: number;
    archivo?: { buffer: Buffer; originalname: string };
    id_usuario: number;
  }): Promise<{ id_factura_oc: number; url_pdf: string | null }> {
    if (!params.nro_comprobante?.trim()) throw new Error('Nro de comprobante requerido');
    if (!params.fecha_emision) throw new Error('Fecha de emisión requerida');
    if (!params.monto || params.monto <= 0) throw new Error('Monto debe ser mayor a 0');

    let url: string | null = null;
    let cloudId: string | null = null;
    if (params.archivo?.buffer) {
      const r = await CloudinaryService.subirFacturaOC(params.archivo.buffer, params.archivo.originalname);
      url = r.url;
      cloudId = r.public_id;
    }

    const [r]: any = await db.query(`
      INSERT INTO OrdenCompraFactura
        (id_oc, nro_comprobante, fecha_emision, monto, url_pdf, cloudinary_id, id_usuario_sube)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [params.id_oc, params.nro_comprobante.trim(), params.fecha_emision, params.monto, url, cloudId, params.id_usuario]);

    // Marcar OC como facturada
    await db.query(
      `UPDATE OrdenesCompra SET estado_factura='FACTURADA', facturada_at=NOW() WHERE id_oc=?`,
      [params.id_oc]
    );

    return { id_factura_oc: r.insertId || r.lastID || 0, url_pdf: url };
  }

  async getDeOC(id_oc: number): Promise<FacturaOC | null> {
    const [rows]: any = await db.query(
      `SELECT * FROM OrdenCompraFactura WHERE id_oc = ?`,
      [id_oc]
    );
    return rows[0] || null;
  }
}

export default new FacturaOCService();
```

- [ ] **Step 3: Verificar tipos + commit**

```bash
npx tsc --noEmit
git add app/modules/compras/FacturaOCService.ts app/modules/comercial/CloudinaryService.ts
git commit -m "feat(oc): FacturaOCService — subir factura proveedor a Cloudinary y registrar en BD

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## FASE D — Rutas API

### Task D1: Endpoints nuevos en index.ts

**Files:**
- Modify: `index.ts` (sección ocRouter, líneas ~1538-1730)

- [ ] **Step 1: Importar los nuevos services en index.ts**

Cerca de los otros imports de OC (buscar `OrdenCompraService`):

```typescript
import HistorialOCService from './app/modules/compras/HistorialOCService';
import NotaOCService from './app/modules/compras/NotaOCService';
import FacturaOCService from './app/modules/compras/FacturaOCService';
import multer from 'multer';
```

Definir el upload handler (cerca de otros `multer`):

```typescript
const ocFacturaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['application/pdf','image/jpeg','image/png','image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Solo PDF/JPG/PNG/WebP'), ok);
  }
});
```

- [ ] **Step 2: Cambiar la ruta `/enviar` por `/marcar-credito`**

Eliminar la ruta `ocRouter.post('/:id/enviar', ...)` (líneas ~1610-1612). Agregar en su lugar:

```typescript
ocRouter.post('/:id/marcar-credito', validateIdParam, auditLog('OrdenCompra', 'MARCAR_CREDITO'), async (req: any, res: Response) => {
  const id_oc = Number(req.params.id);
  const { dias_credito, fecha_vence } = req.body || {};
  const r = await OrdenCompraService.marcarCredito(id_oc, {
    dias_credito,
    fecha_vence,
    id_usuario: req.user?.id_usuario
  });
  res.json(r);
});
```

- [ ] **Step 3: Agregar rutas de notas**

Después de la ruta de `cerrar-sin-factura`:

```typescript
ocRouter.get('/:id/notas', validateIdParam, async (req: Request, res: Response) => {
  const notas = await NotaOCService.listar(Number(req.params.id));
  res.json(notas);
});

ocRouter.post('/:id/notas', validateIdParam, auditLog('OrdenCompra', 'AGREGAR_NOTA'), async (req: any, res: Response) => {
  const r = await NotaOCService.crear(Number(req.params.id), req.user.id_usuario, req.body?.texto);
  res.json(r);
});

ocRouter.delete('/:id/notas/:id_nota', validateIdParam, async (req: any, res: Response) => {
  await NotaOCService.eliminar(
    Number(req.params.id_nota),
    req.user.id_usuario,
    req.user.rol === 'GERENTE'
  );
  res.json({ success: true });
});
```

- [ ] **Step 4: Agregar rutas de historial**

```typescript
ocRouter.get('/:id/historial', validateIdParam, async (req: Request, res: Response) => {
  const h = await HistorialOCService.listar(Number(req.params.id));
  res.json(h);
});
```

- [ ] **Step 5: Agregar ruta de subir factura**

```typescript
ocRouter.post('/:id/factura', validateIdParam, ocFacturaUpload.single('archivo'),
  auditLog('OrdenCompra', 'SUBIR_FACTURA'), async (req: any, res: Response) => {
  const id_oc = Number(req.params.id);
  const { nro_comprobante, fecha_emision, monto } = req.body;
  const r = await FacturaOCService.subir({
    id_oc,
    nro_comprobante,
    fecha_emision,
    monto: Number(monto),
    archivo: req.file ? { buffer: req.file.buffer, originalname: req.file.originalname } : undefined,
    id_usuario: req.user.id_usuario
  });
  res.json(r);
});

ocRouter.get('/:id/factura', validateIdParam, async (req: Request, res: Response) => {
  const f = await FacturaOCService.getDeOC(Number(req.params.id));
  res.json(f);
});
```

- [ ] **Step 6: Agregar ruta de export Excel**

Después de las rutas anteriores:

```typescript
import ExcelJS from 'exceljs';

ocRouter.get('/listado/excel', async (req: Request, res: Response) => {
  // Reusar getListadoCompleto del service (si no existe, agregarla en OrdenCompraService).
  const ocs = await OrdenCompraService.listar({}); // sin filtros — exporta todo
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('OCs');
  ws.columns = [
    { header: 'Nro OC',       key: 'nro_oc',       width: 16 },
    { header: 'Fecha',        key: 'fecha_emision',width: 12 },
    { header: 'Proveedor',    key: 'proveedor',    width: 36 },
    { header: 'Centro Costo', key: 'centro_costo', width: 18 },
    { header: 'Marca',        key: 'empresa',      width: 8 },
    { header: 'Moneda',       key: 'moneda',       width: 8 },
    { header: 'Total',        key: 'total',        width: 14 },
    { header: 'Estado',       key: 'estado',       width: 22 },
    { header: 'Estado Pago',  key: 'estado_pago',  width: 14 },
    { header: 'Estado Fact.', key: 'estado_factura', width: 14 },
    { header: 'Forma Pago',   key: 'forma_pago',   width: 12 },
    { header: 'Crédito Vence',key: 'fecha_credito_vence', width: 14 },
    { header: 'Pagada At',    key: 'pagada_at',    width: 18 },
    { header: 'Facturada At', key: 'facturada_at', width: 18 },
  ];
  ws.addRows(ocs);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="OCs_${new Date().toISOString().slice(0,10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});
```

- [ ] **Step 7: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: limpio. Si `OrdenCompraService.listar({})` no existe con esa firma, hacer el ajuste correspondiente o crear un método `getListadoCompleto()`.

- [ ] **Step 8: Smoke test endpoints**

Levantar `npm run dev` en otra ventana. Con `curl` (o Postman) hacer:

```bash
# Login para obtener token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"julio@metalengineers.com.pe","password":"Metal2026!"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Listar notas de OC 1
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/ordenes-compra/1/notas

# Historial
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/ordenes-compra/1/historial
```

Esperado: respuestas JSON sin errores 500.

- [ ] **Step 9: Commit**

```bash
git add index.ts
git commit -m "feat(oc): rutas API para notas, historial, factura, marcar-credito y export Excel

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## FASE E — Alertas

### Task E1: Agregar 5 alertas nuevas en AlertasService

**Files:**
- Modify: `app/modules/admin/AlertasService.ts`

- [ ] **Step 1: Extender el type `tipo` con los 5 nuevos**

En la línea ~22-28:

```typescript
tipo:
  | 'STOCK' | 'OC_VENCIDA' | 'COBRANZA_VENCIDA' | 'CUENTA_PAGAR_VENCIDA'
  | 'COTIZACION_PENDIENTE' | 'DETRACCION_PENDIENTE'
  | 'PRESTAMO_OTORGADO_VENCIDO' | 'PRESTAMO_TOMADO_PROXIMO'
  | 'CAJA_BAJA' | 'IGV_PROXIMO'
  | 'COTIZACION_SIN_FACTURAR' | 'TRABAJO_NO_INICIADO'
  | 'OC_BORRADOR_OLVIDADA' | 'INVENTARIO_MUERTO'
  // Nuevas (mig 062 — rediseño kanban OC)
  | 'OC_DEUDA_PROVEEDOR'
  | 'OC_PAGO_SIN_RECEPCION'
  | 'OC_CREDITO_POR_VENCER'
  | 'OC_SIN_FACTURA_PROVEEDOR'
  | 'OC_CERRADAS_SIN_FACT_MES';
```

- [ ] **Step 2: Agregar bloque de alertas en `_computeAll`**

Dentro de `_computeAll`, en el bloque LOGISTICA, agregar después de las alertas existentes:

```typescript
// ═══════════════════════════════════════════════════════════
// LOGISTICA — Alertas del rediseño kanban (mig 062)
// ═══════════════════════════════════════════════════════════
const UMBRAL = 15;

// 1. Deudas a proveedor sin pagar > 15 días
const [deudas]: any = await db.query(`
  SELECT oc.id_oc, oc.nro_oc, p.razon_social,
         (oc.total - COALESCE(oc.monto_pagado, 0)) AS saldo,
         oc.created_at
    FROM OrdenesCompra oc
    JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
   WHERE oc.estado_pago IN ('PENDIENTE','PARCIAL')
     AND oc.estado NOT IN ('BORRADOR','ANULADA','TERMINADA','CERRADA_SIN_FACTURA')
     AND oc.created_at < (CURRENT_TIMESTAMP - INTERVAL '${UMBRAL} days')
   ORDER BY oc.created_at ASC
   LIMIT 10
`);
for (const r of deudas as any[]) {
  alertas.push({
    id: `oc-deuda-${r.id_oc}`,
    modulo: 'LOGISTICA',
    tipo: 'OC_DEUDA_PROVEEDOR',
    severidad: 'danger',
    titulo: `💸 Deuda con ${r.razon_social}`,
    detalle: `OC ${r.nro_oc} · saldo S/ ${Number(r.saldo).toFixed(2)} · creada hace +${UMBRAL}d`,
    link: `#logistica/oc?id=${r.id_oc}`,
  });
}

// 2. Pago hecho sin recepción > 15 días
const [pagosSinRec]: any = await db.query(`
  SELECT oc.id_oc, oc.nro_oc, p.razon_social, oc.total, oc.pagada_at,
         SUM(d.cantidad_recibida) AS recibido,
         SUM(d.cantidad) AS pedido
    FROM OrdenesCompra oc
    JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
    JOIN DetalleOrdenCompra d ON d.id_oc = oc.id_oc
   WHERE oc.estado_pago='PAGADO'
     AND oc.pagada_at < (CURRENT_TIMESTAMP - INTERVAL '${UMBRAL} days')
     AND oc.estado NOT IN ('TERMINADA','CERRADA_SIN_FACTURA','ANULADA')
   GROUP BY oc.id_oc, oc.nro_oc, p.razon_social, oc.total, oc.pagada_at
   HAVING SUM(d.cantidad_recibida) < SUM(d.cantidad)
   LIMIT 10
`);
for (const r of pagosSinRec as any[]) {
  alertas.push({
    id: `oc-pago-sin-rec-${r.id_oc}`,
    modulo: 'LOGISTICA',
    tipo: 'OC_PAGO_SIN_RECEPCION',
    severidad: 'danger',
    titulo: `📦❌ Pagamos pero no recibimos`,
    detalle: `OC ${r.nro_oc} · ${r.razon_social} · S/ ${Number(r.total).toFixed(2)} pagada hace +${UMBRAL}d`,
    link: `#logistica/oc?id=${r.id_oc}`,
  });
}

// 3. Crédito por vencer (en los próximos 15 días)
const [credPorVenc]: any = await db.query(`
  SELECT oc.id_oc, oc.nro_oc, p.razon_social, oc.total, oc.fecha_credito_vence
    FROM OrdenesCompra oc
    JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
   WHERE oc.forma_pago='CREDITO'
     AND oc.estado_pago <> 'PAGADO'
     AND oc.fecha_credito_vence IS NOT NULL
     AND oc.fecha_credito_vence <= (CURRENT_DATE + INTERVAL '${UMBRAL} days')
   ORDER BY oc.fecha_credito_vence ASC
   LIMIT 10
`);
for (const r of credPorVenc as any[]) {
  alertas.push({
    id: `oc-cred-${r.id_oc}`,
    modulo: 'LOGISTICA',
    tipo: 'OC_CREDITO_POR_VENCER',
    severidad: 'warn',
    titulo: `📅 Crédito vence ${r.fecha_credito_vence}`,
    detalle: `OC ${r.nro_oc} · ${r.razon_social} · S/ ${Number(r.total).toFixed(2)}`,
    link: `#logistica/oc?id=${r.id_oc}`,
  });
}

// 4. OCs en facturación sin factura del proveedor > 15 días
const [sinFact]: any = await db.query(`
  SELECT oc.id_oc, oc.nro_oc, p.razon_social, oc.updated_at
    FROM OrdenesCompra oc
    JOIN Proveedores p ON p.id_proveedor = oc.id_proveedor
   WHERE oc.estado='FACTURACION'
     AND oc.estado_factura='PENDIENTE'
     AND oc.updated_at < (CURRENT_TIMESTAMP - INTERVAL '${UMBRAL} days')
   ORDER BY oc.updated_at ASC
   LIMIT 10
`);
for (const r of sinFact as any[]) {
  alertas.push({
    id: `oc-sin-fact-${r.id_oc}`,
    modulo: 'LOGISTICA',
    tipo: 'OC_SIN_FACTURA_PROVEEDOR',
    severidad: 'warn',
    titulo: `📄❌ Falta factura del proveedor`,
    detalle: `OC ${r.nro_oc} · ${r.razon_social} · esperando hace +${UMBRAL}d`,
    link: `#logistica/oc?id=${r.id_oc}`,
  });
}

// 5. OCs cerradas sin factura este mes (info para Gerencia)
const [cerradasMes]: any = await db.query(`
  SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS monto
    FROM OrdenesCompra
   WHERE estado='CERRADA_SIN_FACTURA'
     AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE)
`);
const cnt = Number(cerradasMes[0]?.cnt || 0);
if (cnt > 0) {
  alertas.push({
    id: `oc-cerradas-sin-fact-mes`,
    modulo: 'LOGISTICA',
    tipo: 'OC_CERRADAS_SIN_FACT_MES',
    severidad: 'info',
    titulo: `📊 ${cnt} OCs cerradas sin factura este mes`,
    detalle: `Monto total S/ ${Number(cerradasMes[0].monto).toFixed(2)} · IGV no recuperable`,
    link: `#logistica/oc?filtro=cerradas_sin_factura`,
  });
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: limpio.

- [ ] **Step 4: Smoke test**

Levantar el server y consultar:
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/alertas
```
Esperado: array de alertas que incluye los nuevos tipos según el estado de la BD.

- [ ] **Step 5: Commit**

```bash
git add app/modules/admin/AlertasService.ts
git commit -m "feat(alertas): 5 alertas nuevas para kanban OC con cascada a Gerencia (umbral 15d)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## FASE F — Frontend kanban

> **Importante:** el kanban de OC está en `public/js/pages/OrdenesCompra.js` (no en Logistica.js). Logistica.js solo delega a este módulo via `renderTabOC` (línea ~128). Las tareas F1-F4 trabajan sobre `OrdenesCompra.js`.

### Task F1: Reescribir kanban en OrdenesCompra.js — estados y constantes

**Files:**
- Modify: `public/js/pages/OrdenesCompra.js`

- [ ] **Step 1: Reescribir `ESTADO_COLOR` (líneas 17-28)**

En `OrdenesCompra.js` reemplazar el objeto `ESTADO_COLOR` por la definición nueva. Eliminar BORRADOR, APROBADA, ENVIADA, RECIBIDA_PARCIAL, RECIBIDA, FACTURADA, PAGADA_PEND_FACTURA, PAGADA, ANULADA, CERRADA_SIN_FACTURA y reemplazar por:

```javascript
const ESTADO_COLOR = {
  BORRADOR:           { bg: '#f3f4f6', fg: '#374151', icon: '📝', label: 'Borrador' },
  APROBADA:           { bg: '#dbeafe', fg: '#1e3a8a', icon: '✅', label: 'Aprobada' },
  PAGO:               { bg: '#fee2e2', fg: '#991b1b', icon: '💰', label: 'Pago' },
  RECEPCION:          { bg: '#fef9c3', fg: '#713f12', icon: '📦', label: 'Recepción' },
  FACTURACION:        { bg: '#fef3c7', fg: '#854d0e', icon: '🧾', label: 'Facturación' },
  TERMINADA:          { bg: '#dcfce7', fg: '#166534', icon: '✓', label: 'Terminada' },
  CERRADA_SIN_FACTURA:{ bg: '#fce7f3', fg: '#9d174d', icon: '🗂', label: 'Cerrada sin factura' },
  ANULADA:            { bg: '#e5e7eb', fg: '#6b7280', icon: '❌', label: 'Anulada' },
};
const COLUMNAS_KANBAN_PRINCIPALES = [
  'BORRADOR','APROBADA','PAGO','RECEPCION','FACTURACION','TERMINADA'
];
const COLUMNAS_KANBAN_TERMINALES = ['CERRADA_SIN_FACTURA','ANULADA'];
```

- [ ] **Step 2: Actualizar el doc-comment del header del archivo (líneas 1-9)**

Reemplazar:
```javascript
/**
 * OrdenesCompra.js — Módulo 📋 Órdenes de Compra
 *
 * Workflow estándar ERP mundial (SAP B1 / Odoo / Epicor):
 *   BORRADOR → APROBADA → ENVIADA → RECIBIDA_PARCIAL → RECIBIDA → FACTURADA → PAGADA
 *              (o ANULADA si no llegó a FACTURADA)
 *
 * Vista kanban con columnas por estado para flujo visual.
 */
```
Por:
```javascript
/**
 * OrdenesCompra.js — Módulo 📋 Órdenes de Compra (rediseño 2026-05-06)
 *
 * State machine simplificado:
 *   BORRADOR → APROBADA → PAGO → RECEPCION → FACTURACION → TERMINADA
 *                                                       ↘ CERRADA_SIN_FACTURA
 *                                       (o ANULADA en pasos previos a FACTURACION)
 *
 * Card lleva dot semáforo (🔴/🟠/🟢) según fase + badges para problemas heredados.
 * Spec: docs/superpowers/specs/2026-05-06-logistica-kanban-rediseno-design.md
 */
```

- [ ] **Step 3: Actualizar listas de estados a lo largo del archivo**

Buscar y reemplazar en `OrdenesCompra.js`:

**Línea ~433-435 (lista de columnas del kanban):**
```javascript
'BORRADOR', 'APROBADA', 'ENVIADA',
'RECIBIDA_PARCIAL', 'RECIBIDA',
'FACTURADA', 'PAGADA_PEND_FACTURA', 'PAGADA',
```
Reemplazar por:
```javascript
'BORRADOR', 'APROBADA', 'PAGO', 'RECEPCION', 'FACTURACION', 'TERMINADA',
```

**Línea ~552 (KPI por recibir):**
```javascript
const porRecibir = _ocs.filter(o => ['APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL'].includes(o.estado)).length;
```
Cambiar a:
```javascript
const porRecibir = _ocs.filter(o => ['PAGO', 'RECEPCION'].includes(o.estado)).length;
```

**Línea ~553 (KPI por facturar):**
```javascript
const porFacturar = _ocs.filter(o => ['RECIBIDA', 'RECIBIDA_PARCIAL'].includes(o.estado)).length;
```
Cambiar a:
```javascript
const porFacturar = _ocs.filter(o => o.estado === 'FACTURACION' && o.estado_factura === 'PENDIENTE').length;
```

**Línea ~702 (gate de recepción):**
```javascript
if (['APROBADA', 'ENVIADA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
```
Cambiar a:
```javascript
if (['PAGO', 'RECEPCION'].includes(oc.estado)) {
```

**Línea ~711 (gate de facturación desde recepción):**
```javascript
if (['RECIBIDA', 'RECIBIDA_PARCIAL'].includes(oc.estado)) {
```
Cambiar a:
```javascript
if (oc.estado === 'RECEPCION' && oc.estado_recepcion === 'RECIBIDO') {
```

**Línea ~721, 726 (PAGADA_PEND_FACTURA → FACTURACION pendiente):**
```javascript
if (oc.estado === 'PAGADA_PEND_FACTURA') {
```
Cambiar a:
```javascript
if (oc.estado === 'FACTURACION' && oc.estado_factura === 'PENDIENTE' && oc.estado_pago === 'PAGADO') {
```

**Línea ~737, 1403 (gate de anular):**
```javascript
if (['BORRADOR', 'APROBADA', 'ENVIADA'].includes(oc.estado)) {
```
Cambiar a:
```javascript
if (['BORRADOR', 'APROBADA', 'PAGO'].includes(oc.estado)) {
```

**Línea ~750 (cuando ya no se puede registrar pago):**
```javascript
if (!['FACTURADA', 'PAGADA_PEND_FACTURA', 'PAGADA', 'ANULADA'].includes(oc.estado)) {
```
Cambiar a:
```javascript
if (!['TERMINADA', 'ANULADA', 'CERRADA_SIN_FACTURA'].includes(oc.estado)) {
```

**Línea ~803 (es primera acción):**
```javascript
const esPrimera = ['APROBADA', 'ENVIADA'].includes(oc.estado);
```
Cambiar a:
```javascript
const esPrimera = ['APROBADA', 'PAGO'].includes(oc.estado);
```

**Línea ~1235 (estado pagada):**
```javascript
if (r.estado === 'PAGADA') {
```
Cambiar a:
```javascript
if (r.estado === 'TERMINADA') {
```

- [ ] **Step 4: Verificar visualmente en preview**

Levantar el server, abrir Logística → OC → tab Kanban por Estado. Esperado: las columnas viejas (ENVIADA, RECIBIDA_PARCIAL, etc.) ya no aparecen. Aparecen las 6 columnas nuevas. Los cards migrados desde la mig 062 caen en la columna correcta.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/OrdenesCompra.js
git commit -m "refactor(oc): mapa de estados nuevos en kanban OC

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F2: Filtros + layout sticky + altura limitada

**Files:**
- Modify: `public/js/pages/OrdenesCompra.js` (función `renderKanban` línea ~427)
- Modify: `public/css/main.css` (estilos kanban)

- [ ] **Step 1: Localizar `renderKanban` línea 427**

Esta es la función que pinta el kanban completo. Vamos a agregar arriba un bloque de filtros y modificar el grid de columnas para 6 columnas + sticky.

- [ ] **Step 2: Agregar el bloque de filtros arriba del kanban**

En la función identificada, agregar al inicio del HTML generado:

```javascript
const html = `
  <div class="kanban-filtros">
    <label>Centro de costo:
      <select id="filtroCentroCosto">
        <option value="">Todos</option>
        ${centrosCosto.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
    </label>
    <label>Mes/Año:
      <select id="filtroMesAnio">
        ${mesesDisponibles.map(m => `<option value="${m.value}" ${m.value === mesActual ? 'selected' : ''}>${m.label}</option>`).join('')}
      </select>
    </label>
    <label class="check">
      <input type="checkbox" id="filtroSoloProblemas"> Solo problemas
    </label>
    <button id="btnExportExcel" class="btn-secondary">📊 Exportar Excel</button>
  </div>
  <div class="kanban-board" id="kanbanBoard">
    ${COLUMNAS_KANBAN_PRINCIPALES.map(col => `
      <div class="kanban-column" data-estado="${col}">
        <h3 class="kanban-header">${ESTADOS_OC[col].label} <span class="count">0</span></h3>
        <div class="kanban-cards" id="cards-${col}"></div>
      </div>
    `).join('')}
  </div>
`;
```

(Adaptar `centrosCosto`, `mesesDisponibles`, `mesActual` según los datos disponibles. Los meses pueden derivarse de las fechas de OCs cargadas.)

- [ ] **Step 3: Agregar handlers de los filtros**

Después de inyectar el HTML:

```javascript
document.getElementById('filtroCentroCosto').addEventListener('change', aplicarFiltros);
document.getElementById('filtroMesAnio').addEventListener('change', aplicarFiltros);
document.getElementById('filtroSoloProblemas').addEventListener('change', aplicarFiltros);
document.getElementById('btnExportExcel').addEventListener('click', () => {
  window.open('/api/ordenes-compra/listado/excel', '_blank');
});

function aplicarFiltros() {
  const cc = document.getElementById('filtroCentroCosto').value;
  const mes = document.getElementById('filtroMesAnio').value;
  const soloProblemas = document.getElementById('filtroSoloProblemas').checked;
  const filtradas = _ocs.filter(oc => {
    if (cc && oc.centro_costo !== cc) return false;
    if (mes && !oc.fecha_emision.startsWith(mes)) return false;
    if (soloProblemas && !tieneProblema(oc)) return false;
    return true;
  });
  pintarKanban(filtradas);
}

function tieneProblema(oc) {
  return ['PARCIAL','PENDIENTE'].includes(oc.estado_pago)
      || (oc.forma_pago === 'CREDITO' && oc.estado_pago !== 'PAGADO')
      || (oc.estado === 'FACTURACION' && oc.estado_factura === 'PENDIENTE');
}
```

- [ ] **Step 4: CSS — sticky headers y altura limitada**

Agregar al CSS (en `public/css/main.css` o crear `public/css/components/kanban.css` si querés separar):

```css
.kanban-filtros {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-app);
  border-bottom: 1px solid #e5e7eb;
  flex-wrap: wrap;
}
.kanban-filtros label { display: flex; gap: 6px; align-items: center; font-size: 13px; }
.kanban-filtros .check { user-select: none; }
.kanban-filtros select { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; }

.kanban-board {
  display: grid;
  grid-template-columns: repeat(6, minmax(180px, 1fr));
  gap: 12px;
  padding: 16px;
  max-height: calc(100vh - 240px); /* header + tabs + filtros + margen */
  overflow: hidden;
}
.kanban-column {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.kanban-header {
  position: sticky;
  top: 0;
  background: #f9fafb;
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid #e5e7eb;
  z-index: 1;
}
.kanban-header .count {
  background: #e5e7eb;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
  margin-left: 6px;
}
.kanban-cards {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 5: Verificar visualmente**

Reload preview. Esperado: filtros arriba, 6 columnas, headers fijos al scrollear dentro de una columna, kanban no excede la pantalla.

- [ ] **Step 6: Commit**

```bash
git add public/js/pages/OrdenesCompra.js public/css/main.css
git commit -m "feat(oc): filtros centro/mes + sticky headers + altura limitada en kanban

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F3: Diseño de card con dot semáforo y badges

**Files:**
- Modify: `public/js/pages/OrdenesCompra.js`
- Modify: CSS (mismo archivo de la task anterior)

- [ ] **Step 1: Función que renderiza un card individual**

Reemplazar la función actual de render del card por:

```javascript
function renderOCCard(oc) {
  const dotColor = calcularDotColor(oc);
  const badges = calcularBadges(oc);

  return `
    <div class="oc-card" data-id="${oc.id_oc}" onclick="abrirDetalleOC(${oc.id_oc})">
      <div class="oc-card-header">
        <span class="oc-dot ${dotColor}" title="${dotTitle(oc)}"></span>
        <span class="oc-nro">${oc.nro_oc}</span>
        <span class="oc-marca">${oc.empresa}</span>
      </div>
      <div class="oc-proveedor">${escapeHtml(oc.razon_social || '—')}</div>
      <div class="oc-fila">
        <span>${oc.fecha_emision}</span>
        <span class="oc-monto">${oc.moneda === 'USD' ? '$' : 'S/'} ${Number(oc.total).toFixed(2)}</span>
      </div>
      ${badges.map(b => `<div class="oc-badge ${b.tipo}">${b.texto}</div>`).join('')}
      <div class="oc-acciones">${renderAcciones(oc)}</div>
    </div>
  `;
}

function calcularDotColor(oc) {
  switch (oc.estado) {
    case 'APROBADA':    return 'dot-neutro';
    case 'PAGO':        return 'dot-rojo';
    case 'RECEPCION': {
      const r = oc.estado_recepcion || 'NO_RECIBIDO';
      if (r === 'RECIBIDO') return 'dot-verde';
      if (r === 'PARCIAL')  return 'dot-naranja';
      return 'dot-rojo';
    }
    case 'FACTURACION': return oc.estado_factura === 'FACTURADA' ? 'dot-verde' : 'dot-rojo';
    case 'TERMINADA':   return 'dot-verde';
    case 'CERRADA_SIN_FACTURA': return 'dot-gris';
    case 'ANULADA':     return 'dot-gris';
    default: return 'dot-neutro';
  }
}

function calcularBadges(oc) {
  const bs = [];
  // Saldo pendiente
  if (oc.estado_pago === 'PARCIAL') {
    const saldo = Number(oc.total) - Number(oc.monto_pagado || 0);
    bs.push({ tipo: 'warn', texto: `⚠ Saldo S/ ${saldo.toFixed(2)} pdte` });
  }
  // Crédito vence
  if (oc.forma_pago === 'CREDITO' && oc.estado_pago !== 'PAGADO' && oc.fecha_credito_vence) {
    bs.push({ tipo: 'warn', texto: `⚠ Crédito vence ${oc.fecha_credito_vence}` });
  }
  // Demora en recepción
  if (oc.estado === 'RECEPCION' && oc.estado_pago === 'PAGADO' && oc.pagada_at) {
    const dias = Math.floor((Date.now() - new Date(oc.pagada_at).getTime()) / 86400000);
    if (dias > 15) bs.push({ tipo: 'danger', texto: `⚠ Sin recibir hace ${dias}d` });
  }
  // Demora en factura
  if (oc.estado === 'FACTURACION' && oc.estado_factura === 'PENDIENTE') {
    const dias = Math.floor((Date.now() - new Date(oc.updated_at).getTime()) / 86400000);
    if (dias > 15) bs.push({ tipo: 'warn', texto: `⚠ Sin factura hace ${dias}d` });
  }
  return bs;
}

function dotTitle(oc) {
  return `Estado: ${oc.estado} · Pago: ${oc.estado_pago || '-'} · Factura: ${oc.estado_factura || '-'}`;
}
```

- [ ] **Step 2: CSS de los dots y badges**

Agregar a `main.css`:

```css
.oc-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: box-shadow .15s;
}
.oc-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,.08); }
.oc-card-header { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.oc-card-header .oc-marca {
  margin-left: auto;
  background: #e5e7eb;
  color: #374151;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}
.oc-proveedor { color: #4b5563; font-size: 11px; margin: 2px 0; }
.oc-fila { display: flex; justify-content: space-between; color: #6b7280; font-size: 11px; }
.oc-monto { font-weight: 600; color: #111827; }

.oc-dot {
  width: 10px; height: 10px; border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.oc-dot.dot-rojo    { background: #ef4444; }
.oc-dot.dot-naranja { background: #f59e0b; }
.oc-dot.dot-verde   { background: #10b981; }
.oc-dot.dot-gris    { background: #9ca3af; }
.oc-dot.dot-neutro  { background: #e5e7eb; border: 1px solid #d1d5db; }

.oc-badge {
  display: block;
  margin-top: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
}
.oc-badge.warn   { background: #fef3c7; color: #92400e; }
.oc-badge.danger { background: #fee2e2; color: #991b1b; }

.oc-acciones { margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap; }
.oc-acciones button {
  background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 3px;
  padding: 2px 6px; font-size: 10px; cursor: pointer;
}
.oc-acciones button:hover { background: #e5e7eb; }
```

- [ ] **Step 3: Verificar que el backend devuelve `estado_recepcion`**

El endpoint `GET /api/ordenes-compra/` debe devolver `estado_recepcion` calculado en runtime. Si no lo hace, modificar `OrdenCompraService.listar()` para incluirlo. El SQL puede ser:

```sql
SELECT oc.*,
       CASE
         WHEN COALESCE(SUM(d.cantidad_recibida), 0) <= 0.0001 THEN 'NO_RECIBIDO'
         WHEN COALESCE(SUM(d.cantidad_recibida), 0) >= COALESCE(SUM(d.cantidad), 0) - 0.0001 THEN 'RECIBIDO'
         ELSE 'PARCIAL'
       END AS estado_recepcion
  FROM OrdenesCompra oc
  LEFT JOIN DetalleOrdenCompra d ON d.id_oc = oc.id_oc
 GROUP BY oc.id_oc
```

- [ ] **Step 4: Smoke test visual**

Reload. Esperado: cada card muestra dot color correcto + badges si aplica + monto bien formateado.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/OrdenesCompra.js public/css/main.css
git commit -m "feat(oc): card con dot semáforo + badges + estado_recepcion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F4: Acciones rápidas y modales

**Files:**
- Modify: `public/js/pages/OrdenesCompra.js`

- [ ] **Step 1: Función `renderAcciones`**

```javascript
function renderAcciones(oc) {
  const btns = [];
  switch (oc.estado) {
    case 'BORRADOR':
      btns.push(btnAccion('aprobar',     '✓',  'Aprobar', oc.id_oc));
      btns.push(btnAccion('editar',      '✎',  'Editar',  oc.id_oc));
      btns.push(btnAccion('anular',      '🚫', 'Anular',  oc.id_oc));
      break;
    case 'APROBADA':
    case 'PAGO':
      btns.push(btnAccion('registrarPago', '💰', 'Registrar pago', oc.id_oc));
      btns.push(btnAccion('marcarCredito', '💳', 'Marcar crédito', oc.id_oc));
      btns.push(btnAccion('agregarNota',   '📝', 'Nota',           oc.id_oc));
      btns.push(btnAccion('anular',        '🚫', 'Anular',         oc.id_oc));
      break;
    case 'RECEPCION':
      btns.push(btnAccion('marcarRecibido',  '📦', 'Recibir',        oc.id_oc));
      if (oc.estado_pago !== 'PAGADO')
        btns.push(btnAccion('registrarPago', '💰', 'Pagar saldo',    oc.id_oc));
      btns.push(btnAccion('agregarNota',     '📝', 'Nota',           oc.id_oc));
      btns.push(btnAccion('cerrarSinFact',   '🚫', 'Cerrar s/ fact.',oc.id_oc));
      break;
    case 'FACTURACION':
      btns.push(btnAccion('subirFactura',    '📄', 'Subir factura',  oc.id_oc));
      if (oc.estado_pago !== 'PAGADO')
        btns.push(btnAccion('registrarPago', '💰', 'Pagar saldo',    oc.id_oc));
      btns.push(btnAccion('agregarNota',     '📝', 'Nota',           oc.id_oc));
      btns.push(btnAccion('cerrarSinFact',   '🚫', 'Cerrar s/ fact.',oc.id_oc));
      break;
    case 'TERMINADA':
      btns.push(btnAccion('agregarNota',     '📝', 'Nota',           oc.id_oc));
      break;
  }
  return btns.join('');
}

function btnAccion(fn, icon, label, id) {
  return `<button onclick="event.stopPropagation(); window.OC.${fn}(${id})" title="${label}">${icon}</button>`;
}
```

- [ ] **Step 2: Extender los handlers en `window.OC`**

`window.OC` ya existe (línea ~275). Hay que **agregar** los métodos nuevos sin pisar los existentes (`nuevaOC, verOC, aprobar, enviar, recibir, facturar, registrarPago, cerrarSinFactura, ...`). Reemplazar `enviar` por `marcarCredito` ya que ENVIADA no existe más. Agregar los métodos nuevos:

```javascript
// Reemplazar/extender el window.OC existente
Object.assign(window.OC, {
  async marcarCredito(id) {
    const dias = await promptModal({ titulo:'Marcar crédito', label:'Días de crédito', defecto:30 });
    if (dias == null) return;
    const fecha = new Date(Date.now() + Number(dias) * 86400000).toISOString().slice(0,10);
    await api.oc.marcarCredito(id, { dias_credito: Number(dias), fecha_vence: fecha });
    showSuccess(`Crédito vence ${fecha}`);
    recargarKanban();
  },

  async subirFactura(id) {
    abrirModalSubirFactura(id);
  },

  async agregarNota(id) {
    const texto = await promptModal({ titulo:'Agregar nota', label:'Texto', textarea:true, requerido:true });
    if (!texto) return;
    await api.oc.agregarNota(id, texto);
    showSuccess('Nota guardada');
  },
});

// Adicionalmente, los handlers existentes (aprobar, registrarPago, recibir, facturar,
// cerrarSinFactura, anular) ya funcionan — sólo verificar que los gates de estado
// adentro de OrdenCompraService coinciden con los nuevos (eso ya se hizo en B2).
```

Borrar el método obsoleto `enviar` del `window.OC` (línea ~275) ya que ENVIADA fue eliminada.
    const ok = await confirmarAccion({ titulo:'Aprobar OC', mensaje:'¿Confirmás aprobar y enviar a fase de pago?', tipo:'info' });
    if (!ok) return;
    await api.oc.aprobar(id);
    showSuccess('OC aprobada — pasó a PAGO');
    recargarKanban();
  },

  async marcarCredito(id) {
    const dias = await promptModal({ titulo:'Marcar crédito', label:'Días de crédito', defecto:30 });
    if (dias == null) return;
    const fecha = new Date(Date.now() + Number(dias) * 86400000).toISOString().slice(0,10);
    await api.oc.marcarCredito(id, { dias_credito: Number(dias), fecha_vence: fecha });
    showSuccess(`Crédito vence ${fecha}`);
    recargarKanban();
  },

  async registrarPago(id) {
    abrirModalRegistrarPago(id); // función ya existe en OrdenesCompra.js, no romper
  },

  async marcarRecibido(id) {
    abrirModalRecepcion(id); // función ya existe
  },

  async subirFactura(id) {
    abrirModalSubirFactura(id); // nueva
  },

  async cerrarSinFact(id) {
    const motivo = await promptModal({ titulo:'Cerrar sin factura', label:'Motivo', textarea:true, requerido:true });
    if (!motivo) return;
    await api.oc.cerrarSinFactura(id, { motivo, forma_pago_real: 'EFECTIVO' });
    showSuccess('OC cerrada sin factura');
    recargarKanban();
  },

  async agregarNota(id) {
    const texto = await promptModal({ titulo:'Agregar nota', label:'Texto', textarea:true, requerido:true });
    if (!texto) return;
    await api.oc.agregarNota(id, texto);
    showSuccess('Nota guardada');
  },

  async anular(id) {
    const motivo = await promptModal({ titulo:'Anular OC', label:'Motivo', textarea:true, requerido:true });
    if (!motivo) return;
    await api.oc.anular(id, motivo);
    showSuccess('OC anulada');
    recargarKanban();
  }
};
```

- [ ] **Step 3: Modal nuevo `abrirModalSubirFactura`**

```javascript
function abrirModalSubirFactura(id_oc) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-card">
      <h3>📄 Subir factura del proveedor</h3>
      <form id="formSubirFactura" enctype="multipart/form-data">
        <label>Nº Comprobante <input name="nro_comprobante" required></label>
        <label>Fecha emisión <input name="fecha_emision" type="date" required></label>
        <label>Monto S/ <input name="monto" type="number" step="0.01" min="0.01" required></label>
        <label>Archivo PDF/imagen <input name="archivo" type="file" accept=".pdf,image/*"></label>
        <div class="modal-actions">
          <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button type="submit">Subir</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(ov);
  // NO cerrar por backdrop click — solo botón Cancelar (regla 28 CLAUDE.md)
  document.getElementById('formSubirFactura').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.oc.subirFactura(id_oc, fd);
      showSuccess('Factura subida');
      ov.remove();
      recargarKanban();
    } catch (err) {
      showError(err.message || 'Error al subir factura');
    }
  };
}
```

- [ ] **Step 4: Helper `promptModal`**

Si no existe ya, agregarlo:

```javascript
function promptModal({ titulo, label, defecto = '', textarea = false, requerido = false }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal-card">
        <h3>${titulo}</h3>
        <label>${label}</label>
        ${textarea
          ? `<textarea id="promptInput" rows="4">${defecto}</textarea>`
          : `<input id="promptInput" value="${defecto}">`}
        <div class="modal-actions">
          <button id="cancel">Cancelar</button>
          <button id="ok">Aceptar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const input = document.getElementById('promptInput');
    document.getElementById('cancel').onclick = () => { ov.remove(); resolve(null); };
    document.getElementById('ok').onclick = () => {
      const v = input.value.trim();
      if (requerido && !v) { input.focus(); return; }
      ov.remove();
      resolve(v);
    };
    input.focus();
  });
}
```

- [ ] **Step 5: Smoke test**

Reload preview. Probar cada acción del card en cada columna. Esperado: cada modal abre, dispara la acción correcta, y refresca el kanban.

- [ ] **Step 6: Commit**

```bash
git add public/js/pages/OrdenesCompra.js
git commit -m "feat(oc): acciones rápidas en cards + modales (pago, crédito, factura, nota, cierre)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## FASE G — Integraciones frontend

### Task G1: Agregar namespace `api.oc` en api.js

**Files:**
- Modify: `public/js/services/api.js`

- [ ] **Step 1: Buscar el namespace existente más parecido**

```bash
grep -n "purchases\s*:\|api\.compras\|ordenesCompra" public/js/services/api.js | head -5
```

- [ ] **Step 2: Agregar el namespace `oc`**

Agregar al objeto `api`:

```javascript
api.oc = {
  listar:          (params)        => fetchAPI('/ordenes-compra' + (params ? '?' + new URLSearchParams(params) : '')),
  get:             (id)            => fetchAPI(`/ordenes-compra/${id}`),
  crear:           (body)          => fetchAPI('/ordenes-compra', { method: 'POST', body }),
  aprobar:         (id)            => fetchAPI(`/ordenes-compra/${id}/aprobar`, { method: 'POST' }),
  marcarCredito:   (id, body)      => fetchAPI(`/ordenes-compra/${id}/marcar-credito`, { method: 'POST', body }),
  registrarPago:   (id, body)      => fetchAPI(`/ordenes-compra/${id}/registrar-pago`, { method: 'POST', body }),
  recibir:         (id, body)      => fetchAPI(`/ordenes-compra/${id}/recibir`, { method: 'POST', body }),
  facturar:        (id, body)      => fetchAPI(`/ordenes-compra/${id}/facturar`, { method: 'POST', body }),
  cerrarSinFactura:(id, body)      => fetchAPI(`/ordenes-compra/${id}/cerrar-sin-factura`, { method: 'POST', body }),
  anular:          (id, motivo)    => fetchAPI(`/ordenes-compra/${id}/anular`, { method: 'POST', body: { motivo } }),
  // Notas
  listarNotas:     (id)            => fetchAPI(`/ordenes-compra/${id}/notas`),
  agregarNota:     (id, texto)     => fetchAPI(`/ordenes-compra/${id}/notas`, { method: 'POST', body: { texto } }),
  borrarNota:      (id, idNota)    => fetchAPI(`/ordenes-compra/${id}/notas/${idNota}`, { method: 'DELETE' }),
  // Historial
  historial:       (id)            => fetchAPI(`/ordenes-compra/${id}/historial`),
  // Factura
  subirFactura:    (id, formData)  => {
    const token = localStorage.getItem('erp_token');
    return fetch(`/api/ordenes-compra/${id}/factura`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));
  },
  getFactura:      (id)            => fetchAPI(`/ordenes-compra/${id}/factura`),
};
```

- [ ] **Step 3: Verificar tipos (no aplica, JS) y commit**

```bash
git add public/js/services/api.js
git commit -m "feat(api): namespace api.oc con endpoints nuevos del kanban OC

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task G2: Render alertas nuevas en Dashboard de Gerencia

**Files:**
- Modify: `public/js/pages/Dashboard.js` (Dashboard de Gerencia / index)

- [ ] **Step 1: Localizar la función que renderiza alertas**

```bash
grep -n "renderAlertas\|alertas\.map\|alerta\.tipo" public/js/pages/Dashboard.js | head -10
```

- [ ] **Step 2: Asegurar que el render maneja los nuevos tipos**

Si la función itera genéricamente por `alertas` y usa `alerta.severidad`, `alerta.titulo`, `alerta.detalle`, `alerta.link` — entonces no hace falta tocar nada en JS. El backend ya emite los nuevos tipos y el render genérico los pinta. **Verificar visualmente.**

Si tiene un switch case por tipo (poco probable según el patrón de AlertasService), agregar los 5 tipos nuevos con su ícono específico. Por ejemplo:

```javascript
const ICONOS_ALERTA = {
  // ... existentes ...
  OC_DEUDA_PROVEEDOR:       '💸',
  OC_PAGO_SIN_RECEPCION:    '📦❌',
  OC_CREDITO_POR_VENCER:    '📅',
  OC_SIN_FACTURA_PROVEEDOR: '📄❌',
  OC_CERRADAS_SIN_FACT_MES: '📊',
};
```

- [ ] **Step 3: Manejar el click → navegación con filtro**

El `link` viene en formato `#logistica/oc?id=X` o `#logistica/oc?filtro=Y`. La SPA debe interpretar el query string y aplicar el filtro/scroll automáticamente. En el handler de `navigate()` en `app.js`, agregar parsing del query si no existe.

- [ ] **Step 4: Smoke test**

Login como GERENTE. Abrir Dashboard. Esperado: las 5 alertas nuevas aparecen (si hay datos que las disparen). Click → lleva al kanban con el filtro aplicado.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Dashboard.js public/js/app.js
git commit -m "feat(gerencia): render alertas OC nuevas con click → kanban filtrado

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task G3: Botón export Excel en Listado completo

**Files:**
- Modify: `public/js/pages/OrdenesCompra.js` (sección Listado completo)

- [ ] **Step 1: Encontrar el render del Listado completo**

```bash
grep -n "function renderLista\|renderLista(panel)" public/js/pages/OrdenesCompra.js
```

- [ ] **Step 2: Agregar el botón cerca del header del listado**

```javascript
const btnExport = `
  <button class="btn-secondary" onclick="window.open('/api/ordenes-compra/listado/excel', '_blank')">
    📊 Exportar Excel
  </button>
`;
```

Insertarlo en el HTML de la pestaña Listado completo.

- [ ] **Step 3: Smoke test**

Click en Exportar Excel → debe descargar `OCs_2026-05-06.xlsx` con todas las OCs.

- [ ] **Step 4: Commit**

```bash
git add public/js/pages/OrdenesCompra.js
git commit -m "feat(oc): botón export Excel en Listado completo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## FASE H — Cierre

### Task H1: Cache buster + tsc + verificación final

**Files:**
- Modify: `public/js/app.js` (todos los imports)
- Modify: `public/index.html`

- [ ] **Step 1: Bumpear el cache buster en app.js**

Reemplazar todos los `?v=20260505r6` por `?v=20260506r1`. Hacer find/replace global en `public/js/app.js`:

```bash
grep -c "20260505r6" public/js/app.js
```

Anotar el número (debe ser ~19). Luego reemplazar todas las ocurrencias.

- [ ] **Step 2: Bumpear cache buster en index.html**

```bash
grep -n "v=20260505r6\|/app.js?v=" public/index.html
```

Cambiar el `?v=...` del `<script src="js/app.js?v=...">` a `?v=20260506r1`.

- [ ] **Step 3: Verificar tipos finales**

```bash
npx tsc --noEmit
```

Esperado: limpio.

- [ ] **Step 4: Verificar que `npm run build` también pasa**

```bash
npm run build
```

Esperado: `dist/` se genera sin errores. Limpiar `dist/` si existía:

```bash
rm -rf dist && npm run build
```

- [ ] **Step 5: Commit cache buster**

```bash
git add public/js/app.js public/index.html
git commit -m "chore: bump cache buster a 20260506r1 (rediseño kanban OC)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task H2: Verificación manual end-to-end

**Files:**
- N/A (smoke test)

- [ ] **Step 1: Smoke test completo del kanban**

Abrir `npm run dev`. Login como GERENTE. Ir a Logística → OC. Verificar:

- 6 columnas visibles (Borrador, Aprobada, Pago, Recepción, Facturación, Terminada). Toggle muestra Cerrada Sin Factura.
- Filtros: cambiar centro de costo y mes/año — kanban se filtra.
- Click en card → abre detalle (modal o página).
- Crear una OC nueva → aparece en BORRADOR.
- Aprobar → pasa a PAGO con dot 🔴.
- Registrar pago parcial S/100 sobre total S/300 → card pasa a RECEPCIÓN con badge `⚠ Saldo S/ 200 pdte`.
- Marcar recibido total → card SIGUE en RECEPCIÓN (bloqueada porque pago no completo) con badge.
- Pagar saldo → ahora avanza a FACTURACIÓN.
- Subir factura PDF → estado_factura=FACTURADA, card pasa a TERMINADA.
- Crear otra OC, aprobar, marcar crédito (15 días) → card va a RECEPCIÓN con badge `⚠ Crédito vence DD/MM`.
- Anular una OC en BORRADOR → pasa a ANULADA.
- Cerrar sin factura una OC en RECEPCIÓN → pasa a CERRADA_SIN_FACTURA con motivo registrado.
- Agregar nota a una OC → se guarda y aparece en historial.
- Click en `📊 Exportar Excel` → descarga xlsx con todas las OCs.

- [ ] **Step 2: Verificar alertas en Dashboard Gerencia**

Login como GERENTE → Dashboard. Verificar que las alertas aparecen (las que apliquen según los datos). Click en una alerta de OC → navega al kanban filtrado.

- [ ] **Step 3: Verificar auto-resolución de alertas**

Tomar una OC con alerta de "Sin factura > 15 días". Subirle la factura. Recargar Dashboard. La alerta desaparece.

- [ ] **Step 4: Verificar rol USUARIO ve solo Logística**

Logout, login como un usuario sin rol GERENTE pero con módulo LOGISTICA. Verificar que las alertas de OC aparecen en Logística pero NO ve las que solo aparecen en Gerencia (ej: `OC_CERRADAS_SIN_FACT_MES`).

- [ ] **Step 5: Crear PR para revisión**

```bash
git push -u origin claude/reverent-curran-216a6e
gh pr create --title "Rediseño kanban Logística — Órdenes de Compra (V1)" --body "$(cat <<'EOF'
## Summary
- Migra el kanban de OC al state machine simplificado: BORRADOR → APROBADA → PAGO → RECEPCIÓN → FACTURACIÓN → TERMINADA + CERRADA_SIN_FACTURA + ANULADA.
- Elimina la columna ENVIADA (no se usaba).
- Comprime los 3 ejes (pago/recepción/factura) en dot semáforo + badges, sin inflar columnas.
- Cascada de alertas críticas al dashboard del Gerente (auto-resuelven al cambiar el estado en Logística).
- Soporta subida de facturas del proveedor a Cloudinary.
- Filtros por centro de costo + mes/año, sticky headers, max-height de pantalla.
- Listado completo con export Excel.

Spec: `docs/superpowers/specs/2026-05-06-logistica-kanban-rediseno-design.md`

## Test plan
- [ ] Migración 062 corrida en local + Railway (`npx ts-node database/apply_migrations.ts --env=railway`)
- [ ] 37 OCs migradas a estados nuevos sin pérdida de datos
- [ ] Kanban muestra columnas y dots correctos
- [ ] Filtros funcionan (centro costo, mes/año, solo problemas)
- [ ] Acciones rápidas: aprobar, pagar (parcial/total), marcar crédito, recibir, subir factura, cerrar sin factura, anular
- [ ] Auto-advance: PAGO→RECEPCIÓN, RECEPCIÓN→FACTURACIÓN (con bloqueo por saldo), FACTURACIÓN→TERMINADA
- [ ] Alertas aparecen y desaparecen on-demand
- [ ] Export Excel descarga todo
- [ ] `npx tsc --noEmit` limpio
- [ ] Cache buster bumpeado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Aplicar migration en Railway**

Después de mergear (o antes si querés probar):

```bash
npx ts-node database/apply_migrations.ts --env=railway
```

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Mig 062 corrompe datos en Railway | Backup previo (Task 0) + mig idempotente con `IF NOT EXISTS` y orden de UPDATEs deterministas |
| Errores de tipos TS bloquean deploy | `npx tsc --noEmit` después de cada fase + `npm run build` antes de push |
| Cache buster no actualizado → browser sirve JS viejo | Task H1 verifica las 19 ocurrencias en app.js + 1 en index.html |
| Alertas con queries Postgres-only fallan en MySQL local | Las queries usan sintaxis ISO (DATE_TRUNC, INTERVAL) — verificar en local antes de Railway |
| Honorarios (es_honorario=TRUE) rompe por cambio de estados | El flag se respeta sin cambios; el flujo de honorarios va por CERRADA_SIN_FACTURA igual que antes |
| Modales duplican backdrop close → cierre accidental | Regla 28 CLAUDE.md: NO `ov.onclick`. Solo botón "Cerrar"/"Cancelar" explícito |
| `auditLog('OrdenCompra', 'X')` con tipo nuevo no extendido bloquea deploy | Task B1 step 3 extiende AuditAccion con todos los tipos nuevos |

---

## Checklist global de aceptación (del spec)

Marca al terminar cada uno:

- [ ] Migración aplicada en Supabase. 37 OCs migradas sin pérdida de información.
- [ ] Kanban muestra 6 columnas activas + colapsable Cerrada/Anulada.
- [ ] Cards muestran dot principal correcto + badges de problemas heredados.
- [ ] Filtros centro de costo + mes/año funcionan. Headers sticky al scrollear.
- [ ] Las 3 vías de salida de PAGO funcionan (total, parcial, crédito con fecha).
- [ ] RECEPCIÓN bloquea avance a FACTURACIÓN si pago no está al 100%.
- [ ] FACTURACIÓN permite subir PDF/imagen a Cloudinary y registrar nro/fecha.
- [ ] Card pasa sola a TERMINADA cuando los 3 semáforos están 🟢.
- [ ] Cierre manual a CERRADA_SIN_FACTURA con confirmación textual y motivo.
- [ ] Listado completo muestra TODAS las OCs sin importar estado.
- [ ] Export Excel del Listado completo respeta filtros aplicados.
- [ ] Las 5 alertas nuevas aparecen en Logística con umbral 15d.
- [ ] Las alertas críticas aparecen también en dashboard Gerencia para rol GERENTE.
- [ ] Al resolver el problema en Logística, la alerta desaparece en próxima carga del dashboard Gerencia.
- [ ] Historial de transiciones (`OrdenCompraHistorial`) se llena en cada cambio de estado.
- [ ] Notas (`OrdenCompraNota`) se pueden agregar y ver.
- [ ] `npx tsc --noEmit` pasa sin errores antes del deploy.
- [ ] Cache buster JS bumpeado en todos los imports y en index.html.

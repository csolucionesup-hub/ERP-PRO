# Facturación Manual de Ventas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el camino de emisión electrónica Nubefact (no usado) por un flujo de **registro manual de facturas de venta** creadas en SUNAT y subidas al ERP, capturadas como dato estructurado (tabla `FacturaVenta`, 1:N por cotización) + PDF.

**Architecture:** Tabla nueva `facturaventa` (Postgres nativo) 1:N con `cotizaciones`, aditiva (no toca `cotizaciones.nro_factura/fecha_factura`). `FacturaVentaService` orquesta crear/listar/editar/anular y reutiliza la transición de estado financiero existente (`marcarFacturada`/`revertirFacturacion`). El PDF cuelga de `AdjuntosService` (`ref_tipo='FacturaVenta'`). El cluster Nubefact (6 archivos + rutas + cron + tablas STUB) se elimina. Frontend: el modal "Registrar factura" en `Finanzas.js` suma campos pre-llenados y plegados; el resto del flujo de subir PDF queda idéntico.

**Tech Stack:** Node/TypeScript, Express 5, Supabase Postgres (adapter MySQL→PG en `database/connection.ts`; migraciones aplicadas vía MCP `apply_migration`, Postgres nativo), Zod 4, Cloudinary (AdjuntosService), Vanilla JS frontend.

**Spec:** `docs/superpowers/specs/2026-06-29-facturacion-manual-ventas-design.md`

**Rama:** `claude/facturacion-manual-ventas` (ya creada desde `origin/main`). Merge a `main` lo hace Julio (gate de release).

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Crear | `app/modules/facturacion/facturaVentaHelpers.ts` | Funciones PURAS (parse nro_factura, cuadre, prefill) — testeables sin BD |
| Crear | `scripts/test_factura_venta.ts` | Unit test de los helpers puros |
| Crear | `database/migrations/081_factura_venta.sql` | Tabla `facturaventa` + back-fill + reasignar adjuntos + drop guarded de Nubefact |
| Crear | `app/validators/facturaVenta.schema.ts` | Schemas Zod de crear/editar |
| Crear | `app/modules/facturacion/FacturaVentaService.ts` | CRUD + transición de estado + cuadre |
| Modificar | `index.ts` | + router `/api/facturas-venta`; − routers/imports/cron Nubefact |
| Modificar | `public/js/services/api.js` | + namespace `api.facturasVenta` |
| Modificar | `public/js/pages/Finanzas.js` | Modal registrar factura (campos plegados) + lista en detalle; − UI Nubefact |
| Modificar | `public/js/pages/Contabilidad.js` | − badges/estados `estado_sunat` de Nubefact (si los hay) |
| Modificar | `public/js/app.js` + `public/index.html` | Cache buster `r2 → r3` |
| Borrar | `app/modules/facturacion/{FacturaService,NubefactService,NubefactPayloadBuilder,FacturaPDFService,PLEExporter,FacturacionCron}.ts` | Cluster Nubefact |

---

## Task 1: Helpers puros + unit test (TDD)

**Files:**
- Create: `app/modules/facturacion/facturaVentaHelpers.ts`
- Test: `scripts/test_factura_venta.ts`

- [ ] **Step 1: Escribir el test que falla** — `scripts/test_factura_venta.ts`

```typescript
// scripts/test_factura_venta.ts — unit test de helpers puros (sin BD)
// Correr: npx ts-node scripts/test_factura_venta.ts
import { parseNroFactura, calcularCuadre, esPrimeraFactura } from '../app/modules/facturacion/facturaVentaHelpers';

let fallos = 0;
function eq(actual: any, esperado: any, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(esperado);
  if (a !== e) { console.error(`✗ ${msg}\n   esperado ${e}\n   obtuvo   ${a}`); fallos++; }
  else console.log(`✓ ${msg}`);
}

// parseNroFactura: "F001-1234" -> { serie:'F001', numero:1234 }
eq(parseNroFactura('F001-1234'), { serie: 'F001', numero: 1234 }, 'parse F001-1234');
eq(parseNroFactura('E001-00000045'), { serie: 'E001', numero: 45 }, 'parse con ceros');
eq(parseNroFactura('SIN-GUION-RARO'), { serie: 'SIN', numero: null }, 'parse no numerico -> numero null');
eq(parseNroFactura(''), { serie: '', numero: null }, 'parse vacio');

// calcularCuadre: suma de facturas vigentes vs total cotizacion
eq(calcularCuadre([{ total: 100, estado: 'VIGENTE' }, { total: 50, estado: 'ANULADA' }], 100),
   { sumaFacturado: 100, totalCotizacion: 100, diferencia: 0, cuadra: true }, 'cuadre exacto ignora anuladas');
eq(calcularCuadre([{ total: 60, estado: 'VIGENTE' }], 100),
   { sumaFacturado: 60, totalCotizacion: 100, diferencia: 40, cuadra: false }, 'cuadre parcial');

// esPrimeraFactura: true si no hay otras facturas vigentes
eq(esPrimeraFactura([]), true, 'sin facturas -> primera');
eq(esPrimeraFactura([{ estado: 'ANULADA' }]), true, 'solo anuladas -> primera');
eq(esPrimeraFactura([{ estado: 'VIGENTE' }]), false, 'ya hay vigente -> no primera');

if (fallos > 0) { console.error(`\n${fallos} test(s) fallaron`); process.exit(1); }
console.log('\nTodos los tests pasaron');
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx ts-node scripts/test_factura_venta.ts`
Expected: FALLA con error de módulo no encontrado (`facturaVentaHelpers` no existe).

- [ ] **Step 3: Implementar los helpers** — `app/modules/facturacion/facturaVentaHelpers.ts`

```typescript
// Helpers PUROS de facturación de venta — sin acceso a BD, testeables aislados.

export interface NroParsed { serie: string; numero: number | null; }

/** "F001-1234" -> { serie:'F001', numero:1234 }. Si la 2da parte no es numérica, numero=null. */
export function parseNroFactura(nro: string): NroParsed {
  const raw = (nro || '').trim();
  const dash = raw.indexOf('-');
  if (dash === -1) {
    const soloDigitos = raw.replace(/\D/g, '');
    return { serie: raw, numero: soloDigitos ? Number(soloDigitos) : null };
  }
  const serie = raw.slice(0, dash);
  const restoDigitos = raw.slice(dash + 1).replace(/\D/g, '');
  return { serie, numero: restoDigitos ? Number(restoDigitos) : null };
}

export interface CuadreInput { total: number | string; estado: string; }
export interface Cuadre {
  sumaFacturado: number; totalCotizacion: number; diferencia: number; cuadra: boolean;
}

/** Suma facturas VIGENTES vs total de la cotización. diferencia >0 = falta facturar. */
export function calcularCuadre(facturas: CuadreInput[], totalCotizacion: number): Cuadre {
  const sumaFacturado = facturas
    .filter(f => f.estado === 'VIGENTE')
    .reduce((acc, f) => acc + Number(f.total || 0), 0);
  const total = Number(totalCotizacion || 0);
  const diferencia = Math.round((total - sumaFacturado) * 100) / 100;
  return { sumaFacturado: Math.round(sumaFacturado * 100) / 100, totalCotizacion: total, diferencia, cuadra: Math.abs(diferencia) < 0.01 };
}

/** True si no hay ninguna factura VIGENTE (la nueva sería la primera → dispara FACTURADA). */
export function esPrimeraFactura(facturas: { estado: string }[]): boolean {
  return !facturas.some(f => f.estado === 'VIGENTE');
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx ts-node scripts/test_factura_venta.ts`
Expected: PASS — "Todos los tests pasaron".

- [ ] **Step 5: Commit**

```bash
git add app/modules/facturacion/facturaVentaHelpers.ts scripts/test_factura_venta.ts
git commit -m "feat(facturacion): helpers puros FacturaVenta + unit test"
```

---

## Task 2: Migración 081 — tabla, back-fill y drop guarded (DATA-CRÍTICO)

**Files:**
- Create: `database/migrations/081_factura_venta.sql`

> ⚠️ **Seguridad de datos (pedido explícito de Julio):** correr `npm run db:backup` ANTES de aplicar. La migración es aditiva; el único DROP es de tablas STUB de Nubefact y **aborta si `facturas` tiene filas**.

- [ ] **Step 1: Backup de la BD productiva**

Run: `npm run db:backup`
Expected: crea un JSON en `backups/` (ver `BACKUP_RESTORE.md`). Confirmar que el archivo existe antes de seguir.

- [ ] **Step 2: Confirmar nombres EXACTOS de columnas de `cotizaciones`**

Antes de escribir el back-fill, confirmar contra la BD real (vía MCP `execute_sql`) los nombres de las columnas de montos/cliente de `cotizaciones`:

Run (MCP Supabase `execute_sql`): `SELECT column_name FROM information_schema.columns WHERE table_name='cotizaciones' ORDER BY ordinal_position;`
Confirmadas por migraciones: `nro_factura`, `fecha_factura`, `igv`, `detraccion_porcentaje`, `monto_detraccion`, `retencion_porcentaje`, `monto_retencion`, `moneda`, `tipo_cambio`.
**A confirmar en el resultado** (mapear al back-fill): el nombre de la base gravada (`subtotal` o `monto_base`), `total`, y el/los campo(s) de cliente (`cliente` / `cliente_razon_social` y `cliente_ruc`/`ruc`). Ajustar el SQL del Step 3 con los nombres reales.

- [ ] **Step 3: Escribir la migración** — `database/migrations/081_factura_venta.sql`

```sql
-- 081_factura_venta.sql
-- Postgres NATIVO (Supabase project fhlrxlsscerfiuuyiejw) — NO pasa por el
-- adapter MySQL->PG. Facturas de VENTA creadas manualmente en SUNAT y subidas
-- al ERP. Reemplaza el camino Nubefact (FacturaService) que se retira.
-- ADITIVA: no toca cotizaciones.nro_factura/fecha_factura.

-- 1) Tabla
CREATE TABLE IF NOT EXISTS facturaventa (
  id_factura_venta      SERIAL PRIMARY KEY,
  id_cotizacion         INT NOT NULL REFERENCES cotizaciones(id_cotizacion),
  tipo                  VARCHAR(10) NOT NULL DEFAULT 'FACTURA' CHECK (tipo IN ('FACTURA','BOLETA')),
  serie                 VARCHAR(8),
  numero                INT,
  fecha_emision         DATE,
  moneda                VARCHAR(3) NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  tipo_cambio           NUMERIC(8,4) NOT NULL DEFAULT 1.0000,
  base_imponible        NUMERIC(14,2) NOT NULL DEFAULT 0,
  igv                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  aplica_detraccion     BOOLEAN NOT NULL DEFAULT FALSE,
  porcentaje_detraccion NUMERIC(5,2) NOT NULL DEFAULT 0,
  monto_detraccion      NUMERIC(14,2) NOT NULL DEFAULT 0,
  aplica_retencion      BOOLEAN NOT NULL DEFAULT FALSE,
  monto_retencion       NUMERIC(14,2) NOT NULL DEFAULT 0,
  cliente_razon_social  VARCHAR(200),
  cliente_num_doc       VARCHAR(15),
  observaciones         VARCHAR(500),
  id_usuario_registro   INT,
  estado                VARCHAR(10) NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADA')),
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tipo, serie, numero)
);
CREATE INDEX IF NOT EXISTS facturaventa_idx_cotizacion ON facturaventa (id_cotizacion);
CREATE INDEX IF NOT EXISTS facturaventa_idx_fecha ON facturaventa (fecha_emision);

-- 2) Back-fill: cada cotización con nro_factura -> 1 fila FacturaVenta.
--    AJUSTAR nombres de columnas confirmados en Step 2 (base/total/cliente).
INSERT INTO facturaventa (
  id_cotizacion, tipo, serie, numero, fecha_emision, moneda, tipo_cambio,
  base_imponible, igv, total, aplica_detraccion, porcentaje_detraccion, monto_detraccion,
  aplica_retencion, monto_retencion, cliente_razon_social, cliente_num_doc, estado
)
SELECT
  c.id_cotizacion, 'FACTURA',
  split_part(c.nro_factura, '-', 1),
  NULLIF(regexp_replace(split_part(c.nro_factura, '-', 2), '\D', '', 'g'), '')::INT,
  c.fecha_factura,
  COALESCE(c.moneda, 'PEN'), COALESCE(c.tipo_cambio, 1),
  COALESCE(c.subtotal, 0), COALESCE(c.igv, 0), COALESCE(c.total, 0),
  (COALESCE(c.monto_detraccion, 0) > 0), COALESCE(c.detraccion_porcentaje, 0), COALESCE(c.monto_detraccion, 0),
  (COALESCE(c.monto_retencion, 0) > 0), COALESCE(c.monto_retencion, 0),
  c.cliente, NULL,
  'VIGENTE'
FROM cotizaciones c
WHERE c.nro_factura IS NOT NULL AND c.nro_factura <> ''
  AND NOT EXISTS (SELECT 1 FROM facturaventa fv WHERE fv.id_cotizacion = c.id_cotizacion);

-- 3) Reasignar los adjuntos de factura (PR #33 usaba ref_id = id_cotizacion)
--    al nuevo id_factura_venta (1:1 por el back-fill).
UPDATE adjuntos a
SET ref_id = fv.id_factura_venta
FROM facturaventa fv
WHERE a.ref_tipo = 'FacturaVenta' AND a.ref_id = fv.id_cotizacion;

-- 4) Drop GUARDED de las tablas STUB de Nubefact (abortar si tienen data real).
DO $$
DECLARE n INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='facturas') THEN
    SELECT COUNT(*) INTO n FROM facturas;
    IF n > 0 THEN
      RAISE EXCEPTION 'Tabla facturas tiene % filas — NO se dropea. Revisar antes de continuar.', n;
    END IF;
    DROP TABLE IF EXISTS detallefactura;
    DROP TABLE IF EXISTS facturas;
  END IF;
END $$;
```

- [ ] **Step 4: Aplicar la migración vía MCP y verificar**

Aplicar con MCP Supabase `apply_migration` (name: `081_factura_venta`, query: el SQL de arriba ajustado). Si el DO block lanza EXCEPTION por filas en `facturas`, DETENERSE y avisar a Julio (hay data inesperada en la tabla STUB).
Verificar el back-fill:

Run (MCP `execute_sql`):
```sql
SELECT
  (SELECT COUNT(*) FROM facturaventa) AS facturas_venta,
  (SELECT COUNT(*) FROM cotizaciones WHERE nro_factura IS NOT NULL AND nro_factura <> '') AS cotiz_con_factura;
```
Expected: ambos conteos IGUALES.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/081_factura_venta.sql
git commit -m "feat(facturacion): migracion 081 FacturaVenta + back-fill + drop guarded Nubefact"
```

---

## Task 3: Schema Zod de validación

**Files:**
- Create: `app/validators/facturaVenta.schema.ts`

- [ ] **Step 1: Escribir el schema** — `app/validators/facturaVenta.schema.ts`

```typescript
import { z } from 'zod';

// Zod 4: usar `error:` (no `required_error:`).
export const facturaVentaCreateSchema = z.object({
  id_cotizacion: z.coerce.number({ error: 'id_cotizacion requerido' }).int().positive(),
  tipo: z.enum(['FACTURA', 'BOLETA']).default('FACTURA'),
  serie: z.string().min(1, { error: 'serie requerida' }).max(8),
  numero: z.coerce.number({ error: 'numero requerido' }).int().positive(),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'fecha_emision YYYY-MM-DD' }),
  moneda: z.enum(['PEN', 'USD']).default('PEN'),
  tipo_cambio: z.coerce.number().positive().default(1),
  base_imponible: z.coerce.number().min(0).default(0),
  igv: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
  aplica_detraccion: z.coerce.boolean().default(false),
  porcentaje_detraccion: z.coerce.number().min(0).max(100).default(0),
  monto_detraccion: z.coerce.number().min(0).default(0),
  aplica_retencion: z.coerce.boolean().default(false),
  monto_retencion: z.coerce.number().min(0).default(0),
  cliente_razon_social: z.string().max(200).optional(),
  cliente_num_doc: z.string().max(15).optional(),
  observaciones: z.string().max(500).optional(),
});

// Editar: todo opcional salvo que no se puede cambiar la cotización.
export const facturaVentaUpdateSchema = facturaVentaCreateSchema
  .omit({ id_cotizacion: true })
  .partial();
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `facturaVenta.schema.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/validators/facturaVenta.schema.ts
git commit -m "feat(facturacion): schema Zod FacturaVenta crear/editar"
```

---

## Task 4: `FacturaVentaService`

**Files:**
- Create: `app/modules/facturacion/FacturaVentaService.ts`

Patrón de referencia: `app/modules/configuracion/AdjuntosService.ts` (estructura `class … { } export default new …()`, `db.query` con `?`), y la transición de estado en `CobranzasService.marcarFacturada` (`app/modules/finance/CobranzasService.ts:1169`).

- [ ] **Step 1: Implementar el service** — `app/modules/facturacion/FacturaVentaService.ts`

```typescript
import { db } from '../../../database/connection';
import { calcularCuadre, esPrimeraFactura, parseNroFactura } from './facturaVentaHelpers';

export interface FacturaVentaInput {
  id_cotizacion: number;
  tipo?: 'FACTURA' | 'BOLETA';
  serie: string;
  numero: number;
  fecha_emision: string;
  moneda?: 'PEN' | 'USD';
  tipo_cambio?: number;
  base_imponible?: number;
  igv?: number;
  total: number;
  aplica_detraccion?: boolean;
  porcentaje_detraccion?: number;
  monto_detraccion?: number;
  aplica_retencion?: boolean;
  monto_retencion?: number;
  cliente_razon_social?: string;
  cliente_num_doc?: string;
  observaciones?: string;
}

class FacturaVentaService {
  /** Pre-llena el form desde la cotización (no persiste). */
  async previewDesdeCotizacion(idCotizacion: number) {
    const [[c]]: any = await db.query(
      `SELECT id_cotizacion, cliente, moneda, tipo_cambio,
              subtotal, igv, total,
              detraccion_porcentaje, monto_detraccion, monto_retencion, nro_factura, fecha_factura
         FROM Cotizaciones WHERE id_cotizacion = ?`,
      [idCotizacion]
    );
    if (!c) throw new Error('Cotización no encontrada');
    // Si ya tiene nro_factura cargado, pre-llenar serie/numero parseándolo.
    const parsed = c.nro_factura ? parseNroFactura(c.nro_factura) : { serie: '', numero: null };
    return {
      id_cotizacion: c.id_cotizacion,
      tipo: 'FACTURA',
      serie: parsed.serie, numero: parsed.numero,
      fecha_emision: c.fecha_factura || null,
      moneda: c.moneda || 'PEN',
      tipo_cambio: Number(c.tipo_cambio || 1),
      base_imponible: Number(c.subtotal || 0),
      igv: Number(c.igv || 0),
      total: Number(c.total || 0),
      aplica_detraccion: Number(c.monto_detraccion || 0) > 0,
      porcentaje_detraccion: Number(c.detraccion_porcentaje || 0),
      monto_detraccion: Number(c.monto_detraccion || 0),
      aplica_retencion: Number(c.monto_retencion || 0) > 0,
      monto_retencion: Number(c.monto_retencion || 0),
      cliente_razon_social: c.cliente || '',
      cliente_num_doc: '',
    };
  }

  async listarPorCotizacion(idCotizacion: number) {
    const [rows]: any = await db.query(
      `SELECT * FROM FacturaVenta WHERE id_cotizacion = ? ORDER BY created_at ASC`,
      [idCotizacion]
    );
    const [[cot]]: any = await db.query(
      `SELECT total FROM Cotizaciones WHERE id_cotizacion = ?`, [idCotizacion]
    );
    const cuadre = calcularCuadre(rows as any[], Number(cot?.total || 0));
    return { facturas: rows, cuadre };
  }

  async crear(input: FacturaVentaInput, idUsuario: number) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // ¿es la primera factura vigente? (decide si dispara FACTURADA)
      const [existentes]: any = await conn.query(
        `SELECT estado FROM FacturaVenta WHERE id_cotizacion = ?`, [input.id_cotizacion]
      );
      const primera = esPrimeraFactura(existentes as any[]);

      const [res]: any = await conn.query(
        `INSERT INTO FacturaVenta
           (id_cotizacion, tipo, serie, numero, fecha_emision, moneda, tipo_cambio,
            base_imponible, igv, total, aplica_detraccion, porcentaje_detraccion, monto_detraccion,
            aplica_retencion, monto_retencion, cliente_razon_social, cliente_num_doc,
            observaciones, id_usuario_registro, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VIGENTE')`,
        [input.id_cotizacion, input.tipo || 'FACTURA', input.serie, input.numero, input.fecha_emision,
         input.moneda || 'PEN', input.tipo_cambio || 1, input.base_imponible || 0, input.igv || 0, input.total,
         input.aplica_detraccion ? 1 : 0, input.porcentaje_detraccion || 0, input.monto_detraccion || 0,
         input.aplica_retencion ? 1 : 0, input.monto_retencion || 0,
         input.cliente_razon_social || null, input.cliente_num_doc || null,
         input.observaciones || null, idUsuario]
      );
      const id = (res as any).insertId;

      // Primera factura: replica nro/fecha en Cotizaciones y dispara FACTURADA (si fondeada).
      if (primera) {
        const nro = `${input.serie}-${input.numero}`;
        const [[cot]]: any = await conn.query(
          `SELECT estado, estado_financiero FROM Cotizaciones WHERE id_cotizacion = ?`, [input.id_cotizacion]
        );
        if (cot && cot.estado !== 'ANULADA' &&
            ['FONDEADA_TOTAL','SIN_DETRACCION_FONDEADA','FACTURADA','COBRADA'].includes(cot.estado_financiero)) {
          await conn.query(
            `UPDATE Cotizaciones
                SET nro_factura = ?, fecha_factura = ?, estado_financiero = 'FACTURADA'
              WHERE id_cotizacion = ?`,
            [nro, input.fecha_emision, input.id_cotizacion]
          );
        } else {
          // No fondeada: igual guardamos nro/fecha (sin forzar estado).
          await conn.query(
            `UPDATE Cotizaciones SET nro_factura = ?, fecha_factura = ? WHERE id_cotizacion = ?`,
            [nro, input.fecha_emision, input.id_cotizacion]
          );
        }
      }

      await conn.commit();
      return { id, primera };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async editar(id: number, input: Partial<FacturaVentaInput>) {
    const campos: string[] = [];
    const vals: any[] = [];
    const seteable: (keyof FacturaVentaInput)[] = [
      'tipo','serie','numero','fecha_emision','moneda','tipo_cambio','base_imponible','igv','total',
      'aplica_detraccion','porcentaje_detraccion','monto_detraccion','aplica_retencion','monto_retencion',
      'cliente_razon_social','cliente_num_doc','observaciones'
    ];
    for (const k of seteable) {
      if (input[k] !== undefined) {
        campos.push(`${k} = ?`);
        const v = input[k];
        vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
      }
    }
    if (campos.length === 0) return { ok: true };
    vals.push(id);
    await db.query(`UPDATE FacturaVenta SET ${campos.join(', ')}, updated_at = NOW() WHERE id_factura_venta = ?`, vals);
    return { ok: true };
  }

  async anular(id: number) {
    const [[fv]]: any = await db.query(`SELECT id_cotizacion, estado FROM FacturaVenta WHERE id_factura_venta = ?`, [id]);
    if (!fv) throw new Error('Factura no encontrada');
    if (fv.estado === 'ANULADA') throw new Error('La factura ya está anulada');
    await db.query(`UPDATE FacturaVenta SET estado = 'ANULADA', updated_at = NOW() WHERE id_factura_venta = ?`, [id]);
    // Si no quedan vigentes, revertir el estado financiero de la cotización.
    const [restantes]: any = await db.query(
      `SELECT COUNT(*) AS n FROM FacturaVenta WHERE id_cotizacion = ? AND estado = 'VIGENTE'`, [fv.id_cotizacion]
    );
    if (Number((restantes as any)[0].n) === 0) {
      const { default: CobranzasService } = await import('../finance/CobranzasService');
      await CobranzasService.revertirFacturacion(fv.id_cotizacion);
    }
    return { ok: true };
  }
}

export default new FacturaVentaService();
```

> Notas:
> - `revertirFacturacion` ya existe en `CobranzasService` (`:1213`). Confirmar su firma `(idCotizacion: number)` al integrarlo; el import dinámico evita ciclo de require.
> - El SELECT de `previewDesdeCotizacion` usa `subtotal`/`cliente` de `cotizaciones` — **confirmar esos nombres exactos** igual que en Task 2 Step 2 (mismas columnas). Si difieren, ajustar aquí también.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si `db.getConnection`/`beginTransaction` no existe con esa firma, mirar cómo lo usa `CobranzasService.registrarCobranza` y alinear.)

- [ ] **Step 3: Commit**

```bash
git add app/modules/facturacion/FacturaVentaService.ts
git commit -m "feat(facturacion): FacturaVentaService (crear/listar/editar/anular)"
```

---

## Task 5: Rutas `/api/facturas-venta` + cliente `api.js`

**Files:**
- Modify: `index.ts` (agregar router; imports)
- Modify: `public/js/services/api.js`

- [ ] **Step 1: Agregar imports y router en `index.ts`**

Cerca de los otros imports de facturación (línea ~40), agregar:
```typescript
import FacturaVentaService from './app/modules/facturacion/FacturaVentaService';
import { facturaVentaCreateSchema, facturaVentaUpdateSchema } from './app/validators/facturaVenta.schema';
```
Después del bloque de `facturasRouter`/`app.use('/api/facturas', …)` (que se ELIMINA en Task 7), agregar el router nuevo:
```typescript
// ===== FACTURAS DE VENTA (registro manual de facturas SUNAT) =====
const facturasVentaRouter = express.Router();
facturasVentaRouter.use(requireAuth);
facturasVentaRouter.use(requireModulo('FINANZAS'));

facturasVentaRouter.get('/preview/:id_cotizacion', async (req: Request, res: Response) => {
  const id = Number(req.params.id_cotizacion);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id_cotizacion inválido' });
  res.json(await FacturaVentaService.previewDesdeCotizacion(id));
});

facturasVentaRouter.get('/', async (req: Request, res: Response) => {
  const id = Number(req.query.id_cotizacion);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id_cotizacion requerido' });
  res.json(await FacturaVentaService.listarPorCotizacion(id));
});

facturasVentaRouter.post('/', validateParams(facturaVentaCreateSchema), auditLog('FacturaVenta', 'CREATE'), async (req: any, res: Response) => {
  res.json(await FacturaVentaService.crear(req.body, req.user!.id_usuario));
});

facturasVentaRouter.put('/:id', validateIdParam, validateParams(facturaVentaUpdateSchema), auditLog('FacturaVenta', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await FacturaVentaService.editar(Number(req.params.id), req.body));
});

facturasVentaRouter.post('/:id/anular', validateIdParam, auditLog('FacturaVenta', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await FacturaVentaService.anular(Number(req.params.id)));
});

app.use('/api/facturas-venta', facturasVentaRouter);
```

> Verificar que `auditLog('FacturaVenta', …)` no rompa el type `AuditAccion`/entidad. Si el type de entidad es cerrado (ver gotcha #37 del CLAUDE.md), agregar `'FacturaVenta'` al union correspondiente en el módulo de auditoría.

- [ ] **Step 2: Agregar el namespace en `public/js/services/api.js`**

Mirror del patrón existente (`api.adjuntos`, `api.cobranzas`). Agregar:
```javascript
  facturasVenta: {
    preview:  (idCot)        => fetchAPI(`/facturas-venta/preview/${idCot}`),
    listar:   (idCot)        => fetchAPI(`/facturas-venta?id_cotizacion=${idCot}`),
    crear:    (data)         => fetchAPI('/facturas-venta', { method: 'POST', body: JSON.stringify(data) }),
    editar:   (id, data)     => fetchAPI(`/facturas-venta/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    anular:   (id)           => fetchAPI(`/facturas-venta/${id}/anular`, { method: 'POST' }),
  },
```
(Confirmar la forma exacta de `fetchAPI` y dónde se cuelga el namespace leyendo el `api.adjuntos`/`api.cobranzas` existente.)

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add index.ts public/js/services/api.js
git commit -m "feat(facturacion): rutas /api/facturas-venta + api.facturasVenta"
```

---

## Task 6: Frontend — modal y detalle en `Finanzas.js`

**Files:**
- Modify: `public/js/pages/Finanzas.js`

> Leer primero el modal actual "Registrar factura" (~línea 1831 según spec PR #33) y el "Detalle de cobranza" (~1894). Mantener TODO el flujo de subir PDF idéntico (usa `api.adjuntos` con `ref_tipo='FacturaVenta'`, ahora `ref_id = id_factura_venta`).

- [ ] **Step 1: Reescribir el modal "Registrar factura"**

Comportamiento objetivo:
1. Al abrir, llamar `api.facturasVenta.preview(idCotizacion)` para pre-llenar.
2. Inputs PRIMARIOS visibles: `serie`, `numero`, `fecha_emision`, + el input de archivo PDF (igual que hoy, opcional).
3. Bloque plegable "▸ Detalle de la factura (editable)" con: `tipo`, `moneda`, `base_imponible`, `igv`, `total`, `aplica_detraccion`/`monto_detraccion`, `aplica_retencion`/`monto_retencion` — pre-llenados, editables.
4. Al guardar:
   a. `const r = await api.facturasVenta.crear({ id_cotizacion, serie, numero, fecha_emision, ...detalle })`.
   b. Si el usuario adjuntó archivo → `await api.adjuntos.subir('FacturaVenta', r.id, file)`. Si falla el upload, NO revertir: `showError('Factura registrada, pero el PDF no se subió. Podés subirlo desde el detalle.')`.
   c. `showSuccess('Factura registrada')`, cerrar modal, refrescar.
- Reglas: cero `alert()` (usar `showSuccess`/`showError`); el modal NO se cierra por backdrop (gotcha #28).

- [ ] **Step 2: Reescribir el bloque de factura en "Detalle de cobranza"**

1. Al abrir el detalle, `const { facturas, cuadre } = await api.facturasVenta.listar(idCotizacion)`.
2. Listar cada factura VIGENTE: `serie-numero`, fecha, total, + acciones **👁 Ver / ⬇ Descargar** (reusar `abrirAdjuntoInline` / `api.adjuntos.archivoUrl` con los adjuntos de `ref_tipo='FacturaVenta'`, `ref_id=id_factura_venta`), **✎ Editar**, **⊘ Anular** (confirmación), y **Subir/Reemplazar PDF**.
3. Botón **➕ Agregar factura** (reusa el modal del Step 1) para el caso anticipo/saldo.
4. Si `!cuadre.cuadra`, mostrar aviso: `Facturado S/ {sumaFacturado} de S/ {totalCotizacion} (faltan S/ {diferencia})`.
- Escapar con `escapeHtml`/`escapeAttr` todo dato de BD (clientes, serie, observaciones) — gotcha XSS de la auditoría V4.

- [ ] **Step 3: Bump cache buster `r2 → r3`**

Run: `sed -i 's/20260629r2/20260629r3/g' public/js/app.js public/index.html`
Verificar: `grep -c '20260629r3' public/js/app.js public/index.html` → 19 y 8; `grep -c '20260629r2' …` → 0.

- [ ] **Step 4: Verificar (sin server contra datos reales)**

Run: `node scripts/check_mojibake.js` → OK. (La verificación funcional se hace en el smoke manual de Task 8.)

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Finanzas.js public/js/app.js public/index.html
git commit -m "feat(facturacion): modal registrar factura (campos plegados) + lista en detalle + cache buster r3"
```

---

## Task 7: Retirar el cluster Nubefact

**Files:**
- Delete: `app/modules/facturacion/{FacturaService,NubefactService,NubefactPayloadBuilder,FacturaPDFService,PLEExporter,FacturacionCron}.ts`
- Modify: `index.ts` (imports + routers + cron)
- Modify: `public/js/pages/Finanzas.js`, `public/js/pages/Contabilidad.js` (UI muerta de `estado_sunat`)

- [ ] **Step 1: Borrar los 6 archivos**

```bash
git rm app/modules/facturacion/FacturaService.ts \
       app/modules/facturacion/NubefactService.ts \
       app/modules/facturacion/NubefactPayloadBuilder.ts \
       app/modules/facturacion/FacturaPDFService.ts \
       app/modules/facturacion/PLEExporter.ts \
       app/modules/facturacion/FacturacionCron.ts
```

- [ ] **Step 2: Limpiar `index.ts`**

Eliminar:
- Imports (líneas ~38-45): `NubefactService`, `FacturaService`, `FacturaPDFService`, `PLEExporter`, `FacturacionCron`.
- Router `facturacionRouter` + `app.use('/api/facturacion', …)` (líneas ~1413-1422).
- Router `facturasRouter` + `app.use('/api/facturas', …)` (líneas ~1424-1494).
- Cualquier ruta/uso de `PLEExporter` (buscar `PLEExporter` y `/ple`).
- La inicialización de `FacturacionCron` (buscar `FacturacionCron`).
Buscar referencias residuales: `grep -nE "Nubefact|FacturaService|FacturaPDFService|PLEExporter|FacturacionCron|/api/facturas['\"]|/api/facturacion" index.ts` → debe quedar SOLO `/api/facturas-venta`.

- [ ] **Step 3: Quitar la UI muerta de Nubefact en frontend**

- `public/js/pages/Finanzas.js`: buscar `estado_sunat`, `ACEPTADA`/`SIMULADO` selectores y badges de emisión electrónica (~2319, ~2433) → eliminar esos controles (NO confundir con el flujo nuevo de factura de venta).
- `public/js/pages/Contabilidad.js`: badge `estado_sunat` (~385) → eliminar.
- Buscar en `public/js`: `grep -rnE "facturasRouter|/api/facturas['\"]|api\.facturas\b|estado_sunat|emitirDesdeCotizacion" public/js` → no debe quedar nada vivo (salvo `api.facturasVenta`).

- [ ] **Step 4: Verificar build limpio (crítico — gotcha #37)**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si aparece TS2307 (módulo no encontrado) o TS2339, es una referencia residual a un archivo borrado → buscar y eliminar.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(facturacion): retirar cluster Nubefact (6 archivos + rutas + cron + UI)"
```

---

## Task 8: Verificación final + smoke + PR

- [ ] **Step 1: Verificación automática**

Run: `npx tsc --noEmit && node scripts/check_mojibake.js && npx ts-node scripts/test_factura_venta.ts`
Expected: build limpio + mojibake OK + tests pasan.

- [ ] **Step 2: Smoke manual (mostrar a Julio el comando del server, no ejecutarlo automáticamente)**

Indicar a Julio que levante el server local (`npx ts-node index.ts`) y verifique en el navegador:
1. Cotización fondeada → "Registrar factura": campos pre-llenados, subir PDF → aparece en el detalle.
2. 👁 Ver / ⬇ Descargar el PDF. ✎ Editar montos. ⊘ Anular.
3. ➕ Agregar segunda factura → aviso de cuadre.
4. Que NO haya rastros de la UI de facturación electrónica (estado SUNAT).

- [ ] **Step 3: Push y PR**

```bash
git push -u origin claude/facturacion-manual-ventas
gh pr create --base main --head claude/facturacion-manual-ventas \
  --title "Facturación manual de ventas (retira Nubefact)" \
  --body "Implementa docs/superpowers/specs/2026-06-29-facturacion-manual-ventas-design.md. Nubefact afuera; FacturaVenta 1:N + PDF; migración 081 aditiva con drop guarded. Resuelve C3/C4/C5/A8/A9 de la auditoría V4."
```

---

## Notas de seguridad de datos (transversales)

- **Backup antes de la migración** (Task 2 Step 1). La migración es aditiva; el único DROP es guarded y aborta si `facturas` no está vacía.
- **No tocar** Notas de Crédito ni `FacturaOCService` (facturas de proveedor).
- Todo en rama `claude/facturacion-manual-ventas`; **merge a `main` lo hace Julio**.
- Verificar `npx tsc --noEmit` antes de cada push (un error TS bloquea silenciosamente el deploy de Railway).

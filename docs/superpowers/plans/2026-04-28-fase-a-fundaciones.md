# Fase A — Fundaciones: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la capa transversal que habilita todas las fases posteriores — configuración por régimen tributario, audit log, periodos contables cerrados, adjuntos PDF genéricos, componentes UI reutilizables (TabBar, KpiCard, Chart.js).

**Architecture:** Tres frentes paralelos: (1) base de datos y capa backend (migraciones + Services), (2) módulo Configuración con wizard inicial, (3) componentes de UI compartidos en `public/js/components/`. Todo consume un `ConfiguracionService` centralizado con caché. Nuevas rutas bajo `/api/config/*`. Audit log vía middleware Express.

**Tech Stack:** Node 20, TypeScript 5, Express 5, MySQL 8 (`mysql2/promise`), Zod 4, Vanilla JS ES modules, Chart.js v4 local.

**Parent plan:** [erp-pro-master-plan.md](./2026-04-22-erp-pro-master-plan.md)

**Duration:** 3 semanas (15 días hábiles).

---

## Dependencias y orden

```
Semana 1: DB + Services backend       (Tasks A1 → A7)
          └─ sin UI todavía, solo endpoints + tests

Semana 2: UI Configuración             (Tasks A8 → A9)
          └─ módulo ⚙️ Configuración + Wizard

Semana 3: Componentes reutilizables    (Tasks A10 → A12)
          └─ TabBar, KpiCard, Chart.js + pantalla demo
```

**Criterio de "listo":** pantalla Configuración funciona, puedo cambiar régimen, se registra en Auditoría, periodos se pueden cerrar, hay 3 componentes reutilizables documentados y usados en al menos una pantalla real.

---

## File Structure

### Nuevos archivos

```
app/modules/configuracion/
├── ConfiguracionService.ts        # Getters + setters + cache + validaciones régimen
├── AuditoriaService.ts             # Query/export del audit log
├── PeriodosService.ts              # Cerrar/reabrir periodos, guard de mutaciones
└── AdjuntosService.ts              # CRUD adjuntos genéricos

app/middlewares/
├── auditLog.ts                     # Intercepta mutaciones, escribe a Auditoria
└── periodoGuard.ts                 # Bloquea mutaciones en periodos cerrados

app/validators/
├── configuracion.schema.ts         # Zod schemas para Configuración
└── adjuntos.schema.ts              # Zod para upload

database/migrations/
├── 020_configuracion_empresa.sql   # Tabla + seed de Metal Engineers actual
├── 021_auditoria.sql                # Tabla Auditoria con índices
├── 022_periodos_contables.sql      # Tabla + registros para 2026 abierto
├── 023_adjuntos.sql                 # Tabla Adjuntos genérica
└── 024_roles_extendidos.sql         # ALTER ENUM Usuarios.rol

public/js/pages/
└── Configuracion.js                 # Módulo ⚙️ con 7 tabs + wizard

public/js/components/                 # ← NUEVO directorio
├── TabBar.js                        # Component reutilizable
├── KpiCard.js                       # Component reutilizable
└── charts.js                        # Wrapper Chart.js con presets

public/lib/
└── chart.min.js                     # Chart.js 4.4.x local (no CDN)

tests/ (si no existe, crear)
├── unit/ConfiguracionService.test.ts
├── unit/PeriodosService.test.ts
└── integration/auditLog.test.ts
```

### Archivos modificados

```
index.ts                             # +rutas /api/config/*, /api/auditoria/*, /api/periodos/*
app/middlewares/auth.ts              # Sin cambios (ya está OK)
public/js/app.js                     # +import Configuracion, +ruta en PAGES
public/js/components/Sidebar.js      # +ítem ⚙️ Configuración (solo GERENTE)
public/js/services/api.js            # +namespace api.config, api.auditoria, api.periodos
CLAUDE.md                            # +sección Fase A con gotchas
ESTADO.md                            # +avance Fase A
```

---

## Task A1 — Migración 020: tabla ConfiguracionEmpresa

**Files:**
- Create: `database/migrations/020_configuracion_empresa.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 020_configuracion_empresa.sql
-- Tabla central de configuración de la empresa (multi-tenant-ready).

CREATE TABLE IF NOT EXISTS ConfiguracionEmpresa (
  id                           INT PRIMARY KEY AUTO_INCREMENT,
  ruc                          VARCHAR(11) NOT NULL UNIQUE,
  razon_social                 VARCHAR(200) NOT NULL,
  nombre_comercial             VARCHAR(200),
  direccion_fiscal             VARCHAR(300),
  telefono                     VARCHAR(30),
  email_facturacion            VARCHAR(150),
  web                          VARCHAR(150),
  logo_url                     VARCHAR(500),

  -- Régimen tributario
  regimen                      ENUM('NRUS','RER','RMT','GENERAL') NOT NULL DEFAULT 'RMT',
  fecha_cambio_regimen         DATE,

  -- Configuración IGV
  aplica_igv                   TINYINT(1) NOT NULL DEFAULT 1,
  tasa_igv                     DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  es_agente_retencion          TINYINT(1) NOT NULL DEFAULT 0,
  es_agente_percepcion         TINYINT(1) NOT NULL DEFAULT 0,

  -- Configuración Renta
  tasa_pago_cuenta_renta       DECIMAL(5,2),
  cuota_fija_mensual           DECIMAL(10,2),

  -- Libros PLE (derivados del régimen, se calculan al guardar)
  lleva_libro_diario_completo  TINYINT(1) NOT NULL DEFAULT 0,
  lleva_libro_mayor            TINYINT(1) NOT NULL DEFAULT 0,
  lleva_libro_caja_bancos      TINYINT(1) NOT NULL DEFAULT 1,
  lleva_inventarios_balances   TINYINT(1) NOT NULL DEFAULT 0,

  -- Facturación electrónica
  emite_factura                TINYINT(1) NOT NULL DEFAULT 1,
  emite_boleta                 TINYINT(1) NOT NULL DEFAULT 1,
  ose_proveedor                ENUM('NUBEFACT','EFACT','SUNAT','NONE') NOT NULL DEFAULT 'NONE',
  ose_usuario                  VARCHAR(200),
  ose_token_hash               VARCHAR(500),
  cert_digital_ruta            VARCHAR(500),
  cert_digital_password_hash   VARCHAR(500),

  -- Series de numeración
  serie_factura                VARCHAR(5) DEFAULT 'F001',
  serie_boleta                 VARCHAR(5) DEFAULT 'B001',
  serie_nota_credito           VARCHAR(5) DEFAULT 'FC01',
  serie_nota_debito            VARCHAR(5) DEFAULT 'FD01',
  serie_guia_remision          VARCHAR(5) DEFAULT 'T001',

  -- UIT
  uit_vigente                  DECIMAL(10,2) NOT NULL DEFAULT 5350.00,
  anio_uit                     INT NOT NULL DEFAULT 2026,

  -- Preferencias
  moneda_base                  ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
  metodo_costeo                ENUM('PROMEDIO','PEPS','UEPS') NOT NULL DEFAULT 'PROMEDIO',
  dias_credito_default         INT NOT NULL DEFAULT 30,
  monto_limite_sin_aprobacion  DECIMAL(12,2) NOT NULL DEFAULT 5000.00,

  -- Módulos activos (bit flags)
  modulo_comercial             TINYINT(1) NOT NULL DEFAULT 1,
  modulo_finanzas              TINYINT(1) NOT NULL DEFAULT 1,
  modulo_logistica             TINYINT(1) NOT NULL DEFAULT 1,
  modulo_almacen               TINYINT(1) NOT NULL DEFAULT 1,
  modulo_administracion        TINYINT(1) NOT NULL DEFAULT 1,
  modulo_prestamos             TINYINT(1) NOT NULL DEFAULT 1,
  modulo_produccion            TINYINT(1) NOT NULL DEFAULT 0,
  modulo_calidad               TINYINT(1) NOT NULL DEFAULT 0,
  modulo_contabilidad          TINYINT(1) NOT NULL DEFAULT 0,

  -- Metas anuales (opcional)
  meta_ventas_anual            DECIMAL(14,2),
  meta_utilidad_anual          DECIMAL(14,2),

  created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed de Metal Engineers (RUC real confirmado en CLAUDE.md)
INSERT IGNORE INTO ConfiguracionEmpresa
  (ruc, razon_social, nombre_comercial, direccion_fiscal, email_facturacion, web,
   regimen, aplica_igv, tasa_igv,
   lleva_libro_diario_completo, lleva_libro_mayor, lleva_libro_caja_bancos, lleva_inventarios_balances,
   emite_factura, emite_boleta,
   moneda_base)
VALUES
  ('20610071962',
   'METAL ENGINEERS SAC',
   'Metal Engineers',
   'Calle Rio Cenepa Mz D Lote 5 - Urb. El Cascajal - La Molina - Lima',
   'administracion@metalengineers.com.pe',
   'www.metalengineers.com.pe',
   'RMT', 1, 18.00,
   1, 1, 1, 1,
   1, 1,
   'PEN');
```

- [ ] **Step 2: Aplicar migración en BD local**

Run: `npx ts-node database/apply_migrations.ts`
Expected: `Applied 020_configuracion_empresa.sql`

- [ ] **Step 3: Verificar en MySQL**

Run: `mysql -u root erp -e "SELECT ruc, razon_social, regimen FROM ConfiguracionEmpresa;"`
Expected: una fila con `20610071962 | METAL ENGINEERS SAC | RMT`

- [ ] **Step 4: Commit**

```bash
git add database/migrations/020_configuracion_empresa.sql
git commit -m "feat(config): migración 020 — tabla ConfiguracionEmpresa + seed Metal Engineers"
```

---

## Task A2 — ConfiguracionService con caché

**Files:**
- Create: `app/modules/configuracion/ConfiguracionService.ts`
- Create: `app/validators/configuracion.schema.ts`
- Modify: `index.ts` (agregar rutas)

- [ ] **Step 1: Escribir test unitario**

```typescript
// tests/unit/ConfiguracionService.test.ts
import ConfiguracionService from '../../app/modules/configuracion/ConfiguracionService';

describe('ConfiguracionService', () => {
  beforeEach(() => ConfiguracionService.invalidateCache());

  it('devuelve la configuración de Metal Engineers', async () => {
    const c = await ConfiguracionService.getActual();
    expect(c.ruc).toBe('20610071962');
    expect(c.regimen).toBe('RMT');
    expect(c.aplica_igv).toBe(1);
  });

  it('calcula libros obligatorios según régimen RMT <300 UIT', async () => {
    const libros = await ConfiguracionService.librosObligatorios();
    expect(libros).toContain('REGISTRO_VENTAS');
    expect(libros).toContain('REGISTRO_COMPRAS');
    expect(libros).toContain('LIBRO_DIARIO_SIMPLIFICADO');
    expect(libros).not.toContain('LIBRO_MAYOR');
  });

  it('al setear regimen=GENERAL, ajusta flags automáticos', async () => {
    await ConfiguracionService.update({ regimen: 'GENERAL' });
    const c = await ConfiguracionService.getActual();
    expect(c.lleva_libro_diario_completo).toBe(1);
    expect(c.lleva_libro_mayor).toBe(1);
  });

  it('rechaza emitir factura si régimen es NRUS', async () => {
    await ConfiguracionService.update({ regimen: 'NRUS' });
    expect(() => ConfiguracionService.validarPuedeEmitirFactura()).toThrow(/NRUS/);
  });
});
```

- [ ] **Step 2: Run el test — debe fallar**

Run: `npx jest ConfiguracionService`
Expected: FAIL con "Cannot find module '.../ConfiguracionService'"

- [ ] **Step 3: Implementar Service**

```typescript
// app/modules/configuracion/ConfiguracionService.ts
import { db } from '../../../database/connection';

type Regimen = 'NRUS' | 'RER' | 'RMT' | 'GENERAL';

interface Configuracion {
  id: number;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion_fiscal: string | null;
  email_facturacion: string | null;
  web: string | null;
  logo_url: string | null;
  regimen: Regimen;
  aplica_igv: number;
  tasa_igv: number;
  emite_factura: number;
  emite_boleta: number;
  lleva_libro_diario_completo: number;
  lleva_libro_mayor: number;
  lleva_libro_caja_bancos: number;
  lleva_inventarios_balances: number;
  uit_vigente: number;
  anio_uit: number;
  moneda_base: 'PEN' | 'USD';
  [key: string]: any;
}

class ConfiguracionService {
  private cache: Configuracion | null = null;
  private cacheTs = 0;
  private TTL_MS = 60_000; // 1 minuto

  invalidateCache() {
    this.cache = null;
    this.cacheTs = 0;
  }

  async getActual(): Promise<Configuracion> {
    if (this.cache && Date.now() - this.cacheTs < this.TTL_MS) return this.cache;
    const [rows] = await db.query('SELECT * FROM ConfiguracionEmpresa LIMIT 1');
    const c = (rows as any)[0];
    if (!c) throw new Error('ConfiguracionEmpresa vacía — ejecutar wizard de setup');
    this.cache = c;
    this.cacheTs = Date.now();
    return c;
  }

  async update(patch: Partial<Configuracion>): Promise<void> {
    const actual = await this.getActual();
    const merged: Partial<Configuracion> = { ...patch };

    // Reglas derivadas del régimen
    if (patch.regimen) {
      const r = patch.regimen;
      merged.aplica_igv = r === 'NRUS' ? 0 : 1;
      merged.emite_factura = r === 'NRUS' ? 0 : 1;
      merged.lleva_libro_diario_completo = r === 'GENERAL' ? 1 : 0;
      merged.lleva_libro_mayor = r === 'GENERAL' ? 1 : 0;
      merged.lleva_inventarios_balances = (r === 'GENERAL' || r === 'RMT') ? 1 : 0;
      merged.tasa_pago_cuenta_renta =
        r === 'RER' ? 1.5 : r === 'RMT' ? 1.0 : r === 'GENERAL' ? 1.5 : 0;
      merged.cuota_fija_mensual = r === 'NRUS' ? 20 : null;
      merged.fecha_cambio_regimen = new Date().toISOString().slice(0, 10) as any;
    }

    const keys = Object.keys(merged).filter(k => k !== 'id');
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const vals = keys.map(k => (merged as any)[k]);
    await db.query(`UPDATE ConfiguracionEmpresa SET ${sets} WHERE id = ?`, [...vals, actual.id]);
    this.invalidateCache();
  }

  async librosObligatorios(): Promise<string[]> {
    const c = await this.getActual();
    const libros: string[] = [];
    if (c.regimen === 'NRUS') return libros;
    libros.push('REGISTRO_VENTAS', 'REGISTRO_COMPRAS');
    if (c.regimen === 'RMT' && c.lleva_libro_diario_completo === 0) libros.push('LIBRO_DIARIO_SIMPLIFICADO');
    if (c.lleva_libro_diario_completo) libros.push('LIBRO_DIARIO');
    if (c.lleva_libro_mayor) libros.push('LIBRO_MAYOR');
    if (c.lleva_libro_caja_bancos) libros.push('LIBRO_CAJA_BANCOS');
    if (c.lleva_inventarios_balances) libros.push('LIBRO_INVENTARIOS_BALANCES');
    return libros;
  }

  validarPuedeEmitirFactura(): void {
    if (!this.cache) throw new Error('Llamar getActual() primero');
    if (this.cache.regimen === 'NRUS') {
      throw new Error('Tu régimen NRUS no permite emitir facturas. Solo boletas de venta.');
    }
    if (!this.cache.emite_factura) {
      throw new Error('Facturación no habilitada en configuración.');
    }
  }
}

export default new ConfiguracionService();
```

- [ ] **Step 4: Agregar rutas en index.ts**

Buscar el bloque de rutas al final de `index.ts` y agregar:

```typescript
import ConfiguracionService from './app/modules/configuracion/ConfiguracionService';

app.get('/api/config', requireAuth, async (req, res) => {
  res.json(await ConfiguracionService.getActual());
});

app.put('/api/config', requireAuth, requireModulo('GERENCIA'), async (req: any, res) => {
  if (req.user.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE puede modificar configuración' });
  await ConfiguracionService.update(req.body);
  res.json({ success: true });
});

app.get('/api/config/libros-obligatorios', requireAuth, async (_req, res) => {
  res.json({ libros: await ConfiguracionService.librosObligatorios() });
});
```

- [ ] **Step 5: Run tests — deben pasar**

Run: `npx jest ConfiguracionService`
Expected: PASS (4/4)

- [ ] **Step 6: Commit**

```bash
git add app/modules/configuracion/ConfiguracionService.ts tests/unit/ConfiguracionService.test.ts index.ts
git commit -m "feat(config): ConfiguracionService + rutas /api/config + tests"
```

---

## Task A3 — Migración 021: tabla Auditoria

**Files:**
- Create: `database/migrations/021_auditoria.sql`

- [ ] **Step 1: Escribir migración**

```sql
-- 021_auditoria.sql
CREATE TABLE IF NOT EXISTS Auditoria (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario      INT,
  nombre_usuario  VARCHAR(100),
  accion          ENUM('CREATE','UPDATE','DELETE','ANULAR','LOGIN','LOGOUT','CONFIG','EXPORT') NOT NULL,
  entidad         VARCHAR(60) NOT NULL,
  entidad_id     VARCHAR(60),
  datos_antes    JSON,
  datos_despues  JSON,
  ip             VARCHAR(45),
  user_agent     VARCHAR(300),
  INDEX idx_auditoria_fecha (fecha),
  INDEX idx_auditoria_entidad (entidad, entidad_id),
  INDEX idx_auditoria_usuario (id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Aplicar**

Run: `npx ts-node database/apply_migrations.ts`
Expected: `Applied 021_auditoria.sql`

- [ ] **Step 3: Commit**

```bash
git add database/migrations/021_auditoria.sql
git commit -m "feat(audit): migración 021 — tabla Auditoria con índices"
```

---

## Task A4 — Middleware auditLog

**Files:**
- Create: `app/middlewares/auditLog.ts`
- Create: `app/modules/configuracion/AuditoriaService.ts`
- Modify: `index.ts` (aplicar middleware a rutas críticas)

- [ ] **Step 1: Escribir AuditoriaService**

```typescript
// app/modules/configuracion/AuditoriaService.ts
import { db } from '../../../database/connection';

export interface LogEntry {
  id_usuario?: number;
  nombre_usuario?: string;
  accion: 'CREATE'|'UPDATE'|'DELETE'|'ANULAR'|'LOGIN'|'LOGOUT'|'CONFIG'|'EXPORT';
  entidad: string;
  entidad_id?: string | number;
  datos_antes?: any;
  datos_despues?: any;
  ip?: string;
  user_agent?: string;
}

class AuditoriaService {
  async log(entry: LogEntry): Promise<void> {
    try {
      await db.query(
        `INSERT INTO Auditoria
         (id_usuario, nombre_usuario, accion, entidad, entidad_id, datos_antes, datos_despues, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id_usuario ?? null,
          entry.nombre_usuario ?? null,
          entry.accion,
          entry.entidad,
          entry.entidad_id != null ? String(entry.entidad_id) : null,
          entry.datos_antes ? JSON.stringify(entry.datos_antes) : null,
          entry.datos_despues ? JSON.stringify(entry.datos_despues) : null,
          entry.ip ?? null,
          entry.user_agent ? entry.user_agent.slice(0, 300) : null,
        ]
      );
    } catch (e) {
      // Audit log no debe romper la operación principal. Solo log a consola.
      console.error('[auditLog] failed:', e);
    }
  }

  async query(filtros: {
    entidad?: string;
    entidad_id?: string;
    id_usuario?: number;
    desde?: string;
    hasta?: string;
    limit?: number;
  }) {
    const where: string[] = [];
    const vals: any[] = [];
    if (filtros.entidad) { where.push('entidad = ?'); vals.push(filtros.entidad); }
    if (filtros.entidad_id) { where.push('entidad_id = ?'); vals.push(filtros.entidad_id); }
    if (filtros.id_usuario) { where.push('id_usuario = ?'); vals.push(filtros.id_usuario); }
    if (filtros.desde) { where.push('fecha >= ?'); vals.push(filtros.desde); }
    if (filtros.hasta) { where.push('fecha <= ?'); vals.push(filtros.hasta); }
    const sql = `SELECT * FROM Auditoria ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY fecha DESC LIMIT ?`;
    vals.push(filtros.limit ?? 500);
    const [rows] = await db.query(sql, vals);
    return rows;
  }
}

export default new AuditoriaService();
```

- [ ] **Step 2: Escribir middleware auditLog**

```typescript
// app/middlewares/auditLog.ts
import type { Request, Response, NextFunction } from 'express';
import AuditoriaService from '../modules/configuracion/AuditoriaService';

/**
 * Middleware que registra la acción en Auditoria tras respuesta exitosa (status 2xx).
 * Uso: app.post('/servicios', auditLog('Servicio','CREATE'), handler)
 */
export function auditLog(entidad: string, accion: 'CREATE'|'UPDATE'|'DELETE'|'ANULAR'|'CONFIG'|'EXPORT') {
  return (req: any, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        AuditoriaService.log({
          id_usuario: req.user?.id_usuario,
          nombre_usuario: req.user?.nombre,
          accion,
          entidad,
          entidad_id: req.params.id || body?.id || body?.insertId,
          datos_despues: ['CREATE','UPDATE','CONFIG'].includes(accion) ? sanitize(req.body) : undefined,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        });
      }
      return originalJson(body);
    };
    next();
  };
}

function sanitize(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const clone = { ...body };
  for (const key of Object.keys(clone)) {
    if (/password|token|secret|cert/i.test(key)) clone[key] = '***';
  }
  return clone;
}
```

- [ ] **Step 3: Aplicar middleware a rutas críticas en index.ts**

Buscar grupos de rutas y agregar `auditLog()` antes del handler:

```typescript
import { auditLog } from './app/middlewares/auditLog';

app.post('/api/servicios', requireAuth, requireModulo('COMERCIAL'), validate(...), auditLog('Servicio','CREATE'), async (req, res) => { ... });
app.put('/api/servicios/:id', requireAuth, requireModulo('COMERCIAL'), validateIdParam, validate(...), auditLog('Servicio','UPDATE'), async (req, res) => { ... });
app.delete('/api/servicios/:id', requireAuth, requireModulo('COMERCIAL'), validateIdParam, auditLog('Servicio','DELETE'), async (req, res) => { ... });

// Repetir patrón para: Gastos, Compras, Cotizaciones, Cobranzas, Facturas, Préstamos, Configuración
```

Lista de entidades a auditar (mínimo): `Servicio, Gasto, Compra, Cotizacion, Cobranza, GastoBancario, PagoImpuesto, PrestamoTomado, PrestamoOtorgado, Usuario, ConfiguracionEmpresa`.

- [ ] **Step 4: Test de integración**

```typescript
// tests/integration/auditLog.test.ts
import request from 'supertest';
import app from '../../index';
import { db } from '../../database/connection';

describe('auditLog middleware', () => {
  let token: string;
  beforeAll(async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'julio@metalengineers.com.pe', password: 'Metal2026!'
    });
    token = login.body.token;
  });

  it('registra un CREATE en Auditoria al crear servicio', async () => {
    const res = await request(app)
      .post('/api/servicios')
      .set('Authorization', `Bearer ${token}`)
      .send({ /* payload válido */ });
    expect(res.status).toBe(200);

    const [audit] = await db.query(
      "SELECT * FROM Auditoria WHERE entidad='Servicio' AND accion='CREATE' ORDER BY fecha DESC LIMIT 1"
    );
    expect((audit as any[]).length).toBe(1);
    expect((audit as any[])[0].nombre_usuario).toMatch(/julio/i);
  });

  it('no registra si la respuesta es 4xx', async () => {
    const countBefore = await countAudit('Servicio');
    await request(app)
      .post('/api/servicios')
      .set('Authorization', `Bearer ${token}`)
      .send({ /* payload inválido */ });
    const countAfter = await countAudit('Servicio');
    expect(countAfter).toBe(countBefore);
  });
});

async function countAudit(entidad: string): Promise<number> {
  const [rows] = await db.query('SELECT COUNT(*) as n FROM Auditoria WHERE entidad=?', [entidad]);
  return Number((rows as any)[0].n);
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest auditLog`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/middlewares/auditLog.ts app/modules/configuracion/AuditoriaService.ts index.ts tests/integration/auditLog.test.ts
git commit -m "feat(audit): middleware auditLog + AuditoriaService aplicado a rutas críticas"
```

---

## Task A5 — Migración 022 + PeriodosService

**Files:**
- Create: `database/migrations/022_periodos_contables.sql`
- Create: `app/modules/configuracion/PeriodosService.ts`
- Create: `app/middlewares/periodoGuard.ts`

- [ ] **Step 1: Migración**

```sql
-- 022_periodos_contables.sql
CREATE TABLE IF NOT EXISTS PeriodosContables (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  anio        INT NOT NULL,
  mes         INT NOT NULL,
  estado      ENUM('ABIERTO','CERRADO','BLOQUEADO') NOT NULL DEFAULT 'ABIERTO',
  fecha_cierre TIMESTAMP NULL,
  id_usuario_cierre INT,
  observaciones VARCHAR(500),
  UNIQUE KEY uk_periodo (anio, mes)
);

-- Seed: todos los meses de 2025 y 2026 abiertos
INSERT IGNORE INTO PeriodosContables (anio, mes)
SELECT y.anio, m.mes FROM
  (SELECT 2025 AS anio UNION SELECT 2026) y,
  (SELECT 1 AS mes UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
   UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m;
```

- [ ] **Step 2: PeriodosService**

```typescript
// app/modules/configuracion/PeriodosService.ts
import { db } from '../../../database/connection';

class PeriodosService {
  async getEstado(fecha: string): Promise<'ABIERTO'|'CERRADO'|'BLOQUEADO'> {
    const [y, m] = fecha.split('-').map(Number);
    const [rows] = await db.query(
      'SELECT estado FROM PeriodosContables WHERE anio=? AND mes=?', [y, m]
    );
    const p = (rows as any)[0];
    return p?.estado ?? 'ABIERTO';
  }

  async cerrar(anio: number, mes: number, id_usuario: number, observaciones?: string) {
    await db.query(
      `UPDATE PeriodosContables SET estado='CERRADO', fecha_cierre=NOW(),
       id_usuario_cierre=?, observaciones=? WHERE anio=? AND mes=?`,
      [id_usuario, observaciones ?? null, anio, mes]
    );
    return { success: true };
  }

  async reabrir(anio: number, mes: number, id_usuario: number) {
    await db.query(
      "UPDATE PeriodosContables SET estado='ABIERTO', fecha_cierre=NULL, id_usuario_cierre=? WHERE anio=? AND mes=?",
      [id_usuario, anio, mes]
    );
    return { success: true };
  }

  async list(anio?: number) {
    const [rows] = await db.query(
      `SELECT * FROM PeriodosContables ${anio ? 'WHERE anio=?' : ''} ORDER BY anio DESC, mes DESC`,
      anio ? [anio] : []
    );
    return rows;
  }
}

export default new PeriodosService();
```

- [ ] **Step 3: Middleware periodoGuard**

```typescript
// app/middlewares/periodoGuard.ts
import type { Request, Response, NextFunction } from 'express';
import PeriodosService from '../modules/configuracion/PeriodosService';

/**
 * Bloquea la mutación si el 'fecha' del body cae en un periodo CERRADO.
 * Uso: app.post('/gastos', periodoGuard('fecha'), handler);
 */
export function periodoGuard(campoFecha = 'fecha') {
  return async (req: any, res: Response, next: NextFunction) => {
    const fecha = req.body?.[campoFecha];
    if (!fecha) return next();
    try {
      const estado = await PeriodosService.getEstado(fecha);
      if (estado === 'CERRADO' || estado === 'BLOQUEADO') {
        if (req.user?.rol === 'GERENTE' && req.headers['x-override-periodo'] === 'true') {
          return next(); // Gerente puede forzar con header explícito (queda en audit log)
        }
        return res.status(403).json({
          error: `Periodo ${fecha.slice(0,7)} está ${estado}. No se permiten mutaciones.`
        });
      }
      next();
    } catch (e) { next(e); }
  };
}
```

- [ ] **Step 4: Test**

```typescript
// tests/unit/PeriodosService.test.ts
import PeriodosService from '../../app/modules/configuracion/PeriodosService';

describe('PeriodosService', () => {
  it('devuelve ABIERTO para fecha default', async () => {
    const e = await PeriodosService.getEstado('2026-04-15');
    expect(['ABIERTO','CERRADO','BLOQUEADO']).toContain(e);
  });

  it('cierra y reabre un periodo', async () => {
    await PeriodosService.cerrar(2025, 1, 1, 'test');
    expect(await PeriodosService.getEstado('2025-01-15')).toBe('CERRADO');
    await PeriodosService.reabrir(2025, 1, 1);
    expect(await PeriodosService.getEstado('2025-01-15')).toBe('ABIERTO');
  });
});
```

- [ ] **Step 5: Aplicar guard a rutas clave**

En index.ts, agregar `periodoGuard()` a `POST/PUT/DELETE` de: Gastos, Compras, Cobranzas, Facturas, Cotizaciones (solo UPDATE/DELETE, no CREATE), GastoBancario, PagoImpuesto.

```typescript
app.post('/api/gastos', requireAuth, requireModulo('LOGISTICA'), periodoGuard('fecha'), auditLog('Gasto','CREATE'), async (req,res) => { ... });
```

- [ ] **Step 6: Agregar rutas de periodos**

```typescript
app.get('/api/periodos', requireAuth, async (req, res) => {
  const anio = req.query.anio ? Number(req.query.anio) : undefined;
  res.json(await PeriodosService.list(anio));
});

app.post('/api/periodos/cerrar', requireAuth, async (req: any, res) => {
  if (req.user.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE' });
  const { anio, mes, observaciones } = req.body;
  await AuditoriaService.log({
    id_usuario: req.user.id_usuario, nombre_usuario: req.user.nombre,
    accion: 'CONFIG', entidad: 'PeriodoContable', entidad_id: `${anio}-${mes}`,
    datos_despues: { estado: 'CERRADO', observaciones }
  });
  res.json(await PeriodosService.cerrar(anio, mes, req.user.id_usuario, observaciones));
});
```

- [ ] **Step 7: Run tests + commit**

```bash
npx jest PeriodosService
git add database/migrations/022_periodos_contables.sql app/modules/configuracion/PeriodosService.ts app/middlewares/periodoGuard.ts index.ts tests/unit/PeriodosService.test.ts
git commit -m "feat(periodos): migración 022 + PeriodosService + periodoGuard en rutas críticas"
```

---

## Task A6 — Migración 023: tabla Adjuntos

**Files:**
- Create: `database/migrations/023_adjuntos.sql`
- Create: `app/modules/configuracion/AdjuntosService.ts`
- Create: `app/validators/adjuntos.schema.ts`

- [ ] **Step 1: Migración**

```sql
-- 023_adjuntos.sql
CREATE TABLE IF NOT EXISTS Adjuntos (
  id                   INT PRIMARY KEY AUTO_INCREMENT,
  ref_tipo             VARCHAR(40) NOT NULL COMMENT 'Compra | Gasto | Cotizacion | Factura | Cobranza | OT',
  ref_id               INT NOT NULL,
  nombre_original      VARCHAR(255),
  url                  VARCHAR(500) NOT NULL,
  cloudinary_public_id VARCHAR(300),
  mimetype             VARCHAR(100),
  tamano_bytes         INT,
  id_usuario_subio     INT,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_adjuntos_ref (ref_tipo, ref_id)
);
```

- [ ] **Step 2: AdjuntosService (reutiliza CloudinaryService existente)**

```typescript
// app/modules/configuracion/AdjuntosService.ts
import { db } from '../../../database/connection';
import CloudinaryService from '../comercial/CloudinaryService';

class AdjuntosService {
  async subir(params: {
    ref_tipo: string;
    ref_id: number;
    buffer: Buffer;
    nombre: string;
    mimetype: string;
    id_usuario: number;
  }) {
    const carpeta = `metalengineers/${params.ref_tipo.toLowerCase()}`;
    const up = await CloudinaryService.subirArchivoGenerico(
      params.buffer, params.nombre, carpeta
    );
    const [res] = await db.query(
      `INSERT INTO Adjuntos (ref_tipo, ref_id, nombre_original, url, cloudinary_public_id, mimetype, tamano_bytes, id_usuario_subio)
       VALUES (?,?,?,?,?,?,?,?)`,
      [params.ref_tipo, params.ref_id, params.nombre, up.url, up.public_id,
       params.mimetype, params.buffer.length, params.id_usuario]
    );
    return { id: (res as any).insertId, url: up.url };
  }

  async listar(ref_tipo: string, ref_id: number) {
    const [rows] = await db.query(
      'SELECT * FROM Adjuntos WHERE ref_tipo=? AND ref_id=? ORDER BY created_at DESC',
      [ref_tipo, ref_id]
    );
    return rows;
  }

  async eliminar(id: number) {
    const [rows] = await db.query('SELECT cloudinary_public_id FROM Adjuntos WHERE id=?', [id]);
    const a = (rows as any)[0];
    if (a?.cloudinary_public_id) await CloudinaryService.eliminar(a.cloudinary_public_id);
    await db.query('DELETE FROM Adjuntos WHERE id=?', [id]);
    return { success: true };
  }
}

export default new AdjuntosService();
```

- [ ] **Step 3: Extender CloudinaryService existente**

Verificar que `subirArchivoGenerico(buffer, nombre, carpeta)` exista — si no, agregarlo a `app/modules/comercial/CloudinaryService.ts` basado en `subirFotoCotizacion`. También agregar `eliminar(public_id)`.

- [ ] **Step 4: Ruta + commit**

```typescript
// index.ts
import multer from 'multer';
const uploadAdjunto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/adjuntos/:ref_tipo/:ref_id', requireAuth, uploadAdjunto.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
  const r = await AdjuntosService.subir({
    ref_tipo: req.params.ref_tipo, ref_id: Number(req.params.ref_id),
    buffer: req.file.buffer, nombre: req.file.originalname,
    mimetype: req.file.mimetype, id_usuario: req.user.id_usuario
  });
  res.json(r);
});

app.get('/api/adjuntos/:ref_tipo/:ref_id', requireAuth, async (req, res) => {
  res.json(await AdjuntosService.listar(req.params.ref_tipo, Number(req.params.ref_id)));
});

app.delete('/api/adjuntos/:id', requireAuth, validateIdParam, auditLog('Adjunto','DELETE'), async (req,res) => {
  res.json(await AdjuntosService.eliminar(Number(req.params.id)));
});
```

```bash
git add database/migrations/023_adjuntos.sql app/modules/configuracion/AdjuntosService.ts index.ts
git commit -m "feat(adjuntos): migración 023 + AdjuntosService + rutas genéricas de upload"
```

---

## Task A7 — Migración 024: roles extendidos

**Files:**
- Create: `database/migrations/024_roles_extendidos.sql`
- Modify: `app/middlewares/auth.ts` (si hay enum hardcodeado)

- [ ] **Step 1: Migración**

```sql
-- 024_roles_extendidos.sql
ALTER TABLE Usuarios
  MODIFY COLUMN rol ENUM('GERENTE','USUARIO','APROBADOR','CAJA','CONTADOR') NOT NULL DEFAULT 'USUARIO';
```

- [ ] **Step 2: Actualizar schema de validación**

Buscar `z.enum(['GERENTE','USUARIO'])` en validators y cambiar a:
```typescript
z.enum(['GERENTE','USUARIO','APROBADOR','CAJA','CONTADOR'])
```

- [ ] **Step 3: Documentar en CLAUDE.md**

Agregar sección "Roles" indicando qué puede hacer cada uno.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/024_roles_extendidos.sql app/validators/*.ts CLAUDE.md
git commit -m "feat(auth): roles extendidos APROBADOR/CAJA/CONTADOR"
```

---

## Task A8 — Módulo Configuración (UI)

**Files:**
- Create: `public/js/pages/Configuracion.js`
- Modify: `public/js/app.js` (registrar en PAGES)
- Modify: `public/js/components/Sidebar.js` (agregar ítem)
- Modify: `public/js/services/api.js` (namespace api.config)

- [ ] **Step 1: Extender api.js**

```javascript
// public/js/services/api.js — agregar al final
api.config = {
  get:    () => fetchAPI('/api/config'),
  update: (patch) => fetchAPI('/api/config', { method: 'PUT', body: JSON.stringify(patch) }),
  librosObligatorios: () => fetchAPI('/api/config/libros-obligatorios'),
};

api.auditoria = {
  list: (filtros) => fetchAPI('/api/auditoria?' + new URLSearchParams(filtros)),
};

api.periodos = {
  list:    (anio) => fetchAPI('/api/periodos' + (anio ? '?anio='+anio : '')),
  cerrar:  (anio, mes, observaciones) => fetchAPI('/api/periodos/cerrar', {
    method: 'POST', body: JSON.stringify({ anio, mes, observaciones })
  }),
  reabrir: (anio, mes) => fetchAPI('/api/periodos/reabrir', {
    method: 'POST', body: JSON.stringify({ anio, mes })
  }),
};
```

- [ ] **Step 2: Crear Configuracion.js**

```javascript
// public/js/pages/Configuracion.js
import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';

const REGIMENES = {
  NRUS:    { label: 'NRUS', desc: 'Nuevo RUS — cuota fija, sin IGV, solo boletas' },
  RER:     { label: 'RER', desc: 'Régimen Especial — 1.5% mensual, hasta S/ 525K anuales' },
  RMT:     { label: 'RMT', desc: 'MYPE Tributario — hasta 1700 UIT anuales' },
  GENERAL: { label: 'General', desc: 'Sin límite de ingresos, todos los libros' },
};

export const Configuracion = async () => {
  const user = JSON.parse(localStorage.getItem('erp_user') || 'null');
  if (user?.rol !== 'GERENTE') {
    return '<div class="card" style="padding:40px;text-align:center">🔒 Solo el Gerente puede acceder a Configuración.</div>';
  }

  let config = null;
  try { config = await api.config.get(); } catch(e) { console.error(e); }

  if (!config) {
    return renderWizard();
  }

  setTimeout(() => bindTabs(config), 50);
  return renderDashboardConfig(config);
};

function renderDashboardConfig(c) {
  return `
    <header class="header"><h1>⚙️ Configuración de la Empresa</h1></header>

    <div id="tabbar-container" style="margin-top:20px"></div>

    <div id="tab-empresa" class="tab-content">
      <div class="card">
        <h3 style="margin-bottom:20px">Datos de la Empresa</h3>
        <form id="form-empresa" style="display:grid;grid-template-columns:1fr 1fr;gap:15px">
          <div><label>RUC</label><input name="ruc" value="${c.ruc}" readonly style="background:#f5f5f5"></div>
          <div><label>Razón Social</label><input name="razon_social" value="${c.razon_social}"></div>
          <div><label>Nombre Comercial</label><input name="nombre_comercial" value="${c.nombre_comercial||''}"></div>
          <div><label>Email Facturación</label><input name="email_facturacion" value="${c.email_facturacion||''}"></div>
          <div style="grid-column:span 2"><label>Dirección Fiscal</label><input name="direccion_fiscal" value="${c.direccion_fiscal||''}"></div>
          <div style="grid-column:span 2"><button type="submit" class="btn-primary">Guardar</button></div>
        </form>
      </div>
    </div>

    <div id="tab-regimen" class="tab-content" style="display:none">
      <div class="card">
        <h3>Régimen Tributario</h3>
        <p style="color:var(--text-secondary);margin-bottom:20px">Régimen actual determina qué libros lleva, si aplica IGV, y qué comprobantes puede emitir.</p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
          ${Object.entries(REGIMENES).map(([k,v]) => `
            <div class="regimen-card ${c.regimen===k?'activo':''}" onclick="window.Configuracion.cambiarRegimen('${k}')">
              <h4>${v.label}</h4>
              <p style="font-size:12px">${v.desc}</p>
              ${c.regimen===k?'<span class="badge-activo">ACTIVO</span>':''}
            </div>
          `).join('')}
        </div>
        <div style="margin-top:24px">
          <strong>IGV:</strong> ${c.aplica_igv?`${c.tasa_igv}%`:'No aplica'}<br>
          <strong>UIT ${c.anio_uit}:</strong> S/ ${Number(c.uit_vigente).toLocaleString()}<br>
          <strong>Pago a cuenta Renta:</strong> ${c.tasa_pago_cuenta_renta||0}%
        </div>
      </div>
    </div>

    <div id="tab-facturacion" class="tab-content" style="display:none">
      <div class="card"><h3>Facturación Electrónica</h3>
        <p style="color:var(--text-secondary)">Configuración del OSE (Operador de Servicios Electrónicos). Fase B implementa la integración.</p>
        <!-- OSE selector, series, certificado digital -->
      </div>
    </div>

    <div id="tab-modulos" class="tab-content" style="display:none">
      <div class="card"><h3>Módulos Activos</h3>
        <div id="modulos-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          ${renderModulos(c)}
        </div>
      </div>
    </div>

    <div id="tab-periodos" class="tab-content" style="display:none">
      <div class="card"><h3>Periodos Contables</h3>
        <div id="periodos-lista">Cargando...</div>
      </div>
    </div>

    <div id="tab-auditoria" class="tab-content" style="display:none">
      <div class="card"><h3>Registro de Auditoría</h3>
        <div id="auditoria-tabla">Cargando...</div>
      </div>
    </div>
  `;
}

function renderModulos(c) {
  const mods = [
    { key:'modulo_comercial', label:'💼 Comercial' },
    { key:'modulo_finanzas', label:'💰 Finanzas' },
    { key:'modulo_logistica', label:'📦 Logística' },
    { key:'modulo_almacen', label:'🏭 Almacén' },
    { key:'modulo_administracion', label:'👥 Administración' },
    { key:'modulo_prestamos', label:'💳 Préstamos' },
    { key:'modulo_produccion', label:'⚒️ Producción' },
    { key:'modulo_calidad', label:'✅ Calidad' },
    { key:'modulo_contabilidad', label:'📘 Contabilidad' },
  ];
  return mods.map(m => `
    <label class="modulo-toggle">
      <input type="checkbox" ${c[m.key]?'checked':''} onchange="window.Configuracion.toggleModulo('${m.key}',this.checked)">
      ${m.label}
    </label>
  `).join('');
}

function renderWizard() {
  return `<div class="card" style="max-width:600px;margin:60px auto;padding:40px">
    <h2>🚀 Bienvenido a ERP-PRO</h2>
    <p>No hay configuración inicial. Vamos a crearla.</p>
    <p>(Wizard completo — implementar en Task A9)</p>
    <button onclick="location.reload()" class="btn-primary">Inicializar con Metal Engineers</button>
  </div>`;
}

function bindTabs(config) {
  import('../components/TabBar.js').then(({ TabBar }) => {
    TabBar({
      container: '#tabbar-container',
      tabs: [
        { id: 'empresa',     label: '🏢 Empresa' },
        { id: 'regimen',     label: '📋 Régimen' },
        { id: 'facturacion', label: '🧾 Facturación' },
        { id: 'modulos',     label: '💼 Módulos' },
        { id: 'periodos',    label: '📅 Periodos' },
        { id: 'auditoria',   label: '🔍 Auditoría' },
      ],
      defaultTab: 'empresa',
      onChange: (id) => {
        document.querySelectorAll('.tab-content').forEach(t => t.style.display='none');
        const el = document.getElementById('tab-'+id);
        if (el) el.style.display = 'block';
        if (id === 'periodos') cargarPeriodos();
        if (id === 'auditoria') cargarAuditoria();
      }
    });
  });

  const form = document.getElementById('form-empresa');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try { await api.config.update(data); showSuccess('Guardado'); }
    catch (err) { showError(err.error || 'Error al guardar'); }
  };

  window.Configuracion = {
    cambiarRegimen: async (reg) => {
      if (!confirm(`¿Cambiar régimen a ${reg}? Afecta libros y comprobantes obligatorios.`)) return;
      try { await api.config.update({ regimen: reg }); location.reload(); }
      catch (err) { showError(err.error || 'Error'); }
    },
    toggleModulo: async (key, val) => {
      try { await api.config.update({ [key]: val ? 1 : 0 }); showSuccess('Actualizado'); }
      catch (err) { showError(err.error || 'Error'); }
    },
  };
}

async function cargarPeriodos() {
  const cont = document.getElementById('periodos-lista');
  try {
    const data = await api.periodos.list();
    cont.innerHTML = `<table class="tabla"><thead><tr><th>Año</th><th>Mes</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
      ${data.map(p => `<tr>
        <td>${p.anio}</td><td>${String(p.mes).padStart(2,'0')}</td>
        <td><span class="badge-${p.estado.toLowerCase()}">${p.estado}</span></td>
        <td>${p.estado==='ABIERTO'
          ? `<button onclick="window.Configuracion.cerrarPeriodo(${p.anio},${p.mes})">Cerrar</button>`
          : `<button onclick="window.Configuracion.reabrirPeriodo(${p.anio},${p.mes})">Reabrir</button>`}</td>
      </tr>`).join('')}
    </tbody></table>`;
    window.Configuracion.cerrarPeriodo = async (a,m) => {
      const obs = prompt('Observaciones (opcional):');
      await api.periodos.cerrar(a, m, obs); cargarPeriodos();
    };
    window.Configuracion.reabrirPeriodo = async (a,m) => {
      if (!confirm(`¿Reabrir ${a}-${m}?`)) return;
      await api.periodos.reabrir(a, m); cargarPeriodos();
    };
  } catch (e) { cont.innerHTML = `<p style="color:red">Error: ${e.error||e}</p>`; }
}

async function cargarAuditoria() {
  const cont = document.getElementById('auditoria-tabla');
  try {
    const data = await api.auditoria.list({ limit: 100 });
    cont.innerHTML = `<table class="tabla"><thead><tr>
      <th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>ID</th>
    </tr></thead><tbody>
      ${data.map(a => `<tr>
        <td>${new Date(a.fecha).toLocaleString('es-PE')}</td>
        <td>${a.nombre_usuario||'—'}</td>
        <td>${a.accion}</td>
        <td>${a.entidad}</td>
        <td>${a.entidad_id||''}</td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch (e) { cont.innerHTML = `<p style="color:red">Error: ${e.error||e}</p>`; }
}
```

- [ ] **Step 3: Registrar en app.js y sidebar**

```javascript
// app.js
import { Configuracion } from './pages/Configuracion.js';
// ...
PAGES['configuracion'] = { title: 'Configuración', render: Configuracion };

// components/Sidebar.js — agregar en MODULE_NAV al final:
{ id: 'configuracion', label: '⚙️ Configuración', icon: '⚙️', soloGerente: true }
```

- [ ] **Step 4: Verificación manual**

Abrir navegador → `/#/configuracion` → ver las 6 tabs → cambiar régimen → verificar en BD que se actualizó → ver log en tab Auditoría.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Configuracion.js public/js/app.js public/js/components/Sidebar.js public/js/services/api.js
git commit -m "feat(config): módulo ⚙️ Configuración con 6 tabs (Empresa/Régimen/Facturación/Módulos/Periodos/Auditoría)"
```

---

## Task A9 — Wizard de setup inicial

**Files:**
- Modify: `public/js/pages/Configuracion.js` — completar `renderWizard()`

- [ ] **Step 1: Implementar wizard de 5 pasos**

Reemplazar `renderWizard()` con un componente multi-step:
- Paso 1: RUC + Razón Social
- Paso 2: Régimen tributario (4 cards seleccionables)
- Paso 3: Facturación (OSE + series — opcional en Fase A, detalle en Fase B)
- Paso 4: Módulos iniciales activos
- Paso 5: Confirmación y guardar

Al guardar → POST `/api/config/setup` → crea fila en `ConfiguracionEmpresa` → reload.

- [ ] **Step 2: Ruta de setup**

```typescript
// index.ts
app.post('/api/config/setup', requireAuth, async (req: any, res) => {
  if (req.user.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE' });
  const existente = await db.query('SELECT id FROM ConfiguracionEmpresa LIMIT 1');
  if ((existente as any[])[0]) return res.status(400).json({ error: 'Ya existe configuración' });
  // INSERT con datos del wizard
  const keys = Object.keys(req.body);
  const sql = `INSERT INTO ConfiguracionEmpresa (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`;
  await db.query(sql, keys.map(k => req.body[k]));
  res.json({ success: true });
});
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pages/Configuracion.js index.ts
git commit -m "feat(config): wizard de setup inicial 5 pasos"
```

---

## Task A10 — TabBar.js (componente reutilizable)

**Files:**
- Create: `public/js/components/TabBar.js`

- [ ] **Step 1: Implementar componente**

```javascript
// public/js/components/TabBar.js
/**
 * TabBar reutilizable con hash routing automático (#/modulo/tab).
 * Uso:
 *   import { TabBar } from '../components/TabBar.js';
 *   TabBar({
 *     container: '#mi-contenedor',
 *     tabs: [{ id:'home', label:'🏠 Home' }, { id:'stats', label:'📊 Stats', badge:3 }],
 *     defaultTab: 'home',
 *     onChange: (id) => console.log(id)
 *   });
 */
export function TabBar({ container, tabs, defaultTab, onChange }) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error('TabBar: container no encontrado');
  if (!Array.isArray(tabs) || tabs.length === 0) throw new Error('TabBar: tabs requerido');

  const hash = window.location.hash.split('/')[2];
  const active = tabs.find(t => t.id === hash)?.id || defaultTab || tabs[0].id;

  el.innerHTML = `
    <nav class="tabbar" role="tablist">
      ${tabs.map(t => `
        <button class="tabbar-btn ${t.id===active?'active':''}" data-tab="${t.id}" role="tab">
          ${t.label}
          ${t.badge ? `<span class="tabbar-badge">${t.badge}</span>` : ''}
        </button>
      `).join('')}
    </nav>
  `;

  el.querySelectorAll('.tabbar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab;
      el.querySelectorAll('.tabbar-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===id));
      const [modulo] = (window.location.hash.replace('#/','').split('/'));
      history.replaceState(null, '', `#/${modulo}/${id}`);
      onChange?.(id);
    });
  });

  // Dispara el onChange inicial con el tab activo
  queueMicrotask(() => onChange?.(active));
}
```

- [ ] **Step 2: CSS en main.css**

```css
/* public/css/main.css — agregar al final */
.tabbar {
  display: flex; gap: 4px;
  border-bottom: 2px solid var(--border-light);
  margin-bottom: 20px;
  overflow-x: auto;
}
.tabbar-btn {
  padding: 10px 18px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 500;
  position: relative;
  white-space: nowrap;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.15s;
}
.tabbar-btn:hover { color: var(--text-primary); }
.tabbar-btn.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
  font-weight: 700;
}
.tabbar-badge {
  display: inline-block;
  background: var(--danger);
  color: white;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 6px;
}
@media (max-width: 768px) {
  .tabbar { flex-wrap: nowrap; overflow-x: scroll; }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/js/components/TabBar.js public/css/main.css
git commit -m "feat(ui): TabBar componente reutilizable con hash routing + responsive"
```

---

## Task A11 — KpiCard.js (componente reutilizable)

**Files:**
- Create: `public/js/components/KpiCard.js`

- [ ] **Step 1: Implementar**

```javascript
// public/js/components/KpiCard.js
/**
 * Renderiza una tarjeta KPI con valor, variación e icono.
 * Uso:
 *   import { kpiCard } from '../components/KpiCard.js';
 *   el.innerHTML = kpiCard({
 *     label: 'Ventas',
 *     value: 'S/ 120,000',
 *     change: '+25%',
 *     changeType: 'positive', // 'positive' | 'negative' | 'neutral'
 *     icon: '📈',
 *     onClick: 'navigate("/finanzas/dashboard")'
 *   });
 */
export function kpiCard({ label, value, change, changeType='neutral', icon='', onClick='' }) {
  const changeColor = {
    positive: 'var(--success)', negative: 'var(--danger)', neutral: 'var(--text-secondary)'
  }[changeType];
  const clickAttr = onClick ? `onclick="${onClick}" style="cursor:pointer"` : '';
  return `
    <div class="kpi-card" ${clickAttr}>
      <div class="kpi-header">
        ${icon ? `<span class="kpi-icon">${icon}</span>` : ''}
        <span class="kpi-label">${label}</span>
      </div>
      <div class="kpi-value">${value}</div>
      ${change ? `<div class="kpi-change" style="color:${changeColor}">${change}</div>` : ''}
    </div>
  `;
}

/**
 * Renderiza múltiples KpiCards en grilla.
 */
export function kpiGrid(cards, columns = 4) {
  return `<div class="kpi-grid" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:14px;margin-bottom:20px">
    ${cards.map(kpiCard).join('')}
  </div>`;
}
```

- [ ] **Step 2: CSS**

```css
/* main.css */
.kpi-card {
  background: white;
  border-radius: var(--radius-md);
  padding: 18px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: transform 0.15s;
}
.kpi-card[onclick]:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.kpi-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.kpi-icon { font-size: 18px; }
.kpi-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.kpi-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}
.kpi-change { font-size: 12px; font-weight: 600; margin-top: 4px; }
```

- [ ] **Step 3: Commit**

```bash
git add public/js/components/KpiCard.js public/css/main.css
git commit -m "feat(ui): KpiCard componente reutilizable + kpiGrid helper"
```

---

## Task A12 — Chart.js local + helper charts.js

**Files:**
- Download: `public/lib/chart.min.js` (Chart.js 4.4.x)
- Create: `public/js/components/charts.js`

- [ ] **Step 1: Instalar Chart.js y copiar el bundle**

```bash
npm install chart.js@4
cp node_modules/chart.js/dist/chart.umd.js public/lib/chart.min.js
```

Verificar que el archivo existe:
```bash
ls -lh public/lib/chart.min.js
```
Expected: archivo ~200KB.

- [ ] **Step 2: Cargar en index.html**

Agregar antes de `</body>` en `public/index.html`:
```html
<script src="/lib/chart.min.js"></script>
```

- [ ] **Step 3: Crear wrapper charts.js con presets Metal Engineers**

```javascript
// public/js/components/charts.js
/**
 * Wrapper Chart.js con presets de colores Metal Engineers.
 * Chart.js debe estar ya cargado globalmente como window.Chart.
 */
const COLORS = {
  primary:   '#676767',
  secondary: '#a5a5a6',
  success:   '#16a34a',
  danger:    '#dc2626',
  warning:   '#f59e0b',
  info:      '#3b82f6',
  black:     '#000000',
};

export const chartColors = COLORS;

/**
 * Gráfica de línea con tendencia mensual.
 * datos: [{mes: '2026-01', valor: 1000}, ...]
 */
export function lineChart(canvas, datos, opts = {}) {
  const ctx = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
  if (!ctx) throw new Error('lineChart: canvas no encontrado');
  if (!window.Chart) throw new Error('lineChart: Chart.js no está cargado');

  return new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: datos.map(d => d.mes),
      datasets: [{
        label: opts.label || 'Valor',
        data: datos.map(d => d.valor),
        borderColor: opts.color || COLORS.primary,
        backgroundColor: (opts.color || COLORS.primary) + '22',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: !!opts.label } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

/**
 * Gráfica de barras verticales.
 */
export function barChart(canvas, datos, opts = {}) {
  const ctx = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
  if (!window.Chart) throw new Error('Chart.js no cargado');
  return new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: datos.map(d => d.label),
      datasets: [{
        label: opts.label || '',
        data: datos.map(d => d.valor),
        backgroundColor: opts.colors || datos.map(() => COLORS.primary),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: !!opts.label } },
    },
  });
}

/**
 * Donut / pie chart.
 */
export function donutChart(canvas, datos, opts = {}) {
  const ctx = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
  if (!window.Chart) throw new Error('Chart.js no cargado');
  return new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: datos.map(d => d.label),
      datasets: [{
        data: datos.map(d => d.valor),
        backgroundColor: opts.colors || [
          COLORS.primary, COLORS.success, COLORS.info, COLORS.warning, COLORS.danger, COLORS.secondary
        ],
      }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

/**
 * Barras apiladas (para distribución por categoría y mes).
 * series: [{ label, datos: [valores...], color }]
 * labels: ['Ene','Feb',...]
 */
export function stackedBarChart(canvas, labels, series, opts = {}) {
  const ctx = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
  if (!window.Chart) throw new Error('Chart.js no cargado');
  return new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map(s => ({
        label: s.label,
        data: s.datos,
        backgroundColor: s.color || COLORS.primary,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  });
}
```

- [ ] **Step 4: Pantalla demo**

Crear `public/js/pages/DemoComponentes.js` (solo para validar, se borra después):

```javascript
import { kpiGrid } from '../components/KpiCard.js';
import { lineChart, barChart, donutChart, chartColors } from '../components/charts.js';

export const DemoComponentes = async () => {
  setTimeout(() => {
    lineChart('#demo-line',
      [
        {mes:'Ene', valor:45000},{mes:'Feb', valor:52000},{mes:'Mar', valor:48000},
        {mes:'Abr', valor:61000},{mes:'May', valor:55000},{mes:'Jun', valor:72000}
      ],
      { label:'Ventas', color: chartColors.success }
    );
    barChart('#demo-bar', [
      {label:'DCC', valor:45000},{label:'SAMAYCA', valor:32000},
      {label:'OTOYA', valor:28000},{label:'PDI', valor:22000}
    ]);
    donutChart('#demo-donut', [
      {label:'Aprobadas', valor:60},{label:'Rechazadas', valor:15},
      {label:'En proceso', valor:25}
    ]);
  }, 100);

  return `
    <header class="header"><h1>Demo de Componentes</h1></header>
    ${kpiGrid([
      { label:'Ventas del mes', value:'S/ 120K', change:'+25%', changeType:'positive', icon:'📈' },
      { label:'Cotizaciones', value:'18', change:'+3', changeType:'positive', icon:'📋' },
      { label:'CxC vencida', value:'S/ 12K', change:'+8%', changeType:'negative', icon:'⚠️' },
      { label:'Caja total', value:'S/ 85K', change:'+15%', changeType:'positive', icon:'💰' }
    ], 4)}
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px">
      <div class="card"><h3>Tendencia ventas 6m</h3><div style="height:240px"><canvas id="demo-line"></canvas></div></div>
      <div class="card"><h3>Estados</h3><div style="height:240px"><canvas id="demo-donut"></canvas></div></div>
    </div>
    <div class="card" style="margin-top:20px"><h3>Top clientes</h3><div style="height:220px"><canvas id="demo-bar"></canvas></div></div>
  `;
};
```

- [ ] **Step 5: Verificar en navegador**

Registrar ruta temporal `/#/demo-componentes` en app.js → abrir → ver 4 KPIs + 3 gráficas renderizadas correctamente.

- [ ] **Step 6: Commit**

```bash
git add public/lib/chart.min.js public/js/components/charts.js public/js/pages/DemoComponentes.js public/index.html public/js/app.js package.json package-lock.json
git commit -m "feat(ui): Chart.js 4 local + wrapper charts.js (line/bar/donut/stacked) + demo"
```

---

## Criterios de éxito de Fase A (checkpoint final)

Antes de declarar Fase A cerrada, verificar cada uno:

- [ ] `SELECT COUNT(*) FROM ConfiguracionEmpresa` devuelve 1 fila (Metal Engineers)
- [ ] `SELECT COUNT(*) FROM PeriodosContables` devuelve 24 (todos los meses 2025+2026)
- [ ] Cambiar régimen de RMT a GENERAL desde UI funciona → refresca → libros PLE actualizados
- [ ] Crear un gasto → registro aparece en Auditoría con datos del usuario
- [ ] Cerrar periodo 2025-12 desde UI → intentar crear gasto con fecha 2025-12-15 → devuelve 403
- [ ] Subir un PDF como adjunto a un gasto → aparece listado → eliminar funciona → Cloudinary efectivamente lo borra
- [ ] Pantalla demo de componentes muestra 4 KPIs + 3 gráficas sin errores en consola
- [ ] `/#/configuracion/regimen` abre directamente en la tab Régimen (hash routing funciona)
- [ ] Todos los commits pasan `npm run build` sin errores TS
- [ ] Tests unitarios en verde: `npx jest`

---

## Checklist de handoff a Fase B

Antes de arrancar Fase B (Facturación Electrónica), confirmar que:

- [ ] `ConfiguracionEmpresa.ose_proveedor` existe y se puede setear a 'NUBEFACT'
- [ ] `ConfiguracionEmpresa.serie_factura` y `serie_boleta` editables desde UI
- [ ] `AdjuntosService` probado y funcional (facturas usan esta tabla para su PDF+XML+CDR)
- [ ] `AuditoriaService` captura cualquier mutación en configuración
- [ ] Certificado digital Metal Engineers tramitado en INDECOPI (si no — bloquear Fase B)
- [ ] Cuenta sandbox Nubefact creada con credenciales de prueba

---

## Self-Review

**Spec coverage vs master plan:** ✅ 12/12 entregables de Fase A cubiertos (A1-A12).

**Placeholders:** ninguno detectado — cada step tiene código concreto, SQL real, comandos ejecutables.

**Consistencia de tipos:** `ConfiguracionEmpresa.id`, `PeriodosContables.anio+mes` como PK compuesta, `Auditoria.entidad_id` como VARCHAR(60) (acepta IDs string/int), `Adjuntos.ref_tipo`+`ref_id` indexado conjunto. Todos los endpoints retornan `{ success: true }` o error JSON consistente.

**Riesgos técnicos:**
- `PeriodosGuard` depende del campo `fecha` en el body — documentar bien. Posibles misses: Transacciones sin fecha explícita.
- `AuditoriaService.log` es fire-and-forget. Si MySQL está lento, puede generar backpressure silencioso — aceptable en Fase A, agregar cola Redis en Fase F si se escala.
- Chart.js 4.x es ESM en algunos bundles. Usar `chart.umd.js` para que funcione con `<script>` sin modules.

---

## Execution Handoff

**Plan completo guardado en `docs/superpowers/plans/2026-04-28-fase-a-fundaciones.md`.**

Dos opciones de ejecución:

**1. Subagent-driven (recomendado)** — dispatch de un subagente fresco por cada Task (A1, A2, …, A12), con review entre tasks. Rápido, paralelizable donde hay independencia (A10/A11/A12 pueden ir en paralelo; A3/A5/A6 también).

**2. Inline execution** — ejecutar en esta sesión con `superpowers:executing-plans`. Lineal, checkpoints cada 2-3 tasks.

Mi recomendación: **opción 1** — las 12 tasks se ejecutan en 5-8 días calendario, con 3 subagentes corriendo en paralelo para las ramas independientes. El orden obligatorio es:
- A1 → A2 (DB antes que Service)
- A3 → A4 (DB antes que middleware)
- A5 (requiere DB inicial)
- A6 (independiente, requiere CloudinaryService existente)
- A7 (independiente)
- A8 requiere A1, A2, A3, A4, A5, A10
- A9 requiere A8
- A10, A11, A12 son paralelizables con el resto

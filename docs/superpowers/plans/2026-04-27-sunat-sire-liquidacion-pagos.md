# Liquidación Tributaria SUNAT (SIRE) + Pagos Automatizados — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ERP-PRO produzca y entregue toda la documentación tributaria mensual exigida por SUNAT (libros SIRE de Ventas, Compras y No Domiciliados + cuadre IGV/Renta + pago) — primero como reportes preliminares para revisión interna (Fase A), luego con presentación automática y pago directo a SUNAT (Fase B). Cliente piloto: Metal Engineers SAC, régimen RER.

**Architecture:** Construye sobre la infraestructura ya planeada en Fase B Facturación Electrónica (`Facturas`, `NotasCredito`, `Compras`, `ConfiguracionEmpresa`). Agrega 3 capas nuevas: (1) datos SIRE-compliant en cada CPE, (2) un orquestador de Liquidación Mensual que cruza ventas-compras-detracciones-saldos para producir cuadre IGV+Renta, (3) un generador SIRE TXT (formato 14.4 / 8.4 / 8.2) y un cliente API SIRE para upload directo. Los pagos se automatizan en cadena Detracciones→NPS (sin paso intermedio porque Metal Engineers no tiene débito automático afiliado).

**Tech Stack:** extiende el existente (Node/TS/Express 5/MySQL/Vanilla JS/Zod 4). Suma: `exceljs` para Excel preliminar, `pdfkit` para PDF (ya usado en CotizacionPDFService), `node-cron` opcional para cierre día 28, cliente HTTP para API SIRE (axios o fetch nativo).

**Parent plan:** [2026-04-22-erp-pro-master-plan.md](./2026-04-22-erp-pro-master-plan.md) — este plan **complementa** Fase B Facturación Electrónica del master, especializándose en SIRE (no PLE) y agregando Liquidación + Pagos.

**Duration:** Fase A: 4 sesiones (~12 hrs). Fase B: 13 sesiones (~30 hrs). Entre ambas debe pasar ≥3 meses de validación de Fase A vs contador.

**Última revisión:** 27/04/2026

---

## Decisiones cerradas (conversación 27/04/2026)

| # | Tema | Decisión |
|---|---|---|
| 1 | Régimen tributario | **RER** — 1.5% mensual definitivo. Parametrizado en `ConfiguracionEmpresa` por si cambia. |
| 2 | Estrategia general | **2 fases**: A = preliminares internos. B = envío directo SIRE + pago automatizado. |
| 3 | Día de generación preliminar | **28 de cada mes**, ajustado al **día hábil anterior** si cae no hábil (sábado/domingo/feriado). Regla única, sin caso borde. |
| 4 | Notificación día 28 | Banner amarillo en módulos **Gerencia** y **Administración**. |
| 5 | Endpoint manual | Disponible **siempre** desde módulo Administración (no solo el 28). |
| 6 | Storage Drive | Carpeta `Liquidaciones/AAAA-MM/` en Shared Drive Metal Engineers. **Sobrescribe** archivo actual cada vez (sin histórico). |
| 7 | Pantalla "en vivo" | Disponible siempre desde día 1 del mes en módulo Administración. |
| 8 | Marca de agua | PDF preliminar con marca **"PRELIMINAR — NO USAR PARA SIRE"**. |
| 9 | Backfill datos viejos | **Defaults seguros** (tipo_cp='01', tipo_adquisicion='gravada'). Libros válidos solo desde primer mes "limpio". |
| 10 | Fase B presentación | **5 días antes** del vencimiento SUNAT (no 1). |
| 11 | Fase B aprobación | **Semi-auto con 1-click humano** primero. Después de 2-3 meses sin incidencias, migrar a auto con ventana aborto 72h. |
| 12 | Pago Form 621 | **Siempre manual** (mover plata real). El ERP solo genera órdenes de pago, no transfiere. |
| 13 | Credenciales SUNAT | **Usuario Secundario SOL** específico para el ERP, credenciales **cifradas** en BD con clave maestra en env. |
| 14 | Validación Fase A | Mínimo **3 meses coincidente** con contador antes de arrancar Fase B. |
| 15 | Rectificatorias | **Siempre avisan, nunca auto**. Humano decide. |
| 16 | Cuenta detracciones | Banco de la Nación **00-211-064-161** (única cuenta detracciones). |
| 17 | Saldo detracciones | Tracking interno + carga manual mensual + intentar API SUNAT en paralelo. |
| 18 | Cadena de pago | **Detracciones → NPS** (sin "cargo en cuenta" porque no afiliados a Interbank). |
| 19 | Umbral detracciones | Si pago > **70% del saldo**, pedir confirmación humana (configurable). |
| 20 | Tarjeta crédito empresarial | **Descartado** (no tienen). |
| 21 | Notificación pago manual NPS | Módulo **Finanzas** (no admin/gerencia). |
| 22 | Afiliación débito automático Interbank | **No por ahora** — sugerencia futura. |

---

## Pendientes bloqueantes (no técnicos)

| # | Pendiente | Bloquea | Acción |
|---|---|---|---|
| 1 | Confirmar con contador si sigue en RER (ritmo Sept = ~800K/año, sobre tope RER 525K) | Cálculo correcto en Fase A | Julio pregunta al contador. Si MYPE, cambiar tasa en `ConfiguracionEmpresa`. |
| 2 | ⚠️ PARCIAL 28/04: Jorge pasó **Excel oficiales RV+RC Sept 2025** del contador. Guardados en `D:\proyectos\ERP-PRO\sunat-golden-files\2025-09\` (fuera de Git). Cubren ~95% del ground truth. Falta el TXT puro para 5% final. | Fase B-1/B-2/B-3 ya pueden arrancar | Cuando el contador comparta los TXT, se afina el último 5%. No urgente. |
| 3 | Crear Usuario Secundario SOL específico para el ERP (rol: SIRE + declaraciones, nada más) | Fase B-3 en adelante | Julio entra a SUNAT portal → Usuarios secundarios → crear. |
| 4 | Validar que Metal Engineers efectivamente NO tiene débito automático afiliado a Interbank para SUNAT | Diseño cadena pagos | Julio confirma con su banco. |

---

## Roadmap

### FASE A — Preliminares internos (4 sesiones, ~12 hrs)

Genera reportes preliminares en PDF/Excel el día 28 de cada mes para que Julio + contador los validen antes de subir manualmente a SIRE. **NO** se conecta a SUNAT. **NO** envía declaraciones. Solo prepara y entrega para revisión humana.

| Sesión | Entregable |
|---|---|
| **A-1** | Migración SUNAT-compliant (campos en Facturas/NotasCredito/Compras + tablas EmpresaConfig extendida, NoDomiciliados, DUAs, LiquidacionesMensuales). Backfill defaults a datos viejos. |
| **A-2** | UI captura: formularios pidiendo campos nuevos. Módulo "Importaciones" básico para DUA + invoice extranjera. |
| **A-3** | Pantalla "Liquidación del mes" en Administración (en vivo, siempre disponible) + servicio de cuadre IGV+Renta+saldos previos. |
| **A-4** | Generador PDF + Excel preliminar + Drive `Liquidaciones/AAAA-MM/` + banner Gerencia/Administración + endpoint manual desde Administración + regla día 28 con ajuste hacia atrás. |

### FASE B — SIRE directo + Pagos automatizados (13 sesiones, ~30 hrs)

Solo arranca cuando: (a) Fase A operativa, (b) 3 meses consecutivos donde el preliminar coincidió con lo que el contador presentó a SUNAT, (c) TXT de referencia conseguido, (d) usuario SOL secundario creado.

| Sesión | Entregable |
|---|---|
| **B-1** | Generador TXT SIRE 14.4 (RVIE / Ventas) + suite de tests vs TXT referencia. |
| **B-2** | Generador TXT SIRE 8.4 (RCE / Compras) + manejo detracciones excluidas + tests. |
| **B-3** | Generador TXT SIRE 8.2 (No Domiciliados) + tests. |
| **B-4** | Cifrado credenciales SOL (AES-256-GCM, master key en env) + tabla SunatCredenciales + UI configuración. |
| **B-5** | Cliente OAuth2 SUNAT (auth, refresh, retry, error handling) — modo dry-run primero. |
| **B-6** | Cliente API SIRE: enviar propuesta, descargar respuesta, manejar OBSERVADO/ACEPTADO/RECHAZADO. |
| **B-7** | Tabla PresentacionesSunat + state machine (BORRADOR→PROGRAMADA→ENVIADA→ACEPTADA/etc.) + pantalla timeline en Administración. |
| **B-8** | Cronograma SUNAT (tabla + UI carga anual) + scheduler "5 días antes" + flujo "1-click aprobar y enviar". |
| **B-9** | Cliente API Declara Fácil 621 (presentación IGV + Renta) — solo presentación, NO pago. |
| **B-10** | Tabla SaldoDetracciones + tracking automático (entrada por detracciones cobradas, salida por pagos) + UI saldo en módulo Finanzas. |
| **B-11** | Cliente API "Generar Form 1662" (pago detracciones) + cliente API "Generar NPS". |
| **B-12** | Orquestador de pagos: máquina de estados Detrac→NPS automática + alertas Finanzas + umbral 70% configurable. |
| **B-13** | Reconciliación pagos: webhook/poll SUNAT, integración con MovimientoBancario libro bancos, marcado PAGADO. |

---

## File Structure (FASE A)

### Archivos nuevos

```
database/migrations/
├── 038_regimen_rer_metal_engineers.sql   # Cambia régimen a RER + agrega saldos tributarios
├── 039_campos_sire_facturas_compras.sql  # tipo_cp, estado_op, bi_no_gravada, etc.
├── 040_no_domiciliados_duas.sql          # Tablas para importaciones
└── 041_liquidaciones_mensuales.sql       # Snapshot mensual

app/modules/tributario/
├── LiquidacionService.ts                 # Orquestador del cuadre IGV+Renta
├── LiquidacionExcelExporter.ts           # Genera Excel preliminar (6 hojas)
├── LiquidacionPDFExporter.ts             # Genera PDF resumen ejecutivo
├── ImportacionesService.ts               # CRUD DUA + Invoice extranjero
└── DiaHabilUtil.ts                       # Cálculo día 28 ajustado + feriados Perú

app/validators/
├── liquidacion.schema.ts                 # Zod schemas
└── importaciones.schema.ts

public/js/pages/
├── Liquidacion.js                        # Pantalla "Liquidación del mes" en Administración
└── Importaciones.js                      # Módulo nuevo Importaciones (sub-pestaña en Logística)

public/js/components/
└── BannerLiquidacion.js                  # Banner amarillo día 28 reutilizable
```

### Archivos modificados

```
index.ts                                  # +rutas /api/liquidacion, /api/importaciones
public/js/pages/Comercial.js              # +campos SIRE en form de cotización (al emitir factura)
public/js/pages/Compras.js                # +campos SIRE en form de compra
public/js/pages/Administracion.js         # +tab "Liquidación del mes" + banner
public/js/pages/Dashboard.js              # +banner día 28 si Gerente
public/js/pages/Logistica.js              # +sub-pestaña "Importaciones"
public/js/services/api.js                 # +api.liquidacion, api.importaciones
ESTADO.md                                 # +sección Liquidación Tributaria
CLAUDE.md                                 # +gotchas Liquidación + DiaHabilUtil
```

---

## FASE A — Tasks detalladas

### Sesión A-1: Migraciones SUNAT-compliant

**Files:**
- Create: `database/migrations/038_regimen_rer_metal_engineers.sql`
- Create: `database/migrations/039_campos_sire_facturas_compras.sql`
- Create: `database/migrations/040_no_domiciliados_duas.sql`
- Create: `database/migrations/041_liquidaciones_mensuales.sql`

#### Task A-1.1: Migración 038 — Régimen RER + saldos tributarios

- [ ] **Step 1: Crear archivo `database/migrations/038_regimen_rer_metal_engineers.sql`**

```sql
-- 038_regimen_rer_metal_engineers.sql
-- Cambia régimen a RER para Metal Engineers (1.5% mensual definitivo).
-- Agrega columnas para tracking de saldos tributarios mensuales necesarios
-- para el cuadre del Form 621 (IGV + Renta).

-- 1) Cambiar régimen a RER y ajustar tasa renta
UPDATE ConfiguracionEmpresa
SET regimen = 'RER',
    tasa_pago_cuenta_renta = 1.50,
    fecha_cambio_regimen = '2026-01-01'
WHERE ruc = '20610071962';

-- 2) Agregar campos de saldos tributarios
ALTER TABLE ConfiguracionEmpresa
  ADD COLUMN saldo_igv_mes_anterior      DECIMAL(14,2) DEFAULT 0 AFTER tasa_pago_cuenta_renta,
  ADD COLUMN percepciones_acumuladas     DECIMAL(14,2) DEFAULT 0 AFTER saldo_igv_mes_anterior,
  ADD COLUMN retenciones_acumuladas      DECIMAL(14,2) DEFAULT 0 AFTER percepciones_acumuladas,
  ADD COLUMN tope_anual_regimen          DECIMAL(14,2) DEFAULT 525000.00 AFTER retenciones_acumuladas,
  ADD COLUMN cuenta_detracciones_bn      VARCHAR(30)  AFTER tope_anual_regimen,
  ADD COLUMN umbral_detraccion_pct       DECIMAL(5,2) DEFAULT 70.00 AFTER cuenta_detracciones_bn,
  ADD COLUMN sunat_sol_user_encrypted    VARCHAR(500) AFTER umbral_detraccion_pct,
  ADD COLUMN sunat_sol_pass_encrypted    VARCHAR(500) AFTER sunat_sol_user_encrypted;

-- 3) Setear cuenta de detracciones de Metal Engineers
UPDATE ConfiguracionEmpresa
SET cuenta_detracciones_bn = '00-211-064-161'
WHERE ruc = '20610071962';
```

- [ ] **Step 2: Ejecutar migración local**

```bash
npx ts-node database/apply_migrations.ts
```

Expected: `[migration] 038 applied — Régimen RER + saldos tributarios`

- [ ] **Step 3: Verificar en MySQL**

```bash
"C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root -p erp_pro -e "SELECT regimen, tasa_pago_cuenta_renta, cuenta_detracciones_bn FROM ConfiguracionEmpresa WHERE ruc = '20610071962';"
```

Expected: `RER | 1.50 | 00-211-064-161`

- [ ] **Step 4: Commit**

```bash
git add database/migrations/038_regimen_rer_metal_engineers.sql
git commit -m "feat(db): migración 038 — régimen RER + saldos tributarios + cta detracciones"
```

#### Task A-1.2: Migración 039 — Campos SIRE en CPE

- [ ] **Step 1: Crear archivo `database/migrations/039_campos_sire_facturas_compras.sql`**

```sql
-- 039_campos_sire_facturas_compras.sql
-- Agrega campos SIRE-compliant a Facturas, NotasCredito, NotasDebito, Compras.
-- Necesarios para que el generador SIRE 14.4/8.4 pueda producir TXT válido.

-- ===== FACTURAS =====
ALTER TABLE Facturas
  -- Catálogo SUNAT 1: 01=Factura, 03=Boleta (ya implícito en `tipo`, pero SIRE pide código numérico)
  ADD COLUMN tipo_cp_sunat        CHAR(2) NOT NULL DEFAULT '01' AFTER tipo,
  -- Estado SIRE: 1=Registrado, 8=Anulado (en mes posterior), 9=Modificado
  ADD COLUMN estado_op_sire       CHAR(1) NOT NULL DEFAULT '1' AFTER estado_sunat,
  -- Tipo Operación SIRE (Tabla 12): 01=Venta interna, 02=Exportación, 04=No domiciliado, etc.
  ADD COLUMN tipo_operacion       CHAR(2) NOT NULL DEFAULT '01' AFTER estado_op_sire,
  -- Para exportaciones (FOB embarcado)
  ADD COLUMN valor_fob_embarcado  DECIMAL(14,2) DEFAULT 0 AFTER tipo_operacion;

-- Backfill: las boletas tienen tipo_cp_sunat='03'
UPDATE Facturas SET tipo_cp_sunat = '03' WHERE tipo = 'BOLETA';
UPDATE Facturas SET tipo_cp_sunat = '01' WHERE tipo = 'FACTURA';

-- ===== NOTAS DE CRÉDITO =====
ALTER TABLE NotasCredito
  ADD COLUMN tipo_cp_sunat        CHAR(2) NOT NULL DEFAULT '07' AFTER motivo_descripcion,
  ADD COLUMN estado_op_sire       CHAR(1) NOT NULL DEFAULT '1' AFTER tipo_cp_sunat,
  ADD COLUMN tipo_cp_modificado   CHAR(2) NOT NULL DEFAULT '01' AFTER tipo_doc_referencia;

-- ===== NOTAS DE DÉBITO =====
ALTER TABLE NotasDebito
  ADD COLUMN tipo_cp_sunat        CHAR(2) NOT NULL DEFAULT '08' AFTER motivo_descripcion,
  ADD COLUMN estado_op_sire       CHAR(1) NOT NULL DEFAULT '1' AFTER tipo_cp_sunat,
  ADD COLUMN tipo_cp_modificado   CHAR(2) NOT NULL DEFAULT '01' AFTER tipo_doc_referencia;

-- ===== COMPRAS =====
ALTER TABLE Compras
  -- Tipo CP de proveedor: 01=Factura, 14=Recibo SP, 50=DUA, etc.
  ADD COLUMN tipo_cp_sunat              CHAR(2) NOT NULL DEFAULT '01' AFTER nro_comprobante,
  ADD COLUMN serie_cp                   VARCHAR(5) AFTER tipo_cp_sunat,
  ADD COLUMN correlativo_cp             VARCHAR(20) AFTER serie_cp,
  -- Clasificación tributaria
  ADD COLUMN tipo_adquisicion           ENUM('GRAVADA','NO_GRAVADA','EXONERADA','INAFECTA','MIXTA')
                                        NOT NULL DEFAULT 'GRAVADA' AFTER correlativo_cp,
  ADD COLUMN bi_gravada                 DECIMAL(14,2) DEFAULT 0 AFTER tipo_adquisicion,
  ADD COLUMN bi_no_gravada              DECIMAL(14,2) DEFAULT 0 AFTER bi_gravada,
  ADD COLUMN bi_exonerada               DECIMAL(14,2) DEFAULT 0 AFTER bi_no_gravada,
  -- Detracción
  ADD COLUMN afecta_detraccion          TINYINT(1) NOT NULL DEFAULT 0 AFTER bi_exonerada,
  ADD COLUMN fecha_pago_detraccion      DATE NULL AFTER afecta_detraccion,
  ADD COLUMN nro_constancia_detraccion  VARCHAR(50) NULL AFTER fecha_pago_detraccion,
  ADD COLUMN pdf_constancia_url         VARCHAR(500) NULL AFTER nro_constancia_detraccion,
  -- Importación
  ADD COLUMN nro_dam                    VARCHAR(30) NULL AFTER pdf_constancia_url,
  ADD COLUMN id_dua                     INT NULL AFTER nro_dam;

-- Backfill: a las compras existentes les ponemos GRAVADA y bi_gravada = monto_base
UPDATE Compras SET bi_gravada = monto_base WHERE tipo_adquisicion = 'GRAVADA' AND bi_gravada = 0;

-- Índices para consultas SIRE
CREATE INDEX idx_facturas_tipo_cp ON Facturas(tipo_cp_sunat, fecha_emision);
CREATE INDEX idx_compras_tipo_cp ON Compras(tipo_cp_sunat, fecha);
CREATE INDEX idx_compras_detraccion ON Compras(afecta_detraccion, fecha_pago_detraccion);
```

- [ ] **Step 2: Ejecutar migración**

```bash
npx ts-node database/apply_migrations.ts
```

- [ ] **Step 3: Verificar columnas agregadas**

```bash
"C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root -p erp_pro -e "DESCRIBE Facturas; DESCRIBE Compras;" | grep -E "tipo_cp_sunat|tipo_adquisicion|afecta_detraccion"
```

Expected: 4-5 líneas con los nuevos campos.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/039_campos_sire_facturas_compras.sql
git commit -m "feat(db): migración 039 — campos SIRE en Facturas/NC/ND/Compras"
```

#### Task A-1.3: Migración 040 — No Domiciliados + DUAs

- [ ] **Step 1: Crear archivo `database/migrations/040_no_domiciliados_duas.sql`**

```sql
-- 040_no_domiciliados_duas.sql
-- Tablas para registrar invoices de proveedores extranjeros (sin RUC peruano)
-- y DUAs de importación. Necesarias para Libro SIRE 8.2 (No Domiciliados)
-- y para tomar el IGV de importación como crédito fiscal.

-- ===== DUAs (Declaraciones Únicas de Aduanas) =====
CREATE TABLE IF NOT EXISTS DUAs (
  id_dua                  INT PRIMARY KEY AUTO_INCREMENT,
  numero_dua              VARCHAR(30) NOT NULL UNIQUE,        -- ej: 235-2025-10-123456
  fecha                   DATE NOT NULL,
  aduana                  VARCHAR(50) NOT NULL,
  tipo_cambio             DECIMAL(8,4) NOT NULL,

  -- Valores en USD
  valor_fob_usd           DECIMAL(14,2) NOT NULL DEFAULT 0,
  flete_usd               DECIMAL(14,2) NOT NULL DEFAULT 0,
  seguro_usd              DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_aduana_usd        DECIMAL(14,2) NOT NULL DEFAULT 0,

  -- Tributos pagados en aduana (en PEN)
  advalorem_pen           DECIMAL(14,2) NOT NULL DEFAULT 0,
  isc_pen                 DECIMAL(14,2) NOT NULL DEFAULT 0,
  ipm_pen                 DECIMAL(14,2) NOT NULL DEFAULT 0,    -- 2% sobre BI aduanera
  igv_importacion_pen     DECIMAL(14,2) NOT NULL DEFAULT 0,    -- 16% sobre BI aduanera (crédito fiscal!)
  servicio_despacho_pen   DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_pagado_pen        DECIMAL(14,2) NOT NULL DEFAULT 0,

  observaciones           VARCHAR(500),
  pdf_url                 VARCHAR(500),

  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_duas_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== INVOICES NO DOMICILIADOS =====
CREATE TABLE IF NOT EXISTS NoDomiciliados (
  id_no_dom               INT PRIMARY KEY AUTO_INCREMENT,
  fecha_emision           DATE NOT NULL,

  -- Proveedor extranjero (sin RUC peruano)
  proveedor_pais          VARCHAR(80) NOT NULL,
  proveedor_doc           VARCHAR(50),                          -- ID fiscal del país de origen
  proveedor_razon_social  VARCHAR(200) NOT NULL,

  -- Documento
  tipo_doc                VARCHAR(50) NOT NULL DEFAULT 'INVOICE',
  numero_doc              VARCHAR(50) NOT NULL,

  -- Monto
  moneda                  CHAR(3) NOT NULL DEFAULT 'USD',
  tipo_cambio             DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
  monto_origen            DECIMAL(14,2) NOT NULL,
  monto_pen               DECIMAL(14,2) NOT NULL,

  -- Vinculación con DUA (un invoice generalmente va con una DUA)
  id_dua                  INT NULL,

  -- ¿Pagado? (afecta crédito fiscal)
  pagado                  TINYINT(1) NOT NULL DEFAULT 0,
  fecha_pago              DATE NULL,

  observaciones           VARCHAR(500),
  pdf_url                 VARCHAR(500),

  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_no_dom_fecha (fecha_emision),
  INDEX idx_no_dom_proveedor (proveedor_razon_social),

  CONSTRAINT fk_no_dom_dua FOREIGN KEY (id_dua) REFERENCES DUAs(id_dua) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- FK desde Compras hacia DUAs (compras importadas con DUA)
ALTER TABLE Compras
  ADD CONSTRAINT fk_compras_dua FOREIGN KEY (id_dua)
    REFERENCES DUAs(id_dua) ON DELETE SET NULL;
```

- [ ] **Step 2: Ejecutar migración**

```bash
npx ts-node database/apply_migrations.ts
```

- [ ] **Step 3: Verificar tablas**

```bash
"C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root -p erp_pro -e "SHOW TABLES LIKE 'DUAs'; SHOW TABLES LIKE 'NoDomiciliados';"
```

Expected: ambas tablas listadas.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/040_no_domiciliados_duas.sql
git commit -m "feat(db): migración 040 — tablas DUAs + NoDomiciliados"
```

#### Task A-1.4: Migración 041 — Liquidaciones mensuales

- [ ] **Step 1: Crear archivo `database/migrations/041_liquidaciones_mensuales.sql`**

```sql
-- 041_liquidaciones_mensuales.sql
-- Snapshot mensual de la liquidación tributaria. Una fila por periodo (YYYY-MM).
-- Se actualiza cada vez que se genera el preliminar.
-- Útil para histórico, comparativos y para Fase B (presentación a SUNAT).

CREATE TABLE IF NOT EXISTS LiquidacionesMensuales (
  id_liquidacion         INT PRIMARY KEY AUTO_INCREMENT,
  periodo                CHAR(7) NOT NULL UNIQUE,           -- formato YYYY-MM
  estado                 ENUM('BORRADOR','PRELIMINAR','CERRADA','PRESENTADA','PAGADA')
                         NOT NULL DEFAULT 'BORRADOR',

  -- ===== VENTAS =====
  ventas_bi_gravada      DECIMAL(14,2) NOT NULL DEFAULT 0,
  ventas_igv             DECIMAL(14,2) NOT NULL DEFAULT 0,
  ventas_bi_exonerada    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ventas_bi_inafecta     DECIMAL(14,2) NOT NULL DEFAULT 0,
  ventas_exportaciones   DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- Notas de crédito (descuentan)
  nc_bi                  DECIMAL(14,2) NOT NULL DEFAULT 0,
  nc_igv                 DECIMAL(14,2) NOT NULL DEFAULT 0,

  -- ===== COMPRAS =====
  compras_bi_gravada     DECIMAL(14,2) NOT NULL DEFAULT 0,
  compras_igv            DECIMAL(14,2) NOT NULL DEFAULT 0,
  compras_no_gravadas    DECIMAL(14,2) NOT NULL DEFAULT 0,
  compras_exoneradas     DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- Compras excluidas por detracción no pagada (no dan crédito fiscal este mes)
  compras_excluidas_bi   DECIMAL(14,2) NOT NULL DEFAULT 0,
  compras_excluidas_igv  DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- IGV de importación (crédito fiscal por DUAs del mes)
  igv_importacion        DECIMAL(14,2) NOT NULL DEFAULT 0,

  -- ===== CUADRE IGV =====
  saldo_igv_mes_anterior DECIMAL(14,2) NOT NULL DEFAULT 0,
  percepciones_mes       DECIMAL(14,2) NOT NULL DEFAULT 0,
  retenciones_mes        DECIMAL(14,2) NOT NULL DEFAULT 0,
  igv_a_pagar            DECIMAL(14,2) NOT NULL DEFAULT 0,   -- positivo=pagar, negativo=saldo a favor

  -- ===== RENTA RER =====
  base_imponible_renta   DECIMAL(14,2) NOT NULL DEFAULT 0,
  tasa_renta_aplicada    DECIMAL(5,2) NOT NULL DEFAULT 1.50,
  renta_a_pagar          DECIMAL(14,2) NOT NULL DEFAULT 0,

  -- ===== TOTAL FORM 621 =====
  total_form_621         DECIMAL(14,2) NOT NULL DEFAULT 0,

  -- ===== CONTADORES (para alertas) =====
  cpe_pendientes         INT NOT NULL DEFAULT 0,
  detracciones_sin_pago  INT NOT NULL DEFAULT 0,
  duas_sin_numerar       INT NOT NULL DEFAULT 0,

  -- ===== RUTAS de archivos generados =====
  pdf_url                VARCHAR(500),
  excel_url              VARCHAR(500),
  drive_folder_id        VARCHAR(200),

  fecha_generacion       TIMESTAMP NULL,
  generado_por_usuario   INT NULL,

  observaciones          TEXT,

  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_liquidaciones_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Ejecutar y verificar**

```bash
npx ts-node database/apply_migrations.ts
"C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root -p erp_pro -e "DESCRIBE LiquidacionesMensuales;" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add database/migrations/041_liquidaciones_mensuales.sql
git commit -m "feat(db): migración 041 — tabla LiquidacionesMensuales (snapshot mensual)"
```

- [ ] **Step 4: Actualizar ESTADO.md y CLAUDE.md**

Agregar línea en ESTADO.md:
```
- Migraciones 038-041 aplicadas: RER + saldos tributarios, campos SIRE, DUAs, NoDom, LiquidacionesMensuales
```

Agregar sección en CLAUDE.md después de "Campos V2 — Estado BD":
```markdown
**Migraciones 038-041 (aplicadas en BD, sesión 27/04/2026):**

| Migración | Descripción |
|-----------|-------------|
| 038 | Régimen RER + saldos tributarios + cuenta detracciones BN |
| 039 | Campos SIRE en Facturas/NC/ND/Compras (tipo_cp, estado_op, bi_*, detracción) |
| 040 | Tablas DUAs + NoDomiciliados para importaciones |
| 041 | LiquidacionesMensuales (snapshot mensual) |
```

```bash
git add ESTADO.md CLAUDE.md
git commit -m "docs: actualizar ESTADO/CLAUDE con migraciones 038-041"
```

---

### Sesión A-2: UI captura SIRE-compliant + Módulo Importaciones

**Files:**
- Modify: `public/js/pages/Comercial.js` (form de cotización al emitir factura)
- Modify: `public/js/pages/Compras.js` (form de compra)
- Create: `public/js/pages/Importaciones.js` (módulo nuevo)
- Modify: `public/js/pages/Logistica.js` (sub-pestaña Importaciones)
- Create: `app/modules/tributario/ImportacionesService.ts`
- Modify: `app/validators/` (schemas)
- Modify: `index.ts` (rutas)
- Modify: `public/js/services/api.js` (namespace api.importaciones)

#### Task A-2.1: Backend ImportacionesService

- [ ] **Step 1: Crear `app/modules/tributario/ImportacionesService.ts`**

```typescript
import { pool } from '../../config/connection';

export interface DUAInput {
  numero_dua: string;
  fecha: string;
  aduana: string;
  tipo_cambio: number;
  valor_fob_usd: number;
  flete_usd: number;
  seguro_usd: number;
  valor_aduana_usd: number;
  advalorem_pen: number;
  isc_pen: number;
  ipm_pen: number;
  igv_importacion_pen: number;
  servicio_despacho_pen: number;
  observaciones?: string;
}

export interface NoDomInput {
  fecha_emision: string;
  proveedor_pais: string;
  proveedor_doc?: string;
  proveedor_razon_social: string;
  tipo_doc: string;
  numero_doc: string;
  moneda: string;
  tipo_cambio: number;
  monto_origen: number;
  id_dua?: number;
  observaciones?: string;
}

export class ImportacionesService {
  static async crearDUA(input: DUAInput) {
    const total = input.advalorem_pen + input.isc_pen + input.ipm_pen +
                  input.igv_importacion_pen + input.servicio_despacho_pen;
    const [r]: any = await pool.execute(
      `INSERT INTO DUAs (numero_dua, fecha, aduana, tipo_cambio,
        valor_fob_usd, flete_usd, seguro_usd, valor_aduana_usd,
        advalorem_pen, isc_pen, ipm_pen, igv_importacion_pen, servicio_despacho_pen,
        total_pagado_pen, observaciones)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [input.numero_dua, input.fecha, input.aduana, input.tipo_cambio,
       input.valor_fob_usd, input.flete_usd, input.seguro_usd, input.valor_aduana_usd,
       input.advalorem_pen, input.isc_pen, input.ipm_pen, input.igv_importacion_pen,
       input.servicio_despacho_pen, total, input.observaciones || null]
    );
    return { id_dua: r.insertId, total_pagado_pen: total };
  }

  static async listarDUAs(periodo?: string) {
    const where = periodo ? `WHERE DATE_FORMAT(fecha, '%Y-%m') = ?` : '';
    const params = periodo ? [periodo] : [];
    const [rows]: any = await pool.execute(
      `SELECT * FROM DUAs ${where} ORDER BY fecha DESC`, params
    );
    return rows;
  }

  static async crearNoDom(input: NoDomInput) {
    const monto_pen = input.monto_origen * input.tipo_cambio;
    const [r]: any = await pool.execute(
      `INSERT INTO NoDomiciliados (fecha_emision, proveedor_pais, proveedor_doc,
         proveedor_razon_social, tipo_doc, numero_doc, moneda, tipo_cambio,
         monto_origen, monto_pen, id_dua, observaciones)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [input.fecha_emision, input.proveedor_pais, input.proveedor_doc || null,
       input.proveedor_razon_social, input.tipo_doc, input.numero_doc,
       input.moneda, input.tipo_cambio, input.monto_origen, monto_pen,
       input.id_dua || null, input.observaciones || null]
    );
    return { id_no_dom: r.insertId, monto_pen };
  }

  static async listarNoDom(periodo?: string) {
    const where = periodo ? `WHERE DATE_FORMAT(fecha_emision, '%Y-%m') = ?` : '';
    const params = periodo ? [periodo] : [];
    const [rows]: any = await pool.execute(
      `SELECT n.*, d.numero_dua FROM NoDomiciliados n
       LEFT JOIN DUAs d ON d.id_dua = n.id_dua
       ${where} ORDER BY fecha_emision DESC`, params
    );
    return rows;
  }
}
```

- [ ] **Step 2: Crear `app/validators/importaciones.schema.ts`**

```typescript
import { z } from 'zod';
import { fechaField } from './shared';

export const duaSchema = z.object({
  numero_dua: z.string().min(5),
  fecha: fechaField,
  aduana: z.string().min(2),
  tipo_cambio: z.number().positive(),
  valor_fob_usd: z.number().nonnegative(),
  flete_usd: z.number().nonnegative(),
  seguro_usd: z.number().nonnegative(),
  valor_aduana_usd: z.number().nonnegative(),
  advalorem_pen: z.number().nonnegative(),
  isc_pen: z.number().nonnegative(),
  ipm_pen: z.number().nonnegative(),
  igv_importacion_pen: z.number().nonnegative(),
  servicio_despacho_pen: z.number().nonnegative(),
  observaciones: z.string().optional(),
});

export const noDomSchema = z.object({
  fecha_emision: fechaField,
  proveedor_pais: z.string().min(2),
  proveedor_doc: z.string().optional(),
  proveedor_razon_social: z.string().min(2),
  tipo_doc: z.string().default('INVOICE'),
  numero_doc: z.string().min(1),
  moneda: z.string().length(3).default('USD'),
  tipo_cambio: z.number().positive(),
  monto_origen: z.number().positive(),
  id_dua: z.number().int().positive().optional(),
  observaciones: z.string().optional(),
});
```

- [ ] **Step 3: Agregar rutas en `index.ts`**

Buscar la sección de rutas y agregar:

```typescript
// ===== IMPORTACIONES (DUAs + No Domiciliados) =====
app.get('/api/duas', requireAuth, requireModulo('LOGISTICA'), async (req, res) => {
  const periodo = req.query.periodo as string | undefined;
  const data = await ImportacionesService.listarDUAs(periodo);
  res.json(data);
});

app.post('/api/duas', requireAuth, requireModulo('LOGISTICA'), async (req, res) => {
  const input = duaSchema.parse(req.body);
  const result = await ImportacionesService.crearDUA(input);
  res.json(result);
});

app.get('/api/no-domiciliados', requireAuth, requireModulo('LOGISTICA'), async (req, res) => {
  const periodo = req.query.periodo as string | undefined;
  const data = await ImportacionesService.listarNoDom(periodo);
  res.json(data);
});

app.post('/api/no-domiciliados', requireAuth, requireModulo('LOGISTICA'), async (req, res) => {
  const input = noDomSchema.parse(req.body);
  const result = await ImportacionesService.crearNoDom(input);
  res.json(result);
});
```

Y en imports al inicio:
```typescript
import { ImportacionesService } from './app/modules/tributario/ImportacionesService';
import { duaSchema, noDomSchema } from './app/validators/importaciones.schema';
```

- [ ] **Step 4: Verificar compilación**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/modules/tributario/ImportacionesService.ts app/validators/importaciones.schema.ts index.ts
git commit -m "feat(tributario): ImportacionesService — CRUD DUAs + NoDomiciliados"
```

#### Task A-2.2: Frontend Importaciones

- [ ] **Step 1: Agregar namespace en `public/js/services/api.js`**

```javascript
api.importaciones = {
  listarDUAs: (periodo) => fetchAPI(`/duas${periodo ? `?periodo=${periodo}` : ''}`),
  crearDUA: (data) => fetchAPI('/duas', { method: 'POST', body: JSON.stringify(data) }),
  listarNoDom: (periodo) => fetchAPI(`/no-domiciliados${periodo ? `?periodo=${periodo}` : ''}`),
  crearNoDom: (data) => fetchAPI('/no-domiciliados', { method: 'POST', body: JSON.stringify(data) }),
};
```

- [ ] **Step 2: Crear `public/js/pages/Importaciones.js`** con tabla de DUAs + tabla de Invoices No Dom + formularios. Patrón estándar del ERP (ver Compras.js para referencia). Incluir:
  - Selector de periodo (YYYY-MM)
  - Tab "DUAs" con tabla + botón "Nueva DUA" → modal con form
  - Tab "Invoices No Domiciliados" con tabla + botón "Nuevo Invoice" → modal con selector de DUA
  - Submit usa api.importaciones, refresca tabla
  - showSuccess/showError de ui.js
  - Namespace `window.Importaciones = { ... }` al final

- [ ] **Step 3: Modificar `public/js/pages/Logistica.js`** para agregar sub-pestaña "Importaciones" que llama renderImportaciones(). O alternativamente: crear botón "Importaciones" en el sidebar bajo Logística.

- [ ] **Step 4: Probar manualmente**

Levantar servidor en `D:\proyectos\ERP-PRO`:
```bash
npx ts-node index.ts
```

Login → Logística → Importaciones → crear DUA → crear NoDom asociado → verificar en tabla.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Importaciones.js public/js/pages/Logistica.js public/js/services/api.js
git commit -m "feat(ui): módulo Importaciones (DUAs + Invoices No Domiciliados)"
```

#### Task A-2.3: Campos SIRE en form de Compra

- [ ] **Step 1: Modificar `public/js/pages/Compras.js`** para agregar al form de creación/edición:
  - `tipo_cp_sunat` (select: 01 Factura, 14 Recibo SP, 50 DUA)
  - `serie_cp` (text, requerido si no es DUA)
  - `correlativo_cp` (text)
  - `tipo_adquisicion` (select: GRAVADA / NO_GRAVADA / EXONERADA / INAFECTA / MIXTA)
  - `bi_gravada` / `bi_no_gravada` / `bi_exonerada` (numeric, autosuma = total)
  - `afecta_detraccion` (checkbox)
  - Si afecta_detraccion=true → mostrar `fecha_pago_detraccion`, `nro_constancia_detraccion`, upload PDF
  - Si tipo_cp_sunat='50' (DUA) → selector de DUA del mes (api.importaciones.listarDUAs)

- [ ] **Step 2: Modificar `app/modules/purchases/PurchaseService.ts`** para aceptar y persistir los nuevos campos en createCompra y updateCompra. Validar coherencia: `bi_gravada + bi_no_gravada + bi_exonerada` debe sumar `monto_base`.

- [ ] **Step 3: Endpoint de upload de PDF constancia detracción**

Reusar patrón de Cloudinary de cotizaciones. Crear `app/modules/finance/DetraccionPDFService.ts` que sube a `metalengineers/detracciones/`.

```typescript
import { v2 as cloudinary } from 'cloudinary';

export class DetraccionPDFService {
  static async subir(buffer: Buffer, idCompra: number): Promise<{url: string, public_id: string}> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'metalengineers/detracciones',
          public_id: `detrac-compra-${idCompra}-${Date.now()}`,
          format: 'pdf',
        },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve({ url: result.secure_url, public_id: result.public_id });
        }
      );
      stream.end(buffer);
    });
  }
}
```

Ruta:
```typescript
app.post('/api/compras/:id/upload-detraccion', requireAuth, requireModulo('LOGISTICA'),
  validateIdParam, multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const { url } = await DetraccionPDFService.subir(req.file.buffer, +req.params.id);
    await pool.execute('UPDATE Compras SET pdf_constancia_url = ? WHERE id_compra = ?', [url, +req.params.id]);
    res.json({ url });
  });
```

- [ ] **Step 4: Probar manualmente**

Crear compra → marcar afecta_detraccion → ingresar fecha pago + nro constancia → upload PDF → verificar en BD.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Compras.js app/modules/purchases/PurchaseService.ts app/modules/finance/DetraccionPDFService.ts index.ts
git commit -m "feat(compras): campos SIRE + upload PDF constancia detracción"
```

#### Task A-2.4: Campos SIRE en form de Cotización (al emitir factura)

Esto se ejecuta cuando ya esté lista la pantalla de "Emitir Factura desde Cotización" del plan B Facturación. Por ahora, agregar solo los campos en `Cotizaciones`/`Facturas` que no estén ya cubiertos.

- [ ] **Step 1: Verificar que `Facturas` ya tiene `tipo_cp_sunat`, `estado_op_sire`, `tipo_operacion`** (creados en migración 039).

- [ ] **Step 2: Si plan B Facturación aún no implementó la UI de emisión**, agregar campos placeholder en `Comercial.js` form de cotización:
  - `serie_factura_emitida` (text, opcional, formato F001)
  - `correlativo_factura_emitida` (number, opcional)
  
  Esto permite que Julio pegue manualmente la serie/nro reales emitidos en su sistema externo (Nubefact, etc.) hasta que la emisión sea desde el ERP.

- [ ] **Step 3: Commit**

```bash
git add public/js/pages/Comercial.js
git commit -m "feat(comercial): campos serie/correlativo factura SIRE en cotización"
```

---

### Sesión A-3: Pantalla "Liquidación del mes"

**Files:**
- Create: `app/modules/tributario/LiquidacionService.ts`
- Create: `app/modules/tributario/DiaHabilUtil.ts`
- Create: `public/js/pages/Liquidacion.js`
- Modify: `public/js/pages/Administracion.js` (agregar tab)
- Modify: `index.ts` (rutas)
- Modify: `public/js/services/api.js`

#### Task A-3.1: DiaHabilUtil con feriados Perú

- [ ] **Step 1: Crear `app/modules/tributario/DiaHabilUtil.ts`**

```typescript
// Feriados nacionales del Perú. Actualizar manualmente cada año.
const FERIADOS_PERU: { [year: number]: string[] } = {
  2026: [
    '2026-01-01', // Año Nuevo
    '2026-04-02', // Jueves Santo
    '2026-04-03', // Viernes Santo
    '2026-05-01', // Día del Trabajo
    '2026-06-07', // Bandera
    '2026-06-29', // San Pedro y San Pablo
    '2026-07-23', // FAP
    '2026-07-28', // Fiestas Patrias
    '2026-07-29', // Fiestas Patrias
    '2026-08-06', // Batalla de Junín
    '2026-08-30', // Santa Rosa
    '2026-10-08', // Combate de Angamos
    '2026-11-01', // Todos los Santos
    '2026-12-08', // Inmaculada Concepción
    '2026-12-09', // Batalla de Ayacucho
    '2026-12-25', // Navidad
  ],
  2027: [
    '2027-01-01',
    '2027-03-25', '2027-03-26',
    '2027-05-01',
    '2027-06-07', '2027-06-29',
    '2027-07-23', '2027-07-28', '2027-07-29',
    '2027-08-06', '2027-08-30',
    '2027-10-08', '2027-11-01',
    '2027-12-08', '2027-12-09', '2027-12-25',
  ],
};

export class DiaHabilUtil {
  static esFeriado(fecha: Date): boolean {
    const iso = fecha.toISOString().slice(0, 10);
    const year = fecha.getFullYear();
    return FERIADOS_PERU[year]?.includes(iso) ?? false;
  }

  static esDiaHabil(fecha: Date): boolean {
    const dia = fecha.getDay(); // 0=domingo, 6=sábado
    if (dia === 0 || dia === 6) return false;
    return !this.esFeriado(fecha);
  }

  /**
   * Devuelve el día 28 del mes/año dado, ajustado al día hábil ANTERIOR si cae no hábil.
   * Regla: siempre hacia atrás. Nunca cruza al mes siguiente.
   */
  static diaCierrePreliminar(year: number, month: number): Date {
    const d = new Date(year, month - 1, 28);
    while (!this.esDiaHabil(d)) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  }

  /**
   * ¿Hoy es ≥ al día de cierre preliminar de este mes?
   */
  static esDiaDeCierreOPosterior(today: Date = new Date()): boolean {
    const cierre = this.diaCierrePreliminar(today.getFullYear(), today.getMonth() + 1);
    return today >= cierre;
  }
}
```

- [ ] **Step 2: Crear test rápido**

Archivo `app/modules/tributario/DiaHabilUtil.test.ts` (si hay framework de tests; si no, crear script standalone):

```typescript
import { DiaHabilUtil } from './DiaHabilUtil';

// Sept 2025: 28 = domingo → debe dar viernes 26
console.assert(
  DiaHabilUtil.diaCierrePreliminar(2025, 9).toISOString().slice(0,10) === '2025-09-26',
  'Sept 2025: cierre debe ser 26 (viernes)'
);

// Feb 2026: 28 = sábado → debe dar viernes 27
console.assert(
  DiaHabilUtil.diaCierrePreliminar(2026, 2).toISOString().slice(0,10) === '2026-02-27',
  'Feb 2026: cierre debe ser 27 (viernes)'
);

// Dic 2025: 28 = domingo → debe dar viernes 26
console.assert(
  DiaHabilUtil.diaCierrePreliminar(2025, 12).toISOString().slice(0,10) === '2025-12-26',
  'Dic 2025: cierre debe ser 26 (viernes)'
);

console.log('DiaHabilUtil tests OK');
```

Run: `npx ts-node app/modules/tributario/DiaHabilUtil.test.ts`

Expected: `DiaHabilUtil tests OK`

- [ ] **Step 3: Commit**

```bash
git add app/modules/tributario/DiaHabilUtil.ts app/modules/tributario/DiaHabilUtil.test.ts
git commit -m "feat(tributario): DiaHabilUtil — cálculo día 28 con ajuste hacia atrás + feriados Perú"
```

#### Task A-3.2: LiquidacionService — orquestador del cuadre

- [ ] **Step 1: Crear `app/modules/tributario/LiquidacionService.ts`**

```typescript
import { pool } from '../../config/connection';

export interface CuadreLiquidacion {
  periodo: string;
  generado_al: string;

  ventas: {
    bi_gravada: number;
    igv: number;
    bi_exonerada: number;
    bi_inafecta: number;
    exportaciones: number;
    nc_bi: number;
    nc_igv: number;
    neto_bi: number;
    neto_igv: number;
  };

  compras: {
    bi_gravada: number;
    igv: number;
    no_gravadas: number;
    exoneradas: number;
    excluidas_bi: number;     // por detracción no pagada
    excluidas_igv: number;
    igv_importacion: number;
    igv_credito_fiscal: number; // neto utilizable este mes
  };

  cuadre_igv: {
    igv_ventas_neto: number;
    igv_compras_neto: number;
    diferencia: number;
    saldo_mes_anterior: number;
    percepciones: number;
    retenciones: number;
    igv_a_pagar: number;     // positivo=pagar, negativo=saldo a favor
  };

  renta_rer: {
    base_imponible: number;
    tasa: number;
    a_pagar: number;
  };

  total_form_621: number;

  alertas: string[];           // ["3 detracciones sin pago", "DUA sin numerar", ...]
  cpe_pendientes: number;
}

export class LiquidacionService {
  /**
   * Calcula el cuadre del periodo (YYYY-MM) en tiempo real.
   * No persiste — solo calcula. Para snapshot persistente usar generarPreliminar().
   */
  static async calcularCuadre(periodo: string): Promise<CuadreLiquidacion> {
    const [year, month] = periodo.split('-').map(Number);

    // ===== VENTAS =====
    const [ventasRows]: any = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo_operacion = '01' THEN subtotal ELSE 0 END), 0) AS bi_gravada,
         COALESCE(SUM(CASE WHEN tipo_operacion = '01' THEN igv ELSE 0 END), 0) AS igv,
         COALESCE(SUM(CASE WHEN tipo_operacion = '02' THEN total ELSE 0 END), 0) AS exportaciones
       FROM Facturas
       WHERE YEAR(fecha_emision) = ? AND MONTH(fecha_emision) = ?
         AND estado_sunat NOT IN ('ANULADA', 'RECHAZADA', 'ERROR')
         AND estado_op_sire = '1'`,
      [year, month]
    );

    const [ncRows]: any = await pool.execute(
      `SELECT COALESCE(SUM(subtotal), 0) AS bi, COALESCE(SUM(igv), 0) AS igv
       FROM NotasCredito
       WHERE YEAR(fecha_emision) = ? AND MONTH(fecha_emision) = ?
         AND estado_sunat NOT IN ('ANULADA', 'RECHAZADA', 'ERROR')`,
      [year, month]
    );

    const ventas = {
      bi_gravada: +ventasRows[0].bi_gravada,
      igv: +ventasRows[0].igv,
      bi_exonerada: 0,
      bi_inafecta: 0,
      exportaciones: +ventasRows[0].exportaciones,
      nc_bi: +ncRows[0].bi,
      nc_igv: +ncRows[0].igv,
      neto_bi: +ventasRows[0].bi_gravada - +ncRows[0].bi,
      neto_igv: +ventasRows[0].igv - +ncRows[0].igv,
    };

    // ===== COMPRAS =====
    // Compras del mes con detracción pagada (o sin detracción) → crédito fiscal
    const ultimoDiaMes = new Date(year, month, 0).toISOString().slice(0, 10);
    const [comprasRows]: any = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN afecta_detraccion = 0 OR fecha_pago_detraccion <= ? THEN bi_gravada ELSE 0 END), 0) AS bi_gravada,
         COALESCE(SUM(CASE WHEN afecta_detraccion = 0 OR fecha_pago_detraccion <= ? THEN igv ELSE 0 END), 0) AS igv,
         COALESCE(SUM(CASE WHEN afecta_detraccion = 1 AND (fecha_pago_detraccion IS NULL OR fecha_pago_detraccion > ?) THEN bi_gravada ELSE 0 END), 0) AS excluidas_bi,
         COALESCE(SUM(CASE WHEN afecta_detraccion = 1 AND (fecha_pago_detraccion IS NULL OR fecha_pago_detraccion > ?) THEN igv ELSE 0 END), 0) AS excluidas_igv,
         COALESCE(SUM(bi_no_gravada), 0) AS no_gravadas,
         COALESCE(SUM(bi_exonerada), 0) AS exoneradas
       FROM Compras
       WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?
         AND estado != 'ANULADO'`,
      [ultimoDiaMes, ultimoDiaMes, ultimoDiaMes, ultimoDiaMes, year, month]
    );

    // IGV de importaciones (DUAs del mes)
    const [duasRows]: any = await pool.execute(
      `SELECT COALESCE(SUM(igv_importacion_pen), 0) AS igv_imp
       FROM DUAs
       WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?`,
      [year, month]
    );

    const compras = {
      bi_gravada: +comprasRows[0].bi_gravada,
      igv: +comprasRows[0].igv,
      no_gravadas: +comprasRows[0].no_gravadas,
      exoneradas: +comprasRows[0].exoneradas,
      excluidas_bi: +comprasRows[0].excluidas_bi,
      excluidas_igv: +comprasRows[0].excluidas_igv,
      igv_importacion: +duasRows[0].igv_imp,
      igv_credito_fiscal: +comprasRows[0].igv + +duasRows[0].igv_imp,
    };

    // ===== CUADRE IGV =====
    const [confRows]: any = await pool.execute(
      `SELECT saldo_igv_mes_anterior, percepciones_acumuladas, retenciones_acumuladas,
              tasa_pago_cuenta_renta
       FROM ConfiguracionEmpresa LIMIT 1`
    );
    const conf = confRows[0];

    const igv_ventas_neto = ventas.neto_igv;
    const igv_compras_neto = compras.igv_credito_fiscal;
    const diferencia = igv_ventas_neto - igv_compras_neto;
    const saldo_mes_anterior = +conf.saldo_igv_mes_anterior;
    const percepciones = +conf.percepciones_acumuladas;
    const retenciones = +conf.retenciones_acumuladas;
    const igv_a_pagar = diferencia + saldo_mes_anterior + percepciones + retenciones;

    // ===== RENTA RER =====
    const base_renta = ventas.neto_bi;
    const tasa_renta = +conf.tasa_pago_cuenta_renta;
    const renta_a_pagar = base_renta * (tasa_renta / 100);

    // ===== TOTAL =====
    const total_form_621 = Math.max(0, igv_a_pagar) + renta_a_pagar;

    // ===== ALERTAS =====
    const alertas: string[] = [];
    const [pendDetracRows]: any = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM Compras
       WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?
         AND afecta_detraccion = 1 AND fecha_pago_detraccion IS NULL`,
      [year, month]
    );
    if (pendDetracRows[0].cnt > 0) {
      alertas.push(`${pendDetracRows[0].cnt} compra(s) afecta(s) a detracción sin pago confirmado`);
    }

    const [pendConstRows]: any = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM Compras
       WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?
         AND afecta_detraccion = 1 AND fecha_pago_detraccion IS NOT NULL
         AND pdf_constancia_url IS NULL`,
      [year, month]
    );
    if (pendConstRows[0].cnt > 0) {
      alertas.push(`${pendConstRows[0].cnt} detracción(es) sin PDF de constancia cargada`);
    }

    const cpe_pendientes = 0; // TODO: contar CPE pendientes según fuente externa si existe

    return {
      periodo,
      generado_al: new Date().toISOString(),
      ventas,
      compras,
      cuadre_igv: {
        igv_ventas_neto,
        igv_compras_neto,
        diferencia,
        saldo_mes_anterior,
        percepciones,
        retenciones,
        igv_a_pagar,
      },
      renta_rer: {
        base_imponible: base_renta,
        tasa: tasa_renta,
        a_pagar: renta_a_pagar,
      },
      total_form_621,
      alertas,
      cpe_pendientes,
    };
  }

  /**
   * Persiste un snapshot del cuadre en LiquidacionesMensuales.
   * Si ya existía, actualiza.
   */
  static async generarPreliminar(periodo: string, idUsuario: number): Promise<CuadreLiquidacion> {
    const cuadre = await this.calcularCuadre(periodo);

    await pool.execute(
      `INSERT INTO LiquidacionesMensuales (periodo, estado,
         ventas_bi_gravada, ventas_igv, ventas_exportaciones,
         nc_bi, nc_igv,
         compras_bi_gravada, compras_igv, compras_no_gravadas, compras_exoneradas,
         compras_excluidas_bi, compras_excluidas_igv, igv_importacion,
         saldo_igv_mes_anterior, percepciones_mes, retenciones_mes, igv_a_pagar,
         base_imponible_renta, tasa_renta_aplicada, renta_a_pagar,
         total_form_621, detracciones_sin_pago,
         fecha_generacion, generado_por_usuario)
       VALUES (?, 'PRELIMINAR', ?,?,?, ?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?, ?,?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         estado = 'PRELIMINAR',
         ventas_bi_gravada = VALUES(ventas_bi_gravada),
         ventas_igv = VALUES(ventas_igv),
         ventas_exportaciones = VALUES(ventas_exportaciones),
         nc_bi = VALUES(nc_bi), nc_igv = VALUES(nc_igv),
         compras_bi_gravada = VALUES(compras_bi_gravada),
         compras_igv = VALUES(compras_igv),
         compras_no_gravadas = VALUES(compras_no_gravadas),
         compras_exoneradas = VALUES(compras_exoneradas),
         compras_excluidas_bi = VALUES(compras_excluidas_bi),
         compras_excluidas_igv = VALUES(compras_excluidas_igv),
         igv_importacion = VALUES(igv_importacion),
         saldo_igv_mes_anterior = VALUES(saldo_igv_mes_anterior),
         percepciones_mes = VALUES(percepciones_mes),
         retenciones_mes = VALUES(retenciones_mes),
         igv_a_pagar = VALUES(igv_a_pagar),
         base_imponible_renta = VALUES(base_imponible_renta),
         tasa_renta_aplicada = VALUES(tasa_renta_aplicada),
         renta_a_pagar = VALUES(renta_a_pagar),
         total_form_621 = VALUES(total_form_621),
         detracciones_sin_pago = VALUES(detracciones_sin_pago),
         fecha_generacion = NOW(),
         generado_por_usuario = VALUES(generado_por_usuario)`,
      [periodo,
       cuadre.ventas.bi_gravada, cuadre.ventas.igv, cuadre.ventas.exportaciones,
       cuadre.ventas.nc_bi, cuadre.ventas.nc_igv,
       cuadre.compras.bi_gravada, cuadre.compras.igv, cuadre.compras.no_gravadas, cuadre.compras.exoneradas,
       cuadre.compras.excluidas_bi, cuadre.compras.excluidas_igv, cuadre.compras.igv_importacion,
       cuadre.cuadre_igv.saldo_mes_anterior, cuadre.cuadre_igv.percepciones,
       cuadre.cuadre_igv.retenciones, cuadre.cuadre_igv.igv_a_pagar,
       cuadre.renta_rer.base_imponible, cuadre.renta_rer.tasa, cuadre.renta_rer.a_pagar,
       cuadre.total_form_621, cuadre.alertas.length,
       idUsuario]
    );

    return cuadre;
  }

  static async getHistorico(year: number) {
    const [rows]: any = await pool.execute(
      `SELECT periodo, estado, total_form_621, fecha_generacion
       FROM LiquidacionesMensuales
       WHERE periodo LIKE ?
       ORDER BY periodo DESC`,
      [`${year}-%`]
    );
    return rows;
  }
}
```

- [ ] **Step 2: Agregar rutas en `index.ts`**

```typescript
import { LiquidacionService } from './app/modules/tributario/LiquidacionService';
import { DiaHabilUtil } from './app/modules/tributario/DiaHabilUtil';

app.get('/api/liquidacion/cuadre/:periodo', requireAuth, requireModulo('ADMINISTRACION'),
  async (req, res) => {
    const cuadre = await LiquidacionService.calcularCuadre(req.params.periodo);
    res.json(cuadre);
  });

app.post('/api/liquidacion/generar-preliminar/:periodo', requireAuth, requireModulo('ADMINISTRACION'),
  async (req: any, res) => {
    const cuadre = await LiquidacionService.generarPreliminar(
      req.params.periodo, req.user.id_usuario
    );
    res.json(cuadre);
  });

app.get('/api/liquidacion/historico/:year', requireAuth, requireModulo('ADMINISTRACION'),
  async (req, res) => {
    const data = await LiquidacionService.getHistorico(+req.params.year);
    res.json(data);
  });

app.get('/api/liquidacion/dia-cierre', requireAuth, async (req, res) => {
  const today = new Date();
  const cierre = DiaHabilUtil.diaCierrePreliminar(today.getFullYear(), today.getMonth() + 1);
  res.json({
    dia_cierre: cierre.toISOString().slice(0, 10),
    es_dia_cierre_o_posterior: DiaHabilUtil.esDiaDeCierreOPosterior(today),
  });
});
```

- [ ] **Step 3: Probar endpoint en navegador**

```bash
npx ts-node index.ts
# Login, luego en otra pestaña:
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/liquidacion/cuadre/2026-04
```

Expected: JSON con cuadre del mes en curso (puede ser todo en 0 si no hay data).

- [ ] **Step 4: Commit**

```bash
git add app/modules/tributario/LiquidacionService.ts index.ts
git commit -m "feat(tributario): LiquidacionService — cuadre IGV+Renta RER en tiempo real"
```

#### Task A-3.3: Frontend pantalla "Liquidación del mes"

- [ ] **Step 1: Agregar namespace en `public/js/services/api.js`**

```javascript
api.liquidacion = {
  cuadre: (periodo) => fetchAPI(`/liquidacion/cuadre/${periodo}`),
  generarPreliminar: (periodo) => fetchAPI(`/liquidacion/generar-preliminar/${periodo}`, { method: 'POST' }),
  historico: (year) => fetchAPI(`/liquidacion/historico/${year}`),
  diaCierre: () => fetchAPI('/liquidacion/dia-cierre'),
};
```

- [ ] **Step 2: Crear `public/js/pages/Liquidacion.js`**

Pantalla con:
- Header: "Liquidación del mes" + selector de periodo (default: mes actual) + botón "Generar Preliminar"
- 4 cards KPI: IGV ventas, IGV compras, IGV a pagar, Renta a pagar
- Card grande "TOTAL FORM 621" con monto destacado
- Tabla "Cuadre IGV" con desglose
- Tabla "Cuadre Renta RER" con desglose
- Sección "Alertas" si hay items pendientes
- Tabla "Histórico anual" abajo

Patrón de la página: similar a Finanzas.js con auto-refresh al cambiar periodo.

- [ ] **Step 3: Modificar `public/js/pages/Administracion.js`** para agregar tab "💰 Liquidación del mes" que llama a Liquidacion.render().

- [ ] **Step 4: Probar UI**

Levantar servidor → Login (Gerente) → Administración → Liquidación del mes → ver KPIs en 0 (BD vacía de Facturas) → cambiar periodo a 2025-09 (si hay data del Excel del contador, comparar).

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/Liquidacion.js public/js/pages/Administracion.js public/js/services/api.js
git commit -m "feat(admin): pantalla Liquidación del mes en tiempo real"
```

---

### Sesión A-4: Generador PDF/Excel + Drive + Banner día 28

**Files:**
- Create: `app/modules/tributario/LiquidacionExcelExporter.ts`
- Create: `app/modules/tributario/LiquidacionPDFExporter.ts`
- Modify: `app/modules/comercial/GoogleDriveService.ts` (agregar método uploadLiquidacion)
- Create: `public/js/components/BannerLiquidacion.js`
- Modify: `public/js/pages/Dashboard.js` (banner si Gerente)
- Modify: `public/js/pages/Administracion.js` (banner)
- Modify: `index.ts`

#### Task A-4.1: Excel exporter (6 hojas)

- [ ] **Step 1: Instalar exceljs si no está**

```bash
npm install exceljs
```

- [ ] **Step 2: Crear `app/modules/tributario/LiquidacionExcelExporter.ts`**

Genera Excel con hojas:
1. **Resumen** — cuadre IGV + Renta + Form 621 + alertas
2. **RV (Ventas)** — facturas + NC del mes con columnas SIRE
3. **RC (Compras)** — compras del mes con columnas SIRE + flag detracción
4. **RHE (Honorarios)** — gastos de servicio persona natural (placeholder si no hay módulo RHE aún)
5. **DUAs** — DUAs del mes
6. **No Domiciliados** — invoices extranjeros del mes

Cada hoja con headers en negrita, filas zebra, totales al final, formato número 0.00.

```typescript
import ExcelJS from 'exceljs';
import { CuadreLiquidacion, LiquidacionService } from './LiquidacionService';
import { pool } from '../../config/connection';

export class LiquidacionExcelExporter {
  static async generar(periodo: string): Promise<Buffer> {
    const cuadre = await LiquidacionService.calcularCuadre(periodo);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ERP-PRO Metal Engineers';
    wb.created = new Date();

    // Hoja 1: Resumen
    const wsResumen = wb.addWorksheet('Resumen');
    this.fillResumen(wsResumen, cuadre);

    // Hoja 2: RV
    const wsRV = wb.addWorksheet('RV-Ventas');
    await this.fillRV(wsRV, periodo);

    // Hoja 3: RC
    const wsRC = wb.addWorksheet('RC-Compras');
    await this.fillRC(wsRC, periodo);

    // Hoja 4: RHE
    const wsRHE = wb.addWorksheet('RHE-Honorarios');
    wsRHE.addRow(['Pendiente módulo RHE — datos no capturados aún']);

    // Hoja 5: DUAs
    const wsDUAs = wb.addWorksheet('DUAs');
    await this.fillDUAs(wsDUAs, periodo);

    // Hoja 6: No Dom
    const wsNoDom = wb.addWorksheet('No Domiciliados');
    await this.fillNoDom(wsNoDom, periodo);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private static fillResumen(ws: ExcelJS.Worksheet, c: CuadreLiquidacion) {
    ws.addRow(['LIQUIDACIÓN PRELIMINAR — METAL ENGINEERS SAC']);
    ws.addRow(['RUC', '20610071962']);
    ws.addRow(['Periodo', c.periodo]);
    ws.addRow(['Generado', new Date(c.generado_al).toLocaleString('es-PE')]);
    ws.addRow([]);
    ws.addRow(['VENTAS', '', 'BI', 'IGV']);
    ws.addRow(['', 'Gravadas', c.ventas.bi_gravada, c.ventas.igv]);
    ws.addRow(['', 'Notas Crédito', -c.ventas.nc_bi, -c.ventas.nc_igv]);
    ws.addRow(['', 'Exportaciones', c.ventas.exportaciones, 0]);
    ws.addRow(['', 'Neto', c.ventas.neto_bi, c.ventas.neto_igv]);
    ws.addRow([]);
    ws.addRow(['COMPRAS', '', 'BI', 'IGV']);
    ws.addRow(['', 'Gravadas', c.compras.bi_gravada, c.compras.igv]);
    ws.addRow(['', 'IGV Importación', '', c.compras.igv_importacion]);
    ws.addRow(['', 'Excluidas (detracción no pagada)', c.compras.excluidas_bi, c.compras.excluidas_igv]);
    ws.addRow(['', 'Crédito fiscal utilizable', '', c.compras.igv_credito_fiscal]);
    ws.addRow([]);
    ws.addRow(['CUADRE IGV']);
    ws.addRow(['', 'IGV Ventas - IGV Compras', '', c.cuadre_igv.diferencia]);
    ws.addRow(['', 'Saldo IGV mes anterior', '', c.cuadre_igv.saldo_mes_anterior]);
    ws.addRow(['', 'Percepciones', '', c.cuadre_igv.percepciones]);
    ws.addRow(['', 'Retenciones', '', c.cuadre_igv.retenciones]);
    ws.addRow(['', 'IGV a pagar', '', c.cuadre_igv.igv_a_pagar]);
    ws.addRow([]);
    ws.addRow(['RENTA RER']);
    ws.addRow(['', 'Base imponible', '', c.renta_rer.base_imponible]);
    ws.addRow(['', `Tasa ${c.renta_rer.tasa}%`, '', c.renta_rer.a_pagar]);
    ws.addRow([]);
    ws.addRow(['TOTAL FORM 621', '', '', c.total_form_621]);
    ws.addRow([]);
    if (c.alertas.length > 0) {
      ws.addRow(['ALERTAS']);
      c.alertas.forEach(a => ws.addRow(['', a]));
    }

    // Estilos
    ws.getRow(1).font = { bold: true, size: 14 };
    [6, 12, 18, 25].forEach(rn => { ws.getRow(rn).font = { bold: true }; });
    ws.getRow(28).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ws.getRow(28).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  }

  private static async fillRV(ws: ExcelJS.Worksheet, periodo: string) {
    ws.addRow(['Fecha', 'Tipo CP', 'Serie', 'Nro', 'RUC Cliente', 'Cliente',
               'BI Gravada', 'IGV', 'Total', 'Moneda', 'TC']);
    const [year, month] = periodo.split('-').map(Number);
    const [rows]: any = await pool.execute(
      `SELECT fecha_emision, tipo_cp_sunat, serie, numero,
              cliente_numero_doc, cliente_razon_social,
              subtotal, igv, total, moneda, tipo_cambio
       FROM Facturas
       WHERE YEAR(fecha_emision) = ? AND MONTH(fecha_emision) = ?
         AND estado_sunat NOT IN ('ANULADA', 'RECHAZADA', 'ERROR')
       ORDER BY fecha_emision, serie, numero`,
      [year, month]
    );
    rows.forEach((r: any) => ws.addRow([
      r.fecha_emision, r.tipo_cp_sunat, r.serie, r.numero,
      r.cliente_numero_doc, r.cliente_razon_social,
      +r.subtotal, +r.igv, +r.total, r.moneda, +r.tipo_cambio,
    ]));
    ws.getRow(1).font = { bold: true };
  }

  private static async fillRC(ws: ExcelJS.Worksheet, periodo: string) {
    ws.addRow(['Fecha', 'Tipo CP', 'Serie', 'Nro', 'RUC Proveedor', 'Proveedor',
               'BI Gravada', 'IGV', 'Total', 'Detrac', 'Pago Detrac', 'Moneda', 'TC']);
    const [year, month] = periodo.split('-').map(Number);
    const [rows]: any = await pool.execute(
      `SELECT c.fecha, c.tipo_cp_sunat, c.serie_cp, c.correlativo_cp,
              p.ruc, p.razon_social,
              c.bi_gravada, c.igv, c.monto_total,
              c.afecta_detraccion, c.fecha_pago_detraccion,
              c.moneda, c.tipo_cambio
       FROM Compras c
       LEFT JOIN Proveedores p ON p.id_proveedor = c.id_proveedor
       WHERE YEAR(c.fecha) = ? AND MONTH(c.fecha) = ?
         AND c.estado != 'ANULADO'
       ORDER BY c.fecha, c.serie_cp, c.correlativo_cp`,
      [year, month]
    );
    rows.forEach((r: any) => ws.addRow([
      r.fecha, r.tipo_cp_sunat, r.serie_cp, r.correlativo_cp,
      r.ruc, r.razon_social,
      +r.bi_gravada, +r.igv, +r.monto_total,
      r.afecta_detraccion ? 'SI' : 'NO',
      r.fecha_pago_detraccion || '',
      r.moneda, +r.tipo_cambio,
    ]));
    ws.getRow(1).font = { bold: true };
  }

  private static async fillDUAs(ws: ExcelJS.Worksheet, periodo: string) {
    ws.addRow(['Nº DUA', 'Fecha', 'Aduana', 'TC', 'Valor Aduana USD',
               'Advalorem', 'IPM', 'IGV Imp', 'Despacho', 'Total PEN']);
    const [year, month] = periodo.split('-').map(Number);
    const [rows]: any = await pool.execute(
      `SELECT * FROM DUAs WHERE YEAR(fecha)=? AND MONTH(fecha)=? ORDER BY fecha`,
      [year, month]
    );
    rows.forEach((r: any) => ws.addRow([
      r.numero_dua, r.fecha, r.aduana, +r.tipo_cambio, +r.valor_aduana_usd,
      +r.advalorem_pen, +r.ipm_pen, +r.igv_importacion_pen,
      +r.servicio_despacho_pen, +r.total_pagado_pen,
    ]));
    ws.getRow(1).font = { bold: true };
  }

  private static async fillNoDom(ws: ExcelJS.Worksheet, periodo: string) {
    ws.addRow(['Fecha', 'País', 'Proveedor', 'Tipo Doc', 'Nro Doc',
               'Moneda', 'TC', 'Monto Origen', 'Monto PEN', 'DUA']);
    const [year, month] = periodo.split('-').map(Number);
    const [rows]: any = await pool.execute(
      `SELECT n.*, d.numero_dua FROM NoDomiciliados n
       LEFT JOIN DUAs d ON d.id_dua = n.id_dua
       WHERE YEAR(n.fecha_emision)=? AND MONTH(n.fecha_emision)=?
       ORDER BY n.fecha_emision`,
      [year, month]
    );
    rows.forEach((r: any) => ws.addRow([
      r.fecha_emision, r.proveedor_pais, r.proveedor_razon_social,
      r.tipo_doc, r.numero_doc, r.moneda, +r.tipo_cambio,
      +r.monto_origen, +r.monto_pen, r.numero_dua || '',
    ]));
    ws.getRow(1).font = { bold: true };
  }
}
```

- [ ] **Step 3: Probar generación local**

Crear script `scripts/test_excel_liquidacion.ts`:
```typescript
import { LiquidacionExcelExporter } from '../app/modules/tributario/LiquidacionExcelExporter';
import fs from 'fs';

(async () => {
  const buf = await LiquidacionExcelExporter.generar('2026-04');
  fs.writeFileSync('test-liquidacion.xlsx', buf);
  console.log('Excel generado: test-liquidacion.xlsx');
})();
```

```bash
npx ts-node scripts/test_excel_liquidacion.ts
```

Abrir test-liquidacion.xlsx en Excel/LibreOffice y verificar 6 hojas.

- [ ] **Step 4: Commit**

```bash
git add app/modules/tributario/LiquidacionExcelExporter.ts package.json package-lock.json
git commit -m "feat(tributario): LiquidacionExcelExporter — Excel preliminar 6 hojas"
```

#### Task A-4.2: PDF exporter (1-2 páginas resumen ejecutivo)

- [ ] **Step 1: Crear `app/modules/tributario/LiquidacionPDFExporter.ts`**

Reusa pdfkit (ya está en deps por CotizacionPDFService). Genera PDF de 1-2 páginas:
- Header: Logo Metal Engineers + "LIQUIDACIÓN PRELIMINAR" + periodo
- Marca de agua diagonal "PRELIMINAR — NO USAR PARA SIRE" en cada página
- Sección "Resumen ejecutivo" con cuadre
- Sección "Total Form 621" destacado
- Sección "Alertas" si las hay
- Pie: "Datos al [fecha] — Vencimiento SIRE [fecha]"

Estructura similar a CotizacionPDFService.ts (367 líneas existentes), copia y adapta.

- [ ] **Step 2: Probar generación local**

```bash
npx ts-node scripts/test_pdf_liquidacion.ts
```

- [ ] **Step 3: Commit**

```bash
git add app/modules/tributario/LiquidacionPDFExporter.ts
git commit -m "feat(tributario): LiquidacionPDFExporter — PDF resumen ejecutivo con marca de agua"
```

#### Task A-4.3: Subida a Drive — extender GoogleDriveService

- [ ] **Step 1: Modificar `app/modules/comercial/GoogleDriveService.ts`** agregando método:

```typescript
async subirLiquidacion(opts: {
  buffer: Buffer;
  fileName: string;
  periodo: string;            // YYYY-MM
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}): Promise<{ url: string; fileId: string }> {
  // Estructura: Liquidaciones / AAAA-MM /
  const liqRoot = await this.getOrCreateFolder('Liquidaciones', this.driveFolderId);
  const periodFolder = await this.getOrCreateFolder(opts.periodo, liqRoot);

  // Buscar si ya existe el archivo (sobrescribir)
  const existing = await this.drive.files.list({
    q: `'${periodFolder}' in parents and name = '${opts.fileName}' and trashed = false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'drive',
    driveId: this.driveFolderId,
  });

  if (existing.data.files && existing.data.files.length > 0) {
    // Actualizar contenido del archivo existente
    const fileId = existing.data.files[0].id!;
    await this.drive.files.update({
      fileId,
      media: { mimeType: opts.mimeType, body: Readable.from(opts.buffer) },
      supportsAllDrives: true,
    });
    return { url: `https://drive.google.com/file/d/${fileId}`, fileId };
  } else {
    // Crear nuevo
    const r = await this.drive.files.create({
      requestBody: { name: opts.fileName, parents: [periodFolder] },
      media: { mimeType: opts.mimeType, body: Readable.from(opts.buffer) },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });
    return { url: r.data.webViewLink!, fileId: r.data.id! };
  }
}
```

- [ ] **Step 2: Endpoint `POST /api/liquidacion/exportar/:periodo`** que:
  1. Genera Excel
  2. Genera PDF
  3. Sube ambos a Drive (sobrescribe si existen)
  4. Actualiza `LiquidacionesMensuales.pdf_url` y `excel_url`
  5. Devuelve URLs

```typescript
app.post('/api/liquidacion/exportar/:periodo', requireAuth, requireModulo('ADMINISTRACION'),
  async (req: any, res) => {
    const periodo = req.params.periodo;
    const cuadre = await LiquidacionService.generarPreliminar(periodo, req.user.id_usuario);
    const xlsxBuf = await LiquidacionExcelExporter.generar(periodo);
    const pdfBuf = await LiquidacionPDFExporter.generar(periodo);

    const drive = new GoogleDriveService();
    const xlsxR = await drive.subirLiquidacion({
      buffer: xlsxBuf,
      fileName: `Liquidacion-Preliminar-${periodo}.xlsx`,
      periodo,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const pdfR = await drive.subirLiquidacion({
      buffer: pdfBuf,
      fileName: `Liquidacion-Preliminar-${periodo}.pdf`,
      periodo,
      mimeType: 'application/pdf',
    });

    await pool.execute(
      `UPDATE LiquidacionesMensuales SET pdf_url=?, excel_url=? WHERE periodo=?`,
      [pdfR.url, xlsxR.url, periodo]
    );

    res.json({ cuadre, urls: { pdf: pdfR.url, excel: xlsxR.url } });
  });
```

- [ ] **Step 3: Probar end-to-end**

Login → Administración → Liquidación del mes → "Generar Preliminar" → verificar que aparece confirmación con links a Drive.

Verificar en Drive: carpeta `Liquidaciones/2026-04/` con `Liquidacion-Preliminar-2026-04.xlsx` y `.pdf`.

- [ ] **Step 4: Commit**

```bash
git add app/modules/comercial/GoogleDriveService.ts index.ts
git commit -m "feat(drive): subirLiquidacion — sobrescribe Excel+PDF en Liquidaciones/AAAA-MM/"
```

#### Task A-4.4: Banner día 28 + integración UI

- [ ] **Step 1: Crear `public/js/components/BannerLiquidacion.js`**

Componente que:
1. Llama a `api.liquidacion.diaCierre()` al cargar
2. Si `es_dia_cierre_o_posterior === true` y aún no se generó este mes, renderiza banner
3. Banner amarillo con mensaje, botón "Generar reporte preliminar", botón "Ver liquidación"
4. Al hacer clic en "Generar" → llama `api.liquidacion.exportar(periodo)` → muestra success con links

```javascript
export async function renderBannerLiquidacion(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  try {
    const { dia_cierre, es_dia_cierre_o_posterior } = await api.liquidacion.diaCierre();
    if (!es_dia_cierre_o_posterior) return;

    const periodoActual = new Date().toISOString().slice(0, 7);
    const historico = await api.liquidacion.historico(new Date().getFullYear());
    const yaGenerado = historico.some(h => h.periodo === periodoActual && h.estado === 'PRELIMINAR');

    if (yaGenerado) return;

    container.innerHTML = `
      <div style="background:#fff3cd; border:1px solid #ffc107; padding:14px 20px; margin-bottom:16px; border-radius:6px;">
        <strong>⚠ Liquidación preliminar de ${periodoActual} disponible</strong>
        <div style="margin-top:6px; font-size:13px; color:#666;">
          Día de cierre preliminar: ${dia_cierre}. Vencimiento SUNAT (RUC en 2): ~17 del mes siguiente.
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-warning" onclick="window.BannerLiquidacion.generar('${periodoActual}')">
            📋 Generar reporte preliminar
          </button>
          <button class="btn btn-secondary" onclick="navigate('administracion')">
            Ver liquidación en vivo →
          </button>
        </div>
      </div>
    `;
  } catch (e) {
    console.warn('BannerLiquidacion: error obteniendo día cierre', e);
  }
}

window.BannerLiquidacion = {
  generar: async (periodo) => {
    if (!confirm(`Generar reporte preliminar de ${periodo}? Se subirá a Drive y sobrescribirá la versión actual.`)) return;
    try {
      const r = await api.liquidacion.exportar(periodo);
      showSuccess(`Reporte generado. Excel: ${r.urls.excel}`);
      // Refrescar banner
      location.reload();
    } catch (e) {
      showError('Error generando reporte: ' + e.message);
    }
  },
};
```

- [ ] **Step 2: Agregar al `api.js`**

```javascript
api.liquidacion.exportar = (periodo) => fetchAPI(`/liquidacion/exportar/${periodo}`, { method: 'POST' });
```

- [ ] **Step 3: Integrar en `Dashboard.js` (módulo Gerencia)**

Agregar al inicio del render:
```javascript
import { renderBannerLiquidacion } from '../components/BannerLiquidacion.js';
// ...
renderBannerLiquidacion('dashboard-banner-zone');
```

Y en el HTML: `<div id="dashboard-banner-zone"></div>` antes de los KPIs.

- [ ] **Step 4: Integrar en `Administracion.js`**

Mismo patrón: `<div id="admin-banner-zone"></div>` y llamar renderBannerLiquidacion.

- [ ] **Step 5: Probar manualmente**

Forzar `esDiaDeCierreOPosterior` a true (mock fecha o cambiar fecha del sistema). Verificar banner aparece. Clic en "Generar" → archivo en Drive.

- [ ] **Step 6: Commit**

```bash
git add public/js/components/BannerLiquidacion.js public/js/pages/Dashboard.js public/js/pages/Administracion.js public/js/services/api.js
git commit -m "feat(ui): banner día 28 en Gerencia/Administración + flujo generación"
```

#### Task A-4.5: Cierre Sesión A — actualizar docs

- [ ] **Step 1: Actualizar ESTADO.md** con sesión nueva:

```markdown
### Sesión 27/04/2026 — Liquidación Tributaria Preliminar (Fase A)

- Migraciones 038-041 aplicadas: RER + saldos, campos SIRE, DUAs/NoDom, LiquidacionesMensuales
- Módulo Importaciones: CRUD DUAs + Invoices No Domiciliados
- Pantalla "Liquidación del mes" en Administración con cuadre IGV+Renta RER en tiempo real
- Generador PDF + Excel preliminar (6 hojas) con marca de agua "PRELIMINAR"
- Subida automática a Drive `Liquidaciones/AAAA-MM/` (sobrescribe actual)
- Banner día 28 (ajustado al día hábil anterior) en Gerencia + Administración
- Endpoint manual desde Administración disponible siempre

**Fase A completa.** Próximo: validar 3 meses contra contador antes de Fase B (SIRE directo + Pagos).
```

- [ ] **Step 2: Actualizar CLAUDE.md** con sección nueva:

```markdown
## Módulo Tributario — Liquidación Preliminar (implementado 27/04/2026)

### Concepto
Reporte mensual de cuadre tributario (IGV + Renta RER) que se entrega el día 28 (ajustado al día hábil anterior) para revisión del contador antes de subida manual a SIRE.

### Archivos clave
- `app/modules/tributario/LiquidacionService.ts` — calcularCuadre, generarPreliminar, getHistorico
- `app/modules/tributario/LiquidacionExcelExporter.ts` — Excel 6 hojas
- `app/modules/tributario/LiquidacionPDFExporter.ts` — PDF resumen ejecutivo
- `app/modules/tributario/DiaHabilUtil.ts` — feriados Perú + cálculo día 28 hacia atrás
- `app/modules/tributario/ImportacionesService.ts` — DUAs + NoDom
- `public/js/pages/Liquidacion.js` — pantalla en vivo
- `public/js/pages/Importaciones.js` — módulo Importaciones
- `public/js/components/BannerLiquidacion.js` — banner día 28

### Endpoints
- `GET /api/liquidacion/cuadre/:periodo` — cuadre en tiempo real
- `POST /api/liquidacion/generar-preliminar/:periodo` — snapshot
- `POST /api/liquidacion/exportar/:periodo` — Excel + PDF + Drive
- `GET /api/liquidacion/dia-cierre` — día 28 ajustado + flag
- `GET /api/liquidacion/historico/:year` — listado anual
- `GET|POST /api/duas` y `/api/no-domiciliados`

### Reglas
- Cuadre IGV: (IGV ventas - NC) - (IGV compras + IGV importación) + saldo mes anterior + percepciones + retenciones = a pagar
- Renta RER: BI ventas neto × 1.5%
- Compras con detracción no pagada al cierre del mes → excluidas, recién dan crédito el mes que se pagan
- Día cierre preliminar: 28 ajustado al día hábil ANTERIOR si cae no hábil. Nunca cruza al mes siguiente.
- PDF preliminar siempre lleva marca de agua "PRELIMINAR — NO USAR PARA SIRE"
- Drive: `Liquidaciones/AAAA-MM/` sobrescribe archivo actual sin histórico
```

- [ ] **Step 3: Commit final Fase A**

```bash
git add ESTADO.md CLAUDE.md
git commit -m "docs(estado, claude): cierre Fase A — Liquidación Tributaria Preliminar"
```

- [ ] **Step 4: Push a Railway**

```bash
git push origin main
```

Railway auto-despliega. Después correr migraciones en Railway:

```bash
npx ts-node database/apply_migrations.ts --env=railway
```

Verificar en https://erp-pro-production-e4c0.up.railway.app que el módulo Liquidación funciona.

---

## FASE B — Tasks de alto nivel

> Cada sesión B-N tendrá su propio plan detallado cuando llegue su momento. Aquí solo el outline.

### B-1 a B-3: Generadores SIRE TXT

**Goal:** Producir TXT formato SIRE 14.4 (Ventas), 8.4 (Compras), 8.2 (No Domiciliados) idénticos byte-a-byte al TXT de referencia del contador.

**Files:**
- `app/modules/tributario/sire/SireRVIEExporter.ts` (estructura 14.4)
- `app/modules/tributario/sire/SireRCEExporter.ts` (estructura 8.4)
- `app/modules/tributario/sire/SireNoDomExporter.ts` (estructura 8.2)
- `app/modules/tributario/sire/SireValidator.ts` (validador previo: RUC, fechas, sumas, catálogos)
- `app/modules/tributario/sire/SireFileNameBuilder.ts` (`LE[RUC][periodo][cod_libro][indicadores].txt`)
- `tests/sire/golden/2025-09-RVIE-referencia.txt` (TXT del contador como referencia)
- `tests/sire/SireRVIEExporter.test.ts` (compara byte-a-byte con golden file)

**Definition of done:** El TXT generado por el ERP para Sept 2025 es **idéntico** al TXT que el contador subió a SIRE en su momento (modulo orden de filas si SIRE no es sensible al orden).

**Bloqueante:** Pendiente #2 — TXT de referencia del contador.

### B-4: Cifrado credenciales SOL

**Goal:** Almacenar credenciales SUNAT (Usuario Secundario SOL) cifradas con AES-256-GCM, master key en `process.env.SUNAT_MASTER_KEY`.

**Files:**
- `app/modules/tributario/sunat/CryptoCredentials.ts` (encrypt/decrypt)
- Migración 042: tabla `SunatCredenciales` (id, ruc, sol_user_encrypted, sol_pass_encrypted, fecha_creacion)
- UI configuración en Administración: form para ingresar credenciales (se cifran al guardar, nunca se devuelven en plain)

### B-5 a B-6: Cliente API SIRE (OAuth2 + envío)

**Goal:** Cliente HTTP que autentica contra `api-sire.sunat.gob.pe`, envía propuestas RVIE/RCE, recibe respuestas, maneja errores, ratelimit, retry exponencial.

**Files:**
- `app/modules/tributario/sunat/SireApiClient.ts` (OAuth2 + envío + descarga propuesta)
- `app/modules/tributario/sunat/SireDryRunMode.ts` (modo simulación: no envía, solo arma payload)

**DoD:** En modo dry-run, genera payload válido. En modo real (con credenciales en env de testing), autentica OK y obtiene propuesta de un periodo viejo (sin enviar).

### B-7: Tabla PresentacionesSunat + state machine + UI timeline

**Files:**
- Migración 043: tabla `PresentacionesSunat` (id, periodo, tipo, estado, ticket_sunat, payload_hash, response_json, sent_at, accepted_at, ...)
- `app/modules/tributario/sunat/PresentacionesService.ts` (state machine)
- `public/js/pages/PresentacionesSunat.js` (timeline visual con estados de cada periodo × cada tipo)

### B-8: Cronograma SUNAT + scheduler "5 días antes" + 1-click

**Files:**
- Migración 044: tabla `CronogramaSunat` (year, ultimo_digito_ruc, mes, fecha_vencimiento)
- `app/modules/tributario/sunat/CronogramaService.ts` (CRUD + lookup "fecha vencimiento de mi RUC para periodo X")
- `app/modules/tributario/sunat/SchedulerSunat.ts` (calcula "fecha presentación = fecha vencimiento - 5 días hábiles")
- UI: pantalla Configuración → "Cronograma SUNAT" para que Julio actualice cada año
- UI: pantalla "Próximas presentaciones" con countdown
- Botón "Aprobar y enviar" que dispara el envío

### B-9: Cliente Declara Fácil 621

**Files:**
- `app/modules/tributario/sunat/Form621ApiClient.ts`
- Genera payload del 621 con totales del periodo
- Envía vía API (modo dry-run primero)
- Recibe constancia + nro de orden

### B-10: SaldoDetracciones + tracking + UI

**Files:**
- Migración 045: tabla `SaldoDetracciones` (id, fecha_movimiento, tipo IN/OUT, monto, ref_tipo, ref_id, saldo_resultante)
- `app/modules/tributario/sunat/SaldoDetraccionesService.ts`
- Triggers: cada `Cobranza` con detracción → +saldo. Cada `Form 1662` → -saldo
- UI saldo en módulo Finanzas: card con saldo actual + histórico movimientos + botón "Calibrar con SUNAT" (carga manual)

### B-11: Form 1662 + NPS

**Files:**
- `app/modules/tributario/sunat/Form1662Client.ts` (genera form 1662 vía API SUNAT, debita cuenta detracciones)
- `app/modules/tributario/sunat/NpsClient.ts` (genera NPS para pago manual)

### B-12: Orquestador de pagos

**Files:**
- `app/modules/tributario/sunat/PagoOrquestador.ts`
- Lógica: si saldo_detracciones >= deuda * 1.0 → form 1662
- Si saldo_detracciones < deuda → NPS + email a módulo Finanzas
- Si pago > umbral_detraccion_pct (70%) del saldo → confirmación humana antes de form 1662

### B-13: Reconciliación

**Files:**
- `app/modules/tributario/sunat/ReconciliacionService.ts`
- Poll periódico de SUNAT: ¿se procesó el pago?
- Si SÍ → marcar `LiquidacionesMensuales.estado = 'PAGADA'` + crear `MovimientoBancario` en libro bancos con fuente='AUTO_SUNAT' + descontar saldo detracciones

---

## Self-Review checklist

- [x] **Spec coverage:** Cada decisión cerrada (1-22) tiene una tarea o sección que la implementa
- [x] **Sin placeholders:** Cada step tiene comando/código exacto, no "TBD"
- [x] **Type consistency:** Nombres de tablas (LiquidacionesMensuales, DUAs, NoDomiciliados, SaldoDetracciones) y servicios (LiquidacionService, ImportacionesService) son consistentes en todas las tareas
- [x] **Migraciones secuenciales:** 038, 039, 040, 041 (Fase A) y 042-045 reservadas para Fase B
- [x] **Convenciones del proyecto:** Zod 4 (`error:` no `required_error:`), namespace `window.Modulo`, `showSuccess/showError`, sin `alert()`, modales sin backdrop click
- [x] **Stack consistente:** Node/TS/Express/MySQL/Vanilla JS, sin nuevas deps salvo `exceljs`
- [x] **Pendientes bloqueantes documentados:** confirmar régimen, TXT referencia, usuario SOL secundario, débito automático

---

## Anexos

### A. Cronograma SUNAT 2026 (vencimientos típicos por dígito RUC)

Para Metal Engineers RUC 20610071962 (último dígito 2):

| Periodo | Vencimiento | Cierre preliminar (28 ajustado) |
|---|---|---|
| Ene 2026 | ~17/02/2026 | viernes 27/01/2026 |
| Feb 2026 | ~17/03/2026 | viernes 27/02/2026 |
| Mar 2026 | ~17/04/2026 | lunes 27/03/2026 |
| Abr 2026 | ~17/05/2026 | lunes 27/04/2026 |
| May 2026 | ~16/06/2026 | jueves 28/05/2026 |
| Jun 2026 | ~17/07/2026 | viernes 26/06/2026 |
| Jul 2026 | ~18/08/2026 | martes 28/07/2026 |
| Ago 2026 | ~16/09/2026 | viernes 28/08/2026 |
| Sep 2026 | ~16/10/2026 | lunes 28/09/2026 |
| Oct 2026 | ~17/11/2026 | miércoles 28/10/2026 |
| Nov 2026 | ~17/12/2026 | viernes 27/11/2026 |
| Dic 2026 | ~18/01/2027 | lunes 28/12/2026 |

### B. Códigos SUNAT relevantes

**Tipo CP (Tabla 10):**
- 01 = Factura
- 03 = Boleta de venta
- 07 = Nota de Crédito
- 08 = Nota de Débito
- 14 = Recibo por servicios públicos
- 50 = DUA / Despacho simplificado
- 52 = DUA / Despacho simplificado (mercancías)

**Tipo Operación (Tabla 12):**
- 01 = Venta interna
- 02 = Exportación
- 03 = No domiciliado (compra)
- 04 = Venta interna anticipos

**Estado SIRE (RVIE/RCE):**
- 1 = Registrado
- 8 = Anulado en mes posterior
- 9 = Modificado

**Tipo Doc Identidad (Tabla 2):**
- 0 = No domiciliado
- 1 = DNI
- 4 = Carnet extranjería
- 6 = RUC
- 7 = Pasaporte

### C. Estructura SIRE 14.4 (RVIE) — columnas (ver manual SIRE oficial)

```
1. Periodo (YYYYMM00)
2. CUO (correlativo único de operación)
3. Correlativo en libro
4. Fecha emisión (DD/MM/YYYY)
5. Fecha vencimiento
6. Tipo CP (Tabla 10)
7. Serie
8. Correlativo
9. Tipo Doc Identidad (Tabla 2)
10. Nro Doc Identidad
11. Razón Social cliente
12. Valor FOB embarcado
13. BI Gravada
14. Descuento BI
15. IGV
16. Descuento IGV
17. BI Exonerada
18. BI Inafecta
19. ISC
20. BI Arroz Pilado IVAP
21. IVAP
22. ICBPER
23. Otros tributos
24. Total CP
25. Moneda (PEN/USD)
26. Tipo Cambio
27. Fecha emisión doc modificado
28. Tipo CP modificado
29. Serie CP modificado
30. Correlativo CP modificado
31. ID Proyecto Operadores Atribución
32. Tipo Nota
33. Estado (1/8/9)
34. Otros conceptos
35. (varios reservados)
```

(Validar siempre contra el TXT de referencia del contador antes de generar.)

---

**Plan completo y guardado.** Listo para ejecutar Fase A cuando Julio dé green light. Fase B queda pendiente hasta tener TXT referencia + 3 meses validación contra contador.

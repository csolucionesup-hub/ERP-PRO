# Fase B — Facturación Electrónica + Libros PLE: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Metal Engineers deja de emitir facturas en un sistema externo — ahora emite comprobantes electrónicos SUNAT directamente desde ERP-PRO a través de Nubefact, y entrega los libros PLE (Registro de Ventas 14.1, Registro de Compras 8.1) al contador con un solo click.

**Architecture:** Nubefact absorbe la complejidad SUNAT (firma digital + UBL 2.1 + envío + CDR). Nuestro backend le manda JSON con datos del comprobante y recibe estado + enlaces. `NubefactService` ya creado en Fase A (modo STUB hasta recibir certificado + credenciales). Las tablas `Facturas`, `NotasCredito`, `NotasDebito`, `GuiasRemision` guardan histórico con referencias a CDR + XML + PDF. Generadores PLE son transformaciones puras de datos (sin dependencia externa).

**Tech Stack:** extiende el existente — Node/TS/Express 5/MySQL. No nuevas dependencias runtime (Nubefact por HTTP JSON, UBL lo maneja el OSE).

**Parent plan:** [erp-pro-master-plan.md](./2026-04-22-erp-pro-master-plan.md)

**Duration:** 4 semanas (20 días hábiles).

---

## Dependencias y orden

```
Semana 1: DB + FacturaService + rutas          (B1 → B4)
Semana 2: UI emisión desde Cotización          (B5 → B7)
Semana 3: Generadores PLE Ventas + Compras     (B8 → B10)
Semana 4: Módulo Contabilidad UI + Cron estado (B11 → B14)
```

**Criterio de "listo":** emito una factura desde una cotización aprobada → sale con estado SIMULADO (hasta tener cert) → al configurar Nubefact + cert, el mismo flujo envía real a SUNAT sin cambios de código. Libros PLE Ventas y Compras descargables desde `📘 Contabilidad` en formato TXT SUNAT-compliant.

---

## File Structure

### Nuevos archivos

```
app/modules/facturacion/
├── FacturaService.ts              # CRUD facturas + emisión + consulta estado
├── NotaCreditoService.ts          # Emisión de NC
├── NotaDebitoService.ts           # Emisión de ND
├── GuiaRemisionService.ts         # Emisión de guías
├── NubefactPayloadBuilder.ts      # Mapeo datos internos → JSON Nubefact
├── PLEExporter.ts                 # Generadores TXT formato SUNAT
└── (NubefactService.ts ya existe) # Se extiende con modo REAL

app/validators/
└── facturacion.schema.ts          # Zod schemas para emisión

database/migrations/
├── 025_facturas.sql               # Tabla Facturas + FK a Cotizaciones
├── 026_notas_credito_debito.sql   # Tablas NotasCredito y NotasDebito
└── 027_guias_remision.sql         # Tabla GuiasRemision

public/js/pages/
└── Contabilidad.js                # Módulo 📘 Contabilidad con tabs PLE / Estados / Pack

public/js/components/
└── (sin cambios — se reutilizan TabBar, KpiCard)

tests/
├── unit/FacturaService.test.ts
├── unit/NubefactPayloadBuilder.test.ts
└── unit/PLEExporter.test.ts
```

### Archivos modificados

```
index.ts                          # +rutas /api/facturas, /api/notas-credito, /api/guias, /api/ple
public/js/pages/Comercial.js      # +botón "Emitir Factura" en cotización APROBADA
public/js/services/api.js         # +namespaces api.facturas, api.ple
app/modules/facturacion/NubefactService.ts  # habilitar emitir() modo REAL
CLAUDE.md                         # +sección Facturación SUNAT con gotchas
```

---

## Task B1 — Migración 025: tabla Facturas

**Files:** Create `database/migrations/025_facturas.sql`

- [ ] **Step 1: Escribir migración**

```sql
-- 025_facturas.sql — Facturas y Boletas Electrónicas SUNAT
CREATE TABLE IF NOT EXISTS Facturas (
  id_factura            INT PRIMARY KEY AUTO_INCREMENT,
  tipo                  ENUM('FACTURA','BOLETA') NOT NULL,
  serie                 VARCHAR(5) NOT NULL,           -- F001 / B001
  numero                INT NOT NULL,
  fecha_emision         DATE NOT NULL,
  fecha_vencimiento     DATE NULL,

  -- Cliente
  cliente_tipo_doc      ENUM('DNI','CE','RUC','PASAPORTE') NOT NULL,
  cliente_numero_doc    VARCHAR(15) NOT NULL,
  cliente_razon_social  VARCHAR(200) NOT NULL,
  cliente_direccion     VARCHAR(300),
  cliente_email         VARCHAR(150),

  -- Montos
  moneda                ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
  tipo_cambio           DECIMAL(8,4) DEFAULT 1.0000,
  subtotal              DECIMAL(14,2) NOT NULL,       -- base imponible
  descuento_global      DECIMAL(14,2) DEFAULT 0,
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  -- Forma de pago
  forma_pago            ENUM('CONTADO','CREDITO') DEFAULT 'CONTADO',
  dias_credito          INT DEFAULT 0,

  -- Relación con Cotización origen
  id_cotizacion         INT NULL,

  -- Estado SUNAT
  estado_sunat          ENUM('SIMULADO','PENDIENTE','ACEPTADA','RECHAZADA','OBSERVADA','ANULADA','ERROR')
                        NOT NULL DEFAULT 'PENDIENTE',
  codigo_sunat          VARCHAR(20),
  descripcion_sunat     VARCHAR(500),

  -- Enlaces del OSE
  xml_url               VARCHAR(500),
  pdf_url               VARCHAR(500),
  cdr_url               VARCHAR(500),
  cadena_qr             TEXT,

  -- Observaciones
  observaciones         VARCHAR(500),

  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_factura (tipo, serie, numero),
  INDEX idx_facturas_fecha (fecha_emision),
  INDEX idx_facturas_cliente (cliente_numero_doc),
  INDEX idx_facturas_estado (estado_sunat),
  INDEX idx_facturas_cotizacion (id_cotizacion),

  CONSTRAINT fk_facturas_cotizacion FOREIGN KEY (id_cotizacion)
    REFERENCES Cotizaciones(id_cotizacion) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS DetalleFactura (
  id_detalle            INT PRIMARY KEY AUTO_INCREMENT,
  id_factura            INT NOT NULL,
  orden                 INT NOT NULL DEFAULT 1,
  codigo_item           VARCHAR(50),
  descripcion           VARCHAR(500) NOT NULL,
  unidad_sunat          VARCHAR(10) NOT NULL DEFAULT 'NIU',  -- NIU, ZZ, KGM, etc
  cantidad              DECIMAL(14,4) NOT NULL,
  precio_unitario       DECIMAL(14,4) NOT NULL,  -- sin IGV
  subtotal              DECIMAL(14,2) NOT NULL,  -- cantidad * precio
  igv                   DECIMAL(14,2) NOT NULL,
  total                 DECIMAL(14,2) NOT NULL,

  INDEX idx_detalle_factura (id_factura),
  CONSTRAINT fk_detalle_factura FOREIGN KEY (id_factura)
    REFERENCES Facturas(id_factura) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Aplicar** — `npx ts-node database/apply_migrations.ts`

- [ ] **Step 3: Commit**

---

## Task B2 — Migración 026: Notas de Crédito y Débito

**Files:** Create `database/migrations/026_notas_credito_debito.sql`

- [ ] **Step 1: Escribir migración (esquema similar a Facturas + motivo + referencia al doc modificado)**

Estructura: mismas columnas cliente/montos, agrega `motivo_codigo` (01-13 para NC según tabla SUNAT), `id_factura_referencia` (FK) y `tipo_doc_referencia` (FACTURA/BOLETA).

- [ ] **Step 2: Aplicar + commit**

---

## Task B3 — Migración 027: Guías de Remisión

**Files:** Create `database/migrations/027_guias_remision.sql`

- [ ] **Step 1: Tabla con campos: punto de partida/llegada, peso bruto, unidad transporte, motivo traslado, vinculación con Factura**

- [ ] **Step 2: Aplicar + commit**

---

## Task B4 — NubefactPayloadBuilder

**Files:** Create `app/modules/facturacion/NubefactPayloadBuilder.ts`

- [ ] **Step 1: Mapeo interno → formato JSON Nubefact v1**

```typescript
import { Factura, DetalleFactura } from './types';

export class NubefactPayloadBuilder {
  static buildFactura(factura: Factura, detalles: DetalleFactura[]): any {
    return {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: factura.tipo === 'FACTURA' ? 1 : 2,
      serie: factura.serie,
      numero: factura.numero,
      sunat_transaction: 1, // venta interna
      cliente_tipo_de_documento: NubefactPayloadBuilder.mapTipoDoc(factura.cliente_tipo_doc),
      cliente_numero_de_documento: factura.cliente_numero_doc,
      cliente_denominacion: factura.cliente_razon_social,
      cliente_direccion: factura.cliente_direccion || '-',
      cliente_email: factura.cliente_email,
      fecha_de_emision: factura.fecha_emision,
      fecha_de_vencimiento: factura.fecha_vencimiento,
      moneda: factura.moneda === 'PEN' ? 1 : 2,
      tipo_de_cambio: factura.tipo_cambio,
      porcentaje_de_igv: 18.00,
      total_gravada: factura.subtotal,
      total_igv: factura.igv,
      total: factura.total,
      observaciones: factura.observaciones,
      items: detalles.map((d, i) => ({
        unidad_de_medida: d.unidad_sunat,
        codigo: d.codigo_item || `ITEM-${i + 1}`,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        valor_unitario: d.precio_unitario,
        precio_unitario: d.precio_unitario * 1.18,
        tipo_de_igv: 1, // gravado
        total_base_igv: d.subtotal,
        porcentaje_de_igv: 18.00,
        total_igv: d.igv,
        total: d.total,
      })),
    };
  }

  static mapTipoDoc(tipo: string): number {
    return { DNI: 1, CE: 4, RUC: 6, PASAPORTE: 7 }[tipo] ?? 6;
  }
}
```

- [ ] **Step 2: Tests unitarios con fixtures reales**
- [ ] **Step 3: Commit**

---

## Task B5 — FacturaService (emisión + consulta + anulación)

**Files:** Create `app/modules/facturacion/FacturaService.ts`

Operaciones:
- `emitirDesdeCotizacion(id_cotizacion, opts)` — lee cotización APROBADA, mapea a Factura, llama NubefactService, guarda estado + enlaces
- `listar(filtros)` — paginación por fecha/cliente/estado
- `obtener(id)` — ficha completa con detalle
- `consultarEstado(id)` — refresca desde Nubefact (para estados pendientes)
- `anular(id, motivo)` — emite Nota de Crédito tipo 01 (anulación) automática

Respeta: validar `ConfiguracionService.validarPuedeEmitirFactura()` antes de cualquier emisión. Marca auditoría con `auditLog('Factura', 'EMIT')`.

---

## Task B6 — Rutas API facturación

- `POST /api/facturas` — crear factura vacía (no común)
- `POST /api/facturas/emitir-desde-cotizacion/:id_cotizacion` — el flujo estrella
- `GET /api/facturas` — listar con filtros
- `GET /api/facturas/:id` — detalle
- `POST /api/facturas/:id/consultar-estado`
- `POST /api/facturas/:id/anular` (body: motivo)
- `POST /api/notas-credito` / `POST /api/notas-debito`
- `POST /api/guias-remision`

Todas con `requireAuth` + `requireModulo('COMERCIAL')` + `auditLog`.

---

## Task B7 — UI: botón "Emitir Factura" en Comercial.js

Modificar pantalla Comercial → en cada fila de cotización `APROBADA` (y sin factura) mostrar botón **🧾 Emitir Factura** → modal con confirmación (forma pago, días crédito, observaciones) → POST → mostrar resultado con link al PDF.

En cotizaciones ya facturadas, cambiar badge a verde `✅ FACTURADA F001-000123` con link al PDF.

---

## Task B8 — PLE Exporter Registro de Ventas (14.1)

**Files:** Create `app/modules/facturacion/PLEExporter.ts`

Formato oficial SUNAT:
- Nombre archivo: `LE<RUC><PERIODO>140100<IND_OPER><IND_CONTENIDO><IND_MONEDA><IND_OPORTUNIDAD>.txt`
  Ejemplo: `LE206100719622026040014010000111.txt`
- Encoding UTF-8 sin BOM
- Separador: `|`
- Sin cabeceras en el TXT (SUNAT los rechaza)
- 35 campos por línea según estructura SUNAT vigente

Método principal: `exportarRegistroVentas(anio: number, mes: number): Buffer`.

---

## Task B9 — PLE Exporter Registro de Compras (8.1)

Similar a 14.1 pero con 37 campos específicos de Compras, incluyendo:
- Crédito fiscal / no crédito fiscal
- Detracción (% + número)
- Retención aplicada

Usa tabla `Compras` existente + nueva columna `nro_factura_proveedor` si falta.

---

## Task B10 — Módulo 📘 Contabilidad UI

**Files:** Create `public/js/pages/Contabilidad.js`

Tabs: **Libros PLE** / **Estados Financieros** (placeholder hasta Fase D) / **Pack Contable**.

Tab Libros PLE:
- Selector mes (default: mes anterior)
- Botón por libro (Ventas 14.1, Compras 8.1, Caja Bancos 1.1)
- Descarga TXT instantánea
- KPI: "último export realizado"

---

## Task B11 — Registrar módulo Contabilidad

- `app.js` + `PAGES.contabilidad = Contabilidad`
- `Sidebar.js` + entry condicional (solo si `modulo_contabilidad=1` en config)
- Activar módulo por default en configuración (update 020 seed) O que Julio lo active desde Configuración

---

## Task B12 — Cron consulta estado pendientes

Si Nubefact tarda en confirmar (raro pero posible), `PENDIENTE` queda hasta que un cron consulte. Implementar `setInterval` interno cada 15 min que mira `estado_sunat IN ('PENDIENTE','ERROR')` emitidas últimas 24h y refresca.

---

## Task B13 — Migración opcional: Compras.nro_factura_proveedor

Si el PLE Compras lo requiere y falta, agregar columna + backfill desde `observacion`.

---

## Task B14 — NubefactService modo REAL

Reemplazar el `throw new Error('se activa en Fase B')` por el código real:

```typescript
async emitir(params: EmitirParams): Promise<EmitirResult> {
  const real = await this.puedeOperarReal();
  if (!real) return this.stubResponse(params);

  const cfg = await ConfiguracionService.getActual();
  const payload = NubefactPayloadBuilder.buildFactura(params, params.detalles);

  const resp = await fetch(cfg.ose_endpoint_url!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token token="${cfg.ose_token_hash}"`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  return this.mapNubefactResponse(data);
}
```

---

## Criterios de éxito de Fase B

- ✅ Emito una factura desde cotización APROBADA con 1 click
- ✅ En modo STUB: recibe respuesta simulada, se guarda en BD, aparece en lista
- ✅ En modo REAL (con cert + Nubefact): SUNAT la acepta (CDR) y se guardan los 3 enlaces
- ✅ Descargo PLE Ventas del mes → TXT pasa validador PLE SUNAT sin errores
- ✅ Descargo PLE Compras del mes → idem
- ✅ Cotización facturada muestra badge "FACTURADA F001-NNN" con link
- ✅ Intentar re-facturar la misma cotización devuelve error claro
- ✅ Anular factura genera Nota de Crédito tipo 01 automática

---

## Checkpoint al final de Fase B

> **Hito legal.** Primera factura real emitida desde ERP-PRO. Metal Engineers da de baja el sistema externo de facturación. Al contador se le entrega el PLE Ventas del mes y confirma formato correcto.

## Execution Handoff

Iniciar ejecución con `superpowers:subagent-driven-development` — 14 tasks distribuibles en ~5-7 subagentes paralelos (B1/B2/B3 en paralelo; B4/B5/B6 en cadena; B7/B10/B11 en paralelo; B8/B9 en paralelo; B14 al final).

**En esta sesión se ejecutarán las tasks B1-B6 (base de datos + services + rutas backend).** UI + PLE en la siguiente sesión.

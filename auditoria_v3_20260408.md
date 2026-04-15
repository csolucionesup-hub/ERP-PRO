# Auditoría Técnica V3 — ERP-PRO
**Fecha:** 08/04/2026  
**Estado del proyecto:** Post-Auditoría V2, Auth JWT implementado, Sidebar dinámico, Módulos placeholder V2  
**Auditor:** Claude Sonnet 4.6 (análisis estático completo)

---

## Resumen Ejecutivo

| Categoría | ALTO | MEDIO | BAJO | Total |
|-----------|------|-------|------|-------|
| Backend (A) | 1 | 4 | 1 | 6 |
| Base de Datos (B) | 0 | 2 | 4 | 6 |
| Frontend (F) | 0 | 4 | 2 | 6 |
| V2 Pendiente (V) | 3 | 0 | 0 | 3 |
| **TOTAL** | **4** | **10** | **7** | **21** |

---

## A — Backend / API

### A01 · ALTO · SQL lógica en `index.ts` (rutas inline)

**Descripción:** Cuatro rutas en `index.ts` ejecutan SQL directamente en el handler, sin pasar por ningún Service. Viola el principio de separación de capas.

**Afectados:**
- `GET /api/servicios/activos` — SELECT inline para autocomplete de servicios
- `POST /api/admin/reset-db` — DROP/CREATE TABLE directo en ruta
- `POST /api/saldo-inicial` — INSERT en Transacciones sin validación
- `POST /api/detracciones/:id/deposito` — UPDATE Detracciones + SELECT inline

**Riesgo:** Lógica de negocio no testeada, duplicación futura, difícil auditar reglas.

**Corrección sugerida:**
```typescript
// Mover a FinanceService / CatalogService:
async getServiciosActivos(): Promise<{id_servicio, nombre, cliente}[]>
async marcarDetraccionDepositada(id: number): Promise<void>
```

---

### A02 · MEDIO · Rutas POST sin `validateParams` en id de ruta

**Descripción:** Las rutas de anulación y acciones sobre recursos no validan que `req.params.id` sea un entero positivo antes de pasarlo al Service.

**Afectadas:**
- `POST /api/servicios/:id/anular`
- `POST /api/servicios/:id/cobrar`
- `POST /api/servicios/:id/terminar`
- `POST /api/compras/:id/anular`
- `POST /api/gastos/:id/anular`
- `POST /api/prestamos/tomados/:id/anular`

**Riesgo:** Strings no numéricos llegan a `parseInt()` produciendo `NaN`, que luego genera queries SQL con `WHERE id = NaN` (retorna 0 filas → "no encontrado" en vez de 400).

**Corrección sugerida:**
```typescript
// Middleware reutilizable
function validateIdParam(req, res, next) {
  const id = parseInt(req.params.id as string);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  req.parsedId = id;
  next();
}
```

---

### A03 · MEDIO · `deleteServicio` sin validación de estado

**Descripción:** `DELETE /api/servicios/:id` llama `CatalogService.deleteServicio()` que elimina físicamente el registro sin verificar si está `COBRADO` o `PARCIAL`. Un servicio con cobros reales puede eliminarse borrando historial financiero.

**Riesgo:** Pérdida de datos financieros, inconsistencia de caja.

**Corrección sugerida:**
```typescript
// En deleteServicio(), antes de DELETE:
if (['COBRADO', 'PARCIAL'].includes(srv.estado)) {
  throw new Error('No se puede eliminar un servicio con cobros registrados. Use ANULAR.');
}
```

---

### A04 · MEDIO · `deleteItem` no verifica uso en `CostosServicio`

**Descripción:** `DELETE /api/inventario/:id` elimina el ítem del catálogo sin verificar si está referenciado en `CostosServicio` (insumos consumidos en servicios activos).

**Riesgo:** Rompe historial de costos de servicio; la FK solo existe en `DetalleCompra` (migración 003).

**Corrección sugerida:**
```typescript
const [costos] = await conn.query(
  'SELECT COUNT(*) as n FROM CostosServicio WHERE id_item = ?', [id]
);
if ((costos as any)[0].n > 0) throw new Error('Item tiene costos registrados en servicios.');
```

---

### A05 · BAJO · Mensaje de error `DELETE /compras/:id` poco descriptivo

**Descripción:** La ruta devuelve HTTP 405 con `{ error: 'Método no permitido. Usa POST /compras/:id/anular' }`. El mensaje es correcto pero podría incluir la URL exacta con el id.

**Corrección sugerida:**
```typescript
res.status(405).json({ 
  error: `Operación no permitida. Para anular use: POST /api/compras/${req.params.id}/anular` 
});
```

---

### A06 · MEDIO · `requireModulo` no aplicado por módulo en router

**Descripción:** El middleware `requireModulo(modulo)` existe en `auth.ts` pero no está aplicado a ninguna ruta en `index.ts`. Cualquier usuario autenticado (cualquier rol) puede acceder a rutas de cualquier módulo.

**Ejemplo:** Un usuario con módulo `ALMACEN` puede hacer `POST /api/gastos` (módulo LOGISTICA).

**Corrección sugerida:**
```typescript
// Agregar en index.ts por grupo de rutas:
app.use('/api/servicios', requireAuth, requireModulo('FINANZAS'));
app.use('/api/gastos', requireAuth, requireModulo('LOGISTICA'));
app.use('/api/compras', requireAuth, requireModulo('LOGISTICA'));
app.use('/api/inventario', requireAuth, requireModulo('ALMACEN'));
// GERENCIA accede a todo (requireModulo ya lo permite)
```

---

## B — Base de Datos

### B01 · MEDIO · Índices faltantes en columnas de filtro frecuente

**Descripción:** Las siguientes columnas aparecen en WHERE/ORDER BY pero no tienen índice:

| Tabla | Columna | Uso |
|-------|---------|-----|
| Servicios | `cliente` | Filtro por cliente frecuente |
| Servicios | `fecha_vencimiento` | ORDER BY y alerta VENCIDO |
| Compras | `estado_pago` | WHERE estado_pago = 'PENDIENTE' |
| Gastos | `fecha_gasto` | ORDER BY en listados |
| Transacciones | `fecha` | Rangos de fecha en flujo de caja |

**Script de corrección:**
```sql
CREATE INDEX idx_servicios_cliente ON Servicios(cliente);
CREATE INDEX idx_servicios_vencimiento ON Servicios(fecha_vencimiento);
CREATE INDEX idx_compras_estado_pago ON Compras(estado_pago);
CREATE INDEX idx_gastos_fecha ON Gastos(fecha_gasto);
CREATE INDEX idx_transacciones_fecha ON Transacciones(fecha);
```

---

### B02 · MEDIO · FK `DetalleCompra → Inventario` (verificar aplicación)

**Descripción:** La migración `003_fk_triggers_fix.sql` agrega `fk_detalle_item`. Verificar que esté aplicada en producción antes del siguiente deploy.

**Estado:** Migración creada; pendiente de verificar en BD de Railway.

**Verificación:**
```sql
SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_NAME='DetalleCompra' AND REFERENCED_TABLE_NAME='Inventario';
```

---

### B03 · BAJO · Campos V2 pendientes en esquema de BD

**Descripción:** La arquitectura V2 requiere campos que aún no existen en BD:

| Campo | Tabla | Módulo |
|-------|-------|--------|
| `centro_costo` | Gastos, Compras | Logística |
| `tipo_gasto_logistica` | Gastos | Logística (GENERAL/SERVICIO/ALMACEN) |
| `cuenta_banco_1`, `cuenta_banco_2` | Proveedores | Finanzas/Logística |
| `tipo_proveedor` | Proveedores | ENUM('EMPRESA','PERSONA_NATURAL') |
| `dni` | Proveedores | Persona natural sin RUC |

**Acción:** Crear migración `004_v2_campos.sql` antes de implementar módulos Logística y Finanzas.

---

### B04 · BAJO · Inconsistencia de ENUM entre tablas

**Descripción:** El valor de anulación difiere entre tablas:
- `Compras.estado` usa `'ANULADA'` (femenino)
- `Gastos.estado` usa `'ANULADO'` (masculino)
- `Transacciones.estado` usa `'ANULADO'`

**Riesgo:** Queries genéricas de auditoría que filtren `estado = 'ANULADO'` omiten Compras.

**Acción:** Documentar explícitamente en CLAUDE.md (ya registrado en Gotchas). Opcional: normalizar a `'ANULADO'` con migración ALTER TABLE.

---

### B05 · BAJO · Triggers `chk_transacciones_referencia` — verificar estado

**Descripción:** Los triggers fueron creados via node en sesión anterior. Confirmar que están activos en la BD de desarrollo y que se incluyen en el deploy a Railway.

**Verificación:**
```sql
SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE 
FROM information_schema.TRIGGERS 
WHERE TRIGGER_SCHEMA = 'erp_pro';
```

**Acción:** Incluir `003b_triggers_prestamo.sql` en el runbook de deploy de Railway.

---

### B06 · BAJO · `uk_sku` en Inventario — confirmar unicidad real

**Descripción:** El índice `uk_sku` impone `UNIQUE` en `Inventario.sku`. Sin embargo, si el workflow de "Compra Almacén" crea ítems por descripción (sin código SKU previo), podrían existir filas con `sku = NULL` que MySQL permite duplicar en UNIQUE.

**Verificación:**
```sql
SELECT sku, COUNT(*) FROM Inventario GROUP BY sku HAVING COUNT(*) > 1;
```

---

## F — Frontend

### F01 · MEDIO · `fetch` directo en `Finanzas.js` (bypasa `api.js`)

**Descripción:** El archivo `public/js/pages/Finanzas.js` (y posiblemente `Compras.js`, `Inventario.js`) contiene llamadas `fetch('/api/...')` directas sin usar `api.js`. Esto bypasa:
- Inyección automática del Bearer token
- Auto-logout en 401
- Manejo centralizado de errores

**Riesgo:** Si el usuario no está autenticado, la petición falla con 401 pero el usuario no es redirigido al login.

**Corrección:** Reemplazar todos los `fetch(` por `api.get(`, `api.post(`, etc. en cada página.

---

### F02 · MEDIO · Patrones de error inconsistentes entre páginas

**Descripción:** Algunas páginas muestran `alert(err.message)`, otras usan `console.error`, otras muestran un div de error en el DOM. No hay patrón unificado.

**Corrección sugerida:** Centralizar en `api.js` o en una función `showError(msg)` en un módulo `ui.js`:
```javascript
export function showToast(msg, type = 'error') {
  // Muestra un toast/notificación temporal
}
```

---

### F03 · BAJO · Funciones globales `window.*` sin namespace

**Descripción:** Todas las páginas exponen handlers como `window.editarServicio`, `window.cobrarServicio`, `window.eliminarProveedor`, etc. Con múltiples páginas cargadas en historia, puede haber colisión de nombres.

**Riesgo:** Bajo actualmente (SPA navega entre páginas, no las apila). Aumenta con refactors.

**Corrección sugerida:** Namespace por módulo: `window.Servicios = { editar, cobrar, anular }`.

---

### F04 · MEDIO · Falta `response.ok` check en algunos `fetch` de páginas legacy

**Descripción:** Páginas escritas antes de `api.js` hacen `const data = await res.json()` sin verificar `res.ok`. Si el servidor devuelve un 400/500 con JSON de error, el código continúa como si fuera éxito.

**Corrección:**
```javascript
const res = await fetch(...);
if (!res.ok) {
  const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
  throw new Error(err.error || 'Error del servidor');
}
```

---

### F05 · BAJO · `navigate()` sin verificar existencia de página

**Descripción:** En `app.js`, la función `navigate(page)` busca en el objeto `PAGES` pero si la página no existe muestra un HTML de "no encontrado" inline. No hay ruta 404 limpia ni redirección al inicio.

**Corrección:** Redirigir a página de inicio si `page` no existe en `PAGES`:
```javascript
if (!PAGES[page]) {
  navigate(getPaginaInicio(currentUser));
  return;
}
```

---

### F06 · MEDIO · `fetchAPI` no maneja respuestas no-JSON

**Descripción:** En `api.js`, `fetchAPI` siempre hace `res.json()`. Si el servidor devuelve un error 502/503 de Railway (HTML), el `JSON.parse` falla con un error críptico.

**Corrección:**
```javascript
const contentType = res.headers.get('content-type') || '';
if (!contentType.includes('application/json')) {
  throw new Error(`Error del servidor: ${res.status} ${res.statusText}`);
}
return res.json();
```

---

## V — Módulos V2 Pendientes (Deuda Técnica)

### V01 · ALTO · Módulo Comercial — tabla `Cotizaciones` no existe

**Descripción:** El módulo Comercial (placeholder) requiere una tabla `Cotizaciones` con toda la estructura definida en CLAUDE.md. Sin esta tabla, el módulo no puede implementarse.

**Esquema requerido (mínimo):**
```sql
CREATE TABLE Cotizaciones (
  id_cotizacion INT AUTO_INCREMENT PRIMARY KEY,
  nro_cotizacion VARCHAR(30) NOT NULL UNIQUE,  -- COT YYYY-NNN-MN
  fecha DATE NOT NULL,
  cliente VARCHAR(150) NOT NULL,
  atencion VARCHAR(100),
  telefono VARCHAR(30),
  correo VARCHAR(100),
  proyecto VARCHAR(200),
  estado ENUM('EN_PROCESO','ENVIADA','APROBADA','NO_APROBADA',
              'RECHAZADA','TERMINADA','A_ESPERA_RESPUESTA') DEFAULT 'EN_PROCESO',
  estado_trabajo ENUM('NO_INICIADO','EN_EJECUCION','TERMINADO','TERMINADO_CON_DEUDA') DEFAULT 'NO_INICIADO',
  moneda ENUM('PEN','USD') DEFAULT 'PEN',
  tipo_cambio DECIMAL(10,4) DEFAULT 1,
  subtotal DECIMAL(14,2) DEFAULT 0,
  igv DECIMAL(14,2) DEFAULT 0,
  total DECIMAL(14,2) DEFAULT 0,
  adelanto_recibido DECIMAL(14,2) DEFAULT 0,
  forma_pago VARCHAR(100),
  validez_oferta VARCHAR(50),
  plazo_entrega VARCHAR(100),
  lugar_entrega VARCHAR(200),
  nro_oc_cliente VARCHAR(50),
  nro_factura VARCHAR(50),
  comentarios TEXT,
  id_servicio INT NULL,  -- FK a Servicios cuando se aprueba
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
);

CREATE TABLE DetalleCotizacion (
  id_detalle INT AUTO_INCREMENT PRIMARY KEY,
  id_cotizacion INT NOT NULL,
  descripcion TEXT NOT NULL,
  unidad VARCHAR(30),
  cantidad DECIMAL(10,3) DEFAULT 1,
  precio_unitario DECIMAL(14,4) DEFAULT 0,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  FOREIGN KEY (id_cotizacion) REFERENCES Cotizaciones(id_cotizacion) ON DELETE CASCADE
);
```

---

### V02 · ALTO · Módulo Logística — campos `centro_costo` y `tipo_gasto_logistica` no existen

**Descripción:** El módulo Logística requiere dos campos críticos que no están en el esquema actual:

1. `centro_costo` en `Gastos` y `Compras` — texto libre (ej: "OFICINA CENTRAL", "Proyecto XYZ", "ALMACEN METAL")
2. `tipo_gasto_logistica` en `Gastos` — ENUM('GENERAL','SERVICIO','ALMACEN') para los 3 tipos de órdenes

**Migración requerida:**
```sql
ALTER TABLE Gastos 
  ADD COLUMN centro_costo VARCHAR(100) NULL,
  ADD COLUMN tipo_gasto_logistica ENUM('GENERAL','SERVICIO','ALMACEN') NULL;

ALTER TABLE Compras
  ADD COLUMN centro_costo VARCHAR(100) NULL;
```

---

### V03 · ALTO · Módulo Administración — sin servicio `getGastoPersonal`

**Descripción:** El módulo Administración debe consolidar gastos de personal desde:
- Logística Tipo 1 (Gastos Generales = personal oficina): `centro_costo = 'OFICINA CENTRAL'`
- Logística Tipo 2 (Gastos Servicio = personal proyecto): `centro_costo = nombre_proyecto`

Sin `centro_costo` en BD (V02) y sin el servicio consolidador, el módulo no puede operar.

**Servicio requerido:**
```typescript
async getGastoPersonal(anio: number, mes?: number): Promise<{
  centro_costo: string,
  tipo: 'OFICINA' | 'PROYECTO',
  total_gasto: number,
  detalle: Array<{proveedor, descripcion, monto, fecha}>
}[]>
```

---

## Plan de Acción Priorizado

### Sprint inmediato (sesión siguiente)
1. **F01** — Unificar fetch en páginas legacy a `api.js` (1-2h)
2. **F06** — Fix fetchAPI para respuestas no-JSON (15min)
3. **A02** — Middleware `validateIdParam` y aplicarlo (30min)
4. **A06** — Aplicar `requireModulo` por grupo de rutas (30min)

### Sprint V2 — Módulo Comercial
1. **V01** — Crear migración `004_cotizaciones.sql`
2. Implementar `CotizacionService.ts`
3. Implementar rutas `/api/cotizaciones`
4. Implementar UI `Comercial.js` (tabla + formulario + PDF)

### Sprint V2 — Módulo Logística
1. **V02** — Crear migración `005_logistica_campos.sql`
2. Extender `FinanceService` / `PurchaseService` con centro_costo
3. Implementar UI `Logistica.js` (3 tipos de orden)

### Backlog
- **A01** — Mover SQL inline de index.ts a Services
- **A03** — Validación estado en deleteServicio
- **A04** — Check CostosServicio en deleteItem
- **B01** — Crear índices de optimización
- **V03** — getGastoPersonal + Administracion.js

---

## Estado de Auditorías Anteriores

| Auditoría | Hallazgos | Resueltos | Pendientes |
|-----------|-----------|-----------|------------|
| V1 (mar 2026) | 5 | 5 | 0 |
| V2 (06/04/2026) | 27 | 22 | 5 → resueltos en sesión 08/04 |
| **V3 (08/04/2026)** | **21** | **0** | **21 nuevos** |

> Los 5 pendientes de V2 (#19 índice Servicios.estado, #20 FK DetalleCompra, #21 triggers PRESTAMO, #22 id_cuenta hardcodeado) fueron todos resueltos en la sesión 08/04/2026.

---

*Generado por análisis estático completo del repositorio ERP-PRO — rama `main` — commit `933d8f7`*

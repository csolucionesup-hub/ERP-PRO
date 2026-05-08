# Rediseño Kanban de Logística — Órdenes de Compra

**Fecha:** 2026-05-06
**Autor:** Brainstorm con Julio (Gerente Metal Engineers)
**Módulo:** Logística → Órdenes de Compra
**Estado:** Diseño aprobado — pendiente plan de implementación

---

## 1. Contexto y motivación

El kanban actual de OC tiene 9 columnas: `BORRADOR | APROBADA | ENVIADA | RECIBIDA_PARCIAL | RECIBIDA | FACTURADA | PAGADA_PEND_FACTURA | PAGADA | CERRADA_SIN_FACTURA`. En la operación real:

- La columna **ENVIADA** está vacía (0 cards en el snapshot del 06/05/2026). El equipo no usa ese paso intermedio.
- El flujo lineal `RECIBIDA → FACTURADA → PAGADA` no refleja la realidad peruana: muchos proveedores **exigen el pago antes** de despachar mercadería. Eso ya se parchó parcialmente con `PAGADA_PEND_FACTURA` (mig 061), pero el kanban sigue forzando la lectura lineal.
- No hay representación visual del **crédito a proveedor** ni de los **saldos pendientes** cuando un pago es parcial.
- Las alertas operativas (deudas vencidas, sin factura, sin recibir) viven solo en Logística cuando varias afectan la visión gerencial (caja, riesgo).

**Objetivo:** simplificar el kanban a las fases que el equipo realmente trabaja, agregar visibilidad de los 3 ejes independientes (pago, recepción, factura) sin inflar columnas, y cascadear las alertas críticas al dashboard de Gerencia con auto-resolución.

---

## 2. State machine nuevo

```
BORRADOR → APROBADA → PAGO ─┬─ pago total ─┐
                            ├─ pago parcial ┼─> RECEPCIÓN ──┬─ recibido + pago al día → FACTURACIÓN ─┬─ factura registrada → TERMINADA
                            └─ crédito ─────┘               ├─ recibido + saldo pdte (BLOQUEADA)     └─ cerrar manual → CERRADA SIN FACTURA
                                                            └─ cerrar manual → CERRADA SIN FACTURA
```

**Estados terminales:** `TERMINADA`, `CERRADA_SIN_FACTURA`, `ANULADA`.

**Reglas duras:**

1. **Salir de PAGO** tiene 3 caminos, todos avanzan a RECEPCIÓN inmediatamente:
   - Pago total (estado_pago=PAGADO, monto_pagado = total).
   - Pago parcial (estado_pago=PARCIAL, monto_pagado < total).
   - Crédito (forma_pago=CREDITO, fecha_credito_vence requerida).

   Esto significa que la columna **PAGO** solo hospeda cards "sin ninguna acción de pago aún" (dot 🔴 siempre). Apenas Finanzas registra cualquier pago o marca crédito → la card se va a RECEPCIÓN. PAGO funciona como bandeja de entrada de Finanzas.

2. **En RECEPCIÓN**, cada card muestra badges de problemas heredados:
   - `⚠ Saldo S/ XXX pdte` cuando estado_pago=PARCIAL.
   - `⚠ Crédito vence DD/MM` cuando forma_pago=CREDITO y estado_pago≠PAGADO.

3. **Para pasar de RECEPCIÓN a FACTURACIÓN** se requiere:
   - Recepción al 100% (todas las líneas con `cantidad_recibida = cantidad`).
   - Pago al 100% (estado_pago=PAGADO).
   - Si recepción está al 100% pero pago no, la card **se queda bloqueada** en RECEPCIÓN con el badge correspondiente.

4. **Salida manual a CERRADA_SIN_FACTURA** desde RECEPCIÓN o FACTURACIÓN:
   - Requiere confirmación con texto explicativo (motivo).
   - Solo GERENTE o usuario con permiso explícito.
   - Reusa la lógica existente de `cerrarSinFactura()` (mig 054).

5. **En FACTURACIÓN** se registra el comprobante del proveedor:
   - Subir PDF/imagen a Cloudinary (mismo patrón que fotos de cotización).
   - Registrar nro de comprobante, fecha emisión, monto.
   - Cuando todos los semáforos están 🟢 → la card pasa **automáticamente** a TERMINADA.

---

## 3. Modelo de datos

### 3.1 Cambios en `OrdenesCompra`

Campos ya existentes que se reutilizan tal cual:
- `estado_pago` ENUM('PENDIENTE','PARCIAL','PAGADO','ANULADO') — sin cambios.
- `forma_pago` ENUM('CONTADO','CREDITO') — sin cambios. La marca de crédito setea este campo, no el `estado_pago`.
- `dias_credito` INT — ya existe.
- `monto_pagado` DECIMAL(12,2) — ya existe.
- `pagada_at`, `facturada_at` TIMESTAMP NULL — ya existen (mig 061).
- `es_honorario` BOOLEAN — ya existe (mig 058), respetado por el rediseño.

Campos nuevos:
- `fecha_credito_vence` DATE NULL — poblada cuando `forma_pago='CREDITO'`. Si ya hay `dias_credito`, se calcula al aprobar/marcar crédito.
- `estado_factura` ENUM('PENDIENTE','FACTURADA','SIN_FACTURA') NOT NULL DEFAULT 'PENDIENTE'.

ENUM `estado` reescrito para reflejar el state machine nuevo:
```
'BORRADOR' | 'APROBADA' | 'PAGO' | 'RECEPCION' | 'FACTURACION' | 'TERMINADA' | 'CERRADA_SIN_FACTURA' | 'ANULADA'
```

Los valores viejos (`ENVIADA`, `RECIBIDA_PARCIAL`, `RECIBIDA`, `FACTURADA`, `PAGADA_PEND_FACTURA`, `PAGADA`) se eliminan del CHECK constraint en la misma migración.

### 3.2 Tablas nuevas

**`OrdenCompraHistorial`** — log de transiciones de estado.
```sql
CREATE TABLE OrdenCompraHistorial (
  id_historial      SERIAL PRIMARY KEY,
  id_oc             INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  estado_anterior   VARCHAR(30),
  estado_nuevo      VARCHAR(30) NOT NULL,
  id_usuario        INT REFERENCES Usuarios(id_usuario),
  fecha             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  comentario        VARCHAR(500)
);
CREATE INDEX idx_historial_oc ON OrdenCompraHistorial(id_oc);
CREATE INDEX idx_historial_fecha ON OrdenCompraHistorial(fecha DESC);
```

**`OrdenCompraNota`** — comentarios libres por OC.
```sql
CREATE TABLE OrdenCompraNota (
  id_nota           SERIAL PRIMARY KEY,
  id_oc             INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  id_usuario        INT REFERENCES Usuarios(id_usuario),
  fecha             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  texto             TEXT NOT NULL
);
CREATE INDEX idx_nota_oc ON OrdenCompraNota(id_oc, fecha DESC);
```

**`OrdenCompraFactura`** — facturas del proveedor subidas a una OC.
```sql
CREATE TABLE OrdenCompraFactura (
  id_factura_oc     SERIAL PRIMARY KEY,
  id_oc             INT NOT NULL REFERENCES OrdenesCompra(id_oc) ON DELETE CASCADE,
  nro_comprobante   VARCHAR(30) NOT NULL,
  fecha_emision     DATE NOT NULL,
  monto             DECIMAL(14,2) NOT NULL,
  url_pdf           VARCHAR(500),
  cloudinary_id     VARCHAR(200),
  id_usuario_sube   INT REFERENCES Usuarios(id_usuario),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_factura_oc ON OrdenCompraFactura(id_oc);
```

V1: 1 factura por OC (constraint UNIQUE en `id_oc`). V2 puede levantar el constraint si aparece el caso multi-factura.

### 3.3 Estado de recepción — calculado, no almacenado

`estado_recepcion` se deriva en runtime de `DetalleOrdenCompra`:
- `NO_RECIBIDO`: ninguna línea con cantidad_recibida > 0.
- `PARCIAL`: alguna línea con cantidad_recibida > 0 pero no todas completas.
- `RECIBIDO`: todas las líneas con cantidad_recibida = cantidad.

Una vista SQL `vw_oc_estado_recepcion` o cálculo en el Service evita desnormalizar.

### 3.4 Migración de las OCs existentes

37 OCs existentes en BD al 06/05/2026. Mapeo automático en la migration:

| Estado actual          | Estado nuevo            | estado_pago        | estado_factura |
|-----------------------|-------------------------|--------------------|----------------|
| BORRADOR              | BORRADOR                | (sin cambio)       | PENDIENTE      |
| APROBADA              | APROBADA                | (sin cambio)       | PENDIENTE      |
| ENVIADA               | APROBADA                | NO_PAGADO          | PENDIENTE      |
| RECIBIDA_PARCIAL      | RECEPCION               | (lee de Compras)   | PENDIENTE      |
| RECIBIDA              | RECEPCION               | (lee de Compras)   | PENDIENTE      |
| FACTURADA             | FACTURACION             | (lee de Compras)   | FACTURADA      |
| PAGADA_PEND_FACTURA   | FACTURACION             | PAGADO             | PENDIENTE      |
| PAGADA                | TERMINADA               | PAGADO             | FACTURADA      |
| CERRADA_SIN_FACTURA   | CERRADA_SIN_FACTURA     | PAGADO             | SIN_FACTURA    |
| ANULADA               | ANULADA                 | (sin cambio)       | (sin cambio)   |

La migration también:
- Crea registros sintéticos en `OrdenCompraHistorial` con `estado_anterior=NULL, estado_nuevo=<estado_actual>, fecha=created_at` para no perder el origen.
- Backfilea `estado_factura` = FACTURADA donde `id_compra_generada IS NOT NULL`.

---

## 4. UX del kanban

### 4.1 Layout

```
┌─ Filtros ──────────────────────────────────────────────────────────────┐
│ Centro de costo: [▼ Todos]   Mes/Año: [▼ 2026-05]   [□ Solo problemas] │
├────────────────────────────────────────────────────────────────────────┤
│ Borrador  │ Aprobada │ Pago     │ Recepción │ Facturación │ Terminada  │
│ (sticky)  │ (sticky) │ (sticky) │ (sticky)  │ (sticky)    │ (sticky)   │
│           │          │          │           │             │            │
│ [card]    │ [card]   │ [card]   │ [card]    │ [card]      │ [card]     │
│ ...       │ ...      │ ...      │ ...       │ ...         │ ...        │
│ ↕ scroll  │          │          │           │             │            │
└────────────────────────────────────────────────────────────────────────┘
                       Cerrada sin factura: [N] (toggle para mostrar)
```

- **Filtros arriba:** centro de costo (dropdown), mes/año (dropdown, default mes actual), checkbox "solo problemas" (filtra cards con badges).
- **7 columnas activas + 1 colapsable** (Cerrada Sin Factura, Anulada).
- **Headers fijos** dentro de cada columna al hacer scroll (`position: sticky; top: 0`).
- **Contenedor con `max-height: calc(100vh - HEADER)`** y `overflow-y: auto` por columna. El kanban completo no excede la pantalla.
- **Sin drag&drop entre columnas** (avance es por acción explícita, no por arrastre).

### 4.2 Diseño del card

```
┌─────────────────────────────┐
│ ● 002 - 2026          [ME]  │   ← dot grande = fase actual (🔴/🟠/🟢)
│ MANUEL ENRIQUE HUARANGA     │
│ 2026-05-02       S/ 350.00  │
│ ⚠ Saldo S/ 200 pdte         │   ← badge si arrastra problema heredado
└─────────────────────────────┘
```

**Dot principal por columna:**
- **APROBADA:** ⚪ neutro (sin estado pendiente — esperando primera acción).
- **PAGO:** 🔴 sin pagar (siempre — apenas hay acción de pago/crédito la card sale a RECEPCIÓN).
- **RECEPCIÓN:** 🔴 sin recibir | 🟠 parcial | 🟢 total recibido.
- **FACTURACIÓN:** 🔴 sin factura | 🟢 con factura.
- **TERMINADA:** 🟢 (todo cerrado).

**Badges de texto** (debajo del proveedor, color rojo, font-size pequeño):
- `⚠ Saldo S/ XXX pdte` — pago parcial.
- `⚠ Crédito vence DD/MM` — modo crédito.
- `⚠ Sin recibir hace XX días` — alerta de demora.
- `⚠ Sin factura hace XX días` — alerta de demora.

Click en card → abre detalle/modal con todas las acciones.

### 4.3 Acciones rápidas en card (sin abrir detalle)

Botones contextuales según fase, en hover o ícono fijo:

| Fase actual    | Acciones disponibles                                                                |
|---------------|-------------------------------------------------------------------------------------|
| BORRADOR      | ✓ Aprobar · ✎ Editar · 🚫 Anular                                                    |
| APROBADA      | 💰 Registrar pago · 💳 Marcar crédito · 🚫 Anular (transient — auto-avanza a PAGO) |
| PAGO          | 💰 Registrar pago · 💳 Marcar crédito · 📝 Nota · 🚫 Anular                         |
| RECEPCIÓN     | 📦 Marcar recibido · 💰 Pagar saldo · 📝 Nota · 🚫 Cerrar sin factura               |
| FACTURACIÓN   | 📄 Subir factura · 💰 Pagar saldo (si falta) · 📝 Nota · 🚫 Cerrar sin factura      |
| TERMINADA     | 📝 Nota · 👁 Ver detalle (read-only)                                                |

Cada acción dispara el endpoint correspondiente y refresca el kanban.

---

## 5. Sistema de alertas con cascada a Gerencia

### 5.1 Principio de diseño

> Las alertas se calculan **on-demand** desde el estado actual de la BD. No se persiste un flag "resuelta". Cuando la condición que generó la alerta deja de cumplirse (Logística cambia el estado), la alerta **desaparece sola** en la próxima carga.

Esto reusa el patrón ya implementado en `AlertasService.ts` (CAJA_BAJA y demás).

### 5.2 Alertas nuevas a implementar

Todas con umbral **15 días** (constante única, fácil de ajustar después).

| Tipo (alerta)               | Condición                                                                       | Severidad | Aparece en             |
|----------------------------|----------------------------------------------------------------------------------|-----------|-----------------------|
| OC_DEUDA_PROVEEDOR         | estado_pago IN (PENDIENTE, PARCIAL) AND created_at < NOW()-15d AND estado NOT IN (BORRADOR, ANULADA, TERMINADA) | danger    | Logística + Gerencia  |
| OC_PAGO_SIN_RECEPCION      | estado_pago=PAGADO AND estado_recepcion ≠ RECIBIDO AND pagada_at < NOW()-15d   | danger    | Logística + Gerencia  |
| OC_CREDITO_POR_VENCER      | forma_pago=CREDITO AND estado_pago ≠ PAGADO AND fecha_credito_vence ≤ NOW()+15d | warn      | Logística + Gerencia  |
| OC_SIN_FACTURA_PROVEEDOR   | estado=FACTURACION AND estado_factura=PENDIENTE AND updated_at < NOW()-15d     | warn      | Logística + Gerencia  |
| OC_CERRADAS_SIN_FACT_MES   | COUNT estado=CERRADA_SIN_FACTURA en mes actual                                 | info      | Gerencia              |

**Click en alerta** → navega al kanban de Logística con filtro pre-aplicado de la condición.

### 5.3 Cascada al dashboard del Gerente

`AlertasService.listar(modulosUsuario, rol)` ya retorna **todas** las alertas para `rol==='GERENTE'` y filtra por módulo para usuarios normales. Las nuevas alertas siguen esa convención sin trabajo extra.

El dashboard de Gerencia (`Dashboard.js` / módulo GERENCIA) ya consume `AlertasService` — solo necesita renderizar los nuevos tipos.

---

## 6. Listado completo

Sin cambios estructurales. Sigue mostrando **todas** las OCs sin importar estado, mes ni centro de costo. Filtros existentes + **export a Excel** (movido de V2 a V1, es chico y sirve para auditoría).

**Regla invariante (ya se cumple):** ningún flujo borra OCs. Anular = cambio de estado, no DELETE. Las facturas subidas y los PDFs de OC tampoco se borran.

---

## 7. Fuera de alcance V1 (V2)

Documentado para no perder de vista pero NO entra a esta iteración:

- Vista calendario de créditos y vencimientos (cronograma mensual).
- Vinculación bidireccional OC ↔ Cotización (navegar de una a la otra desde la UI).
- Notificaciones por email/WhatsApp (parte de Fase F del plan maestro).
- OCR automático de facturas subidas.
- Multi-factura por OC (esperar caso real).
- Rediseño del flujo de **honorarios** (sigue funcionando vía CERRADA_SIN_FACTURA actual).
- Drag&drop entre columnas (intencionalmente fuera).

---

## 8. Riesgos y consideraciones

1. **Migración de 37 OCs en BD productiva** — el mapeo es determinista, pero conviene correr la migración con backup previo (`npm run db:backup` ya configurado, plan A respaldos).

2. **Dependencias hacia atrás** — `OrdenCompraService.recibir()`, `facturar()`, `registrarPago()` y similares hoy esperan los estados viejos (`RECIBIDA`, `FACTURADA`, `PAGADA_PEND_FACTURA`). El plan de implementación debe **renombrar todas las referencias** en una sola pasada para evitar estados intermedios inválidos.

3. **CobranzasService.getLibroBancos** y la auto-generación de MovimientoBancario (mig 017-018) leen `estado_pago` y `estado` de OC. Verificar que el cambio de ENUM no rompe esas queries — probablemente sí (referencias literales a `'PAGADA_PEND_FACTURA'`, `'PAGADA'`).

4. **AuditLog** — extender `AuditAccion` type con las nuevas transiciones (recordar: errores de tipos en TS bloquean el deploy de Railway silenciosamente).

5. **Cache buster JS** — al tocar archivos en `public/js/` hay que bumpear el sufijo `?v=YYYYMMDDr#` en TODOS los imports de `app.js` y en `index.html`.

6. **Honorarios (es_honorario=TRUE)** — el módulo Personal en Administración consume OCs por ese flag. El rediseño NO toca el flag y el flujo de honorarios sigue via CERRADA_SIN_FACTURA cuando aplica.

---

## 9. Criterios de aceptación

- [ ] Migración aplicada en Supabase. 37 OCs migradas sin pérdida de información.
- [ ] Kanban muestra 7 columnas activas + colapsable Cerrada/Anulada.
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
- [ ] Las alertas críticas (deuda, pago-sin-recepción, crédito vencer, sin factura) aparecen también en dashboard Gerencia para rol GERENTE.
- [ ] Al resolver el problema en Logística, la alerta desaparece en próxima carga del dashboard Gerencia.
- [ ] Historial de transiciones (`OrdenCompraHistorial`) se llena en cada cambio de estado.
- [ ] Notas (`OrdenCompraNota`) se pueden agregar y ver en timeline de la OC.
- [ ] `npx tsc --noEmit` pasa sin errores antes del deploy (regla 37 CLAUDE.md).
- [ ] Cache buster JS bumpeado en todos los imports y en index.html.

---

## 10. Próximos pasos

1. Usuario revisa este spec y aprueba o solicita cambios.
2. Generar plan de implementación detallado (skill `writing-plans`).
3. Ejecutar plan con TDD donde aplique (skill `executing-plans` o `subagent-driven-development`).

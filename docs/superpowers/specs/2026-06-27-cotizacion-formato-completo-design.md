# Cotización — formato más completo (propuesta técnica + costo consolidado) — Diseño

**Fecha:** 2026-06-27
**Módulo:** Comercial (cotizaciones) + su PDF
**Estado:** Aprobado por Julio — listo para plan de implementación (Entrega 1 primero)

## Problema

El cliente pide la cotización en un formato "PROPUESTA TÉCNICA" con un orden específico de
secciones debajo de los ítems que el ERP hoy no soporta:

1. Título **PROPUESTA TÉCNICA** sobre los ítems
2. Condiciones técnicas que aplican a TODOS los ítems: **Servicio de soldadura / Control de
   calidad / Garantía**
3. **CONDICIONES DEL SERVICIO** (Responsabilidad de la empresa / del cliente)
4. **EXCLUSIONES**
5. **CONDICIONES COMERCIALES** — a veces el cliente NO quiere precio por ítem, sino un costo
   consolidado (Materiales / Fabricación y mano de obra / Utilidad / **Total servicio**)
6. **CONDICIONES DE PAGO**

Hoy Julio mete (2)–(4) a la fuerza como sub-descripción del último ítem, y no hay forma de
ocultar precios por ítem ni de mostrar un desglose de costo consolidado.

**Principio rector:** nada de esto debe ser obligatorio para guardar. La cotización seguirá
exigiendo solo **cliente + al menos 1 ítem**; todo lo nuevo es opcional. El formato debe poder
ir con mucho o poco detalle.

## Análisis de brechas (qué hay vs. qué falta)

| Sección del formato objetivo | ¿Existe? | Acción |
|---|---|---|
| Título "PROPUESTA TÉCNICA" sobre ítems | ❌ | Agregar encabezado en el PDF |
| Ítems (descripción + sub-descripción + notas + foto) | ✅ | Sin cambios |
| Servicio soldadura / Control calidad / Garantía | ❌ | Campo libre `condiciones_servicio` |
| CONDICIONES DEL SERVICIO (responsabilidades) | ❌ | Mismo campo libre |
| EXCLUSIONES | ❌ | Mismo campo libre |
| CONDICIONES COMERCIALES (desglose de costo) | ❌ | Entrega 2: desglose + ocultar precios ítem |
| CONDICIONES DE PAGO | ✅ parcial (`forma_pago`) | Imprimir con su propio encabezado |
| Precios incluyen / validez / plazo / lugar / cuenta | ✅ | Ya en CONDICIONES GENERALES |

## Decisión arquitectónica clave (de dónde sale el total)

El total de la cotización **se calcula sumando los precios de los ítems** y ese total alimenta
todo Finanzas (cobranzas, fondeo, IGV, detracción, "Trabajo en riesgo", Dashboard Gerencial).

**Se elige Arquitectura 1:** los ítems se siguen preciando por dentro (el total real lo sigue
mandando la suma de ítems, Finanzas queda intacto). El "modo costo consolidado" solo cambia la
**presentación en el PDF**: oculta los precios por ítem y muestra un desglose + el total real.
NO se reescribe el cálculo de totales. (Arquitectura 2 —total desde el desglose— se descartó por
alto riesgo en producción.)

## Diseño

### Orden final del PDF
intro "Estimados señores:" → **PROPUESTA TÉCNICA** (título) → tabla de ítems (con o sin precios)
→ totales "SON: …" → **bloque `condiciones_servicio`** → **CONDICIONES COMERCIALES** (si aplica
modo consolidado) → **CONDICIONES GENERALES** (precios incluyen / validez / plazo / lugar) →
**CONDICIONES DE PAGO** (forma_pago) → cuenta bancaria → cierre/firma.

---

### Entrega 1 — Condiciones libres + encabezados (primero, bajo riesgo)

**Datos**
- `Cotizaciones.condiciones_servicio TEXT NULL` (opcional).
- `ConfiguracionMarca.condiciones_servicio_default TEXT NULL` — default **por marca**
  (METAL / PERFOTOOLS), editable en Comercial → Configuración PDF. Si el texto es idéntico para
  ambas marcas, se copia una vez.

**Backend**
- `cotizacion.schema.ts`: `condiciones_servicio: z.string().optional()` en `baseCotizacion`.
- `CotizacionService`: persistir `condiciones_servicio` en create + update.
- `ConfiguracionMarcaService`: leer/escribir `condiciones_servicio_default`.
- `CotizacionService` (o el endpoint de "nueva cotización"): exponer el default de la marca para
  que el form lo auto-rellene.

**Form (Comercial.js)**
- `textarea` "Condiciones del servicio (propuesta técnica)" dentro de la sección "Condiciones
  Generales", con ayuda corta de la regla de formato:
  *línea que termina en ":" → título en negrita · línea que empieza con "-" → viñeta · resto →
  párrafo.*
- En cotización **nueva**: prefill desde el default de la marca seleccionada.
- En **editar** (modal de edición segura): prefill desde el valor guardado de esa cotización.
- Va en el payload create/update. Opcional — no bloquea guardar.
- En **Configuración PDF**: un `textarea` por marca para editar el default.

**PDF (CotizacionPDFService.ts)**
- Título **"PROPUESTA TÉCNICA"** sobre la tabla de ítems.
- Render del bloque `condiciones_servicio` **después de los totales y antes de CONDICIONES
  GENERALES**. Parser línea por línea:
  - termina en ":" → título en negrita (sin viñeta)
  - empieza con "-" (o "•") → viñeta indentada
  - resto → párrafo normal
  - auto-paginado con el `ensureSpace` existente; solo se imprime si el campo tiene contenido.
- Imprimir `forma_pago` bajo su propio encabezado **"CONDICIONES DE PAGO"**.

### Entrega 2 — Modo costo consolidado (después, su propio plan)

**Datos**
- `Cotizaciones.ocultar_precios_items BOOLEAN NOT NULL DEFAULT false`.
- `Cotizaciones.desglose_comercial JSON NULL` — array de filas `{ concepto: string, monto: number }`
  (ej. Materiales, Fabricación y mano de obra, Utilidad). Opcional.

**Backend**
- Schema + `CotizacionService` persisten ambos campos. `desglose_comercial` se valida como array
  de `{concepto, monto>=0}` opcional.

**Form (Comercial.js)**
- Check **"No mostrar precios por ítem en el PDF"** (setea `ocultar_precios_items`).
- Mini-repetidor de filas (concepto + monto) para el desglose. Opcional.

**PDF (CotizacionPDFService.ts)**
- Si `ocultar_precios_items` → la tabla de ítems oculta las columnas **P.Unit** y **Subtotal**
  (mantiene Ítem / Descripción / Unidad / Cantidad / Foto).
- Si hay `desglose_comercial` → imprimir bloque **"CONDICIONES COMERCIALES"** con las filas +
  **TOTAL SERVICIO = total real de la cotización** (el mismo número que ya computa el sistema y
  usa Finanzas). El desglose es presentacional; el total mostrado siempre es el real.

## Transversal
- **Nada obligatorio:** la validación de guardado sigue exigiendo solo `cliente` + `detalles ≥ 1`.
- **Migraciones a Supabase por MCP `apply_migration`** (con OK de Julio), no por el runner mysql2
  (gotcha #33/aclaración: ese runner apunta al MySQL legacy).
- **Cache buster** `?v=` en `app.js` + `index.html` + import de `Comercial.js` (gotcha #36).
- **`npx tsc --noEmit`** antes de pushear (se tocan `.ts`).
- Convenciones UI: sin `alert()` (usar `showSuccess`/`showError`); modales no cierran por backdrop.

## Fuera de alcance (YAGNI)
- Que el total salga del desglose (Arquitectura 2).
- Validar que el desglose sume exactamente el total (es presentacional; responsabilidad del usuario).
- Editor de texto rico (WYSIWYG) para las condiciones — se usa la convención de texto ":"/"-".
- Plantillas múltiples de condiciones por tipo de trabajo (un solo default por marca por ahora).

# Plan de Implementación — Rediseño UI/UX Enterprise

> **Estado:** ✅ Mockup validado por Julio el 26/04/2026. Listo para implementar **a pedido**.
> **Fecha sugerida de ejecución:** Mes 4 del plan maestro (Agosto 2026), después de Fases B + C parciales.
> **Si Julio dice "go" antes**, este plan está listo para arrancar en cualquier momento.

---

## Contexto

Julio (Gerente Metal Engineers) propuso elevar la UI del ERP-PRO a estándar Enterprise (SAP S/4HANA, Ant Design, Odoo 17, Stripe Dashboard) — filosofía **"Densidad con Claridad"**. Después de discutir y validar con un mockup HTML estático, ambos acordamos la dirección visual.

**Mockup validado:** `public/mockup-enterprise.html` — accesible vía URL pública en Railway. **No tocar** este archivo: es la referencia de verdad.

**URL:** https://erp-pro-production-e4c0.up.railway.app/mockup-enterprise.html

---

## Decisiones acordadas (lo que SÍ va)

### Tipografía
- **Inter** como fuente primaria (ya cargada en el ERP actual)
- Activar `font-variant-numeric: tabular-nums` y `font-feature-settings: 'tnum' 1` en TODA columna numérica → `S/` y puntos decimales se alinean perfectamente en columnas
- NO se usará JetBrains Mono — Inter con tabular-nums es suficiente

### Paleta de colores (manteniendo identidad Metal Engineers)
```
--bg-app:        #F8FAFC   (fondo gris azulado ultra claro)
--bg-sidebar:    #0F172A   (slate-950 — más cálido que negro puro, mantiene marca)
--bg-card:       #FFFFFF
--border:        #E2E8F0
--border-strong: #CBD5E1
--text:          #0F172A
--text-muted:    #64748B
--text-subtle:   #94A3B8
--primary:       #0F172A   (NO azul Stripe — Metal Engineers)
--primary-hover: #1E293B

Semánticos:
--success: #059669   --success-bg: #ECFDF5
--danger:  #DC2626   --danger-bg:  #FEF2F2
--warning: #D97706   --warning-bg: #FFFBEB
--info:    #0284C7   --info-bg:    #F0F9FF
```

### Iconos
- **Lucide Icons** inline SVG con stroke 2px uniforme en navegación principal (sidebar, headers, breadcrumbs, KPI labels)
- **Mantener emojis** en mensajes contextuales (toasts, alertas, empty states humanos) — preserva calidez para PYME peruana

### Componentes
- **Cards**: borde `1px solid #E2E8F0`, shadow MUY sutil, `border-radius: 12px`. NO sombras pesadas
- **KPIs**: layout Bento Box (grid simétrico), label uppercase + valor con tabular-nums + delta vs período anterior
- **Tablas**: sticky header gris claro, hover sutil en filas, padding compacto pero respirado, monospace en columnas numéricas
- **Status pills**: 5 variantes semánticas (success, danger, warning, info, neutral) con dot opcional
- **Empty states**: ícono + título + mensaje contextual. NO "Sin datos" planos
- **Botones**: padding 7×14, transición 0.12s, primary sólido `#0F172A`, secondary outline
- **Sidebar**: dark slate-950, items con icono Lucide + texto, badge rojo para conteos, footer con avatar

### Mobile
- Breakpoint principal: 768px (ya existe en main.css)
- Sidebar slide-in con overlay (ya implementado)
- Tablas → cards apilados (ya implementado, mantener pattern)
- Bento KPIs → 2 columnas en mobile, 4 en desktop

### Dark mode
- **NO se implementa en este sprint** pero TODAS las variables CSS quedan listas (`--bg-app`, `--text`, etc.) para activarlo en 1 día con `@media (prefers-color-scheme: dark)` cuando se decida

### Accesibilidad mínima
- Contraste verificado a 4.5:1 (WCAG AA) en cada combinación texto/fondo
- Focus visible en inputs y botones (`outline: 2px solid var(--primary); outline-offset: 2px`)
- aria-labels en iconos sin texto
- `prefers-reduced-motion` respetado en transiciones

---

## Decisiones acordadas (lo que NO va — al menos no en este sprint)

- ❌ Floating labels en formularios (decisión deferida, preferimos labels arriba compactas para evitar choques mobile)
- ❌ Reemplazar Chart.js por D3 u otra (mantener Chart.js, solo aplicar paleta nueva a charts)
- ❌ Color azul Stripe — descartado para preservar identidad Metal Engineers
- ❌ Eliminar TODOS los emojis — mantener en mensajes humanos

---

## Plan de ejecución (3 semanas full-time)

### Semana 1 — Fundación visual
- [ ] **G1.** Crear branch `redesign-enterprise` aislado de `main`
- [ ] **G2.** Sistema de tokens CSS en `public/css/tokens.css` (colores, espaciado, tipografía, sombras, radios) — todas las variables del mockup
- [ ] **G3.** Importar **Lucide Icons** como SVG sprites locales (`public/lib/icons.svg`) — evitar CDN, ~30 KB ofuscado
- [ ] **G4.** Helper `icon(name, opts)` en `ui.js` que devuelve `<svg><use href="#name"/></svg>`
- [ ] **G5.** Refactorizar **Sidebar.js** con la nueva estructura (slate-950, secciones, iconos Lucide, footer con avatar)
- [ ] **G6.** Refactorizar **header global** de cada página (`header.header`) con estilo nuevo
- [ ] **G7.** Aplicar tipografía Inter + tabular-nums globalmente vía `body { font-feature-settings: 'tnum' 1 }`

### Semana 2 — Componentes en todos los módulos
- [ ] **G8.** Crear componente `KpiCard.js` v2 con label uppercase + valor tabular + delta + icono opcional
- [ ] **G9.** Crear componente `Pill.js` con 5 variantes semánticas (reemplaza badges actuales)
- [ ] **G10.** Crear componente `EmptyState.js` con icono + título + texto + acción opcional
- [ ] **G11.** Refactorizar `.card` y `.table-container` con nuevo styling (border sutil, sticky thead, hover discreto)
- [ ] **G12.** Aplicar a **Dashboard Gerencial** — usar como referencia para los demás
- [ ] **G13.** Aplicar a **Comercial** (lista cotizaciones, dashboard, formulario)
- [ ] **G14.** Aplicar a **Finanzas** (cobranzas, libro bancos, gastos bancarios)
- [ ] **G15.** Aplicar a **Logística** (proveedores, centros de costo, OCs, gastos × 3)
- [ ] **G16.** Aplicar a **Inventario** + **Préstamos** + **Administración** + **Contabilidad** + **Alertas**

### Semana 3 — Formularios + microinteracciones + QA
- [ ] **G17.** Refactorizar formularios con labels compactas arriba, inputs con border sutil, focus state visible
- [ ] **G18.** Microinteracciones: `transition: all 0.12s` en botones/cards, hover states consistentes, loading skeletons en lugar de spinners
- [ ] **G19.** QA accesibilidad: verificar contraste, navegación por teclado, lectores de pantalla básicos
- [ ] **G20.** QA mobile real (iPhone Safari + Android Chrome) — ajustar fricciones encontradas
- [ ] **G21.** QA de Julio: 2-3 días usando el ERP refactorizado con data real antes de mergear
- [ ] **G22.** Merge a `main` (big-bang después del QA OK)

---

## Criterios de éxito

- ✅ Julio abre el ERP en cualquier sesión y siente que es "un producto serio", no un proyecto interno
- ✅ Cuando muestre el ERP a un potencial cliente SaaS (Fase F), la primera impresión es premium
- ✅ Métricas Lighthouse: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95
- ✅ Tabular nums verificadas en todas las tablas financieras (S/ alineados visualmente)
- ✅ Sin regresiones funcionales — todo el ERP que funcionaba antes sigue funcionando

---

## Archivos clave (referencia para cuando se ejecute)

### Para crear/modificar
- `public/css/tokens.css` (nuevo) — Sistema de tokens
- `public/css/main.css` — Refactorizar usando tokens
- `public/js/components/Pill.js` (nuevo)
- `public/js/components/EmptyState.js` (nuevo)
- `public/js/components/Icon.js` (nuevo) — wrapper Lucide
- `public/lib/icons.svg` (nuevo) — sprite Lucide local
- `public/js/components/Sidebar.js` — refactor visual
- `public/js/components/KpiCard.js` — refactor con delta
- Cada `public/js/pages/*.js` — aplicar nuevos componentes

### Para mantener intactos
- `public/mockup-enterprise.html` — referencia visual permanente
- Schemas, services, índice — sin cambios funcionales
- API endpoints — sin cambios

---

## Apéndice A — Documento original de Julio (preservado tal cual)

> **DOCUMENTO DE REQUISITOS DE REDISEÑO UI/UX - ERP ENTERPRISE**
> **Objetivo:** Elevar la interfaz gráfica del ERP actual a un estándar corporativo e industrial "Enterprise" (nivel SAP S/4HANA, Ant Design, Odoo 17, Stripe). El enfoque es "Densidad con Claridad", priorizando la legibilidad de datos técnicos de ingeniería sin sacrificar la estética moderna.
>
> **1. Reglas Globales de Diseño (Estética y Layout)**
> - **Filosofía:** Eliminar el "ruido visual". Cero fondos negros puros, cero colores neón, cero bordes gruesos.
> - **Layout principal:** Implementar un estilo "Bento Box". Organizar la información en bloques rectangulares estructurados y simétricos que encajen perfectamente usando CSS Grid/Flexbox.
> - **Espaciado (White Space):** Incrementar el padding interno de las tarjetas y componentes para que el contenido "respire", pero mantener una estructura compacta en las tablas de datos.
>
> **2. Tipografía y Jerarquía**
> - **Fuente Principal:** Implementar `Inter`, `Public Sans` o `Outfit` para la interfaz general (optimiza la legibilidad en pantallas densas).
> - **Fuente Numérica:** Usar fuentes monoespaciadas (como `JetBrains Mono` o la variante tabular de Inter) para tablas, montos financieros (S/) y métricas. Esto asegura que los números se alineen verticalmente.
> - **Jerarquía:**
>   - Etiquetas de datos (Labels): Tamaño pequeño (11px-12px), en mayúsculas, color gris medio (`#64748B`).
>   - Valores/Montos: En negrita, color oscuro (`#0F172A`), con el símbolo de moneda ("S/") ligeramente más pequeño que el número.
>
> **3. Paleta de Colores (Estricta)**
> - **Fondo de la App (Background):** Gris azulado ultra claro (`#F8FAFC` o `#F1F5F9`).
> - **Sidebar / Menú Lateral:** Azul Slate Profundo (`#0F172A`) o Gris Carbón (`#18181B`). Nada de negro `#000000`. Textos de menú en gris claro (`#94A3B8`) y blanco para el ítem activo.
> - **Superficies (Cards):** Blanco puro (`#FFFFFF`).
> - **Bordes y Divisores:** Gris muy sutil (`#E2E8F0`).
> - **Semántica (Estados y Alertas):** Usar tonos "mate" o pastel oscuro, nunca vibrantes.
>   - Éxito/Ingresos: Verde esmeralda (`#059669`).
>   - Alerta/Peligro/Egresos: Rojo terracota o carmesí suave (`#DC2626`).
>   - Pendiente/Advertencia: Ámbar oscuro (`#D97706`).
>
> **4. Componentes Clave**
> - **Tarjetas (Cards):** Eliminar sombras pesadas. Usar `border-radius: 8px` o `12px` máximo. Aplicar un borde sutil de 1px o una sombra difuminada muy ligera (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1)`).
> - **Tablas de Datos (Data Grids):** Deben ser compactas.
>   - Cabeceras adhesivas (sticky headers) en gris muy claro.
>   - Filas con altura reducida para mostrar más información técnica sin hacer scroll excesivo.
>   - Efecto "hover" muy sutil al pasar el cursor sobre las filas.
> - **Navegación por Pestañas (Tabs):** Para vistas con mucha información (ej. Metrado, Despiece, Finanzas), usar tabs limpios en la parte superior en lugar de recargar una sola vista.
> - **Iconografía:** Reemplazar todos los iconos actuales por una librería unificada y consistente, preferiblemente **Lucide Icons** o **Heroicons**, con un grosor de línea (stroke) uniforme de `1.5px` o `2px`.
>
> **5. Micro-interacciones y Pulido Profesional**
> - **Empty States:** Si un panel o tabla no tiene datos (ej. "S/ 0.00" o cero registros), mostrar un estado vacío diseñado profesionalmente (texto atenuado, gráfico "skeleton" sutil).
> - **Inputs y Formularios:** Usar campos de texto agrupados y compactos. Preferir "floating labels" o etiquetas pequeñas en la parte superior del input.
> - **Botones (CTAs):** El botón de acción principal debe tener el color de acento de la marca, sin bordes toscos, con un ligero cambio de opacidad al hacer hover.

---

## Apéndice B — Mi opinión técnica (transcripta para futura referencia)

**Lo bueno:**
1. Diagnóstico correcto — la UI actual es "DIY" y no escala como producto
2. "Densidad con claridad" es la filosofía correcta para ERP de uso diario
3. Tabular nums para números es lo más impactante y subestimado del documento
4. Lucide en lugar de emojis = upgrade enorme (consistencia, accesibilidad, profesionalismo)
5. Slate `#0F172A` en lugar de negro puro `#000000` = menos cansador en sesiones largas

**Discutibles:**
1. Riesgo de **perder identidad Metal Engineers** si copiamos paleta Stripe genérica → resuelto: mantenemos slate-950 en sidebar pero NO azules vibrantes
2. **Cero emojis pierde calidez** para PYME peruana → resuelto: mezcla Lucide en navegación, emojis en mensajes humanos
3. **Floating labels en mobile** son problemáticos por iOS native styling → diferidos al sprint siguiente
4. **No menciona dark mode** ni accesibilidad → agregados al plan

**Lo que faltaba:**
1. Estrategia de migración (branch dedicado vs main) → resuelto: branch aislado + big-bang merge
2. Performance (Lucide pesa) → resuelto: SVG sprite local
3. Validación con usuario real antes del refactor masivo → resuelto: mockup HTML que Julio aprobó hoy
4. Dark mode → variables CSS preparadas para implementarlo en 1 día más adelante
5. Accesibilidad → criterios WCAG AA agregados

**Recomendación de timing:**
> "No ahora. Después de Fase B (facturación electrónica) + 2-3 meses de operación real. Vas a descubrir 30 fricciones reales que el rediseño debería resolver. Si rediseñamos antes, vas a tener que volver a tocar."

---

## Apéndice C — Listado de imágenes/screenshots de referencia

- Mockup desktop completo: render del archivo `public/mockup-enterprise.html` cargado en Chrome 1920×1080
- Mockup mobile: mismo archivo en iPhone Safari 390×844 (responsive activo)
- Documento original de Julio (texto preservado en Apéndice A)

---

## Estado del proyecto al cierre de esta planificación (26/04/2026)

**Sesión productiva:** ~50 commits hoy. Producción en `v=20260426n`.

**Lo que se hizo (relevante para este plan):**
- Sistema de tooltips ⓘ (helper `tip()` reutilizable + handler mobile)
- Tooltips aplicados a 26 campos clave (OC, Cotización, Préstamos, Inventario)
- CSS variables base ya organizadas (preparado para tokens)
- Sidebar con scroll vertical en desktop (no se cortan items)

**Pendientes funcionales antes del rediseño:**
- Cargar data real (proveedores, cotizaciones, gastos)
- Tramitar certificado SUNAT INDECOPI (2-3 sem)
- Activar Fase B (facturación electrónica con Nubefact)
- Fase C C22-C24 (Rentabilidad por Servicio + Préstamos↔Libro Bancos)

**Trigger para arrancar este plan:**
Cuando Julio diga "go", crear branch `redesign-enterprise` y arrancar Semana 1 (G1-G7).

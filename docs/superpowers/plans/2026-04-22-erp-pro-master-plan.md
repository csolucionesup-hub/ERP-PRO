# ERP-PRO Master Implementation Plan

> **For agentic workers:** This is the STRATEGIC master plan. Each Phase below will generate its own detailed task-level implementation plan (with TDD steps) in `docs/superpowers/plans/` when that phase begins execution. Use superpowers:subagent-driven-development or superpowers:executing-plans for each phase plan separately. Steps use checkbox (`- [ ]`) syntax for tracking phase completion.

**Goal:** Transformar ERP-PRO en el ERP metalmecánico PYME más completo del Perú — legal ante SUNAT, configurable por régimen tributario, con el módulo de producción ausente en competidores peruanos, y arquitectura preparada para venderse como SaaS a otras empresas del rubro.

**Architecture:** Monolito modular sobre stack existente (Node/TS + Express 5 + MySQL + Vanilla JS). Cada módulo nuevo sigue el patrón ya validado (Service en backend + página en `public/js/pages/` + namespace window.Modulo). Se agregan capas transversales (auth, audit log, configuración por régimen, periodos contables) sin romper lo ya funcionando. Facturación electrónica vía integración con OSE Nubefact. Dashboards con Chart.js local. Deploy continúa en Railway.

**Tech Stack:** Node.js 20 · TypeScript 5 · Express 5 · MySQL 8 · Zod 4 · JWT (bcryptjs) · Vanilla JS ES modules · Chart.js v4 (local) · Cloudinary · Google Drive API · Nubefact API · multer · pdfjs-dist · Railway nixpacks deploy

**Plazo total estimado:** 20 semanas (~5 meses) desde arranque de Fase A.

**Última revisión:** 22/04/2026

---

## Resumen ejecutivo — la visión en una página

Al terminar este plan, ERP-PRO será:

1. 🇵🇪 **Legalmente operativo** ante SUNAT — emite facturación electrónica con OSE, entrega libros PLE al contador con 1 clic, genera estados financieros formales.
2. 🏭 **Diferenciador en metalmecánica** — único ERP peruano PYME con módulo Producción (Órdenes de Trabajo, BOM, Work Centers), Control de Calidad y trazabilidad de material.
3. ⚙️ **Configurable por régimen** (NRUS / RER / RMT / General) — una sola instalación sirve a cualquier PYME peruana.
4. 📊 **Visualmente gerencial** — dashboards con tabs, KPIs por módulo, comparativas anuales, alertas, pack contable mensual.
5. 🔍 **Auditable** — audit log completo, periodos cerrados, adjuntos PDF, separación de funciones, trazabilidad documento↔transacción.
6. 💼 **Vendible como SaaS** — arquitectura multi-tenant preparada, wizard de setup inicial, onboarding de nuevas empresas en <1 hora.

**Tamaño del mercado objetivo:** ~300,000 PYMEs peruanas en RMT + talleres metalmecánicos.

---

## Mapa de Fases

| Fase | Nombre | Duración | Valor | Dependencias |
|---|---|---|---|---|
| **A** | Fundaciones — Configuración por régimen + Auditoría | 3 semanas | Habilitador de todo lo demás | Ninguna |
| **B** | Legal urgente — Facturación Electrónica + Libros PLE | 4 semanas | 🔴 Operar legal | Fase A |
| **C** | Módulos core pendientes — Logística + Almacén + Dashboards | 4 semanas | Cerrar el ciclo operativo | Fase A |
| **D** | Contabilidad — Asientos + Estados Financieros + Pack Contable | 3 semanas | Relación con contador | Fases A, B |
| **E** | Diferenciación metalmecánica — Producción + BOM + Work Centers + QC | 5 semanas | Ventaja competitiva única | Fase C |
| **F** | Go-to-market — Multi-tenancy + Onboarding + Pricing | 2 semanas | Vender como SaaS | Fases A-E |

**Total: 21 semanas ≈ 5 meses** (las fases C y D pueden solaparse parcialmente — plan realista 20 semanas).

---

## Calendario sugerido (arranque 28/04/2026)

```
MES 1 (Mayo 2026)        MES 2 (Junio 2026)       MES 3 (Julio 2026)
├─ S1: Fase A init       ├─ S5: Fase B cont        ├─ S9: Fase C cont
├─ S2: Fase A cont       ├─ S6: Fase B cont        ├─ S10: Fase C cierre
├─ S3: Fase A cierre     ├─ S7: Fase B cierre      ├─ S11: Fase D init
├─ S4: Fase B init       ├─ S8: Fase C init        ├─ S12: Fase D cont

MES 4 (Agosto 2026)      MES 5 (Sept 2026)
├─ S13: Fase D cierre    ├─ S17: Fase E cont
├─ S14: Fase E init      ├─ S18: Fase E cierre
├─ S15: Fase E cont      ├─ S19: Fase F init
├─ S16: Fase E cont      ├─ S20: Fase F cierre + LANZAMIENTO
```

**Hitos críticos:**
- 📅 **Fin de Mayo** — Metal Engineers emite facturas electrónicas desde el ERP (fin de doble sistema)
- 📅 **Fin de Junio** — ERP operativo integral para Metal Engineers (todos los módulos core)
- 📅 **Fin de Julio** — Primera entrega de Pack Contable automática al contador
- 📅 **Fin de Agosto** — Primera Orden de Trabajo ejecutada en taller con la app
- 📅 **Fin de Septiembre** — Lanzamiento público del SaaS

---

## FASE A — Fundaciones (3 semanas)

**Objetivo:** Preparar la capa transversal que todo lo demás necesita — configuración por régimen, audit log, periodos contables, adjuntos, roles extendidos.

**Por qué va primero:** Todas las fases posteriores consultan `ConfiguracionEmpresa.regimen` para saber qué lógica aplicar. Sin esto, el código se llena de `if régimen === X` hardcodeados.

### Entregables

- [ ] **A1. Tabla `ConfiguracionEmpresa`** con 25+ switches (régimen, IGV, OSE, módulos activos, metas, preferencias)
- [ ] **A2. `ConfiguracionService`** con caché en memoria — un solo punto de lectura para toda la app
- [ ] **A3. Migration 020 — `Auditoria`** (tabla): quién hizo qué, cuándo, valores antes/después, ref_tipo, ref_id
- [ ] **A4. Middleware `auditLog`** que intercepta INSERTs/UPDATEs/DELETEs en rutas sensibles (Servicios, Gastos, Compras, Cotizaciones, Cobranzas, Préstamos)
- [ ] **A5. Tabla `PeriodosContables`** con estado ABIERTO/CERRADO — trigger/guard que bloquea mutaciones en periodos cerrados
- [ ] **A6. Tabla `Adjuntos`** (tipo, ref_tipo, ref_id, url, cloudinary_public_id) — permite subir PDFs a cualquier documento
- [ ] **A7. Roles extendidos:** agregar `APROBADOR`, `CAJA`, `CONTADOR` al ENUM de `Usuarios.rol`
- [ ] **A8. Módulo `⚙️ Configuración`** en sidebar (solo GERENTE) con 7 tabs: Empresa, Régimen, Facturación, Plan Cuentas, Módulos, Preferencias, Usuarios (link al existente)
- [ ] **A9. Wizard de setup inicial** (5 pasos) — se dispara si `ConfiguracionEmpresa` está vacía al primer login
- [ ] **A10. Componente reutilizable `TabBar.js`** con hash routing (#/modulo/tab), badges, responsive
- [ ] **A11. Componente reutilizable `KpiCard.js`** con valor + variación + icono + onClick
- [ ] **A12. Chart.js v4 local** en `public/lib/chart.min.js` + helper `charts.js` con presets de colores Metal Engineers

### Criterios de éxito

- ✅ Puedo cambiar `regimen` en Configuración de RMT a General y el sistema se adapta sin errores
- ✅ Cualquier INSERT en tabla crítica genera fila en `Auditoria`
- ✅ Intentar editar una Cotización de un mes cerrado devuelve 403
- ✅ Cualquier transacción puede tener PDFs adjuntos (al menos 3 módulos usándolo)
- ✅ `TabBar` y `KpiCard` funcionan en una pantalla de prueba
- ✅ Wizard crea ConfiguracionEmpresa válida para una empresa nueva

### Checkpoint al final de Fase A

> Demo en vivo: abrir Configuración, cambiar un switch, ver que todo el sidebar reacciona. Crear un gasto y mostrar el registro en Auditoria.

---

## FASE B — Legal urgente: Facturación Electrónica + Libros PLE (4 semanas)

**Objetivo:** Metal Engineers deja de depender de sistema externo de facturación y cumple 100% las obligaciones electrónicas con SUNAT desde el ERP.

**Por qué tan temprano:** Es el gap más grande hoy. Sin esto, el ERP no es "el sistema" — es una herramienta auxiliar.

### Entregables

- [ ] **B1. Tabla `Facturas`** (id, serie, numero, fecha, cliente, subtotal, igv, total, estado_sunat, xml_url, pdf_url, cdr_url, id_cotizacion_origen)
- [ ] **B2. Tabla `NotasCredito`** y `NotasDebito` para ajustes/anulaciones post-emisión
- [ ] **B3. Tabla `GuiasRemision`** para traslados físicos
- [ ] **B4. Integración con OSE Nubefact** — wrapper `NubefactService` con: `emitirFactura(data)`, `consultarEstado(id)`, `emitirNotaCredito(data)`, `emitirBoleta(data)`
- [ ] **B5. Generador XML UBL 2.1** cumpliendo estructura SUNAT (con test unitario contra XML válido real)
- [ ] **B6. Botón "Emitir Factura desde Cotización"** en módulo Comercial — flujo: cotización APROBADA → confirma datos → llama Nubefact → guarda CDR → muestra PDF oficial
- [ ] **B7. Manejo de estados SUNAT:** ACEPTADA / RECHAZADA / OBSERVADA / ANULADA con reintentos
- [ ] **B8. Series de numeración** (F001, B001, FC01, FD01, T001) configurables desde Configuración
- [ ] **B9. Exportador PLE Registro de Ventas (14.1)** — genera TXT formato exacto SUNAT
- [ ] **B10. Exportador PLE Registro de Compras (8.1)** — desde tabla Compras existente + adjuntos
- [ ] **B11. Pantalla "Libros Electrónicos"** en módulo Contabilidad (pestaña) con descarga por libro/periodo
- [ ] **B12. Cron nightly** que consulta estado de facturas pendientes en SUNAT y actualiza
- [ ] **B13. Migración de cotizaciones facturadas existentes** a la tabla nueva (si aplica)

### Criterios de éxito

- ✅ Emitir una factura electrónica real → recibir CDR de SUNAT → ver PDF oficial
- ✅ Emitir nota de crédito a una factura → SUNAT la acepta
- ✅ Descargar Registro de Ventas PLE del mes → subirlo al PLE de SUNAT sin errores de formato
- ✅ Cotización APROBADA muestra botón "Emitir Factura", APROBADA-FACTURADA cambia de color
- ✅ Si Nubefact falla → factura queda en estado PENDIENTE_ENVIO para reintento

### Checkpoint al final de Fase B

> **Hito legal conseguido.** Metal Engineers emite todas sus facturas del mes entrante desde ERP-PRO. El sistema externo de facturación se dio de baja. Al contador se le entrega el TXT de Ventas del mes pasado y confirma que es válido.

---

## FASE C — Módulos Core Pendientes + Dashboards (4 semanas)

**Objetivo:** Cerrar el ciclo operativo diario — registrar todo gasto, movimiento de almacén y control administrativo. Dar visibilidad ejecutiva con dashboards por módulo y Gerencia consolidada.

### Entregables — Logística

- [ ] **C1. Refactor de `Logistica.js`** (hoy placeholder) con 5 tabs: Gastos General / Gastos Servicio / Compras Almacén / OC Servicios / Dashboard
- [ ] **C2. UI Gastos General** — formulario con centro_costo=OFICINA CENTRAL, tabla, editar/anular
- [ ] **C3. UI Gastos Servicio** — formulario con selector de Servicio (proyecto), honorarios persona natural sin IGV
- [ ] **C4. UI Compras Almacén** — al guardar, genera movimiento de ingreso en inventario con costo
- [ ] **C5. Tabla nueva `OrdenesCompra`** (OC formal con aprobación por monto) — workflow: BORRADOR → APROBADA → RECIBIDA → FACTURADA → PAGADA
- [ ] **C6. Dashboard Logística** — KPIs gasto por tipo, top proveedores, tendencia 12m

### Entregables — Almacén

- [ ] **C7. Migración Almacén** — tabla `MovimientosInventario` (ingreso/salida/ajuste/transferencia), extender `Inventario` con `stock_actual`, `costo_promedio`, `valor_total`
- [ ] **C8. Refactor `Inventario.js`** con 4 tabs: Stock / Ingresos / Salidas / Dashboard
- [ ] **C9. UI Stock valorizado** — tabla con búsqueda, filtro por stock bajo mínimo, click → modal con kárdex
- [ ] **C10. UI Ingresos** — desde Compras Almacén o manual con justificación
- [ ] **C11. UI Salidas a Servicio** — genera costo directo en CostosServicio + descuento de stock
- [ ] **C12. Método costeo promedio móvil** — al ingreso: `nuevo_costo = (stock_prev*costo_prev + ingreso*costo_nuevo)/(stock_prev+ingreso)`
- [ ] **C13. Dashboard Almacén** — valor total, items bajo mínimo, rotación, top consumidos

### Entregables — Administración

- [ ] **C14. Extender `Administracion.js`** con tabs: Gasto Personal / Por persona / Dashboard
- [ ] **C15. Dashboard Administración** — evolución 12m, distribución tipo (planilla/honor/subcont), por proyecto

### Entregables — Dashboards restantes

- [ ] **C16. Dashboard Finanzas** (tab nueva en módulo) — saldos, aging CxC, flujo caja 12m
- [ ] **C17. Dashboard Préstamos** (tab nueva) — evolución deuda neta, próximos vencimientos
- [ ] **C18. Dashboard Comercial ampliado** — agregar win rate histórico, ticket promedio, tiempo aprobación
- [ ] **C19. Dashboard Gerencia** (módulo nuevo) — 4 tabs: Resumen / Comparativa Anual / Cierre Mensual / Alertas
- [ ] **C20. Endpoint `/api/dashboard/gerencia`** que agrega datos de todos los módulos en una sola llamada
- [ ] **C21. Tabla `DashboardSnapshots`** + cron mensual que guarda foto de KPIs al cierre de cada mes

### Entregables — Rentabilidad por Servicio

- [ ] **C22. Endpoint `/api/servicios/:id/rentabilidad`** — devuelve P&L por servicio (ingreso, materiales, mano obra, gastos directos, margen)
- [ ] **C23. Pantalla "Rentabilidad por Servicio"** con semáforos (verde ≥30%, amarillo 15-30%, rojo <15%)
- [ ] **C24. Integración Préstamos ↔ Libro Bancos** — el gap que detectamos (auto-mov al desembolsar/pagar)

### Criterios de éxito

- ✅ Un mes completo con TODAS las operaciones registradas en el ERP (ningún Excel paralelo)
- ✅ Al cierre del mes, el Saldo Libro Bancos cuadra con Saldo EECC Interbank sin diferencias
- ✅ Dashboard Gerencia muestra 6 tarjetas con datos reales y todas las variaciones vs mes anterior
- ✅ Rentabilidad por Servicio muestra al menos 3 servicios completos con márgenes calculados
- ✅ Cualquier stock en almacén tiene costo promedio real actualizado

### Checkpoint al final de Fase C

> Julio abre el Dashboard Gerencia el primer día del mes siguiente y ve TODO lo que pasó en el mes anterior sin pedirle un dato a nadie. Reunión de revisión mensual de 30 min se convierte en la conversación más útil del equipo.

---

## FASE D — Contabilidad Automática + Pack Contable (3 semanas)

**Objetivo:** Que el contador de Metal Engineers reciba el primer día del mes un ZIP con TODO lo que necesita — sin Excel, sin pedidos, sin reprocesamiento.

### Entregables

- [ ] **D1. Tabla `PlanContable`** pre-cargada con PCGE estándar peruano (~800 cuentas con códigos oficiales)
- [ ] **D2. Tabla `AsientosContables`** (id, fecha, periodo, glosa, tipo_documento, id_documento, estado) y `DetalleAsiento` (cuenta, debe, haber, glosa)
- [ ] **D3. `ContabilizadorService`** — motor que recibe una transacción de negocio y genera asientos automáticos según reglas. Reglas:
  - Venta (Factura) → Débito CxC / Crédito Ventas / Crédito IGV
  - Compra → Débito Gasto/Inventario + IGV Crédito Fiscal / Crédito CxP
  - Cobranza → Débito Caja/Banco / Crédito CxC
  - Pago → Débito CxP / Crédito Caja/Banco
  - Honorarios → Débito Gasto Personal / Crédito CxP + Retención 4ta
  - Préstamo → Débito Caja / Crédito Obligaciones Financieras
  - Detracción → Débito Detracciones BN / Crédito CxC
- [ ] **D4. Contabilización automática en background** — hook en creación de cada tipo de documento
- [ ] **D5. Pantalla "Libro Diario"** con filtro por periodo, búsqueda, asientos con glosa y documento origen
- [ ] **D6. Pantalla "Libro Mayor"** — saldos por cuenta, click en cuenta → ver movimientos
- [ ] **D7. Exportador PLE Libro Diario (5.1)**
- [ ] **D8. Exportador PLE Libro Mayor (6.1)**
- [ ] **D9. Exportador PLE Libro Caja y Bancos (1.1)** — desde Libro Bancos existente
- [ ] **D10. Exportador PLE Retenciones (13.1)** — honorarios 4ta + 5ta si aplica
- [ ] **D11. Generador Estado de Resultados** (PDF) — desde AsientosContables agrupando 7x/6x/etc.
- [ ] **D12. Generador Balance General** (PDF) — activos (1x/2x), pasivos (4x), patrimonio (5x)
- [ ] **D13. Generador Estado de Flujo de Efectivo** (PDF) — desde Libro Bancos
- [ ] **D14. Botón ESTRELLA "📦 Pack Contable del Mes"** — genera ZIP con:
  - Todos los libros PLE (TXT)
  - Estados Financieros (PDF)
  - Comprobantes de venta emitidos (PDFs)
  - Comprobantes de compra recibidos (PDFs adjuntos)
  - Conciliación bancaria firmada
  - Checklist de auditoría
- [ ] **D15. Cron mensual** que genera el Pack y lo deja en Google Drive carpeta `CONTABILIDAD/2026/XX/`
- [ ] **D16. Módulo `📘 Contabilidad`** en sidebar con tabs: Asientos / Libro Diario / Libro Mayor / Libros PLE / Estados Financieros / Pack Contable

### Criterios de éxito

- ✅ Al emitir una factura, el asiento contable aparece en Libro Diario sin acción humana
- ✅ Libro Mayor muestra saldo correcto de cada cuenta al cierre de mes
- ✅ Estado de Resultados del mes coincide con lo que Julio ve en Dashboard Gerencia (±S/ 0.10 tolerancia redondeo)
- ✅ Contador recibe Pack Contable del mes y reporta cero errores de formato SUNAT
- ✅ Balance General muestra ecuación fundamental: Activos = Pasivos + Patrimonio

### Checkpoint al final de Fase D

> **Hito para el contador.** Primera entrega de Pack Contable automático. El contador confirma que recibió todo lo que necesitaba sin tener que pedir nada adicional. Tiempo de cierre mensual reducido de días a horas.

---

## FASE E — Diferenciación Metalmecánica: Producción (5 semanas)

**Objetivo:** Lo que ningún ERP peruano PYME tiene — el módulo que convierte a ERP-PRO en la elección obvia para cualquier taller metalmecánico.

### Entregables — Base de datos

- [ ] **E1. Tabla `Productos`** — catálogo de productos fabricables (ej. herramientas cimentación) con BOM base
- [ ] **E2. Tabla `BOM`** (Bill of Materials) y `DetalleBOM` — componentes, cantidades, operaciones
- [ ] **E3. Tabla `WorkCenters`** — estaciones de trabajo (torno, fresadora, CNC, soldadora, pintura, QC) con costo/hora, capacidad, estado
- [ ] **E4. Tabla `OrdenesTrabajo`** (OT) — id_cotizacion_origen, id_producto, cantidad, estado (PLANIFICADA/EN_CURSO/COMPLETADA/CERRADA), fecha_inicio_plan/real, fecha_fin_plan/real
- [ ] **E5. Tabla `Rutas`** — secuencia de operaciones por OT (work_center, tiempo_estimado, tiempo_real, operario, estado)
- [ ] **E6. Tabla `ConsumosMaterial`** — materiales consumidos por OT (desde almacén)
- [ ] **E7. Tabla `PartesProduccion`** — marca inicio/fin por operario de cada operación
- [ ] **E8. Tabla `ChecksQC`** — controles de calidad por operación con pass/fail, tolerancias, evidencia foto
- [ ] **E9. Tabla `Remanentes`** — retazos de material con medidas reales (largo, ancho, espesor, peso), OT que lo generó, reutilizable S/N
- [ ] **E10. Tabla `CertificadosMaterial`** — heat numbers, colada, proveedor, lote, PDF del certificado adjunto

### Entregables — Backend

- [ ] **E11. `ProductoService`** y `BOMService` — CRUD productos con BOM multinivel
- [ ] **E12. `WorkCenterService`** — CRUD + cálculo de OEE por WC
- [ ] **E13. `OrdenTrabajoService`** con método clave `crearDesdeCotizacion(id_cotizacion)` que explota BOM, crea ruta, reserva materiales
- [ ] **E14. `ProduccionService`** — registra partes (iniciar/pausar/terminar operación), calcula tiempo real vs estimado
- [ ] **E15. `QCService`** — ejecuta check-list por operación, bloquea operación siguiente si falla
- [ ] **E16. `CostoOTService.calcular(id_ot)`** — costo real = materiales + mano obra + overhead + subcontratos
- [ ] **E17. Hook al cerrar OT** — genera asiento contable + libera remanentes + marca cotización COMPLETADA → pipeline a facturación

### Entregables — UI

- [ ] **E18. Módulo `🏭 Producción`** en sidebar con tabs: Órdenes / Nueva OT / Piso de Planta / Dashboard
- [ ] **E19. Pantalla "Órdenes de Trabajo"** — tabla con estado, cliente, producto, avance %, fecha compromiso
- [ ] **E20. Pantalla "Detalle OT"** — vista todo-en-uno (ProShop style): cabecera, materiales, rutas, partes, QC, adjuntos, fotos
- [ ] **E21. Botón "Convertir Cotización a OT"** en módulo Comercial (cotización APROBADA)
- [ ] **E22. Pantalla "Piso de Planta"** — kiosko móvil con QR por OT (opcional, se accede desde tablet del taller)
- [ ] **E23. Módulo `📋 Calidad`** — checklists por producto, no conformidades, acciones correctivas
- [ ] **E24. Módulo `⚒️ Work Centers`** — CRUD, OEE por estación, utilización, mantenimiento programado
- [ ] **E25. Pantalla "Trazabilidad"** — dado un número de OT, ver qué lotes de material usó, certificados, operarios que intervinieron

### Entregables — Integraciones

- [ ] **E26. Integración OT ↔ Almacén** — reserva de materiales al crear OT, consumo real al registrar partes
- [ ] **E27. Integración OT ↔ Rentabilidad** — costo real de OT feeds P&L por proyecto
- [ ] **E28. Integración QC ↔ Facturación** — bloqueo: no se puede facturar si OT no pasó QC
- [ ] **E29. PDFs con QR** — OT impresa con QR que abre directamente la pantalla de esa OT desde tablet
- [ ] **E30. Dashboard Producción** — OEE por WC, OT en curso, on-time delivery %, cycle time vs estimado, top no conformidades

### Criterios de éxito

- ✅ Una cotización aprobada se convierte en OT con 1 click
- ✅ La OT explota su BOM, reserva materiales, genera ruta con operaciones
- ✅ Un operario puede marcar inicio/fin de operación desde tablet
- ✅ El costo real calculado al cerrar una OT es fidedigno (±2% del cálculo manual)
- ✅ No se puede facturar una OT que tiene QC fallado
- ✅ Dashboard Producción muestra OEE por cada work center del taller

### Checkpoint al final de Fase E

> **Hito competitivo.** Primera OT ejecutada 100% en el sistema. Un operario del taller marcó sus tiempos desde tablet. El costo real calculado coincide con lo que Julio habría calculado en Excel. **Esto es lo que ningún competidor peruano PYME tiene.**

---

## FASE F — Go-to-Market: Multi-tenancy + Onboarding + SaaS (2 semanas)

**Objetivo:** Arquitectura lista para vender a otras PYMEs. Onboarding en <1 hora. Primer cliente beta además de Metal Engineers.

### Entregables

- [ ] **F1. Tabla `Empresas`** (tenant) — ruc, razon_social, plan, estado, fecha_alta
- [ ] **F2. Campo `id_empresa`** en todas las tablas transaccionales (migración masiva + índices)
- [ ] **F3. Middleware tenant** — extrae `id_empresa` del JWT e inyecta en todos los queries
- [ ] **F4. Panel Super-Admin** (fuera del sidebar empresa) para ver/crear/suspender empresas
- [ ] **F5. Wizard de onboarding extendido** — paso adicional: certificado digital, OSE credenciales, plan de cuentas inicial
- [ ] **F6. Generador de demo data** — al crear empresa nueva, opción "poblar con data de ejemplo" para capacitación
- [ ] **F7. Sistema de planes y pricing:**
  - **Starter** (NRUS/RER): S/ 99/mes — Comercial + Finanzas + Dashboard básico
  - **Business** (RMT): S/ 249/mes — + Logística + Almacén + Contabilidad + Pack Mensual
  - **Pro Metalmecánico** (RMT/General): S/ 499/mes — + Producción + QC + WC + Trazabilidad
  - **Enterprise** (General): S/ 899/mes — + Multi-empresa + Soporte dedicado
- [ ] **F8. Landing page** `metalengineers.com.pe/erp` con pricing, demo, contacto
- [ ] **F9. Vídeo demo** 3-minutos de cada módulo principal (grabación de pantalla con voz)
- [ ] **F10. Manual de Usuario PDF** por módulo (accesible desde Ayuda en sidebar)
- [ ] **F11. Playbook de ventas** — guion para llamadas de demo, objeciones típicas, casos de éxito
- [ ] **F12. Primer cliente beta** — un taller metalmecánico amigo en RMT, 1 mes gratis a cambio de feedback

### Criterios de éxito

- ✅ Una empresa nueva se da de alta en <1 hora (RUC → wizard → datos maestros → operativa)
- ✅ Datos de Metal Engineers no se mezclan con datos de cliente beta (tenant isolation verificado)
- ✅ Cliente beta emite su primera factura desde el ERP en día 1
- ✅ Landing page publicada con pricing y formulario de contacto
- ✅ Al menos 1 demo agendada con prospecto externo

### Checkpoint al final de Fase F

> **Hito de mercado.** ERP-PRO tiene 2 empresas operando en simultáneo. Primer pago mensual recibido. Se activa el funnel de captación (ads, referidos, eventos sectoriales).

---

## Capas transversales — aplican a TODAS las fases

Estos concerns NO son una fase aparte — son prácticas que cada fase debe respetar.

### Calidad y testing

- Cada Service nuevo tiene tests unitarios (mínimo happy path + 2 edge cases)
- Migrations son idempotentes (el runner `apply_migrations.ts` ya lo asegura)
- Cambios que tocan SUNAT/contabilidad requieren test de integración con data real
- Antes de merge a `main`, se corre el set completo de tests

### Seguridad

- Toda ruta nueva pasa por `requireAuth` + `requireModulo(X)`
- Cualquier dato de empresa se filtra por `id_empresa` del JWT (Fase F en adelante)
- Credenciales de Nubefact, certificado digital, API keys → variables de entorno, nunca en código
- Rotación periódica de `CLOUDINARY_API_SECRET`, `JWT_SECRET`

### Observabilidad

- Logs estructurados (JSON) en consola — Railway los captura
- Errores críticos (falla facturación, falla pack contable) → email/webhook a Julio
- Dashboard de salud del sistema (uptime, últimas N facturas emitidas, último backup)

### Documentación

- Cada módulo tiene entrada en `CLAUDE.md` con: tablas, endpoints, gotchas
- `ESTADO.md` actualizado al cierre de cada fase con avance real
- Changelog público visible en el ERP (los usuarios ven qué cambió en cada release)

### Respaldos

- Railway backups automáticos diarios — documentar cómo restaurar
- Export mensual completo (SQL dump + archivos Cloudinary + carpeta Drive) a almacenamiento frío

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Nubefact cambia su API durante desarrollo | Media | Alto | Wrapper aislado en `NubefactService`; test de integración con ambiente sandbox semanal |
| SUNAT actualiza formato PLE | Baja | Alto | Versionar generadores por año fiscal; validar contra validador SUNAT antes de release |
| Certificado digital no se puede conseguir a tiempo | Media | Alto | Iniciar trámite en INDECOPI en semana 1 (2-3 semanas de espera) |
| Contador no está cómodo con cambio de proceso | Media | Medio | Incluir al contador en UAT de Fase D; Pack Contable debe verse igual a lo que él hace hoy |
| Operarios del taller no usan el kiosko (Fase E) | Alta | Medio | Capacitación 1:1 + incentivo (primer mes con bonificación por usar el sistema) |
| Deploy Railway se cae durante migración crítica | Baja | Alto | Migraciones en transacción + plan de rollback documentado + staging environment |
| Complejidad de BOM multinivel supera MVP | Media | Medio | Empezar con BOM de 1 nivel + 3 productos de ejemplo; ampliar después |
| Demoras por dependencia de terceros (OSE, Drive, Cloudinary) | Media | Medio | Mock en desarrollo + circuit breakers + cola de reintentos |

---

## Visión del producto terminado (septiembre 2026)

Cuando termine este plan, así será un día típico en Metal Engineers:

**8:00 AM — Julio entra al ERP.** Dashboard Gerencia muestra: caja S/ 140K, 3 cotizaciones esperando aprobación, 1 préstamo vence en 5 días, OEE promedio del taller 78%. Click en la alerta de préstamo → va directo a Préstamos.

**10:00 AM — Vendedor emite cotización** de herramientas DCC-Toromocho desde Comercial. PDF automático al Drive. Cliente aprueba por correo.

**10:15 AM — 1 click "Convertir a OT".** Sistema explota BOM, reserva 500 kg de acero del almacén, genera ruta de 7 operaciones, asigna fechas tentativas por carga de work centers.

**11:00 AM — Soldador Juan** en el taller escanea QR de la OT con tablet, marca "Iniciar operación: Soldadura", opera, marca "Terminar" 2 horas después. QC ejecuta check-list, adjunta foto, pasa.

**3:00 PM — Asistente contable** registra compra de suministros del día. Al guardar, se genera asiento contable automático en Libro Diario.

**5:00 PM — Cliente paga anticipo 50% vía Interbank.** Asistente registra cobranza → Libro Bancos auto-genera el movimiento → Dashboard se actualiza en tiempo real → Julio recibe notificación push.

**Primer día del mes siguiente — 8:30 AM** — Cron corre a las 7 AM. Pack Contable del mes anterior está en Google Drive. Contador recibe correo. Contador descarga ZIP. **Fin del reprocesamiento manual.**

**Ese mismo día — 11 AM** — Empresa nueva (taller amigo de Julio) hace signup en landing. En 45 min completa wizard, emite su primera factura. Metal Engineers factura por servicio de configuración + primer mes.

---

## Go-to-market sugerido (post-lanzamiento)

### Modelo

**SaaS mensual con setup pagado único:**
- Setup: S/ 1,500 (Starter) a S/ 5,000 (Enterprise) — cubre wizard, migración, capacitación
- Mensualidad según plan
- Implementación asistida de 2-4 semanas incluida

### Canales

1. **Referidos de Metal Engineers** — clientes, proveedores, gremio de metalmecánicos. Comisión 10% primer año.
2. **SNI (Sociedad Nacional de Industrias)** — comité de metalmecánica, eventos, presentación en reuniones.
3. **LinkedIn orgánico** — Julio publica casos reales, métricas, transformación antes/después.
4. **Contadores aliados** — programa donde contadores certificados recomiendan ERP-PRO a sus clientes. Comisión + capacitación.
5. **Ferias sectoriales** — EXPOMIN, Perumin, Conexpo. Stand con demo en vivo.

### Métricas del primer año

- **Mes 6:** 5 empresas pagando — S/ 1,500/mes MRR
- **Mes 12:** 25 empresas — S/ 7,500/mes MRR
- **Año 2:** 80 empresas — S/ 25,000/mes MRR + servicios de implementación

### Moat (ventaja defensiva)

1. **Especialización metalmecánica** — competidores genéricos no saben BOM de herramientas cimentación
2. **Cumplimiento SUNAT nativo peruano** — SAP/Odoo requieren localización costosa
3. **Precio PYME** — 10x más barato que SAP B1
4. **Cliente 0 (Metal Engineers) como caso de éxito vivo** — cualquier prospecto puede visitarlo
5. **Red de contadores aliados** — barrera de entrada para nuevos competidores

---

## Próximos pasos inmediatos (esta semana)

- [ ] **Paso 0.1:** Julio confirma arranque y elige fecha de kickoff (propuesta: lunes 28/04/2026)
- [ ] **Paso 0.2:** Iniciar trámite de certificado digital Metal Engineers en INDECOPI (para Fase B)
- [ ] **Paso 0.3:** Crear cuenta sandbox en Nubefact (para Fase B)
- [ ] **Paso 0.4:** Confirmar régimen tributario actual con el contador (RMT confirmado)
- [ ] **Paso 0.5:** Generar plan detallado de Fase A (tarea-por-tarea con TDD) en `docs/superpowers/plans/2026-04-28-fase-a-fundaciones.md`
- [ ] **Paso 0.6:** Crear worktree `fase-a-fundaciones` aislado del resto del desarrollo
- [ ] **Paso 0.7:** Ejecutar Fase A con subagent-driven-development

---

## Nota sobre ejecución

**Este es un plan maestro estratégico — cada fase (A-F) generará su propio plan detallado con pasos TDD (2-5 minutos cada uno) cuando llegue su turno de ejecución.** No se implementa una fase sin antes escribir su plan detallado.

Patrón sugerido:
1. **Monday de semana de arranque de fase** → escribir plan detallado de esa fase con `superpowers:writing-plans`
2. **Tuesday-Friday** → ejecutar con `superpowers:subagent-driven-development`
3. **Último Friday** → checkpoint + demo + commit final + merge a `main`
4. **Monday siguiente** → comenzar fase siguiente

---

## Self-review del plan

✅ **Cobertura vs brief:** todas las decisiones acordadas en sesión están presentes — régimen, facturación SUNAT, PLE, Pack Contable, Producción/BOM/WC/QC, dashboards con tabs, componentes reutilizables, audit log, periodos cerrados, multi-tenancy, go-to-market.

✅ **Sin placeholders críticos:** entregables nombrados específicamente, tablas listadas con intención, endpoints clave mencionados. Detalle TDD queda para planes de fase (intencional, este es un master).

✅ **Consistencia de tipos:** nombres de tablas y métodos coherentes entre fases (ej. `OrdenesTrabajo`/`OT` se usa igual en E4, E13, E22; `ConfiguracionEmpresa` en A1 coincide con F1 aunque cambie de propósito).

✅ **Dependencias explícitas:** cada fase declara sus precondiciones.

✅ **Riesgos identificados** con mitigación concreta.

✅ **Checkpoints de validación** al final de cada fase con criterio de "demo funcional" no "código existe".

---

*Plan generado: 22/04/2026. Próxima revisión: al finalizar cada fase.*

# Auditoría V4 — ERP-PRO

**Fecha:** 2026-06-29
**Alcance:** Todo el ERP — Seguridad + Funcionamiento + Calidad.
**Método:** 5 agentes en paralelo (read-only) sobre subsistemas no solapados + chequeos transversales (build, secretos, dependencias). Backend ~19.700 líneas / 40 services, Frontend ~23.400 líneas / 27 archivos, `index.ts` (~330 rutas), adapter `database/connection.ts`.
**Naturaleza:** READ-ONLY. Ningún archivo fue modificado. Esto es un inventario de hallazgos para decidir remediación.

## Resumen ejecutivo

| Severidad | Cantidad |
|---|---|
| 🔴 Crítico | 7 |
| 🟠 Alto | 17 |
| 🟡 Medio | ~23 |
| ⚪ Bajo | ~27 |

**Dos temas sistémicos atraviesan casi todo:**

1. **El adapter MySQL→Postgres (`connection.ts`) tiene huecos.** El código se escribió en sintaxis MySQL y se traduce en runtime. Cada patrón no cubierto rompe **solo en producción** (Supabase), no en MySQL local — fallo silencioso. Cluster: C1, C2, A4, A5, B-adapter.

2. **Facturación / SUNAT tiene riesgos latentes que DETONAN al activar Nubefact REAL o presentar el PLE.** Hoy en modo STUB no se notan. Cluster: C3, C4, C5, A8, A9, A10, varios medios de PLE. **Bloqueantes de Fase B.**

**Estado base sano:** build `tsc --noEmit` limpio (deploy no bloqueado), sin secretos en git ni historial, cookie httpOnly + CSP + JWT guard correctos, orden de rutas correcto, autorización por módulo bien cubierta, sin SQLi por interpolación de input de usuario en el grueso del código.

---

## 🔴 CRÍTICOS

### C1 — `INSERT ... VALUES ?` (bulk MySQL) no soportado por el adapter Postgres
- **Dimensión:** Funcionamiento · **Confianza:** Alta · **Activo ahora**
- **Ubicación:** `app/modules/purchases/PurchaseService.ts:158-161` (`registrarCompra`) → `POST /api/compras`
- **Qué:** Usa la sintaxis bulk de mysql2 `INSERT INTO DetalleCompra (...) VALUES ?` con array anidado. El adapter convierte `?`→`$1` y se lo pasa crudo a `pg`, que NO expande arrays anidados en filas múltiples → error de binding. El propio `AuthService.ts:175-176` documenta que este patrón "no funciona en Postgres" y lo evita con loop, pero PurchaseService quedó sin migrar.
- **Impacto:** Registrar una compra con líneas de detalle (el caso normal) falla y rollbackea. Módulo central (Logística→Almacén).
- **Fix:** Reemplazar el bulk por INSERT fila-por-fila en loop (como `updateCompra:93` / `AuthService.asignarModulos`). **Verificar en BD si hoy se crean compras directas por esta vía o está de facto muerta.**

### C2 — `DELETE ... LIMIT 1` no soportado por Postgres
- **Dimensión:** Funcionamiento · **Confianza:** Alta · **Activo ahora**
- **Ubicación:** `app/modules/finance/FinanceService.ts:508-510` (`anularGasto`) → `POST /api/gastos/:id/anular`
- **Qué:** `DELETE FROM CostosServicio WHERE ... LIMIT 1`. Postgres no soporta `LIMIT` en `DELETE` y el adapter no lo traduce.
- **Impacto:** Anular un gasto con `id_servicio` vinculado lanza error de sintaxis → rollback. No se puede anular. (Solo se ejecuta cuando el gasto tiene servicio vinculado.)
- **Fix:** Quitar `LIMIT 1` usando sub-select por PK (`WHERE id_costo = (SELECT ... LIMIT 1)`), o agregar traducción `DELETE ... LIMIT n` → `WHERE ctid IN (SELECT ctid ... LIMIT n)` al adapter.

### C3 — Nubefact se llama DENTRO de la transacción → comprobante fantasma
- **Dimensión:** Funcionamiento · **Confianza:** Alta · **Detona en Fase B (Nubefact REAL)**
- **Ubicación:** `app/modules/facturacion/FacturaService.ts:208-258` y `423-476`
- **Qué:** `await NubefactService.emitir()` (efecto externo irreversible: envía a SUNAT) ocurre antes del INSERT en `Facturas`, dentro de la tx. Si el INSERT falla (UNIQUE serie+numero, timeout, deadlock) → rollback → comprobante emitido en SUNAT pero inexistente en el ERP.
- **Impacto:** Descuadre del Registro de Ventas, número quemado, PDF imposible. En STUB no se nota.
- **Fix:** Reservar correlativo + INSERT en estado PENDIENTE + commit → llamar Nubefact FUERA de la tx → UPDATE con el resultado.

### C4 — Dos fuentes de correlativo de factura desincronizadas
- **Dimensión:** Funcionamiento · **Confianza:** Alta · **Detona en Fase B**
- **Ubicación:** `FacturaService.ts:209` (`crearYEmitir` usa `CorrelativosFactura`) vs `391-395` (`emitirDesdeCotizacion` usa `MAX(numero)+1`)
- **Qué:** Las dos rutas de emisión usan fuentes distintas que no se actualizan mutuamente → pueden asignar el mismo número sobre la misma serie.
- **Impacto:** Numeración duplicada/gaps = rechazo SUNAT. Combinado con C3 → fantasma.
- **Fix:** Unificar: `emitirDesdeCotizacion` arma el input y delega en `crearYEmitir`. Eliminar `MAX(numero)+1`.

### C5 — El PLE Registro de Ventas incluye comprobantes `SIMULADO`
- **Dimensión:** Funcionamiento (tributario) · **Confianza:** Alta · **Detona al presentar PLE**
- **Ubicación:** `app/modules/facturacion/PLEExporter.ts:48-49` (`WHERE estado_sunat IN ('ACEPTADA','SIMULADO','OBSERVADA')`)
- **Qué:** El PLE 14.1 incluye comprobantes en modo STUB (nunca enviados a SUNAT) marcándolos como válidos (estado `1`).
- **Impacto:** Presentar el PLE con la app en STUB declara ventas sobre comprobantes inexistentes → riesgo fiscal directo.
- **Fix:** Excluir `SIMULADO` del PLE de ventas, o bloquear la exportación mientras `NubefactService.diagnostico().modo === 'STUB'`.

### C6 — El importador masivo NO convierte USD→PEN
- **Dimensión:** Funcionamiento (multi-moneda) · **Confianza:** Media-Alta · **Activo si se usó carga masiva**
- **Ubicación:** `app/modules/importador/ImportadorService.ts:147-163`
- **Qué:** El CSV trae `moneda/tipo_cambio/monto_base/total_base` y se insertan crudos. La regla del ERP es `monto_base` SIEMPRE en PEN (`ingresado*tipo_cambio`). Un gasto/compra USD queda con el número USD en una columna que todo el sistema asume PEN.
- **Impacto:** Todo gasto/compra histórico en USD subvaluado ~3.7× al sumarse con PEN en caja/CxP. Descuadre sistémico.
- **Fix:** Si `moneda==='USD'`, multiplicar montos × `tipo_cambio` antes del INSERT; o documentar que el Excel debe traer PEN (hoy el template es ambiguo). **Verificar si ya se importó data histórica USD por esta vía.**

### C7 — El importador masivo no deduplica re-importación
- **Dimensión:** Funcionamiento · **Confianza:** Alta · **Activo si se usó carga masiva**
- **Ubicación:** `ImportadorService.ts:123-204` (loop `commit`)
- **Qué:** Re-subir el mismo Excel de gastos/compras/préstamos duplica TODO (esas tablas no tienen unique natural). Solo cotizaciones tiene `UNIQUE(nro_cotizacion)`.
- **Impacto:** Caja y CxP duplicadas con plata real si el usuario re-sube por confusión.
- **Fix:** Dedup por clave natural (gasto: concepto+fecha+monto+proveedor; compra: nro_factura+id_proveedor) o lotes idempotentes con hash.

---

## 🟠 ALTOS

### Seguridad — XSS residual (la pasada de Fase 1 dejó huecos)
- **A1** — `public/js/pages/Administracion.js:724` — adjuntos de rendición: `href="${a.url}"` y `${a.nombre_archivo}` sin escapar. `nombre_archivo` raw = XSS; `href` sin validar esquema permite `javascript:`/`data:`. Ejecuta en sesión del GERENTE. Confianza Alta.
- **A2** — `public/js/pages/Logistica.js:1671-1679` — datos de proveedor (`telefono/email/contacto` + `banco_*`) raw en innerHTML al armar OC. Stored-XSS: quien edita un proveedor inyecta script. Confianza Alta.
- **A3** — Patrón agregado: `Finanzas.js:626/2345/2607/2807`, `Administracion.js:708`, `Comercial.js:734-735` — ~8 campos de BD sin escapar donde el campo hermano de la misma línea SÍ usa `escapeHtml`. Son los que se le escaparon a Fase 1. Confianza Alta. **Fix de los tres: pasada de `escapeHtml()`/`escapeAttr()` + validar `href` empieza con `http(s):`.**

### Funcionamiento — matemática de plata / multi-moneda
- **A4** — `CobranzasService.ts:662` (`getDashboardFinanzas`) — KPI "IGV del mes" hace **doble conversión**: `Cotizaciones.igv` ya está en PEN (`CotizacionService.ts:267-270`) y la query vuelve a `igv * tipo_cambio` para filas USD → infla ~3.7× el IGV de cotizaciones Perfotools. Riesgo de aprovisionar mal el pago de IGV a SUNAT. Fix: `SUM(igv)` sin `* tipo_cambio`. Confianza Alta.
- **A5** — `app/modules/purchases/PurchaseService.ts:40-105` (`updateCompra`) — la reversión del **costo promedio ponderado** al editar una compra (`(stock*cpp − cant*precio)/stockRev`) es matemáticamente incorrecta salvo el caso trivial; si hubo consumos intermedios, contamina el promedio. Corrompe el valorizado de inventario (margen de Producción, valor de stock, balance de cotizaciones). Fix: recalcular CPP desde el kárdex completo, o forzar anular+rehacer. Confianza Media-Alta.

### Funcionamiento — integridad de OC / caja
- **A6** — `OrdenCompraService.ts:1467-1542` (`_revertirCascada`) — `eliminar()`/`mandarABorrador()` borran `CostosServicio`/`MovimientoBancario`/`Transacciones` por `LIKE '%OC <nro_oc>%'`. El `nro_oc` es por centro de costo → `001 - 2026` existe en varios CC simultáneamente. El LIKE matchea movimientos de **otras OCs** con el mismo correlativo → borra caja ajena silenciosamente. (El propio `obtener():2143` ya se defiende filtrando por `ref_id`, la cascada no.) Fix: borrar por `ref_tipo+ref_id`, nunca por texto. Confianza Alta.
- **A7** — OC sin segregación de funciones — `index.ts:1875`: todas las transiciones (`aprobar`, `aprobar-para-pago`, `registrar-pago`, `facturar`, `cerrarImportacion`) gateadas solo por `requireModulo('LOGISTICA')`. `aprobar():351` dejó de validar rol. `registrarPago` no exige firmas cumplidas como precondición → un usuario LOGISTICA arma, aprueba y dispara el egreso bancario. Fix: exigir GERENTE/APROBADOR para `aprobar-para-pago` y `registrar-pago`, o enforce del umbral de firmas. Confianza Media (podría ser intencional por el modelo de firmas + UAT con todos GERENTE — **verificar con Julio**).

### Funcionamiento — facturación SUNAT (detonan en Fase B)
- **A8** — `NubefactService.ts:168,194` — `fetchWithRetry` re-POSTea la emisión 3× sin clave de idempotencia → doble emisión si la primera respuesta se perdió. Y `NubefactPayloadBuilder.ts:230` (`mapResponse`) cae por default en `ACEPTADA` ante un body de error sin `.errors` → marca aceptada una rechazada. Fix: no reintentar POST de emisión (consultar estado tras fallo); default `ERROR` no `ACEPTADA`. Confianza Alta.
- **A9** — `FacturaService.ts:199-201, 401-421` — `emitirDesdeCotizacion` usa totales globales de la cotización pero recalcula detalles con otro redondeo → la suma de ítems puede no cuadrar con el total enviado a Nubefact → rechazo SUNAT. Fix: total = Σ detalles redondeados (fuente única). Confianza Alta.
- **A10** — `NotaCreditoService.ts:~301-347` — la NC entrante NO revierte caja/inventario/kárdex, solo baja `total_base`. Para compras de Almacén el stock no se ajusta; si estaba PAGADA, el dinero ya salió. Al llegar `total≈0` fuerza `estado_pago='PAGADO'` aunque nunca se pagó. Fix: encadenar ajuste de kárdex; estado `ANULADO_POR_NC`; validar `subtotal+igv≈total`. Confianza Alta.
- **A11** — `FacturaPDFService.ts:282` — compara `estado_sunat === 'ACEPTADO'` (masculino) pero el ENUM real es `'ACEPTADA'` → el pie legal obligatorio de la representación impresa nunca aparece. Fix de 1 carácter. Confianza Alta.

### Seguridad / robustez
- **A12** — `database/connection.ts:269-271, 298-300` — el auto-`RETURNING *` extrae `insertId` del **primer row**; para multi-row da el primero; para `INSERT ... ON CONFLICT DO NOTHING` que no inserta, `insertId=null` sin señal de error → relaciones huérfanas. Trampa para features futuras. Confianza Media.
- **A13** — `app/modules/finance/ContraparteService.ts:171-173` — `empresaCond = AND empresa = '${filtros.empresa}'` interpolado (no placeholder). El tipo TS `'METAL'|'PERFOTOOLS'` no valida en runtime. SQLi si la ruta no valida el enum. **Verificar validación de ruta.** Confianza Media.
- **A14** — `TemplateGenerator.ts` / `ImportadorService.ts:218-242` / `index.ts:1834` — el `escape()` de CSV no prefija valores que empiezan con `= + - @` → formula injection si el CSV se re-emite/abre en Excel. Explotabilidad hoy limitada. Confianza Media.
- **A15 (dependencia)** — `xlsx` (SheetJS): Prototype Pollution + ReDoS (HIGH), **sin fix upstream**. Se usa para export Excel/PLE y parse de importador. `npm audit`: 11 vulnerabilidades (6 high, 5 moderate). Mitigar: aislar el parseo, validar input, o migrar a `exceljs` para lo que se pueda.

---

## 🟡 MEDIOS

**Transaccionalidad / atomicidad**
- **M1** — `CobranzasService.ts:934-960` (`createGastoBancario`) y `977-1016` (`registrarPagoIGV`) + sus deletes: 3 escrituras (INSERT + UPDATE Cuentas + INSERT MovimientoBancario) SIN transacción → descuadre de Libro Bancos si falla a mitad. `registrarCobranza` sí es atómica; estas no. Fix: envolver en `beginTransaction/commit/rollback`.
- **M2** — `FacturaService.ts:100-126, 209-279` — la fila de `CorrelativosFactura` queda bloqueada durante toda la llamada HTTP a Nubefact (retries de segundos) → serializa emisiones y puede agotar el pool de 10 conexiones. Mismo fix que C3.

**Seguridad**
- **M3** — `app/middlewares/auth.ts:7` y `AuthService.ts:8` — `JWT_SECRET || 'erp_dev_only...'` fallback hardcodeado. Mitigado hoy por el `process.exit(1)` en `index.ts` si falta la var, pero si se importan estos módulos en otro entry-point (scripts/tests/worker) firman JWT con secreto público → forja de GERENTE. Fix: eliminar el fallback, evaluar en import-time.
- **M4** — Rutas de escritura SIN `validateParams(Zod)` (todas con `requireAuth`+`requireModulo`, riesgo = integridad/mass-assignment, no acceso): familia `/cobranzas` (registrar/cuentas/movimientos/gastos-bancarios/pagos-impuestos/importar-eecc/saldo-inicial/facturar/cobrar), `/transferencias-internas`, `/prestamos/contrapartes`, casi todo `ocRouter`, `/cotizaciones/:id/metadata|fecha`, `rendiciones`, `centros-costo`, `/facturas`. Montos/fechas/enums sin coerción. Fix: schemas Zod por dominio.
- **M5** — `index.ts:2652-2779` (`autoHealDatabase()`) — corre en CADA arranque; ante un falso positivo del detector de "DB incompleta" puede re-aplicar schema/migraciones y **resetear la contraseña del gerente a `Metal2026!`** (`ON CONFLICT (email) DO UPDATE SET password_hash`). Vector de toma de control + conecta con el bug latente conocido de `setup_db`/DROP DATABASE. Fix: gatear tras `ENABLE_DB_AUTOHEAL=1`; nunca pisar el password de un gerente existente.
- **M6** — `AlertasService.ts:435,462,490,515,538` — `INTERVAL '${UMBRAL} days'` interpolado. Hoy NO inyectable (constante=15) pero patrón peligroso si `UMBRAL` se vuelve configurable. Fix: `make_interval(days => $1)`.

**Funcionamiento — inventario / multi-moneda / KPIs**
- **M7** — `InventoryService.ts:201-293` + `CatalogService.ts:204` — el consumo no persiste `costo_unitario` del movimiento y la reversión (`anularServicio`) devuelve unidades sin recomputar valor → valorizado desviado tras anulaciones; kárdex no auditable a nivel costo.
- **M8** — `CobranzasService.ts:683-691` (`depositos_pendientes`) — el bucket "USD" reporta montos en PEN rotulados como USD (todos los campos ya están en PEN). Confunde lectura. Posible intencional ("PEN-equivalente") — verificar rótulo en el front.
- **M9** — `CobranzasService.ts:1655-1664` — dedup de import EECC por `monto=?` con igualdad exacta sobre numeric → duplica si el mismo movimiento se cargó a mano con redondeo distinto (patrón ya documentado en memoria). Fix: tolerancia `ABS(monto-?) < 0.01`.
- **M10** — `CobranzasService.ts:1135-1153` (`conciliarMovimiento`) — `PAGO_IMPUESTO` se mapea a `ref_tipo='OTRO'` al conciliar a mano, pero el Libro Bancos busca `ref_tipo='PAGO_IMPUESTO'` → pierde etiqueta/vínculo. Fix: mapear a sí mismo.
- **M11** — `FinanceService.ts:162-176` (`getCuentasPorCobrar`) — el SELECT no trae `monto_retencion` pero el cálculo lo usa → retención siempre 0, CxC sobreestimada (acotado si Servicios es legacy). Fix: agregar la columna o quitar la resta.

**Funcionamiento — OC / facturación / importador**
- **M12** — `OrdenCompraService.ts:114-129` (`proximoNumero`) — `SELECT ... ORDER BY id_oc DESC LIMIT 1` sin lock; el retry-on-duplicate citado en docs **no está en `crear()`** → bajo concurrencia, OC duplica correlativo o falla con `23505` críptico. Fix: retry-on-23505 o secuencia con lock.
- **M13** — `OrdenCompraService.facturar:741-803` (rama CONTADO en RECEPCION) — puede generar el EGRESO de una OC CONTADO que aún no pasó por `registrarPago`; si luego se registra el pago, **doble egreso en caja**. Fix: verificar comprobante/movimiento existente antes de crear.
- **M14** — `PLEExporter.ts:209-212` — serie/número del proveedor parseados con `split('-')` frágil + campo tipo-documento hardcodeado `'01'` (ignora boletas, RH `02`). PLE 8.1 con tipo/serie incorrectos = observaciones SUNAT.
- **M15** — `PLEExporter.ts:142, 281-282` — `indMoneda='1'` siempre y montos USD sin convertir a PEN. SUNAT exige el libro valorizado en moneda nacional.
- **M16** — `FacturaService.ts:201-202, 469` — `total = subtotal + igv - descuento_global` pero el IGV se calcula sobre `subtotal` antes del descuento → base e IGV declarados no cuadran con el total. Fix: definir si el descuento reduce base gravada.
- **M17** — `NotaCreditoService.ts:166-172` — valida que la NC no exceda el total pero no la coherencia interna `subtotal+igv≈total`. Fix: `Math.abs(subtotal+igv-total) < 0.01`.
- **M18** — `ImportadorService.ts:147-163` — no valida existencia de `id_proveedor`/`id_servicio` antes de insertar; error genérico sin fila/campo. Fix: pre-validar FKs en preview.
- **M19** — `ImportadorService.ts:276,305,361` — fechas exigen `YYYY-MM-DD` pero el flujo XLSX no normaliza fechas formateadas por Excel (`15/03/2022` o serial) → rebotan datos válidos. Fix: normalizar serial/Date de Excel.
- **M20** — `ImportadorService.ts:124-129, 203` — `INSERT IGNORE`→`ON CONFLICT DO NOTHING` sin target + `insertados++` incondicional → conteo mentiroso y posible duplicación de proveedores si no hay `UNIQUE(ruc)`. Fix: confirmar UNIQUE, contar por filas devueltas.

**Funcionamiento — uploads / rendiciones**
- **M21** — `GoogleDriveService` — `folderCache` (Map module-level) sin TTL/invalidación → si una carpeta de Drive se borra/recrea, el ID stale rompe uploads hasta reiniciar el proceso. Fix: invalidar ante 404 + reintentar.
- **M22** — `RendicionService.ts:524-541` — `importe_recibido` se fija al crear (`= oc.total`) y no se re-sincroniza si la OC cambia de monto → el PDF de rendición (firmado/archivado) muestra saldo incorrecto. Fix: recalcular contra el total vigente al firmar.
- **M23** — 7 modales que cierran por backdrop (viola gotcha #28): `Compras.js:261` (form de compra con plata → pierde lo tipeado), `Finanzas.js:1848/1896/2204`, `Comercial.js:163/219/2055`. Fix: eliminar la línea `ov.onclick = (e)=>{ if(e.target===ov)... }`.

---

## ⚪ BAJOS

**Seguridad**
- B1 — `AuthService.ts:303-304,118` — política de password mín. 6 chars sin complejidad + bcrypt cost 10. Subir a 10-12 chars / cost 12.
- B2 — `AuthService.ts:13-22` (`login`) — mensajes distintos para credencial inválida vs cuenta desactivada + sin timing constante → enumeración de usuarios. Fix: mensaje genérico + bcrypt dummy.
- B3 — `index.ts:129` — `express.json()` sin `limit` y sin rate-limit global (solo en `/login`). Endpoints pesados (PLE/ROC Excel/import) sin throttle → DoS de recursos por usuario autenticado.
- B4 — CSRF posture: sin token anti-CSRF, defensa 100% en `SameSite=Strict` + CORS. Aceptable hoy; anotar si se relaja a Lax o se agregan orígenes.
- B5 — `index.ts:1438-1444,1480` — `/facturas` POST sin Zod (req.body crudo al payload SUNAT).
- B6 — `NubefactService.ts:187-209` — `fetch` sin `AbortController`/timeout (cuelga manteniendo el lock de correlativo). Token NO se loguea (OK).

**Funcionamiento**
- B7 — `api.js` ~14 helpers de upload directo (multipart/PDF/Excel) tienen `credentials` pero NO replican el bloque 401→login de `fetchAPI` → toast confuso con sesión expirada en vez de redirigir. UX.
- B8 — `OrdenesCompra.js:585,600,713,1641,1642,1647` — `Number(x).toFixed()` sin `|| 0` → imprime `"S/ NaN"` si el campo llega null. Display-only. Fix: `Number(x||0)`.
- B9 — `CobranzasService.ts:1163-1166` (`deleteMovimientoBancario`) — borra sin tocar la cobranza/gasto/TI asociada → contraparte huérfana. Fix: bloquear si `fuente='AUTO'` o linkeado.
- B10 — `TransferenciasInternasService.ts:204-205` — `crear` no valida `monto_destino_real > 0` (sí lo hace `actualizar`) → división por cero → `tcReal=Infinity`. Edge case.
- B11 — `TributarioService.ts:74-80` (`registrarPagoImpuesto`) — ruta divergente que inserta sin `id_cuenta`/sin MovimientoBancario, mientras `calcularSaldosNetos` sí suma `PagosImpuestos` como egreso → posible descuadre según qué ruta use el front. Fix: consolidar en `registrarPagoIGV`.
- B12 — `FinanceService.ts:18-25,91-101` — Dashboard Gerencial lee `Cuentas.saldo_actual` directo (contra la regla "fuente única = `calcularSaldosNetos()`") → puede diferir de Finanzas.
- B13 — `CobranzasService.ts:1873,1884` (`sugerirMatchPagoOC`) — compara `mov.monto` (USD para caja Perfotools) contra `p.monto_pen` (PEN) → la sugerencia nunca matchea en USD.
- B14 — `CobranzasService.ts:1390-1400` — KPI comisiones puede doble-contar un N/D spliteado si el original IMPORT_EECC conserva "COM." en `tipo_movimiento_banco`. Cosmético.
- B15 — `CotizacionService.ts:231-242` (`validarCorrelativoManual`) — `new Date(fecha)` (UTC) vs `new Date()` (local) → ventana de validación corrida 1 día en bordes (Railway UTC vs Perú UTC-5). Mismo patrón del bug Saldo Banco. Fix: comparar como strings `YYYY-MM-DD`.
- B16 — `InventoryService.ts:38-48` (`createItem`) — SKU derivado de `ORDER BY id_item DESC` → colisión si los SKU no son estrictamente secuenciales por id. Fix: `MAX(CAST(split_part(sku,'-',2) AS int))` por prefijo.
- B17 — `OrdenCompraPDFService.ts:190` — título `Nº ${nro_oc} - ${centro_costo}` con `nro_oc='NNN - YYYY'` → doble guion visual en el PDF al proveedor.
- B18 — `NubefactService.ts:121-123` + `FacturaPDFService.ts:84-85` — RUC `20610071962` hardcodeado en QR/fallback (rompe multi-tenant del plan SaaS).
- B19 — `NubefactPayloadBuilder.ts:144` — si `aplica_igv=false` igual manda `tipo_de_igv:1` gravado → cualquier venta exonerada se emitiría mal. Hoy todas gravadas.

**Calidad**
- B20 — `CatalogService.ts` (Servicios legacy `@deprecated`) sigue montado con rutas de escritura vivas (`POST/PUT/DELETE /servicios`) → crear un Servicio legacy mete plata fantasma en Transacciones. `createServicio:87` genera código por `Date.now().slice(-6)` (colisión). Fix: retirar rutas de escritura.
- B21 — `Servicios.js` (front, 384 líneas) — único archivo sin `escapeHtml`, desconectado del router. Borrarlo (ya planeado en su cabecera).
- B22 — Uso masivo de `any` en payloads de services (`registrarCompra(data:any)`, etc.) — ocultó bugs reales (insertId heurístico, `'ACEPTADO'` vs `'ACEPTADA'`). Tipar inputs financieros + Zod.
- B23 — `ROCService.ts:120-150` (N+1: una query de descripción por OC) + `ImportadorService.ts` (insert fila por fila). Lentitud/timeout con volumen.
- B24 — `FacturaService.ts:140-299` vs `348-517` — `crearYEmitir` y `emitirDesdeCotizacion` duplican cálculo/payload/INSERT con divergencias (causa raíz de C4 y A9). Unificar.
- B25 — `ImportadorService.ts:44-67` — parser CSV propio hace `split('\n')` antes de parsear comillas → un campo con salto de línea entre comillas corre columnas silenciosamente. Usar el parser de `xlsx`.
- B26 — `.env.example` desactualizado: documenta MySQL/Railway (`DB_HOST`...) cuando la BD real es Supabase, usa `SESSION_SECRET` en vez de `JWT_SECRET`, faltan `CLOUDINARY_*`/`GOOGLE_DRIVE_*`/`JWT_SECRET`. Un deploy nuevo siguiéndolo falla.
- B27 — Typos de cara al usuario / docs desalineados: `TemplateGenerator.ts:412` ("vovlé"); doc-comment de `ImportadorService` menciona `clientes`/`cobranzas` inexistentes.

---

## ✅ Verificado y sano (no son hallazgos)

- **Build:** `npx tsc --noEmit` limpio (exit 0). Deploy a Railway no bloqueado.
- **Secretos:** nada sensible trackeado en git ni en historial; `.gitignore` cubre `.env*` + `google-drive-credentials.json`.
- **Auth/CSP:** cookie httpOnly + Secure(prod) + SameSite=Strict + token nunca en body; CSP en cabecera helmet; `JWT_SECRET` con `process.exit(1)` en prod.
- **errorHandler:** no filtra el error pg crudo al cliente (doble cinturón); stack solo en dev.
- **Orden de rutas:** las específicas van antes de `/:id` con `validateIdParam`. Correcto.
- **Autorización por módulo:** cobertura amplia y correcta; sin rutas de escritura sin `requireAuth`.
- **SQLi:** el grueso usa `?` parametrizado; las excepciones (A13 ContraparteService, M6 AlertasService) son enum-tipado / constante, no input crudo.
- **Landed cost (importaciones Perfotools):** prorrateo por valor correcto (suma 100%, conversión USD→PEN consistente, lock pesimista, snapshot congelado). Sin hallazgos.
- **`saldoBancoClasificador.ts`:** sólido (isoDay UTC, regla dif≈0⇒CUADRADO, cadena incompleta⇒PARCIAL).
- **Funciones con `beginTransaction`:** `registrarCobranza`/`editarCobranza`/`eliminarCobranza`/`createGasto`/`splitMovimientoNDBundle`/transferencias/préstamos son atómicas con `FOR UPDATE`.
- **Cache-buster:** consistente (`20260629r1`) en los 22 imports de `app.js` + `index.html`. Sin divergencia.
- **Frontend:** solo 1 `console.log`; localStorage sin token; modal de pago de OC valida bien client-side sin doble-submit.

---

## Plan de remediación sugerido (orden propuesto)

**Tanda 1 — Críticos activos + quick wins de seguridad (1 sesión):**
- C1 (PurchaseService bulk INSERT) + C2 (anularGasto LIMIT) — verificar uso real primero.
- A1/A2/A3 (XSS residual ~8 campos) — escape, rápido, seguridad.
- A11 (PDF `'ACEPTADO'`→`'ACEPTADA'`) — 1 carácter.
- M23 (7 modales backdrop) — viola regla, rápido.

**Tanda 2 — Bloqueantes de Fase B (antes de activar Nubefact REAL / presentar PLE):**
- C3, C4, C5, A8, A9, A10, M2, M14, M15, M16, M17. Es un sub-proyecto de facturación/SUNAT por sí solo.

**Tanda 3 — Antes de cualquier carga masiva por el importador genérico:**
- C6, C7, M18, M19, M20, B25. Verificar si ya se importó data y revisar lo cargado.

**Tanda 4 — Integridad de plata / sistémico:**
- A4 (IGV doble), A5 (CPP), A6 (cascada LIKE), A7 (segregación OC), M1 (atomicidad gastos), M5 (autoHeal password), M4 (Zod en escrituras).

**Tanda 5 — Adapter hardening + higiene:**
- A12, B-adapter (YEAR/MONTH/DAY anidado), A14 (CSV injection), A15 (xlsx dep), B26 (.env.example), B1/B2 (password), limpieza de legacy (B20/B21).

---

*Generado por auditoría multi-agente read-only. Todos los números de línea son del estado del repo al 2026-06-29 en la rama `claude/fase3-libro-bancos-indicador-honesto`. Las marcas de Confianza Media/Baja requieren verificación de Julio antes de actuar.*

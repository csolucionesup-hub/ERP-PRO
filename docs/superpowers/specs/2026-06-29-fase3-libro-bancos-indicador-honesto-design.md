# Fase 3 — Libro Bancos: indicador honesto del "Saldo Banco (EECC)"

**Fecha:** 2026-06-29
**Estado:** Diseño aprobado (pendiente revisión de spec por Julio)
**Alcance:** Chico. Sin migración de BD, sin tabla nueva, sin tipeo extra para el usuario.

## Problema

El KPI **"Saldo Banco (EECC)"** del Libro Bancos compara el cierre real del banco contra el `saldo_final` del ERP y muestra "✅ Cuadrado" o "⚠ Dif S/ X".

Hoy ese "saldo banco" se deriva **solo de las filas `fuente='IMPORT_EECC'`** siguiendo la cadena de `saldo_contable`. Cuando el último movimiento real del mes se cargó **a mano** (`fuente='MANUAL'`/`'AUTO'`, sin `saldo_contable`), la cadena se corta antes del cierre verdadero y el KPI muestra un **"Dif" falso** — aunque la cuenta cuadra de verdad (el `saldo_final` ya es correcto).

**Verificado contra extractos oficiales Interbank (sesión 2026-06-29):**
- **Marzo Soles:** cierre banco 1,121.55 = `saldo_final` 1,121.55 → **cuadra**, pero el KPI muestra "Dif S/ 130.80" (los 2 últimos movs del mes —CABLE −120, SEDAPAL −10.80— son `MANUAL`, cortan la cadena en 1,252.35).
- **Abril Soles:** Dif 0 → "Cuadrado" (el último mov del mes fue un EECC, la cadena llega al cierre real). Correcto hoy.
- **Mayo Soles:** probable "Dif" falso (últimos movs `MANUAL`).
- **Junio (Soles y USD):** sin EECC importado → "—".

**Insight clave:** el "Dif falso" solo aparece en el **estado mezclado** (manuales + EECC), que es el flujo transitorio (backfill / aprendizaje de la app). En el flujo de régimen (importar el EECC **completo** a fin de mes), la cadena queda entera y el Dif sale real solo. El `saldo_final` es y sigue siendo el juez correcto del cuadre.

## Objetivo

Que la caja "Saldo Banco (EECC)" **deje de mostrar un Dif falso**. En vez de un número engañoso cuando la cadena está incompleta, muestra un estado neutro que guía al usuario ("importá el EECC completo"). Cuando los números **coinciden** (Dif ≈ 0), siempre dice "Cuadrado" (así Abril y cualquier mes ya cuadrado no cambian). Solo grita "Dif" cuando está **seguro** (EECC completo).

## No-objetivos (YAGNI)

- **No** se toca `saldo_final` (ya es correcto), ni `comisiones`, ni `saldo_inicial`, ni el importador de EECC, ni la conciliación.
- **No** se agrega un subsistema para declarar el cierre a mano (descartado: el flujo real es importar el EECC; declarar sería tipeo extra innecesario en una app joven).
- **No** se intenta auto-reparar cadenas fragmentadas ni re-deducir el cierre desde movimientos manuales.

## Comportamiento — 4 estados

La caja "Saldo Banco (EECC)" pasa a tener un estado explícito:

| Estado | Condición | Caja muestra | Color |
|---|---|---|---|
| **CUADRADO** | Hay EECC y `\|saldo_banco − saldo_final\| ≤ 0.01` | saldo_banco + "✅ Cuadrado" | verde |
| **DIF** | Hay EECC, no cuadra, **y la cadena EECC es completa** | saldo_banco + "⚠ Dif S/ X" | rojo |
| **PARCIAL** | Hay EECC, no cuadra, **y la cadena está incompleta/fragmentada** | "Parcial" + "Importá el EECC completo del mes para cuadrar" (sin número de Dif) | ámbar |
| **SIN_EECC** | No hay filas `IMPORT_EECC` | "—" (el banner "Falta subir el EECC" ya existe) | gris |

**Regla de oro:** Dif ≈ 0 ⇒ siempre **CUADRADO**, sin importar si hubo manuales. Por eso **Abril no cambia**.

## Lógica de detección (sin datos nuevos)

Se extrae la clasificación a una **función pura testeable** `clasificarSaldoBanco({ eeccSaldo, saldo_inicial, saldo_final })` → `{ saldo_banco, diferencia, estado }`. Reusa el cálculo de cadena que ya existe en `getLibroBancos` (antes/terminales).

```
TOL = 0.01
cents(n) = round(n * 100)

eeccSaldo = movimientos con fuente='IMPORT_EECC' y saldo_contable != null

si eeccSaldo está vacío:
    → { saldo_banco: null, diferencia: null, estado: 'SIN_EECC' }

por cada fila e de eeccSaldo:
    e.antes = cents(saldo_contable − (tipo==='ABONO' ? +monto : −monto))   // "saldo antes"
antesSet = { e.antes }
saldoSet = { cents(saldo_contable) }

terminales = filas cuyo cents(saldo_contable) NO está en antesSet   // fin(es) de cadena
inicios    = filas cuyo e.antes NO está en saldoSet                 // inicio(s) de cadena

si terminales está vacío:           // cadena en bucle, cierre indeterminable
    → { saldo_banco: null, diferencia: null, estado: 'PARCIAL' }

// saldo_banco = terminal de mayor fecha_proceso (isoDay), desempate por id_movimiento
//   (lógica actual ya implementada, incluye el fix isoDay del bug #saldo-banco-fecha-sort)
saldo_banco = terminalElegido.saldo_contable
dif = round(saldo_banco − saldo_final, 2)

si abs(dif) ≤ TOL:
    → { saldo_banco, diferencia: dif, estado: 'CUADRADO' }

// no cuadra: ¿podemos confiar en que saldo_banco es el cierre real?
cadenaCompleta = (terminales.length === 1)
              && (inicios.length === 1)
              && (abs(inicios[0].antes − cents(saldo_inicial)) ≤ 1)   // en centavos

si cadenaCompleta:
    → { saldo_banco, diferencia: dif, estado: 'DIF' }      // descalce REAL
sino:
    → { saldo_banco, diferencia: null, estado: 'PARCIAL' } // no exponer Dif engañoso
```

**Sesgo a propósito:** ante la duda (no cuadra y la cadena no es demostrablemente completa), **no alarma** → PARCIAL. El `saldo_final` sigue siendo el juez real del cuadre.

### Resultado esperado contra data real
- **Marzo:** 13 EECC, 5 terminales (cadena fragmentada por manuales), dif=130.80≠0 → **PARCIAL**.
- **Abril:** dif=0 → **CUADRADO** (sin cambios respecto a hoy).
- **Mayo:** dif≠0, cadena fragmentada → **PARCIAL**.
- **Junio (Soles y USD):** sin EECC → **SIN_EECC** ("—").

## Cambios — Backend

**Archivo:** `app/modules/finance/CobranzasService.ts`, método `getLibroBancos`.

1. **Extraer** el bloque actual de cómputo de `saldo_banco`/`diferencia` (~líneas 1474–1505) a la función pura `clasificarSaldoBanco(...)` descrita arriba. Conserva la lógica de cadena existente (incluido el helper `isoDay` y el orden por `fecha_proceso`).
2. La función devuelve también `estado`.
3. En el return de `getLibroBancos` (~líneas 1532–1548) agregar el campo **`saldo_banco_estado`** ('CUADRADO' | 'DIF' | 'PARCIAL' | 'SIN_EECC'). `saldo_banco` y `diferencia` se siguen devolviendo (con `diferencia=null` en PARCIAL/SIN_EECC, como define la lógica).

Sin cambios en queries, sin SQL nuevo, sin tocar el cálculo de `saldo_final`/`comisiones`.

## Cambios — Frontend

**Archivo:** `public/js/pages/Finanzas.js`, modal Libro Bancos.

1. **`difBadge`** (líneas 873–877): reescribir para que dependa de `data.saldo_banco_estado` en vez de solo `data.diferencia`:
   - `CUADRADO` → "✅ Cuadrado" (verde).
   - `DIF` → "⚠️ Dif {monto}" (rojo).
   - `PARCIAL` → "Importá el EECC completo del mes para cuadrar" (ámbar, sin número).
   - `SIN_EECC` → vacío (el banner ya cubre el aviso).
2. **Tarjeta KPI "SALDO BANCO (EECC)"** (líneas 1026–1030):
   - **Color de fondo/borde** por estado: verde (CUADRADO), rojo (DIF), ámbar (PARCIAL), gris (SIN_EECC).
   - **Valor principal:** `PARCIAL` → "Parcial"; `SIN_EECC` → "—"; resto → `saldo_banco` formateado.
   - **Sub-línea:** el `difBadge` nuevo.
3. **Bump del cache buster** JS (convención del proyecto: `?v=YYYYMMDDr#` en los 19 imports de `app.js` + `index.html`).

## Diseño para aislamiento

- `clasificarSaldoBanco` es **pura** (entra data, sale `{ saldo_banco, diferencia, estado }`): se entiende y se testea sin BD ni HTTP. Es el único lugar con la regla de negocio del indicador.
- El frontend solo **mapea estado → presentación**; no recalcula nada.

## Testing

1. **Unit test** de `clasificarSaldoBanco` con cadenas sintéticas (script en `scripts/`, estilo de los tests existentes):
   - (a) cadena completa, dif=0 → CUADRADO.
   - (b) cadena completa (1 inicio que arranca en saldo_inicial, 1 terminal), dif≠0 → DIF.
   - (c) cadena fragmentada (varios terminales), dif≠0 → PARCIAL.
   - (d) sin filas EECC → SIN_EECC.
   - (e) cadena de 1 terminal pero que NO arranca en saldo_inicial → PARCIAL.
2. **Verificación contra prod (read-only, Supabase MCP):** correr la clasificación con la data real de Marzo/Abril/Mayo/Junio (Soles y USD) y confirmar los estados esperados, **y que `saldo_final` no cambió** en ningún período.
3. **`npx tsc --noEmit`** limpio + `check_mojibake` OK antes de pushear (gotchas del proyecto).
4. Verificación visual en el navegador (preview): abrir Libro Bancos en Marzo (debe verse "Parcial" ámbar, sin "Dif 130.80") y Abril (debe seguir "✅ Cuadrado").

## Riesgos y mitigaciones

- **Riesgo:** romper Abril u otro mes que hoy cuadra. **Mitigación:** la regla `dif≈0 ⇒ CUADRADO` se evalúa primero; Abril (dif=0) queda idéntico. Test (a) lo cubre.
- **Riesgo:** marcar como PARCIAL un descalce que era real. **Mitigación aceptada:** en el estado mezclado no se puede distinguir un descalce real de un artefacto de cadena solo con los números; el sesgo a "no alarmar" es correcto porque el `saldo_final` es el juez real y el flujo de régimen (EECC completo) sí produce el estado DIF.
- **Riesgo:** tocar `public/js/` sin bumpear cache buster → browser sirve código viejo. **Mitigación:** bump en los 19 imports de `app.js` + `index.html` (gotcha #36).

## Despliegue

Rama `claude/fase3-libro-bancos-indicador-honesto`. Commit + push (feature branch, permiso ya autorizado). PR para que Julio mergee a `main` (gate de release). Railway deploya solo desde `main`. Sin migración → nada que aplicar en Supabase.

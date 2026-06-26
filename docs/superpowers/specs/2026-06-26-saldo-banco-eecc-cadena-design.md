# Saldo Banco (EECC) por cadena de saldos (Fase 2b)

**Fecha:** 2026-06-26
**Módulo:** Finanzas → Libro Bancos

## Problema

El KPI "Saldo Banco (EECC)" (y su "Diferencia" de conciliación) sale mal. Febrero 2026,
Caja General Soles: muestra **S/ 1,216.32 · Dif S/ 405.35** cuando el cierre real del banco
es **S/ 810.97** (Dif debería ser ~0). Enero muestra 7,509.11 cuando el cierre real es 2,901.59.

**Causa:** el código toma "la última fila por fecha/id" como saldo del banco:
```js
const ultimoConSaldo = [...lista].reverse().find(m => m.saldo_contable != null);
const saldo_banco = ultimoConSaldo ? Number(ultimoConSaldo.saldo_contable) : null;
```
Pero Interbank lista por **fecha de operación** mientras el `saldo_contable` corre por
**orden de proceso del banco**. La última fila por fecha/id es una del medio de la cadena
(feb: la línea "TRAN TIL +1,000" con saldo 1,216.32), no el cierre.

## Solución — seguir la cadena de saldos

Cada fila EECC con `saldo_contable` tiene un "saldo después" (= `saldo_contable`) y un
"saldo antes" = `saldo_contable − (ABONO ? +monto : −monto)`. El **cierre** del período es
el **fin de la cadena**: la fila cuyo `saldo_contable` **no es el "saldo antes" de ninguna
otra** fila EECC (nadie continúa desde ahí).

Como hay **huecos** (pagos cargados manualmente, sin `saldo_contable`), pueden aparecer
varios "fines de cadena" (uno por segmento). Entre ellos se elige el de **mayor
`fecha_proceso`** (desempate por mayor `id_movimiento`). Ese es el cierre real.

Comparación de centavos con `Math.round(x*100)` para evitar problemas de punto flotante.

### Verificado contra data real (Supabase)
- **Febrero:** fines de cadena = {1,829.84 (04/02), **810.97 (27/02)**} → gana 810.97.
  `Dif = 810.97 − 810.97 = 0` → ✅ Cuadrado.
- **Enero:** da **2,901.59** (no 7,509.11) → `Dif = 0` → ✅ Cuadrado.

### Fallback
Si no hay filas EECC con `saldo_contable`, o no se puede determinar ningún fin de cadena
(caso teórico: ciclo cerrado), `saldo_banco = null` → la UI muestra **"—"** (sin comparación),
nunca un número equivocado. (La UI ya maneja `saldo_banco == null` mostrando "—".)

## Cambio

Único cambio, en `app/modules/finance/CobranzasService.ts`, `getLibroBancos` (≈líneas 1468-1471).
Reemplazar:

```js
    // Si el último mov tiene saldo_contable (del EECC), comparar
    const ultimoConSaldo = [...lista].reverse().find(m => m.saldo_contable != null);
    const saldo_banco = ultimoConSaldo ? Number(ultimoConSaldo.saldo_contable) : null;
    const diferencia = saldo_banco != null ? +(saldo_banco - saldo_final).toFixed(2) : null;
```

por:

```js
    // Saldo banco (EECC) = cierre real del período siguiendo la cadena de saldos.
    // Interbank lista por fecha de operación, pero el saldo_contable corre por
    // orden de proceso → NO se puede tomar "la última fila por fecha". El cierre
    // es el fin de la cadena: fila EECC cuyo saldo_contable no es el "saldo antes"
    // de ninguna otra. Con huecos (pagos manuales sin saldo) puede haber varios
    // fines; se elige el de mayor fecha_proceso (desempate por id_movimiento).
    const cents = (n: number) => Math.round(Number(n) * 100);
    const eeccSaldo = lista.filter((m: any) => m.fuente === 'IMPORT_EECC' && m.saldo_contable != null);
    let saldo_banco: number | null = null;
    if (eeccSaldo.length) {
      const antesSet = new Set(
        eeccSaldo.map((m: any) =>
          cents(Number(m.saldo_contable) - (m.tipo === 'ABONO' ? Number(m.monto) : -Number(m.monto)))
        )
      );
      const terminales = eeccSaldo.filter((m: any) => !antesSet.has(cents(Number(m.saldo_contable))));
      if (terminales.length) {
        const keyProc = (m: any) => String(m.fecha_proceso || m.fecha || '');
        terminales.sort((a: any, b: any) => {
          const pa = keyProc(a), pb = keyProc(b);
          if (pa !== pb) return pa < pb ? -1 : 1;
          return Number(a.id_movimiento) - Number(b.id_movimiento);
        });
        saldo_banco = Number(terminales[terminales.length - 1].saldo_contable);
      }
    }
    const diferencia = saldo_banco != null ? +(saldo_banco - saldo_final).toFixed(2) : null;
```

(`lista` ya trae `fuente`, `saldo_contable`, `monto`, `tipo`, `fecha_proceso`, `fecha`,
`id_movimiento` — confirmado en el SELECT de `getLibroBancos`.)

## Alcance / no-alcance

- Backend-only, dentro de `getLibroBancos`. Sin migración, sin tocar datos, sin cambio de UI
  (la UI ya pinta `saldo_banco`/`diferencia`/"—"). Sin cache buster (no se toca `public/js`).
- No cambia `saldo_inicial`, `ingresos`, `egresos`, `comisiones` ni `saldo_final` (Fases 1/2a, ya correctos).

## Verificación

- `npx tsc --noEmit` limpio.
- Replicar contra Supabase la lógica de cadena: enero → 2,901.59 (Dif 0), febrero → 810.97 (Dif 0).
- En navegador tras deploy: febrero muestra Saldo Banco (EECC) **810.97** y **✅ Cuadrado**;
  enero idem con 2,901.59.

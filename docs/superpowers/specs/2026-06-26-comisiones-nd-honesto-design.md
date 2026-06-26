# KPI Comisiones honesto — no contar N/D sin splitear (Fase 2a)

**Fecha:** 2026-06-26
**Módulo:** Finanzas → Libro Bancos

## Problema

El KPI "Comisiones" del Libro Bancos sale inflado: Caja General Soles, Enero 2026 muestra
**S/ 17,810.88** cuando las comisiones reales del mes son ~**S/ 1.35**.

**Causa:** la heurística `esComisionImportada` en `getLibroBancos` cuenta como comisión
todo movimiento EECC cuyo `tipo_movimiento_banco` contenga `ITF / N/D / COM. / PORTE`. Las
líneas **"N/D"** ("N/D I-BANC + COM.O/CI-BANC") NO son comisiones puras: cada una es un
**pago/transferencia + una comisión interbancaria chica** que el banco junta en una línea.
En enero hay 21 N/D que suman S/ 17,809.53, contados enteros como comisión.

Verificado contra Supabase: `tipo_movimiento_banco` vale exactamente `'N/D'` (21 líneas,
17,809.53) y `'ITF'` (6 líneas, 1.35).

## Decisión (acordada)

No contar los N/D sin splitear como comisión. Quedan en EGRESOS (la plata salió). Cuando
se splitea un N/D con el 💱, la comisión real se materializa como `GastoBancario` (movimiento
`ref_tipo='GASTO_BANCARIO'`) y ESA sí se cuenta. Honesto por defecto.

## Cambio

Único cambio, en `app/modules/finance/CobranzasService.ts`, función `getLibroBancos`,
helper `esComisionImportada` (≈línea 1387):

```js
// antes
return t.includes('ITF') || t.includes('N/D') || t.includes('COM.') || t.includes('PORTE');
// después
return t.includes('ITF') || t.includes('COM.') || t.includes('PORTE');
```

(Actualizar también el comentario de arriba que enumera "ITF / N/D / COM. / PORTE" → quitar N/D.)

El conteo de comisiones sigue sumando además `m.ref_tipo === 'GASTO_BANCARIO'` (sin cambios),
que es por donde entran las comisiones reales de los N/D ya spliteados.

## Efecto

- COMISIONES enero (Caja Soles): **17,810.88 → 1.35**.
- EGRESOS (25,890.18) y SALDO FINAL (2,901.59): **sin cambios**.
- Tras splitear un N/D: su comisión real entra al KPI vía GastoBancario.

## Alcance / no-alcance

- Sin migración, sin cambio de UI, sin tocar datos. Solo la fórmula del KPI (backend).
- NO se bumpea cache buster (no se toca `public/js`).
- Fuera de alcance: Saldo Banco (EECC) de cierre y diferencia de conciliación (Fase 2b);
  disponibilidad del botón 💱 split en N/D ya CONCILIADO (otra fase).

## Verificación

- `npx tsc --noEmit` limpio.
- Query Supabase: comisiones enero (ITF + COM./PORTE + GASTO_BANCARIO) = 1.35.
- En navegador tras deploy: KPI Comisiones de enero muestra S/ 1.35; egresos/saldo final iguales.

# Importador EECC fiel + reconciliación "el EECC manda" — Diseño

- **Fecha:** 2026-07-01
- **Estado:** diseño aprobado (brainstorming). Pendiente: plan de implementación.
- **Módulo:** Finanzas › Libro Bancos.

---

## 1. Problema

El Libro Bancos reconcilia el ERP contra el extracto bancario (EECC) de Interbank. Al cargar el EECC de Junio 2026 (Caja Soles) aparecieron 3 problemas graves:

1. **Doble conteo.** El importador insertó las 31 líneas del EECC *encima* de la capa ERP (pagos de OC ya cargados como movimientos `MANUAL`), duplicando egresos (S/88k → S/176k) y mandando el saldo final a -S/87,259.64.
2. **Pérdida de datos silenciosa (crítico).** El importador descarta líneas legítimas. En Junio el EECC tiene ~10 ITF el 22/06 y el importador cargó ~6: su dedup por *(nº op + fecha + monto)* colapsa los ITF que comparten nº op "–" y repiten monto el mismo día (`CobranzasService.ts:1650-1666`). El usuario **confía** en que el EECC subido está completo → riesgo real de cuadres falsos.
3. **Sin deshacer / re-cargar.** No hay forma de deshacer una importación que quedó mal, ni de re-cargar el EECC (para corregir una carga incompleta o para cuadrar un mes en curso).

Además, "deduplicar borrando" es peligroso: cuando el banco cobra pago + comisión en una sola línea `N/D` (ej. OC 014 CREER 17,394.40 → N/D 17,399.70 = pago + 5.30 de comisión), los montos **no** son iguales; borrar la línea del EECC perdería la comisión.

## 2. Decisión de modelo: "el EECC manda"

El extracto bancario es la **fuente de verdad del lado banco**. Al importar, las líneas del EECC son el libro del banco del mes. Los movimientos del ERP (pagos de OC, cobranzas) se **enlazan** a su línea del EECC; no se duplican. Para no perder nada del usuario, el enlace **no borra** la fila espejo del ERP: la marca como *reemplazada* de forma **reversible**.

**Alternativa descartada — Modelo B ("el ERP manda, el EECC verifica"):** mantener el ERP como libro y solo estampar saldo / agregar lo faltante desde el EECC. Se descartó porque el usuario confía en el EECC como verdad del banco y quiere que el extracto sea el libro; el Modelo A da el indicador "Saldo Banco = CUADRADO" de forma natural (la cadena de saldos del banco queda completa).

## 3. Requisitos

- **R1 — Fidelidad:** toda línea del EECC entra, sin descartes silenciosos. Genérico por *(cuenta, período)*, Soles y Dólares.
- **R2 — Match conservador, sin pérdida:** auto-enlazar solo con match seguro (monto exacto + fecha ±3 días + beneficiario compatible). Toda diferencia (comisiones, N/D) o duda → línea **pendiente**, nunca borrar.
- **R3 — Deshacer / re-cargar / progresivo:** deshacer la importación de un *(cuenta, período)* restaurando el estado previo; re-importar idempotente para corregir o cuadrar un mes en curso.

## 4. Diseño

### 4.1 Modelo de datos
Nueva columna en `movimientobancario`:

- `reemplazado_por_mov INT NULL` — apunta al `id_movimiento` de la línea `IMPORT_EECC` que reemplaza a esta fila espejo. `NULL` = fila activa. Con valor = fila espejo *reemplazada* (no suma, no se muestra). Reversible: deshacer la setea a `NULL`.

Migración **aditiva** (columna nullable, sin default destructivo, sin back-fill que toque datos existentes).

### 4.2 Pieza ① — Importador fiel (R1)
`importarEECCInterbank`:

- **Dedup por saldo contable.** Reemplazar el dedup actual por: ¿existe ya una fila `fuente='IMPORT_EECC'` con mismo `(id_cuenta, saldo_contable, monto, fecha)`? → misma línea ya cargada, saltar. Si no → insertar. `saldo_contable` es **único por línea** del extracto (cada movimiento cambia el saldo corrido), así cada línea distinta sobrevive, incluidos ITF de mismo monto/día.
- El parser de texto **no cambia** (segmenta por pares de fecha, extrae monto + saldo). Solo cambia la detección de duplicados.

### 4.3 Pieza ② — Match conservador + reemplazo reversible (R2)
Tras insertar las líneas nuevas del EECC, para cada línea recién insertada que sea de negocio (CARGO/ABONO no-comisión):

1. Buscar filas espejo candidatas: `fuente IN ('MANUAL','AUTO')`, misma cuenta, `reemplazado_por_mov IS NULL`, `monto` exacto, `fecha` dentro de ±3 días.
2. **Filtro de concepto:** el beneficiario/nombre de la línea del EECC debe **solapar** (tokens de nombre) con la descripción de la fila espejo. Sin solapamiento → no es match seguro.
3. Si hay exactamente **1 candidato seguro** → enlazar: la línea EECC hereda `ref_tipo`/`ref_id` de la espejo y queda `CONCILIADO`; la espejo recibe `reemplazado_por_mov = <id línea EECC>`.
4. Varios candidatos idénticos (mismo monto/fecha/beneficiario, ej. 3× SUCLUPE 1,200) → emparejar 1:1 en orden (son intercambiables).
5. Sin candidato seguro (monto difiere por comisión, nombre no solapa, N/D, duda) → la línea EECC queda `POR_CONCILIAR`. **No se toca ninguna espejo.**

Extraer una función **pura** `matchLineaEECC(linea, candidatos)` → decisión (id espejo | null), testeable sin BD.

### 4.4 Pieza ③ — Deshacer / re-cargar (R3)
`deshacerImportacionEECC(idCuenta, periodo, userId)`:

1. Restaurar espejos: `reemplazado_por_mov = NULL` donde apunte a una línea `IMPORT_EECC` del período.
2. Borrar las líneas `fuente='IMPORT_EECC'` de *(cuenta, período)*.
3. Registrar en auditoría.

Con confirmación explícita en UI + restringido a GERENTE. Re-importar es **idempotente** (dedup por saldo_contable): cargar un EECC parcial y luego el completo agrega solo lo nuevo y re-matchea.

### 4.5 Ajuste a `getLibroBancos`
- Excluir del período las filas con `reemplazado_por_mov IS NOT NULL`: no suman (ingresos/egresos/saldo), no aparecen en la lista, no cuentan como pendientes.
- `clasificarSaldoBanco` sigue leyendo las filas `IMPORT_EECC` — que ahora son el libro completo del banco → indicador CUADRADO natural.

## 5. Cierre de Junio (validación del diseño)
1. **Deshacer** importación Junio → capa ERP limpia (espejos restauradas).
2. **Re-importar** EECC Junio → 37 líneas fieles; ~24 pagos de OC auto-enlazados (espejos reemplazadas); ITF / N/D / SEDAPAL quedan pendientes.
3. **Conciliar** pendientes con 💡/💱 (SEDAPAL S/17.50 como servicio; ITF; comisiones N/D con split).
4. **Declarar apertura** S/34.59 con ✎.
5. Saldo final **S/1,716.75** = banco; indicador verde. Todo in-app.

## 6. Alcance (archivos)
- Migración `0XX_reemplazado_por_mov.sql`.
- `app/modules/finance/CobranzasService.ts`: `importarEECCInterbank` (dedup + match + reemplazo), nuevo `deshacerImportacionEECC`, ajuste `getLibroBancos`; extraer `matchLineaEECC` puro.
- `index.ts`: ruta `POST /cobranzas/libro-bancos/deshacer-importacion` (requireModulo FINANZAS + GERENTE).
- `public/js/services/api.js`: `api.cobranzas.deshacerImportacionEECC`.
- `public/js/pages/Finanzas.js`: botón "Deshacer importación EECC" en el modal Libro Bancos + **cache buster global**.
- Tests unitarios de `matchLineaEECC` (función pura).

## 7. No-objetivos (YAGNI)
- No cambia el parser del PDF ni el flujo de pago de OC (siguen creando su movimiento MANUAL).
- No auto-resuelve N/D bundles: eso sigue con 💱 split manual.
- No trata la cuenta USD de forma especial: mismo mecanismo; los casos COMP-VTA / N/D quedan como pendientes para conciliación manual, como hoy.

## 8. Riesgos y mitigaciones
- **Falso match** → matching conservador (monto exacto + fecha ±3d + solapamiento de nombre + candidato único); ante la duda, pendiente. Todo reversible con "Deshacer".
- **`saldo_contable` no único** (línea de 0.00, improbable) → el dedup incluye monto + fecha además del saldo.
- **Migración en prod** → aditiva, nullable, sin back-fill destructivo. Se aplica por el runner de migraciones / `apply_migration`, no por SQL manual.
- **Datos actuales de Junio** ya duplicados → se limpian con el flujo de la sección 5 (deshacer + re-importar), no con borrado masivo.

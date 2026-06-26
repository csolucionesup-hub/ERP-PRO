# Saldo inicial del Libro Bancos — declarado + auto-encadenado (Fase 1)

**Fecha:** 2026-06-26
**Autor:** Julio + Claude
**Módulo:** Finanzas → Libro Bancos

## Problema

El KPI "Saldo inicial" del Libro Bancos sale mal. Para Caja General Soles, Enero 2026
muestra **S/ 7,271.91** cuando el correcto es **S/ 1,535.03** (verificado: cierre de
diciembre 2025 = 1,535.03, y primera operación real de enero —ABONO 13,588.83 con
saldo banco 15,123.86— ⇒ 15,123.86 − 13,588.83 = 1,535.03).

### Causa raíz
`CobranzasService.getLibroBancos` calcula el saldo inicial back-calculando desde la
**primera línea importada del EECC por fecha** (`fuente='IMPORT_EECC'`, ordenada por
`fecha ASC, id_movimiento ASC`) usando su `saldo_contable ∓ monto`. Pero:

1. El extracto Interbank lista las operaciones por **fecha de operación**, mientras que
   la columna "Saldo contable" corre en el **orden interno de proceso del banco** (solo
   recuperable siguiendo la cadena de saldos, no por fecha). La línea "más antigua por
   fecha" que agarra (un ITF de −0.65, saldo 7,271.26) está en realidad a la mitad de la
   cadena de proceso, así que su saldo no es el inicial.
2. La primera operación real (ABONO 13,588.83) entró como `fuente='AUTO'` (cobranza del
   ERP) con `saldo_contable = NULL`, así que el back-calc la ignora.

El back-calc desde una sola línea es intrínsecamente frágil con el desorden de Interbank
y debe eliminarse.

## Decisiones (acordadas)

1. **Saldo inicial = declarado + auto-encadenado.** El usuario carga UNA vez el saldo
   base de un mes; los meses siguientes se calculan solos encadenando movimientos. Puede
   corregir manualmente cualquier mes.
2. **Alcance: solo el saldo inicial (Fase 1).** El "Saldo Banco (EECC)" de cierre y la
   diferencia de conciliación (mal por la misma causa) quedan para una Fase 2.
3. **Permiso: cualquiera con módulo FINANZAS** puede definir/editar el saldo inicial
   (no solo GERENTE). Hereda el gating existente `apiRouter.use('/cobranzas', requireModulo('FINANZAS'))`.

## Modelo de datos — migración 077

Tabla nueva. Guarda **solo los anclas declaradas manualmente**; el resto se calcula.

```sql
-- 077_saldo_inicial_banco.sql
CREATE TABLE IF NOT EXISTS SaldoInicialBanco (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  id_cuenta       INT NOT NULL,
  periodo         VARCHAR(7) NOT NULL,            -- 'YYYY-MM'
  saldo           DECIMAL(14,2) NOT NULL,
  registrado_por  INT,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_cuenta, periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
(El adapter `connection.ts` traduce a Postgres; se aplica en Supabase como las demás.)

## Resolución del saldo inicial (reemplaza el back-calc EECC)

`getSaldoInicial(idCuenta, periodo) → { saldo, origen }`:

1. **Declarado:** si existe fila en `SaldoInicialBanco` para (idCuenta, periodo) →
   `{ saldo: fila.saldo, origen: 'DECLARADO' }`.
2. **Heredado:** si no, buscar el ancla declarada más reciente con `periodo < pedido`.
   Si existe: `saldo = ancla.saldo + Σ(ABONO − CARGO) de MovimientoBancario` con
   `fecha >= inicio(ancla.periodo) AND fecha < inicio(periodo_pedido)` →
   `{ saldo, origen: 'HEREDADO' }`.
3. **Sin definir:** si no hay ningún ancla → fallback al comportamiento viejo
   (`Σ(ABONO − CARGO)` de movimientos con `fecha < inicio(periodo)`) →
   `{ saldo, origen: 'SIN_DEFINIR' }` (la UI lo marca en ámbar).

`setSaldoInicial(idCuenta, periodo, saldo, userId)`: upsert (INSERT … ON CONFLICT
(id_cuenta, periodo) DO UPDATE) de la fila MANUAL.

**Nota:** se elimina por completo el bloque `eeccIniRow` / back-calc de `getLibroBancos`.

## Backend — `app/modules/finance/CobranzasService.ts`

- `getSaldoInicial(idCuenta, periodo)` — implementa la resolución de arriba.
- `setSaldoInicial(idCuenta, periodo, saldo, userId)` — upsert.
- `getLibroBancos`: reemplaza el cálculo actual de `saldo_inicial` por
  `const { saldo, origen } = await this.getSaldoInicial(idCuenta, per)` y agrega
  `saldo_inicial_origen: origen` al objeto de retorno (junto al `saldo_inicial` ya existente).

## Endpoint — `index.ts`

Agregar junto a las otras rutas de libro-bancos (≈línea 717-722), dentro del grupo
`/cobranzas` (ya gateado por FINANZAS):

```ts
apiRouter.post('/cobranzas/libro-bancos/saldo-inicial', async (req, res) => {
  const { id_cuenta, periodo, saldo } = req.body;
  res.json(await CobranzasService.setSaldoInicial(Number(id_cuenta), String(periodo), Number(saldo), req.user!.id_usuario));
});
```
Validación mínima inline: `id_cuenta` entero > 0, `periodo` match `^\d{4}-\d{2}$`,
`saldo` numérico finito. (Sin Zod nuevo — patrón liviano como los otros endpoints de cobranzas.)

## Frontend — `public/js/services/api.js` y `public/js/pages/Finanzas.js`

- `api.js`: `api.cobranzas.setSaldoInicial(id_cuenta, periodo, saldo)` →
  `post('/cobranzas/libro-bancos/saldo-inicial', { id_cuenta, periodo, saldo })`.
- `Finanzas.js` (modal Libro Bancos):
  - El KPI **"SALDO INICIAL"** muestra un botón ✎ (`title=`/`aria-label=`) que abre un
    input para definir el saldo de la cuenta+período actual.
  - Badge de origen bajo el monto: `declarado` (gris/verde), `heredado del mes previo`
    (gris), o **`sin definir`** (ámbar #fef3c7 / texto #92400e) cuando `origen='SIN_DEFINIR'`.
  - Al guardar: `setSaldoInicial(...)` → recargar el Libro Bancos del período actual
    (re-fetch + re-render del modal).
  - El modal NO se cierra por backdrop (gotcha #28). Tooltips en el ✎ (convención).

## Carga del dato real

Tras el deploy, el usuario define **Enero 2026 = S/ 1,535.03** desde el ✎ (o se pre-carga
por SQL en Supabase: `INSERT INTO saldoinicialbanco (id_cuenta, periodo, saldo) VALUES (1,'2026-01',1535.03)`).
Febrero+ se encadenan solos.

## Verificación

- Con el ancla Enero 2026 = 1,535.03: el KPI muestra 1,535.03 (badge "declarado") y el
  saldo corrido del mes arranca ahí. Febrero muestra `1,535.03 + Σ(movimientos enero)`
  con badge "heredado".
- Sin ancla: badge "sin definir" en ámbar.
- `npx tsc --noEmit` limpio; cache buster bumpeado (toca `public/js`).

## Fuera de alcance (Fase 2)

- Corregir "Saldo Banco (EECC)" de cierre: hoy toma el `saldo_contable` de una línea
  equivocada (la del abono, saldo más alto del último lote) en vez de seguir la cadena de
  saldos hasta la última operación procesada del período. Afecta la diferencia de conciliación.
- Mejora del parser EECC para asociar correctamente los saldos de las líneas ITF/N/D.

# Backup y Restore — ERP-PRO

Guía completa para hacer backup de la BD productiva, restaurar desde un backup, o revertir un cambio de código que rompió producción.

---

## TL;DR — Qué hacer si algo se rompe AHORA

| Problema | Acción rápida |
|---|---|
| Un commit nuevo rompió la app | Railway → ERP-PRO → Deployments → buscar último deploy "ACTIVE" verde de antes → click "..." → **Redeploy**. Tarda 1 min. |
| Borraste data por error | Supabase → tu proyecto → Database → **Backups** → elegir snapshot del día anterior → Restore. Perdés hasta 24h de cambios. |
| Algo confuso, pánico | Pausá, no toques nada más. Avisá. La data productiva está respaldada por Supabase nightly + Git tiene todo el código. |

---

## Niveles de respaldo que tenemos

### 1. Código → Git + GitHub
Cada commit es un punto al que volver. **No se pierde nada del código** porque GitHub guarda el historial completo.

### 2. Deploys → Railway History
Cada deploy queda guardado en Railway → Deployments → History. **Cualquier deploy anterior se puede reactivar con 1 click ("Redeploy")**. El código deployado en ese deploy vuelve a ser el activo.

### 3. BD productiva → Supabase Daily Backups
Supabase Free Plan incluye **backups automáticos diarios con 7 días de retención**. Cada noche guardan un snapshot completo de tu BD. Para verlos:
- Supabase → tu proyecto `fhlrxlsscerfiuuyiejw` → Database → **Backups**

### 4. Backup local manual → `npm run db:backup` ← este script
Snapshot puntual on-demand. Útil **antes de hacer cambios riesgosos** (migraciones grandes, cambios masivos, importaciones).

---

## Hacer un backup local (MANUAL)

### Cuándo hacerlo
- **Siempre antes** de aplicar una migración grande
- **Siempre antes** de un import histórico masivo
- **Periódicamente** si querés tener copias en tu disco/Drive

### Cómo

Desde la raíz del proyecto:

```bash
npm run db:backup
```

Output esperado:

```
--- BACKUP DB ERP-PRO ---
Conectando a Supabase Postgres...
✓ Conectado.

Encontradas 41 tablas. Dumpeando...
  - Auditoria                          159 filas
  - CentroCosto                          5 filas
  - Compras                              0 filas
  - ConfiguracionEmpresa                 1 filas
  ...
✓ Backup guardado: backups/erp-pro-2026-05-05T18-30-00.json
  Tablas: 41, filas: 540, tamaño: 0.45 MB
```

### Dónde queda

`backups/erp-pro-YYYY-MM-DDTHH-MM-SS.json` (en tu disco, ignorado por Git).

### Recomendación: copia a Google Drive

Después de cada backup importante, **copiá el archivo `.json` a una carpeta segura** (Google Drive, OneDrive, disco externo). Esto te protege contra fallas del disco local.

---

## Restaurar desde un backup

### Opción A — Restore desde Supabase (RECOMENDADO si la pérdida fue ayer)

1. Supabase → tu proyecto → Database → **Backups**
2. Elegí el snapshot que querés (los hay diarios de los últimos 7 días)
3. Click **Restore**
4. Supabase reemplaza la BD entera con ese snapshot
5. **Atención**: esto SOBRESCRIBE todo lo que pasó después de ese punto

### Opción B — Restore desde un backup local `.json`

Para casos donde Supabase no tiene el punto exacto que querés (ej. querés volver a las 14:00 de hoy y solo hay snapshot de las 00:00).

**Flujo completo:**

1. **Tomar nota** del archivo de backup que querés restaurar (ej. `backups/erp-pro-2026-05-05T14-00-00.json`).
2. **Hacer un backup ACTUAL antes de restaurar** (por si te arrepentís):
   ```bash
   npm run db:backup
   ```
3. **Decidir el alcance**:
   - **Restore completo** (reemplaza TODO): borrá todas las tablas y reimportá. Riesgoso.
   - **Restore parcial** (solo algunas tablas): más seguro. Recomendado para casos puntuales.
4. **Restore parcial vía Supabase MCP / SQL Editor** (recomendado):
   - Abrí Supabase → SQL Editor
   - Ejemplo para restaurar solo la tabla `Cotizaciones`:
     ```sql
     -- Limpiar la tabla actual
     DELETE FROM Cotizaciones;
     -- Re-insertar las filas del backup
     INSERT INTO Cotizaciones (col1, col2, ...) VALUES (...), (...);
     ```
   - Las INSERT statements podés generarlas a mano desde el JSON, o pedirle a Claude que las genere.

> **Nota para el script de restore automatizado**: a futuro podemos agregar `npm run db:restore <archivo.json>` que automatice el proceso. Hoy es manual porque queremos confirmación humana en cada step (la BD productiva no se restaura sola).

---

## Revertir un commit que rompió producción

### Si el deploy actual está caído

1. Railway → ERP-PRO → **Deployments**
2. En la lista History, buscá el último deploy en estado **ACTIVE** (verde) que SÍ funcionaba
3. Click en los **3 puntos `⋮`** al lado → **Redeploy**
4. Railway redeploya con el código de ese deploy (≈1 min)
5. La app vuelve a funcionar

### Si querés revertir un commit específico

```bash
# Ver el historial reciente
git log --oneline -10

# Identificar el commit problemático (ej. abc1234)
# Crear un commit nuevo que deshace los cambios de abc1234
git revert abc1234

# Pushear a main para que Railway redeployee
git push origin <tu-branch>:main
```

`git revert` NO borra el commit problemático del historial — crea un commit NUEVO que deshace sus cambios. Es la forma segura.

### Si necesitás un rollback más drástico

```bash
# CUIDADO: reescribe historia. Solo si nadie más toca la rama y entendés qué hacés.
git reset --hard <commit-hash-bueno>
git push origin <tu-branch>:main --force-with-lease
```

**No usar force push a main si hay otros desarrolladores en el repo**.

---

## Combinación de niveles para casos comunes

### "Quiero volver al estado del lunes a las 14:00"

1. **Código**: `git log --before "2026-05-04 14:00"` te muestra el último commit anterior. Hacés `git checkout <hash>` o redeploy en Railway buscando el deploy de esa hora.
2. **BD**: Supabase Daily Backup más cercano al lunes 14:00 es el del lunes 00:00. Restorás ese y perdés 14h de cambios. Si tenés un `backups/erp-pro-...` local del lunes 14:00, lo usás en su lugar.

### "Acabo de aplicar una migración mala, todo se descuadró"

1. Si tenés backup local previo a la migración: usalo.
2. Si no, Supabase nightly más reciente (puede ser de hace pocas horas).
3. Volvé a desarrollar la migración corregida.

### "Borré una OC sin querer hace 5 min"

Hoy NO podés recuperar 5 min atrás (PITR no está). Lo más cercano: Supabase nightly de las 00:00 (perdés todo el día). Mitigación: cuando upgrades a Supabase Pro tendrás Point-in-Time Recovery hasta 7 días con granularidad de minutos.

---

## Pendiente / mejoras futuras

- [ ] **Plan B**: backup automático nocturno corriendo en cron de Supabase Edge Function + upload a Google Drive (~1.5h trabajo)
- [ ] **Plan C**: upgrade Supabase a Pro Plan ($25/mes) → desbloquea PITR de 7 días
- [ ] **Script `npm run db:restore <file>`**: automatiza el restore parcial desde un JSON local (útil cuando crezca el sistema)

---

## Resumen — checklist mensual sugerido

- [ ] **Una vez al mes**: corré `npm run db:backup` y subí el archivo a Google Drive
- [ ] **Antes de migraciones grandes**: corré `npm run db:backup` ANTES y verificá que el archivo se generó OK
- [ ] **Cada cierto tiempo**: andá a Supabase → Database → Backups y verificá que los snapshots automáticos están corriendo (no debería fallar nunca pero conviene chequear)

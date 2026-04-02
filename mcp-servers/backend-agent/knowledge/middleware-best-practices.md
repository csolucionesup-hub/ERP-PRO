# Mejores Prácticas de Middleware — ERP-PRO

## Middlewares Activos

### 1. `requireAuth` (app/middlewares/auth.ts)
- Estado: **passthrough provisional** (JWT scaffolded, pendiente)
- Aplicar con `app.use('/api/ruta', requireAuth)` antes de los handlers
- TODO: implementar `jsonwebtoken` con `process.env.JWT_SECRET`

### 2. `validateParams` (app/validators/validateRequest.ts)
- Valida `req.body` contra un schema Zod
- Uso: `validateParams(schemaZod)` como middleware antes del handler
- Retorna 400 con detalle si la validación falla

### 3. `errorHandler` (app/middlewares/errorHandler.ts)
- Registrado al FINAL de todos los middlewares
- Captura errores lanzados en handlers async (Express 5)
- Retorna JSON `{ error: message }` con status apropiado

## Validators (Zod Schemas)

Ubicación: `app/validators/*.schema.ts`

Patrón estándar con `fechaField` helper:
```typescript
const fechaField = z.preprocess((arg) => {
  // Acepta DD/MM/YYYY y normaliza a YYYY-MM-DD
  if (typeof arg !== 'string') return arg;
  if (arg.includes('/')) { /* normalizar */ }
  return arg;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
```

Schemas existentes: `dashboard.schema`, `provider.schema`, `purchase.schema`,
`inventory.schema`, `service.schema`, `gastos.schema`

## Orden del Chain de Middleware

```
Request
  → cors()
  → express.json()
  → morgan('dev')
  → requireAuth  [por ruta/path]
  → validateParams(schema)  [por endpoint]
  → handler async
  → errorHandler  [global, al final]
```

# Patrones de Rutas Express — ERP-PRO

## Stack
- Express 5 (async error handling nativo — NO usar try/catch en rutas)
- TypeScript con ts-node en dev, compilado en prod
- Middleware chain: cors → express.json() → morgan → requireAuth → validateParams → handler

## Estructura de Rutas en index.ts

```typescript
// Patrón estándar de ruta
app.use('/api/modulo', requireAuth);                    // Auth global al path
app.get('/api/modulo',  async (req, res) => { ... });  // List
app.get('/api/modulo/:id', async (req, res) => { ... }); // Get by ID
app.post('/api/modulo', validateParams(moduloCreateSchema), async (req, res) => { ... }); // Create
app.put('/api/modulo/:id', async (req, res) => { ... }); // Update
app.delete('/api/modulo/:id', async (req, res) => { ... }); // Delete (soft: estado=ANULADO)
app.post('/api/modulo/:id/pago', validateParams(moduloPagoSchema), async (req, res) => { ... }); // Pago parcial
```

## Reglas de Diseño

1. **Express 5**: los handlers `async` propagan errores al `errorHandler` automáticamente — NUNCA usar try/catch en rutas
2. **Respuestas**: siempre `res.json()`, nunca `res.send()`
3. **Status codes**: 200 (ok), 201 (created), 400 (validation), 404 (not found), 500 (server error — manejado por errorHandler)
4. **IDs**: siempre parsear como `Number(req.params.id)` — los params llegan como string
5. **Soft deletes**: los módulos no eliminan registros, cambian `estado = 'ANULADO'`
6. **Auth**: `requireAuth` es un passthrough provisional (JWT scaffolded, pendiente implementar)

## Módulos Existentes y sus Endpoints

| Módulo | Base Path | Servicio |
|--------|-----------|---------|
| Finance/Dashboard | `/api/dashboard` | FinanceService |
| Servicios | `/api/servicios` | CatalogService |
| Compras | `/api/compras` | PurchaseService |
| Proveedores | `/api/proveedores` | ProvidersService |
| Inventario | `/api/inventario` | InventoryService |
| Gastos | `/api/gastos` | FinanceService |
| Cuentas | `/api/cuentas` | FinanceService |
| Tributario | `/api/tributario` | TributarioService |
| Préstamos | `/api/prestamos` | PrestamosService |
| Tipo Cambio | `/api/tipo-cambio` | FinanceService |

## Ejemplo Completo — Ruta con Pago Parcial

```typescript
// Rutas Servicios (CatalogService)
app.use('/api/servicios', requireAuth);

app.get('/api/servicios', async (req, res) => {
  const data = await CatalogService.getAll(req.query);
  res.json(data);
});

app.post('/api/servicios', validateParams(serviceCreateSchema), async (req, res) => {
  const result = await CatalogService.create(req.body);
  res.status(201).json(result);
});

app.post('/api/servicios/:id/pago', validateParams(servicePaymentSchema), async (req, res) => {
  const result = await CatalogService.registrarPago(Number(req.params.id), req.body);
  res.json(result);
});
```

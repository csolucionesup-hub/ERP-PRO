import express, { Request, Response } from 'express';
// Express 5 soporta async errors nativamente
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import morgan from 'morgan';

// Node / TS Lógica de Negocio
import { db } from './database/connection';
import FinanceService from './app/modules/finance/FinanceService';
import TributarioService from './app/modules/finance/TributarioService';
import CatalogService from './app/modules/services/CatalogService';
import PurchaseService from './app/modules/purchases/PurchaseService';
import InventoryService from './app/modules/inventory/InventoryService';
import ProvidersService from './app/modules/purchases/ProvidersService';

// Middlewares de Producción (Securización & Validación)
import { requireAuth } from './app/middlewares/auth';
import { errorHandler } from './app/middlewares/errorHandler';
import { validateParams } from './app/validators/validateRequest';
import { dashboardQuerySchema } from './app/validators/dashboard.schema';
import { providerCreateSchema } from './app/validators/provider.schema';
import { purchaseCreateSchema } from './app/validators/purchase.schema';
import { inventoryCreateSchema, inventoryConsumeSchema } from './app/validators/inventory.schema';
import { serviceCreateSchema, servicePaymentSchema } from './app/validators/service.schema';
import { gastoCreateSchema, gastoPaymentSchema } from './app/validators/gastos.schema';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CAPAS MIDDLEWARE (Nivel Sistema Global)
// ==========================================
app.use(cors());
app.use(express.json());

// Logs HTTP configurados en nivel 'dev' para auditoría gerencial
app.use(morgan('dev'));

// Servicio estático (Frontend JS Vanilla)
app.use(express.static(path.join(__dirname, 'public')));


// ==========================================
// RUTAS API CONTROLADAS
// ==========================================

// Aplicamos requireAuth de forma global al router de API (Actualmente el middleware permite transparentemente pasar mock, 
// a futuro cuando lo llenes de código cortará solicitudes sin bearer token activo).
const apiRouter = express.Router();
apiRouter.use(requireAuth);

// 1. Dashboard Master (Macro-Indicadores y Cuentas Cruzadas)
apiRouter.get('/finanzas/operativo', async (req: Request, res: Response) => {
  res.json(await FinanceService.getResumenOperativo());
});

apiRouter.get('/finanzas/dashboard', async (req: Request, res: Response) => {
  res.json(await FinanceService.getDashboardMaster());
});

apiRouter.get('/finanzas/cxc', async (req: Request, res: Response) => {
  res.json(await FinanceService.getCuentasPorCobrar());
});

apiRouter.get('/finanzas/cxp', async (req: Request, res: Response) => {
  res.json(await FinanceService.getCuentasPorPagar());
});

apiRouter.get('/gastos', async (req: Request, res: Response) => {
  res.json(await FinanceService.getGastos());
});

apiRouter.post('/gastos', validateParams(gastoCreateSchema), async (req: Request, res: Response) => {
  const result = await FinanceService.createGasto(req.body);
  res.status(201).json(result);
});

apiRouter.post('/gastos/:id/pago', validateParams(gastoPaymentSchema), async (req: Request, res: Response) => {
  const result = await FinanceService.registrarPagoGasto(parseInt(req.params.id as string), req.body.abono);
  res.json(result);
});

apiRouter.post('/gastos/:id/anular', async (req: Request, res: Response) => {
  res.json(await FinanceService.anularGasto(parseInt(req.params.id as string)));
});

apiRouter.get('/servicios/activos', async (req: Request, res: Response) => {
  const [rows] = await db.query("SELECT id_servicio, codigo, nro_cotizacion, cliente, nombre FROM Servicios WHERE estado != 'ANULADO' AND estado_trabajo = 'ACTIVO' ORDER BY fecha_servicio DESC");
  res.json(rows);
});
apiRouter.get('/servicios', async (req: Request, res: Response) => {
  res.json(await CatalogService.getServicios());
});

apiRouter.post('/servicios', validateParams(serviceCreateSchema), async (req: Request, res: Response) => {
  const result = await CatalogService.createServicio(req.body);
  res.status(201).json(result);
});

apiRouter.post('/servicios/:id/pago', validateParams(servicePaymentSchema), async (req: Request, res: Response) => {
  const idServicio = parseInt(req.params.id as string);
  const result = await CatalogService.registrarCobro(idServicio, req.body.monto_pagado_liquido, req.body.descripcion);
  res.json(result);
});

apiRouter.post('/servicios/:id/anular', async (req: Request, res: Response) => {
  res.json(await CatalogService.anularServicio(parseInt(req.params.id as string)));
});
apiRouter.post('/servicios/:id/terminar', async (req: Request, res: Response) => {
  await db.query("UPDATE Servicios SET estado_trabajo = 'TERMINADO' WHERE id_servicio = ?", [parseInt(req.params.id as string)]);
  res.json({ success: true });
});
apiRouter.post('/servicios/:id/detraccion-deposito', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  await db.query("UPDATE Detracciones SET cliente_deposito = 'SI', monto_depositado = monto, fecha_deposito = CURDATE() WHERE id_servicio = ?", [id]);
  res.json({ success: true });
});
apiRouter.put('/servicios/:id', async (req: Request, res: Response) => {
  res.json(await CatalogService.updateServicio(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/servicios/:id', async (req: Request, res: Response) => {
  res.json(await CatalogService.deleteServicio(parseInt(req.params.id as string)));
});

apiRouter.get('/compras', async (req: Request, res: Response) => {
  res.json(await PurchaseService.getCompras());
});

apiRouter.post('/compras', validateParams(purchaseCreateSchema), async (req: Request, res: Response) => {
  const result = await PurchaseService.registrarCompra(req.body);
  res.json(result);
});

apiRouter.post('/compras/:id/anular', async (req: Request, res: Response) => {
  res.json(await PurchaseService.anularCompra(parseInt(req.params.id as string)));
});

apiRouter.get('/proveedores', async (req: Request, res: Response) => {
  res.json(await ProvidersService.getProveedores());
});

apiRouter.post('/proveedores', validateParams(providerCreateSchema), async (req: Request, res: Response) => {
  const result = await ProvidersService.createProveedor(req.body);
  res.status(201).json(result);
});

apiRouter.get('/inventario', async (req: Request, res: Response) => {
  res.json(await InventoryService.getInventario());
});

apiRouter.post('/inventario', validateParams(inventoryCreateSchema), async (req: Request, res: Response) => {
  const result = await InventoryService.createItem(req.body);
  res.status(201).json(result);
});

apiRouter.post('/inventario/consumo', validateParams(inventoryConsumeSchema), async (req: Request, res: Response) => {
  const result = await InventoryService.registrarConsumoServicio(req.body);
  res.status(200).json(result);
});

apiRouter.get('/inventario/:id/kardex', async (req: Request, res: Response) => {
  const idItem = parseInt(req.params.id as string);
  res.json(await InventoryService.getKardex(idItem));
});

apiRouter.get('/tributario/cuenta-bn', async (req: Request, res: Response) => {
  res.json(await TributarioService.getCuentaBN());
});
apiRouter.get('/tributario/igv', async (req: Request, res: Response) => {
  res.json(await TributarioService.getControlIGV());
});
apiRouter.post('/tributario/detraccion/:id/deposito', async (req: Request, res: Response) => {
  res.json(await TributarioService.marcarDepositado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/tributario/pago-impuesto', async (req: Request, res: Response) => {
  res.json(await TributarioService.registrarPagoImpuesto(req.body));
});

// Anidamos el API controlada bajo la rama estándar /api
app.use('/api', apiRouter);


// ==========================================
// CIERRE Y CAPTURA: TRAMPA DE ERRORES CENTRALIZADA
// ==========================================
// Este interceptor atrapará todos los rechazos de promises, validadores o accesos prohibidos para despachar JSON controlados.
app.use(errorHandler);


// Levantar Máquina
app.listen(PORT, () => {
  console.log(`[SYS] ERP API Backend SECURE_LAYER Operativo y escuchando en puerto ${PORT}`);
  console.log(`[SYS] Entrar: http://localhost:${PORT}`);
});

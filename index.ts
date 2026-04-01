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
import PrestamosService from './app/modules/finance/PrestamosService';
import TipoCambioService from './app/modules/finance/TipoCambioService';

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

apiRouter.put('/gastos/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const d = req.body;
  const monto = Number(d.monto_base);
  const igv = d.aplica_igv ? monto * 0.18 : 0;
  const total = monto + igv;
  await db.query(`UPDATE Gastos SET nro_oc=?, codigo_contador=?, proveedor_nombre=?,
      concepto=?, fecha=?, monto_base=?, aplica_igv=?, igv_base=?, total_base=?
      WHERE id_gasto=? AND estado_pago='PENDIENTE'`,
      [d.nro_oc || null, d.codigo_contador || null, d.proveedor_nombre, d.concepto, d.fecha,
       monto, d.aplica_igv, igv, total, id]);
  res.json({ success: true });
});
apiRouter.delete('/gastos/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const [rows] = await db.query('SELECT id_gasto FROM Gastos WHERE id_gasto = ?', [id]);
  if (!(rows as any)[0]) throw new Error('No encontrado');
  await db.query("DELETE FROM Transacciones WHERE referencia_tipo='GASTO' AND referencia_id = ?", [id]);
  await db.query('DELETE FROM Gastos WHERE id_gasto = ?', [id]);
  res.json({ success: true });
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

apiRouter.delete('/compras/:id', async (req: Request, res: Response) => {
  res.json(await PurchaseService.deleteCompra(parseInt(req.params.id as string)));
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

apiRouter.delete('/inventario/:id', async (req: Request, res: Response) => {
  res.json(await InventoryService.deleteItem(parseInt(req.params.id as string)));
});

// ===== PRÉSTAMOS =====
apiRouter.get('/prestamos/totales', async (req: Request, res: Response) => {
  res.json(await PrestamosService.getTotales());
});

// Tomados
apiRouter.get('/prestamos/tomados', async (req: Request, res: Response) => {
  res.json(await PrestamosService.getTomados());
});
apiRouter.post('/prestamos/tomados', async (req: Request, res: Response) => {
  res.status(201).json(await PrestamosService.createTomado(req.body));
});
apiRouter.put('/prestamos/tomados/:id', async (req: Request, res: Response) => {
  res.json(await PrestamosService.updateTomado(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/prestamos/tomados/:id', async (req: Request, res: Response) => {
  res.json(await PrestamosService.deleteTomado(parseInt(req.params.id as string)));
});
apiRouter.post('/prestamos/tomados/:id/pago', async (req: Request, res: Response) => {
  res.json(await PrestamosService.pagarTomado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/prestamos/tomados/:id/anular', async (req: Request, res: Response) => {
  res.json(await PrestamosService.anularTomado(parseInt(req.params.id as string)));
});

// Otorgados
apiRouter.get('/prestamos/otorgados', async (req: Request, res: Response) => {
  res.json(await PrestamosService.getOtorgados());
});
apiRouter.post('/prestamos/otorgados', async (req: Request, res: Response) => {
  res.status(201).json(await PrestamosService.createOtorgado(req.body));
});
apiRouter.put('/prestamos/otorgados/:id', async (req: Request, res: Response) => {
  res.json(await PrestamosService.updateOtorgado(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/prestamos/otorgados/:id', async (req: Request, res: Response) => {
  res.json(await PrestamosService.deleteOtorgado(parseInt(req.params.id as string)));
});
apiRouter.post('/prestamos/otorgados/:id/cobro', async (req: Request, res: Response) => {
  res.json(await PrestamosService.cobrarOtorgado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/prestamos/otorgados/:id/anular', async (req: Request, res: Response) => {
  res.json(await PrestamosService.anularOtorgado(parseInt(req.params.id as string)));
});

// ===== TIPO DE CAMBIO =====
apiRouter.get('/tipo-cambio/hoy', async (req: Request, res: Response) => {
  const moneda = (req.query.moneda as string) || 'USD';
  res.json(await TipoCambioService.getTipoCambioHoy(moneda));
});

apiRouter.get('/tipo-cambio', async (req: Request, res: Response) => {
  const moneda = (req.query.moneda as string) || 'USD';
  const limit = parseInt(req.query.limit as string) || 30;
  res.json(await TipoCambioService.getTiposCambio(moneda, limit));
});

apiRouter.post('/tipo-cambio/sincronizar', async (req: Request, res: Response) => {
  const moneda = (req.body.moneda as string) || 'USD';
  res.json(await TipoCambioService.sincronizarDesdeSBS(moneda));
});

apiRouter.post('/tipo-cambio/manual', async (req: Request, res: Response) => {
  const { fecha, moneda, valor_compra, valor_venta } = req.body;
  if (!fecha || !moneda || !valor_compra || !valor_venta) {
    res.status(400).json({ error: 'Faltan campos: fecha, moneda, valor_compra, valor_venta' });
    return;
  }
  res.json(await TipoCambioService.setTipoCambioManual(fecha, moneda, Number(valor_compra), Number(valor_venta)));
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
app.listen(PORT, async () => {
  console.log(`[SYS] ERP API Backend SECURE_LAYER Operativo y escuchando en puerto ${PORT}`);
  console.log(`[SYS] Entrar: http://localhost:${PORT}`);
  // Garantizar cuenta base id=1 siempre existe (requerida por Transacciones)
  const [rows] = await db.query('SELECT id_cuenta FROM Cuentas WHERE id_cuenta = 1');
  if ((rows as any[]).length === 0) {
    await db.query("INSERT INTO Cuentas (nombre, tipo, saldo_actual) VALUES ('Caja General Soles', 'EFECTIVO', 0.00)");
    console.log('[SYS] Cuenta base recreada automáticamente.');
  }
});

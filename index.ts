import express, { Request, Response } from 'express';
// Express 5 soporta async errors nativamente
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import morgan from 'morgan';

// Node / TS Lógica de Negocio
import { db, DEFAULT_ACCOUNT_ID } from './database/connection';
import FinanceService from './app/modules/finance/FinanceService';
import TributarioService from './app/modules/finance/TributarioService';
import CobranzasService from './app/modules/finance/CobranzasService';
import CatalogService from './app/modules/services/CatalogService';
import PurchaseService from './app/modules/purchases/PurchaseService';
import InventoryService from './app/modules/inventory/InventoryService';
import ProvidersService from './app/modules/purchases/ProvidersService';
import PrestamosService from './app/modules/finance/PrestamosService';
import TipoCambioService from './app/modules/finance/TipoCambioService';
import CotizacionService from './app/modules/comercial/CotizacionService';
import CotizacionPDFService from './app/modules/comercial/CotizacionPDFService';
import { CloudinaryService } from './app/modules/comercial/CloudinaryService';
import { GoogleDriveService } from './app/modules/comercial/GoogleDriveService';
import multer from 'multer';
import ConfiguracionMarcaService from './app/modules/comercial/ConfiguracionMarcaService';
import AdminService from './app/modules/admin/AdminService';

// Fase A — Capas transversales
import ConfiguracionService from './app/modules/configuracion/ConfiguracionService';
import AuditoriaService from './app/modules/configuracion/AuditoriaService';
import PeriodosService from './app/modules/configuracion/PeriodosService';
import AdjuntosService from './app/modules/configuracion/AdjuntosService';
import NubefactService from './app/modules/facturacion/NubefactService';
import FacturaService from './app/modules/facturacion/FacturaService';
import PLEExporter from './app/modules/facturacion/PLEExporter';
import { FacturacionCron } from './app/modules/facturacion/FacturacionCron';
import ImportadorService, { EntidadImportable } from './app/modules/importador/ImportadorService';
import OrdenCompraService from './app/modules/compras/OrdenCompraService';
import { OrdenCompraPDFService } from './app/modules/compras/OrdenCompraPDFService';
import ROCService from './app/modules/compras/ROCService';
import { auditLog } from './app/middlewares/auditLog';
import { periodoGuard } from './app/middlewares/periodoGuard';

// Middlewares de Producción (Securización & Validación)
import { requireAuth, requireModulo } from './app/middlewares/auth';
import { validateIdParam } from './app/middlewares/validateId';
import AuthService from './app/modules/auth/AuthService';
import { errorHandler } from './app/middlewares/errorHandler';
import { validateParams } from './app/validators/validateRequest';
import { providerCreateSchema, providerUpdateSchema } from './app/validators/provider.schema';
import { purchaseCreateSchema, purchaseUpdateSchema } from './app/validators/purchase.schema';
import { inventoryCreateSchema, inventoryConsumeSchema } from './app/validators/inventory.schema';
import { serviceCreateSchema, servicePaymentSchema, serviceUpdateSchema } from './app/validators/service.schema';
import { gastoCreateSchema, gastoPaymentSchema, gastoUpdateSchema } from './app/validators/gastos.schema';
import { adminSaldoSchema } from './app/validators/admin.schema';
import { prestamoTomadoCreateSchema, prestamoTomadoUpdateSchema, pagoPrestamSchema,
         prestamoOtorgadoCreateSchema, prestamoOtorgadoUpdateSchema, cobroPrestamoSchema
} from './app/validators/prestamos.schema';
import { depositoDetraccionSchema, pagoImpuestoSchema, tipoCambioManualSchema } from './app/validators/tributario.schema';
import { cotizacionCreateSchema, cotizacionUpdateSchema, cotizacionEstadoSchema } from './app/validators/cotizacion.schema';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CAPAS MIDDLEWARE (Nivel Sistema Global)
// ==========================================
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());

// Logs HTTP configurados en nivel 'dev' para auditoría gerencial
app.use(morgan('dev'));

// Servicio estático (Frontend JS Vanilla)
const publicPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '..', 'public')
  : path.join(__dirname, 'public');
app.use(express.static(publicPath));


// ==========================================
// RUTAS API CONTROLADAS
// ==========================================

// Aplicamos requireAuth de forma global al router de API (Actualmente el middleware permite transparentemente pasar mock, 
// a futuro cuando lo llenes de código cortará solicitudes sin bearer token activo).
const apiRouter = express.Router();
apiRouter.use(requireAuth);

// 1. Dashboard Master (Macro-Indicadores y Cuentas Cruzadas)
apiRouter.use('/finanzas', requireModulo('GERENCIA'));
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

apiRouter.use('/gastos', requireModulo('LOGISTICA'));
apiRouter.get('/gastos', async (req: Request, res: Response) => {
  res.json(await FinanceService.getGastos());
});

apiRouter.post('/gastos', validateParams(gastoCreateSchema), periodoGuard('fecha'), auditLog('Gasto', 'CREATE'), async (req: Request, res: Response) => {
  const result = await FinanceService.createGasto(req.body);
  res.status(201).json(result);
});

apiRouter.put('/gastos/:id', validateIdParam, validateParams(gastoUpdateSchema), periodoGuard('fecha'), auditLog('Gasto', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await FinanceService.updateGasto(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/gastos/:id', validateIdParam, auditLog('Gasto', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await FinanceService.deleteGasto(parseInt(req.params.id as string)));
});
apiRouter.post('/gastos/:id/pago', validateIdParam, validateParams(gastoPaymentSchema), auditLog('Gasto', 'UPDATE'), async (req: Request, res: Response) => {
  const result = await FinanceService.registrarPagoGasto(parseInt(req.params.id as string), req.body.abono);
  res.json(result);
});

apiRouter.post('/gastos/:id/anular', validateIdParam, auditLog('Gasto', 'ANULAR'), async (req: Request, res: Response) => {
  res.json(await FinanceService.anularGasto(parseInt(req.params.id as string)));
});

apiRouter.use('/servicios', requireModulo('FINANZAS'));
apiRouter.get('/servicios/activos', async (req: Request, res: Response) => {
  res.json(await CatalogService.getServiciosActivos());
});
apiRouter.get('/servicios', async (req: Request, res: Response) => {
  res.json(await CatalogService.getServicios());
});

apiRouter.post('/servicios', validateParams(serviceCreateSchema), periodoGuard('fecha'), auditLog('Servicio', 'CREATE'), async (req: Request, res: Response) => {
  const result = await CatalogService.createServicio(req.body);
  res.status(201).json(result);
});

apiRouter.post('/servicios/:id/pago', validateIdParam, validateParams(servicePaymentSchema), auditLog('Servicio', 'UPDATE'), async (req: Request, res: Response) => {
  const idServicio = parseInt(req.params.id as string);
  const result = await CatalogService.registrarCobro(idServicio, req.body.monto_pagado_liquido, req.body.descripcion);
  res.json(result);
});

apiRouter.post('/servicios/:id/anular', validateIdParam, auditLog('Servicio', 'ANULAR'), async (req: Request, res: Response) => {
  res.json(await CatalogService.anularServicio(parseInt(req.params.id as string)));
});
apiRouter.post('/servicios/:id/terminar', validateIdParam, auditLog('Servicio', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await CatalogService.terminarServicio(parseInt(req.params.id as string)));
});
apiRouter.post('/servicios/:id/detraccion-deposito', validateIdParam, auditLog('Servicio', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await TributarioService.marcarDetraccionPorServicio(parseInt(req.params.id as string), req.body));
});
apiRouter.put('/servicios/:id', validateIdParam, validateParams(serviceUpdateSchema), periodoGuard('fecha'), auditLog('Servicio', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await CatalogService.updateServicio(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/servicios/:id', validateIdParam, auditLog('Servicio', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await CatalogService.deleteServicio(parseInt(req.params.id as string)));
});

apiRouter.use('/compras', requireModulo('LOGISTICA'));
apiRouter.get('/compras', async (req: Request, res: Response) => {
  res.json(await PurchaseService.getCompras());
});

apiRouter.post('/compras', validateParams(purchaseCreateSchema), periodoGuard('fecha'), auditLog('Compra', 'CREATE'), async (req: Request, res: Response) => {
  const result = await PurchaseService.registrarCompra(req.body);
  res.json(result);
});

apiRouter.get('/compras/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await PurchaseService.getCompraDetalle(parseInt(req.params.id as string)));
});

apiRouter.put('/compras/:id', validateIdParam, validateParams(purchaseUpdateSchema), periodoGuard('fecha'), auditLog('Compra', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await PurchaseService.updateCompra(parseInt(req.params.id as string), req.body));
});

apiRouter.post('/compras/:id/anular', validateIdParam, auditLog('Compra', 'ANULAR'), async (req: Request, res: Response) => {
  res.json(await PurchaseService.anularCompra(parseInt(req.params.id as string)));
});

apiRouter.delete('/compras/:id', async (_req: Request, res: Response) => {
  res.status(405).json({
    error: 'Operación no permitida. Las compras confirmadas no pueden eliminarse. Use POST /compras/:id/anular para revertir el inventario correctamente.'
  });
});

apiRouter.use('/proveedores', requireModulo('LOGISTICA'));
apiRouter.get('/proveedores', async (req: Request, res: Response) => {
  res.json(await ProvidersService.getProveedores());
});

apiRouter.post('/proveedores', validateParams(providerCreateSchema), async (req: Request, res: Response) => {
  const result = await ProvidersService.createProveedor(req.body);
  res.status(201).json(result);
});

apiRouter.put('/proveedores/:id', validateParams(providerUpdateSchema), async (req: Request, res: Response) => {
  res.json(await ProvidersService.updateProveedor(parseInt(req.params.id as string), req.body));
});

apiRouter.delete('/proveedores/:id', async (req: Request, res: Response) => {
  res.json(await ProvidersService.deleteProveedor(parseInt(req.params.id as string)));
});

apiRouter.use('/inventario', requireModulo('ALMACEN'));
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

apiRouter.get('/inventario/:id/kardex', validateIdParam, async (req: Request, res: Response) => {
  const idItem = parseInt(req.params.id as string);
  res.json(await InventoryService.getKardex(idItem));
});

apiRouter.delete('/inventario/:id', validateIdParam, async (req: Request, res: Response) => {
  const idItem = parseInt(req.params.id as string);
  if (isNaN(idItem)) throw new Error('ID de ítem inválido');
  res.json(await InventoryService.deleteItem(idItem));
});

// ===== PRÉSTAMOS =====
apiRouter.use('/prestamos', requireModulo('FINANZAS'));
apiRouter.get('/prestamos/totales', async (req: Request, res: Response) => {
  res.json(await PrestamosService.getTotales());
});

// Tomados
apiRouter.get('/prestamos/tomados', async (req: Request, res: Response) => {
  res.json(await PrestamosService.getTomados());
});
apiRouter.post('/prestamos/tomados', validateParams(prestamoTomadoCreateSchema), auditLog('PrestamoTomado', 'CREATE'), async (req: Request, res: Response) => {
  res.status(201).json(await PrestamosService.createTomado(req.body));
});
apiRouter.put('/prestamos/tomados/:id', validateIdParam, validateParams(prestamoTomadoUpdateSchema), auditLog('PrestamoTomado', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.updateTomado(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/prestamos/tomados/:id', validateIdParam, auditLog('PrestamoTomado', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.deleteTomado(parseInt(req.params.id as string)));
});
apiRouter.post('/prestamos/tomados/:id/pago', validateIdParam, validateParams(pagoPrestamSchema), auditLog('PrestamoTomado', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.pagarTomado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/prestamos/tomados/:id/anular', validateIdParam, auditLog('PrestamoTomado', 'ANULAR'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.anularTomado(parseInt(req.params.id as string)));
});

// Otorgados
apiRouter.get('/prestamos/otorgados', async (req: Request, res: Response) => {
  res.json(await PrestamosService.getOtorgados());
});
apiRouter.post('/prestamos/otorgados', validateParams(prestamoOtorgadoCreateSchema), auditLog('PrestamoOtorgado', 'CREATE'), async (req: Request, res: Response) => {
  res.status(201).json(await PrestamosService.createOtorgado(req.body));
});
apiRouter.put('/prestamos/otorgados/:id', validateIdParam, validateParams(prestamoOtorgadoUpdateSchema), auditLog('PrestamoOtorgado', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.updateOtorgado(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/prestamos/otorgados/:id', validateIdParam, auditLog('PrestamoOtorgado', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.deleteOtorgado(parseInt(req.params.id as string)));
});
apiRouter.post('/prestamos/otorgados/:id/cobro', validateIdParam, validateParams(cobroPrestamoSchema), auditLog('PrestamoOtorgado', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.cobrarOtorgado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/prestamos/otorgados/:id/anular', validateIdParam, auditLog('PrestamoOtorgado', 'ANULAR'), async (req: Request, res: Response) => {
  res.json(await PrestamosService.anularOtorgado(parseInt(req.params.id as string)));
});

// ===== TIPO DE CAMBIO =====
apiRouter.use('/tipo-cambio', requireModulo('FINANZAS'));
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

apiRouter.post('/tipo-cambio/manual', validateParams(tipoCambioManualSchema), async (req: Request, res: Response) => {
  const { fecha, moneda, valor_compra, valor_venta } = req.body;
  res.json(await TipoCambioService.setTipoCambioManual(fecha, moneda, valor_compra, valor_venta));
});

apiRouter.use('/tributario', requireModulo('FINANZAS'));
apiRouter.get('/tributario/cuenta-bn', async (req: Request, res: Response) => {
  res.json(await TributarioService.getCuentaBN());
});
apiRouter.get('/tributario/igv', async (req: Request, res: Response) => {
  res.json(await TributarioService.getControlIGV());
});
apiRouter.post('/tributario/detraccion/:id/deposito', validateParams(depositoDetraccionSchema), async (req: Request, res: Response) => {
  res.json(await TributarioService.marcarDepositado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/tributario/pago-impuesto', validateParams(pagoImpuestoSchema), async (req: Request, res: Response) => {
  res.json(await TributarioService.registrarPagoImpuesto(req.body));
});

// ===== FINANZAS v2: COBRANZAS =====
apiRouter.use('/cobranzas', requireModulo('FINANZAS'));

apiRouter.get('/cobranzas/bandejas', async (req: Request, res: Response) => {
  const marca = req.query.marca as ('METAL' | 'PERFOTOOLS' | undefined);
  res.json(await CobranzasService.getBandejas(marca));
});

apiRouter.get('/cobranzas/cuentas', async (_req: Request, res: Response) => {
  res.json(await CobranzasService.getCuentas());
});

apiRouter.get('/cobranzas/dashboard', async (_req: Request, res: Response) => {
  res.json(await CobranzasService.getDashboardFinanzas());
});

apiRouter.get('/cobranzas/:id/detalle', async (req: Request, res: Response) => {
  res.json(await CobranzasService.getDetalle(parseInt(req.params.id as string)));
});

apiRouter.post('/cobranzas', periodoGuard('fecha'), auditLog('Cobranza', 'CREATE'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json(await CobranzasService.registrarCobranza(req.body, user?.id));
});

apiRouter.delete('/cobranzas/:id', auditLog('Cobranza', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await CobranzasService.eliminarCobranza(parseInt(req.params.id as string)));
});

apiRouter.put('/cobranzas/:id/tributario', async (req: Request, res: Response) => {
  res.json(await CobranzasService.actualizarTributario(
    parseInt(req.params.id as string),
    req.body
  ));
});

// CRUD de Cuentas bancarias
apiRouter.post('/cobranzas/cuentas', async (req: Request, res: Response) => {
  res.json(await CobranzasService.createCuenta(req.body));
});
apiRouter.put('/cobranzas/cuentas/:id', async (req: Request, res: Response) => {
  res.json(await CobranzasService.updateCuenta(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/cobranzas/cuentas/:id', async (req: Request, res: Response) => {
  res.json(await CobranzasService.deleteCuenta(parseInt(req.params.id as string)));
});

// Gastos bancarios (ITF, comisiones, portes)
apiRouter.get('/cobranzas/gastos-bancarios', async (_req: Request, res: Response) => {
  res.json(await CobranzasService.getGastosBancarios());
});
apiRouter.post('/cobranzas/gastos-bancarios', periodoGuard('fecha'), auditLog('GastoBancario', 'CREATE'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json(await CobranzasService.createGastoBancario(req.body, user?.id));
});
apiRouter.delete('/cobranzas/gastos-bancarios/:id', auditLog('GastoBancario', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await CobranzasService.deleteGastoBancario(parseInt(req.params.id as string)));
});

// Pagos de IGV a SUNAT
apiRouter.get('/cobranzas/pagos-impuestos', async (_req: Request, res: Response) => {
  res.json(await CobranzasService.getPagosImpuestos());
});
apiRouter.post('/cobranzas/pagos-impuestos', periodoGuard('fecha'), auditLog('PagoImpuesto', 'CREATE'), async (req: Request, res: Response) => {
  res.json(await CobranzasService.registrarPagoIGV(req.body));
});
apiRouter.delete('/cobranzas/pagos-impuestos/:id', auditLog('PagoImpuesto', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await CobranzasService.deletePagoImpuesto(parseInt(req.params.id as string)));
});

// Conciliación bancaria
apiRouter.get('/cobranzas/movimientos', async (req: Request, res: Response) => {
  const idCuenta = req.query.id_cuenta ? Number(req.query.id_cuenta) : undefined;
  const estado   = req.query.estado as string | undefined;
  res.json(await CobranzasService.getMovimientosBancarios(idCuenta, estado));
});
apiRouter.post('/cobranzas/movimientos', async (req: Request, res: Response) => {
  res.json(await CobranzasService.createMovimientoBancario(req.body));
});
apiRouter.get('/cobranzas/movimientos/:id/sugerencias', async (req: Request, res: Response) => {
  res.json(await CobranzasService.sugerirConciliacion(parseInt(req.params.id as string)));
});
apiRouter.post('/cobranzas/movimientos/:id/conciliar', async (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json(await CobranzasService.conciliarMovimiento(parseInt(req.params.id as string), req.body, user?.id));
});
apiRouter.post('/cobranzas/movimientos/:id/ignorar', async (req: Request, res: Response) => {
  res.json(await CobranzasService.ignorarMovimiento(parseInt(req.params.id as string)));
});
apiRouter.delete('/cobranzas/movimientos/:id', async (req: Request, res: Response) => {
  res.json(await CobranzasService.deleteMovimientoBancario(parseInt(req.params.id as string)));
});

// Facturación
apiRouter.post('/cobranzas/:id/facturar', async (req: Request, res: Response) => {
  res.json(await CobranzasService.marcarFacturada(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/cobranzas/:id/cobrar', async (req: Request, res: Response) => {
  res.json(await CobranzasService.marcarCobrada(parseInt(req.params.id as string)));
});
apiRouter.post('/cobranzas/:id/revertir-factura', async (req: Request, res: Response) => {
  res.json(await CobranzasService.revertirFacturacion(parseInt(req.params.id as string)));
});

// Libro Bancos
apiRouter.get('/cobranzas/libro-bancos', async (req: Request, res: Response) => {
  const idCuenta = parseInt(req.query.id_cuenta as string);
  const periodo  = req.query.periodo as string | undefined;
  res.json(await CobranzasService.getLibroBancos(idCuenta, periodo));
});
apiRouter.post('/cobranzas/libro-bancos/importar-eecc', async (req: Request, res: Response) => {
  const { id_cuenta, texto } = req.body;
  const userId = (req as any).user?.id_usuario;
  res.json(await CobranzasService.importarEECCInterbank(parseInt(id_cuenta), texto, userId));
});

// ===== COMERCIAL: COTIZACIONES =====
apiRouter.use('/cotizaciones', requireModulo('COMERCIAL'));

apiRouter.get('/cotizaciones/dashboard', async (_req: Request, res: Response) => {
  res.json(await CotizacionService.getDashboard());
});

// RESET TOTAL — solo GERENTE. Borra TODAS las cotizaciones y detalles.
apiRouter.delete('/cotizaciones/reset', async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user || user.rol !== 'GERENTE') {
    return res.status(403).json({ error: 'Solo el GERENTE puede resetear el módulo Comercial' });
  }
  const result = await CotizacionService.resetTodo();
  res.json({ success: true, ...result });
});

// Upload de fotos (multer en memoria → Cloudinary)
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new Error('Solo se aceptan JPG, PNG o WebP'));
    cb(null, true);
  },
});

apiRouter.post('/cotizaciones/upload-foto', uploadFoto.single('foto'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo (campo "foto")' });
  const result = await CloudinaryService.subirFotoCotizacion(req.file.buffer, req.file.originalname);
  res.json(result);
});

apiRouter.get('/cotizaciones/anuladas', async (_req: Request, res: Response) => {
  res.json(await CotizacionService.getAnuladas());
});

apiRouter.get('/cotizaciones', async (req: Request, res: Response) => {
  const marca = req.query.marca as 'METAL' | 'PERFOTOOLS' | undefined;
  res.json(await CotizacionService.getCotizaciones(
    marca === 'METAL' || marca === 'PERFOTOOLS' ? marca : undefined
  ));
});

apiRouter.post('/cotizaciones', validateParams(cotizacionCreateSchema), auditLog('Cotizacion', 'CREATE'), async (req: Request, res: Response) => {
  const result = await CotizacionService.createCotizacion(req.body);

  // Subir PDF a Google Drive en background (no bloquea la respuesta)
  setImmediate(async () => {
    try {
      const pdfBuffer = await CotizacionPDFService.generar(result.id_cotizacion);
      const { fileId, webViewLink } = await GoogleDriveService.subirPDF({
        pdfBuffer,
        nroCotizacion: result.nro_cotizacion,
        marca:         req.body.marca,
        estado:        'EN_PROCESO',
      });
      await CotizacionService.guardarDriveInfo(result.id_cotizacion, fileId, webViewLink);
    } catch (err) {
      console.error('[Drive] Error subiendo PDF:', err);
    }
  });

  res.status(201).json(result);
});

apiRouter.get('/cotizaciones/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await CotizacionService.getCotizacionById(parseInt(req.params.id as string)));
});

apiRouter.put('/cotizaciones/:id', validateIdParam, validateParams(cotizacionUpdateSchema), auditLog('Cotizacion', 'UPDATE'), async (req: Request, res: Response) => {
  await CotizacionService.updateCotizacion(parseInt(req.params.id as string), req.body);
  res.json({ success: true });
});

apiRouter.put('/cotizaciones/:id/estado', validateIdParam, validateParams(cotizacionEstadoSchema), auditLog('Cotizacion', 'UPDATE'), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  await CotizacionService.updateEstado(id, req.body.estado);

  // Mover en Drive al nuevo estado (background)
  setImmediate(async () => {
    try {
      const cot = await CotizacionService.getCotizacionById(id);
      if (cot.drive_file_id) {
        await GoogleDriveService.moverAEstado(cot.drive_file_id, cot.marca, req.body.estado);
      }
    } catch (err) {
      console.error('[Drive] Error moviendo PDF de estado:', err);
    }
  });

  res.json({ success: true });
});

apiRouter.post('/cotizaciones/:id/anular', validateIdParam, auditLog('Cotizacion', 'ANULAR'), async (req: Request, res: Response) => {
  await CotizacionService.anularCotizacion(parseInt(req.params.id as string));
  res.json({ success: true });
});

apiRouter.get('/cotizaciones/:id/pdf', validateIdParam, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const buffer = await CotizacionPDFService.generar(id);
  const cot = await CotizacionService.getCotizacionById(id);
  const filename = `${String(cot.nro_cotizacion).replace(/\s+/g, '_')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

// ===== COMERCIAL: CONFIGURACIÓN POR MARCA =====
// GET lo usa cualquier usuario de Comercial (para previsualizar y cargar el PDF).
// PUT (edición) queda restringido a GERENTE.
apiRouter.get('/configuracion-marca', requireModulo('COMERCIAL'), async (_req: Request, res: Response) => {
  res.json(await ConfiguracionMarcaService.getAll());
});
apiRouter.get('/configuracion-marca/:marca', requireModulo('COMERCIAL'), async (req: Request, res: Response) => {
  res.json(await ConfiguracionMarcaService.getByMarca(req.params.marca as any));
});
apiRouter.put('/configuracion-marca/:marca', requireModulo('GERENCIA'), async (req: Request, res: Response) => {
  await ConfiguracionMarcaService.update(req.params.marca as any, req.body);
  res.json({ success: true });
});

// ===== ADMIN: RESET BASE DE DATOS =====
apiRouter.use('/admin', requireModulo('GERENCIA'));
apiRouter.post('/admin/reset-db', async (req: Request, res: Response) => {
  res.json(await AdminService.resetDb());
});

// ===== ADMIN: SALDOS DE CUENTAS =====
apiRouter.get('/admin/cuentas-saldo', async (req: Request, res: Response) => {
  res.json(await AdminService.getCuentasSaldo());
});

// ===== ADMIN: SALDO INICIAL =====
apiRouter.post('/admin/saldo-inicial', validateParams(adminSaldoSchema), async (req: Request, res: Response) => {
  res.json(await AdminService.setSaldoInicial(req.body));
});

// ===== ADMIN: GASTO EN PERSONAL (Módulo Administración) =====
apiRouter.use('/admin/gasto-personal', requireModulo('ADMINISTRACION'));
apiRouter.get('/admin/gasto-personal', async (req: Request, res: Response) => {
  const anio = parseInt(req.query.anio as string) || new Date().getFullYear();
  const mes = req.query.mes ? parseInt(req.query.mes as string) : undefined;
  res.json(await AdminService.getGastoPersonal(anio, mes));
});

// ===== AUTH: Rutas públicas (sin requireAuth) =====
const authRouter = express.Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new Error('Email y password son requeridos.');
  res.json(await AuthService.login(email, password));
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json(req.user);
});

app.use('/api/auth', authRouter);

// ===== USUARIOS: Solo GERENTE =====
const usuariosRouter = express.Router();
usuariosRouter.use(requireAuth);

usuariosRouter.get('/', async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo el GERENTE puede ver usuarios.' });
  res.json(await AuthService.getUsuarios());
});

usuariosRouter.post('/', async (req: Request, res: Response) => {
  const result = await AuthService.crearUsuario(req.body, req.user!.rol);
  res.status(201).json(result);
});

usuariosRouter.put('/:id/modulos', async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo el GERENTE puede asignar módulos.' });
  const { modulos } = req.body;
  if (!Array.isArray(modulos)) throw new Error('modulos debe ser un array.');
  res.json(await AuthService.asignarModulos(parseInt(req.params.id as string), modulos));
});

usuariosRouter.put('/:id/toggle', async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo el GERENTE puede activar/desactivar usuarios.' });
  res.json(await AuthService.toggleActivo(parseInt(req.params.id as string)));
});

app.use('/api/usuarios', usuariosRouter);

// ==========================================
// CONFIGURACIÓN, AUDITORÍA, PERIODOS, ADJUNTOS, FACTURACIÓN (Fase A)
// ==========================================
const configRouter = express.Router();
configRouter.use(requireAuth);

configRouter.get('/', async (_req, res) => {
  res.json(await ConfiguracionService.getActual());
});

configRouter.put('/', auditLog('ConfiguracionEmpresa', 'CONFIG'), async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo el GERENTE puede modificar la configuración.' });
  await ConfiguracionService.update(req.body);
  res.json({ success: true });
});

configRouter.get('/libros-obligatorios', async (_req, res) => {
  res.json({ libros: await ConfiguracionService.librosObligatorios() });
});

configRouter.post('/setup', auditLog('ConfiguracionEmpresa', 'CONFIG'), async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo el GERENTE puede ejecutar el setup inicial.' });
  res.json(await ConfiguracionService.setupInicial(req.body));
});

configRouter.get('/existe', async (_req, res) => {
  res.json({ existe: await ConfiguracionService.existeConfiguracion() });
});

app.use('/api/config', configRouter);

// ===== AUDITORÍA =====
const auditoriaRouter = express.Router();
auditoriaRouter.use(requireAuth);

auditoriaRouter.get('/', async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE puede consultar auditoría.' });
  const filtros = {
    entidad: req.query.entidad as string | undefined,
    entidad_id: req.query.entidad_id as string | undefined,
    id_usuario: req.query.id_usuario ? Number(req.query.id_usuario) : undefined,
    accion: req.query.accion as any,
    desde: req.query.desde as string | undefined,
    hasta: req.query.hasta as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : 200,
  };
  res.json(await AuditoriaService.query(filtros));
});

app.use('/api/auditoria', auditoriaRouter);

// ===== PERIODOS CONTABLES =====
const periodosRouter = express.Router();
periodosRouter.use(requireAuth);

periodosRouter.get('/', async (req: Request, res: Response) => {
  const anio = req.query.anio ? Number(req.query.anio) : undefined;
  res.json(await PeriodosService.list(anio));
});

periodosRouter.post('/cerrar', auditLog('PeriodoContable', 'CONFIG'), async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE puede cerrar periodos.' });
  const { anio, mes, observaciones } = req.body;
  if (!anio || !mes) return res.status(400).json({ error: 'anio y mes requeridos' });
  res.json(await PeriodosService.cerrar(Number(anio), Number(mes), req.user!.id_usuario, observaciones));
});

periodosRouter.post('/reabrir', auditLog('PeriodoContable', 'CONFIG'), async (req: Request, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE puede reabrir periodos.' });
  const { anio, mes } = req.body;
  if (!anio || !mes) return res.status(400).json({ error: 'anio y mes requeridos' });
  res.json(await PeriodosService.reabrir(Number(anio), Number(mes), req.user!.id_usuario));
});

app.use('/api/periodos', periodosRouter);

// ===== ADJUNTOS (PDFs/imágenes genéricas vinculadas a cualquier entidad) =====
const uploadAdjunto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const adjuntosRouter = express.Router();
adjuntosRouter.use(requireAuth);

adjuntosRouter.post('/:ref_tipo/:ref_id', uploadAdjunto.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido (campo "file")' });
  const r = await AdjuntosService.subir({
    ref_tipo: req.params.ref_tipo as string,
    ref_id: Number(req.params.ref_id),
    buffer: req.file.buffer,
    nombre: req.file.originalname,
    mimetype: req.file.mimetype,
    id_usuario: req.user!.id_usuario,
  });
  res.json(r);
});

adjuntosRouter.get('/:ref_tipo/:ref_id', async (req: Request, res: Response) => {
  res.json(await AdjuntosService.listar(req.params.ref_tipo as string, Number(req.params.ref_id)));
});

adjuntosRouter.delete('/:id', validateIdParam, auditLog('Adjunto', 'DELETE'), async (req: Request, res: Response) => {
  res.json(await AdjuntosService.eliminar(Number(req.params.id)));
});

app.use('/api/adjuntos', adjuntosRouter);

// ===== FACTURACIÓN ELECTRÓNICA — diagnóstico (real emisión llega en Fase B) =====
const facturacionRouter = express.Router();
facturacionRouter.use(requireAuth);

facturacionRouter.get('/diagnostico', async (_req, res) => {
  res.json(await NubefactService.diagnostico());
});

app.use('/api/facturacion', facturacionRouter);

// ===== FACTURAS (CPE — Comprobantes de Pago Electrónicos) =====
const facturasRouter = express.Router();
facturasRouter.use(requireAuth);

// Emitir factura/boleta desde una cotización aprobada
facturasRouter.post(
  '/emitir-desde-cotizacion/:id_cotizacion',
  auditLog('Factura', 'EMIT'),
  async (req: Request, res: Response) => {
    const id_cot = parseInt(req.params.id_cotizacion as string);
    if (isNaN(id_cot) || id_cot <= 0) {
      return res.status(400).json({ error: 'id_cotizacion inválido' });
    }
    const result = await FacturaService.emitirDesdeCotizacion(id_cot, {
      forma_pago: req.body?.forma_pago,
      dias_credito: req.body?.dias_credito,
      observaciones: req.body?.observaciones,
      forzar_tipo: req.body?.forzar_tipo,
      id_usuario_emisor: req.user!.id_usuario,
    });
    res.json(result);
  }
);

// Listar con filtros
facturasRouter.get('/', async (req: Request, res: Response) => {
  res.json(await FacturaService.listar({
    desde: req.query.desde as string | undefined,
    hasta: req.query.hasta as string | undefined,
    tipo: req.query.tipo as any,
    estado: req.query.estado as string | undefined,
    cliente_numero_doc: req.query.cliente_numero_doc as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  }));
});

// Ficha completa con detalle
facturasRouter.get('/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await FacturaService.obtener(parseInt(req.params.id as string)));
});

// Refrescar estado desde SUNAT (útil cuando quedó PENDIENTE o ERROR)
facturasRouter.post('/:id/consultar-estado', validateIdParam, auditLog('Factura', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await FacturaService.consultarEstado(parseInt(req.params.id as string)));
});

app.use('/api/facturas', facturasRouter);

// ===== LIBROS ELECTRÓNICOS (PLE) SUNAT =====
const pleRouter = express.Router();
pleRouter.use(requireAuth);

/**
 * Genera el TXT del Registro de Ventas (14.1) para el periodo dado.
 * Se devuelve como descarga forzada.
 */
pleRouter.get('/ventas', auditLog('PLEVentas', 'EXPORT'), async (req: Request, res: Response) => {
  const anio = parseInt(req.query.anio as string) || new Date().getFullYear();
  const mes = parseInt(req.query.mes as string) || (new Date().getMonth() + 1);
  const file = await PLEExporter.registroVentas({ anio, mes });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.nombreArchivo}"`);
  res.setHeader('X-PLE-Lineas', String(file.cantidadLineas));
  res.send(file.contenido);
});

pleRouter.get('/compras', auditLog('PLECompras', 'EXPORT'), async (req: Request, res: Response) => {
  const anio = parseInt(req.query.anio as string) || new Date().getFullYear();
  const mes = parseInt(req.query.mes as string) || (new Date().getMonth() + 1);
  const file = await PLEExporter.registroCompras({ anio, mes });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.nombreArchivo}"`);
  res.setHeader('X-PLE-Lineas', String(file.cantidadLineas));
  res.send(file.contenido);
});

/**
 * Preview del contenido sin descargar — útil para la UI que muestra
 * "hay X facturas que se exportarán" antes de dar click al botón.
 */
pleRouter.get('/ventas/preview', async (req: Request, res: Response) => {
  const anio = parseInt(req.query.anio as string) || new Date().getFullYear();
  const mes = parseInt(req.query.mes as string) || (new Date().getMonth() + 1);
  const file = await PLEExporter.registroVentas({ anio, mes });
  res.json({
    nombreArchivo: file.nombreArchivo,
    lineas: file.cantidadLineas,
    preview: file.contenido.split('\r\n').slice(0, 5),
  });
});

pleRouter.get('/compras/preview', async (req: Request, res: Response) => {
  const anio = parseInt(req.query.anio as string) || new Date().getFullYear();
  const mes = parseInt(req.query.mes as string) || (new Date().getMonth() + 1);
  const file = await PLEExporter.registroCompras({ anio, mes });
  res.json({
    nombreArchivo: file.nombreArchivo,
    lineas: file.cantidadLineas,
    preview: file.contenido.split('\r\n').slice(0, 5),
  });
});

app.use('/api/ple', pleRouter);

// ===== IMPORTADOR — bulk import CSV para data histórica =====
const importadorRouter = express.Router();
importadorRouter.use(requireAuth);

/**
 * Descarga template CSV de una entidad.
 */
importadorRouter.get('/template/:entidad', (req: Request, res: Response) => {
  const entidad = req.params.entidad as EntidadImportable;
  const csv = ImportadorService.getTemplate(entidad);
  if (!csv) return res.status(400).json({ error: 'Entidad no soportada' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="template_${entidad}.csv"`);
  res.send(csv);
});

/**
 * Sube un CSV y devuelve preview + errores sin persistir.
 * Body: { entidad, csv_texto }
 */
importadorRouter.post('/preview', async (req: any, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE' });
  const { entidad, csv_texto } = req.body;
  if (!entidad || !csv_texto) return res.status(400).json({ error: 'entidad y csv_texto requeridos' });
  const result = await ImportadorService.parsear(entidad, csv_texto);
  res.json(result);
});

/**
 * Confirma e inserta los datos validados.
 * Body: { entidad, datos }
 */
importadorRouter.post('/commit', auditLog('Importador', 'CREATE'), async (req: any, res: Response) => {
  if (req.user!.rol !== 'GERENTE') return res.status(403).json({ error: 'Solo GERENTE' });
  const { entidad, datos } = req.body;
  if (!entidad || !Array.isArray(datos)) return res.status(400).json({ error: 'entidad y datos[] requeridos' });
  const result = await ImportadorService.commit(entidad, datos);
  res.json(result);
});

app.use('/api/importador', importadorRouter);

// ===== ÓRDENES DE COMPRA — flujo formal proveedor =====
const ocRouter = express.Router();
ocRouter.use(requireAuth);

ocRouter.get('/', async (req: Request, res: Response) => {
  res.json(await OrdenCompraService.listar({
    estado:        req.query.estado as any,
    desde:         req.query.desde as string | undefined,
    hasta:         req.query.hasta as string | undefined,
    id_proveedor:  req.query.id_proveedor ? Number(req.query.id_proveedor) : undefined,
    empresa:       req.query.empresa as any,
    limit:         req.query.limit ? Number(req.query.limit) : undefined,
    tipo_oc:       req.query.tipo_oc as any,
    centro_costo:  req.query.centro_costo as string | undefined,
    id_servicio:   req.query.id_servicio ? Number(req.query.id_servicio) : undefined,
  }));
});

// ROC — Reporte de Órdenes de Compra semanal (Excel).
// DEBE ir ANTES de /:id para que no lo capture validateIdParam con "roc" como id.
ocRouter.get('/roc', async (req: Request, res: Response) => {
  const centro_costo = String(req.query.centro_costo || 'OFICINA CENTRAL');
  const anio        = Number(req.query.anio) || new Date().getFullYear();
  const semana      = req.query.semana ? Number(req.query.semana) : undefined;
  const empresa     = (req.query.empresa as 'ME' | 'PT' | undefined) || undefined;

  const buffer = await ROCService.generar({
    centro_costo,
    anio,
    semana_corte: semana,
    empresa,
  });

  const semanaTxt = String(semana || '').padStart(2, '0');
  const filename = `ROC - SEMANA ${semanaTxt} - ${centro_costo}.xlsx`.replace(/[\\\/:"*?<>|]/g, ' ');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

ocRouter.get('/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await OrdenCompraService.obtener(Number(req.params.id)));
});

ocRouter.post('/', auditLog('OrdenCompra', 'CREATE'), async (req: any, res: Response) => {
  req.body.id_usuario = req.user!.id_usuario;
  res.status(201).json(await OrdenCompraService.crear(req.body));
});

ocRouter.post('/:id/aprobar', validateIdParam, auditLog('OrdenCompra', 'UPDATE'), async (req: any, res: Response) => {
  res.json(await OrdenCompraService.aprobar(
    Number(req.params.id), req.user!.id_usuario, req.user!.rol, req.body?.comentario
  ));
});

ocRouter.post('/:id/enviar', validateIdParam, auditLog('OrdenCompra', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await OrdenCompraService.marcarEnviada(Number(req.params.id)));
});

ocRouter.post('/:id/recibir', validateIdParam, auditLog('OrdenCompra', 'UPDATE'), async (req: Request, res: Response) => {
  res.json(await OrdenCompraService.recibir(Number(req.params.id), req.body?.lineas || []));
});

ocRouter.post('/:id/facturar', validateIdParam, auditLog('OrdenCompra', 'UPDATE'), async (req: Request, res: Response) => {
  const { nro_factura_proveedor, fecha_factura } = req.body;
  if (!nro_factura_proveedor || !fecha_factura) {
    return res.status(400).json({ error: 'nro_factura_proveedor y fecha_factura requeridos' });
  }
  res.json(await OrdenCompraService.facturar(Number(req.params.id), nro_factura_proveedor, fecha_factura));
});

ocRouter.post('/:id/anular', validateIdParam, auditLog('OrdenCompra', 'ANULAR'), async (req: Request, res: Response) => {
  res.json(await OrdenCompraService.anular(Number(req.params.id), req.body?.motivo || 'Sin motivo'));
});

ocRouter.get('/:id/pdf', validateIdParam, async (req: Request, res: Response) => {
  const oc = await OrdenCompraService.obtener(Number(req.params.id));
  const cfg = await ConfiguracionService.getActual();
  const pdf = await OrdenCompraPDFService.generar(oc as any, cfg as any);
  const filename = `OC N° ${oc.nro_oc} - ${oc.proveedor_nombre || 'proveedor'} - ${oc.centro_costo}.pdf`
    .replace(/[\\\/:"*?<>|]/g, ' ');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(pdf);
});

app.use('/api/ordenes-compra', ocRouter);

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
  // Garantizar cuenta base siempre existe (requerida por Transacciones)
  const [rows] = await db.query('SELECT id_cuenta FROM Cuentas WHERE id_cuenta = ?', [DEFAULT_ACCOUNT_ID]);
  if ((rows as any[]).length === 0) {
    await db.query("INSERT INTO Cuentas (nombre, tipo, saldo_actual) VALUES ('Caja General Soles', 'EFECTIVO', 0.00)");
    console.log('[SYS] Cuenta base recreada automáticamente.');
  }
  // Cron de refresco estado SUNAT (solo activo en modo REAL)
  FacturacionCron.start();
});

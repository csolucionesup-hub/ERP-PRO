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

apiRouter.post('/gastos', validateParams(gastoCreateSchema), async (req: Request, res: Response) => {
  const result = await FinanceService.createGasto(req.body);
  res.status(201).json(result);
});

apiRouter.put('/gastos/:id', validateIdParam, validateParams(gastoUpdateSchema), async (req: Request, res: Response) => {
  res.json(await FinanceService.updateGasto(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/gastos/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await FinanceService.deleteGasto(parseInt(req.params.id as string)));
});
apiRouter.post('/gastos/:id/pago', validateIdParam, validateParams(gastoPaymentSchema), async (req: Request, res: Response) => {
  const result = await FinanceService.registrarPagoGasto(parseInt(req.params.id as string), req.body.abono);
  res.json(result);
});

apiRouter.post('/gastos/:id/anular', validateIdParam, async (req: Request, res: Response) => {
  res.json(await FinanceService.anularGasto(parseInt(req.params.id as string)));
});

apiRouter.use('/servicios', requireModulo('FINANZAS'));
apiRouter.get('/servicios/activos', async (req: Request, res: Response) => {
  res.json(await CatalogService.getServiciosActivos());
});
apiRouter.get('/servicios', async (req: Request, res: Response) => {
  res.json(await CatalogService.getServicios());
});

apiRouter.post('/servicios', validateParams(serviceCreateSchema), async (req: Request, res: Response) => {
  const result = await CatalogService.createServicio(req.body);
  res.status(201).json(result);
});

apiRouter.post('/servicios/:id/pago', validateIdParam, validateParams(servicePaymentSchema), async (req: Request, res: Response) => {
  const idServicio = parseInt(req.params.id as string);
  const result = await CatalogService.registrarCobro(idServicio, req.body.monto_pagado_liquido, req.body.descripcion);
  res.json(result);
});

apiRouter.post('/servicios/:id/anular', validateIdParam, async (req: Request, res: Response) => {
  res.json(await CatalogService.anularServicio(parseInt(req.params.id as string)));
});
apiRouter.post('/servicios/:id/terminar', validateIdParam, async (req: Request, res: Response) => {
  res.json(await CatalogService.terminarServicio(parseInt(req.params.id as string)));
});
apiRouter.post('/servicios/:id/detraccion-deposito', validateIdParam, async (req: Request, res: Response) => {
  res.json(await TributarioService.marcarDetraccionPorServicio(parseInt(req.params.id as string), req.body));
});
apiRouter.put('/servicios/:id', validateIdParam, validateParams(serviceUpdateSchema), async (req: Request, res: Response) => {
  res.json(await CatalogService.updateServicio(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/servicios/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await CatalogService.deleteServicio(parseInt(req.params.id as string)));
});

apiRouter.use('/compras', requireModulo('LOGISTICA'));
apiRouter.get('/compras', async (req: Request, res: Response) => {
  res.json(await PurchaseService.getCompras());
});

apiRouter.post('/compras', validateParams(purchaseCreateSchema), async (req: Request, res: Response) => {
  const result = await PurchaseService.registrarCompra(req.body);
  res.json(result);
});

apiRouter.get('/compras/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await PurchaseService.getCompraDetalle(parseInt(req.params.id as string)));
});

apiRouter.put('/compras/:id', validateIdParam, validateParams(purchaseUpdateSchema), async (req: Request, res: Response) => {
  res.json(await PurchaseService.updateCompra(parseInt(req.params.id as string), req.body));
});

apiRouter.post('/compras/:id/anular', validateIdParam, async (req: Request, res: Response) => {
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
apiRouter.post('/prestamos/tomados', validateParams(prestamoTomadoCreateSchema), async (req: Request, res: Response) => {
  res.status(201).json(await PrestamosService.createTomado(req.body));
});
apiRouter.put('/prestamos/tomados/:id', validateIdParam, validateParams(prestamoTomadoUpdateSchema), async (req: Request, res: Response) => {
  res.json(await PrestamosService.updateTomado(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/prestamos/tomados/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await PrestamosService.deleteTomado(parseInt(req.params.id as string)));
});
apiRouter.post('/prestamos/tomados/:id/pago', validateIdParam, validateParams(pagoPrestamSchema), async (req: Request, res: Response) => {
  res.json(await PrestamosService.pagarTomado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/prestamos/tomados/:id/anular', validateIdParam, async (req: Request, res: Response) => {
  res.json(await PrestamosService.anularTomado(parseInt(req.params.id as string)));
});

// Otorgados
apiRouter.get('/prestamos/otorgados', async (req: Request, res: Response) => {
  res.json(await PrestamosService.getOtorgados());
});
apiRouter.post('/prestamos/otorgados', validateParams(prestamoOtorgadoCreateSchema), async (req: Request, res: Response) => {
  res.status(201).json(await PrestamosService.createOtorgado(req.body));
});
apiRouter.put('/prestamos/otorgados/:id', validateIdParam, validateParams(prestamoOtorgadoUpdateSchema), async (req: Request, res: Response) => {
  res.json(await PrestamosService.updateOtorgado(parseInt(req.params.id as string), req.body));
});
apiRouter.delete('/prestamos/otorgados/:id', validateIdParam, async (req: Request, res: Response) => {
  res.json(await PrestamosService.deleteOtorgado(parseInt(req.params.id as string)));
});
apiRouter.post('/prestamos/otorgados/:id/cobro', validateIdParam, validateParams(cobroPrestamoSchema), async (req: Request, res: Response) => {
  res.json(await PrestamosService.cobrarOtorgado(parseInt(req.params.id as string), req.body));
});
apiRouter.post('/prestamos/otorgados/:id/anular', validateIdParam, async (req: Request, res: Response) => {
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

apiRouter.post('/cotizaciones', validateParams(cotizacionCreateSchema), async (req: Request, res: Response) => {
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

apiRouter.put('/cotizaciones/:id', validateIdParam, validateParams(cotizacionUpdateSchema), async (req: Request, res: Response) => {
  await CotizacionService.updateCotizacion(parseInt(req.params.id as string), req.body);
  res.json({ success: true });
});

apiRouter.put('/cotizaciones/:id/estado', validateIdParam, validateParams(cotizacionEstadoSchema), async (req: Request, res: Response) => {
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

apiRouter.post('/cotizaciones/:id/anular', validateIdParam, async (req: Request, res: Response) => {
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
});

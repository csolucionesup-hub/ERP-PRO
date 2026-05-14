/**
 * API Front-End Service
 * Conector real contra el Backend Node.js de la Empresa
 */

const API_BASE_URL = '/api';

// ── Base fetch con JWT automático ───────────────────────────
async function fetchAPI(url, options = {}) {
  const token = localStorage.getItem('erp_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  try {
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      localStorage.removeItem('erp_token');
      localStorage.removeItem('erp_user');
      window.location.replace('/login.html');
      return;
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const msg = errData?.error || `Error HTTP: ${response.status}`;
      const err = new Error(msg);
      // Preservar campos extra del body (code, datos auxiliares para UI) — útil
      // por ejemplo cuando recibir() devuelve 422 con lineas_pendientes para que
      // el front abra el modal de resolución de ítems.
      if (errData && typeof errData === 'object') {
        Object.assign(err, errData);
        err.status = response.status;
      }
      // Marca semántica para que las páginas puedan reaccionar al setup pendiente
      if (typeof msg === 'string' && msg.includes('ConfiguracionEmpresa vacía')) {
        err.code = 'CONFIG_VACIA';
        // Si es Gerente y aún no está en el wizard, redirigirlo automáticamente.
        try {
          const u = JSON.parse(localStorage.getItem('erp_user') || '{}');
          if (u.rol === 'GERENTE' && window.location.hash !== '#configuracion') {
            err.message = 'Necesitas completar la configuración inicial. Te llevamos al wizard…';
            setTimeout(() => { window.location.hash = 'configuracion'; }, 600);
          } else if (u.rol !== 'GERENTE') {
            err.message = 'El sistema aún no está configurado. Pídele al Gerente que complete el setup inicial.';
          }
        } catch { /* noop */ }
      }
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`[API ERROR] -> ${url}:`, error);
    throw error;
  }
}

const get  = (endpoint)       => fetchAPI(`${API_BASE_URL}${endpoint}`);
const post = (endpoint, data) => fetchAPI(`${API_BASE_URL}${endpoint}`, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined });
const put  = (endpoint, data) => fetchAPI(`${API_BASE_URL}${endpoint}`, { method: 'PUT',  body: JSON.stringify(data) });
const del  = (endpoint)       => fetchAPI(`${API_BASE_URL}${endpoint}`, { method: 'DELETE' });

export const api = {
  finances: {
    getResumenOperativo:  () => get('/finanzas/operativo'),
    getDashboard:         () => get('/finanzas/dashboard'),
    getCxC:               () => get('/finanzas/cxc'),
    getCxP:               () => get('/finanzas/cxp'),
    getGastos:            () => get('/gastos'),
    createGasto:    (data)    => post('/gastos', data),
    updateGasto:    (id, d)   => put(`/gastos/${id}`, d),
    editarMetadataGasto: (id, d) => put(`/gastos/${id}/metadata`, d),
    pagarGasto:     (id, ab)  => post(`/gastos/${id}/pago`, { abono: ab }),
    anularGasto:    (id)      => post(`/gastos/${id}/anular`),
    deleteGasto:    (id)      => del(`/gastos/${id}`),
  },
  services: {
    getServicios:         () => get('/servicios'),
    getServiciosActivos:  () => get('/servicios/activos'),
    createServicio: (data)    => post('/servicios', data),
    cobrarServicio: (id, m)   => post(`/servicios/${id}/pago`, { monto_pagado_liquido: m, descripcion: 'Abono Registrado por Operador' }),
    anularServicio: (id)      => post(`/servicios/${id}/anular`),
    terminarServicio:     (id)    => post(`/servicios/${id}/terminar`),
    depositarDetraccion:  (id, d) => post(`/servicios/${id}/detraccion-deposito`, d),
    updateServicio: (id, d)       => put(`/servicios/${id}`, d),
    deleteServicio: (id)          => del(`/servicios/${id}`),
  },
  purchases: {
    getCompras:           () => get('/compras'),
    getCompraDetalle: (id)    => get(`/compras/${id}`),
    createCompra:   (data)    => post('/compras', data),
    updateCompra:   (id, d)   => put(`/compras/${id}`, d),
    anularCompra:   (id)      => post(`/compras/${id}/anular`),
    editarMetadataCompra: (id, d) => put(`/compras/${id}/metadata`, d),
    deleteCompra:   (id)      => del(`/compras/${id}`),
    getProveedores:       () => get('/proveedores'),
    createProveedor:(data)    => post('/proveedores', data),
    updateProveedor:(id, d)   => put(`/proveedores/${id}`, d),
    deleteProveedor:(id)      => del(`/proveedores/${id}`),
  },
  tributario: {
    getCuentaBN:          () => get('/tributario/cuenta-bn'),
    getControlIGV:        () => get('/tributario/igv'),
    marcarDeposito: (id, d)   => post(`/tributario/detraccion/${id}/deposito`, d),
    pagarImpuesto:  (data)    => post('/tributario/pago-impuesto', data),
  },
  prestamos: {
    getTomados:           () => get('/prestamos/tomados'),
    getOtorgados:         () => get('/prestamos/otorgados'),
    getTotales:           () => get('/prestamos/totales'),
    createTomado:   (data)    => post('/prestamos/tomados', data),
    createOtorgado: (data)    => post('/prestamos/otorgados', data),
    updateTomado:   (id, d)   => put(`/prestamos/tomados/${id}`, d),
    updateOtorgado: (id, d)   => put(`/prestamos/otorgados/${id}`, d),
    pagarTomado:    (id, m)   => post(`/prestamos/tomados/${id}/pago`, { monto: m }),
    cobrarOtorgado: (id, m)   => post(`/prestamos/otorgados/${id}/cobro`, { monto: m }),
    anularTomado:   (id)      => post(`/prestamos/tomados/${id}/anular`),
    anularOtorgado: (id)      => post(`/prestamos/otorgados/${id}/anular`),
    deleteTomado:   (id)      => del(`/prestamos/tomados/${id}`),
    deleteOtorgado: (id)      => del(`/prestamos/otorgados/${id}`),
    // Mig 071 — maestro de contrapartes + dashboard consolidado
    getContrapartes:       (activos = false) => get(`/prestamos/contrapartes${activos ? '?activos=1' : ''}`),
    getResumenContrapartes: (filtros = {}) => {
      const p = new URLSearchParams();
      if (filtros.empresa) p.append('empresa', filtros.empresa);
      if (filtros.tipo)    p.append('tipo',    filtros.tipo);
      const q = p.toString();
      return get(`/prestamos/contrapartes/resumen${q ? '?' + q : ''}`);
    },
    getContraparte:        (id)       => get(`/prestamos/contrapartes/${id}`),
    createContraparte:     (data)     => post('/prestamos/contrapartes', data),
    updateContraparte:     (id, data) => put(`/prestamos/contrapartes/${id}`, data),
    deleteContraparte:     (id)       => del(`/prestamos/contrapartes/${id}`),
  },
  tipoCambio: {
    getHoy:       (m = 'USD')           => get(`/tipo-cambio/hoy?moneda=${m}`),
    getHistorial: (m = 'USD', l = 30)   => get(`/tipo-cambio?moneda=${m}&limit=${l}`),
    sincronizar:  (m = 'USD')           => post('/tipo-cambio/sincronizar', { moneda: m }),
    setManual: (fecha, moneda, vc, vv)  => post('/tipo-cambio/manual', { fecha, moneda, valor_compra: vc, valor_venta: vv }),
  },
  inventory: {
    getInventario:        () => get('/inventario'),
    getDashboard:         () => get('/inventario/dashboard'),
    getKardex:       (id)    => get(`/inventario/${id}/kardex`),
    cotizacionesFondeadas: () => get('/inventario/cotizaciones-fondeadas'),
    createInventarioItem: (data) => post('/inventario', data),
    consumirInventario:   (data) => post('/inventario/consumo', data),
    editarMetadataItem:   (id, d) => put(`/inventario/${id}/metadata`, d),
    deleteInventarioItem: (id, opts = {}) => del(`/inventario/${id}${opts.force ? '?force=1' : ''}`),
    // mig 070 — familia / marca + corrección de recepción mal asignada
    getFamiliaSimilares:  (id) => get(`/inventario/${id}/familia-similares`),
    corregirRecepcion:    (idMov, data) => post(`/inventario/movimientos/${idMov}/corregir`, data),
  },
  cotizaciones: {
    getDashboard:     ()          => get('/cotizaciones/dashboard'),
    getAnuladas:      ()          => get('/cotizaciones/anuladas'),
    getCotizaciones: (marca) => get(marca ? `/cotizaciones?marca=${marca}` : '/cotizaciones'),
    getCotizacion:    (id)     => get(`/cotizaciones/${id}`),
    createCotizacion: (data)   => post('/cotizaciones', data),
    updateCotizacion: (id, d)  => put(`/cotizaciones/${id}`, d),
    updateEstado:     (id, e)  => put(`/cotizaciones/${id}/estado`, { estado: e }),
    editarFecha:      (id, f)  => put(`/cotizaciones/${id}/fecha`, { fecha: f }),
    editarFechaAprobacion: (id, f) => put(`/cotizaciones/${id}/fecha-aprobacion`, { fecha: f }),
    editarMetadata:   (id, d)  => put(`/cotizaciones/${id}/metadata`, d),
    proyectosActivos: (filtros = {}) => {
      const p = new URLSearchParams();
      if (filtros.moneda)      p.append('moneda', filtros.moneda);
      if (filtros.anio)        p.append('anio',   String(filtros.anio));
      if (filtros.search)      p.append('search', filtros.search);
      if (filtros.todos)       p.append('todos',  '1');
      if (filtros.solo_con_cc) p.append('solo_con_cc', '1');
      const q = p.toString();
      return get(`/cotizaciones/proyectos-activos${q ? '?' + q : ''}`);
    },
    anularCotizacion: (id)     => post(`/cotizaciones/${id}/anular`),
    deleteCotizacion: (id)     => del(`/cotizaciones/${id}`),
    resetTodo:        ()       => del('/cotizaciones/reset'),
    // Balance económico (cotizado/cobrado/comprometido/pagado/imputado/déficit).
    getBalance:       (id)     => get(`/cotizaciones/${id}/balance`),
    // Promover TRABAJO_EN_RIESGO → APROBADA (Finanzas).
    promoverFondeada: (id)     => post(`/cotizaciones/${id}/promover-fondeada`),
    // Cerrar proyecto: cualquier estado activo → TERMINADA (Finanzas).
    marcarTerminada:  (id)     => post(`/cotizaciones/${id}/marcar-terminada`),
    uploadFoto: async (file) => {
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      fd.append('foto', file);
      const r = await fetch(`${API_BASE_URL}/cotizaciones/upload-foto`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error HTTP ${r.status}`);
      }
      return r.json(); // { url, public_id }
    },
  },
  cobranzas: {
    getBandejas:   (marca)         => get(marca ? `/cobranzas/bandejas?marca=${marca}` : '/cobranzas/bandejas'),
    getDashboard:  ()              => get('/cobranzas/dashboard'),
    // Página Análisis Financiero (6 gráficos pre-agregados).
    getAnalitica:  ()              => get('/cobranzas/analitica'),
    getCuentas:    ()              => get('/cobranzas/cuentas'),
    getDetalle:    (id)            => get(`/cobranzas/${id}/detalle`),
    registrar:     (data)          => post('/cobranzas', data),
    editar:        (id, data)      => put(`/cobranzas/${id}`, data),
    eliminar:      (id)            => del(`/cobranzas/${id}`),
    actualizarTributario: (id, d)  => put(`/cobranzas/${id}/tributario`, d),
    createCuenta:  (data)          => post('/cobranzas/cuentas', data),
    updateCuenta:  (id, data)      => put(`/cobranzas/cuentas/${id}`, data),
    deleteCuenta:  (id)            => del(`/cobranzas/cuentas/${id}`),
    getGastosBancarios: ()         => get('/cobranzas/gastos-bancarios'),
    createGastoBancario: (data)    => post('/cobranzas/gastos-bancarios', data),
    deleteGastoBancario: (id)      => del(`/cobranzas/gastos-bancarios/${id}`),
    getPagosImpuestos:  ()         => get('/cobranzas/pagos-impuestos'),
    registrarPagoIGV:   (data)     => post('/cobranzas/pagos-impuestos', data),
    deletePagoImpuesto: (id)       => del(`/cobranzas/pagos-impuestos/${id}`),
    getMovimientos: (idCuenta, estado) => {
      const p = new URLSearchParams();
      if (idCuenta) p.append('id_cuenta', idCuenta);
      if (estado)   p.append('estado', estado);
      const q = p.toString();
      return get(`/cobranzas/movimientos${q ? '?' + q : ''}`);
    },
    createMovimiento:   (data)     => post('/cobranzas/movimientos', data),
    sugerirConciliacion:(id)       => get(`/cobranzas/movimientos/${id}/sugerencias`),
    conciliarMovimiento:(id, data) => post(`/cobranzas/movimientos/${id}/conciliar`, data),
    ignorarMovimiento:  (id)       => post(`/cobranzas/movimientos/${id}/ignorar`),
    deleteMovimiento:   (id)       => del(`/cobranzas/movimientos/${id}`),
    facturar:           (id, data) => post(`/cobranzas/${id}/facturar`, data),
    marcarCobrada:      (id)       => post(`/cobranzas/${id}/cobrar`),
    revertirFactura:    (id)       => post(`/cobranzas/${id}/revertir-factura`),
    getLibroBancos:  (idCuenta, periodo) => {
      const p = new URLSearchParams({ id_cuenta: idCuenta });
      if (periodo) p.append('periodo', periodo);
      return get(`/cobranzas/libro-bancos?${p}`);
    },
    importarEECC: (idCuenta, texto) => post('/cobranzas/libro-bancos/importar-eecc', { id_cuenta: idCuenta, texto }),
  },
  configuracionMarca: {
    getAll:        ()              => get('/configuracion-marca'),
    getByMarca:    (marca)         => get(`/configuracion-marca/${marca}`),
    update:        (marca, data)   => put(`/configuracion-marca/${marca}`, data),
    uploadLogo: async (marca, file) => {
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      fd.append('logo', file);
      const r = await fetch(`${API_BASE_URL}/configuracion-marca/${marca}/upload-logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error HTTP ${r.status}`);
      }
      return r.json(); // { url, public_id }
    },
  },
  alertas: {
    list:      ()        => get('/alertas'),
    historial: (limit=100) => get(`/alertas/historial?limit=${limit}`),
    dashboard: ()        => get('/alertas/dashboard'),
  },
  administracion: {
    getGastoPersonal: (anio, mes) => {
      const params = new URLSearchParams({ anio });
      if (mes) params.append('mes', mes);
      return get(`/admin/gasto-personal?${params}`);
    },
    getDashboard: (anio) => {
      const qs = anio ? `?anio=${anio}` : '';
      return get(`/admin/dashboard${qs}`);
    },
    getPersonal: (anio, mes) => {
      const params = new URLSearchParams({ anio });
      if (mes) params.append('mes', mes);
      return get(`/admin/personal?${params}`);
    },
    listPersonas:       ()     => get('/admin/personas'),
    createPersona:      (data) => post('/admin/personas', data),
    crearOCHonorario:   (data) => post('/admin/oc-honorario', data),
    cotizacionesFondeadas: ()  => get('/admin/cotizaciones-fondeadas'),
  },
  produccion: {
    listarOTs: (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/produccion/ots${p.toString() ? '?' + p : ''}`);
    },
    obtenerOT: (id) => get(`/produccion/ots/${id}`),
    resetDb:          ()       => post('/admin/reset-db'),
    getCuentasSaldo:  ()       => get('/admin/cuentas-saldo'),
    setSaldoInicial:  (data)   => post('/admin/saldo-inicial', data),
  },
  usuarios: {
    getUsuarios:          () => fetchAPI('/api/usuarios'),
    createUsuario:  (data)    => fetchAPI('/api/usuarios', { method: 'POST', body: JSON.stringify(data) }),
    asignarModulos: (id, m)   => fetchAPI(`/api/usuarios/${id}/modulos`, { method: 'PUT', body: JSON.stringify({ modulos: m }) }),
    toggleActivo:   (id)      => fetchAPI(`/api/usuarios/${id}/toggle`, { method: 'PUT' }),
    updateUsuario:  (id, data) => fetchAPI(`/api/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    resetPassword:  (id, password) => fetchAPI(`/api/usuarios/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
    eliminarFirma:  (id)      => fetchAPI(`/api/usuarios/${id}/firma`, { method: 'DELETE' }),
    subirFirma: async (id, file) => {
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      fd.append('archivo', file);
      const r = await fetch(`${API_BASE_URL}/usuarios/${id}/firma`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error subiendo firma: HTTP ${r.status}`);
      }
      return r.json();
    },
  },
  // Perfil del usuario actual (firma escaneada — mig 067)
  auth: {
    me:                   () => fetchAPI('/api/auth/me'),
    getMiFirma:           () => fetchAPI('/api/auth/me/firma'),
    eliminarMiFirma:      () => fetchAPI('/api/auth/me/firma', { method: 'DELETE' }),
    subirMiFirma: async (file) => {
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      fd.append('archivo', file);
      const r = await fetch(`${API_BASE_URL}/auth/me/firma`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error subiendo firma: HTTP ${r.status}`);
      }
      return r.json();
    },
  },

  // Fase A — Capas transversales
  config: {
    get:                ()          => get('/config'),
    update:             (patch)     => put('/config', patch),
    librosObligatorios: ()          => get('/config/libros-obligatorios'),
    setup:              (data)      => post('/config/setup', data),
    existe:             ()          => get('/config/existe'),
  },
  auditoria: {
    list: (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/auditoria${p.toString() ? '?' + p : ''}`);
    },
  },
  periodos: {
    list:    (anio)                    => get(`/periodos${anio ? '?anio=' + anio : ''}`),
    cerrar:  (anio, mes, observaciones) => post('/periodos/cerrar',  { anio, mes, observaciones }),
    reabrir: (anio, mes)               => post('/periodos/reabrir', { anio, mes }),
  },
  adjuntos: {
    list:    (refTipo, refId) => get(`/adjuntos/${refTipo}/${refId}`),
    delete:  (id)             => del(`/adjuntos/${id}`),
    upload: async (refTipo, refId, file) => {
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${API_BASE_URL}/adjuntos/${refTipo}/${refId}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error HTTP ${r.status}`);
      }
      return r.json();
    },
  },
  facturacion: {
    diagnostico: () => get('/facturacion/diagnostico'),
  },
  facturas: {
    emitirDesdeCotizacion: (idCot, data = {}) =>
      post(`/facturas/emitir-desde-cotizacion/${idCot}`, data),
    previewCotizacion: (idCot) => get(`/facturas/preview-cotizacion/${idCot}`),
    crearYEmitir:      (data)  => post('/facturas', data),
    list: (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/facturas${p.toString() ? '?' + p : ''}`);
    },
    get:              (id)    => get(`/facturas/${id}`),
    consultarEstado:  (id)    => post(`/facturas/${id}/consultar-estado`),
    pdfUrl:           (id)    => `/api/facturas/${id}/pdf`,
  },
  notasCredito: {
    list: (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/notas-credito${p.toString() ? '?' + p : ''}`);
    },
    get:              (id)    => get(`/notas-credito/${id}`),
    registrarEntrante:(data)  => post('/notas-credito/recibida', data),
    eliminar:         (id)    => del(`/notas-credito/${id}`),
  },
  rendiciones: {
    list: (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/rendiciones${p.toString() ? '?' + p : ''}`);
    },
    get:              (id)    => get(`/rendiciones/${id}`),
    getPorOC:         (id_oc) => get(`/rendiciones/oc/${id_oc}`),
    ocsPendientes:    ()      => get('/rendiciones/oc-pendientes'),
    crearDesdeOC:     (data)  => post('/rendiciones', data),
    editarMetadata:   (id, d) => put(`/rendiciones/${id}/metadata`, d),
    agregarItem:      (id, item) => post(`/rendiciones/${id}/items`, item),
    editarItem:       (id, idItem, item) => put(`/rendiciones/${id}/items/${idItem}`, item),
    eliminarItem:     (id, idItem) => del(`/rendiciones/${id}/items/${idItem}`),
    firmar:           (id, tipo) => post(`/rendiciones/${id}/firmar`, { tipo }),
    desfirmar:        (id, tipo) => post(`/rendiciones/${id}/desfirmar`, { tipo }),
    eliminar:         (id)    => del(`/rendiciones/${id}`),
    pdfUrl:           (id)    => `/api/rendiciones/${id}/pdf`,
    eliminarAdjunto:  (id, idAdj) => del(`/rendiciones/${id}/adjuntos/${idAdj}`),
    subirAdjunto: async (id, file, tipo = 'OTRO') => {
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo', tipo);
      const r = await fetch(`${API_BASE_URL}/rendiciones/${id}/adjuntos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error HTTP ${r.status}`);
      }
      return r.json();
    },
  },
  centrosCosto: {
    list:    (soloActivos = false) => get(`/centros-costo${soloActivos ? '?activos=1' : ''}`),
    resumen: (anio)    => get(`/centros-costo/resumen${anio ? '?anio=' + anio : ''}`),
    create:  (data)    => post('/centros-costo', data),
    update:  (id, d)   => put(`/centros-costo/${id}`, d),
    remove:  (id)      => del(`/centros-costo/${id}`),
    // Vincular a Cotización + Rename con propagación (mig 069)
    cotizacionesDisponibles: () => get('/centros-costo/cotizaciones-disponibles'),
    impactoRename:           (id, nombre) => get(`/centros-costo/${id}/impacto-rename?nombre=${encodeURIComponent(nombre)}`),
    renombrar:               (id, nombre) => put(`/centros-costo/${id}/renombrar`, { nombre }),
    huerfanos:               () => get('/centros-costo/huerfanos'),
    regularizarHuerfano:     (data) => post('/centros-costo/regularizar-huerfano', data),
  },
  ordenesCompra: {
    list:       (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/ordenes-compra${p.toString() ? '?' + p : ''}`);
    },
    get:        (id)         => get(`/ordenes-compra/${id}`),
    create:     (data)       => post('/ordenes-compra', data),
    actualizar: (id, data)   => put(`/ordenes-compra/${id}`, data),
    eliminar:   (id)         => del(`/ordenes-compra/${id}`),
    mandarABorrador: (id)    => post(`/ordenes-compra/${id}/mandar-a-borrador`, {}),
    aprobar:    (id, data)   => post(`/ordenes-compra/${id}/aprobar`, data || {}),
    aprobarParaPago: (id)    => post(`/ordenes-compra/${id}/aprobar-para-pago`, {}),
    listoParaFacturar: (id)  => post(`/ordenes-compra/${id}/listo-para-facturar`, {}),
    recibir:    (id, lineas) => post(`/ordenes-compra/${id}/recibir`, { lineas }),
    // Importaciones (landed cost) — mig 068
    marcarEnTransito:    (id) => post(`/ordenes-compra/${id}/en-transito`, {}),
    desmarcarTransito:   (id) => post(`/ordenes-compra/${id}/desmarcar-transito`, {}),
    vincularMadre:       (id, id_oc_madre) => post(`/ordenes-compra/${id}/vincular-madre`, { id_oc_madre }),
    desvincularMadre:    (id) => post(`/ordenes-compra/${id}/desvincular-madre`, {}),
    importacionResumen:  (id) => get(`/ordenes-compra/${id}/importacion-resumen`),
    cerrarImportacion:   (id, lineas) => post(`/ordenes-compra/${id}/cerrar-importacion`, { lineas }),
    asignarItems: (id, asignaciones) => post(`/ordenes-compra/${id}/asignar-items`, { asignaciones }),
    editarFecha: (id, fecha) => put(`/ordenes-compra/${id}/fecha`, { fecha }),
    editarMetadata: (id, data) => put(`/ordenes-compra/${id}/metadata`, data),
    facturar:   (id, data)   => post(`/ordenes-compra/${id}/facturar`, data),
    registrarPago:       (id, data) => post(`/ordenes-compra/${id}/registrar-pago`, data),
    cerrarSinFactura:    (id, data) => post(`/ordenes-compra/${id}/cerrar-sin-factura`, data),
    asociarFacturaTardia:(id, data) => post(`/ordenes-compra/${id}/asociar-factura-tardia`, data),
    anular:     (id, motivo) => post(`/ordenes-compra/${id}/anular`, { motivo }),
    reactivar:  (id)         => post(`/ordenes-compra/${id}/reactivar`, {}),
    descargarPDF: async (id) => {
      const token = localStorage.getItem('erp_token');
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error('Error generando PDF: HTTP ' + r.status);
      const blob = await r.blob();
      const nombre = r.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || `OC-${id}.pdf`;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return { nombre };
    },
    /**
     * Vista previa del ROC en JSON (mismos datos que el Excel).
     * params: { centro_costo, anio, semana?, empresa? }
     */
    previewROC: (params) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.append(k, v); });
      return get(`/ordenes-compra/roc/preview?${qs.toString()}`);
    },
    /**
     * Descarga el Reporte Semanal de Órdenes (ROC) en Excel.
     * params: { centro_costo, anio, semana?, empresa? }
     */
    descargarROC: async (params) => {
      const token = localStorage.getItem('erp_token');
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.append(k, v); });
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/roc?${qs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error('Error generando ROC: HTTP ' + r.status);
      const blob = await r.blob();
      const nombre = r.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
        || `ROC-${params.anio}-${params.centro_costo}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return { nombre };
    },
    // Rediseño 2026-05-06: kanban OC simplificado
    marcarCredito: (id, body) => post(`/ordenes-compra/${id}/marcar-credito`, body || {}),
    // Notas en OC
    listarNotas:   (id)        => get(`/ordenes-compra/${id}/notas`),
    agregarNota:   (id, texto) => post(`/ordenes-compra/${id}/notas`, { texto }),
    borrarNota:    (id, idNota) => del(`/ordenes-compra/${id}/notas/${idNota}`),
    // Historial de transiciones
    historial:     (id)        => get(`/ordenes-compra/${id}/historial`),

    // Multifirma (mig 065)
    firmar:        (id, casillero, comentario) =>
      post(`/ordenes-compra/${id}/firmar`, { casillero, comentario }),
    desfirmar:     (id, casillero) =>
      post(`/ordenes-compra/${id}/desfirmar`, { casillero }),
    // Reglas de firmas (CRUD — listar libre, crear/editar/eliminar solo GERENTE)
    listarFirmasReglas: ()      => get(`/ordenes-compra/firmas-reglas`),
    crearFirmaRegla:    (body)  => post(`/ordenes-compra/firmas-reglas`, body),
    editarFirmaRegla:   (id_regla, body) => put(`/ordenes-compra/firmas-reglas/${id_regla}`, body),
    eliminarFirmaRegla: (id_regla) => del(`/ordenes-compra/firmas-reglas/${id_regla}`),
    // Factura del proveedor (multi-factura, mig 064)
    subirFactura:  async (id, formData) => {
      const token = localStorage.getItem('erp_token');
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/${id}/factura`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error subiendo factura: HTTP ${r.status}`);
      }
      return r.json();
    },
    listarFacturas:  (id) => get(`/ordenes-compra/${id}/facturas`),
    // Compat — devuelve la primera. Nuevos consumidores usar listarFacturas.
    getFactura:      (id) => get(`/ordenes-compra/${id}/factura`),
    // Borra una factura individual por su id_factura_oc.
    eliminarFactura: (id_factura_oc) => del(`/ordenes-compra/factura/${id_factura_oc}`),

    // Pagos individuales (multi-pago, mig 064)
    listarPagos:     (id) => get(`/ordenes-compra/${id}/pagos`),
    subirVoucherPago: async (id_pago, formData) => {
      const token = localStorage.getItem('erp_token');
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/pago/${id_pago}/voucher`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error subiendo voucher: HTTP ${r.status}`);
      }
      return r.json();
    },
    eliminarVoucherPago: (id_pago) => del(`/ordenes-compra/pago/${id_pago}/voucher`),
    /**
     * Variante multipart de registrarPago — incluye un archivo de voucher
     * (constancia bancaria) opcional. Si no hay archivo, manda JSON normal.
     */
    registrarPagoConVoucher: async (id, body, archivo) => {
      const token = localStorage.getItem('erp_token');
      const fd = new FormData();
      Object.entries(body || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });
      if (archivo) fd.append('voucher', archivo);
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/${id}/registrar-pago`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Error registrando pago: HTTP ${r.status}`);
      }
      return r.json();
    },
    // Export Excel del listado completo
    descargarExcel: async () => {
      const token = localStorage.getItem('erp_token');
      const r = await fetch(`${API_BASE_URL}/ordenes-compra/listado/excel`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error('Error descargando Excel: HTTP ' + r.status);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OCs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
  },
  ple: {
    ventasPreview:  (anio, mes) => get(`/ple/ventas/preview?anio=${anio}&mes=${mes}`),
    comprasPreview: (anio, mes) => get(`/ple/compras/preview?anio=${anio}&mes=${mes}`),
    // URL absolutas para descarga (el navegador ya manda el bearer vía el sistema de ui.js).
    // En realidad usamos fetch + blob para descargar con Authorization header.
    descargarVentas: async (anio, mes) => {
      const token = localStorage.getItem('erp_token');
      const r = await fetch(`${API_BASE_URL}/ple/ventas?anio=${anio}&mes=${mes}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const blob = await r.blob();
      const nombre = r.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'ventas.txt';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      URL.revokeObjectURL(url);
      return { nombre, lineas: Number(r.headers.get('x-ple-lineas')) || 0 };
    },
    descargarCompras: async (anio, mes) => {
      const token = localStorage.getItem('erp_token');
      const r = await fetch(`${API_BASE_URL}/ple/compras?anio=${anio}&mes=${mes}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const blob = await r.blob();
      const nombre = r.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'compras.txt';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      URL.revokeObjectURL(url);
      return { nombre, lineas: Number(r.headers.get('x-ple-lineas')) || 0 };
    },
  },
};

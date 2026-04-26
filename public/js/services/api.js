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
  },
  tipoCambio: {
    getHoy:       (m = 'USD')           => get(`/tipo-cambio/hoy?moneda=${m}`),
    getHistorial: (m = 'USD', l = 30)   => get(`/tipo-cambio?moneda=${m}&limit=${l}`),
    sincronizar:  (m = 'USD')           => post('/tipo-cambio/sincronizar', { moneda: m }),
    setManual: (fecha, moneda, vc, vv)  => post('/tipo-cambio/manual', { fecha, moneda, valor_compra: vc, valor_venta: vv }),
  },
  inventory: {
    getInventario:        () => get('/inventario'),
    getKardex:       (id)    => get(`/inventario/${id}/kardex`),
    createInventarioItem: (data) => post('/inventario', data),
    consumirInventario:   (data) => post('/inventario/consumo', data),
    deleteInventarioItem: (id)   => del(`/inventario/${id}`),
  },
  cotizaciones: {
    getDashboard:     ()          => get('/cotizaciones/dashboard'),
    getAnuladas:      ()          => get('/cotizaciones/anuladas'),
    getCotizaciones: (marca) => get(marca ? `/cotizaciones?marca=${marca}` : '/cotizaciones'),
    getCotizacion:    (id)     => get(`/cotizaciones/${id}`),
    createCotizacion: (data)   => post('/cotizaciones', data),
    updateCotizacion: (id, d)  => put(`/cotizaciones/${id}`, d),
    updateEstado:     (id, e)  => put(`/cotizaciones/${id}/estado`, { estado: e }),
    anularCotizacion: (id)     => post(`/cotizaciones/${id}/anular`),
    resetTodo:        ()       => del('/cotizaciones/reset'),
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
    getCuentas:    ()              => get('/cobranzas/cuentas'),
    getDetalle:    (id)            => get(`/cobranzas/${id}/detalle`),
    registrar:     (data)          => post('/cobranzas', data),
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
  },
  administracion: {
    getGastoPersonal: (anio, mes) => {
      const params = new URLSearchParams({ anio });
      if (mes) params.append('mes', mes);
      return get(`/admin/gasto-personal?${params}`);
    },
  },
  usuarios: {
    getUsuarios:          () => fetchAPI('/api/usuarios'),
    createUsuario:  (data)    => fetchAPI('/api/usuarios', { method: 'POST', body: JSON.stringify(data) }),
    asignarModulos: (id, m)   => fetchAPI(`/api/usuarios/${id}/modulos`, { method: 'PUT', body: JSON.stringify({ modulos: m }) }),
    toggleActivo:   (id)      => fetchAPI(`/api/usuarios/${id}/toggle`, { method: 'PUT' }),
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
    list: (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/facturas${p.toString() ? '?' + p : ''}`);
    },
    get:              (id)    => get(`/facturas/${id}`),
    consultarEstado:  (id)    => post(`/facturas/${id}/consultar-estado`),
  },
  ordenesCompra: {
    list:       (filtros = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') p.append(k, v); });
      return get(`/ordenes-compra${p.toString() ? '?' + p : ''}`);
    },
    get:        (id)         => get(`/ordenes-compra/${id}`),
    create:     (data)       => post('/ordenes-compra', data),
    aprobar:    (id, data)   => post(`/ordenes-compra/${id}/aprobar`, data || {}),
    enviar:     (id)         => post(`/ordenes-compra/${id}/enviar`, {}),
    recibir:    (id, lineas) => post(`/ordenes-compra/${id}/recibir`, { lineas }),
    facturar:   (id, data)   => post(`/ordenes-compra/${id}/facturar`, data),
    anular:     (id, motivo) => post(`/ordenes-compra/${id}/anular`, { motivo }),
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

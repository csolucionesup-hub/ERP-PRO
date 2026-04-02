/**
 * API Front-End Service
 * Conector real contra el Backend Node.js de la Empresa
 */

const API_BASE_URL = '/api';

// Helper global para atrapar errores HTTP limpios
async function fetchReal(endpoint) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!response.ok) {
      if (response.status === 404) throw new Error(`Ruta no configurada: ${endpoint}`);
      if (response.status >= 500) {
         const errData = await response.json().catch(() => null);
         throw new Error(errData?.error || 'Falló el servidor BD');
      }
      throw new Error(`Error HTTP: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`[API FETCH ERROR] -> ${endpoint}:`, error);
    throw error;
  }
}

export const api = {
  finances: {
    async getResumenOperativo() {
      return await fetchReal('/finanzas/operativo');
    },
    async getDashboard() {
      return await fetchReal('/finanzas/dashboard');
    },
    async getCxC() {
      return await fetchReal('/finanzas/cxc');
    },
    async getCxP() {
      return await fetchReal('/finanzas/cxp');
    },
    async getGastos() {
       return await fetchReal('/gastos');
    },
    async createGasto(data) {
       const res = await fetch('/api/gastos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async pagarGasto(idGasto, abono) {
       const res = await fetch(`/api/gastos/${idGasto}/pago`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abono })
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async anularGasto(idGasto) {
       const res = await fetch(`/api/gastos/${idGasto}/anular`, { method: 'POST' });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async getTransacciones() {
      return await fetchReal('/finanzas');
    }
  },
  services: {
    async getServicios() {
      return await fetchReal('/servicios');
    },
    async getServiciosActivos() {
      return await fetchReal('/servicios/activos');
    },
    async createServicio(data) {
       const res = await fetch('/api/servicios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async cobrarServicio(idServicio, monto_pagado_liquido) {
       const res = await fetch(`/api/servicios/${idServicio}/pago`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monto_pagado_liquido, descripcion: 'Abono Registrado por Operador' })
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async anularServicio(idServicio) {
       const res = await fetch(`/api/servicios/${idServicio}/anular`, { method: 'POST' });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async updateServicio(id, data) {
       const res = await fetch(`/api/servicios/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async deleteServicio(id) {
       const res = await fetch(`/api/servicios/${id}`, { method: 'DELETE' });
       if (!res.ok) throw await res.json();
       return await res.json();
    }
  },
  purchases: {
    async getCompras() {
      return await fetchReal('/compras');
    },
    async getProveedores() {
      return await fetchReal('/proveedores');
    },
    async createProveedor(data) {
       const res = await fetch('/api/proveedores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async updateProveedor(id, data) {
       const res = await fetch(`/api/proveedores/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async deleteProveedor(id) {
       const res = await fetch(`/api/proveedores/${id}`, { method: 'DELETE' });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async getCompraDetalle(id) {
      return await fetchReal(`/compras/${id}`);
    },
    async updateCompra(id, data) {
       const res = await fetch(`/api/compras/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async createCompra(data) {
       const res = await fetch('/api/compras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async anularCompra(idCompra) {
       const res = await fetch(`/api/compras/${idCompra}/anular`, { method: 'POST' });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async deleteCompra(idCompra) {
       const res = await fetch(`/api/compras/${idCompra}`, { method: 'DELETE' });
       if (!res.ok) throw await res.json();
       return await res.json();
    }
  },
  tributario: {
    getCuentaBN: () => fetchReal('/tributario/cuenta-bn'),
    getControlIGV: () => fetchReal('/tributario/igv'),
    async marcarDeposito(id, data) {
      const res = await fetch(`/api/tributario/detraccion/${id}/deposito`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw await res.json();
      return await res.json();
    },
    async pagarImpuesto(data) {
      const res = await fetch('/api/tributario/pago-impuesto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw await res.json();
      return await res.json();
    }
  },
  prestamos: {
    getTomados: () => fetchReal('/prestamos/tomados'),
    getOtorgados: () => fetchReal('/prestamos/otorgados'),
    getTotales: () => fetchReal('/prestamos/totales'),
    createTomado: async (data) => {
      const res = await fetch('/api/prestamos/tomados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    createOtorgado: async (data) => {
      const res = await fetch('/api/prestamos/otorgados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    pagarTomado: async (id, monto) => {
      const res = await fetch('/api/prestamos/tomados/' + id + '/pago', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto }) });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    cobrarOtorgado: async (id, monto) => {
      const res = await fetch('/api/prestamos/otorgados/' + id + '/cobro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto }) });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    updateTomado: async (id, data) => {
      const res = await fetch('/api/prestamos/tomados/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    updateOtorgado: async (id, data) => {
      const res = await fetch('/api/prestamos/otorgados/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    deleteTomado: async (id) => {
      const res = await fetch('/api/prestamos/tomados/' + id, { method: 'DELETE' });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    deleteOtorgado: async (id) => {
      const res = await fetch('/api/prestamos/otorgados/' + id, { method: 'DELETE' });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    anularTomado: async (id) => {
      const res = await fetch('/api/prestamos/tomados/' + id + '/anular', { method: 'POST' });
      if (!res.ok) throw await res.json(); return await res.json();
    },
    anularOtorgado: async (id) => {
      const res = await fetch('/api/prestamos/otorgados/' + id + '/anular', { method: 'POST' });
      if (!res.ok) throw await res.json(); return await res.json();
    }
  },
  tipoCambio: {
    getHoy: (moneda = 'USD') => fetchReal(`/tipo-cambio/hoy?moneda=${moneda}`),
    getHistorial: (moneda = 'USD', limit = 30) => fetchReal(`/tipo-cambio?moneda=${moneda}&limit=${limit}`),
    async sincronizar(moneda = 'USD') {
      const res = await fetch('/api/tipo-cambio/sincronizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moneda })
      });
      if (!res.ok) throw await res.json();
      return await res.json();
    },
    async setManual(fecha, moneda, valor_compra, valor_venta) {
      const res = await fetch('/api/tipo-cambio/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, moneda, valor_compra, valor_venta })
      });
      if (!res.ok) throw await res.json();
      return await res.json();
    }
  },
  inventory: {
    async getInventario() {
      return await fetchReal('/inventario');
    },
    async getKardex(idItem) {
      return await fetchReal(`/inventario/${idItem}/kardex`);
    },
    async createInventarioItem(data) {
       const res = await fetch('/api/inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async consumirInventario(data) {
       const res = await fetch('/api/inventario/consumo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
       });
       if (!res.ok) throw await res.json();
       return await res.json();
    },
    async deleteInventarioItem(idItem) {
       const res = await fetch(`/api/inventario/${idItem}`, { method: 'DELETE' });
       if (!res.ok) throw await res.json();
       return await res.json();
    }
  }
};

import { db } from '../../../database/connection';

/**
 * AlertasService — agrega notificaciones/alertas activas del ERP.
 * Cada alerta tiene: tipo, severidad (info/warn/danger), titulo, detalle, link.
 * El usuario las ve en el panel campana del header.
 */

export interface Alerta {
  id: string;          // hash único para que cliente no duplique
  tipo: 'STOCK' | 'OC_VENCIDA' | 'COBRANZA_VENCIDA' | 'CUENTA_PAGAR_VENCIDA' | 'COTIZACION_PENDIENTE' | 'DETRACCION_PENDIENTE';
  severidad: 'info' | 'warn' | 'danger';
  titulo: string;
  detalle: string;
  link?: string;
  fecha?: string;
}

class AlertasService {

  async listar(modulosUsuario: string[] = []): Promise<Alerta[]> {
    const alertas: Alerta[] = [];
    const tieneAlmacen   = modulosUsuario.includes('ALMACEN');
    const tieneFinanzas  = modulosUsuario.includes('FINANZAS');
    const tieneComercial = modulosUsuario.includes('COMERCIAL');
    const tieneLogistica = modulosUsuario.includes('LOGISTICA');

    // ── 1. Items con stock bajo o agotado
    if (tieneAlmacen) {
      const [bajo]: any = await db.query(`
        SELECT id_item, sku, nombre, stock_actual, stock_minimo
        FROM Inventario
        WHERE stock_actual <= stock_minimo
        ORDER BY (stock_actual - stock_minimo) ASC
        LIMIT 5
      `);
      for (const r of (bajo as any[])) {
        const sinStock = Number(r.stock_actual) === 0;
        alertas.push({
          id: `stock-${r.id_item}`,
          tipo: 'STOCK',
          severidad: sinStock ? 'danger' : 'warn',
          titulo: sinStock ? `🚫 ${r.nombre} sin stock` : `⚠️ Stock bajo: ${r.nombre}`,
          detalle: `${r.sku} · ${r.stock_actual} / mín ${r.stock_minimo}`,
          link: '#inventario',
        });
      }
    }

    // ── 2. Cotizaciones pendientes de aprobar (>5 días en EN_PROCESO o ENVIADA)
    if (tieneComercial) {
      const [cotizPend]: any = await db.query(`
        SELECT id_cotizacion, nro_cotizacion, cliente, estado, fecha
        FROM Cotizaciones
        WHERE estado IN ('EN_PROCESO','ENVIADA','A_ESPERA_RESPUESTA')
          AND fecha < (CURRENT_DATE - INTERVAL '5 days')
        ORDER BY fecha ASC
        LIMIT 5
      `);
      for (const r of (cotizPend as any[])) {
        alertas.push({
          id: `cot-${r.id_cotizacion}`,
          tipo: 'COTIZACION_PENDIENTE',
          severidad: 'warn',
          titulo: `📋 Cotización sin definir: ${r.nro_cotizacion}`,
          detalle: `${r.cliente} · ${r.estado} desde ${String(r.fecha).slice(0, 10)}`,
          link: '#comercial',
          fecha: String(r.fecha).slice(0, 10),
        });
      }
    }

    // ── 3. Cobranzas vencidas (servicios PENDIENTE/PARCIAL con fecha_vencimiento pasada)
    if (tieneFinanzas) {
      const [cobVenc]: any = await db.query(`
        SELECT s.id_servicio, s.codigo, s.cliente, s.fecha_vencimiento, s.total_base
        FROM Servicios s
        WHERE s.estado IN ('PENDIENTE','PARCIAL')
          AND s.fecha_vencimiento IS NOT NULL
          AND s.fecha_vencimiento < CURRENT_DATE
        ORDER BY s.fecha_vencimiento ASC
        LIMIT 5
      `);
      for (const r of (cobVenc as any[])) {
        const dias = Math.floor((Date.now() - new Date(r.fecha_vencimiento).getTime()) / 86400000);
        alertas.push({
          id: `cobv-${r.id_servicio}`,
          tipo: 'COBRANZA_VENCIDA',
          severidad: dias > 30 ? 'danger' : 'warn',
          titulo: `💰 Cobranza vencida: ${r.codigo}`,
          detalle: `${r.cliente} · ${dias} día(s) de mora`,
          link: '#finanzas',
        });
      }
    }

    // ── 4. OCs sin facturar (ENVIADA/RECIBIDA hace >15 días)
    if (tieneLogistica) {
      const [ocPend]: any = await db.query(`
        SELECT id_oc, nro_oc, fecha_emision, estado, total
        FROM OrdenesCompra
        WHERE estado IN ('ENVIADA','RECIBIDA','RECIBIDA_PARCIAL')
          AND fecha_emision < (CURRENT_DATE - INTERVAL '15 days')
        ORDER BY fecha_emision ASC
        LIMIT 5
      `);
      for (const r of (ocPend as any[])) {
        alertas.push({
          id: `oc-${r.id_oc}`,
          tipo: 'OC_VENCIDA',
          severidad: 'info',
          titulo: `📋 OC sin facturar: ${r.nro_oc}`,
          detalle: `${r.estado} desde ${String(r.fecha_emision).slice(0, 10)}`,
          link: '#logistica/oc',
        });
      }
    }

    // ── 5. Detracciones pendientes de depósito >7 días
    if (tieneFinanzas) {
      try {
        const [detPend]: any = await db.query(`
          SELECT d.id_detraccion, d.cliente, d.monto, d.created_at
          FROM Detracciones d
          WHERE d.cliente_deposito IN ('NO','PARCIAL')
            AND d.estado = 'PENDIENTE'
            AND d.created_at < (CURRENT_DATE - INTERVAL '7 days')
          ORDER BY d.created_at ASC
          LIMIT 3
        `);
        for (const r of (detPend as any[])) {
          alertas.push({
            id: `det-${r.id_detraccion}`,
            tipo: 'DETRACCION_PENDIENTE',
            severidad: 'warn',
            titulo: `📦 Detracción pendiente: ${r.cliente}`,
            detalle: `S/ ${Number(r.monto).toFixed(2)}`,
            link: '#finanzas',
          });
        }
      } catch (_) { /* tabla puede no existir aún */ }
    }

    return alertas;
  }
}

export default new AlertasService();

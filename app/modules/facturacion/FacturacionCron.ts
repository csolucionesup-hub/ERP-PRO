/**
 * FacturacionCron — tarea periódica que refresca el estado SUNAT
 * de facturas que quedaron PENDIENTE o ERROR.
 *
 * Se ejecuta cada 15 min mientras la app esté corriendo.
 * Solo entra en acción si NubefactService está en modo REAL
 * (en modo STUB no hay SUNAT que consultar).
 */

import { db } from '../../../database/connection';
import NubefactService from './NubefactService';

const INTERVALO_MS = 15 * 60 * 1000; // 15 min

let intervalHandle: NodeJS.Timeout | null = null;
let ejecutando = false;

async function refrescarEstados() {
  if (ejecutando) return;
  ejecutando = true;
  try {
    const puedeReal = await NubefactService.puedeOperarReal();
    if (!puedeReal) return; // STUB no tiene nada que consultar

    // Solo facturas emitidas últimas 72h que están sin confirmar
    const [rows] = await db.query(
      `SELECT id_factura, tipo, serie, numero, estado_sunat
         FROM Facturas
        WHERE estado_sunat IN ('PENDIENTE','ERROR')
          AND fecha_emision >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
        LIMIT 50`
    );

    const pendientes = rows as any[];
    if (!pendientes.length) return;

    console.log(`[FacturacionCron] Refrescando ${pendientes.length} comprobante(s) pendiente(s)...`);

    for (const f of pendientes) {
      try {
        const nuevo = await NubefactService.consultarEstado(f.tipo, f.serie, f.numero);
        if (nuevo && nuevo !== f.estado_sunat) {
          await db.query(
            'UPDATE Facturas SET estado_sunat = ? WHERE id_factura = ?',
            [nuevo, f.id_factura]
          );
          console.log(`[FacturacionCron]   ${f.serie}-${f.numero}: ${f.estado_sunat} → ${nuevo}`);
        }
      } catch (e) {
        console.error(`[FacturacionCron]   error en ${f.serie}-${f.numero}:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error('[FacturacionCron] error general:', (e as Error).message);
  } finally {
    ejecutando = false;
  }
}

export const FacturacionCron = {
  start(): void {
    if (intervalHandle) return;
    intervalHandle = setInterval(refrescarEstados, INTERVALO_MS);
    // Primera corrida diferida 30s post-boot para no competir con inicio
    setTimeout(refrescarEstados, 30_000);
    console.log('[FacturacionCron] iniciado — refrescando estados SUNAT cada 15 min');
  },
  stop(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  },
};

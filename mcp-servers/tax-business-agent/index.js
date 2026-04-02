import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = new Server(
  { name: 'erp-tax-business-agent', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'knowledge://peru-tax-rules', name: 'Reglas Tributarias Perú (IGV, Detracciones, Retenciones)', mimeType: 'text/markdown' },
    { uri: 'knowledge://business-logic', name: 'Lógica de Negocio ERP-PRO', mimeType: 'text/markdown' },
    { uri: 'knowledge://erp-domain', name: 'Dominio ERP: Módulos y Flujos', mimeType: 'text/markdown' },
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const map = {
    'knowledge://peru-tax-rules': 'peru-tax-rules.md',
    'knowledge://business-logic': 'business-logic.md',
    'knowledge://erp-domain': 'erp-domain.md',
  };
  const file = map[req.params.uri];
  if (!file) throw new Error(`Recurso no encontrado: ${req.params.uri}`);
  const content = readFileSync(join(__dirname, 'knowledge', file), 'utf-8');
  return { contents: [{ uri: req.params.uri, mimeType: 'text/markdown', text: content }] };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'calculate_igv',
      description: 'Calcula IGV peruano (18%) desde un monto base o total',
      inputSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Monto a calcular' },
          direction: { type: 'string', enum: ['from_base', 'from_total'], description: 'from_base: calcula IGV sobre el base. from_total: extrae IGV del total' }
        },
        required: ['amount', 'direction']
      }
    },
    {
      name: 'calculate_detraccion',
      description: 'Calcula la detracción SUNAT según el tipo de servicio peruano',
      inputSchema: {
        type: 'object',
        properties: {
          service_type: {
            type: 'string',
            enum: ['construccion', 'intermediacion_laboral', 'arrendamiento_bienes', 'mantenimiento_reparacion', 'movimiento_carga', 'otros_servicios', 'servicios_empresariales'],
            description: 'Tipo de servicio para determinar el porcentaje'
          },
          total_amount: { type: 'number', description: 'Importe total de la operación (con IGV)' }
        },
        required: ['service_type', 'total_amount']
      }
    },
    {
      name: 'validate_ruc',
      description: 'Valida el formato de RUC peruano (11 dígitos) y determina tipo (persona natural/jurídica)',
      inputSchema: {
        type: 'object',
        properties: {
          ruc: { type: 'string', description: 'Número de RUC a validar' }
        },
        required: ['ruc']
      }
    },
    {
      name: 'get_tax_rule',
      description: 'Consulta reglas tributarias peruanas vigentes relevantes al ERP',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['igv', 'detraccion', 'retencion', 'renta_4ta', 'renta_5ta', 'tipo_cambio_sunat', 'comprobantes', 'plazos_pago'],
            description: 'Tema tributario a consultar'
          }
        },
        required: ['topic']
      }
    },
    {
      name: 'analyze_service_flow',
      description: 'Analiza el flujo completo de un servicio: cobros, detracciones, retenciones, impacto en cuentas',
      inputSchema: {
        type: 'object',
        properties: {
          monto_base: { type: 'number' },
          aplica_igv: { type: 'boolean', default: false },
          detraccion_pct: { type: 'number', default: 0 },
          retencion_pct: { type: 'number', default: 0 },
          moneda: { type: 'string', enum: ['PEN', 'USD'], default: 'PEN' }
        },
        required: ['monto_base']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const round2 = n => Math.round(n * 100) / 100;

  if (name === 'calculate_igv') {
    const { amount, direction } = args;
    const IGV_RATE = 0.18;
    if (direction === 'from_base') {
      const igv = round2(amount * IGV_RATE);
      return { content: [{ type: 'text', text: `Base: S/ ${amount}\nIGV (18%): S/ ${igv}\nTotal: S/ ${round2(amount + igv)}` }] };
    } else {
      const base = round2(amount / 1.18);
      const igv = round2(amount - base);
      return { content: [{ type: 'text', text: `Total: S/ ${amount}\nBase (sin IGV): S/ ${base}\nIGV (18%): S/ ${igv}` }] };
    }
  }

  if (name === 'calculate_detraccion') {
    const rates = {
      construccion: 0.04,
      intermediacion_laboral: 0.10,
      arrendamiento_bienes: 0.10,
      mantenimiento_reparacion: 0.04,
      movimiento_carga: 0.04,
      otros_servicios: 0.12,
      servicios_empresariales: 0.12
    };
    const { service_type, total_amount } = args;
    const rate = rates[service_type] || 0.12;
    const monto = round2(total_amount * rate);
    return {
      content: [{
        type: 'text',
        text: `Tipo: ${service_type}\nPorcentaje detracción: ${rate * 100}%\nMonto total operación: S/ ${total_amount}\nMonto detracción (depósito en BN): S/ ${monto}\nImporte neto a pagar por cliente: S/ ${round2(total_amount - monto)}\n\nNota: La detracción se deposita en la Cuenta de Detracciones del Banco de la Nación del proveedor.`
      }]
    };
  }

  if (name === 'validate_ruc') {
    const { ruc } = args;
    if (!/^\d{11}$/.test(ruc)) {
      return { content: [{ type: 'text', text: `RUC inválido: debe tener exactamente 11 dígitos numéricos. Recibido: "${ruc}"` }] };
    }
    const prefix = ruc.substring(0, 2);
    let type = '';
    if (prefix === '10') type = 'Persona Natural con Negocio';
    else if (prefix === '20') type = 'Persona Jurídica (Empresa)';
    else if (prefix === '15' || prefix === '16' || prefix === '17') type = 'Persona Natural sin RUC de negocio';
    else type = `Prefijo ${prefix} — verificar en SUNAT`;

    // Verificación de dígito de control simplificada
    const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const sum = ruc.split('').slice(0, 10).reduce((acc, d, i) => acc + parseInt(d) * factors[i], 0);
    const remainder = 11 - (sum % 11);
    const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;
    const isValid = checkDigit === parseInt(ruc[10]);

    return {
      content: [{
        type: 'text',
        text: `RUC: ${ruc}\nFormato: ${isValid ? 'VÁLIDO' : 'FORMATO INVÁLIDO (dígito verificador incorrecto)'}\nTipo: ${type}\nDígito verificador esperado: ${checkDigit}, recibido: ${ruc[10]}`
      }]
    };
  }

  if (name === 'get_tax_rule') {
    const rules = {
      igv: `**IGV (Impuesto General a las Ventas) — Perú**
- Tasa vigente: **18%** (desde 2011)
- Base legal: TUO Ley del IGV, D.S. 055-99-EF
- Cálculo: IGV = Base Imponible × 0.18 / Total = Base × 1.18
- En ERP-PRO: campo \`aplica_igv BOOLEAN\` — no todos los servicios son gravados
- Crédito fiscal: IGV de compras puede descontarse del IGV de ventas
- Declaración: mensual, PDT 621`,

      detraccion: `**Sistema de Detracciones (SPOT) — SUNAT**
- Obligación: el cliente retiene un % y deposita en Cuenta BN del proveedor
- Umbral: operaciones > S/ 700 (servicios) o > S/ 400 (bienes)
- Porcentajes frecuentes en servicios:
  - Otros servicios (Anexo 3): 12%
  - Servicios empresariales: 12%
  - Construcción: 4%
  - Mantenimiento/Reparación: 4%
  - Arrendamiento bienes: 10%
- En ERP-PRO: tabla Detracciones, vinculada a Servicios. Saldo en Cuenta BN.
- Solo se puede usar el saldo BN para pagar impuestos SUNAT`,

      retencion: `**Régimen de Retenciones — SUNAT**
- Agentes de retención retienen el 3% del precio de venta (incluye IGV)
- Aplica a operaciones con agentes de retención designados por SUNAT
- El vendedor anota la retención sufrida y descuenta de su IGV mensual
- En ERP-PRO: campo \`retencion_porcentaje\` en Servicios`,

      renta_4ta: `**Renta de 4ta Categoría (Independientes)**
- Tasa: 8% de retención si pago > S/ 1,500 en el mes
- Suspensión: si proyección anual < S/ 37,625 (2024)
- Declaración mensual si ingresos > S/ 3,136`,

      tipo_cambio_sunat: `**Tipo de Cambio SUNAT**
- Para efectos tributarios: usar TC publicado por SBS/SUNAT del día de la operación
- En ERP-PRO: tabla TipoCambio, endpoint \`/api/tipo-cambio/latest\`
- Los montos en USD se convierten a PEN (monto_base) usando tipo_cambio
- En Compras y Servicios: campo \`tipo_cambio DECIMAL(10,4)\``,

      comprobantes: `**Comprobantes de Pago válidos — SUNAT**
- Factura: persona jurídica/natural con RUC, da crédito fiscal IGV
- Boleta: consumidor final, NO da crédito fiscal
- Nota de crédito/débito: ajustes sobre factura
- Recibo por honorarios: servicios profesionales (4ta categoría)
- En ERP-PRO: campo \`nro_comprobante\` en Compras y Gastos`,

      plazos_pago: `**Plazos relevantes para el ERP**
- IGV mensual: hasta el 20° día hábil del mes siguiente (PDT 621)
- Detracciones: hasta el 5° día hábil del mes siguiente al de la operación
- Renta mensual: hasta el 20° día hábil del mes siguiente
- Retenciones: mismo plazo que PDT 626`
    };

    return { content: [{ type: 'text', text: rules[args.topic] || 'Tema no disponible' }] };
  }

  if (name === 'analyze_service_flow') {
    const { monto_base, aplica_igv = false, detraccion_pct = 0, retencion_pct = 0, moneda = 'PEN' } = args;
    const round2 = n => Math.round(n * 100) / 100;

    const igv_base = aplica_igv ? round2(monto_base * 0.18) : 0;
    const total_bruto = round2(monto_base + igv_base);
    const monto_detraccion = round2(total_bruto * (detraccion_pct / 100));
    const monto_retencion = round2(total_bruto * (retencion_pct / 100));
    const cobro_liquido = round2(total_bruto - monto_detraccion - monto_retencion);

    const lines = [
      `=== ANÁLISIS DE FLUJO DE SERVICIO ===`,
      `Moneda: ${moneda}`,
      ``,
      `Monto base (sin IGV):     ${moneda === 'USD' ? '$' : 'S/'} ${monto_base}`,
      aplica_igv ? `IGV (18%):                S/ ${igv_base}` : `IGV: No aplica`,
      `Total bruto:              S/ ${total_bruto}`,
      ``,
      detraccion_pct > 0 ? `Detracción (${detraccion_pct}%):       S/ ${monto_detraccion} → depositar en Banco Nación` : `Detracción: No aplica`,
      retencion_pct > 0  ? `Retención (${retencion_pct}%):          S/ ${monto_retencion}  → retenida por cliente` : `Retención: No aplica`,
      ``,
      `COBRO LÍQUIDO EN CAJA:    S/ ${cobro_liquido}`,
      ``,
      `=== IMPACTO EN BASE DE DATOS ===`,
      `INSERT Servicios: monto_base=${monto_base}, igv_base=${igv_base}, total_base=${total_bruto},`,
      `  detraccion_porcentaje=${detraccion_pct}, monto_detraccion=${monto_detraccion},`,
      `  retencion_porcentaje=${retencion_pct}, monto_retencion=${monto_retencion}`,
      detraccion_pct > 0 ? `INSERT Detracciones: porcentaje=${detraccion_pct}, monto=${monto_detraccion}` : ``,
      `INSERT Transacciones (al cobrar): tipo=INGRESO, monto_base=${cobro_liquido}`
    ].filter(Boolean);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  throw new Error(`Herramienta no encontrada: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

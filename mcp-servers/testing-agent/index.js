import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = new Server(
  { name: 'erp-testing-agent', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'knowledge://testing-strategies', name: 'Estrategias de Testing ERP-PRO', mimeType: 'text/markdown' },
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  if (req.params.uri !== 'knowledge://testing-strategies') throw new Error('Recurso no encontrado');
  const content = readFileSync(join(__dirname, 'knowledge', 'testing-strategies.md'), 'utf-8');
  return { contents: [{ uri: req.params.uri, mimeType: 'text/markdown', text: content }] };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_api_test',
      description: 'Genera tests de integración para endpoints del ERP usando node:test + fetch nativo',
      inputSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'Endpoint a testear (ej: /api/servicios)' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
          module: { type: 'string', description: 'Nombre del módulo' },
          test_cases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                payload: { type: 'object' },
                expected_status: { type: 'number' }
              }
            }
          }
        },
        required: ['endpoint', 'method', 'module']
      }
    },
    {
      name: 'generate_service_test',
      description: 'Genera tests unitarios para una clase Service del ERP',
      inputSchema: {
        type: 'object',
        properties: {
          service_name: { type: 'string', description: 'Nombre del servicio (ej: FinanceService)' },
          methods: { type: 'array', items: { type: 'string' }, description: 'Métodos a testear' }
        },
        required: ['service_name', 'methods']
      }
    },
    {
      name: 'suggest_test_cases',
      description: 'Sugiere casos de prueba críticos para un módulo ERP dado',
      inputSchema: {
        type: 'object',
        properties: {
          module: {
            type: 'string',
            enum: ['servicios', 'compras', 'gastos', 'inventario', 'prestamos', 'tributario', 'dashboard'],
            description: 'Módulo del ERP'
          }
        },
        required: ['module']
      }
    },
    {
      name: 'generate_db_fixture',
      description: 'Genera INSERT SQL de datos de prueba para testing',
      inputSchema: {
        type: 'object',
        properties: {
          scenario: {
            type: 'string',
            enum: ['minimal', 'full_flow', 'edge_cases'],
            description: 'minimal: datos mínimos. full_flow: flujo completo. edge_cases: casos borde'
          }
        },
        required: ['scenario']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'generate_api_test') {
    const { endpoint, method, module, test_cases = [] } = args;
    const ModCap = module.charAt(0).toUpperCase() + module.slice(1);
    const BASE_URL = 'http://localhost:3000';

    const defaultCases = test_cases.length > 0 ? test_cases : [
      { description: `${method} ${endpoint} retorna 200`, payload: null, expected_status: 200 }
    ];

    const testBlocks = defaultCases.map(tc => {
      const bodyPart = tc.payload
        ? `, { method: '${method}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(tc.payload)}) }`
        : method !== 'GET' ? `, { method: '${method}' }` : '';
      return `  await t.test('${tc.description}', async () => {
    const res = await fetch(\`${BASE_URL}${endpoint}\`${bodyPart});
    assert.equal(res.status, ${tc.expected_status || 200});
    const data = await res.json();
    assert.ok(data, 'La respuesta debe tener contenido');
  });`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `import { describe, test as t } from 'node:test';
import assert from 'node:assert/strict';

// Tests de integración: ${ModCap}
// Requiere servidor corriendo en puerto 3000 con DB de prueba

describe('${ModCap} API — ${method} ${endpoint}', async () => {
${testBlocks}
});

// Ejecutar: node --test tests/${module}.test.js`
      }]
    };
  }

  if (name === 'generate_service_test') {
    const { service_name, methods } = args;
    const testBlocks = methods.map(m => `  await t.test('${service_name}.${m}() funciona correctamente', async () => {
    // Arrange
    const mockDb = { query: async () => [[{ id: 1, estado: 'PENDIENTE' }]] };
    // Act
    // const result = await service.${m}(testParams);
    // Assert
    // assert.equal(result.success, true);
    assert.ok(true, 'Implementar test para ${m}');
  });`).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `import { describe, test as t } from 'node:test';
import assert from 'node:assert/strict';

describe('${service_name}', async () => {
${testBlocks}
});`
      }]
    };
  }

  if (name === 'suggest_test_cases') {
    const cases = {
      servicios: [
        '✓ Crear servicio sin IGV → total_base === monto_base',
        '✓ Crear servicio con IGV → total_base === monto_base * 1.18',
        '✓ Crear servicio con detracción → INSERT en tabla Detracciones automático',
        '✓ Registrar pago parcial → estado cambia a PARCIAL, saldo se actualiza',
        '✓ Registrar pago completo → estado cambia a COBRADO',
        '✓ Registrar pago > saldo → debe retornar error',
        '✓ Servicio en USD → monto_base en PEN calculado con tipo_cambio',
        '✓ GET /api/servicios filtra por estado correctamente',
      ],
      compras: [
        '✓ Crear compra con IGV → igv_base = monto_base * 0.18',
        '✓ Crear compra sin IGV → igv_base = 0, aplica_igv = false',
        '✓ Compra sin detalles de items → error de validación',
        '✓ Compra con proveedor inexistente → FK error manejado',
        '✓ Pago parcial → estado_pago = PARCIAL',
        '✓ N° OC duplicado → verificar comportamiento (debe permitirse)',
        '✓ Compra en USD → conversión a PEN correcta en Transacciones',
      ],
      inventario: [
        '✓ Crear item → SKU autogenerado en formato correcto',
        '✓ Consumo de stock → stock_actual decrece + MovimientosInventario creado',
        '✓ Consumo > stock disponible → error o stock negativo según regla de negocio',
        '✓ Items bajo stock_minimo → aparecen en alerta stock crítico',
        '✓ SKU duplicado → error UNIQUE constraint',
        '✓ Movimiento vinculado a SERVICIO → referencia_tipo = SERVICIO',
      ],
      prestamos: [
        '✓ Crear préstamo tomado → saldo = monto_total inicial',
        '✓ Pago parcial tomado → saldo disminuye, estado = PARCIAL',
        '✓ Pago completo tomado → estado = PAGADO, saldo = 0',
        '✓ Préstamo vencido sin pagar → aparece en dashboard de alertas',
        '✓ Préstamo otorgado en liquidez proyectada → suma en ingresos futuros',
        '✓ Monto interés = capital * tasa/100 (verificar cálculo)',
      ],
      tributario: [
        '✓ Detracción marcada como depositada → saldo_bn aumenta',
        '✓ Detracción parcialmente depositada → cliente_deposito = PARCIAL',
        '✓ Pago impuesto SUNAT → saldo_bn disminuye',
        '✓ Saldo BN no puede ser negativo → validación en capa de negocio',
        '✓ Total depositado - total pagado = saldo_bn correcto',
      ],
      dashboard: [
        '✓ GET /api/dashboard devuelve todos los campos esperados',
        '✓ Liquidez proyectada incluye préstamos vencidos',
        '✓ Alertas incluyen stock crítico si stock < stock_minimo',
        '✓ Alertas incluyen detracciones pendientes',
        '✓ Alertas incluyen servicios por vencer (fecha_vencimiento próxima)',
        '✓ Balance de cuentas suma correctamente por moneda',
      ],
      gastos: [
        '✓ Crear gasto → Transacción EGRESO creada automáticamente',
        '✓ Pago de gasto → saldo cuenta debitado',
        '✓ Gasto en USD → tipo_cambio aplicado correctamente',
      ]
    };

    const list = cases[args.module] || ['No hay casos sugeridos para este módulo'];
    return { content: [{ type: 'text', text: `**Casos de prueba críticos — Módulo: ${args.module}**\n\n${list.join('\n')}` }] };
  }

  if (name === 'generate_db_fixture') {
    const fixtures = {
      minimal: `-- Fixtures mínimos para testing ERP-PRO
INSERT INTO Cuentas (nombre, tipo, moneda, saldo_actual) VALUES
  ('Caja Principal', 'CAJA', 'PEN', 5000.00),
  ('Banco BCP', 'BANCO', 'PEN', 20000.00),
  ('Cuenta BN Detracciones', 'BANCO', 'PEN', 0.00);

INSERT INTO Proveedores (ruc, razon_social) VALUES
  ('20123456789', 'Proveedor Test SAC');

INSERT INTO Inventario (sku, nombre, categoria, stock_actual, stock_minimo, costo_promedio_unitario) VALUES
  ('MAT-001', 'Material de Prueba', 'Material', 50.00, 10.00, 25.00);`,

      full_flow: `-- Fixtures flujo completo: servicio → cobro → detracción → impuesto
INSERT INTO Cuentas (nombre, tipo, moneda, saldo_actual) VALUES
  ('Caja Principal', 'CAJA', 'PEN', 10000.00),
  ('Cuenta BN Detracciones', 'BANCO', 'PEN', 0.00);

-- Servicio con IGV y detracción 12%
INSERT INTO Servicios (codigo, nombre, cliente, fecha_servicio, monto_base, aplica_igv, igv_base, total_base, detraccion_porcentaje, monto_detraccion, estado)
VALUES ('SRV-001', 'Servicio de Prueba', 'Cliente SAC', CURDATE(), 10000.00, TRUE, 1800.00, 11800.00, 12.00, 1416.00, 'PENDIENTE');

INSERT INTO Detracciones (id_servicio, cliente, porcentaje, monto, cliente_deposito)
VALUES (1, 'Cliente SAC', 12.00, 1416.00, 'NO');

-- Pago del servicio (monto líquido: 11800 - 1416 = 10384)
INSERT INTO Transacciones (referencia_tipo, referencia_id, id_cuenta, tipo, monto_base, igv_base, total_base, estado, fecha, descripcion)
VALUES ('SERVICIO', 1, 1, 'INGRESO', 10384.00, 0, 10384.00, 'REALIZADO', NOW(), 'Cobro servicio SRV-001');`,

      edge_cases: `-- Fixtures casos borde
-- Servicio con saldo 0 (para testear pagos en exceso)
INSERT INTO Servicios (nombre, cliente, fecha_servicio, monto_base, total_base, estado) VALUES
  ('Servicio ya cobrado', 'Test', CURDATE(), 1000.00, 1000.00, 'COBRADO');

-- Inventario en stock crítico
INSERT INTO Inventario (sku, nombre, categoria, stock_actual, stock_minimo) VALUES
  ('EPP-001', 'Casco de Seguridad', 'EPP', 2.00, 10.00);

-- Préstamo vencido
INSERT INTO PrestamosTomados (acreedor, fecha_emision, fecha_vencimiento, monto_capital, monto_total, saldo, estado)
VALUES ('Banco Prueba', '2025-01-01', '2025-06-01', 50000.00, 55000.00, 55000.00, 'PENDIENTE');

-- Detracción pendiente de depositar
INSERT INTO Servicios (nombre, cliente, fecha_servicio, monto_base, total_base, detraccion_porcentaje, monto_detraccion, estado)
VALUES ('Serv. con detracción', 'Empresa XYZ', '2025-11-01', 5000.00, 5900.00, 12.00, 708.00, 'COBRADO');`
    };

    return { content: [{ type: 'text', text: fixtures[args.scenario] }] };
  }

  throw new Error(`Herramienta no encontrada: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

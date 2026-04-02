#!/usr/bin/env node

/**
 * ERP-PRO Database Agent
 * Especializado en: MySQL schema, migrations, queries, indexes
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseAgent {
  constructor() {
    this.server = new Server(
      {
        name: "erp-database-agent",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.knowledgeBase = path.join(__dirname, "knowledge");
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "generate_table",
          description: "Genera DDL para crear una tabla con las 15 tablas del ERP como referencia",
          inputSchema: {
            type: "object",
            properties: {
              tableName: { type: "string", description: "Nombre de la tabla" },
              columns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    nullable: { type: "boolean" },
                    default: { type: "string" }
                  }
                },
                description: "Columnas de la tabla"
              },
              includeAudit: { type: "boolean", description: "Incluir campos de auditoría" }
            },
            required: ["tableName", "columns"]
          }
        },
        {
          name: "generate_migration",
          description: "Genera un script de migración para modificar schema existente",
          inputSchema: {
            type: "object",
            properties: {
              description: { type: "string", description: "Descripción del cambio" },
              changes: {
                type: "array",
                items: { type: "string" },
                description: "Lista de cambios SQL"
              }
            },
            required: ["description", "changes"]
          }
        },
        {
          name: "get_table_info",
          description: "Obtiene información de estructura de una tabla del schema actual",
          inputSchema: {
            type: "object",
            properties: {
              tableName: { type: "string", description: "Nombre de la tabla" }
            },
            required: ["tableName"]
          }
        },
        {
          name: "generate_query",
          description: "Genera una query optimizada basada en las reglas del ERP",
          inputSchema: {
            type: "object",
            properties: {
              operation: { 
                type: "string", 
                enum: ["select", "insert", "update", "delete"],
                description: "Tipo de operación"
              },
              table: { type: "string", description: "Tabla principal" },
              filters: { type: "object", description: "Filtros a aplicar" },
              joins: { type: "array", items: { type: "string" }, description: "Tablas a hacer JOIN" }
            },
            required: ["operation", "table"]
          }
        }
      ]
    }));

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "database://schema/complete",
          name: "Schema Completo ERP-PRO",
          mimeType: "text/markdown",
          description: "15 tablas del ERP con todas sus columnas"
        },
        {
          uri: "database://patterns/queries",
          name: "Patrones de Queries",
          mimeType: "text/markdown",
          description: "Queries predefinidas y optimizadas"
        },
        {
          uri: "database://patterns/indexes",
          name: "Estrategia de Índices",
          mimeType: "text/markdown",
          description: "Índices para optimización"
        },
        {
          uri: "database://migrations/history",
          name: "Historial de Migraciones",
          mimeType: "text/markdown",
          description: "Todas las migraciones ejecutadas"
        }
      ]
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resourceMap = {
        "database://schema/complete": "schema-complete.md",
        "database://patterns/queries": "query-patterns.md",
        "database://patterns/indexes": "index-strategy.md",
        "database://migrations/history": "migration-history.md"
      };

      const filename = resourceMap[request.params.uri];
      if (!filename) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      const content = await fs.readFile(
        path.join(this.knowledgeBase, filename),
        "utf-8"
      );

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "text/markdown",
            text: content
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "generate_table":
          return this.generateTable(args);
        case "generate_migration":
          return this.generateMigration(args);
        case "get_table_info":
          return this.getTableInfo(args);
        case "generate_query":
          return this.generateQuery(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async generateTable({ tableName, columns, includeAudit = true }) {
    const columnDefs = columns.map(col => {
      let def = `  ${col.name} ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.default) def += ` DEFAULT ${col.default}`;
      return def;
    });

    if (includeAudit) {
      columnDefs.push(
        '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        '  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
        '  estado VARCHAR(20) DEFAULT "ACTIVO"',
        '  fecha_anulacion TIMESTAMP NULL'
      );
    }

    const sql = `CREATE TABLE ${tableName} (
  id INT AUTO_INCREMENT PRIMARY KEY,
${columnDefs.join(',\n')},
  INDEX idx_estado (estado),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

    return {
      content: [
        {
          type: "text",
          text: `✅ DDL generado para tabla: ${tableName}\n\n\`\`\`sql\n${sql}\n\`\`\``
        }
      ]
    };
  }

  async generateMigration({ description, changes }) {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const filename = `${timestamp}_${description.toLowerCase().replace(/\s+/g, '_')}.sql`;

    const migration = `-- Migration: ${description}
-- Created: ${new Date().toISOString()}

START TRANSACTION;

${changes.join(';\n\n')};

COMMIT;

-- Rollback instructions:
-- To rollback this migration, execute the reverse operations manually.`;

    return {
      content: [
        {
          type: "text",
          text: `✅ Migración generada: ${filename}\n\n\`\`\`sql\n${migration}\n\`\`\``
        }
      ]
    };
  }

  async getTableInfo({ tableName }) {
    // Información de las 15 tablas principales
    const tables = {
      empresas: {
        description: "Gestión de Metal Engineers SAC y PerfoTools",
        columns: ["id", "ruc", "razon_social", "moneda_principal", "telefono", "email", "direccion", "created_at", "updated_at", "estado"],
        relationships: ["servicios", "compras", "inventario"]
      },
      servicios: {
        description: "Servicios de fundación/pilotaje prestados a clientes",
        columns: ["id", "empresa_id", "codigo", "nombre_proyecto", "cliente_ruc", "cliente_razon_social", "monto_base", "igv", "total", "estado_trabajo", "fecha_inicio", "fecha_fin", "aplica_detraccion", "porcentaje_detraccion", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["gastos", "detracciones"]
      },
      gastos: {
        description: "Gastos/egresos asignados a servicios",
        columns: ["id", "servicio_id", "empresa_id", "tipo_gasto", "descripcion", "proveedor_ruc", "proveedor_nombre", "fecha_gasto", "monto_base", "igv", "total", "es_deducible", "comprobante_tipo", "comprobante_numero", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["servicios"]
      },
      compras: {
        description: "Compras a proveedores (insumos, equipos, subcontratos)",
        columns: ["id", "empresa_id", "proveedor_ruc", "proveedor_nombre", "fecha_compra", "tipo_compra", "descripcion", "monto_base", "igv", "total", "aplica_detraccion", "porcentaje_detraccion", "comprobante_tipo", "comprobante_numero", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["inventario", "detracciones"]
      },
      inventario: {
        description: "Inventario general sin asignar a servicios",
        columns: ["id", "compra_id", "empresa_id", "descripcion", "cantidad", "unidad", "precio_unitario", "cantidad_disponible", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["salidas_inventario"]
      },
      salidas_inventario: {
        description: "Retiros de inventario asignados a servicios",
        columns: ["id", "inventario_id", "servicio_id", "cantidad_retirada", "fecha_retiro", "responsable", "observaciones", "created_at"],
        relationships: ["inventario", "servicios"]
      },
      detracciones: {
        description: "Detracciones SPOT (4% o 10%) del Sistema de Pago de Obligaciones Tributarias",
        columns: ["id", "empresa_id", "tipo_origen", "origen_id", "tipo_detraccion", "monto_base", "porcentaje_detraccion", "monto_detraccion", "fecha_operacion", "numero_constancia", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["servicios", "compras"]
      },
      retenciones: {
        description: "Retenciones del 3% aplicadas por clientes",
        columns: ["id", "servicio_id", "empresa_id", "cliente_ruc", "monto_factura", "porcentaje_retencion", "monto_retencion", "fecha_retencion", "numero_comprobante", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["servicios"]
      },
      prestamos: {
        description: "Préstamos otorgados o recibidos",
        columns: ["id", "empresa_id", "tipo_prestamo", "entidad_nombre", "entidad_ruc", "monto_principal", "tasa_interes", "plazo_meses", "fecha_inicio", "fecha_vencimiento", "cuota_mensual", "saldo_pendiente", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["cuotas_prestamo"]
      },
      cuotas_prestamo: {
        description: "Cuotas de préstamos (amortización + interés)",
        columns: ["id", "prestamo_id", "numero_cuota", "fecha_vencimiento", "monto_cuota", "monto_capital", "monto_interes", "fecha_pago", "monto_pagado", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["prestamos"]
      },
      bancos_cuentas: {
        description: "Cuentas bancarias de las empresas",
        columns: ["id", "empresa_id", "banco_nombre", "tipo_cuenta", "numero_cuenta", "moneda", "saldo_actual", "fecha_apertura", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["movimientos_bancarios"]
      },
      movimientos_bancarios: {
        description: "Ingresos/egresos en cuentas bancarias",
        columns: ["id", "cuenta_id", "tipo_movimiento", "fecha_movimiento", "concepto", "monto", "saldo_posterior", "numero_operacion", "observaciones", "created_at"],
        relationships: ["bancos_cuentas"]
      },
      planilla: {
        description: "Planilla de trabajadores",
        columns: ["id", "empresa_id", "trabajador_dni", "trabajador_nombre", "cargo", "tipo_contrato", "fecha_ingreso", "fecha_cese", "sueldo_base", "observaciones", "created_at", "updated_at", "estado"],
        relationships: ["pagos_planilla"]
      },
      pagos_planilla: {
        description: "Pagos mensuales de planilla",
        columns: ["id", "planilla_id", "periodo", "dias_trabajados", "sueldo_bruto", "descuento_essalud", "descuento_onp_afp", "otros_descuentos", "sueldo_neto", "fecha_pago", "observaciones", "created_at"],
        relationships: ["planilla"]
      },
      banco_nacion_detracciones: {
        description: "Tracking de cuenta de detracciones en Banco de la Nación",
        columns: ["id", "empresa_id", "fecha_operacion", "tipo_operacion", "monto", "detraccion_id", "numero_constancia", "saldo_posterior", "observaciones", "created_at"],
        relationships: ["detracciones"]
      }
    };

    const info = tables[tableName];
    if (!info) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Tabla '${tableName}' no encontrada. Tablas disponibles:\n${Object.keys(tables).join(', ')}`
          }
        ]
      };
    }

    const output = `📊 Información de tabla: **${tableName}**

**Descripción:** ${info.description}

**Columnas (${info.columns.length}):**
${info.columns.map(col => `- ${col}`).join('\n')}

**Relaciones:**
${info.relationships.map(rel => `- ${rel}`).join('\n')}

**Reglas especiales:**
- Soft delete: usa campo \`estado\` (ACTIVO/ANULADO)
- Auditoría: \`created_at\`, \`updated_at\`
- Filtrar siempre: \`WHERE estado != 'ANULADO'\`
`;

    return {
      content: [
        {
          type: "text",
          text: output
        }
      ]
    };
  }

  async generateQuery({ operation, table, filters = {}, joins = [] }) {
    let query = '';

    switch (operation) {
      case 'select':
        query = `SELECT * FROM ${table}`;
        
        if (joins.length > 0) {
          joins.forEach(join => {
            query += `\nLEFT JOIN ${join} ON ${table}.${join.slice(0, -1)}_id = ${join}.id`;
          });
        }

        query += `\nWHERE ${table}.estado != 'ANULADO'`;

        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined) {
            query += `\n  AND ${table}.${key} = ?`;
          }
        });

        query += `\nORDER BY ${table}.id DESC`;
        break;

      case 'insert':
        query = `INSERT INTO ${table} SET ?`;
        break;

      case 'update':
        query = `UPDATE ${table}\nSET ?\nWHERE id = ? AND estado != 'ANULADO'`;
        break;

      case 'delete':
        query = `-- Soft delete (nunca DELETE físico)
UPDATE ${table}
SET estado = 'ANULADO', fecha_anulacion = NOW()
WHERE id = ?`;
        break;
    }

    return {
      content: [
        {
          type: "text",
          text: `✅ Query generada:\n\n\`\`\`sql\n${query}\n\`\`\``
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Database Agent MCP server running on stdio");
  }
}

const agent = new DatabaseAgent();
agent.run().catch(console.error);

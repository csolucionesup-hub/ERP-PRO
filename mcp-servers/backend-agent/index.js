#!/usr/bin/env node

/**
 * ERP-PRO Backend Agent
 * Especializado en: Express routes, services, validators, middleware
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

class BackendAgent {
  constructor() {
    this.server = new Server(
      {
        name: "erp-backend-agent",
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
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "generate_route",
          description: "Genera una ruta Express completa con controlador y validación Zod",
          inputSchema: {
            type: "object",
            properties: {
              entityName: { type: "string", description: "Nombre de la entidad (ej: 'servicio', 'gasto')" },
              methods: { 
                type: "array", 
                items: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] },
                description: "Métodos HTTP a implementar"
              },
              includeAuth: { type: "boolean", description: "Incluir middleware de autenticación" }
            },
            required: ["entityName", "methods"]
          }
        },
        {
          name: "generate_service",
          description: "Genera un servicio TypeScript con lógica de negocio y manejo de transacciones",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: { type: "string", description: "Nombre del servicio" },
              operations: { 
                type: "array", 
                items: { type: "string" },
                description: "Operaciones CRUD necesarias"
              }
            },
            required: ["serviceName", "operations"]
          }
        },
        {
          name: "generate_validator",
          description: "Genera schemas Zod para validación de datos",
          inputSchema: {
            type: "object",
            properties: {
              schemaName: { type: "string", description: "Nombre del schema" },
              fields: { 
                type: "object",
                description: "Campos y sus tipos (ej: {ruc: 'string', monto: 'number'})"
              }
            },
            required: ["schemaName", "fields"]
          }
        },
        {
          name: "check_route_pattern",
          description: "Verifica si una ruta sigue los patrones establecidos del proyecto",
          inputSchema: {
            type: "object",
            properties: {
              routeCode: { type: "string", description: "Código de la ruta a verificar" }
            },
            required: ["routeCode"]
          }
        }
      ]
    }));

    // List available resources (knowledge base)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "backend://patterns/express-routes",
          name: "Patrones de Rutas Express",
          mimeType: "text/markdown",
          description: "Estructura estándar de rutas en ERP-PRO"
        },
        {
          uri: "backend://patterns/services",
          name: "Patrones de Servicios TypeScript",
          mimeType: "text/markdown",
          description: "Estructura y mejores prácticas para servicios"
        },
        {
          uri: "backend://patterns/middleware",
          name: "Middleware Patterns",
          mimeType: "text/markdown",
          description: "Middleware de auth, validación y error handling"
        },
        {
          uri: "backend://patterns/zod-validators",
          name: "Zod Validation Schemas",
          mimeType: "text/markdown",
          description: "Ejemplos de validación con Zod"
        }
      ]
    }));

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resourceMap = {
        "backend://patterns/express-routes": "express-routes.md",
        "backend://patterns/services": "services.md",
        "backend://patterns/middleware": "middleware.md",
        "backend://patterns/zod-validators": "zod-validators.md"
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

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "generate_route":
          return this.generateRoute(args);
        case "generate_service":
          return this.generateService(args);
        case "generate_validator":
          return this.generateValidator(args);
        case "check_route_pattern":
          return this.checkRoutePattern(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async generateRoute({ entityName, methods, includeAuth = false }) {
    const routeTemplate = `import { Router } from 'express';
import type { Request, Response } from 'express';
import { ${entityName}Service } from '../services/${entityName}.service';
import { validate${entityName.charAt(0).toUpperCase() + entityName.slice(1)} } from '../validators/${entityName}.validator';
${includeAuth ? "import { authenticateToken } from '../middleware/auth.middleware';" : ""}

const router = Router();
const service = new ${entityName.charAt(0).toUpperCase() + entityName.slice(1)}Service();

${methods.includes('GET') ? `
// GET /${entityName}s
router.get('/', ${includeAuth ? 'authenticateToken, ' : ''}async (req: Request, res: Response) => {
  try {
    const result = await service.getAll(req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /${entityName}s/:id
router.get('/:id', ${includeAuth ? 'authenticateToken, ' : ''}async (req: Request, res: Response) => {
  try {
    const result = await service.getById(parseInt(req.params.id));
    if (!result) {
      return res.status(404).json({ error: '${entityName} no encontrado' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});` : ''}

${methods.includes('POST') ? `
// POST /${entityName}s
router.post('/', ${includeAuth ? 'authenticateToken, ' : ''}validate${entityName.charAt(0).toUpperCase() + entityName.slice(1)}, async (req: Request, res: Response) => {
  try {
    const result = await service.create(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});` : ''}

${methods.includes('PUT') ? `
// PUT /${entityName}s/:id
router.put('/:id', ${includeAuth ? 'authenticateToken, ' : ''}validate${entityName.charAt(0).toUpperCase() + entityName.slice(1)}, async (req: Request, res: Response) => {
  try {
    const result = await service.update(parseInt(req.params.id), req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});` : ''}

${methods.includes('DELETE') ? `
// DELETE /${entityName}s/:id (soft delete)
router.delete('/:id', ${includeAuth ? 'authenticateToken, ' : ''}async (req: Request, res: Response) => {
  try {
    await service.softDelete(parseInt(req.params.id));
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});` : ''}

export default router;`;

    return {
      content: [
        {
          type: "text",
          text: `✅ Ruta generada para: ${entityName}\n\n\`\`\`typescript\n${routeTemplate}\n\`\`\``
        }
      ]
    };
  }

  async generateService({ serviceName, operations }) {
    const serviceTemplate = `import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import type { ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} } from '../types/${serviceName}.types';

export class ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}Service {
  ${operations.includes('getAll') ? `
  async getAll(filters?: any): Promise<${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}[]> {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ${serviceName}s WHERE estado != "ANULADO" ORDER BY id DESC'
      );
      return rows as ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}[];
    } finally {
      connection.release();
    }
  }` : ''}

  ${operations.includes('getById') ? `
  async getById(id: number): Promise<${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} | null> {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ${serviceName}s WHERE id = ? AND estado != "ANULADO"',
        [id]
      );
      return rows.length > 0 ? rows[0] as ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} : null;
    } finally {
      connection.release();
    }
  }` : ''}

  ${operations.includes('create') ? `
  async create(data: Omit<${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}, 'id'>): Promise<${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query<ResultSetHeader>(
        'INSERT INTO ${serviceName}s SET ?',
        data
      );

      await connection.commit();

      return { id: result.insertId, ...data } as ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)};
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }` : ''}

  ${operations.includes('update') ? `
  async update(id: number, data: Partial<${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}>): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE ${serviceName}s SET ? WHERE id = ?',
        [data, id]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }` : ''}

  ${operations.includes('softDelete') ? `
  async softDelete(id: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE ${serviceName}s SET estado = "ANULADO", fecha_anulacion = NOW() WHERE id = ?',
        [id]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }` : ''}
}`;

    return {
      content: [
        {
          type: "text",
          text: `✅ Servicio generado: ${serviceName}\n\n\`\`\`typescript\n${serviceTemplate}\n\`\`\``
        }
      ]
    };
  }

  async generateValidator({ schemaName, fields }) {
    const zodImports = new Set(['z']);
    const fieldSchemas = [];

    for (const [fieldName, fieldType] of Object.entries(fields)) {
      let zodType;
      switch (fieldType) {
        case 'string':
          zodType = 'z.string().min(1, "Campo requerido")';
          break;
        case 'number':
          zodType = 'z.number().positive("Debe ser positivo")';
          break;
        case 'email':
          zodType = 'z.string().email("Email inválido")';
          break;
        case 'ruc':
          zodType = 'z.string().length(11, "RUC debe tener 11 dígitos").regex(/^\\d{11}$/, "RUC inválido")';
          break;
        case 'date':
          zodType = 'z.string().datetime()';
          break;
        default:
          zodType = 'z.string()';
      }
      fieldSchemas.push(`  ${fieldName}: ${zodType}`);
    }

    const validatorTemplate = `import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const ${schemaName}Schema = z.object({
${fieldSchemas.join(',\n')}
});

export type ${schemaName.charAt(0).toUpperCase() + schemaName.slice(1)}Input = z.infer<typeof ${schemaName}Schema>;

export const validate${schemaName.charAt(0).toUpperCase() + schemaName.slice(1)} = (req: Request, res: Response, next: NextFunction) => {
  try {
    ${schemaName}Schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validación fallida',
        details: error.errors
      });
    }
    next(error);
  }
};`;

    return {
      content: [
        {
          type: "text",
          text: `✅ Validator generado: ${schemaName}\n\n\`\`\`typescript\n${validatorTemplate}\n\`\`\``
        }
      ]
    };
  }

  async checkRoutePattern({ routeCode }) {
    const checks = {
      hasErrorHandling: routeCode.includes('try') && routeCode.includes('catch'),
      usesService: /const service = new/.test(routeCode),
      hasValidation: /validate[A-Z]/.test(routeCode),
      usesSoftDelete: routeCode.includes('ANULADO') || routeCode.includes('softDelete'),
      hasTypeAnnotations: routeCode.includes(': Request') && routeCode.includes(': Response')
    };

    const issues = [];
    if (!checks.hasErrorHandling) issues.push('❌ Falta manejo de errores con try-catch');
    if (!checks.usesService) issues.push('❌ No usa un servicio (service layer)');
    if (!checks.hasValidation) issues.push('⚠️ No tiene validación (considerar agregar)');
    if (!checks.usesSoftDelete) issues.push('⚠️ Verificar si debe usar soft delete');
    if (!checks.hasTypeAnnotations) issues.push('❌ Faltan anotaciones de tipo TypeScript');

    const report = issues.length === 0 
      ? '✅ La ruta sigue todos los patrones establecidos' 
      : issues.join('\n');

    return {
      content: [
        {
          type: "text",
          text: `📋 Reporte de Validación de Ruta:\n\n${report}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Backend Agent MCP server running on stdio");
  }
}

const agent = new BackendAgent();
agent.run().catch(console.error);

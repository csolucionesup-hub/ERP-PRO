# ERP-PRO MCP Agents - Sistema de Agentes Especializados

## 🎯 Objetivo

Sistema de 5 agentes MCP especializados que optimizan el desarrollo de ERP-PRO mediante:
- **Contexto enfocado**: Cada agente solo carga conocimiento relevante
- **Ahorro de tokens**: No se carga información irrelevante en cada conversación
- **Eficiencia**: Herramientas especializadas para cada dominio
- **Escalabilidad**: Fácil agregar nuevos agentes

## 📦 Agentes Disponibles

### 1. **Backend Agent** (`erp-backend-agent`)
**Especialidad**: Express + TypeScript + Services

**Herramientas**:
- `generate_route` - Genera rutas Express completas
- `generate_service` - Crea servicios con transacciones
- `generate_validator` - Schemas Zod para validación
- `check_route_pattern` - Verifica patrones del proyecto

**Knowledge Base**:
- Patrones de rutas Express
- Estructura de servicios TypeScript
- Middleware y validación
- Manejo de errores

---

### 2. **Database Agent** (`erp-database-agent`)
**Especialidad**: MySQL Schema + Queries + Migrations

**Herramientas**:
- `generate_table` - DDL para nuevas tablas
- `generate_migration` - Scripts de migración
- `get_table_info` - Info de las 15 tablas del ERP
- `generate_query` - Queries optimizadas

**Knowledge Base**:
- Schema completo (15 tablas)
- Patrones de queries
- Estrategia de índices
- Historial de migraciones

---

### 3. **Frontend Agent** (`erp-frontend-agent`)
**Especialidad**: Vanilla JS SPA + Componentes UI

**Herramientas**:
- `generate_page` - Páginas completas del SPA
- `generate_component` - Componentes reutilizables
- `format_currency` - Formateo de moneda (soles/dólares)
- Helpers para modales, badges, etc.

**Knowledge Base**:
- Estructura SPA Vanilla JS
- Componentes modulares
- Formatters y utilities
- Patrones de routing

---

### 4. **Tax & Business Agent** (`erp-tax-business-agent`)
**Especialidad**: Lógica fiscal peruana + Reglas de negocio

**Herramientas**:
- `calculate_igv` - Cálculo de IGV 18%
- `calculate_detraccion` - Detracciones SPOT (4%/10%)
- `validate_ruc` - Validación de RUC peruano
- `get_tax_rule` - Reglas fiscales específicas
- `analyze_service_flow` - Valida flujos de servicio

**Knowledge Base**:
- IGV 18% (Impuesto General a las Ventas)
- Detracciones SPOT (Sistema de Pago de Obligaciones Tributarias)
- Retenciones 3%
- Plazos SUNAT
- Reglas de negocio ERP-PRO

---

### 5. **Testing Agent** (`erp-testing-agent`)
**Especialidad**: Testing + QA + Documentación

**Herramientas**:
- `generate_api_test` - Tests para endpoints
- `generate_service_test` - Tests unitarios de servicios
- `suggest_test_cases` - Casos de prueba por módulo
- `generate_db_fixture` - Datos de prueba para MySQL

**Knowledge Base**:
- Estrategias de testing
- Fixtures para cada módulo
- Casos críticos por módulo
- Patterns de integración

---

## 🚀 Instalación

### Paso 1: Copiar agentes a tu proyecto

```bash
# Copiar la carpeta mcp-servers a tu proyecto ERP-PRO
xcopy /E /I erp-mcp-agents C:\Users\Asus\ERP-PRO\mcp-servers
```

### Paso 2: Instalar dependencias

```bash
cd C:\Users\Asus\ERP-PRO\mcp-servers\backend-agent
npm install

cd C:\Users\Asus\ERP-PRO\mcp-servers\database-agent
npm install

cd C:\Users\Asus\ERP-PRO\mcp-servers\frontend-agent
npm install

cd C:\Users\Asus\ERP-PRO\mcp-servers\tax-business-agent
npm install

cd C:\Users\Asus\ERP-PRO\mcp-servers\testing-agent
npm install
```

### Paso 3: Configurar Claude Desktop

Editar `C:\Users\Asus\AppData\Roaming\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "erp-backend-agent": {
      "command": "node",
      "args": ["C:\\Users\\Asus\\ERP-PRO\\mcp-servers\\backend-agent\\index.js"]
    },
    "erp-database-agent": {
      "command": "node",
      "args": ["C:\\Users\\Asus\\ERP-PRO\\mcp-servers\\database-agent\\index.js"]
    },
    "erp-frontend-agent": {
      "command": "node",
      "args": ["C:\\Users\\Asus\\ERP-PRO\\mcp-servers\\frontend-agent\\index.js"]
    },
    "erp-tax-business-agent": {
      "command": "node",
      "args": ["C:\\Users\\Asus\\ERP-PRO\\mcp-servers\\tax-business-agent\\index.js"]
    },
    "erp-testing-agent": {
      "command": "node",
      "args": ["C:\\Users\\Asus\\ERP-PRO\\mcp-servers\\testing-agent\\index.js"]
    }
  }
}
```

### Paso 4: Reiniciar Claude Desktop

Cerrar completamente Claude Desktop y volver a abrir.

---

## 💡 Uso

### Ejemplo 1: Crear una ruta nueva

**Tú dices:**
> "Necesito crear la ruta para gestionar facturas con GET, POST, PUT y DELETE"

**Claude automáticamente:**
1. Carga el **Backend Agent**
2. Usa la herramienta `generate_route` 
3. Te da código listo para copiar en `src/routes/facturas.routes.ts`

---

### Ejemplo 2: Calcular detracciones

**Tú dices:**
> "¿Cómo calculo la detracción de un servicio de S/ 10,000?"

**Claude automáticamente:**
1. Carga el **Tax & Business Agent**
2. Usa `calculate_detraccion`
3. Te explica: monto_base × 10% = S/ 1,000

---

### Ejemplo 3: Consultar schema de tabla

**Tú dices:**
> "¿Qué columnas tiene la tabla servicios?"

**Claude automáticamente:**
1. Carga el **Database Agent**
2. Usa `get_table_info`
3. Te lista las 18 columnas con descripción

---

## 📊 Ahorro de Tokens

### Antes (sin agentes):
- Cada conversación carga TODO el contexto
- ~50,000 tokens por conversación
- Claude puede confundirse entre módulos

### Ahora (con agentes):
- Solo carga contexto relevante
- ~10,000-15,000 tokens por conversación
- **Ahorro: 70%** en consumo de tokens
- Claude siempre enfocado en el dominio correcto

---

## 🔧 Mantenimiento

### Actualizar knowledge base

Si cambias reglas de negocio, actualiza:

```
mcp-servers/
├── backend-agent/knowledge/*.md
├── database-agent/knowledge/*.md
├── frontend-agent/knowledge/*.md
├── tax-business-agent/knowledge/*.md
└── testing-agent/knowledge/*.md
```

### Agregar nuevas herramientas

Edita `index.js` del agente correspondiente en la sección `ListToolsRequestSchema`.

---

## 🎯 Beneficios

✅ **Eficiencia**: Menos tokens = más conversaciones con tu plan  
✅ **Precisión**: Agente siempre tiene contexto correcto  
✅ **Escalabilidad**: Fácil agregar nuevos agentes  
✅ **Organización**: Código, reglas y knowledge separados por dominio  
✅ **Velocidad**: Claude responde más rápido con menos contexto  

---

## 📝 Notas Importantes

1. **Node.js requerido**: Los agentes son servidores Node.js
2. **Rutas absolutas**: Usa rutas completas en `claude_desktop_config.json`
3. **Reiniciar Claude**: Cada cambio en config requiere reinicio
4. **Knowledge editable**: Los `.md` son archivos de texto, editables libremente

---

## 🆘 Troubleshooting

**Problema**: Agentes no aparecen en Claude Desktop

**Solución**:
1. Verificar que `claude_desktop_config.json` esté bien formateado
2. Verificar rutas absolutas sean correctas
3. Ejecutar `npm install` en cada carpeta de agente
4. Reiniciar Claude Desktop completamente

**Problema**: Error "Cannot find module"

**Solución**:
```bash
cd C:\Users\Asus\ERP-PRO\mcp-servers\[agente]
npm install @modelcontextprotocol/sdk
```

---

## 📞 Soporte

Desarrollado para **CREER Soluciones Group**  
Proyecto: **ERP-PRO** (Metal Engineers SAC + PerfoTools)

Para agregar más agentes o modificar los existentes, contacta con el equipo de desarrollo.

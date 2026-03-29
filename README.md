# ERP PRO — Sistema de Gestión Empresarial

> Sistema ERP completo para gestión de compras, inventario, servicios y finanzas. Construido con Node.js, TypeScript y MySQL.

---

## 📋 Tabla de Contenidos

- [Descripción](#descripción)
- [Módulos](#módulos)
- [Tecnologías](#tecnologías)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [API Reference](#api-reference)
- [Flujo de Negocio](#flujo-de-negocio)

---

## 📌 Descripción

**ERP PRO** es un sistema de gestión empresarial diseñado para pequeñas y medianas empresas que necesitan controlar sus operaciones de compras, inventario, servicios y finanzas en un solo lugar.

### Características principales

- ✅ **Dashboard Gerencial** — KPIs en tiempo real: caja, utilidad, alertas operativas
- ✅ **Control de Compras** — registro de facturas con afectación directa a inventario y caja
- ✅ **Inventario Valorizado** — costeo promedio ponderado, kárdex por ítem
- ✅ **Servicios / Ventas** — facturación con IGV, detracciones y control de cobros
- ✅ **Finanzas** — cuentas por pagar, cuentas por cobrar, flujo de caja
- ✅ **Anulación Sistémica** — sin borrado físico; reversión atómica de stock y finanzas
- ✅ **Trazabilidad completa** — fecha y tipo de acción registrados en cada operación

---

## 🧩 Módulos

### 1. Dashboard Gerencial
Panel de mando con los indicadores más críticos del negocio:

| Sección | Contenido |
|---|---|
| Tesorería Diaria | Saldo en caja, ingresos y egresos del día |
| Rentabilidad | Utilidad neta acumulada y margen porcentual |
| Centro de Monitoreo | Alertas de pérdidas, stock bajo, clientes morosos |
| Finanzas Estructurales | Cuentas por cobrar y por pagar globales |

### 2. Compras (Egresos Logísticos)
- Registro de facturas de proveedores
- Detalle por ítem con cálculo automático de IGV
- Afectación directa al inventario (costeo promedio ponderado)
- Registro contable en Transacciones (EGRESO)
- Anulación con reversión de stock

### 3. Inventario (Almacén Valorizado)
- Catálogo de insumos con SKU único
- Costeo promedio ponderado por ítem
- Valoración patrimonial del almacén
- Kárdex completo de movimientos (entradas/salidas)
- Retiro de insumos hacia servicios (imputa costos reales)

### 4. Servicios / Ventas
- Emisión de facturas de servicio con IGV y detracciones
- Control de cobros parciales y totales
- Cálculo automático de márgenes de rentabilidad
- Cruce de costos de inventario consumido vs ingreso neto
- Anulación con reintegro de insumos al inventario

### 5. Finanzas y Flujo de Caja
- Cuentas por pagar consolidadas (compras + gastos)
- Registro de gastos fijos operativos
- Registro de pagos parciales o totales
- Anulación de gastos con reversión de transacciones
- Vista de flujo de caja proyectado

---

## 🛠 Tecnologías

| Capa | Tecnología |
|---|---|
| **Backend** | Node.js + TypeScript + Express |
| **Base de Datos** | MySQL 8 |
| **Validación** | Zod |
| **Frontend** | HTML + Vanilla JS (SPA) |
| **Estilos** | CSS personalizado (design system propio) |
| **Runtime** | ts-node |

---

## ✅ Requisitos

- **Node.js** v18 o superior
- **MySQL** 8.0 o superior
- **npm** v9 o superior

---

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/csolucionesup-hub/ERP-PRO.git
cd ERP-PRO
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# Base de Datos
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=erp_pro

# Servidor
PORT=3000

# Seguridad
SESSION_SECRET=tu_clave_secreta_aqui
```

### 4. Configurar la base de datos

Ejecutar los scripts SQL en orden:

```bash
# 1. Crear el esquema (tablas)
mysql -u root -p < database/schema.sql

# 2. Crear relaciones y triggers
mysql -u root -p < database/relations.sql
```

O desde el CLI de MySQL:

```sql
source database/schema.sql;
source database/relations.sql;
```

### 5. Iniciar el servidor

```bash
npm run dev
```

El sistema estará disponible en: **http://localhost:3000**

---

## ⚙️ Configuración

### Variables de entorno disponibles

| Variable | Descripción | Default |
|---|---|---|
| `DB_HOST` | Host del servidor MySQL | `localhost` |
| `DB_PORT` | Puerto de MySQL | `3306` |
| `DB_USER` | Usuario de MySQL | — |
| `DB_PASSWORD` | Contraseña de MySQL | — |
| `DB_NAME` | Nombre de la base de datos | `erp_pro` |
| `PORT` | Puerto del servidor Express | `3000` |
| `SESSION_SECRET` | Clave para sesiones seguras | — |

---

## 📁 Estructura del Proyecto

```
ERP-PRO/
├── app/
│   ├── middlewares/
│   │   ├── auth.ts              # Autenticación de sesión
│   │   └── errorHandler.ts      # Manejo global de errores
│   ├── modules/
│   │   ├── finance/
│   │   │   └── FinanceService.ts    # Lógica de finanzas y caja
│   │   ├── inventory/
│   │   │   └── InventoryService.ts  # Almacén y kárdex
│   │   ├── purchases/
│   │   │   ├── PurchaseService.ts   # Compras y proveedores
│   │   │   └── ProvidersService.ts  # CRUD de proveedores
│   │   └── services/
│   │       └── CatalogService.ts    # Servicios / ventas
│   └── validators/
│       ├── gastos.schema.ts         # Validación de gastos
│       ├── purchase.schema.ts       # Validación de compras
│       ├── service.schema.ts        # Validación de servicios
│       └── inventory.schema.ts      # Validación de inventario
├── database/
│   ├── schema.sql               # Creación de tablas
│   ├── relations.sql            # Relaciones y datos iniciales
│   └── connection.ts            # Pool de conexiones MySQL
├── public/
│   ├── css/
│   │   └── main.css             # Design system global
│   ├── js/
│   │   ├── app.js               # Router SPA
│   │   ├── components/
│   │   │   └── Sidebar.js       # Navegación lateral
│   │   ├── pages/
│   │   │   ├── Dashboard.js     # Panel gerencial
│   │   │   ├── Compras.js       # Módulo de compras
│   │   │   ├── Inventario.js    # Módulo de inventario
│   │   │   ├── Servicios.js     # Módulo de servicios
│   │   │   └── Finanzas.js      # Módulo financiero
│   │   └── services/
│   │       └── api.js           # Cliente HTTP (fetch)
│   └── index.html               # Entrada SPA
├── functions/
│   └── calculations.ts          # Funciones matemáticas
├── index.ts                     # Servidor principal (Express)
├── tsconfig.json
├── package.json
└── .env                         # ⚠️ No incluido en el repo
```

---

## 📡 API Reference

### Finanzas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/finanzas/dashboard` | KPIs del dashboard gerencial |
| GET | `/api/finanzas/operativo` | Resumen operativo y alertas |
| GET | `/api/finanzas/cxp` | Cuentas por pagar |
| GET | `/api/finanzas/cxc` | Cuentas por cobrar |
| GET | `/api/gastos` | Listado de gastos |
| POST | `/api/gastos` | Registrar gasto |
| POST | `/api/gastos/:id/pago` | Registrar pago de gasto |
| POST | `/api/gastos/:id/anular` | Anular gasto |

### Compras
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/compras` | Listado de compras |
| POST | `/api/compras` | Registrar compra (multi-fase) |
| POST | `/api/compras/:id/anular` | Anular compra + revertir stock |
| GET | `/api/proveedores` | Listado de proveedores |
| POST | `/api/proveedores` | Crear proveedor |

### Inventario
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/inventario` | Catálogo valorizado |
| POST | `/api/inventario` | Crear ítem |
| GET | `/api/inventario/:id/kardex` | Kárdex por ítem |
| POST | `/api/inventario/consumo` | Retirar insumos hacia servicio |

### Servicios
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/servicios` | Listado de servicios con rentabilidad |
| POST | `/api/servicios` | Crear servicio/factura |
| POST | `/api/servicios/:id/pago` | Registrar cobro |
| POST | `/api/servicios/:id/anular` | Anular servicio + reintegrar stock |

---

## 🔄 Flujo de Negocio

```
COMPRA → INVENTARIO → CONSUMO → SERVICIO → COBRO → CAJA
   ↓                                ↓                  ↑
EGRESO                           COSTO              INGRESO
(Transacciones)              (CostosServicio)   (Transacciones)
```

### Anulación Sistémica (sin borrado físico)

```
ANULAR COMPRA  →  revertir stock  →  marcar transacciones ANULADO
ANULAR SERVICIO → reintegrar stock → revertir ingresos en caja
ANULAR GASTO   → revertir egreso  → marcar transacciones ANULADO
```

---

## 🔐 Seguridad

- Autenticación por sesión con `express-session`
- Validación de esquemas con `Zod` en todas las rutas POST
- Las contraseñas y credenciales se gestionan exclusivamente por `.env`
- No se permite el borrado físico de registros (política de auditoría)

---

## 📄 Licencia

Propiedad de **C Soluciones UP**. Todos los derechos reservados.

---

*Desarrollado con Node.js + TypeScript + MySQL*

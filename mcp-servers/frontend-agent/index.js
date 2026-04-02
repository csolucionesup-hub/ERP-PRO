import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = new Server(
  { name: 'erp-frontend-agent', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'knowledge://spa-patterns', name: 'Patrones SPA Vanilla JS del ERP', mimeType: 'text/markdown' },
    { uri: 'knowledge://vanilla-js-components', name: 'Componentes Vanilla JS', mimeType: 'text/markdown' },
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const map = {
    'knowledge://spa-patterns': 'spa-patterns.md',
    'knowledge://vanilla-js-components': 'vanilla-js-components.md',
  };
  const file = map[req.params.uri];
  if (!file) throw new Error(`Recurso no encontrado: ${req.params.uri}`);
  const content = readFileSync(join(__dirname, 'knowledge', file), 'utf-8');
  return { contents: [{ uri: req.params.uri, mimeType: 'text/markdown', text: content }] };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_page',
      description: 'Genera una página HTML completa para un módulo ERP (tabla + formulario modal)',
      inputSchema: {
        type: 'object',
        properties: {
          module: { type: 'string', description: 'Nombre del módulo (ej: "clientes")' },
          title: { type: 'string', description: 'Título visible en la UI' },
          columns: {
            type: 'array',
            items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, format: { type: 'string', enum: ['text', 'money', 'date', 'badge', 'percent'] } }, required: ['key', 'label'] },
            description: 'Columnas de la tabla'
          },
          api_endpoint: { type: 'string', description: 'Endpoint API (ej: /api/clientes)' },
          has_payments: { type: 'boolean', default: false, description: 'Si tiene botón de registrar pago' }
        },
        required: ['module', 'title', 'columns', 'api_endpoint']
      }
    },
    {
      name: 'generate_component',
      description: 'Genera un componente reutilizable Vanilla JS (modal, tabla, form, badge)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['modal', 'data-table', 'form', 'stat-card', 'alert-badge', 'currency-input'] },
          config: { type: 'object', description: 'Configuración del componente' }
        },
        required: ['type']
      }
    },
    {
      name: 'format_currency',
      description: 'Genera la función JS de formateo de moneda/números para el ERP',
      inputSchema: {
        type: 'object',
        properties: {
          include_usd: { type: 'boolean', default: true }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'generate_page') {
    const { module, title, columns, api_endpoint, has_payments = false } = args;
    const ModCap = module.charAt(0).toUpperCase() + module.slice(1);

    const headerCells = columns.map(c => `<th>${c.label}</th>`).join('\n          ');
    const dataCells = columns.map(c => {
      switch (c.format) {
        case 'money':   return `<td>S/ \${formatMoney(r.${c.key})}</td>`;
        case 'date':    return `<td>\${formatDate(r.${c.key})}</td>`;
        case 'badge':   return `<td><span class="badge badge-\${r.${c.key}?.toLowerCase()}">\${r.${c.key} || '-'}</span></td>`;
        case 'percent': return `<td>\${r.${c.key} || 0}%</td>`;
        default:        return `<td>\${r.${c.key} || '-'}</td>`;
      }
    }).join('\n          ');

    const paymentBtn = has_payments
      ? `<button class="btn-sm btn-primary" onclick="openPagoModal(r.id_${module})">Pago</button>`
      : '';

    return {
      content: [{
        type: 'text',
        text: `<!-- ${title} — ERP-PRO -->
<div id="${module}-page" class="module-page" style="display:none">
  <div class="page-header">
    <h2>${title}</h2>
    <button class="btn-primary" onclick="open${ModCap}Modal()">+ Nuevo</button>
  </div>

  <div class="table-wrapper">
    <table id="${module}-table" class="data-table">
      <thead>
        <tr>
          ${headerCells}
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="${module}-tbody"></tbody>
    </table>
  </div>
</div>

<script>
async function load${ModCap}s() {
  const res = await fetch('${api_endpoint}');
  const data = await res.json();
  const tbody = document.getElementById('${module}-tbody');
  tbody.innerHTML = data.map(r => \`
    <tr>
          ${dataCells}
      <td>
        <button class="btn-sm btn-secondary" onclick="edit${ModCap}(\${JSON.stringify(r).replace(/"/g,'&quot;')})">Editar</button>
        ${paymentBtn}
      </td>
    </tr>
  \`).join('');
}

function open${ModCap}Modal(data = null) {
  const modal = document.getElementById('${module}-modal');
  if (data) {
    // modo edición: popular campos
    Object.keys(data).forEach(k => {
      const el = modal.querySelector(\`[name="\${k}"]\`);
      if (el) el.value = data[k] ?? '';
    });
  }
  modal.style.display = 'flex';
}

function close${ModCap}Modal() {
  document.getElementById('${module}-modal').style.display = 'none';
  document.getElementById('${module}-form').reset();
}

async function save${ModCap}(e) {
  e.preventDefault();
  const form = document.getElementById('${module}-form');
  const formData = Object.fromEntries(new FormData(form));
  const id = formData.id_${module};
  const url = id ? \`${api_endpoint}/\${id}\` : '${api_endpoint}';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
  if (!res.ok) { const err = await res.json(); return showToast(err.error || 'Error al guardar', 'error'); }
  showToast('${title} guardado correctamente');
  close${ModCap}Modal();
  load${ModCap}s();
}

document.addEventListener('DOMContentLoaded', () => {
  if (getCurrentPage() === '${module}') load${ModCap}s();
});
</script>`
      }]
    };
  }

  if (name === 'generate_component') {
    const { type, config = {} } = args;

    const components = {
      'stat-card': `<!-- Tarjeta de estadística para Dashboard -->
<div class="stat-card" id="\${config.id || 'stat-card'}">
  <div class="stat-icon">\${config.icon || '📊'}</div>
  <div class="stat-info">
    <div class="stat-value" id="\${config.id}-value">-</div>
    <div class="stat-label">\${config.label || 'Métrica'}</div>
  </div>
</div>`,

      'modal': `<!-- Modal genérico reutilizable -->
<div id="${config.id || 'generic-modal'}" class="modal-overlay" style="display:none">
  <div class="modal-container">
    <div class="modal-header">
      <h3>${config.title || 'Modal'}</h3>
      <button class="modal-close" onclick="document.getElementById('${config.id || 'generic-modal'}').style.display='none'">✕</button>
    </div>
    <div class="modal-body">
      <!-- contenido aquí -->
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="document.getElementById('${config.id || 'generic-modal'}').style.display='none'">Cancelar</button>
      <button class="btn-primary" onclick="${config.onConfirm || 'void(0)'}">Confirmar</button>
    </div>
  </div>
</div>`,

      'currency-input': `<!-- Input de monto con selector de moneda -->
<div class="currency-input-group">
  <select name="moneda" id="${config.id || 'moneda'}" onchange="updateTipoCambio(this.value)">
    <option value="PEN">S/ PEN</option>
    <option value="USD">$ USD</option>
  </select>
  <input type="number" name="${config.field || 'monto'}" step="0.01" min="0" placeholder="0.00" required>
  <div class="tipo-cambio-row" id="tipo-cambio-row" style="display:none">
    <label>T/C:</label>
    <input type="number" name="tipo_cambio" id="tipo_cambio" step="0.0001" value="1" min="0.0001">
  </div>
</div>
<script>
function updateTipoCambio(moneda) {
  document.getElementById('tipo-cambio-row').style.display = moneda === 'USD' ? 'flex' : 'none';
  if (moneda === 'USD') loadTipoCambio();
}
async function loadTipoCambio() {
  const res = await fetch('/api/tipo-cambio/latest');
  const data = await res.json();
  if (data.valor) document.getElementById('tipo_cambio').value = data.valor;
}
</script>`,

      'alert-badge': `<!-- Badge de alerta por estado -->
<style>
.badge { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
.badge-pendiente { background: #fef3c7; color: #92400e; }
.badge-parcial    { background: #dbeafe; color: #1e40af; }
.badge-pagado, .badge-cobrado { background: #d1fae5; color: #065f46; }
.badge-anulado    { background: #fee2e2; color: #991b1b; }
.badge-activa     { background: #d1fae5; color: #065f46; }
.badge-inactiva   { background: #f3f4f6; color: #374151; }
</style>`
    };

    return { content: [{ type: 'text', text: components[type] || `<!-- Componente ${type} no disponible en este agente -->` }] };
  }

  if (name === 'format_currency') {
    return {
      content: [{
        type: 'text',
        text: `// Utilidades de formato — ERP-PRO
function formatMoney(amount, currency = 'PEN') {
  if (amount == null || isNaN(amount)) return '-';
  const sym = currency === 'USD' ? '$' : 'S/';
  return \`\${sym} \${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPercent(value) {
  return value != null ? \`\${Number(value).toFixed(2)}%\` : '-';
}

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = \`toast toast-\${type}\`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}`
      }]
    };
  }

  throw new Error(`Herramienta no encontrada: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

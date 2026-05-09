/**
 * Perfil.js — Página "Mi perfil" (firma escaneada para rendiciones).
 *
 * Cualquier usuario autenticado puede subir/cambiar/eliminar su firma
 * manuscrita (PNG/JPG, máx 2MB). La firma queda en Cloudinary y se embebe
 * automáticamente en el PDF de rendiciones cuando ese usuario firma un
 * casillero (PREPARADO/REVISADO/AUTORIZADO POR).
 */

import { api } from '../services/api.js';
import { showSuccess, showError } from '../services/ui.js';

export const Perfil = async () => {
  console.log('[Perfil] render iniciado');
  const user = JSON.parse(localStorage.getItem('erp_user') || '{}');
  let firmaUrl = null;
  try {
    const r = await api.auth.getMiFirma();
    firmaUrl = r?.firma_url || null;
    console.log('[Perfil] firma cargada:', firmaUrl ? 'SI' : 'NO');
  } catch (e) {
    console.error('[Perfil] getMiFirma falló:', e);
  }

  setTimeout(() => initHandlers(), 60);
  console.log('[Perfil] HTML armado, retornando');
  return shell(user, firmaUrl);
};

function shell(user, firmaUrl) {
  return `
    <header class="header">
      <div>
        <h1>👤 Mi perfil</h1>
        <span style="color:var(--text-secondary)">Firma manuscrita para rendiciones de gastos.</span>
      </div>
    </header>

    <div class="card" style="margin-top:20px;max-width:680px">
      <h3 style="margin:0 0 4px;font-size:15px">📝 Firma escaneada</h3>
      <p style="margin:0 0 16px;font-size:12px;color:var(--text-secondary)">
        Subí una imagen PNG, JPG o WebP de tu firma manuscrita (máx 2MB). La firma se embebe automáticamente
        en el PDF de la rendición de gastos cuando firmás cualquier casillero (PREPARADO/REVISADO/AUTORIZADO POR).
        Recomendación: foto sobre fondo blanco, recortada, idealmente con fondo transparente (PNG).
      </p>

      <div id="perfil-firma-preview" style="margin-bottom:14px;padding:14px;border:2px dashed #d1d5db;border-radius:8px;text-align:center;background:#fafafa;min-height:120px;display:flex;align-items:center;justify-content:center">
        ${firmaUrl
          ? `<img src="${firmaUrl}" alt="Firma" style="max-width:340px;max-height:120px;object-fit:contain">`
          : `<div style="color:#9ca3af;font-size:13px">Aún no subiste tu firma</div>`}
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" id="perfil-firma-file" accept="image/png,image/jpeg,image/webp" style="font-size:12px">
        <button id="perfil-firma-btn-subir" style="padding:9px 18px;background:#2563eb;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:600;font-size:13px">📤 Subir firma</button>
        ${firmaUrl
          ? `<button id="perfil-firma-btn-eliminar" style="padding:9px 16px;background:transparent;color:#dc2626;border:1px solid #fecaca;border-radius:5px;cursor:pointer;font-size:13px">✕ Eliminar firma</button>`
          : ''}
      </div>

      <div style="margin-top:16px;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;color:#166534">
        💡 <strong>Sugerencia:</strong> escaneá tu firma sobre papel blanco a 300 DPI, después usá una herramienta como
        <a href="https://www.remove.bg" target="_blank" rel="noopener" style="color:#2563eb">remove.bg</a> o Photoshop
        para hacerla transparente. Eso hace que se vea natural arriba de la línea de firma en el PDF.
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">

      <div style="font-size:12px;color:#6b7280">
        <strong style="color:#374151">Sesión:</strong> ${escapeHtmlPerfil(user.nombre || '—')} ·
        ${escapeHtmlPerfil(user.email || '—')} · ${escapeHtmlPerfil(user.rol || '—')}
      </div>
    </div>
  `;
}

function initHandlers() {
  const btnSubir = document.getElementById('perfil-firma-btn-subir');
  const btnEliminar = document.getElementById('perfil-firma-btn-eliminar');
  const fileInput = document.getElementById('perfil-firma-file');

  if (btnSubir) {
    btnSubir.onclick = async () => {
      const file = fileInput?.files?.[0];
      if (!file) {
        showError('Seleccioná un archivo (PNG/JPG/WebP)');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showError('El archivo no puede exceder 2MB');
        return;
      }
      btnSubir.disabled = true;
      const oldTxt = btnSubir.textContent;
      btnSubir.textContent = '⏳ Subiendo…';
      try {
        await api.auth.subirMiFirma(file);
        showSuccess('Firma actualizada — refrescá una rendición tuya y descargá el PDF para ver el resultado');
        // Re-render
        const r = await api.auth.getMiFirma();
        const preview = document.getElementById('perfil-firma-preview');
        if (preview && r?.firma_url) {
          preview.innerHTML = `<img src="${r.firma_url}" alt="Firma" style="max-width:340px;max-height:120px;object-fit:contain">`;
        }
        // Si no había botón eliminar antes, re-render completo de la página
        if (!btnEliminar) {
          const main = document.querySelector('main');
          if (main) main.innerHTML = await Perfil();
        }
      } catch (e) {
        showError(e.message || 'Error al subir firma');
      } finally {
        btnSubir.disabled = false;
        btnSubir.textContent = oldTxt;
      }
    };
  }

  if (btnEliminar) {
    btnEliminar.onclick = async () => {
      if (!confirm('¿Eliminar tu firma? La imagen anterior queda huérfana en Cloudinary. Podés subir una nueva en cualquier momento.')) return;
      try {
        await api.auth.eliminarMiFirma();
        showSuccess('Firma eliminada');
        const main = document.querySelector('main');
        if (main) main.innerHTML = await Perfil();
      } catch (e) {
        showError(e.message || 'Error al eliminar firma');
      }
    };
  }
}

function escapeHtmlPerfil(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

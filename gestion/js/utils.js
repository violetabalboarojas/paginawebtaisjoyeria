/* =====================================================================
   utils.js — Utilidades generales (formato, DOM, modal, avisos)
   Todo cuelga del espacio de nombres global `TAIS` para que la app funcione
   abriendo index.html directamente (file://), donde los módulos ES no cargan.
   ===================================================================== */
window.TAIS = window.TAIS || {};

(function (T) {
  'use strict';

  const U = {};

  /* ---------------- Catálogos (listas fijas de opciones) ----------------
     Si en la v2 se vuelven configurables, pasarían a una tabla en la BD. */
  U.CAT = {
    categoriasProducto: ['Collar', 'Pulsera', 'Anillo', 'Box', 'Dije', 'Otro'],
    personalizacion: ['Nombre', 'Fecha', 'Frase', 'Coordenadas', 'Huella', 'Iniciales', 'Piedra natural', 'Sin grabado', 'Otro'],
    ocasiones: ['Cumpleaños', 'Aniversario', 'San Valentín', 'Día de la Madre', 'Boda', 'Baby shower', 'Graduación', 'Navidad', 'Todo uso'],
    estadosProducto: { activo: 'Activo', desarrollo: 'En desarrollo', descontinuado: 'Descontinuado' },
    metodosPago: ['Efectivo', 'Yape', 'Plin', 'Transferencia', 'Tarjeta'],
    canales: ['Instagram', 'WhatsApp', 'Feria', 'Tienda'],
    estadosVenta: { pendiente: 'Pendiente', produccion: 'En producción', listo: 'Listo', entregado: 'Entregado' },
    categoriasInsumo: ['Metales', 'Piedras', 'Cadenas', 'Cajas y empaques', 'Papelería', 'Acrílico/madera', 'Otros'],
    unidades: ['unidad', 'metro', 'cm', 'gramo', 'plancha', 'rollo', 'pliego', 'par', 'paquete'],
    etapasIdea: { idea: 'Idea', prototipo: 'Prototipo', prueba: 'Prueba', listo: 'Listo para vender' },
    prioridades: { alta: 'Alta', media: 'Media', baja: 'Baja' },
    categoriasTarea: ['Producción', 'Compras', 'Diseño', 'Marketing', 'Entrega'],
  };

  /* ---------------- Identificadores ---------------- */
  U.uid = (prefijo = 'id') =>
    `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  /* ---------------- Números y moneda (soles) ---------------- */
  U.num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  U.redondear = (n, d = 2) => Math.round((U.num(n) + Number.EPSILON) * 10 ** d) / 10 ** d;
  U.soles = (n) =>
    'S/ ' + U.num(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  U.cantidad = (n) => U.num(n).toLocaleString('es-PE', { maximumFractionDigits: 2 });
  U.pct = (n) => U.num(n).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + '%';

  /* ---------------- Fechas ----------------
     Se guardan como texto ISO 'aaaa-mm-dd' (fácil de ordenar y de migrar a BD)
     y se muestran como dd/mm/aaaa. */
  U.iso = (d) => {
    const x = d instanceof Date ? d : new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  U.hoy = () => U.iso(new Date());
  U.fecha = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : '—';
  };
  U.sumarDias = (iso, dias) => {
    const [y, m, d] = iso.split('-').map(Number);
    return U.iso(new Date(y, m - 1, d + dias));
  };
  U.inicioMes = (iso = U.hoy()) => iso.slice(0, 8) + '01';
  U.finMes = (iso = U.hoy()) => {
    const [y, m] = iso.split('-').map(Number);
    return U.iso(new Date(y, m, 0));
  };
  U.mesClave = (iso) => String(iso).slice(0, 7); // 'aaaa-mm'
  U.MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  U.mesNombre = (clave) => {
    const [y, m] = clave.split('-');
    return `${U.MESES[Number(m) - 1]} ${y.slice(2)}`;
  };
  /** Lista de claves 'aaaa-mm' de los últimos n meses (incluye el actual). */
  U.ultimosMeses = (n) => {
    const out = [];
    const h = new Date();
    for (let i = n - 1; i >= 0; i--) out.push(U.iso(new Date(h.getFullYear(), h.getMonth() - i, 1)).slice(0, 7));
    return out;
  };
  U.enRango = (iso, desde, hasta) => (!desde || iso >= desde) && (!hasta || iso <= hasta);

  /* ---------------- Texto / HTML ---------------- */
  U.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  U.coincide = (texto, busqueda) => !busqueda || U.normalizar(texto).includes(U.normalizar(busqueda));

  /** Genera <option>. `lista` puede ser array de textos o un objeto {valor: etiqueta}. */
  U.opciones = (lista, seleccionado, { vacio } = {}) => {
    const pares = Array.isArray(lista) ? lista.map((v) => [v, v]) : Object.entries(lista);
    let html = vacio !== undefined ? `<option value="">${U.esc(vacio)}</option>` : '';
    html += pares
      .map(([v, t]) => `<option value="${U.esc(v)}"${String(v) === String(seleccionado ?? '') ? ' selected' : ''}>${U.esc(t)}</option>`)
      .join('');
    return html;
  };

  /* ---------------- DOM ---------------- */
  U.$ = (sel, raiz = document) => raiz.querySelector(sel);
  U.$$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
  U.debounce = (fn, ms = 200) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  /** Lee un formulario como objeto plano { name: value }. */
  U.leerForm = (form) => {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    return o;
  };

  /**
   * Descarga un archivo generado en el navegador. Devuelve Promise<boolean> (true = guardado).
   * Publicada como Artifact en claude.ai, usa la capacidad "downloads" (el visor pide
   * confirmación); abierta como archivo local, usa un enlace de descarga normal.
   */
  U.descargar = async (nombre, contenido, tipo = 'application/json') => {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try {
        await dl.save({ filename: nombre, data: blob });
        return true;
      } catch (err) {
        if (err && err.code === 'declined') return false;
        if (err && err.code === 'rate_limited') { U.toast('Ya hay una descarga esperando confirmación.', 'warn'); return false; }
        U.toast('No se pudo descargar el archivo en esta vista.', 'bad');
        return false;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  };

  /* ---------------- Avisos (toasts) ---------------- */
  U.toast = (msg, tipo = '') => {
    const cont = document.getElementById('toasts');
    if (!cont) return;
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.textContent = msg;
    cont.appendChild(el);
    while (cont.children.length > 3) cont.firstElementChild.remove(); // máximo 3 a la vez
    setTimeout(() => el.remove(), 3200);
  };

  /* ---------------- Modal ---------------- */
  const modal = {
    abrir({ titulo, html, tam = '', alAbrir } = {}) {
      const m = document.getElementById('modal');
      document.getElementById('modal-title').textContent = titulo || '';
      document.getElementById('modal-body').innerHTML = html || '';
      document.getElementById('modal-card').className = `modal-card ${tam}`;
      m.hidden = false;
      document.body.style.overflow = 'hidden';
      if (alAbrir) alAbrir(document.getElementById('modal-body'));
      const primero = m.querySelector('input:not([type=hidden]), select, textarea, button.btn');
      if (primero && window.matchMedia('(min-width: 768px)').matches) primero.focus();
    },
    cerrar() {
      document.getElementById('modal').hidden = true;
      document.getElementById('modal-body').innerHTML = '';
      document.body.style.overflow = '';
      if (modal._resolver) { modal._resolver(false); modal._resolver = null; }
      if (modal.alCerrar) modal.alCerrar();
    },
    get cuerpo() { return document.getElementById('modal-body'); },
  };
  U.modal = modal;

  /** Confirmación con modal propio. Devuelve Promise<boolean>. */
  U.confirmar = (mensaje, { titulo = '¿Estás segura?', ok = 'Sí, continuar', peligro = true } = {}) =>
    new Promise((resolve) => {
      modal.abrir({
        titulo,
        tam: 'sm',
        html: `<p>${mensaje}</p>
          <div class="form-acciones">
            <button type="button" class="btn btn-secundario" data-r="no">Cancelar</button>
            <button type="button" class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-r="si">${U.esc(ok)}</button>
          </div>`,
      });
      modal._resolver = resolve;
      modal.cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        const r = b.dataset.r === 'si';
        modal._resolver = null;
        modal.cerrar();
        resolve(r);
      });
    });

  /** Valida un form con las reglas HTML5 + validaciones extra. */
  U.validar = (form, extras = []) => {
    U.$$('input, select, textarea', form).forEach((el) => el.setCustomValidity(''));
    for (const [el, cond, msg] of extras) if (el && !cond) el.setCustomValidity(msg);
    if (!form.checkValidity()) { form.reportValidity(); return false; }
    return true;
  };

  /* ---------------- Badges de estado ---------------- */
  U.badgeEstadoVenta = (e) => {
    const cls = { pendiente: 'warn', produccion: '', listo: 'oro', entregado: 'ok' }[e] ?? 'gris';
    return `<span class="badge ${cls}">${U.esc(U.CAT.estadosVenta[e] || e)}</span>`;
  };
  U.badgeEstadoProducto = (e) => {
    const cls = { activo: 'ok', desarrollo: 'oro', descontinuado: 'gris' }[e] ?? 'gris';
    return `<span class="badge ${cls}">${U.esc(U.CAT.estadosProducto[e] || e)}</span>`;
  };
  U.badgePrioridad = (p) => {
    const cls = { alta: 'bad', media: 'warn', baja: 'gris' }[p] ?? 'gris';
    return `<span class="badge ${cls}">● ${U.esc(U.CAT.prioridades[p] || p)}</span>`;
  };

  U.vacio = (msg) => `<div class="vacio"><span class="orb">✦</span>${msg}</div>`;

  T.U = U;
})(window.TAIS);

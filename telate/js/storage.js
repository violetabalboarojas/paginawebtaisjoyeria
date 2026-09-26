/* Telate · storage.js
   Persistencia en localStorage, utilidades comunes y datos de ejemplo. */
'use strict';

/* ---------- Utilidades comunes (fechas, formatos, ids) ---------- */
const Util = {
  pad: (n) => String(n).padStart(2, '0'),
  /** Fecha local en formato YYYY-MM-DD (sin desfase UTC). */
  fechaISO(d = new Date()) {
    return `${d.getFullYear()}-${Util.pad(d.getMonth() + 1)}-${Util.pad(d.getDate())}`;
  },
  hoy() { return Util.fechaISO(); },
  sumarDias(iso, dias) {
    const [y, m, d] = iso.split('-').map(Number);
    return Util.fechaISO(new Date(y, m - 1, d + dias));
  },
  primerDiaMes(iso = Util.hoy()) { return iso.slice(0, 8) + '01'; },
  fechaLegible(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },
  MESES: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'],
  mesLegible(ym) {
    const [y, m] = ym.split('-');
    return `${Util.MESES[Number(m) - 1]} ${y}`;
  },
  textoRango(desde, hasta) {
    if (!desde && !hasta) return 'Todo el historial';
    return `${desde ? 'Del ' + Util.fechaLegible(desde) : 'Desde el inicio'} ${hasta ? 'al ' + Util.fechaLegible(hasta) : 'hasta hoy'}`;
  },
  r2: (n) => Math.round((Number(n) || 0) * 100) / 100,
  r4: (n) => Math.round((Number(n) || 0) * 10000) / 10000,
  soles: (n) => 'S/ ' + (Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  num: (n, dec = 2) => (Number(n) || 0).toLocaleString('es-PE', { maximumFractionDigits: dec }),
  pct: (n) => ((Number(n) || 0) * 100).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%',
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  /** Capacidad del visor de Artifacts (db, downloads…) o null fuera de él. */
  capacidad(nombre) {
    Util._caps = Util._caps || {};
    if (!(nombre in Util._caps)) {
      const use = typeof window !== 'undefined' && window.claude && window.claude.use;
      Util._caps[nombre] = use ? Promise.resolve(window.claude.use(nombre)).catch(() => null) : Promise.resolve(null);
    }
    return Util._caps[nombre];
  },
  /** Ofrece un archivo al usuario. Devuelve 'ok', 'cancelado' o un mensaje de error. */
  async guardarArchivo(nombre, datos, tipo) {
    const blob = datos instanceof Blob ? datos : new Blob([datos], { type: tipo });
    const dl = await Util.capacidad('downloads');
    if (dl) {
      try { await dl.save({ filename: nombre, data: blob }); return 'ok'; }
      catch (e) { return e && e.code === 'declined' ? 'cancelado' : `No se pudo descargar (${(e && e.message) || 'error'}).`; }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'ok';
  },
  uid: (p = 'id') => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
};

/* ---------- Persistencia ---------- */
const Storage = (() => {
  const PREFIX = 'telate_v1_';
  const DEFAULTS = {
    productos: [], // {id, nombre, categoria, presentacion, precio, activo, creado}
    insumos: [],   // {id, nombre, unidad, stock, minimo, costo, proveedor}
    recetas: {},   // {[productoId]: [{insumoId, cantidad}]}
    ventas: [],    // {id, fecha, canal, pago, items:[...], total, consumo:[{insumoId, cantidad}], creado}
    compras: [],   // {id, fecha, insumoId, cantidad, costoTotal, nota, creado}
    mezclas: [],   // {id, nombre, estado, teBaseId, teBaseCantidad, componentes:[...], notas, rendimiento, presentacion, precio, productoId}
    tareas: [],    // {id, titulo, descripcion, area, responsable, prioridad, fechaLimite, estado, creado}
  };
  const COLECCIONES = Object.keys(DEFAULTS);
  const cache = {};
  let onError = null;

  let disponible = true;
  try {
    localStorage.setItem(PREFIX + '__prueba', '1');
    localStorage.removeItem(PREFIX + '__prueba');
  } catch (e) {
    disponible = false;
  }

  const clonar = (v) => JSON.parse(JSON.stringify(v));

  /** Devuelve la colección (referencia viva en caché). Tras modificarla, llamar a set(). */
  function get(col) {
    if (!(col in DEFAULTS)) throw new Error(`Colección desconocida: ${col}`);
    if (col in cache) return cache[col];
    let valor = clonar(DEFAULTS[col]);
    try {
      const raw = localStorage.getItem(PREFIX + col);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) === Array.isArray(valor)) valor = parsed;
      }
    } catch (e) {
      console.warn('No se pudo leer', col, e);
    }
    cache[col] = valor;
    return valor;
  }

  function set(col, valor) {
    cache[col] = valor;
    if (remoto) encolarRemoto(col, valor);
    try {
      localStorage.setItem(PREFIX + col, JSON.stringify(valor));
      return true;
    } catch (e) {
      console.warn('No se pudo guardar', col, e);
      if (onError && !remoto) onError(e);
      return false;
    }
  }

  /* ---------- Base de datos compartida (cuando corre como Artifact) ----------
     telate/<coleccion> → { valor }   ·   ventas_mes/<AAAA-MM-pNN> → { items }
     La caché en memoria es la fuente para la interfaz; las escrituras se
     encolan y se envían de a una por documento. */
  let remoto = null;
  let onRemoto = null;
  const pendientes = new Map(); // ruta → cuerpo (null = borrar)
  const enVuelo = new Set();
  let ultimoMes = {};           // mes → JSON de sus ventas ya sincronizadas
  let escribiendo = false;
  const COLS_DOC = COLECCIONES.filter((c) => c !== 'ventas');

  function espejoLocal(col, valor) {
    try { localStorage.setItem(PREFIX + col, JSON.stringify(valor)); } catch (e) { /* opcional */ }
  }

  /** Agrupa ventas por mes en partes de ≤ 200 KB (límite por documento: 256 KB). */
  function agruparVentas(ventas) {
    const meses = {};
    ventas.forEach((v) => { const m = String(v.fecha).slice(0, 7); (meses[m] = meses[m] || []).push(v); });
    const partes = {};
    Object.entries(meses).forEach(([m, lista]) => {
      let parte = [], bytes = 0, n = 0;
      lista.forEach((v) => {
        const tam = JSON.stringify(v).length + 1;
        if (parte.length && bytes + tam > 200000) { partes[`${m}-p${String(n++).padStart(2, '0')}`] = parte; parte = []; bytes = 0; }
        parte.push(v); bytes += tam;
      });
      partes[`${m}-p${String(n).padStart(2, '0')}`] = parte;
    });
    return partes;
  }

  function encolarRemoto(col, valor) {
    if (col === 'ventas') {
      const meses = agruparVentas(valor);
      new Set([...Object.keys(meses), ...Object.keys(ultimoMes)]).forEach((m) => {
        const items = meses[m] || [];
        const json = JSON.stringify(items);
        if (ultimoMes[m] === json) return;
        if (items.length) ultimoMes[m] = json; else delete ultimoMes[m];
        pendientes.set(`ventas_mes/${m}`, items.length ? { items } : null);
      });
    } else {
      pendientes.set(`telate/${col}`, { valor });
    }
    procesarCola();
  }

  async function procesarCola() {
    if (escribiendo) return;
    escribiendo = true;
    try {
      while (pendientes.size) {
        const [ruta, cuerpo] = pendientes.entries().next().value;
        pendientes.delete(ruta);
        enVuelo.add(ruta);
        const escribir = () => (cuerpo ? remoto.doc(ruta).set(cuerpo) : remoto.doc(ruta).delete());
        try {
          await escribir();
        } catch (e) {
          if (e && e.code === 'unavailable') {
            await new Promise((r) => setTimeout(r, 800 + Math.random() * 800));
            try { await escribir(); } catch (e2) { if (onError) onError(e2); }
          } else if (onError) {
            onError(e);
          }
        } finally {
          enVuelo.delete(ruta);
        }
      }
    } finally {
      escribiendo = false;
    }
  }

  const ocupado = (ruta) => pendientes.has(ruta) || enVuelo.has(ruta);

  function escuchar() {
    COLS_DOC.forEach((c) => {
      const ruta = `telate/${c}`;
      remoto.doc(ruta).onSnapshot((snap) => {
        if (snap.metadata.hasPendingWrites || ocupado(ruta)) return;
        const nuevo = snap.exists ? (snap.data().valor ?? DEFAULTS[c]) : DEFAULTS[c];
        if (JSON.stringify(nuevo) === JSON.stringify(cache[c])) return;
        cache[c] = clonar(nuevo);
        espejoLocal(c, cache[c]);
        if (onRemoto) onRemoto();
      }, (e) => console.warn('Sincronización detenida', ruta, e));
    });
    remoto.collection('ventas_mes').onSnapshot((q) => {
      if (q.metadata.hasPendingWrites || [...pendientes.keys(), ...enVuelo].some((r) => r.startsWith('ventas_mes/'))) return;
      const nuevos = {};
      q.docs.forEach((d) => { nuevos[d.id] = JSON.stringify(d.data().items || []); });
      const claves = new Set([...Object.keys(nuevos), ...Object.keys(ultimoMes)]);
      if ([...claves].every((k) => nuevos[k] === ultimoMes[k])) return;
      ultimoMes = nuevos;
      cache.ventas = Object.keys(nuevos).sort().flatMap((k) => JSON.parse(nuevos[k]));
      espejoLocal('ventas', cache.ventas);
      if (onRemoto) onRemoto();
    }, (e) => console.warn('Sincronización de ventas detenida', e));
  }

  /** Conecta con la base compartida si el visor la ofrece.
      Devuelve { remoto: bool, vacia: bool }. */
  async function conectar() {
    const db = await Util.capacidad('db');
    if (!db) return { remoto: false, vacia: false };
    try {
      const [snaps, meses, meta] = await Promise.all([
        Promise.all(COLS_DOC.map((c) => db.doc(`telate/${c}`).get())),
        db.collection('ventas_mes').get(),
        db.doc('telate/meta').get(),
      ]);
      const hayDatos = meta.exists || snaps.some((s) => s.exists) || !meses.empty;
      remoto = db;
      if (hayDatos) {
        COLS_DOC.forEach((c, i) => { cache[c] = clonar(snaps[i].exists ? (snaps[i].data().valor ?? DEFAULTS[c]) : DEFAULTS[c]); });
        ultimoMes = {};
        meses.docs.forEach((d) => { ultimoMes[d.id] = JSON.stringify(d.data().items || []); });
        cache.ventas = Object.keys(ultimoMes).sort().flatMap((k) => JSON.parse(ultimoMes[k]));
        COLECCIONES.forEach((c) => espejoLocal(c, cache[c]));
      } else {
        COLECCIONES.forEach((c) => { cache[c] = clonar(DEFAULTS[c]); });
        ultimoMes = {};
      }
      escuchar();
      return { remoto: true, vacia: !hayDatos };
    } catch (e) {
      console.warn('Base compartida no disponible; se usa este navegador.', e);
      remoto = null;
      return { remoto: false, vacia: false };
    }
  }

  function marcarInicializado() {
    if (remoto) {
      pendientes.set('telate/meta', { inicializado: true, fecha: new Date().toISOString() });
      procesarCola();
    }
  }

  function pref(clave, valor) {
    const k = PREFIX + 'pref_' + clave;
    try {
      if (valor === undefined) return JSON.parse(localStorage.getItem(k));
      localStorage.setItem(k, JSON.stringify(valor));
    } catch (e) { /* preferencia opcional */ }
    return valor ?? null;
  }

  function backup() {
    const datos = {};
    COLECCIONES.forEach((c) => { datos[c] = get(c); });
    return { app: 'Telate', version: 1, exportado: new Date().toISOString(), datos };
  }

  /** Valida y reemplaza todos los datos. Devuelve un mensaje de error o null. */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || !obj.datos || typeof obj.datos !== 'object') {
      return 'El archivo no es un respaldo válido de Telate.';
    }
    for (const c of COLECCIONES) {
      const v = obj.datos[c];
      if (v === undefined) continue;
      if (Array.isArray(DEFAULTS[c]) ? !Array.isArray(v) : (typeof v !== 'object' || Array.isArray(v))) {
        return `El respaldo tiene un formato incorrecto en «${c}».`;
      }
    }
    COLECCIONES.forEach((c) => set(c, obj.datos[c] ?? clonar(DEFAULTS[c])));
    return null;
  }

  function borrarTodo() {
    COLECCIONES.forEach((c) => set(c, clonar(DEFAULTS[c])));
  }

  function cargarEjemplo() {
    const d = generarEjemplo();
    COLECCIONES.forEach((c) => set(c, d[c]));
  }

  function bytesUsados() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(PREFIX)) total += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
    } catch (e) { /* sin acceso */ }
    return total;
  }

  return {
    get, set, pref, backup, restore, borrarTodo, cargarEjemplo, bytesUsados, COLECCIONES, conectar, marcarInicializado,
    get disponible() { return disponible; },
    get remoto() { return !!remoto; },
    get sincronizando() { return pendientes.size + enVuelo.size > 0; },
    set onError(fn) { onError = fn; },
    set onRemoto(fn) { onRemoto = fn; },
  };
})();

/* ---------- Datos de ejemplo ---------- */
function generarEjemplo() {
  const hoy = Util.hoy();
  const ahora = new Date().toISOString();

  const insumos = [
    ['i-harina', 'Harina sin preparar', 'kg', 12, 5, 4.5, 'Mercado mayorista'],
    ['i-cacao', 'Cacao en polvo', 'g', 1500, 500, 0.06, 'Distribuidora de cacao'],
    ['i-chocolate', 'Chocolate bitter 70%', 'g', 2000, 1000, 0.045, 'Distribuidora de cacao'],
    ['i-cerveza', 'Cerveza negra', 'ml', 3000, 2000, 0.012, 'Bodega del barrio'],
    ['i-huevos', 'Huevos', 'unidad', 60, 30, 0.6, 'Mercado mayorista'],
    ['i-azucar', 'Azúcar rubia', 'kg', 10, 4, 4.2, 'Mercado mayorista'],
    ['i-mantequilla', 'Mantequilla', 'g', 2500, 1000, 0.035, 'Mercado mayorista'],
    ['i-te-negro', 'Hojas de té negro', 'g', 800, 500, 0.12, 'Importadora de tés'],
    ['i-te-verde', 'Hojas de té verde', 'g', 300, 500, 0.15, 'Importadora de tés'],
    ['i-hierbas', 'Mezcla de hierbas (hibisco y manzanilla)', 'g', 400, 200, 0.09, 'Importadora de tés'],
    ['i-manzana', 'Manzana deshidratada', 'g', 600, 300, 0.08, 'Frutos secos del valle'],
    ['i-durazno', 'Durazno deshidratado', 'g', 200, 300, 0.09, 'Frutos secos del valle'],
    ['i-frutos-rojos', 'Frutos rojos deshidratados', 'g', 350, 200, 0.14, 'Frutos secos del valle'],
    ['i-canela', 'Canela en rama', 'g', 250, 100, 0.1, 'Mercado mayorista'],
    ['i-bolsa', 'Empaque: bolsa kraft 50 g', 'unidad', 80, 50, 0.5, 'Empaques y más'],
    ['i-caja', 'Empaque: caja para torta', 'unidad', 15, 10, 2.5, 'Empaques y más'],
    ['i-etiqueta', 'Etiquetas', 'unidad', 40, 50, 0.15, 'Imprenta'],
  ].map(([id, nombre, unidad, stock, minimo, costo, proveedor]) => ({ id, nombre, unidad, stock, minimo, costo, proveedor }));

  const productos = [
    ['p-choc-por', 'Torta de chocolate húmeda', 'Torta', 'Porción', 9],
    ['p-choc-ent', 'Torta de chocolate húmeda', 'Torta', 'Torta entera', 75],
    ['p-cerv-por', 'Torta de cerveza negra', 'Torta', 'Porción', 10],
    ['p-cerv-ent', 'Torta de cerveza negra', 'Torta', 'Torta entera', 85],
    ['p-te-manz', 'Té negro con manzana y canela', 'Té', 'Bolsa 50 g', 18],
    ['p-te-manz-taza', 'Té negro con manzana y canela', 'Té', 'Taza', 7],
    ['p-te-dur', 'Té verde con durazno', 'Té', 'Bolsa 50 g', 20],
    ['p-te-roj', 'Infusión de hierbas con frutos rojos', 'Té', 'Bolsa 50 g', 19],
  ].map(([id, nombre, categoria, presentacion, precio]) => ({ id, nombre, categoria, presentacion, precio, activo: true, creado: ahora }));

  const L = (arr) => arr.map(([insumoId, cantidad]) => ({ insumoId, cantidad }));
  const porcion = (arr) => arr.map(([i, c]) => [i, Util.r4(c / 10)]);
  const tortaChoc = [['i-harina', 0.3], ['i-cacao', 80], ['i-chocolate', 150], ['i-huevos', 4], ['i-azucar', 0.3], ['i-mantequilla', 200]];
  const tortaCerv = [['i-harina', 0.3], ['i-cacao', 60], ['i-cerveza', 350], ['i-chocolate', 100], ['i-huevos', 3], ['i-azucar', 0.28], ['i-mantequilla', 220]];
  const recetas = {
    'p-choc-por': L(porcion(tortaChoc)),
    'p-choc-ent': L([...tortaChoc, ['i-caja', 1], ['i-etiqueta', 1]]),
    'p-cerv-por': L(porcion(tortaCerv)),
    'p-cerv-ent': L([...tortaCerv, ['i-caja', 1], ['i-etiqueta', 1]]),
    'p-te-manz': L([['i-te-negro', 35], ['i-manzana', 10], ['i-canela', 5], ['i-bolsa', 1], ['i-etiqueta', 1]]),
    'p-te-manz-taza': L([['i-te-negro', 3], ['i-manzana', 1], ['i-canela', 0.5]]),
    'p-te-dur': L([['i-te-verde', 38], ['i-durazno', 12], ['i-bolsa', 1], ['i-etiqueta', 1]]),
    'p-te-roj': L([['i-hierbas', 32], ['i-frutos-rojos', 18], ['i-bolsa', 1], ['i-etiqueta', 1]]),
  };

  // Generador pseudoaleatorio con semilla: los ejemplos son siempre parecidos.
  let semilla = 20260926;
  const rnd = () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const elegir = (pares) => {
    const total = pares.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [v, w] of pares) { if ((r -= w) <= 0) return v; }
    return pares[pares.length - 1][0];
  };
  const pesosProductos = [['p-choc-por', 30], ['p-cerv-por', 22], ['p-te-manz-taza', 18], ['p-te-manz', 10], ['p-te-dur', 7], ['p-te-roj', 8], ['p-choc-ent', 4], ['p-cerv-ent', 3]];
  const canales = [['Local', 55], ['Delivery', 25], ['Redes sociales', 20]];
  const pagos = [['Efectivo', 25], ['Yape', 40], ['Plin', 15], ['Tarjeta', 15], ['Transferencia', 5]];
  const porId = Object.fromEntries(productos.map((p) => [p.id, p]));

  const ventas = [];
  let n = 0;
  for (let d = 44; d >= 0; d--) {
    const fecha = Util.sumarDias(hoy, -d);
    const dow = new Date(fecha + 'T12:00:00').getDay();
    const cantVentas = 2 + Math.floor(rnd() * 4) + (dow === 0 || dow === 6 ? 2 : 0);
    for (let k = 0; k < cantVentas; k++) {
      const items = [];
      const nItems = rnd() < 0.3 ? 2 : 1;
      for (let j = 0; j < nItems; j++) {
        const pid = elegir(pesosProductos);
        if (items.some((it) => it.productoId === pid)) continue;
        const p = porId[pid];
        const cantidad = p.presentacion === 'Torta entera' ? 1 : 1 + Math.floor(rnd() * (p.presentacion === 'Porción' ? 3 : 2));
        items.push({ productoId: pid, nombre: p.nombre, presentacion: p.presentacion, categoria: p.categoria, cantidad, precio: p.precio, subtotal: Util.r2(p.precio * cantidad) });
      }
      const consumoMap = {};
      items.forEach((it) => recetas[it.productoId].forEach((l) => {
        consumoMap[l.insumoId] = (consumoMap[l.insumoId] || 0) + l.cantidad * it.cantidad;
      }));
      ventas.push({
        id: `v-ej-${++n}`,
        fecha,
        canal: elegir(canales),
        pago: elegir(pagos),
        items,
        total: Util.r2(items.reduce((s, it) => s + it.subtotal, 0)),
        consumo: Object.entries(consumoMap).map(([insumoId, cantidad]) => ({ insumoId, cantidad: Util.r4(cantidad) })),
        creado: ahora,
      });
    }
  }

  const compras = [
    { id: 'c-ej-1', fecha: Util.sumarDias(hoy, -20), insumoId: 'i-chocolate', cantidad: 2000, costoTotal: 90, nota: 'Compra quincenal', creado: ahora },
    { id: 'c-ej-2', fecha: Util.sumarDias(hoy, -10), insumoId: 'i-harina', cantidad: 10, costoTotal: 45, nota: '', creado: ahora },
    { id: 'c-ej-3', fecha: Util.sumarDias(hoy, -3), insumoId: 'i-te-negro', cantidad: 500, costoTotal: 60, nota: '', creado: ahora },
  ];

  const mezclas = [
    {
      id: 'm-ej-1', nombre: 'Chai de la casa', estado: 'en prueba', teBaseId: 'i-te-negro', teBaseCantidad: 400,
      componentes: [{ insumoId: 'i-canela', cantidad: 60 }, { insumoId: 'i-manzana', cantidad: 40 }],
      notas: 'Especiado, dulce y cálido. Probar agregando jengibre.', rendimiento: 10, presentacion: 'Bolsa 50 g', precio: 19, productoId: null, creado: ahora,
    },
    {
      id: 'm-ej-2', nombre: 'Verde tropical', estado: 'idea', teBaseId: 'i-te-verde', teBaseCantidad: 250,
      componentes: [{ insumoId: 'i-durazno', cantidad: 250 }],
      notas: 'Fresco y frutal, ideal para servir frío.', rendimiento: 10, presentacion: 'Bolsa 50 g', precio: 21, productoId: null, creado: ahora,
    },
    {
      id: 'm-ej-3', nombre: 'Infusión relajante de frutos rojos', estado: 'aprobado', teBaseId: 'i-hierbas', teBaseCantidad: 330,
      componentes: [{ insumoId: 'i-frutos-rojos', cantidad: 150 }, { insumoId: 'i-canela', cantidad: 20 }],
      notas: 'Ácida y floral, sin cafeína. Gustó en la cata.', rendimiento: 10, presentacion: 'Bolsa 50 g', precio: 20, productoId: null, creado: ahora,
    },
  ];

  const tareas = [
    ['Comprar hojas de té verde', 'El stock está por debajo del mínimo.', 'Compras', 'Ana', 'alta', 1, 'pendiente'],
    ['Hornear 3 tortas de chocolate para el fin de semana', '', 'Producción', 'Luis', 'alta', 2, 'en proceso'],
    ['Probar el chai con jengibre', 'Hacer 2 versiones y comparar.', 'Desarrollo de tés', 'Ana', 'media', 5, 'pendiente'],
    ['Publicar promo de torta de cerveza negra', 'Post + historias en Instagram.', 'Ventas', 'María', 'media', -2, 'pendiente'],
    ['Limpieza profunda del horno', '', 'Limpieza', 'Luis', 'baja', -1, 'hecha'],
    ['Actualizar el diseño de las etiquetas', '', 'Otro', 'María', 'baja', 10, 'pendiente'],
  ].map(([titulo, descripcion, area, responsable, prioridad, dias, estado], i) => ({
    id: `t-ej-${i + 1}`, titulo, descripcion, area, responsable, prioridad, fechaLimite: Util.sumarDias(hoy, dias), estado, creado: ahora,
  }));

  return { productos, insumos, recetas, ventas, compras, mezclas, tareas };
}

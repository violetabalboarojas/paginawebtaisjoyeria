/* =====================================================================
   store.js — Capa de datos (persistencia en localStorage)

   Es el ÚNICO archivo que sabe dónde se guardan los datos. Para la v2 con
   base de datos, basta con reemplazar estas funciones por llamadas a una
   API (fetch) manteniendo la misma interfaz: listar / obtener / crear /
   actualizar / eliminar. El resto de la app no debería cambiar.

   Modelo de datos (colecciones):
   - productos: { id, nombre, categoria, material, personalizacion, ocasion,
                  costo, precio, estado, descripcion, receta:[{insumoId, cantidad}], creado }
   - insumos:   { id, nombre, categoria, unidad, stock, stockMin, costo, proveedor, creado }
   - compras:   { id, fecha, insumoId, cantidad, costoUnit, proveedor, nota, creado }
   - ventas:    { id, numero, fecha, cliente, telefono, items:[{productoId, nombre, cantidad, precio}],
                  descuento, subtotal, total, metodoPago, canal, ocasion, grabado,
                  fechaEntrega, estado, notas, consumo:[{insumoId, cantidad}], creado }
   - ideas:     { id, nombre, descripcion, etapa, receta:[{insumoId, cantidad}], insumosTexto,
                  costoEst, precioSug, notas, fecha, productoId, creado }
   - tareas:    { id, titulo, descripcion, responsable, prioridad, fechaLimite,
                  categoria, completada, completadaEl, creado }
   ===================================================================== */
(function (T) {
  'use strict';

  const CLAVE = 'tais_gestion_v1';
  const VERSION = 1;
  const COLECCIONES = ['productos', 'insumos', 'compras', 'ventas', 'ideas', 'tareas'];

  const vacia = () => {
    const db = { version: VERSION, meta: { creado: new Date().toISOString(), ultimoNumeroVenta: 0 } };
    COLECCIONES.forEach((c) => (db[c] = []));
    return db;
  };

  /** Normaliza un objeto cargado (por si le faltan colecciones). */
  const normalizar = (data) => {
    const db = vacia();
    if (!data || typeof data !== 'object') return db;
    COLECCIONES.forEach((c) => { if (Array.isArray(data[c])) db[c] = data[c]; });
    db.meta = Object.assign(db.meta, data.meta || {});
    return db;
  };

  let db;
  try {
    db = normalizar(JSON.parse(localStorage.getItem(CLAVE)));
  } catch (e) {
    console.warn('No se pudo leer localStorage, se inicia vacío.', e);
    db = vacia();
  }

  const oyentes = new Set();

  const Store = {
    COLECCIONES,

    /** Guarda en localStorage y avisa a los oyentes (para refrescar vistas). */
    guardar() {
      try {
        localStorage.setItem(CLAVE, JSON.stringify(db));
      } catch (e) {
        T.U.toast('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado.', 'bad');
        console.error(e);
      }
      oyentes.forEach((fn) => fn());
    },
    alCambiar(fn) { oyentes.add(fn); },

    /* ---------- CRUD genérico ---------- */
    listar(col) { return db[col]; },
    obtener(col, id) { return db[col].find((x) => x.id === id) || null; },
    crear(col, obj, { guardar = true } = {}) {
      const nuevo = Object.assign({ id: T.U.uid(col.slice(0, 3)), creado: new Date().toISOString() }, obj);
      db[col].push(nuevo);
      if (guardar) this.guardar();
      return nuevo;
    },
    actualizar(col, id, cambios, { guardar = true } = {}) {
      const item = this.obtener(col, id);
      if (!item) return null;
      Object.assign(item, cambios, { actualizado: new Date().toISOString() });
      if (guardar) this.guardar();
      return item;
    },
    eliminar(col, id, { guardar = true } = {}) {
      const i = db[col].findIndex((x) => x.id === id);
      if (i >= 0) db[col].splice(i, 1);
      if (guardar) this.guardar();
    },

    /** Siguiente número correlativo de pedido (P-0001, P-0002…). */
    siguienteNumeroVenta() {
      db.meta.ultimoNumeroVenta = (db.meta.ultimoNumeroVenta || 0) + 1;
      return 'P-' + String(db.meta.ultimoNumeroVenta).padStart(4, '0');
    },

    /* ---------- Copia de seguridad ---------- */
    exportar() { return JSON.stringify(Object.assign({ app: 'TAIS Joyería Gestión', exportado: new Date().toISOString() }, db), null, 2); },
    importar(texto) {
      const data = JSON.parse(texto); // lanza error si no es JSON válido
      const tieneAlgo = COLECCIONES.some((c) => Array.isArray(data[c]));
      if (!tieneAlgo) throw new Error('El archivo no parece una copia de TAIS (no tiene productos, ventas, insumos…).');
      db = normalizar(data);
      this.guardar();
    },
    reemplazar(data) { db = normalizar(data); this.guardar(); },
    borrarTodo() { db = vacia(); this.guardar(); },
    estaVacia() { return COLECCIONES.every((c) => db[c].length === 0); },
  };

  T.Store = Store;
})(window.TAIS);

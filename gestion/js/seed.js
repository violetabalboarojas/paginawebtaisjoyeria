/* =====================================================================
   seed.js — Datos de ejemplo
   Sirven para probar la app. Precios, costos y clientes son FICTICIOS:
   reemplázalos por los reales de TAIS antes de usar la app en serio
   (botón "Borrar todo" y luego registra tus datos).
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N } = T;

  /** Generador pseudoaleatorio con semilla: los datos de ejemplo salen siempre iguales. */
  const rng = (semilla) => () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296;
  };

  T.generarDatosEjemplo = () => {
    const azar = rng(20260704);
    const elegir = (arr) => arr[Math.floor(azar() * arr.length)];
    const ahora = new Date().toISOString();
    const hoy = U.hoy();

    /* ---------- Insumos ---------- */
    // [id, nombre, categoría, unidad, stock, stockMin, costo unitario, proveedor]
    const insumos = [
      ['ins_acero', 'Plancha de acero inoxidable 316L', 'Metales', 'plancha', 6, 4, 18, 'Metales del Centro'],
      ['ins_plata', 'Plata 925 (lámina)', 'Metales', 'gramo', 40, 50, 4.8, 'Platería Lima'],
      ['ins_bano', 'Baño de oro 18k (servicio por pieza)', 'Metales', 'unidad', 30, 20, 6.5, 'Galvánica San Juan'],
      ['ins_cad_acero', 'Cadena acero 45 cm', 'Cadenas', 'unidad', 45, 25, 3.2, 'Importadora Mesa Redonda'],
      ['ins_cad_plata', 'Cadena plata 925 45 cm', 'Cadenas', 'unidad', 8, 12, 14, 'Platería Lima'],
      ['ins_pulso', 'Cadena tipo pulsera 18 cm', 'Cadenas', 'unidad', 30, 20, 2.5, 'Importadora Mesa Redonda'],
      ['ins_broche', 'Broches mosquetón', 'Cadenas', 'unidad', 120, 60, 0.35, 'Importadora Mesa Redonda'],
      ['ins_argolla', 'Argollas de unión', 'Cadenas', 'unidad', 300, 100, 0.08, 'Importadora Mesa Redonda'],
      ['ins_dije_circ', 'Dije en blanco circular acero', 'Metales', 'unidad', 18, 30, 1.8, 'Metales del Centro'],
      ['ins_dije_cor', 'Dije en blanco corazón acero', 'Metales', 'unidad', 40, 30, 2, 'Metales del Centro'],
      ['ins_dije_barra', 'Dije en blanco barra acero', 'Metales', 'unidad', 25, 15, 2.2, 'Metales del Centro'],
      ['ins_anillo', 'Anillo base ajustable acero', 'Metales', 'unidad', 20, 15, 3.5, 'Metales del Centro'],
      ['ins_cuarzo', 'Cuarzo rosa (piedra pulida)', 'Piedras', 'unidad', 22, 15, 4, 'Piedras del Inca'],
      ['ins_amatista', 'Amatista (piedra pulida)', 'Piedras', 'unidad', 6, 15, 5, 'Piedras del Inca'],
      ['ins_tigre', 'Ojo de tigre (piedra pulida)', 'Piedras', 'unidad', 16, 10, 4.5, 'Piedras del Inca'],
      ['ins_caja', 'Caja de regalo lila con logo', 'Cajas y empaques', 'unidad', 35, 30, 4.5, 'Empaques Perú'],
      ['ins_caja_box', 'Caja box grande con tapa', 'Cajas y empaques', 'unidad', 9, 10, 12, 'Empaques Perú'],
      ['ins_bolsa', 'Bolsa de regalo TAIS', 'Cajas y empaques', 'unidad', 60, 40, 1.8, 'Empaques Perú'],
      ['ins_seda', 'Papel de seda lila', 'Papelería', 'pliego', 80, 50, 0.4, 'Librería Crisol'],
      ['ins_tarjeta', 'Tarjeta "Tu magia vive aquí"', 'Papelería', 'unidad', 90, 60, 0.6, 'Imprenta Grafix'],
      ['ins_cinta', 'Cinta satinada lila', 'Papelería', 'metro', 25, 30, 0.5, 'Librería Crisol'],
      ['ins_acrilico', 'Plancha de acrílico 3 mm', 'Acrílico/madera', 'plancha', 3, 2, 25, 'Acrílicos Lima'],
      ['ins_mdf', 'Plancha de MDF 3 mm', 'Acrílico/madera', 'plancha', 4, 2, 9, 'Maderera Surquillo'],
      ['ins_relleno', 'Relleno de viruta para box', 'Otros', 'paquete', 7, 4, 3, 'Empaques Perú'],
    ].map(([id, nombre, categoria, unidad, stock, stockMin, costo, proveedor]) => ({
      id, nombre, categoria, unidad, stock, stockMin, costo, proveedor, creado: ahora,
    }));

    /* ---------- Productos con receta ---------- */
    const r = (pares) => pares.map(([insumoId, cantidad]) => ({ insumoId, cantidad }));
    const empaque = [['ins_caja', 1], ['ins_seda', 1], ['ins_tarjeta', 1]];
    const productos = [
      ['pro_col_nombre', 'Collar nombre grabado', 'Collar', 'Acero inoxidable con baño de oro', 'Nombre', 'Todo uso', 89, 'activo',
        [['ins_dije_barra', 1], ['ins_cad_acero', 1], ['ins_bano', 1], ['ins_argolla', 2], ...empaque]],
      ['pro_col_corazon', 'Collar corazón con fecha', 'Collar', 'Acero inoxidable', 'Fecha', 'Aniversario', 79, 'activo',
        [['ins_dije_cor', 1], ['ins_cad_acero', 1], ['ins_argolla', 1], ...empaque]],
      ['pro_col_coord', 'Collar coordenadas', 'Collar', 'Plata 925', 'Coordenadas', 'Aniversario', 129, 'activo',
        [['ins_plata', 3], ['ins_cad_plata', 1], ['ins_argolla', 1], ...empaque]],
      ['pro_pul_inic', 'Pulsera iniciales', 'Pulsera', 'Acero inoxidable con baño de oro', 'Iniciales', 'San Valentín', 69, 'activo',
        [['ins_dije_circ', 1], ['ins_pulso', 1], ['ins_broche', 1], ['ins_bano', 1], ...empaque]],
      ['pro_pul_huella', 'Pulsera huella de mascota', 'Pulsera', 'Acero inoxidable', 'Huella', 'Todo uso', 65, 'activo',
        [['ins_dije_circ', 1], ['ins_pulso', 1], ['ins_broche', 1], ...empaque]],
      ['pro_dije_esfera', 'Dije esfera mágica grabado', 'Dije', 'Acero inoxidable con baño de oro', 'Frase', 'Cumpleaños', 49, 'activo',
        [['ins_dije_circ', 1], ['ins_bano', 1], ['ins_argolla', 1], ['ins_bolsa', 1], ['ins_tarjeta', 1]]],
      ['pro_ani_cuarzo', 'Anillo cuarzo rosa', 'Anillo', 'Acero inoxidable', 'Piedra natural', 'Todo uso', 59, 'activo',
        [['ins_anillo', 1], ['ins_cuarzo', 1], ['ins_bolsa', 1], ['ins_tarjeta', 1]]],
      ['pro_col_amatista', 'Collar amatista intuición', 'Collar', 'Plata 925', 'Piedra natural', 'Cumpleaños', 99, 'activo',
        [['ins_amatista', 1], ['ins_cad_plata', 1], ['ins_argolla', 2], ...empaque]],
      ['pro_ani_tigre', 'Anillo ojo de tigre', 'Anillo', 'Acero inoxidable', 'Piedra natural', 'Graduación', 59, 'activo',
        [['ins_anillo', 1], ['ins_tigre', 1], ['ins_bolsa', 1], ['ins_tarjeta', 1]]],
      ['pro_box_mama', 'Box Día de la Madre', 'Box', 'Mixto', 'Nombre', 'Día de la Madre', 159, 'activo',
        [['ins_dije_cor', 1], ['ins_cad_acero', 1], ['ins_cuarzo', 1], ['ins_caja_box', 1], ['ins_relleno', 0.25], ['ins_seda', 2], ['ins_tarjeta', 1], ['ins_cinta', 1], ['ins_mdf', 0.1]]],
      ['pro_box_aniv', 'Box aniversario parejas', 'Box', 'Mixto', 'Fecha', 'Aniversario', 189, 'activo',
        [['ins_dije_cor', 2], ['ins_cad_acero', 2], ['ins_caja_box', 1], ['ins_relleno', 0.25], ['ins_seda', 2], ['ins_tarjeta', 1], ['ins_cinta', 1], ['ins_acrilico', 0.1]]],
      ['pro_box_baby', 'Box baby shower', 'Box', 'Mixto', 'Nombre', 'Baby shower', 149, 'desarrollo',
        [['ins_dije_circ', 1], ['ins_pulso', 1], ['ins_caja_box', 1], ['ins_relleno', 0.25], ['ins_tarjeta', 1], ['ins_cinta', 1], ['ins_mdf', 0.1]]],
      ['pro_llavero_acr', 'Llavero acrílico grabado', 'Otro', 'Acrílico', 'Nombre', 'Todo uso', 25, 'descontinuado',
        [['ins_acrilico', 0.05], ['ins_argolla', 1], ['ins_bolsa', 1]]],
    ];

    // Se crea primero el objeto db para que costoReceta lea los insumos.
    const db = { version: 1, meta: { creado: ahora, ultimoNumeroVenta: 0, ejemplo: true }, productos: [], insumos, compras: [], ventas: [], ideas: [], tareas: [] };
    T.Store.reemplazar(db);

    productos.forEach(([id, nombre, categoria, material, personalizacion, ocasion, precio, estado, rec]) => {
      const receta = r(rec);
      const costo = U.redondear(N.costoReceta(receta) + 6); // + mano de obra y grabado estimados
      db.productos.push({ id, nombre, categoria, material, personalizacion, ocasion, precio, costo, estado, receta, descripcion: '', creado: ahora });
    });
    T.Store.reemplazar(db);

    /* ---------- Ventas (últimos 6 meses) ---------- */
    const clientes = ['María Fernanda Quispe', 'Lucía Ramírez', 'Andrea Torres', 'Valeria Huamán', 'Camila Rojas', 'Daniela Flores',
      'Sofía Mendoza', 'Carlos Gutiérrez', 'Jimena Castillo', 'Rosa Chávez', 'Alejandra Vargas', 'Diego Salazar', 'Fiorella Paredes', 'Paola Díaz'];
    const grabados = ['Sofía', 'M & J · 14.02.2024', '12°02\'46"S 77°01\'42"W', 'Tu magia vive aquí', 'Mamá', 'Siempre juntos', 'L.R.', 'Luna', 'Te amo infinito'];
    const pesos = ['pro_col_nombre', 'pro_col_nombre', 'pro_col_nombre', 'pro_pul_inic', 'pro_pul_inic', 'pro_dije_esfera', 'pro_dije_esfera',
      'pro_col_corazon', 'pro_col_corazon', 'pro_box_aniv', 'pro_box_mama', 'pro_ani_cuarzo', 'pro_col_coord', 'pro_pul_huella', 'pro_col_amatista', 'pro_ani_tigre'];
    const canales = ['Instagram', 'Instagram', 'Instagram', 'WhatsApp', 'WhatsApp', 'Feria', 'Tienda'];
    const pagos = ['Yape', 'Yape', 'Yape', 'Plin', 'Transferencia', 'Efectivo', 'Tarjeta'];

    const ventas = [];
    for (let i = 0; i < 70; i++) {
      const diasAtras = Math.floor(azar() * 180);
      const fecha = U.sumarDias(hoy, -diasAtras);
      const items = [];
      const nItems = azar() < 0.2 ? 2 : 1;
      for (let k = 0; k < nItems; k++) {
        let pid = elegir(pesos);
        if (fecha.slice(5, 7) === '05' && azar() < 0.5) pid = 'pro_box_mama'; // mayo: Día de la Madre
        if (fecha.slice(5, 7) === '02' && azar() < 0.4) pid = 'pro_box_aniv';
        const p = db.productos.find((x) => x.id === pid);
        if (items.some((it) => it.productoId === pid)) continue;
        items.push({ productoId: pid, nombre: p.nombre, cantidad: azar() < 0.15 ? 2 : 1, precio: p.precio });
      }
      const subtotal = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
      const descuento = azar() < 0.18 ? Math.round(subtotal * 0.1) : 0;
      const estado = diasAtras > 10 ? 'entregado' : diasAtras > 6 ? 'listo' : diasAtras > 3 ? 'produccion' : 'pendiente';
      const p0 = db.productos.find((x) => x.id === items[0].productoId);
      ventas.push({
        fecha,
        cliente: elegir(clientes),
        telefono: '',
        items,
        descuento,
        metodoPago: elegir(pagos),
        canal: elegir(canales),
        ocasion: p0.ocasion === 'Todo uso' ? elegir(['Cumpleaños', 'Aniversario', 'Todo uso', 'Graduación']) : p0.ocasion,
        grabado: p0.personalizacion === 'Piedra natural' ? '' : elegir(grabados),
        fechaEntrega: U.sumarDias(fecha, 5),
        estado,
        notas: '',
      });
    }
    ventas.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((v) => {
      const n = ++db.meta.ultimoNumeroVenta;
      db.ventas.push(Object.assign(v, N.totalesVenta(v.items, v.descuento), {
        id: U.uid('ven'),
        numero: 'P-' + String(n).padStart(4, '0'),
        consumo: N.consumoDeItems(v.items), // el stock de arriba ya es el "actual" (después de estas ventas)
        creado: ahora,
      }));
    });

    /* ---------- Compras de insumos ---------- */
    [[-40, 'ins_cad_acero', 50, 3.2], [-25, 'ins_caja', 40, 4.5], [-18, 'ins_dije_cor', 30, 2], [-9, 'ins_tarjeta', 100, 0.6], [-3, 'ins_cuarzo', 15, 4]]
      .forEach(([d, insumoId, cantidad, costoUnit]) => {
        const ins = insumos.find((x) => x.id === insumoId);
        db.compras.push({ id: U.uid('com'), fecha: U.sumarDias(hoy, d), insumoId, cantidad, costoUnit, proveedor: ins.proveedor, nota: '', creado: ahora });
      });

    /* ---------- Desarrollo de productos ---------- */
    const idea = (nombre, descripcion, etapa, receta, costoEst, precioSug, notas, dias) =>
      ({ id: U.uid('ide'), nombre, descripcion, etapa, receta: r(receta), insumosTexto: '', costoEst, precioSug, notas, fecha: U.sumarDias(hoy, dias), productoId: null, creado: ahora });
    db.ideas.push(
      idea('Collar constelación', 'Dije circular con la constelación del signo grabada.', 'idea', [['ins_dije_circ', 1], ['ins_cad_acero', 1]], 18, 85, 'Probar grabado de puntos finos.', -12),
      idea('Pulsera hilo rojo con dije', 'Pulsera de protección con dije esfera.', 'idea', [], 10, 45, 'Buscar proveedor de hilo rojo encerado.', -5),
      idea('Llavero esfera mágica acrílico', 'Llavero con la esfera TAIS en acrílico lila.', 'prototipo', [['ins_acrilico', 0.05], ['ins_argolla', 1]], 6, 29, 'Primer corte OK, ajustar potencia del láser.', -20),
      idea('Box graduación', 'Box con anillo ojo de tigre y tarjeta de logros.', 'prueba', [['ins_anillo', 1], ['ins_tigre', 1], ['ins_caja_box', 1], ['ins_tarjeta', 1]], 32, 139, 'Mostrar a 5 clientas frecuentes.', -30),
      idea('Collar huella + nombre', 'Huella de mascota y nombre en el reverso.', 'listo', [['ins_dije_circ', 1], ['ins_cad_acero', 1], ['ins_argolla', 1], ['ins_caja', 1]], 16, 79, 'Fotos listas para Instagram.', -45),
    );

    /* ---------- Tareas ---------- */
    const tarea = (titulo, descripcion, responsable, prioridad, dias, categoria, completada = false) =>
      ({ id: U.uid('tar'), titulo, descripcion, responsable, prioridad, fechaLimite: U.sumarDias(hoy, dias), categoria, completada, completadaEl: completada ? hoy : null, creado: ahora });
    db.tareas.push(
      tarea('Grabar pedidos pendientes de la semana', 'Revisar textos con cada clienta antes de grabar.', 'Producción', 'alta', 1, 'Producción'),
      tarea('Comprar amatistas y cadenas de plata', 'Stock por debajo del mínimo.', 'Producción', 'alta', -1, 'Compras'),
      tarea('Diseñar plantilla de coordenadas', 'Plantilla en LightBurn para grabado rápido.', 'Diseño', 'media', 5, 'Diseño'),
      tarea('Reel de box aniversario', 'Mostrar el unboxing con música suave.', 'Marketing', 'media', 7, 'Marketing'),
      tarea('Coordinar delivery Miraflores', 'Pedidos listos para entregar.', 'Producción', 'baja', -3, 'Entrega'),
      tarea('Fotografiar colección piedras', '', 'Marketing', 'baja', -10, 'Marketing', true),
    );

    T.Store.reemplazar(db);
  };
})(window.TAIS);

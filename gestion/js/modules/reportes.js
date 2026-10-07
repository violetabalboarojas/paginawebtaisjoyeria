/* =====================================================================
   Módulo: Reportes y descargas en Excel (SheetJS)

   Cada reporte se define una sola vez como datos:
     { id, titulo, descripcion, usaFechas, construir(rango) → [tabla] }
     tabla = { hoja, titulo, columnas:[{t, k, tipo}], filas:[{...}], totales }
   La misma definición sirve para pintar la tabla en pantalla y para el Excel.
   Para agregar un reporte nuevo basta con sumar un objeto a REPORTES.
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N, Store } = T;
  const C = U.CAT;

  const rango = { preset: 'anio', desde: '', hasta: '' };
  let seleccionado = 'ventas';

  /* ---------------- Rango de fechas ---------------- */
  const PRESETS = {
    mes: 'Este mes', mesAnterior: 'Mes anterior', tresMeses: 'Últimos 3 meses', anio: 'Este año', todo: 'Todo', personalizado: 'Personalizado',
  };
  function aplicarPreset(p) {
    const hoy = U.hoy();
    const [y, m] = hoy.split('-').map(Number);
    rango.preset = p;
    if (p === 'mes') { rango.desde = U.inicioMes(hoy); rango.hasta = U.finMes(hoy); }
    if (p === 'mesAnterior') { const a = U.iso(new Date(y, m - 2, 1)); rango.desde = a; rango.hasta = U.finMes(a); }
    if (p === 'tresMeses') { rango.desde = U.iso(new Date(y, m - 3, 1)); rango.hasta = hoy; }
    if (p === 'anio') { rango.desde = `${y}-01-01`; rango.hasta = `${y}-12-31`; }
    if (p === 'todo') { rango.desde = ''; rango.hasta = ''; }
  }
  aplicarPreset(rango.preset);
  const textoRango = () => (rango.desde || rango.hasta ? `${rango.desde ? U.fecha(rango.desde) : 'inicio'} – ${rango.hasta ? U.fecha(rango.hasta) : 'hoy'}` : 'Todo el historial');

  /* ---------------- Definición de reportes ---------------- */
  const col = (t, k, tipo = 'texto') => ({ t, k, tipo });
  const nombreIns = (id) => Store.obtener('insumos', id)?.nombre || '(eliminado)';

  const REPORTES = [
    {
      id: 'ventas', titulo: 'Ventas por periodo', usaFechas: true,
      descripcion: 'Resumen mensual y detalle de cada pedido del periodo.',
      construir() {
        const ventas = N.ventasEnRango(rango.desde, rango.hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
        const meses = {};
        ventas.forEach((v) => {
          const k = U.mesClave(v.fecha);
          const g = meses[k] || (meses[k] = { mes: U.mesNombre(k), pedidos: 0, unidades: 0, descuentos: 0, total: 0 });
          g.pedidos++; g.unidades += v.items.reduce((s, i) => s + U.num(i.cantidad), 0);
          g.descuentos += U.num(v.descuento); g.total += U.num(v.total);
        });
        const resumen = Object.keys(meses).sort().map((k) => ({ ...meses[k], ticket: meses[k].total / meses[k].pedidos }));
        return [
          { hoja: 'Resumen mensual', titulo: 'Resumen por mes', totales: true,
            columnas: [col('Mes', 'mes'), col('Pedidos', 'pedidos', 'num'), col('Unidades', 'unidades', 'num'), col('Descuentos', 'descuentos', 'moneda'), col('Ventas', 'total', 'moneda'), col('Ticket promedio', 'ticket', 'moneda')],
            filas: resumen },
          { hoja: 'Detalle de pedidos', titulo: 'Detalle de pedidos', totales: true,
            columnas: [col('N° pedido', 'numero'), col('Fecha', 'fecha', 'fecha'), col('Cliente', 'cliente'), col('Productos', 'productos'), col('Unidades', 'unidades', 'num'),
              col('Subtotal', 'subtotal', 'moneda'), col('Descuento', 'descuento', 'moneda'), col('Total', 'total', 'moneda'), col('Método de pago', 'metodoPago'), col('Canal', 'canal'),
              col('Ocasión', 'ocasion'), col('Texto grabado', 'grabado'), col('Entrega', 'fechaEntrega', 'fecha'), col('Estado', 'estadoTxt')],
            filas: ventas.map((v) => ({ ...v, productos: v.items.map((i) => `${i.nombre} x${i.cantidad}`).join(', '), unidades: v.items.reduce((s, i) => s + U.num(i.cantidad), 0), estadoTxt: C.estadosVenta[v.estado] })) },
        ];
      },
    },
    {
      id: 'top', titulo: 'Productos más vendidos', usaFechas: true,
      descripcion: 'Ranking por unidades vendidas en el periodo, con su participación en las ventas.',
      construir() {
        const lineas = N.lineas(N.ventasEnRango(rango.desde, rango.hasta));
        const total = lineas.reduce((s, l) => s + l.ingreso, 0) || 1;
        const g = N.agrupar(lineas, (l) => l.nombre).sort((a, b) => b.unidades - a.unidades || b.ingreso - a.ingreso);
        const cat = Object.fromEntries(lineas.map((l) => [l.nombre, l.categoria]));
        return [{ hoja: 'Más vendidos', titulo: 'Ranking de productos', totales: true,
          columnas: [col('#', 'pos', 'num'), col('Producto', 'clave'), col('Categoría', 'categoria'), col('Unidades', 'unidades', 'num'), col('Pedidos', 'pedidos', 'num'), col('Ventas', 'ingreso', 'moneda'), col('% de ventas', 'pct', 'pct')],
          filas: g.map((x, i) => ({ ...x, pos: i + 1, categoria: cat[x.clave], pct: (x.ingreso / total) * 100 })) }];
      },
    },
    {
      id: 'segmentos', titulo: 'Por categoría, ocasión y canal', usaFechas: true,
      descripcion: 'Dónde y para qué se vende más: categoría, ocasión, canal y método de pago.',
      construir() {
        const ventas = N.ventasEnRango(rango.desde, rango.hasta);
        const lineas = N.lineas(ventas);
        const total = ventas.reduce((s, v) => s + U.num(v.total), 0) || 1;
        const conPct = (arr) => arr.map((x) => ({ ...x, pct: (x.ingreso / total) * 100 }));
        const colsLinea = (t) => [col(t, 'clave'), col('Unidades', 'unidades', 'num'), col('Pedidos', 'pedidos', 'num'), col('Ventas', 'ingreso', 'moneda'), col('% de ventas', 'pct', 'pct')];
        const colsVenta = (t) => [col(t, 'clave'), col('Pedidos', 'pedidos', 'num'), col('Ventas', 'ingreso', 'moneda'), col('% de ventas', 'pct', 'pct')];
        return [
          { hoja: 'Por categoría', titulo: 'Por categoría', totales: true, columnas: colsLinea('Categoría'), filas: conPct(N.agrupar(lineas, (l) => l.categoria)) },
          { hoja: 'Por ocasión', titulo: 'Por ocasión', totales: true, columnas: colsLinea('Ocasión'), filas: conPct(N.agrupar(lineas, (l) => l.ocasion)) },
          { hoja: 'Por canal', titulo: 'Por canal', totales: true, columnas: colsVenta('Canal'), filas: conPct(N.agruparVentas(ventas, 'canal')) },
          { hoja: 'Por método de pago', titulo: 'Por método de pago', totales: true, columnas: colsVenta('Método de pago'), filas: conPct(N.agruparVentas(ventas, 'metodoPago')) },
        ];
      },
    },
    {
      id: 'inventario', titulo: 'Estado del inventario', usaFechas: false,
      descripcion: 'Foto actual del stock y su valor (no depende del rango de fechas).',
      construir() {
        const filas = Store.listar('insumos').slice().sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
          .map((i) => ({ ...i, valor: Math.max(0, U.num(i.stock)) * U.num(i.costo), estadoTxt: N.stockBajo(i) ? 'STOCK BAJO' : 'OK' }));
        return [{ hoja: 'Inventario', titulo: 'Inventario actual', totales: true,
          columnas: [col('Insumo', 'nombre'), col('Categoría', 'categoria'), col('Unidad', 'unidad'), col('Stock', 'stock', 'num'), col('Stock mínimo', 'stockMin', 'num'),
            col('Costo unitario', 'costo', 'moneda'), col('Valor en stock', 'valor', 'moneda'), col('Proveedor', 'proveedor'), col('Estado', 'estadoTxt')],
          filas, sinTotal: ['stock', 'stockMin', 'costo'] }];
      },
    },
    {
      id: 'reponer', titulo: 'Insumos a reponer', usaFechas: false,
      descripcion: 'Lista de compra sugerida: insumos en el mínimo o por debajo (hasta el doble del mínimo).',
      construir() {
        return [{ hoja: 'Insumos a reponer', titulo: 'Lista de compra sugerida', totales: true,
          columnas: [col('Insumo', 'nombre'), col('Categoría', 'categoria'), col('Unidad', 'unidad'), col('Stock actual', 'stock', 'num'), col('Stock mínimo', 'min', 'num'),
            col('En pedidos abiertos', 'comprometido', 'num'), col('Cantidad a comprar', 'sugerido', 'num'), col('Costo unitario', 'costo', 'moneda'), col('Costo estimado', 'costoEst', 'moneda'), col('Proveedor', 'proveedor'), col('Motivo', 'motivo')],
          filas: N.insumosAComprar().map((x) => ({ ...x, nombre: x.insumo.nombre, categoria: x.insumo.categoria, unidad: x.insumo.unidad, costo: x.insumo.costo, proveedor: x.insumo.proveedor })),
          sinTotal: ['stock', 'min', 'comprometido', 'sugerido', 'costo'] }];
      },
    },
    {
      id: 'rentabilidad', titulo: 'Rentabilidad por producto', usaFechas: true,
      descripcion: 'Margen unitario de cada producto y ganancia bruta generada en el periodo (con el costo actual).',
      construir() {
        const g = Object.fromEntries(N.agrupar(N.lineas(N.ventasEnRango(rango.desde, rango.hasta)), (l) => l.productoId).map((x) => [x.clave, x]));
        const filas = Store.listar('productos').map((p) => {
          const m = N.margen(p.costo, p.precio);
          const v = g[p.id] || { unidades: 0, ingreso: 0 };
          const costoTotal = U.num(p.costo) * v.unidades;
          return { nombre: p.nombre, categoria: p.categoria, estadoTxt: C.estadosProducto[p.estado], precio: p.precio, costo: p.costo, ganancia: m.ganancia, margen: m.pct,
            unidades: v.unidades, ingreso: v.ingreso, costoTotal, gananciaBruta: v.ingreso - costoTotal };
        }).sort((a, b) => b.gananciaBruta - a.gananciaBruta || b.margen - a.margen);
        return [{ hoja: 'Rentabilidad', titulo: 'Rentabilidad por producto', totales: true,
          columnas: [col('Producto', 'nombre'), col('Categoría', 'categoria'), col('Estado', 'estadoTxt'), col('Precio', 'precio', 'moneda'), col('Costo', 'costo', 'moneda'),
            col('Ganancia unit.', 'ganancia', 'moneda'), col('Margen %', 'margen', 'pct'), col('Unid. vendidas', 'unidades', 'num'), col('Ventas', 'ingreso', 'moneda'),
            col('Costo total', 'costoTotal', 'moneda'), col('Ganancia bruta', 'gananciaBruta', 'moneda')],
          filas, sinTotal: ['precio', 'costo', 'ganancia'] }];
      },
    },
    {
      id: 'tareas', titulo: 'Tareas', usaFechas: true,
      descripcion: 'Tareas con fecha límite dentro del periodo (las que no tienen fecha se incluyen siempre).',
      construir() {
        const filas = Store.listar('tareas')
          .filter((t) => !t.fechaLimite || U.enRango(t.fechaLimite, rango.desde, rango.hasta))
          .sort((a, b) => (a.fechaLimite || '9').localeCompare(b.fechaLimite || '9'))
          .map((t) => ({ ...t, prioridadTxt: C.prioridades[t.prioridad], estadoTxt: t.completada ? 'Completada' : N.tareaVencida(t) ? 'VENCIDA' : 'Pendiente' }));
        return [{ hoja: 'Tareas', titulo: 'Tareas',
          columnas: [col('Título', 'titulo'), col('Descripción', 'descripcion'), col('Categoría', 'categoria'), col('Prioridad', 'prioridadTxt'), col('Responsable', 'responsable'),
            col('Fecha límite', 'fechaLimite', 'fecha'), col('Estado', 'estadoTxt'), col('Completada el', 'completadaEl', 'fecha')],
          filas }];
      },
    },
  ];

  /* ---------------- Totales ---------------- */
  function filaTotales(tabla) {
    if (!tabla.totales || !tabla.filas.length) return null;
    const t = {};
    tabla.columnas.forEach((c, i) => {
      if (i === 0) t[c.k] = 'TOTAL';
      else if ((c.tipo === 'moneda' || c.tipo === 'num') && !(tabla.sinTotal || []).includes(c.k) && c.k !== 'pos')
        t[c.k] = tabla.filas.reduce((s, f) => s + U.num(f[c.k]), 0);
      else if (c.tipo === 'pct' && c.k === 'pct') t[c.k] = 100;
    });
    // El ticket promedio del total se recalcula en lugar de sumarse
    if ('ticket' in t && t.pedidos) t.ticket = t.total / t.pedidos;
    return t;
  }

  /* ---------------- Pantalla ---------------- */
  const celda = (v, tipo) => {
    if (v === null || v === undefined || v === '') return tipo === 'texto' ? '—' : '';
    if (tipo === 'moneda') return U.soles(v);
    if (tipo === 'fecha') return U.fecha(v);
    if (tipo === 'pct') return U.pct(v);
    if (tipo === 'num') return U.cantidad(v);
    return U.esc(v);
  };

  function tablaHTML(tabla) {
    const tot = filaTotales(tabla);
    const num = (c) => (['moneda', 'num', 'pct'].includes(c.tipo) ? 'num' : '');
    return `<h3 class="mt">${U.esc(tabla.titulo)}</h3>
      ${tabla.filas.length ? `<div class="tabla-wrap mt"><table class="tabla">
        <thead><tr>${tabla.columnas.map((c) => `<th class="${num(c)}">${U.esc(c.t)}</th>`).join('')}</tr></thead>
        <tbody>${tabla.filas.map((f) => `<tr>${tabla.columnas.map((c) => `<td class="${num(c)}">${celda(f[c.k], c.tipo)}</td>`).join('')}</tr>`).join('')}</tbody>
        ${tot ? `<tfoot><tr>${tabla.columnas.map((c) => `<td class="${num(c)}">${tot[c.k] !== undefined ? celda(tot[c.k], c.tipo) : ''}</td>`).join('')}</tr></tfoot>` : ''}
      </table></div>` : U.vacio('Sin datos para este periodo.')}`;
  }

  function render(el) {
    const rep = REPORTES.find((r) => r.id === seleccionado) || REPORTES[0];
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Reportes</h1><p>Consulta y descarga en Excel (.xlsx).</p></div>
        <div class="acciones"><button class="btn btn-violeta" data-exportar-todo>⬇ Exportar todo (Excel)</button></div>
      </div>
      <div class="card">
        <div class="filtros" style="margin-bottom:0">
          <div class="campo"><label for="r-preset">Periodo</label><select id="r-preset">${U.opciones(PRESETS, rango.preset)}</select></div>
          <div class="campo"><label for="r-desde">Desde</label><input id="r-desde" type="date" value="${rango.desde}" /></div>
          <div class="campo"><label for="r-hasta">Hasta</label><input id="r-hasta" type="date" value="${rango.hasta}" /></div>
        </div>
      </div>
      <div class="tabs mt" role="tablist">${REPORTES.map((r) => `<button role="tab" data-rep="${r.id}" class="${r.id === rep.id ? 'activo' : ''}">${U.esc(r.titulo)}</button>`).join('')}</div>
      <div class="card">
        <div class="card-head"><h2>${U.esc(rep.titulo)}</h2>
          <div class="acciones"><button class="btn btn-primario" data-descargar="${rep.id}">⬇ Descargar Excel (.xlsx)</button></div></div>
        <p class="card-desc">${U.esc(rep.descripcion)} ${rep.usaFechas ? `<br><strong>Periodo:</strong> ${textoRango()}` : ''}</p>
        ${rep.construir().map(tablaHTML).join('')}
      </div>`;

    U.$('#r-preset', el).addEventListener('change', (e) => { if (e.target.value !== 'personalizado') aplicarPreset(e.target.value); else rango.preset = 'personalizado'; render(el); });
    const cambiarFecha = (k) => (e) => {
      rango[k] = e.target.value;
      rango.preset = 'personalizado';
      if (rango.desde && rango.hasta && rango.desde > rango.hasta) { U.toast('“Desde” no puede ser posterior a “Hasta”.', 'warn'); return; }
      render(el);
    };
    U.$('#r-desde', el).addEventListener('change', cambiarFecha('desde'));
    U.$('#r-hasta', el).addEventListener('change', cambiarFecha('hasta'));
    U.$('.tabs', el).addEventListener('click', (e) => { const b = e.target.closest('[data-rep]'); if (b) { seleccionado = b.dataset.rep; render(el); } });
    U.$('[data-descargar]', el).addEventListener('click', (e) => descargar(e.currentTarget.dataset.descargar));
    U.$('[data-exportar-todo]', el).addEventListener('click', exportarTodo);
  }

  /* ---------------- Excel (SheetJS) ---------------- */
  const FMT = { moneda: '"S/" #,##0.00', fecha: 'dd/mm/yyyy', pct: '0.0%', num: '#,##0.##' };

  /** Fecha ISO → número de serie de Excel (evita desfases por zona horaria). */
  const serialExcel = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  };

  /** Construye una hoja: título, periodo, encabezados, filas, totales; con anchos y filtros. */
  function hoja(tabla, subtitulo) {
    const XLSX = window.XLSX;
    const cabecera = [[`TAIS Joyería · ${tabla.titulo}`], [subtitulo], []];
    const filaHead = cabecera.length;
    const tot = filaTotales(tabla);
    const filas = tot ? [...tabla.filas, tot] : tabla.filas;
    const aoa = [...cabecera, tabla.columnas.map((c) => c.t)];
    filas.forEach((f) => aoa.push(tabla.columnas.map((c) => {
      const v = f[c.k];
      if (v === null || v === undefined || v === '') return null;
      if (c.tipo === 'fecha') return serialExcel(v);
      if (c.tipo === 'pct') return U.num(v) / 100;
      if (c.tipo === 'moneda' || c.tipo === 'num') return U.redondear(v, 4);
      return String(v);
    })));
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Formatos numéricos por columna
    tabla.columnas.forEach((c, ci) => {
      if (!FMT[c.tipo]) return;
      for (let r = filaHead + 1; r < aoa.length; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: ci });
        if (ws[ref] && ws[ref].t === 'n') ws[ref].z = c.tipo === 'num' && Number.isInteger(ws[ref].v) ? '#,##0' : FMT[c.tipo];
      }
    });
    // Anchos de columna según el contenido (con mínimo y máximo)
    ws['!cols'] = tabla.columnas.map((c, ci) => {
      const largo = Math.max(c.t.length, ...aoa.slice(filaHead + 1).map((f) => {
        const v = f[ci];
        if (v === null) return 0;
        if (c.tipo === 'moneda') return U.soles(v).length + 1;
        if (c.tipo === 'fecha') return 10;
        return String(v).length;
      }));
      return { wch: Math.min(Math.max(largo + 2, 10), 60) };
    });
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, tabla.columnas.length - 1) } }];
    if (tabla.filas.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: filaHead, c: 0 }, e: { r: filaHead + tabla.filas.length, c: tabla.columnas.length - 1 } }) };
    return ws;
  }

  const nombreHoja = (s, usados) => {
    let n = s.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    let i = 2;
    while (usados.has(n)) n = `${s.slice(0, 28)} ${i++}`;
    usados.add(n);
    return n;
  };

  function libro(tablas, subtitulo) {
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: 'TAIS Joyería', Author: 'TAIS Gestión', CreatedDate: new Date() };
    const usados = new Set();
    tablas.forEach((t) => XLSX.utils.book_append_sheet(wb, hoja(t, t.subtitulo || subtitulo), nombreHoja(t.hoja, usados)));
    return wb;
  }

  const xlsxDisponible = () => {
    if (window.XLSX) return true;
    U.toast('No se pudo cargar la librería de Excel (SheetJS). Revisa tu conexión a internet y recarga.', 'bad');
    return false;
  };

  const slug = (s) => U.normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /** Descarga un reporte por id. */
  /** Convierte el libro a archivo .xlsx y lo descarga. */
  const guardarLibro = (wb, nombre) =>
    U.descargar(nombre, new Blob([window.XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

  async function descargar(id) {
    if (!xlsxDisponible()) return;
    const rep = REPORTES.find((r) => r.id === id);
    const sub = rep.usaFechas ? `Periodo: ${textoRango()} · Generado el ${U.fecha(U.hoy())}` : `Generado el ${U.fecha(U.hoy())}`;
    const wb = libro(rep.construir(), sub);
    if (await guardarLibro(wb, `TAIS-${slug(rep.titulo)}-${U.hoy()}.xlsx`)) U.toast('Excel descargado ✦', 'ok');
  }

  /** Un libro con una hoja por módulo (todos los datos, sin filtro de fechas). */
  async function exportarTodo() {
    if (!xlsxDisponible()) return;
    const prods = Store.listar('productos');
    const ventas = Store.listar('ventas').slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const tablas = [
      { hoja: 'Productos', titulo: 'Productos', columnas: [col('Nombre', 'nombre'), col('Categoría', 'categoria'), col('Material', 'material'), col('Personalización', 'personalizacion'), col('Ocasión', 'ocasion'),
        col('Costo', 'costo', 'moneda'), col('Precio', 'precio', 'moneda'), col('Margen %', 'margen', 'pct'), col('Estado', 'estadoTxt'), col('Descripción', 'descripcion')],
        filas: prods.map((p) => ({ ...p, margen: N.margen(p.costo, p.precio).pct, estadoTxt: C.estadosProducto[p.estado] })) },
      { hoja: 'Recetas', titulo: 'Recetas de insumos por producto', columnas: [col('Producto', 'producto'), col('Insumo', 'insumo'), col('Cantidad por unidad', 'cantidad', 'num'), col('Unidad', 'unidad'), col('Costo', 'costo', 'moneda')],
        filas: prods.flatMap((p) => (p.receta || []).map((r) => { const i = Store.obtener('insumos', r.insumoId); return { producto: p.nombre, insumo: i?.nombre || '(eliminado)', cantidad: r.cantidad, unidad: i?.unidad, costo: U.num(i?.costo) * r.cantidad }; })) },
      { hoja: 'Ventas', titulo: 'Ventas / pedidos', totales: true, columnas: [col('N° pedido', 'numero'), col('Fecha', 'fecha', 'fecha'), col('Cliente', 'cliente'), col('Teléfono', 'telefono'), col('Productos', 'productos'),
        col('Subtotal', 'subtotal', 'moneda'), col('Descuento', 'descuento', 'moneda'), col('Total', 'total', 'moneda'), col('Método de pago', 'metodoPago'), col('Canal', 'canal'), col('Ocasión', 'ocasion'),
        col('Texto grabado', 'grabado'), col('Entrega', 'fechaEntrega', 'fecha'), col('Estado', 'estadoTxt'), col('Notas', 'notas')],
        filas: ventas.map((v) => ({ ...v, productos: v.items.map((i) => `${i.nombre} x${i.cantidad}`).join(', '), estadoTxt: C.estadosVenta[v.estado] })) },
      { hoja: 'Detalle ventas', titulo: 'Detalle por producto vendido', totales: true, columnas: [col('N° pedido', 'numero'), col('Fecha', 'fecha', 'fecha'), col('Producto', 'nombre'), col('Categoría', 'categoria'), col('Ocasión', 'ocasion'),
        col('Cantidad', 'cantidad', 'num'), col('Venta (con desc.)', 'ingreso', 'moneda'), col('Costo', 'costo', 'moneda')],
        filas: N.lineas(ventas).map((l) => ({ ...l, numero: l.venta.numero, fecha: l.venta.fecha })) },
      ...REPORTES.find((r) => r.id === 'inventario').construir(),
      { hoja: 'Compras', titulo: 'Compras de insumos (entradas)', totales: true, columnas: [col('Fecha', 'fecha', 'fecha'), col('Insumo', 'insumo'), col('Cantidad', 'cantidad', 'num'), col('Costo unitario', 'costoUnit', 'moneda'), col('Total', 'total', 'moneda'), col('Proveedor', 'proveedor'), col('Nota', 'nota')],
        filas: Store.listar('compras').slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map((c) => ({ ...c, insumo: nombreIns(c.insumoId), total: c.cantidad * c.costoUnit })), sinTotal: ['cantidad', 'costoUnit'] },
      { hoja: 'Desarrollo', titulo: 'Desarrollo de productos', columnas: [col('Nombre', 'nombre'), col('Etapa', 'etapaTxt'), col('Descripción', 'descripcion'), col('Insumos', 'insumos'), col('Costo estimado', 'costoEst', 'moneda'), col('Precio sugerido', 'precioSug', 'moneda'), col('Notas', 'notas'), col('Fecha', 'fecha', 'fecha'), col('En catálogo', 'enCatalogo')],
        filas: Store.listar('ideas').map((i) => ({ ...i, etapaTxt: C.etapasIdea[i.etapa], insumos: [...(i.receta || []).map((r) => `${nombreIns(r.insumoId)} x${r.cantidad}`), i.insumosTexto].filter(Boolean).join(', '), enCatalogo: i.productoId ? 'Sí' : 'No' })) },
    ];
    const guardado = { preset: rango.preset, desde: rango.desde, hasta: rango.hasta };
    aplicarPreset('todo');
    tablas.push(...REPORTES.find((r) => r.id === 'tareas').construir());
    Object.assign(rango, guardado);
    const wb = libro(tablas, `Exportación completa · ${U.fecha(U.hoy())}`);
    if (await guardarLibro(wb, `TAIS-exportacion-completa-${U.hoy()}.xlsx`)) U.toast('Exportación completa descargada ✦', 'ok');
  }

  T.Reportes = { descargar, exportarTodo, REPORTES };

  (T.modulos = T.modulos || []).push({ id: 'reportes', titulo: 'Reportes', icono: '▤', render });
})(window.TAIS);

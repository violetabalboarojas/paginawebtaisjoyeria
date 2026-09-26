/* Telate · app.js
   Interfaz: navegación sin recarga, vistas, formularios y acciones. */
'use strict';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const esc = Util.esc;

/* ---------- Catálogos ---------- */
const CATEGORIAS = ['Torta', 'Té'];
const PRESENTACIONES = ['Porción', 'Torta entera', 'Bolsa 50 g', 'Bolsa 100 g', 'Taza', 'Tetera'];
const UNIDADES = ['g', 'kg', 'ml', 'L', 'unidad'];
const CANALES = ['Local', 'Delivery', 'Redes sociales'];
const PAGOS = ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia'];
const AREAS = ['Producción', 'Compras', 'Ventas', 'Desarrollo de tés', 'Limpieza', 'Otro'];
const PRIORIDADES = [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const ESTADOS_TAREA = [['pendiente', 'Pendiente'], ['en proceso', 'En proceso'], ['hecha', 'Hecha']];
const ESTADOS_MEZCLA = [['idea', 'Idea'], ['en prueba', 'En prueba'], ['aprobado', 'Aprobado'], ['descartado', 'Descartado']];
const COLOR = { choco: '#6B4226', verde: '#55773A', caramelo: '#C98B4B', crema: '#F2E8D8', grilla: '#EFE6D8', texto: '#76675B' };

const App = {
  acciones: {},  // click en [data-accion] dentro de la vista actual
  cambios: {},   // change en [data-cambio] dentro de la vista actual
  graficos: [],
  estado: {
    productos: { texto: '', categoria: '', activo: '' },
    insumos: { texto: '', soloBajo: false },
    recetas: { texto: '', categoria: '' },
    ventas: { desde: Util.primerDiaMes(), hasta: Util.hoy(), producto: '', categoria: '', canal: '' },
    laboratorio: { estado: '' },
    tareas: { modo: Storage.pref('tareasModo') || 'tablero', texto: '', area: '', responsable: '', prioridad: '', estado: '' },
    reportes: { id: 'ranking', desde: Util.primerDiaMes(), hasta: Util.hoy() },
  },
};

/* =========================================================
   Utilidades de interfaz
   ========================================================= */
function opciones(lista, seleccionado, textoVacio) {
  const vacio = textoVacio !== undefined ? `<option value="">${esc(textoVacio)}</option>` : '';
  return vacio + lista.map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}"${String(v) === String(seleccionado ?? '') ? ' selected' : ''}>${esc(t)}</option>`;
  }).join('');
}
const etiquetaProducto = (p) => (p ? `${p.nombre} (${p.presentacion})` : '(producto eliminado)');
const badge = (texto, tipo = 'gris') => `<span class="badge badge-${tipo}">${esc(texto)}</span>`;
const cantidadConUnidad = (cant, ins) => `${Util.num(cant, 3)} ${ins ? esc(ins.unidad) : ''}`;
const campo = (label, control, { clase = '', ayuda = '' } = {}) =>
  `<label class="campo ${clase}"><span>${esc(label)}</span>${control}${ayuda ? `<small>${esc(ayuda)}</small>` : ''}</label>`;
const vacio = (html) => `<div class="vacio">${html}</div>`;

function cabecera(titulo, sub, acciones = '') {
  return `<div class="vista-cabecera"><div><h1>${esc(titulo)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>
    <div class="acciones">${acciones}</div></div>`;
}
function badgeMargen(margenPct, tieneReceta) {
  if (!tieneReceta) return badge('Sin receta', 'ambar');
  const tipo = margenPct < 0 ? 'rojo' : margenPct < 0.3 ? 'ambar' : 'verde';
  return badge(Util.pct(margenPct), tipo);
}
function badgeEstadoTarea(estado) {
  return { pendiente: badge('Pendiente', 'ambar'), 'en proceso': badge('En proceso', 'azul'), hecha: badge('Hecha', 'verde') }[estado] || badge(estado);
}
function badgePrioridad(p) {
  return { alta: badge('Alta', 'rojo'), media: badge('Media', 'ambar'), baja: badge('Baja', 'verde') }[p] || '';
}
function badgeEstadoMezcla(e) {
  return { idea: badge('Idea', 'gris'), 'en prueba': badge('En prueba', 'azul'), aprobado: badge('Aprobado', 'verde'), descartado: badge('Descartado', 'rojo') }[e] || '';
}

function toast(mensaje, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = mensaje;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('saliendo'); setTimeout(() => t.remove(), 300); }, 3500);
}

/** Diálogo de confirmación. `mensaje` es HTML: escapar datos del usuario antes de pasarlo. */
function confirmar(mensaje, { titulo = '¿Confirmas esta acción?', ok = 'Eliminar', peligro = true } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal modal-chico';
    dlg.innerHTML = `<div class="modal-cab"><h2>${esc(titulo)}</h2></div>
      <div class="modal-cuerpo"><p>${mensaje}</p></div>
      <div class="modal-pie"><button type="button" class="btn btn-sec" data-r="0">Cancelar</button>
      <button type="button" class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-r="1">${esc(ok)}</button></div>`;
    let respuesta = false;
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) { respuesta = b.dataset.r === '1'; dlg.close(); }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(respuesta); });
    document.body.appendChild(dlg);
    dlg.showModal();
    $('[data-r="0"]', dlg).focus();
  });
}

/**
 * Modal con formulario. `alEnviar(form)` puede devolver:
 *  - string → se muestra como error y el modal sigue abierto
 *  - false  → el modal sigue abierto sin mensaje
 *  - otro   → se cierra el modal
 */
function abrirModal({ titulo, cuerpo, textoOk = 'Guardar', clase = '', alMontar, alEnviar }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal ${clase}`;
  dlg.innerHTML = `<form novalidate>
      <div class="modal-cab"><h2>${esc(titulo)}</h2><button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="modal-cuerpo">${cuerpo}<div class="error-form" role="alert" hidden></div></div>
      <div class="modal-pie"><button type="button" class="btn btn-sec" data-cerrar>Cancelar</button>
      <button type="submit" class="btn btn-primario">${esc(textoOk)}</button></div></form>`;
  document.body.appendChild(dlg);
  const form = $('form', dlg);
  const error = $('.error-form', dlg);
  const mostrarError = (msg) => { error.textContent = msg; error.hidden = false; error.scrollIntoView({ block: 'nearest' }); };
  dlg.addEventListener('close', () => dlg.remove());
  $$('[data-cerrar]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  let enviando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    error.hidden = true;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    enviando = true;
    try {
      const r = await alEnviar(form);
      if (typeof r === 'string') mostrarError(r);
      else if (r !== false) dlg.close();
    } catch (ex) {
      console.error(ex);
      mostrarError(`Ocurrió un error: ${ex.message}`);
    } finally {
      enviando = false;
    }
  });
  dlg.showModal();
  if (alMontar) alMontar(dlg, form);
  const primero = $('.modal-cuerpo input, .modal-cuerpo select, .modal-cuerpo textarea', dlg);
  if (primero) primero.focus();
  return dlg;
}

function grafico(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<p class="sub">No se pudo cargar Chart.js. Revisa tu conexión a internet.</p>';
    return;
  }
  App.graficos.push(new Chart(canvas, config));
}

const numero = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

/* =========================================================
   Navegación
   ========================================================= */
const VISTAS = {
  dashboard: { titulo: 'Inicio', fn: vistaDashboard },
  ventas: { titulo: 'Ventas', fn: vistaVentas },
  productos: { titulo: 'Productos', fn: vistaProductos },
  insumos: { titulo: 'Insumos', fn: vistaInsumos },
  recetas: { titulo: 'Recetas', fn: vistaRecetas },
  laboratorio: { titulo: 'Laboratorio de tés', fn: vistaLaboratorio },
  tareas: { titulo: 'Tareas', fn: vistaTareas },
  reportes: { titulo: 'Reportes', fn: vistaReportes },
  datos: { titulo: 'Respaldo y datos', fn: vistaDatos },
};

function vistaActual() {
  const id = decodeURIComponent(location.hash.slice(1));
  return VISTAS[id] ? id : 'dashboard';
}

function render({ scroll = false } = {}) {
  const id = vistaActual();
  App.graficos.forEach((g) => g.destroy());
  App.graficos = [];
  App.acciones = {};
  App.cambios = {};
  $$('.nav a').forEach((a) => {
    const activo = a.dataset.vista === id;
    a.classList.toggle('activo', activo);
    if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  cerrarMenu();
  const cont = $('#vista');
  const y = window.scrollY;
  VISTAS[id].fn(cont);
  document.title = `${VISTAS[id].titulo} · Telate`;
  actualizarBadges();
  window.scrollTo(0, scroll ? 0 : y);
}

function actualizarBadges() {
  const bajos = Calc.stockBajo().length;
  const vencidas = Storage.get('tareas').filter(Calc.tareaVencida).length;
  const bi = $('#badge-insumos'), bt = $('#badge-tareas');
  bi.hidden = !bajos; bi.textContent = bajos; bi.title = `${bajos} insumo(s) con stock bajo`;
  bt.hidden = !vencidas; bt.textContent = vencidas; bt.title = `${vencidas} tarea(s) vencida(s)`;
}

function cerrarMenu() {
  document.body.classList.remove('menu-abierto');
  $('.btn-menu').setAttribute('aria-expanded', 'false');
}

/* =========================================================
   1. Dashboard
   ========================================================= */
function vistaDashboard(cont) {
  const hoy = Util.hoy();
  const mes = hoy.slice(0, 7);
  const ventas = Storage.get('ventas');
  const total = (arr) => arr.reduce((s, v) => s + Number(v.total || 0), 0);
  const vDia = ventas.filter((v) => v.fecha === hoy);
  const vMes = ventas.filter((v) => v.fecha.slice(0, 7) === mes);
  const top = Calc.rankingProductos(vMes)[0];
  const bajos = Calc.stockBajo();
  const pendientes = Storage.get('tareas').filter((t) => t.estado !== 'hecha');
  const vencidas = pendientes.filter(Calc.tareaVencida);
  const desde = Util.sumarDias(hoy, -29);
  const rank30 = Calc.rankingProductos(Calc.ventasEnRango(desde, hoy));
  const kpi = (etiqueta, valor, detalle, { href = '', alerta = false, chico = false } = {}) => {
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi${alerta ? ' alerta' : ''}"${href ? ` href="${href}"` : ''}>
      <div class="kpi-etiqueta">${esc(etiqueta)}</div>
      <div class="kpi-valor${chico ? ' chico' : ''}">${valor}</div>
      <div class="kpi-detalle">${detalle}</div></${tag}>`;
  };

  const proximas = [...pendientes].sort((a, b) => (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999')).slice(0, 6);

  cont.innerHTML = cabecera('Inicio', `Resumen al ${Util.fechaLegible(hoy)}`,
    '<button class="btn btn-primario" data-accion="nueva-venta">+ Registrar venta</button>') + `
    <section class="kpis" aria-label="Indicadores">
      ${kpi('Ventas de hoy', Util.soles(total(vDia)), `${vDia.length} venta(s)`, { href: '#ventas' })}
      ${kpi('Ventas del mes', Util.soles(total(vMes)), `${vMes.length} venta(s) · ${Util.mesLegible(mes)}`, { href: '#reportes' })}
      ${kpi('Más vendido del mes', top ? esc(etiquetaProducto(top)) : '—', top ? `${Util.num(top.unidades)} unid. · ${Util.soles(top.monto)}` : 'Aún no hay ventas este mes', { chico: true })}
      ${kpi('Insumos con stock bajo', bajos.length, bajos.length ? 'Revisa la lista de compras' : 'Todo en orden', { href: '#insumos', alerta: bajos.length > 0 })}
      ${kpi('Tareas pendientes', pendientes.length, vencidas.length ? `<b>${vencidas.length} vencida(s)</b>` : 'Ninguna vencida', { href: '#tareas', alerta: vencidas.length > 0 })}
    </section>
    <section class="grid-graficos">
      <div class="card"><h2>Top 5 por unidades</h2><p class="sub">Últimos 30 días</p><div class="grafico"><canvas id="g-unidades" aria-label="Top 5 productos por unidades"></canvas></div></div>
      <div class="card"><h2>Top 5 por monto</h2><p class="sub">Últimos 30 días</p><div class="grafico"><canvas id="g-monto" aria-label="Top 5 productos por monto"></canvas></div></div>
      <div class="card ancho-completo"><h2>Ventas de los últimos 30 días</h2><p class="sub">Monto total vendido por día (S/)</p><div class="grafico"><canvas id="g-linea" aria-label="Ventas diarias últimos 30 días"></canvas></div></div>
    </section>
    <section class="grid-2col">
      <div class="card"><h2>Insumos por reponer</h2>
        ${bajos.length ? `<ul class="lista-simple">${bajos.slice(0, 6).map((i) => `<li><span>${esc(i.nombre)}</span><span class="pequeno">${cantidadConUnidad(i.stock, i)} / mín. ${Util.num(i.minimo, 3)}</span></li>`).join('')}</ul>
          <p class="sub"><a href="#reportes" data-accion="ir-compras">Ver lista sugerida de compras →</a></p>` : '<p class="sub">No hay insumos por debajo del mínimo.</p>'}
      </div>
      <div class="card"><h2>Próximas tareas</h2>
        ${proximas.length ? `<ul class="lista-simple">${proximas.map((t) => `<li><span>${esc(t.titulo)}<br><span class="pequeno">${esc(t.responsable || 'Sin asignar')} · ${badgePrioridad(t.prioridad)}</span></span>
          <span class="pequeno">${Calc.tareaVencida(t) ? badge('Vencida ' + Util.fechaLegible(t.fechaLimite), 'rojo') : Util.fechaLegible(t.fechaLimite)}</span></li>`).join('')}</ul>` : '<p class="sub">No hay tareas pendientes. 🎉</p>'}
      </div>
    </section>`;

  App.acciones['nueva-venta'] = () => formVenta();
  App.acciones['ir-compras'] = (id, el, e) => { e.preventDefault(); App.estado.reportes.id = 'compras'; location.hash = 'reportes'; };

  const top5U = rank30.slice(0, 5);
  const top5M = [...rank30].sort((a, b) => b.monto - a.monto).slice(0, 5);
  const max = window.innerWidth < 600 ? 16 : 30;
  const corto = (r) => { const t = etiquetaProducto(r); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
  const opcionesBarra = (formato, formatoEje = formato) => ({
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formato(c.parsed.x) } } },
    scales: { x: { beginAtZero: true, grid: { color: COLOR.grilla }, ticks: { color: COLOR.texto, maxRotation: 0, callback: (v) => formatoEje(v) } }, y: { grid: { display: false }, ticks: { color: COLOR.texto } } },
  });
  if (top5U.length) {
    grafico('g-unidades', { type: 'bar', data: { labels: top5U.map(corto), datasets: [{ data: top5U.map((r) => r.unidades), backgroundColor: COLOR.choco, borderRadius: 6 }] }, options: opcionesBarra((v) => `${Util.num(v)} unid.`) });
    grafico('g-monto', { type: 'bar', data: { labels: top5M.map(corto), datasets: [{ data: top5M.map((r) => Util.r2(r.monto)), backgroundColor: COLOR.verde, borderRadius: 6 }] }, options: opcionesBarra((v) => Util.soles(v), (v) => 'S/ ' + Util.num(v, 0)) });
  } else {
    ['g-unidades', 'g-monto'].forEach((id) => { $('#' + id).parentElement.innerHTML = vacio('Sin ventas en los últimos 30 días.'); });
  }

  const porDia = {};
  Calc.ventasEnRango(desde, hoy).forEach((v) => { porDia[v.fecha] = (porDia[v.fecha] || 0) + Number(v.total); });
  const dias = Array.from({ length: 30 }, (_, i) => Util.sumarDias(desde, i));
  grafico('g-linea', {
    type: 'line',
    data: {
      labels: dias.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)),
      datasets: [{ data: dias.map((d) => Util.r2(porDia[d] || 0)), borderColor: COLOR.caramelo, backgroundColor: 'rgba(201,139,75,.15)', fill: true, tension: .3, cubicInterpolationMode: 'monotone', pointRadius: 3, pointBackgroundColor: COLOR.choco }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => Util.soles(c.parsed.y) } } },
      scales: { y: { beginAtZero: true, grid: { color: COLOR.grilla }, ticks: { color: COLOR.texto, callback: (v) => 'S/ ' + v } }, x: { grid: { display: false }, ticks: { color: COLOR.texto, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } } },
    },
  });
}

/* =========================================================
   2. Productos
   ========================================================= */
function vistaProductos(cont) {
  const st = App.estado.productos;
  cont.innerHTML = cabecera('Productos', 'Catálogo de tortas y tés', '<button class="btn btn-primario" data-accion="nuevo">+ Nuevo producto</button>') + `
    <div class="filtros">
      ${campo('Buscar', `<input type="search" id="f-texto" value="${esc(st.texto)}" placeholder="Nombre o presentación">`)}
      ${campo('Categoría', `<select id="f-categoria">${opciones(CATEGORIAS, st.categoria, 'Todas')}</select>`)}
      ${campo('Estado', `<select id="f-activo">${opciones([['1', 'Activos'], ['0', 'Inactivos']], st.activo, 'Todos')}</select>`)}
    </div>
    <div id="tabla"></div>`;

  const pintar = () => {
    const ins = Calc.insumosPorId();
    const texto = st.texto.trim().toLowerCase();
    const lista = Storage.get('productos').filter((p) =>
      (!texto || `${p.nombre} ${p.presentacion}`.toLowerCase().includes(texto)) &&
      (!st.categoria || p.categoria === st.categoria) &&
      (st.activo === '' || String(Number(p.activo)) === st.activo),
    ).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre) || a.precio - b.precio);

    $('#tabla').innerHTML = lista.length ? `<div class="tabla-wrap"><table>
      <thead><tr><th>Producto</th><th>Categoría</th><th>Presentación</th><th class="num">Precio</th><th class="num">Costo</th><th class="num">Margen</th><th>Estado</th><th class="num">Acciones</th></tr></thead>
      <tbody>${lista.map((p) => {
        const tieneReceta = Calc.receta(p.id).length > 0;
        const costo = Calc.costoProducto(p.id, ins);
        return `<tr class="${p.activo ? '' : 'inactivo'}">
          <td><b>${esc(p.nombre)}</b></td><td>${badge(p.categoria, p.categoria === 'Torta' ? 'choco' : 'verde')}</td><td>${esc(p.presentacion)}</td>
          <td class="num">${Util.soles(p.precio)}</td><td class="num">${tieneReceta ? Util.soles(costo) : '—'}</td>
          <td class="num">${badgeMargen((p.precio - costo) / p.precio, tieneReceta)}</td>
          <td><button class="btn btn-sec btn-sm" data-accion="alternar" data-id="${p.id}" title="Cambiar estado">${p.activo ? 'Activo' : 'Inactivo'}</button></td>
          <td class="acciones"><button class="btn-icono" data-accion="receta" data-id="${p.id}" title="Editar receta" aria-label="Editar receta">📋</button>
          <button class="btn-icono" data-accion="editar" data-id="${p.id}" title="Editar" aria-label="Editar">✏️</button>
          <button class="btn-icono peligro" data-accion="eliminar" data-id="${p.id}" title="Eliminar" aria-label="Eliminar">🗑️</button></td></tr>`;
      }).join('')}</tbody></table></div>` : vacio('No hay productos que coincidan con los filtros.');
  };
  pintar();

  $('#f-texto').addEventListener('input', (e) => { st.texto = e.target.value; pintar(); });
  $('#f-categoria').addEventListener('change', (e) => { st.categoria = e.target.value; pintar(); });
  $('#f-activo').addEventListener('change', (e) => { st.activo = e.target.value; pintar(); });

  const buscar = (id) => Storage.get('productos').find((p) => p.id === id);
  App.acciones.nuevo = () => formProducto();
  App.acciones.editar = (id) => formProducto(buscar(id));
  App.acciones.receta = (id) => formReceta(buscar(id));
  App.acciones.alternar = (id) => {
    const p = buscar(id);
    p.activo = !p.activo;
    Storage.set('productos', Storage.get('productos'));
    toast(`«${etiquetaProducto(p)}» ahora está ${p.activo ? 'activo' : 'inactivo'}.`);
    pintar();
  };
  App.acciones.eliminar = async (id) => {
    const p = buscar(id);
    const nVentas = Storage.get('ventas').filter((v) => v.items.some((it) => it.productoId === id)).length;
    const extra = nVentas ? `<br><br>Tiene <b>${nVentas}</b> venta(s) registradas: el historial se conserva. Si solo dejarás de venderlo, mejor márcalo como <b>inactivo</b>.` : '';
    if (!(await confirmar(`Se eliminará <b>${esc(etiquetaProducto(p))}</b> y su receta.${extra}`))) return;
    Storage.set('productos', Storage.get('productos').filter((x) => x.id !== id));
    const recetas = Storage.get('recetas');
    delete recetas[id];
    Storage.set('recetas', recetas);
    toast('Producto eliminado.');
    render();
  };
}

function formProducto(p, { alGuardar } = {}) {
  const nuevo = !p;
  const d = p || { nombre: '', categoria: 'Torta', presentacion: '', precio: '', activo: true };
  abrirModal({
    titulo: nuevo ? 'Nuevo producto' : 'Editar producto',
    cuerpo: `<div class="grid-form">
      ${campo('Nombre', `<input name="nombre" required minlength="2" maxlength="80" value="${esc(d.nombre)}" placeholder="Ej. Torta de chocolate húmeda">`, { clase: 'col-2' })}
      ${campo('Categoría', `<select name="categoria" required>${opciones(CATEGORIAS, d.categoria)}</select>`)}
      ${campo('Presentación', `<input name="presentacion" required maxlength="40" list="dl-presentaciones" value="${esc(d.presentacion)}" placeholder="Ej. Porción, Bolsa 50 g">`)}
      ${campo('Precio de venta (S/)', `<input name="precio" type="number" required min="0.01" step="0.01" inputmode="decimal" value="${esc(d.precio)}">`)}
      <label class="check" style="align-self:end"><input type="checkbox" name="activo" ${d.activo ? 'checked' : ''}> Activo (disponible para vender)</label>
      <datalist id="dl-presentaciones">${PRESENTACIONES.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    </div>`,
    alEnviar(form) {
      const f = form.elements;
      const nombre = f.nombre.value.trim();
      const presentacion = f.presentacion.value.trim();
      const precio = Util.r2(f.precio.value);
      if (nombre.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
      if (!presentacion) return 'Indica la presentación.';
      if (!(precio > 0)) return 'El precio debe ser mayor que 0.';
      const lista = Storage.get('productos');
      const dup = lista.find((x) => x.id !== d.id && x.nombre.toLowerCase() === nombre.toLowerCase() && x.presentacion.toLowerCase() === presentacion.toLowerCase());
      if (dup) return 'Ya existe un producto con ese nombre y presentación.';
      const datos = { nombre, categoria: f.categoria.value, presentacion, precio, activo: f.activo.checked };
      let prod;
      if (nuevo) {
        prod = { id: Util.uid('p'), ...datos, creado: new Date().toISOString() };
        lista.push(prod);
      } else {
        prod = Object.assign(lista.find((x) => x.id === d.id), datos);
      }
      Storage.set('productos', lista);
      toast(nuevo ? 'Producto creado. Ahora define su receta.' : 'Producto actualizado.');
      if (alGuardar) alGuardar(prod); else render();
    },
  });
}

/* =========================================================
   3. Insumos
   ========================================================= */
function vistaInsumos(cont) {
  const st = App.estado.insumos;
  cont.innerHTML = cabecera('Insumos', 'Inventario, stock mínimo y compras',
    '<button class="btn btn-sec" data-accion="entrada">+ Registrar entrada</button><button class="btn btn-primario" data-accion="nuevo">+ Nuevo insumo</button>') + `
    <div class="filtros">
      ${campo('Buscar', `<input type="search" id="f-texto" value="${esc(st.texto)}" placeholder="Nombre o proveedor">`)}
      <label class="check"><input type="checkbox" id="f-bajo" ${st.soloBajo ? 'checked' : ''}> Solo stock bajo</label>
    </div>
    <div id="tabla"></div>
    <h2 style="margin:28px 0 10px">Entradas recientes</h2>
    <div id="tabla-compras"></div>`;

  const pintar = () => {
    const texto = st.texto.trim().toLowerCase();
    const lista = Storage.get('insumos').filter((i) =>
      (!texto || `${i.nombre} ${i.proveedor || ''}`.toLowerCase().includes(texto)) && (!st.soloBajo || Number(i.stock) < Number(i.minimo)),
    ).sort((a, b) => a.nombre.localeCompare(b.nombre));
    $('#tabla').innerHTML = lista.length ? `<div class="tabla-wrap"><table>
      <thead><tr><th>Insumo</th><th>Unidad</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Costo / unidad</th><th>Proveedor</th><th class="num">Acciones</th></tr></thead>
      <tbody>${lista.map((i) => {
        const bajo = Number(i.stock) < Number(i.minimo);
        return `<tr class="${bajo ? 'fila-alerta' : ''}">
          <td><b>${esc(i.nombre)}</b>${bajo ? ` ${badge('Stock bajo', 'rojo')}` : ''}</td><td>${esc(i.unidad)}</td>
          <td class="num"><b>${Util.num(i.stock, 3)}</b></td><td class="num">${Util.num(i.minimo, 3)}</td>
          <td class="num">${Util.soles(i.costo)}${Number(i.costo) < 0.1 && Number(i.costo) > 0 ? `<br><span class="pequeno">${Util.num(i.costo, 4)}</span>` : ''}</td>
          <td>${esc(i.proveedor || '—')}</td>
          <td class="acciones"><button class="btn btn-sec btn-sm" data-accion="entrada" data-id="${i.id}">+ Entrada</button>
          <button class="btn-icono" data-accion="editar" data-id="${i.id}" title="Editar" aria-label="Editar">✏️</button>
          <button class="btn-icono peligro" data-accion="eliminar" data-id="${i.id}" title="Eliminar" aria-label="Eliminar">🗑️</button></td></tr>`;
      }).join('')}</tbody></table></div>` : vacio(st.soloBajo ? 'Ningún insumo está por debajo del mínimo. 👌' : 'No hay insumos que coincidan.');

    const ins = Calc.insumosPorId();
    const compras = [...Storage.get('compras')].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || '')).slice(0, 30);
    $('#tabla-compras').innerHTML = compras.length ? `<div class="tabla-wrap"><table>
      <thead><tr><th>Fecha</th><th>Insumo</th><th class="num">Cantidad</th><th class="num">Costo total</th><th>Nota</th><th class="num"></th></tr></thead>
      <tbody>${compras.map((c) => `<tr><td>${Util.fechaLegible(c.fecha)}</td><td>${esc(ins[c.insumoId]?.nombre || '(insumo eliminado)')}</td>
        <td class="num">${cantidadConUnidad(c.cantidad, ins[c.insumoId])}</td><td class="num">${c.costoTotal ? Util.soles(c.costoTotal) : '—'}</td>
        <td>${esc(c.nota || '')}</td>
        <td class="acciones"><button class="btn-icono peligro" data-accion="eliminar-compra" data-id="${c.id}" title="Anular entrada" aria-label="Anular entrada">🗑️</button></td></tr>`).join('')}</tbody></table></div>`
      : vacio('Aún no registras entradas de insumos.');
  };
  pintar();

  $('#f-texto').addEventListener('input', (e) => { st.texto = e.target.value; pintar(); });
  $('#f-bajo').addEventListener('change', (e) => { st.soloBajo = e.target.checked; pintar(); });

  const buscar = (id) => Storage.get('insumos').find((i) => i.id === id);
  App.acciones.nuevo = () => formInsumo();
  App.acciones.editar = (id) => formInsumo(buscar(id));
  App.acciones.entrada = (id) => formEntrada(id);
  App.acciones.eliminar = async (id) => {
    const i = buscar(id);
    const recetas = Storage.get('recetas');
    const usos = Object.keys(recetas).filter((pid) => recetas[pid].some((l) => l.insumoId === id));
    const extra = usos.length ? `<br><br>Se usa en <b>${usos.length}</b> receta(s); se quitará de ellas y cambiará su costo.` : '';
    if (!(await confirmar(`Se eliminará el insumo <b>${esc(i.nombre)}</b>.${extra}`))) return;
    usos.forEach((pid) => { recetas[pid] = recetas[pid].filter((l) => l.insumoId !== id); });
    Storage.set('recetas', recetas);
    Storage.set('insumos', Storage.get('insumos').filter((x) => x.id !== id));
    toast('Insumo eliminado.');
    render();
  };
  App.acciones['eliminar-compra'] = async (id) => {
    const c = Storage.get('compras').find((x) => x.id === id);
    const i = buscar(c.insumoId);
    const msg = i ? `Se anulará la entrada y se restarán <b>${cantidadConUnidad(c.cantidad, i)}</b> del stock de <b>${esc(i.nombre)}</b>.` : 'Se anulará esta entrada.';
    if (!(await confirmar(msg, { ok: 'Anular entrada' }))) return;
    if (i) {
      i.stock = Util.r4(Number(i.stock) - Number(c.cantidad));
      Storage.set('insumos', Storage.get('insumos'));
    }
    Storage.set('compras', Storage.get('compras').filter((x) => x.id !== id));
    toast('Entrada anulada.');
    render();
  };
}

function formInsumo(i) {
  const nuevo = !i;
  const d = i || { nombre: '', unidad: 'g', stock: '', minimo: '', costo: '', proveedor: '' };
  abrirModal({
    titulo: nuevo ? 'Nuevo insumo' : 'Editar insumo',
    cuerpo: `<div class="grid-form">
      ${campo('Nombre', `<input name="nombre" required minlength="2" maxlength="80" value="${esc(d.nombre)}" placeholder="Ej. Harina, Hojas de té verde">`, { clase: 'col-2' })}
      ${campo('Unidad de medida', `<select name="unidad" required>${opciones(UNIDADES, d.unidad)}</select>`, { ayuda: 'Las recetas usan esta unidad.' })}
      ${campo('Costo por unidad (S/)', `<input name="costo" type="number" required min="0" step="any" inputmode="decimal" value="${esc(d.costo)}">`, { ayuda: 'Ej. si 1 kg de cacao cuesta S/ 60 y la unidad es g: 0.06' })}
      ${campo('Stock actual', `<input name="stock" type="number" required step="any" inputmode="decimal" value="${esc(d.stock)}">`)}
      ${campo('Stock mínimo', `<input name="minimo" type="number" required min="0" step="any" inputmode="decimal" value="${esc(d.minimo)}">`, { ayuda: 'Por debajo de este valor se muestra la alerta.' })}
      ${campo('Proveedor', `<input name="proveedor" maxlength="80" value="${esc(d.proveedor || '')}">`, { clase: 'col-2' })}
    </div>`,
    alEnviar(form) {
      const f = form.elements;
      const nombre = f.nombre.value.trim();
      const stock = numero(f.stock.value), minimo = numero(f.minimo.value), costo = numero(f.costo.value);
      if (nombre.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
      if (!Number.isFinite(stock)) return 'Indica el stock actual.';
      if (!(minimo >= 0)) return 'El stock mínimo no puede ser negativo.';
      if (!(costo >= 0)) return 'El costo no puede ser negativo.';
      const lista = Storage.get('insumos');
      if (lista.some((x) => x.id !== d.id && x.nombre.toLowerCase() === nombre.toLowerCase())) return 'Ya existe un insumo con ese nombre.';
      const datos = { nombre, unidad: f.unidad.value, stock, minimo, costo, proveedor: f.proveedor.value.trim() };
      if (nuevo) lista.push({ id: Util.uid('i'), ...datos });
      else Object.assign(lista.find((x) => x.id === d.id), datos);
      Storage.set('insumos', lista);
      toast(nuevo ? 'Insumo creado.' : 'Insumo actualizado.');
      render();
    },
  });
}

function formEntrada(insumoId = '') {
  const insumos = [...Storage.get('insumos')].sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!insumos.length) { toast('Primero crea un insumo.', 'error'); return; }
  abrirModal({
    titulo: 'Registrar entrada de insumo',
    textoOk: 'Registrar entrada',
    cuerpo: `<div class="grid-form">
      ${campo('Insumo', `<select name="insumoId" required>${opciones(insumos.map((i) => [i.id, `${i.nombre} (${i.unidad})`]), insumoId, 'Elige un insumo…')}</select>`, { clase: 'col-2' })}
      ${campo('Fecha', `<input name="fecha" type="date" required value="${Util.hoy()}" max="${Util.hoy()}">`)}
      ${campo('Cantidad', `<input name="cantidad" type="number" required min="0" step="any" inputmode="decimal">`, { ayuda: 'En la unidad del insumo.' })}
      ${campo('Costo total de la compra (S/)', '<input name="costoTotal" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Opcional">')}
      <label class="check" style="align-self:end"><input type="checkbox" name="actualizarCosto" checked> Actualizar el costo por unidad</label>
      ${campo('Nota', '<input name="nota" maxlength="120" placeholder="Opcional">', { clase: 'col-2' })}
      <p class="sub col-2" id="info-entrada"></p>
    </div>`,
    alMontar(dlg, form) {
      const info = () => {
        const i = insumos.find((x) => x.id === form.elements.insumoId.value);
        const cant = numero(form.elements.cantidad.value), ct = numero(form.elements.costoTotal.value);
        $('#info-entrada', dlg).innerHTML = i ? `Stock actual: <b>${cantidadConUnidad(i.stock, i)}</b>${cant > 0 ? ` → quedará en <b>${cantidadConUnidad(Number(i.stock) + cant, i)}</b>` : ''}${cant > 0 && ct > 0 ? ` · costo por ${esc(i.unidad)}: <b>${Util.soles(ct / cant)}</b> (${Util.num(ct / cant, 4)})` : ''}` : '';
      };
      form.addEventListener('input', info);
      info();
    },
    alEnviar(form) {
      const f = form.elements;
      const cantidad = numero(f.cantidad.value), costoTotal = numero(f.costoTotal.value);
      if (!(cantidad > 0)) return 'La cantidad debe ser mayor que 0.';
      if (f.fecha.value > Util.hoy()) return 'La fecha no puede ser futura.';
      const lista = Storage.get('insumos');
      const i = lista.find((x) => x.id === f.insumoId.value);
      if (!i) return 'Elige un insumo.';
      i.stock = Util.r4(Number(i.stock) + cantidad);
      if (f.actualizarCosto.checked && costoTotal > 0) i.costo = Util.r4(costoTotal / cantidad);
      Storage.set('insumos', lista);
      const compras = Storage.get('compras');
      compras.push({ id: Util.uid('c'), fecha: f.fecha.value, insumoId: i.id, cantidad, costoTotal: costoTotal > 0 ? Util.r2(costoTotal) : 0, nota: f.nota.value.trim(), creado: new Date().toISOString() });
      Storage.set('compras', compras);
      toast(`Entrada registrada: +${Util.num(cantidad, 3)} ${i.unidad} de ${i.nombre}.`);
      render();
    },
  });
}

/* =========================================================
   Editor de líneas de insumos (recetas y mezclas)
   ========================================================= */
function filaInsumo(insumos, insumoId = '', cantidad = '') {
  return `<div class="fila-item" data-fila>
    <select name="insumoId" required aria-label="Insumo">${opciones(insumos.map((i) => [i.id, `${i.nombre} (${i.unidad})`]), insumoId, 'Elige un insumo…')}</select>
    <input name="cantidad" type="number" required min="0" step="any" inputmode="decimal" value="${esc(cantidad)}" placeholder="Cantidad" aria-label="Cantidad">
    <span class="fila-unidad"></span><span class="fila-costo"></span>
    <button type="button" class="btn-icono peligro" data-quitar aria-label="Quitar insumo" title="Quitar">✕</button></div>`;
}
const CAB_FILAS = '<div class="fila-item fila-cab" aria-hidden="true"><span>Insumo</span><span>Cantidad</span><span>Unidad</span><span style="text-align:right">Costo</span><span></span></div>';

function leerFilas(cont) {
  return $$('[data-fila]', cont).map((f) => ({ insumoId: $('[name=insumoId]', f).value, cantidad: numero($('[name=cantidad]', f).value) }));
}

/** Conecta agregar/quitar filas y recalcula al cambiar. */
function montarFilas(dlg, contenedor, insumos, alCambiar) {
  const insMap = Object.fromEntries(insumos.map((i) => [i.id, i]));
  const actualizar = () => {
    $$('[data-fila]', contenedor).forEach((f) => {
      const i = insMap[$('[name=insumoId]', f).value];
      const cant = numero($('[name=cantidad]', f).value);
      $('.fila-unidad', f).textContent = i ? i.unidad : '';
      $('.fila-costo', f).textContent = i && cant > 0 ? Util.soles(cant * i.costo) : '';
    });
    alCambiar(leerFilas(contenedor), insMap);
  };
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-agregar]')?.dataset.agregar === contenedor.id) {
      contenedor.insertAdjacentHTML('beforeend', filaInsumo(insumos));
      $$('[data-fila]', contenedor).pop().querySelector('select').focus();
      actualizar();
    }
    const quitar = e.target.closest('[data-quitar]');
    if (quitar && contenedor.contains(quitar)) { quitar.closest('[data-fila]').remove(); actualizar(); }
  });
  dlg.addEventListener('input', actualizar);
  dlg.addEventListener('change', actualizar);
  actualizar();
}

function validarFilas(filas, { minimo = 1, excluir = [] } = {}) {
  if (filas.length < minimo) return 'Agrega al menos un insumo.';
  const vistos = new Set(excluir);
  for (const l of filas) {
    if (!l.insumoId) return 'Hay una fila sin insumo seleccionado.';
    if (!(l.cantidad > 0)) return 'Todas las cantidades deben ser mayores que 0.';
    if (vistos.has(l.insumoId)) return 'Hay insumos repetidos: combínalos en una sola fila.';
    vistos.add(l.insumoId);
  }
  return null;
}

/* =========================================================
   4. Recetas
   ========================================================= */
function vistaRecetas(cont) {
  const st = App.estado.recetas;
  cont.innerHTML = cabecera('Recetas', 'Insumos por unidad vendida, costo de producción y margen') + `
    <div class="filtros">
      ${campo('Buscar', `<input type="search" id="f-texto" value="${esc(st.texto)}" placeholder="Producto">`)}
      ${campo('Categoría', `<select id="f-categoria">${opciones(CATEGORIAS, st.categoria, 'Todas')}</select>`)}
    </div><div id="grid"></div>`;

  const pintar = () => {
    const ins = Calc.insumosPorId();
    const texto = st.texto.trim().toLowerCase();
    const lista = Storage.get('productos').filter((p) =>
      (!texto || `${p.nombre} ${p.presentacion}`.toLowerCase().includes(texto)) && (!st.categoria || p.categoria === st.categoria),
    ).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
    $('#grid').innerHTML = lista.length ? `<div class="grid-cards">${lista.map((p) => {
      const lineas = Calc.receta(p.id);
      const costo = Calc.costoLineas(lineas, ins);
      const margen = p.precio - costo;
      return `<article class="card card-item">
        <header><div><h3>${esc(p.nombre)}</h3><span class="pequeno">${esc(p.presentacion)}${p.activo ? '' : ' · inactivo'}</span></div>${badge(p.categoria, p.categoria === 'Torta' ? 'choco' : 'verde')}</header>
        ${lineas.length ? `<ul class="lineas">${lineas.map((l) => {
          const i = ins[l.insumoId];
          return `<li><span>${esc(i ? i.nombre : '(insumo eliminado)')}</span><span>${cantidadConUnidad(l.cantidad, i)} · ${Util.soles(l.cantidad * (i?.costo || 0))}</span></li>`;
        }).join('')}</ul>` : '<div class="aviso aviso-info">Sin receta: las ventas de este producto no descontarán insumos.</div>'}
        <div class="metricas"><div>Precio<b>${Util.soles(p.precio)}</b></div><div>Costo<b>${Util.soles(costo)}</b></div>
          <div>Margen<b>${Util.soles(margen)}</b>${badgeMargen(p.precio ? margen / p.precio : 0, lineas.length > 0)}</div></div>
        <div class="pie"><button class="btn btn-primario btn-sm" data-accion="editar" data-id="${p.id}">${lineas.length ? 'Editar receta' : '+ Definir receta'}</button></div>
      </article>`;
    }).join('')}</div>` : vacio('No hay productos. Crea uno en <a href="#productos">Productos</a>.');
  };
  pintar();
  $('#f-texto').addEventListener('input', (e) => { st.texto = e.target.value; pintar(); });
  $('#f-categoria').addEventListener('change', (e) => { st.categoria = e.target.value; pintar(); });
  App.acciones.editar = (id) => formReceta(Storage.get('productos').find((p) => p.id === id));
}

function formReceta(p) {
  const insumos = [...Storage.get('insumos')].sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!insumos.length) { toast('Primero registra insumos.', 'error'); return; }
  const lineas = Calc.receta(p.id);
  abrirModal({
    titulo: `Receta: ${etiquetaProducto(p)}`,
    clase: 'ancho',
    cuerpo: `<p class="sub" style="margin-bottom:12px">Cantidad de cada insumo para <b>1 unidad</b> vendida (${esc(p.presentacion)}), en la unidad del insumo.</p>
      ${CAB_FILAS}<div class="filas" id="filas-receta">${lineas.map((l) => filaInsumo(insumos, l.insumoId, l.cantidad)).join('')}</div>
      <p style="margin-top:10px"><button type="button" class="btn btn-sec btn-sm" data-agregar="filas-receta">+ Agregar insumo</button></p>
      <div class="totales-form" id="totales-receta"></div>`,
    alMontar(dlg) {
      const cont = $('#filas-receta', dlg);
      if (!lineas.length) cont.insertAdjacentHTML('beforeend', filaInsumo(insumos));
      montarFilas(dlg, cont, insumos, (filas, insMap) => {
        const costo = Calc.costoLineas(filas.filter((l) => l.cantidad > 0), insMap);
        const margen = p.precio - costo;
        $('#totales-receta', dlg).innerHTML = `<span>Costo: <b>${Util.soles(costo)}</b></span><span>Precio: <b>${Util.soles(p.precio)}</b></span>
          <span>Margen: <b>${Util.soles(margen)}</b> ${badgeMargen(p.precio ? margen / p.precio : 0, true)}</span>`;
      });
    },
    alEnviar(form) {
      const filas = leerFilas($('#filas-receta', form));
      const err = validarFilas(filas, { minimo: 0 });
      if (err) return err;
      const recetas = Storage.get('recetas');
      if (filas.length) recetas[p.id] = filas.map((l) => ({ insumoId: l.insumoId, cantidad: Util.r4(l.cantidad) }));
      else delete recetas[p.id];
      Storage.set('recetas', recetas);
      toast('Receta guardada.');
      render();
    },
  });
}

/* =========================================================
   5. Ventas
   ========================================================= */
function vistaVentas(cont) {
  const st = App.estado.ventas;
  const productos = [...Storage.get('productos')].sort((a, b) => etiquetaProducto(a).localeCompare(etiquetaProducto(b)));
  cont.innerHTML = cabecera('Ventas', 'Registro e historial', '<button class="btn btn-primario" data-accion="nueva">+ Registrar venta</button>') + `
    <div class="filtros">
      ${campo('Desde', `<input type="date" id="f-desde" value="${st.desde}">`)}
      ${campo('Hasta', `<input type="date" id="f-hasta" value="${st.hasta}">`)}
      ${campo('Producto', `<select id="f-producto">${opciones(productos.map((p) => [p.id, etiquetaProducto(p)]), st.producto, 'Todos')}</select>`)}
      ${campo('Categoría', `<select id="f-categoria">${opciones(CATEGORIAS, st.categoria, 'Todas')}</select>`)}
      ${campo('Canal', `<select id="f-canal">${opciones(CANALES, st.canal, 'Todos')}</select>`)}
      <button class="btn btn-sec btn-sm" data-accion="limpiar" style="margin-bottom:4px">Limpiar filtros</button>
    </div>
    <p class="resumen" id="resumen"></p>
    <div id="tabla"></div>`;

  const pintar = () => {
    const lista = Calc.ventasEnRango(st.desde, st.hasta).filter((v) =>
      (!st.canal || v.canal === st.canal) &&
      (!st.producto || v.items.some((it) => it.productoId === st.producto)) &&
      (!st.categoria || v.items.some((it) => it.categoria === st.categoria)),
    ).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || ''));
    // Si se filtra por producto/categoría, el resumen cuenta solo esas líneas.
    const lineas = Calc.lineasVenta(lista).filter((l) => (!st.producto || l.productoId === st.producto) && (!st.categoria || l.categoria === st.categoria));
    const unidades = lineas.reduce((s, l) => s + Number(l.cantidad), 0);
    const monto = lineas.reduce((s, l) => s + Number(l.subtotal), 0);
    $('#resumen').innerHTML = `<span><b>${lista.length}</b> venta(s)</span><span><b>${Util.num(unidades)}</b> unidades</span><span>Monto: <b>${Util.soles(monto)}</b></span>${st.producto || st.categoria ? '<span class="pequeno">(solo líneas del filtro)</span>' : ''}`;
    const MAX = 300;
    $('#tabla').innerHTML = lista.length ? `<div class="tabla-wrap"><table>
      <thead><tr><th>Fecha</th><th>Detalle</th><th>Canal</th><th>Pago</th><th class="num">Total</th><th class="num"></th></tr></thead>
      <tbody>${lista.slice(0, MAX).map((v) => `<tr><td>${Util.fechaLegible(v.fecha)}</td>
        <td><ul class="detalle-venta">${v.items.map((it) => `<li>${Util.num(it.cantidad)} × ${esc(it.nombre)} <span class="pequeno">(${esc(it.presentacion)}) · ${Util.soles(it.precio)}</span></li>`).join('')}</ul></td>
        <td>${esc(v.canal)}</td><td>${esc(v.pago)}</td><td class="num"><b>${Util.soles(v.total)}</b></td>
        <td class="acciones"><button class="btn-icono peligro" data-accion="eliminar" data-id="${v.id}" title="Eliminar venta" aria-label="Eliminar venta">🗑️</button></td></tr>`).join('')}</tbody></table></div>
      ${lista.length > MAX ? `<p class="sub">Mostrando las ${MAX} más recientes. Usa los filtros o el reporte en Excel para ver todo.</p>` : ''}`
      : vacio('No hay ventas en este rango.');
  };
  pintar();

  const enlazar = (id, clave) => $(id).addEventListener('change', (e) => { st[clave] = e.target.value; pintar(); });
  enlazar('#f-desde', 'desde'); enlazar('#f-hasta', 'hasta'); enlazar('#f-producto', 'producto'); enlazar('#f-categoria', 'categoria'); enlazar('#f-canal', 'canal');

  App.acciones.nueva = () => formVenta();
  App.acciones.limpiar = () => { Object.assign(st, { desde: Util.primerDiaMes(), hasta: Util.hoy(), producto: '', categoria: '', canal: '' }); render(); };
  App.acciones.eliminar = async (id) => {
    const v = Storage.get('ventas').find((x) => x.id === id);
    const tieneConsumo = (v.consumo || []).length > 0;
    if (!(await confirmar(`Se eliminará la venta del ${Util.fechaLegible(v.fecha)} por <b>${Util.soles(v.total)}</b>.${tieneConsumo ? '<br><br>Los insumos descontados se devolverán al stock.' : ''}`))) return;
    if (tieneConsumo) {
      const insumos = Storage.get('insumos');
      const map = Object.fromEntries(insumos.map((i) => [i.id, i]));
      v.consumo.forEach((c) => { if (map[c.insumoId]) map[c.insumoId].stock = Util.r4(Number(map[c.insumoId].stock) + Number(c.cantidad)); });
      Storage.set('insumos', insumos);
    }
    Storage.set('ventas', Storage.get('ventas').filter((x) => x.id !== id));
    toast('Venta eliminada.');
    render();
  };
}

function filaVenta(productos, productoId = '', cantidad = 1, precio = '') {
  return `<div class="fila-item venta" data-fila>
    <select name="productoId" required aria-label="Producto">${opciones(productos.map((p) => [p.id, `${etiquetaProducto(p)} · ${Util.soles(p.precio)}`]), productoId, 'Elige un producto…')}</select>
    <input name="cantidad" type="number" required min="1" step="1" inputmode="numeric" value="${esc(cantidad)}" aria-label="Cantidad">
    <input name="precio" type="number" required min="0" step="0.01" inputmode="decimal" value="${esc(precio)}" placeholder="Precio" aria-label="Precio unitario">
    <span class="fila-costo"></span>
    <button type="button" class="btn-icono peligro" data-quitar aria-label="Quitar producto" title="Quitar">✕</button></div>`;
}

function formVenta() {
  const productos = Storage.get('productos').filter((p) => p.activo).sort((a, b) => etiquetaProducto(a).localeCompare(etiquetaProducto(b)));
  if (!productos.length) { toast('No hay productos activos. Crea uno en Productos.', 'error'); return; }
  const prodMap = Object.fromEntries(productos.map((p) => [p.id, p]));
  const leer = (cont) => $$('[data-fila]', cont).map((f) => ({
    productoId: $('[name=productoId]', f).value,
    cantidad: numero($('[name=cantidad]', f).value),
    precio: numero($('[name=precio]', f).value),
  }));

  abrirModal({
    titulo: 'Registrar venta',
    textoOk: 'Registrar venta',
    clase: 'ancho',
    cuerpo: `<div class="grid-form">
        ${campo('Fecha', `<input name="fecha" type="date" required value="${Util.hoy()}" max="${Util.hoy()}">`)}
        ${campo('Canal', `<select name="canal" required>${opciones(CANALES, 'Local')}</select>`)}
        ${campo('Método de pago', `<select name="pago" required>${opciones(PAGOS, '', 'Elige…')}</select>`)}
      </div>
      <div class="bloque">
        <div class="bloque-cab"><h3>Productos</h3><button type="button" class="btn btn-sec btn-sm" data-agregar-venta>+ Agregar producto</button></div>
        <div class="fila-item venta fila-cab" aria-hidden="true"><span>Producto</span><span>Cant.</span><span>Precio unit.</span><span style="text-align:right">Subtotal</span><span></span></div>
        <div class="filas" id="filas-venta">${filaVenta(productos)}</div>
        <div class="totales-form"><span>Total: <b id="total-venta">S/ 0.00</b></span></div>
        <div id="stock-venta" style="margin-top:12px"></div>
      </div>`,
    alMontar(dlg) {
      const cont = $('#filas-venta', dlg);
      const actualizar = () => {
        const filas = leer(cont);
        let total = 0;
        $$('[data-fila]', cont).forEach((f, i) => {
          const l = filas[i];
          const sub = l.cantidad > 0 && l.precio >= 0 ? l.cantidad * l.precio : 0;
          total += sub;
          $('.fila-costo', f).textContent = sub ? Util.soles(sub) : '';
        });
        $('#total-venta', dlg).textContent = Util.soles(total);
        const validas = filas.filter((l) => l.productoId && l.cantidad > 0);
        const faltan = Calc.faltantes(Calc.consumo(validas));
        const sinReceta = [...new Set(validas.filter((l) => !Calc.receta(l.productoId).length).map((l) => l.productoId))];
        let html = '';
        if (faltan.length) {
          html += `<div class="aviso aviso-alerta"><b>Stock insuficiente</b> (se puede registrar igual y el stock quedará negativo):<ul>${faltan.map((f) => `<li>${esc(f.insumo.nombre)}: necesitas ${cantidadConUnidad(f.necesita, f.insumo)}, hay ${cantidadConUnidad(f.stock, f.insumo)}</li>`).join('')}</ul></div>`;
        } else if (validas.length) {
          html += '<div class="aviso aviso-ok">✓ Hay stock suficiente de insumos para esta venta.</div>';
        }
        if (sinReceta.length) html += `<div class="aviso aviso-info" style="margin-top:8px">Sin receta (no descuenta insumos): ${sinReceta.map((id) => esc(etiquetaProducto(prodMap[id]))).join(', ')}</div>`;
        $('#stock-venta', dlg).innerHTML = html;
      };
      dlg.addEventListener('change', (e) => {
        if (e.target.name === 'productoId') {
          const p = prodMap[e.target.value];
          const precio = $('[name=precio]', e.target.closest('[data-fila]'));
          if (p) precio.value = p.precio;
        }
        actualizar();
      });
      dlg.addEventListener('input', actualizar);
      dlg.addEventListener('click', (e) => {
        if (e.target.closest('[data-agregar-venta]')) {
          cont.insertAdjacentHTML('beforeend', filaVenta(productos));
          $$('[data-fila]', cont).pop().querySelector('select').focus();
          actualizar();
        }
        const q = e.target.closest('[data-quitar]');
        if (q) { q.closest('[data-fila]').remove(); actualizar(); }
      });
      actualizar();
    },
    async alEnviar(form) {
      const f = form.elements;
      const filas = leer($('#filas-venta', form));
      if (!filas.length) return 'Agrega al menos un producto.';
      if (f.fecha.value > Util.hoy()) return 'La fecha no puede ser futura.';
      for (const l of filas) {
        if (!prodMap[l.productoId]) return 'Hay una fila sin producto seleccionado.';
        if (!(Number.isInteger(l.cantidad) && l.cantidad > 0)) return 'Las cantidades deben ser números enteros mayores que 0.';
        if (!(l.precio >= 0)) return 'Revisa los precios: no pueden estar vacíos ni ser negativos.';
      }
      // Agrupa filas repetidas del mismo producto y precio.
      const agrupadas = [];
      filas.forEach((l) => {
        const ex = agrupadas.find((a) => a.productoId === l.productoId && a.precio === l.precio);
        if (ex) ex.cantidad += l.cantidad; else agrupadas.push({ ...l });
      });
      const consumo = Calc.consumo(agrupadas);
      const faltan = Calc.faltantes(consumo);
      if (faltan.length && !(await confirmar(`No hay stock suficiente de: <b>${faltan.map((x) => esc(x.insumo.nombre)).join(', ')}</b>.<br><br>¿Registrar la venta de todos modos? El stock quedará negativo hasta que registres la compra.`, { titulo: 'Stock insuficiente', ok: 'Registrar igual', peligro: false }))) {
        return false;
      }
      const ins = Calc.insumosPorId();
      const items = agrupadas.map((l) => {
        const p = prodMap[l.productoId];
        return {
          productoId: p.id, nombre: p.nombre, presentacion: p.presentacion, categoria: p.categoria,
          cantidad: l.cantidad, precio: Util.r2(l.precio), subtotal: Util.r2(l.cantidad * l.precio), costoUnit: Util.r4(Calc.costoProducto(p.id, ins)),
        };
      });
      const insumos = Storage.get('insumos');
      const map = Object.fromEntries(insumos.map((i) => [i.id, i]));
      Object.entries(consumo).forEach(([id, cant]) => { if (map[id]) map[id].stock = Util.r4(Number(map[id].stock) - cant); });
      Storage.set('insumos', insumos);
      const venta = {
        id: Util.uid('v'), fecha: f.fecha.value, canal: f.canal.value, pago: f.pago.value, items,
        total: Util.r2(items.reduce((s, it) => s + it.subtotal, 0)),
        consumo: Object.entries(consumo).map(([insumoId, cantidad]) => ({ insumoId, cantidad: Util.r4(cantidad) })),
        creado: new Date().toISOString(),
      };
      const ventas = Storage.get('ventas');
      ventas.push(venta);
      Storage.set('ventas', ventas);
      toast(`Venta registrada: ${Util.soles(venta.total)}.`);
      render();
    },
  });
}

/* =========================================================
   6. Laboratorio de nuevos tés
   ========================================================= */
function vistaLaboratorio(cont) {
  const st = App.estado.laboratorio;
  cont.innerHTML = cabecera('Laboratorio de tés', 'Crea mezclas, calcula su costo y revisa si hay stock para un lote',
    '<button class="btn btn-primario" data-accion="nueva">+ Nueva mezcla</button>') + `
    <div class="filtros">${campo('Estado', `<select id="f-estado">${opciones(ESTADOS_MEZCLA, st.estado, 'Todos')}</select>`)}</div>
    <div id="grid"></div>`;

  const pintar = () => {
    const ins = Calc.insumosPorId();
    const prods = Calc.productosPorId();
    const orden = { aprobado: 0, 'en prueba': 1, idea: 2, descartado: 3 };
    const lista = Storage.get('mezclas').filter((m) => !st.estado || m.estado === st.estado).sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre));
    $('#grid').innerHTML = lista.length ? `<div class="grid-cards">${lista.map((m) => {
      const lineas = Calc.lineasMezcla(m);
      const costoLote = Calc.costoLineas(lineas, ins);
      const rend = Number(m.rendimiento) || 0;
      const costoUnit = rend ? costoLote / rend : 0;
      const faltan = Calc.faltantes(Calc.sumarLineas(lineas), ins);
      const lotes = Calc.lotesPosibles(lineas, ins);
      const gramos = lineas.reduce((s, l) => s + (['g'].includes(ins[l.insumoId]?.unidad) ? l.cantidad : ins[l.insumoId]?.unidad === 'kg' ? l.cantidad * 1000 : 0), 0);
      const enCatalogo = m.productoId && prods[m.productoId];
      return `<article class="card card-item">
        <header><div><h3>${esc(m.nombre)}</h3><span class="pequeno">Base: ${esc(ins[m.teBaseId]?.nombre || '(insumo eliminado)')}</span></div>${badgeEstadoMezcla(m.estado)}</header>
        <ul class="lineas">${lineas.map((l, i) => {
          const x = ins[l.insumoId];
          return `<li><span>${i === 0 ? '🍃 ' : ''}${esc(x ? x.nombre : '(insumo eliminado)')}</span><span>${cantidadConUnidad(l.cantidad, x)} · ${Util.soles(l.cantidad * (x?.costo || 0))}</span></li>`;
        }).join('')}</ul>
        ${m.notas ? `<p class="notas">“${esc(m.notas)}”</p>` : ''}
        <div class="metricas"><div>Costo por lote<b>${Util.soles(costoLote)}</b><span>${gramos ? Util.num(gramos, 0) + ' g' : ''}</span></div>
          <div>Costo por unidad<b>${rend ? Util.soles(costoUnit) : '—'}</b><span>${rend ? `${rend} × ${esc(m.presentacion || 'unidad')}` : ''}</span></div>
          <div>Margen<b>${m.precio && rend ? Util.pct((m.precio - costoUnit) / m.precio) : '—'}</b><span>${m.precio ? 'a ' + Util.soles(m.precio) : ''}</span></div></div>
        ${faltan.length ? `<div class="aviso aviso-alerta"><b>Falta stock para 1 lote:</b><ul>${faltan.map((f) => `<li>${esc(f.insumo.nombre)}: faltan ${cantidadConUnidad(f.falta, f.insumo)}</li>`).join('')}</ul></div>`
          : `<div class="aviso aviso-ok">✓ Hay stock para ${lotes} lote(s).</div>`}
        <div class="pie">
          <button class="btn btn-sec btn-sm" data-accion="editar" data-id="${m.id}">Editar</button>
          ${enCatalogo ? badge('En catálogo ✓', 'verde') : m.estado === 'aprobado' ? `<button class="btn btn-choco btn-sm" data-accion="catalogo" data-id="${m.id}">Pasar a catálogo</button>` : ''}
          <button class="btn-icono peligro" data-accion="eliminar" data-id="${m.id}" title="Eliminar" aria-label="Eliminar mezcla" style="margin-left:auto">🗑️</button>
        </div></article>`;
    }).join('')}</div>` : vacio('No hay mezclas. ¡Crea tu primera idea de té! 🍵');
  };
  pintar();
  $('#f-estado').addEventListener('change', (e) => { st.estado = e.target.value; pintar(); });

  const buscar = (id) => Storage.get('mezclas').find((m) => m.id === id);
  App.acciones.nueva = () => formMezcla();
  App.acciones.editar = (id) => formMezcla(buscar(id));
  App.acciones.catalogo = (id) => formPasarCatalogo(buscar(id));
  App.acciones.eliminar = async (id) => {
    const m = buscar(id);
    if (!(await confirmar(`Se eliminará la mezcla <b>${esc(m.nombre)}</b>.${m.productoId ? '<br><br>El producto creado en el catálogo no se borra.' : ''}`))) return;
    Storage.set('mezclas', Storage.get('mezclas').filter((x) => x.id !== id));
    toast('Mezcla eliminada.');
    render();
  };
}

function formMezcla(m) {
  const nuevo = !m;
  const insumos = [...Storage.get('insumos')].sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!insumos.length) { toast('Primero registra insumos (hojas de té, frutas secas, especias).', 'error'); return; }
  const d = m || { nombre: '', estado: 'idea', teBaseId: '', teBaseCantidad: '', componentes: [], notas: '', rendimiento: 10, presentacion: 'Bolsa 50 g', precio: '' };
  const bases = insumos.filter((i) => /t[ée]|hierba|rooibos|mate/i.test(i.nombre));
  const listaBases = (bases.length ? bases : insumos).map((i) => [i.id, `${i.nombre} (${i.unidad})`]);
  if (d.teBaseId && !listaBases.some(([id]) => id === d.teBaseId)) {
    const b = insumos.find((i) => i.id === d.teBaseId);
    if (b) listaBases.push([b.id, `${b.nombre} (${b.unidad})`]);
  }

  abrirModal({
    titulo: nuevo ? 'Nueva mezcla de té' : 'Editar mezcla',
    clase: 'ancho',
    cuerpo: `<div class="grid-form">
        ${campo('Nombre de la mezcla', `<input name="nombre" required minlength="2" maxlength="80" value="${esc(d.nombre)}" placeholder="Ej. Chai de la casa">`)}
        ${campo('Estado', `<select name="estado" required>${opciones(ESTADOS_MEZCLA, d.estado)}</select>`)}
        ${campo('Té base', `<select name="teBaseId" required>${opciones(listaBases, d.teBaseId, 'Elige el té base…')}</select>`)}
        ${campo('Cantidad de té base por lote', `<input name="teBaseCantidad" type="number" required min="0" step="any" inputmode="decimal" value="${esc(d.teBaseCantidad)}">`, { ayuda: 'En la unidad del insumo (normalmente gramos).' })}
      </div>
      <div class="bloque">
        <div class="bloque-cab"><h3>Frutas secas y especias (por lote)</h3><button type="button" class="btn btn-sec btn-sm" data-agregar="filas-mezcla">+ Agregar</button></div>
        ${CAB_FILAS}<div class="filas" id="filas-mezcla">${(d.componentes || []).map((l) => filaInsumo(insumos, l.insumoId, l.cantidad)).join('')}</div>
      </div>
      <div class="bloque grid-form">
        ${campo('Notas de sabor', `<textarea name="notas" maxlength="400" placeholder="Aroma, dulzor, acidez, ideas para mejorar…">${esc(d.notas)}</textarea>`, { clase: 'col-2' })}
        ${campo('Rendimiento del lote (unidades)', `<input name="rendimiento" type="number" required min="1" step="1" inputmode="numeric" value="${esc(d.rendimiento)}">`, { ayuda: 'Ej. 10 bolsas de 50 g.' })}
        ${campo('Presentación', `<input name="presentacion" maxlength="40" list="dl-pres-te" value="${esc(d.presentacion)}">`)}
        ${campo('Precio sugerido (S/)', `<input name="precio" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(d.precio)}" placeholder="Opcional">`)}
        <datalist id="dl-pres-te">${PRESENTACIONES.filter((x) => !/torta|porci/i.test(x)).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      </div>
      <div class="totales-form" id="totales-mezcla"></div>
      <div id="stock-mezcla" style="margin-top:10px"></div>`,
    alMontar(dlg, form) {
      const f = form.elements;
      montarFilas(dlg, $('#filas-mezcla', dlg), insumos, (filas, insMap) => {
        const lineas = [{ insumoId: f.teBaseId.value, cantidad: numero(f.teBaseCantidad.value) }, ...filas].filter((l) => l.insumoId && l.cantidad > 0);
        const costo = Calc.costoLineas(lineas, insMap);
        const rend = numero(f.rendimiento.value);
        const precio = numero(f.precio.value);
        const unit = rend > 0 ? costo / rend : 0;
        $('#totales-mezcla', dlg).innerHTML = `<span>Costo por lote: <b>${Util.soles(costo)}</b></span>
          ${rend > 0 ? `<span>Costo por unidad: <b>${Util.soles(unit)}</b></span>` : ''}
          ${precio > 0 && rend > 0 ? `<span>Margen: <b>${Util.pct((precio - unit) / precio)}</b></span>` : ''}`;
        const faltan = Calc.faltantes(Calc.sumarLineas(lineas), insMap);
        $('#stock-mezcla', dlg).innerHTML = !lineas.length ? '' : faltan.length
          ? `<div class="aviso aviso-alerta"><b>Falta stock para 1 lote:</b><ul>${faltan.map((x) => `<li>${esc(x.insumo.nombre)}: faltan ${cantidadConUnidad(x.falta, x.insumo)} (hay ${cantidadConUnidad(x.stock, x.insumo)})</li>`).join('')}</ul></div>`
          : `<div class="aviso aviso-ok">✓ Hay stock para ${Calc.lotesPosibles(lineas, insMap)} lote(s).</div>`;
      });
    },
    alEnviar(form) {
      const f = form.elements;
      const nombre = f.nombre.value.trim();
      const base = numero(f.teBaseCantidad.value);
      const rend = numero(f.rendimiento.value);
      const precio = numero(f.precio.value);
      if (nombre.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
      if (!f.teBaseId.value) return 'Elige el té base.';
      if (!(base > 0)) return 'La cantidad de té base debe ser mayor que 0.';
      if (!(Number.isInteger(rend) && rend >= 1)) return 'El rendimiento debe ser un número entero mayor o igual a 1.';
      if (f.precio.value !== '' && !(precio >= 0)) return 'El precio sugerido no puede ser negativo.';
      const componentes = leerFilas($('#filas-mezcla', form));
      const err = validarFilas(componentes, { minimo: 0, excluir: [f.teBaseId.value] });
      if (err) return err.includes('repetidos') ? 'Hay insumos repetidos (incluido el té base): combínalos en una sola fila.' : err;
      const datos = {
        nombre, estado: f.estado.value, teBaseId: f.teBaseId.value, teBaseCantidad: Util.r4(base),
        componentes: componentes.map((l) => ({ insumoId: l.insumoId, cantidad: Util.r4(l.cantidad) })),
        notas: f.notas.value.trim(), rendimiento: rend, presentacion: f.presentacion.value.trim() || 'Bolsa 50 g', precio: f.precio.value === '' ? '' : Util.r2(precio),
      };
      const lista = Storage.get('mezclas');
      if (nuevo) lista.push({ id: Util.uid('m'), ...datos, productoId: null, creado: new Date().toISOString() });
      else Object.assign(lista.find((x) => x.id === d.id), datos);
      Storage.set('mezclas', lista);
      toast(nuevo ? 'Mezcla creada.' : 'Mezcla actualizada.');
      render();
    },
  });
}

function formPasarCatalogo(m) {
  const insumos = [...Storage.get('insumos')].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const opcionesIns = insumos.map((i) => [i.id, `${i.nombre} (${i.unidad})`]);
  const empaque = insumos.find((i) => /bolsa|empaque/i.test(i.nombre) && i.unidad === 'unidad');
  const etiqueta = insumos.find((i) => /etiqueta/i.test(i.nombre) && i.unidad === 'unidad');
  abrirModal({
    titulo: `Pasar a catálogo: ${m.nombre}`,
    textoOk: 'Crear producto',
    cuerpo: `<p class="sub" style="margin-bottom:12px">Se creará un producto de categoría <b>Té</b> con una receta por unidad = insumos del lote ÷ rendimiento.</p>
      <div class="grid-form">
        ${campo('Nombre del producto', `<input name="nombre" required minlength="2" maxlength="80" value="${esc(m.nombre)}">`, { clase: 'col-2' })}
        ${campo('Presentación', `<input name="presentacion" required maxlength="40" value="${esc(m.presentacion || 'Bolsa 50 g')}">`)}
        ${campo('Precio de venta (S/)', `<input name="precio" type="number" required min="0.01" step="0.01" inputmode="decimal" value="${esc(m.precio)}">`)}
        ${campo('Unidades por lote', `<input name="rendimiento" type="number" required min="1" step="1" value="${esc(m.rendimiento || 10)}">`)}
        <span></span>
        ${campo('Empaque (1 por unidad)', `<select name="empaque">${opciones(opcionesIns, empaque?.id || '', 'Ninguno')}</select>`)}
        ${campo('Etiqueta (1 por unidad)', `<select name="etiqueta">${opciones(opcionesIns, etiqueta?.id || '', 'Ninguna')}</select>`)}
      </div>`,
    alEnviar(form) {
      const f = form.elements;
      const nombre = f.nombre.value.trim(), presentacion = f.presentacion.value.trim();
      const precio = Util.r2(f.precio.value), rend = numero(f.rendimiento.value);
      if (nombre.length < 2 || !presentacion) return 'Completa el nombre y la presentación.';
      if (!(precio > 0)) return 'El precio debe ser mayor que 0.';
      if (!(Number.isInteger(rend) && rend >= 1)) return 'Las unidades por lote deben ser un entero mayor o igual a 1.';
      const productos = Storage.get('productos');
      if (productos.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase() && p.presentacion.toLowerCase() === presentacion.toLowerCase())) {
        return 'Ya existe un producto con ese nombre y presentación.';
      }
      const receta = Object.entries(Calc.sumarLineas(Calc.lineasMezcla(m))).map(([insumoId, cant]) => ({ insumoId, cantidad: Util.r4(cant / rend) }));
      [f.empaque.value, f.etiqueta.value].filter(Boolean).forEach((id) => {
        const ex = receta.find((l) => l.insumoId === id);
        if (ex) ex.cantidad += 1; else receta.push({ insumoId: id, cantidad: 1 });
      });
      const prod = { id: Util.uid('p'), nombre, categoria: 'Té', presentacion, precio, activo: true, creado: new Date().toISOString() };
      productos.push(prod);
      Storage.set('productos', productos);
      const recetas = Storage.get('recetas');
      recetas[prod.id] = receta;
      Storage.set('recetas', recetas);
      const mezclas = Storage.get('mezclas');
      Object.assign(mezclas.find((x) => x.id === m.id), { productoId: prod.id, precio, rendimiento: rend, presentacion });
      Storage.set('mezclas', mezclas);
      toast(`«${nombre}» ya está en el catálogo con su receta.`);
      render();
    },
  });
}

/* =========================================================
   7. Tareas
   ========================================================= */
function vistaTareas(cont) {
  const st = App.estado.tareas;
  const tareas = Storage.get('tareas');
  const responsables = [...new Set(tareas.map((t) => t.responsable).filter(Boolean))].sort();
  const cuenta = (e) => tareas.filter((t) => t.estado === e).length;
  const vencidas = tareas.filter(Calc.tareaVencida).length;

  cont.innerHTML = cabecera('Tareas', 'Organiza el trabajo diario',
    `<div class="grupo-botones" role="group" aria-label="Vista"><button type="button" data-accion="modo" data-id="tablero" class="${st.modo === 'tablero' ? 'activo' : ''}">Tablero</button><button type="button" data-accion="modo" data-id="lista" class="${st.modo === 'lista' ? 'activo' : ''}">Lista</button></div>
     <button class="btn btn-primario" data-accion="nueva">+ Nueva tarea</button>`) + `
    <p class="resumen"><span>Pendientes: <b>${cuenta('pendiente')}</b></span><span>En proceso: <b>${cuenta('en proceso')}</b></span><span>Hechas: <b>${cuenta('hecha')}</b></span><span>Vencidas: <b style="color:var(--rojo)">${vencidas}</b></span></p>
    <div class="filtros">
      ${campo('Buscar', `<input type="search" id="f-texto" value="${esc(st.texto)}" placeholder="Título o descripción">`)}
      ${campo('Área', `<select id="f-area">${opciones(AREAS, st.area, 'Todas')}</select>`)}
      ${campo('Responsable', `<select id="f-responsable">${opciones(responsables, st.responsable, 'Todos')}</select>`)}
      ${campo('Prioridad', `<select id="f-prioridad">${opciones(PRIORIDADES, st.prioridad, 'Todas')}</select>`)}
      ${st.modo === 'lista' ? campo('Estado', `<select id="f-estado">${opciones(ESTADOS_TAREA, st.estado, 'Todos')}</select>`) : ''}
    </div>
    <div id="contenido"></div>`;

  const prio = { alta: 0, media: 1, baja: 2 };
  const ordenar = (a, b) => (Calc.tareaVencida(b) - Calc.tareaVencida(a)) || (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999') || prio[a.prioridad] - prio[b.prioridad];

  const pintar = () => {
    const texto = st.texto.trim().toLowerCase();
    const lista = Storage.get('tareas').filter((t) =>
      (!texto || `${t.titulo} ${t.descripcion || ''}`.toLowerCase().includes(texto)) &&
      (!st.area || t.area === st.area) && (!st.responsable || t.responsable === st.responsable) &&
      (!st.prioridad || t.prioridad === st.prioridad) && (st.modo !== 'lista' || !st.estado || t.estado === st.estado),
    ).sort(ordenar);

    if (st.modo === 'lista') {
      $('#contenido').innerHTML = lista.length ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Tarea</th><th>Área</th><th>Responsable</th><th>Prioridad</th><th>Fecha límite</th><th>Estado</th><th class="num"></th></tr></thead>
        <tbody>${lista.map((t) => {
          const venc = Calc.tareaVencida(t);
          return `<tr class="${venc ? 'fila-alerta' : ''}"><td><b>${esc(t.titulo)}</b>${t.descripcion ? `<br><span class="pequeno">${esc(t.descripcion)}</span>` : ''}</td>
            <td>${esc(t.area)}</td><td>${esc(t.responsable || '—')}</td><td>${badgePrioridad(t.prioridad)}</td>
            <td>${venc ? badge('Vencida · ' + Util.fechaLegible(t.fechaLimite), 'rojo') : Util.fechaLegible(t.fechaLimite)}</td>
            <td><select data-cambio="estado" data-id="${t.id}" aria-label="Estado de la tarea" style="min-width:130px">${opciones(ESTADOS_TAREA, t.estado)}</select></td>
            <td class="acciones"><button class="btn-icono" data-accion="editar" data-id="${t.id}" title="Editar" aria-label="Editar">✏️</button>
            <button class="btn-icono peligro" data-accion="eliminar" data-id="${t.id}" title="Eliminar" aria-label="Eliminar">🗑️</button></td></tr>`;
        }).join('')}</tbody></table></div>` : vacio('No hay tareas con estos filtros.');
    } else {
      const orden = ESTADOS_TAREA.map(([e]) => e);
      $('#contenido').innerHTML = `<div class="tablero">${ESTADOS_TAREA.map(([estado, titulo], idx) => {
        const col = lista.filter((t) => t.estado === estado);
        return `<section class="columna" data-columna="${estado}" aria-label="${titulo}"><h2><span>${titulo}</span><span class="badge badge-choco">${col.length}</span></h2>
          ${col.map((t) => {
            const venc = Calc.tareaVencida(t);
            return `<article class="tarea p-${t.prioridad} ${venc ? 'vencida' : ''} ${t.estado === 'hecha' ? 'hecha' : ''}" draggable="true" data-tarea="${t.id}">
              <h3>${esc(t.titulo)}</h3>${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}
              <div class="meta">${badgePrioridad(t.prioridad)}${badge(t.area, 'choco')}${t.responsable ? badge('👤 ' + t.responsable, 'gris') : ''}
                ${t.fechaLimite ? (venc ? badge('Vencida · ' + Util.fechaLegible(t.fechaLimite), 'rojo') : badge('📅 ' + Util.fechaLegible(t.fechaLimite), 'gris')) : ''}</div>
              <div class="mover">
                <span>${idx > 0 ? `<button class="btn-icono" data-accion="mover" data-id="${t.id}" data-destino="${orden[idx - 1]}" title="Mover a ${ESTADOS_TAREA[idx - 1][1]}" aria-label="Mover a ${ESTADOS_TAREA[idx - 1][1]}">◀</button>` : ''}</span>
                <span><button class="btn-icono" data-accion="editar" data-id="${t.id}" title="Editar" aria-label="Editar">✏️</button>
                <button class="btn-icono peligro" data-accion="eliminar" data-id="${t.id}" title="Eliminar" aria-label="Eliminar">🗑️</button>
                ${idx < orden.length - 1 ? `<button class="btn-icono" data-accion="mover" data-id="${t.id}" data-destino="${orden[idx + 1]}" title="Mover a ${ESTADOS_TAREA[idx + 1][1]}" aria-label="Mover a ${ESTADOS_TAREA[idx + 1][1]}">▶</button>` : ''}</span>
              </div></article>`;
          }).join('') || '<p class="pequeno">Sin tareas</p>'}</section>`;
      }).join('')}</div>`;
      montarArrastre();
    }
  };

  const cambiarEstado = (id, estado) => {
    const lista = Storage.get('tareas');
    const t = lista.find((x) => x.id === id);
    if (!t || t.estado === estado) return;
    t.estado = estado;
    Storage.set('tareas', lista);
    toast(`«${t.titulo}» → ${ESTADOS_TAREA.find(([e]) => e === estado)[1]}.`);
    render();
  };

  const montarArrastre = () => {
    $$('[data-tarea]').forEach((el) => el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.tarea); e.dataTransfer.effectAllowed = 'move'; }));
    $$('[data-columna]').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('sobre'); });
      col.addEventListener('dragleave', () => col.classList.remove('sobre'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('sobre'); cambiarEstado(e.dataTransfer.getData('text/plain'), col.dataset.columna); });
    });
  };

  pintar();
  const enlazar = (sel, clave) => { const el = $(sel); if (el) el.addEventListener(el.type === 'search' ? 'input' : 'change', (e) => { st[clave] = e.target.value; pintar(); }); };
  enlazar('#f-texto', 'texto'); enlazar('#f-area', 'area'); enlazar('#f-responsable', 'responsable'); enlazar('#f-prioridad', 'prioridad'); enlazar('#f-estado', 'estado');

  const buscar = (id) => Storage.get('tareas').find((t) => t.id === id);
  App.acciones.modo = (modo) => { st.modo = modo; Storage.pref('tareasModo', modo); render(); };
  App.acciones.nueva = () => formTarea();
  App.acciones.editar = (id) => formTarea(buscar(id));
  App.acciones.mover = (id, el) => cambiarEstado(id, el.dataset.destino);
  App.acciones.eliminar = async (id) => {
    const t = buscar(id);
    if (!(await confirmar(`Se eliminará la tarea <b>${esc(t.titulo)}</b>.`))) return;
    Storage.set('tareas', Storage.get('tareas').filter((x) => x.id !== id));
    toast('Tarea eliminada.');
    render();
  };
  App.cambios.estado = (id, el) => cambiarEstado(id, el.value);
}

function formTarea(t) {
  const nuevo = !t;
  const d = t || { titulo: '', descripcion: '', area: 'Producción', responsable: '', prioridad: 'media', fechaLimite: '', estado: 'pendiente' };
  const responsables = [...new Set(Storage.get('tareas').map((x) => x.responsable).filter(Boolean))].sort();
  abrirModal({
    titulo: nuevo ? 'Nueva tarea' : 'Editar tarea',
    cuerpo: `<div class="grid-form">
      ${campo('Título', `<input name="titulo" required minlength="3" maxlength="100" value="${esc(d.titulo)}" placeholder="Ej. Hornear tortas para el sábado">`, { clase: 'col-2' })}
      ${campo('Descripción', `<textarea name="descripcion" maxlength="500">${esc(d.descripcion)}</textarea>`, { clase: 'col-2' })}
      ${campo('Área', `<select name="area" required>${opciones(AREAS, d.area)}</select>`)}
      ${campo('Responsable', `<input name="responsable" maxlength="60" list="dl-responsables" value="${esc(d.responsable)}" placeholder="Nombre">`)}
      ${campo('Prioridad', `<select name="prioridad" required>${opciones(PRIORIDADES, d.prioridad)}</select>`)}
      ${campo('Fecha límite', `<input name="fechaLimite" type="date" value="${esc(d.fechaLimite)}">`)}
      ${campo('Estado', `<select name="estado" required>${opciones(ESTADOS_TAREA, d.estado)}</select>`)}
      <datalist id="dl-responsables">${responsables.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
    </div>`,
    alEnviar(form) {
      const f = form.elements;
      const titulo = f.titulo.value.trim();
      if (titulo.length < 3) return 'El título debe tener al menos 3 caracteres.';
      if (nuevo && f.fechaLimite.value && f.fechaLimite.value < Util.hoy() && f.estado.value !== 'hecha') {
        return 'La fecha límite ya pasó. Elige hoy o una fecha futura.';
      }
      const datos = { titulo, descripcion: f.descripcion.value.trim(), area: f.area.value, responsable: f.responsable.value.trim(), prioridad: f.prioridad.value, fechaLimite: f.fechaLimite.value, estado: f.estado.value };
      const lista = Storage.get('tareas');
      if (nuevo) lista.push({ id: Util.uid('t'), ...datos, creado: new Date().toISOString() });
      else Object.assign(lista.find((x) => x.id === d.id), datos);
      Storage.set('tareas', lista);
      toast(nuevo ? 'Tarea creada.' : 'Tarea actualizada.');
      render();
    },
  });
}

/* =========================================================
   8. Reportes
   ========================================================= */
function vistaReportes(cont) {
  const st = App.estado.reportes;
  if (!Reportes.obtener(st.id)) st.id = Reportes.lista[0].id;
  const hoy = Util.hoy();
  const rangos = {
    hoy: [hoy, hoy],
    '7d': [Util.sumarDias(hoy, -6), hoy],
    '30d': [Util.sumarDias(hoy, -29), hoy],
    mes: [Util.primerDiaMes(hoy), hoy],
    'mes-ant': (() => { const fin = Util.sumarDias(Util.primerDiaMes(hoy), -1); return [Util.primerDiaMes(fin), fin]; })(),
    todo: ['', ''],
  };

  cont.innerHTML = cabecera('Reportes', 'Vista previa y descarga en Excel', '<button class="btn btn-choco" data-accion="todo">⬇ Exportar todo (.xlsx)</button>') + `
    <div class="card" style="margin-bottom:16px">
      <div class="filtros" style="margin:0">
        ${campo('Desde', `<input type="date" id="f-desde" value="${st.desde}">`)}
        ${campo('Hasta', `<input type="date" id="f-hasta" value="${st.hasta}">`)}
        <div class="rango-rapido">
          <button class="btn btn-sec btn-sm" data-accion="rango" data-id="hoy">Hoy</button>
          <button class="btn btn-sec btn-sm" data-accion="rango" data-id="7d">7 días</button>
          <button class="btn btn-sec btn-sm" data-accion="rango" data-id="30d">30 días</button>
          <button class="btn btn-sec btn-sm" data-accion="rango" data-id="mes">Este mes</button>
          <button class="btn btn-sec btn-sm" data-accion="rango" data-id="mes-ant">Mes anterior</button>
          <button class="btn btn-sec btn-sm" data-accion="rango" data-id="todo">Todo</button>
        </div>
      </div>
    </div>
    <div class="tabs" role="tablist">${Reportes.lista.map((r) => `<button role="tab" aria-selected="${r.id === st.id}" class="${r.id === st.id ? 'activo' : ''}" data-accion="reporte" data-id="${r.id}">${esc(r.titulo)}</button>`).join('')}</div>
    <div id="reporte"></div>`;

  let actual = null;
  const pintar = () => {
    actual = Reportes.generar(st.id, st.desde, st.hasta);
    const r = actual;
    const periodo = r.sinFechas ? 'Datos al día de hoy' : Util.textoRango(st.desde, st.hasta);
    const celda = (f, c) => `<td class="${c.tipo === 'texto' || c.tipo === 'fecha' ? '' : 'num'}">${esc(Reportes.formatear(f[c.k], c.tipo))}</td>`;
    $('#reporte').innerHTML = `<div class="vista-cabecera" style="margin-bottom:12px"><div><h2>${esc(r.titulo)}</h2><p class="sub">${esc(r.descripcion)} · ${periodo}</p></div>
        <div class="acciones"><button class="btn btn-primario" data-accion="descargar" ${r.filas.length ? '' : 'disabled'}>⬇ Descargar Excel</button></div></div>
      ${r.filas.length ? `<div class="tabla-wrap"><table>
        <thead><tr>${r.columnas.map((c) => `<th class="${c.tipo === 'texto' || c.tipo === 'fecha' ? '' : 'num'}">${esc(c.t)}</th>`).join('')}</tr></thead>
        <tbody>${r.filas.map((f) => `<tr>${r.columnas.map((c) => celda(f, c)).join('')}</tr>`).join('')}
        ${r.totales ? `<tr class="fila-total">${r.columnas.map((c, i) => (i === 0 ? '<td>TOTAL</td>' : celda(r.totales, c))).join('')}</tr>` : ''}</tbody></table></div>`
        : vacio('Sin datos para este período.')}
      ${r.nota ? `<p class="sub" style="margin-top:10px">Nota: ${esc(r.nota)}</p>` : ''}`;
  };
  pintar();

  const validarRango = () => {
    if (st.desde && st.hasta && st.desde > st.hasta) { toast('La fecha «desde» es posterior a «hasta».', 'error'); return false; }
    return true;
  };
  $('#f-desde').addEventListener('change', (e) => { st.desde = e.target.value; if (validarRango()) pintar(); });
  $('#f-hasta').addEventListener('change', (e) => { st.hasta = e.target.value; if (validarRango()) pintar(); });

  App.acciones.reporte = (id) => {
    st.id = id;
    $$('.tabs button').forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('activo', on); b.setAttribute('aria-selected', on); });
    pintar();
  };
  App.acciones.rango = (id) => {
    [st.desde, st.hasta] = rangos[id];
    $('#f-desde').value = st.desde; $('#f-hasta').value = st.hasta;
    pintar();
  };
  const avisar = (r, ok) => { if (r === 'ok') toast(ok); else if (r !== 'cancelado') toast(r, 'error'); };
  App.acciones.descargar = async () => { if (validarRango()) avisar(await Excel.descargar(actual), 'Excel descargado.'); };
  App.acciones.todo = async () => { if (validarRango()) avisar(await Excel.descargarTodo(st.desde, st.hasta), 'Excel con todos los reportes descargado.'); };
}

/* =========================================================
   Respaldo y datos
   ========================================================= */
function vistaDatos(cont) {
  const kb = (Storage.bytesUsados() / 1024).toFixed(1);
  const cuenta = Storage.COLECCIONES.filter((c) => c !== 'recetas').map((c) => `${c}: <b>${Storage.get(c).length}</b>`).join(' · ');
  cont.innerHTML = cabecera('Respaldo y datos', Storage.remoto ? 'Tus datos se guardan en la base compartida de esta app' : 'Tus datos viven solo en este navegador') + `
    ${Storage.remoto ? '<div class="aviso aviso-ok" style="margin-bottom:14px">✓ Guardado en línea: los cambios se ven en cualquier dispositivo donde abras este enlace con tu cuenta.</div>' : ''}
    ${Storage.disponible || Storage.remoto ? '' : '<div class="aviso aviso-alerta" style="margin-bottom:14px"><b>El navegador no permite guardar datos</b> (modo privado o almacenamiento bloqueado). Lo que registres se perderá al cerrar la pestaña: descarga un respaldo antes de salir.</div>'}
    <div class="grid-datos">
      <div class="card"><h2>💾 Descargar respaldo</h2><p>Guarda un archivo .json con todos tus datos. Hazlo seguido y guárdalo en la nube o en tu correo.</p>
        <button class="btn btn-primario" data-accion="respaldo">Descargar respaldo (.json)</button></div>
      <div class="card"><h2>♻️ Restaurar respaldo</h2><p>Reemplaza <b>todos</b> los datos actuales por los de un archivo de respaldo.</p>
        <label class="btn btn-sec">Elegir archivo…<input type="file" id="archivo" accept="application/json,.json" hidden></label></div>
      <div class="card"><h2>🧁 Datos de ejemplo</h2><p>Carga productos, insumos, recetas, 45 días de ventas, mezclas y tareas para probar la app. Reemplaza los datos actuales.</p>
        <button class="btn btn-sec" data-accion="ejemplo">Cargar datos de ejemplo</button></div>
      <div class="card"><h2>🗑️ Borrar todo</h2><p>Elimina todos los datos para empezar desde cero con tu información real.</p>
        <button class="btn btn-peligro" data-accion="borrar">Borrar todos los datos</button></div>
    </div>
    <p class="sub" style="margin-top:18px">Registros: ${cuenta}${Storage.remoto ? '' : ` · Espacio usado: ${kb} KB (el navegador suele permitir unos 5 MB).`}</p>`;

  App.acciones.respaldo = async () => {
    const r = await Util.guardarArchivo(`Telate_respaldo_${Util.hoy()}.json`, JSON.stringify(Storage.backup(), null, 2), 'application/json');
    if (r === 'ok') toast('Respaldo descargado.'); else if (r !== 'cancelado') toast(r, 'error');
  };
  App.acciones.ejemplo = async () => {
    if (!(await confirmar('Se <b>reemplazarán todos los datos actuales</b> por los datos de ejemplo. Te recomendamos descargar un respaldo antes.', { ok: 'Cargar ejemplo' }))) return;
    Storage.cargarEjemplo();
    toast('Datos de ejemplo cargados.');
    render();
  };
  App.acciones.borrar = async () => {
    if (!(await confirmar('Se eliminarán <b>todos</b> los productos, insumos, recetas, ventas, mezclas y tareas. Esta acción no se puede deshacer.', { ok: 'Continuar' }))) return;
    if (!(await confirmar('Última confirmación: ¿borrar todo definitivamente?', { titulo: '¿Borrar todo?', ok: 'Sí, borrar todo' }))) return;
    Storage.borrarTodo();
    toast('Se borraron todos los datos.');
    render();
  };
  $('#archivo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let obj;
      try { obj = JSON.parse(reader.result); } catch (err) { toast('El archivo no es un JSON válido.', 'error'); return; }
      if (!obj || obj.app !== 'Telate' || !obj.datos) { toast('El archivo no es un respaldo de Telate.', 'error'); return; }
      const fecha = obj.exportado ? new Date(obj.exportado).toLocaleString('es-PE') : 'fecha desconocida';
      if (!(await confirmar(`Se reemplazarán los datos actuales por el respaldo del <b>${esc(fecha)}</b>.`, { ok: 'Restaurar' }))) return;
      const error = Storage.restore(obj);
      if (error) { toast(error, 'error'); return; }
      toast('Respaldo restaurado.');
      render();
    };
    reader.onerror = () => toast('No se pudo leer el archivo.', 'error');
    reader.readAsText(file);
  });
}

/* =========================================================
   Arranque
   ========================================================= */
async function iniciar() {
  Storage.onError = (e) => toast(e && e.code === 'invalid_argument'
    ? 'No se pudo guardar un cambio (sin permiso de edición o registro demasiado grande).'
    : 'No se pudo guardar: el almacenamiento está lleno o bloqueado. Descarga un respaldo.', 'error');
  Storage.onRemoto = () => { if (!document.querySelector('dialog[open]')) render(); };

  $('#vista').innerHTML = '<div class="vacio">Cargando datos…</div>';
  const conexion = await Storage.conectar();
  $('#estado-datos').textContent = conexion.remoto
    ? 'Datos guardados en línea: se sincronizan entre dispositivos.'
    : 'Los datos se guardan en este navegador. Haz respaldos seguido.';

  if (conexion.remoto) {
    // Base compartida nueva: carga el ejemplo una sola vez.
    if (conexion.vacia) {
      Storage.cargarEjemplo();
      setTimeout(() => toast('Cargamos datos de ejemplo. Puedes borrarlos en «Respaldo y datos».'), 400);
    }
    Storage.marcarInicializado();
  } else if (!Storage.pref('inicializado')) {
    // Primera vez: carga datos de ejemplo para explorar la app.
    const vacia = Storage.COLECCIONES.every((c) => { const v = Storage.get(c); return Array.isArray(v) ? !v.length : !Object.keys(v).length; });
    if (vacia) {
      Storage.cargarEjemplo();
      setTimeout(() => toast('Cargamos datos de ejemplo. Puedes borrarlos en «Respaldo y datos».'), 400);
    }
    Storage.pref('inicializado', true);
  }

  $('#barra-fecha').textContent = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const vista = $('#vista');
  vista.addEventListener('click', (e) => {
    const el = e.target.closest('[data-accion]');
    if (!el || !vista.contains(el) || el.disabled) return;
    const fn = App.acciones[el.dataset.accion];
    if (fn) fn(el.dataset.id, el, e);
  });
  vista.addEventListener('change', (e) => {
    const el = e.target.closest('[data-cambio]');
    if (!el) return;
    const fn = App.cambios[el.dataset.cambio];
    if (fn) fn(el.dataset.id, el, e);
  });

  $('.btn-menu').addEventListener('click', () => {
    const abierto = document.body.classList.toggle('menu-abierto');
    $('.btn-menu').setAttribute('aria-expanded', String(abierto));
  });
  $('.velo').addEventListener('click', cerrarMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
  window.addEventListener('hashchange', () => render({ scroll: true }));
  render({ scroll: true });
}

document.addEventListener('DOMContentLoaded', iniciar);

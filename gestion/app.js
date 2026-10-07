/* =====================================================================
   app.js — Arranque, navegación y acciones globales (copias de seguridad)

   Cada módulo se registra en TAIS.modulos con:
     { id, titulo, icono, render(contenedor), badge?() }
   La navegación usa el hash de la URL (#ventas, #insumos…), así el botón
   "atrás" del celular funciona y se puede guardar un acceso directo.
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, Store } = T;

  const ORDEN = ['dashboard', 'productos', 'ventas', 'insumos', 'desarrollo', 'tareas', 'reportes'];
  const main = document.getElementById('main');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('backdrop');
  let actual = null;

  const modulo = (id) => (T.modulos || []).find((m) => m.id === id);

  /* ---------------- Menú ---------------- */
  function pintarMenu() {
    document.getElementById('nav').innerHTML = ORDEN.map((id) => {
      const m = modulo(id);
      if (!m) return '';
      const b = m.badge ? m.badge() : 0;
      return `<a href="#${id}" class="${actual === id ? 'activo' : ''}" ${actual === id ? 'aria-current="page"' : ''}>
        <span class="nav-ico" aria-hidden="true">${m.icono}</span>${U.esc(m.titulo)}
        ${b ? `<span class="nav-badge" title="Requiere atención">${b}</span>` : ''}</a>`;
    }).join('');
  }

  function abrirMenu(abrir) {
    sidebar.classList.toggle('abierto', abrir);
    backdrop.hidden = !abrir;
    document.getElementById('btn-menu').setAttribute('aria-expanded', String(abrir));
  }

  /* ---------------- Router ---------------- */
  function navegar() {
    const id = (location.hash || '#dashboard').slice(1).split('?')[0];
    const m = modulo(id) || modulo('dashboard');
    const cambio = actual !== m.id;
    actual = m.id;
    document.getElementById('topbar-title').textContent = m.titulo;
    document.title = `${m.titulo} · TAIS Joyería`;
    pintarMenu();
    if (T.Graficos) T.Graficos.destruirTodos();
    // Contenedor nuevo en cada render: así los eventos de la vista anterior no se acumulan.
    const vista = document.createElement('div');
    vista.id = 'view';
    main.replaceChildren(vista);
    m.render(vista);
    if (cambio) { window.scrollTo(0, 0); abrirMenu(false); }
  }
  // Si hay un modal abierto no se repinta debajo (se perdería lo escrito); se repinta al cerrarlo.
  let pendiente = false;
  T.refrescar = () => {
    if (document.getElementById('modal').hidden) navegar();
    else { pendiente = true; pintarMenu(); }
  };
  U.modal.alCerrar = () => { if (pendiente) { pendiente = false; navegar(); } };

  /* ---------------- Acciones globales (pie del menú) ---------------- */
  async function accion(nombre) {
    if (nombre === 'exportar-json') {
      if (await U.descargar(`tais-copia-${U.hoy()}.json`, Store.exportar())) U.toast('Copia de seguridad descargada', 'ok');
    }
    if (nombre === 'importar-json') document.getElementById('input-importar').click();
    if (nombre === 'cargar-ejemplo') {
      const ok = Store.estaVacia() || await U.confirmar('Se reemplazarán <strong>todos</strong> los datos actuales por datos de ejemplo. Te recomendamos exportar una copia antes.', { ok: 'Cargar ejemplo' });
      if (!ok) return;
      T.generarDatosEjemplo();
      U.toast('Datos de ejemplo cargados ✦', 'ok');
    }
    if (nombre === 'borrar-todo') {
      const ok = await U.confirmar('Se borrarán <strong>todos</strong> los productos, ventas, insumos, ideas y tareas de este navegador. Esta acción no se puede deshacer.', { ok: 'Borrar todo' });
      if (!ok) return;
      Store.borrarTodo();
      U.toast('Se borraron todos los datos');
    }
    abrirMenu(false);
  }

  document.getElementById('input-importar').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    const ok = await U.confirmar(`Se reemplazarán los datos actuales por los del archivo <strong>${U.esc(archivo.name)}</strong>.`, { ok: 'Importar' });
    if (!ok) return;
    try {
      Store.importar(await archivo.text());
      U.toast('Copia importada correctamente', 'ok');
    } catch (err) {
      U.toast('No se pudo importar: ' + err.message, 'bad');
    }
  });

  /* ---------------- Eventos ---------------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-accion]');
    if (a) accion(a.dataset.accion);
    if (e.target.closest('[data-cerrar-modal]') || e.target.id === 'modal') U.modal.cerrar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal').hidden) U.modal.cerrar();
  });
  document.getElementById('btn-menu').addEventListener('click', () => abrirMenu(!sidebar.classList.contains('abierto')));
  backdrop.addEventListener('click', () => abrirMenu(false));
  window.addEventListener('hashchange', navegar);

  // Cualquier cambio en los datos vuelve a pintar la vista actual.
  Store.alCambiar(T.refrescar);

  navegar();
})(window.TAIS);

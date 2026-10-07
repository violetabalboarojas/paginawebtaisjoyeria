/* =====================================================================
   Módulo: Tareas — pendientes del taller con prioridad y fecha límite
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N, Store } = T;
  const C = U.CAT;

  const filtro = { estado: 'pendientes', prioridad: '', categoria: '', q: '' };
  const PESO = { alta: 0, media: 1, baja: 2 };

  function render(el) {
    const todas = Store.listar('tareas');
    const cuenta = {
      pendientes: todas.filter((t) => !t.completada).length,
      vencidas: todas.filter(N.tareaVencida).length,
      completadas: todas.filter((t) => t.completada).length,
      todas: todas.length,
    };
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Tareas</h1><p>Producción, compras, diseño, marketing y entregas.</p></div>
        <div class="acciones"><button class="btn btn-primario" data-nueva>+ Nueva tarea</button></div>
      </div>
      <div class="card">
        <div class="chips" id="t-chips" style="margin-bottom:12px">
          ${[['pendientes', 'Pendientes'], ['vencidas', 'Vencidas'], ['completadas', 'Completadas'], ['todas', 'Todas']]
            .map(([k, t]) => `<button class="chip ${filtro.estado === k ? 'activo' : ''}" data-chip="${k}">${t} (${cuenta[k]})</button>`).join('')}
        </div>
        <div class="filtros">
          <div class="campo ancho"><label for="tf-q">Buscar</label><input id="tf-q" type="search" placeholder="Título, responsable…" value="${U.esc(filtro.q)}" /></div>
          <div class="campo"><label for="tf-pri">Prioridad</label><select id="tf-pri">${U.opciones(C.prioridades, filtro.prioridad, { vacio: 'Todas' })}</select></div>
          <div class="campo"><label for="tf-cat">Categoría</label><select id="tf-cat">${U.opciones(C.categoriasTarea, filtro.categoria, { vacio: 'Todas' })}</select></div>
        </div>
        <div id="t-lista"></div>
      </div>`;

    const pintar = () => pintarLista(U.$('#t-lista', el));
    U.$('#t-chips', el).addEventListener('click', (e) => {
      const c = e.target.closest('[data-chip]');
      if (!c) return;
      filtro.estado = c.dataset.chip;
      U.$$('.chip', el).forEach((x) => x.classList.toggle('activo', x === c));
      pintar();
    });
    U.$('#tf-q', el).addEventListener('input', U.debounce((e) => { filtro.q = e.target.value; pintar(); }));
    U.$('#tf-pri', el).addEventListener('change', (e) => { filtro.prioridad = e.target.value; pintar(); });
    U.$('#tf-cat', el).addEventListener('change', (e) => { filtro.categoria = e.target.value; pintar(); });
    U.$('[data-nueva]', el).addEventListener('click', () => abrirForm());
    el.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-check]');
      if (!chk) return;
      Store.actualizar('tareas', chk.dataset.check, { completada: chk.checked, completadaEl: chk.checked ? U.hoy() : null });
      U.toast(chk.checked ? 'Tarea completada ✓' : 'Tarea marcada como pendiente', chk.checked ? 'ok' : '');
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-editar],[data-eliminar]');
      if (!b) return;
      if (b.dataset.editar) abrirForm(Store.obtener('tareas', b.dataset.editar));
      if (b.dataset.eliminar) eliminar(b.dataset.eliminar);
    });
    pintar();
  }

  function pintarLista(cont) {
    const hoy = U.hoy();
    const lista = Store.listar('tareas')
      .filter((t) => ({ pendientes: !t.completada, vencidas: N.tareaVencida(t), completadas: t.completada, todas: true }[filtro.estado]))
      .filter((t) => !filtro.prioridad || t.prioridad === filtro.prioridad)
      .filter((t) => !filtro.categoria || t.categoria === filtro.categoria)
      .filter((t) => U.coincide(`${t.titulo} ${t.descripcion} ${t.responsable}`, filtro.q))
      // Orden: pendientes primero, luego vencidas/fecha más próxima, luego prioridad
      .sort((a, b) => (a.completada - b.completada) || (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999') || PESO[a.prioridad] - PESO[b.prioridad]);

    if (!lista.length) { cont.innerHTML = U.vacio('No hay tareas en esta vista.'); return; }
    cont.innerHTML = lista.map((t) => {
      const vencida = N.tareaVencida(t);
      const hoyVence = !t.completada && t.fechaLimite === hoy;
      return `<div class="tarea ${t.completada ? 'hecha' : ''} ${vencida ? 'vencida' : ''}">
        <input type="checkbox" data-check="${t.id}" ${t.completada ? 'checked' : ''} aria-label="Marcar “${U.esc(t.titulo)}” como completada" />
        <div class="tarea-cuerpo">
          <div class="tarea-titulo">${U.esc(t.titulo)}</div>
          ${t.descripcion ? `<div class="tarea-desc">${U.esc(t.descripcion)}</div>` : ''}
          <div class="tarea-meta">
            ${U.badgePrioridad(t.prioridad)}
            <span class="badge rose">${U.esc(t.categoria)}</span>
            ${t.responsable ? `<span class="badge gris">👤 ${U.esc(t.responsable)}</span>` : ''}
            ${t.fechaLimite ? `<span class="badge ${vencida ? 'bad' : hoyVence ? 'warn' : 'gris'}">📅 ${vencida ? 'Venció el ' : hoyVence ? 'Vence hoy · ' : ''}${U.fecha(t.fechaLimite)}</span>` : ''}
            ${t.completada && t.completadaEl ? `<span class="badge ok">✓ ${U.fecha(t.completadaEl)}</span>` : ''}
          </div>
        </div>
        <div class="flex" style="flex-wrap:nowrap">
          <button class="icon-btn" data-editar="${t.id}" aria-label="Editar tarea" title="Editar">✎</button>
          <button class="icon-btn peligro" data-eliminar="${t.id}" aria-label="Eliminar tarea" title="Eliminar">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  function abrirForm(t = null) {
    const editando = Boolean(t);
    const d = Object.assign({ titulo: '', descripcion: '', responsable: '', prioridad: 'media', fechaLimite: '', categoria: '' }, t || {});
    const responsables = [...new Set(Store.listar('tareas').map((x) => x.responsable).filter(Boolean))];
    U.modal.abrir({
      titulo: editando ? 'Editar tarea' : 'Nueva tarea',
      html: `<form class="form" novalidate>
        <div class="campo full"><label for="t-titulo">Título <span class="req">*</span></label><input id="t-titulo" name="titulo" required maxlength="100" value="${U.esc(d.titulo)}" /></div>
        <div class="campo full"><label for="t-desc">Descripción</label><textarea id="t-desc" name="descripcion" maxlength="500">${U.esc(d.descripcion)}</textarea></div>
        <div class="campo"><label for="t-resp">Responsable</label><input id="t-resp" name="responsable" maxlength="60" list="t-resps" value="${U.esc(d.responsable)}" />
          <datalist id="t-resps">${responsables.map((r) => `<option value="${U.esc(r)}">`).join('')}</datalist></div>
        <div class="campo"><label for="t-pri">Prioridad <span class="req">*</span></label><select id="t-pri" name="prioridad" required>${U.opciones(C.prioridades, d.prioridad)}</select></div>
        <div class="campo"><label for="t-fecha">Fecha límite</label><input id="t-fecha" name="fechaLimite" type="date" value="${d.fechaLimite || ''}" /></div>
        <div class="campo"><label for="t-cat">Categoría <span class="req">*</span></label><select id="t-cat" name="categoria" required>${U.opciones(C.categoriasTarea, d.categoria, { vacio: 'Elige…' })}</select></div>
        <div class="form-acciones">
          <button type="button" class="btn btn-secundario" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario">${editando ? 'Guardar cambios' : 'Crear tarea'}</button>
        </div></form>`,
      alAbrir(body) {
        const form = U.$('form', body);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!U.validar(form)) return;
          const datos = U.leerForm(form);
          U.modal.cerrar();
          if (editando) Store.actualizar('tareas', d.id, datos);
          else Store.crear('tareas', Object.assign(datos, { completada: false, completadaEl: null }));
          U.toast(editando ? 'Tarea actualizada' : 'Tarea creada', 'ok');
        });
      },
    });
  }

  async function eliminar(id) {
    const t = Store.obtener('tareas', id);
    if (!(await U.confirmar(`¿Eliminar la tarea <strong>${U.esc(t.titulo)}</strong>?`, { ok: 'Eliminar' }))) return;
    Store.eliminar('tareas', id);
    U.toast('Tarea eliminada');
  }

  (T.modulos = T.modulos || []).push({
    id: 'tareas',
    titulo: 'Tareas',
    icono: '☑',
    render,
    badge: () => Store.listar('tareas').filter(N.tareaVencida).length,
  });
})(window.TAIS);

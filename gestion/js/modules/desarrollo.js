/* =====================================================================
   Módulo: Desarrollo de nuevos productos (Kanban)
   Idea → Prototipo → Prueba → Listo para vender
   Se mueve arrastrando (escritorio) o con las flechas ← → (celular).
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N, Store } = T;
  const ETAPAS = U.CAT.etapasIdea;
  const ORDEN = Object.keys(ETAPAS);

  function render(el) {
    const ideas = Store.listar('ideas');
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Desarrollo de productos</h1><p>Lleva cada idea desde el boceto hasta el catálogo.</p></div>
        <div class="acciones"><button class="btn btn-primario" data-nueva>+ Nueva idea</button></div>
      </div>
      <div class="kanban">
        ${ORDEN.map((etapa) => {
          const col = ideas.filter((i) => i.etapa === etapa).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
          return `<section class="kanban-col" data-col="${etapa}" aria-label="${ETAPAS[etapa]}">
            <h3>${['✧', '✎', '⚗', '✦'][ORDEN.indexOf(etapa)]} ${ETAPAS[etapa]} <span class="badge gris">${col.length}</span></h3>
            ${col.map(tarjeta).join('') || '<p class="ayuda" style="text-align:center;padding:16px 0">Arrastra aquí o usa las flechas</p>'}
          </section>`;
        }).join('')}
      </div>`;

    U.$('[data-nueva]', el).addEventListener('click', () => abrirForm());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mover],[data-editar],[data-eliminar],[data-convertir]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.mover) mover(id, Number(b.dataset.mover));
      if (b.dataset.editar !== undefined) abrirForm(Store.obtener('ideas', id));
      if (b.dataset.eliminar !== undefined) eliminar(id);
      if (b.dataset.convertir !== undefined) convertir(id);
    });

    // Arrastrar y soltar (HTML5 drag & drop)
    el.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.k-card');
      if (!c) return;
      e.dataTransfer.setData('text/plain', c.dataset.card);
      c.classList.add('arrastrando');
    });
    el.addEventListener('dragend', (e) => e.target.closest('.k-card')?.classList.remove('arrastrando'));
    U.$$('.kanban-col', el).forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        const idea = Store.obtener('ideas', id);
        if (idea && idea.etapa !== col.dataset.col) Store.actualizar('ideas', id, { etapa: col.dataset.col });
      });
    });
  }

  function tarjeta(i) {
    const idx = ORDEN.indexOf(i.etapa);
    const costo = i.receta?.length ? N.costoReceta(i.receta) : U.num(i.costoEst);
    const m = N.margen(i.costoEst || costo, i.precioSug);
    const nombresIns = (i.receta || []).map((r) => Store.obtener('insumos', r.insumoId)?.nombre).filter(Boolean);
    const prod = i.productoId ? Store.obtener('productos', i.productoId) : null;
    return `<article class="k-card" draggable="true" data-card="${i.id}">
      <h4>${U.esc(i.nombre)}</h4>
      ${i.descripcion ? `<p>${U.esc(i.descripcion)}</p>` : ''}
      <div class="k-meta">
        <span>Costo est. <strong>${U.soles(i.costoEst)}</strong></span>
        <span>Precio sug. <strong class="oro">${U.soles(i.precioSug)}</strong></span>
        ${U.num(i.precioSug) ? `<span class="${m.pct < 30 ? 'bad-txt' : 'ok-txt'}">${U.pct(m.pct)}</span>` : ''}
      </div>
      ${nombresIns.length || i.insumosTexto ? `<p>🧰 ${U.esc([...nombresIns, i.insumosTexto].filter(Boolean).join(', '))}</p>` : ''}
      ${i.notas ? `<p>📝 ${U.esc(i.notas)}</p>` : ''}
      <p>📅 ${U.fecha(i.fecha)}</p>
      ${prod ? `<span class="badge ok">✓ En catálogo: ${U.esc(prod.nombre)}</span>` : ''}
      ${i.etapa === 'listo' && !prod ? `<button class="btn btn-primario btn-sm" data-convertir data-id="${i.id}">✦ Convertir en producto</button>` : ''}
      <div class="k-acciones">
        <button class="icon-btn" data-mover="-1" data-id="${i.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Mover a la etapa anterior" title="Etapa anterior">←</button>
        <span>
          <button class="icon-btn" data-editar data-id="${i.id}" aria-label="Editar idea" title="Editar">✎</button>
          <button class="icon-btn peligro" data-eliminar data-id="${i.id}" aria-label="Eliminar idea" title="Eliminar">🗑</button>
        </span>
        <button class="icon-btn" data-mover="1" data-id="${i.id}" ${idx === ORDEN.length - 1 ? 'disabled' : ''} aria-label="Mover a la etapa siguiente" title="Etapa siguiente">→</button>
      </div>
    </article>`;
  }

  function mover(id, paso) {
    const i = Store.obtener('ideas', id);
    const nueva = ORDEN[ORDEN.indexOf(i.etapa) + paso];
    if (!nueva) return;
    Store.actualizar('ideas', id, { etapa: nueva });
    U.toast(`“${i.nombre}” → ${ETAPAS[nueva]}`);
  }

  function abrirForm(i = null) {
    const editando = Boolean(i);
    const d = Object.assign({ nombre: '', descripcion: '', etapa: 'idea', receta: [], insumosTexto: '', costoEst: '', precioSug: '', notas: '', fecha: U.hoy() }, i || {});
    U.modal.abrir({
      titulo: editando ? 'Editar idea' : 'Nueva idea de producto',
      html: `<form class="form" novalidate>
        <div class="campo full"><label for="d-nombre">Nombre <span class="req">*</span></label><input id="d-nombre" name="nombre" required maxlength="80" value="${U.esc(d.nombre)}" /></div>
        <div class="campo full"><label for="d-desc">Descripción</label><textarea id="d-desc" name="descripcion" maxlength="400">${U.esc(d.descripcion)}</textarea></div>
        <div class="campo"><label for="d-etapa">Etapa <span class="req">*</span></label><select id="d-etapa" name="etapa" required>${U.opciones(ETAPAS, d.etapa)}</select></div>
        <div class="campo"><label for="d-fecha">Fecha <span class="req">*</span></label><input id="d-fecha" name="fecha" type="date" required value="${d.fecha}" /></div>
        <div class="campo full"><label>Insumos necesarios (del inventario)</label><div data-receta-cont>${T.RecetaEditor.html(d.receta)}</div></div>
        <div class="campo full"><label for="d-instxt">Otros insumos (que aún no tienes)</label><input id="d-instxt" name="insumosTexto" maxlength="200" placeholder="Hilo rojo encerado, piedra luna…" value="${U.esc(d.insumosTexto)}" /></div>
        <div class="campo"><label for="d-costo">Costo estimado (S/)</label><input id="d-costo" name="costoEst" type="number" min="0" step="0.01" value="${U.esc(d.costoEst)}" />
          <button type="button" class="btn btn-texto btn-sm" data-calc-costo style="align-self:flex-start">↻ Calcular desde insumos</button></div>
        <div class="campo"><label for="d-precio">Precio sugerido (S/)</label><input id="d-precio" name="precioSug" type="number" min="0" step="0.01" value="${U.esc(d.precioSug)}" /></div>
        <div class="campo full"><div class="calc" data-calc></div></div>
        <div class="campo full"><label for="d-notas">Notas</label><textarea id="d-notas" name="notas" maxlength="500">${U.esc(d.notas)}</textarea></div>
        <div class="form-acciones">
          <button type="button" class="btn btn-secundario" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario">${editando ? 'Guardar cambios' : 'Crear idea'}</button>
        </div></form>`,
      alAbrir(body) {
        const form = U.$('form', body);
        const calc = () => {
          const m = N.margen(form.costoEst.value, form.precioSug.value);
          U.$('[data-calc]', body).innerHTML = `<span>Insumos del inventario: <strong>${U.soles(N.costoReceta(T.RecetaEditor.leer(body)))}</strong></span><span>Margen estimado: <strong>${U.pct(m.pct)}</strong></span><span>Ganancia: <strong>${U.soles(m.ganancia)}</strong></span>`;
        };
        T.RecetaEditor.conectar(U.$('[data-receta-cont]', body), calc);
        form.addEventListener('input', calc);
        U.$('[data-calc-costo]', body).addEventListener('click', () => { form.costoEst.value = N.costoReceta(T.RecetaEditor.leer(body)).toFixed(2); calc(); });
        calc();
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!U.validar(form)) return;
          const datos = U.leerForm(form);
          datos.costoEst = U.redondear(datos.costoEst);
          datos.precioSug = U.redondear(datos.precioSug);
          datos.receta = T.RecetaEditor.leer(body);
          U.modal.cerrar();
          if (editando) Store.actualizar('ideas', d.id, datos); else Store.crear('ideas', Object.assign(datos, { productoId: null }));
          U.toast(editando ? 'Idea actualizada' : 'Idea creada ✧', 'ok');
        });
      },
    });
  }

  /** Abre el formulario de producto precargado con los datos de la idea. */
  function convertir(id) {
    const i = Store.obtener('ideas', id);
    T.abrirFormProducto({
      nombre: i.nombre,
      costo: i.costoEst || N.costoReceta(i.receta),
      precio: i.precioSug,
      estado: 'activo',
      receta: (i.receta || []).map((r) => ({ ...r })),
      descripcion: [i.descripcion, i.notas].filter(Boolean).join(' · '),
    }, {
      alGuardar(prod) {
        Store.actualizar('ideas', id, { productoId: prod.id });
        U.toast(`“${prod.nombre}” ya está en el catálogo ✦`, 'ok');
      },
    });
  }

  async function eliminar(id) {
    const i = Store.obtener('ideas', id);
    if (!(await U.confirmar(`¿Eliminar la idea <strong>${U.esc(i.nombre)}</strong>?`, { ok: 'Eliminar' }))) return;
    Store.eliminar('ideas', id);
    U.toast('Idea eliminada');
  }

  (T.modulos = T.modulos || []).push({ id: 'desarrollo', titulo: 'Desarrollo', icono: '✧', render });
})(window.TAIS);

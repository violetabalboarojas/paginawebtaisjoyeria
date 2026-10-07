/* =====================================================================
   Módulo: Productos — catálogo, receta de insumos y margen
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N, Store } = T;
  const C = U.CAT;

  /* ---------------- Editor de receta (reutilizado en Desarrollo) ----------------
     Pinta filas [insumo | cantidad | quitar] dentro de un contenedor y permite
     leerlas de vuelta como [{insumoId, cantidad}]. */
  const RecetaEditor = {
    html(receta = []) {
      return `
        <div class="filas-head"><span>Insumo</span><span>Cant. x unidad</span><span></span></div>
        <div class="filas" data-receta>${receta.map((r) => this.fila(r)).join('')}</div>
        <button type="button" class="btn btn-texto btn-sm" data-receta-add>+ Agregar insumo</button>`;
    },
    fila(r = {}) {
      const insumos = Store.listar('insumos').slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
      const ins = Store.obtener('insumos', r.insumoId);
      return `<div class="fila-dinamica">
        <select data-k="insumoId" aria-label="Insumo" required>
          ${U.opciones(Object.fromEntries(insumos.map((i) => [i.id, `${i.nombre} (${i.unidad})`])), r.insumoId, { vacio: 'Elige un insumo…' })}
        </select>
        <input data-k="cantidad" type="number" min="0.0001" step="any" value="${U.esc(r.cantidad ?? 1)}" aria-label="Cantidad${ins ? ' en ' + ins.unidad : ''}" required />
        <button type="button" class="icon-btn peligro" data-receta-del aria-label="Quitar insumo">✕</button>
      </div>`;
    },
    /** Conecta los eventos de agregar/quitar filas. `alCambiar` se llama en cada cambio. */
    conectar(raiz, alCambiar = () => {}) {
      const filas = U.$('[data-receta]', raiz);
      raiz.addEventListener('click', (e) => {
        if (e.target.closest('[data-receta-add]')) {
          if (!Store.listar('insumos').length) { U.toast('Primero registra insumos en el módulo Insumos.', 'warn'); return; }
          filas.insertAdjacentHTML('beforeend', this.fila());
          alCambiar();
        }
        const del = e.target.closest('[data-receta-del]');
        if (del) { del.parentElement.remove(); alCambiar(); }
      });
      filas.addEventListener('input', alCambiar);
      filas.addEventListener('change', alCambiar);
    },
    leer(raiz) {
      return U.$$('[data-receta] .fila-dinamica', raiz)
        .map((f) => ({ insumoId: U.$('[data-k=insumoId]', f).value, cantidad: U.num(U.$('[data-k=cantidad]', f).value) }))
        .filter((r) => r.insumoId && r.cantidad > 0);
    },
  };
  T.RecetaEditor = RecetaEditor;

  /* ---------------- Estado de filtros (se conserva al repintar) ---------------- */
  const filtro = { q: '', categoria: '', estado: '', ocasion: '' };

  function render(el) {
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Productos</h1><p>Catálogo, receta de insumos y margen de cada producto.</p></div>
        <div class="acciones"><button class="btn btn-primario" data-nuevo>+ Nuevo producto</button></div>
      </div>
      <div class="card">
        <div class="filtros">
          <div class="campo ancho"><label for="pf-q">Buscar</label><input id="pf-q" type="search" placeholder="Nombre, material…" value="${U.esc(filtro.q)}" /></div>
          <div class="campo"><label for="pf-cat">Categoría</label><select id="pf-cat">${U.opciones(C.categoriasProducto, filtro.categoria, { vacio: 'Todas' })}</select></div>
          <div class="campo"><label for="pf-est">Estado</label><select id="pf-est">${U.opciones(C.estadosProducto, filtro.estado, { vacio: 'Todos' })}</select></div>
          <div class="campo"><label for="pf-oca">Ocasión</label><select id="pf-oca">${U.opciones(C.ocasiones, filtro.ocasion, { vacio: 'Todas' })}</select></div>
        </div>
        <div id="p-lista"></div>
      </div>`;

    const pintar = () => pintarLista(U.$('#p-lista', el));
    U.$('#pf-q', el).addEventListener('input', U.debounce((e) => { filtro.q = e.target.value; pintar(); }));
    U.$('#pf-cat', el).addEventListener('change', (e) => { filtro.categoria = e.target.value; pintar(); });
    U.$('#pf-est', el).addEventListener('change', (e) => { filtro.estado = e.target.value; pintar(); });
    U.$('#pf-oca', el).addEventListener('change', (e) => { filtro.ocasion = e.target.value; pintar(); });
    U.$('[data-nuevo]', el).addEventListener('click', () => abrirForm());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-editar],[data-eliminar],[data-duplicar]');
      if (!b) return;
      if (b.dataset.editar) abrirForm(Store.obtener('productos', b.dataset.editar));
      if (b.dataset.duplicar) {
        const p = Store.obtener('productos', b.dataset.duplicar);
        abrirForm({ ...p, id: null, nombre: p.nombre + ' (copia)', receta: p.receta.map((r) => ({ ...r })) });
      }
      if (b.dataset.eliminar) eliminar(b.dataset.eliminar);
    });
    pintar();
  }

  function pintarLista(cont) {
    const vendidos = {};
    N.lineas(Store.listar('ventas')).forEach((l) => (vendidos[l.productoId] = (vendidos[l.productoId] || 0) + l.cantidad));
    const lista = Store.listar('productos')
      .filter((p) => U.coincide(`${p.nombre} ${p.material} ${p.personalizacion} ${p.descripcion}`, filtro.q))
      .filter((p) => !filtro.categoria || p.categoria === filtro.categoria)
      .filter((p) => !filtro.estado || p.estado === filtro.estado)
      .filter((p) => !filtro.ocasion || p.ocasion === filtro.ocasion)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    if (!lista.length) {
      cont.innerHTML = U.vacio(Store.listar('productos').length ? 'Ningún producto coincide con los filtros.' : 'Aún no hay productos. Crea el primero con “+ Nuevo producto”.');
      return;
    }
    cont.innerHTML = `<div class="tabla-wrap"><table class="tabla responsive">
      <thead><tr><th>Producto</th><th>Categoría</th><th>Personalización</th><th>Ocasión</th><th class="num">Costo</th><th class="num">Precio</th><th class="num">Margen</th><th class="num">Vendidos</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((p) => {
        const m = N.margen(p.costo, p.precio);
        return `<tr>
          <td class="td-titulo" data-l="Producto">${U.esc(p.nombre)}<span class="td-sub">${U.esc(p.material || '')}${p.receta?.length ? ` · ${p.receta.length} insumo(s)` : ' · <span class="bad-txt">sin receta</span>'}</span></td>
          <td data-l="Categoría">${U.esc(p.categoria)}</td>
          <td data-l="Personalización">${U.esc(p.personalizacion || '—')}</td>
          <td data-l="Ocasión">${U.esc(p.ocasion || '—')}</td>
          <td class="num" data-l="Costo">${U.soles(p.costo)}</td>
          <td class="num" data-l="Precio"><span class="oro">${U.soles(p.precio)}</span></td>
          <td class="num" data-l="Margen"><span class="${m.pct < 30 ? 'bad-txt' : 'ok-txt'}">${U.pct(m.pct)}</span><span class="td-sub">${U.soles(m.ganancia)}</span></td>
          <td class="num" data-l="Vendidos">${U.cantidad(vendidos[p.id] || 0)}</td>
          <td data-l="Estado">${U.badgeEstadoProducto(p.estado)}</td>
          <td class="acc">
            <button class="icon-btn" data-editar="${p.id}" aria-label="Editar ${U.esc(p.nombre)}" title="Editar">✎</button>
            <button class="icon-btn" data-duplicar="${p.id}" aria-label="Duplicar ${U.esc(p.nombre)}" title="Duplicar">⧉</button>
            <button class="icon-btn peligro" data-eliminar="${p.id}" aria-label="Eliminar ${U.esc(p.nombre)}" title="Eliminar">🗑</button>
          </td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="ayuda mt">${lista.length} producto(s). El margen se calcula sobre el precio de venta: (precio − costo) ÷ precio.</p>`;
  }

  /**
   * Formulario de producto (crear/editar).
   * `opciones.alGuardar(producto)` permite a otros módulos (Desarrollo) saber cuándo se creó.
   */
  function abrirForm(p = null, opciones = {}) {
    const editando = Boolean(p && p.id);
    const d = Object.assign({ nombre: '', categoria: '', material: '', personalizacion: '', ocasion: '', costo: '', precio: '', estado: 'activo', descripcion: '', receta: [] }, p || {});
    U.modal.abrir({
      titulo: editando ? 'Editar producto' : 'Nuevo producto',
      html: `<form class="form" novalidate>
        <div class="campo full"><label for="f-nombre">Nombre <span class="req">*</span></label><input id="f-nombre" name="nombre" required maxlength="80" value="${U.esc(d.nombre)}" /></div>
        <div class="campo"><label for="f-cat">Categoría <span class="req">*</span></label><select id="f-cat" name="categoria" required>${U.opciones(C.categoriasProducto, d.categoria, { vacio: 'Elige…' })}</select></div>
        <div class="campo"><label for="f-mat">Material</label><input id="f-mat" name="material" maxlength="80" placeholder="Acero, plata 925, baño de oro…" value="${U.esc(d.material)}" /></div>
        <div class="campo"><label for="f-per">Tipo de personalización</label><select id="f-per" name="personalizacion">${U.opciones(C.personalizacion, d.personalizacion, { vacio: '—' })}</select></div>
        <div class="campo"><label for="f-oca">Ocasión</label><select id="f-oca" name="ocasion">${U.opciones(C.ocasiones, d.ocasion, { vacio: '—' })}</select></div>
        <div class="campo"><label for="f-est">Estado <span class="req">*</span></label><select id="f-est" name="estado" required>${U.opciones(C.estadosProducto, d.estado)}</select></div>
        <div class="campo"></div>

        <div class="campo full"><label>Receta de insumos (por unidad producida)</label>
          <div data-receta-cont>${RecetaEditor.html(d.receta)}</div>
          <span class="ayuda">Al registrar una venta se descuentan estas cantidades del inventario.</span>
        </div>

        <div class="campo"><label for="f-costo">Costo de producción (S/) <span class="req">*</span></label><input id="f-costo" name="costo" type="number" min="0" step="0.01" required value="${U.esc(d.costo)}" />
          <button type="button" class="btn btn-texto btn-sm" data-calc-costo style="align-self:flex-start">↻ Usar costo de la receta</button></div>
        <div class="campo"><label for="f-precio">Precio de venta (S/) <span class="req">*</span></label><input id="f-precio" name="precio" type="number" min="0" step="0.01" required value="${U.esc(d.precio)}" /></div>
        <div class="campo full"><div class="calc" data-calc></div></div>
        <div class="campo full"><label for="f-desc">Descripción / notas</label><textarea id="f-desc" name="descripcion" maxlength="500">${U.esc(d.descripcion)}</textarea></div>
        <div class="form-acciones">
          <button type="button" class="btn btn-secundario" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario">${editando ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </form>`,
      alAbrir(body) {
        const form = U.$('form', body);
        const calc = () => {
          const costo = U.num(form.costo.value), precio = U.num(form.precio.value);
          const m = N.margen(costo, precio);
          const cr = N.costoReceta(RecetaEditor.leer(body));
          U.$('[data-calc]', body).innerHTML = `
            <span>Margen: <strong class="${m.pct < 30 ? 'bad-txt' : ''}">${U.pct(m.pct)}</strong></span>
            <span>Ganancia por unidad: <strong>${U.soles(m.ganancia)}</strong></span>
            <span>Costo de insumos según receta: <strong>${U.soles(cr)}</strong></span>`;
        };
        RecetaEditor.conectar(U.$('[data-receta-cont]', body), calc);
        form.addEventListener('input', calc);
        U.$('[data-calc-costo]', body).addEventListener('click', () => { form.costo.value = N.costoReceta(RecetaEditor.leer(body)).toFixed(2); calc(); });
        calc();

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const duplicado = Store.listar('productos').some((x) => x.id !== d.id && U.normalizar(x.nombre) === U.normalizar(form.nombre.value.trim()));
          const insIds = U.$$('[data-k=insumoId]', body).map((s) => s.value).filter(Boolean);
          const repetidos = insIds.length !== new Set(insIds).size;
          if (!U.validar(form, [
            [form.nombre, !duplicado, 'Ya existe un producto con ese nombre.'],
            [form.precio, U.num(form.precio.value) > 0, 'El precio debe ser mayor a 0.'],
            [U.$('[data-k=insumoId]', body), !repetidos, 'Hay un insumo repetido en la receta: júntalo en una sola fila.'],
          ])) return;
          const datos = U.leerForm(form);
          datos.costo = U.redondear(datos.costo);
          datos.precio = U.redondear(datos.precio);
          datos.receta = RecetaEditor.leer(body);
          U.modal.cerrar();
          const guardado = editando ? Store.actualizar('productos', d.id, datos) : Store.crear('productos', datos);
          U.toast(editando ? 'Producto actualizado' : 'Producto creado ✦', 'ok');
          if (opciones.alGuardar) opciones.alGuardar(guardado);
        });
      },
    });
  }
  T.abrirFormProducto = abrirForm;

  async function eliminar(id) {
    const p = Store.obtener('productos', id);
    const usados = Store.listar('ventas').filter((v) => v.items.some((i) => i.productoId === id)).length;
    const ok = await U.confirmar(`¿Eliminar <strong>${U.esc(p.nombre)}</strong>?` +
      (usados ? `<br><br>Aparece en ${usados} venta(s): esas ventas se conservan con el nombre guardado. Si ya no lo vendes, mejor márcalo como <em>Descontinuado</em>.` : ''), { ok: 'Eliminar' });
    if (!ok) return;
    Store.eliminar('productos', id);
    U.toast('Producto eliminado');
  }

  (T.modulos = T.modulos || []).push({ id: 'productos', titulo: 'Productos', icono: '◇', render });
})(window.TAIS);

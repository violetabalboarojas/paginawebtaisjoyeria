/* =====================================================================
   Módulo: Insumos e inventario
   Pestañas: Inventario · Compras (entradas) · Insumos a comprar
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N, Store } = T;
  const C = U.CAT;

  const estado = { tab: 'inventario', q: '', categoria: '', soloBajos: false };

  function render(el) {
    const nBajos = N.insumosBajos().length;
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Insumos e inventario</h1><p>Stock de materiales, compras y lista sugerida para reponer.</p></div>
        <div class="acciones">
          <button class="btn btn-secundario" data-compra>+ Registrar compra</button>
          <button class="btn btn-primario" data-nuevo>+ Nuevo insumo</button>
        </div>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="inventario" class="${estado.tab === 'inventario' ? 'activo' : ''}">Inventario</button>
        <button role="tab" data-tab="compras" class="${estado.tab === 'compras' ? 'activo' : ''}">Compras (entradas)</button>
        <button role="tab" data-tab="comprar" class="${estado.tab === 'comprar' ? 'activo' : ''}">Insumos a comprar ${nBajos ? `<span class="badge bad">${nBajos}</span>` : ''}</button>
      </div>
      <div id="i-cont"></div>`;

    U.$('.tabs', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      estado.tab = b.dataset.tab;
      render(el);
    });
    U.$('[data-nuevo]', el).addEventListener('click', () => abrirForm());
    U.$('[data-compra]', el).addEventListener('click', () => abrirCompra());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-editar],[data-eliminar],[data-comprar],[data-eliminar-compra]');
      if (!b) return;
      if (b.dataset.editar) abrirForm(Store.obtener('insumos', b.dataset.editar));
      if (b.dataset.eliminar) eliminar(b.dataset.eliminar);
      if (b.dataset.comprar) abrirCompra(b.dataset.comprar, b.dataset.cant);
      if (b.dataset.eliminarCompra) eliminarCompra(b.dataset.eliminarCompra);
    });

    const cont = U.$('#i-cont', el);
    if (estado.tab === 'inventario') vistaInventario(cont);
    if (estado.tab === 'compras') vistaCompras(cont);
    if (estado.tab === 'comprar') vistaAComprar(cont);
  }

  /* ---------------- Inventario ---------------- */
  function vistaInventario(cont) {
    cont.innerHTML = `<div class="card">
      <div class="filtros">
        <div class="campo ancho"><label for="if-q">Buscar</label><input id="if-q" type="search" placeholder="Nombre o proveedor…" value="${U.esc(estado.q)}" /></div>
        <div class="campo"><label for="if-cat">Categoría</label><select id="if-cat">${U.opciones(C.categoriasInsumo, estado.categoria, { vacio: 'Todas' })}</select></div>
        <label class="flex" style="font-size:13px;min-height:40px"><input type="checkbox" id="if-bajos" ${estado.soloBajos ? 'checked' : ''} /> Solo stock bajo</label>
      </div>
      <div id="i-lista"></div></div>`;
    const pintar = () => {
      const lista = Store.listar('insumos')
        .filter((i) => U.coincide(`${i.nombre} ${i.proveedor}`, estado.q))
        .filter((i) => !estado.categoria || i.categoria === estado.categoria)
        .filter((i) => !estado.soloBajos || N.stockBajo(i))
        .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
      const l = U.$('#i-lista', cont);
      if (!lista.length) {
        l.innerHTML = U.vacio(Store.listar('insumos').length ? 'Ningún insumo coincide con los filtros.' : 'Aún no hay insumos. Agrega el primero o carga los datos de ejemplo.');
        return;
      }
      const valor = lista.reduce((s, i) => s + Math.max(0, U.num(i.stock)) * U.num(i.costo), 0);
      l.innerHTML = `<div class="tabla-wrap"><table class="tabla responsive">
        <thead><tr><th>Insumo</th><th>Categoría</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Costo unit.</th><th class="num">Valor stock</th><th>Proveedor</th><th>Estado</th><th></th></tr></thead>
        <tbody>${lista.map((i) => {
          const bajo = N.stockBajo(i);
          return `<tr class="${bajo ? 'fila-alerta' : ''}">
            <td class="td-titulo" data-l="Insumo">${U.esc(i.nombre)}<span class="td-sub">por ${U.esc(i.unidad)}</span></td>
            <td data-l="Categoría">${U.esc(i.categoria)}</td>
            <td class="num" data-l="Stock"><strong class="${bajo ? 'bad-txt' : ''}">${U.cantidad(i.stock)}</strong></td>
            <td class="num" data-l="Mínimo">${U.cantidad(i.stockMin)}</td>
            <td class="num" data-l="Costo unit.">${U.soles(i.costo)}</td>
            <td class="num" data-l="Valor stock">${U.soles(Math.max(0, i.stock) * i.costo)}</td>
            <td data-l="Proveedor">${U.esc(i.proveedor || '—')}</td>
            <td data-l="Estado">${bajo ? '<span class="badge bad">⚠ Stock bajo</span>' : '<span class="badge ok">✓ OK</span>'}</td>
            <td class="acc">
              <button class="icon-btn" data-comprar="${i.id}" aria-label="Registrar compra de ${U.esc(i.nombre)}" title="Registrar compra">＋</button>
              <button class="icon-btn" data-editar="${i.id}" aria-label="Editar ${U.esc(i.nombre)}" title="Editar">✎</button>
              <button class="icon-btn peligro" data-eliminar="${i.id}" aria-label="Eliminar ${U.esc(i.nombre)}" title="Eliminar">🗑</button>
            </td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="ayuda mt">${lista.length} insumo(s) · Valor del inventario mostrado: <strong>${U.soles(valor)}</strong>. Se marca “stock bajo” cuando el stock es igual o menor al mínimo.</p>`;
    };
    U.$('#if-q', cont).addEventListener('input', U.debounce((e) => { estado.q = e.target.value; pintar(); }));
    U.$('#if-cat', cont).addEventListener('change', (e) => { estado.categoria = e.target.value; pintar(); });
    U.$('#if-bajos', cont).addEventListener('change', (e) => { estado.soloBajos = e.target.checked; pintar(); });
    pintar();
  }

  /* ---------------- Compras ---------------- */
  function vistaCompras(cont) {
    const compras = Store.listar('compras').slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const total = compras.reduce((s, c) => s + U.num(c.cantidad) * U.num(c.costoUnit), 0);
    cont.innerHTML = `<div class="card">
      <div class="card-head"><h2>Historial de compras</h2></div>
      <p class="card-desc">Cada compra suma al stock del insumo y actualiza su costo unitario al último precio pagado.</p>
      ${compras.length ? `<div class="tabla-wrap"><table class="tabla responsive">
        <thead><tr><th>Insumo</th><th>Fecha</th><th class="num">Cantidad</th><th class="num">Costo unit.</th><th class="num">Total</th><th>Proveedor</th><th>Nota</th><th></th></tr></thead>
        <tbody>${compras.map((c) => {
          const ins = Store.obtener('insumos', c.insumoId);
          return `<tr>
            <td class="td-titulo" data-l="Insumo">${U.esc(ins?.nombre || '(insumo eliminado)')}</td>
            <td data-l="Fecha">${U.fecha(c.fecha)}</td>
            <td class="num" data-l="Cantidad">${U.cantidad(c.cantidad)} ${U.esc(ins?.unidad || '')}</td>
            <td class="num" data-l="Costo unit.">${U.soles(c.costoUnit)}</td>
            <td class="num" data-l="Total"><strong>${U.soles(c.cantidad * c.costoUnit)}</strong></td>
            <td data-l="Proveedor">${U.esc(c.proveedor || '—')}</td>
            <td data-l="Nota">${U.esc(c.nota || '—')}</td>
            <td class="acc"><button class="icon-btn peligro" data-eliminar-compra="${c.id}" aria-label="Eliminar compra" title="Eliminar">🗑</button></td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="ayuda mt">${compras.length} compra(s) · Total invertido: <strong>${U.soles(total)}</strong></p>`
        : U.vacio('Aún no registras compras. Usa “+ Registrar compra”.')}
    </div>`;
  }

  /* ---------------- Insumos a comprar ---------------- */
  function vistaAComprar(cont) {
    const lista = N.insumosAComprar();
    const total = lista.reduce((s, x) => s + x.costoEst, 0);
    const pedidosAbiertos = Store.listar('ventas').filter((v) => v.estado !== 'entregado').length;
    cont.innerHTML = `<div class="card">
      <div class="card-head"><h2>Lista sugerida de compra</h2>
        <div class="acciones"><button class="btn btn-secundario btn-sm" data-ir-reporte>⬇ Descargar en Excel</button></div></div>
      <p class="card-desc">Incluye los insumos con stock igual o menor al mínimo. Como cada venta ya descontó sus insumos, un stock negativo significa que <strong>faltan materiales para pedidos pendientes</strong> (${pedidosAbiertos} pedido(s) sin entregar). Se sugiere comprar hasta llegar al doble del mínimo.</p>
      ${lista.length ? `<div class="tabla-wrap"><table class="tabla responsive">
        <thead><tr><th>Insumo</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">En pedidos abiertos</th><th class="num">Comprar</th><th class="num">Costo est.</th><th>Proveedor</th><th>Motivo</th><th></th></tr></thead>
        <tbody>${lista.map((x) => `<tr class="${x.stock < 0 ? 'fila-alerta' : ''}">
          <td class="td-titulo" data-l="Insumo">${U.esc(x.insumo.nombre)}<span class="td-sub">${U.esc(x.insumo.categoria)}</span></td>
          <td class="num" data-l="Stock"><strong class="bad-txt">${U.cantidad(x.stock)}</strong></td>
          <td class="num" data-l="Mínimo">${U.cantidad(x.min)}</td>
          <td class="num" data-l="En pedidos abiertos">${U.cantidad(x.comprometido)}</td>
          <td class="num" data-l="Comprar"><strong>${U.cantidad(x.sugerido)} ${U.esc(x.insumo.unidad)}</strong></td>
          <td class="num" data-l="Costo est.">${U.soles(x.costoEst)}</td>
          <td data-l="Proveedor">${U.esc(x.insumo.proveedor || '—')}</td>
          <td data-l="Motivo"><span class="badge ${x.stock < 0 ? 'bad' : 'warn'}">${x.motivo}</span></td>
          <td class="acc"><button class="btn btn-secundario btn-sm" data-comprar="${x.insumo.id}" data-cant="${x.sugerido}">Registrar compra</button></td></tr>`).join('')}</tbody>
        </table></div>
        <p class="ayuda mt">Inversión estimada: <strong class="oro">${U.soles(total)}</strong></p>`
        : U.vacio('¡Todo en orden! Ningún insumo está en el mínimo.')}
    </div>`;
    const b = U.$('[data-ir-reporte]', cont);
    if (b) b.addEventListener('click', () => T.Reportes.descargar('reponer'));
  }

  /* ---------------- Formularios ---------------- */
  function abrirForm(i = null) {
    const editando = Boolean(i);
    const d = Object.assign({ nombre: '', categoria: '', unidad: 'unidad', stock: 0, stockMin: 0, costo: '', proveedor: '' }, i || {});
    const proveedores = [...new Set(Store.listar('insumos').map((x) => x.proveedor).filter(Boolean))];
    U.modal.abrir({
      titulo: editando ? 'Editar insumo' : 'Nuevo insumo',
      html: `<form class="form" novalidate>
        <div class="campo full"><label for="i-nombre">Nombre <span class="req">*</span></label><input id="i-nombre" name="nombre" required maxlength="80" value="${U.esc(d.nombre)}" /></div>
        <div class="campo"><label for="i-cat">Categoría <span class="req">*</span></label><select id="i-cat" name="categoria" required>${U.opciones(C.categoriasInsumo, d.categoria, { vacio: 'Elige…' })}</select></div>
        <div class="campo"><label for="i-uni">Unidad <span class="req">*</span></label><select id="i-uni" name="unidad" required>${U.opciones(C.unidades, d.unidad)}</select></div>
        <div class="campo"><label for="i-stock">Stock actual <span class="req">*</span></label><input id="i-stock" name="stock" type="number" step="any" required value="${U.esc(d.stock)}" />
          ${editando ? '<span class="ayuda">Para entradas usa “Registrar compra”; editar aquí es un ajuste manual.</span>' : ''}</div>
        <div class="campo"><label for="i-min">Stock mínimo <span class="req">*</span></label><input id="i-min" name="stockMin" type="number" min="0" step="any" required value="${U.esc(d.stockMin)}" /></div>
        <div class="campo"><label for="i-costo">Costo unitario (S/) <span class="req">*</span></label><input id="i-costo" name="costo" type="number" min="0" step="0.01" required value="${U.esc(d.costo)}" /></div>
        <div class="campo"><label for="i-prov">Proveedor</label><input id="i-prov" name="proveedor" maxlength="80" list="i-provs" value="${U.esc(d.proveedor)}" />
          <datalist id="i-provs">${proveedores.map((p) => `<option value="${U.esc(p)}">`).join('')}</datalist></div>
        <div class="form-acciones">
          <button type="button" class="btn btn-secundario" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario">${editando ? 'Guardar cambios' : 'Crear insumo'}</button>
        </div></form>`,
      alAbrir(body) {
        const form = U.$('form', body);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const dup = Store.listar('insumos').some((x) => x.id !== d.id && U.normalizar(x.nombre) === U.normalizar(form.nombre.value.trim()));
          if (!U.validar(form, [[form.nombre, !dup, 'Ya existe un insumo con ese nombre.']])) return;
          const datos = U.leerForm(form);
          ['stock', 'stockMin', 'costo'].forEach((k) => (datos[k] = U.num(datos[k])));
          U.modal.cerrar();
          if (editando) Store.actualizar('insumos', d.id, datos); else Store.crear('insumos', datos);
          U.toast(editando ? 'Insumo actualizado' : 'Insumo creado', 'ok');
        });
      },
    });
  }

  function abrirCompra(insumoId = '', cantidad = '') {
    const insumos = Store.listar('insumos').slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!insumos.length) { U.toast('Primero crea un insumo.', 'warn'); return; }
    const sel = Store.obtener('insumos', insumoId);
    U.modal.abrir({
      titulo: 'Registrar compra de insumo',
      html: `<form class="form" novalidate>
        <div class="campo full"><label for="c-ins">Insumo <span class="req">*</span></label><select id="c-ins" name="insumoId" required>${U.opciones(Object.fromEntries(insumos.map((i) => [i.id, `${i.nombre} (${i.unidad}) · stock ${U.cantidad(i.stock)}`])), insumoId, { vacio: 'Elige…' })}</select></div>
        <div class="campo"><label for="c-fecha">Fecha <span class="req">*</span></label><input id="c-fecha" name="fecha" type="date" required value="${U.hoy()}" /></div>
        <div class="campo"><label for="c-cant">Cantidad <span class="req">*</span></label><input id="c-cant" name="cantidad" type="number" min="0.0001" step="any" required value="${U.esc(cantidad)}" /></div>
        <div class="campo"><label for="c-costo">Costo unitario (S/) <span class="req">*</span></label><input id="c-costo" name="costoUnit" type="number" min="0" step="0.01" required value="${sel ? sel.costo : ''}" /></div>
        <div class="campo"><label for="c-prov">Proveedor</label><input id="c-prov" name="proveedor" maxlength="80" value="${U.esc(sel?.proveedor || '')}" /></div>
        <div class="campo full"><label for="c-nota">Nota</label><input id="c-nota" name="nota" maxlength="200" placeholder="N° de boleta, observaciones…" /></div>
        <div class="campo full"><div class="calc" data-calc></div></div>
        <div class="form-acciones">
          <button type="button" class="btn btn-secundario" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario">Registrar compra</button>
        </div></form>`,
      alAbrir(body) {
        const form = U.$('form', body);
        const calc = () => {
          const ins = Store.obtener('insumos', form.insumoId.value);
          U.$('[data-calc]', body).innerHTML = `<span>Total compra: <strong>${U.soles(U.num(form.cantidad.value) * U.num(form.costoUnit.value))}</strong></span>` +
            (ins ? `<span>Stock después: <strong>${U.cantidad(U.num(ins.stock) + U.num(form.cantidad.value))} ${U.esc(ins.unidad)}</strong></span>` : '');
        };
        form.insumoId.addEventListener('change', () => {
          const ins = Store.obtener('insumos', form.insumoId.value);
          if (ins) { form.costoUnit.value = ins.costo; form.proveedor.value = ins.proveedor || ''; }
          calc();
        });
        form.addEventListener('input', calc);
        calc();
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!U.validar(form)) return;
          const datos = U.leerForm(form);
          datos.cantidad = U.num(datos.cantidad);
          datos.costoUnit = U.num(datos.costoUnit);
          U.modal.cerrar();
          N.registrarCompra(datos);
          U.toast('Compra registrada · stock actualizado', 'ok');
        });
      },
    });
  }
  T.abrirCompra = abrirCompra;

  async function eliminar(id) {
    const i = Store.obtener('insumos', id);
    const enRecetas = Store.listar('productos').filter((p) => (p.receta || []).some((r) => r.insumoId === id));
    const ok = await U.confirmar(`¿Eliminar el insumo <strong>${U.esc(i.nombre)}</strong>?` +
      (enRecetas.length ? `<br><br>Se quitará de la receta de: ${enRecetas.map((p) => U.esc(p.nombre)).join(', ')}.` : ''), { ok: 'Eliminar' });
    if (!ok) return;
    enRecetas.forEach((p) => (p.receta = p.receta.filter((r) => r.insumoId !== id)));
    Store.listar('ideas').forEach((x) => (x.receta = (x.receta || []).filter((r) => r.insumoId !== id)));
    Store.eliminar('insumos', id);
    U.toast('Insumo eliminado');
  }

  async function eliminarCompra(id) {
    const c = Store.obtener('compras', id);
    const ins = Store.obtener('insumos', c.insumoId);
    const ok = await U.confirmar(`¿Eliminar esta compra? Se restarán <strong>${U.cantidad(c.cantidad)} ${U.esc(ins?.unidad || '')}</strong> del stock de ${U.esc(ins?.nombre || 'insumo')}.`, { ok: 'Eliminar' });
    if (!ok) return;
    N.eliminarCompra(id);
    U.toast('Compra eliminada · stock ajustado');
  }

  (T.modulos = T.modulos || []).push({
    id: 'insumos',
    titulo: 'Insumos',
    icono: '⬡',
    render,
    badge: () => N.insumosBajos().length,
  });
})(window.TAIS);

/* =====================================================================
   Módulo: Ventas / Pedidos
   Registrar una venta descuenta automáticamente los insumos según la receta
   de cada producto. Editarla recalcula; eliminarla puede devolverlos.
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N, Store } = T;
  const C = U.CAT;

  const filtro = { q: '', desde: '', hasta: '', estado: '', productoId: '', canal: '' };

  function render(el) {
    const productos = Store.listar('productos').slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Ventas y pedidos</h1><p>Registra cada pedido; los insumos se descuentan solos según la receta.</p></div>
        <div class="acciones"><button class="btn btn-primario" data-nueva>+ Nueva venta</button></div>
      </div>
      <div class="card">
        <div class="chips" id="v-chips" style="margin-bottom:12px">
          ${[['', 'Todos'], ...Object.entries(C.estadosVenta)].map(([k, t]) => `<button class="chip ${filtro.estado === k ? 'activo' : ''}" data-chip="${k}">${t}</button>`).join('')}
        </div>
        <div class="filtros">
          <div class="campo ancho"><label for="vf-q">Buscar</label><input id="vf-q" type="search" placeholder="Cliente, N° pedido, texto grabado…" value="${U.esc(filtro.q)}" /></div>
          <div class="campo"><label for="vf-desde">Desde</label><input id="vf-desde" type="date" value="${filtro.desde}" /></div>
          <div class="campo"><label for="vf-hasta">Hasta</label><input id="vf-hasta" type="date" value="${filtro.hasta}" /></div>
          <div class="campo"><label for="vf-prod">Producto</label><select id="vf-prod">${U.opciones(Object.fromEntries(productos.map((p) => [p.id, p.nombre])), filtro.productoId, { vacio: 'Todos' })}</select></div>
          <div class="campo"><label for="vf-canal">Canal</label><select id="vf-canal">${U.opciones(C.canales, filtro.canal, { vacio: 'Todos' })}</select></div>
          <button class="btn btn-texto" data-limpiar>Limpiar</button>
        </div>
        <div id="v-lista"></div>
      </div>`;

    const pintar = () => pintarLista(U.$('#v-lista', el));
    const enlazar = (sel, k, ev = 'change') => U.$(sel, el).addEventListener(ev, (e) => { filtro[k] = e.target.value; pintar(); });
    U.$('#vf-q', el).addEventListener('input', U.debounce((e) => { filtro.q = e.target.value; pintar(); }));
    enlazar('#vf-desde', 'desde'); enlazar('#vf-hasta', 'hasta'); enlazar('#vf-prod', 'productoId'); enlazar('#vf-canal', 'canal');
    U.$('[data-limpiar]', el).addEventListener('click', () => { Object.keys(filtro).forEach((k) => (filtro[k] = '')); render(el); });
    U.$('#v-chips', el).addEventListener('click', (e) => {
      const c = e.target.closest('[data-chip]');
      if (!c) return;
      filtro.estado = c.dataset.chip;
      U.$$('.chip', el).forEach((x) => x.classList.toggle('activo', x === c));
      pintar();
    });
    U.$('[data-nueva]', el).addEventListener('click', () => abrirForm());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-editar],[data-eliminar],[data-ver]');
      if (!b) return;
      if (b.dataset.editar) abrirForm(Store.obtener('ventas', b.dataset.editar));
      if (b.dataset.ver) verDetalle(Store.obtener('ventas', b.dataset.ver));
      if (b.dataset.eliminar) eliminar(b.dataset.eliminar);
    });
    // Cambio rápido de estado desde la lista
    el.addEventListener('change', (e) => {
      const s = e.target.closest('[data-estado]');
      if (!s) return;
      Store.actualizar('ventas', s.dataset.estado, { estado: s.value });
      U.toast(`Pedido ${C.estadosVenta[s.value].toLowerCase()}`, 'ok');
    });
    pintar();

    // Acceso directo desde el Dashboard: #ventas?nueva
    if (location.hash.includes('?nueva')) {
      history.replaceState(null, '', '#ventas');
      abrirForm();
    }
  }

  function pintarLista(cont) {
    const hoy = U.hoy();
    const lista = Store.listar('ventas')
      .filter((v) => U.enRango(v.fecha, filtro.desde, filtro.hasta))
      .filter((v) => !filtro.estado || v.estado === filtro.estado)
      .filter((v) => !filtro.canal || v.canal === filtro.canal)
      .filter((v) => !filtro.productoId || v.items.some((i) => i.productoId === filtro.productoId))
      .filter((v) => U.coincide(`${v.numero} ${v.cliente} ${v.grabado} ${v.items.map((i) => i.nombre).join(' ')}`, filtro.q))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.numero).localeCompare(String(a.numero)));

    if (!lista.length) {
      cont.innerHTML = U.vacio(Store.listar('ventas').length ? 'Ninguna venta coincide con los filtros.' : 'Aún no hay ventas. Registra la primera con “+ Nueva venta”.');
      return;
    }
    const total = lista.reduce((s, v) => s + U.num(v.total), 0);
    cont.innerHTML = `<div class="tabla-wrap"><table class="tabla responsive">
      <thead><tr><th>Pedido</th><th>Fecha</th><th>Productos</th><th>Canal / pago</th><th>Entrega</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((v) => {
        const atrasado = v.estado !== 'entregado' && v.fechaEntrega && v.fechaEntrega < hoy;
        return `<tr class="${atrasado ? 'fila-vencida' : ''}">
          <td class="td-titulo" data-l="Cliente">${U.esc(v.cliente)}<span class="td-sub">${U.esc(v.numero || '')}${v.grabado ? ` · “${U.esc(v.grabado)}”` : ''}</span></td>
          <td data-l="Fecha">${U.fecha(v.fecha)}</td>
          <td data-l="Productos">${v.items.map((i) => `${U.esc(i.nombre)} ×${U.cantidad(i.cantidad)}`).join('<br>')}</td>
          <td data-l="Canal / pago">${U.esc(v.canal)}<span class="td-sub">${U.esc(v.metodoPago)}</span></td>
          <td data-l="Entrega"><span class="${atrasado ? 'bad-txt' : ''}">${U.fecha(v.fechaEntrega)}</span>${atrasado ? '<span class="td-sub bad-txt">atrasado</span>' : ''}</td>
          <td class="num" data-l="Total"><span class="oro">${U.soles(v.total)}</span>${U.num(v.descuento) ? `<span class="td-sub">desc. ${U.soles(v.descuento)}</span>` : ''}</td>
          <td data-l="Estado"><select class="input" style="min-height:32px;padding:4px 8px;font-size:12px;width:auto" data-estado="${v.id}" aria-label="Estado del pedido ${U.esc(v.numero)}">${U.opciones(C.estadosVenta, v.estado)}</select></td>
          <td class="acc">
            <button class="icon-btn" data-ver="${v.id}" aria-label="Ver detalle" title="Ver detalle">👁</button>
            <button class="icon-btn" data-editar="${v.id}" aria-label="Editar venta" title="Editar">✎</button>
            <button class="icon-btn peligro" data-eliminar="${v.id}" aria-label="Eliminar venta" title="Eliminar">🗑</button>
          </td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="ayuda mt"><strong>${lista.length}</strong> pedido(s) · Total <strong class="oro">${U.soles(total)}</strong> · Ticket promedio ${U.soles(total / lista.length)}</p>`;
  }

  /* ---------------- Formulario ---------------- */
  function filaItem(it = {}, productos) {
    return `<div class="fila-dinamica venta">
      <select data-k="productoId" aria-label="Producto" required>${U.opciones(Object.fromEntries(productos.map((p) => [p.id, `${p.nombre} · ${U.soles(p.precio)}`])), it.productoId, { vacio: 'Elige un producto…' })}</select>
      <input data-k="cantidad" type="number" min="1" step="1" value="${U.esc(it.cantidad ?? 1)}" aria-label="Cantidad" placeholder="Cant." title="Cantidad" required />
      <input data-k="precio" type="number" min="0" step="0.01" value="${U.esc(it.precio ?? '')}" aria-label="Precio unitario (S/)" placeholder="Precio S/" title="Precio unitario (S/)" required />
      <button type="button" class="icon-btn peligro" data-item-del aria-label="Quitar producto">✕</button>
    </div>`;
  }

  function abrirForm(v = null) {
    const editando = Boolean(v);
    const usados = new Set((v?.items || []).map((i) => i.productoId));
    const productos = Store.listar('productos')
      .filter((p) => p.estado !== 'descontinuado' || usados.has(p.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!productos.length) { U.toast('Primero crea al menos un producto en el catálogo.', 'warn'); location.hash = '#productos'; return; }
    const d = Object.assign({
      fecha: U.hoy(), cliente: '', telefono: '', items: [{ cantidad: 1 }], descuento: 0, metodoPago: 'Yape', canal: 'Instagram',
      ocasion: '', grabado: '', fechaEntrega: U.sumarDias(U.hoy(), 5), estado: 'pendiente', notas: '',
    }, v || {});

    U.modal.abrir({
      titulo: editando ? `Editar pedido ${v.numero || ''}` : 'Nueva venta',
      html: `<form class="form" novalidate>
        <div class="campo"><label for="v-fecha">Fecha de venta <span class="req">*</span></label><input id="v-fecha" name="fecha" type="date" required value="${d.fecha}" /></div>
        <div class="campo"><label for="v-entrega">Fecha de entrega</label><input id="v-entrega" name="fechaEntrega" type="date" value="${d.fechaEntrega || ''}" /></div>
        <div class="campo"><label for="v-cliente">Cliente <span class="req">*</span></label><input id="v-cliente" name="cliente" required maxlength="80" value="${U.esc(d.cliente)}" autocomplete="off" list="v-clientes" />
          <datalist id="v-clientes">${[...new Set(Store.listar('ventas').map((x) => x.cliente))].map((c) => `<option value="${U.esc(c)}">`).join('')}</datalist></div>
        <div class="campo"><label for="v-tel">Teléfono / WhatsApp</label><input id="v-tel" name="telefono" type="tel" maxlength="20" inputmode="tel" pattern="[0-9 +()-]{6,20}" value="${U.esc(d.telefono)}" /></div>

        <div class="campo full"><label>Productos <span class="req">*</span></label>
          <div class="filas-head venta"><span>Producto</span><span>Cant.</span><span>Precio unit.</span><span></span></div>
          <div class="filas" data-items>${d.items.map((it) => filaItem(it, productos)).join('')}</div>
          <button type="button" class="btn btn-texto btn-sm" data-item-add style="align-self:flex-start">+ Agregar otro producto</button>
        </div>

        <div class="campo"><label for="v-desc">Descuento (S/)</label><input id="v-desc" name="descuento" type="number" min="0" step="0.01" value="${U.esc(d.descuento)}" /></div>
        <div class="campo"><label for="v-pago">Método de pago <span class="req">*</span></label><select id="v-pago" name="metodoPago" required>${U.opciones(C.metodosPago, d.metodoPago)}</select></div>
        <div class="campo"><label for="v-canal">Canal <span class="req">*</span></label><select id="v-canal" name="canal" required>${U.opciones(C.canales, d.canal)}</select></div>
        <div class="campo"><label for="v-oca">Ocasión</label><select id="v-oca" name="ocasion">${U.opciones(C.ocasiones, d.ocasion, { vacio: 'Según el producto' })}</select></div>
        <div class="campo full"><label for="v-grabado">Texto a grabar</label><textarea id="v-grabado" name="grabado" maxlength="300" placeholder="Nombres, fecha, frase, coordenadas…">${U.esc(d.grabado)}</textarea>
          <span class="ayuda">Revisa ortografía y tildes con la clienta antes de grabar.</span></div>
        <div class="campo"><label for="v-estado">Estado <span class="req">*</span></label><select id="v-estado" name="estado" required>${U.opciones(C.estadosVenta, d.estado)}</select></div>
        <div class="campo"><label for="v-notas">Notas</label><input id="v-notas" name="notas" maxlength="200" value="${U.esc(d.notas)}" placeholder="Dirección, delivery, talla…" /></div>

        <div class="campo full"><div class="calc" data-totales></div></div>
        <div class="campo full" data-consumo></div>
        <div class="form-acciones">
          <button type="button" class="btn btn-secundario" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario" data-enviar>${editando ? 'Guardar cambios' : 'Registrar venta'}</button>
        </div>
      </form>`,
      alAbrir(body) {
        const form = U.$('form', body);
        const filas = U.$('[data-items]', body);
        const leerItems = () => U.$$('.fila-dinamica', filas).map((f) => {
          const pid = U.$('[data-k=productoId]', f).value;
          const p = Store.obtener('productos', pid);
          return { productoId: pid, nombre: p?.nombre || '', cantidad: U.num(U.$('[data-k=cantidad]', f).value), precio: U.redondear(U.$('[data-k=precio]', f).value) };
        }).filter((i) => i.productoId);

        let forzar = false; // segunda confirmación cuando falta stock
        const recalcular = () => {
          forzar = false;
          U.$('[data-enviar]', body).textContent = editando ? 'Guardar cambios' : 'Registrar venta';
          const items = leerItems();
          const t = N.totalesVenta(items, form.descuento.value);
          U.$('[data-totales]', body).innerHTML = `<span>Subtotal: <strong>${U.soles(t.subtotal)}</strong></span><span>Descuento: <strong>${U.soles(form.descuento.value)}</strong></span><span>Total: <strong class="oro">${U.soles(t.total)}</strong></span>`;
          const consumo = N.consumoDeItems(items);
          const falt = N.faltantes(consumo, editando ? v.consumo || [] : []);
          const sinReceta = items.filter((i) => !Store.obtener('productos', i.productoId)?.receta?.length);
          U.$('[data-consumo]', body).innerHTML = (consumo.length ? `<details><summary class="ayuda" style="cursor:pointer">Insumos que se descontarán (${consumo.length})</summary>
              <ul class="lista">${consumo.map((c) => { const ins = Store.obtener('insumos', c.insumoId); return `<li>${U.esc(ins?.nombre || '¿?')}<span class="der">${U.cantidad(c.cantidad)} ${U.esc(ins?.unidad || '')}</span></li>`; }).join('')}</ul></details>` : '') +
            (falt.length ? `<div class="aviso warn mt">⚠ Stock insuficiente: ${falt.map((f) => `${U.esc(f.insumo.nombre)} (hay ${U.cantidad(f.disponible)}, se necesitan ${U.cantidad(f.necesita)})`).join('; ')}. El stock quedará en negativo y aparecerá en “Insumos a comprar”.</div>` : '') +
            (sinReceta.length ? `<div class="aviso info mt">ℹ ${sinReceta.map((i) => U.esc(i.nombre)).join(', ')} no tiene receta: no se descontarán insumos.</div>` : '');
          return falt;
        };

        filas.addEventListener('change', (e) => {
          // Al elegir producto, se completa el precio con el del catálogo
          if (e.target.matches('[data-k=productoId]')) {
            const p = Store.obtener('productos', e.target.value);
            const precio = U.$('[data-k=precio]', e.target.parentElement);
            if (p) precio.value = p.precio;
          }
          recalcular();
        });
        filas.addEventListener('input', recalcular);
        form.descuento.addEventListener('input', recalcular);
        body.addEventListener('click', (e) => {
          if (e.target.closest('[data-item-add]')) { filas.insertAdjacentHTML('beforeend', filaItem({}, productos)); recalcular(); }
          const del = e.target.closest('[data-item-del]');
          if (del) {
            if (U.$$('.fila-dinamica', filas).length === 1) { U.toast('El pedido necesita al menos un producto.', 'warn'); return; }
            del.parentElement.remove(); recalcular();
          }
        });
        recalcular();

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const items = leerItems();
          const t = N.totalesVenta(items, 0);
          const ids = items.map((i) => i.productoId);
          if (!U.validar(form, [
            [U.$('[data-k=productoId]', filas), items.length > 0, 'Elige al menos un producto.'],
            [U.$('[data-k=productoId]', filas), ids.length === new Set(ids).size, 'Hay un producto repetido: súmalo en la cantidad.'],
            [form.descuento, U.num(form.descuento.value) <= t.subtotal, 'El descuento no puede ser mayor al subtotal.'],
            [form.fechaEntrega, !form.fechaEntrega.value || form.fechaEntrega.value >= form.fecha.value, 'La entrega no puede ser antes de la fecha de venta.'],
          ])) return;
          const falt = recalcular();
          if (falt.length && !forzar) {
            forzar = true;
            U.$('[data-enviar]', body).textContent = 'Registrar de todas formas';
            U.$('[data-consumo]', body).scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
          const datos = U.leerForm(form);
          datos.items = items;
          datos.descuento = U.redondear(datos.descuento);
          U.modal.cerrar();
          if (editando) N.actualizarVenta(v.id, datos);
          else N.registrarVenta(datos);
          U.toast(editando ? 'Pedido actualizado' : 'Venta registrada · insumos descontados ✦', 'ok');
        });
      },
    });
  }
  T.abrirFormVenta = abrirForm;

  function verDetalle(v) {
    U.modal.abrir({
      titulo: `Pedido ${v.numero || ''}`,
      html: `
        <ul class="lista">
          <li>Cliente<span class="der"><strong>${U.esc(v.cliente)}</strong>${v.telefono ? `<span class="td-sub">${U.esc(v.telefono)}</span>` : ''}</span></li>
          <li>Fecha de venta<span class="der">${U.fecha(v.fecha)}</span></li>
          <li>Fecha de entrega<span class="der">${U.fecha(v.fechaEntrega)}</span></li>
          <li>Estado<span class="der">${U.badgeEstadoVenta(v.estado)}</span></li>
          <li>Canal · pago<span class="der">${U.esc(v.canal)} · ${U.esc(v.metodoPago)}</span></li>
          <li>Ocasión<span class="der">${U.esc(v.ocasion || 'Según el producto')}</span></li>
          ${v.items.map((i) => `<li>${U.esc(i.nombre)} ×${U.cantidad(i.cantidad)}<span class="der">${U.soles(i.cantidad * i.precio)}</span></li>`).join('')}
          ${U.num(v.descuento) ? `<li>Descuento<span class="der">− ${U.soles(v.descuento)}</span></li>` : ''}
          <li><strong>Total</strong><span class="der oro">${U.soles(v.total)}</span></li>
        </ul>
        ${v.grabado ? `<div class="aviso info mt"><strong>Texto a grabar:</strong><br>${U.esc(v.grabado).replace(/\n/g, '<br>')}</div>` : ''}
        ${v.notas ? `<p class="mt muted">${U.esc(v.notas)}</p>` : ''}
        <div class="form-acciones mt"><button class="btn btn-secundario" data-cerrar-modal>Cerrar</button></div>`,
    });
  }

  async function eliminar(id) {
    const v = Store.obtener('ventas', id);
    let devolver = true;
    const promesa = U.confirmar(`¿Eliminar el pedido <strong>${U.esc(v.numero || '')}</strong> de ${U.esc(v.cliente)} por ${U.soles(v.total)}?
      <label class="flex mt" style="font-size:13px"><input type="checkbox" id="chk-devolver" checked /> Devolver sus insumos al inventario</label>`, { ok: 'Eliminar' });
    U.$('#chk-devolver', U.modal.cuerpo).addEventListener('change', (e) => (devolver = e.target.checked));
    if (!(await promesa)) return;
    N.eliminarVenta(id, devolver);
    U.toast('Venta eliminada' + (devolver ? ' · insumos devueltos' : ''));
  }

  (T.modulos = T.modulos || []).push({
    id: 'ventas',
    titulo: 'Ventas / Pedidos',
    icono: '◎',
    render,
    badge: () => Store.listar('ventas').filter((v) => v.estado === 'pendiente').length,
  });
})(window.TAIS);

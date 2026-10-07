/* =====================================================================
   Módulo: Dashboard — resumen del negocio y gráficos (Chart.js)
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, N, Store } = T;

  /* ---------------- Ayudante de gráficos ----------------
     Paleta de marca: barras de una sola serie en un solo color (violeta o
     dorado). No hay gráficos de varias series para no depender del color. */
  const FUENTE = "Montserrat, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const Graficos = {
    activos: [],
    disponible: () => typeof window.Chart !== 'undefined',
    destruirTodos() { this.activos.forEach((c) => c.destroy()); this.activos = []; },
    barras(canvas, etiquetas, valores, { color = '#4A3A6A', horizontal = false, moneda = true, etiquetaSerie = '' } = {}) {
      const caja = canvas.parentElement;
      if (!this.disponible()) {
        caja.innerHTML = '<div class="chart-vacio">No se pudo cargar Chart.js (revisa tu conexión a internet).</div>';
        return;
      }
      if (!valores.length || valores.every((v) => !v)) {
        caja.innerHTML = '<div class="chart-vacio">Aún no hay ventas para mostrar.</div>';
        return;
      }
      const fmt = (v) => (moneda ? U.soles(v) : U.cantidad(v));
      const eje = { grid: { color: '#EFEAF3' }, border: { display: false }, ticks: { color: '#6B6672', font: { family: FUENTE, size: 11 } } };
      const ejeCat = { grid: { display: false }, border: { display: false }, ticks: { color: '#2F2C33', font: { family: FUENTE, size: 11 }, autoSkip: !horizontal } };
      const valorTicks = { ...eje, beginAtZero: true, ticks: { ...eje.ticks, callback: (v) => (moneda ? 'S/ ' + v : v) } };
      const chart = new window.Chart(canvas, {
        type: 'bar',
        data: { labels: etiquetas, datasets: [{ label: etiquetaSerie, data: valores, backgroundColor: color, hoverBackgroundColor: '#D4AF37', borderRadius: 4, borderSkipped: 'start', maxBarThickness: horizontal ? 22 : 36 }] },
        options: {
          indexAxis: horizontal ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#2F2C33', titleFont: { family: FUENTE }, bodyFont: { family: FUENTE }, callbacks: { label: (c) => ` ${fmt(c.parsed[horizontal ? 'x' : 'y'])}` } },
          },
          scales: horizontal ? { x: valorTicks, y: ejeCat } : { x: ejeCat, y: valorTicks },
        },
      });
      this.activos.push(chart);
    },
  };
  T.Graficos = Graficos;

  /* ---------------- Vista ---------------- */
  function render(el) {
    const hoy = U.hoy();
    const ventasMes = N.ventasEnRango(U.inicioMes(hoy), U.finMes(hoy));
    const totalMes = ventasMes.reduce((s, v) => s + U.num(v.total), 0);
    const ticket = ventasMes.length ? totalMes / ventasMes.length : 0;
    const topMes = N.topProductos(ventasMes, 1)[0];
    const bajos = N.insumosBajos();
    const tareasPend = Store.listar('tareas').filter((t) => !t.completada);
    const vencidas = tareasPend.filter(N.tareaVencida);
    const pedidosAbiertos = Store.listar('ventas').filter((v) => v.estado !== 'entregado');

    // Para los gráficos: últimos 12 meses
    const meses = U.ultimosMeses(12);
    const desde12 = meses[0] + '-01';
    const ventas12 = N.ventasEnRango(desde12, null);
    const lineas12 = N.lineas(ventas12);
    const top5 = N.topProductos(ventas12, 5);
    const porCat = N.agrupar(lineas12, (l) => l.categoria);
    const porOcasion = N.agrupar(lineas12, (l) => l.ocasion);
    const porMes = N.ventasPorMes(meses);

    const proximas = pedidosAbiertos
      .slice()
      .sort((a, b) => (a.fechaEntrega || '9').localeCompare(b.fechaEntrega || '9'))
      .slice(0, 6);

    el.innerHTML = `
      <div class="view-head">
        <div><h1>Dashboard</h1><p>Resumen de ${U.esc(U.mesNombre(U.mesClave(hoy)).replace(/ \d+$/, ''))} ${hoy.slice(0, 4)} · hoy ${U.fecha(hoy)}</p></div>
        <div class="acciones">
          <button class="btn btn-primario" data-nueva-venta>+ Nueva venta</button>
        </div>
      </div>

      ${Store.estaVacia() ? `
        <div class="bienvenida">
          <h2>Bienvenida a TAIS Gestión ✦</h2>
          <p>Aún no hay datos. Puedes cargar datos de ejemplo para recorrer la app o empezar registrando tus insumos y productos.</p>
          <div class="flex" style="justify-content:center">
            <button class="btn btn-primario" data-accion="cargar-ejemplo">Cargar datos de ejemplo</button>
            <a class="btn btn-secundario" href="#insumos">Empezar por los insumos</a>
          </div>
        </div>` : ''}

      <div class="grid grid-kpi">
        <div class="card kpi kpi-dorado"><span class="kpi-label">Ventas del mes</span><span class="kpi-valor">${U.soles(totalMes)}</span><span class="kpi-extra">${ventasMes.length} pedido(s)</span></div>
        <div class="card kpi"><span class="kpi-label">Pedidos del mes</span><span class="kpi-valor">${ventasMes.length}</span><span class="kpi-extra">${pedidosAbiertos.length} sin entregar</span></div>
        <div class="card kpi"><span class="kpi-label">Ticket promedio</span><span class="kpi-valor">${U.soles(ticket)}</span><span class="kpi-extra">por pedido este mes</span></div>
        <div class="card kpi"><span class="kpi-label">Más vendido del mes</span><span class="kpi-valor sm">${topMes ? U.esc(topMes.clave) : '—'}</span><span class="kpi-extra">${topMes ? U.cantidad(topMes.unidades) + ' unid.' : 'sin ventas aún'}</span></div>
        <a class="card kpi ${bajos.length ? 'alerta' : ''}" href="#insumos" style="text-decoration:none"><span class="kpi-label">Insumos stock bajo</span><span class="kpi-valor">${bajos.length}</span><span class="kpi-extra">${bajos.length ? 'Ver lista de compra →' : 'Todo en orden'}</span></a>
        <a class="card kpi ${vencidas.length ? 'alerta' : ''}" href="#tareas" style="text-decoration:none"><span class="kpi-label">Tareas pendientes</span><span class="kpi-valor">${tareasPend.length}</span><span class="kpi-extra">${vencidas.length ? vencidas.length + ' vencida(s)' : 'ninguna vencida'}</span></a>
      </div>

      <div class="grid grid-2 mt">
        <div class="card"><h2>Ventas por mes (últimos 12 meses)</h2><div class="chart-box"><canvas id="g-mes" aria-label="Ventas por mes"></canvas></div></div>
        <div class="card"><h2>Top 5 productos más vendidos (unidades)</h2><div class="chart-box"><canvas id="g-top" aria-label="Top 5 productos"></canvas></div></div>
        <div class="card"><h2>Ventas por categoría</h2><div class="chart-box"><canvas id="g-cat" aria-label="Ventas por categoría"></canvas></div></div>
        <div class="card"><h2>Ventas por ocasión</h2><div class="chart-box"><canvas id="g-oca" aria-label="Ventas por ocasión"></canvas></div></div>
      </div>

      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-head"><h2>Próximas entregas</h2><div class="acciones"><a class="btn btn-texto" href="#ventas">Ver pedidos →</a></div></div>
          ${proximas.length ? `<ul class="lista">${proximas.map((v) => `
            <li><div><strong>${U.esc(v.cliente)}</strong><span class="td-sub">${U.esc(v.items.map((i) => i.nombre).join(', '))}</span></div>
            <div class="der">${U.badgeEstadoVenta(v.estado)}<span class="td-sub ${v.fechaEntrega && v.fechaEntrega < hoy ? 'bad-txt' : ''}">Entrega ${U.fecha(v.fechaEntrega)}</span></div></li>`).join('')}</ul>`
            : U.vacio('No hay pedidos por entregar.')}
        </div>
        <div class="card">
          <div class="card-head"><h2>Insumos con stock bajo</h2><div class="acciones"><a class="btn btn-texto" href="#insumos">Ir a insumos →</a></div></div>
          ${bajos.length ? `<ul class="lista">${bajos.slice(0, 6).map((i) => `
            <li><div><strong>${U.esc(i.nombre)}</strong><span class="td-sub">${U.esc(i.categoria)}</span></div>
            <div class="der"><span class="bad-txt">${U.cantidad(i.stock)} ${U.esc(i.unidad)}</span><span class="td-sub">mínimo ${U.cantidad(i.stockMin)}</span></div></li>`).join('')}</ul>`
            : U.vacio('Todos los insumos están sobre el mínimo.')}
        </div>
      </div>`;

    U.$('[data-nueva-venta]', el).addEventListener('click', () => {
      location.hash = '#ventas';
      setTimeout(() => T.abrirFormVenta(), 0);
    });

    Graficos.barras(U.$('#g-mes', el), porMes.map((m) => U.mesNombre(m.mes)), porMes.map((m) => m.total), { color: '#4A3A6A' });
    Graficos.barras(U.$('#g-top', el), top5.map((p) => p.clave), top5.map((p) => p.unidades), { color: '#D4AF37', horizontal: true, moneda: false });
    Graficos.barras(U.$('#g-cat', el), porCat.map((g) => g.clave), porCat.map((g) => g.ingreso), { color: '#8E76B8', horizontal: true });
    Graficos.barras(U.$('#g-oca', el), porOcasion.map((g) => g.clave), porOcasion.map((g) => g.ingreso), { color: '#8E76B8', horizontal: true });
  }

  (T.modulos = T.modulos || []).push({
    id: 'dashboard',
    titulo: 'Dashboard',
    icono: '◈',
    render,
  });
})(window.TAIS);

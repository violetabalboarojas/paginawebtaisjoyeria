/* =====================================================================
   negocio.js — Reglas del negocio
   Cálculos de costos y márgenes, descuento de insumos por receta,
   compras de insumos, sugerencias de compra y estadísticas de ventas.
   En la v2 estas reglas pueden moverse al backend tal cual.
   ===================================================================== */
(function (T) {
  'use strict';
  const { U, Store } = T;

  const N = {};

  /* ---------------- Productos ---------------- */

  /** Costo de una receta [{insumoId, cantidad}] según el costo unitario actual de cada insumo. */
  N.costoReceta = (receta = []) =>
    U.redondear(receta.reduce((s, r) => {
      const ins = Store.obtener('insumos', r.insumoId);
      return s + (ins ? U.num(ins.costo) * U.num(r.cantidad) : 0);
    }, 0));

  /** Margen sobre el precio de venta. */
  N.margen = (costo, precio) => {
    const c = U.num(costo), p = U.num(precio);
    return { ganancia: U.redondear(p - c), pct: p > 0 ? U.redondear(((p - c) / p) * 100, 1) : 0 };
  };

  /* ---------------- Inventario ---------------- */

  /** Calcula qué insumos consume una lista de items de venta según las recetas. */
  N.consumoDeItems = (items = []) => {
    const mapa = {};
    items.forEach((it) => {
      const p = Store.obtener('productos', it.productoId);
      (p?.receta || []).forEach((r) => {
        mapa[r.insumoId] = U.redondear((mapa[r.insumoId] || 0) + U.num(r.cantidad) * U.num(it.cantidad), 4);
      });
    });
    return Object.entries(mapa).map(([insumoId, cantidad]) => ({ insumoId, cantidad }));
  };

  /** Suma (signo=+1) o resta (signo=-1) cantidades al stock. No guarda (lo hace quien llama). */
  N.moverStock = (lineas, signo) => {
    lineas.forEach((l) => {
      const ins = Store.obtener('insumos', l.insumoId);
      if (ins) ins.stock = U.redondear(U.num(ins.stock) + signo * U.num(l.cantidad), 4);
    });
  };

  /** Insumos que no alcanzan para un consumo dado. `devolver` = consumo que se repondrá antes (edición). */
  N.faltantes = (consumo, devolver = []) =>
    consumo
      .map((c) => {
        const ins = Store.obtener('insumos', c.insumoId);
        if (!ins) return null;
        const extra = devolver.filter((d) => d.insumoId === c.insumoId).reduce((s, d) => s + U.num(d.cantidad), 0);
        const disponible = U.num(ins.stock) + extra;
        return disponible < c.cantidad ? { insumo: ins, necesita: c.cantidad, disponible } : null;
      })
      .filter(Boolean);

  N.stockBajo = (ins) => U.num(ins.stock) <= U.num(ins.stockMin);
  N.insumosBajos = () => Store.listar('insumos').filter(N.stockBajo);

  /** Cantidad de cada insumo comprometida en pedidos aún no entregados. */
  N.comprometido = () => {
    const mapa = {};
    Store.listar('ventas')
      .filter((v) => v.estado !== 'entregado')
      .forEach((v) => (v.consumo || []).forEach((c) => (mapa[c.insumoId] = (mapa[c.insumoId] || 0) + U.num(c.cantidad))));
    return mapa;
  };

  /**
   * Lista sugerida de compra.
   * Regla: entra todo insumo con stock ≤ mínimo (incluye negativos = faltó para
   * pedidos pendientes). Se sugiere comprar hasta llegar al doble del mínimo.
   */
  N.insumosAComprar = () => {
    const comp = N.comprometido();
    return Store.listar('insumos')
      .filter(N.stockBajo)
      .map((ins) => {
        const stock = U.num(ins.stock), min = U.num(ins.stockMin);
        const objetivo = Math.max(min * 2, min + 1);
        const sugerido = Math.ceil(objetivo - stock);
        return {
          insumo: ins,
          stock,
          min,
          comprometido: U.redondear(comp[ins.id] || 0),
          sugerido,
          costoEst: U.redondear(sugerido * U.num(ins.costo)),
          motivo: stock < 0 ? 'Faltante para pedidos pendientes' : stock < min ? 'Por debajo del mínimo' : 'En el mínimo',
        };
      })
      .sort((a, b) => a.stock - a.min - (b.stock - b.min));
  };

  /** Registra una compra (entrada) y suma al stock. Actualiza el costo unitario al último precio. */
  N.registrarCompra = (datos) => {
    const ins = Store.obtener('insumos', datos.insumoId);
    if (!ins) throw new Error('Insumo no encontrado');
    ins.stock = U.redondear(U.num(ins.stock) + U.num(datos.cantidad), 4);
    if (U.num(datos.costoUnit) > 0) ins.costo = U.num(datos.costoUnit);
    if (datos.proveedor && !ins.proveedor) ins.proveedor = datos.proveedor;
    return Store.crear('compras', datos);
  };

  /** Elimina una compra y descuenta lo que había sumado. */
  N.eliminarCompra = (id) => {
    const c = Store.obtener('compras', id);
    if (!c) return;
    N.moverStock([{ insumoId: c.insumoId, cantidad: c.cantidad }], -1);
    Store.eliminar('compras', id);
  };

  /* ---------------- Ventas ---------------- */

  N.totalesVenta = (items, descuento) => {
    const subtotal = U.redondear(items.reduce((s, it) => s + U.num(it.cantidad) * U.num(it.precio), 0));
    return { subtotal, total: U.redondear(Math.max(0, subtotal - U.num(descuento))) };
  };

  /** Crea una venta y descuenta automáticamente los insumos de su receta. */
  N.registrarVenta = (datos) => {
    const consumo = N.consumoDeItems(datos.items);
    N.moverStock(consumo, -1);
    return Store.crear('ventas', Object.assign({}, datos, N.totalesVenta(datos.items, datos.descuento), {
      numero: Store.siguienteNumeroVenta(),
      consumo,
    }));
  };

  /** Edita una venta: devuelve al stock lo consumido antes y descuenta lo nuevo. */
  N.actualizarVenta = (id, datos) => {
    const v = Store.obtener('ventas', id);
    if (!v) return null;
    N.moverStock(v.consumo || [], +1);
    const consumo = N.consumoDeItems(datos.items);
    N.moverStock(consumo, -1);
    return Store.actualizar('ventas', id, Object.assign({}, datos, N.totalesVenta(datos.items, datos.descuento), { consumo }));
  };

  /** Elimina una venta. Por defecto devuelve sus insumos al stock. */
  N.eliminarVenta = (id, devolverStock = true) => {
    const v = Store.obtener('ventas', id);
    if (!v) return;
    if (devolverStock) N.moverStock(v.consumo || [], +1);
    Store.eliminar('ventas', id);
  };

  /* ---------------- Estadísticas ---------------- */

  N.ventasEnRango = (desde, hasta) => Store.listar('ventas').filter((v) => U.enRango(v.fecha, desde, hasta));

  /**
   * "Líneas" de venta: un registro por producto vendido, con el total
   * prorrateado (el descuento del pedido se reparte según el subtotal de cada línea).
   */
  N.lineas = (ventas) => {
    const out = [];
    ventas.forEach((v) => {
      const sub = U.num(v.subtotal) || 1;
      const factor = U.num(v.total) / sub;
      v.items.forEach((it) => {
        const p = Store.obtener('productos', it.productoId);
        const bruto = U.num(it.cantidad) * U.num(it.precio);
        out.push({
          venta: v,
          productoId: it.productoId,
          nombre: p?.nombre || it.nombre || '(producto eliminado)',
          categoria: p?.categoria || 'Otro',
          ocasion: v.ocasion || p?.ocasion || 'Todo uso',
          cantidad: U.num(it.cantidad),
          ingreso: U.redondear(bruto * factor),
          costo: U.redondear(U.num(p?.costo) * U.num(it.cantidad)),
        });
      });
    });
    return out;
  };

  /** Agrupa líneas por una clave → [{clave, unidades, ingreso, costo, pedidos}] ordenado por ingreso. */
  N.agrupar = (lineas, fnClave) => {
    const m = new Map();
    lineas.forEach((l) => {
      const k = fnClave(l);
      const g = m.get(k) || { clave: k, unidades: 0, ingreso: 0, costo: 0, pedidos: new Set() };
      g.unidades += l.cantidad;
      g.ingreso += l.ingreso;
      g.costo += l.costo;
      g.pedidos.add(l.venta.id);
      m.set(k, g);
    });
    return [...m.values()]
      .map((g) => ({ ...g, ingreso: U.redondear(g.ingreso), costo: U.redondear(g.costo), pedidos: g.pedidos.size }))
      .sort((a, b) => b.ingreso - a.ingreso);
  };

  N.topProductos = (ventas, n = 5) => {
    const g = N.agrupar(N.lineas(ventas), (l) => l.nombre);
    return g.sort((a, b) => b.unidades - a.unidades || b.ingreso - a.ingreso).slice(0, n);
  };

  /** Agrupa ventas por campo del pedido (canal, método de pago…). */
  N.agruparVentas = (ventas, campo) => {
    const m = new Map();
    ventas.forEach((v) => {
      const k = v[campo] || '—';
      const g = m.get(k) || { clave: k, pedidos: 0, ingreso: 0 };
      g.pedidos++;
      g.ingreso = U.redondear(g.ingreso + U.num(v.total));
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.ingreso - a.ingreso);
  };

  N.ventasPorMes = (meses) => {
    const m = Object.fromEntries(meses.map((k) => [k, { total: 0, pedidos: 0 }]));
    Store.listar('ventas').forEach((v) => {
      const k = U.mesClave(v.fecha);
      if (m[k]) { m[k].total = U.redondear(m[k].total + U.num(v.total)); m[k].pedidos++; }
    });
    return meses.map((k) => ({ mes: k, ...m[k] }));
  };

  N.tareaVencida = (t) => !t.completada && t.fechaLimite && t.fechaLimite < U.hoy();

  T.N = N;
})(window.TAIS);

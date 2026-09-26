/* Telate · reportes.js
   Cálculos del negocio (costos, consumo, stock) y definición de reportes. */
'use strict';

/* ---------- Cálculos ---------- */
const Calc = {
  insumosPorId: () => Object.fromEntries(Storage.get('insumos').map((i) => [i.id, i])),
  productosPorId: () => Object.fromEntries(Storage.get('productos').map((p) => [p.id, p])),
  receta: (productoId) => Storage.get('recetas')[productoId] || [],

  /** Costo de un conjunto de líneas [{insumoId, cantidad}]. */
  costoLineas(lineas, insMap = Calc.insumosPorId()) {
    return lineas.reduce((s, l) => s + (Number(insMap[l.insumoId]?.costo) || 0) * (Number(l.cantidad) || 0), 0);
  },
  costoProducto(productoId, insMap) { return Calc.costoLineas(Calc.receta(productoId), insMap); },

  /** Consumo total de insumos para items [{productoId, cantidad}] → {insumoId: cantidad}. */
  consumo(items) {
    const out = {};
    items.forEach((it) => Calc.receta(it.productoId).forEach((l) => {
      out[l.insumoId] = (out[l.insumoId] || 0) + l.cantidad * it.cantidad;
    }));
    return out;
  },
  sumarLineas(lineas) {
    const out = {};
    lineas.forEach((l) => { if (l.insumoId) out[l.insumoId] = (out[l.insumoId] || 0) + (Number(l.cantidad) || 0); });
    return out;
  },
  /** Insumos cuyo stock no alcanza para un consumo {insumoId: cantidad}. */
  faltantes(consumo, insMap = Calc.insumosPorId()) {
    return Object.entries(consumo).map(([id, necesita]) => {
      const ins = insMap[id];
      if (!ins) return null;
      const falta = necesita - Number(ins.stock);
      return falta > 1e-9 ? { insumo: ins, necesita, stock: Number(ins.stock), falta } : null;
    }).filter(Boolean);
  },
  lotesPosibles(lineas, insMap = Calc.insumosPorId()) {
    const validas = lineas.filter((l) => insMap[l.insumoId] && l.cantidad > 0);
    if (!validas.length) return 0;
    return Math.max(0, Math.min(...validas.map((l) => Math.floor(Number(insMap[l.insumoId].stock) / l.cantidad))));
  },
  stockBajo: () => Storage.get('insumos').filter((i) => Number(i.stock) < Number(i.minimo)),
  aReponer: (ins) => Math.max(0, Number(ins.minimo) * 2 - Number(ins.stock)),

  ventasEnRango(desde, hasta) {
    return Storage.get('ventas').filter((v) => (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta));
  },
  lineasVenta: (ventas) => ventas.flatMap((v) => v.items.map((it) => ({ ...it, fecha: v.fecha, canal: v.canal, pago: v.pago }))),

  /** Ranking de productos por unidades (y monto) para un conjunto de ventas. */
  rankingProductos(ventas) {
    const prods = Calc.productosPorId();
    const acc = {};
    Calc.lineasVenta(ventas).forEach((l) => {
      const p = prods[l.productoId];
      const r = acc[l.productoId] || (acc[l.productoId] = {
        productoId: l.productoId,
        nombre: p ? p.nombre : l.nombre,
        presentacion: p ? p.presentacion : l.presentacion,
        categoria: p ? p.categoria : l.categoria,
        unidades: 0, monto: 0,
      });
      r.unidades += Number(l.cantidad);
      r.monto += Number(l.subtotal);
    });
    return Object.values(acc).sort((a, b) => b.unidades - a.unidades || b.monto - a.monto);
  },
  tareaVencida: (t) => !!t.fechaLimite && t.estado !== 'hecha' && t.fechaLimite < Util.hoy(),
  lineasMezcla: (m) => [{ insumoId: m.teBaseId, cantidad: Number(m.teBaseCantidad) }, ...(m.componentes || [])].filter((l) => l.insumoId),
};

/* ---------- Reportes ----------
   Cada reporte devuelve { columnas:[{k, t, tipo}], filas:[{...}], totales?, nota? }.
   Tipos: texto, entero, numero, moneda, porcentaje, fecha (ISO YYYY-MM-DD). */
const Reportes = (() => {
  const etiqueta = (r) => `${r.nombre} (${r.presentacion})`;
  const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);

  const lista = [
    {
      id: 'ranking', titulo: 'Productos más vendidos', hoja: 'Más vendidos',
      descripcion: 'Ranking por unidades vendidas, con su posición por monto.',
      generar(desde, hasta) {
        const rank = Calc.rankingProductos(Calc.ventasEnRango(desde, hasta));
        const totU = sum(rank, 'unidades'), totM = sum(rank, 'monto');
        const porMonto = [...rank].sort((a, b) => b.monto - a.monto).map((r) => r.productoId);
        return {
          columnas: [
            { k: 'puesto', t: 'Puesto (unid.)', tipo: 'entero' },
            { k: 'producto', t: 'Producto', tipo: 'texto' },
            { k: 'categoria', t: 'Categoría', tipo: 'texto' },
            { k: 'unidades', t: 'Unidades', tipo: 'numero' },
            { k: 'monto', t: 'Monto vendido', tipo: 'moneda' },
            { k: 'partU', t: '% unidades', tipo: 'porcentaje' },
            { k: 'partM', t: '% monto', tipo: 'porcentaje' },
            { k: 'puestoM', t: 'Puesto (monto)', tipo: 'entero' },
          ],
          filas: rank.map((r, i) => ({
            puesto: i + 1, producto: etiqueta(r), categoria: r.categoria, unidades: r.unidades, monto: Util.r2(r.monto),
            partU: totU ? r.unidades / totU : 0, partM: totM ? r.monto / totM : 0, puestoM: porMonto.indexOf(r.productoId) + 1,
          })),
          totales: { unidades: totU, monto: Util.r2(totM), partU: totU ? 1 : 0, partM: totM ? 1 : 0 },
        };
      },
    },
    {
      id: 'segmentos', titulo: 'Ventas por categoría, canal y método de pago', hoja: 'Por categoría-canal-pago',
      descripcion: 'Tortas vs tés, canales de venta y medios de pago.',
      generar(desde, hasta) {
        const ventas = Calc.ventasEnRango(desde, hasta);
        const totM = sum(ventas, 'total');
        const filas = [];
        const agregar = (dimension, grupos) => {
          Object.entries(grupos).sort((a, b) => b[1].monto - a[1].monto).forEach(([valor, g]) => {
            filas.push({ dimension, valor, ventas: g.ventas.size, unidades: g.unidades, monto: Util.r2(g.monto), part: totM ? g.monto / totM : 0 });
          });
        };
        const nuevo = () => ({ ventas: new Set(), unidades: 0, monto: 0 });
        const cat = {}, canal = {}, pago = {};
        ventas.forEach((v) => {
          v.items.forEach((it) => {
            const g = cat[it.categoria] || (cat[it.categoria] = nuevo());
            g.ventas.add(v.id); g.unidades += Number(it.cantidad); g.monto += Number(it.subtotal);
          });
          const u = sum(v.items, 'cantidad');
          [[canal, v.canal], [pago, v.pago]].forEach(([mapa, clave]) => {
            const g = mapa[clave] || (mapa[clave] = nuevo());
            g.ventas.add(v.id); g.unidades += u; g.monto += Number(v.total);
          });
        });
        agregar('Categoría', cat);
        agregar('Canal', canal);
        agregar('Método de pago', pago);
        return {
          columnas: [
            { k: 'dimension', t: 'Agrupado por', tipo: 'texto' },
            { k: 'valor', t: 'Valor', tipo: 'texto' },
            { k: 'ventas', t: 'N° de ventas', tipo: 'entero' },
            { k: 'unidades', t: 'Unidades', tipo: 'numero' },
            { k: 'monto', t: 'Monto', tipo: 'moneda' },
            { k: 'part', t: '% del monto', tipo: 'porcentaje' },
          ],
          filas,
          nota: 'Cada bloque (categoría, canal, método de pago) suma el 100% del monto del período.',
        };
      },
    },
    {
      id: 'diarias', titulo: 'Ventas diarias', hoja: 'Ventas diarias',
      descripcion: 'Totales por día del período.',
      generar(desde, hasta) {
        const ventas = Calc.ventasEnRango(desde, hasta);
        const porDia = {};
        ventas.forEach((v) => {
          const d = porDia[v.fecha] || (porDia[v.fecha] = { ventas: 0, unidades: 0, monto: 0 });
          d.ventas++; d.unidades += sum(v.items, 'cantidad'); d.monto += Number(v.total);
        });
        let fechas = Object.keys(porDia).sort();
        // Con un rango acotado se listan también los días sin ventas.
        if (desde && hasta && desde <= hasta && fechas.length) {
          const todas = [];
          for (let f = desde; f <= hasta && todas.length <= 400; f = Util.sumarDias(f, 1)) todas.push(f);
          if (todas.length <= 400) fechas = todas;
        }
        const filas = fechas.map((f) => {
          const d = porDia[f] || { ventas: 0, unidades: 0, monto: 0 };
          return { fecha: f, ventas: d.ventas, unidades: d.unidades, monto: Util.r2(d.monto), ticket: d.ventas ? Util.r2(d.monto / d.ventas) : 0 };
        });
        const tv = sum(filas, 'ventas'), tm = sum(filas, 'monto');
        return {
          columnas: [
            { k: 'fecha', t: 'Fecha', tipo: 'fecha' },
            { k: 'ventas', t: 'N° de ventas', tipo: 'entero' },
            { k: 'unidades', t: 'Unidades', tipo: 'numero' },
            { k: 'monto', t: 'Monto', tipo: 'moneda' },
            { k: 'ticket', t: 'Ticket promedio', tipo: 'moneda' },
          ],
          filas,
          totales: { ventas: tv, unidades: sum(filas, 'unidades'), monto: Util.r2(tm), ticket: tv ? Util.r2(tm / tv) : 0 },
        };
      },
    },
    {
      id: 'mensuales', titulo: 'Ventas mensuales', hoja: 'Ventas mensuales',
      descripcion: 'Totales por mes, separando tortas y tés.',
      generar(desde, hasta) {
        const porMes = {};
        Calc.ventasEnRango(desde, hasta).forEach((v) => {
          const k = v.fecha.slice(0, 7);
          const m = porMes[k] || (porMes[k] = { ventas: 0, unidades: 0, tortas: 0, tes: 0, monto: 0 });
          m.ventas++; m.monto += Number(v.total);
          v.items.forEach((it) => {
            m.unidades += Number(it.cantidad);
            if (it.categoria === 'Torta') m.tortas += Number(it.subtotal); else m.tes += Number(it.subtotal);
          });
        });
        const filas = Object.keys(porMes).sort().map((k) => {
          const m = porMes[k];
          return { mes: Util.mesLegible(k), ventas: m.ventas, unidades: m.unidades, tortas: Util.r2(m.tortas), tes: Util.r2(m.tes), monto: Util.r2(m.monto), ticket: Util.r2(m.monto / m.ventas) };
        });
        const tv = sum(filas, 'ventas'), tm = sum(filas, 'monto');
        return {
          columnas: [
            { k: 'mes', t: 'Mes', tipo: 'texto' },
            { k: 'ventas', t: 'N° de ventas', tipo: 'entero' },
            { k: 'unidades', t: 'Unidades', tipo: 'numero' },
            { k: 'tortas', t: 'Monto tortas', tipo: 'moneda' },
            { k: 'tes', t: 'Monto tés', tipo: 'moneda' },
            { k: 'monto', t: 'Monto total', tipo: 'moneda' },
            { k: 'ticket', t: 'Ticket promedio', tipo: 'moneda' },
          ],
          filas,
          totales: { ventas: tv, unidades: sum(filas, 'unidades'), tortas: Util.r2(sum(filas, 'tortas')), tes: Util.r2(sum(filas, 'tes')), monto: Util.r2(tm), ticket: tv ? Util.r2(tm / tv) : 0 },
        };
      },
    },
    {
      id: 'consumo', titulo: 'Consumo de insumos', hoja: 'Consumo de insumos',
      descripcion: 'Insumos descontados por las ventas del período (según receta vigente al vender).',
      generar(desde, hasta) {
        const ins = Calc.insumosPorId();
        const acc = {};
        Calc.ventasEnRango(desde, hasta).forEach((v) => (v.consumo || []).forEach((c) => {
          acc[c.insumoId] = (acc[c.insumoId] || 0) + Number(c.cantidad);
        }));
        const filas = Object.entries(acc).map(([id, cant]) => {
          const i = ins[id];
          const costo = Number(i?.costo) || 0;
          return { insumo: i ? i.nombre : '(insumo eliminado)', unidad: i?.unidad || '', cantidad: Util.r4(cant), costo, total: Util.r2(cant * costo), stock: i ? Number(i.stock) : 0 };
        }).sort((a, b) => b.total - a.total);
        return {
          columnas: [
            { k: 'insumo', t: 'Insumo', tipo: 'texto' },
            { k: 'unidad', t: 'Unidad', tipo: 'texto' },
            { k: 'cantidad', t: 'Cantidad consumida', tipo: 'numero' },
            { k: 'costo', t: 'Costo por unidad', tipo: 'moneda' },
            { k: 'total', t: 'Costo total', tipo: 'moneda' },
            { k: 'stock', t: 'Stock actual', tipo: 'numero' },
          ],
          filas,
          totales: { total: Util.r2(sum(filas, 'total')) },
        };
      },
    },
    {
      id: 'compras', titulo: 'Stock bajo y compras sugeridas', hoja: 'Compras sugeridas', sinFechas: true,
      descripcion: 'Insumos por debajo del mínimo. Cantidad a reponer = mínimo × 2 − stock actual.',
      generar() {
        const filas = Calc.stockBajo().map((i) => {
          const reponer = Util.r4(Calc.aReponer(i));
          return { insumo: i.nombre, unidad: i.unidad, stock: Number(i.stock), minimo: Number(i.minimo), reponer, costo: Number(i.costo), estimado: Util.r2(reponer * i.costo), proveedor: i.proveedor || '' };
        }).sort((a, b) => a.proveedor.localeCompare(b.proveedor) || a.insumo.localeCompare(b.insumo));
        return {
          columnas: [
            { k: 'insumo', t: 'Insumo', tipo: 'texto' },
            { k: 'unidad', t: 'Unidad', tipo: 'texto' },
            { k: 'stock', t: 'Stock actual', tipo: 'numero' },
            { k: 'minimo', t: 'Stock mínimo', tipo: 'numero' },
            { k: 'reponer', t: 'Cantidad a reponer', tipo: 'numero' },
            { k: 'costo', t: 'Costo por unidad', tipo: 'moneda' },
            { k: 'estimado', t: 'Costo estimado', tipo: 'moneda' },
            { k: 'proveedor', t: 'Proveedor', tipo: 'texto' },
          ],
          filas,
          totales: { estimado: Util.r2(sum(filas, 'estimado')) },
          nota: 'Refleja el stock actual (no depende del rango de fechas).',
        };
      },
    },
    {
      id: 'rentabilidad', titulo: 'Rentabilidad por producto', hoja: 'Rentabilidad',
      descripcion: 'Precio, costo de receta y margen; ganancia bruta con las ventas del período.',
      generar(desde, hasta) {
        const ins = Calc.insumosPorId();
        const rank = Object.fromEntries(Calc.rankingProductos(Calc.ventasEnRango(desde, hasta)).map((r) => [r.productoId, r]));
        const filas = Storage.get('productos').map((p) => {
          const costo = Util.r2(Calc.costoProducto(p.id, ins));
          const r = rank[p.id];
          const unidades = r ? r.unidades : 0, monto = r ? r.monto : 0;
          return {
            producto: `${p.nombre} (${p.presentacion})`, categoria: p.categoria, estado: p.activo ? 'Activo' : 'Inactivo',
            receta: Calc.receta(p.id).length ? 'Sí' : 'No', precio: Number(p.precio), costo, margen: Util.r2(p.precio - costo),
            margenPct: p.precio ? (p.precio - costo) / p.precio : 0, unidades, ventas: Util.r2(monto), ganancia: Util.r2(monto - costo * unidades),
          };
        }).sort((a, b) => b.ganancia - a.ganancia || b.margenPct - a.margenPct);
        return {
          columnas: [
            { k: 'producto', t: 'Producto', tipo: 'texto' },
            { k: 'categoria', t: 'Categoría', tipo: 'texto' },
            { k: 'estado', t: 'Estado', tipo: 'texto' },
            { k: 'receta', t: 'Tiene receta', tipo: 'texto' },
            { k: 'precio', t: 'Precio', tipo: 'moneda' },
            { k: 'costo', t: 'Costo unitario', tipo: 'moneda' },
            { k: 'margen', t: 'Margen unitario', tipo: 'moneda' },
            { k: 'margenPct', t: 'Margen %', tipo: 'porcentaje' },
            { k: 'unidades', t: 'Unidades vendidas', tipo: 'numero' },
            { k: 'ventas', t: 'Monto vendido', tipo: 'moneda' },
            { k: 'ganancia', t: 'Ganancia bruta', tipo: 'moneda' },
          ],
          filas,
          totales: { unidades: sum(filas, 'unidades'), ventas: Util.r2(sum(filas, 'ventas')), ganancia: Util.r2(sum(filas, 'ganancia')) },
          nota: 'Costo según receta y costos actuales de insumos. Productos sin receta muestran costo 0.',
        };
      },
    },
    {
      id: 'tareas', titulo: 'Tareas por estado y responsable', hoja: 'Tareas',
      descripcion: 'Tareas con fecha límite en el período (o sin fecha), agrupadas por responsable.',
      generar(desde, hasta) {
        const tareas = Storage.get('tareas').filter((t) => !t.fechaLimite || ((!desde || t.fechaLimite >= desde) && (!hasta || t.fechaLimite <= hasta)));
        const acc = {};
        tareas.forEach((t) => {
          const k = t.responsable || '(sin asignar)';
          const r = acc[k] || (acc[k] = { responsable: k, pendiente: 0, proceso: 0, hecha: 0, vencidas: 0, total: 0 });
          if (t.estado === 'hecha') r.hecha++; else if (t.estado === 'en proceso') r.proceso++; else r.pendiente++;
          if (Calc.tareaVencida(t)) r.vencidas++;
          r.total++;
        });
        const filas = Object.values(acc).sort((a, b) => b.total - a.total);
        return {
          columnas: [
            { k: 'responsable', t: 'Responsable', tipo: 'texto' },
            { k: 'pendiente', t: 'Pendientes', tipo: 'entero' },
            { k: 'proceso', t: 'En proceso', tipo: 'entero' },
            { k: 'hecha', t: 'Hechas', tipo: 'entero' },
            { k: 'vencidas', t: 'Vencidas', tipo: 'entero' },
            { k: 'total', t: 'Total', tipo: 'entero' },
          ],
          filas,
          totales: ['pendiente', 'proceso', 'hecha', 'vencidas', 'total'].reduce((o, k) => ({ ...o, [k]: sum(filas, k) }), {}),
        };
      },
    },
    {
      id: 'tareas-detalle', titulo: 'Detalle de tareas', hoja: 'Detalle de tareas',
      descripcion: 'Listado completo de tareas del período.',
      generar(desde, hasta) {
        const prio = { alta: 0, media: 1, baja: 2 };
        const filas = Storage.get('tareas')
          .filter((t) => !t.fechaLimite || ((!desde || t.fechaLimite >= desde) && (!hasta || t.fechaLimite <= hasta)))
          .sort((a, b) => (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999') || prio[a.prioridad] - prio[b.prioridad])
          .map((t) => ({
            titulo: t.titulo, area: t.area, responsable: t.responsable || '', prioridad: cap(t.prioridad),
            fecha: t.fechaLimite || '', estado: cap(t.estado), vencida: Calc.tareaVencida(t) ? 'Sí' : 'No',
          }));
        return {
          columnas: [
            { k: 'titulo', t: 'Tarea', tipo: 'texto' },
            { k: 'area', t: 'Área', tipo: 'texto' },
            { k: 'responsable', t: 'Responsable', tipo: 'texto' },
            { k: 'prioridad', t: 'Prioridad', tipo: 'texto' },
            { k: 'fecha', t: 'Fecha límite', tipo: 'fecha' },
            { k: 'estado', t: 'Estado', tipo: 'texto' },
            { k: 'vencida', t: 'Vencida', tipo: 'texto' },
          ],
          filas,
        };
      },
    },
  ];

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  /** Formato de un valor para mostrar en pantalla (y estimar anchos en Excel). */
  function formatear(valor, tipo) {
    if (valor === '' || valor === null || valor === undefined) return '';
    switch (tipo) {
      case 'moneda': return Util.soles(valor);
      case 'porcentaje': return Util.pct(valor);
      case 'entero': return Util.num(valor, 0);
      case 'numero': return Util.num(valor, 3);
      case 'fecha': return Util.fechaLegible(valor);
      default: return String(valor);
    }
  }

  function obtener(id) { return lista.find((r) => r.id === id); }

  function generar(id, desde, hasta) {
    const def = obtener(id);
    const r = def.generar(desde, hasta);
    return { id, titulo: def.titulo, hoja: def.hoja, descripcion: def.descripcion, sinFechas: !!def.sinFechas, desde, hasta, ...r };
  }

  return { lista, obtener, generar, formatear };
})();

/* Telate · excel.js
   Exportación de reportes a .xlsx con SheetJS. */
'use strict';

const Excel = (() => {
  const FORMATOS = {
    moneda: '"S/" #,##0.00',
    porcentaje: '0.0%',
    entero: '#,##0',
    numero: '#,##0.###',
    fecha: 'dd/mm/yyyy',
  };
  const FILA_ENCABEZADO = 3; // fila 0: título, 1: período, 2: vacía, 3: encabezados

  function disponible() {
    if (typeof XLSX === 'undefined') {
      alert('No se pudo cargar la librería de Excel (SheetJS). Revisa tu conexión a internet y recarga la página.');
      return false;
    }
    return true;
  }

  /** Fecha ISO → número de serie de Excel (evita desfases de zona horaria). */
  function serialFecha(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function valorCelda(valor, tipo) {
    if (valor === '' || valor === null || valor === undefined) return '';
    if (tipo === 'fecha') return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? serialFecha(valor) : valor;
    if (tipo === 'texto') return String(valor);
    return Number(valor);
  }

  function textoPeriodo(rep) {
    if (rep.sinFechas) return `Generado el ${Util.fechaLegible(Util.hoy())} · datos al día de hoy`;
    return `Período: ${Util.textoRango(rep.desde, rep.hasta)} · Generado el ${Util.fechaLegible(Util.hoy())}`;
  }

  function construirHoja(rep) {
    const cols = rep.columnas;
    const aoa = [[`Telate · ${rep.titulo}`], [textoPeriodo(rep)], [], cols.map((c) => c.t)];
    rep.filas.forEach((f) => aoa.push(cols.map((c) => valorCelda(f[c.k], c.tipo))));
    const hayTotales = rep.totales && rep.filas.length;
    if (hayTotales) aoa.push(cols.map((c, i) => (i === 0 ? 'TOTAL' : valorCelda(rep.totales[c.k], c.tipo))));
    if (!rep.filas.length) aoa.push(['Sin datos para el período seleccionado.']);
    if (rep.nota) aoa.push([], [`Nota: ${rep.nota}`]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Formatos numéricos (moneda en soles, %, fechas).
    const ultimaFila = FILA_ENCABEZADO + rep.filas.length + (hayTotales ? 1 : 0);
    for (let r = FILA_ENCABEZADO + 1; r <= ultimaFila; r++) {
      cols.forEach((c, ci) => {
        const celda = ws[XLSX.utils.encode_cell({ r, c: ci })];
        if (celda && celda.t === 'n' && FORMATOS[c.tipo]) celda.z = FORMATOS[c.tipo];
      });
    }

    // Anchos de columna según el contenido.
    ws['!cols'] = cols.map((c) => {
      const largos = rep.filas.map((f) => Reportes.formatear(f[c.k], c.tipo).length);
      if (hayTotales) largos.push(Reportes.formatear(rep.totales[c.k], c.tipo).length);
      return { wch: Math.min(60, Math.max(10, c.t.length, ...largos) + 2) };
    });

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, cols.length - 1) } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, cols.length - 1) } },
    ];
    if (rep.filas.length) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: FILA_ENCABEZADO, c: 0 }, e: { r: FILA_ENCABEZADO + rep.filas.length, c: cols.length - 1 } }) };
    }
    return ws;
  }

  function nombreHoja(nombre, usados) {
    let base = nombre.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    let final = base, i = 2;
    while (usados.has(final)) final = `${base.slice(0, 28)} ${i++}`;
    usados.add(final);
    return final;
  }

  function sufijoPeriodo(desde, hasta) {
    return desde || hasta ? `_${desde || 'inicio'}_a_${hasta || Util.hoy()}` : `_${Util.hoy()}`;
  }

  function descargar(rep) {
    if (!disponible()) return false;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, construirHoja(rep), nombreHoja(rep.hoja, new Set()));
    const periodo = rep.sinFechas ? `_${Util.hoy()}` : sufijoPeriodo(rep.desde, rep.hasta);
    XLSX.writeFile(wb, `Telate_${rep.id}${periodo}.xlsx`);
    return true;
  }

  function descargarTodo(desde, hasta) {
    if (!disponible()) return false;
    const wb = XLSX.utils.book_new();
    const usados = new Set();
    Reportes.lista.forEach((def) => {
      const rep = Reportes.generar(def.id, desde, hasta);
      XLSX.utils.book_append_sheet(wb, construirHoja(rep), nombreHoja(rep.hoja, usados));
    });
    XLSX.writeFile(wb, `Telate_reportes${sufijoPeriodo(desde, hasta)}.xlsx`);
    return true;
  }

  return { descargar, descargarTodo };
})();

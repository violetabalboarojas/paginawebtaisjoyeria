(function () {
  const data = JSON.parse(document.getElementById("series").textContent);
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const C = { teal: v("--teal"), orange: v("--orange"), red: v("--red"), green: v("--green"), muted: v("--muted"), line: v("--line"), ink: v("--ink"), aqua: "#6CCBC3" };
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = C.muted;
  Chart.defaults.borderColor = C.line;
  const fmt = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
  const base = (extra) => Object.assign({
    responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.format(c.parsed.y)}` } } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, suggestedMax: 10, ticks: { precision: 0, callback: (x) => fmt.format(x) } } },
  }, extra || {});
  const legendOn = { plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10 } },
    tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.format(c.parsed.y)}` } } } };

  new Chart("ch-placed", { type: "bar", data: { labels: data.labels, datasets: [
    { label: "Capital colocado", data: data.placed, backgroundColor: C.teal, borderRadius: 4 }] }, options: base() });

  new Chart("ch-interest", { type: "bar", data: { labels: data.labels, datasets: [
    { label: "Generados", data: data.interest_generated, backgroundColor: C.aqua, borderRadius: 4 },
    { label: "Cobrados", data: data.interest_paid, backgroundColor: C.teal, borderRadius: 4 }] }, options: base(legendOn) });

  new Chart("ch-recovered", { type: "line", data: { labels: data.labels, datasets: [
    { label: "Capital recuperado", data: data.recovered, borderColor: C.green, backgroundColor: C.green + "22", fill: true, tension: .3, pointRadius: 3 }] },
    options: base() });

  new Chart("ch-mora", { type: "line", data: { labels: data.labels, datasets: [
    { label: "Morosidad %", data: data.morosidad, borderColor: C.red, backgroundColor: C.red + "1f", fill: true, tension: .3, pointRadius: 3 }] },
    options: base({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `Morosidad: ${c.parsed.y.toFixed(2)}%` } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, suggestedMax: 10, ticks: { callback: (x) => x + "%" } } } }) });

  new Chart("ch-penalty", { type: "bar", data: { labels: data.labels, datasets: [
    { label: "Generadas", data: data.penalty_generated, backgroundColor: C.orange, borderRadius: 4 },
    { label: "Cobradas", data: data.penalty_paid, backgroundColor: C.teal, borderRadius: 4 }] }, options: base(legendOn) });

  const sd = JSON.parse(document.getElementById("status-data").textContent);
  const donut = { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "right", labels: { boxWidth: 10 } } } };
  new Chart("ch-status", { type: "doughnut", data: { labels: ["Al día", "Próximas a vencer", "Vencidas", "En mora crítica", "Canceladas"],
    datasets: [{ data: sd.ops, backgroundColor: [C.green, v("--yellow"), C.red, v("--black"), v("--gray")], borderColor: v("--surface"), borderWidth: 2 }] }, options: donut });
  new Chart("ch-inst", { type: "doughnut", data: { labels: ["Pagadas", "Vencidas", "Por vencer"],
    datasets: [{ data: sd.inst, backgroundColor: [C.teal, C.red, C.aqua], borderColor: v("--surface"), borderWidth: 2 }] }, options: donut });

  const back = data.back;
  new Chart("ch-cash", { data: { labels: data.labels_all, datasets: [
    { type: "bar", label: "Ingresos (cobranza)", data: data.cash_in.map((x, i) => i < back ? x : null), backgroundColor: C.teal, borderRadius: 4, stack: "a" },
    { type: "bar", label: "Egresos (desembolsos)", data: data.cash_out.map((x, i) => i < back ? -x : null), backgroundColor: C.orange, borderRadius: 4, stack: "a" },
    { type: "bar", label: "Cobranza proyectada", data: data.cash_projected.map((x, i) => i >= back ? x : null), backgroundColor: C.aqua + "88", borderColor: C.teal, borderWidth: 1, borderDash: [4, 3], borderRadius: 4, stack: "a" },
    { type: "line", label: "Flujo neto", data: data.cash_net.map((x, i) => i < back ? x : null), borderColor: C.ink, pointRadius: 2, tension: .25 }] },
    options: base(Object.assign({}, legendOn, { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (x) => fmt.format(x) } } } })) });
})();

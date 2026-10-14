// Section 06: leaderboard, findings charts, and the results explorer.
// All values come from assets/data/results.json (frozen analysis snapshot).

import { el, fmt, hideTip, inkOn, ramp, showTip, svg, theme, tipRow, tipSub, tipTitle } from "./util.js";

const LENGTHS = [0, 1, 8, 16, 32, 64];
const POOLED = [8, 16, 32, 64];
const DIMS = [2, 3, 4];

let R; // results
let MODELS; // [{id, name, color, color_dark, marker}]
const hidden = new Set();

const modelColor = (m) => (theme() === "dark" ? m.color_dark : m.color);
const surface = () => (theme() === "dark" ? "#0d1424" : "#ffffff");
const ink2 = () => (theme() === "dark" ? "#a6b4c8" : "#45556c");
const muted = () => (theme() === "dark" ? "#6f7f96" : "#6b7a90");
const lineCol = () => (theme() === "dark" ? "rgba(148,170,205,0.13)" : "rgba(30,50,90,0.11)");

// ---------- Marks ----------
function marker(shape, cx, cy, r, color, ring = surface()) {
  const common = { fill: color, stroke: ring, "stroke-width": 2, "paint-order": "stroke" };
  const k = r * 0.42;
  switch (shape) {
    case "square":
      return svg("rect", { x: cx - r * 0.88, y: cy - r * 0.88, width: r * 1.76, height: r * 1.76, rx: 1.5, ...common });
    case "triangle":
      return svg("polygon", { points: `${cx},${cy - r * 1.1} ${cx + r * 1.05},${cy + r * 0.8} ${cx - r * 1.05},${cy + r * 0.8}`, ...common });
    case "diamond":
      return svg("polygon", { points: `${cx},${cy - r * 1.15} ${cx + r * 1.05},${cy} ${cx},${cy + r * 1.15} ${cx - r * 1.05},${cy}`, ...common });
    case "plus":
      return svg("polygon", { points: [[-k, -r], [k, -r], [k, -k], [r, -k], [r, k], [k, k], [k, r], [-k, r], [-k, k], [-r, k], [-r, -k], [-k, -k]].map(([x, y]) => `${cx + x * 1.05},${cy + y * 1.05}`).join(" "), ...common });
    case "cross":
      return svg("g", { transform: `rotate(45 ${cx} ${cy})` }, [marker("plus", cx, cy, r, color, ring)]);
    default:
      return svg("circle", { cx, cy, r, ...common });
  }
}

function modelKey(m, size = 14) {
  const s = svg("svg", { viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" });
  s.append(marker(m.marker, size / 2, size / 2, size * 0.32, modelColor(m), "transparent"));
  return s;
}

function lineKey(m) {
  const s = svg("svg", { viewBox: "0 0 22 12", "aria-hidden": "true" });
  s.append(svg("line", { x1: 1, y1: 6, x2: 21, y2: 6, stroke: modelColor(m), "stroke-width": 2, "stroke-linecap": "round" }));
  s.append(marker(m.marker, 11, 6, 3.6, modelColor(m)));
  return s;
}

// Re-render a chart whenever its container width changes.
function responsive(container, render) {
  let lastW = 0;
  const run = () => {
    const w = Math.round(container.clientWidth);
    if (!w) return;
    lastW = w;
    container.replaceChildren(render(w));
  };
  new ResizeObserver(() => { if (Math.round(container.clientWidth) !== lastW) run(); }).observe(container);
  document.addEventListener("themechange", run);
  run();
  return run;
}

// ---------- Leaderboard ----------
function leaderboard() {
  const table = document.getElementById("leaderboard");
  const get = (m, t) => R.length.find((r) => r.model === m && r.T === t);
  const head = el("tr", {}, [el("th", { text: "Model" }), ...LENGTHS.map((t) => el("th", { text: `T = ${t}` })), el("th", { text: "T = 8–64" })]);
  const body = MODELS.map((m) => {
    const pooled = POOLED.reduce((s, t) => s + get(m.id, t).correct, 0);
    return el("tr", {}, [
      el("td", { class: "m" }, [el("span", { class: "mkey" }, [modelKey(m), m.name])]),
      ...LENGTHS.map((t) => {
        const r = get(m.id, t);
        return el("td", { title: `${r.correct}/${r.n} · ${fmt.pct(r.em)}` }, [
          el("span", { class: "cellbar" }, [String(r.correct), el("i", { style: `width:${Math.max(2, r.em * 52)}px` })]),
        ]);
      }),
      el("td", { class: "pooled" }, [`${pooled} `, el("span", { style: "color:var(--muted);font-weight:400", text: `(${fmt.pct(pooled / 768)})` })]),
    ]);
  });
  table.append(el("thead", {}, [head]), el("tbody", {}, body));
}

// ---------- Finding 1: history-length curves ----------
const lenState = { view: "overall", sub: null };

function lengthSeries() {
  const { view, sub } = lenState;
  return MODELS.map((m) => {
    const rows = LENGTHS.map((t) => {
      let r;
      if (view === "overall") r = R.length.find((x) => x.model === m.id && x.T === t);
      else if (view === "dimension") r = R.dimension_length.find((x) => x.model === m.id && x.T === t && x.dimension === sub);
      else r = R.task_length.find((x) => x.model === m.id && x.T === t && x.family === sub);
      const em = r.correct / r.n;
      return { T: t, n: r.n, correct: r.correct, em, lo: r.ci95_low ?? em, hi: r.ci95_high ?? em };
    });
    return { m, rows };
  });
}

function lengthChart(width) {
  const series = lengthSeries();
  const H = Math.max(260, Math.min(360, width * 0.52));
  const pad = { l: 44, r: 16, t: 12, b: 44 };
  const iw = width - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (k) => pad.l + (k / (LENGTHS.length - 1)) * iw;
  const y = (v) => pad.t + (1 - v) * ih;
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": "Exact match by history length for six models" });
  const axis = svg("g", { class: "axis" });
  [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
    axis.append(svg("line", { x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "baseline" : "gridline" }));
    axis.append(svg("text", { x: pad.l - 10, y: y(v) + 4, "text-anchor": "end", text: `${v * 100}` }));
  });
  LENGTHS.forEach((t, k) => axis.append(svg("text", { x: x(k), y: H - pad.b + 20, "text-anchor": "middle", text: t })));
  root.append(axis);
  root.append(svg("text", { x: pad.l + iw / 2, y: H - 4, "text-anchor": "middle", class: "axis-title", text: "History length T (events)" }));
  root.append(svg("text", { x: 12, y: pad.t + ih / 2, "text-anchor": "middle", class: "axis-title", transform: `rotate(-90 12 ${pad.t + ih / 2})`, text: "Exact match (%)" }));

  const visible = series.filter((s) => !hidden.has(s.m.id));
  if (lenState.view === "overall") {
    for (const s of visible) {
      const top = s.rows.map((r, k) => `${x(k)},${y(r.hi)}`);
      const bot = s.rows.map((r, k) => `${x(k)},${y(r.lo)}`).reverse();
      root.append(svg("polygon", { points: [...top, ...bot].join(" "), fill: modelColor(s.m), opacity: 0.1 }));
    }
  }
  for (const s of visible) {
    root.append(svg("polyline", { points: s.rows.map((r, k) => `${x(k)},${y(r.em)}`).join(" "), fill: "none", stroke: modelColor(s.m), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }
  for (const s of visible) s.rows.forEach((r, k) => root.append(marker(s.m.marker, x(k), y(r.em), 4.2, modelColor(s.m))));

  // Crosshair + tooltip snapping to the nearest length.
  const cross = svg("line", { class: "crosshair", y1: pad.t, y2: pad.t + ih, x1: 0, x2: 0, visibility: "hidden" });
  root.append(cross);
  const hit = svg("rect", { x: pad.l - 20, y: 0, width: iw + 40, height: H, fill: "transparent" });
  root.append(hit);
  const move = (e) => {
    const box = root.getBoundingClientRect();
    const px = e.clientX - box.left;
    const k = Math.max(0, Math.min(LENGTHS.length - 1, Math.round(((px - pad.l) / iw) * (LENGTHS.length - 1))));
    cross.setAttribute("x1", x(k));
    cross.setAttribute("x2", x(k));
    cross.setAttribute("visibility", "visible");
    const rows = visible.map((s) => ({ s, r: s.rows[k] })).sort((a, b) => b.r.em - a.r.em);
    const n = rows[0]?.r.n;
    showTip(e.clientX, e.clientY, [
      tipTitle(`T = ${LENGTHS[k]} · ${scopeLabel()}`),
      ...rows.map(({ s, r }) => tipRow(modelColor(s.m), s.m.name, `${fmt.pct(r.em)} · ${r.correct}/${r.n}`)),
      tipSub(lenState.view === "overall" ? `n = ${n} instances per model; 95% trajectory-bootstrap intervals shaded` : `n = ${n} instances per model`),
    ]);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
  return root;
}

function scopeLabel() {
  if (lenState.view === "overall") return "main view";
  if (lenState.view === "dimension") return `d = ${lenState.sub}`;
  return R.families.find((f) => f.id === lenState.sub).op;
}

function lengthTable() {
  const series = lengthSeries();
  const t = el("table", { class: "data-table" });
  t.append(el("thead", {}, [el("tr", {}, [el("th", { text: "Model" }), ...LENGTHS.map((x) => el("th", { text: `T=${x}` }))])]));
  t.append(el("tbody", {}, series.map((s) => el("tr", {}, [
    el("td", { text: s.m.name }),
    ...s.rows.map((r) => el("td", { text: `${r.correct}/${r.n}${lenState.view === "overall" ? ` [${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}%]` : ""}` })),
  ]))));
  return el("div", { class: "table-scroll" }, [t]);
}

function lengthCaption() {
  const cap = document.getElementById("len-caption");
  if (lenState.view === "overall") {
    cap.textContent = "Main view: 192 instances per model and length, one per trajectory. Shaded bands are 95% intervals from 2,000 stratified whole-trajectory bootstrap replicates.";
  } else if (lenState.view === "dimension") {
    cap.textContent = `d = ${lenState.sub}: 64 instances per model and length (8 operations × 8 trajectories). Dimension changes geometry, boundary exposure, coordinate arity, and representation length together.`;
  } else {
    cap.textContent = `${scopeLabel()}: 24 instances per model and length (3 dimensions × 8 trajectories). Small per-operation counts describe the sampled conditions; avoid reading them as precise rankings.`;
  }
}

function initLength() {
  const box = document.getElementById("len-chart");
  const legend = document.getElementById("len-legend");
  const tableBox = document.getElementById("len-table");
  const sub = document.getElementById("len-sub");
  const rerender = responsive(box, lengthChart);
  const refreshTable = () => tableBox.replaceChildren(lengthTable());

  const drawLegend = () => {
    legend.replaceChildren(...MODELS.map((m) => {
      const b = el("button", { class: "legend-item", type: "button", "aria-pressed": String(!hidden.has(m.id)), title: "Show or hide this model" }, [lineKey(m), m.name]);
      b.addEventListener("click", () => {
        if (hidden.has(m.id)) hidden.delete(m.id);
        else if (hidden.size < MODELS.length - 1) hidden.add(m.id);
        drawLegend();
        rerender();
      });
      return b;
    }));
  };
  document.addEventListener("themechange", drawLegend);
  drawLegend();

  const setSub = () => {
    const opts = lenState.view === "dimension" ? DIMS.map((d) => [d, `d = ${d}`]) : lenState.view === "task" ? R.families.map((f) => [f.id, f.op]) : [];
    sub.hidden = !opts.length;
    sub.replaceChildren(...opts.map(([v, label]) => {
      const b = el("button", { type: "button", "aria-pressed": String(v === lenState.sub), text: label });
      b.addEventListener("click", () => { lenState.sub = v; setSub(); rerender(); refreshTable(); lengthCaption(); });
      return b;
    }));
  };
  document.querySelectorAll("#len-view button").forEach((b) => b.addEventListener("click", () => {
    lenState.view = b.dataset.view;
    lenState.sub = lenState.view === "dimension" ? 2 : lenState.view === "task" ? R.families[0].id : null;
    document.querySelectorAll("#len-view button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setSub();
    rerender();
    refreshTable();
    lengthCaption();
  }));
  refreshTable();
  lengthCaption();
}

// ---------- Finding 2a: error extent dot plot ----------
const EXTENT_T = [[1, "circle"], [16, "square"], [64, "triangle"]];

function logX(v, x0, x1) {
  const lo = 0, hi = 8; // log2(1) .. log2(256)
  return x0 + ((Math.log2(Math.max(1, v)) - lo) / (hi - lo)) * (x1 - x0);
}

function extentChart(width) {
  const rowH = 38, top = 34, nW = Math.min(118, width * 0.27), labelW = Math.min(124, width * 0.3);
  const H = top + MODELS.length * rowH + 40;
  const x0 = labelW + 8, x1 = width - nW - 10;
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": "Median wrong cells per model at T=1, 16, and 64" });
  // Shape legend.
  let lx = x0;
  for (const [t, shape] of EXTENT_T) {
    root.append(marker(shape, lx + 5, 12, 4.4, ink2(), "transparent"));
    root.append(svg("text", { x: lx + 15, y: 16, class: "dlabel", text: `T = ${t}` }));
    lx += width >= 420 ? 66 : 58;
  }
  root.append(svg("text", { x: width, y: 16, "text-anchor": "end", class: "dlabel", text: width >= 520 ? "n (T=1 / 16 / 64)" : "n" }));
  const axis = svg("g", { class: "axis" });
  [1, 4, 16, 64, 256].forEach((v) => {
    const xx = logX(v, x0, x1);
    axis.append(svg("line", { x1: xx, x2: xx, y1: top - 6, y2: top + MODELS.length * rowH, class: "gridline" }));
    axis.append(svg("text", { x: xx, y: top + MODELS.length * rowH + 16, "text-anchor": "middle", text: v }));
  });
  root.append(axis);
  root.append(svg("text", { x: (x0 + x1) / 2, y: H - 4, "text-anchor": "middle", class: "axis-title", text: "Median wrong cells (log scale)" }));
  MODELS.forEach((m, k) => {
    const cy = top + k * rowH + rowH / 2;
    const name = svg("text", { x: labelW, y: cy + 4, "text-anchor": "end", class: "dlabel", text: m.name });
    root.append(name);
    const ns = [];
    for (const [t, shape] of EXTENT_T) {
      const r = R.errors.find((e) => e.model === m.id && e.T === t);
      ns.push(r.valid_wrong_n);
      if (r.median == null) continue;
      const cx = logX(r.median, x0, x1);
      const g = svg("g", { tabindex: "0" });
      g.append(svg("circle", { cx, cy, r: 13, fill: "transparent" }));
      g.append(marker(shape, cx, cy, 5, modelColor(m)));
      const show = (e) => showTip(e.clientX ?? 0, e.clientY ?? 0, [
        tipTitle(`${m.name} · T = ${t}`),
        tipRow(modelColor(m), "median wrong cells", String(r.median)),
        tipRow(null, "IQR", `${r.q25}–${r.q75}`),
        tipRow(null, "P90", String(r.p90)),
        tipRow(null, "within 5 cells", `${r.near5}/${r.valid_wrong_n}`),
        tipSub(`${r.valid_wrong_n} valid incorrect answers of ${r.n}`),
      ]);
      g.addEventListener("pointermove", show);
      g.addEventListener("pointerleave", hideTip);
      root.append(g);
    }
    root.append(svg("text", { x: width, y: cy + 4, "text-anchor": "end", class: "dlabel tabnum", text: ns.join(" / ") }));
  });
  return root;
}

// ---------- Finding 2b: shared-instance scatter ----------
function pairChart(width) {
  const size = Math.min(width, 420);
  const pad = { l: 48, r: 12, t: 10, b: 46 };
  const H = size;
  const iw = width - pad.l - pad.r, ih = H - pad.t - pad.b;
  const sx = (v) => pad.l + (Math.log2(Math.max(1, v)) / 8) * iw;
  const sy = (v) => pad.t + (1 - Math.log2(Math.max(1, v)) / 8) * ih;
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": "Wrong cells of Kimi K2.5 versus MiniMax M2.5 on 84 shared instances" });
  const axis = svg("g", { class: "axis" });
  [1, 4, 16, 64, 256].forEach((v) => {
    axis.append(svg("line", { x1: sx(v), x2: sx(v), y1: pad.t, y2: pad.t + ih, class: "gridline" }));
    axis.append(svg("line", { x1: pad.l, x2: pad.l + iw, y1: sy(v), y2: sy(v), class: "gridline" }));
    axis.append(svg("text", { x: sx(v), y: pad.t + ih + 18, "text-anchor": "middle", text: v }));
    axis.append(svg("text", { x: pad.l - 8, y: sy(v) + 4, "text-anchor": "end", text: v }));
  });
  root.append(axis);
  root.append(svg("line", { x1: sx(1), y1: sy(1), x2: sx(256), y2: sy(256), stroke: muted(), "stroke-width": 1, opacity: 0.6 }));
  root.append(svg("text", { x: sx(2.2), y: sy(2.2) + 14, "text-anchor": "middle", class: "dlabel", transform: `rotate(${-Math.atan2(ih, iw) * 180 / Math.PI} ${sx(2.2)} ${sy(2.2) + 14})`, text: "equal" }));
  root.append(svg("text", { x: pad.l + iw / 2, y: H - 6, "text-anchor": "middle", class: "axis-title", text: "Kimi K2.5 wrong cells" }));
  root.append(svg("text", { x: 12, y: pad.t + ih / 2, "text-anchor": "middle", class: "axis-title", transform: `rotate(-90 12 ${pad.t + ih / 2})`, text: "MiniMax M2.5 wrong cells" }));
  const dot = theme() === "dark" ? "#c3d0e2" : "#3a4c66";
  const pts = R.pairs.map((p) => ({ p, x: sx(p.a), y: sy(p.b) }));
  for (const { x, y } of pts) root.append(svg("circle", { cx: x, cy: y, r: 4.5, fill: dot, "fill-opacity": 0.62, stroke: surface(), "stroke-width": 1.5 }));
  const hl = svg("circle", { r: 7, fill: "none", stroke: theme() === "dark" ? "#35d0f0" : "#0a8fb3", "stroke-width": 2, cx: -20, cy: -20, visibility: "hidden" });
  root.append(hl);
  const hit = svg("rect", { x: pad.l, y: pad.t, width: iw, height: ih, fill: "transparent" });
  root.append(hit);
  hit.addEventListener("pointermove", (e) => {
    const box = root.getBoundingClientRect();
    const px = e.clientX - box.left, py = e.clientY - box.top;
    let best = null, bd = 24 * 24;
    for (const q of pts) {
      const d = (q.x - px) ** 2 + (q.y - py) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) { hideTip(); hl.setAttribute("visibility", "hidden"); return; }
    hl.setAttribute("cx", best.x); hl.setAttribute("cy", best.y); hl.setAttribute("visibility", "visible");
    const same = pts.filter((q) => q.p.a === best.p.a && q.p.b === best.p.b).length;
    showTip(e.clientX, e.clientY, [
      tipTitle(`${best.p.op} · d = ${best.p.d} · T = 8`),
      tipRow(null, "Kimi K2.5", `${best.p.a} wrong`),
      tipRow(null, "MiniMax M2.5", `${best.p.b} wrong`),
      tipSub(best.p.id.replace(/^main:/, "") + (same > 1 ? ` · ${same} instances at this point` : "")),
    ]);
  });
  hit.addEventListener("pointerleave", () => { hideTip(); hl.setAttribute("visibility", "hidden"); });
  return root;
}

// ---------- Finding 3a: baselines at T=64 ----------
function baseChart(width) {
  const rows = MODELS.map((m) => ({ m, r: R.baselines.find((b) => b.model === m.id && b.T === 64) }));
  const rowH = 40, top = 6, labelW = Math.min(124, width * 0.3), rightW = Math.min(92, width * 0.22);
  const H = top + rows.length * rowH + 38;
  const x0 = labelW + 10, x1 = width - rightW;
  const lo = 0.4, hi = 1;
  const sx = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": "Model cell accuracy versus copy-initial and all-zero baselines at T=64" });
  const axis = svg("g", { class: "axis" });
  [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((v) => {
    axis.append(svg("line", { x1: sx(v), x2: sx(v), y1: top, y2: top + rows.length * rowH, class: "gridline" }));
    axis.append(svg("text", { x: sx(v), y: top + rows.length * rowH + 16, "text-anchor": "middle", text: `${Math.round(v * 100)}` }));
  });
  root.append(axis);
  root.append(svg("text", { x: (x0 + x1) / 2, y: H - 4, "text-anchor": "middle", class: "axis-title", text: "Cell accuracy (%)" }));
  root.append(svg("text", { x: width, y: top + 8, "text-anchor": "end", class: "dlabel", text: "valid · > copy" }));
  const g0 = muted();
  rows.forEach(({ m, r }, k) => {
    const cy = top + k * rowH + rowH / 2 + 6;
    root.append(svg("text", { x: labelW, y: cy + 4, "text-anchor": "end", class: "dlabel", text: m.name }));
    root.append(svg("line", { x1: sx(Math.min(r.copy_ca, r.model_ca)), x2: sx(Math.max(r.copy_ca, r.model_ca)), y1: cy, y2: cy, stroke: modelColor(m), "stroke-width": 2, opacity: 0.5 }));
    root.append(svg("circle", { cx: sx(r.zero_ca), cy, r: 4, fill: surface(), stroke: g0, "stroke-width": 1.6 }));
    root.append(svg("circle", { cx: sx(r.copy_ca), cy, r: 4.4, fill: g0, stroke: surface(), "stroke-width": 2 }));
    root.append(marker(m.marker, sx(r.model_ca), cy, 5.2, modelColor(m)));
    root.append(svg("text", { x: width, y: cy + 4, "text-anchor": "end", class: "dlabel tabnum", text: `${r.valid_n} · ${r.above_copy}` }));
    const hit = svg("rect", { x: x0 - 6, y: cy - rowH / 2, width: x1 - x0 + 12, height: rowH, fill: "transparent" });
    hit.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, [
      tipTitle(`${m.name} · T = 64`),
      tipRow(modelColor(m), "model", fmt.pct(r.model_ca)),
      tipRow(g0, "copy initial", fmt.pct(r.copy_ca)),
      tipRow(g0, "all zero", fmt.pct(r.zero_ca)),
      tipRow(null, "above copy", `${r.above_copy}/${r.valid_n}`),
      tipSub(`${r.valid_n} valid answers of ${r.n}; baselines on the same subset`),
    ]));
    hit.addEventListener("pointerleave", hideTip);
    root.append(hit);
  });
  return root;
}

function baseLegend() {
  const box = document.getElementById("base-legend");
  const g0 = muted();
  const item = (node, label) => el("span", { class: "legend-item", style: "cursor:default" }, [node, label]);
  const s1 = svg("svg", { viewBox: "0 0 14 14" }, [marker("circle", 7, 7, 4.5, ink2(), "transparent")]);
  const s2 = svg("svg", { viewBox: "0 0 14 14" }, [svg("circle", { cx: 7, cy: 7, r: 4.4, fill: g0 })]);
  const s3 = svg("svg", { viewBox: "0 0 14 14" }, [svg("circle", { cx: 7, cy: 7, r: 4, fill: "none", stroke: g0, "stroke-width": 1.6 })]);
  [s1, s2, s3].forEach((s) => { s.setAttribute("width", 14); s.setAttribute("height", 14); });
  box.replaceChildren(item(s1, "Model (marker per model)"), item(s2, "Copy initial"), item(s3, "All zero"));
}

// ---------- Finding 3b: changed / preserved error composition ----------
const cuState = { T: 1 };
const CU = [
  ["changed_only", "C only · missed or wrong updates"],
  ["unchanged_only", "U only · corrupted preserved cells"],
  ["both", "Both"],
];
function cuColors() {
  return theme() === "dark" ? ["#35d0f0", "#e0a43a", "#8b7cf6"] : ["#0a8fb3", "#b77900", "#6553c9"];
}

function cuChart(width) {
  const rowH = 34, top = 4, labelW = Math.min(124, width * 0.3), rightW = 44;
  const H = top + MODELS.length * rowH + 30;
  const x0 = labelW + 10, x1 = width - rightW;
  const cols = cuColors();
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": `Error composition at T=${cuState.T}` });
  const axis = svg("g", { class: "axis" });
  [0, 0.5, 1].forEach((v) => {
    const xx = x0 + v * (x1 - x0);
    axis.append(svg("text", { x: xx, y: H - 8, "text-anchor": v === 0 ? "start" : v === 1 ? "end" : "middle", text: `${v * 100}%` }));
  });
  root.append(axis);
  MODELS.forEach((m, k) => {
    const r = R.errors.find((e) => e.model === m.id && e.T === cuState.T);
    const cy = top + k * rowH + rowH / 2;
    root.append(svg("text", { x: labelW, y: cy + 4, "text-anchor": "end", class: "dlabel", text: m.name }));
    const total = r.valid_wrong_n;
    root.append(svg("text", { x: width, y: cy + 4, "text-anchor": "end", class: "dlabel tabnum", text: `n=${total}` }));
    if (!total) return;
    let acc = 0;
    CU.forEach(([key, label], j) => {
      const v = r[key];
      const w = (v / total) * (x1 - x0);
      const xs = x0 + (acc / total) * (x1 - x0);
      acc += v;
      if (w <= 0) return;
      const seg = svg("rect", { x: xs + (j ? 1 : 0), y: cy - 9, width: Math.max(0.5, w - (j ? 1 : 0) - (j < 2 ? 1 : 0)), height: 18, rx: 3, fill: cols[j] });
      root.append(seg);
      const txt = String(v);
      if (w > txt.length * 7.5 + 10) {
        root.append(svg("text", { x: xs + w / 2, y: cy + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: inkOn(cols[j]), "pointer-events": "none", text: txt }));
      }
      seg.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, [
        tipTitle(`${m.name} · T = ${cuState.T}`),
        ...CU.map(([kk, ll], jj) => tipRow(cols[jj], ll, String(r[kk]))),
        tipSub(`${total} valid incorrect answers`),
      ]));
      seg.addEventListener("pointerleave", hideTip);
    });
  });
  return root;
}

function cuLegend(rerender) {
  const box = document.getElementById("cu-legend");
  const cols = cuColors();
  const seg = el("div", { class: "seg", style: "margin-right:6px" }, [1, 16, 64].map((t) => {
    const b = el("button", { type: "button", "aria-pressed": String(t === cuState.T), text: `T = ${t}` });
    b.addEventListener("click", () => { cuState.T = t; cuLegend(rerender); rerender(); });
    return b;
  }));
  box.replaceChildren(seg, ...CU.map(([, label], j) => el("span", { class: "legend-item", style: "cursor:default" }, [
    el("i", { style: `display:inline-block;width:10px;height:10px;border-radius:2px;background:${cols[j]}` }), label.split(" · ")[0],
  ])));
}

// ---------- Explorer heatmap ----------
const heatState = { view: "task", len: "pooled" };
const WORKLOAD = [["metric_paint", [25, 100]], ["box_reflection", [16, 64, 256]], ["occluded_mix", [6, 12, 30]], ["boundary_layer", [15, 60, 150]]];

function heatColumns() {
  const lens = heatState.len === "pooled" ? POOLED : [Number(heatState.len)];
  const op = (id) => R.families.find((f) => f.id === id).op;
  if (heatState.view === "task") {
    return R.families.map((f) => ({
      label: f.op,
      get: (m) => sum(R.task_length.filter((r) => r.model === m && r.family === f.id && lens.includes(r.T))),
    }));
  }
  if (heatState.view === "dimension") {
    return DIMS.map((d) => ({
      label: `d = ${d}`,
      get: (m) => sum(R.dimension_length.filter((r) => r.model === m && r.dimension === d && lens.includes(r.T))),
    }));
  }
  return WORKLOAD.flatMap(([fid, ws]) => ws.map((w) => ({
    label: `${op(fid)} ${w}`,
    get: (m) => sum(R.workload.filter((r) => r.model === m && r.family === fid && r.w === w && lens.includes(r.T))),
  })));
}

function sum(rows) {
  return rows.reduce((a, r) => ({ correct: a.correct + r.correct, n: a.n + r.n }), { correct: 0, n: 0 });
}

function heatmap() {
  const table = document.getElementById("heat");
  const cols = heatColumns();
  const lenLabel = heatState.len === "pooled" ? "T = 8–64" : `T = ${heatState.len}`;
  table.replaceChildren(
    el("thead", {}, [el("tr", {}, [el("th", { text: "" }), ...cols.map((c) => el("th", { text: c.label }))])]),
    el("tbody", {}, MODELS.map((m) => el("tr", {}, [
      el("td", { class: "rowh" }, [el("span", { class: "mkey" }, [modelKey(m), m.name])]),
      ...cols.map((c) => {
        const v = c.get(m.id);
        const p = v.n ? v.correct / v.n : 0;
        const bg = ramp(p);
        const td = el("td", { style: `background:${bg};color:${inkOn(bg)}`, tabindex: "0", "aria-label": `${m.name}, ${c.label}, ${lenLabel}: ${v.correct} of ${v.n}` }, [String(v.correct)]);
        const show = (e) => {
          const r = td.getBoundingClientRect();
          showTip(e.clientX ?? r.right, e.clientY ?? r.bottom, [tipTitle(`${m.name} · ${c.label}`), tipRow(null, lenLabel, `${v.correct}/${v.n}`), tipRow(null, "exact match", fmt.pct(p))]);
        };
        td.addEventListener("pointermove", show);
        td.addEventListener("focus", show);
        td.addEventListener("pointerleave", hideTip);
        td.addEventListener("blur", hideTip);
        return td;
      }),
    ]))),
  );
  const n = cols[0].get(MODELS[0].id).n;
  const cap = document.getElementById("heat-caption");
  const scope = heatState.view === "workload" ? "2D workload view; the middle targets (PAINT 100, REFLECT 64, MIX 12, LAYER 60) reuse main instances" : "main view";
  cap.textContent = `Each cell counts exact matches out of ${n} instances (${lenLabel}, ${scope}). Color encodes the same proportion on one sequential scale.`;
  const rampBox = document.getElementById("heat-ramp");
  rampBox.replaceChildren(el("span", { text: "0%" }), el("i", { style: `background:linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => ramp(t)).join(",")})` }), el("span", { text: "100%" }));
}

function initHeat() {
  const bind = (id, key, attr) => document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
    heatState[key] = b.dataset[attr];
    document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    heatmap();
  }));
  bind("heat-view", "view", "view");
  bind("heat-len", "len", "len");
  heatmap();
  document.addEventListener("themechange", heatmap);
}

// ---------- Notes ----------
function notes() {
  const name = (id) => MODELS.find((m) => m.id === id).name;
  const pre = R.prefix.slice().sort((a, b) => a.wrong_then_correct - b.wrong_then_correct);
  document.getElementById("note-prefix").textContent =
    `Aggregate decline is not a per-trajectory threshold: a correct later prefix follows an earlier failure on ${pre[0].wrong_then_correct} (${name(pre[0].model)}) to ${pre[pre.length - 1].wrong_then_correct} (${name(pre[pre.length - 1].model)}) of 192 trajectories, so every length is requested and scored independently.`;
  const d = R.delivery;
  const most = d.slice().sort((a, b) => b.empty - a.empty)[0];
  const least = d.slice().sort((a, b) => a.empty - b.empty)[0];
  document.getElementById("note-delivery").textContent =
    `Across ${fmt.int(d[0].n)} requests per model, empty outcomes range from ${least.empty} (${name(least.model)}) to ${most.empty} (${name(most.model)}, ${most.length_terminated} length terminations). They remain in exact match as zeros.`;
  const g = R.totals.gold_checks;
  document.getElementById("note-oracle").textContent =
    `An independent rule implementation replays ${fmt.int(g[0].selected_states)} selected states in each cohort (${fmt.int(g[0].replayed_events)} prefix events each) with ${g.reduce((s, x) => s + x.mismatches, 0)} mismatches.`;
}

export function initCharts(results) {
  R = results;
  MODELS = results.models;
  leaderboard();
  initLength();
  responsive(document.getElementById("extent-chart"), extentChart);
  responsive(document.getElementById("pair-chart"), pairChart);
  baseLegend();
  document.addEventListener("themechange", baseLegend);
  responsive(document.getElementById("base-chart"), baseChart);
  const cuRun = responsive(document.getElementById("cu-chart"), cuChart);
  cuLegend(cuRun);
  document.addEventListener("themechange", () => cuLegend(cuRun));
  initHeat();
  notes();
  document.querySelectorAll("[data-table-toggle]").forEach((b) => b.addEventListener("click", () => {
    const t = document.getElementById(b.dataset.tableToggle);
    const on = t.classList.toggle("is-on");
    b.textContent = on ? "Hide table" : "Show table";
  }));
  document.addEventListener("themechange", () => {
    const table = document.getElementById("leaderboard");
    table.querySelectorAll("thead, tbody").forEach((n) => n.remove());
    leaderboard();
  });
}

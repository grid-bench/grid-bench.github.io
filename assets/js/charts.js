// Sections 01 and 06: leaderboard (overall + breakdown views) and the three findings.
// All values come from assets/data/results.json (frozen analysis snapshot).

import { el, fmt, hideTip, inkOn, ramp, showTip, svg, tipRow, tipSub, tipTitle } from "./util.js";

const LENGTHS = [0, 1, 8, 16, 32, 64];
const POOLED = [8, 16, 32, 64];
const DIMS = [2, 3, 4];
const COMPACT = 520; // below this chart width, row labels sit above their marks

// Fixed dark theme ink (matches the base.css tokens).
const SURFACE = "#0d1120";
const INK2 = "#a9b5c9";
const MUTED = "#6c7a91";
const BASE_GRAY = "#8a97ad"; // baseline marks in Finding 3 (about 6:1 on the surface)
// Breakpoints shared with results.css: at or below STACKED the leaderboard rows put
// the per-length numbers under the sparkline; at or below FLIP the heatmap is transposed.
const STACKED = window.matchMedia("(max-width: 960px)");
const FLIP = window.matchMedia("(max-width: 820px)");

let R; // results
let MODELS; // [{id, name, color, color_dark, marker}]
let BOARD; // MODELS sorted by pooled exact match at T = 8-64, for the leaderboard card
const hidden = new Set();

const modelColor = (m) => m.color_dark;
const opName = (id) => R.families.find((f) => f.id === id).op;
const nameOf = (id) => MODELS.find((m) => m.id === id).name;
const lengthRow = (id, t) => R.length.find((r) => r.model === id && r.T === t);
const CELLS = { 2: 256, 3: 252, 4: 256 }; // cells per main-benchmark world (16×16, 6×6×7, 4×4×4×4)
const pctRange = (lo, hi) => `${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}%`;

// Percent of a count with one decimal. Exact ties round to even, as in the
// paper's tables (48/768 = 6.25% prints as 6.2%). Integer math avoids float drift.
function pctOf(k, n) {
  if (!n) return "0.0%";
  const q = Math.floor((k * 1000) / n);
  const r2 = 2 * (k * 1000 - q * n);
  const t = r2 > n || (r2 === n && q % 2) ? q + 1 : q;
  return `${(t / 10).toFixed(1)}%`;
}
// Leaderboard cells: one decimal, but a full score reads "100%".
const pctCell = (k, n) => (n && k === n ? "100%" : pctOf(k, n));
// Heatmap cells: whole percent; a nonzero share below 0.5% reads "<1%", not "0%".
function pctWhole(k, n) {
  if (!n || !k) return "0%";
  const p = (k * 100) / n;
  return p < 0.5 ? "<1%" : `${Math.round(p)}%`;
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// ---------- Hover and info helpers ----------
// Pointer hover (mouse) and tap (touch) both show the tooltip; touch keeps it until scroll or the next tap.
function hover(node, show, hide = hideTip) {
  node.addEventListener("pointermove", show);
  node.addEventListener("pointerdown", show);
  node.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hide(e); });
}

// Keyboard focus shows the same tooltip as hover, anchored to the element.
// An optional hint line is added only for keyboard focus, not for a click.
function focusTip(node, content, hint) {
  node.addEventListener("focus", () => {
    const r = node.getBoundingClientRect();
    let kb = false;
    try { kb = node.matches(":focus-visible"); } catch { kb = false; }
    showTip(r.right, r.top + r.height / 2, hint && kb ? [...content(), tipSub(hint)] : content());
  });
  node.addEventListener("blur", hideTip);
  node.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
}

// Roving tabindex: a group of marks is one tab stop and arrow keys move focus
// inside it. rows is row-major; Left/Right step through the marks in reading
// order, Up/Down keep the column in the next row, Home/End jump to the ends.
function roving(rows) {
  rows = rows.filter((r) => r.length);
  const items = rows.flat();
  if (!items.length) return;
  items.forEach((n, i) => n.setAttribute("tabindex", i ? "-1" : "0"));
  let i0 = 0;
  rows.forEach((row, r) => row.forEach((node, c) => node.addEventListener("keydown", (e) => {
    const i = items.indexOf(node);
    let j;
    if (e.key === "ArrowRight") j = Math.min(items.length - 1, i + 1);
    else if (e.key === "ArrowLeft") j = Math.max(0, i - 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const rr = r + (e.key === "ArrowDown" ? 1 : -1);
      if (rr < 0 || rr >= rows.length) { e.preventDefault(); return; }
      j = items.indexOf(rows[rr][Math.min(c, rows[rr].length - 1)]);
    } else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = items.length - 1;
    else return;
    e.preventDefault();
    if (j !== i) items[j].focus();
  })));
  // Whichever mark gets focus (by key, click, or tap) becomes the group's tab stop.
  items.forEach((n, j) => n.addEventListener("focus", () => {
    if (j === i0) return;
    items[i0].setAttribute("tabindex", "-1");
    n.setAttribute("tabindex", "0");
    i0 = j;
  }));
}

let infoSeq = 0;
// A one-line caption followed by an (i) that carries the method note. The last
// word and the (i) share a no-wrap span so the button never sits alone on a line.
function caption(node, text, note) {
  // Keep "T = 8–64" and similar on one line: no-break spaces around "=", a word joiner after the dash.
  text = text.replace(/ = /g, " = ").replace(/(\d)–(\d)/g, "$1–⁠$2");
  if (!note) { node.replaceChildren(el("span", { text })); return; }
  const cut = text.lastIndexOf(" ") + 1;
  const id = `res-note-${++infoSeq}`;
  const btn = el("button", { class: "info", type: "button", "aria-label": "Method note", "aria-describedby": id, text: "i" });
  const show = () => {
    const r = btn.getBoundingClientRect();
    showTip(r.left, r.bottom, [el("div", { class: "tt-note", text: note })]);
  };
  btn.addEventListener("pointerenter", show);
  btn.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hideTip(); });
  btn.addEventListener("focus", show);
  btn.addEventListener("click", show);
  btn.addEventListener("blur", hideTip);
  btn.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
  node.replaceChildren(
    el("span", { text: text.slice(0, cut) }),
    el("span", { class: "nowrap" }, [text.slice(cut), " ", btn]),
    el("span", { class: "sr-only", id, text: note }),
  );
}

// ---------- Marks ----------
function marker(shape, cx, cy, r, color, ring = SURFACE) {
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

function swatch(node) {
  const s = svg("svg", { viewBox: "0 0 14 14", width: 14, height: 14, "aria-hidden": "true" }, [node]);
  return s;
}

const legendItem = (key, label) => el("span", { class: "legend-item is-static" }, [key, label]);

// Re-render a chart whenever its container width changes (including when a hidden tab opens).
function responsive(container, render) {
  let lastW = 0;
  const run = () => {
    const w = Math.round(container.clientWidth);
    if (!w) return;
    lastW = w;
    container.replaceChildren(render(w));
  };
  new ResizeObserver(() => { if (Math.round(container.clientWidth) !== lastW) run(); }).observe(container);
  run();
  return run;
}

// Row geometry shared by the per-model dot and bar charts. Wide charts put the
// model name left of the marks; compact ones put it on a line above them.
function rowFrame(width, { top = 24, wideRow = 40, rightW = 96 } = {}) {
  const compact = width < COMPACT;
  const rowH = compact ? 50 : wideRow;
  const labelW = compact ? 0 : Math.min(124, width * 0.3);
  const x0 = compact ? 6 : labelW + 14;
  const x1 = compact ? width - 6 : width - rightW;
  const rowTop = (k) => top + k * rowH;
  return {
    compact, rowH, labelW, x0, x1, top,
    bottom: top + MODELS.length * rowH,
    cy: (k) => rowTop(k) + (compact ? 34 : rowH / 2),
    nameAt: (k, text) => svg("text", compact
      ? { x: 0, y: rowTop(k) + 13, class: "dlabel strong halo", text }
      : { x: labelW, y: rowTop(k) + rowH / 2 + 4, "text-anchor": "end", class: "dlabel strong", text }),
    rightAt: (k, text) => svg("text", { x: width, y: compact ? rowTop(k) + 13 : rowTop(k) + rowH / 2 + 4, "text-anchor": "end", class: compact ? "dlabel tabnum halo" : "dlabel tabnum", text }),
  };
}

// ---------- Key numbers in the copy ----------
function facts() {
  const sol = R.baselines.find((b) => b.model === "gpt-5.6-sol" && b.T === 64);
  const at64 = R.length.filter((r) => r.T === 64);
  const em = (id, t) => { const r = lengthRow(id, t); return pctCell(r.correct, r.n); };
  const st = pairStats();
  return {
    "wrong-64": pctOf(at64.reduce((s, r) => s + r.n - r.correct, 0), at64.reduce((s, r) => s + r.n, 0)),
    "kimi-1": em("moonshotai.kimi-k2.5", 1),
    "minimax-1": em("minimax.minimax-m2.5", 1),
    "claude-1": em("claude-sonnet", 1),
    "claude-8": em("claude-sonnet", 8),
    "kimi-8": em("moonshotai.kimi-k2.5", 8),
    "minimax-8": em("minimax.minimax-m2.5", 8),
    "pairs-share": st.share,
    "pairs-med-a": st.medA,
    "pairs-med-b": st.medB,
    "sol-ca-64": fmt.pct(sol.model_ca),
    "sol-copy-64": fmt.pct(sol.copy_ca),
  };
}

function bindFacts() {
  const f = facts();
  document.querySelectorAll("#results [data-fact]").forEach((n) => {
    if (f[n.dataset.fact] !== undefined) n.textContent = String(f[n.dataset.fact]);
  });
}

// ---------- Leaderboard: overall rows ----------
function lengthRows(m) {
  return LENGTHS.map((t) => {
    const r = lengthRow(m.id, t);
    return { T: t, n: r.n, correct: r.correct, em: r.correct / r.n, lo: r.ci95_low, hi: r.ci95_high };
  });
}

function sparkline(m, rows, w) {
  const H = 36, padY = 5;
  // In the stacked layouts the dots sit directly above the per-length numbers below them.
  const aligned = STACKED.matches;
  const x = aligned ? (k) => (w * (k + 0.5)) / LENGTHS.length : (k) => 6 + (k / (LENGTHS.length - 1)) * (w - 12);
  const y = (v) => padY + (1 - v) * (H - 2 * padY);
  const col = modelColor(m);
  const root = svg("svg", {
    width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: "spark-svg", role: "img",
    "aria-label": `${m.name}: exact match ${rows.map((r) => pctCell(r.correct, r.n)).join(", ")} at T = ${LENGTHS.join(", ")}`,
  });
  root.append(svg("line", { x1: x(0), x2: x(LENGTHS.length - 1), y1: y(0), y2: y(0), class: "baseline" }));
  const pts = rows.map((r, k) => `${x(k)},${y(r.em)}`);
  root.append(svg("polygon", { points: [...pts, `${x(LENGTHS.length - 1)},${y(0)}`, `${x(0)},${y(0)}`].join(" "), fill: col, opacity: 0.12 }));
  root.append(svg("polyline", { points: pts.join(" "), fill: "none", stroke: col, "stroke-width": 1.75, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  rows.forEach((r, k) => root.append(svg("circle", { cx: x(k), cy: y(r.em), r: 2.6, fill: col, stroke: SURFACE, "stroke-width": 1.5 })));
  const hl = svg("circle", { r: 4.6, fill: col, stroke: "#fff", "stroke-width": 1.5, visibility: "hidden", "pointer-events": "none" });
  root.append(hl);
  const hit = svg("rect", { x: 0, y: 0, width: w, height: H, fill: "transparent" });
  root.append(hit);
  hover(hit, (e) => {
    const box = root.getBoundingClientRect();
    const px = e.clientX - box.left;
    let k = 0;
    LENGTHS.forEach((_, j) => { if (Math.abs(x(j) - px) < Math.abs(x(k) - px)) k = j; });
    const r = rows[k];
    hl.setAttribute("cx", x(k)); hl.setAttribute("cy", y(r.em)); hl.setAttribute("visibility", "visible");
    showTip(e.clientX, e.clientY, [
      tipTitle(`${m.name} · T = ${r.T}`),
      tipRow(col, "exact match", pctCell(r.correct, r.n)),
      ...(r.lo != null ? [tipRow(null, "95% interval", pctRange(r.lo, r.hi))] : []),
    ]);
  }, () => { hl.setAttribute("visibility", "hidden"); hideTip(); });
  return root;
}

function leaderboard() {
  const table = document.getElementById("lb-table");
  const head = el("tr", {}, [
    el("th", { scope: "col", class: "c-model", text: "Model" }),
    el("th", { scope: "col", class: "c-spark", text: "Exact match, T = 0 → 64" }),
    ...LENGTHS.map((t) => el("th", { scope: "col", class: "c-n" }, [el("span", { class: "t-pre", text: "T = " }), String(t)])),
    el("th", { scope: "col", class: "c-pool", text: "Pooled, T = 8–64" }),
  ]);
  const sparks = [];
  const body = BOARD.map((m) => {
    const rows = lengthRows(m);
    const pooled = POOLED.reduce((s, t) => s + lengthRow(m.id, t).correct, 0);
    const pooledN = POOLED.reduce((s, t) => s + lengthRow(m.id, t).n, 0);
    const box = el("div", { class: "spark" });
    const cells = rows.map((r) => {
      const td = el("td", { class: "c-n", "data-t": `T=${r.T}` }, [el("span", { text: pctCell(r.correct, r.n) })]);
      hover(td, (e) => showTip(e.clientX, e.clientY, [
        tipTitle(`${m.name} · T = ${r.T}`),
        tipRow(modelColor(m), "exact match", pctCell(r.correct, r.n)),
        ...(r.lo != null ? [tipRow(null, "95% interval", pctRange(r.lo, r.hi))] : []),
      ]));
      return td;
    });
    // The pooled cell is the row's keyboard stop: its tooltip carries every length with its interval.
    const pct = pctOf(pooled, pooledN);
    const pool = el("td", {
      class: "c-pool", tabindex: "0",
      "aria-label": `${m.name}: exact match ${pct} at T = 8 to 64; ${rows.map((r) => `T = ${r.T}: ${pctCell(r.correct, r.n)}`).join(", ")}`,
    }, [el("span", { class: "pool" }, [
      el("i", { class: "pbar", "aria-hidden": "true" }, [el("i", { style: `width:${((pooled / pooledN) * 100).toFixed(2)}%;background:${modelColor(m)}` })]),
      el("b", {}, [pct.slice(0, -1), el("span", { class: "pct", text: "%" })]),
    ])]);
    const poolTip = () => [
      tipTitle(`${m.name} · exact match`),
      tipRow(modelColor(m), "T = 8–64", pct),
      ...rows.map((r) => tipRow(null, `T = ${r.T}`, `${pctCell(r.correct, r.n)}${r.lo != null ? ` [${pctRange(r.lo, r.hi)}]` : ""}`)),
      tipSub("Brackets: 95% trajectory-bootstrap intervals."),
    ];
    hover(pool, (e) => showTip(e.clientX, e.clientY, poolTip()));
    focusTip(pool, poolTip);
    const tr = el("tr", {}, [
      el("th", { scope: "row", class: "c-model" }, [el("span", { class: "mkey" }, [modelKey(m), m.name])]),
      el("td", { class: "c-spark" }, [box]),
      ...cells,
      pool,
    ]);
    sparks.push(() => responsive(box, (w) => sparkline(m, rows, w)));
    return tr;
  });
  table.append(el("thead", {}, [head]), el("tbody", {}, body));
  sparks.forEach((run) => run());
}

// ---------- Leaderboard: breakdown heatmaps ----------
const heatState = { view: "task", len: "pooled" };
const WORKLOAD = [["metric_paint", [25, 100]], ["box_reflection", [16, 64, 256]], ["occluded_mix", [6, 12, 30]], ["boundary_layer", [15, 60, 150]]];

function sum(rows) {
  return rows.reduce((a, r) => ({ correct: a.correct + r.correct, n: a.n + r.n }), { correct: 0, n: 0 });
}

function heatColumns() {
  const lens = heatState.len === "pooled" ? POOLED : [Number(heatState.len)];
  if (heatState.view === "task") {
    return R.families.map((f) => ({
      label: f.op, tip: f.op,
      get: (m) => sum(R.task_length.filter((r) => r.model === m && r.family === f.id && lens.includes(r.T))),
    }));
  }
  if (heatState.view === "dimension") {
    return DIMS.map((d) => ({
      label: `d = ${d}`, tip: `d = ${d}`,
      get: (m) => sum(R.dimension_length.filter((r) => r.model === m && r.dimension === d && lens.includes(r.T))),
    }));
  }
  return WORKLOAD.flatMap(([fid, ws]) => ws.map((w) => ({
    label: String(w), tip: `${opName(fid)} · target ${w}`, group: fid,
    get: (m) => sum(R.workload.filter((r) => r.model === m && r.family === fid && r.w === w && lens.includes(r.T))),
  })));
}

function heatCell(m, c, lenLabel) {
  const v = c.get(m.id);
  const p = v.n ? v.correct / v.n : 0;
  const bg = ramp(p);
  const td = el("td", { style: `background:${bg};color:${inkOn(bg)}`, tabindex: "0", "aria-label": `${m.name}, ${c.tip}, ${lenLabel}: exact match ${pctCell(v.correct, v.n)}` }, [pctWhole(v.correct, v.n)]);
  const content = () => [tipTitle(`${m.name} · ${c.tip}`), tipRow(modelColor(m), `exact match, ${lenLabel}`, pctCell(v.correct, v.n))];
  hover(td, (e) => showTip(e.clientX, e.clientY, content()));
  focusTip(td, content, "Arrow keys move between cells.");
  return td;
}

const modelHead = (m) => el("th", { scope: "col", class: "mhead", title: m.name }, [modelKey(m), el("span", { class: "sr-only", text: m.name })]);

// Wide screens: one row per model, one column per condition. Phones: transposed,
// so the six models become narrow marker-headed columns and conditions become rows.
function heatmap() {
  const table = document.getElementById("heat");
  const cols = heatColumns();
  const lenLabel = heatState.len === "pooled" ? "T = 8–64" : `T = ${heatState.len}`;
  const work = heatState.view === "workload";
  const flip = FLIP.matches;
  table.className = flip ? "heat is-flipped" : "heat";
  if (flip) {
    const row = (c) => el("tr", {}, [el("th", { scope: "row", class: "rowh", text: c.label }), ...BOARD.map((m) => heatCell(m, c, lenLabel))]);
    const bodies = work
      ? WORKLOAD.map(([fid]) => el("tbody", {}, [
        el("tr", { class: "grp" }, [el("th", { scope: "rowgroup", colspan: BOARD.length + 1, text: opName(fid) })]),
        ...cols.filter((c) => c.group === fid).map(row),
      ]))
      : [el("tbody", {}, cols.map(row))];
    table.replaceChildren(
      el("colgroup", {}, [el("col", { class: "c-rowh" }), ...BOARD.map(() => el("col"))]),
      el("thead", {}, [el("tr", {}, [work ? el("th", { class: "sub", text: "Target" }) : el("td"), ...BOARD.map(modelHead)])]),
      ...bodies,
    );
  } else {
    const heads = work
      ? [
        el("tr", { class: "grp" }, [el("td"), ...WORKLOAD.map(([fid, ws]) => el("th", { colspan: ws.length, scope: "colgroup" }, [el("span", { text: opName(fid) })]))]),
        el("tr", {}, [el("th", { class: "sub", text: "Workload target" }), ...cols.map((c) => el("th", { scope: "col", text: c.label }))]),
      ]
      : [el("tr", {}, [el("td"), ...cols.map((c) => el("th", { scope: "col", text: c.label }))])];
    table.replaceChildren(
      el("colgroup", {}, [el("col", { class: "c-rowh" }), ...cols.map(() => el("col"))]),
      el("thead", {}, heads),
      el("tbody", {}, BOARD.map((m) => el("tr", {}, [
        el("th", { scope: "row", class: "rowh" }, [el("span", { class: "mkey" }, [modelKey(m), m.name])]),
        ...cols.map((c) => heatCell(m, c, lenLabel)),
      ]))),
    );
  }
  roving([...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")]));
  const key = document.getElementById("heat-key");
  key.hidden = !flip;
  key.replaceChildren(...BOARD.map((m) => legendItem(modelKey(m), m.name)));
  const rampBox = document.getElementById("heat-ramp");
  rampBox.replaceChildren(el("span", { text: "0%" }), el("i", { style: `background:linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => ramp(t)).join(",")})` }), el("span", { text: "100%" }));
  boardCaption();
}

const boardState = { view: "overall" };

function boardCaption() {
  const cap = document.getElementById("board-cap");
  document.getElementById("board-scope").textContent = boardState.view === "workload" ? "Exact match, 2D workload study" : "Exact match, main benchmark";
  if (boardState.view === "overall") {
    caption(cap, "Share of instances answered with every cell right, at each history length. Rows are sorted by the pooled column, T = 8–64.",
      "One instance per trajectory at each length. Empty, invalid, and length-terminated outputs count as wrong. Tooltips give 95% trajectory-bootstrap intervals.");
    return;
  }
  const lenLabel = heatState.len === "pooled" ? "T = 8–64" : `T = ${heatState.len}`;
  const notes = {
    task: "Each operation pools all three dimensions. These breakdowns describe the sampled conditions, not intrinsic rule difficulty.",
    dimension: "Each dimension pools all eight operations. Dimension changes geometry, boundary exposure, coordinate arity, and representation length together.",
    workload: "Each operation sweeps a workload target in 2D. The main-benchmark targets (PAINT 100, REFLECT 64, MIX 12, LAYER 60) reuse main instances.",
  };
  const text = heatState.view === "workload"
    ? `Exact match per cell (${lenLabel}, 2D workload study). Each target sets an operation's scale: PAINT ball size, REFLECT box volume, MIX reached region, LAYER component plus boundary.`
    : `Exact match per cell (${lenLabel}, main benchmark); color shows the same share.`;
  caption(cap, text, notes[heatState.view]);
}

function initBoard() {
  leaderboard();
  const overall = document.getElementById("board-overall");
  const heatBox = document.getElementById("board-heat");
  const viewBtns = [...document.querySelectorAll("#board-view button")];
  viewBtns.forEach((b) => b.addEventListener("click", () => {
    boardState.view = b.dataset.view;
    viewBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    overall.hidden = boardState.view !== "overall";
    heatBox.hidden = boardState.view === "overall";
    if (boardState.view !== "overall") { heatState.view = boardState.view; heatmap(); } else boardCaption();
  }));
  const lenBtns = [...document.querySelectorAll("#heat-len button")];
  lenBtns.forEach((b) => b.addEventListener("click", () => {
    heatState.len = b.dataset.len;
    lenBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    heatmap();
  }));
  // Crossing the breakpoint switches between the wide and transposed heatmaps.
  FLIP.addEventListener("change", () => { if (boardState.view !== "overall") heatmap(); });
  boardCaption();
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

function scopeLabel() {
  if (lenState.view === "overall") return "main benchmark";
  if (lenState.view === "dimension") return `d = ${lenState.sub}`;
  return opName(lenState.sub);
}

function lengthChart(width) {
  const series = lengthSeries();
  const H = Math.round(Math.max(240, Math.min(292, width * 0.38)));
  const pad = { l: 44, r: 14, t: 10, b: 44 };
  const iw = width - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (k) => pad.l + (k / (LENGTHS.length - 1)) * iw;
  const y = (v) => pad.t + (1 - v) * ih;
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": `Exact match by history length for six models, ${scopeLabel()}` });
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
  hover(hit, (e) => {
    const box = root.getBoundingClientRect();
    const px = e.clientX - box.left;
    const k = Math.max(0, Math.min(LENGTHS.length - 1, Math.round(((px - pad.l) / iw) * (LENGTHS.length - 1))));
    cross.setAttribute("x1", x(k));
    cross.setAttribute("x2", x(k));
    cross.setAttribute("visibility", "visible");
    const rows = visible.map((s) => ({ s, r: s.rows[k] })).sort((a, b) => b.r.em - a.r.em);
    showTip(e.clientX, e.clientY, [
      tipTitle(`T = ${LENGTHS[k]} · ${scopeLabel()}`),
      ...rows.map(({ s, r }) => tipRow(modelColor(s.m), s.m.name, pctCell(r.correct, r.n))),
      ...(lenState.view === "overall" ? [tipSub("95% trajectory-bootstrap intervals shaded")] : []),
    ]);
  }, () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
  return root;
}

function lengthTable() {
  const series = lengthSeries();
  const t = el("table", { class: "data-table" });
  t.append(el("caption", { class: "sr-only", text: `Exact match by history length, ${scopeLabel()}` }));
  t.append(el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: "Model" }), ...LENGTHS.map((x) => el("th", { scope: "col", text: `T = ${x}` }))])]));
  t.append(el("tbody", {}, series.map((s) => el("tr", {}, [
    el("th", { scope: "row", text: s.m.name }),
    ...s.rows.map((r) => el("td", { text: `${pctCell(r.correct, r.n)}${lenState.view === "overall" && r.T > 0 && r.lo !== r.hi ? ` [${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}%]` : ""}` })),
  ]))));
  return el("div", { class: "table-scroll" }, [t]);
}

function lengthCaption() {
  const cap = document.getElementById("len-cap");
  if (lenState.view === "overall") {
    caption(cap, "Exact match at each history length on the main benchmark; shaded bands are 95% intervals.",
      "One instance per trajectory at each length. Intervals come from a stratified whole-trajectory bootstrap.");
  } else if (lenState.view === "dimension") {
    caption(cap, `Exact match at each history length, d = ${lenState.sub}; each point pools all eight operations.`,
      "Dimension changes geometry, boundary exposure, coordinate arity, and representation length together.");
  } else {
    caption(cap, `Exact match at each history length, ${scopeLabel()}; each point pools all three dimensions.`,
      "Per-operation samples are small and describe the sampled conditions; avoid reading them as precise rankings.");
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
      const b = el("button", { class: "legend-item", type: "button", "aria-pressed": String(!hidden.has(m.id)), "aria-label": `${m.name}: show or hide` }, [lineKey(m), m.name]);
      b.addEventListener("click", () => {
        if (hidden.has(m.id)) hidden.delete(m.id);
        else if (hidden.size < MODELS.length - 1) hidden.add(m.id);
        drawLegend();
        legend.querySelectorAll("button")[MODELS.indexOf(m)].focus();
        rerender();
      });
      return b;
    }));
  };
  drawLegend();

  const update = () => { rerender(); refreshTable(); lengthCaption(); };
  const setSub = () => {
    const opts = lenState.view === "dimension" ? DIMS.map((d) => [d, `d = ${d}`]) : lenState.view === "task" ? R.families.map((f) => [f.id, f.op]) : [];
    sub.hidden = !opts.length;
    sub.replaceChildren(...opts.map(([v, label]) => {
      const b = el("button", { type: "button", "aria-pressed": String(v === lenState.sub), text: label });
      b.addEventListener("click", () => {
        lenState.sub = v;
        sub.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        update();
      });
      return b;
    }));
  };
  const viewBtns = [...document.querySelectorAll("#len-view button")];
  viewBtns.forEach((b) => b.addEventListener("click", () => {
    lenState.view = b.dataset.view;
    lenState.sub = lenState.view === "dimension" ? 2 : lenState.view === "task" ? R.families[0].id : null;
    viewBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setSub();
    update();
  }));
  refreshTable();
  lengthCaption();

  const toggle = document.querySelector('[data-table-toggle="len-table"]');
  toggle.addEventListener("click", () => {
    const on = tableBox.classList.toggle("is-on");
    toggle.textContent = on ? "Hide table" : "Show table";
    toggle.setAttribute("aria-expanded", String(on));
  });
}

// ---------- Tabs inside a finding card ----------
function initTabs(list) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const keyed = [...list.closest(".f-fig").querySelectorAll("[data-panel]")];
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    keyed.forEach((n) => { n.hidden = n.dataset.panel !== tab.getAttribute("aria-controls"); });
    hideTip();
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const n = tabs.length;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1 + n, Home: 0, End: n - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[next % n], true);
    });
  });
  select(tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0]);
}

// ---------- Finding 2a: error extent dot plot ----------
// [T, marker shape, vertical lane offset]. Lanes keep close medians (MiniMax M2.5
// at T = 16 and 64: 117 vs. 124.5) from hiding each other.
const EXTENT_T = [[1, "circle", -6], [16, "square", 0], [64, "triangle", 6]];

function logX(v, x0, x1) {
  const lo = 0, hi = 8; // log2(1) .. log2(256)
  return x0 + ((Math.log2(Math.max(1, v)) - lo) / (hi - lo)) * (x1 - x0);
}

function extentChart(width) {
  const f = rowFrame(width, { top: 22, wideRow: 40, rightW: 104 });
  const H = f.bottom + 40;
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": "Median wrong cells per model at T = 1, 16, and 64" });
  root.append(svg("text", { x: width, y: 11, "text-anchor": "end", class: "dlabel head", text: "valid wrong, T = 1 / 16 / 64" }));
  const axis = svg("g", { class: "axis" });
  [1, 4, 16, 64, 256].forEach((v) => {
    const xx = logX(v, f.x0, f.x1);
    axis.append(svg("line", { x1: xx, x2: xx, y1: f.top - 2, y2: f.bottom, class: "gridline" }));
    axis.append(svg("text", { x: xx, y: f.bottom + 16, "text-anchor": "middle", text: v }));
  });
  root.append(axis);
  root.append(svg("text", { x: (f.x0 + f.x1) / 2, y: H - 4, "text-anchor": "middle", class: "axis-title", text: "Median wrong cells (log scale)" }));
  const stops = MODELS.map(() => []);
  MODELS.forEach((m, k) => {
    const cy = f.cy(k);
    root.append(f.nameAt(k, m.name));
    const recs = EXTENT_T.map(([t, shape, dy]) => ({ t, shape, dy, r: R.errors.find((e) => e.model === m.id && e.T === t) }));
    root.append(f.rightAt(k, `${recs.map((x) => pctWhole(x.r.valid_wrong_n, x.r.n).slice(0, -1)).join(" / ")}%`));
    const pts = recs.filter((x) => x.r.median != null).map((x) => `${logX(x.r.median, f.x0, f.x1)},${cy + x.dy}`);
    if (pts.length > 1) root.append(svg("polyline", { points: pts.join(" "), fill: "none", stroke: modelColor(m), "stroke-width": 2, opacity: 0.35, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    for (const { t, shape, dy, r } of recs) {
      if (r.median == null) continue;
      const cx = logX(r.median, f.x0, f.x1);
      const g = svg("g", { tabindex: "0", role: "img", "aria-label": `${m.name}, T = ${t}: median ${num(r.median)} wrong cells among valid incorrect answers (${pctCell(r.valid_wrong_n, r.n)} of answers)` });
      g.append(svg("circle", { cx, cy: cy + dy, r: 9, fill: "transparent" }));
      g.append(marker(shape, cx, cy + dy, 5, modelColor(m)));
      const content = () => [
        tipTitle(`${m.name} · T = ${t}`),
        tipRow(modelColor(m), "median wrong cells", num(r.median)),
        tipRow(null, "IQR", `${num(r.q25)}–${num(r.q75)}`),
        tipRow(null, "P90", num(r.p90)),
        tipRow(null, "within 5 cells", pctOf(r.near5, r.valid_wrong_n)),
        tipSub(`Valid incorrect answers: ${pctCell(r.valid_wrong_n, r.n)} of all answers`),
      ];
      hover(g, (e) => showTip(e.clientX, e.clientY, content()));
      focusTip(g, content, "Arrow keys move between markers.");
      root.append(g);
      stops[k].push(g);
    }
  });
  roving(stops);
  return root;
}

function extentLegend() {
  document.getElementById("extent-legend").replaceChildren(
    ...EXTENT_T.map(([t, shape]) => legendItem(swatch(marker(shape, 7, 7, 4.6, INK2, "transparent")), `T = ${t}`)),
  );
}

// ---------- Finding 2b: shared-instance scatter ----------
// Wrong cells as a share of the instance's world (256 cells in 2D and 4D, 252 in 3D).
const shareA = (p) => p.a / CELLS[p.d];
const shareB = (p) => p.b / CELLS[p.d];

function pairStats() {
  const p = R.pairs;
  const of = (k) => pctOf(k, p.length);
  return {
    share: pctOf(p.length, lengthRow("moonshotai.kimi-k2.5", 8).n),
    medA: fmt.pct(median(p.map(shareA))),
    medB: fmt.pct(median(p.map(shareB))),
    fewer: of(p.filter((x) => x.a < x.b).length),
    equal: of(p.filter((x) => x.a === x.b).length),
    more: of(p.filter((x) => x.a > x.b).length),
  };
}

// Each shared instance takes the color of the model with more wrong cells (gray when equal).
function pairColor(p) {
  if (p.a === p.b) return "#c3d0e2";
  return modelColor(MODELS.find((m) => m.id === (p.b > p.a ? "minimax.minimax-m2.5" : "moonshotai.kimi-k2.5")));
}

function pairChart(width) {
  const compact = width < COMPACT;
  const H = Math.round(Math.max(300, Math.min(340, width * 0.45)));
  const pad = { l: compact ? 44 : 50, r: 12, t: 10, b: 46 };
  const iw = width - pad.l - pad.r, ih = H - pad.t - pad.b;
  // Log scales over shares of the world, from one cell in 256 to the whole world.
  const lg = (v) => Math.log2(Math.max(1 / 256, v) * 256) / 8;
  const sx = (v) => pad.l + lg(v) * iw;
  const sy = (v) => pad.t + (1 - lg(v)) * ih;
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": "Share of cells wrong, Kimi K2.5 versus MiniMax M2.5, on shared instances at T = 8" });
  const axis = svg("g", { class: "axis" });
  (compact ? [0.01, 0.1, 1] : [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]).forEach((v) => {
    const label = `${+(v * 100).toFixed(1)}%`;
    axis.append(svg("line", { x1: sx(v), x2: sx(v), y1: pad.t, y2: pad.t + ih, class: "gridline" }));
    axis.append(svg("line", { x1: pad.l, x2: pad.l + iw, y1: sy(v), y2: sy(v), class: "gridline" }));
    axis.append(svg("text", { x: sx(v), y: pad.t + ih + 18, "text-anchor": "middle", text: label }));
    axis.append(svg("text", { x: pad.l - 8, y: sy(v) + 4, "text-anchor": "end", text: label }));
  });
  root.append(axis);
  root.append(svg("line", { x1: sx(1 / 256), y1: sy(1 / 256), x2: sx(1), y2: sy(1), stroke: MUTED, "stroke-width": 1.25, opacity: 0.7 }));
  root.append(svg("text", { x: pad.l + iw / 2, y: H - 6, "text-anchor": "middle", class: "axis-title", text: "Kimi K2.5: cells wrong" }));
  root.append(svg("text", { x: 12, y: pad.t + ih / 2, "text-anchor": "middle", class: "axis-title", transform: `rotate(-90 12 ${pad.t + ih / 2})`, text: "MiniMax M2.5: cells wrong" }));
  root.append(svg("text", { x: sx(2.2 / 256), y: sy(2.2 / 256) + 14, "text-anchor": "middle", class: "dlabel head", transform: `rotate(${-Math.atan2(ih, iw) * 180 / Math.PI} ${sx(2.2 / 256)} ${sy(2.2 / 256) + 14})`, text: "equal" }));
  const pts = R.pairs.map((p) => ({ p, x: sx(shareA(p)), y: sy(shareB(p)) }));
  for (const { p, x, y } of pts) root.append(svg("circle", { cx: x, cy: y, r: 4.5, fill: pairColor(p), "fill-opacity": 0.8, stroke: SURFACE, "stroke-width": 1.5 }));
  const hl = svg("circle", { r: 7, fill: "none", stroke: "#35d0f0", "stroke-width": 2, cx: -20, cy: -20, visibility: "hidden", "pointer-events": "none" });
  root.append(hl);
  const hit = svg("rect", { x: pad.l, y: pad.t, width: iw, height: ih, fill: "transparent" });
  root.append(hit);
  const clear = () => { hideTip(); hl.setAttribute("visibility", "hidden"); };
  hover(hit, (e) => {
    const box = root.getBoundingClientRect();
    const px = e.clientX - box.left, py = e.clientY - box.top;
    let best = null, bd = 24 * 24;
    for (const q of pts) {
      const d = (q.x - px) ** 2 + (q.y - py) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) { clear(); return; }
    hl.setAttribute("cx", best.x); hl.setAttribute("cy", best.y); hl.setAttribute("visibility", "visible");
    const same = pts.filter((q) => q.x === best.x && q.y === best.y).length;
    showTip(e.clientX, e.clientY, [
      tipTitle(`${best.p.op} · d = ${best.p.d} · T = 8`),
      tipRow(modelColor(MODELS.find((m) => m.id === "moonshotai.kimi-k2.5")), "Kimi K2.5", `${fmt.pct(shareA(best.p))} of cells wrong`),
      tipRow(modelColor(MODELS.find((m) => m.id === "minimax.minimax-m2.5")), "MiniMax M2.5", `${fmt.pct(shareB(best.p))} of cells wrong`),
      tipSub(best.p.id.replace(/^main:/, "") + (same > 1 ? " · more instances at this point" : "")),
    ]);
  }, clear);
  return root;
}

function pairLegend() {
  const st = pairStats();
  const dot = (fill) => swatch(svg("circle", { cx: 7, cy: 7, r: 4.5, fill }));
  document.getElementById("pair-legend").replaceChildren(
    legendItem(dot(pairColor({ a: 0, b: 1 })), `MiniMax M2.5 more wrong (${st.fewer})`),
    legendItem(dot(pairColor({ a: 1, b: 0 })), `Kimi K2.5 more wrong (${st.more})`),
    legendItem(dot(pairColor({ a: 0, b: 0 })), `Equal (${st.equal})`),
  );
}

// ---------- Finding 3a: baselines at T=64 ----------
function baseChart(width) {
  const rows = MODELS.map((m) => ({ m, r: R.baselines.find((b) => b.model === m.id && b.T === 64) }));
  const f = rowFrame(width, { top: 22, wideRow: 36, rightW: 92 });
  const H = f.bottom + 40;
  const lo = 0.4, hi = 1;
  const sx = (v) => f.x0 + ((v - lo) / (hi - lo)) * (f.x1 - f.x0 - (f.compact ? 0 : 10));
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": "Model cell accuracy versus copy-initial and all-zero baselines at T = 64" });
  const axis = svg("g", { class: "axis" });
  [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((v) => {
    axis.append(svg("line", { x1: sx(v), x2: sx(v), y1: f.top - 2, y2: f.bottom, class: "gridline" }));
    axis.append(svg("text", { x: sx(v), y: f.bottom + 16, "text-anchor": "middle", text: `${Math.round(v * 100)}` }));
  });
  root.append(axis);
  root.append(svg("text", { x: (sx(lo) + sx(hi)) / 2, y: H - 4, "text-anchor": "middle", class: "axis-title", text: "Cell accuracy (%)" }));
  root.append(svg("text", { x: width, y: 11, "text-anchor": "end", class: "dlabel head", text: "beat copy" }));
  rows.forEach(({ m, r }, k) => {
    const cy = f.cy(k);
    root.append(f.nameAt(k, m.name));
    root.append(svg("line", { x1: sx(Math.min(r.copy_ca, r.model_ca)), x2: sx(Math.max(r.copy_ca, r.model_ca)), y1: cy, y2: cy, stroke: modelColor(m), "stroke-width": 2, opacity: 0.5 }));
    root.append(zeroMark(sx(r.zero_ca), cy));
    root.append(copyMark(sx(r.copy_ca), cy));
    root.append(marker(m.marker, sx(r.model_ca), cy, 5.2, modelColor(m)));
    root.append(f.rightAt(k, pctOf(r.above_copy, r.valid_n)));
    const content = () => [
      tipTitle(`${m.name} · T = 64`),
      tipRow(modelColor(m), "model", fmt.pct(r.model_ca)),
      tipRow(BASE_GRAY, "copy initial", fmt.pct(r.copy_ca)),
      tipRow(null, "all zero", fmt.pct(r.zero_ca)),
      tipRow(null, "beat copy", pctOf(r.above_copy, r.valid_n)),
      tipSub(`Valid answers: ${pctCell(r.valid_n, r.n)} of all; baselines on the same subset`),
    ];
    const hit = svg("rect", { x: f.compact ? 0 : f.x0 - 6, y: cy - f.rowH / 2 - (f.compact ? 8 : 0), width: f.compact ? width : f.x1 - f.x0 + 12, height: f.rowH, rx: 8, fill: "transparent", tabindex: "0", role: "img", "aria-label": `${m.name}: cell accuracy ${fmt.pct(r.model_ca)}, copy initial ${fmt.pct(r.copy_ca)}, all zero ${fmt.pct(r.zero_ca)}` });
    hover(hit, (e) => showTip(e.clientX, e.clientY, content()));
    focusTip(hit, content);
    root.append(hit);
  });
  return root;
}

// Baseline marks: copy-initial is a vertical tick, all-zero a hollow ring, so
// neither can be mistaken for a model marker.
const copyMark = (cx, cy) => svg("rect", { x: cx - 1.5, y: cy - 7, width: 3, height: 14, rx: 1.5, fill: BASE_GRAY });
const zeroMark = (cx, cy) => svg("circle", { cx, cy, r: 4, fill: SURFACE, stroke: BASE_GRAY, "stroke-width": 1.6 });

function baseLegend() {
  // The model key repeats three real model markers in their own colors.
  const models = svg("svg", { class: "multi", viewBox: "0 0 40 14", "aria-hidden": "true" },
    MODELS.slice(0, 3).map((m, i) => marker(m.marker, 7 + i * 13, 7, 4.3, modelColor(m), "transparent")));
  document.getElementById("base-legend").replaceChildren(
    legendItem(models, "Model"),
    legendItem(swatch(copyMark(7, 7)), "Copy initial"),
    legendItem(swatch(zeroMark(7, 7)), "All zero"),
  );
}

// ---------- Finding 3b: changed / unchanged error composition ----------
const cuState = { T: 1 };
const CU = [
  ["changed_only", "C only · missed or wrong updates"],
  ["unchanged_only", "U only · corrupted unchanged cells"],
  ["both", "Both"],
];
const CU_COLORS = ["#35d0f0", "#e0a43a", "#8b7cf6"];

function cuChart(width) {
  const f = rowFrame(width, { top: 22, wideRow: 34, rightW: 58 });
  const H = f.bottom + 26;
  const root = svg("svg", { width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img", "aria-label": `Error composition at T = ${cuState.T}` });
  root.append(svg("text", { x: width, y: 11, "text-anchor": "end", class: "dlabel head", text: "valid wrong" }));
  const axis = svg("g", { class: "axis" });
  [0, 0.5, 1].forEach((v) => {
    const xx = f.x0 + v * (f.x1 - f.x0);
    axis.append(svg("text", { x: xx, y: H - 6, "text-anchor": v === 0 ? "start" : v === 1 ? "end" : "middle", text: `${v * 100}%` }));
  });
  root.append(axis);
  MODELS.forEach((m, k) => {
    const r = R.errors.find((e) => e.model === m.id && e.T === cuState.T);
    const cy = f.cy(k);
    root.append(f.nameAt(k, m.name));
    const total = r.valid_wrong_n;
    root.append(f.rightAt(k, pctWhole(total, r.n)));
    if (!total) return;
    let acc = 0;
    const content = () => [
      tipTitle(`${m.name} · T = ${cuState.T}`),
      ...CU.map(([kk, ll], jj) => tipRow(CU_COLORS[jj], ll, pctOf(r[kk], total))),
      tipSub(`Shares of valid incorrect answers (${pctCell(total, r.n)} of all answers)`),
    ];
    CU.forEach(([key], j) => {
      const v = r[key];
      const w = (v / total) * (f.x1 - f.x0);
      const xs = f.x0 + (acc / total) * (f.x1 - f.x0);
      acc += v;
      if (w <= 0) return;
      const seg = svg("rect", { x: xs + (j ? 1 : 0), y: cy - 9, width: Math.max(0.5, w - (j ? 1 : 0) - (j < 2 ? 1 : 0)), height: 18, rx: 3, fill: CU_COLORS[j] });
      root.append(seg);
      const txt = pctWhole(v, total);
      if (w > txt.length * 7.5 + 10) {
        root.append(svg("text", { x: xs + w / 2, y: cy + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: inkOn(CU_COLORS[j]), "pointer-events": "none", text: txt }));
      }
      hover(seg, (e) => showTip(e.clientX, e.clientY, content()));
    });
    const focus = svg("rect", { x: f.x0, y: cy - 10, width: f.x1 - f.x0, height: 20, fill: "transparent", "pointer-events": "none", tabindex: "0", role: "img", "aria-label": `${m.name}, T = ${cuState.T}: ${CU.map(([kk, ll]) => `${ll.split(" · ")[0]} ${pctOf(r[kk], total)}`).join(", ")} of valid incorrect answers` });
    focusTip(focus, content);
    root.append(focus);
  });
  return root;
}

function cuLegend(rerender) {
  const box = document.getElementById("cu-legend");
  const seg = el("div", { class: "seg seg-sm", role: "group", "aria-label": "History length" }, [1, 16, 64].map((t) => {
    const b = el("button", { type: "button", "aria-pressed": String(t === cuState.T), text: `T = ${t}` });
    b.addEventListener("click", () => {
      cuState.T = t;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      rerender();
    });
    return b;
  }));
  box.replaceChildren(seg, el("span", { class: "legend" }, CU.map(([, label], j) => legendItem(
    el("i", { class: "sq", style: `background:${CU_COLORS[j]}` }), label.split(" · ")[0],
  ))));
}

// ---------- Footnotes ----------
function notes() {
  const pre = R.prefix.slice().sort((a, b) => a.wrong_then_correct - b.wrong_then_correct);
  const lo = pre[0], hi = pre[pre.length - 1];
  document.getElementById("note-prefix").textContent =
    `A model sometimes solves a longer prefix after failing a shorter one: on ${pctOf(lo.wrong_then_correct, lo.n)} (${nameOf(lo.model)}) to ${pctOf(hi.wrong_then_correct, hi.n)} (${nameOf(hi.model)}) of trajectories.`;
  const d = R.delivery;
  const most = d.slice().sort((a, b) => b.empty - a.empty)[0];
  const least = d.slice().sort((a, b) => a.empty - b.empty)[0];
  document.getElementById("note-delivery").textContent =
    `Empty responses range from ${least.empty ? pctOf(least.empty, least.n) : "0%"} of requests (${nameOf(least.model)}) to ${pctOf(most.empty, most.n)} (${nameOf(most.model)}; ${pctOf(most.length_terminated, most.empty)} of those stopped at the length limit).`;
  const g = R.totals.gold_checks;
  const total = (k) => g.reduce((s, x) => s + x[k], 0);
  document.getElementById("note-oracle").textContent =
    `A separately written implementation of the rules recomputes every reference state by replaying its events; ${pctCell(total("selected_states") - total("mismatches"), total("selected_states"))} match.`;
}

export function initCharts(results) {
  R = results;
  MODELS = results.models;
  const pooled = (m) => POOLED.reduce((s, t) => s + lengthRow(m.id, t).correct, 0);
  BOARD = [...MODELS].sort((a, b) => pooled(b) - pooled(a));
  bindFacts();
  initBoard();
  initLength();

  extentLegend();
  responsive(document.getElementById("extent-chart"), extentChart);
  caption(document.getElementById("extent-cap"), "Median wrong cells among valid incorrect answers on the main benchmark; the right column gives those answers' share of all answers.",
    "Hover a marker for the IQR, P90, and the share within 5 cells. These outcome-selected statistics complement exact match on the full set.");
  pairLegend();
  responsive(document.getElementById("pair-chart"), pairChart);
  const st = pairStats();
  caption(document.getElementById("pair-cap"), `Share of cells wrong on the main instances where both models return a valid incorrect state at T = 8 (${st.share} of instances), on log scales.`,
    `Medians ${st.medA} versus ${st.medB} of cells. Kimi K2.5 has fewer wrong cells on ${st.fewer} of these instances, as many on ${st.equal}, and more on ${st.more}. Exact match on the full set: Kimi K2.5 ${facts()["kimi-8"]}, MiniMax M2.5 ${facts()["minimax-8"]}.`);
  initTabs(document.getElementById("f2-tabs"));

  baseLegend();
  responsive(document.getElementById("base-chart"), baseChart);
  caption(document.getElementById("base-cap"), "Mean cell accuracy of each model's valid T = 64 answers; baselines use the same subset.",
    "The right column gives the share of each model's valid answers that beat the copy-initial baseline. Neither baseline solves any positive-length main instance exactly.");
  const cuRun = responsive(document.getElementById("cu-chart"), cuChart);
  cuLegend(cuRun);
  caption(document.getElementById("cu-cap"), "Valid incorrect answers by where their wrong cells fall: changed cells (C), unchanged cells (U), or both. The right column gives those answers' share of all answers.",
    "C holds cells whose reference final value differs from the initial value; U holds cells whose final value is unchanged. At T = 64 most failures combine both kinds.");
  initTabs(document.getElementById("f3-tabs"));

  notes();
}

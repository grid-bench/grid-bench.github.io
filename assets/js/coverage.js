// Section 05: three geometries, the six-prefix diagram, and the design formula.
// Grid states come from exported reference trajectories; design counts come from results.json.

import { GridCanvas } from "./grid2d.js";
import { VoxelWorld } from "./voxel.js";
import {
  applyDiff, countUp, el, fmt, hideTip, mix, onVisible, reducedMotion, showTip, svg, tilt, tipRow, tipSub, tipTitle,
} from "./util.js";

const GRAD = ["#35d0f0", "#8b7cf6", "#e35d9f"];
const AXIS = ["#35d0f0", "#8b7cf6", "#e35d9f", "#f2b84b"];
const gradAt = (t) => (t <= 0.5 ? mix(GRAD[0], GRAD[1], t / 0.5) : mix(GRAD[1], GRAD[2], (t - 0.5) / 0.5));

// Workload targets, in the paper's words (Figure 6 caption).
const TARGET = {
  metric_paint: "ball size",
  box_reflection: "box volume",
  boundary_layer: "component + boundary",
  occluded_mix: "reached region",
};

const tipText = (text) => el("div", { class: "sc-tt", text });
const listing = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`);

// A tooltip row without the color key, so it lines up with the title and text.
function plainRow(label, value) {
  const row = tipRow(null, label, value);
  row.firstChild.remove();
  row.classList.add("sc-plain");
  return row;
}

// The tooltip is a page-wide singleton; remember which node of this section opened it.
let tipOwner = null;
const tipOpen = (node) => tipOwner === node && document.getElementById("tooltip")?.classList.contains("is-on");

// Mouse: hover shows the tooltip at the pointer (following it when `follow` is set), and a click keeps it there.
// Keyboard: focus shows it at the node; Enter or Space toggles it; Escape hides it.
// Touch or pen: a tap toggles it, and a tap elsewhere hides it.
function bindTip(node, content, { follow = false } = {}) {
  let outside = null;
  let viaPointer = false;
  let pointerType = "";
  const at = (x, y) => { showTip(x, y, content()); tipOwner = node; };
  const atNode = () => { const r = node.getBoundingClientRect(); at(r.right - 4, r.bottom - 4); };
  const hide = () => {
    if (tipOwner === node) { hideTip(); tipOwner = null; }
    if (outside) document.removeEventListener("pointerdown", outside, true);
    outside = null;
  };
  const watchOutside = () => {
    if (outside) return;
    outside = (ev) => { if (!node.contains(ev.target)) hide(); };
    document.addEventListener("pointerdown", outside, true);
  };
  node.addEventListener("pointerdown", (e) => { viaPointer = true; pointerType = e.pointerType; });
  node.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") at(e.clientX, e.clientY); });
  if (follow) node.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") at(e.clientX, e.clientY); });
  node.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
  // A focus that comes from a press is handled by the click that follows.
  node.addEventListener("focus", () => { if (!viaPointer) atNode(); });
  node.addEventListener("blur", () => { viaPointer = false; hide(); });
  node.addEventListener("keydown", (e) => { if (e.key === "Escape" && tipOpen(node)) { e.stopPropagation(); hide(); } });
  node.addEventListener("click", (e) => {
    const type = e.detail === 0 ? "" : (e.pointerType || pointerType);
    viaPointer = false;
    if (type === "mouse") { at(e.clientX, e.clientY); watchOutside(); return; }
    if (tipOpen(node)) { hide(); return; }
    atNode();
    watchOutside();
  });
}

// ---------- Dimension cards ----------

// Each axis contributes two neighbors; the projection angles are only a drawing device.
function neighborGlyph(d) {
  const angles = { 2: [0, 90], 3: [90, 30, 150], 4: [0, 45, 90, 135] }[d];
  const g = svg("svg", { viewBox: "-25 -25 50 50", "aria-hidden": "true" });
  const lines = svg("g");
  const cells = svg("g");
  let i = 0;
  angles.forEach((a, k) => {
    const rad = (a * Math.PI) / 180;
    for (const sign of [1, -1]) {
      const x = Math.cos(rad) * 17 * sign;
      const y = -Math.sin(rad) * 17 * sign;
      lines.append(svg("line", { class: "ax", x1: 0, y1: 0, x2: x, y2: y, stroke: AXIS[k], "stroke-opacity": 0.5, "stroke-width": 1.4 }));
      cells.append(svg("rect", { class: "nb", x: x - 3.4, y: y - 3.4, width: 6.8, height: 6.8, rx: 1.8, fill: AXIS[k], style: `--i:${i++}` }));
    }
  });
  g.append(lines, cells, svg("rect", { x: -4.8, y: -4.8, width: 9.6, height: 9.6, rx: 2.4, fill: "#eef2fa" }));
  return g;
}

// Cells with at least one coordinate on the edge of the world.
function boundaryCount(shape) {
  const all = shape.reduce((p, n) => p * n, 1);
  return all - shape.reduce((p, n) => p * Math.max(0, n - 2), 1);
}

function setTick(node, t, step) {
  if (!step) {
    node.replaceChildren(el("span", { class: "t", text: "T = 0" }), "initial world");
    return;
  }
  const op = step.op || step.text.split("(")[0];
  node.replaceChildren(
    el("span", { class: "t", text: `T = ${t}` }),
    el("span", { class: op === "SET" ? "op set" : "op", text: op }),
    step.text.slice(op.length),
  );
}

function gridPlayer(canvas, traj, tick) {
  const grid = new GridCanvas(canvas, { pad: 8 });
  grid.setWorld(traj.shape, traj.values, traj.initial);
  let t = 0;
  let state = traj.initial.slice();
  setTick(tick, 0, null);
  return {
    step() {
      if (t >= traj.steps.length) {
        t = 0;
        state = traj.initial.slice();
        grid.setState(state, new Set());
        setTick(tick, 0, null);
        return;
      }
      const s = traj.steps[t++];
      state = applyDiff(state, s.diff);
      grid.setState(state, new Set(s.diff.map(([i]) => i)));
      setTick(tick, t, s);
    },
  };
}

function voxelPlayer(canvas, world, tick) {
  const vox = new VoxelWorld(canvas, { autoRotate: 0.2, yaw: 0.45 });
  vox.setWorld(world.shape, world.values, world.initial, { stagger: false });
  let t = 0;
  let resetting = false;
  setTick(tick, 0, null);
  return {
    vox,
    step() {
      if (resetting) return;
      if (t >= world.steps.length) {
        resetting = true;
        vox.clear();
        setTimeout(() => {
          vox.setWorld(world.shape, world.values, world.initial, { stagger: true });
          t = 0;
          resetting = false;
          setTick(tick, 0, null);
        }, 520);
        return;
      }
      const s = world.steps[t++];
      vox.applyDiff(s.diff);
      setTick(tick, t, s);
    },
  };
}

const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';

function dims(families, hero, tesseract) {
  const box = document.getElementById("dims");
  const cards = [...box.querySelectorAll(".sc-dim")];

  cards.forEach((card) => {
    const fig = card.querySelector(".sc-nb");
    fig.prepend(neighborGlyph(Number(fig.dataset.nb)));
    const b = card.querySelector("[data-boundary]");
    b.textContent = fmt.int(boundaryCount(b.dataset.boundary.split(",").map(Number)));
    tilt(card, { max: 4, lift: 4 });
  });

  // All three replay RELABEL trajectories from the main benchmark.
  const players = [
    gridPlayer(document.getElementById("dim-2d"), families.find((f) => f.id === "component_relabel").trajectory, document.getElementById("dim-2d-tick")),
    voxelPlayer(document.getElementById("dim-3d"), hero.worlds.find((w) => w.family === "component_relabel"), document.getElementById("dim-3d-tick")),
    gridPlayer(document.getElementById("dim-4d"), tesseract, document.getElementById("dim-4d-tick")),
  ];
  const { vox } = players[1];

  // Dragging the 3D world should not tilt its card.
  const card3 = cards[1];
  vox.canvas.addEventListener("pointerdown", () => { card3.dataset.noTilt = "1"; card3.style.transform = ""; });
  window.addEventListener("pointerup", () => { delete card3.dataset.noTilt; });

  const btn = document.getElementById("dims-play");
  let playing = !reducedMotion();
  const vis = [false, false, false]; // per card, so a stacked card offscreen stays still
  let timer = 0;
  let k = 0;
  const label = () => {
    btn.innerHTML = (playing ? ICON_PAUSE : ICON_PLAY) + (playing ? "Pause" : "Play");
    btn.setAttribute("aria-label", playing ? "Pause the three replays" : "Play the three replays");
  };
  // One event every 0.9 s, taking turns across the cards that are on screen.
  const tick = () => {
    for (let n = 0; n < 3; n++) {
      const i = k % 3;
      k += 1;
      if (vis[i]) { players[i].step(); return; }
    }
  };
  const sync = () => {
    const live = playing && !document.hidden;
    if (live && vis[1]) vox.start();
    else if (vox.running) { vox.stop(); vox.draw(); }
    const run = live && vis.some(Boolean);
    if (run && !timer) timer = setInterval(tick, 900);
    if (!run && timer) { clearInterval(timer); timer = 0; }
  };
  btn.addEventListener("click", () => { playing = !playing; label(); sync(); });
  label();
  cards.forEach((card, i) => onVisible(card, (on) => { vis[i] = on; sync(); }, "0px"));
  document.addEventListener("visibilitychange", sync);
}

// ---------- Six prefixes ----------

function stateGlyph() {
  const g = svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" });
  for (const [x, y, o] of [[1, 1, 1], [9, 1, 0.55], [1, 9, 0.55], [9, 9, 1]]) {
    g.append(svg("rect", { x, y, width: 6, height: 6, rx: 1.6, fill: "currentColor", opacity: o }));
  }
  return g;
}

function prefixDiagram(results) {
  const root = document.getElementById("prefix");
  const lengths = results.lengths;
  const N = Math.max(...lengths);
  const { trajectories, main_trajectories: mainTraj } = results.totals;

  const rows = lengths.map((T, r) => {
    const base = r * 150;
    const track = el("span", { class: "sc-pf-track", "aria-hidden": "true" });
    for (let k = 1; k <= N; k++) {
      track.append(k <= T
        ? el("i", { class: "on", style: `--c:${gradAt((k - 1) / (N - 1))};--d:${base + k * 9}ms` })
        : el("i"));
    }
    const cutColor = gradAt(Math.max(0, T - 1) / (N - 1));
    const done = `${base + T * 9 + 120}ms`;
    track.append(el("b", { class: "sc-pf-cut", style: `--t:${T / N};--c:${cutColor};--d:${done}` }));
    const row = el("div", {
      class: "sc-pf-row",
      role: "listitem",
      tabindex: "0",
      "aria-label": T === 0
        ? `T = 0: no events; the reference final state is the initial world.`
        : `T = ${T}: the first ${T} of ${N} events; scored against the reference state after event ${T}.`,
    }, [
      el("span", { class: "sc-pf-t", text: `T = ${T}` }),
      track,
      el("span", { class: "sc-pf-end", style: `--c:${cutColor};--d:${done}` }, [stateGlyph()]),
    ]);
    bindTip(row, () => [
      tipTitle(`T = ${T}`),
      plainRow("events in the prompt", `${T} of ${N}`),
      plainRow("requests per model", `${fmt.int(trajectories)} (${fmt.int(mainTraj)} main)`),
      tipSub(T === 0 ? "No events: the reference final state is the initial world." : `Scored against the reference state after event ${T}.`),
    ], { follow: true });
    return row;
  });
  const axis = el("div", { class: "sc-pf-axis", "aria-hidden": "true" }, [
    el("span"), el("span", {}, [el("span", { text: "event 1" }), el("span", { text: `event ${N}` })]), el("span"),
  ]);
  root.replaceChildren(...rows, axis);

  const why = "The six prefixes of a trajectory share one history, so they are not independent rows.";
  const how = `Confidence intervals therefore resample whole trajectories, not rows, in ${fmt.int(results.totals.bootstrap_replicates)} stratified bootstrap draws.`;
  document.getElementById("prefix-note").textContent = `${why} ${how}`;
  bindTip(document.getElementById("prefix-info"), () => [tipTitle("Statistics note"), tipText(why), tipText(how)]);

  if (reducedMotion()) { root.classList.add("is-drawn"); return; }
  const io = onVisible(root, (on) => {
    if (!on) return;
    root.classList.add("is-drawn");
    io.disconnect();
  }, "0px 0px -12% 0px");
}

// ---------- Formula ribbon ----------

// Every number in the formula is derived here and cross-checked.
function designCounts(results, families) {
  const t = results.totals;
  const dims = new Set(results.dimension_length.map((r) => r.dimension)).size;
  const m0 = results.models[0].id;
  const cell = results.task_length.find((r) => r.model === m0 && r.family === results.families[0].id && r.T === results.lengths[0]);
  const traj = cell.n / dims;
  const lens = results.lengths.length;
  const ops = results.families.length;
  const models = results.models.length;

  // Workload conditions: (family, target) pairs that are not the family's main 2D target.
  const mainW = Object.fromEntries(families.map((f) => [f.id, Number((f.trajectory.source.match(/\/w(\d+)\//) || [])[1])]));
  const byFamily = new Map();
  for (const r of results.workload) {
    if (r.model !== m0) continue;
    if (!byFamily.has(r.family)) byFamily.set(r.family, new Set());
    byFamily.get(r.family).add(r.w);
  }
  const order = results.families.map((f) => f.id);
  const extra = [...byFamily].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([fid, ws]) => ({
    fid,
    op: results.families.find((f) => f.id === fid).op,
    main: mainW[fid],
    extra: [...ws].filter((w) => w !== mainW[fid]).sort((a, b) => a - b),
  }));
  const conditions = extra.reduce((s, f) => s + f.extra.length, 0);

  const c = {
    ops, dims, traj, lens, models, conditions, extra,
    main: t.main_instances, mainTraj: t.main_trajectories,
    work: t.workload_instances, workTraj: t.trajectories - t.main_trajectories,
    total: t.instances, totalTraj: t.trajectories, outcomes: t.outcomes,
  };
  const checks = [
    ["main instances", ops * dims * traj * lens, c.main],
    ["main trajectories", ops * dims * traj, c.mainTraj],
    ["workload instances", conditions * traj * lens, c.work],
    ["workload trajectories", conditions * traj, c.workTraj],
    ["instances", c.main + c.work, c.total],
    ["outcomes", c.total * models, c.outcomes],
  ];
  for (const [name, got, want] of checks) {
    if (got !== want) console.error(`[scale] ${name}: derived ${got}, results.json ${want}`);
  }
  return c;
}

function sq(color, cls = "sc-sq") {
  return el("i", { class: cls, style: `background:${color}` });
}

function dimIcon(d) {
  const s = svg("svg", { viewBox: "0 0 20 20", width: 19, height: 19, fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-linejoin": "round", "aria-hidden": "true" });
  if (d === 2) s.append(svg("path", { d: "M3 3h14v14H3zM10 3v14M3 10h14" }));
  if (d === 3) s.append(svg("path", { d: "M10 2l7 4v8l-7 4-7-4V6zM3 6l7 4 7-4M10 10v8" }));
  if (d === 4) s.append(svg("path", { d: "M2.5 2.5h15v15h-15zM7 7h6v6H7zM2.5 2.5L7 7M17.5 2.5L13 7M2.5 17.5L7 13M17.5 17.5L13 13" }));
  return s;
}

const opColors = (results) => Object.fromEntries(results.families.map((f, i) => [f.op, gradAt(i / (results.families.length - 1))]));

function glyphs(c, results, workTip) {
  const put = (key, nodes) => document.querySelector(`#formula [data-glyph="${key}"]`).replaceChildren(...nodes);

  const colors = opColors(results);
  const ops = results.families.map((f) => ({ op: f.op, color: colors[f.op] }));
  const opsBtn = el("button", { type: "button", class: "sc-gbtn", "aria-label": `${c.ops} operations: ${ops.map((o) => o.op).join(", ")}` }, ops.map((o) => sq(o.color)));
  bindTip(opsBtn, () => [tipTitle(`${c.ops} operations`), ...ops.map((o) => squareRow(o.color, o.op))]);
  put("ops", [opsBtn]);

  put("dims", [2, 3, 4].map(dimIcon));

  const strokes = svg("svg", { viewBox: "0 0 40 18", width: 40, height: 18, "aria-hidden": "true" });
  for (let i = 0; i < c.traj; i++) {
    strokes.append(svg("line", { x1: 2 + i * 5.1, y1: 2, x2: 2 + i * 5.1, y2: 16, stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" }));
  }
  put("traj", [strokes]);

  put("lens", [el("span", { class: "sc-lens" }, results.lengths.map((T) => el("span", { text: String(T) })))]);

  // The (i) button is the keyboard route to this tooltip, so the glyph is pointer-only.
  const work = el("span", { class: "sc-gbtn", "aria-hidden": "true" }, Array.from({ length: c.conditions }, () => el("i", { class: "sc-box" })));
  bindTip(work, workTip);
  put("work", [work]);

  const models = results.models.map((m) => ({ name: m.name, color: m.color_dark }));
  const mBtn = el("button", { type: "button", class: "sc-gbtn", "aria-label": `${c.models} models: ${models.map((m) => m.name).join(", ")}` }, models.map((m) => sq(m.color, "sc-dot")));
  bindTip(mBtn, () => [tipTitle(`${c.models} models, one response per instance`), ...models.map((m) => squareRow(m.color, m.name, true))]);
  put("models", [mBtn]);
}

function squareRow(color, label, round = false, value = "") {
  const row = tipRow(color, label, value);
  row.firstChild.style.cssText += `;width:9px;height:9px;border-radius:${round ? "50%" : "2.5px"}`;
  return row;
}

// Underbrace path for a box `w` wide: curls at both ends, tip in the middle.
function bracePath(w, h = 14) {
  const m = w / 2;
  const r = Math.min(9, w / 6);
  const y = h * 0.45;
  return `M1 0 Q1 ${y} ${1 + r} ${y} L${m - r} ${y} Q${m} ${y} ${m} ${h} Q${m} ${y} ${m + r} ${y} L${w - 1 - r} ${y} Q${w - 1} ${y} ${w - 1} 0`;
}

function braces(root) {
  root.querySelectorAll(".sc-brace").forEach((brace, i) => {
    const id = `sc-brace-grad-${i}`;
    const grad = svg("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1: 0, y1: 0, x2: 100, y2: 0 },
      GRAD.map((c, k) => svg("stop", { offset: k / (GRAD.length - 1), "stop-color": c })));
    const path = svg("path", { stroke: `url(#${id})`, pathLength: 1 });
    const s = svg("svg", { "aria-hidden": "true", height: 16 }, [svg("defs", {}, [grad]), path]);
    brace.prepend(s);
    // When the terms above wrap, their row still fills the line, so measure the terms themselves.
    const row = brace.previousElementSibling;
    const leaves = [...row.querySelectorAll(".sc-term, .sc-op, .sc-paren")];
    const fit = () => {
      const host = brace.parentElement.getBoundingClientRect();
      let l = Infinity;
      let r = -Infinity;
      for (const n of leaves) {
        const b = n.getBoundingClientRect();
        if (!b.width) continue;
        l = Math.min(l, b.left);
        r = Math.max(r, b.right);
      }
      if (!Number.isFinite(l)) return;
      const w = Math.max(20, Math.round(r - l));
      brace.style.marginLeft = `${Math.round(l - host.left)}px`;
      brace.style.width = `${w}px`;
      s.setAttribute("viewBox", `0 0 ${w} 16`);
      path.setAttribute("d", bracePath(w));
      grad.setAttribute("x2", w);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    leaves.forEach((n) => ro.observe(n));
    fit();
  });
}

// Numbers keep their final width while counting so the line never reflows.
function prepNumber(node, value) {
  const text = fmt.int(value);
  const live = el("span", { class: "lv", text });
  node.replaceChildren(el("span", { class: "gh", "aria-hidden": "true", text }), live);
  return live;
}

function formula(results, families) {
  const root = document.getElementById("formula");
  const c = designCounts(results, families);
  const colors = opColors(results);

  // Workload note: targets in the paper's units, derived from results.json.
  const workTip = () => [
    tipTitle("Workload instances"),
    tipText(`A 2D study rescales ${c.extra.length} operations. ${c.conditions} extra target sizes × ${c.traj} trajectories × ${c.lens} lengths = ${fmt.int(c.work)} instances from ${c.workTraj} trajectories.`),
    ...c.extra.map((f) => squareRow(colors[f.op], `${f.op} · ${TARGET[f.fid] || "target"}`, false, f.extra.join(", "))),
    tipSub(`Main-view targets: ${c.extra.map((f) => `${f.op} ${f.main}`).join(", ")}.`),
  ];
  glyphs(c, results, workTip);
  braces(root);

  const live = {};
  root.querySelectorAll("[data-k]").forEach((node) => {
    const key = node.dataset.k;
    if (node.matches(".sc-n, .sc-bn")) live[key] = prepNumber(node, c[key]);
    else node.textContent = fmt.int(c[key]);
  });

  const note = document.getElementById("work-note");
  const extraText = c.extra.map((f) => `${f.op} ${TARGET[f.fid] || "target"} ${f.extra.join(" and ")}`).join("; ");
  note.textContent = `A 2D study rescales ${listing(c.extra.map((f) => f.op))}: ${c.conditions} extra target sizes, each with ${c.traj} trajectories cut at ${c.lens} lengths, give ${fmt.int(c.work)} instances from ${c.workTraj} trajectories. Extra targets: ${extraText}.`;
  bindTip(document.getElementById("work-info"), workTip);

  if (reducedMotion()) return;
  root.classList.add("is-armed");
  // Left to right: factors, workload, models; the totals land as their braces finish.
  const plan = [["ops", 0], ["dims", 110], ["traj", 220], ["lens", 330], ["work", 440], ["main", 650], ["models", 560], ["total", 1000], ["outcomes", 1150]];
  const io = onVisible(root, (on) => {
    if (!on) return;
    io.disconnect();
    root.classList.add("is-drawn");
    for (const [key, delay] of plan) {
      live[key].textContent = "0";
      setTimeout(() => countUp(live[key], c[key], { dur: c[key] > 99 ? 1300 : 650 }), delay);
    }
  }, "0px 0px -10% 0px");
}

export function initCoverage({ families, hero, tesseract, results }) {
  dims(families.families, hero, tesseract);
  prefixDiagram(results);
  formula(results, families.families);
}

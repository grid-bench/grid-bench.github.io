// Section 04: one instance, start to finish. A scroll-driven story beside a sticky stage that
// replays the paper's Figure 1 MOVE/SET histories from the exported reference states.

import { el, svg, reducedMotion, onVisible, coordOf, showTip, hideTip, tipTitle } from "./util.js";

const HEADERS = /^(TASK|SPACE|COMMON EVENT|FAMILY RULE|EXAMPLE|INITIAL|EVENTS|OUTPUT)$/;
const MOBILE = window.matchMedia("(max-width: 900px)");
const NAMES = ["empty", "entity", "obstacle"];

const DEFS = {
  em: ["Exact match (EM)", "EM = 1 only when a valid complete state equals the reference at every coordinate. Empty, invalid, and length-terminated answers count as 0."],
  ca: ["Cell accuracy (CA)", "The fraction of all grid cells with the correct value, on valid answers."],
  wrong: ["Wrong cells", "Coordinates where the answer's value differs from the reference state."],
  cu: ["Changed (C) / unchanged (U)", "Wrong cells split by whether the reference final value differs from the initial world (C) or equals it (U). Dashed cells on the stage are C."],
};

let uid = 0;
const cstr = (c) => `[${c.join(",")}]`;
const flat = (c, shape) => c.reduce((acc, v, i) => acc * shape[i] + v, 0);

// ---------- Prompt parsing ----------

function promptSections(prompt) {
  const out = {};
  let cur = null;
  for (const line of prompt.split("\n")) {
    if (HEADERS.test(line)) { cur = line; out[cur] = []; }
    else if (cur) out[cur].push(line);
  }
  for (const k of Object.keys(out)) out[k] = out[k].join("\n").trim();
  return out;
}

function promptNodes(prompt) {
  const frag = document.createDocumentFragment();
  const lines = prompt.split("\n");
  lines.forEach((line, i) => {
    frag.append(HEADERS.test(line) ? el("span", { class: "h", text: line }) : line);
    if (i < lines.length - 1) frag.append("\n");
  });
  return frag;
}

// ---------- Event effects, derived from consecutive reference states ----------

function dirWord(ex, axis, direction) {
  if (ex.axes[0] === "row") return axis === 1 ? (direction > 0 ? "right" : "left") : direction > 0 ? "down" : "up";
  return `along ${direction > 0 ? "+" : "−"}${ex.axes[axis]}`;
}

function eventEffect(ex, k) {
  const raw = ex.events[k].raw;
  const prev = ex.states[k], next = ex.states[k + 1], shape = ex.shape;
  if (raw.op === "SET") {
    const i = flat(raw.p, shape);
    return { pairs: [], text: prev[i] === raw.v ? `${cstr(raw.p)} already holds ${raw.v}.` : `${cstr(raw.p)} changes from ${prev[i]} to ${raw.v}.` };
  }
  if (raw.op !== "MOVE") return { pairs: [], text: ex.events[k].text };
  // Cells that lost or gained v, paired within each line along the move axis.
  const lines = new Map();
  prev.forEach((v, i) => {
    const lost = v === raw.v && next[i] !== raw.v, got = next[i] === raw.v && v !== raw.v;
    if (!lost && !got) return;
    const c = coordOf(i, shape);
    const key = c.filter((_, a) => a !== raw.axis).join(",");
    if (!lines.has(key)) lines.set(key, { src: [], dst: [] });
    lines.get(key)[lost ? "src" : "dst"].push(i);
  });
  const along = (i) => coordOf(i, shape)[raw.axis];
  const pairs = [];
  for (const { src, dst } of lines.values()) {
    src.sort((a, b) => along(a) - along(b));
    dst.sort((a, b) => along(a) - along(b));
    if (src.length === dst.length) src.forEach((s, j) => pairs.push([s, dst[j]]));
  }
  const dir = dirWord(ex, raw.axis, raw.direction);
  let text;
  if (!pairs.length) text = `No ${raw.v} can move ${dir}.`;
  else if (pairs.length === 1) {
    const cs = coordOf(pairs[0][0], shape), cd = coordOf(pairs[0][1], shape);
    text = `The ${raw.v} at ${cstr(cs)} moves ${dir} to ${cstr(cd)}`;
    if (Math.abs(cd[raw.axis] - cs[raw.axis]) < raw.k) {
      const n = cd.slice();
      n[raw.axis] += raw.direction;
      text += n[raw.axis] < 0 || n[raw.axis] >= shape[raw.axis] ? "; the edge stops it." : `; the ${next[flat(n, shape)]} at ${cstr(n)} stops it.`;
    } else text += ".";
  } else text = `${pairs.length} cells holding ${raw.v} move ${dir}.`;
  return { pairs, text };
}

// The prompt's own worked example (shape [7]), re-executed to recover each cell's path.
function parseDemo(sec) {
  const m = /Before: ([\d ]+)\. Event: (\{[^}]*\})\. After: ([\d ]+)\./.exec(sec.EXAMPLE || "");
  if (!m) return null;
  const before = m[1].trim().split(/\s+/).map(Number);
  const after = m[3].trim().split(/\s+/).map(Number);
  const ev = JSON.parse(m[2]);
  let moves = [];
  if (ev.op === "MOVE") {
    const a = before.slice(), n = a.length, d = ev.direction;
    const order = a.map((_, i) => i).filter((i) => a[i] === ev.v).sort((x, y) => (d > 0 ? y - x : x - y));
    moves = order.map((i) => {
      let p = i, s = 0;
      while (s < ev.k && p + d >= 0 && p + d < n && a[p + d] === 0) { a[p + d] = ev.v; a[p] = 0; p += d; s++; }
      const q = p + d;
      return { from: i, to: p, stop: s < ev.k ? (q < 0 || q >= n ? "edge" : "blocked") : null };
    });
    if (!a.every((v, i) => v === after[i])) moves = [];
  }
  return { before, after, ev, evText: m[2], moves };
}

// ---------- SVG renderers (persistent elements, repainted per state) ----------

function defs(id) {
  const d = svg("defs");
  const pat = svg("pattern", { id: `${id}-hatch`, width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pat.append(svg("rect", { width: 2.2, height: 7, fill: "rgba(196,212,236,0.13)" }));
  d.append(pat);
  const g = svg("linearGradient", { id: `${id}-scan`, x1: 0, y1: 0, x2: 0, y2: 1 });
  g.append(svg("stop", { offset: "0", "stop-color": "#35d0f0", "stop-opacity": 0 }));
  g.append(svg("stop", { offset: "0.7", "stop-color": "#35d0f0", "stop-opacity": 0.22 }));
  g.append(svg("stop", { offset: "1", "stop-color": "#8b7cf6", "stop-opacity": 0.6 }));
  d.append(g);
  return d;
}

function cellGroup(id, shapeAttrs, tag, digitAt, fontSize) {
  const g = svg("g", { class: "ix-cg" });
  const cell = svg(tag, { ...shapeAttrs, class: "ix-cell v0" });
  const hatch = svg(tag, { ...shapeAttrs, class: "ix-hatch", fill: `url(#${id}-hatch)` });
  const digit = svg("text", { x: digitAt[0], y: digitAt[1], class: "ix-digit v0", "font-size": fontSize, text: "0" });
  g.append(cell, hatch, digit);
  return { g, cell, hatch, digit };
}

function build2d(ex) {
  const [R, C] = ex.shape;
  const P = 66, S = 58, left = 58, top = 58;
  const W = left + C * P + 6, H = top + R * P + 6;
  const id = `ix${++uid}`;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "ix-svg", role: "img" });
  root.append(defs(id));
  const axisG = svg("g", { class: "ix-axes" });
  for (let c = 0; c < C; c++) axisG.append(svg("text", { x: left + c * P + P / 2, y: top - 16, class: "ix-axis", "text-anchor": "middle", text: c }));
  for (let r = 0; r < R; r++) axisG.append(svg("text", { x: left - 18, y: top + r * P + P / 2 + 4.5, class: "ix-axis", "text-anchor": "middle", text: r }));
  axisG.append(svg("text", { x: left + 4, y: top - 38, class: "ix-axis ix-axis-name", text: `axis 1 · ${ex.axes[1]} →` }));
  axisG.append(svg("text", { x: 0, y: 0, class: "ix-axis ix-axis-name", transform: `translate(${left - 40} ${top + 4}) rotate(90)`, text: `axis 0 · ${ex.axes[0]} →` }));
  root.append(axisG);
  const frame = svg("rect", { x: left - 4, y: top - 4, width: C * P + 8, height: R * P + 8, rx: 18, class: "ix-frame" });
  root.append(frame);
  const cells = [], rings = svg("g");
  for (let i = 0; i < R * C; i++) {
    const r = Math.floor(i / C), c = i % C;
    const x = left + c * P + (P - S) / 2, y = top + r * P + (P - S) / 2;
    const cg = cellGroup(id, { x, y, width: S, height: S, rx: 12 }, "rect", [x + S / 2, y + S / 2], 23);
    cg.ring = svg("rect", { x: x - 3, y: y - 3, width: S + 6, height: S + 6, rx: 14, class: "ix-ring" });
    cg.center = [x + S / 2, y + S / 2];
    cg.corner = [x + S - 3, y + 3];
    cg.clear = 16;
    root.append(cg.g);
    rings.append(cg.ring);
    cells.push(cg);
  }
  root.append(rings);
  return finish(root, id, cells, frame, axisG, W, H);
}

function build3d(ex) {
  const [X, Y, Z] = ex.shape;
  const a = 38, b = 18, L = (X + Y) * b + 16, pad = 14, labelW = 50;
  const ox = labelW + Y * a + pad, oy = pad + (Z - 1) * L;
  const W = ox + X * a + pad, H = oy + (X + Y) * b + pad;
  const P = (x, y, z) => [ox + (x - y) * a, oy + (x + y) * b - z * L];
  const id = `ix${++uid}`;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "ix-svg", role: "img" });
  root.append(defs(id));
  const guides = svg("g", { class: "ix-guides" });
  for (const [x, y] of [[0, 0], [X, 0], [0, Y], [X, Y]]) {
    const p0 = P(x, y, 0), p1 = P(x, y, Z - 1);
    guides.append(svg("line", { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }));
  }
  root.append(guides);
  const axisG = svg("g", { class: "ix-axes" });
  const frame = svg("g", { class: "ix-frame" });
  const cells = new Array(X * Y * Z), rings = svg("g");
  const pts = (list) => list.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  for (let z = 0; z < Z; z++) {
    const e = 0.12;
    frame.append(svg("polygon", { points: pts([P(-e, -e, z), P(X + e, -e, z), P(X + e, Y + e, z), P(-e, Y + e, z)]) }));
    const lp = P(0, Y, z);
    axisG.append(svg("text", { x: lp[0] - 14, y: lp[1] + 4.5, class: "ix-axis", "text-anchor": "end", text: `z=${z}` }));
  }
  root.append(frame);
  for (let z = 0; z < Z; z++) {
    for (let x = 0; x < X; x++) for (let y = 0; y < Y; y++) {
      const i = (x * Y + y) * Z + z;
      const poly = pts([P(x, y, z), P(x + 1, y, z), P(x + 1, y + 1, z), P(x, y + 1, z)]);
      const m = P(x + 0.5, y + 0.5, z);
      const cg = cellGroup(id, { points: poly }, "polygon", m, 15);
      cg.ring = svg("polygon", { points: poly, class: "ix-ring" });
      cg.center = m;
      cg.corner = P(x + 1, y, z);
      cg.clear = 12;
      root.append(cg.g);
      cells[i] = cg;
    }
  }
  cells.forEach((cg) => rings.append(cg.ring));
  root.append(rings);
  // Axis glyph in the empty corner below the lowest layer.
  const g0 = [P(0, Y, 0)[0] + 2, oy + (X + Y) * b];
  const ux = [a * 0.42, b * 0.42], uy = [-a * 0.42, b * 0.42];
  const glyph = svg("g", { class: "ix-glyph" });
  glyph.append(svg("line", { x1: g0[0], y1: g0[1], x2: g0[0] + ux[0], y2: g0[1] + ux[1] }));
  glyph.append(svg("line", { x1: g0[0], y1: g0[1], x2: g0[0] + uy[0], y2: g0[1] + uy[1] }));
  glyph.append(svg("line", { x1: g0[0], y1: g0[1], x2: g0[0], y2: g0[1] - 18 }));
  axisG.append(glyph);
  axisG.append(svg("text", { x: g0[0] + ux[0] + 4, y: g0[1] + ux[1] + 4, class: "ix-axis", text: "x" }));
  axisG.append(svg("text", { x: g0[0] + uy[0] - 10, y: g0[1] + uy[1] + 4, class: "ix-axis", text: "y" }));
  axisG.append(svg("text", { x: g0[0] - 3.5, y: g0[1] - 22, class: "ix-axis", text: "z" }));
  root.append(axisG);
  return finish(root, id, cells, frame, axisG, W, H);
}

// Narrow screens: the same 3D world as z-slices side by side, so digits stay legible.
function build3dFlat(ex) {
  const [X, Y, Z] = ex.shape;
  const P = 60, S = 54, gapZ = 24, left = 32, top = 40;
  const sliceW = Y * P;
  const W = left + Z * sliceW + (Z - 1) * gapZ + 4, H = top + X * P + 30;
  const id = `ix${++uid}`;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "ix-svg", role: "img" });
  root.append(defs(id));
  const axisG = svg("g", { class: "ix-axes" });
  const frame = svg("g", { class: "ix-frame" });
  const cells = new Array(X * Y * Z), rings = svg("g");
  const ox = (z) => left + z * (sliceW + gapZ);
  for (let z = 0; z < Z; z++) {
    frame.append(svg("rect", { x: ox(z) - 4, y: top - 4, width: sliceW + 8, height: X * P + 8, rx: 16 }));
    axisG.append(svg("text", { x: ox(z) + sliceW / 2, y: top - 18, class: "ix-axis ix-slice", "text-anchor": "middle", text: `z=${z}` }));
    for (let y = 0; y < Y; y++) axisG.append(svg("text", { x: ox(z) + y * P + P / 2, y: top + X * P + 24, class: "ix-axis", "text-anchor": "middle", text: y }));
  }
  for (let x = 0; x < X; x++) axisG.append(svg("text", { x: left - 17, y: top + x * P + P / 2 + 5, class: "ix-axis", "text-anchor": "middle", text: x }));
  axisG.append(svg("text", { x: left - 17, y: top - 18, class: "ix-axis ix-axis-name", "text-anchor": "middle", text: "x" }));
  axisG.append(svg("text", { x: left - 17, y: top + X * P + 24, class: "ix-axis ix-axis-name", "text-anchor": "middle", text: "y" }));
  root.append(axisG, frame);
  for (let i = 0; i < X * Y * Z; i++) {
    const [x, y, z] = coordOf(i, ex.shape);
    const cx = ox(z) + y * P + (P - S) / 2, cy = top + x * P + (P - S) / 2;
    const cg = cellGroup(id, { x: cx, y: cy, width: S, height: S, rx: 11 }, "rect", [cx + S / 2, cy + S / 2], 26);
    cg.ring = svg("rect", { x: cx - 3, y: cy - 3, width: S + 6, height: S + 6, rx: 13, class: "ix-ring" });
    cg.center = [cx + S / 2, cy + S / 2];
    cg.corner = [cx + S - 3, cy + 3];
    cg.clear = 16;
    cg.z = z;
    root.append(cg.g);
    rings.append(cg.ring);
    cells[i] = cg;
  }
  root.append(rings);
  const w = finish(root, id, cells, frame, axisG, W, H);
  w.flat = true;
  // Moves across slices arc over the cells in between.
  w.bend = (s, e) => (cells[s].z !== cells[e].z ? -64 : 0);
  return w;
}

function finish(root, id, cells, frame, axisG, W, H) {
  const arrows = svg("g", { class: "ix-arrows" });
  const badge = svg("g", { class: "ix-badge" });
  badge.append(svg("circle", { r: 9 }), svg("path", { d: "M-3.4 -3.4L3.4 3.4M3.4 -3.4L-3.4 3.4" }));
  const scan = svg("rect", { x: 0, y: -60, width: W, height: 60, fill: `url(#${id}-scan)`, class: "ix-scan" });
  root.append(arrows, badge, scan);
  return { root, cells, frame, axisG, arrows, badge, scan, W, H };
}

// From just past the source digit to just short of the destination digit, so both stay legible.
// A nonzero bend draws a quadratic arc whose control point sits `bend` units off the chord.
function arrow(from, to, clear, bend = 0) {
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const ctrl = [(from[0] + to[0]) / 2 - (dy / len) * bend, (from[1] + to[1]) / 2 + (dx / len) * bend];
  const toward = (p, q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] + ((q[0] - p[0]) / l) * d, p[1] + ((q[1] - p[1]) / l) * d]; };
  const s = toward(from, bend ? ctrl : to, clear), e = toward(to, bend ? ctrl : from, clear);
  const hl = Math.hypot(e[0] - (bend ? ctrl : s)[0], e[1] - (bend ? ctrl : s)[1]) || 1;
  const ux = (e[0] - (bend ? ctrl : s)[0]) / hl, uy = (e[1] - (bend ? ctrl : s)[1]) / hl;
  const g = svg("g", { class: "ix-arrow" });
  g.append(svg("circle", { cx: s[0], cy: s[1], r: 3.2, class: "ix-arrow-dot" }));
  g.append(svg("path", { d: bend ? `M${s[0]} ${s[1]}Q${ctrl[0]} ${ctrl[1]} ${e[0]} ${e[1]}` : `M${s[0]} ${s[1]}L${e[0]} ${e[1]}`, pathLength: 1, class: "ix-arrow-line" }));
  const h = 8, w = 5.5;
  const p1 = [e[0] - ux * h + uy * w, e[1] - uy * h - ux * w], p2 = [e[0] - ux * h - uy * w, e[1] - uy * h + ux * w];
  g.append(svg("path", { d: `M${p1[0]} ${p1[1]}L${e[0]} ${e[1]}L${p2[0]} ${p2[1]}`, class: "ix-arrow-head" }));
  return g;
}

function buildDemo(demo, compact) {
  const n = demo.before.length;
  // Narrow screens: a shorter gap between the rows so the strips stay large in the compact stage.
  const P = 58, S = 48, left = 74, y0 = 44, y1 = compact ? 146 : 168;
  const W = left + n * P + 4, H = y1 + S + 30;
  const id = `ix${++uid}`;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "ix-svg" });
  root.append(defs(id));
  const xc = (i) => left + i * P + P / 2;
  const row = (vals, y, label) => {
    root.append(svg("text", { x: 0, y: y + S / 2 + 4.5, class: "ix-axis ix-row-label", text: label }));
    root.append(svg("rect", { x: left - 3, y: y - 5, width: n * P - 4, height: S + 10, rx: 14, class: "ix-frame" }));
    vals.forEach((v, i) => {
      const x = xc(i) - S / 2;
      const cg = cellGroup(id, { x, y, width: S, height: S, rx: 11 }, "rect", [x + S / 2, y + S / 2], 20);
      cg.cell.setAttribute("class", `ix-cell v${v}`);
      cg.hatch.classList.toggle("on", v === 2);
      cg.digit.setAttribute("class", `ix-digit v${v}`);
      cg.digit.textContent = v;
      root.append(cg.g);
    });
  };
  row(demo.before, y0, "Before");
  row(demo.after, y1, "After");
  demo.moves.forEach((m, k) => {
    const a = [xc(m.from), y0 + S + 7], b = [xc(m.to), y1 - 9];
    const cls = m.from === m.to ? "ix-demo-stay" : "ix-demo-move";
    const mid = (a[1] + b[1]) / 2;
    root.append(svg("path", { d: `M${a[0]} ${a[1]}C${a[0]} ${mid} ${b[0]} ${mid} ${b[0]} ${b[1]}`, class: cls, "marker-end": "none" }));
    if (m.from !== m.to) root.append(svg("path", { d: `M${b[0] - 5} ${b[1] - 7}L${b[0]} ${b[1]}L${b[0] + 5} ${b[1] - 7}`, class: "ix-demo-move" }));
    // Handling order above the moving cells.
    const ox = xc(m.from), oy = y0 - 18;
    root.append(svg("circle", { cx: ox, cy: oy, r: 9, class: "ix-order" }));
    root.append(svg("text", { x: ox, y: oy + 3.8, class: "ix-order-n", text: k + 1 }));
  });
  for (let i = 0; i < n; i++) root.append(svg("text", { x: xc(i), y: H - 6, class: "ix-axis", "text-anchor": "middle", text: `[${i}]` }));
  return root;
}

// ---------- Section ----------

export function initTask(data) {
  const story = document.getElementById("ix-story");
  const stepsEl = document.getElementById("ix-steps");
  const steps = [...stepsEl.querySelectorAll(".ix-step")];
  const stageCol = story.querySelector(".ix-stage-col");
  const worldPane = document.getElementById("ix-world");
  const demoPane = document.getElementById("ix-demo");
  const stateTag = document.getElementById("ix-state");
  const caption = document.getElementById("ix-caption");
  const srcNote = story.querySelector(".ix-src");
  const eventsEl = document.getElementById("ix-events");
  const answerEl = document.getElementById("ix-answer");
  const ruleEl = document.getElementById("ix-rule");
  const metricsEl = document.getElementById("ix-metrics");
  const errorToggle = document.getElementById("ix-error");
  const promptEl = document.getElementById("ix-prompt");
  const tabs = [...story.querySelectorAll("[data-example]")];
  const rail = el("span", { class: "ix-rail", "aria-hidden": "true" }, [el("i")]);
  stepsEl.prepend(rail);
  // Short visible label; the full frozen prompt ID stays available on hover.
  const pv = data.prompt_version || "", verEl = document.getElementById("ix-ver"), vm = /\/(\d[\w.]*)$/.exec(pv);
  verEl.textContent = vm ? `prompt v${vm[1]}` : pv;
  if (pv) verEl.title = `Prompt version ID: ${pv}`;

  let exIndex = 0, ex = null, world = null, demo = null, effects = [];
  let triggers = [], active = -1, near = false, hl = -1;

  const last = () => ex.states.length - 1;

  function predicted() {
    const out = ex.states[last()].slice();
    const err = ex.illustrative_error;
    if (errorToggle.checked && err) out[flat(err.coordinate, ex.shape)] = err.predicted;
    return out;
  }

  function diagnostics() {
    const ref = ex.states[last()], init = ex.states[0], pred = predicted();
    const wrong = [], changed = [];
    ref.forEach((v, i) => {
      if (pred[i] !== v) wrong.push(i);
      if (init[i] !== v) changed.push(i);
    });
    const cset = new Set(changed);
    const wc = wrong.filter((i) => cset.has(i)).length;
    return { n: ref.length, wrong, cset, wc, wu: wrong.length - wc, nC: changed.length, nU: ref.length - changed.length, em: wrong.length === 0 ? 1 : 0, pred, ref };
  }

  // ----- Static content per example -----

  function infoBtn(key) {
    const [title, text] = DEFS[key];
    const b = el("button", { type: "button", class: "info", "aria-label": `Definition: ${title}`, text: "i" });
    const show = (x, y) => showTip(x, y, [tipTitle(title), el("div", { class: "ix-tip", text })]);
    b.addEventListener("pointerenter", (e) => show(e.clientX, e.clientY));
    b.addEventListener("pointermove", (e) => show(e.clientX, e.clientY));
    b.addEventListener("pointerleave", hideTip);
    b.addEventListener("focus", () => { const r = b.getBoundingClientRect(); show(r.right, r.bottom); });
    b.addEventListener("blur", hideTip);
    b.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
    b.addEventListener("click", (e) => { const r = b.getBoundingClientRect(); show(r.right, r.bottom); e.preventDefault(); });
    return b;
  }

  function renderMetrics() {
    const d = diagnostics();
    const row = (key, label, value, cls = "") => el("div", { class: "ix-m" }, [
      el("dt", {}, [...[].concat(label), " ", infoBtn(key)]),
      el("dd", { class: cls }, value),
    ]);
    const wrongText = d.wrong.length
      ? d.wrong.map((i) => `${cstr(coordOf(i, ex.shape))} is ${d.pred[i]}, not ${d.ref[i]}`).join("; ")
      : "none";
    metricsEl.replaceChildren(
      row("em", "Exact match", String(d.em), d.em ? "good" : "bad"),
      row("ca", "Cell accuracy", [`${d.n - d.wrong.length}/${d.n}`, el("span", { class: "ix-sub", text: ` · ${((100 * (d.n - d.wrong.length)) / d.n).toFixed(1)}%` })]),
      row("wrong", "Wrong cells", wrongText, d.wrong.length ? "bad" : ""),
      row("cu", [el("i", { class: "ix-dash", "aria-hidden": "true" }), "C / U errors"], [el("span", { class: d.wc ? "bad" : "", text: `C ${d.wc}/${d.nC}` }), el("span", { class: "ix-sub", text: " · " }), el("span", { class: d.wu ? "bad" : "", text: `U ${d.wu}/${d.nU}` })]),
    );
  }

  function renderAnswer() {
    answerEl.replaceChildren();
    let parsed = null;
    try { parsed = JSON.parse(ex.answer); } catch { /* fall back to plain text */ }
    const entries = parsed?.cells?.map((c) => JSON.stringify(c)) || [];
    if (!entries.length || `{"cells":[${entries.join(",")}]}` !== ex.answer) {
      answerEl.textContent = ex.answer;
      return;
    }
    answerEl.append(el("span", { class: "ix-brace", text: '{"cells":[' }));
    parsed.cells.forEach((c, k) => {
      const i = flat(c[0], ex.shape);
      const span = el("span", { class: "ix-entry", "data-i": i, text: entries[k] });
      span.addEventListener("pointerenter", () => { hl = i; paint(false); });
      span.addEventListener("pointerleave", () => { hl = -1; paint(false); });
      if (k < entries.length - 1) answerEl.append(span, ",", el("wbr"));
      else answerEl.append(span);
    });
    answerEl.append(el("span", { class: "ix-brace", text: "]}" }));
  }

  function renderEvents() {
    eventsEl.replaceChildren();
    effects = ex.events.map((_, k) => eventEffect(ex, k));
    ex.events.forEach((e, k) => {
      const op = e.text.slice(0, e.op.length), rest = e.text.slice(e.op.length);
      const btn = el("button", { type: "button", class: "ix-ev", "aria-label": `Show W${k + 1}, after ${e.text}` }, [
        el("span", { class: "n", text: k + 1 }),
        el("span", { class: "txt" }, [el("span", { class: `op ${e.op === "SET" ? "set" : ""}`, text: op }), rest]),
      ]);
      btn.addEventListener("click", () => jump(triggers.findIndex((t) => t.ev === k)));
      eventsEl.append(el("li", { class: "ix-event", "data-ev": k }, [btn, el("p", { class: "ix-fx", text: effects[k].text })]));
    });
  }

  function loadExample(i) {
    exIndex = i;
    ex = data.examples[i];
    tabs.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.example) === i)));
    const sec = promptSections(ex.prompt);
    story.querySelectorAll('[data-ix="shape"]').forEach((n) => { n.textContent = ex.shape.join("×"); });
    story.querySelectorAll('[data-ix="nev"]').forEach((n) => { n.textContent = ex.events.length; });
    story.querySelectorAll('[data-ix="last"]').forEach((n) => { n.textContent = `W${last()}`; });
    // Both rule blocks the prompt carries: SET (common to every family) and this family's rule.
    ruleEl.textContent = sec["COMMON EVENT"]
      ? `COMMON EVENT\n${sec["COMMON EVENT"]}\n\nFAMILY RULE\n${sec["FAMILY RULE"] || ""}`
      : sec["FAMILY RULE"] || "";
    promptEl.querySelectorAll(":scope > :not(.copy)").forEach((n) => n.remove());
    [...promptEl.childNodes].filter((n) => n.nodeType === 3).forEach((n) => n.remove());
    promptEl.append(promptNodes(ex.prompt));
    world = ex.shape.length === 2 ? build2d(ex) : MOBILE.matches ? build3dFlat(ex) : build3d(ex);
    world.root.classList.add(ex.shape.length === 2 ? "is-2d" : world.flat ? "is-flat" : "is-3d");
    story.classList.toggle("is-flat3d", Boolean(world.flat));
    world.cells.forEach((cg, idx) => {
      cg.g.addEventListener("pointerenter", (e) => {
        const v = Number(cg.digit.textContent);
        showTip(e.clientX, e.clientY, [tipTitle(cstr(coordOf(idx, ex.shape))), el("div", { class: "ix-tip", text: `${v} · ${NAMES[v] || "value"}` })]);
      });
      cg.g.addEventListener("pointerleave", hideTip);
    });
    worldPane.replaceChildren(world.root);
    const d = parseDemo(sec);
    demo = d;
    demoPane.replaceChildren();
    if (d) {
      demoPane.append(
        el("div", { class: "ix-demo-head" }, [el("span", { class: "ix-demo-k", text: "The prompt's worked example" }), el("code", {}, d.evText.split(",").flatMap((part, j) => (j ? [",", el("wbr"), part] : [part])))]),
        buildDemo(d, MOBILE.matches),
      );
    }
    renderEvents();
    renderAnswer();
    renderMetrics();
    buildTriggers();
    const keep = active;
    active = -1;
    go(Math.max(0, keep), false);
  }

  // ----- Scroll triggers -----

  function buildTriggers() {
    const evRows = [...eventsEl.querySelectorAll(".ix-event")];
    triggers = [
      { node: steps[0], step: 0, view: "world", mode: "initial", t: 0 },
      { node: steps[1], step: 1, view: demo ? "demo" : "world", mode: demo ? "demo" : "initial", t: 0 },
      ...ex.events.map((_, k) => ({ node: k === 0 ? steps[2] : evRows[k], step: 2, view: "world", mode: "event", t: k + 1, ev: k })),
      { node: steps[3], step: 3, view: "world", mode: "answer", t: last() },
      { node: steps[4], step: 4, view: "world", mode: "check", t: last() },
    ];
  }

  function triggerLine() {
    const H = window.innerHeight;
    // Wide screens, and narrow ones where the stage is not sticky (landscape phones).
    if (!MOBILE.matches || getComputedStyle(stageCol).position !== "sticky") return H * 0.45;
    const r = stageCol.getBoundingClientRect();
    return Math.min(H - 40, r.bottom + (H - r.bottom) * 0.3);
  }

  function syncRail() {
    if (active < 0) return;
    rail.firstChild.style.height = `${steps[triggers[active].step].offsetTop + 18}px`;
  }

  function measure() {
    if (!near || !triggers.length) return;
    const cs = getComputedStyle(stageCol);
    stageCol.classList.toggle("is-stuck", MOBILE.matches && cs.position === "sticky" && stageCol.getBoundingClientRect().top <= parseFloat(cs.top) + 1);
    const line = triggerLine();
    let k = 0;
    triggers.forEach((t, j) => { if (t.node.getBoundingClientRect().top < line) k = j; });
    if (k !== active) go(k, true);
    else syncRail();
  }

  function jump(k) {
    if (k < 0) return;
    const line = triggerLine();
    const top = triggers[k].node.getBoundingClientRect().top;
    window.scrollTo({ top: window.scrollY + top - line + 6, behavior: reducedMotion() ? "instant" : "smooth" });
    if (Math.abs(top - line) < 8) go(k, true);
  }

  function go(k, animate) {
    const prev = active;
    active = k;
    const t = triggers[k];
    steps.forEach((s, j) => s.classList.toggle("is-active", j === t.step));
    eventsEl.querySelectorAll(".ix-event").forEach((row, j) => {
      row.classList.toggle("is-active", t.mode === "event" && j === t.ev);
      row.classList.toggle("is-done", (t.mode === "event" && j < t.ev) || t.step > 2);
    });
    syncRail();
    worldPane.classList.toggle("is-on", t.view === "world");
    demoPane.classList.toggle("is-on", t.view === "demo");
    worldPane.setAttribute("aria-hidden", String(t.view !== "world"));
    demoPane.setAttribute("aria-hidden", String(t.view !== "demo"));
    paint(animate && prev !== k && !reducedMotion());
  }

  // ----- Stage painting -----

  function paint(animate) {
    const t = triggers[active];
    if (!t || !world) return;
    const n = ex.states[0].length;
    const d = diagnostics();
    const showErr = t.mode === "check" && errorToggle.checked;
    const state = t.mode === "check" ? d.pred : ex.states[t.t];
    const prevState = t.mode === "event" ? ex.states[t.t - 1] : null;
    world.cells.forEach((cg, i) => {
      const v = state[i];
      cg.cell.setAttribute("class", `ix-cell v${v}`);
      cg.hatch.classList.toggle("on", v === 2);
      cg.digit.setAttribute("class", `ix-digit v${v}`);
      if (cg.digit.textContent !== String(v)) cg.digit.textContent = v;
      let ring = "";
      if (t.mode === "check" && state[i] !== d.ref[i]) ring = "err";
      else if (t.mode === "answer" && hl === i) ring = "hl";
      else if (prevState && prevState[i] !== state[i]) ring = "chg";
      else if (t.mode === "check" && d.cset.has(i)) ring = "c";
      cg.ring.setAttribute("class", `ix-ring ${ring}`);
      cg.g.classList.toggle("dim", t.mode === "answer" && v === 0);
    });
    world.frame.setAttribute("class", `ix-frame ${t.mode === "initial" ? "bounded" : t.mode === "check" ? (d.em ? "ok" : "bad") : ""}`);
    world.axisG.classList.toggle("hot", t.mode === "initial");
    world.root.setAttribute("aria-label", `${ex.shape.length}D world, W${t.t}. Nonzero cells: ${state.map((v, i) => (v ? `${cstr(coordOf(i, ex.shape))}=${v}` : null)).filter(Boolean).join(", ") || "none"}.`);

    // Motion arrows for MOVE events.
    world.arrows.replaceChildren();
    if (t.mode === "event") {
      for (const [s, e] of effects[t.ev].pairs) {
        const g = arrow(world.cells[s].center, world.cells[e].center, world.cells[e].clear, world.bend ? world.bend(s, e) : 0);
        world.arrows.append(g);
        if (animate) requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("on")));
        else g.classList.add("on", "now");
      }
    }
    // Error badge.
    if (showErr && d.wrong.length) {
      const [bx, by] = world.cells[d.wrong[0]].corner;
      world.badge.setAttribute("transform", `translate(${bx} ${by})`);
      world.badge.classList.add("on");
    } else world.badge.classList.remove("on");
    // One sweep when the check step opens.
    if (t.mode === "check" && animate && world.scan.animate) {
      world.scan.animate(
        [{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(${world.H + 60}px)`, opacity: 1 }],
        { duration: 900, easing: "cubic-bezier(.4,0,.2,1)" },
      );
    }

    // Tag and caption.
    const tag = (text, cls = "") => { stateTag.className = `label-tag ${cls}`; stateTag.textContent = text; };
    let cap;
    if (t.mode === "initial") {
      tag("W0 · initial");
      cap = ex.shape.length === 2
        ? `Shape [${ex.shape}]. Axis 0 runs down the ${ex.axes[0]}s, axis 1 across the ${ex.axes[1]}s.`
        : world.flat
          ? `Shape [${ex.shape}], shown as ${ex.shape[2]} slices along z; rows are x and columns are y.`
          : `Shape [${ex.shape}], drawn as ${ex.shape[2]} layers along z. Cell [0,0,0] is the top corner of z=0.`;
    } else if (t.mode === "demo") {
      tag("Rule · prompt example");
      const parts = demo.moves.map((m) => (m.from === m.to ? `[${m.from}] stays (${m.stop === "edge" ? "edge" : "blocked"})` : `[${m.from}] → [${m.to}]`));
      cap = demo.moves.length ? `Cells nearest the leading edge go first: ${parts.join(", ")}.` : "The worked example included in every MOVE prompt.";
    } else if (t.mode === "event") {
      tag(`W${t.t} · after event ${t.t}`);
      cap = effects[t.ev].text;
    } else if (t.mode === "answer") {
      tag(`W${t.t} · reference answer`, "ref");
      const nz = state.filter((v) => v !== 0).length;
      cap = `${nz} of ${n} cells are nonzero, so the answer has ${nz} entries. Unlisted cells are 0.`;
    } else {
      const err = ex.illustrative_error;
      if (showErr && d.wrong.length) {
        tag("Illustrative error", "err");
        const i = d.wrong[0], desc = err.description.split(/(?<=\.)\s/)[0];
        cap = `${cstr(coordOf(i, ex.shape))} holds ${d.pred[i]} instead of ${d.ref[i]}: ${desc.charAt(0).toLowerCase()}${desc.slice(1)}`;
      } else {
        tag(`W${t.t} · reference`, "ref");
        cap = `All ${n} cells match the reference. Dashed cells changed since W0.`;
      }
    }
    caption.textContent = cap;
    // The note describes the Figure 1 world; the rule view shows the prompt's own example instead.
    srcNote.style.visibility = t.mode === "demo" ? "hidden" : "";
  }

  // ----- Wiring -----

  tabs.forEach((b) => b.addEventListener("click", () => {
    if (Number(b.dataset.example) !== exIndex) loadExample(Number(b.dataset.example));
  }));
  errorToggle.addEventListener("change", () => {
    renderMetrics();
    const k = triggers.findIndex((t) => t.mode === "check");
    if (active !== k) jump(k);
    paint(false);
  });

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; measure(); });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onVisible(story, (on) => { near = on; if (on) onScroll(); }, "200px");
  if ("ResizeObserver" in window) new ResizeObserver(onScroll).observe(stepsEl);
  MOBILE.addEventListener("change", () => { loadExample(exIndex); onScroll(); });

  loadExample(0);
}

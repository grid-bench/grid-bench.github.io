// Section 01: step through the paper's Figure 1 examples beside the exact prompt text.

import { el, svg, theme, reducedMotion } from "./util.js";

const HEADERS = /^(TASK|SPACE|COMMON EVENT|FAMILY RULE|EXAMPLE|INITIAL|EVENTS|OUTPUT)$/;

function colors() {
  const dark = theme() === "dark";
  return {
    empty: dark ? "#111a2c" : "#eef2f8",
    emptyStroke: dark ? "rgba(148,170,205,0.16)" : "rgba(30,50,90,0.12)",
    emptyInk: dark ? "#4c5b72" : "#9aa8bb",
    entity: dark ? "#2bb8db" : "#1477b8",
    entityInk: "#ffffff",
    obstacle: dark ? "#263752" : "#c6d7ea",
    obstacleInk: dark ? "#b7c6dc" : "#22405f",
    ring: dark ? "#7fe6ff" : "#0a8fb3",
    bad: dark ? "#f06a7a" : "#c8334a",
    axis: dark ? "#6f7f96" : "#7b8aa0",
    guide: dark ? "rgba(148,170,205,0.22)" : "rgba(30,50,90,0.2)",
  };
}

function fill(v, c) {
  return v === 1 ? [c.entity, c.entityInk] : v === 2 ? [c.obstacle, c.obstacleInk] : [c.empty, c.emptyInk];
}

function describe(raw, axes) {
  if (raw.op === "SET") return `SET [${raw.p.join(",")}] ← ${raw.v}`;
  if (raw.op === "MOVE") {
    let dir;
    if (axes[0] === "row") dir = raw.axis === 1 ? (raw.direction > 0 ? "right" : "left") : raw.direction > 0 ? "down" : "up";
    else dir = `${raw.direction > 0 ? "+" : "−"}${axes[raw.axis]}`;
    return `MOVE ${dir} ≤${raw.k}`;
  }
  return raw.op;
}

function render2d(ex, t, showError) {
  const c = colors();
  const [R, C] = ex.shape;
  const size = 62, gap = 6, left = 34, top = 8;
  const W = left + C * size + 4, H = top + R * size + 30;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `2D world W${t}` });
  const state = ex.states[t];
  const prev = t > 0 ? ex.states[t - 1] : null;
  const err = ex.illustrative_error;
  const errIndex = err.coordinate[0] * C + err.coordinate[1];
  for (let r = 0; r < R; r++) {
    root.append(svg("text", { x: left - 14, y: top + r * size + size / 2 + 5, class: "gaxis", "font-size": 13, "text-anchor": "middle", text: r }));
  }
  for (let col = 0; col < C; col++) {
    root.append(svg("text", { x: left + col * size + size / 2, y: H - 8, class: "gaxis", "font-size": 13, "text-anchor": "middle", text: col }));
  }
  state.forEach((v0, i) => {
    const r = Math.floor(i / C), col = i % C;
    const isErr = showError && i === errIndex;
    const v = isErr ? err.predicted : v0;
    const [bg, ink] = fill(v, c);
    const x = left + col * size + gap / 2, y = top + r * size + gap / 2, s = size - gap;
    root.append(svg("rect", { x, y, width: s, height: s, rx: 8, fill: bg, class: "gcell", stroke: v === 0 ? c.emptyStroke : "none" }));
    root.append(svg("text", { x: x + s / 2, y: y + s / 2 + 7, "text-anchor": "middle", "font-size": 21, class: "gtext", fill: ink, text: v }));
    if (isErr) {
      root.append(svg("rect", { x: x - 2, y: y - 2, width: s + 4, height: s + 4, rx: 10, fill: "none", stroke: c.bad, "stroke-width": 3 }));
    } else if (prev && prev[i] !== v0) {
      root.append(svg("rect", { x: x - 2, y: y - 2, width: s + 4, height: s + 4, rx: 10, fill: "none", stroke: c.ring, "stroke-width": 2.5 }));
    }
  });
  return root;
}

function render3d(ex, t, showError) {
  const c = colors();
  const [X, Y, Z] = ex.shape;
  const a = 36, b = 20.5, layer = 128;
  const ex_ = [a, b], ey_ = [-a, b];
  const W = 420, H = 2 * b * 3 + layer * (Z - 1) + 40;
  const ox = 198, oy = H - 2 * b * 3 - 12;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `3D world W${t}` });
  const state = ex.states[t];
  const prev = t > 0 ? ex.states[t - 1] : null;
  const err = ex.illustrative_error;
  const [ex0, ey0, ez0] = err.coordinate;
  const errIndex = (ex0 * Y + ey0) * Z + ez0;
  const P = (x, y, z) => [ox + x * ex_[0] + y * ey_[0], oy + x * ex_[1] + y * ey_[1] - z * layer];
  // Guides between layers at the four outer corners.
  const guides = svg("g", { stroke: c.guide, "stroke-dasharray": "2 4", fill: "none" });
  for (const [x, y] of [[0, 0], [X, 0], [0, Y], [X, Y]]) {
    const p0 = P(x, y, 0), p1 = P(x, y, Z - 1);
    guides.append(svg("line", { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }));
  }
  root.append(guides);
  for (let z = 0; z < Z; z++) {
    const g = svg("g");
    const lp = P(0, Y, z);
    root.append(svg("text", { x: 4, y: lp[1] - 2, class: "gaxis", "font-size": 13, text: `z=${z}` }));
    const cells = [];
    for (let x = 0; x < X; x++) for (let y = 0; y < Y; y++) cells.push([x, y]);
    for (const [x, y] of cells) {
      const i = (x * Y + y) * Z + z;
      const isErr = showError && i === errIndex;
      const v = isErr ? err.predicted : state[i];
      const [bg, ink] = fill(v, c);
      const p = P(x, y, z), q = P(x + 1, y, z), r = P(x + 1, y + 1, z), s = P(x, y + 1, z);
      const pts = [p, q, r, s].map((pt) => pt.join(",")).join(" ");
      g.append(svg("polygon", { points: pts, fill: bg, stroke: c.emptyStroke, "stroke-width": 1, class: "gcell" }));
      const changed = prev && prev[i] !== state[i];
      if (isErr || changed) {
        g.append(svg("polygon", { points: pts, fill: "none", stroke: isErr ? c.bad : c.ring, "stroke-width": isErr ? 3 : 2.5, "stroke-linejoin": "round" }));
      }
      const m = P(x + 0.5, y + 0.5, z);
      g.append(svg("text", { x: m[0], y: m[1] + 6, "text-anchor": "middle", "font-size": 17, class: "gtext", fill: ink, text: v }));
    }
    root.append(g);
  }
  // Axis glyph.
  const o = [W - 44, H - 20];
  const ax = svg("g", { stroke: c.axis, "stroke-width": 1.4, fill: "none" });
  ax.append(svg("line", { x1: o[0], y1: o[1] - 26, x2: o[0] + 22, y2: o[1] - 14 }));
  ax.append(svg("line", { x1: o[0], y1: o[1] - 26, x2: o[0] - 22, y2: o[1] - 14 }));
  ax.append(svg("line", { x1: o[0], y1: o[1] - 26, x2: o[0], y2: o[1] - 52 }));
  root.append(ax);
  root.append(svg("text", { x: o[0] + 28, y: o[1] - 8, class: "gaxis", "font-size": 12, text: "x" }));
  root.append(svg("text", { x: o[0] - 34, y: o[1] - 8, class: "gaxis", "font-size": 12, text: "y" }));
  root.append(svg("text", { x: o[0] + 5, y: o[1] - 54, class: "gaxis", "font-size": 12, text: "z" }));
  return root;
}

function promptNodes(prompt, eventIndex) {
  const frag = document.createDocumentFragment();
  const lines = prompt.split("\n");
  lines.forEach((line, li) => {
    if (HEADERS.test(line)) {
      frag.append(el("span", { class: "h", text: line }));
    } else if (lines[li - 1] === "EVENTS" && line.startsWith("[")) {
      const events = JSON.parse(line);
      frag.append("[");
      events.forEach((e, k) => {
        const text = JSON.stringify(e);
        frag.append(k === eventIndex ? el("mark", { text }) : text);
        if (k < events.length - 1) frag.append(",");
      });
      frag.append("]");
    } else {
      frag.append(line);
    }
    if (li < lines.length - 1) frag.append("\n");
  });
  return frag;
}

export function initTask(data) {
  const root = document.getElementById("task-explorer");
  const tabs = [...root.querySelectorAll("[data-example]")];
  const promptEl = document.getElementById("task-prompt");
  const timeline = document.getElementById("task-timeline");
  const stage = document.getElementById("task-stage");
  const badge = document.getElementById("task-badge");
  const note = document.getElementById("task-note");
  const answer = document.getElementById("task-answer");
  const errorToggle = document.getElementById("task-error");
  const playBtn = document.getElementById("task-play");
  let exIndex = 0, t = 0, timer = null;

  const ex = () => data.examples[exIndex];
  const last = () => ex().states.length - 1;

  function renderTimeline() {
    timeline.replaceChildren();
    const e = ex();
    for (let k = 0; k <= last(); k++) {
      const label = k === 0 ? "Initial" : describe(e.events[k - 1].raw, e.axes);
      const node = el("button", { type: "button", class: "tl-node", "aria-current": String(k === t) }, [
        el("div", { class: "t", text: k === last() ? `W${k} · target` : `W${k}` }),
        el("div", { class: "e", text: label }),
      ]);
      node.addEventListener("click", () => { stop(); go(k); });
      timeline.append(node);
    }
  }

  function render() {
    const e = ex();
    const showError = errorToggle.checked && t === last();
    [...timeline.children].forEach((n, k) => n.setAttribute("aria-current", String(k === t)));
    const pic = e.shape.length === 2 ? render2d(e, t, showError) : render3d(e, t, showError);
    stage.querySelector("svg")?.remove();
    stage.append(pic);
    badge.replaceChildren(
      showError
        ? el("span", { class: "label-tag err", text: "Illustrative error" })
        : el("span", { class: "label-tag ref", text: "Reference execution" }),
    );
    promptEl.replaceChildren(promptNodes(e.prompt, t - 1));
    const markEl = promptEl.querySelector("mark");
    if (markEl) {
      const top = markEl.offsetTop - promptEl.clientHeight / 2;
      promptEl.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
    }
    note.replaceChildren();
    if (showError) {
      const err = e.illustrative_error;
      note.append(
        "Illustrative error at ",
        el("span", { class: "mono", text: `[${err.coordinate.join(",")}]` }),
        `: predicted ${err.predicted}, reference ${err.reference}. ${err.description} Exact match is 0; one of ${e.states[0].length} cells is wrong.`,
      );
    } else if (t === 0) {
      note.append("The initial world W0. ", el("span", { class: "mono", text: "1" }), " is an entity, ", el("span", { class: "mono", text: "2" }), " an obstacle, and ", el("span", { class: "mono", text: "0" }), " empty.");
    } else {
      const ev = e.events[t - 1];
      note.append(`W${t} = W${t - 1} after `, el("span", { class: "mono", text: ev.text }), ". Changed cells are outlined.");
      if (t === last()) note.append(" This final world is the only thing the model returns.");
    }
    answer.textContent = `// reference answer (W${last()})\n${e.answer}`;
  }

  function go(k) {
    t = Math.max(0, Math.min(last(), k));
    render();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = "Play";
  }

  function play() {
    if (timer) return stop();
    if (t === last()) go(0);
    playBtn.textContent = "Pause";
    timer = setInterval(() => {
      if (t >= last()) return stop();
      go(t + 1);
    }, 1300);
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    stop();
    exIndex = Number(tab.dataset.example);
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
    t = 0;
    renderTimeline();
    render();
  }));
  document.getElementById("task-prev").addEventListener("click", () => { stop(); go(t - 1); });
  document.getElementById("task-next").addEventListener("click", () => { stop(); go(t + 1); });
  playBtn.addEventListener("click", play);
  errorToggle.addEventListener("change", () => {
    stop();
    if (errorToggle.checked) go(last());
    else render();
  });
  document.addEventListener("themechange", render);

  renderTimeline();
  render();
}

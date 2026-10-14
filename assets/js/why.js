// Section 01: why the benchmark exists. The figure replays the paper's Figure 1
// 2D history (reference states only): an inserted obstacle shortens a later move.

import { el, onVisible, reducedMotion, svg } from "./util.js";

const COLORS = {
  empty: "#111a2c", emptyLine: "rgba(148,170,205,0.14)",
  entity: "#2bb8db", obstacle: "#40557a",
  fresh: "#e35d9f", path: "#35d0f0",
};

function arrowLabel(raw) {
  if (raw.op === "SET") return `SET [${raw.p.join(",")}] ← ${raw.v}`;
  const dir = raw.axis === 1 ? (raw.direction > 0 ? "right" : "left") : raw.direction > 0 ? "down" : "up";
  return `MOVE ${dir}, max ${raw.k}`;
}

// One 4x4 panel. `mark` adds the annotation for the step that produced this state.
function panel(state, shape, mark) {
  const [R, C] = shape;
  const s = 30, g = 4, pad = 2;
  const W = pad * 2 + C * s, H = pad * 2 + R * s;
  // Decorative: the figcaptions and the caption below the figure carry the content.
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
  const at = (r, c) => [pad + c * s + g / 2, pad + r * s + g / 2];
  state.forEach((v, i) => {
    const r = Math.floor(i / C), c = i % C;
    const [x, y] = at(r, c);
    const isNew = mark?.fresh === i;
    const fill = v === 1 ? COLORS.entity : v === 2 ? (isNew ? COLORS.fresh : COLORS.obstacle) : COLORS.empty;
    root.append(svg("rect", { x, y, width: s - g, height: s - g, rx: 6, fill, stroke: v ? "none" : COLORS.emptyLine }));
  });
  if (mark?.path) {
    // The attempted move: solid to where it stopped, dashed through the blocked step.
    const [[r0, c0], [r1, c1], [rb, cb]] = mark.path;
    const mid = (r, c) => { const [x, y] = at(r, c); return [x + (s - g) / 2, y + (s - g) / 2]; };
    const [x0, y0] = mid(r0, c0), [x1, y1] = mid(r1, c1), [xb, yb] = mid(rb, cb);
    root.append(svg("line", { x1: x0, y1: y0, x2: x1, y2: y1 + 6, stroke: COLORS.path, "stroke-width": 2.2, "stroke-linecap": "round", class: "why-path" }));
    root.append(svg("line", { x1: x1, y1: y1 - 6, x2: xb, y2: yb + 9, stroke: COLORS.path, "stroke-width": 2, "stroke-dasharray": "3 4", opacity: 0.7 }));
    root.append(svg("path", { d: `M${xb - 5} ${yb - 5} L${xb + 5} ${yb + 5} M${xb + 5} ${yb - 5} L${xb - 5} ${yb + 5}`, stroke: "#fff", "stroke-width": 2.2, "stroke-linecap": "round" }));
  }
  return root;
}

export function initWhy(examples) {
  const host = document.getElementById("why-figure");
  if (!host) return;
  const ex = examples.examples.find((e) => e.shape.length === 2);
  const [, C] = ex.shape;
  const idx = (r, c) => r * C + c;
  const setEv = ex.events.find((e) => e.op === "SET");
  const lastMove = ex.events[ex.events.length - 1].raw;

  // Where the last move started, where it stopped, and the cell that blocked it.
  const before = ex.states[ex.states.length - 2], after = ex.states[ex.states.length - 1];
  const from = before.indexOf(1), to = after.indexOf(1);
  const pos = (i) => [Math.floor(i / C), i % C];
  const [fr, fc] = pos(from), [tr, tc] = pos(to);
  const dr = lastMove.axis === 0 ? lastMove.direction : 0, dc = lastMove.axis === 1 ? lastMove.direction : 0;
  const blocked = [tr + dr, tc + dc];

  const steps = ex.states.map((state, t) => {
    const mark = {};
    if (t > 0 && ex.events[t - 1].op === "SET") mark.fresh = idx(...setEv.raw.p);
    if (t === ex.states.length - 1) mark.path = [[fr, fc], [tr, tc], blocked];
    const label = t === 0 ? "Start" : arrowLabel(ex.events[t - 1].raw);
    return el("figure", { class: "why-step" }, [
      el("figcaption", {}, [el("b", { text: `W${t}` }), el("span", { text: label })]),
      panel(state, ex.shape, mark),
    ]);
  });
  host.replaceChildren(...steps);

  if (reducedMotion()) { host.classList.add("is-on"); return; }
  onVisible(host, (on) => { if (on) host.classList.add("is-on"); }, "-15% 0px");
}

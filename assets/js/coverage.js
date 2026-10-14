// Sections 02 and 04: pipeline art, prefix diagram, dimension views, and the design matrix.

import { GridCanvas } from "./grid2d.js";
import { VoxelWorld } from "./voxel.js";
import { applyDiff, cellPalette, el, hideTip, onVisible, reducedMotion, showTip, svg, theme, tipTitle, tipRow } from "./util.js";

function accent() {
  return theme() === "dark" ? "#35d0f0" : "#0a8fb3";
}

function pipelineArt() {
  const dark = theme() === "dark";
  const empty = dark ? "#16213a" : "#e6ecf5";
  const pal = cellPalette([0, 1, 2, 3]);
  const muted = dark ? "#6f7f96" : "#7b8aa0";
  const line = dark ? "rgba(148,170,205,0.25)" : "rgba(30,50,90,0.2)";
  const mini = (cells, x0, y0, s, extra = () => {}) => {
    const g = svg("g");
    cells.forEach((v, i) => {
      const r = Math.floor(i / 5), c = i % 5;
      g.append(svg("rect", { x: x0 + c * s, y: y0 + r * s, width: s - 3, height: s - 3, rx: 3, fill: v ? pal(v) : empty }));
      extra(g, i, x0 + c * s, y0 + r * s);
    });
    return g;
  };
  const world = [0, 1, 0, 0, 2, 0, 1, 1, 0, 0, 3, 0, 0, 2, 0, 0, 0, 2, 2, 0, 1, 0, 0, 0, 3];
  const arts = {
    world: () => svg("svg", { viewBox: "0 0 100 92" }, [mini(world, 4, 0, 18.4)]),
    events: () => {
      const s = svg("svg", { viewBox: "0 0 150 92" });
      const rows = [["MOVE", "(v=1, axis=1, …)"], ["SET", "(p=[1,1], v=2)"], ["MOVE", "(v=1, axis=0, …)"], ["…", ""]];
      rows.forEach(([op, rest], i) => {
        const y = 4 + i * 22;
        s.append(svg("rect", { x: 0, y, width: 150, height: 17, rx: 5, fill: empty }));
        s.append(svg("text", { x: 7, y: y + 12.5, "font-size": 10, "font-family": "JetBrains Mono, monospace", "font-weight": 600, fill: accent(), text: op }));
        s.append(svg("text", { x: 7 + op.length * 6.4 + 2, y: y + 12.5, "font-size": 10, "font-family": "JetBrains Mono, monospace", fill: muted, text: rest }));
      });
      return s;
    },
    model: () => {
      const s = svg("svg", { viewBox: "0 0 160 92" });
      s.append(svg("rect", { x: 1, y: 1, width: 158, height: 90, rx: 10, fill: "none", stroke: line }));
      s.append(svg("text", { x: 12, y: 24, "font-size": 10.5, "font-family": "JetBrains Mono, monospace", fill: muted, text: "{\"cells\":[" }));
      s.append(svg("text", { x: 22, y: 42, "font-size": 10.5, "font-family": "JetBrains Mono, monospace", fill: accent(), text: "[[0,2],2]," }));
      s.append(svg("text", { x: 22, y: 58, "font-size": 10.5, "font-family": "JetBrains Mono, monospace", fill: accent(), text: "[[2,1],1], …" }));
      s.append(svg("text", { x: 12, y: 76, "font-size": 10.5, "font-family": "JetBrains Mono, monospace", fill: muted, text: "]}" }));
      return s;
    },
    score: () => {
      const good = dark ? "#34c88a" : "#128a5a";
      const bad = dark ? "#f06a7a" : "#c8334a";
      const s = svg("svg", { viewBox: "0 0 100 92" });
      s.append(mini(world, 4, 0, 18.4, (g, i, x, y) => {
        if (i === 12) g.append(svg("rect", { x: x - 1, y: y - 1, width: 17.4, height: 17.4, rx: 4, fill: "none", stroke: bad, "stroke-width": 2 }));
        else g.append(svg("circle", { cx: x + 7.7, cy: y + 7.7, r: 1.7, fill: good, opacity: 0.9 }));
      }));
      return s;
    },
  };
  document.querySelectorAll("[data-art]").forEach((node) => node.replaceChildren(arts[node.dataset.art]()));
}

function prefixDiagram() {
  const root = document.getElementById("prefix-svg");
  root.replaceChildren();
  const left = 58, right = 620, W = right - left;
  const x = (t) => left + (t / 64) * W;
  const a = accent();
  const muted = theme() === "dark" ? "#6f7f96" : "#7b8aa0";
  const track = theme() === "dark" ? "rgba(148,170,205,0.18)" : "rgba(30,50,90,0.14)";
  // Event ticks.
  for (let t = 1; t <= 64; t++) {
    root.append(svg("rect", { x: x(t) - 3.2, y: 10, width: 4.6, height: 14, rx: 1.5, fill: track }));
  }
  root.append(svg("text", { x: 0, y: 22, class: "gaxis", "font-size": 11, text: "events" }));
  const cuts = [0, 1, 8, 16, 32, 64];
  cuts.forEach((t, k) => {
    const y = 42 + k * 18;
    root.append(svg("text", { x: 0, y: y + 4, class: "gaxis", "font-size": 11, text: `T=${t}` }));
    root.append(svg("line", { x1: left, y1: y, x2: right, y2: y, stroke: track, "stroke-width": 1 }));
    if (t > 0) root.append(svg("rect", { x: left, y: y - 3, width: x(t) - left, height: 6, rx: 3, fill: a, opacity: 0.35 + k * 0.1 }));
    root.append(svg("circle", { cx: x(t), cy: y, r: 4.5, fill: a, stroke: theme() === "dark" ? "#0d1424" : "#ffffff", "stroke-width": 2 }));
    root.append(svg("line", { x1: x(t), y1: 26, x2: x(t), y2: y - 5, stroke: a, "stroke-width": 1, opacity: 0.35 }));
  });
  root.append(svg("text", { x: right, y: 42 + 6 * 18 + 10, "text-anchor": "end", "font-size": 11, fill: muted, text: "each row = one request with its own reference final state" }));
}

function matrix(families) {
  const m = document.getElementById("matrix");
  m.replaceChildren(el("span"), ...families.map((f) => el("span", { class: "mh", text: f.op })));
  for (const d of [2, 3, 4]) {
    m.append(el("span", { class: "mr", text: `d = ${d}` }));
    for (const f of families) {
      const cell = el("div", { class: "mcell", tabindex: "0", "aria-label": `${f.op}, d=${d}: 8 trajectories by 6 prefixes, 48 instances` });
      for (let i = 0; i < 48; i++) cell.append(el("i"));
      const show = (e) => {
        const r = cell.getBoundingClientRect();
        showTip(e.clientX ?? r.right, e.clientY ?? r.top, [tipTitle(`${f.op} · d = ${d}`), tipRow(null, "trajectories", "8"), tipRow(null, "prefixes each", "6"), tipRow(null, "instances", "48")]);
      };
      cell.addEventListener("pointermove", show);
      cell.addEventListener("focus", show);
      cell.addEventListener("pointerleave", hideTip);
      cell.addEventListener("blur", hideTip);
      m.append(cell);
    }
  }
}

function dims(families, hero, tesseract) {
  // 2D: a RELABEL world from the operations section.
  const relabel = families.find((f) => f.id === "component_relabel").trajectory;
  const g2 = new GridCanvas(document.getElementById("dim-2d"), { pad: 14 });
  g2.setWorld(relabel.shape, relabel.values, relabel.initial);

  // 3D: the same family's 3D world, slowly rotating.
  const w3 = hero.worlds.find((w) => w.family === "component_relabel");
  const v3 = new VoxelWorld(document.getElementById("dim-3d"), { autoRotate: 0.22, yaw: 0.4 });
  v3.setWorld(w3.shape, w3.values, w3.initial, { stagger: false });

  // 4D: 16 slices of a 4x4x4x4 RELABEL world, stepping through its history.
  const g4 = new GridCanvas(document.getElementById("dim-4d"), { pad: 14 });
  g4.setWorld(tesseract.shape, tesseract.values, tesseract.initial);
  let s4 = tesseract.initial.slice(), t4 = 0, timer = null;
  const tick4 = () => {
    if (t4 >= tesseract.steps.length) {
      t4 = 0; s4 = tesseract.initial.slice(); g4.setState(s4); return;
    }
    const step = tesseract.steps[t4++];
    s4 = applyDiff(s4, step.diff);
    g4.setState(s4, new Set(step.diff.map(([i]) => i)));
  };
  const box = document.querySelector(".dims");
  onVisible(box, (on) => {
    clearInterval(timer);
    if (on) {
      v3.start();
      if (!reducedMotion()) timer = setInterval(tick4, 1200);
    } else {
      v3.stop();
    }
  }, "0px");
  document.addEventListener("themechange", () => { g2.refreshPalette(); g4.refreshPalette(); v3.refreshPalette(); });
}

export function initCoverage({ families, hero, tesseract, results }) {
  pipelineArt();
  prefixDiagram();
  matrix(results.families);
  dims(families.families, hero, tesseract);
  document.addEventListener("themechange", () => { pipelineArt(); prefixDiagram(); });
}

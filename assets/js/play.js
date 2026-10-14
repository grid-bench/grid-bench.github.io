// Section 05: the reader predicts the final grid; the exported reference checks every cell.

import { cellPalette, el, inkOn, svg, theme } from "./util.js";

const STORE = "gb-solved";

function loadSolved() {
  try { return new Set(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch { return new Set(); }
}
function saveSolved(set) {
  try { localStorage.setItem(STORE, JSON.stringify([...set])); } catch { /* storage unavailable */ }
}

export function initPlay(data) {
  const pick = document.getElementById("play-pick");
  const ruleEl = document.getElementById("play-rule");
  const eventsEl = document.getElementById("play-events");
  const paletteEl = document.getElementById("play-palette");
  const boardEl = document.getElementById("play-board");
  const verdict = document.getElementById("play-verdict");
  const modeTag = document.getElementById("board-mode");
  const mini = document.getElementById("play-mini");
  const solved = loadSolved();

  let puzzle = null;
  let guess = [];
  let brush = 1;
  let replay = null; // {t, timer}
  const drafts = new Map();

  function cellsView(vec, { wrong = null, editable = false, changed = null } = {}) {
    const [R, C] = puzzle.shape;
    const size = 60, gap = 6, left = 26, top = 4;
    const W = left + C * size + 2, H = top + R * size + 24;
    const pal = cellPalette(puzzle.values);
    const dark = theme() === "dark";
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: editable ? "grid" : "img", "aria-label": editable ? "Your predicted grid" : "Reference grid" });
    for (let r = 0; r < R; r++) root.append(svg("text", { x: 10, y: top + r * size + size / 2 + 4, class: "gaxis", "font-size": 12, "text-anchor": "middle", text: r }));
    for (let c = 0; c < C; c++) root.append(svg("text", { x: left + c * size + size / 2, y: H - 6, class: "gaxis", "font-size": 12, "text-anchor": "middle", text: c }));
    vec.forEach((v, i) => {
      const r = Math.floor(i / C), c = i % C;
      const x = left + c * size + gap / 2, y = top + r * size + gap / 2, s = size - gap;
      const color = pal(v);
      const g = svg("g", editable ? { class: "board-cell", "data-i": i, tabindex: "0", role: "gridcell", "aria-label": `[${r},${c}] = ${v}` } : {});
      g.append(svg("rect", { x, y, width: s, height: s, rx: 8, fill: color, stroke: v === 0 ? (dark ? "rgba(148,170,205,0.16)" : "rgba(30,50,90,0.12)") : "none", class: "gcell" }));
      g.append(svg("text", { x: x + s / 2, y: y + s / 2 + 7, "text-anchor": "middle", "font-size": 20, class: "gtext", fill: v === 0 ? (dark ? "#4c5b72" : "#9aa8bb") : inkOn(color), text: v }));
      if (wrong && wrong.has(i)) {
        g.append(svg("rect", { x: x - 2, y: y - 2, width: s + 4, height: s + 4, rx: 10, fill: "none", stroke: dark ? "#f06a7a" : "#c8334a", "stroke-width": 3 }));
      } else if (changed && changed.has(i)) {
        g.append(svg("rect", { x: x - 2, y: y - 2, width: s + 4, height: s + 4, rx: 10, fill: "none", stroke: dark ? "#7fe6ff" : "#0a8fb3", "stroke-width": 2.5 }));
      }
      root.append(g);
    });
    return root;
  }

  function drawBoard(opts = {}) {
    // The reader's grid is editable; reference replays (opts.vec) are not.
    boardEl.replaceChildren(cellsView(opts.vec || guess, { editable: !opts.vec, ...opts }));
  }

  function renderPalette() {
    paletteEl.replaceChildren();
    const pal = cellPalette(puzzle.values);
    for (const v of puzzle.values) {
      const color = pal(v);
      const b = el("button", { type: "button", class: "swatch", "aria-pressed": String(v === brush), "aria-label": `Paint value ${v}`, style: `background:${color};color:${v === 0 ? "var(--muted)" : inkOn(color)}` }, [String(v)]);
      b.addEventListener("click", () => { brush = v; renderPalette(); });
      paletteEl.append(b);
    }
  }

  function setEventsHighlight(k) {
    [...eventsEl.children].forEach((li, i) => li.classList.toggle("is-on", i === k));
  }

  function stopReplay() {
    if (!replay) return;
    clearInterval(replay.timer);
    replay = null;
    setEventsHighlight(-1);
    modeTag.textContent = "Your prediction";
    modeTag.className = "label-tag";
  }

  function load(p) {
    stopReplay();
    if (puzzle) drafts.set(puzzle.id, guess);
    puzzle = p;
    guess = drafts.get(p.id) || p.states[0].slice();
    brush = p.values.find((v) => v !== 0) ?? 0;
    [...pick.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === p.id)));
    ruleEl.textContent = p.rule;
    eventsEl.replaceChildren(...p.events.map((e) => el("li", { text: e })));
    renderPalette();
    drawBoard();
    verdict.replaceChildren("Select a value, then click or drag across cells to edit the grid.");
    mini.textContent = `${p.shape.join(" × ")} world · values ${p.values.join(", ")} · ${p.events.length} events`;
  }

  function paint(i) {
    if (replay || i == null) return;
    if (guess[i] === brush) return;
    guess = guess.slice();
    guess[i] = brush;
    drawBoard();
  }

  let painting = false;
  boardEl.addEventListener("pointerdown", (e) => {
    const g = e.target.closest(".board-cell");
    if (!g) return;
    painting = true;
    boardEl.setPointerCapture?.(e.pointerId);
    paint(Number(g.dataset.i));
  });
  boardEl.addEventListener("pointermove", (e) => {
    if (!painting) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".board-cell");
    if (target) paint(Number(target.dataset.i));
  });
  window.addEventListener("pointerup", () => { painting = false; });
  boardEl.addEventListener("keydown", (e) => {
    const g = e.target.closest(".board-cell");
    if (!g || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    const i = Number(g.dataset.i);
    paint(i);
    boardEl.querySelector(`[data-i="${i}"]`)?.focus();
  });

  document.getElementById("play-check").addEventListener("click", () => {
    stopReplay();
    const target = puzzle.states[puzzle.states.length - 1];
    const wrong = new Set(guess.map((v, i) => (v !== target[i] ? i : -1)).filter((i) => i >= 0));
    drawBoard({ wrong });
    const total = guess.length;
    if (wrong.size === 0) {
      solved.add(puzzle.id);
      saveSolved(solved);
      pick.querySelector(`[data-id="${puzzle.id}"]`)?.classList.add("solved");
      verdict.replaceChildren(el("b", { class: "ok", text: "Exact match." }), ` All ${total} cells equal the reference.`);
    } else {
      const ca = ((total - wrong.size) / total) * 100;
      verdict.replaceChildren(
        el("b", { class: "no", text: "Not exact." }),
        ` ${wrong.size} of ${total} cells wrong · cell accuracy ${ca.toFixed(0)}%. Wrong cells are outlined.`,
      );
    }
  });

  document.getElementById("play-reset").addEventListener("click", () => {
    stopReplay();
    guess = puzzle.states[0].slice();
    drawBoard();
    verdict.replaceChildren("Reset to the initial world.");
  });

  document.getElementById("play-reveal").addEventListener("click", () => {
    if (replay) return stopReplay(), drawBoard();
    modeTag.textContent = "Reference execution";
    modeTag.className = "label-tag ref";
    replay = { t: 0 };
    const show = () => {
      const t = replay.t;
      const prev = t > 0 ? puzzle.states[t - 1] : null;
      const changed = prev ? new Set(puzzle.states[t].map((v, i) => (v !== prev[i] ? i : -1)).filter((i) => i >= 0)) : null;
      drawBoard({ vec: puzzle.states[t], changed });
      setEventsHighlight(t - 1);
      verdict.replaceChildren(t === 0 ? "Reference: initial world." : `Reference after event ${t}: ${puzzle.events[t - 1]}`);
    };
    show();
    replay.timer = setInterval(() => {
      if (replay.t >= puzzle.states.length - 1) {
        const keep = replay;
        clearInterval(keep.timer);
        setTimeout(() => {
          if (replay !== keep) return;
          stopReplay();
          drawBoard();
          verdict.replaceChildren("Replay finished. Back to your prediction.");
        }, 1800);
        return;
      }
      replay.t += 1;
      show();
    }, 1400);
  });

  for (const p of data.puzzles) {
    const b = el("button", { type: "button", "data-id": p.id, "aria-pressed": "false", class: solved.has(p.id) ? "solved" : "" }, [p.op, el("small", { text: p.level })]);
    b.addEventListener("click", () => load(p));
    pick.append(b);
  }
  document.addEventListener("themechange", () => { renderPalette(); drawBoard(); });
  load(data.puzzles[0]);
}

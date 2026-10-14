// Section 05: the reader paints the final grid of a small practice world,
// then checks it cell by cell against the exported reference states.

import { cellPalette, el, inkOn, onVisible, reducedMotion, svg } from "./util.js";

const STORE = "gb-solved";

// One-line operation descriptions from the public README.
const DESC = {
  PAINT: "Replace a selected value inside a Manhattan ball.",
  REFLECT: "Reflect values within a rectangular region.",
  STENCIL: "Aggregate neighboring values in a metric region.",
  MIX: "Aggregate values in an occupied, connected neighborhood.",
  RELABEL: "Change the label of a connected component.",
  LAYER: "Grow or erode a connected region.",
  MOVE: "Move selected values along an axis around obstructions.",
  COMPRESS: "Pack and merge equal values along axis-aligned lines.",
};
// Exact lines from the formal prompt, appended to the rule when the puzzle uses them.
const SET_RULE = "SET(p,v): set cell p to v.";
const W_RULE = "W(x) denotes the value of cell x immediately before the current event.";
const HINT = window.matchMedia("(pointer: coarse)").matches
  ? "Pick a value, then tap cells to paint."
  : "Pick a value, then click or drag across cells to paint.";
// A touch or pen press that moves farther than this (CSS px) is a scroll, not a tap.
const TAP_SLOP = 10;

// Board geometry in SVG units.
const SIZE = 64, GAP = 7, RX = 14, AXIS_L = 24, AXIS_B = 24;
const ZERO_INK = "#5b6a82";
const ZERO_LINE = "rgba(148, 170, 205, 0.16)";
const MINI_ZERO = "#222c44";
const STEP_MS = 1500;

const ICON = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  play: '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  back: '<path d="M10 6l-6 6 6 6"/><path d="M4.5 12H20"/>',
};

function icon(paths, cls = "") {
  const node = svg("svg", {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2.4,
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: cls,
  });
  node.innerHTML = paths;
  return node;
}

function loadSolved() {
  try { return new Set(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch { return new Set(); }
}
function saveSolved(set) {
  try { localStorage.setItem(STORE, JSON.stringify([...set])); } catch { /* storage unavailable */ }
}

export function initPlay(data) {
  const $ = (id) => document.getElementById(id);
  const app = $("play-app");
  const pick = $("play-pick");
  const progress = $("play-progress");
  const opEl = $("play-op");
  const descEl = $("play-desc");
  const ruleBox = $("play-rule-box");
  const ruleEl = $("play-rule");
  const eventsEl = $("play-events");
  const paletteEl = $("play-palette");
  const stage = $("play-stage");
  const boardEl = $("play-board");
  const verdict = $("play-verdict");
  const modeTag = $("board-mode");
  const replayBtn = $("play-reveal");
  const replayIcon = $("play-reveal-icon");
  const replayLabel = replayBtn.querySelector(".btn-label");

  const puzzles = data.puzzles;
  const solved = loadSolved();
  const drafts = new Map();

  let puzzle = null;
  let pal = null;
  let guess = [];
  let brush = 1;
  let cells = [];
  let focusIndex = 0;
  let replay = null; // { t, timer, end }
  let visible = true;
  let painting = false;
  let waveTimer = 0;

  // ---------- Board ----------

  function buildBoard() {
    const [R, C] = puzzle.shape;
    const W = AXIS_L + C * SIZE, H = R * SIZE + AXIS_B;
    const root = svg("svg", {
      viewBox: `0 0 ${W} ${H}`, role: "grid", "aria-label": `Your predicted grid, ${R} rows by ${C} columns`, "aria-describedby": "play-keys",
    });
    const grad = svg("linearGradient", { id: "play-win", gradientUnits: "userSpaceOnUse", x1: AXIS_L, y1: 0, x2: W, y2: R * SIZE });
    [["0", "#35d0f0"], ["0.52", "#8b7cf6"], ["1", "#e35d9f"]].forEach(([offset, color]) => grad.append(svg("stop", { offset, "stop-color": color })));
    root.append(svg("defs", {}, [grad]));
    for (let r = 0; r < R; r++) {
      root.append(svg("text", { x: AXIS_L / 2 - 3, y: r * SIZE + SIZE / 2 + 4, class: "gaxis", "font-size": 13, "text-anchor": "middle", "aria-hidden": "true", text: r }));
    }
    for (let c = 0; c < C; c++) {
      root.append(svg("text", { x: AXIS_L + c * SIZE + SIZE / 2, y: H - 5, class: "gaxis", "font-size": 13, "text-anchor": "middle", "aria-hidden": "true", text: c }));
    }
    cells = [];
    for (let r = 0; r < R; r++) {
      const row = svg("g", { role: "row" });
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const x = AXIS_L + c * SIZE + GAP / 2, y = r * SIZE + GAP / 2, s = SIZE - GAP;
        const g = svg("g", { class: "board-cell", role: "gridcell", "data-i": i, tabindex: i === focusIndex ? "0" : "-1", style: `--d:${(r + c) * 55}ms` });
        const rect = svg("rect", { x, y, width: s, height: s, rx: RX, class: "gcell" });
        const flash = svg("rect", { x, y, width: s, height: s, rx: RX, class: "cell-flash", fill: "url(#play-win)" });
        const text = svg("text", { x: x + s / 2, y: y + s / 2 + 7, "text-anchor": "middle", "font-size": 20, class: "gtext" });
        const ring = svg("rect", { x: x - 2.5, y: y - 2.5, width: s + 5, height: s + 5, rx: RX + 2.5, class: "cell-ring" });
        g.append(rect, flash, text, ring);
        row.append(g);
        cells.push({ g, rect, text, r, c });
      }
      root.append(row);
    }
    boardEl.replaceChildren(root);
    stage.style.setProperty("--cols", C);
  }

  function setCell(i, v) {
    const { g, rect, text, r, c } = cells[i];
    const fill = pal(v);
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", v === 0 ? ZERO_LINE : "none");
    text.textContent = v;
    text.setAttribute("fill", v === 0 ? ZERO_INK : inkOn(fill));
    g.setAttribute("aria-label", `Row ${r}, column ${c}: ${v}`);
  }

  function show(vec, { wrong = null, changed = null } = {}) {
    vec.forEach((v, i) => {
      setCell(i, v);
      cells[i].g.classList.toggle("is-wrong", Boolean(wrong && wrong.has(i)));
      cells[i].g.classList.toggle("is-changed", Boolean(changed && changed.has(i)));
    });
  }

  function setMode(ref, label) {
    boardEl.classList.toggle("is-ref", ref);
    boardEl.firstElementChild?.setAttribute("aria-readonly", String(ref));
    modeTag.className = ref ? "label-tag ref" : "label-tag";
    modeTag.textContent = label;
  }

  function clearWin() {
    stage.classList.remove("is-win");
    boardEl.classList.remove("is-wave");
    clearTimeout(waveTimer);
  }

  // Exact match: the cells light up in a diagonal wave and a gradient ring settles around the board.
  function celebrate() {
    stage.classList.add("is-win");
    if (reducedMotion()) return;
    boardEl.classList.remove("is-wave");
    void boardEl.getBoundingClientRect();
    boardEl.classList.add("is-wave");
    clearTimeout(waveTimer);
    const [R, C] = puzzle.shape;
    waveTimer = setTimeout(() => boardEl.classList.remove("is-wave"), (R + C) * 55 + 1100);
  }

  function paint(i, v = brush) {
    if (replay || !(i >= 0) || i >= guess.length || guess[i] === v) return;
    cells[i].g.classList.remove("is-wrong");
    guess[i] = v;
    setCell(i, v);
    clearWin();
  }

  function focusCell(i) {
    cells[focusIndex]?.g.setAttribute("tabindex", "-1");
    focusIndex = i;
    cells[i].g.setAttribute("tabindex", "0");
    cells[i].g.focus();
  }

  // ---------- Palette, timeline, picker ----------

  function setBrush(v) {
    brush = v;
    for (const b of paletteEl.querySelectorAll(".swatch")) b.setAttribute("aria-pressed", String(Number(b.dataset.v) === v));
  }

  function renderPalette() {
    const swatches = puzzle.values.map((v) => {
      const color = pal(v);
      const b = el("button", {
        type: "button", class: "swatch", "data-v": v, "aria-pressed": "false", "aria-label": `Paint value ${v}`,
        style: `background:${color};color:${v === 0 ? "var(--text-2)" : inkOn(color)};--c:${v === 0 ? "#a9b5c9" : color}`,
      }, [String(v)]);
      b.addEventListener("click", () => setBrush(v));
      return b;
    });
    paletteEl.replaceChildren(el("span", { class: "palette-label", "aria-hidden": "true", text: "Paint with" }), ...swatches);
    setBrush(brush);
  }

  function miniGrid(vec) {
    const [R, C] = puzzle.shape;
    const s = 10, g = 1.6;
    const root = svg("svg", { viewBox: `0 0 ${C * s} ${R * s}`, class: "pev-mini", "aria-hidden": "true" });
    vec.forEach((v, i) => root.append(svg("rect", {
      x: (i % C) * s + g / 2, y: Math.floor(i / C) * s + g / 2, width: s - g, height: s - g, rx: 2.4, fill: v === 0 ? MINI_ZERO : pal(v),
    })));
    return root;
  }

  function renderTimeline() {
    const items = [
      el("li", { class: "pev pev-start" }, [
        miniGrid(puzzle.states[0]),
        el("span", { class: "pev-t" }, [el("b", { text: "Start" }), `${puzzle.shape.join(" × ")} world`]),
      ]),
      ...puzzle.events.map((e, k) => el("li", { class: "pev", title: e.startsWith("SET(") ? SET_RULE : null }, [
        el("span", { class: "pev-n", "aria-hidden": "true", text: k + 1 }),
        el("code", { text: e }),
      ])),
    ];
    eventsEl.replaceChildren(...items);
  }

  // t = 0 is the start world; t = k is the state after event k.
  function highlight(t) {
    [...eventsEl.children].forEach((li, k) => {
      li.classList.toggle("is-on", k === t);
      li.classList.toggle("is-done", t >= 0 && k < t);
    });
  }

  function updateProgress() {
    const n = puzzles.filter((p) => solved.has(p.id)).length;
    const N = puzzles.length;
    const circ = 2 * Math.PI * 9;
    const ring = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [
      svg("defs", {}, [svg("linearGradient", { id: "play-ring", x1: "0", y1: "0", x2: "1", y2: "1" }, [
        svg("stop", { offset: "0", "stop-color": "#35d0f0" }),
        svg("stop", { offset: "0.55", "stop-color": "#8b7cf6" }),
        svg("stop", { offset: "1", "stop-color": "#e35d9f" }),
      ])]),
      svg("circle", { cx: 12, cy: 12, r: 9, class: "trk" }),
      svg("circle", { cx: 12, cy: 12, r: 9, class: "val", "stroke-dasharray": `${((n / N) * circ).toFixed(2)} ${circ.toFixed(2)}`, opacity: n ? 1 : 0 }),
    ]);
    progress.replaceChildren(ring, el("span", { text: n === N ? `All ${N} solved` : `${n} of ${N} solved` }));
  }

  function updatePick() {
    for (const b of pick.children) {
      const p = puzzles.find((q) => q.id === b.dataset.id);
      const done = solved.has(p.id);
      b.classList.toggle("is-solved", done);
      b.setAttribute("aria-pressed", String(p === puzzle));
      b.setAttribute("aria-label", `${p.op}, ${p.level}${done ? ", solved" : ""}`);
    }
  }

  // ---------- Reference replay ----------

  function setReplayButton(state) {
    const [paths, label] = state === "run" ? [ICON.stop, "Stop replay"] : state === "end" ? [ICON.back, "Back to my grid"] : [ICON.play, "Replay the reference"];
    replayIcon.innerHTML = paths;
    replayLabel.textContent = label;
  }

  function showRef() {
    const t = replay.t, T = puzzle.events.length;
    const cur = puzzle.states[t];
    const prev = t > 0 ? puzzle.states[t - 1] : null;
    const changed = prev ? new Set(cur.flatMap((v, i) => (v !== prev[i] ? [i] : []))) : null;
    show(cur, { changed });
    highlight(t);
    modeTag.textContent = t === 0 ? "Reference · start" : `Reference · event ${t} of ${T}`;
    if (t === 0) {
      verdict.replaceChildren("The reference starts from the same world.");
    } else {
      const n = changed.size;
      const what = n === 0 ? "no cells" : `${n} cell${n === 1 ? "" : "s"}`;
      verdict.replaceChildren(t === T ? `Final reference grid. Event ${t} changed ${what}.` : `Event ${t} changed ${what}.`);
    }
  }

  function schedule() {
    if (!replay) return;
    clearTimeout(replay.timer);
    if (replay.end || !visible || document.hidden) return;
    replay.timer = setTimeout(() => {
      if (!replay) return;
      replay.t += 1;
      showRef();
      if (replay.t >= puzzle.states.length - 1) {
        replay.end = true;
        setReplayButton("end");
        return;
      }
      schedule();
    }, replay.t === 0 ? 1100 : STEP_MS);
  }

  function startReplay() {
    clearWin();
    replay = { t: 0, timer: 0, end: false };
    setMode(true, "Reference · start");
    setReplayButton("run");
    showRef();
    schedule();
  }

  function stopReplay(restore = true) {
    if (!replay) return;
    clearTimeout(replay.timer);
    replay = null;
    highlight(-1);
    setReplayButton("idle");
    setMode(false, "Your prediction");
    if (restore) {
      show(guess);
      verdict.replaceChildren("Back to your grid.");
    }
  }

  // ---------- Puzzle lifecycle ----------

  function load(p) {
    stopReplay(false);
    if (puzzle) drafts.set(puzzle.id, guess);
    puzzle = p;
    pal = cellPalette(p.values);
    guess = (drafts.get(p.id) || p.states[0]).slice();
    brush = p.values.find((v) => v !== 0) ?? 0;
    focusIndex = 0;
    opEl.textContent = p.op;
    descEl.textContent = DESC[p.op] || "";
    const extra = [];
    if (p.rule.includes("W(")) extra.push(W_RULE);
    if (p.events.some((e) => e.startsWith("SET("))) extra.push(SET_RULE);
    ruleEl.textContent = [p.rule, ...extra].join("\n\n");
    ruleBox.open = false;
    updatePick();
    renderTimeline();
    renderPalette();
    buildBoard();
    show(guess);
    clearWin();
    setMode(false, "Your prediction");
    verdict.replaceChildren(HINT);
  }

  function check() {
    stopReplay(false);
    const target = puzzle.states[puzzle.states.length - 1];
    const wrong = new Set(guess.flatMap((v, i) => (v !== target[i] ? [i] : [])));
    show(guess, { wrong });
    const N = guess.length;
    if (wrong.size === 0) {
      solved.add(puzzle.id);
      saveSolved(solved);
      updatePick();
      updateProgress();
      verdict.replaceChildren(
        el("span", { class: "v-ok", "aria-hidden": "true" }, [icon(ICON.check)]),
        el("b", { class: "ok", text: "Exact match." }),
        ` All ${N} cells equal the reference.`,
      );
      celebrate();
    } else {
      clearWin();
      const acc = Math.round(((N - wrong.size) / N) * 100);
      verdict.replaceChildren(
        el("b", { class: "no", text: "Not exact." }),
        ` ${wrong.size} of ${N} cells wrong · cell accuracy ${acc}%`,
      );
    }
  }

  // ---------- Input ----------

  // Board slot under a client point (gaps count toward the nearest slot), or -1.
  function cellAt(x, y) {
    const box = boardEl.firstElementChild.getBoundingClientRect();
    const [R, C] = puzzle.shape;
    const k = box.width / (AXIS_L + C * SIZE);
    const c = Math.floor(((x - box.left) / k - AXIS_L) / SIZE);
    const r = Math.floor((y - box.top) / k / SIZE);
    return r >= 0 && r < R && c >= 0 && c < C ? r * C + c : -1;
  }

  // Paint every slot along the segment from the last pointer sample, so fast drags do not skip cells.
  let last = null;
  function strokeTo(x, y) {
    const [x0, y0] = last || [x, y];
    const k = boardEl.firstElementChild.getBoundingClientRect().width / (AXIS_L + puzzle.shape[1] * SIZE);
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / ((SIZE * k) / 3)));
    for (let s = 1; s <= n; s++) {
      const i = cellAt(x0 + ((x - x0) * s) / n, y0 + ((y - y0) * s) / n);
      if (i >= 0) paint(i);
    }
    last = [x, y];
  }

  // A mouse paints on press and drags across cells. Touch and pen paint on a tap only, so a swipe
  // that starts on the board scrolls the page (touch-action: manipulation) and leaves the grid alone.
  let tap = null; // { id, x, y, i }
  boardEl.addEventListener("pointerdown", (e) => {
    const g = e.target.closest(".board-cell");
    if (!g || replay) return;
    if (e.pointerType !== "mouse") {
      tap = { id: e.pointerId, x: e.clientX, y: e.clientY, i: Number(g.dataset.i) };
      return;
    }
    if (e.button !== 0) return;
    painting = true;
    last = [e.clientX, e.clientY];
    boardEl.setPointerCapture?.(e.pointerId);
    paint(Number(g.dataset.i));
  });
  boardEl.addEventListener("pointermove", (e) => {
    if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) tap = null;
    if (!painting) return;
    const samples = e.getCoalescedEvents?.() || [];
    for (const ev of samples.length ? samples : [e]) strokeTo(ev.clientX, ev.clientY);
  });
  const endPaint = () => { painting = false; last = null; };
  boardEl.addEventListener("pointerup", (e) => {
    if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP) paint(tap.i);
    tap = null;
    endPaint();
  });
  boardEl.addEventListener("pointercancel", () => { tap = null; endPaint(); });
  window.addEventListener("pointerup", endPaint);

  // Roving tab stop: one cell is tabbable; arrows move it.
  boardEl.addEventListener("focusin", (e) => {
    const g = e.target.closest?.(".board-cell");
    if (!g) return;
    const i = Number(g.dataset.i);
    if (i !== focusIndex) {
      cells[focusIndex]?.g.setAttribute("tabindex", "-1");
      focusIndex = i;
      g.setAttribute("tabindex", "0");
    }
  });
  boardEl.addEventListener("keydown", (e) => {
    const g = e.target.closest?.(".board-cell");
    if (!g) return;
    const i = Number(g.dataset.i);
    const [R, C] = puzzle.shape;
    let r = Math.floor(i / C), c = i % C;
    switch (e.key) {
      case "ArrowUp": r = Math.max(0, r - 1); break;
      case "ArrowDown": r = Math.min(R - 1, r + 1); break;
      case "ArrowLeft": c = Math.max(0, c - 1); break;
      case "ArrowRight": c = Math.min(C - 1, c + 1); break;
      case "Home": c = 0; break;
      case "End": c = C - 1; break;
      case "Enter":
      case " ":
        e.preventDefault();
        paint(i);
        return;
      default:
        if (/^\d$/.test(e.key) && puzzle.values.includes(Number(e.key))) {
          e.preventDefault();
          setBrush(Number(e.key));
          paint(i);
        }
        return;
    }
    e.preventDefault();
    focusCell(r * C + c);
  });

  $("play-check").addEventListener("click", check);
  $("play-reset").addEventListener("click", () => {
    stopReplay(false);
    guess = puzzle.states[0].slice();
    show(guess);
    clearWin();
    verdict.replaceChildren("Reset to the start world.");
  });
  replayBtn.addEventListener("click", () => (replay ? stopReplay() : startReplay()));

  // The replay only advances while the card is on screen and the tab is visible.
  onVisible(app, (on) => { visible = on; schedule(); }, "0px");
  document.addEventListener("visibilitychange", schedule);

  for (const p of puzzles) {
    const b = el("button", { type: "button", class: "pz", "data-id": p.id, "aria-pressed": "false" }, [
      el("span", { class: "pz-op", text: p.op }),
      el("span", { class: "pz-lvl", text: p.level }),
      el("span", { class: "pz-ok", "aria-hidden": "true" }, [icon(ICON.check)]),
    ]);
    b.addEventListener("click", () => { if (p !== puzzle) load(p); });
    pick.append(b);
  }
  updateProgress();
  load(puzzles[0]);
}

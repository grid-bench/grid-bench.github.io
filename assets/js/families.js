// Section 03: eight operation cards. Each card replays a real benchmark trajectory,
// either the 2D 16x16 world (GridCanvas) or the 3D 6x6x7 world (VoxelWorld). A dialog
// holds the worked example and the exact rule text. Every state comes from exported
// reference execution; nothing here re-implements a transition rule.

import { GridCanvas } from "./grid2d.js";
import { VoxelWorld } from "./voxel.js";
import {
  applyDiff, cellPalette, coordOf, el, hideTip, inkOn, onVisible, reducedMotion,
  showTip, svg, tilt, tipRow, tipSub, tipTitle,
} from "./util.js";
import { OP_ONE_LINER, SET_RULE, W_RULE } from "./optext.js";

// One hue per family, walking the site gradient from cyan through violet to magenta.
const ACCENT = ["#35d0f0", "#45c3ff", "#6bb0ff", "#8f9fff", "#ad92ff", "#cc88ee", "#e481d0", "#f27aa8"];

// Spatial selection and state transformation, as in the paper's family table.
const TABLE = {
  metric_paint: ["Cells with a specified source value inside a Manhattan ball.", "Simultaneously replace the source value with a target value."],
  box_reflection: ["An axis-aligned box.", "Apply a bijective reflection along one axis, including zero-valued cells."],
  local_stencil: ["A Manhattan ball, with reads from adjacent cells beyond the ball.", "Replace each selected value by a modular sum over its old local neighborhood."],
  occluded_mix: ["Cells reachable within a bounded number of steps through nonzero cells.", "Apply synchronous neighborhood aggregation while keeping updated cells nonzero."],
  component_relabel: ["The maximal equal-valued connected component containing a seed.", "Assign one target value to the entire component."],
  boundary_layer: ["A component boundary or the component cells exposed to empty space.", "Grow the component by one layer or erode its exposed layer."],
  obstructed_motion: ["Entities of one label and the traversed positions on axis-parallel lines.", "Move entities in a prescribed order until obstructed or the step limit is reached."],
  aggregating_compression: ["Every line parallel to a selected axis.", "Remove gaps, merge adjacent equal values once per pair, and pack toward one boundary."],
};

const STEP_MS = 1100; // one event per card per tick
const SPIN_IDLE = 0.12; // rad/s while a 3D card is on screen
const SPIN_HOVER = 0.85; // rad/s while the pointer is over a 3D stage
const PULSE_MS = 950; // voxel grow + highlight time after a diff

const sentence = (s) => (/[.!?]$/.test(s) ? s : s + ".");
const shortSource = (s) => s.replace(/^main:/, "");

const S = { dim: 2, paused: false, dialog: false, cards: [] };
const rm = reducedMotion();

// ---------- Players: step through exported states ----------

function makePlayer(steps, initial, { render, reset }) {
  const p = { t: 0, n: steps.length, state: initial.slice(), text: "", held: false };
  p.step = () => {
    if (p.t >= p.n) {
      // Hold the final state for one extra tick, then start over.
      if (!p.held) { p.held = true; return; }
      p.held = false;
      p.t = 0;
      p.text = "";
      p.state = initial.slice();
      reset(p.state);
      return;
    }
    const s = steps[p.t];
    p.state = applyDiff(p.state, s.diff);
    p.t += 1;
    p.text = s.text;
    render(s, p.state);
  };
  return p;
}

// ---------- 3D: one shared, frame-capped render loop for every voxel card ----------

let raf = 0;
let turn = 0;
const DRAW_BUDGET = 3; // voxel redraws per frame across all cards
const MIN_GAP_MS = 30; // per-card cap of about 30 fps (a hovered card is uncapped)

function kick() {
  if (!raf && S.dim === 3 && !document.hidden) raf = requestAnimationFrame(loop);
}

function loop(now) {
  raf = 0;
  const moving = !rm && !S.paused && !S.dialog;
  const due = [];
  for (const c of S.cards) {
    if (!c.world || S.dim !== 3 || !c.visible || document.hidden) { c.lastNow = 0; continue; }
    const dt = c.lastNow ? Math.min(0.05, (now - c.lastNow) / 1000) : 0;
    c.lastNow = now;
    const target = moving ? (c.hover ? SPIN_HOVER : SPIN_IDLE) : 0;
    c.spin += (target - c.spin) * Math.min(1, dt * 5);
    if (Math.abs(c.spin) < 0.002 && target === 0) c.spin = 0;
    if (c.spin) c.world.yaw += c.spin * dt;
    if (c.spin || now < c.animUntil + 40) due.push(c);
  }
  // Hovered cards draw every frame; the rest take turns within a fixed budget.
  let drawn = 0;
  for (const c of due) if (c.hover) { c.world.draw(now); c.lastDraw = now; drawn += 1; }
  for (let i = 0; i < due.length && drawn < DRAW_BUDGET; i++) {
    const c = due[(turn + i) % due.length];
    if (c.hover || now - (c.lastDraw || 0) < MIN_GAP_MS) continue;
    c.world.draw(now);
    c.lastDraw = now;
    drawn += 1;
  }
  turn += 1;
  if (due.length) kick();
}

// ---------- Cards ----------

function setLabel(c) {
  const p = S.dim === 3 && c.p3 ? c.p3 : c.p2;
  c.tNum.textContent = String(p.t);
  c.nNum.textContent = `of ${p.n}`;
  if (p.t === 0) {
    c.ev.replaceChildren(el("span", { class: "op-init", text: "initial world" }));
  } else {
    const cut = p.text.indexOf("(");
    c.ev.replaceChildren(el("b", { text: cut > 0 ? p.text.slice(0, cut) : p.text }), cut > 0 ? p.text.slice(cut) : "");
  }
  c.prog.style.transform = `scaleX(${p.n ? p.t / p.n : 0})`;
}

// A 2D card holds its state while the pointer is over its grid, so the cell tooltip stays exact.
const held = (c) => S.dim === 2 && c.hover;
const running = (c) => !S.paused && !S.dialog && !document.hidden && c.visible && !held(c);

function sync(c) {
  const want = running(c);
  if (want && !c.timer) {
    const tick = () => {
      (S.dim === 3 && c.p3 ? c.p3 : c.p2).step();
      setLabel(c);
      c.timer = setTimeout(tick, STEP_MS);
    };
    c.timer = setTimeout(tick, c.delay);
    c.delay = 220 + (c.k % 4) * 150;
  } else if (!want && c.timer) {
    clearTimeout(c.timer);
    c.timer = 0;
  }
}

function ensure3D(c) {
  if (c.world || !c.w3) return;
  const w3 = c.w3;
  const world = new VoxelWorld(c.c3, { autoRotate: 0, interactive: false, yaw: 0.62 + c.k * 0.41, zoom: 1.1, glow: false });
  world.setWorld(w3.shape, w3.values, w3.initial, { stagger: !rm });
  c.world = world;
  c.animUntil = performance.now() + (rm ? 0 : 1300);
  c.p3 = makePlayer(w3.steps, w3.initial, {
    render: (s) => {
      world.applyDiff(s.diff);
      c.animUntil = performance.now() + PULSE_MS;
      kick();
    },
    reset: (vec) => {
      world.clear();
      c.animUntil = performance.now() + 520;
      kick();
      setTimeout(() => {
        world.setWorld(w3.shape, w3.values, vec, { stagger: !rm });
        c.animUntil = performance.now() + (rm ? 0 : 1300);
        kick();
      }, 440);
    },
  });
}

function buildCard(fam, w3, k) {
  const accent = ACCENT[k % ACCENT.length];
  const tr = fam.trajectory;
  const c2 = el("canvas", { class: "c2", "aria-hidden": "true" });
  const c3 = el("canvas", { class: "c3", "aria-hidden": "true" });
  const tNum = el("b", { class: "tabnum", text: "0" });
  const nNum = el("span", { class: "op-n tabnum", text: `of ${tr.steps.length}` });
  const ev = el("span", { class: "op-ev" });
  const prog = el("i");
  const stage = el("div", { class: "op-stage" }, [c2, c3]);
  const descId = `op-desc-${fam.id}`;
  const card = el("div", {
    class: "card op-card",
    role: "button",
    tabindex: "0",
    "aria-haspopup": "dialog",
    "aria-label": `${fam.op}, ${fam.name}. Open the rule and a worked example.`,
    "aria-describedby": descId,
    style: `--fam:${accent};--i:${k}`,
  }, [
    el("div", { class: "op-head" }, [
      el("div", { class: "op-id" }, [
        el("span", { class: "op-name", text: fam.op }),
        el("span", { class: "op-full", text: fam.name }),
      ]),
      el("span", { class: "op-more", "aria-hidden": "true" }, ["Rule", el("span", { class: "op-arrow", text: "→" })]),
    ]),
    stage,
    el("div", { class: "op-step", "aria-hidden": "true" }, [
      el("div", { class: "op-tl" }, [el("span", { class: "op-t" }, ["T ", tNum]), el("span", { class: "op-prog" }, [prog]), nNum]),
      ev,
    ]),
    el("p", { class: "op-desc", id: descId, text: sentence(OP_ONE_LINER[fam.op] || fam.summary) }),
  ]);

  const c = { k, fam, w3, card, stage, c2, c3, tNum, nNum, ev, prog, visible: false, timer: 0, delay: 320 + k * 140, hover: false, spin: 0, lastNow: 0, animUntil: 0, world: null, p3: null };

  const grid = new GridCanvas(c2, {
    pad: 8,
    onHover: (i, e) => {
      if (i < 0 || S.dim !== 2) return hideTip();
      const at = coordOf(i, tr.shape);
      const v = grid.vec[i];
      showTip(e.clientX, e.clientY, [
        tipTitle(`${fam.op} · cell [${at.join(", ")}]`),
        tipRow(grid.palette(v), "value", String(v)),
        tipSub(c.p2.t ? `After T = ${c.p2.t} of ${tr.steps.length} events. Held while you hover.` : "Initial world. Held while you hover."),
      ]);
    },
  });
  // Draw only once the canvas is in the document and has a size.
  c.mount = () => grid.setWorld(tr.shape, tr.values, tr.initial);
  c.p2 = makePlayer(tr.steps, tr.initial, {
    render: (s, state) => grid.setState(state, new Set(s.diff.map(([i]) => i))),
    reset: (state) => grid.setState(state, new Set()),
  });

  // Open the dialog from a click or Enter/Space.
  card.addEventListener("click", () => openDialog(k));
  card.addEventListener("keydown", (e) => {
    if (e.target !== card) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDialog(k); }
  });

  // On phones the cards sit in a horizontal scroll row; bring a focused card fully into it.
  card.addEventListener("focus", () => {
    if (matchMedia("(max-width: 640px)").matches) card.parentElement.scrollIntoView({ block: "nearest", inline: "start" });
  });

  // Tilt the card, but hold it flat over a 2D stage so cell hit-testing stays exact.
  tilt(card, { max: 7, lift: 6 });
  stage.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse") return;
    c.hover = true;
    if (S.dim === 2) { card.dataset.noTilt = "1"; card.style.transform = ""; }
    sync(c);
    kick();
  });
  stage.addEventListener("pointerleave", () => {
    c.hover = false;
    delete card.dataset.noTilt;
    sync(c);
  });

  onVisible(card, (on) => {
    c.visible = on;
    // In 3D mode a card builds its voxel world the first time it scrolls into view.
    if (on && S.dim === 3 && !c.world) { ensure3D(c); setLabel(c); }
    sync(c);
    kick();
  }, "0px");

  setLabel(c);
  return c;
}

// ---------- Dialog ----------

const arrowIcon = (d) => {
  const s = svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
  s.append(svg("path", { d }));
  return s;
};

// The prompt's 1D worked example as a row of cells; `compare` outlines changed cells.
function strip(vec, compare, palette, accent, label) {
  const size = 48, gap = 6, n = vec.length, scale = 1.12;
  const W = n * size, H = size + 22;
  const root = svg("svg", {
    viewBox: `0 0 ${W} ${H}`, width: Math.round(W * scale), height: Math.round(H * scale),
    role: "img", "aria-label": `${label}: ${vec.join(" ")}`,
  });
  vec.forEach((v, i) => {
    const x = i * size + gap / 2, y = gap / 2, s = size - gap;
    const fill = palette(v);
    const changed = compare && compare[i] !== v;
    if (changed) {
      root.append(svg("rect", { x: x - 3, y: y - 3, width: s + 6, height: s + 6, rx: 13, fill: "none", stroke: accent, "stroke-width": 2 }));
    }
    root.append(svg("rect", {
      x, y, width: s, height: s, rx: 10, fill,
      stroke: v === 0 ? "rgba(160,180,220,.16)" : "rgba(255,255,255,.14)", "stroke-width": 1,
    }));
    root.append(svg("text", {
      x: x + s / 2, y: y + s / 2 + 6.5, "text-anchor": "middle", "font-size": 18, class: "gtext",
      fill: v === 0 ? "#4f5e76" : inkOn(fill), text: v,
    }));
    root.append(svg("text", {
      x: x + s / 2, y: H - 3, "text-anchor": "middle", "font-size": 11, class: "gaxis",
      fill: changed ? accent : undefined, text: `[${i}]`,
    }));
  });
  return root;
}

let dialog;
let current = 0;

function chip(key, value) {
  return el("span", { class: "chip dlg-chip" }, [el("span", { class: "k", text: key }), el("span", { text: value })]);
}

// Display words for the taxonomy values, so "relabel" is not read as the RELABEL operation.
const SUPPORT_WORDS = { geometry: "geometry", state: "current values" };
const UPDATE_WORDS = { relabel: "rewrite values", transport: "move values", aggregate: "combine values" };

function renderDialog(k) {
  const fams = S.cards.map((c) => c.fam);
  const fam = fams[k];
  const accent = ACCENT[k % ACCENT.length];
  const ex = fam.example;
  const pal = cellPalette(fam.trajectory.values);
  const changed = ex.after.filter((v, i) => v !== ex.before[i]).length;
  const [sel, change] = TABLE[fam.id] || [fam.structure, fam.summary];
  const prev = (k + fams.length - 1) % fams.length;
  const next = (k + 1) % fams.length;
  const dim3 = S.dim === 3 && S.cards[k].w3;
  const src = dim3 ? S.cards[k].w3 : fam.trajectory;

  const close = el("button", { class: "dlg-x", type: "button", "aria-label": "Close" }, [arrowIcon("M6 6l12 12M18 6L6 18")]);
  close.addEventListener("click", () => dialog.close());
  const navBtn = (j, dir) => {
    const b = el("button", { class: "btn btn-sm btn-ghost dlg-nav", type: "button", "data-nav": dir, "aria-label": `${dir === "prev" ? "Previous" : "Next"} operation: ${fams[j].op}` },
      dir === "prev" ? [arrowIcon("M19 12H5M11 6l-6 6 6 6"), fams[j].op] : [fams[j].op, arrowIcon("M5 12h14M13 6l6 6-6 6")]);
    b.addEventListener("click", () => {
      renderDialog(j);
      dialog.querySelector(`[data-nav="${dir}"]`)?.focus();
    });
    return b;
  };

  dialog.style.setProperty("--fam", accent);
  dialog.replaceChildren(
    el("span", { class: "dlg-glow", "aria-hidden": "true" }),
    // A direct child of the dialog, so it can stay pinned while the dialog scrolls.
    close,
    el("header", { class: "dlg-head" }, [
      el("div", { class: "dlg-id" }, [
        el("span", { class: "dlg-op", text: fam.op }),
        el("h3", { id: "dlg-title", text: fam.name }),
        el("p", { class: "dlg-one", text: sentence(OP_ONE_LINER[fam.op] || fam.summary) }),
      ]),
    ]),
    el("div", { class: "dlg-body" }, [
      el("section", { class: "dlg-ex", "aria-labelledby": "dlg-ex-title" }, [
        el("div", { class: "dlg-ex-head" }, [
          el("h4", { id: "dlg-ex-title", text: "Worked example" }),
          el("span", { class: "dlg-ex-note", text: `The ${ex.before.length}-cell line from the prompt` }),
        ]),
        el("div", { class: "strip-grid" }, [
          el("span", { class: "k", text: "Before" }),
          el("div", { class: "strip" }, [strip(ex.before, null, pal, accent, "Before")]),
          el("span", { class: "k", "aria-hidden": "true" }),
          el("div", { class: "strip-ev" }, [arrowIcon("M12 5v14M6 13l6 6 6-6"), el("code", { text: ex.event })]),
          el("span", { class: "k", text: "After" }),
          el("div", { class: "strip" }, [strip(ex.after, ex.before, pal, accent, "After")]),
          el("span", { class: "k", "aria-hidden": "true" }),
          el("p", { class: "strip-key" }, [el("i", { "aria-hidden": "true" }), `${changed} of ${ex.before.length} cells change`]),
        ]),
      ]),
      el("dl", { class: "dlg-def" }, [
        el("div", {}, [el("dt", { text: "Spatial selection" }), el("dd", { text: sel })]),
        el("div", {}, [el("dt", { text: "State transformation" }), el("dd", { text: change })]),
      ]),
      el("div", { class: "dlg-chips", role: "list", "aria-label": "Properties" }, [
        chip("selected by", SUPPORT_WORDS[fam.support] || fam.support),
        chip("update", UPDATE_WORDS[fam.update] || fam.update),
        chip("order", fam.order_dependent ? "ordered" : "simultaneous"),
      ].map((n) => { n.setAttribute("role", "listitem"); return n; })),
      el("details", { class: "disclosure" }, [
        el("summary", { text: "Exact rule text from the prompt" }),
        // W is defined on the prompt's last SPACE line, directly before COMMON EVENT.
        el("pre", {
          class: "rule-text",
          text: [fam.rule.includes("W(") && W_RULE, `COMMON EVENT\n${SET_RULE}`, `FAMILY RULE\n${fam.rule}`, `EXAMPLE\n${ex.card}`]
            .filter(Boolean).join("\n\n"),
        }),
      ]),
    ]),
    el("footer", { class: "dlg-foot" }, [
      el("p", { class: "dlg-src" }, [
        `Card animation: the first ${src.steps.length} events of `,
        el("code", { text: shortSource(src.source) }),
      ]),
      el("div", { class: "dlg-navs" }, [navBtn(prev, "prev"), navBtn(next, "next")]),
    ]),
  );
  dialog.scrollTop = 0;
  current = k;
}

let opener = null; // the card that opened the dialog; focus returns to it on close

function openDialog(k) {
  hideTip();
  renderDialog(k);
  if (!dialog.open) {
    opener = S.cards[k].card;
    dialog.showModal();
  }
  S.dialog = true;
  S.cards.forEach(sync);
}

// ---------- Section ----------

export function initFamilies(data, hero) {
  const gridEl = document.getElementById("ops");
  dialog = document.getElementById("op-dialog");
  const by3 = new Map((hero?.worlds || []).map((w) => [w.family, w]));

  gridEl.dataset.dim = "2";
  data.families.forEach((fam, k) => {
    const c = buildCard(fam, by3.get(fam.id), k);
    S.cards.push(c);
    gridEl.append(el("div", { class: "op-cell reveal" }, [c.card]));
    c.mount();
  });

  // Phones: position dots under the swipeable row (hidden by CSS on wider screens).
  const dots = document.getElementById("ops-dots");
  if (dots) {
    dots.replaceChildren(...S.cards.map(() => el("i")));
    const cells = [...gridEl.children];
    let raf = 0;
    const mark = () => {
      raf = 0;
      const step = cells[1] ? cells[1].offsetLeft - cells[0].offsetLeft : 1;
      const end = gridEl.scrollLeft >= gridEl.scrollWidth - gridEl.clientWidth - 2;
      const k = end ? cells.length - 1 : Math.round(gridEl.scrollLeft / step);
      [...dots.children].forEach((d, i) => d.classList.toggle("is-on", i === k));
    };
    gridEl.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(mark); }, { passive: true });
    mark();
  }

  // Close on a backdrop click: both the press and the release must land outside the dialog box,
  // so a click on the dialog's own padding or a text drag that ends outside does not close it.
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let downOutside = false;
  dialog.addEventListener("pointerdown", (e) => { downOutside = e.target === dialog && outside(e); });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && downOutside && outside(e)) dialog.close();
    downOutside = false;
  });
  dialog.addEventListener("close", () => {
    S.dialog = false;
    S.cards.forEach(sync);
    kick();
    const back = opener || S.cards[current]?.card;
    opener = null;
    if (!back) return;
    back.focus({ preventScroll: true });
    // The page is scroll-locked while the dialog is open, so the opener is normally still in view.
    const r = back.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) back.scrollIntoView({ block: "nearest" });
  });

  // 2D / 3D switch.
  const seg = document.getElementById("ops-dim");
  const dimBtns = [...seg.querySelectorAll("button[data-dim]")];
  if (!S.cards.some((c) => c.w3)) seg.hidden = true;
  const setDim = (d) => {
    if (d === S.dim) return;
    S.dim = d;
    hideTip();
    dimBtns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.dim) === d)));
    if (d === 3) S.cards.forEach((c) => { if (c.visible) ensure3D(c); });
    gridEl.dataset.dim = String(d);
    S.cards.forEach((c) => {
      if (d === 3) delete c.card.dataset.noTilt;
      else if (c.hover) { c.card.dataset.noTilt = "1"; c.card.style.transform = ""; }
      setLabel(c);
      sync(c); // a hovered card holds in 2D and resumes in 3D
    });
    kick();
  };
  dimBtns.forEach((b) => b.addEventListener("click", () => setDim(Number(b.dataset.dim))));
  // Cards open in 3D (each builds its voxel world on first view); the switch returns to 2D.
  setDim(S.cards.some((c) => c.w3) ? 3 : 2);

  // Pause / play for every card (starts paused under reduced motion).
  const pause = document.getElementById("ops-pause");
  const setPaused = (p) => {
    S.paused = p;
    pause.setAttribute("aria-label", p ? "Play the animations" : "Pause the animations");
    pause.querySelector(".ops-pause-label").textContent = p ? "Play" : "Pause";
    pause.querySelector(".ops-pause-icon").innerHTML = p
      ? '<path d="M8 5.5v13l11-6.5z"/>'
      : '<rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/>';
    S.cards.forEach(sync);
    kick();
  };
  pause.addEventListener("click", () => setPaused(!S.paused));
  setPaused(rm);

  // Method note behind the (i).
  const info = document.getElementById("ops-info");
  const tipNodes = () => [
    tipTitle("What the cards show"),
    tipSub("The first 24 events (2D) or 32 events (3D) of a 64-event benchmark trajectory, executed by the reference simulator. Core events of one family are interleaved with single-cell SET events."),
  ];
  const showInfo = () => {
    const r = info.getBoundingClientRect();
    showTip(r.left, r.bottom, tipNodes());
  };
  info.addEventListener("pointerenter", (e) => showTip(e.clientX, e.clientY, tipNodes()));
  info.addEventListener("pointerleave", hideTip);
  info.addEventListener("focus", showInfo);
  info.addEventListener("blur", hideTip);
  info.addEventListener("click", showInfo);
  info.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

  document.addEventListener("visibilitychange", () => {
    S.cards.forEach(sync);
    kick();
  });
}

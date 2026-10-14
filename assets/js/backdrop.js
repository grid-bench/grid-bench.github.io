// Page backdrop: a faint lattice of grid points. Points near the pointer light up,
// and occasional "events" ripple outward the way a local operation spreads.
//
// Each frame visits only the points near the pointer or a ripple ring and repaints only
// the boxes that changed; frames with nothing to animate are skipped. (A pattern fill for
// the static dots measured about twice as slow as drawing the few dots in each box.)

import { reducedMotion } from "./util.js";

const SPACING = 34;
const R = 190; // pointer spotlight radius
const RING = 22; // half-width of a ripple ring
const PAD = 7; // a lit cell is at most 11px wide; pad boxes past its half-width
const HUES = [[53, 208, 240], [139, 124, 246], [227, 93, 159]]; // cyan, violet, magenta

function hueAt(t) {
  const k = Math.min(1.999, Math.max(0, t) * 2);
  const i = Math.floor(k), f = k - i;
  const a = HUES[i], b = HUES[i + 1];
  return a.map((c, j) => Math.round(c + (b[j] - c) * f));
}

export function initBackdrop(canvas) {
  const ctx = canvas.getContext("2d");
  const still = reducedMotion();
  let W = 0, H = 0, dpr = 1;
  let mouse = { x: -1e4, y: -1e4 };
  let ripples = [];
  let raf = 0, running = false, nextRipple = 0, seed = 7;
  let lastDraw = 0, dirty = true, full = true, lastOff = NaN, prevBoxes = [];

  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Static lattice dots whose centers lie inside one box (CSS px). Dots outside the
  // box are left alone, so overlapping boxes never draw a dot twice.
  function paintDots(x, y, w, h, offY) {
    ctx.fillStyle = "rgba(150,170,210,0.11)";
    const i0 = Math.max(0, Math.ceil((x - SPACING / 2) / SPACING));
    const j0 = Math.ceil((y - offY - SPACING / 2) / SPACING);
    for (let py = offY + SPACING / 2 + j0 * SPACING; py < y + h; py += SPACING) {
      for (let px = SPACING / 2 + i0 * SPACING; px < x + w; px += SPACING) ctx.fillRect(px - 0.8, py - 0.8, 1.6, 1.6);
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    full = true;
    draw(performance.now());
  }

  function draw(now) {
    const offY = -((window.scrollY * 0.12) % SPACING);
    if (offY !== lastOff) { full = true; lastOff = offY; }
    ripples = ripples.filter((r) => now - r.t0 < r.dur);

    // Lit lattice points (max boost per point) and the boxes that contain them.
    const x0 = SPACING / 2, y0 = offY + SPACING / 2;
    const nx = Math.ceil((W - x0) / SPACING), ny = Math.ceil((H + SPACING - y0) / SPACING);
    const lit = new Map();
    const boxes = [];
    const visit = (cx, cy, rad, boostAt) => {
      const i0 = Math.max(0, Math.ceil((cx - rad - x0) / SPACING)), i1 = Math.min(nx - 1, Math.floor((cx + rad - x0) / SPACING));
      const j0 = Math.max(0, Math.ceil((cy - rad - y0) / SPACING)), j1 = Math.min(ny - 1, Math.floor((cy + rad - y0) / SPACING));
      if (i0 > i1 || j0 > j1) return;
      // Box edges sit on the midlines between lattice rows and columns, 17px from any
      // point, so no dot or lit cell straddles an edge and gets drawn twice.
      const bx = Math.floor((cx - rad - PAD) / SPACING) * SPACING;
      const by = offY + Math.floor((cy - rad - PAD - offY) / SPACING) * SPACING;
      boxes.push([bx, by, Math.ceil((cx + rad + PAD) / SPACING) * SPACING - bx, offY + Math.ceil((cy + rad + PAD - offY) / SPACING) * SPACING - by]);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const b = boostAt(x0 + i * SPACING, y0 + j * SPACING);
          if (b <= 0.02) continue;
          const k = j * nx + i;
          if (!(lit.get(k) >= b)) lit.set(k, b);
        }
      }
    };
    visit(mouse.x, mouse.y, R, (x, y) => {
      const md = Math.hypot(x - mouse.x, y - mouse.y);
      return md < R ? (1 - md / R) ** 1.4 * 0.9 : 0;
    });
    for (const r of ripples) {
      const p = (now - r.t0) / r.dur;
      const ring = p * r.reach;
      visit(r.x, r.y, ring + RING, (x, y) => {
        const d = Math.abs(Math.hypot(x - r.x, y - r.y) - ring);
        return d < RING ? (1 - d / RING) * (1 - p) * 0.8 : 0;
      });
    }

    // Repaint the lattice wherever cells were lit last frame or are lit now.
    const regions = full ? [[-SPACING, -SPACING, W + 2 * SPACING, H + 2 * SPACING]] : prevBoxes.concat(boxes);
    for (const [x, y, w, h] of regions) {
      ctx.clearRect(x, y, w, h);
      paintDots(x, y, w, h, offY);
    }
    full = false;
    prevBoxes = boxes;

    // Lit points grow into small cells, tinted along the page gradient.
    for (const [k, boost] of lit) {
      const x = x0 + (k % nx) * SPACING, y = y0 + Math.floor(k / nx) * SPACING;
      const [cr, cg, cb] = hueAt(x / W);
      const s = 2 + boost * 9;
      ctx.clearRect(x - 1, y - 1, 2, 2); // the cell replaces the dot beneath it
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(0.85, 0.08 + boost * 0.6)})`;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x - s / 2, y - s / 2, s, s, Math.min(2.5, s / 3));
        ctx.fill();
      } else {
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }

  function loop(now) {
    if (!running) return;
    if (now > nextRipple) {
      ripples.push({ x: rand() * W, y: rand() * H, t0: now, dur: 2600, reach: 160 + rand() * 120 });
      nextRipple = now + 2400 + rand() * 2200;
    }
    // Skip frames with nothing to animate. Pointer moves and scrolls draw every frame;
    // the slow ambient ripples alone draw at about 30 fps. The frame that drops the
    // last ripple still draws, so its ring is erased.
    if (dirty || (ripples.length && now - lastDraw >= 30)) {
      dirty = false;
      lastDraw = now;
      draw(now);
    }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || still) return;
    running = true;
    dirty = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    mouse = { x: e.clientX, y: e.clientY };
    dirty = true;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { mouse = { x: -1e4, y: -1e4 }; dirty = true; });
  window.addEventListener("pointerdown", (e) => {
    // Only clicks on empty page background start a ripple, never clicks on content.
    if (still || !e.target.matches("html, body, main, section, .wrap")) return;
    ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now(), dur: 2200, reach: 260 });
  });
  window.addEventListener("scroll", () => {
    dirty = true;
    if (!running) draw(performance.now());
  }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  resize();
  start();
}

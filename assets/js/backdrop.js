// Page backdrop: a faint lattice of grid points. Points near the pointer light up,
// and occasional "events" ripple outward the way a local operation spreads.

import { reducedMotion } from "./util.js";

const SPACING = 34;
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
  let mouse = { x: -1e4, y: -1e4, at: 0 };
  let ripples = [];
  let raf = 0, running = false, nextRipple = 0, seed = 7;

  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    const offY = -((window.scrollY * 0.12) % SPACING);
    const R = 190;
    ripples = ripples.filter((r) => now - r.t0 < r.dur);
    for (let y = offY + SPACING / 2; y < H + SPACING; y += SPACING) {
      for (let x = SPACING / 2; x < W; x += SPACING) {
        let a = 0.11;
        let boost = 0;
        const md = Math.hypot(x - mouse.x, y - mouse.y);
        if (md < R) boost = Math.max(boost, (1 - md / R) ** 1.4 * 0.9);
        for (const r of ripples) {
          const p = (now - r.t0) / r.dur;
          const ring = p * r.reach;
          const d = Math.abs(Math.hypot(x - r.x, y - r.y) - ring);
          if (d < 22) boost = Math.max(boost, (1 - d / 22) * (1 - p) * 0.8);
        }
        if (boost > 0.02) {
          // Lit points grow into small cells, tinted along the page gradient.
          const [cr, cg, cb] = hueAt(x / W);
          const s = 2 + boost * 9;
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(0.85, 0.08 + boost * 0.6)})`;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x - s / 2, y - s / 2, s, s, Math.min(2.5, s / 3));
            ctx.fill();
          } else {
            ctx.fillRect(x - s / 2, y - s / 2, s, s);
          }
        } else {
          ctx.fillStyle = `rgba(150,170,210,${a})`;
          ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        }
      }
    }
  }

  function loop(now) {
    if (!running) return;
    if (now > nextRipple) {
      ripples.push({ x: rand() * W, y: rand() * H, t0: now, dur: 2600, reach: 160 + rand() * 120 });
      nextRipple = now + 2400 + rand() * 2200;
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || still) return;
    running = true;
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
  }, { passive: true });
  document.addEventListener("pointerleave", () => { mouse = { x: -1e4, y: -1e4 }; });
  window.addEventListener("pointerdown", (e) => {
    // Only clicks on empty page background start a ripple, never clicks on content.
    if (still || !e.target.matches("html, body, main, section, .wrap")) return;
    ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now(), dur: 2200, reach: 260 });
  });
  window.addEventListener("scroll", () => { if (!running) draw(performance.now()); }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  resize();
  start();
}

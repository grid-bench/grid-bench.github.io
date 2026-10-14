// Canvas renderer for 2D worlds (and 4D worlds laid out as a grid of 2D slices).
// It draws exported reference states and animates color changes between them.

import { cellPalette, coordOf, fitCanvas, mix, roundRect, theme } from "./util.js";

export class GridCanvas {
  constructor(canvas, { pad = 10, digits = false, hover = true, onHover = null } = {}) {
    this.canvas = canvas;
    this.pad = pad;
    this.digits = digits;
    this.vec = [];
    this.prev = [];
    this.changed = new Set();
    this.t0 = 0;
    this.onHover = onHover;
    this.hoverIndex = -1;
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(canvas);
    if (hover && onHover) {
      canvas.addEventListener("pointermove", (e) => {
        const i = this.hit(e);
        if (i !== this.hoverIndex) {
          this.hoverIndex = i;
          this.draw();
        }
        onHover(i, e);
      });
      canvas.addEventListener("pointerleave", (e) => {
        this.hoverIndex = -1;
        this.draw();
        onHover(-1, e);
      });
    }
  }

  setWorld(shape, values, vec) {
    this.shape = shape;
    this.values = values;
    this.palette = cellPalette(values);
    this.vec = vec.slice();
    this.prev = vec.slice();
    this.changed = new Set();
    this.layout = null;
    this.draw();
  }

  refreshPalette() {
    if (this.values) this.palette = cellPalette(this.values);
    this.draw();
  }

  // Move to a new state; cells in `changed` get a fading outline.
  setState(vec, changed = null) {
    this.prev = this.vec.slice();
    this.vec = vec.slice();
    this.changed = changed || new Set(vec.map((v, i) => (v !== this.prev[i] ? i : -1)).filter((i) => i >= 0));
    this.t0 = performance.now();
    this.#animate();
  }

  #animate() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const t = (performance.now() - this.t0) / 900;
      this.draw();
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // Map each flat index to a cell rectangle.
  #computeLayout(W, H) {
    const shape = this.shape;
    let rows, cols, cellAt;
    if (shape.length === 2) {
      [rows, cols] = shape;
      const sliceGap = 0;
      cellAt = (i) => {
        const [r, c] = coordOf(i, shape);
        return [r, c, sliceGap];
      };
      const size = Math.min((W - 2 * this.pad) / cols, (H - 2 * this.pad) / rows);
      const x0 = (W - size * cols) / 2;
      const y0 = (H - size * rows) / 2;
      return { size, rect: (i) => { const [r, c] = cellAt(i); return [x0 + c * size, y0 + r * size]; }, rows, cols };
    }
    if (shape.length === 4) {
      const [a, b, c, d] = shape;
      const gapCells = 0.9;
      const totalCols = b * d + (b - 1) * gapCells;
      const totalRows = a * c + (a - 1) * gapCells;
      const size = Math.min((W - 2 * this.pad) / totalCols, (H - 2 * this.pad) / totalRows);
      const x0 = (W - size * totalCols) / 2;
      const y0 = (H - size * totalRows) / 2;
      return {
        size,
        rect: (i) => {
          const [p, q, r, s] = coordOf(i, shape);
          return [x0 + (q * (d + gapCells) + s) * size, y0 + (p * (c + gapCells) + r) * size];
        },
      };
    }
    throw new Error("GridCanvas supports 2D and 4D shapes");
  }

  hit(e) {
    if (!this.layout) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { size, rect: at } = this.layout;
    for (let i = 0; i < this.vec.length; i++) {
      const [cx, cy] = at(i);
      if (x >= cx && x < cx + size && y >= cy && y < cy + size) return i;
    }
    return -1;
  }

  draw() {
    if (!this.shape) return;
    const [W, H, ctx] = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, W, H);
    this.layout = this.#computeLayout(W, H);
    const { size, rect } = this.layout;
    if (!(size > 0)) return; // canvas not laid out yet
    const dark = theme() === "dark";
    const t = Math.min(1, (performance.now() - this.t0) / 900);
    const colorT = Math.min(1, t / 0.35);
    const gap = Math.max(1, size * 0.1);
    const rad = Math.max(1, size * 0.18);
    const ring = dark ? "#7fe6ff" : "#0a8fb3";
    for (let i = 0; i < this.vec.length; i++) {
      const [x, y] = rect(i);
      const from = this.palette(this.prev[i] ?? this.vec[i]);
      const to = this.palette(this.vec[i]);
      const fill = from === to ? to : mix(from, to, colorT);
      roundRect(ctx, x + gap / 2, y + gap / 2, size - gap, size - gap, rad);
      ctx.fillStyle = fill;
      ctx.fill();
      if (this.digits && size >= 16 && this.vec[i] !== 0) {
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.font = `600 ${Math.round(size * 0.42)}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(this.vec[i]), x + size / 2, y + size / 2 + 1);
      }
    }
    if (t < 1 && this.changed.size) {
      const alpha = 1 - t;
      ctx.lineWidth = Math.max(1.2, size * 0.12);
      ctx.strokeStyle = ring;
      ctx.globalAlpha = alpha;
      for (const i of this.changed) {
        const [x, y] = rect(i);
        roundRect(ctx, x + gap / 2, y + gap / 2, size - gap, size - gap, rad);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (this.hoverIndex >= 0) {
      const [x, y] = rect(this.hoverIndex);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = dark ? "#ffffff" : "#0b1426";
      roundRect(ctx, x + gap / 2, y + gap / 2, size - gap, size - gap, rad);
      ctx.stroke();
    }
  }
}

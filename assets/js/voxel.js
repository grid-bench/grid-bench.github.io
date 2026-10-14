// Orthographic voxel renderer for 3D worlds. States come from exported reference
// executions; this file only draws them and animates between consecutive states.

import { cellPalette, fitCanvas, shade, reducedMotion } from "./util.js";

const GAP = 0.2; // fraction of a cell left empty around each cube
const PITCH = 0.56; // camera elevation in radians

export class VoxelWorld {
  // `zoom` scales the fitted world (1 = fit with margins, the default).
  // `glow: false` skips the radial halo behind changed cubes (cheaper for small canvases).
  constructor(canvas, { autoRotate = 0.16, interactive = true, yaw = 0.7, zoom = 1, glow = true } = {}) {
    this.canvas = canvas;
    this.zoom = zoom;
    this.glow = glow;
    this.yaw = yaw;
    this.spin = autoRotate;
    this.vel = 0;
    this.shape = [1, 1, 1];
    this.cells = new Map(); // index -> {value, from, to, color, born, pulse}
    this.palette = () => "#888";
    this.running = false;
    this.last = 0;
    this.lastDraw = 0; // time of the last frame start() drew
    this.dragging = false;
    if (interactive) this.#bindDrag();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(canvas);
  }

  #bindDrag() {
    let lastX = 0;
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return; // keep vertical page scroll on touch
      this.dragging = true;
      lastX = e.clientX;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.yaw += dx * 0.008;
      this.vel = dx * 0.008;
      if (!this.running) this.draw();
    });
    const end = () => { this.dragging = false; };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  setWorld(shape, values, vec, { stagger = true } = {}) {
    this.shape = shape;
    this.values = values;
    this.palette = cellPalette(values);
    this.cells.clear();
    const now = performance.now();
    const [X, Y, Z] = shape;
    vec.forEach((v, i) => {
      if (!v) return;
      const z = i % Z;
      const delay = stagger && !reducedMotion() ? z * 70 + ((i * 37) % 11) * 18 : 0;
      this.cells.set(i, { value: v, scale0: stagger ? 0 : 1, scale1: 1, t0: now + delay, dur: 420, pulse: 0 });
    });
    this.vec = vec.slice();
    this.extent = Math.hypot(X, Y, Z);
    this.draw();
  }

  // Apply a sparse diff [[index, value], ...] with grow/shrink/recolor animation.
  applyDiff(diff, dur = 380) {
    const now = performance.now();
    for (const [i, v] of diff) {
      const cur = this.cells.get(i);
      if (v === 0) {
        if (cur) Object.assign(cur, { scale0: this.#scaleOf(cur, now), scale1: 0, t0: now, dur, pulse: now, dying: true });
      } else if (!cur || cur.dying) {
        this.cells.set(i, { value: v, scale0: 0, scale1: 1, t0: now, dur, pulse: now });
      } else {
        Object.assign(cur, { prev: cur.value, value: v, scale0: 1.18, scale1: 1, t0: now, dur, pulse: now });
      }
      this.vec[i] = v;
    }
  }

  clear(dur = 360) {
    const now = performance.now();
    for (const cell of this.cells.values()) {
      Object.assign(cell, { scale0: this.#scaleOf(cell, now), scale1: 0, t0: now + Math.random() * 120, dur, dying: true });
    }
  }

  #scaleOf(cell, now) {
    const t = Math.max(0, Math.min(1, (now - cell.t0) / cell.dur));
    const e = 1 - (1 - t) ** 3;
    return cell.scale0 + (cell.scale1 - cell.scale0) * e;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const rm = reducedMotion();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.dragging) {
        if (Math.abs(this.vel) > 0.0004) {
          this.yaw += this.vel;
          this.vel *= 0.94;
        } else if (!rm) {
          this.yaw += this.spin * dt;
        }
      }
      // Draw at about 30 fps while idle; the yaw still advances by dt every frame, so the
      // rotation speed is unchanged. Dragging and flinging draw every frame.
      const flinging = Math.abs(this.vel) > 0.0004;
      if (this.dragging || flinging || now - this.lastDraw >= 30) {
        this.draw(now);
        this.lastDraw = now;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  draw(now = performance.now()) {
    const [W, H, ctx] = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, W, H);
    const [X, Y, Z] = this.shape;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const cp = Math.cos(PITCH);
    const sp = Math.sin(PITCH);
    const cx = X / 2, cy = Y / 2, cz = Z / 2;
    // Fit the bounding box.
    const radius = Math.hypot(X, Y) / 2;
    const scale = this.zoom * Math.min(W / (2 * radius + 1.2), H / (2 * radius * sp + Z * cp + 1.4));
    const ox = W / 2;
    const oy = H / 2 + scale * 0.1;
    const proj = (x, y, z) => {
      const px = x - cx, py = y - cy, pz = z - cz;
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      return [ox + rx * scale, oy + (-pz * cp + ry * sp) * scale, ry * cp + pz * sp];
    };

    // Floor grid and bounding box.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(140,170,215,0.12)";
    ctx.beginPath();
    for (let i = 0; i <= X; i++) {
      const a = proj(i, 0, 0), b = proj(i, Y, 0);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    for (let j = 0; j <= Y; j++) {
      const a = proj(0, j, 0), b = proj(X, j, 0);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    const corners = [];
    for (const x of [0, X]) for (const y of [0, Y]) for (const z of [0, Z]) corners.push([x, y, z]);
    ctx.strokeStyle = "rgba(140,170,215,0.22)";
    ctx.beginPath();
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      const d = corners[a].reduce((s, v, k) => s + (v !== corners[b][k]), 0);
      if (d !== 1) continue;
      const p = proj(...corners[a]), q = proj(...corners[b]);
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();

    // Cubes, back to front.
    const items = [];
    for (const [i, cell] of this.cells) {
      const s = this.#scaleOf(cell, now);
      if (s <= 0.01) {
        if (cell.dying && now > cell.t0 + cell.dur) this.cells.delete(i);
        continue;
      }
      const z = i % Z;
      const y = Math.floor(i / Z) % Y;
      const x = Math.floor(i / (Y * Z));
      const c = proj(x + 0.5, y + 0.5, z + 0.5);
      items.push({ x, y, z, s, cell, depth: c[2] });
    }
    items.sort((a, b) => a.depth - b.depth);

    const sx = sin > 0 ? 1 : 0; // which x face faces the viewer
    const sy = cos > 0 ? 1 : 0;
    for (const it of items) {
      const { x, y, z, s, cell } = it;
      const half = ((1 - GAP) * s) / 2;
      const mx = x + 0.5, my = y + 0.5, mz = z + 0.5;
      const x0 = mx - half, x1 = mx + half, y0 = my - half, y1 = my + half, z0 = mz - half, z1 = mz + half;
      const base = this.palette(cell.value);
      const pulse = cell.pulse ? Math.max(0, 1 - (now - cell.pulse) / 900) : 0;
      const top = shade(base, 1.18 + pulse * 0.25);
      const faceX = shade(base, 0.86 + pulse * 0.2);
      const faceY = shade(base, 0.66 + pulse * 0.2);
      const fx = sx ? x1 : x0;
      const fy = sy ? y1 : y0;
      const quads = [
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], top],
        [[fx, y0, z0], [fx, y1, z0], [fx, y1, z1], [fx, y0, z1], faceX],
        [[x0, fy, z0], [x1, fy, z0], [x1, fy, z1], [x0, fy, z1], faceY],
      ];
      if (pulse > 0 && this.glow) {
        const c = proj(mx, my, mz);
        const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], scale * 1.3);
        g.addColorStop(0, `rgba(80,220,255,${0.32 * pulse})`);
        g.addColorStop(1, "rgba(80,220,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(c[0] - scale * 1.3, c[1] - scale * 1.3, scale * 2.6, scale * 2.6);
      }
      for (const [a, b, c, d, color] of quads) {
        const pa = proj(...a), pb = proj(...b), pc = proj(...c), pd = proj(...d);
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.lineTo(pc[0], pc[1]); ctx.lineTo(pd[0], pd[1]);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.1 + pulse * 0.5})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }
}

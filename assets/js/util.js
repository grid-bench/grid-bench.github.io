// Shared helpers: theme, colors, DOM, and visibility-driven animation.

export const SVG_NS = "http://www.w3.org/2000/svg";

export function theme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Grid value colors. Values 1..6 are categorical; digits (small grids) and
// hover readouts (large grids) carry the value as a second channel.
const CELL = {
  dark: ["#259ED6", "#C78707", "#CA488F", "#23AC74", "#796EDA", "#C3D3E4"],
  light: ["#008BC2", "#C27F00", "#C34189", "#019F68", "#6353C5", "#313E52"],
};

// OKLCH -> sRGB hex, used for sequential ramps.
export function oklch(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    lin
      .map((c) => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(Math.max(0, Math.min(1, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

// Sequential ramp (one hue) for magnitudes: t in [0, 1].
export function ramp(t, mode = theme()) {
  const tt = Math.max(0, Math.min(1, t));
  return mode === "dark"
    ? oklch(0.3 + 0.55 * tt, 0.04 + 0.1 * tt, 220)
    : oklch(0.96 - 0.5 * tt, 0.02 + 0.12 * tt, 225);
}

function isPowerAlphabet(values) {
  return values.length > 6 && values.slice(1).every((v, i) => v === 2 ** i);
}

// Returns a function value -> fill color for one world alphabet.
export function cellPalette(values, mode = theme()) {
  const empty = mode === "dark" ? "#131c30" : "#e9eef6";
  if (isPowerAlphabet(values)) {
    return (v) => (v === 0 ? empty : mode === "dark"
      ? oklch(0.5 + 0.3 * Math.min(1, Math.log2(v) / 8), 0.13, 212 - 40 * Math.min(1, Math.log2(v) / 8))
      : oklch(0.72 - 0.32 * Math.min(1, Math.log2(v) / 8), 0.13, 222 - 40 * Math.min(1, Math.log2(v) / 8)));
  }
  const nonzero = values.filter((v) => v !== 0);
  const colors = CELL[mode];
  return (v) => {
    if (v === 0) return empty;
    const i = nonzero.indexOf(v);
    return colors[(i < 0 ? 0 : i) % colors.length];
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");
}

export function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  if (k >= 1) {
    const t = k - 1;
    return rgbToHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
  }
  return rgbToHex([r * k, g * k, b * k]);
}

export function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((c, i) => c + (y[i] - c) * t));
}

// Ink (text) color that clears contrast on a given fill.
export function inkOn(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.32 ? "#0b1426" : "#ffffff";
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style") node.style.cssText = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

export const fmt = {
  int: (n) => n.toLocaleString("en-US"),
  pct: (x, d = 1) => (x * 100).toFixed(d) + "%",
};

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Calls cb(true/false) as the element enters or leaves the viewport.
export function onVisible(node, cb, rootMargin = "120px") {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) cb(e.isIntersecting);
  }, { rootMargin });
  io.observe(node);
  return io;
}

// Resize a canvas backing store to its CSS box. Returns [width, height] in CSS px.
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [w, h, ctx];
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Row-major helpers for dense state vectors.
export function strides(shape) {
  const out = new Array(shape.length).fill(1);
  for (let i = shape.length - 2; i >= 0; i--) out[i] = out[i + 1] * shape[i + 1];
  return out;
}

export function coordOf(index, shape) {
  const st = strides(shape);
  return shape.map((_, i) => Math.floor(index / st[i]) % shape[i]);
}

export function applyDiff(vec, diff) {
  const next = vec.slice();
  for (const [i, v] of diff) next[i] = v;
  return next;
}

// Tooltip singleton.
const tip = () => document.getElementById("tooltip");

export function showTip(x, y, content) {
  const t = tip();
  t.replaceChildren(...content);
  t.classList.add("is-on");
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const r = t.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + r.width > W - 8) left = x - r.width - pad;
  if (top + r.height > H - 8) top = y - r.height - pad;
  t.style.left = Math.max(8, left) + "px";
  t.style.top = Math.max(8, top) + "px";
}

export function hideTip() {
  tip().classList.remove("is-on");
}

// Content can scroll away from a stationary pointer without a pointerleave.
window.addEventListener("scroll", hideTip, { passive: true });

export function tipTitle(text) {
  return el("div", { class: "tt-title", text });
}

export function tipRow(color, label, value) {
  return el("div", { class: "tt-row" }, [
    el("i", { class: "tt-key", style: color ? `background:${color}` : "background:transparent" }),
    el("span", { text: label }),
    el("b", { text: value }),
  ]);
}

export function tipSub(text) {
  return el("div", { class: "tt-sub", text });
}

// Pointer-follow 3D tilt for cards and panels. `max` is the largest rotation in degrees.
export function tilt(node, { max = 5, lift = 3 } = {}) {
  if (reducedMotion() || !window.matchMedia("(hover: hover)").matches) return;
  node.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || node.dataset.noTilt) return;
    const r = node.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    node.style.transform = `perspective(1100px) rotateX(${(-y * max * 0.8).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateY(-${lift}px)`;
  });
  node.addEventListener("pointerleave", () => { node.style.transform = ""; });
}

// Animate an integer from 0 to `target` (or show it at once under reduced motion).
export function countUp(node, target, { dur = 1100, format = fmt.int } = {}) {
  if (reducedMotion()) { node.textContent = format(target); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    node.textContent = format(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

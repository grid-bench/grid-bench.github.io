// Entry point: navigation, scroll progress, backdrop, reveal-on-scroll, hero, and section setup.

import { VoxelWorld } from "./voxel.js";
import { initBackdrop } from "./backdrop.js";
import { el, onVisible, reducedMotion, tilt } from "./util.js";

// Hero verbs follow the operation playing in the window (wording from the public README table).
const VERB = {
  metric_paint: "repaint",
  box_reflection: "reflect",
  local_stencil: "aggregate",
  occluded_mix: "mix",
  component_relabel: "relabel",
  boundary_layer: "grow and erode",
  obstructed_motion: "move",
  aggregating_compression: "compress",
};

function initNav() {
  const links = document.getElementById("nav-links");
  const toggle = document.getElementById("nav-toggle");
  const bar = document.getElementById("progress");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
  const anchors = [...links.querySelectorAll("a")];
  const sections = anchors.map((a) => document.querySelector(a.getAttribute("href")));
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    let current = -1;
    sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) current = i; });
    anchors.forEach((a, i) => a.classList.toggle("is-active", i === current));
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
}

let revealIO;
export function observeReveal(root = document) {
  if (!revealIO) {
    revealIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const node = e.target;
        // Stagger siblings that enter together.
        const sibs = [...node.parentElement.children].filter((n) => n.classList.contains("reveal"));
        const delay = reducedMotion() ? 0 : (Math.max(0, sibs.indexOf(node)) % 4) * 90;
        setTimeout(() => node.classList.add("is-in"), delay);
        revealIO.unobserve(node);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  }
  root.querySelectorAll(".reveal:not(.is-in)").forEach((n) => revealIO.observe(n));
}

function initCopy() {
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".copy");
    if (!btn) return;
    const pre = btn.parentElement;
    const text = [...pre.childNodes].filter((n) => n !== btn).map((n) => n.textContent).join("").trim();
    btn.setAttribute("aria-live", "polite");
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select & copy";
    }
    setTimeout(() => { btn.textContent = "Copy"; }, 1600);
  });
}

// Types `text` into `node` one character at a time; returns a cancel function.
function typeInto(node, text, { speed = 55 } = {}) {
  let i = 0, timer = 0, cancelled = false;
  if (reducedMotion()) { node.textContent = text; return () => {}; }
  const erase = () => {
    if (cancelled) return;
    if (node.textContent.length) {
      node.textContent = node.textContent.slice(0, -1);
      timer = setTimeout(erase, 24);
    } else {
      timer = setTimeout(write, 120);
    }
  };
  const write = () => {
    if (cancelled) return;
    node.textContent = text.slice(0, ++i);
    if (i < text.length) timer = setTimeout(write, speed + Math.random() * 40);
  };
  erase();
  return () => { cancelled = true; clearTimeout(timer); };
}

function initHero(hero) {
  const canvas = document.getElementById("hero-canvas");
  const panel = document.getElementById("hero-world");
  const world = new VoxelWorld(canvas, { autoRotate: 0.14, yaw: 0.75 });
  const hud = {
    world: document.getElementById("hud-world"),
    t: document.getElementById("hud-t"),
    n: document.getElementById("hud-n"),
    progress: document.getElementById("hud-progress"),
    log: document.getElementById("hero-log"),
    verb: document.getElementById("typed-verb"),
  };
  const pauseBtn = document.getElementById("hero-pause");
  const pauseIcon = document.getElementById("hero-pause-icon");
  let w = 0, t = 0, timer = null, paused = reducedMotion(), visible = true, cancelType = () => {};

  const logLine = (cls, parts) => {
    const line = el("div", { class: `ln ${cls}` }, parts);
    hud.log.append(line);
    while (hud.log.children.length > 5) hud.log.firstElementChild.remove();
  };

  const showWorld = () => {
    const cur = hero.worlds[w];
    world.setWorld(cur.shape, cur.values, cur.initial);
    t = 0;
    hud.world.textContent = `reference-sim · ${cur.op} · ${cur.shape.join("×")}`;
    hud.n.textContent = cur.steps.length;
    hud.t.textContent = "0";
    hud.progress.style.width = "0%";
    logLine("cmt", [`# load ${cur.family} · ${cur.shape.join("×")} · ${cur.steps.length} events`]);
    cancelType();
    cancelType = typeInto(hud.verb, VERB[cur.family] || cur.op.toLowerCase());
  };
  const step = () => {
    const cur = hero.worlds[w];
    if (t >= cur.steps.length) {
      world.clear();
      w = (w + 1) % hero.worlds.length;
      setTimeout(showWorld, 450);
      return;
    }
    const s = cur.steps[t];
    world.applyDiff(s.diff);
    t += 1;
    hud.t.textContent = String(t);
    hud.progress.style.width = `${(t / cur.steps.length) * 100}%`;
    logLine(s.op === "SET" ? "set" : "", [
      el("span", { class: "t", text: `T=${String(t).padStart(2, "0")}` }),
      el("span", { class: "op", text: s.op }),
      s.text.slice(s.op.length),
    ]);
  };
  const schedule = () => {
    clearInterval(timer);
    if (!paused && visible) timer = setInterval(step, 760);
  };
  const setPauseIcon = () => {
    pauseIcon.innerHTML = paused ? '<path d="M7 5l12 7-12 7z"/>' : '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
    pauseBtn.setAttribute("aria-label", paused ? "Play animation" : "Pause animation");
  };
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    setPauseIcon();
    schedule();
  });
  setPauseIcon();
  document.getElementById("hero-next").addEventListener("click", () => {
    world.clear();
    w = (w + 1) % hero.worlds.length;
    setTimeout(showWorld, 300);
  });
  onVisible(canvas, (on) => {
    visible = on;
    if (on) world.start(); else world.stop();
    schedule();
  }, "0px");
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (document.hidden) world.stop(); else world.start();
    schedule();
  });
  // Tilt the window with the pointer, but not while the world is being dragged.
  canvas.addEventListener("pointerdown", () => { panel.dataset.noTilt = "1"; panel.style.transform = ""; });
  window.addEventListener("pointerup", () => { delete panel.dataset.noTilt; });
  tilt(panel, { max: 5, lift: 4 });
  showWorld();
}

async function load(name) {
  const res = await fetch(`assets/data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json();
}

// One section failing should not take the rest of the page down.
function guard(name, fn) {
  try { fn(); } catch (err) { console.error(`[${name}]`, err); }
}

async function main() {
  initBackdrop(document.getElementById("backdrop"));
  initNav();
  initCopy();
  observeReveal();

  const [hero, examples, families, tesseract, play, results] = await Promise.all(
    ["hero", "examples", "families", "tesseract", "play", "results"].map(load),
  );
  guard("hero", () => initHero(hero));
  const [{ initWhy }, { initTask }, { initFamilies }, { initCoverage }, { initPlay }, { initCharts }, { initUse }] = await Promise.all([
    import("./why.js"), import("./task.js"), import("./families.js"), import("./coverage.js"), import("./play.js"), import("./charts.js"), import("./use.js"),
  ]);
  guard("why", () => initWhy(examples));
  guard("operations", () => initFamilies(families, hero));
  guard("instance", () => initTask(examples));
  guard("scale", () => initCoverage({ families, hero, tesseract, results }));
  guard("results", () => initCharts(results));
  guard("play", () => initPlay(play));
  guard("use", () => initUse());
  observeReveal();
}

main().catch((err) => {
  console.error(err);
  document.body.append(el("div", { class: "wrap caption", style: "padding:24px", text: "Some interactive figures could not load. Serve this site over HTTP (for example, python -m http.server) rather than opening the file directly." }));
});

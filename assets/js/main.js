// Entry point: theme, navigation, reveal-on-scroll, data loading, and section setup.

import { VoxelWorld } from "./voxel.js";
import { el, onVisible, reducedMotion } from "./util.js";

const AUTHORS = [
  "Zixiang Xu", "Zirui Song", "Wanrong Zheng", "Chiyu Zhang", "Yue Huang", "Yuyang Peng",
  "Kexin Zhang", "Jinkun Chen", "Xiuying Chen", "Xiangliang Zhang", "Yan Liu", "Laurent Itti",
  "Frank Shyu", "Xiaoqiang Luo", "Sandeep Pandey", "Xi Liu", "Luke Simon", "Xiyang Hu", "Yue Zhao",
];

// BibTeX family/given split follows CITATION.cff preferred-citation.
const BIB_AUTHORS = [
  "Xu, Zixiang", "Song, Zirui", "Zheng, Wanrong", "Zhang, Chiyu", "Huang, Yue", "Peng, Yuyang",
  "Zhang, Kexin", "Chen, Jinkun", "Chen, Xiuying", "Zhang, Xiangliang", "Liu, Yan", "Itti, Laurent",
  "Shyu, Frank", "Luo, Xiaoqiang", "Pandey, Sandeep", "Liu, Xi", "Simon, Luke", "Hu, Xiyang", "Zhao, Yue",
];

function initTheme() {
  const btn = document.getElementById("theme-toggle");
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    meta.setAttribute("content", t === "dark" ? "#070b14" : "#f6f8fc");
    btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  };
  apply(document.documentElement.dataset.theme || "dark");
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try { localStorage.setItem("gb-theme", next); } catch { /* storage unavailable */ }
    document.dispatchEvent(new CustomEvent("themechange"));
  });
}

function initNav() {
  const nav = document.getElementById("nav");
  const links = document.getElementById("nav-links");
  const toggle = document.getElementById("nav-toggle");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
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
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const i = sections.indexOf(e.target);
      anchors.forEach((a, k) => a.classList.toggle("is-active", k === i));
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => s && io.observe(s));
}

let revealIO;
function observeReveal(root = document) {
  if (!revealIO) {
    revealIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          revealIO.unobserve(e.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px" });
  }
  root.querySelectorAll(".reveal:not(.is-in)").forEach((n) => revealIO.observe(n));
}

function initCopy() {
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".copy");
    if (!btn) return;
    const pre = btn.parentElement;
    const text = [...pre.childNodes].filter((n) => n !== btn).map((n) => n.textContent).join("").trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select & copy";
    }
    setTimeout(() => { btn.textContent = "Copy"; }, 1600);
  });
}

function initCitation() {
  document.getElementById("authors").replaceChildren(
    ...AUTHORS.flatMap((name, i) => [i ? ", " : "", i === 0 ? el("strong", { text: name }) : name]),
  );
  const bib = [
    "@misc{xu2026gridbench,",
    "  title  = {Grid-Bench: Can {LLMs} Predict How Discrete Worlds Change?},",
    `  author = {${BIB_AUTHORS.join(" and ")}},`,
    "  year   = {2026},",
    "  note   = {Paper identifier forthcoming}",
    "}",
  ].join("\n");
  document.getElementById("bibtex").append(bib);
}

function initHero(hero) {
  const canvas = document.getElementById("hero-canvas");
  const world = new VoxelWorld(canvas, { autoRotate: 0.14, yaw: 0.75 });
  const hud = {
    world: document.getElementById("hud-world"),
    t: document.getElementById("hud-t"),
    n: document.getElementById("hud-n"),
    op: document.getElementById("hud-op"),
    event: document.getElementById("hud-event"),
    progress: document.getElementById("hud-progress"),
  };
  const pauseBtn = document.getElementById("hero-pause");
  const pauseIcon = document.getElementById("hero-pause-icon");
  let w = 0, t = 0, timer = null, paused = reducedMotion(), visible = true;

  const showWorld = () => {
    const cur = hero.worlds[w];
    world.setWorld(cur.shape, cur.values, cur.initial);
    t = 0;
    hud.world.textContent = `3D · ${cur.shape.join("×")} · ${cur.op}`;
    hud.n.textContent = cur.steps.length;
    hud.t.textContent = "0";
    hud.op.textContent = cur.op;
    hud.event.textContent = " initial world";
    hud.progress.style.width = "0%";
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
    hud.op.textContent = s.op;
    hud.event.textContent = " " + s.text.slice(s.op.length);
    hud.progress.style.width = `${(t / cur.steps.length) * 100}%`;
  };
  const schedule = () => {
    clearInterval(timer);
    if (!paused && visible) timer = setInterval(step, 720);
  };
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseIcon.innerHTML = paused ? '<path d="M7 5l12 7-12 7z"/>' : '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
    pauseBtn.setAttribute("aria-label", paused ? "Play animation" : "Pause animation");
    schedule();
  });
  if (paused) {
    pauseIcon.innerHTML = '<path d="M7 5l12 7-12 7z"/>';
    pauseBtn.setAttribute("aria-label", "Play animation");
  }
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
  document.addEventListener("themechange", () => world.refreshPalette());
  showWorld();
}

async function load(name) {
  const res = await fetch(`assets/data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json();
}

async function main() {
  initTheme();
  initNav();
  initCopy();
  initCitation();
  observeReveal();

  const [hero, examples, families, tesseract, play, results] = await Promise.all(
    ["hero", "examples", "families", "tesseract", "play", "results"].map(load),
  );
  initHero(hero);
  const [{ initTask }, { initFamilies }, { initCoverage }, { initPlay }, { initCharts }] = await Promise.all([
    import("./task.js"), import("./families.js"), import("./coverage.js"), import("./play.js"), import("./charts.js"),
  ]);
  initTask(examples);
  initFamilies(families);
  initCoverage({ families, hero, tesseract, results });
  initPlay(play);
  initCharts(results);
  observeReveal();
}

main().catch((err) => {
  console.error(err);
  document.body.append(el("div", { class: "wrap caption", style: "padding:24px", text: "Some interactive figures could not load. Serve this site over HTTP (for example, python -m http.server) rather than opening the file directly." }));
});

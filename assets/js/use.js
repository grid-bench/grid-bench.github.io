// Section 08: closing call to action (tabbed commands), authors with affiliations, and BibTeX.

import { el, hideTip, reducedMotion, showTip, tilt, tipTitle } from "./util.js";

// Order and numbering follow paper/authors.tex (the arXiv author block).
const AFFILIATIONS = [
  "University of Southern California", "MBZUAI", "Meta",
  "University of Notre Dame", "UCLA", "Arizona State University",
];

const AUTHORS = [
  ["Zixiang Xu", 1], ["Zirui Song", 2], ["Wanrong Zheng", 1], ["Chiyu Zhang", 3], ["Yue Huang", 4],
  ["Yuyang Peng", 5], ["Kexin Zhang", 1], ["Jinkun Chen", 1], ["Xiuying Chen", 2], ["Xiangliang Zhang", 4],
  ["Yan Liu", 1], ["Laurent Itti", 1], ["Frank Shyu", 3], ["Xiaoqiang Luo", 3], ["Sandeep Pandey", 3],
  ["Xi Liu", 3], ["Luke Simon", 3], ["Xiyang Hu", 6], ["Yue Zhao", 1],
];

// BibTeX family/given split follows CITATION.cff preferred-citation.
const BIB_AUTHORS = AUTHORS.map(([name]) => {
  const i = name.lastIndexOf(" ");
  return `${name.slice(i + 1)}, ${name.slice(0, i)}`;
});

// Each field is its own block line so wrapped author names hang under the opening brace.
const BIB_LINES = [
  ["@misc{xu2026gridbench,", 0],
  ["  title  = {Grid-Bench: Can {LLMs} Predict How Discrete Worlds Change?},", 12],
  [`  author = {${BIB_AUTHORS.join(" and ")}},`, 12],
  ["  year   = {2026},", 12],
  ["  note   = {Paper identifier forthcoming}", 12],
  ["}", 0],
];

function initTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls"))?.classList.toggle("is-active", on);
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab, false));
    tab.addEventListener("keydown", (e) => {
      const n = tabs.length;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1 + n, Home: 0, End: n - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[next % n], true);
    });
  });
}

function initInfo() {
  const btn = document.getElementById("use-view-info");
  if (!btn) return;
  const flag = (t) => el("code", { class: "tt-code", text: t });
  const content = () => [
    tipTitle("Evaluation views"),
    el("div", { class: "tt-line" }, ["The default main view scores 1,152 instances; ", flag("--view all"), " scores all 1,488."]),
    el("div", { class: "tt-line", text: "Missing answers stay in the denominator." }),
  ];
  // Anchor to the button. If there is no room below, place the tip fully above the note it explains
  // (showTip's own flip would leave it covering the note).
  const note = btn.closest(".cta-note") || btn;
  const at = () => {
    const r = btn.getBoundingClientRect();
    showTip(r.left, r.bottom, content());
    const t = document.getElementById("tooltip");
    if (!t) return;
    const tr = t.getBoundingClientRect();
    if (tr.top < r.bottom) t.style.top = Math.max(8, note.getBoundingClientRect().top - tr.height - 8) + "px";
  };
  // Focusing an offscreen button scrolls the page, and any scroll hides the tip (util.js).
  // So show it after the scroll events of this frame, and again once a focus scroll settles.
  const showIfFocused = () => {
    const r = btn.getBoundingClientRect();
    if (document.activeElement === btn && r.bottom > 0 && r.top < innerHeight) at();
  };
  btn.addEventListener("pointerenter", at);
  btn.addEventListener("pointerleave", hideTip);
  btn.addEventListener("focus", () => {
    requestAnimationFrame(showIfFocused);
    window.addEventListener("scrollend", showIfFocused, { once: true });
  });
  btn.addEventListener("blur", () => {
    window.removeEventListener("scrollend", showIfFocused);
    hideTip();
  });
  btn.addEventListener("click", at);
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    window.removeEventListener("scrollend", showIfFocused);
    hideTip();
  });
}

// Fade the right edge of a code block while more of a long line is hidden.
function initCodeScroll(root) {
  const boxes = [...root.querySelectorAll(".code-lines")];
  const update = (box) => {
    const overflow = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle("has-more", overflow && box.scrollLeft + box.clientWidth < box.scrollWidth - 2);
    if (overflow) box.tabIndex = 0; else box.removeAttribute("tabindex");
  };
  for (const box of boxes) box.addEventListener("scroll", () => update(box), { passive: true });
  const all = () => boxes.forEach(update);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(all);
    boxes.forEach((b) => ro.observe(b));
  } else {
    window.addEventListener("resize", all);
  }
  document.fonts?.ready.then(all);
  all();
}

// A soft light that follows the pointer across the closing card.
function initSpotlight(card) {
  if (!card || reducedMotion() || !window.matchMedia("(hover: hover)").matches) return;
  let raf = 0, x = 0, y = 0;
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    x = e.clientX - r.left;
    y = e.clientY - r.top;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      card.style.setProperty("--mx", `${x}px`);
      card.style.setProperty("--my", `${y}px`);
      card.classList.add("is-lit");
    });
  });
  card.addEventListener("pointerleave", () => card.classList.remove("is-lit"));
}

function renderAuthors() {
  const list = document.getElementById("authors");
  const legend = document.getElementById("affil-legend");
  if (list) {
    list.replaceChildren(...AUTHORS.map(([name, k]) =>
      el("li", { "data-affil": k }, [name, el("sup", { text: String(k) })])));
  }
  if (legend) {
    legend.replaceChildren(...AFFILIATIONS.map((name, i) =>
      el("li", {}, [el("button", { type: "button", "data-affil": i + 1, "aria-pressed": "false" }, [el("sup", { text: String(i + 1) }), name])])));
  }
  if (!list || !legend) return;
  // Hover, focus, or a tap on an affiliation highlights its authors; a click or tap keeps it on until pressed again.
  let pinned = null;
  const show = (k) => {
    if (k) list.dataset.hl = k; else delete list.dataset.hl;
    for (const li of list.children) li.classList.toggle("is-hl", !!k && li.dataset.affil === k);
  };
  const buttons = [...legend.querySelectorAll("button")];
  for (const b of buttons) {
    const k = b.dataset.affil;
    b.addEventListener("pointerenter", () => show(k));
    b.addEventListener("pointerleave", () => show(pinned));
    b.addEventListener("focus", () => show(k));
    b.addEventListener("blur", () => show(pinned));
    b.addEventListener("click", () => {
      pinned = pinned === k ? null : k;
      for (const o of buttons) o.setAttribute("aria-pressed", String(o.dataset.affil === pinned));
      show(pinned);
    });
  }
}

function renderBib() {
  const pre = document.getElementById("bibtex");
  if (!pre) return;
  pre.append(...BIB_LINES.map(([text, hang], i) =>
    el("span", { class: "bl", style: hang ? `--hang:${hang}ch` : null }, [text + (i < BIB_LINES.length - 1 ? "\n" : "")])));
}

export function initUse() {
  const cta = document.getElementById("use-cta");
  if (cta) {
    initTabs(cta);
    initCodeScroll(cta);
    initSpotlight(cta);
  }
  initInfo();
  renderAuthors();
  renderBib();
  document.querySelectorAll("#use .cite-card").forEach((card) => tilt(card, { max: 2.5, lift: 3 }));
}

// Section 03: eight operation cards replaying real 2D benchmark trajectories,
// plus a dialog with the exact rule card and the 1D worked example.

import { GridCanvas } from "./grid2d.js";
import { applyDiff, cellPalette, coordOf, el, hideTip, inkOn, onVisible, reducedMotion, showTip, svg, theme, tipTitle, tipRow, tipSub } from "./util.js";

const SUPPORT = { geometry: "geometry-selected", state: "state-selected" };

function strip(before, after, alphabet) {
  const pal = cellPalette(alphabet);
  const n = before.length;
  const size = 44, gap = 5;
  const W = n * size, H = size + 20;
  const make = (vec, compare) => {
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
    vec.forEach((v, i) => {
      const x = i * size + gap / 2;
      const color = pal(v);
      root.append(svg("rect", { x, y: gap / 2, width: size - gap, height: size - gap, rx: 7, fill: color }));
      root.append(svg("text", {
        x: x + (size - gap) / 2, y: size / 2 + 6, "text-anchor": "middle", "font-size": 17, class: "gtext",
        fill: v === 0 ? (theme() === "dark" ? "#4c5b72" : "#9aa8bb") : inkOn(color), text: v,
      }));
      if (compare && compare[i] !== v) {
        root.append(svg("rect", { x: x - 1.5, y: gap / 2 - 1.5, width: size - gap + 3, height: size - gap + 3, rx: 8.5, fill: "none", stroke: theme() === "dark" ? "#7fe6ff" : "#0a8fb3", "stroke-width": 2.5 }));
      }
      root.append(svg("text", { x: x + (size - gap) / 2, y: H - 2, "text-anchor": "middle", "font-size": 11, class: "gaxis", text: `[${i}]` }));
    });
    return root;
  };
  return [make(before, null), make(after, before)];
}

function exampleNote(card) {
  const m = card.match(/After: [-\d ]+\.\s*([\s\S]*)$/);
  return m ? m[1] : card;
}

function openDialog(dialog, fam) {
  const { example: ex, trajectory: tr } = fam;
  const [before, after] = strip(ex.before, ex.after, tr.values);
  const close = el("button", { class: "icon-btn", type: "button", "aria-label": "Close" });
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener("click", () => dialog.close());
  dialog.replaceChildren(
    el("div", { class: "dlg-head" }, [
      el("div", {}, [
        el("div", { class: "op-name", text: fam.op }),
        el("h3", { id: "dlg-title", text: fam.name }),
        el("p", { class: "dlg-note", style: "margin-top:6px", text: fam.summary }),
      ]),
      close,
    ]),
    el("div", { class: "dlg-body" }, [
      el("div", { class: "dlg-sec" }, [
        el("h4", { text: "Rule, exactly as given in the prompt" }),
        el("pre", { class: "rule", text: fam.rule }),
      ]),
      el("div", { class: "dlg-sec" }, [
        el("h4", { text: "Worked example from the prompt" }),
        el("div", { class: "strip-wrap" }, [
          el("div", { class: "strip-row" }, [el("span", { class: "k", text: "Before" }), el("div", { class: "strip" }, [before])]),
          el("div", { class: "strip-event", text: `↓ ${ex.event}` }),
          el("div", { class: "strip-row" }, [el("span", { class: "k", text: "After" }), el("div", { class: "strip" }, [after])]),
        ]),
        el("p", { class: "dlg-note", style: "margin-top:12px", text: exampleNote(ex.card) }),
      ]),
      el("div", { class: "dlg-sec" }, [
        el("h4", { text: "Properties" }),
        el("div", { class: "kv" }, [
          el("span", { class: "chip", text: fam.structure }),
          el("span", { class: "chip", text: `support: ${fam.support}` }),
          el("span", { class: "chip", text: `update: ${fam.update}` }),
          el("span", { class: "chip", text: fam.order_dependent ? "explicit processing order" : "simultaneous update" }),
        ]),
      ]),
      el("p", { class: "caption", text: `Card animation: reference execution of ${tr.source.replace(/^main:/, "")}, first ${tr.steps.length} events.` }),
    ]),
  );
  dialog.showModal();
}

export function initFamilies(data) {
  const grid = document.getElementById("ops");
  const dialog = document.getElementById("op-dialog");
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  const renderers = [];

  data.families.forEach((fam, k) => {
    const tr = fam.trajectory;
    const canvas = el("canvas", { role: "img", "aria-label": `${fam.name}: animated 16 by 16 benchmark world` });
    const stepT = el("span", { class: "tabnum", text: "T = 0" });
    const stepE = el("span", { text: "initial world" });
    const card = el("button", { class: "card op-card reveal", type: "button", "aria-haspopup": "dialog" }, [
      el("div", { class: "op-top" }, [el("span", { class: "op-name", text: fam.op }), el("span", { class: "op-full", text: fam.name })]),
      el("div", { class: "op-canvas" }, [canvas, el("div", { class: "op-step" }, [stepT, stepE])]),
      el("p", { class: "op-summary", text: fam.summary }),
      el("div", { class: "op-chips" }, [
        el("span", { class: "chip", text: SUPPORT[fam.support] }),
        el("span", { class: "chip", text: fam.update }),
      ]),
      el("span", { class: "op-more", text: "Rule & worked example →" }),
    ]);
    card.addEventListener("click", () => openDialog(dialog, fam));
    grid.append(card);

    const r = new GridCanvas(canvas, {
      pad: 8,
      onHover: (i, e) => {
        if (i < 0) return hideTip();
        const c = coordOf(i, tr.shape);
        showTip(e.clientX, e.clientY, [tipTitle(`${fam.op} · [${c.join(", ")}]`), tipRow(null, "value", String(r.vec[i])), tipSub(`T = ${t} of ${tr.steps.length} shown`)]);
      },
    });
    r.setWorld(tr.shape, tr.values, tr.initial);
    let state = tr.initial.slice();
    let t = 0;
    let timer = null;
    const tick = () => {
      if (t >= tr.steps.length) {
        t = 0;
        state = tr.initial.slice();
        r.setState(state);
        stepT.textContent = "T = 0";
        stepE.textContent = "initial world";
        return;
      }
      const step = tr.steps[t];
      state = applyDiff(state, step.diff);
      t += 1;
      r.setState(state, new Set(step.diff.map(([i]) => i)));
      stepT.textContent = `T = ${t}`;
      stepE.textContent = step.text;
    };
    onVisible(card, (on) => {
      clearTimeout(timer);
      clearInterval(timer);
      if (on && !reducedMotion()) {
        timer = setTimeout(() => {
          tick();
          timer = setInterval(tick, 1100);
        }, 300 + k * 140);
      }
    }, "0px");
    renderers.push(r);
  });

  document.addEventListener("themechange", () => renderers.forEach((r) => r.refreshPalette()));
}

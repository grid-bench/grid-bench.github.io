// Section 06: getting started, BibTeX, and the full author list with affiliations.

import { el } from "./util.js";

// Order and numbering follow paper/authors.tex (the arXiv author block).
export const AFFILIATIONS = [
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
const BIB_AUTHORS = [
  "Xu, Zixiang", "Song, Zirui", "Zheng, Wanrong", "Zhang, Chiyu", "Huang, Yue", "Peng, Yuyang",
  "Zhang, Kexin", "Chen, Jinkun", "Chen, Xiuying", "Zhang, Xiangliang", "Liu, Yan", "Itti, Laurent",
  "Shyu, Frank", "Luo, Xiaoqiang", "Pandey, Sandeep", "Liu, Xi", "Simon, Luke", "Hu, Xiyang", "Zhao, Yue",
];

export function initUse() {
  const list = document.getElementById("authors");
  if (list) {
    list.replaceChildren(...AUTHORS.map(([name, k]) => el("li", {}, [name, el("sup", { text: String(k) })])));
  }
  const legend = document.getElementById("affil-legend");
  if (legend) {
    legend.replaceChildren(...AFFILIATIONS.map((name, i) => el("li", {}, [el("sup", { text: String(i + 1) }), name])));
  }
  const bib = [
    "@misc{xu2026gridbench,",
    "  title  = {Grid-Bench: Can {LLMs} Predict How Discrete Worlds Change?},",
    `  author = {${BIB_AUTHORS.join(" and ")}},`,
    "  year   = {2026},",
    "  note   = {Paper identifier forthcoming}",
    "}",
  ].join("\n");
  document.getElementById("bibtex")?.append(bib);
}

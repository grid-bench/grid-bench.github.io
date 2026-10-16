# Grid-Bench website

Source for the project website at **https://grid-bench.github.io/**.

The public site is deployed with GitHub Pages from the root of `site-v1`.
This branch is the maintained website; changes pushed to it trigger deployment.

## Project

**Grid-Bench: Can LLMs Predict How Discrete Worlds Change?**

Eight families of spatial operations transform two-, three-, and four-dimensional
grids. Given an initial world, explicit rules, and an event history, a language
model predicts the complete final state. Grid-Bench checks every predicted cell
against an executable reference world.

| Resource | Destination | Status on the site |
| --- | --- | --- |
| Website | https://grid-bench.github.io/ | Published from `site-v1` |
| Code | https://github.com/grid-bench/Grid-Bench | Live link |
| Dataset | https://huggingface.co/datasets/xzx34/Grid-Bench | Live link |
| Paper | https://arxiv.org/abs/2610.22312 | Live link and full BibTeX |

## Release scope

Code uses MIT and original data use CC BY 4.0. The data release contains
benchmark instances, simulator references, and evaluation measurements; it does
not include collected model answers or predicted grids. Use reference-world
examples for demonstrations. The paper is available as arXiv:2610.22312.

## Site structure

A static site with no build step and no runtime dependencies beyond Google Fonts.

| Path | Contents |
| --- | --- |
| `index.html` | All page copy and section markup |
| `assets/css/base.css` | Design tokens, fixed dark theme, nav, hero, footer, shared components |
| `assets/css/{why,ops,instance,scale,results,play,use}.css` | Section styles |
| `assets/js/main.js` | Navigation, reveal on scroll, data loading, hero animation, affiliation strip |
| `assets/js/backdrop.js` | Interactive lattice backdrop |
| `assets/js/util.js` | Shared colors, DOM helpers, tooltip, tilt |
| `assets/js/optext.js` | Shared operation wording |
| `assets/js/voxel.js` | 3D voxel renderer for reference trajectories |
| `assets/js/grid2d.js` | Canvas renderer for 2D worlds and 4D slice arrays |
| `assets/js/why.js` | 02 figure: the paper's Figure 1 history, W0 to W3 |
| `assets/js/charts.js` | 01 leaderboard and 06 findings (rates as percentages, not counts) |
| `assets/js/families.js` | 03 eight operation cards (3D by default, 2D on request) and rule dialogs |
| `assets/js/task.js` | 04 one instance, start to finish |
| `assets/js/coverage.js` | 05 three geometries, prefixes, design formula |
| `assets/js/play.js` | 07 practice puzzles |
| `assets/js/use.js` | 08 commands, authors, BibTeX |
| `assets/data/*.json` | Exported data (see below) with `manifest.json` hashes |
| `tools/export_data.py` | Regenerates `assets/data/` from the research workspace |

Page order: hero → leaderboard → why → operations → instance → scale → results →
play → use & cite.

## Data provenance

Every grid state on the site is produced by the reference simulator in
`tools/export_data.py`; the browser never re-implements a transition rule.

- `examples.json`: the paper's Figure 1 MOVE/SET histories, re-executed and
  checked against `paper/overview-examples.json`, with the formal 0.4 prompt.
- `families.json`, `hero.json`, `tesseract.json`: rule cards, worked examples,
  and the first events of real benchmark trajectories (2D, 3D, 4D).
- `play.json`: small practice puzzles, labeled on the page as non-benchmark.
- `results.json`: counts, intervals, error extent, baselines, and the
  Kimi K2.5/MiniMax M2.5 matched pairs from the frozen analysis
  `completed-six-model-expand08-20260923` and the released `results` measurements.
  The exporter asserts the published counts before writing.

No collected model answers, predicted grids, or answer-bearing cases are
displayed or exported. The illustrative error in the task section is the
hand-specified Figure 1 diagnostic and is labeled as such.

Regenerate from the research workspace root:

```sh
.venv/bin/python dist/github/grid-bench.github.io/tools/export_data.py \
  --research . --out dist/github/grid-bench.github.io/assets/data
```

## Preview locally

ES modules and JSON require HTTP; opening `index.html` as a file will not load
the figures.

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Maintenance

- Keep paper, code, and dataset links in both resource groups aligned with their
  public destinations.
- Keep the paper metadata in `index.html` and the full BibTeX in
  `BIB_LINES` in `assets/js/use.js` aligned with the arXiv record.
- Confirm exported data match `assets/data/manifest.json` before deployment.
- Regenerate `assets/img/og-image.png` if the hero changes.
- Preview changes locally, then push `site-v1` to deploy through GitHub Pages.

Release maintainer: Zixiang Xu (`xzx34`). Paper authorship and release ownership
are separate metadata. Affiliation logos appear only as an evenly weighted, scrolling row of
full-colour marks on light tiles identifying the authors' institutions, with a footer note that Grid-Bench is not
an official product of any listed organization. The site carries no sponsorship
claims, internal review records, manuscript acknowledgments, or template credits.

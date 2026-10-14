# Grid-Bench website draft

Source repository for the planned project website:
**https://grid-bench.github.io/**.

This repository is private. The site has not been implemented or deployed;
GitHub Pages is disabled. Keep it this way until the project owner authorizes
public launch. Website design and implementation will be completed separately.

## Project

**Grid-Bench: Can LLMs Predict How Discrete Worlds Change?**

Eight families of spatial operations transform two-, three-, and four-dimensional
grids. Given an initial world, explicit rules, and an event history, a language
model predicts the complete final state. Grid-Bench checks every predicted cell
against an executable reference world.

| Resource | Destination | Status |
| --- | --- | --- |
| Website | https://grid-bench.github.io/ | Planned; not deployed |
| Code | https://github.com/grid-bench/Grid-Bench | Private prerelease |
| Dataset | https://huggingface.co/datasets/xzx34/Grid-Bench | Planned; not uploaded |
| Paper | Pending confirmed public identifier | Do not invent a paper URL |

## Content outline

1. Introduce the prediction task with the approved 2D and 3D grid examples.
2. Explain the eight operation families and the supplied event history.
3. Summarize coverage: 1,488 instances, 248 trajectories, six models, and 8,928
   outcomes. Explain that prefixes share a trajectory.
4. Present selected findings on history length and errors within predicted grids.
5. Link the offline code quickstart and dataset-loading instructions.
6. Include a verified paper citation with the full paper author list, and the
   release maintainer contact.

The project owner's `release/WEBSITE_BRIEF.md` in the research workspace contains
the detailed content brief and asset inventory. Request the approved assets and
their provenance at implementation handoff. The private code repository contains
the usage guides and paper citation in `CITATION.cff`.

Release maintainer: Zixiang Xu (`xzx34`). Keep paper authorship separate from
software maintenance and release ownership. Use project branding, without
corporate logos, sponsorship claims, internal review records, or manuscript
template credits. Do not copy the manuscript acknowledgment onto the site.

## Implementation handoff

Use actual grids as the visual identity, with readable captions and a restrained
academic style. The TrustLLM project page is a reference for content progression:
https://trustllmbenchmark.github.io/TrustLLM-Website/.

Use exported reference states for any interactive playback. Preserve metric
definitions, sample denominators, model names, and source identities. Verify all
external links, asset licenses, and paper metadata before launch. This draft
includes no website build, deployment workflow, or generated public pages.

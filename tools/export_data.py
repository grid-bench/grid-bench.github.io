"""Export the website's JSON data from the Grid-Bench research workspace.

Every grid state shown on the site is produced here by the reference simulator
(``spatial_worlds.simulate``); the browser never re-implements a transition
rule. Result numbers come from the frozen analysis snapshot and the released
outcome rows, and are checked against the published counts before writing.

Usage (from the research workspace, with its virtual environment):

    .venv/bin/python dist/github/grid-bench.github.io/tools/export_data.py \
        --research . --out dist/github/grid-bench.github.io/assets/data
"""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

LENGTHS = (0, 1, 8, 16, 32, 64)
FAMILY_ORDER = (
    "metric_paint",
    "box_reflection",
    "local_stencil",
    "occluded_mix",
    "component_relabel",
    "boundary_layer",
    "obstructed_motion",
    "aggregating_compression",
)
SHORT = {
    "metric_paint": "PAINT",
    "box_reflection": "REFLECT",
    "local_stencil": "STENCIL",
    "occluded_mix": "MIX",
    "component_relabel": "RELABEL",
    "boundary_layer": "LAYER",
    "obstructed_motion": "MOVE",
    "aggregating_compression": "COMPRESS",
}
PARAM_ORDER = {
    "SET": ("p", "v"),
    "PAINT": ("a", "r", "u", "v"),
    "REFLECT": ("lo", "hi", "axis"),
    "STENCIL": ("a", "r"),
    "MIX": ("p", "r"),
    "RELABEL": ("p", "v"),
    "LAYER": ("p", "s"),
    "MOVE": ("v", "axis", "direction", "k"),
    "COMPRESS": ("axis", "direction"),
}
MODELS = (
    ("gpt-5.6-sol", "GPT-5.6 Sol"),
    ("claude-sonnet", "Claude 5 Sonnet"),
    ("gpt-5.4-mini", "GPT-5.4 Mini"),
    ("zai.glm-5", "GLM-5"),
    ("moonshotai.kimi-k2.5", "Kimi K2.5"),
    ("minimax.minimax-m2.5", "MiniMax M2.5"),
)
# Paper hues (analysis_registry.COLORS), re-stepped per theme so each set passes
# the categorical palette checks against its chart surface.
COLORS_LIGHT = ("#245C99", "#C77C31", "#028D87", "#885CB5", "#B52F4E", "#889D37")
COLORS_DARK = ("#4795EB", "#CD8134", "#1AA7A0", "#A269C9", "#D04A6A", "#7F9825")
MARKERS = ("circle", "square", "triangle", "diamond", "plus", "cross")

KIMI = "moonshotai.kimi-k2.5"
MINIMAX = "minimax.minimax-m2.5"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fmt_value(value: object) -> str:
    if isinstance(value, list):
        return "[" + ",".join(str(item) for item in value) + "]"
    return str(value)


def fmt_event(event: dict) -> str:
    op = event["op"]
    names = PARAM_ORDER[op]
    return f"{op}(" + ", ".join(f"{name}={fmt_value(event[name])}" for name in names) + ")"


def dense(state) -> list[int]:
    return list(state.dense_values())


def diff(before: list[int], after: list[int]) -> list[list[int]]:
    return [[index, value] for index, (old, value) in enumerate(zip(before, after)) if old != value]


def trajectory(instance, simulate, limit: int | None = None) -> dict:
    """Initial dense state plus one sparse diff per event, all from the simulator."""

    events = list(instance.events)[:limit] if limit else list(instance.events)
    sim = simulate(instance.prefix(len(events)), keep_all_states=True)
    states = [dense(sim.states[t]) for t in range(len(events) + 1)]
    steps = []
    for index, event in enumerate(events):
        raw = event.to_dict()
        steps.append(
            {
                "op": raw["op"],
                "text": fmt_event(raw),
                "diff": diff(states[index], states[index + 1]),
            }
        )
    assert states[-1] == dense(sim.final_state)
    return {
        "shape": list(instance.world.shape),
        "values": list(instance.world.values),
        "initial": states[0],
        "steps": steps,
    }


def load_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as source:
        return [json.loads(line) for line in source]


def export_examples(research: Path, sw) -> dict:
    """The approved Figure 1 MOVE/SET histories, re-executed by the simulator."""

    source = json.loads((research / "paper/overview-examples.json").read_text())
    out = []
    for example in source["examples"]:
        instance = sw.Instance.from_dict(
            {
                "schema_version": "spatial-worlds/0.2",
                "id": example["id"],
                "family": example["family"],
                "world": {"shape": example["shape"], "values": [0, 1, 2]},
                "initial": {"cells": example["initial"]},
                "events": example["events"],
            }
        )
        sim = sw.simulate(instance, keep_all_states=True)
        for t, expected in enumerate(example["expected_states"], start=1):
            got = sim.states[t].to_dict()["cells"]
            assert got == expected, (example["id"], t, got, expected)
        prompt = sw.render_prompt(instance, prompt_version=sw.COMPLETION_PROMPT_VERSION)
        answer = sw.render_answer(sim.final_state)
        diag = example["diagnostic"]
        out.append(
            {
                "id": example["id"],
                "shape": example["shape"],
                "axes": example["coordinate_order"],
                "states": [dense(sim.states[t]) for t in range(instance.horizon + 1)],
                "events": [
                    {"op": e.to_dict()["op"], "text": fmt_event(e.to_dict()), "raw": e.to_dict()}
                    for e in instance.events
                ],
                "prompt": prompt,
                "answer": answer,
                "illustrative_error": {
                    "coordinate": diag["coordinate"],
                    "predicted": diag["predicted_value"],
                    "reference": diag["expected_reference_value"],
                    "kind": diag["expected_kind"],
                    "description": diag["description"],
                },
            }
        )
    return {
        "note": "Illustrative MOVE histories from the paper's Figure 1. Not evaluation instances.",
        "prompt_version": sw.COMPLETION_PROMPT_VERSION,
        "examples": out,
    }


def export_families(rows: list[dict], sw) -> dict:
    """Family metadata, rule cards, 1D worked examples, and real 2D/3D trajectories."""

    by_id = {row["public_id"]: row for row in rows}
    families = []
    for family_id in FAMILY_ORDER:
        family = sw.FAMILIES[family_id]
        meta = family.metadata
        row2 = by_id[f"main:{family_id}/M/d2/" + _workload_dir(rows, family_id, 2) + "/test/0000/t064"]
        instance2 = sw.Instance.from_dict(json.loads(row2["instance_json"]))
        world = instance2.world
        example = family.example
        world1 = sw.WorldSpec.from_dict({"shape": [len(example.before)], "values": list(world.values)})
        before = sw.WorldState.from_dict(
            {"cells": [[[i], v] for i, v in enumerate(example.before) if v]}, world1
        )
        after = family.transition(before, example.event)
        families.append(
            {
                "id": family_id,
                "op": SHORT[family_id],
                "name": meta.name,
                "summary": meta.summary,
                "structure": meta.dependency_structure,
                "support": meta.support_source,
                "update": meta.update_type,
                "order_dependent": meta.order_dependent,
                "rule": family.rule_card(world),
                "example": {
                    "before": list(before.dense_values()),
                    "after": list(after.dense_values()),
                    "event": fmt_event(example.event.to_dict()),
                    "card": family.example_card(world1),
                },
                "trajectory": {
                    "source": row2["public_id"],
                    **trajectory(instance2, sw.simulate, limit=24),
                },
            }
        )
    return {"families": families}


def _workload_dir(rows: list[dict], family_id: str, dimension: int) -> str:
    for row in rows:
        if row["family"] == family_id and row["dimension"] == dimension and row["in_main"]:
            return f"w{row['workload']}"
    raise KeyError(family_id)


def export_hero(rows: list[dict], sw) -> dict:
    """3D reference trajectories, one per family, for the opening animation."""

    chosen = {
        "boundary_layer": "0007",
        "obstructed_motion": "0004",
        "component_relabel": "0001",
        "box_reflection": "0000",
        "metric_paint": "0000",
        "aggregating_compression": "0000",
        "occluded_mix": "0000",
        "local_stencil": "0000",
    }
    by_id = {row["public_id"]: row for row in rows}
    worlds = []
    for family_id in (
        "component_relabel",
        "obstructed_motion",
        "boundary_layer",
        "box_reflection",
        "aggregating_compression",
        "metric_paint",
        "occluded_mix",
        "local_stencil",
    ):
        pid = f"main:{family_id}/M/d3/{_workload_dir(rows, family_id, 3)}/test/{chosen[family_id]}/t064"
        instance = sw.Instance.from_dict(json.loads(by_id[pid]["instance_json"]))
        worlds.append({"family": family_id, "op": SHORT[family_id], "source": pid,
                       **trajectory(instance, sw.simulate, limit=32)})
    return {"worlds": worlds}


def export_tesseract(rows: list[dict], sw) -> dict:
    by_id = {row["public_id"]: row for row in rows}
    pid = "main:component_relabel/M/d4/" + _workload_dir(rows, "component_relabel", 4) + "/test/0000/t016"
    instance = sw.Instance.from_dict(json.loads(by_id[pid]["instance_json"]))
    return {"source": pid, **trajectory(instance, sw.simulate)}


def export_play(sw) -> dict:
    """Small practice puzzles. Answers come from the simulator; they are not benchmark rows."""

    specs = [
        {
            "id": "move",
            "family": "obstructed_motion",
            "level": "Warm-up",
            "shape": [5, 5],
            "values": [0, 1, 2],
            "cells": [[[0, 0], 1], [[2, 1], 1], [[4, 0], 1], [[0, 3], 2], [[1, 1], 2],
                      [[2, 4], 2], [[3, 2], 2]],
            "events": [
                {"op": "MOVE", "v": 1, "axis": 1, "direction": 1, "k": 3},
                {"op": "SET", "p": [4, 4], "v": 2},
                {"op": "MOVE", "v": 1, "axis": 0, "direction": -1, "k": 2},
            ],
        },
        {
            "id": "paint",
            "family": "metric_paint",
            "level": "Warm-up",
            "shape": [5, 5],
            "values": [0, 1, 2, 3],
            "cells": [[[0, 1], 1], [[0, 4], 2], [[1, 2], 1], [[1, 3], 2], [[2, 0], 1],
                      [[2, 2], 1], [[2, 4], 2], [[3, 1], 1], [[3, 3], 1], [[4, 2], 1],
                      [[4, 4], 1], [[1, 0], 3]],
            "events": [
                {"op": "PAINT", "a": [2, 2], "r": 2, "u": 1, "v": 3},
                {"op": "PAINT", "a": [0, 4], "r": 1, "u": 2, "v": 1},
            ],
        },
        {
            "id": "relabel",
            "family": "component_relabel",
            "level": "Moderate",
            "shape": [5, 5],
            "values": [0, 1, 2, 3, 4],
            "cells": [[[0, 0], 1], [[0, 1], 1], [[1, 1], 1], [[1, 2], 2], [[2, 2], 2],
                      [[2, 3], 2], [[3, 3], 1], [[3, 4], 1], [[4, 0], 2], [[4, 1], 2],
                      [[2, 0], 3], [[0, 4], 1]],
            "events": [
                {"op": "RELABEL", "p": [1, 2], "v": 1},
                {"op": "RELABEL", "p": [0, 0], "v": 4},
            ],
        },
        {
            "id": "layer",
            "family": "boundary_layer",
            "level": "Moderate",
            "shape": [5, 5],
            "values": [0, 1, 2, 3],
            "cells": [[[1, 1], 1], [[1, 2], 1], [[2, 1], 1], [[3, 3], 2], [[3, 4], 2],
                      [[4, 3], 2], [[4, 4], 2], [[0, 4], 3]],
            "events": [
                {"op": "LAYER", "p": [1, 1], "s": 1},
                {"op": "LAYER", "p": [4, 4], "s": -1},
            ],
        },
        {
            "id": "reflect",
            "family": "box_reflection",
            "level": "Moderate",
            "shape": [5, 5],
            "values": [0, 1, 2, 3],
            "cells": [[[0, 0], 1], [[0, 1], 2], [[1, 0], 3], [[1, 3], 1], [[2, 2], 2],
                      [[3, 1], 1], [[4, 4], 3], [[2, 4], 1]],
            "events": [
                {"op": "REFLECT", "lo": [0, 0], "hi": [2, 3], "axis": 1},
                {"op": "SET", "p": [4, 0], "v": 2},
                {"op": "REFLECT", "lo": [1, 0], "hi": [4, 1], "axis": 0},
            ],
        },
        {
            "id": "compress",
            "family": "aggregating_compression",
            "level": "Challenge",
            "shape": [4, 4],
            "values": [0, 1, 2, 4, 8],
            "cells": [[[0, 0], 1], [[0, 2], 1], [[0, 3], 2], [[1, 1], 2], [[1, 3], 2],
                      [[2, 0], 1], [[2, 1], 1], [[2, 2], 2], [[2, 3], 2], [[3, 3], 4]],
            "events": [
                {"op": "COMPRESS", "axis": 1, "direction": -1},
                {"op": "COMPRESS", "axis": 0, "direction": 1},
            ],
        },
    ]
    puzzles = []
    for spec in specs:
        instance = sw.Instance.from_dict(
            {
                "schema_version": "spatial-worlds/0.2",
                "id": f"play-{spec['id']}",
                "family": spec["family"],
                "world": {"shape": spec["shape"], "values": spec["values"]},
                "initial": {"cells": spec["cells"]},
                "events": spec["events"],
            }
        )
        sim = sw.simulate(instance, keep_all_states=True)
        for step in sim.steps:
            assert step.effect > 0, (spec["id"], step)
        assert dense(sim.final_state) != dense(instance.initial), spec["id"]
        family = sw.FAMILIES[spec["family"]]
        puzzles.append(
            {
                "id": spec["id"],
                "op": SHORT[spec["family"]],
                "level": spec["level"],
                "shape": spec["shape"],
                "values": spec["values"],
                "rule": family.rule_card(instance.world),
                "events": [fmt_event(e.to_dict()) for e in instance.events],
                "states": [dense(sim.states[t]) for t in range(instance.horizon + 1)],
            }
        )
    return {
        "note": "Practice puzzles executed by the reference simulator; not benchmark instances.",
        "puzzles": puzzles,
    }


def export_results(analysis: dict, outcomes: list[dict]) -> dict:
    names = dict(MODELS)
    order = [model for model, _ in MODELS]
    assert analysis["model_order"] == order
    tables = analysis["tables"]

    def pick(row: dict, *keys: str) -> dict:
        return {key: row[key] for key in keys}

    length = [
        pick(r, "model", "T", "n", "correct", "em", "ci95_low", "ci95_high", "valid",
             "valid_wrong", "empty", "length_terminated", "invalid_nonempty",
             "cell_accuracy_valid_only", "wrong_cells_median_valid_incorrect")
        for r in tables["length"]
    ]
    task_length = [pick(r, "model", "family", "T", "n", "correct") for r in tables["task_length"]]
    dimension_length = [pick(r, "model", "dimension", "T", "n", "correct")
                        for r in tables["dimension_length"]]
    workload = [pick(r, "model", "family", "w", "T", "n", "correct") for r in tables["workload"]]
    overview = [pick(r, "model", "view", "n", "correct", "valid", "empty", "length_terminated")
                for r in tables["overview"]]
    delivery = [pick(r, "model", "n", "correct", "valid", "empty", "length_terminated",
                     "invalid_nonempty", "output_tokens") for r in tables["resources"]]
    errors = [
        pick(r, "model", "T", "n", "valid_wrong_n", "median", "q25", "q75", "p90", "near5",
             "changed_only", "unchanged_only", "both")
        for r in analysis["errors"]
    ]
    baselines = [
        pick(r, "model", "T", "n", "valid_n", "model_ca", "copy_ca", "zero_ca", "above_copy",
             "changed_ca", "unchanged_ca")
        for r in analysis["matched_valid_baselines"]
    ]
    prefix = analysis["prefix"]["summary"]

    # Kimi K2.5 vs MiniMax M2.5 at T=8: both valid and incorrect on the same main instance.
    at8 = defaultdict(dict)
    for o in outcomes:
        if o["source_dataset"] == "main" and o["history_length"] == 8:
            at8[o["public_id"]][o["model_id"]] = o
    pairs = []
    for pid, by_model in sorted(at8.items()):
        k, m = by_model[KIMI], by_model[MINIMAX]
        if k["valid_state"] and m["valid_state"] and not k["em"] and not m["em"]:
            family = pid.split(":")[1].split("/")[0]
            dim = int(pid.split("/d")[1].split("/")[0])
            pairs.append({"id": pid, "op": SHORT[family], "d": dim,
                          "a": k["wrong_cells"], "b": m["wrong_cells"]})

    # Published checks (docs/SIX_MODEL_FINDINGS.md).
    get = {(r["model"], r["T"]): r for r in length}
    assert [get[(m, 64)]["correct"] for m in order] == [25, 14, 1, 0, 0, 1]
    assert [get[(m, 1)]["correct"] for m in order] == [183, 137, 69, 96, 148, 150]
    pooled = {m: sum(get[(m, t)]["correct"] for t in (8, 16, 32, 64)) for m in order}
    assert list(pooled.values()) == [314, 201, 26, 28, 57, 48]
    assert len(pairs) == 84
    assert statistics.median(p["a"] for p in pairs) == 14
    assert statistics.median(p["b"] for p in pairs) == 67
    assert (sum(p["a"] < p["b"] for p in pairs), sum(p["a"] == p["b"] for p in pairs),
            sum(p["a"] > p["b"] for p in pairs)) == (68, 3, 13)
    assert analysis["scored_outcomes"] == 8928 and analysis["unique_instances"] == 1488
    assert analysis["unique_trajectories"] == 248

    return {
        "analysis": analysis["analysis"],
        "models": [
            {"id": m, "name": names[m], "color": COLORS_LIGHT[i], "color_dark": COLORS_DARK[i],
             "marker": MARKERS[i]}
            for i, m in enumerate(order)
        ],
        "families": [{"id": f, "op": SHORT[f]} for f in FAMILY_ORDER],
        "lengths": list(LENGTHS),
        "totals": {
            "instances": analysis["unique_instances"],
            "trajectories": analysis["unique_trajectories"],
            "outcomes": analysis["scored_outcomes"],
            "main_instances": 1152,
            "main_trajectories": 192,
            "workload_instances": 336,
            "bootstrap_replicates": 2000,
            "gold_checks": [pick(c, "selected_states", "replayed_events", "mismatches")
                            for c in analysis["independent_gold_checks"]],
        },
        "length": length,
        "task_length": task_length,
        "dimension_length": dimension_length,
        "workload": workload,
        "overview": overview,
        "delivery": delivery,
        "errors": errors,
        "baselines": baselines,
        "prefix": prefix,
        "pairs": pairs,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--research", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    research = args.research.resolve()
    sys.path.insert(0, str(research / "src"))

    from types import SimpleNamespace

    from spatial_worlds.prompt import COMPLETION_PROMPT_VERSION, render_answer, render_prompt
    from spatial_worlds.registry import FAMILIES
    from spatial_worlds.schema import Instance, WorldSpec
    from spatial_worlds.simulate import simulate
    from spatial_worlds.world import WorldState

    sw = SimpleNamespace(
        FAMILIES=FAMILIES, Instance=Instance, WorldSpec=WorldSpec, WorldState=WorldState,
        simulate=simulate, render_prompt=render_prompt, render_answer=render_answer,
        COMPLETION_PROMPT_VERSION=COMPLETION_PROMPT_VERSION,
    )

    hf = research / "dist/public-release/huggingface/data"
    analysis_path = research / "data/analysis/six-model-expand08-20260923/analysis.json"
    rows = load_rows(hf / "benchmark.jsonl")
    outcomes = load_rows(hf / "results.jsonl")
    analysis = json.loads(analysis_path.read_text())

    outputs = {
        "examples.json": export_examples(research, sw),
        "families.json": export_families(rows, sw),
        "hero.json": export_hero(rows, sw),
        "tesseract.json": export_tesseract(rows, sw),
        "play.json": export_play(sw),
        "results.json": export_results(analysis, outcomes),
    }
    args.out.mkdir(parents=True, exist_ok=True)
    written = {}
    for name, payload in outputs.items():
        path = args.out / name
        path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n")
        written[name] = sha256(path)
    sources = {
        "benchmark.jsonl": hf / "benchmark.jsonl",
        "results.jsonl": hf / "results.jsonl",
        "analysis.json": analysis_path,
        "overview-examples.json": research / "paper/overview-examples.json",
    }
    manifest = {
        "generator": "tools/export_data.py",
        "sources": {name: sha256(path) for name, path in sources.items()},
        "outputs": written,
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for name, digest in written.items():
        print(f"{name:16} {(args.out / name).stat().st_size:>9,} bytes  {digest[:12]}")


if __name__ == "__main__":
    main()

// Shared operation copy, so every section quotes the same words.

// Operation one-liners from the public README table, keyed by operator. STENCIL and
// MIX are reworded more concretely; the exact rules sit behind each disclosure.
export const OP_ONE_LINER = {
  PAINT: "Replace a selected value inside a Manhattan ball.",
  REFLECT: "Reflect values within a rectangular region.",
  STENCIL: "Near a point, sum each cell with its neighbors, mod 4.",
  MIX: "From a point, through nonzero cells, sum each with its neighbors.",
  RELABEL: "Change the label of a connected component.",
  LAYER: "Grow or erode a connected region.",
  MOVE: "Move selected values along an axis around obstructions.",
  COMPRESS: "Pack and merge equal values along axis-aligned lines.",
};

// The shared SET event, verbatim from the prompt's COMMON EVENT block.
export const SET_RULE = "SET(p,v): set cell p to v.";

// The last SPACE line of every prompt, which defines W for the rules that use it.
export const W_RULE = "W(x) denotes the value of cell x immediately before the current event.";

import { z } from "zod";
import { LEXICON, inLexicon } from "./lexicon";

// re-export for convenience
export { LEXICON, inLexicon };

// ---------------------------------------------------------------------------
// Decision schema — mirrors night-shift.md §6
// ---------------------------------------------------------------------------

export const Form = z.enum([
  "monolith", "garden", "machine", "text", "light", "void",
]);

// ---------------------------------------------------------------------------
// Part schema — what the LLM may compose a work out of
//
// A work used to be one of six templates plus a handful of bounded numbers, so
// every night looked like one primitive. `parts` lets it compose instead, under
// a budget small enough that it cannot turn into a pile of blocks: the
// constraint set is the taste, not the geometry.
// ---------------------------------------------------------------------------

/** Hard ceiling on parts in one work. Small on purpose. */
export const PARTS_BUDGET = 8;

/** The only colours a work may use. Six plus two neutrals. */
export const PALETTE = [
  "ink", "slate", "bone", "rust", "amber", "jade", "sky", "violet",
] as const;

export const MATERIALS = ["neon", "glass", "stone", "metal"] as const;

export const SHAPES = [
  "block", "cylinder", "sphere", "wedge", "cone", "torus", "plate",
] as const;

export const Part = z.object({
  shape: z.enum(SHAPES),
  /** [width, height, depth] in studs; sphere/cylinder/cone read width as diameter. */
  size: z.tuple([
    z.number().min(0.2).max(64),
    z.number().min(0.2).max(90),
    z.number().min(0.2).max(64),
  ]),
  /** Offset from the work's site, in studs. y is the part's CENTRE height. */
  pos: z.tuple([
    z.number().min(-64).max(64),
    z.number().min(0).max(90),
    z.number().min(-64).max(64),
  ]),
  /** Euler degrees, applied XYZ. */
  rot: z
    .tuple([
      z.number().min(-180).max(180),
      z.number().min(-180).max(180),
      z.number().min(-180).max(180),
    ])
    .optional(),
  color: z.enum(PALETTE),
  material: z.enum(MATERIALS).optional(),
  /** 0 = ordinary, > 1 = a light source. */
  emissive: z.number().min(0).max(2).optional(),
  /** Rotation speed in degrees per second; negative spins the other way. */
  spin: z.number().min(-60).max(60).optional(),
  /** Vertical bob amplitude in studs. */
  float: z.number().min(0).max(6).optional(),
});

export type Part = z.infer<typeof Part>;

export const Decision = z.object({
  title: z.string().min(1).max(40),
  intent: z.string().min(1).max(200),
  form: Form,
  site: z.object({
    x: z.number().int().min(-256).max(256),
    z: z.number().int().min(-256).max(256),
  }),
  /**
   * Defaulted, not required. An assembly has no numbers to put here and the
   * model simply omits the key — 2026-11-01 lost a night to
   * `params: Required` on a perfectly good light, and the raw archive shows the
   * rejection as a wall of Zod JSON that told the model nothing.
   */
  params: z.record(z.string(), z.number().min(0).max(1)).default({}),
  /**
   * Optional assembly. When present it replaces the single-primitive
   * interpretation of `form` with an explicit part list — the LLM stops picking
   * a template and starts composing. Absent on every work built before this
   * schema existed, which is also how the hash stays compatible.
   */
  parts: z.array(Part).max(PARTS_BUDGET).optional(),
  journal: z.string().min(1).max(280),
  risk: z.enum(["low", "medium"]),
}).strict();

export type Decision = z.infer<typeof Decision>;

// ---------------------------------------------------------------------------
// PARAM_SPEC — locked second layer. Unknown key -> reject whole work.
// ---------------------------------------------------------------------------

export const PARAM_SPEC: Record<Decision["form"], Record<string, [number, number]>> = {
  monolith: { height: [0.2, 1], width: [0.1, 0.6], glow: [0, 1], hue: [0, 1] },
  garden:   { radius: [0.2, 1], density: [0.1, 1], hue: [0, 1] },
  machine:  { parts: [0.2, 1], speed: [0.1, 1], glow: [0, 1] },
  text:     { size: [0.2, 1], depth: [0.1, 1], hue: [0, 1] },
  light:    { height: [0.2, 1], intensity: [0.1, 1], hue: [0, 1] },
  void:     {},
};

// (lexicon moved to ./lexicon.ts — imported above and re-exported)

// ---------------------------------------------------------------------------
// Work type — mirrors night-shift.md §5
// ---------------------------------------------------------------------------

export type Work = {
  id: string;              // "n2026-10-23-a"
  night: number;           // 20261023
  title: string;           // <= 40 chars
  intent: string;          // <= 200 chars (ไม่แสดงในเกม)
  form: Decision["form"];
  site: { x: number; z: number };
  params: Record<string, number>;
  /** Assembly, when the work was composed rather than templated. */
  parts?: Part[];
  seed: number;
  journal: string;         // <= 280 chars
  prevHash: string;
  hash: string;
  /** base64 Ed25519 signature over `hash` — absent when no signing key is set. */
  sig?: string;
  builderVersion: 1;
};

export type State = {
  night: number;
  journalHead: string;
  /**
   * `title` is optional because the entries written before 2026-11-03 do not
   * carry one. The prompt needs the titles to tell the model what it has already
   * named — "bright night sky" appeared three times in a row and the model had no
   * way to see that.
   */
  works: { id: string; site: { x: number; z: number }; form: Decision["form"]; title?: string }[];
  plot: { size: number };
};

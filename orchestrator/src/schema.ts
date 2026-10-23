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

export const Decision = z.object({
  title: z.string().min(1).max(40),
  intent: z.string().min(1).max(200),
  form: Form,
  site: z.object({
    x: z.number().int().min(-256).max(256),
    z: z.number().int().min(-256).max(256),
  }),
  params: z.record(z.string(), z.number().min(0).max(1)),
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
  works: { id: string; site: { x: number; z: number }; form: Decision["form"] }[];
  plot: { size: number };
};

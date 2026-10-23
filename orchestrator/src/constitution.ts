import { Decision, PARAM_SPEC, PARTS_BUDGET, inLexicon, LEXICON } from "./schema";
import type { Part, State } from "./schema";

const MIN_SITE_DISTANCE = 30; // studs — matches in-game Lane B check

/** How far a part may sit from the work's own site, in studs. */
const PART_REACH = 64;
/** Ceiling on the tallest point of the assembly. */
const MAX_ASSEMBLY_HEIGHT = 90;
/** Ceiling on total volume, so "8 blocks" cannot become a wall of blocks. */
const MAX_ASSEMBLY_VOLUME = 30000;

/** Height of one part in studs, whatever its shape calls it. */
function partHeight(p: Part): number {
  switch (p.shape) {
    case "sphere": return p.size[0];
    case "torus": return p.size[1];
    default: return p.size[1];
  }
}

function partFootprint(p: Part): [number, number] {
  switch (p.shape) {
    case "plate":
    case "block":
    case "wedge": return [p.size[0], p.size[2]];
    default: return [p.size[0], p.size[0]];
  }
}

function assertParts(parts: Part[]): void {
  if (parts.length > PARTS_BUDGET) {
    throw new Error(`parts: ${parts.length} parts exceeds the budget of ${PARTS_BUDGET}`);
  }
  let volume = 0;
  let top = 0;
  for (const [i, p] of parts.entries()) {
    const [w, d] = partFootprint(p);
    const h = partHeight(p);
    if (Math.abs(p.pos[0]) + w / 2 > PART_REACH || Math.abs(p.pos[2]) + d / 2 > PART_REACH) {
      throw new Error(`parts[${i}] sits outside ${PART_REACH} studs of the site`);
    }
    if (p.pos[1] + h > MAX_ASSEMBLY_HEIGHT) {
      throw new Error(`parts[${i}] pushes the assembly past ${MAX_ASSEMBLY_HEIGHT} studs tall`);
    }
    volume += w * h * d;
  }
  if (volume > MAX_ASSEMBLY_VOLUME) {
    throw new Error(`parts: total volume ${Math.round(volume)} exceeds ${MAX_ASSEMBLY_VOLUME}`);
  }
}

/** How often an assembly is compulsory. One work in three. */
export const ASSEMBLY_EVERY = 3;

/**
 * The forms the model may actually return. `void` is in the enum because the
 * chain holds them and the builder still draws them, but it is not an answer —
 * see the rule in assertConstitution.
 */
export const OUTPUT_FORMS = [
  "monolith", "garden", "machine", "text", "light",
] as const;

/**
 * The first point at least `minDist` from every existing work, scanning outward
 * from the origin in rings. Deterministic, so a re-run of a night lands in the
 * same place, and it never returns null on a 512x512 plot with sane occupancy.
 *
 * It exists because hesitate() used to write every void at (0,0): four works
 * ended up stacked on the spawn point, and the site map showed it as four dots
 * in one pixel.
 */
export function freeSpot(
  works: { site: { x: number; z: number } }[],
  minDist = MIN_SITE_DISTANCE,
): { x: number; z: number } {
  const clear = (x: number, z: number) =>
    works.every((w) => {
      const dx = w.site.x - x;
      const dz = w.site.z - z;
      return dx * dx + dz * dz >= minDist * minDist;
    });

  for (let r = 0; r <= 240; r += 24) {
    const steps = r === 0 ? 1 : 24;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r);
      const z = Math.round(Math.sin(a) * r);
      if (clear(x, z)) return { x, z };
    }
  }
  // the plot is full — nothing is free, and the caller has to know
  throw new Error("no free site left on the plot");
}

/** True when the work about to be built must be an assembly. */
export function isAssemblyNight(worksSoFar: number): boolean {
  return worksSoFar > 0 && worksSoFar % ASSEMBLY_EVERY === 0;
}

function findViolations(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.filter((w) => !LEXICON.has(w));
}

export function assertConstitution(d: Decision, state: State): void {
  const titleBad = findViolations(d.title);
  const journalBad = findViolations(d.journal);
  if (titleBad.length || journalBad.length) {
    throw new Error(
      `lexicon: title has [${titleBad.join(",")}], journal has [${journalBad.join(",")}]`,
    );
  }

  // `void` is not a decision the model is allowed to make.
  //
  // It used to be, and the prompt said so out loud: "if you are not sure, return
  // form void with journal void no". Then the model started using it as an exit
  // whenever a rule got tight, and the exit was itself illegal — it wrote
  // journal "no action", and "action" is not in the 200-word lexicon, so the
  // night spent three attempts failing the same rule. Seven of the fifteen
  // answers in site/raw are that one move.
  //
  // So: void stays in the enum, because the chain holds seven of them and the
  // builder still has to draw them. But it is now only reachable through
  // hesitate() — the path taken when no work could be made at all. The model
  // has to answer, and a small work is always better than an empty night.
  if (d.form === "void") {
    throw new Error(
      "void is not available — that form is reserved for a night where no work could be made at all",
    );
  }

  // Every third work must be an assembly. Three nights of evidence say asking
  // politely does not work: opt-in parts -> no parts; "most nights compose" ->
  // no parts; that plus the void ban -> still no parts. The model reads an
  // optional field as optional.
  //
  // Keyed on the work count, not the date: 20261031 % 3 == 0 but 20261034 % 3 == 0
  // too, and October 34 is not a date. The calendar makes the rotation lumpy and
  // untestable; the number of works already standing does not.
  if (isAssemblyNight(state.works.length) && !(d.parts && d.parts.length >= 2)) {
    throw new Error(
      `this is work ${state.works.length + 1} and every third one is an assembly — `
      + `send "parts" with at least 2 parts`,
    );
  }

  for (const [k, v] of Object.entries(d.params)) {
    const range = PARAM_SPEC[d.form][k];
    if (!range) throw new Error(`unknown param ${k} for form ${d.form}`);
    if (v < range[0] || v > range[1]) throw new Error(`param ${k}=${v} out of range [${range[0]}, ${range[1]}]`);
  }

  if (d.parts) assertParts(d.parts);

  if (!isFree(d.site, state.works)) throw new Error("site occupied");

  const lastWork = state.works[state.works.length - 1];
  if (lastWork && lastWork.form === d.form) throw new Error(`repeat form: ${d.form} was already used last night`);
}

function isFree(
  site: { x: number; z: number },
  works: { site: { x: number; z: number } }[],
): boolean {
  for (const w of works) {
    const dx = w.site.x - site.x;
    const dz = w.site.z - site.z;
    if (dx * dx + dz * dz < MIN_SITE_DISTANCE * MIN_SITE_DISTANCE) return false;
  }
  return true;
}

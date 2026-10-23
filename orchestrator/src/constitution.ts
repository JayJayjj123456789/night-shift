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

function findViolations(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.filter((w) => !LEXICON.has(w));
}

export function assertConstitution(d: Decision, state: State, hasAttention = false): void {
  const titleBad = findViolations(d.title);
  const journalBad = findViolations(d.journal);
  if (titleBad.length || journalBad.length) {
    throw new Error(
      `lexicon: title has [${titleBad.join(",")}], journal has [${journalBad.join(",")}]`,
    );
  }

  // A void is the honest answer when nobody has ever come to look. With attention
  // data on the table it is a refusal to answer, and the model used it as one:
  // on 2026-10-29 it returned a perfectly valid void while telemetry existed and
  // the night produced nothing. Reject it, so the retry has to respond.
  if (d.form === "void" && hasAttention) {
    throw new Error("void is not allowed while attention data exists — respond to it");
  }

  for (const [k, v] of Object.entries(d.params)) {
    const range = PARAM_SPEC[d.form][k];
    if (!range) throw new Error(`unknown param ${k} for form ${d.form}`);
    if (v < range[0] || v > range[1]) throw new Error(`param ${k}=${v} out of range [${range[0]}, ${range[1]}]`);
  }

  // an assembly is not a hesitation
  if (d.parts && d.parts.length && d.form === "void") {
    throw new Error("parts present but form is void — a hesitation has nothing to assemble");
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

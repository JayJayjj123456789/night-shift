import { Decision, PARAM_SPEC, inLexicon, LEXICON } from "./schema";
import type { State } from "./schema";

const MIN_SITE_DISTANCE = 30; // studs — matches in-game Lane B check

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

  for (const [k, v] of Object.entries(d.params)) {
    const range = PARAM_SPEC[d.form][k];
    if (!range) throw new Error(`unknown param ${k} for form ${d.form}`);
    if (v < range[0] || v > range[1]) throw new Error(`param ${k}=${v} out of range [${range[0]}, ${range[1]}]`);
  }

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

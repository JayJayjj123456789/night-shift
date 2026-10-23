// One verifier for the hash chain, used by status.js, resync.js and the tests.
//
// It used to be copied into each of them, which is how the client-side verifier
// and the server-side one drift apart without anyone noticing. The rule is the
// same everywhere: sha256([night, title, form, x, z, journal, prev]).slice(0,16),
// chained from the literal string "genesis".

import { computeHash } from "./hash";
import type { Work } from "./schema";

export type ChainBreak = {
  id: string;
  kind: "hash" | "prevHash";
  expected: string;
  got: string;
};

export type ChainResult = {
  ok: boolean;
  breaks: ChainBreak[];
  head: string;
  ordered: Work[];
};

export function sortWorks(works: Work[]): Work[] {
  return [...works].sort((a, b) => a.night - b.night || (a.id < b.id ? -1 : 1));
}

export function verifyChain(works: Work[]): ChainResult {
  const ordered = sortWorks(works);
  const breaks: ChainBreak[] = [];
  let prev = "genesis";

  for (const w of ordered) {
    const expected = computeHash(
      w.night, w.title, w.form, w.site.x, w.site.z, w.journal, prev, w.parts,
    );
    if (expected !== w.hash) {
      breaks.push({ id: w.id, kind: "hash", expected, got: w.hash });
    } else if (w.prevHash !== prev) {
      breaks.push({ id: w.id, kind: "prevHash", expected: prev, got: w.prevHash });
    }
    prev = w.hash;
  }

  return { ok: breaks.length === 0, breaks, head: prev, ordered };
}

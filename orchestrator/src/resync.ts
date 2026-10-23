// Rebuild site/log.jsonl (and any missing previews) from the DataStore.
//
// Why this exists: the night itself can succeed while the *push* of its log
// line fails — a runner with a read-only GITHUB_TOKEN commits locally, gets
// 403 from the remote, and dies with the commit still on a destroyed disk.
// The DataStore keeps the work, the repo never hears about it, and the site
// silently falls one night behind forever. This script makes the DataStore
// the source of truth and the site a derived artefact: run it before every
// commit and the two can never drift.
//
// Usage: npm run resync      (reads .env via env.ts)

import "./env";
import { getEntry } from "./datastore";
import { computeHash } from "./hash";
import { renderPreview } from "./preview";
import type { State, Work } from "./schema";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SITE_DIR = join(__dirname, "..", "..", "site");
const LOG = join(SITE_DIR, "log.jsonl");
const PREVIEW_DIR = join(SITE_DIR, "previews");

export type ResyncReport = {
  total: number;
  head: string;
  added: string[];
  dropped: string[];
  previews: number;
  breaks: string[];
};

async function readExisting(): Promise<Work[]> {
  if (!existsSync(LOG)) return [];
  const text = await readFile(LOG, "utf8");
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Work);
}

/** Pure-ish core: takes the works as given, writes the derived files, reports. */
export async function resync(works: Work[], head: string): Promise<ResyncReport> {
  const sorted = [...works].sort((a, b) => a.night - b.night || (a.id < b.id ? -1 : 1));

  // verify while we walk — a rebuild must not paper over a broken chain
  let prev = "genesis";
  const breaks: string[] = [];
  for (const w of sorted) {
    const expected = computeHash(w.night, w.title, w.form, w.site.x, w.site.z, w.journal, prev);
    if (expected !== w.hash) breaks.push(`${w.id} hash ${w.hash} != computed ${expected}`);
    else if (w.prevHash !== prev) breaks.push(`${w.id} prevHash ${w.prevHash} != ${prev}`);
    prev = w.hash;
  }

  const before = await readExisting();
  const beforeIds = new Set(before.map((w) => w.id));
  const added = sorted.filter((w) => !beforeIds.has(w.id)).map((w) => w.id);
  const dropped = before.filter((w) => !sorted.some((s) => s.id === w.id)).map((w) => w.id);

  await mkdir(SITE_DIR, { recursive: true });
  await mkdir(PREVIEW_DIR, { recursive: true });
  await writeFile(LOG, sorted.map((w) => JSON.stringify(w)).join("\n") + "\n", "utf8");

  let previews = 0;
  for (const w of sorted) {
    const p = join(PREVIEW_DIR, `${w.id}.svg`);
    if (!existsSync(p)) {
      await writeFile(p, renderPreview(w), "utf8");
      previews++;
    }
  }

  return { total: sorted.length, head, added, dropped, previews, breaks };
}

async function main() {
  const state = await getEntry<State>("ns:state");
  if (!state) {
    console.error("ns:state is empty — nothing to resync");
    process.exit(1);
  }

  // ns:state carries ids + a small summary; the full work lives under ns:work:{id}
  const works = (
    await Promise.all(state.works.map((w) => getEntry<Work>(`ns:work:${w.id}`)))
  ).filter((w): w is Work => w !== null);

  const missing = state.works.length - works.length;
  if (missing) console.warn(`warning: ${missing} work id(s) in ns:state have no ns:work entry`);

  const r = await resync(works, state.journalHead);

  console.log(`resync: ${r.total} works from DataStore (head ${r.head})`);
  if (r.added.length) console.log(`  added   : ${r.added.join(", ")}`);
  if (r.dropped.length) console.log(`  dropped : ${r.dropped.join(", ")} (in repo but not in DataStore)`);
  if (r.previews) console.log(`  previews: wrote ${r.previews} missing`);
  if (!r.added.length && !r.dropped.length && !r.previews) console.log("  already in sync");

  if (r.breaks.length) {
    console.error(`  CHAIN BROKEN at ${r.breaks.length} point(s):`);
    for (const b of r.breaks) console.error(`    ${b}`);
    process.exit(2);
  }
  console.log("  chain verified ✓");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

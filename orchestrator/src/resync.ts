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
import { verifyChain } from "./chain";
import { renderPreview } from "./preview";
import { publicKeyPem, verifyHash } from "./sign";
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
  signed: number;
  badSigs: string[];
  telemetryRows: number;
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

/**
 * Attention data lives only in the DataStore, so the timeline's near/dwell chart
 * has always rendered its "no telemetry.jsonl published yet" branch. Aggregate
 * the same 7-day window the prompt sees and publish it as a derived file.
 */
export async function exportTelemetry(latestNight: number): Promise<number> {
  if (!latestNight) return 0;
  const iso = String(latestNight).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const base = new Date(`${iso}T00:00:00Z`);
  const totals: Record<string, { near: number; dwell: number }> = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    const t = await getEntry<Record<string, { near: number; dwell: number }>>(`ns:telemetry:${day}`);
    if (!t) continue;
    for (const [id, v] of Object.entries(t)) {
      const a = totals[id] ?? { near: 0, dwell: 0 };
      a.near += v.near ?? 0;
      a.dwell += v.dwell ?? 0;
      totals[id] = a;
    }
  }

  const rows = Object.entries(totals)
    .map(([id, v]) => ({
      id,
      near: v.near,
      dwell: v.dwell,
      verdict: v.near < 3 ? "unseen" : v.dwell > 120 ? "loved" : "seen",
    }))
    .sort((a, b) => b.near - a.near);

  await mkdir(SITE_DIR, { recursive: true });
  await writeFile(
    join(SITE_DIR, "telemetry.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
    "utf8",
  );
  return rows.length;
}

/** Pure-ish core: takes the works as given, writes the derived files, reports. */
export async function resync(works: Work[], head: string): Promise<ResyncReport> {
  // verify while we walk — a rebuild must not paper over a broken chain
  const chain = verifyChain(works);
  const sorted = chain.ordered;
  const breaks = chain.breaks.map(
    (b) => `${b.id} ${b.kind} ${b.got} != ${b.expected}`,
  );

  // signatures, when a public key has been published. Unsigned entries are
  // history from before signing existed — they are not failures. A signature
  // that does not verify is.
  const pub = publicKeyPem();
  const badSigs: string[] = [];
  let signed = 0;
  if (pub) {
    for (const w of sorted) {
      if (!w.sig) continue;
      if (verifyHash(w.hash, w.sig, pub)) signed++;
      else badSigs.push(w.id);
    }
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

  const telemetryRows = await exportTelemetry(sorted.length ? sorted[sorted.length - 1].night : 0);

  return { total: sorted.length, head, added, dropped, previews, breaks, signed, badSigs, telemetryRows };
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
  if (r.telemetryRows) console.log(`  telemetry: ${r.telemetryRows} work(s) with attention data`);
  if (r.signed) console.log(`  signatures: ${r.signed} verified`);
  if (!r.added.length && !r.dropped.length && !r.previews) console.log("  already in sync");

  if (r.badSigs.length) {
    console.error(`  SIGNATURE MISMATCH: ${r.badSigs.join(", ")}`);
    console.error("  the entry was changed after it was signed — this is not a rebuild artefact");
    process.exit(3);
  }
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

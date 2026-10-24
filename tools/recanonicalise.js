#!/usr/bin/env node
/**
 * Re-canonicalise the chain.
 *
 * Why this exists: computeHash used to hash `JSON.stringify` of the payload in
 * whatever key order the object happened to have in memory. The DataStore returns
 * stored values with keys sorted alphabetically, so the same work stringified
 * differently after a round-trip. Works without `parts` were unaffected (their
 * payload is scalars only); works WITH parts — arrays of objects — verified
 * against the in-memory copy and failed against the stored one.
 *
 * On 2026-10-24 the first night ever to build assemblies built five, and the chain
 * broke at the first of them.
 *
 * What it does: walks the chain in order and recomputes each hash with the
 * canonical form. A work whose hash does not change is left completely alone, so
 * the migration only touches what it must. Because `prevHash` is part of the
 * payload, one changed hash cascades forward until the end — that is expected and
 * it is the whole reason this is one script and not five edits.
 *
 * Content is never touched: title, journal, form, site, params, parts, seed and
 * intent are copied through untouched. Only the derived `hash`, `prevHash` and
 * `sig` are rewritten, and the signature is remade with the same key, so the
 * result verifies from the store.
 *
 * Usage:  node tools/recanonicalise.js [--dry-run]
 */

const D = require("path").join(__dirname, "..", "orchestrator", "dist");
process.env.NIGHT = process.env.NIGHT || "20261024";
require(D + "/env.js");

const { getEntry, putEntry } = require(D + "/datastore.js");
const { computeHash } = require(D + "/hash.js");
const { signHash } = require(D + "/sign.js");

const dryRun = process.argv.includes("--dry-run");

(async () => {
  const state = await getEntry("ns:state");
  if (!state) {
    console.error("ns:state is empty — nothing to migrate");
    process.exit(1);
  }

  const works = [];
  for (const ref of state.works) {
    const w = await getEntry("ns:work:" + ref.id);
    if (!w) {
      console.error(`ns:work:${ref.id} missing — refusing to migrate a hole in the chain`);
      process.exit(1);
    }
    works.push(w);
  }
  works.sort((a, b) => a.night - b.night || (a.id < b.id ? -1 : 1));

  let prev = "genesis";
  let changed = 0;
  const report = [];

  for (const w of works) {
    const nextHash = computeHash(w.night, w.title, w.form, w.site.x, w.site.z, w.journal, prev, w.parts);
    const same = nextHash === w.hash && w.prevHash === prev;
    if (same) {
      report.push(`  keep    ${w.id}  ${w.hash}`);
    } else {
      changed++;
      report.push(
        `  rewrite ${w.id}  ${w.hash} -> ${nextHash}` +
        (w.prevHash === prev ? "" : `  prev ${w.prevHash} -> ${prev}`),
      );
      if (!dryRun) {
        const sig = signHash(nextHash);
        await putEntry("ns:work:" + w.id, {
          ...w,
          prevHash: prev,
          hash: nextHash,
          sig: sig ?? undefined,
        });
      }
    }
    prev = nextHash;
  }

  console.log(report.join("\n"));
  console.log(
    `\n${changed} of ${works.length} work(s) ${dryRun ? "would be " : ""}rewritten.` +
    ` new head: ${prev}`,
  );

  if (!dryRun) {
    await putEntry("ns:state", { ...state, journalHead: prev });
    console.log("ns:state.journalHead updated");
  } else {
    console.log("dry run — nothing written");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

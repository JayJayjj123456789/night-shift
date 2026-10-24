// Progress checker: everything that can break, in one command.
// Usage: npm run status   (reads .env via env.ts)
import "./env";
import { getEntry, getNight } from "./datastore";
import { allKeys, verifyWithAny } from "./sign";
import { repoBuilderVersion, compareBuilder } from "./builder-version";

/** Roblox caps one DataStore entry at 256 KB; putEntry fails past it. */
const DATASTORE_ENTRY_LIMIT = 256 * 1024;
/** Mirrors index.ts — how many works one night may add. */
const MAX_WORKS_PER_NIGHT = 26;
import type { BuilderReport } from "./builder-version";
import { verifyChain } from "./chain";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STORE = "NightShift_v1";
const ORIGIN = { x: 0, z: 0 };
const MIN_SITE_DISTANCE = 30;

type Work = {
  id: string; night: number; title: string; intent: string;
  form: string; site: { x: number; z: number }; params: Record<string, number>;
  journal: string; prevHash: string; hash: string; seed: number; sig?: string;
};
type State = { night: number; journalHead: string; works: { id: string; site: { x: number; z: number }; form: string }[]; plot: { size: number } };

const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const ok = (b: boolean, msg: string, bad = "") =>
  console.log(b ? `  ${G("PASS")}  ${msg}` : `  ${R("FAIL")}  ${msg}${bad ? D(" — " + bad) : ""}`);
const warn = (msg: string) => console.log(`  ${Y("WARN")}  ${msg}`);
const info = (msg: string) => console.log(`  ${D("····")}  ${msg}`);

/** Same payload shape as orchestrator/src/hash.ts — must match exactly. */
function computeHash(night: number, title: string, form: string, x: number, z: number, journal: string, prev: string): string {
  return createHash("sha256")
    .update(JSON.stringify([night, title, form, x, z, journal, prev]))
    .digest("hex")
    .slice(0, 16);
}

async function main() {
  const tonight = getNight();
  console.log(`\n\x1b[1mNIGHT SHIFT — status\x1b[0m  ${D(`night=${tonight}`)}\n`);

  // ---------- 1. DataStore reachable ----------
  console.log("\x1b[1m1. DataStore\x1b[0m");
  let state: State | null = null;
  try {
    state = await getEntry<State>("ns:state");
    ok(true, `${STORE} reachable`, "");
  } catch (e) {
    ok(false, `${STORE} reachable`, String(e));
    console.log("\n  \x1b[31mchain broken at the bottom — cannot continue\x1b[0m\n");
    process.exit(1);
  }

  if (!state) {
    warn("ns:state is empty — no night has ever completed");
    state = { night: 0, journalHead: "genesis", works: [], plot: { size: 512 } };
  } else {
    ok(true, `ns:state present — night=${state.night} works=${state.works.length} head=${state.journalHead}`);
  }

  // ---------- 2. Hash chain ----------
  console.log("\n\x1b[1m2. Hash chain\x1b[0m");
  let chainOk = true;
  let siteOk = true;
  const workDocs: Work[] = [];
  for (const ref of state.works) {
    const w = await getEntry<Work>(`ns:work:${ref.id}`);
    if (!w) { ok(false, `ns:work:${ref.id} missing from DataStore`); chainOk = false; continue; }
    workDocs.push(w);
  }

  // One verifier, shared with resync and the tests. This used to be a second
  // copy of the walk, and when parts entered the hash payload the copy did not
  // follow: run #17 built a genuine two-part assembly and status.js reported
  // `chain BROKEN` for a chain that was intact. resync, which uses verifyChain,
  // verified it fine in the same run.
  const chain = verifyChain(workDocs as import("./schema").Work[]);
  const breaksById = new Map(chain.breaks.map((b) => [b.id, b]));
  for (const w of chain.ordered) {
    const b = breaksById.get(w.id);
    if (b) {
      chainOk = false;
      ok(false, `${w.id}`, `${b.kind} ${b.got} != ${b.expected}`);
    } else {
      ok(true, `${w.id} ${w.form.padEnd(9)} hash=${w.hash}`);
    }
  }
  const prev = chain.head;
  if (state.works.length === 0) warn("no works yet — chain is empty (valid genesis)");
  if (chainOk && state.works.length) ok(true, `chain head matches state.journalHead (${state.journalHead})`,
     state.journalHead !== prev ? `state head=${state.journalHead} but last work hash=${prev}` : "");
  if (state.journalHead !== prev) chainOk = false;

  // signatures: a hash chain alone is self-referential, a signature is not
  const keys = await allKeys();
  if (keys.length) {
    const signed = workDocs.filter((w) => w.sig);
    const bad = signed.filter((w) => !verifyWithAny(keys, w.hash, w.sig as string)).map((w) => w.id);
    if (bad.length) {
      ok(false, `${bad.length} signature(s) do not verify: ${bad.join(", ")}`, "entry changed after signing");
      chainOk = false;
    } else if (signed.length) {
      ok(true, `${signed.length}/${workDocs.length} works signed with Ed25519 and verified`);
      if (signed.length < workDocs.length) info(`${workDocs.length - signed.length} older work(s) predate signing`);
    } else {
      info("pubkey present but no entry is signed yet — signing starts on the next night");
    }
  } else {
    info("no site/pubkey.pem — entries are hash-chained only");
  }

  // ---------- 2b. The state entry has a ceiling ----------
  // ns:state grows one ref per work, forever. A Roblox DataStore entry is capped
  // at 256 KB and putEntry fails once it is exceeded — after which every night
  // fails, permanently, with an error that reads like a network problem rather
  // than "the plot is full". Measured 2026-10-24: 94 bytes a work, so 26 works a
  // night reaches the ceiling in about 108 nights. A cliff with a date on it
  // deserves a warning long before the date.
  const stateBytes = Buffer.byteLength(JSON.stringify(state));
  const perWork = state.works.length ? stateBytes / state.works.length : 0;
  if (perWork > 0) {
    const pct = Math.round((stateBytes / DATASTORE_ENTRY_LIMIT) * 100);
    const nightsLeft = Math.floor(
      (DATASTORE_ENTRY_LIMIT - stateBytes) / (perWork * MAX_WORKS_PER_NIGHT),
    );
    const line = `ns:state is ${stateBytes} B (${pct}% of the ${DATASTORE_ENTRY_LIMIT / 1024} KB entry limit, ${perWork.toFixed(0)} B/work)`;
    if (pct >= 50) {
      warn(`${line} — about ${nightsLeft} nights of 26 works left (see AUDIT.md: the state entry has a ceiling)`);
    } else {
      info(line);
    }
  }

  // ---------- 3. Tonight's state ----------
  console.log("\n\x1b[1m3. Tonight\x1b[0m");
  // Night numbers are YYYYMMDD, so subtracting them is not a day count:
  // 20261104 - 20261022 = 82, but the two dates are 13 days apart.
  const asDate = (n: number) => {
    const s = String(n);
    const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const plotDay = asDate(state.night);
  const today = asDate(tonight);
  const drift = plotDay && today ? Math.round((plotDay.getTime() - today.getTime()) / 86400000) : 0;
  if (!today) {
    warn(`NIGHT=${tonight} is not a real date — "has it run tonight" has no meaning until that is fixed`);
  } else if (state.night === tonight) {
    ok(true, `night ${tonight} already ran (idempotent guard held)`);
  } else if (!drift || drift < 0) {
    warn(`night ${tonight} has NOT run yet — cron should fire at 19:00 UTC / 02:00 TH`);
    // One missed night is a late cron (GitHub's schedule is best-effort and has
    // arrived three hours late here). Two is the schedule not firing at all,
    // which is what happened between 2026-10-22 and 2026-10-24.
    if (drift !== null && drift <= -2) {
      warn(`the schedule has missed ${Math.abs(drift)} night(s) — check Actions > Night Shift for a schedule run`);
    }
  } else {
    // The plot being ahead of the calendar is invisible from the outside: every
    // scheduled run prints "already ran tonight", exits 0, and looks exactly like
    // a healthy night. That is how twelve silent nights would go unnoticed.
    const catchesUp = new Date(plotDay!.getTime() + 86400000).toISOString().slice(0, 10);
    warn(`the plot is ${drift} night(s) AHEAD of the calendar (plot ${state.night}, today ${tonight})`);
    warn(`every scheduled run is a silent no-op until ${catchesUp} — dispatch with night=${state.night + 1} to advance`);
  }

  // ---------- 4. Site occupancy (would the next work collide?) ----------
  console.log("\n\x1b[1m4. Site map\x1b[0m");
  for (const w of state.works) {
    const d = Math.hypot(w.site.x - ORIGIN.x, w.site.z - ORIGIN.z);
    info(`${w.id} at (${w.site.x}, ${w.site.z}) — ${d.toFixed(1)} studs from origin`);
  }
  const lastWork = workDocs[workDocs.length - 1];
  if (lastWork && lastWork.form === "void") {
    warn(`last form was "void" — the shift produced nothing last night; tonight has to answer`);
  }

  // A void is a failure marker, not a style. The count is the health metric that
  // matters: on 2026-11-03 it was 7 of 15, all of them nights where the model
  // took the escape hatch the prompt offered it and got rejected for it.
  const voids = workDocs.filter((w) => w.form === "void");
  const voidPct = workDocs.length ? voids.length / workDocs.length : 0;
  info(`voids: ${voids.length}/${workDocs.length} (${Math.round(voidPct * 100)}%)`);
  if (voidPct > 0.25) {
    warn(`more than a quarter of the plot is empty nights — read site/raw/*.json for the rejection that caused them`);
  }

  const freeNear = !state.works.some((w) => Math.hypot(w.site.x, w.site.z) < MIN_SITE_DISTANCE);
  if (freeNear) ok(true, `origin (0,0) is free — a work may be placed there`);

  // ---------- 5. Telemetry (the feedback loop) ----------
  console.log("\n\x1b[1m5. Telemetry\x1b[0m");
  // A malformed NIGHT used to reach toISOString() as an Invalid Date and take the
  // whole diagnostic down with a RangeError. status is the tool you reach for when
  // a night has gone wrong; it must not be the first thing to die (run #23).
  const teleBase = new Date(
    `${String(tonight).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")}T00:00:00Z`,
  );
  if (Number.isNaN(teleBase.getTime())) {
    warn(`NIGHT=${tonight} is not a real date — cannot work out which 7 days to read`);
  } else {
    let teleDays = 0;
    let teleRows = 0;
    for (let i = 0; i < 7; i++) {
      // key format must match src/telemetry.lua: os.date("!%Y-%m-%d")
      const d = new Date(teleBase);
      d.setUTCDate(d.getUTCDate() - i);
      const day = d.toISOString().slice(0, 10);
      const t = await getEntry<Record<string, { near: number; dwell: number }>>(`ns:telemetry:${day}`);
      if (t && Object.keys(t).length) { teleDays++; teleRows += Object.keys(t).length; info(`${day}: ${Object.keys(t).length} work(s) tracked`); }
    }
    if (teleDays === 0) {
      warn("no telemetry in the last 7 days — nobody has visited the game, so the LLM has zero attention signal");
      warn("  fix: open the place with a player and stand near a work for >15s, then wait for the flush");
    } else {
      ok(true, `telemetry present on ${teleDays}/7 days, ${teleRows} work(s) tracked`);
    }
  }

  // ---------- 5b. The place's own report ----------
  // The repo cannot read the running place and the place cannot read the repo.
  // The only thing that crosses is BUILDER_VERSION, reported in ns:builder on
  // every server start. A place that was never re-installed after a change to
  // builder.lua reports an older number here — that is the whole detector.
  let placeOk = true;
  {
    const repoV = repoBuilderVersion();
    let placeV: BuilderReport | null = null;
    try {
      placeV = await getEntry<BuilderReport>("ns:builder");
    } catch {
      /* the store being unreachable is already a FAIL above */
    }
    const bv = compareBuilder(repoV, placeV);
    if (bv.state === "in-sync") ok(true, bv.detail);
    else if (bv.state === "stale") {
      ok(false, bv.detail);
      placeOk = false;
    } else if (bv.state === "unknown") {
      ok(false, bv.detail);
      placeOk = false;
    } else {
      warn(bv.detail);
    }
  }

  // ---------- 6. Public site ----------

  console.log("\n\x1b[1m6. Public site\x1b[0m");
  const logPath = join(__dirname, "..", "..", "site", "log.jsonl");
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
    ok(true, `site/log.jsonl has ${lines.length} entr${lines.length === 1 ? "y" : "ies"}`);
    // A line that does not parse is a broken public site, not a crash — status is
    // the tool you run when something is wrong, so it reports instead of throwing.
    const ids: string[] = [];
    let badLines = 0;
    for (const l of lines) {
      try {
        ids.push((JSON.parse(l) as { id: string }).id);
      } catch {
        badLines++;
      }
    }
    if (badLines) {
      ok(false, `${badLines} unparseable line(s) in log.jsonl`, "run `npm run resync`");
      siteOk = false;
    }
    const missing = state.works.map((w) => w.id).filter((id) => !ids.includes(id));
    // A FAIL, not a WARN: the DataStore is the truth and the file is derived, so
    // a file that is behind is a broken public site, not a hint. This used to
    // warn, which let CI stay green through exactly this drift on 2026-10-24.
    if (missing.length) {
      ok(false, `log.jsonl is missing: ${missing.join(", ")}`, "run `npm run resync`");
      siteOk = false;
    } else if (!badLines) ok(true, "log.jsonl matches DataStore works");
  } else {
    warn("site/log.jsonl not found");
    siteOk = false;
  }
  const prevDir = join(__dirname, "..", "..", "site", "previews");
  const noPreview = state.works.filter((w) => !existsSync(join(prevDir, `${w.id}.svg`)));
  if (noPreview.length) {
    ok(false, `missing preview svg: ${noPreview.map((w) => w.id).join(", ")}`, "run `npm run resync`");
    siteOk = false;
  } else if (state.works.length) ok(true, "every work has a preview svg");

  // ---------- 7. Next expected run ----------
  console.log("\n\x1b[1m7. Schedule\x1b[0m");
  // Two slots since v4: 19:00 UTC (02:00 TH) and 23:00 UTC (06:00 TH, the retry).
  const now = new Date();
  const slots = [19, 23].map((h) => {
    const d = new Date(now);
    d.setUTCHours(h, 0, 0, 0);
    if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  });
  const next = slots.sort((a, b) => a.getTime() - b.getTime())[0];
  info(`next cron: ${next.toISOString()} UTC = ${new Date(next.getTime() + 7 * 3600e3).toISOString().slice(0, 16)} Bangkok`);
  info(`hours until: ${((next.getTime() - now.getTime()) / 3600e3).toFixed(2)}`);

  console.log("");
  console.log(chainOk ? G("  overall: chain INTACT") : R("  overall: chain BROKEN"));
  console.log(siteOk ? G("  site: in sync with the DataStore") : R("  site: BEHIND — run `npm run resync`"));
  if (!placeOk) console.log(R("  place: STALE — the running place is behind this repo"));
  console.log("");
  // non-zero exit so CI fails fast on a broken chain or a stale public site
  if (!chainOk || !siteOk || !placeOk) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });

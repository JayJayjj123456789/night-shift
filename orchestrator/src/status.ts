// Progress checker: everything that can break, in one command.
// Usage: npm run status   (reads .env via env.ts)
import "./env";
import { getEntry, getNight } from "./datastore";
import { publicKeyPem, verifyHash } from "./sign";
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
  let prev = "genesis";
  let chainOk = true;
  let siteOk = true;
  const workDocs: Work[] = [];
  for (const ref of state.works) {
    const w = await getEntry<Work>(`ns:work:${ref.id}`);
    if (!w) { ok(false, `ns:work:${ref.id} missing from DataStore`); chainOk = false; continue; }
    workDocs.push(w);
    const expect = computeHash(w.night, w.title, w.form, w.site.x, w.site.z, w.journal, w.prevHash);
    const linkOk = w.prevHash === prev;
    const hashOk = expect === w.hash;
    if (!linkOk || !hashOk) {
      chainOk = false;
      ok(false, `${w.id}`, `link ${w.prevHash}!=${prev} | recomputed ${expect} != stored ${w.hash}`);
    } else {
      ok(true, `${w.id} ${w.form.padEnd(9)} hash=${w.hash}`);
    }
    prev = w.hash;
  }
  if (state.works.length === 0) warn("no works yet — chain is empty (valid genesis)");
  if (chainOk && state.works.length) ok(true, `chain head matches state.journalHead (${state.journalHead})`,
     state.journalHead !== prev ? `state head=${state.journalHead} but last work hash=${prev}` : "");
  if (state.journalHead !== prev) chainOk = false;

  // signatures: a hash chain alone is self-referential, a signature is not
  const pub = publicKeyPem();
  if (pub) {
    const signed = workDocs.filter((w) => w.sig);
    const bad = signed.filter((w) => !verifyHash(w.hash, w.sig as string, pub)).map((w) => w.id);
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

  // ---------- 3. Tonight's state ----------
  console.log("\n\x1b[1m3. Tonight\x1b[0m");
  const ranTonight = state.night >= tonight;
  if (ranTonight) ok(true, `already ran for night ${tonight} (idempotent guard held)`);
  else warn(`night ${tonight} has NOT run yet — cron should fire at 19:00 UTC / 02:00 TH`);

  // ---------- 4. Site occupancy (would the next work collide?) ----------
  console.log("\n\x1b[1m4. Site map\x1b[0m");
  for (const w of state.works) {
    const d = Math.hypot(w.site.x - ORIGIN.x, w.site.z - ORIGIN.z);
    info(`${w.id} at (${w.site.x}, ${w.site.z}) — ${d.toFixed(1)} studs from origin`);
  }
  const lastWork = workDocs[workDocs.length - 1];
  if (lastWork) {
    if (lastWork.form === "void") {
      warn(`last form was "void" — constitution forbids repeating it, so tonight the LLM must pick a real form`);
    }
    const voids = state.works.filter((w) => w.form === "void");
    if (voids.length) {
      const atOrigin = voids.some((w) => w.site.x === 0 && w.site.z === 0);
      if (atOrigin) {
        warn("a void work sits at (0,0) and still occupies the site — the next LLM must pick a spot >30 studs away");
      }
    }
  }
  const freeNear = !state.works.some((w) => Math.hypot(w.site.x, w.site.z) < MIN_SITE_DISTANCE);
  if (freeNear) ok(true, `origin (0,0) is free — a work may be placed there`);

  // ---------- 5. Telemetry (the feedback loop) ----------
  console.log("\n\x1b[1m5. Telemetry\x1b[0m");
  let teleDays = 0;
  let teleRows = 0;
  for (let i = 0; i < 7; i++) {
    // key format must match src/telemetry.lua: os.date("!%Y-%m-%d")
    const d = new Date(`${tonight.toString().replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")}T00:00:00Z`);
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

  // ---------- 6. Public site ----------
  console.log("\n\x1b[1m6. Public site\x1b[0m");
  const logPath = join(__dirname, "..", "..", "site", "log.jsonl");
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
    ok(true, `site/log.jsonl has ${lines.length} entr${lines.length === 1 ? "y" : "ies"}`);
    const ids = lines.map((l) => JSON.parse(l).id);
    const missing = state.works.map((w) => w.id).filter((id) => !ids.includes(id));
    // A FAIL, not a WARN: the DataStore is the truth and the file is derived, so
    // a file that is behind is a broken public site, not a hint. This used to
    // warn, which let CI stay green through exactly this drift on 2026-10-24.
    if (missing.length) {
      ok(false, `log.jsonl is missing: ${missing.join(", ")}`, "run `npm run resync`");
      siteOk = false;
    } else ok(true, "log.jsonl matches DataStore works");
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
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(19, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  info(`next cron: ${next.toISOString()} UTC = ${new Date(next.getTime() + 7 * 3600e3).toISOString().slice(0, 16)} Bangkok`);
  info(`hours until: ${((next.getTime() - now.getTime()) / 3600e3).toFixed(2)}`);

  console.log("");
  console.log(chainOk ? G("  overall: chain INTACT") : R("  overall: chain BROKEN"));
  console.log(siteOk ? G("  site: in sync with the DataStore") : R("  site: BEHIND — run `npm run resync`"));
  console.log("");
  // non-zero exit so CI fails fast on a broken chain or a stale public site
  if (!chainOk || !siteOk) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });

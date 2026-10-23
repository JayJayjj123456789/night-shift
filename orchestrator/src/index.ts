import "./env"; // must be first — loads .env into process.env
import { join } from "node:path";
import { Decision } from "./schema";
import type { State, Work } from "./schema";
import { getEntry, putEntry, publish, getNight } from "./datastore";
import { computeHash } from "./hash";
import { assertConstitution, freeSpot, OUTPUT_FORMS } from "./constitution";
import { askLLM, readTelemetry } from "./llm";
import { renderPreview } from "./preview";
import { signHash, writePublicKey } from "./sign";

/** One model answer, kept whether it was accepted or not. */
export type RawAttempt = {
  attempt: number;
  prompt?: string;
  content?: string;
  rejection?: string;
};

async function hesitate(state: State, reason: string, attempts: RawAttempt[] = []): Promise<void> {
  const prevHash = state.journalHead;
  const journal = "void no"; // both words are in the 200-word lexicon
  const usedIds = new Set(state.works.map((w) => w.id));
  const suffix = "abcdefghijklmnopqrstuvwxyz".split("").find(
    (c) => !usedIds.has(`n${getNight()}-${c}`),
  );
  if (!suffix) throw new Error(`too many works for night ${getNight()}`);
  const workId = `n${getNight()}-${suffix}`;
  // Not (0,0) any more. Every hesitation used to land on the spawn point, so
  // four of the seven voids on the chain sit on one pixel of the site map and
  // the 3D page draws a pile there. A void is still a place.
  let site = { x: 0, z: 0 };
  try {
    site = freeSpot(state.works);
  } catch {
    // plot full: fall back to the origin, which is at least a known position
  }
  const hash = computeHash(getNight(), "void", "void", site.x, site.z, journal, prevHash);
  const work: Work = {
    id: workId,
    night: getNight(),
    title: "void",
    intent: reason,
    form: "void",
    site,
    params: {},
    seed: getNight(),
    journal,
    prevHash,
    hash,
    sig: signHash(hash) ?? undefined,
    builderVersion: 1,
  };
  await putEntry(`ns:work:${work.id}`, work);
  await putEntry("ns:state", {
    ...state,
    night: getNight(),
    journalHead: hash,
    works: [...state.works, { id: work.id, site: work.site, form: work.form, title: work.title }],
  });
  await publish("nightshift", { type: "new_work", id: work.id });
  await publishWork(work);
  await writeRaw(workId, "hesitated", reason, attempts);
  console.log(`hesitated (${reason}) — wrote ${work.id}`);
}

/**
 * Where the public site lives, resolved from this file's location.
 * dist/index.js -> <repo>/orchestrator/dist  ->  site/ is at <repo>/site
 * (going up ONE level lands in orchestrator/, which is why this was wrong
 *  before: the log and previews were written to orchestrator/site/ and the
 *  GitHub Pages deploy never saw them).
 */
const SITE_DIR = join(__dirname, "..", "..", "site");

async function appendPublicLog(work: Work): Promise<void> {
  // append to site/log.jsonl for the static site to pick up
  const fs = await import("node:fs/promises");
  const { join } = await import("node:path");
  const line = JSON.stringify(work) + "\n";
  try {
    await fs.mkdir(SITE_DIR, { recursive: true });
    await fs.appendFile(join(SITE_DIR, "log.jsonl"), line, "utf8");
  } catch (e) {
    console.warn("appendPublicLog failed:", e);
  }
}

/**
 * Keep the model exchange next to the result. A rejected answer is the most
 * interesting thing the model produces, and until now it existed only as an
 * error string inside `intent` — "why did it write garden that night" was
 * unanswerable an hour later.
 */
async function writeRaw(
  id: string,
  outcome: "built" | "hesitated",
  reason: string,
  attempts: RawAttempt[],
): Promise<void> {
  const fs = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    const dir = join(SITE_DIR, "raw");
    await fs.mkdir(dir, { recursive: true });
    const record = {
      id,
      night: getNight(),
      outcome,
      reason,
      model: process.env.LLM_MODEL ?? "unknown",
      signed: Boolean(process.env.NS_SIGNING_KEY),
      attempts,
      at: new Date().toISOString(),
    };
    await fs.writeFile(join(dir, `${id}.json`), JSON.stringify(record, null, 2) + "\n", "utf8");
    // also keep it in the DataStore: the repo file only survives if the workflow
    // commit glob covers site/raw, and the whole lesson of this week is that a
    // file the runner writes is gone unless something durable holds it too
    await putEntry(`ns:raw:${id}`, record);
  } catch (e) {
    console.warn("writeRaw failed:", e);
  }
}

/**
 * Put a finished work on the public site: preview svg + one line of log.jsonl.
 * EVERY outcome goes through here, including a hesitation. A void is still a
 * result — and if it never reaches the file, the nightly commit has nothing to
 * commit, the step reports success, and the site silently falls a night behind
 * the DataStore. That is exactly what happened on 2026-10-24.
 */
async function publishWork(work: Work): Promise<void> {
  const fs = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    const previewDir = join(SITE_DIR, "previews");
    await fs.mkdir(previewDir, { recursive: true });
    await fs.writeFile(join(previewDir, `${work.id}.svg`), renderPreview(work), "utf8");
    await appendPublicLog(work);
  } catch (e) {
    console.warn("publishWork failed:", e);
  }
}


/**
 * Short enough to hand back to the model without eating the next prompt.
 * A Zod error serialises to kilobytes of JSON; truncating it mid-string produced
 * a rejection that began with "[" and told the model nothing.
 */
function describeRejection(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return trimmed.slice(0, 300);
  try {
    const issues = JSON.parse(trimmed) as { path?: (string | number)[]; message?: string }[];
    return issues
      .map((i) => `${(i.path ?? []).join(".") || "(root)"}: ${i.message}`)
      .join("; ")
      .slice(0, 300);
  } catch {
    return trimmed.slice(0, 300);
  }
}

/**
 * A rejection is only useful if it says what to do instead. "void is not
 * available" on its own just makes the model try void again in different words —
 * which is precisely what happened three times on 2026-11-02, all three rejected
 * for the same reason, and the night ended empty. So the rejection carries a
 * free site and a legal form with it.
 */
function voidHint(state: State): string {
  let spot = { x: 0, z: 0 };
  try {
    spot = freeSpot(state.works);
  } catch {
    /* plot full — the suggestion below is still better than nothing */
  }
  const used = new Set(state.works.map((w) => w.form));
  const open = OUTPUT_FORMS.filter((f) => !used.has(f));
  const last = state.works[state.works.length - 1]?.form;
  const usable = (open.length ? open : OUTPUT_FORMS).filter((f) => f !== last);
  const form = usable[0] ?? "light";
  return ` Use exactly this site: {"x": ${spot.x}, "z": ${spot.z}} and form "${form}".`;
}

export async function runNight(): Promise<void> {
  const state = (await getEntry<State>("ns:state")) ?? {
    night: 0,
    journalHead: "genesis",
    works: [],
    plot: { size: 512 },
  };

  if (state.night >= getNight()) {
    console.log("already ran tonight");
    return;
  }

  const attempts: RawAttempt[] = [];
  try {
    writePublicKey(); // publish site/pubkey.pem the first time a key is present
    const telemetry = await readTelemetry(state);

    // One shot used to be the whole story: if the model broke a rule, the night
    // fell straight to hesitate(). On 2026-10-24 it wrote "garden" — a word the
    // 200-word allowlist does not contain — and a night with a perfectly good
    // idea became a void at (0,0). Hand the rejection back and let it correct
    // itself once before giving up.
    let d: Decision | null = null;
    let rejection = "";
    // Three, not two: a truncated answer burns an attempt, and a night with only
    // two tries spends them on noise.
    for (let attempt = 1; attempt <= 3 && !d; attempt++) {
      const raw = await askLLM(state, telemetry, rejection || undefined, (r) => {
        attempts.push({ attempt: attempts.length + 1, prompt: r.prompt, content: r.content });
      });
      try {
        const parsed = Decision.parse(raw);
        assertConstitution(parsed, state);
        d = parsed;
      } catch (e) {
        rejection = describeRejection(e);
        if (rejection.includes("void is not available")) rejection += voidHint(state);
        const last = attempts[attempts.length - 1];
        if (last) last.rejection = rejection;
        console.warn(`attempt ${attempt} rejected: ${rejection}`);
      }
    }
    if (!d) throw new Error(`no valid decision after 3 attempts — last: ${rejection}`);

    const prevHash = state.journalHead;

    // The id must be unique across the whole plot, not just within a night.
    // "n{NIGHT}-a" collided with an earlier work from the same night (a re-run
    // overwrote the old entry and left two refs with the same id in state).
    // Take the next free letter suffix.
    const usedIds = new Set(state.works.map((w) => w.id));
    const suffix = "abcdefghijklmnopqrstuvwxyz".split("").find(
      (c) => !usedIds.has(`n${getNight()}-${c}`),
    );
    if (!suffix) throw new Error(`too many works for night ${getNight()}`);
    const workId = `n${getNight()}-${suffix}`;

    const hash = computeHash(
      getNight(), d.title, d.form, d.site.x, d.site.z, d.journal, prevHash, d.parts,
    );

    const work: Work = {
      ...d,
      id: workId,
      night: getNight(),
      seed: getNight(),
      prevHash,
      hash,
      sig: signHash(hash) ?? undefined,
      builderVersion: 1,
    };

    await putEntry(`ns:work:${work.id}`, work);
    await putEntry("ns:state", {
      ...state,
      night: getNight(),
      journalHead: hash,
      works: [...state.works, { id: work.id, site: work.site, form: work.form, title: work.title }],
    });

    await publish("nightshift", { type: "new_work", id: work.id, site: work.site, form: work.form });

    await publishWork(work);
    await writeRaw(work.id, "built", "", attempts);
    console.log(`built ${work.id} — ${d.form} at (${d.site.x}, ${d.site.z}) hash=${hash}`);
  } catch (e) {
    console.warn("runNight failed, hesitating:", e);
    await hesitate(state, String(e), attempts);
  }
}

// run when invoked directly
if (require.main === module) {
  runNight().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

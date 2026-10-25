import "./env"; // must be first — loads .env into process.env
import { join } from "node:path";
import { Decision } from "./schema";
import type { State, Work } from "./schema";
import { getEntry, putEntry, publish, getNight, WIPE_NIGHT } from "./datastore";
import { computeHash } from "./hash";
import { assertConstitution, freeSpot, OUTPUT_FORMS } from "./constitution";
import { askLLM, readTelemetry } from "./llm";
import type { Attention } from "./llm";
import { renderPreview } from "./preview";
import { signHash, writePublicKey, publishPublicKey } from "./sign";
import { wipePlot } from "./wipe";

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
    // Truncated: this path skips Decision.parse, so a multi-kilobyte stack trace
    // used to land in the public log as `intent`.
    intent: reason.slice(0, 200),
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

/** A work id is n{night}-{a..z}, so 26 is the ceiling, not a preference. */
const MAX_WORKS_PER_NIGHT = 26;

/**
 * The workflow gives this job 20 minutes. A greedy night on a free-tier rate
 * limit can spend all of them, so the loop stops itself well before that and
 * keeps whatever it has already built — a night that made nine things and ran
 * out of time is a night that made nine things.
 */
const NIGHT_BUDGET_MS = 12 * 60 * 1000;

type NextWork =
  | { kind: "work"; d: Decision }
  | { kind: "stop" }
  | { kind: "fail"; reason: string };

/**
 * Ask the model for one work, with the plot as it currently stands.
 *
 * The night is a conversation now, not a single question: it answers, the plot
 * changes, it is asked again. It ends the night by answering {"done": true} —
 * the only sentence in this system that is not a work.
 */
async function nextWork(
  state: State,
  telemetry: Attention[],
  attempts: RawAttempt[],
): Promise<NextWork> {
  let rejection = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await askLLM(state, telemetry, rejection || undefined, (r) => {
      attempts.push({ attempt: attempts.length + 1, prompt: r.prompt, content: r.content });
    });
    if (raw && typeof raw === "object" && (raw as { done?: unknown }).done === true) {
      return { kind: "stop" };
    }
    try {
      const parsed = Decision.parse(raw);
      assertConstitution(parsed, state);
      return { kind: "work", d: parsed };
    } catch (e) {
      rejection = describeRejection(e);
      if (rejection.includes("void is not available")) rejection += voidHint(state);
      const last = attempts[attempts.length - 1];
      if (last) last.rejection = rejection;
      console.warn(`attempt ${attempt} rejected: ${rejection}`);
    }
  }
  return { kind: "fail", reason: `no valid decision after 3 attempts — last: ${rejection}` };
}

export async function runNight(): Promise<void> {
  let state = (await getEntry<State>("ns:state")) ?? {
    night: 0,
    journalHead: "genesis",
    works: [],
    plot: { size: 512 },
  };

  if (state.night >= getNight()) {
    // Say WHY, and say it loudly when the plot has run ahead of the calendar.
    // A silent no-op and a healthy night look identical in the Actions list —
    // that is the lesson this project keeps relearning. Night numbers are
    // YYYYMMDD, so they are compared as dates, never subtracted.
    const asDate = (n: number) => {
      const s = String(n);
      const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const plotDay = asDate(state.night);
    const today = asDate(getNight());
    const drift = plotDay && today ? Math.round((plotDay.getTime() - today.getTime()) / 86400000) : 0;
    console.log(`already ran tonight — plot is at night ${state.night}, calendar says ${getNight()}`);
    if (drift > 0) {
      console.warn(
        `the plot is ${drift} night(s) ahead of the calendar: this run built nothing. `
        + `Dispatch with night=${state.night + 1} to advance the plot.`,
      );
    }
    return;
  }

  const attempts: RawAttempt[] = [];
  try {
    writePublicKey(); // site/pubkey.pem (current) + site/pubkeys/{fp}.pem
    await publishPublicKey(); // append-only ring in the DataStore, so a rotation cannot brick it
    const telemetry = await readTelemetry(state);

    // ── the night is a loop ────────────────────────────────────────────────
    // It used to be one question and one answer. Now the model is asked for a
    // work, sees the plot with that work in it, and decides whether to make
    // another — up to 26, because that is how many id suffixes a night has.
    const t0 = Date.now();
    let built = 0;
    let lastError = "";

    while (built < MAX_WORKS_PER_NIGHT && Date.now() - t0 < NIGHT_BUDGET_MS) {
      let r: NextWork;
      try {
        r = await nextWork(state, telemetry, attempts);
      } catch (e) {
        lastError = String(e);
        break;
      }
      if (r.kind === "stop") {
        console.log(`the shift stopped after ${built} work(s)`);
        break;
      }
      if (r.kind === "fail") {
        lastError = r.reason;
        break;
      }

      const d = r.d;
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
      const nextState: State = {
        ...state,
        night: getNight(),
        journalHead: hash,
        works: [...state.works, { id: work.id, site: work.site, form: work.form, title: work.title }],
      };
      await putEntry("ns:state", nextState);
      state = nextState;

      await publish("nightshift", { type: "new_work", id: work.id, site: work.site, form: work.form });

      await publishWork(work);
      await writeRaw(work.id, "built", "", attempts);
      built++;
      console.log(
        `built ${work.id} — ${d.form} at (${d.site.x}, ${d.site.z}) hash=${hash}`
        + ` [${built}/${MAX_WORKS_PER_NIGHT}, ${Math.round((Date.now() - t0) / 1000)}s]`,
      );
    }

    if (built === 0) {
      // Nothing at all was made: that is exactly the night hesitate() exists for.
      throw new Error(lastError || "the shift produced no work");
    }
    console.log(`night ${getNight()} — ${built} work(s) on the plot`);
  } catch (e) {
    console.warn("runNight failed, hesitating:", e);
    await hesitate(state, String(e), attempts);
  }
}

// run when invoked directly
if (require.main === module) {
  // NIGHT=19700101 is the wipe sentinel: clear the plot, then build tonight on
  // the empty one. The dispatch token cannot edit a workflow file, so the
  // command travels in the date — and this branch is the only place it is read.
  if (getNight() === WIPE_NIGHT) {
    (async () => {
      const { night } = await wipePlot(`wipe-${new Date().toISOString().slice(0, 10)}`);
      process.env.NIGHT = String(night);
      console.log(`NIGHT reset to ${night} — building on the empty plot`);
      await runNight();
    })().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  } else {
    runNight().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}

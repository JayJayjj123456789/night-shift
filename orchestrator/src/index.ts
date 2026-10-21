import "./env"; // must be first — loads .env into process.env
import { Decision } from "./schema";
import type { State, Work } from "./schema";
import { getEntry, putEntry, publish, getNight } from "./datastore";
import { computeHash } from "./hash";
import { assertConstitution } from "./constitution";
import { askLLM, readTelemetry } from "./llm";
import { renderPreview } from "./preview";

async function hesitate(state: State, reason: string): Promise<void> {
  const prevHash = state.journalHead;
  const journal = "ฉันลังเล";
  const hash = computeHash(getNight(), "void", "void", 0, 0, journal, prevHash);
  const work: Work = {
    id: `n${getNight()}-void`,
    night: getNight(),
    title: "void",
    intent: reason,
    form: "void",
    site: { x: 0, z: 0 },
    params: {},
    seed: getNight(),
    journal,
    prevHash,
    hash,
    builderVersion: 1,
  };
  await putEntry(`ns:work:${work.id}`, work);
  await putEntry("ns:state", {
    ...state,
    night: getNight(),
    journalHead: hash,
    works: [...state.works, { id: work.id, site: work.site, form: work.form }],
  });
  await publish("nightshift", { type: "new_work", id: work.id });
  console.log(`hesitated (${reason}) — wrote ${work.id}`);
}

async function appendPublicLog(work: Work): Promise<void> {
  // append to site/log.jsonl for the static site to pick up
  const fs = await import("node:fs/promises");
  const { join } = await import("node:path");
  const line = JSON.stringify(work) + "\n";
  try {
    await fs.appendFile(join(__dirname, "..", "site", "log.jsonl"), line, "utf8");
  } catch (e) {
    console.warn("appendPublicLog failed:", e);
  }
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

  try {
    const telemetry = await readTelemetry(state);
    const raw = await askLLM(state, telemetry);
    const d = Decision.parse(raw);
    assertConstitution(d, state);

    const prevHash = state.journalHead;
    const hash = computeHash(getNight(), d.title, d.form, d.site.x, d.site.z, d.journal, prevHash);

    const work: Work = {
      ...d,
      id: `n${getNight()}-a`,
      night: getNight(),
      seed: getNight(),
      prevHash,
      hash,
      builderVersion: 1,
    };

    await putEntry(`ns:work:${work.id}`, work);
    await putEntry("ns:state", {
      ...state,
      night: getNight(),
      journalHead: hash,
      works: [...state.works, { id: work.id, site: work.site, form: work.form }],
    });

    await publish("nightshift", { type: "new_work", id: work.id, site: work.site, form: work.form });

    const svg = renderPreview(work);
    const fs = await import("node:fs/promises");
    const { join: joinPath } = await import("node:path");
    const previewDir = joinPath(__dirname, "..", "site", "previews");
    await fs.mkdir(previewDir, { recursive: true });
    await fs.writeFile(joinPath(previewDir, `${work.id}.svg`), svg, "utf8");

    await appendPublicLog(work);
    console.log(`built ${work.id} — ${d.form} at (${d.site.x}, ${d.site.z}) hash=${hash}`);
  } catch (e) {
    console.warn("runNight failed, hesitating:", e);
    await hesitate(state, String(e));
  }
}

// run when invoked directly
if (require.main === module) {
  runNight().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

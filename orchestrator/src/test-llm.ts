// Dry-run test: call LLM directly with a stub state, skip DataStore entirely.
// Usage: node dist/test-llm.js
//
// Pass --n=5 to run the LLM several times and see how often the result would
// pass the constitution. Pass --live to use the real state from DataStore.
import "./env"; // must be first — loads .env into process.env
import { Decision } from "./schema";
import type { State, Decision as DecisionT } from "./schema";
import { askLLM, type Attention } from "./llm";
import { assertConstitution } from "./constitution";

const argN = Number((process.argv.find((a) => a.startsWith("--n=")) ?? "--n=1").slice(4)) || 1;
const live = process.argv.includes("--live");

/** A stub plot that already holds one work, so the prompt exercises the
 *  "keep away from existing works" and "do not repeat the form" paths. */
const stubState: State = {
  night: 20261022,
  journalHead: "53822464967a18dc",
  works: [{ id: "n20261022-a", site: { x: 0, z: 0 }, form: "void" }],
  plot: { size: 512 },
};

const stubTelemetry: Attention[] = [
  { workId: "n20261022-a", near: 12, dwellSeconds: 300, verdict: "loved" },
];

async function main() {
  const key = process.env.LLM_API_KEY;
  if (!key) {
    console.error("set LLM_API_KEY first");
    process.exit(1);
  }

  let state = stubState;
  let telemetry = stubTelemetry;

  if (live) {
    const { getEntry, getNight } = await import("./datastore");
    const s = await getEntry<State>("ns:state");
    if (!s) {
      console.error("live: ns:state is empty");
      process.exit(1);
    }
    state = s;
    const { readTelemetry } = await import("./llm");
    telemetry = await readTelemetry(s);
    console.log(`live state: night=${s.night} works=${s.works.length}`);
  }

  console.log(`calling LLM ${argN}x with ${live ? "live" : "stub"} state...`);

  let pass = 0;
  let fail = 0;
  let llmError = 0;
  let voids = 0;
  const seen: string[] = [];

  for (let i = 0; i < argN; i++) {
    try {
      const raw = await askLLM(state, telemetry);
      const parsed = Decision.parse(raw);

      try {
        assertConstitution(parsed, state);
        pass++;
        const dist = Math.hypot(
          parsed.site.x - (state.works[0]?.site.x ?? 0),
          parsed.site.z - (state.works[0]?.site.z ?? 0),
        );
        console.log(
          `  run ${i + 1}: PASS  ${parsed.form} @(${parsed.site.x}, ${parsed.site.z}) ` +
            `dist=${dist.toFixed(0)} title="${parsed.title}"`,
        );
        seen.push(`${parsed.form}@(${parsed.site.x},${parsed.site.z}) "${parsed.title}"`);
      } catch (e) {
        fail++;
        console.log(`  run ${i + 1}: CONSTITUTION FAIL  ${(e as Error).message}`);
        console.log(`            form=${parsed.form} title="${parsed.title}"`);
      }
      if (parsed.form === "void") voids++;
    } catch (e) {
      llmError++;
      console.log(`  run ${i + 1}: LLM ERROR  ${(e as Error).message.slice(0, 160)}`);
    }
    // Groq free tier: 8000 TPM. A ~1000-token prompt + 1500 output does not
    // fit three times a minute, so space the calls out.
    if (i < argN - 1) await new Promise((r) => setTimeout(r, 12_000));
  }

  console.log(`\nresult: constitution PASS ${pass}/${argN} | FAIL ${fail}/${argN} | LLM ERROR ${llmError}/${argN} | void ${voids}/${argN}`);
  if (seen.length) {
    console.log("works:");
    for (const s of seen) console.log("  ", s);
  }
  if (fail || llmError) process.exit(1);
}

main().catch((e) => {
  console.error("test failed:", e);
  process.exit(1);
});

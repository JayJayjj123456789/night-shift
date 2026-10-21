// Dry-run test: call LLM directly with a stub state, skip DataStore entirely.
// Usage: node dist/test-llm.js
import "./env"; // must be first — loads .env into process.env
import { Decision } from "./schema";
import { askLLM, type Attention } from "./llm";

async function main() {
  const key = process.env.LLM_API_KEY;
  if (!key) {
    console.error("set LLM_API_KEY first");
    process.exit(1);
  }

  const stubState = {
    night: 0,
    journalHead: "genesis",
    works: [] as { id: string; site: { x: number; z: number }; form: "monolith" | "garden" | "machine" | "text" | "light" | "void" }[],
    plot: { size: 512 },
  };

  const stubTelemetry: Attention[] = [];

  console.log("calling LLM with stub state...");
  const raw = await askLLM(stubState, stubTelemetry);
  console.log("raw response:", JSON.stringify(raw, null, 2));

  const parsed = Decision.parse(raw);
  console.log("\nparsed Decision:");
  console.log("  title:", parsed.title);
  console.log("  form:", parsed.form);
  console.log("  site:", parsed.site);
  console.log("  params:", parsed.params);
  console.log("  journal:", parsed.journal);

  // lexicon check
  const { inLexicon } = await import("./lexicon");
  console.log("\nlexicon check:");
  console.log("  title:", inLexicon(parsed.title) ? "OK" : "FAIL (outside 200-word allowlist)");
  console.log("  journal:", inLexicon(parsed.journal) ? "OK" : "FAIL (outside 200-word allowlist)");
}

main().catch((e) => {
  console.error("test failed:", e);
  process.exit(1);
});

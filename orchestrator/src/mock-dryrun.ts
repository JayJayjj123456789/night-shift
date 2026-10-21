// Mock dry-run: exercise runNight() end-to-end with an in-memory DataStore.
// No real Roblox calls. Writes to ./mock-datastore.json instead.
import "./env";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// --- In-memory mock of datastore module ---
const store = new Map<string, unknown>();
const storePath = join(__dirname, "..", "mock-datastore.json");

if (existsSync(storePath)) {
  const data = JSON.parse(readFileSync(storePath, "utf8"));
  for (const [k, v] of Object.entries(data)) store.set(k, v);
}

function flush() {
  const obj = Object.fromEntries(store.entries());
  writeFileSync(storePath, JSON.stringify(obj, null, 2), "utf8");
}

// Monkey-patch datastore functions before index.ts uses them
const datastore = require("./datastore");

datastore.getEntry = async function mockGet<T>(key: string): Promise<T | null> {
  console.log(`[mock] GET ${key}`);
  return (store.get(key) as T) ?? null;
};

datastore.putEntry = async function mockPut(key: string, value: unknown): Promise<void> {
  console.log(`[mock] PUT ${key}`);
  store.set(key, value);
  flush();
};

datastore.publish = async function mockPublish(topic: string, payload: unknown): Promise<void> {
  console.log(`[mock] PUBLISH ${topic}:`, payload);
};

// --- Now run runNight ---
import { runNight } from "./index";

(async () => {
  console.log("=== MOCK DRY-RUN ===");
  console.log("night:", process.env.NIGHT);
  console.log("universe (not used in mock):", process.env.UNIVERSE_ID);
  console.log("\ninitial mock datastore:", Object.fromEntries(store.entries()));

  await runNight();

  console.log("\nfinal mock datastore:");
  for (const [k, v] of store.entries()) {
    console.log(`  ${k}:`, JSON.stringify(v).slice(0, 120));
  }

  // check preview file
  const { existsSync: fx } = require("node:fs") as typeof import("node:fs");
  if (process.env.NIGHT) {
    const previewPath = join(__dirname, "..", "previews", `n${process.env.NIGHT}-a.svg`);
    console.log("\npreview file exists:", fx(previewPath));
  }
})().catch((e) => {
  console.error("mock dry-run failed:", e);
  process.exit(1);
});

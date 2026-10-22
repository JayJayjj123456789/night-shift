// Loads .env from orchestrator/.env into process.env. Import this FIRST.
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const envText = readFileSync(join(__dirname, "..", ".env"), "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  } catch {
  // .env optional — real env vars still work
}

// Decode *_B64 → real key if present (avoids redaction in some file tools)
// ROBLOX_API_KEY_B64 is SINGLE base64 of the full key string (baseApiKey + JWT)
if (process.env.ROBLOX_API_KEY_B64 && !process.env.ROBLOX_API_KEY) {
  process.env.ROBLOX_API_KEY = Buffer.from(process.env.ROBLOX_API_KEY_B64, "base64").toString("utf8");
}

if (process.env.LLM_API_KEY_B64 && !process.env.LLM_API_KEY) {
  process.env.LLM_API_KEY = Buffer.from(process.env.LLM_API_KEY_B64, "base64").toString("utf8");
}

const BASE = "https://apis.roblox.com";
const STORE = "NightShift_v1";

function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
}

function getKey(): string {
  return mustEnv("ROBLOX_API_KEY");
}

function getUniverse(): string {
  return mustEnv("UNIVERSE_ID");
}

export async function getEntry<T>(key: string): Promise<T | null> {
  const r = await fetch(
    `${BASE}/cloud/v2/universes/${getUniverse()}/data-stores/${STORE}/entries/${encodeURIComponent(key)}`,
    { headers: { "x-api-key": getKey() } },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`get ${key} -> ${r.status}`);
  return ((await r.json()) as { value: T }).value;
}

export async function putEntry(key: string, value: unknown): Promise<void> {
  const r = await fetch(
    `${BASE}/cloud/v2/universes/${getUniverse()}/data-stores/${STORE}/entries/${encodeURIComponent(key)}?allowMissing=true`,
    {
      method: "PATCH",
      headers: { "x-api-key": getKey(), "content-type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  if (!r.ok) throw new Error(`put ${key} -> ${r.status}: ${await r.text()}`);
}

export async function publish(topic: string, payload: unknown): Promise<void> {
  const message = JSON.stringify(payload);
  if (Buffer.byteLength(message) > 1000) {
    throw new Error(`message too large: ${Buffer.byteLength(message)} bytes`);
  }
  const r = await fetch(`${BASE}/cloud/v2/universes/${getUniverse()}:publishMessage`, {
    method: "POST",
    headers: { "x-api-key": getKey(), "content-type": "application/json" },
    body: JSON.stringify({ topic, message }),
  });
  if (!r.ok) throw new Error(`publish -> ${r.status}`);
}

export function getNight(): number {
  return Number(mustEnv("NIGHT"));
}

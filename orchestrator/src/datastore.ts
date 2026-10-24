const BASE = "https://apis.roblox.com";
const STORE = "NightShift_v1";

/**
 * Retry a store call on the failures that are the store's fault, not ours.
 *
 * The LLM path has had three attempts and a backoff for a while; the DataStore
 * path had one shot. A single 502 — which happened on 2026-10-24 during a read,
 * and Roblox returns them — took the whole night with it, because a night that
 * cannot read the plot cannot build on it, and the idempotent guard then refuses
 * to run that night again. One transient error became a permanent empty night.
 *
 * 404 is NOT retried: it is the answer "there is no such entry", not a failure.
 * 400/403 are not retried either — they will fail identically forever.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [1000, 3000, 7000];

async function withRetry<T>(label: string, fn: () => Promise<Response>): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const r = await fn();
      if (r.ok || !RETRYABLE.has(r.status)) return r;
      last = new Error(`${label} -> ${r.status}`);
    } catch (e) {
      // fetch itself threw — DNS, socket, TLS. The same class as a 502.
      last = e;
    }
    if (attempt < BACKOFF_MS.length) {
      await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt]));
    }
  }
  throw last instanceof Error ? last : new Error(`${label} failed: ${String(last)}`);
}

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
  const r = await withRetry(`get ${key}`, () =>
    fetch(
      `${BASE}/cloud/v2/universes/${getUniverse()}/data-stores/${STORE}/entries/${encodeURIComponent(key)}`,
      { headers: { "x-api-key": getKey() } },
    ),
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`get ${key} -> ${r.status}`);
  return ((await r.json()) as { value: T }).value;
}

export async function putEntry(key: string, value: unknown): Promise<void> {
  const r = await withRetry(`put ${key}`, () =>
    fetch(
      `${BASE}/cloud/v2/universes/${getUniverse()}/data-stores/${STORE}/entries/${encodeURIComponent(key)}?allowMissing=true`,
      {
        method: "PATCH",
        headers: { "x-api-key": getKey(), "content-type": "application/json" },
        body: JSON.stringify({ value }),
      },
    ),
  );
  if (!r.ok) throw new Error(`put ${key} -> ${r.status}: ${await r.text()}`);
}

export async function publish(topic: string, payload: unknown): Promise<void> {
  const message = JSON.stringify(payload);
  if (Buffer.byteLength(message) > 1000) {
    throw new Error(`message too large: ${Buffer.byteLength(message)} bytes`);
  }
  // Retried on purpose: a dropped message means the live game does not build the
  // work until it restarts, and a duplicate is harmless — build() destroys the
  // existing model before rebuilding, so the subscriber is idempotent.
  const r = await withRetry("publish", () =>
    fetch(`${BASE}/cloud/v2/universes/${getUniverse()}:publishMessage`, {
      method: "POST",
      headers: { "x-api-key": getKey(), "content-type": "application/json" },
      body: JSON.stringify({ topic, message }),
    }),
  );
  if (!r.ok) throw new Error(`publish -> ${r.status}`);
}

export function getNight(): number {
  const raw = mustEnv("NIGHT");
  // A typo in a manual dispatch used to reach computeHash as NaN, and a work
  // whose night is NaN chains forever without anyone being able to order it.
  // Refuse at the door instead.
  if (!/^\d{8}$/.test(raw)) {
    throw new Error(`NIGHT='${raw}' is not YYYYMMDD — refusing to build a night on a malformed date`);
  }
  return Number(raw);
}

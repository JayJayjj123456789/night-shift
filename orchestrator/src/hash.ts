import { createHash } from "node:crypto";
import type { Part } from "./schema";

/**
 * JSON with object keys sorted, recursively.
 *
 * This exists because of the bug that broke the chain on 2026-10-24: a work's
 * hash was computed over `JSON.stringify` of the object as it sat in memory, in
 * the key order the model happened to send. The DataStore returns that value with
 * keys sorted alphabetically, so the same work stringified differently after a
 * round-trip and every work carrying `parts` — an array of objects — failed
 * verification. It stayed invisible for fifteen nights because nothing had ever
 * built an assembly; the first night that built five of them broke at once.
 *
 * A hash over a value that crosses a JSON store must not depend on key order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export const sha = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

/**
 * sha256([night, title, form, x, z, journal, prevHash]) — plus the part list
 * when the work has one.
 *
 * The parts element is appended ONLY when it is present. Works built before the
 * parts schema existed have no such field, and they must keep the exact hash
 * they were published with: appending a null for them would invalidate every
 * hash already on the chain, and the site would report a break at entry one.
 */
export function computeHash(
  night: number,
  title: string,
  form: string,
  siteX: number,
  siteZ: number,
  journal: string,
  prevHash: string,
  parts?: Part[] | null,
): string {
  const payload: unknown[] = [night, title, form, siteX, siteZ, journal, prevHash];
  if (parts !== undefined && parts !== null) payload.push(parts);
  // canonical, not raw: the store reorders object keys and the hash must not care
  return sha(canonicalJson(payload)).slice(0, 16);
}

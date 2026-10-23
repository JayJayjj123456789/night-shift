import { createHash } from "node:crypto";
import type { Part } from "./schema";

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
  return sha(JSON.stringify(payload)).slice(0, 16);
}

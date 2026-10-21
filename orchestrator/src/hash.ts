import { createHash } from "node:crypto";

export const sha = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

export function computeHash(
  night: number,
  title: string,
  form: string,
  siteX: number,
  siteZ: number,
  journal: string,
  prevHash: string,
): string {
  return sha(JSON.stringify([night, title, form, siteX, siteZ, journal, prevHash])).slice(0, 16);
}

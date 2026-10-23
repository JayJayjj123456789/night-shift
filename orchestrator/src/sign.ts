// Optional Ed25519 attestation for each work.
//
// The hash chain is self-referential: rewrite log.jsonl, recompute every hash,
// and the client-side verifier is perfectly happy. A signature breaks that —
// the private key never leaves the CI secret store, so a rewritten entry cannot
// carry a valid signature. Verify against site/pubkey.pem.
//
// Absent key = no signing, and nothing breaks. The night must never die because
// an attestation was unavailable.
//
// ── why there is a KEY RING and not one key ─────────────────────────────────
//
// Verification used to check every signature against whatever key was current.
// Regenerate NS_SIGNING_KEY once and the next night overwrites pubkey.pem, every
// signature ever made stops verifying, resync exits 3, and the workflow fails —
// for every night after that, because an old signature can never verify against
// a new public key. It does not degrade; it stops, and it looks exactly like
// somebody edited history.
//
// So keys are published append-only and a signature is valid if it verifies
// against ANY published key:
//   site/pubkeys/{fingerprint}.pem   files, committed if the glob covers them
//   ns:pubkeys                       [{fp, pem}] in the DataStore — the real
//                                    history, because the store is the truth
// `pubkey.pem` stays as the CURRENT key for anything that already reads it.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getEntry, putEntry } from "./datastore";

const SITE_DIR = join(__dirname, "..", "..", "site");
const PUB_PATH = join(SITE_DIR, "pubkey.pem");
const KEYS_DIR = join(SITE_DIR, "pubkeys");
const KEY_RING = "ns:pubkeys";

let cached: { key: KeyObject; pub: string } | null | undefined;

/** Short stable id for a public key — the filename and the ring entry. */
export function fingerprint(pem: string): string {
  return createHash("sha256").update(pem.trim()).digest("hex").slice(0, 16);
}

/** The signing key from NS_SIGNING_KEY (base64 of a PKCS8 PEM), or null. */
export function signer(): { key: KeyObject; pub: string } | null {
  if (cached !== undefined) return cached;
  const b64 = process.env.NS_SIGNING_KEY;
  if (!b64) {
    cached = null;
    return null;
  }
  try {
    const key = createPrivateKey(Buffer.from(b64, "base64").toString("utf8"));
    const pub = createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
    cached = { key, pub };
    return cached;
  } catch (e) {
    console.warn("NS_SIGNING_KEY is set but unusable — continuing unsigned:", String(e));
    cached = null;
    return null;
  }
}

/** base64 signature over the work's hash, or null when there is no key. */
export function signHash(hash: string): string | null {
  const s = signer();
  if (!s) return null;
  return cryptoSign(null, Buffer.from(hash, "utf8"), s.key).toString("base64");
}

export function verifyHash(hash: string, sig: string, pubPem: string): boolean {
  try {
    return cryptoVerify(
      null,
      Buffer.from(hash, "utf8"),
      createPublicKey(pubPem),
      Buffer.from(sig, "base64"),
    );
  } catch {
    return false;
  }
}

/**
 * The key a signature belongs to, or null when none of them accept it.
 * A signature is valid if it verifies against any published key — that is the
 * whole point of the ring.
 */
export function verifyWithAny(keys: string[], hash: string, sig: string): string | null {
  for (const k of keys) if (verifyHash(hash, sig, k)) return k;
  return null;
}

/** Public key to publish on the site: from the key if present, else the file. */
export function publicKeyPem(): string | null {
  const s = signer();
  if (s) return s.pub;
  return existsSync(PUB_PATH) ? readFileSync(PUB_PATH, "utf8") : null;
}

/** Every public key this checkout knows about, from disk. */
export function localKeys(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (pem: string) => {
    const fp = fingerprint(pem);
    if (seen.has(fp)) return;
    seen.add(fp);
    out.push(pem.trim() + "\n");
  };
  if (existsSync(KEYS_DIR)) {
    for (const f of readdirSync(KEYS_DIR).sort()) {
      if (!f.endsWith(".pem")) continue;
      try {
        push(readFileSync(join(KEYS_DIR, f), "utf8"));
      } catch {
        /* unreadable file: the ring in the DataStore is the backstop */
      }
    }
  }
  if (existsSync(PUB_PATH)) push(readFileSync(PUB_PATH, "utf8"));
  return out;
}

/**
 * Every key this system has ever signed with: the local files plus the ring in
 * the DataStore. Async because the ring is a store read; a store that cannot be
 * reached falls back to the local files rather than failing the verification.
 */
export async function allKeys(): Promise<string[]> {
  const local = localKeys();
  const seen = new Set(local.map(fingerprint));
  const out = [...local];
  try {
    const ring = (await getEntry<{ fp: string; pem: string }[]>(KEY_RING)) ?? [];
    for (const k of ring) {
      if (!k || typeof k.pem !== "string" || seen.has(k.fp)) continue;
      seen.add(k.fp);
      out.push(k.pem.trim() + "\n");
    }
  } catch (e) {
    console.warn("allKeys: could not read ns:pubkeys — using local keys only:", String(e));
  }
  return out;
}

/**
 * Publish the current key without ever forgetting an older one: a file per
 * fingerprint, `pubkey.pem` kept as the current key, and the ring in the store.
 */
export function writePublicKey(): boolean {
  const s = signer();
  if (!s) return false;
  const fp = fingerprint(s.pub);
  const keyPath = join(KEYS_DIR, `${fp}.pem`);
  if (!existsSync(keyPath)) {
    mkdirSync(KEYS_DIR, { recursive: true });
    writeFileSync(keyPath, s.pub, "utf8");
  }
  const existing = existsSync(PUB_PATH) ? readFileSync(PUB_PATH, "utf8") : "";
  if (existing !== s.pub) writeFileSync(PUB_PATH, s.pub, "utf8");
  return true;
}

/**
 * Add the current key to the ring. Idempotent, append-only, and the only thing
 * that makes a future rotation survivable. Never throws: a night must not die
 * because the ring could not be written.
 */
export async function publishPublicKey(): Promise<void> {
  const s = signer();
  if (!s) return;
  const fp = fingerprint(s.pub);
  try {
    const ring = (await getEntry<{ fp: string; pem: string }[]>(KEY_RING)) ?? [];
    if (ring.some((k) => k.fp === fp)) return;
    await putEntry(KEY_RING, [...ring, { fp, pem: s.pub.trim() + "\n" }]);
    console.log(`published public key ${fp} to ${KEY_RING} (${ring.length + 1} in ring)`);
  } catch (e) {
    console.warn("publishPublicKey failed — signatures still verify locally:", String(e));
  }
}

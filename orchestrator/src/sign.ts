// Optional Ed25519 attestation for each work.
//
// The hash chain is self-referential: rewrite log.jsonl, recompute every hash,
// and the client-side verifier is perfectly happy. A signature breaks that —
// the private key never leaves the CI secret store, so a rewritten entry cannot
// carry a valid signature. Verify against site/pubkey.pem.
//
// Absent key = no signing, and nothing breaks. The night must never die because
// an attestation was unavailable.

import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE_DIR = join(__dirname, "..", "..", "site");
const PUB_PATH = join(SITE_DIR, "pubkey.pem");

let cached: { key: KeyObject; pub: string } | null | undefined;

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

/** Public key to publish on the site: from the key if present, else the file. */
export function publicKeyPem(): string | null {
  const s = signer();
  if (s) return s.pub;
  return existsSync(PUB_PATH) ? readFileSync(PUB_PATH, "utf8") : null;
}

export function writePublicKey(): boolean {
  const s = signer();
  if (!s) return false;
  const fs = require("node:fs") as typeof import("node:fs");
  fs.mkdirSync(SITE_DIR, { recursive: true });
  const existing = existsSync(PUB_PATH) ? readFileSync(PUB_PATH, "utf8") : "";
  if (existing !== s.pub) fs.writeFileSync(PUB_PATH, s.pub, "utf8");
  return true;
}

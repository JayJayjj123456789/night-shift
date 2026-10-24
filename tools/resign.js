#!/usr/bin/env node
/**
 * Sign every work that has no signature, with the current key.
 *
 * This exists because the first run of recanonicalise.js ran without
 * NS_SIGNING_KEY in the environment — signing is optional by design, so it
 * silently wrote 14 works with no signature at all. The chain still verified; the
 * attestation quietly went from 17 works to 3.
 *
 * A signature says "the orchestrator wrote this hash". After a migration rewrote
 * those hashes, the honest thing is to sign them again with the same key, not to
 * leave them naked — so this is idempotent and only touches what is unsigned.
 *
 * Usage: NS_SIGNING_KEY=$(cat ~/Downloads/ns-signing-key.b64) node tools/resign.js
 */

const D = require("path").join(__dirname, "..", "orchestrator", "dist");
process.env.NIGHT = process.env.NIGHT || "20261024";
require(D + "/env.js");

const { getEntry, putEntry } = require(D + "/datastore.js");
const { signHash, signer, publicKeyPem } = require(D + "/sign.js");

(async () => {
  if (!signer()) {
    console.error("no signing key — set NS_SIGNING_KEY (base64 of the PKCS8 PEM)");
    process.exit(1);
  }

  const state = await getEntry("ns:state");
  if (!state) {
    console.error("ns:state is empty");
    process.exit(1);
  }

  let signed = 0;
  let already = 0;
  for (const ref of state.works) {
    const w = await getEntry("ns:work:" + ref.id);
    if (!w) continue;
    if (w.sig) {
      already++;
      continue;
    }
    const sig = signHash(w.hash);
    if (!sig) {
      console.error(`could not sign ${w.id}`);
      process.exit(1);
    }
    await putEntry("ns:work:" + w.id, { ...w, sig });
    signed++;
    console.log(`  signed ${w.id}  hash=${w.hash}`);
  }

  console.log(`\n${signed} signed, ${already} already carried one`);
  console.log(`public key: ${publicKeyPem() ? "present" : "MISSING"}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

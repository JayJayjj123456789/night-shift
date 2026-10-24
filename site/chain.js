// One hash walk, shared by every page.
//
// This is the third copy of this function. The first lived in status.ts and the
// second in resync.ts; when `parts` was added to the payload, only resync learned
// about it and status reported "chain BROKEN" on a healthy chain. The same thing
// then happened here: index.html was taught the parts rule, timeline.html was
// not, and on 2026-11-04 the 2D page told the world the chain was broken at
// n20261103-a — the first assembly — while the 3D page and status both agreed it
// was fine.
//
// So: one file, loaded by both pages. If the payload changes again, it changes
// in one place or it changes nowhere.

(function () {
  async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Canonical JSON: object keys sorted, recursively. This is the same rule as
  // orchestrator/src/hash.ts and it has to be, to the byte.
  //
  // It exists because the DataStore returns stored values with keys sorted
  // alphabetically while the hash was computed over the in-memory order the
  // model happened to send. Every work carrying `parts` — an array of objects —
  // verified against one copy and failed against the other. The chain broke on
  // 2026-10-24 the first time a night built five assemblies.
  //
  // The test `the browser and the server agree byte for byte` runs the same
  // payloads through both implementations, so a change on one side cannot be
  // shipped without the other.
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
      return out;
    }
    return value;
  }

  // The payload rule: `parts` is appended ONLY when the work has them, so the
  // entries published before the parts schema keep the exact hash they were
  // signed with. A null for the old ones would break entry 1 of the chain.
  async function verifyChain(entries) {
    let prev = "genesis";
    for (const e of entries) {
      const base = [e.night, e.title, e.form, e.site.x, e.site.z, e.journal, prev];
      if (e.parts !== undefined && e.parts !== null) base.push(e.parts);
      const expected = (await sha256Hex(JSON.stringify(canonical(base)))).slice(0, 16);
      if (expected !== e.hash) {
        return { ok: false, brokenAt: e.id, expected, got: e.hash, exp: expected };
      }
      prev = e.hash;
    }
    return { ok: true };
  }

  window.nsChain = { sha256Hex, verifyChain, canonical };
})();

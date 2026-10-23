// Run with: npm test   (builds first, then node --test)
//
// These are the invariants the project actually depends on. The 2026-10-24
// defects were all found by hand, at 01:00, by noticing a page that had not
// moved — which is not a strategy.

const test = require("node:test");
const assert = require("node:assert");
const { generateKeyPairSync } = require("node:crypto");

// the signer caches on first use, so the key has to exist before it is required
const { privateKey } = generateKeyPairSync("ed25519");
process.env.NS_SIGNING_KEY = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }),
).toString("base64");

const { computeHash } = require("../dist/hash.js");
const { verifyChain } = require("../dist/chain.js");
const { assertConstitution } = require("../dist/constitution.js");
const { LEXICON } = require("../dist/lexicon.js");
const { signHash, verifyHash, publicKeyPem } = require("../dist/sign.js");

// ---------------------------------------------------------------- fixtures

function work(over = {}) {
  return {
    id: "n20261022-a",
    night: 20261022,
    title: "void",
    intent: "no action due to uncertainty",
    form: "void",
    site: { x: 0, z: 0 },
    params: {},
    seed: 20261022,
    journal: "void no",
    prevHash: "genesis",
    hash: computeHash(20261022, "void", "void", 0, 0, "void no", "genesis"),
    builderVersion: 1,
    ...over,
  };
}

/** build a legal chain of n works, each chained to the previous */
function chain(n) {
  const out = [];
  let prev = "genesis";
  for (let i = 0; i < n; i++) {
    const night = 20261022 + i;
    const id = `n${night}-a`;
    const hash = computeHash(night, "stone", "monolith", i, i, "stone under moon", prev);
    out.push({
      id, night, title: "stone", intent: "x", form: "monolith",
      site: { x: i, z: i }, params: { height: 0.5 }, seed: night,
      journal: "stone under moon", prevHash: prev, hash, builderVersion: 1,
    });
    prev = hash;
  }
  return out;
}

function decision(over = {}) {
  return {
    title: "stone under moon",
    intent: "x",
    form: "monolith",
    site: { x: 100, z: 100 },
    params: { height: 0.5 },
    journal: "stone under moon",
    risk: "low",
    ...over,
  };
}

const emptyState = { night: 0, journalHead: "genesis", works: [], plot: { size: 512 } };

// ---------------------------------------------------------------- hashing

test("hash vectors match the works already on chain", () => {
  // real entries from site/log.jsonl — if these move, every published hash lies
  assert.strictEqual(
    computeHash(20261022, "void", "void", 0, 0, "ฉันลังเล", "genesis"),
    "53822464967a18dc",
  );
  assert.strictEqual(
    computeHash(20261022, "bright stone tower", "monolith", 100, 80,
      "build near bright stone tower", "53822464967a18dc"),
    "65de0e2b02056c99",
  );
});

test("changing any single field changes the hash", () => {
  const base = computeHash(20261022, "stone", "monolith", 10, 20, "stone under moon", "genesis");
  const variants = [
    computeHash(20261023, "stone", "monolith", 10, 20, "stone under moon", "genesis"),
    computeHash(20261022, "stones", "monolith", 10, 20, "stone under moon", "genesis"),
    computeHash(20261022, "stone", "garden", 10, 20, "stone under moon", "genesis"),
    computeHash(20261022, "stone", "monolith", 11, 20, "stone under moon", "genesis"),
    computeHash(20261022, "stone", "monolith", 10, 21, "stone under moon", "genesis"),
    computeHash(20261022, "stone", "monolith", 10, 20, "stone under moons", "genesis"),
    computeHash(20261022, "stone", "monolith", 10, 20, "stone under moon", "53822464967a18dc"),
  ];
  for (const v of variants) assert.notStrictEqual(v, base);
  assert.strictEqual(new Set([base, ...variants]).size, variants.length + 1);
});

// ---------------------------------------------------------------- chain

test("a well-formed chain verifies and its head is the last hash", () => {
  const works = chain(5);
  const r = verifyChain(works);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.breaks.length, 0);
  assert.strictEqual(r.head, works[works.length - 1].hash);
});

test("verification is order-independent — the chain is sorted before walking", () => {
  const works = chain(4);
  const shuffled = [works[2], works[0], works[3], works[1]];
  const r = verifyChain(shuffled);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.ordered.map((w) => w.id), works.map((w) => w.id));
});

test("editing a work breaks the chain at that work", () => {
  const works = chain(4);
  works[2] = { ...works[2], title: "stones" };
  const r = verifyChain(works);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.breaks[0].id, works[2].id);
  assert.strictEqual(r.breaks[0].kind, "hash");
});

test("dropping a work breaks the chain at the next one", () => {
  const works = chain(4);
  const gapped = [works[0], works[1], works[3]];
  const r = verifyChain(gapped);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.breaks[0].id, works[3].id);
  assert.strictEqual(r.breaks[0].kind, "hash");
});

test("a forged entry that recomputes its own hash still fails prevHash", () => {
  // the self-referential weakness: rewrite an entry and fix its hash
  const works = chain(3);
  const forgedHash = computeHash(
    works[1].night, "forged", "monolith", works[1].site.x, works[1].site.z,
    works[1].journal, works[0].hash,
  );
  works[1] = { ...works[1], title: "forged", hash: forgedHash };
  const r = verifyChain(works);
  // entry 1 itself is consistent, but entry 2 still points at the old hash
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.breaks[0].id, works[2].id);
});

test("randomised chains: 300 builds verify, and one mutated field never does", () => {
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const forms = ["monolith", "garden", "machine", "text", "light", "void"];

  for (let n = 0; n < 300; n++) {
    const len = 1 + Math.floor(rnd() * 8);
    let prev = "genesis";
    const works = [];
    for (let i = 0; i < len; i++) {
      const night = 20261000 + i;
      const form = forms[Math.floor(rnd() * forms.length)];
      const x = Math.floor(rnd() * 512) - 256;
      const z = Math.floor(rnd() * 512) - 256;
      const journal = "stone under moon";
      const hash = computeHash(night, "stone", form, x, z, journal, prev);
      works.push({
        id: `n${night}-a`, night, title: "stone", intent: "x", form,
        site: { x, z }, params: {}, seed: night, journal,
        prevHash: prev, hash, builderVersion: 1,
      });
      prev = hash;
    }
    assert.strictEqual(verifyChain(works).ok, true, `build ${n} should verify`);

    const victim = Math.floor(rnd() * len);
    works[victim] = { ...works[victim], journal: works[victim].journal + "s" };
    assert.strictEqual(verifyChain(works).ok, false, `mutation ${n} should not verify`);
  }
});

// ---------------------------------------------------------------- constitution

test("the 200-word allowlist rejects articles and three of the six form names", () => {
  assert.strictEqual(LEXICON.size, 200);
  for (const w of ["the", "a", "an", "of"]) {
    assert.ok(!LEXICON.has(w), `"${w}" must not be in the lexicon`);
  }
  // only these three form names are absent — machine, light and void are allowed,
  // which the first version of the prompt got wrong
  for (const w of ["garden", "monolith", "text"]) {
    assert.ok(!LEXICON.has(w), `"${w}" must not be in the lexicon`);
  }
  for (const w of ["machine", "light", "void"]) {
    assert.ok(LEXICON.has(w), `"${w}" is in the lexicon and must not be banned`);
  }
  assert.throws(
    () => assertConstitution(decision({ title: "a small stone under the moon" }), emptyState),
    /lexicon: title has \[a,the\]/,
  );
  assert.throws(
    () => assertConstitution(decision({ journal: "garden" }), emptyState),
    /journal has \[garden\]/,
  );
});

test("a legal decision passes untouched", () => {
  assert.doesNotThrow(() => assertConstitution(decision(), emptyState));
});

test("params outside PARAM_SPEC are refused", () => {
  assert.throws(
    () => assertConstitution(decision({ params: { height: 1.4 } }), emptyState),
    /out of range/,
  );
  assert.throws(
    () => assertConstitution(decision({ params: { radius: 0.5 } }), emptyState),
    /unknown param radius/,
  );
});

test("a site inside 30 studs of an existing work is refused", () => {
  const state = { ...emptyState, works: [{ id: "n1", site: { x: 100, z: 100 }, form: "light" }] };
  assert.throws(() => assertConstitution(decision(), state), /site occupied/);
  assert.doesNotThrow(() =>
    assertConstitution(decision({ site: { x: 130, z: 100 } }), state),
  );
});

test("repeating last night's form is refused", () => {
  const state = { ...emptyState, works: [{ id: "n1", site: { x: 0, z: 0 }, form: "monolith" }] };
  assert.throws(
    () => assertConstitution(decision({ site: { x: 200, z: 200 } }), state),
    /repeat form/,
  );
});

// ---------------------------------------------------------------- parts

const legalParts = [
  { shape: "block", size: [16, 42, 16], pos: [0, 21, 0], color: "bone", material: "stone" },
  { shape: "sphere", size: [3, 3, 3], pos: [11, 21, 6], color: "amber", material: "neon", emissive: 1 },
  { shape: "torus", size: [14, 0.8, 0.8], pos: [0, 26, 0], color: "sky", material: "neon", rot: [90, 0, 0] },
];

test("a work with parts still hashes the way a work without them does", () => {
  // the compatibility rule: parts are appended only when present, so the six
  // published hashes keep verifying. A null for the old ones would break entry 1.
  const withoutParts = computeHash(20261022, "void", "void", 0, 0, "ฉันลังเล", "genesis");
  assert.strictEqual(withoutParts, "53822464967a18dc");
  const withParts = computeHash(20261022, "void", "void", 0, 0, "ฉันลังเล", "genesis", legalParts);
  assert.notStrictEqual(withParts, withoutParts);
  assert.strictEqual(
    computeHash(20261022, "void", "void", 0, 0, "ฉันลังเล", "genesis", legalParts),
    withParts,
  );
});

test("editing a part list breaks the hash like editing a title does", () => {
  const base = computeHash(20261028, "stone", "monolith", 10, 20, "stone under moon", "genesis", legalParts);
  const moved = legalParts.map((p, i) => (i === 1 ? { ...p, pos: [12, 21, 6] } : p));
  const recoloured = legalParts.map((p, i) => (i === 0 ? { ...p, color: "rust" } : p));
  assert.notStrictEqual(
    computeHash(20261028, "stone", "monolith", 10, 20, "stone under moon", "genesis", moved), base,
  );
  assert.notStrictEqual(
    computeHash(20261028, "stone", "monolith", 10, 20, "stone under moon", "genesis", recoloured), base,
  );
  // and dropping the whole list changes it too — an assembly cannot be removed silently
  assert.notStrictEqual(
    computeHash(20261028, "stone", "monolith", 10, 20, "stone under moon", "genesis"), base,
  );
});

test("parts are capped, contained and volume-limited", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    shape: "block", size: [2, 2, 2], pos: [i * 3 - 12, 1, 0], color: "slate",
  }));
  assert.throws(() => assertConstitution(decision({ parts: many }), emptyState), /budget of 8/);
  assert.throws(
    () => assertConstitution(decision({ parts: [{ ...legalParts[0], pos: [70, 21, 0] }] }), emptyState),
    /outside 64 studs/,
  );
  assert.throws(
    () => assertConstitution(decision({ parts: [{ ...legalParts[0], pos: [0, 80, 0] }] }), emptyState),
    /past 90 studs tall/,
  );
  const wall = Array.from({ length: 8 }, () => ({
    shape: "block", size: [40, 40, 40], pos: [0, 20, 0], color: "slate",
  }));
  assert.throws(() => assertConstitution(decision({ parts: wall }), emptyState), /total volume/);
  assert.doesNotThrow(() => assertConstitution(decision({ parts: legalParts }), emptyState));
});

test("an assembly is not a hesitation", () => {
  assert.throws(
    () => assertConstitution(decision({ form: "void", params: {}, parts: legalParts }), emptyState),
    /void is not available/,
  );
});

test("void is not a decision the model may make", () => {
  // 2026-11-03: 7 of 15 works were voids. Six of them came from the prompt's own
  // escape hatch — "if you are not sure, return void" — which the lexicon then
  // rejected for the journal "no action". The hatch is gone; a void now only
  // exists when hesitate() writes one.
  const v = {
    title: "void", intent: "x", form: "void", site: { x: 200, z: 200 },
    params: {}, journal: "void no", risk: "low",
  };
  assert.throws(() => assertConstitution(v, emptyState), /void is not available/);
  // even a beautifully-formed void is refused
  assert.throws(
    () => assertConstitution({ ...v, journal: "stone under moon" }, emptyState),
    /void is not available/,
  );
});

test("a hesitation lands on free ground instead of the spawn point", () => {
  // every void used to be written at (0,0): four of them ended up on one pixel
  // of the site map and the 3D page drew a pile there
  const { freeSpot } = require("../dist/constitution.js");
  const works = [{ site: { x: 0, z: 0 } }, { site: { x: 24, z: 0 } }];
  const p = freeSpot(works);
  for (const w of works) {
    assert.ok(
      Math.hypot(w.site.x - p.x, w.site.z - p.z) >= 30,
      `freeSpot returned (${p.x}, ${p.z}) which is too close to (${w.site.x}, ${w.site.z})`,
    );
  }
  // deterministic: the same plot always yields the same place
  assert.deepStrictEqual(freeSpot(works), p);
});

test("params is optional, because an assembly has no numbers to give", () => {
  // 2026-11-01 lost a night to `params: Required` on a good light
  const { Decision } = require("../dist/schema.js");
  const d = Decision.parse({
    title: "stone", intent: "x", form: "light",
    site: { x: 1, z: 1 }, journal: "stone", risk: "low",
  });
  assert.deepStrictEqual(d.params, {});
});

test("the prompt offers no way out that the constitution will reject", () => {
  const { buildPrompt } = require("../dist/llm.js");
  const p = buildPrompt(emptyState, []);
  assert.ok(!/return form "void"/.test(p), "the escape hatch is still in the prompt");
  assert.ok(!/you may return void/.test(p), "void is still offered as an option");
  assert.ok(/is not a form you can return/.test(p), "rule 6 must say it plainly");
  // and it must not appear in the return schema's form enum either
  const enumLine = p.match(/"form": "([^"]+)"/);
  assert.ok(enumLine, "the schema block must declare a form enum");
  assert.ok(!enumLine[1].includes("void"), `form enum still offers void: ${enumLine[1]}`);
});

test("an assembly night is announced in the prompt, not only enforced after", () => {
  const { buildPrompt } = require("../dist/llm.js");
  const works = Array.from({ length: 12 }, (_, i) => ({
    id: `n${i}`, site: { x: i * 20 - 120, z: 0 }, form: "light", title: `work ${i}`,
  }));
  const p = buildPrompt({ ...emptyState, works }, []);
  assert.ok(/TONIGHT IS AN ASSEMBLY NIGHT/.test(p));
});

test("the prompt lists the titles already used", () => {
  const { buildPrompt } = require("../dist/llm.js");
  const works = [
    { id: "n1", site: { x: 0, z: 0 }, form: "light", title: "bright night sky" },
    { id: "n2", site: { x: 100, z: 0 }, form: "machine", title: "night bright tower" },
  ];
  const p = buildPrompt({ ...emptyState, works }, []);
  assert.ok(p.includes("bright night sky"));
  assert.ok(p.includes("night bright tower"));
});

test("every third work must be an assembly", () => {
  // asking politely failed three nights running; one in three is now forced.
  // keyed on the work count, not the date — 20261034 % 3 == 0 and October 34 is
  // not a date, which is how run #14 found out
  const plain = decision();
  const withWorks = (n) => ({
    ...emptyState,
    works: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, site: { x: 0, z: 0 }, form: "void" })),
  });
  assert.doesNotThrow(() => assertConstitution(plain, withWorks(11), false));
  assert.throws(
    () => assertConstitution(plain, withWorks(12), false),
    /every third one is an assembly — send "parts" with at least 2 parts/,
  );
  assert.doesNotThrow(
    () => assertConstitution(decision({ parts: legalParts }), withWorks(12), false),
  );
  // one part is not an assembly either
  assert.throws(
    () => assertConstitution(decision({ parts: [legalParts[0]] }), withWorks(12), false),
    /every third one is an assembly/,
  );
});

test("every page uses the shared hash walk, not its own copy", () => {
  // the third copy is what broke: index.html learned the parts rule, timeline.html
  // did not, and on 2026-11-04 the 2D page announced "chain broken at
  // n20261103-a" while status and the 3D page both said the chain was fine
  const fs = require("node:fs");
  const path = require("node:path");
  const site = path.join(__dirname, "..", "..", "site");
  for (const page of ["index.html", "timeline.html"]) {
    const html = fs.readFileSync(path.join(site, page), "utf8");
    assert.ok(html.includes('src="chain.js"'), `${page} must load chain.js`);
    assert.ok(!/async function sha256Hex/.test(html), `${page} still defines its own hash walk`);
  }
  const chain = fs.readFileSync(path.join(site, "chain.js"), "utf8");
  assert.ok(/base\.push\(e\.parts\)/.test(chain), "chain.js must append parts when present");
});

test("a malformed NIGHT is refused before it reaches a hash", () => {
  // a typo in a manual dispatch used to become night:NaN in the payload
  const { getNight } = require("../dist/datastore.js");
  const saved = process.env.NIGHT;
  for (const bad of ["2026-10-24", "abc", "2026102", "202610240"]) {
    process.env.NIGHT = bad;
    assert.throws(() => getNight(), /not YYYYMMDD/, `"${bad}" must be refused`);
  }
  process.env.NIGHT = "20261024";
  assert.strictEqual(getNight(), 20261024);
  process.env.NIGHT = saved;
});

test("the workflow's NIGHT validator rejects what would poison the chain", () => {
  // this lived as `node -e '...'` inside night.yml until shellcheck SC2016
  // failed the Lint step and skipped an entire night (run #21)
  const { validateNight } = require("../tools/validate-night.js");

  for (const good of ["20261024", "20261025", "20261130", "20240229"]) {
    const r = validateNight(good);
    assert.strictEqual(r.ok, true, `${good} should be valid`);
    assert.strictEqual(r.night, Number(good));
  }
  // new Date("2026-10-32") rolls over to 2026-11-01 instead of throwing
  for (const bad of ["20261032", "20260231", "20260229", "2026-10-24", "2026102", "202610240", "abcd1024", ""]) {
    const r = validateNight(bad);
    assert.strictEqual(r.ok, false, `"${bad}" must be refused`);
    assert.ok(/not YYYYMMDD|not a real date/.test(r.reason), `"${bad}" gave: ${r.reason}`);
  }
});

test("an impossible NIGHT degrades instead of throwing", () => {
  // October 32 is not a date; readTelemetry used to throw RangeError and the
  // whole night became a void (run #14, night 20261032)
  process.env.NIGHT = "20261032";
  const { readTelemetry } = require("../dist/llm.js");
  return readTelemetry(emptyState).then((t) => assert.deepStrictEqual(t, []));
});

// ---------------------------------------------------------------- signatures

test("signing binds the signature to the hash and nothing else", () => {
  const sig = signHash("a97e2d85061b6365");
  assert.ok(sig, "a key is configured for this test");
  const pub = publicKeyPem();
  assert.ok(pub && pub.includes("BEGIN PUBLIC KEY"));
  assert.strictEqual(verifyHash("a97e2d85061b6365", sig, pub), true);
  assert.strictEqual(verifyHash("a97e2d85061b6366", sig, pub), false);
  assert.strictEqual(verifyHash("a97e2d85061b6365", "AAAA", pub), false);
});
